import { registerPlugin } from '@capacitor/core';

import type { BluetoothLowEnergyPlugin } from './definitions';
import { installBluetoothLowEnergyShim } from './shim';

const BluetoothLowEnergy = registerPlugin<BluetoothLowEnergyPlugin>('BluetoothLowEnergy', {
  web: () => import('./web').then((module) => new module.BluetoothLowEnergyWeb()),
});

BluetoothLowEnergy.shimWebBluetooth = () => {
  installBluetoothLowEnergyShim(BluetoothLowEnergy);
};

export * from './definitions';
export { BluetoothLowEnergy };
