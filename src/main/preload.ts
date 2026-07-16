import { contextBridge, ipcRenderer } from "electron";

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Backup Operations (staging steps used by orchestration)
  backupPatterns: (customName?: string, patternIds?: string[]) =>
    ipcRenderer.invoke("backup:patterns", customName, patternIds),
  backupSamples: (bankId?: string, customName?: string, padNumbers?: number[]) =>
    ipcRenderer.invoke("backup:samples", bankId, customName, padNumbers),
  backup: (options: {
    includePatterns?: boolean;
    includeSamples?: boolean;
    bankIds?: string[];
    customName?: string;
  }) => ipcRenderer.invoke("backup:create", options),
  organizeBackup: (options: {
    includePatterns?: boolean;
    includeSamples?: boolean;
    bankIds?: string[];
    precompletedResults?: any[];
    customName?: string;
  }) => ipcRenderer.invoke("backup:organize", options),

  // Restore Operations
  restorePatterns: (backupPath: string, patternIds?: string[]) =>
    ipcRenderer.invoke("restore:patterns", backupPath, patternIds),
  restoreSamples: (backupPath: string, bankId?: string, sampleNames?: string[]) =>
    ipcRenderer.invoke("restore:samples", backupPath, bankId, sampleNames),

  // Device Operations
  detectDevice: () => ipcRenderer.invoke("device:detect"),
  getDeviceStatus: () => ipcRenderer.invoke("device:getStatus"),
  getCurrentBanks: () => ipcRenderer.invoke("device:getCurrentBanks"),
  getCurrentBank: () => ipcRenderer.invoke("device:getCurrentBank"),
  getCurrentPatterns: () => ipcRenderer.invoke("device:getCurrentPatterns"),
  hasBankInfo: () => ipcRenderer.invoke("device:hasBankInfo"),
  getCurrentMode: () => ipcRenderer.invoke("device:getCurrentMode"),
  checkModeRequirement: (operation: string) =>
    ipcRenderer.invoke("device:checkModeRequirement", operation),
  waitForMode: (requiredMode: string, timeoutMs?: number) =>
    ipcRenderer.invoke("device:waitForMode", requiredMode, timeoutMs),
  ejectDevice: () => ipcRenderer.invoke("device:eject"),
  retryModeDetection: () => ipcRenderer.invoke("device:retryModeDetection"),

  // File System Operations
  selectBackupLocation: () => ipcRenderer.invoke("fs:selectBackupLocation"),
  selectRestoreFile: () => ipcRenderer.invoke("fs:selectRestoreFile"),
  discoverBackups: () => ipcRenderer.invoke("fs:discoverBackups"),
  getBackupDetails: (backupPath: string) =>
    ipcRenderer.invoke("fs:getBackupDetails", backupPath),
  renameBackup: (backupPath: string, newName: string) =>
    ipcRenderer.invoke("fs:renameBackup", backupPath, newName),
  getBackupPath: () => ipcRenderer.invoke("fs:getBackupPath"),
  setBackupPath: (newPath: string) => ipcRenderer.invoke("fs:setBackupPath", newPath),

  // Event Listeners
  onDeviceStatusChanged: (callback: (status: any) => void) => {
    ipcRenderer.on("device:status-changed", (_, status) => callback(status));
  },

  onMenuAction: (action: string, callback: () => void) => {
    ipcRenderer.on(`menu:${action}`, callback);
  },

  onNavigate: (callback: (view: string) => void) => {
    ipcRenderer.on("menu:navigate", (_, view) => callback(view));
  },

  // Menu-specific event handlers
  onMenuNewBackup: (callback: () => void) => {
    ipcRenderer.on("menu:new-backup", callback);
  },

  // File copy success event listener
  onFileCopySuccess: (
    callback: (data: { fileName: string; message: string }) => void
  ) => {
    ipcRenderer.on("file-copy-success", (_, data) => callback(data));
  },

  // Remove listeners
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // Window controls
  windowClose: () => ipcRenderer.invoke("window:close"),
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),

  // Logging
  sendLog: (logEntry: any) => ipcRenderer.invoke("log:write", logEntry),
  getLogLevel: () => ipcRenderer.invoke("log:getLevel"),
  setLogLevel: (level: number) => ipcRenderer.invoke("log:setLevel", level),
  getLogDirectory: () => ipcRenderer.invoke("log:getDirectory"),
  getLogFiles: () => ipcRenderer.invoke("log:getFiles"),
  clearLogs: () => ipcRenderer.invoke("log:clear"),
});

// Window.electronAPI type is declared in src/declarations.d.ts (shared with renderer)
