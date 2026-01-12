package ee.forgr.plugin.bluetooth_low_energy;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.provider.Settings;
import androidx.annotation.RequiresPermission;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothLowEnergy",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE
            }
        ),
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        )
    }
)
public class BluetoothLowEnergyPlugin extends Plugin {

    private final String pluginVersion = "1.1.6";
    private BluetoothManager bluetoothManager;
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bluetoothLeScanner;
    private BluetoothLeAdvertiser bluetoothLeAdvertiser;

    private final Map<String, BluetoothDevice> discoveredDevices = new HashMap<>();
    private final Map<String, BluetoothGatt> connectedGatts = new HashMap<>();
    private final Map<String, List<BluetoothGattService>> deviceServices = new HashMap<>();

    private ScanCallback scanCallback;
    private AdvertiseCallback advertiseCallback;
    private Handler scanHandler;
    private boolean isScanning = false;
    private String mode = "central";

    private PluginCall pendingConnectCall;
    private PluginCall pendingDiscoverCall;
    private PluginCall pendingReadCall;
    private PluginCall pendingWriteCall;
    private PluginCall pendingNotifyCall;
    private PluginCall pendingReadDescriptorCall;
    private PluginCall pendingWriteDescriptorCall;
    private PluginCall pendingRssiCall;
    private PluginCall pendingMtuCall;

    private static final UUID CLIENT_CHARACTERISTIC_CONFIG = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    @Override
    public void load() {
        bluetoothManager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        if (bluetoothManager != null) {
            bluetoothAdapter = bluetoothManager.getAdapter();
        }
        scanHandler = new Handler(Looper.getMainLooper());
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        mode = call.getString("mode", "central");

        if (bluetoothAdapter == null) {
            call.reject("Bluetooth is not available on this device");
            return;
        }

        if (mode.equals("central")) {
            bluetoothLeScanner = bluetoothAdapter.getBluetoothLeScanner();
        } else {
            bluetoothLeAdvertiser = bluetoothAdapter.getBluetoothLeAdvertiser();
        }

        call.resolve();
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", bluetoothAdapter != null);
        call.resolve(ret);
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", bluetoothAdapter != null && bluetoothAdapter.isEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void isLocationEnabled(PluginCall call) {
        LocationManager locationManager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        boolean enabled = false;
        if (locationManager != null) {
            enabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
                      locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
        }
        JSObject ret = new JSObject();
        ret.put("enabled", enabled);
        call.resolve(ret);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("bluetooth", getBluetoothPermissionState());
        ret.put("location", getLocationPermissionState());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            requestPermissionForAlias("bluetooth", call, "permissionCallback");
        } else {
            requestPermissionForAlias("location", call, "permissionCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("bluetooth", getBluetoothPermissionState());
        ret.put("location", getLocationPermissionState());
        call.resolve(ret);
    }

    private String getBluetoothPermissionState() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
                ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
                return "granted";
            }
            return "prompt";
        }
        return "granted";
    }

    private String getLocationPermissionState() {
        if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            return "granted";
        }
        return "prompt";
    }

    @PluginMethod
    public void startScan(PluginCall call) {
        if (bluetoothLeScanner == null) {
            call.reject("Bluetooth scanner not available");
            return;
        }

        if (!hasBlePermissions()) {
            call.reject("Required permissions not granted");
            return;
        }

        JSArray servicesArray = call.getArray("services");
        double timeout = call.getDouble("timeout", 0.0);
        boolean allowDuplicates = call.getBoolean("allowDuplicates", false);

        List<ScanFilter> filters = new ArrayList<>();
        if (servicesArray != null) {
            try {
                for (int i = 0; i < servicesArray.length(); i++) {
                    String serviceUuid = servicesArray.getString(i);
                    ScanFilter filter = new ScanFilter.Builder()
                        .setServiceUuid(ParcelUuid.fromString(normalizeUuid(serviceUuid)))
                        .build();
                    filters.add(filter);
                }
            } catch (Exception e) {
                // Ignore filter errors
            }
        }

        ScanSettings.Builder settingsBuilder = new ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY);

        if (!allowDuplicates) {
            settingsBuilder.setCallbackType(ScanSettings.CALLBACK_TYPE_FIRST_MATCH);
        }

        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                handleScanResult(result);
            }

            @Override
            public void onBatchScanResults(List<ScanResult> results) {
                for (ScanResult result : results) {
                    handleScanResult(result);
                }
            }

            @Override
            public void onScanFailed(int errorCode) {
                // Scan failed
            }
        };

        try {
            if (filters.isEmpty()) {
                bluetoothLeScanner.startScan(scanCallback);
            } else {
                bluetoothLeScanner.startScan(filters, settingsBuilder.build(), scanCallback);
            }
            isScanning = true;

            if (timeout > 0) {
                scanHandler.postDelayed(() -> {
                    stopScanInternal();
                }, (long) timeout);
            }

            call.resolve();
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    private void handleScanResult(ScanResult result) {
        BluetoothDevice device = result.getDevice();
        String deviceId = device.getAddress();
        discoveredDevices.put(deviceId, device);

        JSObject deviceObj = new JSObject();
        deviceObj.put("deviceId", deviceId);
        try {
            deviceObj.put("name", device.getName());
        } catch (SecurityException e) {
            deviceObj.put("name", null);
        }
        deviceObj.put("rssi", result.getRssi());

        if (result.getScanRecord() != null) {
            byte[] manufacturerData = result.getScanRecord().getManufacturerSpecificData(0);
            if (manufacturerData != null) {
                deviceObj.put("manufacturerData", bytesToHex(manufacturerData));
            }

            List<ParcelUuid> serviceUuids = result.getScanRecord().getServiceUuids();
            if (serviceUuids != null) {
                JSArray uuids = new JSArray();
                for (ParcelUuid uuid : serviceUuids) {
                    uuids.put(uuid.getUuid().toString());
                }
                deviceObj.put("serviceUuids", uuids);
            }
        }

        JSObject event = new JSObject();
        event.put("device", deviceObj);
        notifyListeners("deviceScanned", event);
    }

    @PluginMethod
    public void stopScan(PluginCall call) {
        stopScanInternal();
        call.resolve();
    }

    private void stopScanInternal() {
        if (bluetoothLeScanner != null && scanCallback != null && isScanning) {
            try {
                bluetoothLeScanner.stopScan(scanCallback);
            } catch (SecurityException e) {
                // Ignore
            }
            isScanning = false;
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("deviceId is required");
            return;
        }

        BluetoothDevice device = discoveredDevices.get(deviceId);
        if (device == null) {
            // Try to get device by address
            if (bluetoothAdapter != null) {
                try {
                    device = bluetoothAdapter.getRemoteDevice(deviceId);
                } catch (Exception e) {
                    call.reject("Device not found");
                    return;
                }
            } else {
                call.reject("Device not found");
                return;
            }
        }

        boolean autoConnect = call.getBoolean("autoConnect", false);
        pendingConnectCall = call;

        try {
            BluetoothGatt gatt = device.connectGatt(getContext(), autoConnect, gattCallback);
            connectedGatts.put(deviceId, gatt);
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("deviceId is required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt != null) {
            try {
                gatt.disconnect();
                gatt.close();
            } catch (SecurityException e) {
                // Ignore
            }
            connectedGatts.remove(deviceId);
            deviceServices.remove(deviceId);
        }

        JSObject event = new JSObject();
        event.put("deviceId", deviceId);
        notifyListeners("deviceDisconnected", event);

        call.resolve();
    }

    @PluginMethod
    public void createBond(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("deviceId is required");
            return;
        }

        BluetoothDevice device = discoveredDevices.get(deviceId);
        if (device == null) {
            call.reject("Device not found");
            return;
        }

        try {
            device.createBond();
            call.resolve();
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isBonded(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("deviceId is required");
            return;
        }

        BluetoothDevice device = discoveredDevices.get(deviceId);
        if (device == null) {
            JSObject ret = new JSObject();
            ret.put("bonded", false);
            call.resolve(ret);
            return;
        }

        try {
            boolean bonded = device.getBondState() == BluetoothDevice.BOND_BONDED;
            JSObject ret = new JSObject();
            ret.put("bonded", bonded);
            call.resolve(ret);
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void discoverServices(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("deviceId is required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt == null) {
            call.reject("Device not connected");
            return;
        }

        pendingDiscoverCall = call;
        try {
            gatt.discoverServices();
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getServices(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("deviceId is required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt == null) {
            call.reject("Device not connected");
            return;
        }

        List<BluetoothGattService> services = gatt.getServices();
        JSArray servicesArray = new JSArray();

        for (BluetoothGattService service : services) {
            JSObject serviceObj = new JSObject();
            serviceObj.put("uuid", service.getUuid().toString());

            JSArray characteristicsArray = new JSArray();
            for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
                JSObject charObj = new JSObject();
                charObj.put("uuid", characteristic.getUuid().toString());

                JSObject properties = new JSObject();
                int props = characteristic.getProperties();
                properties.put("broadcast", (props & BluetoothGattCharacteristic.PROPERTY_BROADCAST) != 0);
                properties.put("read", (props & BluetoothGattCharacteristic.PROPERTY_READ) != 0);
                properties.put("writeWithoutResponse", (props & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0);
                properties.put("write", (props & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0);
                properties.put("notify", (props & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0);
                properties.put("indicate", (props & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0);
                properties.put("authenticatedSignedWrites", (props & BluetoothGattCharacteristic.PROPERTY_SIGNED_WRITE) != 0);
                properties.put("extendedProperties", (props & BluetoothGattCharacteristic.PROPERTY_EXTENDED_PROPS) != 0);
                charObj.put("properties", properties);

                JSArray descriptorsArray = new JSArray();
                for (BluetoothGattDescriptor descriptor : characteristic.getDescriptors()) {
                    JSObject descObj = new JSObject();
                    descObj.put("uuid", descriptor.getUuid().toString());
                    descriptorsArray.put(descObj);
                }
                charObj.put("descriptors", descriptorsArray);

                characteristicsArray.put(charObj);
            }
            serviceObj.put("characteristics", characteristicsArray);

            servicesArray.put(serviceObj);
        }

        JSObject ret = new JSObject();
        ret.put("services", servicesArray);
        call.resolve(ret);
    }

    @PluginMethod
    public void getConnectedDevices(PluginCall call) {
        JSArray devicesArray = new JSArray();
        for (Map.Entry<String, BluetoothGatt> entry : connectedGatts.entrySet()) {
            JSObject deviceObj = new JSObject();
            deviceObj.put("deviceId", entry.getKey());
            try {
                BluetoothDevice device = entry.getValue().getDevice();
                deviceObj.put("name", device.getName());
            } catch (SecurityException e) {
                deviceObj.put("name", null);
            }
            devicesArray.put(deviceObj);
        }

        JSObject ret = new JSObject();
        ret.put("devices", devicesArray);
        call.resolve(ret);
    }

    @PluginMethod
    public void readCharacteristic(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String serviceUuid = call.getString("service");
        String characteristicUuid = call.getString("characteristic");

        if (deviceId == null || serviceUuid == null || characteristicUuid == null) {
            call.reject("deviceId, service, and characteristic are required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt == null) {
            call.reject("Device not connected");
            return;
        }

        BluetoothGattCharacteristic characteristic = findCharacteristic(gatt, serviceUuid, characteristicUuid);
        if (characteristic == null) {
            call.reject("Characteristic not found");
            return;
        }

        pendingReadCall = call;
        try {
            gatt.readCharacteristic(characteristic);
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void writeCharacteristic(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String serviceUuid = call.getString("service");
        String characteristicUuid = call.getString("characteristic");
        JSArray valueArray = call.getArray("value");
        String writeType = call.getString("type", "withResponse");

        if (deviceId == null || serviceUuid == null || characteristicUuid == null || valueArray == null) {
            call.reject("deviceId, service, characteristic, and value are required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt == null) {
            call.reject("Device not connected");
            return;
        }

        BluetoothGattCharacteristic characteristic = findCharacteristic(gatt, serviceUuid, characteristicUuid);
        if (characteristic == null) {
            call.reject("Characteristic not found");
            return;
        }

        try {
            byte[] value = jsArrayToBytes(valueArray);
            characteristic.setValue(value);

            if (writeType.equals("withoutResponse")) {
                characteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
            } else {
                characteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            }

            pendingWriteCall = call;
            gatt.writeCharacteristic(characteristic);
        } catch (Exception e) {
            call.reject("Failed to write: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startCharacteristicNotifications(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String serviceUuid = call.getString("service");
        String characteristicUuid = call.getString("characteristic");

        if (deviceId == null || serviceUuid == null || characteristicUuid == null) {
            call.reject("deviceId, service, and characteristic are required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt == null) {
            call.reject("Device not connected");
            return;
        }

        BluetoothGattCharacteristic characteristic = findCharacteristic(gatt, serviceUuid, characteristicUuid);
        if (characteristic == null) {
            call.reject("Characteristic not found");
            return;
        }

        try {
            gatt.setCharacteristicNotification(characteristic, true);

            BluetoothGattDescriptor descriptor = characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG);
            if (descriptor != null) {
                int properties = characteristic.getProperties();
                if ((properties & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0) {
                    descriptor.setValue(BluetoothGattDescriptor.ENABLE_INDICATION_VALUE);
                } else {
                    descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                }
                pendingNotifyCall = call;
                gatt.writeDescriptor(descriptor);
            } else {
                call.resolve();
            }
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopCharacteristicNotifications(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String serviceUuid = call.getString("service");
        String characteristicUuid = call.getString("characteristic");

        if (deviceId == null || serviceUuid == null || characteristicUuid == null) {
            call.reject("deviceId, service, and characteristic are required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt == null) {
            call.reject("Device not connected");
            return;
        }

        BluetoothGattCharacteristic characteristic = findCharacteristic(gatt, serviceUuid, characteristicUuid);
        if (characteristic == null) {
            call.reject("Characteristic not found");
            return;
        }

        try {
            gatt.setCharacteristicNotification(characteristic, false);

            BluetoothGattDescriptor descriptor = characteristic.getDescriptor(CLIENT_CHARACTERISTIC_CONFIG);
            if (descriptor != null) {
                descriptor.setValue(BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE);
                pendingNotifyCall = call;
                gatt.writeDescriptor(descriptor);
            } else {
                call.resolve();
            }
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readDescriptor(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String serviceUuid = call.getString("service");
        String characteristicUuid = call.getString("characteristic");
        String descriptorUuid = call.getString("descriptor");

        if (deviceId == null || serviceUuid == null || characteristicUuid == null || descriptorUuid == null) {
            call.reject("deviceId, service, characteristic, and descriptor are required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt == null) {
            call.reject("Device not connected");
            return;
        }

        BluetoothGattDescriptor descriptor = findDescriptor(gatt, serviceUuid, characteristicUuid, descriptorUuid);
        if (descriptor == null) {
            call.reject("Descriptor not found");
            return;
        }

        pendingReadDescriptorCall = call;
        try {
            gatt.readDescriptor(descriptor);
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void writeDescriptor(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String serviceUuid = call.getString("service");
        String characteristicUuid = call.getString("characteristic");
        String descriptorUuid = call.getString("descriptor");
        JSArray valueArray = call.getArray("value");

        if (deviceId == null || serviceUuid == null || characteristicUuid == null || descriptorUuid == null || valueArray == null) {
            call.reject("deviceId, service, characteristic, descriptor, and value are required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt == null) {
            call.reject("Device not connected");
            return;
        }

        BluetoothGattDescriptor descriptor = findDescriptor(gatt, serviceUuid, characteristicUuid, descriptorUuid);
        if (descriptor == null) {
            call.reject("Descriptor not found");
            return;
        }

        try {
            byte[] value = jsArrayToBytes(valueArray);
            descriptor.setValue(value);
            pendingWriteDescriptorCall = call;
            gatt.writeDescriptor(descriptor);
        } catch (Exception e) {
            call.reject("Failed to write: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readRssi(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("deviceId is required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt == null) {
            call.reject("Device not connected");
            return;
        }

        pendingRssiCall = call;
        try {
            gatt.readRemoteRssi();
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestMtu(PluginCall call) {
        String deviceId = call.getString("deviceId");
        Integer mtu = call.getInt("mtu");

        if (deviceId == null || mtu == null) {
            call.reject("deviceId and mtu are required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt == null) {
            call.reject("Device not connected");
            return;
        }

        pendingMtuCall = call;
        try {
            gatt.requestMtu(mtu);
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void requestConnectionPriority(PluginCall call) {
        String deviceId = call.getString("deviceId");
        String priority = call.getString("priority", "balanced");

        if (deviceId == null) {
            call.reject("deviceId is required");
            return;
        }

        BluetoothGatt gatt = connectedGatts.get(deviceId);
        if (gatt == null) {
            call.reject("Device not connected");
            return;
        }

        int priorityValue;
        switch (priority) {
            case "high":
                priorityValue = BluetoothGatt.CONNECTION_PRIORITY_HIGH;
                break;
            case "low":
                priorityValue = BluetoothGatt.CONNECTION_PRIORITY_LOW_POWER;
                break;
            default:
                priorityValue = BluetoothGatt.CONNECTION_PRIORITY_BALANCED;
                break;
        }

        try {
            gatt.requestConnectionPriority(priorityValue);
            call.resolve();
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startAdvertising(PluginCall call) {
        if (bluetoothLeAdvertiser == null) {
            call.reject("Bluetooth advertiser not available");
            return;
        }

        String name = call.getString("name");
        JSArray servicesArray = call.getArray("services");

        AdvertiseSettings settings = new AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .build();

        AdvertiseData.Builder dataBuilder = new AdvertiseData.Builder()
            .setIncludeDeviceName(name != null);

        if (servicesArray != null) {
            try {
                for (int i = 0; i < servicesArray.length(); i++) {
                    String serviceUuid = servicesArray.getString(i);
                    dataBuilder.addServiceUuid(ParcelUuid.fromString(normalizeUuid(serviceUuid)));
                }
            } catch (Exception e) {
                // Ignore
            }
        }

        advertiseCallback = new AdvertiseCallback() {
            @Override
            public void onStartSuccess(AdvertiseSettings settingsInEffect) {
                // Advertising started
            }

            @Override
            public void onStartFailure(int errorCode) {
                // Advertising failed
            }
        };

        try {
            bluetoothLeAdvertiser.startAdvertising(settings, dataBuilder.build(), advertiseCallback);
            call.resolve();
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopAdvertising(PluginCall call) {
        if (bluetoothLeAdvertiser != null && advertiseCallback != null) {
            try {
                bluetoothLeAdvertiser.stopAdvertising(advertiseCallback);
            } catch (SecurityException e) {
                // Ignore
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void startForegroundService(PluginCall call) {
        // Foreground service implementation would go here
        // This requires additional setup with a ForegroundService class
        call.resolve();
    }

    @PluginMethod
    public void stopForegroundService(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void getPluginVersion(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("version", pluginVersion);
        call.resolve(ret);
    }

    // MARK: - GATT Callback

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            String deviceId = gatt.getDevice().getAddress();

            if (newState == BluetoothProfile.STATE_CONNECTED) {
                if (pendingConnectCall != null) {
                    pendingConnectCall.resolve();
                    pendingConnectCall = null;
                }

                JSObject event = new JSObject();
                event.put("deviceId", deviceId);
                notifyListeners("deviceConnected", event);
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connectedGatts.remove(deviceId);
                deviceServices.remove(deviceId);

                JSObject event = new JSObject();
                event.put("deviceId", deviceId);
                notifyListeners("deviceDisconnected", event);
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (pendingDiscoverCall != null) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    pendingDiscoverCall.resolve();
                } else {
                    pendingDiscoverCall.reject("Service discovery failed");
                }
                pendingDiscoverCall = null;
            }
        }

        @Override
        public void onCharacteristicRead(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            if (pendingReadCall != null) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    JSObject ret = new JSObject();
                    ret.put("value", bytesToJsArray(characteristic.getValue()));
                    pendingReadCall.resolve(ret);
                } else {
                    pendingReadCall.reject("Read failed");
                }
                pendingReadCall = null;
            }
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            if (pendingWriteCall != null) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    pendingWriteCall.resolve();
                } else {
                    pendingWriteCall.reject("Write failed");
                }
                pendingWriteCall = null;
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            String deviceId = gatt.getDevice().getAddress();
            String serviceUuid = characteristic.getService().getUuid().toString();
            String characteristicUuid = characteristic.getUuid().toString();

            JSObject event = new JSObject();
            event.put("deviceId", deviceId);
            event.put("service", serviceUuid);
            event.put("characteristic", characteristicUuid);
            event.put("value", bytesToJsArray(characteristic.getValue()));
            notifyListeners("characteristicChanged", event);
        }

        @Override
        public void onDescriptorRead(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
            if (pendingReadDescriptorCall != null) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    JSObject ret = new JSObject();
                    ret.put("value", bytesToJsArray(descriptor.getValue()));
                    pendingReadDescriptorCall.resolve(ret);
                } else {
                    pendingReadDescriptorCall.reject("Read failed");
                }
                pendingReadDescriptorCall = null;
            }
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
            if (pendingNotifyCall != null) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    pendingNotifyCall.resolve();
                } else {
                    pendingNotifyCall.reject("Failed to enable notifications");
                }
                pendingNotifyCall = null;
            } else if (pendingWriteDescriptorCall != null) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    pendingWriteDescriptorCall.resolve();
                } else {
                    pendingWriteDescriptorCall.reject("Write failed");
                }
                pendingWriteDescriptorCall = null;
            }
        }

        @Override
        public void onReadRemoteRssi(BluetoothGatt gatt, int rssi, int status) {
            if (pendingRssiCall != null) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    JSObject ret = new JSObject();
                    ret.put("rssi", rssi);
                    pendingRssiCall.resolve(ret);
                } else {
                    pendingRssiCall.reject("Failed to read RSSI");
                }
                pendingRssiCall = null;
            }
        }

        @Override
        public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
            if (pendingMtuCall != null) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    JSObject ret = new JSObject();
                    ret.put("mtu", mtu);
                    pendingMtuCall.resolve(ret);
                } else {
                    pendingMtuCall.reject("Failed to change MTU");
                }
                pendingMtuCall = null;
            }
        }
    };

    // MARK: - Helper Methods

    private boolean hasBlePermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED &&
                   ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        } else {
            return ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        }
    }

    private BluetoothGattCharacteristic findCharacteristic(BluetoothGatt gatt, String serviceUuid, String characteristicUuid) {
        BluetoothGattService service = gatt.getService(UUID.fromString(normalizeUuid(serviceUuid)));
        if (service == null) {
            return null;
        }
        return service.getCharacteristic(UUID.fromString(normalizeUuid(characteristicUuid)));
    }

    private BluetoothGattDescriptor findDescriptor(BluetoothGatt gatt, String serviceUuid, String characteristicUuid, String descriptorUuid) {
        BluetoothGattCharacteristic characteristic = findCharacteristic(gatt, serviceUuid, characteristicUuid);
        if (characteristic == null) {
            return null;
        }
        return characteristic.getDescriptor(UUID.fromString(normalizeUuid(descriptorUuid)));
    }

    private String normalizeUuid(String uuid) {
        if (uuid.length() == 4) {
            return "0000" + uuid.toLowerCase() + "-0000-1000-8000-00805f9b34fb";
        } else if (uuid.length() == 8) {
            return uuid.toLowerCase() + "-0000-1000-8000-00805f9b34fb";
        }
        return uuid.toLowerCase();
    }

    private String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private byte[] jsArrayToBytes(JSArray array) throws Exception {
        byte[] bytes = new byte[array.length()];
        for (int i = 0; i < array.length(); i++) {
            bytes[i] = (byte) array.getInt(i);
        }
        return bytes;
    }

    private JSArray bytesToJsArray(byte[] bytes) {
        JSArray array = new JSArray();
        if (bytes != null) {
            for (byte b : bytes) {
                array.put(b & 0xFF);
            }
        }
        return array;
    }
}
