import { DeviceStatus, DeviceMode, PatternInfo, SampleBankData } from "../types/index";
import { DEVICE_CONSTANTS } from "../constants";
import { DEVICE_STATUS, DEVICE_MODES } from "../constants/device";
import {
  UsbDeviceManager,
  type UsbDeviceInfo,
  type P6MassStorageInfo,
} from "../services/UsbDeviceManager";
import { ModeDetector, type ModeDetectionResult } from "../services/ModeDetector";
import { DeviceDataService } from "../services/DeviceDataService";
import { IDeviceConnection } from "../services/interfaces";
import { createComponentLogger } from "../services/Logger";

import * as fs from "fs";
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFileCb);

/**
 * The P-6 as the app sees it: a mass storage volume that comes and goes as the
 * user power-cycles the device between modes.
 *
 * "Connected" means a P-6 volume is mounted. While none is, an auto-detection
 * poll watches for one; while one is, a connection poll watches for it to
 * vanish. Only one of the two ever runs.
 */
export class P6Device implements IDeviceConnection {
  private status: DeviceStatus;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private autoDetectionInterval: NodeJS.Timeout | null = null;
  private usbManager: UsbDeviceManager;
  private modeDetector: ModeDetector;
  private currentDevice: UsbDeviceInfo | null = null;
  private massStorageInfo: P6MassStorageInfo | null = null;
  private connecting: Promise<boolean> | null = null;
  private dataService: DeviceDataService;
  private onStatusChangedCallback?: (status: DeviceStatus) => void;
  private logger = createComponentLogger("P6Device");

  constructor(
    usbManager?: UsbDeviceManager,
    modeDetector?: ModeDetector,
    dataService?: DeviceDataService
  ) {
    this.status = { ...DEVICE_STATUS.INITIAL };
    this.usbManager = usbManager ?? new UsbDeviceManager();
    this.modeDetector = modeDetector ?? new ModeDetector(this.usbManager);
    this.dataService = dataService ?? new DeviceDataService(
      () => this.status,
      () => this.massStorageInfo
    );
    this.startAutoDetection();
  }

  onStatusChanged(callback: (status: DeviceStatus) => void): void {
    this.onStatusChangedCallback = callback;
  }

  private notifyStatusChanged(): void {
    this.onStatusChangedCallback?.(this.getStatus());
  }

  getStatus(): DeviceStatus {
    return { ...this.status };
  }

  getCurrentMode(): DeviceMode {
    return this.status.mode;
  }

  getCurrentBanks(): string[] | null {
    return this.massStorageInfo?.banks ?? null;
  }

  getCurrentBank(): string | null {
    return this.massStorageInfo?.currentBank ?? null;
  }

  hasBankInfo(): boolean {
    return !!(this.massStorageInfo?.banks || this.massStorageInfo?.currentBank);
  }

  async detect(): Promise<boolean> {
    return this.connect();
  }

  /**
   * Attach to a mounted P-6, if there is one. The auto-detection poll and the
   * user both call this, so concurrent callers share one attempt.
   */
  async connect(): Promise<boolean> {
    if (this.status.connected) return true;
    this.connecting ??= this.attemptConnect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async attemptConnect(): Promise<boolean> {
    try {
      const device = await this.findDevice();
      if (!device) return false;
      await this.handleDeviceConnected(device);
      return true;
    } catch (error) {
      this.logger.warn("Connect failed", { error });
      return false;
    }
  }

  async isReady(): Promise<boolean> {
    if (!this.status.connected && !(await this.connect())) return false;
    this.applyDetection(await this.modeDetector.detectModeQuick());
    this.notifyStatusChanged();
    return this.performReadinessCheck();
  }

  async retryModeDetection(): Promise<DeviceMode> {
    this.applyDetection(await this.modeDetector.detectMode());
    this.notifyStatusChanged();
    return this.status.mode;
  }

  async readData(
    dataType: string,
    parameters?: { bankId?: string }
  ): Promise<PatternInfo[] | SampleBankData> {
    return this.dataService.readData(dataType, parameters);
  }

  async writeData(
    dataType: string,
    data: PatternInfo[] | SampleBankData,
    parameters?: { bankId?: string }
  ): Promise<boolean> {
    return this.dataService.writeData(dataType, data, parameters);
  }

  /**
   * Unmount the volume through the OS. The device stays powered — this is what
   * lets the user safely pull it between restore stages.
   */
  async ejectDevice(): Promise<boolean> {
    const mountPath = this.massStorageInfo?.path;
    if (mountPath) {
      // Volume labels are device-supplied, so the path must never reach a
      // shell. execFile passes it as a single argv entry instead.
      const ejectCommands: Record<string, [string, string[]]> = {
        darwin: ["diskutil", ["eject", mountPath]],
        linux: ["umount", [mountPath]],
        win32: ["mountvol", [mountPath, "/D"]],
      };
      const command = ejectCommands[process.platform];
      if (command) {
        try {
          await execFileAsync(command[0], command[1]);
        } catch (error) {
          this.logger.warn(`Failed to eject device at ${mountPath}`, { error });
          return false;
        }
      }
    }
    this.markDisconnected();
    return true;
  }

  dispose(): void {
    this.stopAutoDetection();
    this.stopConnectionMonitoring();
  }

  // ── Detection ──────────────────────────────────────────────────────────────

  private async findDevice(): Promise<UsbDeviceInfo | null> {
    const devices = await this.usbManager.scanForP6Devices();
    return devices[0] ?? null;
  }

  /** Fold a detection result into the device's state. */
  private applyDetection(result: ModeDetectionResult): void {
    if (result.massStorageInfo) this.massStorageInfo = result.massStorageInfo;
    this.status.mode = result.mode;
  }

  private async handleDeviceConnected(device: UsbDeviceInfo): Promise<void> {
    this.currentDevice = device;
    this.status.connected = true;
    this.status.lastSeen = new Date();
    this.applyDetection(await this.modeDetector.detectMode());
    this.startConnectionMonitoring();
    this.stopAutoDetection();
    this.notifyStatusChanged();
  }

  /** Reset to "no device" and go back to watching for one. */
  private markDisconnected(): void {
    this.stopConnectionMonitoring();
    this.status.connected = false;
    this.status.mode = DEVICE_MODES.UNKNOWN;
    this.currentDevice = null;
    this.massStorageInfo = null;
    this.notifyStatusChanged();
    this.startAutoDetection();
  }

  private async performReadinessCheck(): Promise<boolean> {
    if (!this.status.connected || !this.massStorageInfo) return false;
    try {
      const stat = await fs.promises.stat(this.massStorageInfo.path);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /** Is the volume we connected to still mounted? Refreshes the mode if so. */
  private async checkConnection(): Promise<boolean> {
    if (!this.massStorageInfo) return false;
    try {
      const current = await this.usbManager.checkP6MassStorageMode();
      if (!current) return false;
      this.massStorageInfo = current;
      this.status.mode = current.mode;
      return true;
    } catch {
      return false;
    }
  }

  // ── Polling ────────────────────────────────────────────────────────────────

  private startConnectionMonitoring(): void {
    this.stopConnectionMonitoring();
    this.connectionCheckInterval = setInterval(
      () => void this.monitorConnection(),
      DEVICE_CONSTANTS.CONNECTION_CHECK_INTERVAL
    );
  }

  /**
   * A single failed check is not enough to call the device gone: the volume
   * blips while the OS is busy. Only a second failure counts.
   */
  private async monitorConnection(): Promise<void> {
    if (await this.checkConnection()) {
      this.status.lastSeen = new Date();
      return;
    }
    await new Promise((r) =>
      setTimeout(r, DEVICE_CONSTANTS.CONNECTION_RETRY_DELAY)
    );
    if (await this.checkConnection()) {
      this.status.lastSeen = new Date();
      return;
    }
    this.markDisconnected();
  }

  private stopConnectionMonitoring(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  private startAutoDetection(): void {
    this.stopAutoDetection();
    void this.pollForDevice();
    this.autoDetectionInterval = setInterval(
      () => void this.pollForDevice(),
      DEVICE_CONSTANTS.AUTO_DETECTION_INTERVAL
    );
  }

  private async pollForDevice(): Promise<void> {
    await this.connect();
  }

  private stopAutoDetection(): void {
    if (this.autoDetectionInterval) {
      clearInterval(this.autoDetectionInterval);
      this.autoDetectionInterval = null;
    }
  }
}
