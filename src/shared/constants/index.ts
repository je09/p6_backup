// Export all constants from individual files
export * from "./messages";
export * from "./device";

import { MODE_ENTRY_INSTRUCTIONS } from "./device";

// Note: LOG_MESSAGES is exported separately to avoid naming conflicts
export { LOG_MESSAGES } from "./log";

// Additional common constants that don't fit into the main categories
export const DEVICE_CONSTANTS = {
  CONNECTION_CHECK_INTERVAL: 5000, // 5 seconds
  DETECTION_TIMEOUT: 5000,
  OPERATION_TIMEOUT: 30000, // 30 seconds
  MODE_CHANGE_TIMEOUT: 10000, // 10 seconds
  AUTO_DETECTION_INTERVAL: 8000, // 8 seconds
  RECONNECTION_DELAY: 1000, // 1 second delay for reconnection

  // Sourced from MODE_ENTRY_INSTRUCTIONS so there is one statement of which
  // button reaches which mode.
  MODE_INSTRUCTIONS: {
    pattern:
      "For pattern backup: Hold [ø] while powering on. For pattern restore: Hold [REC] while powering on.",
    sample:
      "For sample export: Hold bank buttons [A/E]–[D/H] while powering on (+ [SAMPLING] for banks E–H). For sample import: Hold [SAMPLING] while powering on.",
    ...MODE_ENTRY_INSTRUCTIONS,
  } as Record<string, string>,

  MODE_DESCRIPTIONS: {
    pattern: "Pattern Mode - Ready for pattern backup/restore operations",
    sample: "Sample Mode - Ready for sample backup/restore operations",
    pattern_export:
      "Pattern Backup Mode - Device has BACKUP folder for exporting patterns",
    pattern_import:
      "Pattern Restore Mode - Device has RESTORE folder for importing patterns",
    sample_export:
      "Sample Export Mode - Device has EXPORT folder with BANK_<letter> folders for exporting samples",
    sample_import:
      "Sample Import Mode - Device has IMPORT folder for importing samples",
    unknown: "Unknown Mode - Device mode could not be determined",
  } as Record<string, string>,
} as const;

export const BACKUP_CONSTANTS = {
  MAX_BACKUP_SIZE: 100 * 1024 * 1024, // 100MB
  BACKUP_FILE_EXTENSION: ".p6backup",
  PATTERN_FILE_EXTENSION: ".RPM",
  SAMPLE_FILE_EXTENSION: ".wav",
  MANIFEST_FILENAME: "manifest.json",
  BACKUP_FILE_EXTENSIONS: [".p6b", ".backup"],
  DEFAULT_BACKUP_FOLDER: "P6_Backups",
  BANK_FOLDER_PREFIX: "BANK_",

  FOLDERS: {
    BACKUP: "BACKUP",
    RESTORE: "RESTORE",
    EXPORT: "EXPORT",
    IMPORT: "IMPORT",
  },

  SAMPLE_BANKS: ["A", "B", "C", "D", "E", "F", "G", "H"],
} as const;


