import { expect, test } from 'bun:test';

import type { BluetoothLowEnergyPlugin } from '../src/definitions';
import { installBluetoothLowEnergyShim } from '../src/shim';

test('installs navigator.bluetooth in native Capacitor contexts', async () => {
  const root = { navigator: {} } as unknown as typeof globalThis;
  const listeners = new Map<string, (event: unknown) => void>();
  const calls: string[] = [];
  const heartRateService = '0000180d-0000-1000-8000-00805f9b34fb';
  const heartRateMeasurement = '00002a37-0000-1000-8000-00805f9b34fb';
  const clientConfiguration = '00002902-0000-1000-8000-00805f9b34fb';
  const userDescription = '00002901-0000-1000-8000-00805f9b34fb';
  let scanServices: string[] | undefined;

  const plugin = {
    addListener: async (eventName: string, listener: (event: unknown) => void) => {
      listeners.set(eventName, listener);
      return {
        remove: async () => listeners.delete(eventName),
      };
    },
    async initialize() {
      calls.push('initialize');
    },
    async isAvailable() {
      calls.push('isAvailable');
      return { available: true };
    },
    async isEnabled() {
      calls.push('isEnabled');
      return { enabled: true };
    },
    async requestPermissions() {
      calls.push('requestPermissions');
      return { bluetooth: 'granted', location: 'granted' };
    },
    async isLocationEnabled() {
      calls.push('isLocationEnabled');
      return { enabled: true };
    },
    async stopScan() {
      calls.push('stopScan');
    },
    async startScan(options?: { services?: string[] }) {
      calls.push('startScan');
      scanServices = options?.services;
      queueMicrotask(() => {
        listeners.get('deviceScanned')?.({
          device: {
            deviceId: 'device-0',
            name: 'Other Sensor',
            serviceUuids: ['0000180f-0000-1000-8000-00805f9b34fb'],
          },
        });
        listeners.get('deviceScanned')?.({
          device: {
            deviceId: 'device-1',
            name: 'Demo Sensor',
            rssi: -51,
            serviceUuids: [heartRateService],
          },
        });
      });
    },
    async getConnectedDevices() {
      calls.push('getConnectedDevices');
      return { devices: [] };
    },
    async connect() {
      calls.push('connect');
    },
    async discoverServices() {
      calls.push('discoverServices');
    },
    async getServices() {
      calls.push('getServices');
      return {
        services: [
          {
            uuid: heartRateService,
            characteristics: [
              {
                uuid: heartRateMeasurement,
                properties: {
                  authenticatedSignedWrites: false,
                  broadcast: false,
                  extendedProperties: false,
                  indicate: false,
                  notify: true,
                  read: true,
                  write: false,
                  writeWithoutResponse: false,
                },
                descriptors: [{ uuid: clientConfiguration }, { uuid: userDescription }],
              },
            ],
          },
        ],
      };
    },
  } as unknown as BluetoothLowEnergyPlugin;

  installBluetoothLowEnergyShim(plugin, {
    isNativePlatform: true,
    isPluginAvailable: true,
    root,
  });

  expect(typeof root.navigator.bluetooth?.requestDevice).toBe('function');
  expect(typeof (root as Record<string, unknown>).BluetoothDevice).toBe('function');
  expect(await root.navigator.bluetooth?.getAvailability()).toBe(true);

  const device = await root.navigator.bluetooth?.requestDevice({
    filters: [{ services: [0x180d] }],
  });
  const knownDevices = await root.navigator.bluetooth?.getDevices();
  const server = await device?.gatt.connect();
  const service = await server?.getPrimaryService(0x180d);
  const characteristics = await service?.getCharacteristics(0x2a37);
  const characteristic = characteristics?.[0];
  const descriptors = await characteristic?.getDescriptors(0x2902);
  const descriptor = await characteristic?.getDescriptor(0x2901);

  expect(device?.id).toBe('device-1');
  expect(device?.name).toBe('Demo Sensor');
  expect(device?.gatt.connected).toBe(true);
  expect(scanServices).toEqual([heartRateService]);
  expect(knownDevices?.map((entry) => entry.id)).toEqual(['device-1']);
  expect(service?.uuid).toBe(heartRateService);
  expect(characteristics?.map((entry) => entry.uuid)).toEqual([heartRateMeasurement]);
  expect(descriptors?.map((entry) => entry.uuid)).toEqual([clientConfiguration]);
  expect(descriptor?.uuid).toBe(userDescription);
  expect(calls).toEqual([
    'initialize',
    'isAvailable',
    'isAvailable',
    'isEnabled',
    'requestPermissions',
    'isLocationEnabled',
    'stopScan',
    'startScan',
    'stopScan',
    'getConnectedDevices',
    'connect',
    'discoverServices',
    'getServices',
  ]);
});

test('does not install navigator.bluetooth on web', () => {
  const root = { navigator: {} } as unknown as typeof globalThis;

  installBluetoothLowEnergyShim({} as BluetoothLowEnergyPlugin, {
    isNativePlatform: false,
    isPluginAvailable: true,
    root,
  });

  expect(root.navigator.bluetooth).toBeUndefined();
});

test('registers notification listeners for connected devices returned by getDevices', async () => {
  const root = { navigator: {} } as unknown as typeof globalThis;
  const listeners = new Map<string, (event: unknown) => void>();
  const heartRateService = '0000180d-0000-1000-8000-00805f9b34fb';
  const heartRateMeasurement = '00002a37-0000-1000-8000-00805f9b34fb';
  const notificationValues: number[][] = [];

  const plugin = {
    addListener: async (eventName: string, listener: (event: unknown) => void) => {
      listeners.set(eventName, listener);
      return {
        remove: async () => listeners.delete(eventName),
      };
    },
    async initialize() {
      return undefined;
    },
    async getConnectedDevices() {
      return {
        devices: [
          {
            deviceId: 'device-2',
            name: 'Connected Sensor',
            serviceUuids: [heartRateService],
          },
        ],
      };
    },
    async discoverServices() {
      return undefined;
    },
    async getServices() {
      return {
        services: [
          {
            uuid: heartRateService,
            characteristics: [
              {
                uuid: heartRateMeasurement,
                properties: {
                  authenticatedSignedWrites: false,
                  broadcast: false,
                  extendedProperties: false,
                  indicate: false,
                  notify: true,
                  read: true,
                  write: false,
                  writeWithoutResponse: false,
                },
                descriptors: [],
              },
            ],
          },
        ],
      };
    },
    async startCharacteristicNotifications() {
      return undefined;
    },
  } as unknown as BluetoothLowEnergyPlugin;

  installBluetoothLowEnergyShim(plugin, {
    isNativePlatform: true,
    isPluginAvailable: true,
    root,
  });

  const devices = await root.navigator.bluetooth?.getDevices();
  const service = await devices?.[0]?.gatt.getPrimaryService(heartRateService);
  const characteristic = await service?.getCharacteristic(heartRateMeasurement);

  characteristic?.addEventListener('characteristicvaluechanged', (event) => {
    notificationValues.push(Array.from(new Uint8Array(event.target.value?.buffer ?? new ArrayBuffer(0))));
  });

  await characteristic?.startNotifications();

  listeners.get('characteristicChanged')?.({
    characteristic: heartRateMeasurement,
    deviceId: 'device-2',
    service: heartRateService,
    value: [1, 2, 3],
  });

  expect(notificationValues).toEqual([[1, 2, 3]]);
});

test('requires all services in a filter and supports named service aliases', async () => {
  const root = { navigator: {} } as unknown as typeof globalThis;
  const listeners = new Map<string, (event: unknown) => void>();
  const heartRateService = '0000180d-0000-1000-8000-00805f9b34fb';
  const batteryService = '0000180f-0000-1000-8000-00805f9b34fb';
  let scanServices: string[] | undefined;

  const plugin = {
    addListener: async (eventName: string, listener: (event: unknown) => void) => {
      listeners.set(eventName, listener);
      return {
        remove: async () => listeners.delete(eventName),
      };
    },
    async initialize() {
      return undefined;
    },
    async isAvailable() {
      return { available: true };
    },
    async isEnabled() {
      return { enabled: true };
    },
    async requestPermissions() {
      return { bluetooth: 'granted', location: 'granted' };
    },
    async isLocationEnabled() {
      return { enabled: true };
    },
    async stopScan() {
      return undefined;
    },
    async startScan(options?: { services?: string[] }) {
      scanServices = options?.services;
      queueMicrotask(() => {
        listeners.get('deviceScanned')?.({
          device: {
            deviceId: 'device-3',
            name: 'Missing Battery',
            serviceUuids: [heartRateService],
          },
        });
        listeners.get('deviceScanned')?.({
          device: {
            deviceId: 'device-4',
            name: 'Complete Match',
            serviceUuids: [heartRateService, batteryService],
          },
        });
      });
    },
  } as unknown as BluetoothLowEnergyPlugin;

  installBluetoothLowEnergyShim(plugin, {
    isNativePlatform: true,
    isPluginAvailable: true,
    root,
  });

  const device = await root.navigator.bluetooth?.requestDevice({
    filters: [{ services: ['heart_rate', 0x180f] }],
  });

  expect(scanServices).toEqual([heartRateService, batteryService]);
  expect(device?.id).toBe('device-4');
});
