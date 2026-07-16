import {
  BackupResult,
  RestoreResult,
  DeviceStatus,
  BackupStageResult,
  PatternInfo,
  BackupInfo,
} from "../../shared/types/index";

export interface ModeRequirementResult {
  met: boolean;
  currentMode: string;
  requiredMode: string;
  operation: string;
}

export interface ModeWaitResult {
  success: boolean;
  finalMode: string;
  timedOut: boolean;
}

export interface BackupDetails {
  patterns?: Array<{
    id: string;
    bank: number;
    pattern: number;
    name: string;
    path: string;
    size: number;
  }>;
  samples?: Record<string, Array<{ id: string; name: string; bank: string; pad: number; size: number }>>;
  manifest?: Record<string, unknown>;
}

// ── Backup & Restore ─────────────────────────────────────────────────────────

export interface IBackupBridge {
  backupPatterns(customName?: string, patternIds?: string[]): Promise<BackupResult>;
  backupSamples(bankId?: string, customName?: string, padNumbers?: number[]): Promise<BackupResult>;
  organizeBackup(options: {
    includePatterns?: boolean;
    includeSamples?: boolean;
    bankIds?: string[];
    precompletedResults?: BackupStageResult[];
    customName?: string;
  }): Promise<BackupResult>;
  restorePatterns(backupPath: string, patternIds?: string[]): Promise<RestoreResult>;
  restoreSamples(backupPath: string, bankId?: string, sampleNames?: string[]): Promise<RestoreResult>;
}

// ── Device ───────────────────────────────────────────────────────────────────

export interface IDeviceBridge {
  detectDevice(): Promise<boolean>;
  getDeviceStatus(): Promise<DeviceStatus>;
  getCurrentBanks(): Promise<string[] | null>;
  getCurrentBank(): Promise<string | null>;
  getCurrentPatterns(): Promise<PatternInfo[]>;
  hasBankInfo(): Promise<boolean>;
  getCurrentMode(): Promise<string>;
  checkModeRequirement(operation: string): Promise<ModeRequirementResult>;
  waitForMode(requiredMode: string, timeoutMs?: number): Promise<ModeWaitResult>;
  ejectDevice(): Promise<boolean>;
  retryModeDetection(): Promise<string>;
}

// ── Files ────────────────────────────────────────────────────────────────────

export interface IFileBridge {
  selectBackupLocation(): Promise<string | null>;
  selectRestoreFile(): Promise<string | null>;
  discoverBackups(): Promise<BackupInfo[]>;
  getBackupDetails(backupPath: string): Promise<BackupDetails>;
  renameBackup(backupPath: string, newName: string): Promise<string>;
}

// ── Events ───────────────────────────────────────────────────────────────────

export interface IEventBridge {
  onDeviceStatusChanged(callback: (status: DeviceStatus) => void): void;
  onMenuNewBackup(callback: () => void): void;
  onNavigate(callback: (view: string) => void): void;
  onFileCopySuccess(callback: (data: { fileName: string; message: string }) => void): void;
  removeAllListeners(channel: string): void;
}

// ── Window ───────────────────────────────────────────────────────────────────

export interface IWindowBridge {
  windowClose(): Promise<void>;
  windowMinimize(): Promise<void>;
}

// ── Logging ──────────────────────────────────────────────────────────────────

export interface ILogBridge {
  sendLog(logEntry: Record<string, unknown>): Promise<void>;
  getLogLevel(): Promise<number>;
  setLogLevel(level: number): Promise<void>;
  getLogDirectory(): Promise<string>;
  getLogFiles(): Promise<string[]>;
  clearLogs(): Promise<void>;
}

// ── Composite ────────────────────────────────────────────────────────────────

export interface IElectronBridge
  extends IBackupBridge,
    IDeviceBridge,
    IFileBridge,
    IEventBridge,
    IWindowBridge,
    ILogBridge {}
