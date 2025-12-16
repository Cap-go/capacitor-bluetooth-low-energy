# @capgo/capacitor-bluetooth-low-energy
  <a href="https://capgo.app/"><img src='https://raw.githubusercontent.com/Cap-go/capgo/main/assets/capgo_banner.png' alt='Capgo - Instant updates for capacitor'/></a>

<div align="center">
  <h2><a href="https://capgo.app/?ref=plugin_bluetooth_low_energy"> ➡️ Get Instant updates for your App with Capgo</a></h2>
  <h2><a href="https://capgo.app/consulting/?ref=plugin_bluetooth_low_energy"> Missing a feature? We'll build the plugin for you 💪</a></h2>
</div>

Bluetooth Low Energy (BLE) plugin for Capacitor with support for scanning, connecting, reading, writing, and notifications.

## Why Capacitor Bluetooth Low Energy?

A comprehensive, **free**, and **powerful** BLE plugin:

- **Full BLE support** - Scan, connect, read, write, and receive notifications
- **Peripheral mode** - Act as a BLE server and advertise services (Android/iOS)
- **Service discovery** - Automatically discover services, characteristics, and descriptors
- **Background support** - Foreground service for Android, background modes for iOS
- **Permission handling** - Built-in permission management for Android 12+ and iOS
- **Modern package management** - Supports both Swift Package Manager (SPM) and CocoaPods
- **Cross-platform** - Works on iOS, Android, and Web (Chrome Web Bluetooth API)

Perfect for IoT applications, wearables, health devices, smart home, and any BLE-connected peripherals.

## Documentation

The most complete doc is available here: https://capgo.app/docs/plugins/bluetooth-low-energy/

## Install

```bash
npm install @capgo/capacitor-bluetooth-low-energy
npx cap sync
```

## iOS

Add the following to your `Info.plist`:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>This app uses Bluetooth to communicate with BLE devices.</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>This app uses Bluetooth to communicate with BLE devices.</string>
```

For background BLE support, add the following to your `Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>bluetooth-central</string>
    <string>bluetooth-peripheral</string>
</array>
```

## Android

Works out of the box. The plugin automatically adds the required permissions to your `AndroidManifest.xml`. For Android 12+, you may need to request runtime permissions before using BLE features:

```typescript
await BluetoothLowEnergy.requestPermissions();
```

## Web

Works in Chrome and Chromium-based browsers using the Web Bluetooth API. Note that Web Bluetooth requires HTTPS and user interaction to scan for devices.

## API

<docgen-index>

* [`initialize(...)`](#initialize)
* [`isAvailable()`](#isavailable)
* [`isEnabled()`](#isenabled)
* [`isLocationEnabled()`](#islocationenabled)
* [`openAppSettings()`](#openappsettings)
* [`openBluetoothSettings()`](#openbluetoothsettings)
* [`openLocationSettings()`](#openlocationsettings)
* [`checkPermissions()`](#checkpermissions)
* [`requestPermissions()`](#requestpermissions)
* [`startScan(...)`](#startscan)
* [`stopScan()`](#stopscan)
* [`connect(...)`](#connect)
* [`disconnect(...)`](#disconnect)
* [`createBond(...)`](#createbond)
* [`isBonded(...)`](#isbonded)
* [`discoverServices(...)`](#discoverservices)
* [`getServices(...)`](#getservices)
* [`getConnectedDevices()`](#getconnecteddevices)
* [`readCharacteristic(...)`](#readcharacteristic)
* [`writeCharacteristic(...)`](#writecharacteristic)
* [`startCharacteristicNotifications(...)`](#startcharacteristicnotifications)
* [`stopCharacteristicNotifications(...)`](#stopcharacteristicnotifications)
* [`readDescriptor(...)`](#readdescriptor)
* [`writeDescriptor(...)`](#writedescriptor)
* [`readRssi(...)`](#readrssi)
* [`requestMtu(...)`](#requestmtu)
* [`requestConnectionPriority(...)`](#requestconnectionpriority)
* [`startAdvertising(...)`](#startadvertising)
* [`stopAdvertising()`](#stopadvertising)
* [`startForegroundService(...)`](#startforegroundservice)
* [`stopForegroundService()`](#stopforegroundservice)
* [`getPluginVersion()`](#getpluginversion)
* [`addListener('deviceScanned', ...)`](#addlistenerdevicescanned-)
* [`addListener('deviceConnected', ...)`](#addlistenerdeviceconnected-)
* [`addListener('deviceDisconnected', ...)`](#addlistenerdevicedisconnected-)
* [`addListener('characteristicChanged', ...)`](#addlistenercharacteristicchanged-)
* [`removeAllListeners()`](#removealllisteners)
* [Interfaces](#interfaces)
* [Type Aliases](#type-aliases)

</docgen-index>

<docgen-api>
<!--Update the source file JSDoc comments and rerun docgen to update the docs below-->

Capacitor Bluetooth Low Energy Plugin for BLE communication.

### initialize(...)

```typescript
initialize(options?: InitializeOptions | undefined) => Promise<void>
```

Initialize the BLE plugin.
Must be called before any other method.

| Param         | Type                                                            | Description              |
| ------------- | --------------------------------------------------------------- | ------------------------ |
| **`options`** | <code><a href="#initializeoptions">InitializeOptions</a></code> | - Initialization options |

**Since:** 1.0.0

--------------------


### isAvailable()

```typescript
isAvailable() => Promise<IsAvailableResult>
```

Check if Bluetooth is available on the device.

**Returns:** <code>Promise&lt;<a href="#isavailableresult">IsAvailableResult</a>&gt;</code>

**Since:** 1.0.0

--------------------


### isEnabled()

```typescript
isEnabled() => Promise<IsEnabledResult>
```

Check if Bluetooth is enabled on the device.

**Returns:** <code>Promise&lt;<a href="#isenabledresult">IsEnabledResult</a>&gt;</code>

**Since:** 1.0.0

--------------------


### isLocationEnabled()

```typescript
isLocationEnabled() => Promise<IsLocationEnabledResult>
```

Check if location services are enabled (Android only).

**Returns:** <code>Promise&lt;<a href="#islocationenabledresult">IsLocationEnabledResult</a>&gt;</code>

**Since:** 1.0.0

--------------------


### openAppSettings()

```typescript
openAppSettings() => Promise<void>
```

Open the app settings page.

**Since:** 1.0.0

--------------------


### openBluetoothSettings()

```typescript
openBluetoothSettings() => Promise<void>
```

Open the Bluetooth settings page (Android only).

**Since:** 1.0.0

--------------------


### openLocationSettings()

```typescript
openLocationSettings() => Promise<void>
```

Open the location settings page (Android only).

**Since:** 1.0.0

--------------------


### checkPermissions()

```typescript
checkPermissions() => Promise<PermissionStatus>
```

Check the current permission status.

**Returns:** <code>Promise&lt;<a href="#permissionstatus">PermissionStatus</a>&gt;</code>

**Since:** 1.0.0

--------------------


### requestPermissions()

```typescript
requestPermissions() => Promise<PermissionStatus>
```

Request Bluetooth permissions.

**Returns:** <code>Promise&lt;<a href="#permissionstatus">PermissionStatus</a>&gt;</code>

**Since:** 1.0.0

--------------------


### startScan(...)

```typescript
startScan(options?: StartScanOptions | undefined) => Promise<void>
```

Start scanning for BLE devices.

| Param         | Type                                                          | Description    |
| ------------- | ------------------------------------------------------------- | -------------- |
| **`options`** | <code><a href="#startscanoptions">StartScanOptions</a></code> | - Scan options |

**Since:** 1.0.0

--------------------


### stopScan()

```typescript
stopScan() => Promise<void>
```

Stop scanning for BLE devices.

**Since:** 1.0.0

--------------------


### connect(...)

```typescript
connect(options: ConnectOptions) => Promise<void>
```

Connect to a BLE device.

| Param         | Type                                                      | Description          |
| ------------- | --------------------------------------------------------- | -------------------- |
| **`options`** | <code><a href="#connectoptions">ConnectOptions</a></code> | - Connection options |

**Since:** 1.0.0

--------------------


### disconnect(...)

```typescript
disconnect(options: DisconnectOptions) => Promise<void>
```

Disconnect from a BLE device.

| Param         | Type                                                            | Description          |
| ------------- | --------------------------------------------------------------- | -------------------- |
| **`options`** | <code><a href="#disconnectoptions">DisconnectOptions</a></code> | - Disconnect options |

**Since:** 1.0.0

--------------------


### createBond(...)

```typescript
createBond(options: CreateBondOptions) => Promise<void>
```

Create a bond with a BLE device (Android only).

| Param         | Type                                                            | Description    |
| ------------- | --------------------------------------------------------------- | -------------- |
| **`options`** | <code><a href="#createbondoptions">CreateBondOptions</a></code> | - Bond options |

**Since:** 1.0.0

--------------------


### isBonded(...)

```typescript
isBonded(options: IsBondedOptions) => Promise<IsBondedResult>
```

Check if a device is bonded (Android only).

| Param         | Type                                                        | Description          |
| ------------- | ----------------------------------------------------------- | -------------------- |
| **`options`** | <code><a href="#isbondedoptions">IsBondedOptions</a></code> | - Bond check options |

**Returns:** <code>Promise&lt;<a href="#isbondedresult">IsBondedResult</a>&gt;</code>

**Since:** 1.0.0

--------------------


### discoverServices(...)

```typescript
discoverServices(options: DiscoverServicesOptions) => Promise<void>
```

Discover services on a connected device.

| Param         | Type                                                                        | Description        |
| ------------- | --------------------------------------------------------------------------- | ------------------ |
| **`options`** | <code><a href="#discoverservicesoptions">DiscoverServicesOptions</a></code> | - Discover options |

**Since:** 1.0.0

--------------------


### getServices(...)

```typescript
getServices(options: GetServicesOptions) => Promise<GetServicesResult>
```

Get discovered services for a device.

| Param         | Type                                                              | Description            |
| ------------- | ----------------------------------------------------------------- | ---------------------- |
| **`options`** | <code><a href="#getservicesoptions">GetServicesOptions</a></code> | - Get services options |

**Returns:** <code>Promise&lt;<a href="#getservicesresult">GetServicesResult</a>&gt;</code>

**Since:** 1.0.0

--------------------


### getConnectedDevices()

```typescript
getConnectedDevices() => Promise<GetConnectedDevicesResult>
```

Get a list of connected devices.

**Returns:** <code>Promise&lt;<a href="#getconnecteddevicesresult">GetConnectedDevicesResult</a>&gt;</code>

**Since:** 1.0.0

--------------------


### readCharacteristic(...)

```typescript
readCharacteristic(options: ReadCharacteristicOptions) => Promise<ReadCharacteristicResult>
```

Read a characteristic value.

| Param         | Type                                                                            | Description    |
| ------------- | ------------------------------------------------------------------------------- | -------------- |
| **`options`** | <code><a href="#readcharacteristicoptions">ReadCharacteristicOptions</a></code> | - Read options |

**Returns:** <code>Promise&lt;<a href="#readcharacteristicresult">ReadCharacteristicResult</a>&gt;</code>

**Since:** 1.0.0

--------------------


### writeCharacteristic(...)

```typescript
writeCharacteristic(options: WriteCharacteristicOptions) => Promise<void>
```

Write a value to a characteristic.

| Param         | Type                                                                              | Description     |
| ------------- | --------------------------------------------------------------------------------- | --------------- |
| **`options`** | <code><a href="#writecharacteristicoptions">WriteCharacteristicOptions</a></code> | - Write options |

**Since:** 1.0.0

--------------------


### startCharacteristicNotifications(...)

```typescript
startCharacteristicNotifications(options: StartCharacteristicNotificationsOptions) => Promise<void>
```

Start notifications for a characteristic.

| Param         | Type                                                                                                        | Description            |
| ------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------- |
| **`options`** | <code><a href="#startcharacteristicnotificationsoptions">StartCharacteristicNotificationsOptions</a></code> | - Notification options |

**Since:** 1.0.0

--------------------


### stopCharacteristicNotifications(...)

```typescript
stopCharacteristicNotifications(options: StopCharacteristicNotificationsOptions) => Promise<void>
```

Stop notifications for a characteristic.

| Param         | Type                                                                                                      | Description                 |
| ------------- | --------------------------------------------------------------------------------------------------------- | --------------------------- |
| **`options`** | <code><a href="#stopcharacteristicnotificationsoptions">StopCharacteristicNotificationsOptions</a></code> | - Stop notification options |

**Since:** 1.0.0

--------------------


### readDescriptor(...)

```typescript
readDescriptor(options: ReadDescriptorOptions) => Promise<ReadDescriptorResult>
```

Read a descriptor value.

| Param         | Type                                                                    | Description               |
| ------------- | ----------------------------------------------------------------------- | ------------------------- |
| **`options`** | <code><a href="#readdescriptoroptions">ReadDescriptorOptions</a></code> | - Read descriptor options |

**Returns:** <code>Promise&lt;<a href="#readdescriptorresult">ReadDescriptorResult</a>&gt;</code>

**Since:** 1.0.0

--------------------


### writeDescriptor(...)

```typescript
writeDescriptor(options: WriteDescriptorOptions) => Promise<void>
```

Write a value to a descriptor.

| Param         | Type                                                                      | Description                |
| ------------- | ------------------------------------------------------------------------- | -------------------------- |
| **`options`** | <code><a href="#writedescriptoroptions">WriteDescriptorOptions</a></code> | - Write descriptor options |

**Since:** 1.0.0

--------------------


### readRssi(...)

```typescript
readRssi(options: ReadRssiOptions) => Promise<ReadRssiResult>
```

Read the RSSI (signal strength) of a connected device.

| Param         | Type                                                        | Description         |
| ------------- | ----------------------------------------------------------- | ------------------- |
| **`options`** | <code><a href="#readrssioptions">ReadRssiOptions</a></code> | - Read RSSI options |

**Returns:** <code>Promise&lt;<a href="#readrssiresult">ReadRssiResult</a>&gt;</code>

**Since:** 1.0.0

--------------------


### requestMtu(...)

```typescript
requestMtu(options: RequestMtuOptions) => Promise<RequestMtuResult>
```

Request MTU size change (Android only).

| Param         | Type                                                            | Description           |
| ------------- | --------------------------------------------------------------- | --------------------- |
| **`options`** | <code><a href="#requestmtuoptions">RequestMtuOptions</a></code> | - Request MTU options |

**Returns:** <code>Promise&lt;<a href="#requestmturesult">RequestMtuResult</a>&gt;</code>

**Since:** 1.0.0

--------------------


### requestConnectionPriority(...)

```typescript
requestConnectionPriority(options: RequestConnectionPriorityOptions) => Promise<void>
```

Request connection priority (Android only).

| Param         | Type                                                                                          | Description                |
| ------------- | --------------------------------------------------------------------------------------------- | -------------------------- |
| **`options`** | <code><a href="#requestconnectionpriorityoptions">RequestConnectionPriorityOptions</a></code> | - Request priority options |

**Since:** 1.0.0

--------------------


### startAdvertising(...)

```typescript
startAdvertising(options: StartAdvertisingOptions) => Promise<void>
```

Start advertising as a peripheral (BLE server).

| Param         | Type                                                                        | Description           |
| ------------- | --------------------------------------------------------------------------- | --------------------- |
| **`options`** | <code><a href="#startadvertisingoptions">StartAdvertisingOptions</a></code> | - Advertising options |

**Since:** 1.0.0

--------------------


### stopAdvertising()

```typescript
stopAdvertising() => Promise<void>
```

Stop advertising.

**Since:** 1.0.0

--------------------


### startForegroundService(...)

```typescript
startForegroundService(options: StartForegroundServiceOptions) => Promise<void>
```

Start a foreground service to maintain BLE connections in background (Android only).

| Param         | Type                                                                                    | Description                  |
| ------------- | --------------------------------------------------------------------------------------- | ---------------------------- |
| **`options`** | <code><a href="#startforegroundserviceoptions">StartForegroundServiceOptions</a></code> | - Foreground service options |

**Since:** 1.0.0

--------------------


### stopForegroundService()

```typescript
stopForegroundService() => Promise<void>
```

Stop the foreground service (Android only).

**Since:** 1.0.0

--------------------


### getPluginVersion()

```typescript
getPluginVersion() => Promise<GetPluginVersionResult>
```

Get the native Capacitor plugin version.

**Returns:** <code>Promise&lt;<a href="#getpluginversionresult">GetPluginVersionResult</a>&gt;</code>

**Since:** 1.0.0

--------------------


### addListener('deviceScanned', ...)

```typescript
addListener(eventName: 'deviceScanned', listenerFunc: (event: DeviceScannedEvent) => void) => Promise<PluginListenerHandle>
```

Add a listener for device scanned events.

| Param              | Type                                                                                  | Description             |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------- |
| **`eventName`**    | <code>'deviceScanned'</code>                                                          | - The event name        |
| **`listenerFunc`** | <code>(event: <a href="#devicescannedevent">DeviceScannedEvent</a>) =&gt; void</code> | - The listener function |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

**Since:** 1.0.0

--------------------


### addListener('deviceConnected', ...)

```typescript
addListener(eventName: 'deviceConnected', listenerFunc: (event: DeviceConnectedEvent) => void) => Promise<PluginListenerHandle>
```

Add a listener for device connected events.

| Param              | Type                                                                                      | Description             |
| ------------------ | ----------------------------------------------------------------------------------------- | ----------------------- |
| **`eventName`**    | <code>'deviceConnected'</code>                                                            | - The event name        |
| **`listenerFunc`** | <code>(event: <a href="#deviceconnectedevent">DeviceConnectedEvent</a>) =&gt; void</code> | - The listener function |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

**Since:** 1.0.0

--------------------


### addListener('deviceDisconnected', ...)

```typescript
addListener(eventName: 'deviceDisconnected', listenerFunc: (event: DeviceDisconnectedEvent) => void) => Promise<PluginListenerHandle>
```

Add a listener for device disconnected events.

| Param              | Type                                                                                            | Description             |
| ------------------ | ----------------------------------------------------------------------------------------------- | ----------------------- |
| **`eventName`**    | <code>'deviceDisconnected'</code>                                                               | - The event name        |
| **`listenerFunc`** | <code>(event: <a href="#devicedisconnectedevent">DeviceDisconnectedEvent</a>) =&gt; void</code> | - The listener function |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

**Since:** 1.0.0

--------------------


### addListener('characteristicChanged', ...)

```typescript
addListener(eventName: 'characteristicChanged', listenerFunc: (event: CharacteristicChangedEvent) => void) => Promise<PluginListenerHandle>
```

Add a listener for characteristic changed events.

| Param              | Type                                                                                                  | Description             |
| ------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------- |
| **`eventName`**    | <code>'characteristicChanged'</code>                                                                  | - The event name        |
| **`listenerFunc`** | <code>(event: <a href="#characteristicchangedevent">CharacteristicChangedEvent</a>) =&gt; void</code> | - The listener function |

**Returns:** <code>Promise&lt;<a href="#pluginlistenerhandle">PluginListenerHandle</a>&gt;</code>

**Since:** 1.0.0

--------------------


### removeAllListeners()

```typescript
removeAllListeners() => Promise<void>
```

Remove all listeners for this plugin.

**Since:** 1.0.0

--------------------


### Interfaces


#### InitializeOptions

Initialization options for the plugin.

| Prop       | Type                                   | Description                                                                                                                       | Default                | Since |
| ---------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ----- |
| **`mode`** | <code>'central' \| 'peripheral'</code> | The mode to initialize the plugin in. - 'central': Act as a BLE central (client) - 'peripheral': Act as a BLE peripheral (server) | <code>'central'</code> | 1.0.0 |


#### IsAvailableResult

Result of the isAvailable method.

| Prop            | Type                 | Description                                   | Since |
| --------------- | -------------------- | --------------------------------------------- | ----- |
| **`available`** | <code>boolean</code> | Whether Bluetooth is available on the device. | 1.0.0 |


#### IsEnabledResult

Result of the isEnabled method.

| Prop          | Type                 | Description                                 | Since |
| ------------- | -------------------- | ------------------------------------------- | ----- |
| **`enabled`** | <code>boolean</code> | Whether Bluetooth is enabled on the device. | 1.0.0 |


#### IsLocationEnabledResult

Result of the isLocationEnabled method.

| Prop          | Type                 | Description                                          | Since |
| ------------- | -------------------- | ---------------------------------------------------- | ----- |
| **`enabled`** | <code>boolean</code> | Whether location services are enabled on the device. | 1.0.0 |


#### PermissionStatus

Permission status for Bluetooth and location.

| Prop            | Type                                                        | Description                                | Since |
| --------------- | ----------------------------------------------------------- | ------------------------------------------ | ----- |
| **`bluetooth`** | <code><a href="#permissionstate">PermissionState</a></code> | Bluetooth permission status.               | 1.0.0 |
| **`location`**  | <code><a href="#permissionstate">PermissionState</a></code> | Location permission status (Android only). | 1.0.0 |


#### StartScanOptions

Options for starting a scan.

| Prop                  | Type                  | Description                                                                                   | Default            | Since |
| --------------------- | --------------------- | --------------------------------------------------------------------------------------------- | ------------------ | ----- |
| **`services`**        | <code>string[]</code> | List of service UUIDs to filter by. Only devices advertising these services will be returned. |                    | 1.0.0 |
| **`timeout`**         | <code>number</code>   | Scan timeout in milliseconds. Set to 0 for no timeout.                                        | <code>0</code>     | 1.0.0 |
| **`allowDuplicates`** | <code>boolean</code>  | Whether to allow duplicate scan results.                                                      | <code>false</code> | 1.0.0 |


#### ConnectOptions

Options for connecting to a device.

| Prop              | Type                 | Description                                                         | Default            | Since |
| ----------------- | -------------------- | ------------------------------------------------------------------- | ------------------ | ----- |
| **`deviceId`**    | <code>string</code>  | The device ID (MAC address on Android, UUID on iOS).                |                    | 1.0.0 |
| **`autoConnect`** | <code>boolean</code> | Whether to automatically connect when the device becomes available. | <code>false</code> | 1.0.0 |


#### DisconnectOptions

Options for disconnecting from a device.

| Prop           | Type                | Description                       | Since |
| -------------- | ------------------- | --------------------------------- | ----- |
| **`deviceId`** | <code>string</code> | The device ID to disconnect from. | 1.0.0 |


#### CreateBondOptions

Options for creating a bond.

| Prop           | Type                | Description                 | Since |
| -------------- | ------------------- | --------------------------- | ----- |
| **`deviceId`** | <code>string</code> | The device ID to bond with. | 1.0.0 |


#### IsBondedResult

Result of the isBonded method.

| Prop         | Type                 | Description                   | Since |
| ------------ | -------------------- | ----------------------------- | ----- |
| **`bonded`** | <code>boolean</code> | Whether the device is bonded. | 1.0.0 |


#### IsBondedOptions

Options for checking bond status.

| Prop           | Type                | Description             | Since |
| -------------- | ------------------- | ----------------------- | ----- |
| **`deviceId`** | <code>string</code> | The device ID to check. | 1.0.0 |


#### DiscoverServicesOptions

Options for discovering services.

| Prop           | Type                | Description                            | Since |
| -------------- | ------------------- | -------------------------------------- | ----- |
| **`deviceId`** | <code>string</code> | The device ID to discover services on. | 1.0.0 |


#### GetServicesResult

Result of the getServices method.

| Prop           | Type                      | Description                  | Since |
| -------------- | ------------------------- | ---------------------------- | ----- |
| **`services`** | <code>BleService[]</code> | List of discovered services. | 1.0.0 |


#### BleService

A BLE service.

| Prop                  | Type                             | Description                              | Since |
| --------------------- | -------------------------------- | ---------------------------------------- | ----- |
| **`uuid`**            | <code>string</code>              | The service UUID.                        | 1.0.0 |
| **`characteristics`** | <code>BleCharacteristic[]</code> | List of characteristics in this service. | 1.0.0 |


#### BleCharacteristic

A BLE characteristic.

| Prop              | Type                                                                          | Description                                 | Since |
| ----------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | ----- |
| **`uuid`**        | <code>string</code>                                                           | The characteristic UUID.                    | 1.0.0 |
| **`properties`**  | <code><a href="#characteristicproperties">CharacteristicProperties</a></code> | Properties of this characteristic.          | 1.0.0 |
| **`descriptors`** | <code>BleDescriptor[]</code>                                                  | List of descriptors in this characteristic. | 1.0.0 |


#### CharacteristicProperties

Properties of a BLE characteristic.

| Prop                            | Type                 | Description                                                      | Since |
| ------------------------------- | -------------------- | ---------------------------------------------------------------- | ----- |
| **`broadcast`**                 | <code>boolean</code> | Whether the characteristic supports broadcast.                   | 1.0.0 |
| **`read`**                      | <code>boolean</code> | Whether the characteristic supports read.                        | 1.0.0 |
| **`writeWithoutResponse`**      | <code>boolean</code> | Whether the characteristic supports write without response.      | 1.0.0 |
| **`write`**                     | <code>boolean</code> | Whether the characteristic supports write.                       | 1.0.0 |
| **`notify`**                    | <code>boolean</code> | Whether the characteristic supports notify.                      | 1.0.0 |
| **`indicate`**                  | <code>boolean</code> | Whether the characteristic supports indicate.                    | 1.0.0 |
| **`authenticatedSignedWrites`** | <code>boolean</code> | Whether the characteristic supports authenticated signed writes. | 1.0.0 |
| **`extendedProperties`**        | <code>boolean</code> | Whether the characteristic has extended properties.              | 1.0.0 |


#### BleDescriptor

A BLE descriptor.

| Prop       | Type                | Description          | Since |
| ---------- | ------------------- | -------------------- | ----- |
| **`uuid`** | <code>string</code> | The descriptor UUID. | 1.0.0 |


#### GetServicesOptions

Options for getting services.

| Prop           | Type                | Description                        | Since |
| -------------- | ------------------- | ---------------------------------- | ----- |
| **`deviceId`** | <code>string</code> | The device ID to get services for. | 1.0.0 |


#### GetConnectedDevicesResult

Result of the getConnectedDevices method.

| Prop          | Type                     | Description                | Since |
| ------------- | ------------------------ | -------------------------- | ----- |
| **`devices`** | <code>BleDevice[]</code> | List of connected devices. | 1.0.0 |


#### BleDevice

A BLE device.

| Prop                   | Type                        | Description                                           | Since |
| ---------------------- | --------------------------- | ----------------------------------------------------- | ----- |
| **`deviceId`**         | <code>string</code>         | The device ID (MAC address on Android, UUID on iOS).  | 1.0.0 |
| **`name`**             | <code>string \| null</code> | The device name (may be null if not available).       | 1.0.0 |
| **`rssi`**             | <code>number</code>         | The RSSI (signal strength) at time of discovery.      | 1.0.0 |
| **`manufacturerData`** | <code>string</code>         | Manufacturer data from advertisement (as hex string). | 1.0.0 |
| **`serviceUuids`**     | <code>string[]</code>       | Service UUIDs advertised by the device.               | 1.0.0 |


#### ReadCharacteristicResult

Result of reading a characteristic.

| Prop        | Type                  | Description                                    | Since |
| ----------- | --------------------- | ---------------------------------------------- | ----- |
| **`value`** | <code>number[]</code> | The characteristic value as an array of bytes. | 1.0.0 |


#### ReadCharacteristicOptions

Options for reading a characteristic.

| Prop                 | Type                | Description              | Since |
| -------------------- | ------------------- | ------------------------ | ----- |
| **`deviceId`**       | <code>string</code> | The device ID.           | 1.0.0 |
| **`service`**        | <code>string</code> | The service UUID.        | 1.0.0 |
| **`characteristic`** | <code>string</code> | The characteristic UUID. | 1.0.0 |


#### WriteCharacteristicOptions

Options for writing to a characteristic.

| Prop                 | Type                                             | Description                              | Default                     | Since |
| -------------------- | ------------------------------------------------ | ---------------------------------------- | --------------------------- | ----- |
| **`deviceId`**       | <code>string</code>                              | The device ID.                           |                             | 1.0.0 |
| **`service`**        | <code>string</code>                              | The service UUID.                        |                             | 1.0.0 |
| **`characteristic`** | <code>string</code>                              | The characteristic UUID.                 |                             | 1.0.0 |
| **`value`**          | <code>number[]</code>                            | The value to write as an array of bytes. |                             | 1.0.0 |
| **`type`**           | <code>'withResponse' \| 'withoutResponse'</code> | Write type.                              | <code>'withResponse'</code> | 1.0.0 |


#### StartCharacteristicNotificationsOptions

Options for starting characteristic notifications.

| Prop                 | Type                | Description              | Since |
| -------------------- | ------------------- | ------------------------ | ----- |
| **`deviceId`**       | <code>string</code> | The device ID.           | 1.0.0 |
| **`service`**        | <code>string</code> | The service UUID.        | 1.0.0 |
| **`characteristic`** | <code>string</code> | The characteristic UUID. | 1.0.0 |


#### StopCharacteristicNotificationsOptions

Options for stopping characteristic notifications.

| Prop                 | Type                | Description              | Since |
| -------------------- | ------------------- | ------------------------ | ----- |
| **`deviceId`**       | <code>string</code> | The device ID.           | 1.0.0 |
| **`service`**        | <code>string</code> | The service UUID.        | 1.0.0 |
| **`characteristic`** | <code>string</code> | The characteristic UUID. | 1.0.0 |


#### ReadDescriptorResult

Result of reading a descriptor.

| Prop        | Type                  | Description                                | Since |
| ----------- | --------------------- | ------------------------------------------ | ----- |
| **`value`** | <code>number[]</code> | The descriptor value as an array of bytes. | 1.0.0 |


#### ReadDescriptorOptions

Options for reading a descriptor.

| Prop                 | Type                | Description              | Since |
| -------------------- | ------------------- | ------------------------ | ----- |
| **`deviceId`**       | <code>string</code> | The device ID.           | 1.0.0 |
| **`service`**        | <code>string</code> | The service UUID.        | 1.0.0 |
| **`characteristic`** | <code>string</code> | The characteristic UUID. | 1.0.0 |
| **`descriptor`**     | <code>string</code> | The descriptor UUID.     | 1.0.0 |


#### WriteDescriptorOptions

Options for writing to a descriptor.

| Prop                 | Type                  | Description                              | Since |
| -------------------- | --------------------- | ---------------------------------------- | ----- |
| **`deviceId`**       | <code>string</code>   | The device ID.                           | 1.0.0 |
| **`service`**        | <code>string</code>   | The service UUID.                        | 1.0.0 |
| **`characteristic`** | <code>string</code>   | The characteristic UUID.                 | 1.0.0 |
| **`descriptor`**     | <code>string</code>   | The descriptor UUID.                     | 1.0.0 |
| **`value`**          | <code>number[]</code> | The value to write as an array of bytes. | 1.0.0 |


#### ReadRssiResult

Result of reading RSSI.

| Prop       | Type                | Description            | Since |
| ---------- | ------------------- | ---------------------- | ----- |
| **`rssi`** | <code>number</code> | The RSSI value in dBm. | 1.0.0 |


#### ReadRssiOptions

Options for reading RSSI.

| Prop           | Type                | Description    | Since |
| -------------- | ------------------- | -------------- | ----- |
| **`deviceId`** | <code>string</code> | The device ID. | 1.0.0 |


#### RequestMtuResult

Result of requesting MTU.

| Prop      | Type                | Description              | Since |
| --------- | ------------------- | ------------------------ | ----- |
| **`mtu`** | <code>number</code> | The negotiated MTU size. | 1.0.0 |


#### RequestMtuOptions

Options for requesting MTU.

| Prop           | Type                | Description             | Since |
| -------------- | ------------------- | ----------------------- | ----- |
| **`deviceId`** | <code>string</code> | The device ID.          | 1.0.0 |
| **`mtu`**      | <code>number</code> | The requested MTU size. | 1.0.0 |


#### RequestConnectionPriorityOptions

Options for requesting connection priority.

| Prop           | Type                                       | Description                        | Since |
| -------------- | ------------------------------------------ | ---------------------------------- | ----- |
| **`deviceId`** | <code>string</code>                        | The device ID.                     | 1.0.0 |
| **`priority`** | <code>'low' \| 'balanced' \| 'high'</code> | The requested connection priority. | 1.0.0 |


#### StartAdvertisingOptions

Options for starting advertising.

| Prop                      | Type                  | Description                                              | Default            | Since |
| ------------------------- | --------------------- | -------------------------------------------------------- | ------------------ | ----- |
| **`name`**                | <code>string</code>   | The device name to advertise.                            |                    | 1.0.0 |
| **`services`**            | <code>string[]</code> | Service UUIDs to advertise.                              |                    | 1.0.0 |
| **`includeName`**         | <code>boolean</code>  | Whether to include the device name in the advertisement. | <code>true</code>  | 1.0.0 |
| **`includeTxPowerLevel`** | <code>boolean</code>  | Whether to include TX power level in the advertisement.  | <code>false</code> | 1.0.0 |


#### StartForegroundServiceOptions

Options for starting the foreground service.

| Prop            | Type                | Description                                | Since |
| --------------- | ------------------- | ------------------------------------------ | ----- |
| **`title`**     | <code>string</code> | The notification title.                    | 1.0.0 |
| **`body`**      | <code>string</code> | The notification body.                     | 1.0.0 |
| **`smallIcon`** | <code>string</code> | The notification small icon resource name. | 1.0.0 |


#### GetPluginVersionResult

Result of getPluginVersion.

| Prop          | Type                | Description         | Since |
| ------------- | ------------------- | ------------------- | ----- |
| **`version`** | <code>string</code> | The plugin version. | 1.0.0 |


#### PluginListenerHandle

| Prop         | Type                                      |
| ------------ | ----------------------------------------- |
| **`remove`** | <code>() =&gt; Promise&lt;void&gt;</code> |


#### DeviceScannedEvent

Event emitted when a device is scanned.

| Prop         | Type                                            | Description         | Since |
| ------------ | ----------------------------------------------- | ------------------- | ----- |
| **`device`** | <code><a href="#bledevice">BleDevice</a></code> | The scanned device. | 1.0.0 |


#### DeviceConnectedEvent

Event emitted when a device is connected.

| Prop           | Type                | Description    | Since |
| -------------- | ------------------- | -------------- | ----- |
| **`deviceId`** | <code>string</code> | The device ID. | 1.0.0 |


#### DeviceDisconnectedEvent

Event emitted when a device is disconnected.

| Prop           | Type                | Description    | Since |
| -------------- | ------------------- | -------------- | ----- |
| **`deviceId`** | <code>string</code> | The device ID. | 1.0.0 |


#### CharacteristicChangedEvent

Event emitted when a characteristic value changes.

| Prop                 | Type                  | Description                         | Since |
| -------------------- | --------------------- | ----------------------------------- | ----- |
| **`deviceId`**       | <code>string</code>   | The device ID.                      | 1.0.0 |
| **`service`**        | <code>string</code>   | The service UUID.                   | 1.0.0 |
| **`characteristic`** | <code>string</code>   | The characteristic UUID.            | 1.0.0 |
| **`value`**          | <code>number[]</code> | The new value as an array of bytes. | 1.0.0 |


### Type Aliases


#### PermissionState

<code>'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'</code>

</docgen-api>
