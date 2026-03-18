import { UsbDeviceManager, UsbDeviceInfo } from "../services/UsbDeviceManager";
import { createComponentLogger } from "../services/Logger";

export class DeviceConnectionService {
  private usbManager: UsbDeviceManager;
  private logger = createComponentLogger("DeviceConnectionService");
  private currentDevice: UsbDeviceInfo | null = null;
  private onConnected?: (device: UsbDeviceInfo) => void;
  private onDisconnected?: (device: UsbDeviceInfo) => void;

  constructor(usbManager: UsbDeviceManager) {
    this.usbManager = usbManager;
    this.usbManager.onDeviceConnected((device) => {
      this.currentDevice = device;
      this.logger.info("Device connected", device);
      if (this.onConnected) this.onConnected(device);
    });
    this.usbManager.onDeviceDisconnected((device) => {
      if (
        this.currentDevice &&
        this.currentDevice.vendorId === device.vendorId &&
        this.currentDevice.productId === device.productId
      ) {
        this.logger.info("Device disconnected", device);
        if (this.onDisconnected) this.onDisconnected(device);
        this.currentDevice = null;
      }
    });
  }

  setOnConnected(cb: (device: UsbDeviceInfo) => void) {
    this.onConnected = cb;
  }
  setOnDisconnected(cb: (device: UsbDeviceInfo) => void) {
    this.onDisconnected = cb;
  }

  async connectDevice(): Promise<UsbDeviceInfo | null> {
    const devices = await this.usbManager.scanForP6Devices();
    if (devices.length > 0) {
      this.currentDevice = devices[0];
      this.logger.info("Connected to device", this.currentDevice);
      if (this.onConnected) this.onConnected(this.currentDevice);
      return this.currentDevice;
    }
    return null;
  }

  async disconnectDevice(): Promise<void> {
    if (this.currentDevice) {
      this.logger.info("Disconnecting device", this.currentDevice);
      if (this.onDisconnected) this.onDisconnected(this.currentDevice);
      this.currentDevice = null;
    }
  }

  async detectAndConnectDevice(): Promise<UsbDeviceInfo | null> {
    this.logger.info("Scanning for P6 devices...");
    const devices = await this.usbManager.scanForP6Devices();
    if (devices.length > 0) {
      this.logger.info("Found P6 USB device(s)", devices);
      this.currentDevice = devices[0];
      this.logger.info("Connected to device", this.currentDevice);
      if (this.onConnected) this.onConnected(this.currentDevice);
      return this.currentDevice;
    }
    // Check for mass storage mode
    const massStorageInfo = await this.usbManager.checkP6MassStorageMode();
    if (massStorageInfo) {
      this.logger.info("Found P6 mass storage mode", massStorageInfo);
      const virtualDevice: UsbDeviceInfo = {
        vendorId: 0x0582,
        productId: 0x0300,
        path: massStorageInfo.path,
      };
      this.currentDevice = virtualDevice;
      if (this.onConnected) this.onConnected(this.currentDevice);
      return this.currentDevice;
    }
    return null;
  }

}
