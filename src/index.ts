import { registerPlugin } from '@capacitor/core';

import type { BluetoothLowEnergyPlugin } from './definitions';

const BluetoothLowEnergy = registerPlugin<BluetoothLowEnergyPlugin>('BluetoothLowEnergy', {
  web: () => import('./web').then((m) => new m.BluetoothLowEnergyWeb()),
});

export * from './definitions';
export { BluetoothLowEnergy };
