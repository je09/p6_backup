import { DeviceStatus, DeviceMode, PatternInfo, SampleBankData } from "../types/index";
import { DEVICE_CONSTANTS } from "../constants";
import {
  DEVICE_STATUS,
  DEVICE_MODES,
  MASS_STORAGE_MODE_MAP,
} from "../constants/device";
import {
  UsbDeviceManager,
  type UsbDeviceInfo,
  type P6MassStorageInfo,
} from "../services/UsbDeviceManager";
import {
  ModeDetector,
  type ModeDetectionResult,
  type ModeDetectionConfig,
} from "../services/ModeDetector";
import { FileSystemService } from "../services/FileSystemService";
import { DeviceConnectionService } from "../services/DeviceConnectionService";
import { DeviceDataService } from "../services/DeviceDataService";
import { IDeviceConnection } from "../services/interfaces";
import * as usb from "usb";

import * as fs from "fs";

export interface DeviceInfoResult {
  status: DeviceStatus;
  deviceInfo: UsbDeviceInfo | null;
  massStorageInfo: P6MassStorageInfo | null;
  modeDetection: {
    lastResult: ModeDetectionResult | null;
    config: ModeDetectionConfig;
    instructions: string[];
  };
  capabilities: {
    patterns: boolean;
    samples: boolean;
    realtime: boolean;
    massStorage: boolean;
    memoryCard: boolean;
  };
  health: {
    success: boolean;
    errors: string[];
    warnings: string[];
  };
}

export class P6Device implements IDeviceConnection {
  private status: DeviceStatus;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private autoDetectionInterval: NodeJS.Timeout | null = null;
  private usbManager: UsbDeviceManager;
  private modeDetector: ModeDetector;
  private currentDevice: UsbDeviceInfo | null = null;
  private massStorageInfo: P6MassStorageInfo | null = null;
  private lastModeDetectionResult: ModeDetectionResult | null = null;
  private fileSystemService: FileSystemService;
  private connectionService: DeviceConnectionService;
  private dataService: DeviceDataService;
  private onStatusChangedCallback?: (status: DeviceStatus) => void;

  constructor(
    usbManager?: UsbDeviceManager,
    modeDetector?: ModeDetector,
    fileSystemService?: FileSystemService,
    connectionService?: DeviceConnectionService,
    dataService?: DeviceDataService
  ) {
    this.status = { ...DEVICE_STATUS.INITIAL };
    this.fileSystemService = fileSystemService ?? new FileSystemService();
    this.usbManager = usbManager ?? new UsbDeviceManager();
    this.modeDetector = modeDetector ?? new ModeDetector(this.usbManager, {
      logLevel: "info",
      enableAutoRetry: true,
    });
    this.connectionService = connectionService ?? new DeviceConnectionService(this.usbManager);
    this.connectionService.setOnConnected((device) =>
      this.handleDeviceConnected(device)
    );
    this.connectionService.setOnDisconnected((device) =>
      this.handleDeviceDisconnected(device)
    );
    this.dataService = dataService ?? new DeviceDataService(
      this.fileSystemService,
      () => this.status,
      () => this.massStorageInfo
    );
    this.startAutoDetection();
  }

  onStatusChanged(callback: (status: DeviceStatus) => void): void {
    this.onStatusChangedCallback = callback;
  }

  configureModeDetection(config: Partial<ModeDetectionConfig>): void {
    this.modeDetector.updateConfig(config);
  }

  getModeDetectionConfig(): ModeDetectionConfig {
    return this.modeDetector.getConfig();
  }

  getLastModeDetectionResult(): ModeDetectionResult | null {
    return this.lastModeDetectionResult;
  }

  private notifyStatusChanged(): void {
    if (this.onStatusChangedCallback) {
      this.onStatusChangedCallback(this.getStatus());
    }
  }

  private async handleDeviceConnected(device: UsbDeviceInfo): Promise<void> {
    try {
      this.currentDevice = device;
      this.status.connected = true;
      this.status.lastSeen = new Date();
      this.status.mode = await this.detectCurrentMode();
      this.startConnectionMonitoring();
      this.stopAutoDetection();
      this.notifyStatusChanged();
    } catch (error) {
      this.status.connected = false;
      this.status.mode = DEVICE_MODES.UNKNOWN;
      this.currentDevice = null;
      this.massStorageInfo = null;
      this.lastModeDetectionResult = null;
      this.notifyStatusChanged();
      this.startAutoDetection();
    }
  }

  private async handleDeviceDisconnected(device: UsbDeviceInfo): Promise<void> {
    if (
      this.currentDevice &&
      this.currentDevice.vendorId === device.vendorId &&
      this.currentDevice.productId === device.productId
    ) {
      this.stopConnectionMonitoring();
      this.status.connected = false;
      this.status.mode = DEVICE_MODES.UNKNOWN;
      this.currentDevice = null;
      this.massStorageInfo = null;
      this.lastModeDetectionResult = null;
      this.notifyStatusChanged();
      this.startAutoDetection();
    }
  }

  private mapMassStorageMode(mode: string): DeviceMode {
    return (
      MASS_STORAGE_MODE_MAP[mode as keyof typeof MASS_STORAGE_MODE_MAP] || DEVICE_MODES.UNKNOWN
    );
  }

  private async detectCurrentMode(): Promise<DeviceMode> {
    try {
      const detectionResult = await this.modeDetector.detectMode();
      this.lastModeDetectionResult = detectionResult;
      if (detectionResult.massStorageInfo) {
        this.massStorageInfo = detectionResult.massStorageInfo;
      }
      return detectionResult.mode;
    } catch (error) {
      return DEVICE_MODES.UNKNOWN;
    }
  }

  private async detectCurrentModeQuick(): Promise<DeviceMode> {
    try {
      const detectionResult = await this.modeDetector.detectModeQuick();
      this.lastModeDetectionResult = detectionResult;
      if (detectionResult.massStorageInfo) {
        this.massStorageInfo = detectionResult.massStorageInfo;
      }
      return detectionResult.mode;
    } catch (error) {
      return DEVICE_MODES.UNKNOWN;
    }
  }

  async connect(): Promise<boolean> {
    try {
      if (this.status.connected) {
        return true;
      }
      this.stopAutoDetection();
      const device = await this.connectionService.connectDevice();
      if (device) {
        await this.handleDeviceConnected(device);
        return true;
      } else {
        this.stopConnectionMonitoring();
        this.status.connected = false;
        this.status.mode = DEVICE_MODES.UNKNOWN;
        this.notifyStatusChanged();
        this.startAutoDetection();
        return false;
      }
    } catch (error) {
      this.startAutoDetection();
      return false;
    }
  }

  async isReady(): Promise<boolean> {
    if (!this.status.connected) {
      const device = await this.connectionService.connectDevice();
      if (!device) {
        return false;
      }
      await this.handleDeviceConnected(device);
    }
    this.status.mode = await this.detectCurrentModeQuick();
    this.notifyStatusChanged();
    if (!this.status.connected) {
      return false;
    }
    return await this.performReadinessCheck();
  }

  getStatus(): DeviceStatus {
    return { ...this.status };
  }

  async getDeviceInfo(): Promise<DeviceInfoResult> {
    return {
      status: this.getStatus(),
      deviceInfo: this.currentDevice,
      massStorageInfo: this.massStorageInfo,
      modeDetection: {
        lastResult: this.lastModeDetectionResult,
        config: this.modeDetector.getConfig(),
        instructions: this.modeDetector.getModeInstructions(this.status.mode),
      },
      capabilities: {
        patterns: true,
        samples: true,
        realtime: false,
        massStorage: true,
        memoryCard: false,
      },
      health: {
        success: await this.performReadinessCheck(),
        errors: [],
        warnings: [],
      },
    };
  }

  getCurrentMode(): DeviceMode {
    return this.status.mode;
  }

  async detect(): Promise<boolean> {
    return await this.connect();
  }

  getCurrentBanks(): string[] | null {
    if (this.massStorageInfo && this.massStorageInfo.banks) {
      return this.massStorageInfo.banks;
    }
    return null;
  }

  getCurrentBank(): string | null {
    if (this.massStorageInfo && this.massStorageInfo.currentBank) {
      return this.massStorageInfo.currentBank;
    }
    return null;
  }

  hasBankInfo(): boolean {
    return (
      this.massStorageInfo !== null &&
      (this.massStorageInfo.banks !== undefined ||
        this.massStorageInfo.currentBank !== undefined)
    );
  }

  async ejectDevice(): Promise<boolean> {
    this.status.connected = false;
    this.status.mode = DEVICE_MODES.UNKNOWN;
    this.currentDevice = null;
    this.massStorageInfo = null;
    this.lastModeDetectionResult = null;
    this.stopConnectionMonitoring();
    this.notifyStatusChanged();
    this.startAutoDetection();
    return true;
  }

  async readData(dataType: string, parameters?: { bankId?: string }): Promise<PatternInfo[] | SampleBankData> {
    return this.dataService.readData(dataType, parameters);
  }

  async writeData(
    dataType: string,
    data: PatternInfo[] | SampleBankData | string,
    parameters?: { bankId?: string; bankPath?: string }
  ): Promise<boolean> {
    return this.dataService.writeData(dataType, data, parameters);
  }

  async detectMode(): Promise<DeviceMode> {
    return this.detectCurrentMode();
  }

  async retryModeDetection(): Promise<DeviceMode> {
    const detectionResult = await this.modeDetector.detectMode();
    this.lastModeDetectionResult = detectionResult;
    if (detectionResult.massStorageInfo) {
      this.massStorageInfo = detectionResult.massStorageInfo;
    }
    this.status.mode = detectionResult.mode;
    this.notifyStatusChanged();
    return detectionResult.mode;
  }

  async refreshModeDetection(): Promise<DeviceMode> {
    const detectionResult = await this.modeDetector.refreshAndDetect();
    this.lastModeDetectionResult = detectionResult;
    if (detectionResult.massStorageInfo) {
      this.massStorageInfo = detectionResult.massStorageInfo;
    }
    this.status.mode = detectionResult.mode;
    this.notifyStatusChanged();
    return detectionResult.mode;
  }

  async validateModeStability(checkCount: number = 3): Promise<boolean> {
    if (this.status.mode === DEVICE_MODES.UNKNOWN) {
      return false;
    }
    return this.modeDetector.validateModeStability(
      this.status.mode,
      checkCount
    );
  }

  private async performReadinessCheck(): Promise<boolean> {
    try {
      if (!this.status.connected) {
        return false;
      }
      if (this.massStorageInfo) {
        try {
          const stat = await fs.promises.stat(this.massStorageInfo.path);
          return stat.isDirectory();
        } catch {
          return false;
        }
      }
      if (this.currentDevice) {
        const devices = await this.usbManager.scanForP6Devices();
        return devices.some(
          (d) =>
            d.vendorId === this.currentDevice!.vendorId &&
            d.productId === this.currentDevice!.productId
        );
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  private startConnectionMonitoring(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
    this.connectionCheckInterval = setInterval(async () => {
      try {
        const stillConnected = await this.checkConnection();
        if (!stillConnected) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const retryConnected = await this.checkConnection();
          if (!retryConnected) {
            this.status.connected = false;
            this.stopConnectionMonitoring();
            this.notifyStatusChanged();
            setTimeout(
              () => this.startAutoDetection(),
              DEVICE_CONSTANTS.RECONNECTION_DELAY
            );
          }
        } else {
          this.status.lastSeen = new Date();
        }
      } catch (error) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          const retryConnected = await this.checkConnection();
          if (!retryConnected) {
            this.status.connected = false;
            this.stopConnectionMonitoring();
            this.notifyStatusChanged();
            setTimeout(
              () => this.startAutoDetection(),
              DEVICE_CONSTANTS.RECONNECTION_DELAY
            );
          }
        } catch (retryError) {
          this.status.connected = false;
          this.stopConnectionMonitoring();
          this.notifyStatusChanged();
          setTimeout(
            () => this.startAutoDetection(),
            DEVICE_CONSTANTS.RECONNECTION_DELAY
          );
        }
      }
    }, DEVICE_CONSTANTS.CONNECTION_CHECK_INTERVAL);
  }

  private stopConnectionMonitoring(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  private startAutoDetection(): void {
    if (this.autoDetectionInterval) {
      clearInterval(this.autoDetectionInterval);
    }
    this.connectionService.connectDevice();
    this.autoDetectionInterval = setInterval(async () => {
      await this.connectionService.connectDevice();
    }, DEVICE_CONSTANTS.AUTO_DETECTION_INTERVAL);
  }

  private stopAutoDetection(): void {
    if (this.autoDetectionInterval) {
      clearInterval(this.autoDetectionInterval);
      this.autoDetectionInterval = null;
    }
  }

  private async checkConnection(): Promise<boolean> {
    try {
      if (this.massStorageInfo) {
        try {
          const stat = await fs.promises.stat(this.massStorageInfo.path);
          if (!stat.isDirectory()) return false;
          const current = await this.usbManager.checkP6MassStorageMode();
          if (!current) return false;
          this.massStorageInfo = current;
          this.status.mode = this.mapMassStorageMode(current.mode);
          return true;
        } catch {
          return false;
        }
      }
      if (this.currentDevice) {
        try {
          const usbDevices = usb.getDeviceList();
          return usbDevices.some(
            (d: usb.Device) =>
              d.deviceDescriptor.idVendor === this.currentDevice?.vendorId &&
              d.deviceDescriptor.idProduct === this.currentDevice?.productId
          );
        } catch {
          return false;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  dispose(): void {
    this.stopAutoDetection();
    this.stopConnectionMonitoring();
    this.usbManager.dispose();
  }
}
