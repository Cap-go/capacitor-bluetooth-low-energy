import Foundation
import CoreBluetooth

// swiftlint:disable type_body_length file_length function_parameter_count for_where
public class BluetoothLowEnergy: NSObject {
    fileprivate weak var plugin: BluetoothLowEnergyPlugin?
    private var centralManager: CBCentralManager?
    private var peripheralManager: CBPeripheralManager?

    private var discoveredPeripherals: [String: CBPeripheral] = [:]
    private var connectedPeripherals: [String: CBPeripheral] = [:]
    private var peripheralDelegates: [String: PeripheralDelegate] = [:]

    private var scanCallback: ((Error?) -> Void)?
    private var connectCallbacks: [String: (Error?) -> Void] = [:]
    private var disconnectCallbacks: [String: (Error?) -> Void] = [:]
    fileprivate var discoverServicesCallbacks: [String: (Error?) -> Void] = [:]
    fileprivate var readCharacteristicCallbacks: [String: (Result<[Int], Error>) -> Void] = [:]
    fileprivate var writeCharacteristicCallbacks: [String: (Error?) -> Void] = [:]
    fileprivate var notifyCallbacks: [String: (Error?) -> Void] = [:]
    fileprivate var readDescriptorCallbacks: [String: (Result<[Int], Error>) -> Void] = [:]
    fileprivate var writeDescriptorCallbacks: [String: (Error?) -> Void] = [:]
    fileprivate var readRssiCallbacks: [String: (Result<Int, Error>) -> Void] = [:]

    private var scanTimer: Timer?
    private var allowDuplicates = false
    private var mode: String = "central"

    init(plugin: BluetoothLowEnergyPlugin) {
        self.plugin = plugin
        super.init()
    }

    func initialize(mode: String, completion: @escaping (Error?) -> Void) {
        self.mode = mode

        if mode == "peripheral" {
            peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
        } else {
            centralManager = CBCentralManager(delegate: self, queue: nil)
        }

        // Wait for the manager to be ready
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            completion(nil)
        }
    }

    func isAvailable() -> Bool {
        if mode == "peripheral" {
            return peripheralManager?.state != .unsupported
        }
        return centralManager?.state != .unsupported
    }

    func isEnabled() -> Bool {
        if mode == "peripheral" {
            return peripheralManager?.state == .poweredOn
        }
        return centralManager?.state == .poweredOn
    }

    func getPermissionStatus() -> String {
        switch CBCentralManager.authorization {
        case .allowedAlways:
            return "granted"
        case .denied:
            return "denied"
        case .restricted:
            return "denied"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "prompt"
        }
    }

    func requestPermissions(completion: @escaping (String) -> Void) {
        // Initializing the central manager triggers the permission prompt
        if centralManager == nil {
            centralManager = CBCentralManager(delegate: self, queue: nil)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            completion(self.getPermissionStatus())
        }
    }

    func startScan(services: [CBUUID]?, timeout: Double, allowDuplicates: Bool, completion: @escaping (Error?) -> Void) {
        guard let centralManager = centralManager else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 1, userInfo: [NSLocalizedDescriptionKey: "Central manager not initialized"]))
            return
        }

        guard centralManager.state == .poweredOn else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 2, userInfo: [NSLocalizedDescriptionKey: "Bluetooth is not powered on"]))
            return
        }

        self.allowDuplicates = allowDuplicates
        scanCallback = completion

        var options: [String: Any] = [:]
        if allowDuplicates {
            options[CBCentralManagerScanOptionAllowDuplicatesKey] = true
        }

        centralManager.scanForPeripherals(withServices: services, options: options)

        if timeout > 0 {
            scanTimer = Timer.scheduledTimer(withTimeInterval: timeout / 1000.0, repeats: false) { [weak self] _ in
                self?.stopScan()
            }
        }

        completion(nil)
    }

    func stopScan() {
        scanTimer?.invalidate()
        scanTimer = nil
        centralManager?.stopScan()
    }

    func connect(deviceId: String, autoConnect: Bool, completion: @escaping (Error?) -> Void) {
        guard let peripheral = discoveredPeripherals[deviceId] else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 3, userInfo: [NSLocalizedDescriptionKey: "Device not found"]))
            return
        }

        connectCallbacks[deviceId] = completion

        var options: [String: Any]?
        if autoConnect {
            options = [CBConnectPeripheralOptionNotifyOnConnectionKey: true]
        }

        centralManager?.connect(peripheral, options: options)
    }

    func disconnect(deviceId: String, completion: @escaping (Error?) -> Void) {
        guard let peripheral = connectedPeripherals[deviceId] else {
            completion(nil)
            return
        }

        disconnectCallbacks[deviceId] = completion
        centralManager?.cancelPeripheralConnection(peripheral)
    }

    func discoverServices(deviceId: String, completion: @escaping (Error?) -> Void) {
        guard let peripheral = connectedPeripherals[deviceId] else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 4, userInfo: [NSLocalizedDescriptionKey: "Device not connected"]))
            return
        }

        discoverServicesCallbacks[deviceId] = completion
        peripheral.discoverServices(nil)
    }

    func getServices(deviceId: String) -> [[String: Any]] {
        guard let peripheral = connectedPeripherals[deviceId],
              let services = peripheral.services else {
            return []
        }

        return services.map { service in
            var serviceDict: [String: Any] = [
                "uuid": service.uuid.uuidString
            ]

            if let characteristics = service.characteristics {
                serviceDict["characteristics"] = characteristics.map { characteristic in
                    var charDict: [String: Any] = [
                        "uuid": characteristic.uuid.uuidString,
                        "properties": [
                            "broadcast": characteristic.properties.contains(.broadcast),
                            "read": characteristic.properties.contains(.read),
                            "writeWithoutResponse": characteristic.properties.contains(.writeWithoutResponse),
                            "write": characteristic.properties.contains(.write),
                            "notify": characteristic.properties.contains(.notify),
                            "indicate": characteristic.properties.contains(.indicate),
                            "authenticatedSignedWrites": characteristic.properties.contains(.authenticatedSignedWrites),
                            "extendedProperties": characteristic.properties.contains(.extendedProperties)
                        ]
                    ]

                    if let descriptors = characteristic.descriptors {
                        charDict["descriptors"] = descriptors.map { descriptor in
                            ["uuid": descriptor.uuid.uuidString]
                        }
                    } else {
                        charDict["descriptors"] = []
                    }

                    return charDict
                }
            } else {
                serviceDict["characteristics"] = []
            }

            return serviceDict
        }
    }

    func getConnectedDevices() -> [[String: Any]] {
        return connectedPeripherals.map { (deviceId, peripheral) in
            [
                "deviceId": deviceId,
                "name": peripheral.name as Any
            ]
        }
    }

    func readCharacteristic(deviceId: String, serviceUUID: String, characteristicUUID: String, completion: @escaping (Result<[Int], Error>) -> Void) {
        guard let peripheral = connectedPeripherals[deviceId] else {
            completion(.failure(NSError(domain: "BluetoothLowEnergy", code: 4, userInfo: [NSLocalizedDescriptionKey: "Device not connected"])))
            return
        }

        guard let characteristic = findCharacteristic(peripheral: peripheral, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID) else {
            completion(.failure(NSError(domain: "BluetoothLowEnergy", code: 5, userInfo: [NSLocalizedDescriptionKey: "Characteristic not found"])))
            return
        }

        let key = "\(deviceId)-\(serviceUUID)-\(characteristicUUID)"
        readCharacteristicCallbacks[key] = completion
        peripheral.readValue(for: characteristic)
    }

    func writeCharacteristic(deviceId: String, serviceUUID: String, characteristicUUID: String, value: [UInt8], writeType: String, completion: @escaping (Error?) -> Void) {
        guard let peripheral = connectedPeripherals[deviceId] else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 4, userInfo: [NSLocalizedDescriptionKey: "Device not connected"]))
            return
        }

        guard let characteristic = findCharacteristic(peripheral: peripheral, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID) else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 5, userInfo: [NSLocalizedDescriptionKey: "Characteristic not found"]))
            return
        }

        let data = Data(value)
        let type: CBCharacteristicWriteType = writeType == "withoutResponse" ? .withoutResponse : .withResponse

        if type == .withResponse {
            let key = "\(deviceId)-\(serviceUUID)-\(characteristicUUID)"
            writeCharacteristicCallbacks[key] = completion
        }

        peripheral.writeValue(data, for: characteristic, type: type)

        if type == .withoutResponse {
            completion(nil)
        }
    }

    func startCharacteristicNotifications(deviceId: String, serviceUUID: String, characteristicUUID: String, completion: @escaping (Error?) -> Void) {
        guard let peripheral = connectedPeripherals[deviceId] else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 4, userInfo: [NSLocalizedDescriptionKey: "Device not connected"]))
            return
        }

        guard let characteristic = findCharacteristic(peripheral: peripheral, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID) else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 5, userInfo: [NSLocalizedDescriptionKey: "Characteristic not found"]))
            return
        }

        let key = "\(deviceId)-\(serviceUUID)-\(characteristicUUID)"
        notifyCallbacks[key] = completion
        peripheral.setNotifyValue(true, for: characteristic)
    }

    func stopCharacteristicNotifications(deviceId: String, serviceUUID: String, characteristicUUID: String, completion: @escaping (Error?) -> Void) {
        guard let peripheral = connectedPeripherals[deviceId] else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 4, userInfo: [NSLocalizedDescriptionKey: "Device not connected"]))
            return
        }

        guard let characteristic = findCharacteristic(peripheral: peripheral, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID) else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 5, userInfo: [NSLocalizedDescriptionKey: "Characteristic not found"]))
            return
        }

        let key = "\(deviceId)-\(serviceUUID)-\(characteristicUUID)"
        notifyCallbacks[key] = completion
        peripheral.setNotifyValue(false, for: characteristic)
    }

    func readDescriptor(deviceId: String, serviceUUID: String, characteristicUUID: String, descriptorUUID: String, completion: @escaping (Result<[Int], Error>) -> Void) {
        guard let peripheral = connectedPeripherals[deviceId] else {
            completion(.failure(NSError(domain: "BluetoothLowEnergy", code: 4, userInfo: [NSLocalizedDescriptionKey: "Device not connected"])))
            return
        }

        guard let descriptor = findDescriptor(peripheral: peripheral, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID, descriptorUUID: descriptorUUID) else {
            completion(.failure(NSError(domain: "BluetoothLowEnergy", code: 6, userInfo: [NSLocalizedDescriptionKey: "Descriptor not found"])))
            return
        }

        let key = "\(deviceId)-\(serviceUUID)-\(characteristicUUID)-\(descriptorUUID)"
        readDescriptorCallbacks[key] = completion
        peripheral.readValue(for: descriptor)
    }

    func writeDescriptor(deviceId: String, serviceUUID: String, characteristicUUID: String, descriptorUUID: String, value: [UInt8], completion: @escaping (Error?) -> Void) {
        guard let peripheral = connectedPeripherals[deviceId] else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 4, userInfo: [NSLocalizedDescriptionKey: "Device not connected"]))
            return
        }

        guard let descriptor = findDescriptor(peripheral: peripheral, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID, descriptorUUID: descriptorUUID) else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 6, userInfo: [NSLocalizedDescriptionKey: "Descriptor not found"]))
            return
        }

        let key = "\(deviceId)-\(serviceUUID)-\(characteristicUUID)-\(descriptorUUID)"
        writeDescriptorCallbacks[key] = completion
        peripheral.writeValue(Data(value), for: descriptor)
    }

    func readRssi(deviceId: String, completion: @escaping (Result<Int, Error>) -> Void) {
        guard let peripheral = connectedPeripherals[deviceId] else {
            completion(.failure(NSError(domain: "BluetoothLowEnergy", code: 4, userInfo: [NSLocalizedDescriptionKey: "Device not connected"])))
            return
        }

        readRssiCallbacks[deviceId] = completion
        peripheral.readRSSI()
    }

    func getMtu(deviceId: String) -> Int {
        guard let peripheral = connectedPeripherals[deviceId] else {
            return 20
        }
        return peripheral.maximumWriteValueLength(for: .withoutResponse) + 3
    }

    func startAdvertising(name: String?, services: [CBUUID]?, completion: @escaping (Error?) -> Void) {
        guard let peripheralManager = peripheralManager else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 1, userInfo: [NSLocalizedDescriptionKey: "Peripheral manager not initialized"]))
            return
        }

        guard peripheralManager.state == .poweredOn else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 2, userInfo: [NSLocalizedDescriptionKey: "Bluetooth is not powered on"]))
            return
        }

        var advertisementData: [String: Any] = [:]
        if let name = name {
            advertisementData[CBAdvertisementDataLocalNameKey] = name
        }
        if let services = services {
            advertisementData[CBAdvertisementDataServiceUUIDsKey] = services
        }

        peripheralManager.startAdvertising(advertisementData)
        completion(nil)
    }

    func stopAdvertising() {
        peripheralManager?.stopAdvertising()
    }

    // MARK: - Private Helpers

    private func findCharacteristic(peripheral: CBPeripheral, serviceUUID: String, characteristicUUID: String) -> CBCharacteristic? {
        guard let services = peripheral.services else { return nil }

        let targetServiceUUID = CBUUID(string: serviceUUID)
        let targetCharacteristicUUID = CBUUID(string: characteristicUUID)

        for service in services {
            if service.uuid == targetServiceUUID {
                if let characteristics = service.characteristics {
                    for characteristic in characteristics where characteristic.uuid == targetCharacteristicUUID {
                        return characteristic
                    }
                }
            }
        }
        return nil
    }

    private func findDescriptor(peripheral: CBPeripheral, serviceUUID: String, characteristicUUID: String, descriptorUUID: String) -> CBDescriptor? {
        guard let characteristic = findCharacteristic(peripheral: peripheral, serviceUUID: serviceUUID, characteristicUUID: characteristicUUID) else {
            return nil
        }

        let targetDescriptorUUID = CBUUID(string: descriptorUUID)

        if let descriptors = characteristic.descriptors {
            for descriptor in descriptors where descriptor.uuid == targetDescriptorUUID {
                return descriptor
            }
        }
        return nil
    }

    private func dataToIntArray(_ data: Data?) -> [Int] {
        guard let data = data else { return [] }
        return data.map { Int($0) }
    }
}

// MARK: - CBCentralManagerDelegate

extension BluetoothLowEnergy: CBCentralManagerDelegate {
    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        // State updated
    }

    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let deviceId = peripheral.identifier.uuidString
        discoveredPeripherals[deviceId] = peripheral

        var device: [String: Any] = [
            "deviceId": deviceId,
            "name": peripheral.name as Any,
            "rssi": RSSI.intValue
        ]

        if let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
            device["manufacturerData"] = manufacturerData.map { String(format: "%02x", $0) }.joined()
        }

        if let serviceUUIDs = advertisementData[CBAdvertisementDataServiceUUIDsKey] as? [CBUUID] {
            device["serviceUuids"] = serviceUUIDs.map { $0.uuidString }
        }

        plugin?.emitDeviceScanned(device: device)
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        let deviceId = peripheral.identifier.uuidString
        connectedPeripherals[deviceId] = peripheral

        let delegate = PeripheralDelegate(ble: self, deviceId: deviceId)
        peripheralDelegates[deviceId] = delegate
        peripheral.delegate = delegate

        connectCallbacks[deviceId]?(nil)
        connectCallbacks.removeValue(forKey: deviceId)

        plugin?.emitDeviceConnected(deviceId: deviceId)
    }

    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        let deviceId = peripheral.identifier.uuidString
        let err = error ?? NSError(domain: "BluetoothLowEnergy", code: 7, userInfo: [NSLocalizedDescriptionKey: "Failed to connect"])
        connectCallbacks[deviceId]?(err)
        connectCallbacks.removeValue(forKey: deviceId)
    }

    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        let deviceId = peripheral.identifier.uuidString
        connectedPeripherals.removeValue(forKey: deviceId)
        peripheralDelegates.removeValue(forKey: deviceId)

        disconnectCallbacks[deviceId]?(error)
        disconnectCallbacks.removeValue(forKey: deviceId)

        plugin?.emitDeviceDisconnected(deviceId: deviceId)
    }
}

// MARK: - CBPeripheralManagerDelegate

extension BluetoothLowEnergy: CBPeripheralManagerDelegate {
    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        // State updated
    }
}

// MARK: - PeripheralDelegate

class PeripheralDelegate: NSObject, CBPeripheralDelegate {
    private weak var ble: BluetoothLowEnergy?
    private let deviceId: String

    init(ble: BluetoothLowEnergy, deviceId: String) {
        self.ble = ble
        self.deviceId = deviceId
        super.init()
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error = error {
            ble?.discoverServicesCallbacks[deviceId]?(error)
            ble?.discoverServicesCallbacks.removeValue(forKey: deviceId)
            return
        }

        // Discover characteristics for all services
        var pendingServices = peripheral.services?.count ?? 0
        if pendingServices == 0 {
            ble?.discoverServicesCallbacks[deviceId]?(nil)
            ble?.discoverServicesCallbacks.removeValue(forKey: deviceId)
            return
        }

        for service in peripheral.services ?? [] {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        // Discover descriptors for all characteristics
        for characteristic in service.characteristics ?? [] {
            peripheral.discoverDescriptors(for: characteristic)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverDescriptorsFor characteristic: CBCharacteristic, error: Error?) {
        // Check if all services have been fully discovered
        var allDiscovered = true
        for service in peripheral.services ?? [] {
            if service.characteristics == nil {
                allDiscovered = false
                break
            }
            for char in service.characteristics ?? [] {
                if char.descriptors == nil {
                    allDiscovered = false
                    break
                }
            }
        }

        if allDiscovered {
            ble?.discoverServicesCallbacks[deviceId]?(nil)
            ble?.discoverServicesCallbacks.removeValue(forKey: deviceId)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        let serviceUUID = characteristic.service?.uuid.uuidString ?? ""
        let characteristicUUID = characteristic.uuid.uuidString
        let key = "\(deviceId)-\(serviceUUID)-\(characteristicUUID)"

        if let callback = ble?.readCharacteristicCallbacks[key] {
            if let error = error {
                callback(.failure(error))
            } else {
                let value = characteristic.value?.map { Int($0) } ?? []
                callback(.success(value))
            }
            ble?.readCharacteristicCallbacks.removeValue(forKey: key)
        } else {
            // This is a notification
            let value = characteristic.value?.map { Int($0) } ?? []
            ble?.plugin?.emitCharacteristicChanged(
                deviceId: deviceId,
                service: serviceUUID,
                characteristic: characteristicUUID,
                value: value
            )
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        let serviceUUID = characteristic.service?.uuid.uuidString ?? ""
        let characteristicUUID = characteristic.uuid.uuidString
        let key = "\(deviceId)-\(serviceUUID)-\(characteristicUUID)"

        ble?.writeCharacteristicCallbacks[key]?(error)
        ble?.writeCharacteristicCallbacks.removeValue(forKey: key)
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        let serviceUUID = characteristic.service?.uuid.uuidString ?? ""
        let characteristicUUID = characteristic.uuid.uuidString
        let key = "\(deviceId)-\(serviceUUID)-\(characteristicUUID)"

        ble?.notifyCallbacks[key]?(error)
        ble?.notifyCallbacks.removeValue(forKey: key)
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor descriptor: CBDescriptor, error: Error?) {
        let serviceUUID = descriptor.characteristic?.service?.uuid.uuidString ?? ""
        let characteristicUUID = descriptor.characteristic?.uuid.uuidString ?? ""
        let descriptorUUID = descriptor.uuid.uuidString
        let key = "\(deviceId)-\(serviceUUID)-\(characteristicUUID)-\(descriptorUUID)"

        if let callback = ble?.readDescriptorCallbacks[key] {
            if let error = error {
                callback(.failure(error))
            } else {
                var value: [Int] = []
                if let data = descriptor.value as? Data {
                    value = data.map { Int($0) }
                }
                callback(.success(value))
            }
            ble?.readDescriptorCallbacks.removeValue(forKey: key)
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor descriptor: CBDescriptor, error: Error?) {
        let serviceUUID = descriptor.characteristic?.service?.uuid.uuidString ?? ""
        let characteristicUUID = descriptor.characteristic?.uuid.uuidString ?? ""
        let descriptorUUID = descriptor.uuid.uuidString
        let key = "\(deviceId)-\(serviceUUID)-\(characteristicUUID)-\(descriptorUUID)"

        ble?.writeDescriptorCallbacks[key]?(error)
        ble?.writeDescriptorCallbacks.removeValue(forKey: key)
    }

    func peripheral(_ peripheral: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) {
        if let callback = ble?.readRssiCallbacks[deviceId] {
            if let error = error {
                callback(.failure(error))
            } else {
                callback(.success(RSSI.intValue))
            }
            ble?.readRssiCallbacks.removeValue(forKey: deviceId)
        }
    }
}
