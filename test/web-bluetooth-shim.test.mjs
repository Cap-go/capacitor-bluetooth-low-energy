import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const androidShimPath = new URL('../android/src/main/assets/web-bluetooth-shim.js', import.meta.url);
const iosShimPath = new URL('../ios/Sources/BluetoothLowEnergyPlugin/Resources/web-bluetooth-shim.js', import.meta.url);

const androidShim = readFileSync(androidShimPath, 'utf8');
const iosShim = readFileSync(iosShimPath, 'utf8');

test('native shim assets stay in sync', () => {
  expect(androidShim).toBe(iosShim);
});

test('shim installs navigator.bluetooth and routes requestDevice through the native bridge', async () => {
  const listeners = new Map();
  const nativeCalls = [];
  const context = {
    navigator: {},
    console,
    Map,
    Set,
    WeakMap,
    ArrayBuffer,
    Uint8Array,
    DataView,
    DOMException,
    Error,
    Promise,
    JSON,
    Math,
    Object,
    String,
    Number,
    Boolean,
    setTimeout,
    clearTimeout,
  };

  context.window = context;
  context.globalThis = context;
  context.Capacitor = {
    addListener(pluginName, eventName, callback) {
      listeners.set(`${pluginName}:${eventName}`, callback);
      return { remove: async () => listeners.delete(`${pluginName}:${eventName}`) };
    },
    async nativePromise(pluginName, methodName, options) {
      nativeCalls.push({ pluginName, methodName, options });

      if (methodName === 'initialize') {
        return {};
      }

      if (methodName === 'isAvailable') {
        return { available: true };
      }

      if (methodName === 'isEnabled') {
        return { enabled: true };
      }

      if (methodName === 'requestPermissions') {
        return { bluetooth: 'granted', location: 'granted' };
      }

      if (methodName === 'isLocationEnabled') {
        return { enabled: true };
      }

      if (methodName === 'stopScan') {
        return {};
      }

      if (methodName === 'startScan') {
        const callback = listeners.get('BluetoothLowEnergy:deviceScanned');
        queueMicrotask(() => {
          callback?.({
            device: {
              deviceId: 'device-1',
              name: 'Demo Sensor',
              rssi: -51,
            },
          });
        });
        return {};
      }

      throw new Error(`Unexpected native call: ${methodName}`);
    },
  };

  vm.createContext(context);
  vm.runInContext(androidShim, context);

  expect(typeof context.navigator.bluetooth?.requestDevice).toBe('function');
  expect(typeof context.BluetoothDevice).toBe('function');
  expect(await context.navigator.bluetooth.getAvailability()).toBe(true);

  const device = await context.navigator.bluetooth.requestDevice({ acceptAllDevices: true });

  expect(device.id).toBe('device-1');
  expect(device.name).toBe('Demo Sensor');
  expect(device.gatt.connected).toBe(false);
  expect(nativeCalls.map((call) => call.methodName)).toEqual([
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
