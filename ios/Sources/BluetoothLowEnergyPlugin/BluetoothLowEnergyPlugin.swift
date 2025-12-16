import Foundation
import Capacitor
import CoreBluetooth

@objc(BluetoothLowEnergyPlugin)
public class BluetoothLowEnergyPlugin: CAPPlugin, CAPBridgedPlugin {
    private let pluginVersion: String = "1.0.0"
    public let identifier = "BluetoothLowEnergyPlugin"
    public let jsName = "BluetoothLowEnergy"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isLocationEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBluetoothSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openLocationSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermissions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createBond", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isBonded", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discoverServices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getServices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getConnectedDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readCharacteristic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeCharacteristic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startCharacteristicNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopCharacteristicNotifications", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readDescriptor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeDescriptor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readRssi", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestMtu", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestConnectionPriority", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startAdvertising", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAdvertising", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startForegroundService", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopForegroundService", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPluginVersion", returnType: CAPPluginReturnPromise)
    ]

    private var implementation: BluetoothLowEnergy?

    override public func load() {
        implementation = BluetoothLowEnergy(plugin: self)
    }

    @objc func initialize(_ call: CAPPluginCall) {
        let mode = call.getString("mode") ?? "central"
        implementation?.initialize(mode: mode) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        let available = implementation?.isAvailable() ?? false
        call.resolve(["available": available])
    }

    @objc func isEnabled(_ call: CAPPluginCall) {
        let enabled = implementation?.isEnabled() ?? false
        call.resolve(["enabled": enabled])
    }

    @objc func isLocationEnabled(_ call: CAPPluginCall) {
        // Location is always enabled on iOS for BLE purposes
        call.resolve(["enabled": true])
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url, options: [:]) { success in
                    if success {
                        call.resolve()
                    } else {
                        call.reject("Could not open app settings")
                    }
                }
            } else {
                call.reject("Could not create settings URL")
            }
        }
    }

    @objc func openBluetoothSettings(_ call: CAPPluginCall) {
        // On iOS, we can only open the app settings, not Bluetooth settings directly
        openAppSettings(call)
    }

    @objc func openLocationSettings(_ call: CAPPluginCall) {
        // On iOS, we can only open the app settings
        openAppSettings(call)
    }

    @objc override public func checkPermissions(_ call: CAPPluginCall) {
        let status = implementation?.getPermissionStatus() ?? "prompt"
        call.resolve([
            "bluetooth": status,
            "location": "granted"
        ])
    }

    @objc override public func requestPermissions(_ call: CAPPluginCall) {
        implementation?.requestPermissions { status in
            call.resolve([
                "bluetooth": status,
                "location": "granted"
            ])
        }
    }

    @objc func startScan(_ call: CAPPluginCall) {
        var serviceUUIDs: [CBUUID]?
        if let services = call.getArray("services", String.self) {
            serviceUUIDs = services.map { CBUUID(string: $0) }
        }

        let timeout = call.getDouble("timeout") ?? 0
        let allowDuplicates = call.getBool("allowDuplicates") ?? false

        implementation?.startScan(
            services: serviceUUIDs,
            timeout: timeout,
            allowDuplicates: allowDuplicates
        ) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func stopScan(_ call: CAPPluginCall) {
        implementation?.stopScan()
        call.resolve()
    }

    @objc func connect(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId") else {
            call.reject("deviceId is required")
            return
        }

        let autoConnect = call.getBool("autoConnect") ?? false

        implementation?.connect(deviceId: deviceId, autoConnect: autoConnect) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId") else {
            call.reject("deviceId is required")
            return
        }

        implementation?.disconnect(deviceId: deviceId) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func createBond(_ call: CAPPluginCall) {
        // Bonding is handled automatically on iOS
        call.resolve()
    }

    @objc func isBonded(_ call: CAPPluginCall) {
        // iOS doesn't expose bonding information
        call.resolve(["bonded": false])
    }

    @objc func discoverServices(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId") else {
            call.reject("deviceId is required")
            return
        }

        implementation?.discoverServices(deviceId: deviceId) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func getServices(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId") else {
            call.reject("deviceId is required")
            return
        }

        let services = implementation?.getServices(deviceId: deviceId) ?? []
        call.resolve(["services": services])
    }

    @objc func getConnectedDevices(_ call: CAPPluginCall) {
        let devices = implementation?.getConnectedDevices() ?? []
        call.resolve(["devices": devices])
    }

    @objc func readCharacteristic(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"),
              let service = call.getString("service"),
              let characteristic = call.getString("characteristic") else {
            call.reject("deviceId, service, and characteristic are required")
            return
        }

        implementation?.readCharacteristic(
            deviceId: deviceId,
            serviceUUID: service,
            characteristicUUID: characteristic
        ) { result in
            switch result {
            case .success(let value):
                call.resolve(["value": value])
            case .failure(let error):
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func writeCharacteristic(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"),
              let service = call.getString("service"),
              let characteristic = call.getString("characteristic"),
              let value = call.getArray("value", Int.self) else {
            call.reject("deviceId, service, characteristic, and value are required")
            return
        }

        let writeType = call.getString("type") ?? "withResponse"

        implementation?.writeCharacteristic(
            deviceId: deviceId,
            serviceUUID: service,
            characteristicUUID: characteristic,
            value: value.map { UInt8($0) },
            writeType: writeType
        ) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func startCharacteristicNotifications(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"),
              let service = call.getString("service"),
              let characteristic = call.getString("characteristic") else {
            call.reject("deviceId, service, and characteristic are required")
            return
        }

        implementation?.startCharacteristicNotifications(
            deviceId: deviceId,
            serviceUUID: service,
            characteristicUUID: characteristic
        ) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func stopCharacteristicNotifications(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"),
              let service = call.getString("service"),
              let characteristic = call.getString("characteristic") else {
            call.reject("deviceId, service, and characteristic are required")
            return
        }

        implementation?.stopCharacteristicNotifications(
            deviceId: deviceId,
            serviceUUID: service,
            characteristicUUID: characteristic
        ) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func readDescriptor(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"),
              let service = call.getString("service"),
              let characteristic = call.getString("characteristic"),
              let descriptor = call.getString("descriptor") else {
            call.reject("deviceId, service, characteristic, and descriptor are required")
            return
        }

        implementation?.readDescriptor(
            deviceId: deviceId,
            serviceUUID: service,
            characteristicUUID: characteristic,
            descriptorUUID: descriptor
        ) { result in
            switch result {
            case .success(let value):
                call.resolve(["value": value])
            case .failure(let error):
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func writeDescriptor(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId"),
              let service = call.getString("service"),
              let characteristic = call.getString("characteristic"),
              let descriptor = call.getString("descriptor"),
              let value = call.getArray("value", Int.self) else {
            call.reject("deviceId, service, characteristic, descriptor, and value are required")
            return
        }

        implementation?.writeDescriptor(
            deviceId: deviceId,
            serviceUUID: service,
            characteristicUUID: characteristic,
            descriptorUUID: descriptor,
            value: value.map { UInt8($0) }
        ) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func readRssi(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId") else {
            call.reject("deviceId is required")
            return
        }

        implementation?.readRssi(deviceId: deviceId) { result in
            switch result {
            case .success(let rssi):
                call.resolve(["rssi": rssi])
            case .failure(let error):
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func requestMtu(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId") else {
            call.reject("deviceId is required")
            return
        }

        // iOS negotiates MTU automatically, return the max MTU
        let mtu = implementation?.getMtu(deviceId: deviceId) ?? 185
        call.resolve(["mtu": mtu])
    }

    @objc func requestConnectionPriority(_ call: CAPPluginCall) {
        // iOS doesn't support connection priority changes
        call.resolve()
    }

    @objc func startAdvertising(_ call: CAPPluginCall) {
        let name = call.getString("name")
        var serviceUUIDs: [CBUUID]?
        if let services = call.getArray("services", String.self) {
            serviceUUIDs = services.map { CBUUID(string: $0) }
        }

        implementation?.startAdvertising(name: name, services: serviceUUIDs) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func stopAdvertising(_ call: CAPPluginCall) {
        implementation?.stopAdvertising()
        call.resolve()
    }

    @objc func startForegroundService(_ call: CAPPluginCall) {
        // iOS doesn't have foreground services like Android
        // Background execution is handled through Background Modes capability
        call.resolve()
    }

    @objc func stopForegroundService(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func getPluginVersion(_ call: CAPPluginCall) {
        call.resolve(["version": pluginVersion])
    }

    // MARK: - Event Emitters

    func emitDeviceScanned(device: [String: Any]) {
        notifyListeners("deviceScanned", data: ["device": device])
    }

    func emitDeviceConnected(deviceId: String) {
        notifyListeners("deviceConnected", data: ["deviceId": deviceId])
    }

    func emitDeviceDisconnected(deviceId: String) {
        notifyListeners("deviceDisconnected", data: ["deviceId": deviceId])
    }

    func emitCharacteristicChanged(deviceId: String, service: String, characteristic: String, value: [Int]) {
        notifyListeners("characteristicChanged", data: [
            "deviceId": deviceId,
            "service": service,
            "characteristic": characteristic,
            "value": value
        ])
    }
}
