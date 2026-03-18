import { DeviceMode, DeviceStatus, PatternInfo, SampleBankData } from "../types/index";

// ── Focused sub-interfaces (ISP) ─────────────────────────────────────────────
// Each service should depend only on the sub-interface it actually needs:
//   ModeService        → IDeviceStatus & IDeviceModeOps
//   BackupService      → IDeviceStatus & IDeviceIO
//   PatternBackupService / SampleBackupService → IDeviceStatus & IDeviceIO

export interface IDeviceStatus {
  isReady(): Promise<boolean>;
  getStatus(): DeviceStatus;
  getCurrentMode(): DeviceMode;
  getCurrentBanks(): string[] | null;
  getCurrentBank(): string | null;
}

export interface IDeviceEvents {
  onStatusChanged(callback: (status: DeviceStatus) => void): void;
}

export interface IDeviceModeOps {
  retryModeDetection(): Promise<DeviceMode>;
}

export interface IDeviceIO {
  readData(dataType: string, parameters?: { bankId?: string }): Promise<PatternInfo[] | SampleBankData>;
  writeData(dataType: string, data: PatternInfo[] | SampleBankData | string, parameters?: { bankId?: string; bankPath?: string }): Promise<boolean>;
}

// ── Composite interface (backwards-compatible) ────────────────────────────────
// P6Device implements this. Existing code that types params as IDeviceConnection
// continues to compile unchanged.

export interface IDeviceConnection
  extends IDeviceStatus,
    IDeviceEvents,
    IDeviceModeOps,
    IDeviceIO {}
