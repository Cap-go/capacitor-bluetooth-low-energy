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
  const characteristic = await service?.getCharacteristic(0x2a37);
  const descriptors = await characteristic?.getDescriptors(0x2902);
  const descriptor = await characteristic?.getDescriptor(0x2901);

  expect(device?.id).toBe('device-1');
  expect(device?.name).toBe('Demo Sensor');
  expect(device?.gatt.connected).toBe(true);
  expect(scanServices).toEqual([heartRateService]);
  expect(knownDevices?.map((entry) => entry.id)).toEqual(['device-1']);
  expect(service?.uuid).toBe(heartRateService);
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
