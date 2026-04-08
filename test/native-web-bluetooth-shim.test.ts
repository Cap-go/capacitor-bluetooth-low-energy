import { expect, test } from 'bun:test';

import type { BluetoothLowEnergyPlugin } from '../src/definitions';
import { installBluetoothLowEnergyShim } from '../src/shim';

test('installs navigator.bluetooth in native Capacitor contexts', async () => {
  const root = { navigator: {} } as unknown as typeof globalThis;
  const listeners = new Map<string, (event: unknown) => void>();
  const calls: string[] = [];

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
    async startScan() {
      calls.push('startScan');
      queueMicrotask(() => {
        listeners.get('deviceScanned')?.({
          device: {
            deviceId: 'device-1',
            name: 'Demo Sensor',
            rssi: -51,
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

  expect(typeof root.navigator.bluetooth?.requestDevice).toBe('function');
  expect(typeof (root as Record<string, unknown>).BluetoothDevice).toBe('function');
  expect(await root.navigator.bluetooth?.getAvailability()).toBe(true);

  const device = await root.navigator.bluetooth?.requestDevice({ acceptAllDevices: true });

  expect(device?.id).toBe('device-1');
  expect(device?.name).toBe('Demo Sensor');
  expect(device?.gatt.connected).toBe(false);
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
