import { contextBridge, ipcRenderer } from "electron";
import { IPC, IPC_EVENTS } from "../shared/constants";
import type { BackupStageResult } from "../shared/types/index";

/**
 * The renderer's entire view of the main process. Anything not exposed here is
 * unreachable from the page — see src/declarations.d.ts for the typed shape.
 */
contextBridge.exposeInMainWorld("electronAPI", {
  // Backup — the staging steps a multi-stage run drives, then the gather.
  backupPatterns: (customName?: string, patternIds?: string[]) =>
    ipcRenderer.invoke(IPC.BACKUP_PATTERNS, customName, patternIds),
  backupSamples: (bankId?: string, customName?: string, padNumbers?: number[]) =>
    ipcRenderer.invoke(IPC.BACKUP_SAMPLES, bankId, customName, padNumbers),
  organizeBackup: (options: {
    precompletedResults?: BackupStageResult[];
    customName?: string;
  }) => ipcRenderer.invoke(IPC.BACKUP_ORGANIZE, options),

  // Restore
  restorePatterns: (backupPath: string, patternIds?: string[]) =>
    ipcRenderer.invoke(IPC.RESTORE_PATTERNS, backupPath, patternIds),
  restoreSamples: (backupPath: string, bankId?: string, sampleNames?: string[]) =>
    ipcRenderer.invoke(IPC.RESTORE_SAMPLES, backupPath, bankId, sampleNames),

  // Device
  detectDevice: () => ipcRenderer.invoke(IPC.DEVICE_DETECT),
  getDeviceStatus: () => ipcRenderer.invoke(IPC.DEVICE_GET_STATUS),
  getCurrentBanks: () => ipcRenderer.invoke(IPC.DEVICE_GET_CURRENT_BANKS),
  getCurrentBank: () => ipcRenderer.invoke(IPC.DEVICE_GET_CURRENT_BANK),
  getCurrentPatterns: () => ipcRenderer.invoke(IPC.DEVICE_GET_CURRENT_PATTERNS),
  hasBankInfo: () => ipcRenderer.invoke(IPC.DEVICE_HAS_BANK_INFO),
  checkModeRequirement: (operation: string) =>
    ipcRenderer.invoke(IPC.DEVICE_CHECK_MODE_REQUIREMENT, operation),
  ejectDevice: () => ipcRenderer.invoke(IPC.DEVICE_EJECT),
  retryModeDetection: () => ipcRenderer.invoke(IPC.DEVICE_RETRY_MODE_DETECTION),

  // File system
  selectBackupLocation: () => ipcRenderer.invoke(IPC.FS_SELECT_BACKUP_LOCATION),
  discoverBackups: () => ipcRenderer.invoke(IPC.FS_DISCOVER_BACKUPS),
  getBackupDetails: (backupPath: string) =>
    ipcRenderer.invoke(IPC.FS_GET_BACKUP_DETAILS, backupPath),
  renameBackup: (backupPath: string, newName: string) =>
    ipcRenderer.invoke(IPC.FS_RENAME_BACKUP, backupPath, newName),
  getBackupPath: () => ipcRenderer.invoke(IPC.FS_GET_BACKUP_PATH),
  setBackupPath: (newPath: string) =>
    ipcRenderer.invoke(IPC.FS_SET_BACKUP_PATH, newPath),

  // Events pushed from main
  onDeviceStatusChanged: (callback: (status: unknown) => void) =>
    ipcRenderer.on(IPC_EVENTS.DEVICE_STATUS_CHANGED, (_, status) =>
      callback(status)
    ),
  onNavigate: (callback: (view: string) => void) =>
    ipcRenderer.on(IPC_EVENTS.MENU_NAVIGATE, (_, view) => callback(view)),
  onMenuNewBackup: (callback: () => void) =>
    ipcRenderer.on(IPC_EVENTS.MENU_NEW_BACKUP, () => callback()),
  onFileCopySuccess: (
    callback: (data: { fileName: string; message: string }) => void
  ) => ipcRenderer.on(IPC_EVENTS.FILE_COPY_SUCCESS, (_, data) => callback(data)),
  removeAllListeners: (channel: string) =>
    ipcRenderer.removeAllListeners(channel),

  // Window controls
  windowClose: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  windowMinimize: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),

  // Logging
  sendLog: (entry: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC.LOG_WRITE, entry),
  getLogLevel: () => ipcRenderer.invoke(IPC.LOG_GET_LEVEL),
});
