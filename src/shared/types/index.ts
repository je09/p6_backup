export interface BackupResult {
  success: boolean;
  backupPath: string;
  type: BackupType;
  timestamp: Date;
  itemCount: number;
  message: string;
}

export interface RestoreResult {
  success: boolean;
  type: BackupType;
  itemCount: number;
  message: string;
  timestamp: Date;
}

export enum BackupType {
  PATTERNS = "patterns",
  SAMPLES_BANK = "samples_bank",
  SAMPLES_ALL = "samples_all",
  FULL = "full",
  COMBINED = "combined",
}

export enum OperationStatus {
  PENDING = "pending",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
}

export interface DeviceStatus {
  connected: boolean;
  mode: DeviceMode;
  connectionType: ConnectionType;
  firmwareVersion: string;
  deviceId: string;
  lastSeen: Date | null;
}

export type DeviceMode =
  | "pattern"
  | "sample"
  | "pattern_export"
  | "pattern_import"
  | "sample_export"
  | "sample_import"
  | "unknown";
export type ConnectionType = "usb" | "midi" | "network";

export interface PatternBackup {
  id: string;
  name: string;
  path: string;
  size: number;
  created: Date;
  patternCount: number;
}

export interface SampleBackup {
  id: string;
  name: string;
  path: string;
  size: number;
  created: Date;
  banks: SampleBankInfo[];
}

export interface SampleBankInfo {
  bankId: string;
  bankName: string;
  sampleCount: number;
  size: number;
}

export enum P6Mode {
  NORMAL = "normal",
  PATTERN_BACKUP = "pattern_backup", // Play button held - BACKUP folder
  PATTERN_RESTORE = "pattern_restore", // Record button held - RESTORE folder
  SAMPLE_EXPORT = "sample_export", // Bank + Sampling button held - EXPORT folder with BANK_<letter>
  SAMPLE_IMPORT = "sample_import", // Sample button held - IMPORT folder
  UNKNOWN = "unknown",
}

export enum SampleBank {
  A = "A",
  B = "B",
  C = "C",
  D = "D",
  E = "E",
  F = "F",
  G = "G",
  H = "H",
}

export interface BackupOperation {
  id: string;
  type: "pattern" | "sample" | "full";
  status: "pending" | "in-progress" | "completed" | "failed";
  progress: number;
  message: string;
  startTime: Date;
  endTime?: Date;
  result?: BackupResult;
}

export interface RestoreOperation {
  id: string;
  type: "pattern" | "sample";
  status: "pending" | "in-progress" | "completed" | "failed";
  progress: number;
  message: string;
  sourcePath: string;
  targetBanks?: string[];
  startTime: Date;
  endTime?: Date;
  result?: BackupResult;
}

export interface BackupInfo {
  name: string;
  path: string;
  type: "patterns" | "samples" | "combined" | "full";
  timestamp: Date;
  itemCount: number;
  size: number;
  hasPatterns: boolean;
  hasSamples: boolean;
  sampleBanks: string[];
  description: string;
}
