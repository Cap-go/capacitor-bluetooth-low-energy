import { WebPlugin } from '@capacitor/core';

import type {
  BluetoothLowEnergyPlugin,
  InitializeOptions,
  IsAvailableResult,
  IsEnabledResult,
  IsLocationEnabledResult,
  PermissionStatus,
  StartScanOptions,
  ConnectOptions,
  DisconnectOptions,
  CreateBondOptions,
  IsBondedOptions,
  IsBondedResult,
  DiscoverServicesOptions,
  GetServicesOptions,
  GetServicesResult,
  GetConnectedDevicesResult,
  ReadCharacteristicOptions,
  ReadCharacteristicResult,
  WriteCharacteristicOptions,
  StartCharacteristicNotificationsOptions,
  StopCharacteristicNotificationsOptions,
  ReadDescriptorOptions,
  ReadDescriptorResult,
  WriteDescriptorOptions,
  ReadRssiOptions,
  ReadRssiResult,
  RequestMtuOptions,
  RequestMtuResult,
  RequestConnectionPriorityOptions,
  StartAdvertisingOptions,
  StartForegroundServiceOptions,
  GetPluginVersionResult,
  BleDevice,
  BleService,
} from './definitions';

interface BluetoothDevice {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothRemoteGATTServer {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryServices(): Promise<BluetoothRemoteGATTService[]>;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  uuid: string;
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic {
  uuid: string;
  properties: {
    broadcast: boolean;
    read: boolean;
    writeWithoutResponse: boolean;
    write: boolean;
    notify: boolean;
    indicate: boolean;
    authenticatedSignedWrites: boolean;
    reliableWrite?: boolean;
    writableAuxiliaries?: boolean;
  };
  value?: DataView;
  getDescriptors(): Promise<BluetoothRemoteGATTDescriptor[]>;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  addEventListener(
    type: string,
    listener: (event: Event & { target: BluetoothRemoteGATTCharacteristic }) => void,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: Event & { target: BluetoothRemoteGATTCharacteristic }) => void,
  ): void;
}

interface BluetoothRemoteGATTDescriptor {
  uuid: string;
  value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
}

interface Bluetooth {
  getAvailability(): Promise<boolean>;
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
  getDevices?(): Promise<BluetoothDevice[]>;
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

interface RequestDeviceOptions {
  filters?: Array<{ services?: string[]; name?: string; namePrefix?: string }>;
  optionalServices?: string[];
  acceptAllDevices?: boolean;
}

declare global {
  interface Navigator {
    bluetooth?: Bluetooth;
  }
}

export class BluetoothLowEnergyWeb extends WebPlugin implements BluetoothLowEnergyPlugin {
  private devices: Map<string, BluetoothDevice> = new Map();
  private services: Map<string, BleService[]> = new Map();
  private characteristicListeners: Map<
    string,
    (event: Event & { target: BluetoothRemoteGATTCharacteristic }) => void
  > = new Map();

  async initialize(_options?: InitializeOptions): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth API is not available');
    }
  }

  async isAvailable(): Promise<IsAvailableResult> {
    if (!navigator.bluetooth) {
      return { available: false };
    }
    try {
      const available = await navigator.bluetooth.getAvailability();
      return { available };
    } catch {
      return { available: false };
    }
  }

  async isEnabled(): Promise<IsEnabledResult> {
    const { available } = await this.isAvailable();
    return { enabled: available };
  }

  async isLocationEnabled(): Promise<IsLocationEnabledResult> {
    // Location is not relevant for Web Bluetooth
    return { enabled: true };
  }

  async openAppSettings(): Promise<void> {
    throw new Error('openAppSettings is not supported on web');
  }

  async openBluetoothSettings(): Promise<void> {
    throw new Error('openBluetoothSettings is not supported on web');
  }

  async openLocationSettings(): Promise<void> {
    throw new Error('openLocationSettings is not supported on web');
  }

  async checkPermissions(): Promise<PermissionStatus> {
    // Web Bluetooth handles permissions through requestDevice
    return {
      bluetooth: 'prompt',
      location: 'granted',
    };
  }

  async requestPermissions(): Promise<PermissionStatus> {
    // Web Bluetooth handles permissions through requestDevice
    return {
      bluetooth: 'granted',
      location: 'granted',
    };
  }

  async startScan(options?: StartScanOptions): Promise<void> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth API is not available');
    }

    const requestOptions: RequestDeviceOptions = {};

    if (options?.services && options.services.length > 0) {
      requestOptions.filters = [{ services: options.services }];
    } else {
      requestOptions.acceptAllDevices = true;
    }

    if (options?.services) {
      requestOptions.optionalServices = options.services;
    }

    try {
      const device = await navigator.bluetooth.requestDevice(requestOptions);

      const bleDevice: BleDevice = {
        deviceId: device.id,
        name: device.name ?? null,
      };

      this.devices.set(device.id, device);

      this.notifyListeners('deviceScanned', { device: bleDevice });
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        // User cancelled the device picker
        return;
      }
      throw error;
    }
  }

  async stopScan(): Promise<void> {
    // Web Bluetooth doesn't have a continuous scan - it uses a picker
    // Nothing to do here
  }

  async connect(options: ConnectOptions): Promise<void> {
    const device = this.devices.get(options.deviceId);
    if (!device) {
      throw new Error(`Device ${options.deviceId} not found`);
    }

    if (!device.gatt) {
      throw new Error(`Device ${options.deviceId} does not support GATT`);
    }

    await device.gatt.connect();

    this.notifyListeners('deviceConnected', { deviceId: options.deviceId });
  }

  async disconnect(options: DisconnectOptions): Promise<void> {
    const device = this.devices.get(options.deviceId);
    if (!device) {
      throw new Error(`Device ${options.deviceId} not found`);
    }

    if (device.gatt?.connected) {
      device.gatt.disconnect();
    }

    this.notifyListeners('deviceDisconnected', { deviceId: options.deviceId });
  }

  async createBond(_options: CreateBondOptions): Promise<void> {
    throw new Error('createBond is not supported on web');
  }

  async isBonded(_options: IsBondedOptions): Promise<IsBondedResult> {
    throw new Error('isBonded is not supported on web');
  }

  async discoverServices(options: DiscoverServicesOptions): Promise<void> {
    const device = this.devices.get(options.deviceId);
    if (!device?.gatt?.connected) {
      throw new Error(`Device ${options.deviceId} is not connected`);
    }

    const gattServices = await device.gatt.getPrimaryServices();
    const services: BleService[] = [];

    for (const gattService of gattServices) {
      const characteristics = await gattService.getCharacteristics();
      const bleCharacteristics = await Promise.all(
        characteristics.map(async (char) => {
          const descriptors = await char.getDescriptors();
          return {
            uuid: char.uuid,
            properties: {
              broadcast: char.properties.broadcast,
              read: char.properties.read,
              writeWithoutResponse: char.properties.writeWithoutResponse,
              write: char.properties.write,
              notify: char.properties.notify,
              indicate: char.properties.indicate,
              authenticatedSignedWrites: char.properties.authenticatedSignedWrites,
              extendedProperties: false,
            },
            descriptors: descriptors.map((desc) => ({ uuid: desc.uuid })),
          };
        }),
      );

      services.push({
        uuid: gattService.uuid,
        characteristics: bleCharacteristics,
      });
    }

    this.services.set(options.deviceId, services);
  }

  async getServices(options: GetServicesOptions): Promise<GetServicesResult> {
    const services = this.services.get(options.deviceId);
    if (!services) {
      return { services: [] };
    }
    return { services };
  }

  async getConnectedDevices(): Promise<GetConnectedDevicesResult> {
    const devices: BleDevice[] = [];
    for (const [deviceId, device] of this.devices) {
      if (device.gatt?.connected) {
        devices.push({
          deviceId,
          name: device.name ?? null,
        });
      }
    }
    return { devices };
  }

  async readCharacteristic(options: ReadCharacteristicOptions): Promise<ReadCharacteristicResult> {
    const device = this.devices.get(options.deviceId);
    if (!device?.gatt?.connected) {
      throw new Error(`Device ${options.deviceId} is not connected`);
    }

    const service = await device.gatt.getPrimaryService(options.service);
    const characteristic = await service.getCharacteristic(options.characteristic);
    const dataView = await characteristic.readValue();

    const value: number[] = [];
    for (let i = 0; i < dataView.byteLength; i++) {
      value.push(dataView.getUint8(i));
    }

    return { value };
  }

  async writeCharacteristic(options: WriteCharacteristicOptions): Promise<void> {
    const device = this.devices.get(options.deviceId);
    if (!device?.gatt?.connected) {
      throw new Error(`Device ${options.deviceId} is not connected`);
    }

    const service = await device.gatt.getPrimaryService(options.service);
    const characteristic = await service.getCharacteristic(options.characteristic);
    const data = new Uint8Array(options.value);

    if (options.type === 'withoutResponse') {
      await characteristic.writeValueWithoutResponse(data);
    } else {
      await characteristic.writeValueWithResponse(data);
    }
  }

  async startCharacteristicNotifications(
    options: StartCharacteristicNotificationsOptions,
  ): Promise<void> {
    const device = this.devices.get(options.deviceId);
    if (!device?.gatt?.connected) {
      throw new Error(`Device ${options.deviceId} is not connected`);
    }

    const service = await device.gatt.getPrimaryService(options.service);
    const characteristic = await service.getCharacteristic(options.characteristic);

    const key = `${options.deviceId}-${options.service}-${options.characteristic}`;

    const listener = (event: Event & { target: BluetoothRemoteGATTCharacteristic }) => {
      const dataView = event.target.value;
      if (!dataView) return;

      const value: number[] = [];
      for (let i = 0; i < dataView.byteLength; i++) {
        value.push(dataView.getUint8(i));
      }

      this.notifyListeners('characteristicChanged', {
        deviceId: options.deviceId,
        service: options.service,
        characteristic: options.characteristic,
        value,
      });
    };

    characteristic.addEventListener('characteristicvaluechanged', listener);
    this.characteristicListeners.set(key, listener);

    await characteristic.startNotifications();
  }

  async stopCharacteristicNotifications(
    options: StopCharacteristicNotificationsOptions,
  ): Promise<void> {
    const device = this.devices.get(options.deviceId);
    if (!device?.gatt?.connected) {
      throw new Error(`Device ${options.deviceId} is not connected`);
    }

    const service = await device.gatt.getPrimaryService(options.service);
    const characteristic = await service.getCharacteristic(options.characteristic);

    const key = `${options.deviceId}-${options.service}-${options.characteristic}`;
    const listener = this.characteristicListeners.get(key);
    if (listener) {
      characteristic.removeEventListener('characteristicvaluechanged', listener);
      this.characteristicListeners.delete(key);
    }

    await characteristic.stopNotifications();
  }

  async readDescriptor(options: ReadDescriptorOptions): Promise<ReadDescriptorResult> {
    const device = this.devices.get(options.deviceId);
    if (!device?.gatt?.connected) {
      throw new Error(`Device ${options.deviceId} is not connected`);
    }

    const service = await device.gatt.getPrimaryService(options.service);
    const characteristic = await service.getCharacteristic(options.characteristic);
    const descriptors = await characteristic.getDescriptors();
    const descriptor = descriptors.find((d) => d.uuid === options.descriptor);

    if (!descriptor) {
      throw new Error(`Descriptor ${options.descriptor} not found`);
    }

    const dataView = await descriptor.readValue();

    const value: number[] = [];
    for (let i = 0; i < dataView.byteLength; i++) {
      value.push(dataView.getUint8(i));
    }

    return { value };
  }

  async writeDescriptor(options: WriteDescriptorOptions): Promise<void> {
    const device = this.devices.get(options.deviceId);
    if (!device?.gatt?.connected) {
      throw new Error(`Device ${options.deviceId} is not connected`);
    }

    const service = await device.gatt.getPrimaryService(options.service);
    const characteristic = await service.getCharacteristic(options.characteristic);
    const descriptors = await characteristic.getDescriptors();
    const descriptor = descriptors.find((d) => d.uuid === options.descriptor);

    if (!descriptor) {
      throw new Error(`Descriptor ${options.descriptor} not found`);
    }

    const data = new Uint8Array(options.value);
    await descriptor.writeValue(data);
  }

  async readRssi(_options: ReadRssiOptions): Promise<ReadRssiResult> {
    throw new Error('readRssi is not supported on web');
  }

  async requestMtu(_options: RequestMtuOptions): Promise<RequestMtuResult> {
    throw new Error('requestMtu is not supported on web');
  }

  async requestConnectionPriority(_options: RequestConnectionPriorityOptions): Promise<void> {
    throw new Error('requestConnectionPriority is not supported on web');
  }

  async startAdvertising(_options: StartAdvertisingOptions): Promise<void> {
    throw new Error('startAdvertising is not supported on web');
  }

  async stopAdvertising(): Promise<void> {
    throw new Error('stopAdvertising is not supported on web');
  }

  async startForegroundService(_options: StartForegroundServiceOptions): Promise<void> {
    throw new Error('startForegroundService is not supported on web');
  }

  async stopForegroundService(): Promise<void> {
    throw new Error('stopForegroundService is not supported on web');
  }

  async getPluginVersion(): Promise<GetPluginVersionResult> {
    return { version: 'web' };
  }
}
