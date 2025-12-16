import './style.css';
import { BluetoothLowEnergy } from '@capgo/capacitor-bluetooth-low-energy';

let connectedDeviceId = null;
let discoveredServices = [];

document.querySelector('#app').innerHTML = `
  <div class="container">
    <h1>BLE Example</h1>

    <div class="section">
      <h2>Status</h2>
      <div class="button-group">
        <button id="checkAvailable">Check Available</button>
        <button id="checkEnabled">Check Enabled</button>
        <button id="checkPermissions">Check Permissions</button>
        <button id="requestPermissions">Request Permissions</button>
      </div>
    </div>

    <div class="section">
      <h2>Scanning</h2>
      <div class="button-group">
        <button id="startScan">Start Scan</button>
        <button id="stopScan">Stop Scan</button>
      </div>
      <div id="deviceList" class="device-list"></div>
    </div>

    <div class="section">
      <h2>Connection</h2>
      <div class="button-group">
        <button id="disconnect" disabled>Disconnect</button>
        <button id="discoverServices" disabled>Discover Services</button>
        <button id="getServices" disabled>Get Services</button>
      </div>
      <div id="connectionStatus" class="status">Not connected</div>
    </div>

    <div class="section">
      <h2>Services & Characteristics</h2>
      <div id="serviceList" class="service-list"></div>
    </div>

    <div class="section">
      <h2>Result</h2>
      <pre id="result"></pre>
    </div>
  </div>
`;

const resultEl = document.querySelector('#result');
const deviceListEl = document.querySelector('#deviceList');
const serviceListEl = document.querySelector('#serviceList');
const connectionStatusEl = document.querySelector('#connectionStatus');
const disconnectBtn = document.querySelector('#disconnect');
const discoverServicesBtn = document.querySelector('#discoverServices');
const getServicesBtn = document.querySelector('#getServices');

function showResult(data) {
  resultEl.textContent = JSON.stringify(data, null, 2);
}

function showError(error) {
  resultEl.textContent = `Error: ${error.message || error}`;
}

function updateConnectionStatus(deviceId) {
  connectedDeviceId = deviceId;
  if (deviceId) {
    connectionStatusEl.textContent = `Connected to: ${deviceId}`;
    disconnectBtn.disabled = false;
    discoverServicesBtn.disabled = false;
    getServicesBtn.disabled = false;
  } else {
    connectionStatusEl.textContent = 'Not connected';
    disconnectBtn.disabled = true;
    discoverServicesBtn.disabled = true;
    getServicesBtn.disabled = true;
    serviceListEl.innerHTML = '';
  }
}

function renderDeviceList(devices) {
  deviceListEl.innerHTML = devices
    .map(
      (device) => `
    <div class="device-item">
      <span>${device.name || 'Unknown'} (${device.deviceId})</span>
      <button onclick="connectToDevice('${device.deviceId}')">Connect</button>
    </div>
  `,
    )
    .join('');
}

function renderServices(services) {
  discoveredServices = services;
  serviceListEl.innerHTML = services
    .map(
      (service, serviceIndex) => `
    <div class="service-item">
      <h4>Service: ${service.uuid}</h4>
      <div class="characteristic-list">
        ${service.characteristics
          .map(
            (char, charIndex) => `
          <div class="characteristic-item">
            <span>${char.uuid}</span>
            <div class="char-actions">
              ${char.properties.read ? `<button onclick="readCharacteristic(${serviceIndex}, ${charIndex})">Read</button>` : ''}
              ${char.properties.write ? `<button onclick="writeCharacteristic(${serviceIndex}, ${charIndex})">Write</button>` : ''}
              ${char.properties.notify ? `<button onclick="toggleNotifications(${serviceIndex}, ${charIndex})">Notify</button>` : ''}
            </div>
          </div>
        `,
          )
          .join('')}
      </div>
    </div>
  `,
    )
    .join('');
}

// Make functions available globally
window.connectToDevice = async (deviceId) => {
  try {
    await BluetoothLowEnergy.connect({ deviceId });
    updateConnectionStatus(deviceId);
    showResult({ connected: true, deviceId });
  } catch (error) {
    showError(error);
  }
};

window.readCharacteristic = async (serviceIndex, charIndex) => {
  try {
    const service = discoveredServices[serviceIndex];
    const characteristic = service.characteristics[charIndex];
    const result = await BluetoothLowEnergy.readCharacteristic({
      deviceId: connectedDeviceId,
      service: service.uuid,
      characteristic: characteristic.uuid,
    });
    showResult({ characteristic: characteristic.uuid, value: result.value });
  } catch (error) {
    showError(error);
  }
};

window.writeCharacteristic = async (serviceIndex, charIndex) => {
  try {
    const service = discoveredServices[serviceIndex];
    const characteristic = service.characteristics[charIndex];
    const valueStr = prompt('Enter bytes to write (comma-separated, e.g., 1,2,3):');
    if (!valueStr) return;
    const value = valueStr.split(',').map((v) => parseInt(v.trim(), 10));
    await BluetoothLowEnergy.writeCharacteristic({
      deviceId: connectedDeviceId,
      service: service.uuid,
      characteristic: characteristic.uuid,
      value,
    });
    showResult({ written: true, characteristic: characteristic.uuid, value });
  } catch (error) {
    showError(error);
  }
};

window.toggleNotifications = async (serviceIndex, charIndex) => {
  try {
    const service = discoveredServices[serviceIndex];
    const characteristic = service.characteristics[charIndex];
    await BluetoothLowEnergy.startCharacteristicNotifications({
      deviceId: connectedDeviceId,
      service: service.uuid,
      characteristic: characteristic.uuid,
    });
    showResult({ notifications: 'started', characteristic: characteristic.uuid });
  } catch (error) {
    showError(error);
  }
};

const scannedDevices = [];

// Initialize and set up listeners
(async () => {
  try {
    await BluetoothLowEnergy.initialize();
    showResult({ initialized: true });

    await BluetoothLowEnergy.addListener('deviceScanned', (data) => {
      const existingIndex = scannedDevices.findIndex((d) => d.deviceId === data.device.deviceId);
      if (existingIndex >= 0) {
        scannedDevices[existingIndex] = data.device;
      } else {
        scannedDevices.push(data.device);
      }
      renderDeviceList(scannedDevices);
    });

    await BluetoothLowEnergy.addListener('deviceConnected', (data) => {
      updateConnectionStatus(data.deviceId);
      showResult({ event: 'deviceConnected', ...data });
    });

    await BluetoothLowEnergy.addListener('deviceDisconnected', (data) => {
      if (data.deviceId === connectedDeviceId) {
        updateConnectionStatus(null);
      }
      showResult({ event: 'deviceDisconnected', ...data });
    });

    await BluetoothLowEnergy.addListener('characteristicChanged', (data) => {
      showResult({ event: 'characteristicChanged', ...data });
    });
  } catch (error) {
    showError(error);
  }
})();

// Button handlers
document.querySelector('#checkAvailable').addEventListener('click', async () => {
  try {
    const result = await BluetoothLowEnergy.isAvailable();
    showResult(result);
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#checkEnabled').addEventListener('click', async () => {
  try {
    const result = await BluetoothLowEnergy.isEnabled();
    showResult(result);
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#checkPermissions').addEventListener('click', async () => {
  try {
    const result = await BluetoothLowEnergy.checkPermissions();
    showResult(result);
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#requestPermissions').addEventListener('click', async () => {
  try {
    const result = await BluetoothLowEnergy.requestPermissions();
    showResult(result);
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#startScan').addEventListener('click', async () => {
  try {
    scannedDevices.length = 0;
    deviceListEl.innerHTML = '';
    await BluetoothLowEnergy.startScan();
    showResult({ scanning: true });
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#stopScan').addEventListener('click', async () => {
  try {
    await BluetoothLowEnergy.stopScan();
    showResult({ scanning: false });
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#disconnect').addEventListener('click', async () => {
  try {
    if (connectedDeviceId) {
      await BluetoothLowEnergy.disconnect({ deviceId: connectedDeviceId });
      updateConnectionStatus(null);
      showResult({ disconnected: true });
    }
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#discoverServices').addEventListener('click', async () => {
  try {
    if (connectedDeviceId) {
      await BluetoothLowEnergy.discoverServices({ deviceId: connectedDeviceId });
      showResult({ servicesDiscovered: true });
    }
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#getServices').addEventListener('click', async () => {
  try {
    if (connectedDeviceId) {
      const result = await BluetoothLowEnergy.getServices({ deviceId: connectedDeviceId });
      renderServices(result.services);
      showResult(result);
    }
  } catch (error) {
    showError(error);
  }
});
