import { IElectronBridge } from "./IElectronBridge";

/**
 * Thin adapter that delegates every call to window.electronAPI.
 * Inject this (or a mock) via ElectronBridgeContext — do NOT call
 * window.electronAPI directly from components or hooks.
 */
export class ElectronBridge implements IElectronBridge {
  private get api() {
    return window.electronAPI;
  }

  // Backup & Restore
  backupPatterns(customName?: string, patternIds?: string[]) { return this.api.backupPatterns(customName, patternIds); }
  backupSamples(bankId?: string, customName?: string, padNumbers?: number[]) { return this.api.backupSamples(bankId, customName, padNumbers); }
  organizeBackup(options: Parameters<IElectronBridge["organizeBackup"]>[0]) { return this.api.organizeBackup(options); }
  restorePatterns(backupPath: string, patternIds?: string[]) { return this.api.restorePatterns(backupPath, patternIds); }
  restoreSamples(backupPath: string, bankId?: string, sampleNames?: string[]) { return this.api.restoreSamples(backupPath, bankId, sampleNames); }

  // Device
  detectDevice() { return this.api.detectDevice(); }
  getDeviceStatus() { return this.api.getDeviceStatus(); }
  getCurrentBanks() { return this.api.getCurrentBanks(); }
  getCurrentBank() { return this.api.getCurrentBank(); }
  getCurrentPatterns() { return this.api.getCurrentPatterns(); }
  hasBankInfo() { return this.api.hasBankInfo(); }
  getCurrentMode() { return this.api.getCurrentMode(); }
  checkModeRequirement(operation: string) { return this.api.checkModeRequirement(operation); }
  waitForMode(requiredMode: string, timeoutMs?: number) { return this.api.waitForMode(requiredMode, timeoutMs); }
  ejectDevice() { return this.api.ejectDevice(); }
  retryModeDetection() { return this.api.retryModeDetection(); }

  // Files
  selectBackupLocation() { return this.api.selectBackupLocation(); }
  selectRestoreFile() { return this.api.selectRestoreFile(); }
  discoverBackups() { return this.api.discoverBackups(); }
  getBackupDetails(backupPath: string) { return this.api.getBackupDetails(backupPath); }
  renameBackup(backupPath: string, newName: string) { return this.api.renameBackup(backupPath, newName); }

  // Events
  onDeviceStatusChanged(callback: Parameters<IElectronBridge["onDeviceStatusChanged"]>[0]) { return this.api.onDeviceStatusChanged(callback); }
  onMenuNewBackup(callback: () => void) { return this.api.onMenuNewBackup(callback); }
  onNavigationShowGuide(callback: () => void) { return this.api.onNavigationShowGuide(callback); }
  onFileCopySuccess(callback: Parameters<IElectronBridge["onFileCopySuccess"]>[0]) { return this.api.onFileCopySuccess(callback); }
  removeAllListeners(channel: string) { return this.api.removeAllListeners(channel); }

  // Window
  windowClose() { return this.api.windowClose(); }
  windowMinimize() { return this.api.windowMinimize(); }

  // Logging
  sendLog(logEntry: Parameters<IElectronBridge["sendLog"]>[0]) { return this.api.sendLog(logEntry); }
  getLogLevel() { return this.api.getLogLevel(); }
  setLogLevel(level: number) { return this.api.setLogLevel(level); }
  getLogDirectory() { return this.api.getLogDirectory(); }
  getLogFiles() { return this.api.getLogFiles(); }
  clearLogs() { return this.api.clearLogs(); }
}

export const electronBridge = new ElectronBridge();
