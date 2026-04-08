/* eslint-disable no-undef, @typescript-eslint/prefer-optional-chain, @typescript-eslint/no-unused-vars */
(function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this;
  if (!root || !root.navigator || root.__capgoBluetoothLowEnergyShimInstalled) {
    return;
  }

  function getCapacitor() {
    return root.Capacitor;
  }

  function hasNativeBridge() {
    var cap = getCapacitor();
    return !!cap && typeof cap.nativePromise === 'function' && typeof cap.addListener === 'function';
  }

  if (!hasNativeBridge()) {
    return;
  }

  var PLUGIN_NAME = 'BluetoothLowEnergy';
  var DEFAULT_SCAN_TIMEOUT = 15000;
  var BLUETOOTH_BASE_UUID_SUFFIX = '-0000-1000-8000-00805f9b34fb';

  var initializedPromise = null;
  var listenersReady = false;
  var deviceCache = new Map();
  var characteristicCache = new Map();
  var pendingRequest = null;

  function createBluetoothError(name, message) {
    try {
      return new DOMException(message, name);
    } catch (_error) {
      var fallback = new Error(message);
      fallback.name = name;
      return fallback;
    }
  }

  function callNative(methodName, options) {
    return getCapacitor().nativePromise(PLUGIN_NAME, methodName, options || {});
  }

  async function ensureInitialized() {
    if (!initializedPromise) {
      initializedPromise = callNative('initialize', { mode: 'central' }).catch(function (error) {
        initializedPromise = null;
        throw error;
      });
    }

    return initializedPromise;
  }

  function canonicalUUID(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString(16).padStart(4, '0') + BLUETOOTH_BASE_UUID_SUFFIX;
    }

    if (typeof value !== 'string') {
      return String(value).toLowerCase();
    }

    var trimmed = value.trim().toLowerCase();

    if (/^0x[0-9a-f]+$/i.test(trimmed)) {
      return trimmed.slice(2).padStart(4, '0') + BLUETOOTH_BASE_UUID_SUFFIX;
    }

    if (/^[0-9a-f]{4}$/i.test(trimmed)) {
      return trimmed + BLUETOOTH_BASE_UUID_SUFFIX;
    }

    if (/^[0-9a-f]{8}$/i.test(trimmed)) {
      return trimmed + BLUETOOTH_BASE_UUID_SUFFIX;
    }

    if (/^[0-9a-f]{32}$/i.test(trimmed)) {
      return trimmed.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
    }

    return trimmed;
  }

  function normalizeUuid(value) {
    return canonicalUUID(value);
  }

  function toDataView(value) {
    var bytes = value instanceof Uint8Array ? new Uint8Array(value) : Uint8Array.from(value || []);
    return new DataView(bytes.buffer);
  }

  function toUint8Array(value) {
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

    if (Array.isArray(value)) {
      return Uint8Array.from(value);
    }

    throw new TypeError('Expected an ArrayBuffer, TypedArray, DataView, or number array.');
  }

  function createEventTarget() {
    return {
      _listeners: new Map(),
      addEventListener: function (type, listener) {
        if (!type || typeof listener !== 'function') {
          return;
        }

        var listeners = this._listeners.get(type) || new Set();
        listeners.add(listener);
        this._listeners.set(type, listeners);
      },
      removeEventListener: function (type, listener) {
        var listeners = this._listeners.get(type);
        if (!listeners) {
          return;
        }

        listeners.delete(listener);
        if (listeners.size === 0) {
          this._listeners.delete(type);
        }
      },
      dispatchShimEvent: function (type, detail) {
        var event = detail || {};
        event.type = type;
        event.target = this;

        var listeners = this._listeners.get(type);
        if (listeners) {
          Array.from(listeners).forEach(function (listener) {
            listener.call(this, event);
          }, this);
        }

        var handler = this['on' + type];
        if (typeof handler === 'function') {
          handler.call(this, event);
        }
      },
    };
  }

  function updateDeviceMetadata(device, data) {
    if (typeof data.name === 'string') {
      device.name = data.name;
    } else if (data.name === null && device.name == null) {
      device.name = null;
    }

    if (typeof data.rssi === 'number') {
      device.rssi = data.rssi;
    }

    if (typeof data.manufacturerData === 'string') {
      device.manufacturerData = data.manufacturerData;
    }
  }

  async function refreshServices(device) {
    if (!device.gatt.connected) {
      throw createBluetoothError('NetworkError', 'Device is not connected.');
    }

    await callNative('discoverServices', { deviceId: device.id });
    var result = await callNative('getServices', { deviceId: device.id });
    device._services = Array.isArray(result && result.services) ? result.services : [];
    return device._services;
  }

  async function ensureServices(device) {
    return Array.isArray(device._services) && device._services.length > 0 ? device._services : refreshServices(device);
  }

  async function findService(device, serviceUuid) {
    var services = await ensureServices(device);
    var normalized = normalizeUuid(serviceUuid);
    var service = services.find(function (entry) {
      return normalizeUuid(entry.uuid) === normalized;
    });

    if (!service) {
      throw createBluetoothError('NotFoundError', 'Requested Bluetooth service was not found.');
    }

    return service;
  }

  async function findCharacteristic(device, serviceUuid, characteristicUuid) {
    var service = await findService(device, serviceUuid);
    var normalized = normalizeUuid(characteristicUuid);
    var characteristic = (service.characteristics || []).find(function (entry) {
      return normalizeUuid(entry.uuid) === normalized;
    });

    if (!characteristic) {
      throw createBluetoothError('NotFoundError', 'Requested Bluetooth characteristic was not found.');
    }

    return {
      service: service,
      characteristic: characteristic,
    };
  }

  async function findDescriptor(device, serviceUuid, characteristicUuid, descriptorUuid) {
    var match = await findCharacteristic(device, serviceUuid, characteristicUuid);
    var normalized = normalizeUuid(descriptorUuid);
    var descriptor = (match.characteristic.descriptors || []).find(function (entry) {
      return normalizeUuid(entry.uuid) === normalized;
    });

    if (!descriptor) {
      throw createBluetoothError('NotFoundError', 'Requested Bluetooth descriptor was not found.');
    }

    return {
      service: match.service,
      characteristic: match.characteristic,
      descriptor: descriptor,
    };
  }

  function characteristicKey(deviceId, serviceUuid, characteristicUuid) {
    return deviceId + '::' + normalizeUuid(serviceUuid) + '::' + normalizeUuid(characteristicUuid);
  }

  function mergeRequestedServices(filters) {
    if (!Array.isArray(filters)) {
      return [];
    }

    var services = new Set();
    filters.forEach(function (filter) {
      if (!filter || !Array.isArray(filter.services)) {
        return;
      }

      filter.services.forEach(function (service) {
        services.add(String(service));
      });
    });

    return Array.from(services);
  }

  function matchesRequestOptions(device, options) {
    if (!options || options.acceptAllDevices) {
      return true;
    }

    if (!Array.isArray(options.filters) || options.filters.length === 0) {
      return false;
    }

    return options.filters.some(function (filter) {
      if (!filter) {
        return false;
      }

      if (typeof filter.name === 'string' && device.name !== filter.name) {
        return false;
      }

      if (typeof filter.namePrefix === 'string') {
        if (typeof device.name !== 'string' || !device.name.startsWith(filter.namePrefix)) {
          return false;
        }
      }

      // Service matching is delegated to the native scan filters.
      return true;
    });
  }

  function ensurePendingRequestListener() {
    if (listenersReady) {
      return;
    }

    listenersReady = true;

    getCapacitor().addListener(PLUGIN_NAME, 'deviceScanned', function (event) {
      if (!pendingRequest || !event || !event.device) {
        return;
      }

      var device = getOrCreateDevice(event.device);
      if (!matchesRequestOptions(device, pendingRequest.options)) {
        return;
      }

      var request = pendingRequest;
      pendingRequest = null;

      clearTimeout(request.timeoutId);
      void callNative('stopScan');
      request.resolve(device);
    });

    getCapacitor().addListener(PLUGIN_NAME, 'deviceDisconnected', function (event) {
      if (!event || !event.deviceId) {
        return;
      }

      var device = deviceCache.get(event.deviceId);
      if (!device) {
        return;
      }

      device.gatt.connected = false;
      device._services = null;
      device.dispatchShimEvent('gattserverdisconnected', {});
    });

    getCapacitor().addListener(PLUGIN_NAME, 'characteristicChanged', function (event) {
      if (!event || !event.deviceId || !event.service || !event.characteristic) {
        return;
      }

      var key = characteristicKey(event.deviceId, event.service, event.characteristic);
      var characteristic = characteristicCache.get(key);
      if (!characteristic) {
        return;
      }

      characteristic.value = toDataView(event.value);
      characteristic.dispatchShimEvent('characteristicvaluechanged', {});
    });
  }

  async function ensureScanPrerequisites() {
    await ensureInitialized();

    var availability = await callNative('isAvailable');
    if (!availability || availability.available !== true) {
      throw createBluetoothError('NotSupportedError', 'Bluetooth Low Energy is not available on this device.');
    }

    var enabled = await callNative('isEnabled');
    if (!enabled || enabled.enabled !== true) {
      throw createBluetoothError('NotFoundError', 'Bluetooth is disabled on this device.');
    }

    var permissions = await callNative('requestPermissions');
    if (permissions && (permissions.bluetooth === 'denied' || permissions.location === 'denied')) {
      throw createBluetoothError('NotAllowedError', 'Bluetooth permissions were denied.');
    }

    var location = await callNative('isLocationEnabled');
    if (location && location.enabled === false) {
      throw createBluetoothError('NotFoundError', 'Location services must be enabled for Bluetooth scanning.');
    }
  }

  function getOrCreateDevice(data) {
    var device = deviceCache.get(data.deviceId);
    if (!device) {
      device = new BluetoothDeviceShim(data.deviceId, data.name || null);
      deviceCache.set(data.deviceId, device);
    }

    updateDeviceMetadata(device, data);
    return device;
  }

  function BluetoothRemoteGATTDescriptorShim(device, serviceUuid, characteristicUuid, descriptorData) {
    this.device = device;
    this.uuid = descriptorData.uuid;
    this.characteristic = null;
    this._serviceUuid = serviceUuid;
    this._characteristicUuid = characteristicUuid;
    this.value = null;
  }

  BluetoothRemoteGATTDescriptorShim.prototype.readValue = async function () {
    var result = await callNative('readDescriptor', {
      deviceId: this.device.id,
      service: this._serviceUuid,
      characteristic: this._characteristicUuid,
      descriptor: this.uuid,
    });

    this.value = toDataView(result && result.value);
    return this.value;
  };

  BluetoothRemoteGATTDescriptorShim.prototype.writeValue = async function (value) {
    await callNative('writeDescriptor', {
      deviceId: this.device.id,
      service: this._serviceUuid,
      characteristic: this._characteristicUuid,
      descriptor: this.uuid,
      value: Array.from(toUint8Array(value)),
    });
  };

  function BluetoothRemoteGATTCharacteristicShim(device, serviceUuid, characteristicData) {
    Object.assign(this, createEventTarget());
    this.service = null;
    this.uuid = characteristicData.uuid;
    this.properties = Object.assign({}, characteristicData.properties || {});
    this.value = null;
    this._device = device;
    this._serviceUuid = serviceUuid;
  }

  BluetoothRemoteGATTCharacteristicShim.prototype.getDescriptors = async function () {
    var match = await findCharacteristic(this._device, this._serviceUuid, this.uuid);

    return (match.characteristic.descriptors || []).map(function (descriptorData) {
      var descriptor = new BluetoothRemoteGATTDescriptorShim(
        this._device,
        this._serviceUuid,
        this.uuid,
        descriptorData,
      );
      descriptor.characteristic = this;
      return descriptor;
    }, this);
  };

  BluetoothRemoteGATTCharacteristicShim.prototype.readValue = async function () {
    var result = await callNative('readCharacteristic', {
      deviceId: this._device.id,
      service: this._serviceUuid,
      characteristic: this.uuid,
    });

    this.value = toDataView(result && result.value);
    return this.value;
  };

  BluetoothRemoteGATTCharacteristicShim.prototype.writeValue = async function (value) {
    return this.writeValueWithResponse(value);
  };

  BluetoothRemoteGATTCharacteristicShim.prototype.writeValueWithResponse = async function (value) {
    await callNative('writeCharacteristic', {
      deviceId: this._device.id,
      service: this._serviceUuid,
      characteristic: this.uuid,
      value: Array.from(toUint8Array(value)),
      type: 'withResponse',
    });
  };

  BluetoothRemoteGATTCharacteristicShim.prototype.writeValueWithoutResponse = async function (value) {
    await callNative('writeCharacteristic', {
      deviceId: this._device.id,
      service: this._serviceUuid,
      characteristic: this.uuid,
      value: Array.from(toUint8Array(value)),
      type: 'withoutResponse',
    });
  };

  BluetoothRemoteGATTCharacteristicShim.prototype.startNotifications = async function () {
    await callNative('startCharacteristicNotifications', {
      deviceId: this._device.id,
      service: this._serviceUuid,
      characteristic: this.uuid,
    });
    return this;
  };

  BluetoothRemoteGATTCharacteristicShim.prototype.stopNotifications = async function () {
    await callNative('stopCharacteristicNotifications', {
      deviceId: this._device.id,
      service: this._serviceUuid,
      characteristic: this.uuid,
    });
    return this;
  };

  function getOrCreateCharacteristic(device, serviceUuid, characteristicData) {
    var key = characteristicKey(device.id, serviceUuid, characteristicData.uuid);
    var characteristic = characteristicCache.get(key);

    if (!characteristic) {
      characteristic = new BluetoothRemoteGATTCharacteristicShim(device, serviceUuid, characteristicData);
      characteristicCache.set(key, characteristic);
    } else {
      characteristic.properties = Object.assign({}, characteristicData.properties || {});
    }

    return characteristic;
  }

  function BluetoothRemoteGATTServiceShim(device, serviceData) {
    this.device = device;
    this.uuid = serviceData.uuid;
    this.isPrimary = true;
  }

  BluetoothRemoteGATTServiceShim.prototype.getCharacteristics = async function () {
    var service = await findService(this.device, this.uuid);
    return (service.characteristics || []).map(function (characteristicData) {
      var characteristic = getOrCreateCharacteristic(this.device, this.uuid, characteristicData);
      characteristic.service = this;
      return characteristic;
    }, this);
  };

  BluetoothRemoteGATTServiceShim.prototype.getCharacteristic = async function (characteristicUuid) {
    var match = await findCharacteristic(this.device, this.uuid, characteristicUuid);
    var characteristic = getOrCreateCharacteristic(this.device, this.uuid, match.characteristic);
    characteristic.service = this;
    return characteristic;
  };

  function BluetoothRemoteGATTServerShim(device) {
    this.device = device;
    this.connected = false;
  }

  BluetoothRemoteGATTServerShim.prototype.connect = async function () {
    await ensureInitialized();
    await callNative('connect', { deviceId: this.device.id });
    this.connected = true;
    this.device._services = null;
    return this;
  };

  BluetoothRemoteGATTServerShim.prototype.disconnect = function () {
    if (!this.connected) {
      return;
    }

    this.connected = false;
    this.device._services = null;
    void callNative('disconnect', { deviceId: this.device.id });
  };

  BluetoothRemoteGATTServerShim.prototype.getPrimaryServices = async function (serviceUuid) {
    var services = await ensureServices(this.device);
    var mapped = services.map(function (serviceData) {
      return new BluetoothRemoteGATTServiceShim(this.device, serviceData);
    }, this);

    if (typeof serviceUuid === 'undefined') {
      return mapped;
    }

    var normalized = normalizeUuid(serviceUuid);
    return mapped.filter(function (service) {
      return normalizeUuid(service.uuid) === normalized;
    });
  };

  BluetoothRemoteGATTServerShim.prototype.getPrimaryService = async function (serviceUuid) {
    var services = await this.getPrimaryServices(serviceUuid);
    if (services.length === 0) {
      throw createBluetoothError('NotFoundError', 'Requested Bluetooth service was not found.');
    }

    return services[0];
  };

  function BluetoothDeviceShim(id, name) {
    Object.assign(this, createEventTarget());
    this.id = id;
    this.name = name;
    this.gatt = new BluetoothRemoteGATTServerShim(this);
    this._services = null;
  }

  BluetoothDeviceShim.prototype.watchAdvertisements = async function () {
    throw createBluetoothError('NotSupportedError', 'watchAdvertisements is not implemented by the native shim.');
  };

  function BluetoothShim() {
    Object.assign(this, createEventTarget());
  }

  BluetoothShim.prototype.getAvailability = async function () {
    await ensureInitialized();
    var result = await callNative('isAvailable');
    return !!(result && result.available);
  };

  BluetoothShim.prototype.getDevices = async function () {
    await ensureInitialized();
    var result = await callNative('getConnectedDevices');
    var devices = Array.isArray(result && result.devices) ? result.devices : [];

    devices.forEach(function (deviceData) {
      var device = getOrCreateDevice(deviceData);
      device.gatt.connected = true;
    });

    return Array.from(deviceCache.values());
  };

  BluetoothShim.prototype.requestDevice = async function (options) {
    if (
      !options ||
      (options.acceptAllDevices !== true && (!Array.isArray(options.filters) || options.filters.length === 0))
    ) {
      throw new TypeError('requestDevice requires filters or acceptAllDevices: true.');
    }

    if (pendingRequest) {
      throw createBluetoothError('InvalidStateError', 'A Bluetooth request is already in progress.');
    }

    ensurePendingRequestListener();
    await ensureScanPrerequisites();
    await callNative('stopScan').catch(function () {
      // Ignore stale scan errors.
    });

    return new Promise(function (resolve, reject) {
      var timeoutId = setTimeout(function () {
        if (!pendingRequest) {
          return;
        }

        pendingRequest = null;
        void callNative('stopScan');
        reject(createBluetoothError('NotFoundError', 'No matching Bluetooth device was found.'));
      }, DEFAULT_SCAN_TIMEOUT);

      pendingRequest = {
        options: options,
        resolve: function (device) {
          device.gatt.connected = false;
          resolve(device);
        },
        reject: reject,
        timeoutId: timeoutId,
      };

      callNative('startScan', {
        services: mergeRequestedServices(options.filters),
        timeout: DEFAULT_SCAN_TIMEOUT,
        allowDuplicates: true,
      }).catch(function (error) {
        if (!pendingRequest) {
          return;
        }

        clearTimeout(timeoutId);
        pendingRequest = null;
        reject(error);
      });
    });
  };

  var bluetooth = new BluetoothShim();

  try {
    Object.defineProperty(root.navigator, 'bluetooth', {
      value: bluetooth,
      configurable: true,
      enumerable: true,
      writable: false,
    });
  } catch (_error) {
    root.navigator.bluetooth = bluetooth;
  }

  root.BluetoothDevice = BluetoothDeviceShim;
  root.BluetoothRemoteGATTServer = BluetoothRemoteGATTServerShim;
  root.BluetoothRemoteGATTService = BluetoothRemoteGATTServiceShim;
  root.BluetoothRemoteGATTCharacteristic = BluetoothRemoteGATTCharacteristicShim;
  root.BluetoothRemoteGATTDescriptor = BluetoothRemoteGATTDescriptorShim;
  root.BluetoothUUID = root.BluetoothUUID || {
    canonicalUUID: canonicalUUID,
    getService: canonicalUUID,
    getCharacteristic: canonicalUUID,
    getDescriptor: canonicalUUID,
  };

  root.__capgoBluetoothLowEnergyShimInstalled = true;
})();
