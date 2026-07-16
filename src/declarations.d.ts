declare module "*.css";
declare module "*.scss";

import type {
  BackupResult,
  RestoreResult,
  DeviceStatus,
  DeviceMode,
  PatternInfo,
  BackupInfo,
  BackupDetails,
  BackupStageResult,
} from "./shared/types/index";
import type { ModeRequirement } from "./shared/services/ModeService";
import type { IPC_EVENTS } from "./shared/constants/ipc";

declare global {
  interface Window {
    electronAPI: {
      backupPatterns(customName?: string, patternIds?: string[]): Promise<BackupResult>;
      backupSamples(bankId?: string, customName?: string, padNumbers?: number[]): Promise<BackupResult>;
      organizeBackup(options: {
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
      /** null when the device is already in the mode the operation needs. */
      checkModeRequirement(operation: string): Promise<ModeRequirement | null>;
      ejectDevice(): Promise<boolean>;
      retryModeDetection(): Promise<DeviceMode>;
      selectBackupLocation(): Promise<string | null>;
      discoverBackups(): Promise<BackupInfo[]>;
      getBackupDetails(backupPath: string): Promise<BackupDetails>;
      renameBackup(backupPath: string, newName: string): Promise<string>;
      getBackupPath(): Promise<string>;
      setBackupPath(newPath: string): Promise<void>;
      onDeviceStatusChanged(callback: (status: DeviceStatus) => void): void;
      onNavigate(callback: (view: string) => void): void;
      onMenuNewBackup(callback: () => void): void;
      onFileCopySuccess(callback: (data: { fileName: string; message: string }) => void): void;
      removeAllListeners(
        channel: (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS]
      ): void;
      windowClose(): Promise<void>;
      windowMinimize(): Promise<void>;
      sendLog(entry: Record<string, unknown>): Promise<void>;
      getLogLevel(): Promise<number>;
    };
  }
}
