/**
 * Channel names for the main↔renderer bridge. Both sides import these: a
 * channel is only a string, so a typo on either side compiles cleanly and then
 * fails silently at runtime.
 */

/** Renderer-invoked, main-handled. */
export const IPC = {
  WINDOW_CLOSE: "window:close",
  WINDOW_MINIMIZE: "window:minimize",

  BACKUP_PATTERNS: "backup:patterns",
  BACKUP_SAMPLES: "backup:samples",
  BACKUP_ORGANIZE: "backup:organize",

  RESTORE_PATTERNS: "restore:patterns",
  RESTORE_SAMPLES: "restore:samples",

  DEVICE_DETECT: "device:detect",
  DEVICE_GET_STATUS: "device:getStatus",
  DEVICE_GET_CURRENT_BANKS: "device:getCurrentBanks",
  DEVICE_GET_CURRENT_BANK: "device:getCurrentBank",
  DEVICE_HAS_BANK_INFO: "device:hasBankInfo",
  DEVICE_GET_CURRENT_PATTERNS: "device:getCurrentPatterns",
  DEVICE_CHECK_MODE_REQUIREMENT: "device:checkModeRequirement",
  DEVICE_EJECT: "device:eject",
  DEVICE_RETRY_MODE_DETECTION: "device:retryModeDetection",

  FS_SELECT_BACKUP_LOCATION: "fs:selectBackupLocation",
  FS_DISCOVER_BACKUPS: "fs:discoverBackups",
  FS_GET_BACKUP_DETAILS: "fs:getBackupDetails",
  FS_RENAME_BACKUP: "fs:renameBackup",
  FS_GET_BACKUP_PATH: "fs:getBackupPath",
  FS_SET_BACKUP_PATH: "fs:setBackupPath",

  LOG_WRITE: "log:write",
  LOG_GET_LEVEL: "log:getLevel",
} as const;

/** Pushed from main to the renderer. */
export const IPC_EVENTS = {
  DEVICE_STATUS_CHANGED: "device:status-changed",
  MENU_NAVIGATE: "menu:navigate",
  MENU_NEW_BACKUP: "menu:new-backup",
  FILE_COPY_SUCCESS: "file-copy-success",
} as const;
