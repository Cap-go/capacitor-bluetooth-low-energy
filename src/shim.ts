import { Capacitor, type PluginListenerHandle } from '@capacitor/core';

import type {
  BleCharacteristic,
  BleDescriptor,
  BleDevice,
  BleService,
  BluetoothLowEnergyPlugin,
  CharacteristicChangedEvent,
  CharacteristicProperties,
  DeviceDisconnectedEvent,
  DeviceScannedEvent,
} from './definitions';

const PLUGIN_NAME = 'BluetoothLowEnergy';
const DEFAULT_SCAN_TIMEOUT = 15_000;
const BLUETOOTH_BASE_UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';
type BluetoothUuid = string | number;
type BluetoothServiceUUID = BluetoothUuid;
type BluetoothCharacteristicUUID = BluetoothUuid;
type BluetoothDescriptorUUID = BluetoothUuid;

type ShimRoot = typeof globalThis & {
  navigator?: Navigator & { bluetooth?: BluetoothShimFacade };
  __capgoBluetoothLowEnergyShimInstalled?: boolean;
  BluetoothDevice?: typeof BluetoothDeviceShim;
  BluetoothRemoteGATTServer?: typeof BluetoothRemoteGATTServerShim;
  BluetoothRemoteGATTService?: typeof BluetoothRemoteGATTServiceShim;
  BluetoothRemoteGATTCharacteristic?: typeof BluetoothRemoteGATTCharacteristicShim;
  BluetoothRemoteGATTDescriptor?: typeof BluetoothRemoteGATTDescriptorShim;
  BluetoothUUID?: {
    canonicalUUID: (value: BluetoothServiceUUID) => string;
    getService: (value: BluetoothServiceUUID) => string;
    getCharacteristic: (value: BluetoothCharacteristicUUID) => string;
    getDescriptor: (value: BluetoothDescriptorUUID) => string;
  };
};

type RequestDeviceOptions = {
  filters?: {
    services?: string[];
    name?: string;
    namePrefix?: string;
  }[];
  optionalServices?: string[];
  acceptAllDevices?: boolean;
};

type CharacteristicWriteType = 'withResponse' | 'withoutResponse';
type BufferValue = BufferSource | number[];
type ShimEvent<TTarget> = Event & { target: TTarget };
type ShimListener<TTarget> = (event: ShimEvent<TTarget>) => void;

interface InstallBluetoothLowEnergyShimOptions {
  root?: typeof globalThis;
  isNativePlatform?: boolean;
  isPluginAvailable?: boolean;
}

interface PendingRequest {
  options: RequestDeviceOptions;
  resolve: (device: BluetoothDeviceShim) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

class ShimEventEmitter<TTarget extends object> {
  private readonly listeners = new Map<string, Set<ShimListener<TTarget>>>();

  addEventListener(type: string, listener: ShimListener<TTarget>): void {
    if (!type) {
      return;
    }

    const typeListeners = this.listeners.get(type) ?? new Set<ShimListener<TTarget>>();
    typeListeners.add(listener);
    this.listeners.set(type, typeListeners);
  }

  removeEventListener(type: string, listener: ShimListener<TTarget>): void {
    const typeListeners = this.listeners.get(type);
    if (!typeListeners) {
      return;
    }

    typeListeners.delete(listener);
    if (typeListeners.size === 0) {
      this.listeners.delete(type);
    }
  }

  protected dispatchShimEvent(type: string, target: TTarget): void {
    const event = { type, target } as ShimEvent<TTarget>;
    const typeListeners = this.listeners.get(type);

    typeListeners?.forEach((listener) => {
      listener(event);
    });

    const handler = (target as Record<string, unknown>)[`on${type}`];
    if (typeof handler === 'function') {
      (handler as ShimListener<TTarget>)(event);
    }
  }
}

class NativeWebBluetoothShim {
  private initializedPromise: Promise<void> | null = null;
  private listenersPromise: Promise<void> | null = null;
  private pendingRequest: PendingRequest | null = null;
  private readonly deviceCache = new Map<string, BluetoothDeviceShim>();
  private readonly characteristicCache = new Map<string, BluetoothRemoteGATTCharacteristicShim>();
  private readonly exposedDeviceIds = new Set<string>();
  private readonly listenerHandles: PluginListenerHandle[] = [];

  constructor(
    private readonly root: ShimRoot,
    private readonly plugin: BluetoothLowEnergyPlugin,
  ) {}

  install(): void {
    if (this.root.__capgoBluetoothLowEnergyShimInstalled || !this.root.navigator || this.root.navigator.bluetooth) {
      return;
    }

    const bluetooth = new BluetoothShimFacade(this);

    Object.defineProperty(this.root.navigator, 'bluetooth', {
      configurable: true,
      enumerable: true,
      value: bluetooth,
      writable: false,
    });

    this.root.BluetoothDevice = BluetoothDeviceShim;
    this.root.BluetoothRemoteGATTServer = BluetoothRemoteGATTServerShim;
    this.root.BluetoothRemoteGATTService = BluetoothRemoteGATTServiceShim;
    this.root.BluetoothRemoteGATTCharacteristic = BluetoothRemoteGATTCharacteristicShim;
    this.root.BluetoothRemoteGATTDescriptor = BluetoothRemoteGATTDescriptorShim;
    this.root.BluetoothUUID ??= {
      canonicalUUID,
      getService: canonicalUUID,
      getCharacteristic: canonicalUUID,
      getDescriptor: canonicalUUID,
    };
    this.root.__capgoBluetoothLowEnergyShimInstalled = true;
  }

  async getAvailability(): Promise<boolean> {
    await this.ensureInitialized();
    const { available } = await this.plugin.isAvailable();
    return available === true;
  }

  async getDevices(): Promise<BluetoothDeviceShim[]> {
    await this.ensureInitialized();
    const { devices } = await this.plugin.getConnectedDevices();

    devices.forEach((deviceData) => {
      const device = this.getOrCreateDevice(deviceData);
      device.gatt.setConnected(true);
      this.exposedDeviceIds.add(device.id);
    });

    return Array.from(this.exposedDeviceIds)
      .map((deviceId) => this.deviceCache.get(deviceId))
      .filter((device): device is BluetoothDeviceShim => typeof device !== 'undefined');
  }

  async requestDevice(options: RequestDeviceOptions): Promise<BluetoothDeviceShim> {
    if (!options || (options.acceptAllDevices !== true && (!options.filters || options.filters.length === 0))) {
      throw new TypeError('requestDevice requires filters or acceptAllDevices: true.');
    }

    if (this.pendingRequest) {
      throw createBluetoothError('InvalidStateError', 'A Bluetooth request is already in progress.');
    }

    await this.ensureListeners();
    await this.ensureScanPrerequisites();
    await this.stopScanSilently();

    return new Promise<BluetoothDeviceShim>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (!this.pendingRequest) {
          return;
        }

        this.pendingRequest = null;
        void this.stopScanSilently();
        reject(createBluetoothError('NotFoundError', 'No matching Bluetooth device was found.'));
      }, DEFAULT_SCAN_TIMEOUT);

      this.pendingRequest = {
        options,
        reject,
        resolve: (device) => {
          device.gatt.setConnected(false);
          resolve(device);
        },
        timeoutId,
      };

      void this.plugin
        .startScan({
          allowDuplicates: true,
          services: mergeRequestedServices(options.filters),
          timeout: DEFAULT_SCAN_TIMEOUT,
        })
        .catch((error: unknown) => {
          if (!this.pendingRequest) {
            return;
          }

          clearTimeout(timeoutId);
          this.pendingRequest = null;
          reject(normalizeError(error));
        });
    });
  }

  async connectDevice(device: BluetoothDeviceShim): Promise<BluetoothRemoteGATTServerShim> {
    await this.ensureInitialized();
    await this.plugin.connect({ deviceId: device.id });
    device.gatt.setConnected(true);
    device.setServices(null);
    return device.gatt;
  }

  disconnectDevice(device: BluetoothDeviceShim): void {
    if (!device.gatt.connected) {
      return;
    }

    device.gatt.setConnected(false);
    device.setServices(null);
    void this.plugin.disconnect({ deviceId: device.id }).catch(() => undefined);
  }

  async getPrimaryServices(
    device: BluetoothDeviceShim,
    serviceUuid?: BluetoothServiceUUID,
  ): Promise<BluetoothRemoteGATTServiceShim[]> {
    const services = await this.ensureServices(device);
    const mapped = services.map((serviceData) => new BluetoothRemoteGATTServiceShim(this, device, serviceData));

    if (typeof serviceUuid === 'undefined') {
      return mapped;
    }

    const normalized = normalizeUuid(serviceUuid);
    return mapped.filter((service) => normalizeUuid(service.uuid) === normalized);
  }

  async getPrimaryService(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
  ): Promise<BluetoothRemoteGATTServiceShim> {
    const services = await this.getPrimaryServices(device, serviceUuid);
    const service = services[0];

    if (!service) {
      throw createBluetoothError('NotFoundError', 'Requested Bluetooth service was not found.');
    }

    return service;
  }

  async getCharacteristics(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
  ): Promise<BluetoothRemoteGATTCharacteristicShim[]> {
    const service = await this.findService(device, serviceUuid);

    return service.characteristics.map((characteristicData) => {
      const characteristic = this.getOrCreateCharacteristic(device, service.uuid, characteristicData);
      characteristic.service = new BluetoothRemoteGATTServiceShim(this, device, service);
      return characteristic;
    });
  }

  async getCharacteristic(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
  ): Promise<BluetoothRemoteGATTCharacteristicShim> {
    const { characteristic, service } = await this.findCharacteristic(device, serviceUuid, characteristicUuid);
    const shim = this.getOrCreateCharacteristic(device, service.uuid, characteristic);
    shim.service = new BluetoothRemoteGATTServiceShim(this, device, service);
    return shim;
  }

  async getDescriptors(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
    descriptorUuid?: BluetoothDescriptorUUID,
  ): Promise<BluetoothRemoteGATTDescriptorShim[]> {
    const { characteristic } = await this.findCharacteristic(device, serviceUuid, characteristicUuid);
    const normalizedDescriptorUuid = descriptorUuid ? normalizeUuid(descriptorUuid) : null;

    return characteristic.descriptors
      .filter((descriptorData) => {
        if (!normalizedDescriptorUuid) {
          return true;
        }

        return normalizeUuid(descriptorData.uuid) === normalizedDescriptorUuid;
      })
      .map((descriptorData) => {
        const descriptor = new BluetoothRemoteGATTDescriptorShim(
          this,
          device,
          normalizeUuid(serviceUuid),
          normalizeUuid(characteristicUuid),
          descriptorData,
        );
        return descriptor;
      });
  }

  async getDescriptor(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
    descriptorUuid: BluetoothDescriptorUUID,
  ): Promise<BluetoothRemoteGATTDescriptorShim> {
    const descriptor = (await this.getDescriptors(device, serviceUuid, characteristicUuid, descriptorUuid))[0];

    if (!descriptor) {
      throw createBluetoothError('NotFoundError', 'Requested Bluetooth descriptor was not found.');
    }

    return descriptor;
  }

  async readCharacteristic(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
  ): Promise<DataView> {
    const { value } = await this.plugin.readCharacteristic({
      characteristic: normalizeUuid(characteristicUuid),
      deviceId: device.id,
      service: normalizeUuid(serviceUuid),
    });

    return toDataView(value);
  }

  async writeCharacteristic(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
    value: BufferValue,
    type: CharacteristicWriteType,
  ): Promise<void> {
    await this.plugin.writeCharacteristic({
      characteristic: normalizeUuid(characteristicUuid),
      deviceId: device.id,
      service: normalizeUuid(serviceUuid),
      type,
      value: Array.from(toUint8Array(value)),
    });
  }

  async startNotifications(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
  ): Promise<void> {
    await this.plugin.startCharacteristicNotifications({
      characteristic: normalizeUuid(characteristicUuid),
      deviceId: device.id,
      service: normalizeUuid(serviceUuid),
    });
  }

  async stopNotifications(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
  ): Promise<void> {
    await this.plugin.stopCharacteristicNotifications({
      characteristic: normalizeUuid(characteristicUuid),
      deviceId: device.id,
      service: normalizeUuid(serviceUuid),
    });
  }

  async readDescriptor(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
    descriptorUuid: BluetoothDescriptorUUID,
  ): Promise<DataView> {
    const { value } = await this.plugin.readDescriptor({
      characteristic: normalizeUuid(characteristicUuid),
      descriptor: normalizeUuid(descriptorUuid),
      deviceId: device.id,
      service: normalizeUuid(serviceUuid),
    });

    return toDataView(value);
  }

  async writeDescriptor(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
    descriptorUuid: BluetoothDescriptorUUID,
    value: BufferValue,
  ): Promise<void> {
    await this.plugin.writeDescriptor({
      characteristic: normalizeUuid(characteristicUuid),
      descriptor: normalizeUuid(descriptorUuid),
      deviceId: device.id,
      service: normalizeUuid(serviceUuid),
      value: Array.from(toUint8Array(value)),
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initializedPromise) {
      this.initializedPromise = this.plugin.initialize({ mode: 'central' }).catch((error: unknown) => {
        this.initializedPromise = null;
        throw normalizeError(error);
      });
    }

    await this.initializedPromise;
  }

  private async ensureListeners(): Promise<void> {
    if (!this.listenersPromise) {
      this.listenersPromise = Promise.all([
        this.plugin.addListener('deviceScanned', (event) => this.handleDeviceScanned(event)),
        this.plugin.addListener('deviceDisconnected', (event) => this.handleDeviceDisconnected(event)),
        this.plugin.addListener('characteristicChanged', (event) => this.handleCharacteristicChanged(event)),
      ]).then((handles) => {
        this.listenerHandles.push(...handles);
      });
    }

    await this.listenersPromise;
  }

  private handleDeviceScanned(event: DeviceScannedEvent): void {
    if (!this.pendingRequest || !event.device) {
      return;
    }

    if (!matchesRequestOptions(event.device, this.pendingRequest.options)) {
      return;
    }

    const device = this.getOrCreateDevice(event.device);
    this.exposedDeviceIds.add(device.id);
    const request = this.pendingRequest;
    this.pendingRequest = null;

    clearTimeout(request.timeoutId);
    void this.stopScanSilently();
    request.resolve(device);
  }

  private handleDeviceDisconnected(event: DeviceDisconnectedEvent): void {
    const device = this.deviceCache.get(event.deviceId);
    device?.notifyDisconnected();
  }

  private handleCharacteristicChanged(event: CharacteristicChangedEvent): void {
    const key = createCharacteristicKey(event.deviceId, event.service, event.characteristic);
    const characteristic = this.characteristicCache.get(key);

    characteristic?.handleValueChange(event.value);
  }

  private async ensureScanPrerequisites(): Promise<void> {
    if (!(await this.getAvailability())) {
      throw createBluetoothError('NotSupportedError', 'Bluetooth Low Energy is not available on this device.');
    }

    const { enabled } = await this.plugin.isEnabled();
    if (!enabled) {
      throw createBluetoothError('NotFoundError', 'Bluetooth is disabled on this device.');
    }

    const permissions = await this.plugin.requestPermissions();
    if (permissions.bluetooth === 'denied' || permissions.location === 'denied') {
      throw createBluetoothError('NotAllowedError', 'Bluetooth permissions were denied.');
    }

    const location = await this.plugin.isLocationEnabled();
    if (location.enabled === false) {
      throw createBluetoothError('NotFoundError', 'Location services must be enabled for Bluetooth scanning.');
    }
  }

  private async ensureServices(device: BluetoothDeviceShim): Promise<BleService[]> {
    const cachedServices = device.getServices();
    if (cachedServices) {
      return cachedServices;
    }

    if (!device.gatt.connected) {
      throw createBluetoothError('NetworkError', 'Device is not connected.');
    }

    await this.plugin.discoverServices({ deviceId: device.id });
    const { services } = await this.plugin.getServices({ deviceId: device.id });
    device.setServices(services);
    return services;
  }

  private async findService(device: BluetoothDeviceShim, serviceUuid: BluetoothServiceUUID): Promise<BleService> {
    const services = await this.ensureServices(device);
    const normalized = normalizeUuid(serviceUuid);
    const service = services.find((entry) => normalizeUuid(entry.uuid) === normalized);

    if (!service) {
      throw createBluetoothError('NotFoundError', 'Requested Bluetooth service was not found.');
    }

    return service;
  }

  private async findCharacteristic(
    device: BluetoothDeviceShim,
    serviceUuid: BluetoothServiceUUID,
    characteristicUuid: BluetoothCharacteristicUUID,
  ): Promise<{ characteristic: BleCharacteristic; service: BleService }> {
    const service = await this.findService(device, serviceUuid);
    const normalized = normalizeUuid(characteristicUuid);
    const characteristic = service.characteristics.find((entry) => normalizeUuid(entry.uuid) === normalized);

    if (!characteristic) {
      throw createBluetoothError('NotFoundError', 'Requested Bluetooth characteristic was not found.');
    }

    return { characteristic, service };
  }

  private getOrCreateDevice(deviceData: BleDevice): BluetoothDeviceShim {
    const existingDevice = this.deviceCache.get(deviceData.deviceId);
    if (existingDevice) {
      existingDevice.updateMetadata(deviceData);
      return existingDevice;
    }

    const device = new BluetoothDeviceShim(this, deviceData);
    this.deviceCache.set(deviceData.deviceId, device);
    return device;
  }

  private getOrCreateCharacteristic(
    device: BluetoothDeviceShim,
    serviceUuid: string,
    characteristicData: BleCharacteristic,
  ): BluetoothRemoteGATTCharacteristicShim {
    const key = createCharacteristicKey(device.id, serviceUuid, characteristicData.uuid);
    const existingCharacteristic = this.characteristicCache.get(key);

    if (existingCharacteristic) {
      existingCharacteristic.update(characteristicData);
      return existingCharacteristic;
    }

    const characteristic = new BluetoothRemoteGATTCharacteristicShim(this, device, serviceUuid, characteristicData);
    this.characteristicCache.set(key, characteristic);
    return characteristic;
  }

  private async stopScanSilently(): Promise<void> {
    try {
      await this.plugin.stopScan();
    } catch {
      // Ignore stale scan errors.
    }
  }
}

class BluetoothDeviceShim extends ShimEventEmitter<BluetoothDeviceShim> {
  public readonly gatt: BluetoothRemoteGATTServerShim;
  public readonly id: string;
  public name: string | null;
  public rssi?: number;
  public manufacturerData?: string;
  public serviceUuids?: string[];
  private services: BleService[] | null = null;

  constructor(shim: NativeWebBluetoothShim, deviceData: BleDevice) {
    super();
    this.id = deviceData.deviceId;
    this.name = deviceData.name;
    this.gatt = new BluetoothRemoteGATTServerShim(shim, this);
    this.updateMetadata(deviceData);
  }

  updateMetadata(deviceData: BleDevice): void {
    this.name = deviceData.name;
    this.rssi = deviceData.rssi;
    this.manufacturerData = deviceData.manufacturerData;
    this.serviceUuids = deviceData.serviceUuids;
  }

  getServices(): BleService[] | null {
    return this.services;
  }

  setServices(services: BleService[] | null): void {
    this.services = services;
  }

  notifyDisconnected(): void {
    this.gatt.setConnected(false);
    this.services = null;
    this.dispatchShimEvent('gattserverdisconnected', this);
  }

  async watchAdvertisements(): Promise<void> {
    throw createBluetoothError('NotSupportedError', 'watchAdvertisements is not implemented by the Capacitor shim.');
  }
}

class BluetoothRemoteGATTServerShim {
  public connected = false;

  constructor(
    private readonly shim: NativeWebBluetoothShim,
    public readonly device: BluetoothDeviceShim,
  ) {}

  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  async connect(): Promise<BluetoothRemoteGATTServerShim> {
    return this.shim.connectDevice(this.device);
  }

  disconnect(): void {
    this.shim.disconnectDevice(this.device);
  }

  async getPrimaryServices(serviceUuid?: BluetoothServiceUUID): Promise<BluetoothRemoteGATTServiceShim[]> {
    return this.shim.getPrimaryServices(this.device, serviceUuid);
  }

  async getPrimaryService(serviceUuid: BluetoothServiceUUID): Promise<BluetoothRemoteGATTServiceShim> {
    return this.shim.getPrimaryService(this.device, serviceUuid);
  }
}

class BluetoothRemoteGATTServiceShim {
  public readonly isPrimary = true;

  constructor(
    private readonly shim: NativeWebBluetoothShim,
    public readonly device: BluetoothDeviceShim,
    private readonly serviceData: BleService,
  ) {}

  get uuid(): string {
    return this.serviceData.uuid;
  }

  async getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristicShim[]> {
    return this.shim.getCharacteristics(this.device, this.uuid);
  }

  async getCharacteristic(
    characteristicUuid: BluetoothCharacteristicUUID,
  ): Promise<BluetoothRemoteGATTCharacteristicShim> {
    return this.shim.getCharacteristic(this.device, this.uuid, characteristicUuid);
  }
}

class BluetoothRemoteGATTCharacteristicShim extends ShimEventEmitter<BluetoothRemoteGATTCharacteristicShim> {
  public service: BluetoothRemoteGATTServiceShim | null = null;
  public value: DataView | null = null;

  constructor(
    private readonly shim: NativeWebBluetoothShim,
    private readonly device: BluetoothDeviceShim,
    private readonly serviceUuid: string,
    private characteristicData: BleCharacteristic,
  ) {
    super();
  }

  get uuid(): string {
    return this.characteristicData.uuid;
  }

  get properties(): CharacteristicProperties {
    return this.characteristicData.properties;
  }

  update(characteristicData: BleCharacteristic): void {
    this.characteristicData = characteristicData;
  }

  async getDescriptors(descriptorUuid?: BluetoothDescriptorUUID): Promise<BluetoothRemoteGATTDescriptorShim[]> {
    const descriptors = await this.shim.getDescriptors(this.device, this.serviceUuid, this.uuid, descriptorUuid);

    descriptors.forEach((descriptor) => {
      descriptor.characteristic = this;
    });

    return descriptors;
  }

  async getDescriptor(descriptorUuid: BluetoothDescriptorUUID): Promise<BluetoothRemoteGATTDescriptorShim> {
    const descriptor = await this.shim.getDescriptor(this.device, this.serviceUuid, this.uuid, descriptorUuid);
    descriptor.characteristic = this;
    return descriptor;
  }

  async readValue(): Promise<DataView> {
    this.value = await this.shim.readCharacteristic(this.device, this.serviceUuid, this.uuid);
    return this.value;
  }

  async writeValue(value: BufferValue): Promise<void> {
    await this.writeValueWithResponse(value);
  }

  async writeValueWithResponse(value: BufferValue): Promise<void> {
    await this.shim.writeCharacteristic(this.device, this.serviceUuid, this.uuid, value, 'withResponse');
  }

  async writeValueWithoutResponse(value: BufferValue): Promise<void> {
    await this.shim.writeCharacteristic(this.device, this.serviceUuid, this.uuid, value, 'withoutResponse');
  }

  async startNotifications(): Promise<BluetoothRemoteGATTCharacteristicShim> {
    await this.shim.startNotifications(this.device, this.serviceUuid, this.uuid);
    return this;
  }

  async stopNotifications(): Promise<BluetoothRemoteGATTCharacteristicShim> {
    await this.shim.stopNotifications(this.device, this.serviceUuid, this.uuid);
    return this;
  }

  handleValueChange(value: number[]): void {
    this.value = toDataView(value);
    this.dispatchShimEvent('characteristicvaluechanged', this);
  }
}

class BluetoothRemoteGATTDescriptorShim {
  public characteristic: BluetoothRemoteGATTCharacteristicShim | null = null;
  public value: DataView | null = null;

  constructor(
    private readonly shim: NativeWebBluetoothShim,
    private readonly device: BluetoothDeviceShim,
    private readonly serviceUuid: string,
    private readonly characteristicUuid: string,
    private readonly descriptorData: BleDescriptor,
  ) {}

  get uuid(): string {
    return this.descriptorData.uuid;
  }

  async readValue(): Promise<DataView> {
    this.value = await this.shim.readDescriptor(this.device, this.serviceUuid, this.characteristicUuid, this.uuid);
    return this.value;
  }

  async writeValue(value: BufferValue): Promise<void> {
    await this.shim.writeDescriptor(this.device, this.serviceUuid, this.characteristicUuid, this.uuid, value);
  }
}

class BluetoothShimFacade extends ShimEventEmitter<BluetoothShimFacade> {
  constructor(private readonly shim: NativeWebBluetoothShim) {
    super();
  }

  async getAvailability(): Promise<boolean> {
    return this.shim.getAvailability();
  }

  async getDevices(): Promise<BluetoothDeviceShim[]> {
    return this.shim.getDevices();
  }

  async requestDevice(options: RequestDeviceOptions): Promise<BluetoothDeviceShim> {
    return this.shim.requestDevice(options);
  }
}

function mergeRequestedServices(filters?: RequestDeviceOptions['filters']): string[] {
  if (!filters || filters.some((filter) => !filter.services || filter.services.length === 0)) {
    return [];
  }

  const services = new Set<string>();
  filters.forEach((filter) => {
    filter.services?.forEach((service) => {
      services.add(normalizeUuid(service));
    });
  });

  return Array.from(services);
}

function matchesRequestOptions(device: BleDevice | BluetoothDeviceShim, options: RequestDeviceOptions): boolean {
  if (options.acceptAllDevices) {
    return true;
  }

  if (!options.filters || options.filters.length === 0) {
    return false;
  }

  const advertisedServices = new Set((device.serviceUuids ?? []).map((serviceUuid) => normalizeUuid(serviceUuid)));

  return options.filters.some((filter) => {
    if (filter.name && device.name !== filter.name) {
      return false;
    }

    if (filter.namePrefix) {
      if (!device.name?.startsWith(filter.namePrefix)) {
        return false;
      }
    }

    if (!filter.services || filter.services.length === 0) {
      return true;
    }

    return filter.services.some((service) => advertisedServices.has(normalizeUuid(service)));
  });
}

function createCharacteristicKey(deviceId: string, serviceUuid: string, characteristicUuid: string): string {
  return `${deviceId}::${normalizeUuid(serviceUuid)}::${normalizeUuid(characteristicUuid)}`;
}

function normalizeUuid(value: BluetoothServiceUUID | BluetoothCharacteristicUUID | BluetoothDescriptorUUID): string {
  return canonicalUUID(value);
}

function canonicalUUID(value: BluetoothServiceUUID | BluetoothCharacteristicUUID | BluetoothDescriptorUUID): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value.toString(16).padStart(8, '0')}${BLUETOOTH_BASE_UUID_SUFFIX}`;
  }

  const trimmed = String(value).trim().toLowerCase();

  if (/^0x[0-9a-f]+$/iu.test(trimmed)) {
    return `${trimmed.slice(2).padStart(8, '0')}${BLUETOOTH_BASE_UUID_SUFFIX}`;
  }

  if (/^[0-9a-f]{4}$/iu.test(trimmed) || /^[0-9a-f]{8}$/iu.test(trimmed)) {
    return `${trimmed.padStart(8, '0')}${BLUETOOTH_BASE_UUID_SUFFIX}`;
  }

  if (/^[0-9a-f]{32}$/iu.test(trimmed)) {
    return trimmed.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/u, '$1-$2-$3-$4-$5');
  }

  return trimmed;
}

function toDataView(value: number[] | ArrayBuffer | ArrayBufferView | undefined): DataView {
  const bytes =
    value instanceof Uint8Array
      ? value
      : value instanceof DataView
        ? new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
        : ArrayBuffer.isView(value)
          ? new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
          : value instanceof ArrayBuffer
            ? new Uint8Array(value.slice(0))
            : Uint8Array.from(value ?? []);

  return new DataView(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function toUint8Array(value: BufferValue): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }

  if (value instanceof DataView) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }

  return Uint8Array.from(value);
}

function createBluetoothError(name: string, message: string): Error {
  try {
    return new DOMException(message, name);
  } catch {
    const error = new Error(message);
    error.name = name;
    return error;
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

export function installBluetoothLowEnergyShim(
  plugin: BluetoothLowEnergyPlugin,
  options: InstallBluetoothLowEnergyShimOptions = {},
): void {
  const root = (options.root ?? globalThis) as ShimRoot;
  const isNativePlatform = options.isNativePlatform ?? Capacitor.isNativePlatform();
  const isPluginAvailable = options.isPluginAvailable ?? Capacitor.isPluginAvailable(PLUGIN_NAME);

  if (!isNativePlatform || !isPluginAvailable || !root.navigator || root.navigator.bluetooth) {
    return;
  }

  const shim = new NativeWebBluetoothShim(root, plugin);
  shim.install();
}
