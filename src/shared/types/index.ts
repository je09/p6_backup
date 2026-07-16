export interface BackupResult {
  success: boolean;
  backupPath: string;
  timestamp: Date;
  itemCount: number;
  message: string;
}

export interface RestoreResult {
  success: boolean;
  itemCount: number;
  message: string;
  timestamp: Date;
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

/**
 * The P-6 only reaches the host as a mass storage volume, and only in the four
 * modes below — each identified by the marker folder it exposes. Anything else
 * (powered off, or powered on in normal mode, which mounts nothing) is
 * indistinguishable from no device at all, and reads as `unknown`.
 */
export type DeviceMode =
  | "pattern_export"
  | "pattern_import"
  | "sample_export"
  | "sample_import"
  | "unknown";
export type ConnectionType = "usb";

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

export type { PrmMetadata, SampleDependency } from "../utils/prmParser";

/** A pattern offered for restore, as read out of a backup. */
export interface BackupPatternItem {
  id: string;
  name: string;
  bank: number;
  pattern: number;
  size: number;
  metadata?: import("../utils/prmParser").PrmMetadata;
}

/** A sample file offered for restore, as read out of a backup. */
export interface BackupSampleItem {
  id: string;
  name: string;
  bank: string;
  pad: number;
  size: number;
}

/** What a backup holds, for the restore selection UI. */
export interface BackupDetails {
  patterns: BackupPatternItem[];
  /** Keyed by upper-case bank letter. */
  samples: Record<string, BackupSampleItem[]>;
}

/** A pattern file read from the device's BACKUP directory. */
export interface PatternInfo {
  id: string;
  bank: number;
  pattern: number;
  name: string;
  path: string;
  size: number;
  /** Populated when PRM content is available (backup or restore load time). */
  metadata?: import("../utils/prmParser").PrmMetadata;
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
