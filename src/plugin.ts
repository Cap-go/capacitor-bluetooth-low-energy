import { registerPlugin } from '@capacitor/core';

import type { BluetoothLowEnergyPlugin } from './definitions';

export const BluetoothLowEnergy = registerPlugin<BluetoothLowEnergyPlugin>('BluetoothLowEnergy', {
  web: () => import('./web').then((module) => new module.BluetoothLowEnergyWeb()),
});
