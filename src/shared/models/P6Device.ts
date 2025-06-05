import { DeviceStatus, DeviceMode, ConnectionType } from "../types/index";
import { DEVICE_CONSTANTS } from "../constants";
import { ERROR_MESSAGES } from "../constants/messages";
import { LOG_MESSAGES } from "../constants/log";
import {
  DEVICE_STATUS,
  DEVICE_DETAILS,
  FILE_PATTERNS,
  DEVICE_MODES,
  DATA_TYPES,
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
import { createComponentLogger } from "../services/Logger";

export class P6Device {
  private status: DeviceStatus;
  private connectionCheckInterval: any = null;
  private autoDetectionInterval: any = null;
  private usbManager: UsbDeviceManager;
  private modeDetector: ModeDetector;
  private currentDevice: UsbDeviceInfo | null = null;
  private massStorageInfo: P6MassStorageInfo | null = null;
  private lastModeDetectionResult: ModeDetectionResult | null = null;
  private logger = createComponentLogger("P6Device");
  // Add callback for status change notifications
  private onStatusChangedCallback?: (status: DeviceStatus) => void;

  constructor() {
    this.status = { ...DEVICE_STATUS.INITIAL };

    this.usbManager = new UsbDeviceManager();
    this.modeDetector = new ModeDetector(this.usbManager, {
      logLevel: "info",
      enableAutoRetry: true,
    });
    this.setupUsbEventHandlers();

    // Start automatic device detection
    this.startAutoDetection();
  }

  // Add method to register status change callback
  onStatusChanged(callback: (status: DeviceStatus) => void): void {
    this.onStatusChangedCallback = callback;
  }

  // Configure mode detection behavior
  configureModeDetection(config: Partial<ModeDetectionConfig>): void {
    this.modeDetector.updateConfig(config);
  }

  // Get mode detection configuration
  getModeDetectionConfig(): ModeDetectionConfig {
    return this.modeDetector.getConfig();
  }

  // Get last mode detection result
  getLastModeDetectionResult(): ModeDetectionResult | null {
    return this.lastModeDetectionResult;
  }

  // Add private method to notify status changes
  private notifyStatusChanged(): void {
    if (this.onStatusChangedCallback) {
      this.onStatusChangedCallback(this.getStatus());
    }
  }

  private setupUsbEventHandlers(): void {
    this.usbManager.onDeviceConnected((device) => {
      this.logger.info(LOG_MESSAGES.DEVICE_CONNECTED, device);
      this.handleDeviceConnected(device);
    });

    this.usbManager.onDeviceDisconnected((device) => {
      this.logger.info(LOG_MESSAGES.DEVICE_DISCONNECTED, device);
      this.handleDeviceDisconnected(device);
    });
  }

  private async handleDeviceConnected(device: UsbDeviceInfo): Promise<void> {
    try {
      this.currentDevice = device;
      this.status.connected = true;
      this.status.deviceId = await this.getDeviceId();
      this.status.firmwareVersion = await this.getFirmwareVersion();
      this.status.mode = await this.getCurrentDeviceMode();
      this.status.lastSeen = new Date();
      this.startConnectionMonitoring();
      this.stopAutoDetection();
      this.notifyStatusChanged();
      this.logger.info(LOG_MESSAGES.DEVICE_READY);
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.ERROR_CONNECTING,
        undefined,
        error as Error
      );
      this.disconnect();
    }
  }

  private async handleDeviceDisconnected(device: UsbDeviceInfo): Promise<void> {
    if (
      this.currentDevice &&
      this.currentDevice.vendorId === device.vendorId &&
      this.currentDevice.productId === device.productId
    ) {
      this.logger.info(LOG_MESSAGES.CURRENT_DEVICE_DISCONNECTED);

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
    this.logger.info(LOG_MESSAGES.MAPPING_MASS_STORAGE_MODE, mode);
    return (
      MASS_STORAGE_MODE_MAP[mode as keyof typeof MASS_STORAGE_MODE_MAP] ||
      DEVICE_MODES.UNKNOWN
    );
  }

  /**
   * Enhanced mode detection using the new ModeDetector
   */
  private async detectCurrentMode(): Promise<DeviceMode> {
    try {
      this.logger.info("Starting enhanced mode detection...");

      const detectionResult = await this.modeDetector.detectMode();
      this.lastModeDetectionResult = detectionResult;

      // Update mass storage info from detection result
      if (detectionResult.massStorageInfo) {
        this.massStorageInfo = detectionResult.massStorageInfo;
      }

      this.logger.info(
        `Mode detection complete: ${detectionResult.mode} (${detectionResult.confidence} confidence, method: ${detectionResult.detectionMethod})`
      );

      if (detectionResult.massStorageInfo?.banks) {
        this.logger.info(
          LOG_MESSAGES.BANK_INFORMATION,
          detectionResult.massStorageInfo.banks
        );
      }

      // Handle unknown mode with helpful guidance
      if (detectionResult.mode === DEVICE_MODES.UNKNOWN) {
        this.handleUnknownModeDetection(detectionResult);
      }

      return detectionResult.mode;
    } catch (error) {
      this.logger.error(
        "Enhanced mode detection failed",
        undefined,
        error as Error
      );
      return DEVICE_MODES.UNKNOWN;
    }
  }

  /**
   * Quick mode detection without retry logic
   */
  private async detectCurrentModeQuick(): Promise<DeviceMode> {
    try {
      const detectionResult = await this.modeDetector.detectModeQuick();
      this.lastModeDetectionResult = detectionResult;

      if (detectionResult.massStorageInfo) {
        this.massStorageInfo = detectionResult.massStorageInfo;
      }

      return detectionResult.mode;
    } catch (error) {
      this.logger.error(
        "Quick mode detection failed",
        undefined,
        error as Error
      );
      return DEVICE_MODES.UNKNOWN;
    }
  }

  /**
   * Handle unknown mode detection with user guidance
   */
  private handleUnknownModeDetection(result: ModeDetectionResult): void {
    this.logger.warn("Device detected but mode unknown. This could mean:");
    this.logger.warn("- Device just connected and is still initializing");
    this.logger.warn("- Device is not in a supported backup/restore mode");
    this.logger.warn("- Device folders are not accessible or missing");

    if (result.failureReason) {
      this.logger.warn(`Failure reason: ${result.failureReason}`);
    }

    this.logger.warn("Manual mode switch may be required:");
    const instructions = this.modeDetector.getModeInstructions("unknown");
    instructions.forEach((instruction) =>
      this.logger.warn(`  • ${instruction}`)
    );
  }

  async connect(): Promise<boolean> {
    this.logger.info(LOG_MESSAGES.ATTEMPTING_CONNECTION);
    try {
      // First check if device is already connected
      if (this.status.connected) {
        this.logger.info(LOG_MESSAGES.ALREADY_CONNECTED);
        return true;
      }

      // Stop auto-detection while connecting manually
      this.stopAutoDetection();

      const detected = await this.performDeviceDetection();
      if (detected) {
        const device = this.currentDevice!;
        await this.handleDeviceConnected(device);
        this.status.deviceId = await this.getDeviceId();
        this.status.firmwareVersion = await this.getFirmwareVersion();
        this.status.mode = await this.getCurrentDeviceMode();
        this.status.lastSeen = new Date();
        this.startConnectionMonitoring();
        this.stopAutoDetection();
        this.notifyStatusChanged();
        return true;
      } else {
        // Restart auto-detection if manual connection failed
        this.stopConnectionMonitoring();
        this.status.connected = false;
        this.status.mode = DEVICE_MODES.UNKNOWN;
        this.notifyStatusChanged();
        this.startAutoDetection();
        return false;
      }
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.CONNECTION_FAILED,
        undefined,
        error as Error
      );
      // Restart auto-detection on connection failure
      this.startAutoDetection();
      return false;
    }
  }

  async isReady(): Promise<boolean> {
    // First check current connection status
    if (!this.status.connected) {
      this.logger.info("Device not connected, attempting to re-detect...");
      // Try to reconnect if not connected
      const detected = await this.performDeviceDetection();
      if (!detected) {
        return false;
      }
    }

    try {
      // Add a small delay to allow status to stabilize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Use quick mode detection for readiness check to avoid long delays
      this.status.mode = await this.detectCurrentModeQuick();
      this.notifyStatusChanged();

      // Double-check connection status after mode detection
      if (!this.status.connected) {
        this.logger.info("Device disconnected during readiness check");
        return false;
      }

      return await this.performReadinessCheck();
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.READINESS_CHECK_FAILED,
        undefined,
        error as Error
      );
      return false;
    }
  }

  getStatus(): DeviceStatus {
    return { ...this.status };
  }

  async getDeviceInfo(): Promise<any> {
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

  // Missing methods called from main.ts
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

  async readData(dataType: string, parameters?: any): Promise<any> {
    if (!this.status.connected) {
      throw new Error(ERROR_MESSAGES.DEVICE_NOT_CONNECTED);
    }

    if (!this.massStorageInfo) {
      throw new Error(ERROR_MESSAGES.MASS_STORAGE_NOT_AVAILABLE);
    }

    this.logger.info(LOG_MESSAGES.READING_DATA, { dataType, parameters });

    try {
      const mode = await this.getCurrentDeviceMode();
      switch (dataType) {
        case DATA_TYPES.PATTERNS:
          return await this.readPatternData();
        case DATA_TYPES.SAMPLES:
          return await this.readSampleData(parameters?.bankId);
        default:
          throw new Error(ERROR_MESSAGES.UNKNOWN_DATA_TYPE(dataType));
      }
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.FAILED_TO_READ_DATA(dataType),
        undefined,
        error as Error
      );
      throw error;
    }
  }

  private async readPatternData(): Promise<any[]> {
    if (!this.massStorageInfo) {
      throw new Error(ERROR_MESSAGES.MASS_STORAGE_NOT_AVAILABLE);
    }

    const { promises: fs } = require("fs");
    const path = require("path");

    try {
      // P6 patterns are stored in BACKUP folder during pattern export
      const backupPath = path.join(
        this.massStorageInfo.path,
        FILE_PATTERNS.BACKUP_FOLDER
      );
      const files = await fs.readdir(backupPath);

      // Filter for pattern files with naming convention P6_PTN{bank}-{pattern}.PRM
      const patternFiles = files.filter(
        (file: string) =>
          file.startsWith(FILE_PATTERNS.PATTERN_PREFIX) &&
          file.endsWith(FILE_PATTERNS.PATTERN_EXTENSION)
      );

      const patterns = [];
      for (const file of patternFiles) {
        const match = file.match(FILE_PATTERNS.PATTERN_REGEX);
        if (match) {
          const bankNumber = parseInt(match[1]);
          const patternNumber = parseInt(match[2]);
          patterns.push({
            id: `${bankNumber}-${patternNumber}`,
            bank: bankNumber,
            pattern: patternNumber,
            name: file.replace(FILE_PATTERNS.PATTERN_EXTENSION, ""),
            path: path.join(backupPath, file),
            size: (await fs.stat(path.join(backupPath, file))).size,
          });
        }
      }

      this.logger.info(LOG_MESSAGES.FOUND_PATTERNS(patterns.length));
      return patterns;
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.FAILED_TO_READ_PATTERNS,
        undefined,
        error as Error
      );
      return [];
    }
  }

  private async readSampleData(bankId?: string): Promise<any> {
    if (!this.massStorageInfo) {
      throw new Error(ERROR_MESSAGES.MASS_STORAGE_NOT_AVAILABLE);
    }

    const { promises: fs } = require("fs");
    const path = require("path");

    try {
      // P6 samples are stored in EXPORT/BANK_X/PAD_X folders during sample export
      const exportPath = path.join(
        this.massStorageInfo.path,
        FILE_PATTERNS.EXPORT_FOLDER
      );

      if (bankId) {
        // Read specific bank
        const bankPath = path.join(
          exportPath,
          `${FILE_PATTERNS.BANK_PREFIX}${bankId.toUpperCase()}`
        );
        const samples = await this.readBankData(bankPath, bankId);
        return { [bankId.toLowerCase()]: samples };
      } else {
        // Read all banks
        const bankDirs = await fs.readdir(exportPath);
        const allSamples: any = {};

        for (const bankDir of bankDirs) {
          if (bankDir.startsWith(FILE_PATTERNS.BANK_PREFIX)) {
            const bank = bankDir.replace(FILE_PATTERNS.BANK_PREFIX, "");
            const bankPath = path.join(exportPath, bankDir);
            allSamples[bank.toLowerCase()] = await this.readBankData(
              bankPath,
              bank
            );
          }
        }

        return allSamples;
      }
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.FAILED_TO_READ_SAMPLES,
        undefined,
        error as Error
      );
      if (bankId) {
        return { [bankId.toLowerCase()]: [] };
      }
      return {};
    }
  }

  private async readBankData(bankPath: string, bankId: string): Promise<any[]> {
    const { promises: fs } = require("fs");
    const path = require("path");

    try {
      const items = await fs.readdir(bankPath);
      const samples = [];

      // P6 samples are in PAD_X subfolders (PAD_1 through PAD_6)
      for (const item of items) {
        const itemPath = path.join(bankPath, item);
        const stat = await fs.stat(itemPath);

        if (item.startsWith(FILE_PATTERNS.PAD_PREFIX) && stat.isDirectory()) {
          // Read the PAD folder contents
          const padFiles = await fs.readdir(itemPath);
          let prmFile: string | undefined;
          let wavFile: string | undefined;
          for (const f of padFiles) {
            if (f.endsWith(FILE_PATTERNS.PRM_EXTENSION)) prmFile = f;
            else if (f.endsWith(FILE_PATTERNS.WAV_EXTENSION)) wavFile = f;
          }
          if (prmFile || wavFile) {
            const padNumber = item.replace(FILE_PATTERNS.PAD_PREFIX, "");
            const sampleName = prmFile
              ? prmFile.replace(FILE_PATTERNS.PRM_EXTENSION, "")
              : `${bankId}-${padNumber}`;
            const sampleObj: any = {
              id: `${bankId}-${padNumber}`,
              bank: bankId,
              pad: parseInt(padNumber),
              name: sampleName,
              prmFile: prmFile ? path.join(itemPath, prmFile) : undefined,
              wavFile: wavFile ? path.join(itemPath, wavFile) : undefined,
            };
            // Set path to PRM file if exists, else WAV file
            sampleObj.path = sampleObj.prmFile || sampleObj.wavFile;
            samples.push(sampleObj);
          }
        } else if (stat.isFile()) {
          // Handle any loose files in the bank directory (fallback)
          samples.push({
            id: samples.length + 1,
            bank: bankId,
            name: item,
            path: itemPath,
            size: stat.size,
          });
        }
      }

      this.logger.info(LOG_MESSAGES.FOUND_SAMPLES(samples.length, bankId));
      return samples;
    } catch (error) {
      this.logger.warn(
        LOG_MESSAGES.FAILED_TO_READ_BANK(bankId),
        {},
        error as Error
      );
      return [];
    }
  }

  async writeData(
    dataType: string,
    data: any,
    parameters?: any
  ): Promise<boolean> {
    if (!this.status.connected) {
      throw new Error(ERROR_MESSAGES.DEVICE_NOT_CONNECTED);
    }

    if (!this.massStorageInfo) {
      throw new Error(ERROR_MESSAGES.MASS_STORAGE_NOT_AVAILABLE);
    }

    this.logger.info(LOG_MESSAGES.WRITING_DATA, { dataType, data, parameters });

    try {
      switch (dataType) {
        case DATA_TYPES.PATTERNS:
          return await this.writePatternData(data, parameters);
        case DATA_TYPES.SAMPLES:
          return await this.writeSampleData(data, parameters);
        default:
          throw new Error(ERROR_MESSAGES.UNKNOWN_DATA_TYPE(dataType));
      }
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.FAILED_TO_WRITE_DATA(dataType),
        {},
        error as Error
      );
      return false;
    }
  }

  private async writePatternData(
    data: any,
    parameters?: any
  ): Promise<boolean> {
    if (!this.massStorageInfo) {
      throw new Error(ERROR_MESSAGES.MASS_STORAGE_NOT_AVAILABLE);
    }

    const { promises: fs } = require("fs");
    const path = require("path");

    try {
      // P6 patterns are restored to RESTORE folder during pattern import
      const restorePath = path.join(
        this.massStorageInfo.path,
        FILE_PATTERNS.RESTORE_FOLDER
      );
      await fs.mkdir(restorePath, { recursive: true });

      if (Array.isArray(data)) {
        // Copy multiple pattern files
        for (const pattern of data) {
          if (pattern.path) {
            const fileName = path.basename(pattern.path);
            const destPath = path.join(restorePath, fileName);
            await fs.copyFile(pattern.path, destPath);
            this.logger.info(LOG_MESSAGES.COPIED_PATTERN(fileName));
          }
        }
      } else if (typeof data === "string") {
        // Copy single pattern file
        const fileName = path.basename(data);
        const destPath = path.join(restorePath, fileName);
        if (fileName.endsWith(FILE_PATTERNS.PATTERN_EXTENSION)) {
          await fs.copyFile(data, destPath);
          this.logger.info(LOG_MESSAGES.COPIED_PATTERN(fileName));
        }
      }

      return true;
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.FAILED_TO_WRITE_PATTERNS,
        {},
        error as Error
      );
      return false;
    }
  }

  private async writeSampleData(data: any, parameters?: any): Promise<boolean> {
    if (!this.massStorageInfo) {
      throw new Error(ERROR_MESSAGES.MASS_STORAGE_NOT_AVAILABLE);
    }

    const { promises: fs } = require("fs");
    const path = require("path");

    try {
      // P6 samples are restored to IMPORT folder with proper PAD structure during sample import
      const importPath = path.join(
        this.massStorageInfo.path,
        FILE_PATTERNS.IMPORT_FOLDER
      );
      await fs.mkdir(importPath, { recursive: true });

      if (parameters?.bankId && parameters?.bankPath) {
        // Copy specific bank with PAD structure
        const bankName = `${
          FILE_PATTERNS.BANK_PREFIX
        }${parameters.bankId.toUpperCase()}`;
        const destPath = path.join(importPath, bankName);
        await this.copyDirectory(parameters.bankPath, destPath);
        this.logger.info(
          LOG_MESSAGES.COPIED_BANK(parameters.bankId.toUpperCase())
        );
      } else if (Array.isArray(data)) {
        // Handle individual samples - organize into PAD structure
        for (const sample of data) {
          if (sample.bank && sample.pad) {
            const bankDir = `${
              FILE_PATTERNS.BANK_PREFIX
            }${sample.bank.toUpperCase()}`;
            const padDir = `${FILE_PATTERNS.PAD_PREFIX}${sample.pad}`;
            const destDir = path.join(importPath, bankDir, padDir);
            await fs.mkdir(destDir, { recursive: true });

            if (sample.prmFile) {
              const destPrm = path.join(destDir, path.basename(sample.prmFile));
              await fs.copyFile(sample.prmFile, destPrm);
            }
            if (sample.wavFile) {
              const destWav = path.join(destDir, path.basename(sample.wavFile));
              await fs.copyFile(sample.wavFile, destWav);
            }
          }
        }
      } else if (parameters?.bankPath) {
        // Copy entire bank directory
        const bankName = path.basename(parameters.bankPath);
        const destPath = path.join(importPath, bankName);
        await this.copyDirectory(parameters.bankPath, destPath);
        this.logger.info(
          LOG_MESSAGES.COPIED_BANK_FROM_PATH(parameters.bankPath)
        );
      }

      // Update info.txt file with sample mappings
      await this.updateInfoFile(importPath, data);
      return true;
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.FAILED_TO_WRITE_SAMPLES,
        {},
        error as Error
      );
      return false;
    }
  }

  private async updateInfoFile(importPath: string, data: any): Promise<void> {
    const { promises: fs } = require("fs");
    const path = require("path");

    try {
      const infoFilePath = path.join(
        path.dirname(importPath),
        FILE_PATTERNS.INFO_FILE
      );
      const infoLines: string[] = [];

      if (Array.isArray(data)) {
        // Generate info.txt entries for sample array
        for (const sample of data) {
          if (sample.bank && sample.pad && sample.name) {
            // Format: A-1: P6_A-1_REC
            const entry = `${sample.bank.toUpperCase()}-${sample.pad}:\t${
              sample.name
            }`;
            infoLines.push(entry);
          }
        }
      }

      if (infoLines.length > 0) {
        const infoContent = infoLines.join("\n");
        await fs.writeFile(infoFilePath, infoContent, "utf-8");
        this.logger.info(LOG_MESSAGES.UPDATED_INFO_FILE(infoLines.length));
      }
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.FAILED_TO_UPDATE_INFO_FILE,
        {},
        error as Error
      );
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    const { promises: fs } = require("fs");
    const path = require("path");

    await fs.mkdir(dest, { recursive: true });
    const files = await fs.readdir(src);

    for (const file of files) {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      const stat = await fs.stat(srcPath);

      if (stat.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  disconnect(): void {
    this.status.connected = false;
    this.status.mode = DEVICE_MODES.UNKNOWN;
    this.status.lastSeen = null;
    this.currentDevice = null;
    this.massStorageInfo = null;
    this.lastModeDetectionResult = null;
    this.stopConnectionMonitoring();
    this.notifyStatusChanged();
    this.startAutoDetection();
  }

  async ejectDevice(): Promise<boolean> {
    try {
      if (!this.massStorageInfo) {
        this.logger.warn(LOG_MESSAGES.EJECT_NO_MASS_STORAGE);
        return false;
      }

      const devicePath = this.massStorageInfo.path;
      this.logger.info(LOG_MESSAGES.EJECTING_DEVICE, devicePath);

      // Platform-specific eject commands
      const { exec } = require("child_process");
      const util = require("util");
      const execAsync = util.promisify(exec);

      if (process.platform === "darwin") {
        // macOS: Use diskutil to eject the volume
        try {
          await execAsync(`diskutil eject "${devicePath}"`);
          this.logger.info(LOG_MESSAGES.EJECT_SUCCESS, devicePath);
        } catch (error) {
          this.logger.warn(LOG_MESSAGES.EJECT_FAILED, {}, error as Error);
          return false;
        }
      } else if (process.platform === "win32") {
        // Windows: Use PowerShell to eject the drive
        try {
          const driveLetter = devicePath.charAt(0);
          await execAsync(
            `powershell -command "(New-Object -comObject Shell.Application).Namespace(17).ParseName('${driveLetter}:').InvokeVerb('Eject')"`
          );
          this.logger.info(LOG_MESSAGES.EJECT_SUCCESS, devicePath);
        } catch (error) {
          this.logger.warn(LOG_MESSAGES.EJECT_FAILED, {}, error as Error);
          return false;
        }
      } else {
        // Linux: Use umount command
        try {
          await execAsync(`umount "${devicePath}"`);
          this.logger.info(LOG_MESSAGES.EJECT_SUCCESS, devicePath);
        } catch (error) {
          this.logger.warn(LOG_MESSAGES.EJECT_FAILED, {}, error as Error);
          return false;
        }
      }

      // After successful eject, update our internal state
      this.disconnect();
      return true;
    } catch (error) {
      this.logger.error(LOG_MESSAGES.EJECT_ERROR, {}, error as Error);
      return false;
    }
  }

  dispose(): void {
    this.disconnect();
    this.stopAutoDetection();
    this.usbManager.dispose();
  }

  private async performDeviceDetection(): Promise<boolean> {
    try {
      this.logger.info(LOG_MESSAGES.SCANNING_DEVICES);
      const devices = await this.usbManager.scanForP6Devices();

      if (devices.length > 0) {
        this.logger.info(LOG_MESSAGES.FOUND_DEVICES(devices.length), devices);
        const device = devices[0]; // Use first device found
        await this.handleDeviceConnected(device);
        return true;
      }

      // Also check for mass storage mode (P6 might appear as storage device)
      this.massStorageInfo = await this.usbManager.checkP6MassStorageMode();
      if (this.massStorageInfo) {
        this.logger.info(
          LOG_MESSAGES.FOUND_MASS_STORAGE_MODE,
          this.massStorageInfo
        );

        // Create a virtual device info for mass storage mode
        const virtualDevice: UsbDeviceInfo = {
          vendorId: DEVICE_DETAILS.VENDOR_ID,
          productId: DEVICE_DETAILS.PRODUCT_ID,
          path: this.massStorageInfo.path,
        };

        await this.handleDeviceConnected(virtualDevice);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.DEVICE_DETECTION_FAILED,
        {},
        error as Error
      );
      return false;
    }
  }

  private async getDeviceId(): Promise<string> {
    if (this.currentDevice) {
      if (this.currentDevice.serialNumber) {
        return this.currentDevice.serialNumber;
      }
    }

    // Fallback: generate ID from mass storage path or device info
    if (this.massStorageInfo) {
      const path = this.massStorageInfo.path;
      const pathHash = path.split("").reduce((hash, char) => {
        return (hash << 5) - hash + char.charCodeAt(0);
      }, 0);
      return `P6_MS_${Math.abs(pathHash).toString(16)}`;
    }

    return DEVICE_DETAILS.UNKNOWN_DEVICE_ID;
  }

  private async getFirmwareVersion(): Promise<string> {
    try {
      if (this.currentDevice && this.currentDevice.product) {
        const versionMatch = this.currentDevice.product.match(
          FILE_PATTERNS.VERSION_REGEX
        );
        if (versionMatch) {
          return versionMatch[1];
        }
      }

      // Try to detect from mass storage files
      if (this.massStorageInfo) {
        const { promises: fs } = require("fs");
        const path = require("path");

        try {
          // Look for version info files
          for (const filename of FILE_PATTERNS.VERSION_FILES) {
            try {
              const versionPath = path.join(
                this.massStorageInfo.path,
                filename
              );
              const content = await fs.readFile(versionPath, "utf-8");
              const versionMatch = content.match(FILE_PATTERNS.VERSION_REGEX);
              if (versionMatch) {
                return versionMatch[1];
              }
            } catch {
              // Continue to next file
            }
          }

          // Try to detect version from backup folder structure
          const backupPath = path.join(
            this.massStorageInfo.path,
            FILE_PATTERNS.BACKUP_FOLDER
          );
          if (
            await fs
              .access(backupPath)
              .then(() => true)
              .catch(() => false)
          ) {
            return DEVICE_DETAILS.FIRMWARE.DEFAULT_VERSION; // Default for devices with backup folder
          }
        } catch (error) {
          this.logger.debug(LOG_MESSAGES.COULD_NOT_DETECT_VERSION);
        }
      }

      return DEVICE_DETAILS.FIRMWARE.UNKNOWN_VERSION;
    } catch (error) {
      this.logger.error(LOG_MESSAGES.ERROR_GETTING_VERSION, {}, error as Error);
      return DEVICE_DETAILS.FIRMWARE.UNKNOWN_VERSION;
    }
  }

  private async getSerialNumber(): Promise<string> {
    if (this.currentDevice && this.currentDevice.serialNumber) {
      return this.currentDevice.serialNumber;
    }

    // Generate pseudo-serial from device info
    if (this.currentDevice) {
      const deviceString = `${this.currentDevice.vendorId}_${this.currentDevice.productId}`;
      return deviceString;
    }

    // Try to extract from mass storage info
    if (this.massStorageInfo) {
      const { promises: fs } = require("fs");
      const path = require("path");

      try {
        // Look for serial files
        for (const filename of FILE_PATTERNS.SERIAL_FILES) {
          try {
            const filePath = path.join(this.massStorageInfo.path, filename);
            const content = await fs.readFile(filePath, "utf-8");
            const lines = content
              .split("\n")
              .filter((line: string) => line.trim());
            if (lines.length > 0) {
              return lines[0].trim();
            }
          } catch {
            // Continue to next file
          }
        }
      } catch (error) {
        this.logger.debug(LOG_MESSAGES.COULD_NOT_READ_SERIAL);
      }

      // Generate from path
      const pathString = this.massStorageInfo.path;
      return `MS_${
        pathString.split("/").pop() || DEVICE_DETAILS.UNKNOWN_SERIAL
      }`;
    }

    return DEVICE_DETAILS.UNKNOWN_SERIAL;
  }

  private async getCurrentDeviceMode(): Promise<DeviceMode> {
    return this.detectCurrentMode();
  }

  /**
   * Retry mode detection - now uses the enhanced ModeDetector
   */
  async retryModeDetection(): Promise<DeviceMode> {
    this.logger.info("Initiating retry mode detection...");

    const detectionResult = await this.modeDetector.detectMode();
    this.lastModeDetectionResult = detectionResult;

    if (detectionResult.massStorageInfo) {
      this.massStorageInfo = detectionResult.massStorageInfo;
    }

    // Update device status
    this.status.mode = detectionResult.mode;
    this.notifyStatusChanged();

    if (detectionResult.mode !== DEVICE_MODES.UNKNOWN) {
      this.logger.info(
        `Retry detection successful: ${detectionResult.mode} (${detectionResult.confidence} confidence)`
      );
    } else {
      this.logger.warn("Retry detection failed - mode remains unknown");
      if (detectionResult.failureReason) {
        this.logger.warn(`Reason: ${detectionResult.failureReason}`);
      }
    }

    return detectionResult.mode;
  }

  /**
   * Force refresh mode detection
   */
  async refreshModeDetection(): Promise<DeviceMode> {
    this.logger.info("Forcing mode detection refresh...");

    const detectionResult = await this.modeDetector.refreshAndDetect();
    this.lastModeDetectionResult = detectionResult;

    if (detectionResult.massStorageInfo) {
      this.massStorageInfo = detectionResult.massStorageInfo;
    }

    this.status.mode = detectionResult.mode;
    this.notifyStatusChanged();

    return detectionResult.mode;
  }

  /**
   * Validate current mode stability
   */
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
        const { promises: fs } = require("fs");
        try {
          const stat = await fs.stat(this.massStorageInfo.path);
          return stat.isDirectory();
        } catch {
          return false;
        }
      }

      if (this.currentDevice) {
        // For USB devices, check if we can still enumerate them
        const devices = await this.usbManager.scanForP6Devices();
        return devices.some(
          (d) =>
            d.vendorId === this.currentDevice!.vendorId &&
            d.productId === this.currentDevice!.productId
        );
      }

      return false;
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.READINESS_CHECK_FAILED,
        {},
        error as Error
      );
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
          this.logger.info(LOG_MESSAGES.CONNECTION_LOST);

          // Before marking as disconnected, wait a moment and try again
          // This prevents false disconnections due to temporary issues
          await new Promise((resolve) => setTimeout(resolve, 500));
          const retryConnected = await this.checkConnection();

          if (!retryConnected) {
            // Confirmed disconnection
            this.status.connected = false;
            this.stopConnectionMonitoring();
            this.notifyStatusChanged();
            // Start auto-detection after a short delay to avoid immediate polling
            setTimeout(
              () => this.startAutoDetection(),
              DEVICE_CONSTANTS.RECONNECTION_DELAY
            );
          } else {
            this.logger.info(
              "False disconnection detected, device is still connected"
            );
          }
        } else {
          this.status.lastSeen = new Date();
        }
      } catch (error) {
        this.logger.error(
          LOG_MESSAGES.CONNECTION_MONITORING_ERROR,
          {},
          error as Error
        );
        // Don't immediately disconnect on monitoring error - wait and retry
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          const retryConnected = await this.checkConnection();
          if (!retryConnected) {
            // Confirmed disconnection after retry
            this.status.connected = false;
            this.stopConnectionMonitoring();
            this.notifyStatusChanged();
            // Start auto-detection after a short delay to avoid immediate polling
            setTimeout(
              () => this.startAutoDetection(),
              DEVICE_CONSTANTS.RECONNECTION_DELAY
            );
          }
        } catch (retryError) {
          // If retry also fails, then disconnect
          this.logger.error(
            "Connection check retry also failed",
            {},
            retryError as Error
          );
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
    this.logger.info(LOG_MESSAGES.STARTING_AUTO_DETECTION);

    if (this.autoDetectionInterval) {
      clearInterval(this.autoDetectionInterval);
    }

    // Run initial detection
    this.performAutoDetection();

    this.autoDetectionInterval = setInterval(async () => {
      await this.performAutoDetection();
    }, DEVICE_CONSTANTS.AUTO_DETECTION_INTERVAL);
  }

  private stopAutoDetection(): void {
    if (this.autoDetectionInterval) {
      clearInterval(this.autoDetectionInterval);
      this.autoDetectionInterval = null;
    }
  }

  private async performAutoDetection(): Promise<void> {
    try {
      // Only run auto-detection if no device is currently connected
      if (this.status.connected) {
        this.logger.info(LOG_MESSAGES.DEVICE_ALREADY_CONNECTED);
        this.stopAutoDetection();
        return;
      }

      // Throttle detection to prevent excessive logging
      const detected = await this.performDeviceDetection();
      if (detected) {
        this.logger.info(LOG_MESSAGES.DEVICE_DETECTED);
        this.notifyStatusChanged();
      }
    } catch (error) {
      this.logger.debug(LOG_MESSAGES.AUTO_DETECTION_ERROR);
    }
  }

  private async checkConnection(): Promise<boolean> {
    try {
      // Check mass storage accessibility
      if (this.massStorageInfo) {
        const { promises: fs } = require("fs");
        try {
          const stat = await fs.stat(this.massStorageInfo.path);
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
      // Check USB device enumeration
      if (this.currentDevice) {
        try {
          const usbDevices = require("usb").getDeviceList();
          return usbDevices.some(
            (d: any) =>
              d.deviceDescriptor.idVendor === this.currentDevice?.vendorId &&
              d.deviceDescriptor.idProduct === this.currentDevice?.productId
          );
        } catch (usbError) {
          this.logger.warn(
            LOG_MESSAGES.USB_ENUMERATION_FAILED,
            {},
            usbError as Error
          );
          return false;
        }
      }
      return false;
    } catch (error) {
      this.logger.error(
        LOG_MESSAGES.CONNECTION_CHECK_FAILED,
        {},
        error as Error
      );
      return false;
    }
  }
}
