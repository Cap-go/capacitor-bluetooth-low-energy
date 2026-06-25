import Foundation
import CoreBluetooth

// swiftlint:disable type_body_length file_length function_parameter_count for_where
public class BluetoothLowEnergy: NSObject {
    fileprivate weak var plugin: BluetoothLowEnergyPlugin?
    private var centralManager: CBCentralManager?
    private var peripheralManager: CBPeripheralManager?
    private var localGattServices: [CBUUID: CBMutableService] = [:]
    private var localGattCharacteristics: [String: CBMutableCharacteristic] = [:]
    private var connectedCentrals: [String: CBCentral] = [:]

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

    func initialize(mode: String, showPowerAlert: Bool, completion: @escaping (Error?) -> Void) {
        self.mode = mode

        if mode == "peripheral" {
            let options: [String: Any] = [
                CBPeripheralManagerOptionShowPowerAlertKey: showPowerAlert
            ]
            peripheralManager = CBPeripheralManager(delegate: self, queue: nil, options: options)
        } else {
            let options: [String: Any] = [
                CBCentralManagerOptionShowPowerAlertKey: showPowerAlert
            ]
            centralManager = CBCentralManager(delegate: self, queue: nil, options: options)
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

    func addGattService(serviceUUID: String, characteristics: [[String: Any]], completion: @escaping (Error?) -> Void) {
        guard mode == "peripheral" else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 1, userInfo: [NSLocalizedDescriptionKey: "GATT server is only available in peripheral mode"]))
            return
        }
        guard let peripheralManager = peripheralManager else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 2, userInfo: [NSLocalizedDescriptionKey: "Peripheral manager not initialized"]))
            return
        }
        guard peripheralManager.state == .poweredOn else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 3, userInfo: [NSLocalizedDescriptionKey: "Bluetooth is not powered on"]))
            return
        }

        let serviceId = CBUUID(string: serviceUUID)
        if localGattServices[serviceId] != nil {
            completion(NSError(domain: "BluetoothLowEnergy", code: 4, userInfo: [NSLocalizedDescriptionKey: "Service already exists"]))
            return
        }

        var mutableCharacteristics: [CBMutableCharacteristic] = []
        for characteristicDef in characteristics {
            guard let characteristicUUID = characteristicDef["uuid"] as? String,
                  let propertiesDict = characteristicDef["properties"] as? [String: Bool] else {
                completion(NSError(domain: "BluetoothLowEnergy", code: 5, userInfo: [NSLocalizedDescriptionKey: "Invalid characteristic definition"]))
                return
            }

            var properties: CBCharacteristicProperties = []
            if propertiesDict["broadcast"] == true { properties.insert(.broadcast) }
            if propertiesDict["read"] == true { properties.insert(.read) }
            if propertiesDict["writeWithoutResponse"] == true { properties.insert(.writeWithoutResponse) }
            if propertiesDict["write"] == true { properties.insert(.write) }
            if propertiesDict["notify"] == true { properties.insert(.notify) }
            if propertiesDict["indicate"] == true { properties.insert(.indicate) }
            if propertiesDict["authenticatedSignedWrites"] == true { properties.insert(.authenticatedSignedWrites) }
            if propertiesDict["extendedProperties"] == true { properties.insert(.extendedProperties) }

            var permissions: CBAttributePermissions = []
            if propertiesDict["read"] == true { permissions.insert(.readable) }
            if propertiesDict["write"] == true || propertiesDict["writeWithoutResponse"] == true { permissions.insert(.writeable) }

            let characteristic = CBMutableCharacteristic(type: CBUUID(string: characteristicUUID), properties: properties, value: nil, permissions: permissions)
            if let value = characteristicDef["value"] as? [Int] {
                characteristic.value = Data(value.map { UInt8(truncatingIfNeeded: $0) })
            }

            if properties.contains(.notify) || properties.contains(.indicate) {
                let ccc = CBMutableDescriptor(type: CBUUID(string: "2902"), value: Data())
                characteristic.descriptors = [ccc]
            }

            if let descriptors = characteristicDef["descriptors"] as? [[String: Any]] {
                var mutableDescriptors = characteristic.descriptors ?? []
                for descriptorDef in descriptors {
                    guard let descriptorUUID = descriptorDef["uuid"] as? String else { continue }
                    let descriptorValue: Data
                    if let value = descriptorDef["value"] as? [Int] {
                        descriptorValue = Data(value.map { UInt8(truncatingIfNeeded: $0) })
                    } else {
                        descriptorValue = Data()
                    }
                    mutableDescriptors.append(CBMutableDescriptor(type: CBUUID(string: descriptorUUID), value: descriptorValue))
                }
                characteristic.descriptors = mutableDescriptors
            }

            localGattCharacteristics[characteristicKey(serviceUUID: serviceUUID, characteristicUUID: characteristicUUID)] = characteristic
            mutableCharacteristics.append(characteristic)
        }

        let service = CBMutableService(type: serviceId, primary: true)
        service.characteristics = mutableCharacteristics
        localGattServices[serviceId] = service
        peripheralManager.add(service)
        completion(nil)
    }

    func removeGattService(serviceUUID: String, completion: @escaping (Error?) -> Void) {
        guard let peripheralManager = peripheralManager else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 1, userInfo: [NSLocalizedDescriptionKey: "Peripheral manager not initialized"]))
            return
        }
        let serviceId = CBUUID(string: serviceUUID)
        guard let service = localGattServices.removeValue(forKey: serviceId) else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 2, userInfo: [NSLocalizedDescriptionKey: "Service not found"]))
            return
        }
        localGattCharacteristics = localGattCharacteristics.filter { !$0.key.hasPrefix(serviceUUID + "/") }
        peripheralManager.remove(service)
        completion(nil)
    }

    func setGattCharacteristicValue(serviceUUID: String, characteristicUUID: String, value: [Int], completion: @escaping (Error?) -> Void) {
        guard let characteristic = localGattCharacteristics[characteristicKey(serviceUUID: serviceUUID, characteristicUUID: characteristicUUID)] else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 1, userInfo: [NSLocalizedDescriptionKey: "Characteristic not found"]))
            return
        }
        characteristic.value = Data(value.map { UInt8(truncatingIfNeeded: $0) })
        completion(nil)
    }

    func notifyGattCharacteristicChanged(serviceUUID: String, characteristicUUID: String, value: [Int], deviceId: String?, completion: @escaping (Error?) -> Void) {
        guard let peripheralManager = peripheralManager else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 1, userInfo: [NSLocalizedDescriptionKey: "Peripheral manager not initialized"]))
            return
        }
        guard let characteristic = localGattCharacteristics[characteristicKey(serviceUUID: serviceUUID, characteristicUUID: characteristicUUID)] else {
            completion(NSError(domain: "BluetoothLowEnergy", code: 2, userInfo: [NSLocalizedDescriptionKey: "Characteristic not found"]))
            return
        }
        let data = Data(value.map { UInt8(truncatingIfNeeded: $0) })
        characteristic.value = data
        let centrals: [CBCentral]
        if let deviceId = deviceId, let central = connectedCentrals[deviceId] {
            centrals = [central]
        } else {
            centrals = Array(connectedCentrals.values)
        }
        let indicate = characteristic.properties.contains(.indicate)
        let success = peripheralManager.updateValue(data, for: characteristic, onSubscribedCentrals: centrals.isEmpty ? nil : centrals)
        if !success && !centrals.isEmpty {
            completion(NSError(domain: "BluetoothLowEnergy", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to notify characteristic change"]))
            return
        }
        _ = indicate
        completion(nil)
    }

    private func trackCentralConnection(_ central: CBCentral) {
        let deviceId = central.identifier.uuidString
        if connectedCentrals[deviceId] == nil {
            connectedCentrals[deviceId] = central
            plugin?.emitCentralConnected(deviceId: deviceId)
        }
    }

    private func characteristicKey(serviceUUID: String, characteristicUUID: String) -> String {
        return "\(serviceUUID)/\(characteristicUUID)"
    }

    private func characteristicInfo(for characteristic: CBMutableCharacteristic) -> (service: String, characteristic: String)? {
        for (key, value) in localGattCharacteristics where value === characteristic {
            let parts = key.split(separator: "/", maxSplits: 1).map(String.init)
            if parts.count == 2 {
                return (parts[0], parts[1])
            }
        }
        return nil
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

        let name = (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? peripheral.name
        var device: [String: Any] = [
            "deviceId": deviceId,
            "name": name as Any,
            "rssi": RSSI.intValue
        ]

        if let manufacturerData = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data {
            device["manufacturerData"] = manufacturerData.map { String(format: "%02x", $0) }.joined()
        } else if let manufacturerDict = advertisementData[CBAdvertisementDataManufacturerDataKey] as? [NSNumber: Data],
                  let entry = manufacturerDict.first {
            var data = Data()
            var companyId = entry.key.uint16Value.littleEndian
            withUnsafeBytes(of: &companyId) { data.append(contentsOf: $0) }
            data.append(entry.value)
            device["manufacturerData"] = data.map { String(format: "%02x", $0) }.joined()
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

    public func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        let deviceId = central.identifier.uuidString
        let wasConnected = connectedCentrals[deviceId] != nil
        connectedCentrals[deviceId] = central
        if !wasConnected {
            plugin?.emitCentralConnected(deviceId: deviceId)
        }
    }

    public func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        let deviceId = central.identifier.uuidString
        connectedCentrals.removeValue(forKey: deviceId)
        plugin?.emitCentralDisconnected(deviceId: deviceId)
    }

    public func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        guard let mutableCharacteristic = request.characteristic as? CBMutableCharacteristic else {
            peripheral.respond(to: request, withResult: .attributeNotFound)
            return
        }

        trackCentralConnection(request.central)
        if let info = characteristicInfo(for: mutableCharacteristic) {
            plugin?.emitGattCharacteristicReadRequest(
                deviceId: request.central.identifier.uuidString,
                service: info.service,
                characteristic: info.characteristic
            )
        }

        request.value = mutableCharacteristic.value
        peripheral.respond(to: request, withResult: .success)
    }

    public func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            guard let mutableCharacteristic = request.characteristic as? CBMutableCharacteristic else {
                peripheral.respond(to: request, withResult: .attributeNotFound)
                continue
            }

            trackCentralConnection(request.central)
            if let value = request.value {
                mutableCharacteristic.value = value
                if let info = characteristicInfo(for: mutableCharacteristic) {
                    plugin?.emitGattCharacteristicWriteRequest(
                        deviceId: request.central.identifier.uuidString,
                        service: info.service,
                        characteristic: info.characteristic,
                        value: value.map { Int($0) }
                    )
                }
            }

            if request.characteristic.properties.contains(.write) {
                peripheral.respond(to: request, withResult: .success)
            }
        }
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
