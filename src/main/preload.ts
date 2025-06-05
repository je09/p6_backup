import { contextBridge, ipcRenderer } from "electron";

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Backup Operations
  backupPatterns: (customName?: string) =>
    ipcRenderer.invoke("backup:patterns", customName),
  backupSamples: (bankId?: string, customName?: string) =>
    ipcRenderer.invoke("backup:samples", bankId, customName),
  fullBackup: (customName?: string) =>
    ipcRenderer.invoke("backup:full", customName),
  combinedBackup: (options: {
    includePatterns?: boolean;
    includeSamples?: boolean;
    bankIds?: string[];
    customName?: string;
  }) => ipcRenderer.invoke("backup:combined", options),
  organizeCombinedBackup: (options: {
    includePatterns?: boolean;
    includeSamples?: boolean;
    bankIds?: string[];
    precompletedResults?: any[];
    customName?: string;
  }) => ipcRenderer.invoke("backup:organizeCombined", options),

  // Restore Operations
  restorePatterns: (backupPath: string) =>
    ipcRenderer.invoke("restore:patterns", backupPath),
  restoreSamples: (backupPath: string, bankId?: string) =>
    ipcRenderer.invoke("restore:samples", backupPath, bankId),

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

  // Event Listeners
  onDeviceStatusChanged: (callback: (status: any) => void) => {
    ipcRenderer.on("device:status-changed", (_, status) => callback(status));
  },

  onMenuAction: (action: string, callback: () => void) => {
    ipcRenderer.on(`menu:${action}`, callback);
  },

  onNavigationRequest: (callback: (route: string) => void) => {
    ipcRenderer.on("navigation:show-guide", (_, route) => callback(route));
  },

  // Menu-specific event handlers
  onMenuNewBackup: (callback: () => void) => {
    ipcRenderer.on("menu:new-backup", callback);
  },

  onNavigationShowGuide: (callback: () => void) => {
    ipcRenderer.on("navigation:show-guide", callback);
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

  // Logging
  sendLog: (logEntry: any) => ipcRenderer.invoke("log:write", logEntry),
  getLogLevel: () => ipcRenderer.invoke("log:getLevel"),
  setLogLevel: (level: number) => ipcRenderer.invoke("log:setLevel", level),
  getLogDirectory: () => ipcRenderer.invoke("log:getDirectory"),
  getLogFiles: () => ipcRenderer.invoke("log:getFiles"),
  clearLogs: () => ipcRenderer.invoke("log:clear"),
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      backupPatterns: (customName?: string) => Promise<any>;
      backupSamples: (bankId?: string, customName?: string) => Promise<any>;
      fullBackup: (customName?: string) => Promise<any>;
      combinedBackup: (options: {
        includePatterns?: boolean;
        includeSamples?: boolean;
        bankIds?: string[];
        customName?: string;
      }) => Promise<any>;
      organizeCombinedBackup: (options: {
        includePatterns?: boolean;
        includeSamples?: boolean;
        bankIds?: string[];
        precompletedResults?: any[];
        customName?: string;
      }) => Promise<any>;
      restorePatterns: (backupPath: string) => Promise<any>;
      restoreSamples: (backupPath: string, bankId?: string) => Promise<any>;
      detectDevice: () => Promise<boolean>;
      getDeviceStatus: () => Promise<any>;
      getCurrentBanks: () => Promise<string[] | null>;
      getCurrentBank: () => Promise<string | null>;
      getCurrentPatterns: () => Promise<any>;
      hasBankInfo: () => Promise<boolean>;
      getCurrentMode: () => Promise<string>;
      checkModeRequirement: (operation: string) => Promise<any>;
      waitForMode: (requiredMode: string, timeoutMs?: number) => Promise<any>;
      ejectDevice: () => Promise<boolean>;
      retryModeDetection: () => Promise<string>;
      selectBackupLocation: () => Promise<string | null>;
      selectRestoreFile: () => Promise<string | null>;
      discoverBackups: () => Promise<any[]>;
      getBackupDetails: (backupPath: string) => Promise<any>;
      onDeviceStatusChanged: (callback: (status: any) => void) => void;
      onMenuAction: (action: string, callback: () => void) => void;
      onNavigationRequest: (callback: (route: string) => void) => void;
      onMenuNewBackup: (callback: () => void) => void;
      onNavigationShowGuide: (callback: () => void) => void;
      onFileCopySuccess: (
        callback: (data: { fileName: string; message: string }) => void
      ) => void;
      removeAllListeners: (channel: string) => void;
      sendLog: (logEntry: any) => Promise<void>;
      getLogLevel: () => Promise<number>;
      setLogLevel: (level: number) => Promise<void>;
      getLogDirectory: () => Promise<string>;
      getLogFiles: () => Promise<string[]>;
      clearLogs: () => Promise<void>;
    };
  }
}
