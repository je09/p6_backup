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
  BACKUP = "backup",
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
  type: "backup";
  status: OperationStatus;
  progress: number;
  message: string;
  startTime: Date;
  endTime?: Date;
  result?: BackupResult;
}

export interface RestoreOperation {
  id: string;
  type: "pattern" | "sample";
  status: OperationStatus;
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
  type: "backup";
  timestamp: Date;
  itemCount: number;
  size: number;
  hasPatterns: boolean;
  hasSamples: boolean;
  sampleBanks: string[];
  description: string;
}

/** A pattern file read from the device's BACKUP directory. */
export interface PatternInfo {
  id: string;
  bank: number;
  pattern: number;
  name: string;
  path: string;
  size: number;
}

/** A single WAV sample entry inside a bank. */
export interface SampleFileInfo {
  name: string;
  path: string;
  size?: number;
}

/** Sample data read from a single bank on the device. */
export interface SampleBankData {
  bankId: string;
  samples: SampleFileInfo[];
}

/** One stage result in an automated backup run. */
export type BackupStageResult =
  | { type: "patterns"; result: BackupResult }
  | { type: "samples"; bank: string; result: BackupResult };
