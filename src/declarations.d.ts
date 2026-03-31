declare module "*.css";
declare module "*.scss";

import type {
  BackupResult,
  RestoreResult,
  DeviceStatus,
  PatternInfo,
  BackupInfo,
  BackupStageResult,
} from "./shared/types/index";

interface ModeRequirementResult {
  met: boolean;
  currentMode: string;
  requiredMode: string;
  operation: string;
}

interface ModeWaitResult {
  success: boolean;
  finalMode: string;
  timedOut: boolean;
}

interface BackupDetails {
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

interface LogEntry {
  timestamp: string;
  level: string;
  component: string;
  message: string;
  data?: unknown;
  stack?: string;
}

declare global {
  interface Window {
    electronAPI: {
      backupPatterns(customName?: string, patternIds?: string[]): Promise<BackupResult>;
      backupSamples(bankId?: string, customName?: string, padNumbers?: number[]): Promise<BackupResult>;
      backup(options: {
        includePatterns?: boolean;
        includeSamples?: boolean;
        bankIds?: string[];
        customName?: string;
      }): Promise<BackupResult>;
      organizeBackup(options: {
        includePatterns?: boolean;
        includeSamples?: boolean;
        bankIds?: string[];
        precompletedResults?: BackupStageResult[];
        customName?: string;
      }): Promise<BackupResult>;
      restorePatterns(backupPath: string, patternIds?: string[]): Promise<RestoreResult>;
      restoreSamples(backupPath: string, bankId?: string, sampleNames?: string[]): Promise<RestoreResult>;
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
      selectBackupLocation(): Promise<string | null>;
      selectRestoreFile(): Promise<string | null>;
      discoverBackups(): Promise<BackupInfo[]>;
      getBackupDetails(backupPath: string): Promise<BackupDetails>;
      renameBackup(backupPath: string, newName: string): Promise<string>;
      onDeviceStatusChanged(callback: (status: DeviceStatus) => void): void;
      onMenuAction(action: string, callback: () => void): void;
      onNavigationRequest(callback: (route: string) => void): void;
      onMenuNewBackup(callback: () => void): void;
      onNavigationShowGuide(callback: () => void): void;
      onFileCopySuccess(callback: (data: { fileName: string; message: string }) => void): void;
      removeAllListeners(channel: string): void;
      windowClose(): Promise<void>;
      windowMinimize(): Promise<void>;
      sendLog(logEntry: Record<string, unknown>): Promise<void>;
      getLogLevel(): Promise<number>;
      setLogLevel(level: number): Promise<void>;
      getLogDirectory(): Promise<string>;
      getLogFiles(): Promise<string[]>;
      clearLogs(): Promise<void>;
    };
  }
}
