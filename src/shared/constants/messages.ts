export const ERROR_MESSAGES = {
  // Connection errors
  DEVICE_NOT_CONNECTED: "P6 device not connected",
  CONNECTION_FAILED: "Connection failed",
  DEVICE_DETECTION_FAILED: "Device detection failed",
  DEVICE_NOT_FOUND:
    "Roland P6 device not detected. Please ensure the device is connected and in the correct mode.",

  // Mode errors
  MODE_SWITCH_FAILED: "Mode switch failed",
  MODE_SWITCH_TIMEOUT:
    "Timeout waiting for device mode switch. Please ensure device is in the correct mode and try again.",
  MODE_DETECTION_FAILED:
    "Failed to detect required device mode. Please check device connection and mode.",
  DEVICE_MODE_INVALID: "Device must be in the correct mode for this operation",

  // Backup errors
  BACKUP_FAILED: "Backup operation failed",
  BACKUP_FOLDER_NOT_FOUND:
    "Backup folder not found on the device. Please verify the device is in backup mode.",
  BACKUP_FOLDER_EMPTY:
    "The backup folder on the device is empty or inaccessible.",
  BACKUP_FOLDER_INACCESSIBLE: "Cannot access the backup folder on the device.",

  // Restore errors
  RESTORE_FAILED: "Restore operation failed",
  PATTERN_RESTORE_FAILED: "Pattern restore failed",
  SAMPLE_RESTORE_FAILED: "Sample restore failed",
  RESTORE_FOLDER_NOT_FOUND:
    "Restore folder not found on the device. Please verify the device is in restore mode.",
  INVALID_BACKUP_FILE: "Invalid backup file or corrupted data.",
  BANK_NOT_FOUND_IN_BACKUP: (bankId: string) =>
    `Bank ${bankId.toUpperCase()} not found in backup`,

  // File system errors
  FAILED_TO_SELECT_BACKUP: "Failed to select backup",
  FAILED_TO_SELECT_DIRECTORY: "Failed to select directory",
  INSUFFICIENT_SPACE: "Insufficient disk space for backup operation.",
  PERMISSION_DENIED: "Permission denied. Please check file system permissions.",
  FILE_COPY_FAILED: "Failed to copy file",
  DIRECTORY_COPY_FAILED: "Failed to copy directory",

  // Data reading/writing errors
  FAILED_TO_READ_PATTERNS: "Failed to read patterns from device",
  FAILED_TO_READ_SAMPLES: "Failed to read samples from device",
  FAILED_TO_READ_BANK_DATA: (bankId: string) =>
    `Failed to read bank ${bankId} data`,
  FAILED_TO_WRITE_PATTERNS: "Failed to write patterns to device",
  FAILED_TO_WRITE_SAMPLES: "Failed to write samples to device",
  COULD_NOT_READ_PATTERNS: "Could not read patterns from device",
  COULD_NOT_READ_SAMPLES: (bankId?: string) =>
    bankId
      ? `Could not read samples from bank ${bankId}`
      : "Could not read all samples",

  // Preset errors
  FAILED_TO_SAVE_PRESET: "Failed to save preset",
  FAILED_TO_LOAD_PRESET: "Failed to load preset",
  FAILED_TO_DELETE_PRESET: "Failed to delete preset",
  FAILED_TO_DUPLICATE_PRESET: "Failed to duplicate preset",
  FAILED_TO_UPDATE_PRESET: "Failed to update preset",
  FAILED_TO_GET_PRESETS_BY_TYPE: "Failed to get presets by type",
  FAILED_TO_SEARCH_PRESETS: "Failed to search presets",
  FAILED_TO_EXPORT_PRESET: "Failed to export preset",
  FAILED_TO_IMPORT_PRESET: "Failed to import preset",
  FAILED_TO_GET_PRESET_STATS: "Failed to get preset stats",

  // Generic errors
  OPERATION_TIMEOUT: "Operation timed out. Please try again.",
  UNKNOWN_ERROR: "An unknown error occurred. Please try again.",
  UNKNOWN_DATA_TYPE: (dataType: string) => `Unknown data type: ${dataType}`,
  MASS_STORAGE_NOT_AVAILABLE: "Mass storage not available",

  // Application errors
  FAILED_TO_INITIALIZE_APPLICATION: "Failed to initialize application",
  FAILED_TO_UPDATE_PRESET_LAST_USED: "Failed to update preset last used",
  FAILED_TO_FETCH_BANK_INFO: "Failed to fetch bank info",
  FAILED_TO_FETCH_AVAILABLE_BANKS: "Failed to fetch available banks",
  FAILED_TO_LOAD_PRESETS: "Failed to load presets",

  // USB errors
  FAILED_TO_READ_MANUFACTURER: "Failed to read manufacturer",
  FAILED_TO_READ_PRODUCT: "Failed to read product",
  FAILED_TO_READ_SERIAL: "Failed to read serial",
  USB_ENUMERATION_FAILED: "USB enumeration failed",
  CONNECTION_CHECK_FAILED: "Connection check failed",
  READINESS_CHECK_FAILED: "Readiness check failed",

  // Device ejection errors
  DEVICE_EJECT_FAILED:
    "Failed to eject P6 device safely. You may manually disconnect the device.",

  // Backup validation
  BACKUP_DEVICE_DISCONNECTED: "Device must be connected to proceed with backup",
  BACKUP_WRONG_BANK: (deviceBank: string, targetBank: string) =>
    `Device is currently set to bank ${deviceBank.toUpperCase()} but trying to backup bank ${targetBank.toUpperCase()}. Please switch to bank ${targetBank.toUpperCase()} on your device and try again.`,
  BACKUP_BANK_NOT_AVAILABLE: (targetBank: string, availableBanks: string[]) =>
    `Bank ${targetBank.toUpperCase()} is not available on the device. Available banks: ${availableBanks.join(
      ", ",
    )}. Please check your device setup.`,

  // Parameter validation errors
  BANK_ID_REQUIRED: "Bank ID is required for sample operations",
} as const;

export const SUCCESS_MESSAGES = {
  // Connection success
  DEVICE_DETECTED: "Roland P6 device detected and ready.",
  DEVICE_CONNECTED_AND_READY: "P6 device connected and ready",

  // Backup success
  BACKUP_COMPLETED: "Backup completed successfully.",
  PATTERNS_BACKED_UP: (count: number) =>
    `Successfully backed up ${count} patterns`,
  SAMPLES_BACKED_UP_BANK: (bankId: string, count: number) =>
    `Successfully backed up bank ${bankId.toUpperCase()} (${count} samples)`,
  SAMPLES_BACKED_UP_ALL: (count: number) =>
    `Successfully backed up all sample banks (${count} samples)`,

  // Restore success
  RESTORE_COMPLETED: "Restore completed successfully.",
  PATTERN_RESTORE_COMPLETED: "Pattern restore completed successfully!",
  SAMPLE_RESTORE_COMPLETED: "Sample restore completed successfully!",
  PATTERNS_RESTORED: (count: number) =>
    `Successfully restored ${count} patterns`,
  SAMPLES_RESTORED_BANK: (bankId: string, count: number) =>
    `Successfully restored bank ${bankId.toUpperCase()} (${count} samples)`,
  SAMPLES_RESTORED_ALL: (count: number) =>
    `Successfully restored all sample banks (${count} samples)`,

  // File operations success
  FILE_COPIED: (fileName: string) => `Copied pattern: ${fileName}`,
  BANK_COPIED: (bankId: string) =>
    `Copied bank ${bankId.toUpperCase()} to IMPORT folder`,
  PATTERNS_WRITTEN: (count: number) =>
    `Successfully wrote ${count} patterns to device`,
  SAMPLES_WRITTEN: (count: number, bankId: string) =>
    `Successfully wrote ${count} samples to bank ${bankId.toUpperCase()}`,
  SAMPLE_PROCESSED: (sampleName: string, padNumber: string) =>
    `Successfully processed sample ${
      sampleName || "unnamed"
    } from pad ${padNumber}`,
  INFO_FILE_UPDATED: (count: number) =>
    `Updated info.txt with ${count} entries`,

  // Preset success
  PRESET_SAVED: "Preset saved successfully.",
  PRESET_LOADED: "Preset loaded successfully.",

  // Copy operations
  FILE_COPY_SUCCESS: (source: string, dest: string) =>
    `Successfully copied ${source} to ${dest}`,
  MANUAL_COPY_SUCCESS: (source: string, dest: string) =>
    `Successfully copied ${source} to ${dest} (manual)`,

  // Device ejection success
  DEVICE_EJECTED:
    "P6 device ejected safely. You can now disconnect the device.",
} as const;

export const STATUS_MESSAGES = {
  // Connection status
  DEVICE_CONNECTING: "Attempting to connect to Roland P6...",
  DEVICE_ALREADY_CONNECTED: "P6 already connected",
  DEVICE_DISCONNECTED: "Current P6 device disconnected",

  // Operation status
  BACKING_UP_PATTERNS: "Backing up patterns...",
  BACKING_UP_SAMPLES: "Backing up all sample banks...",
  BACKING_UP_SAMPLE_BANK: (bankId: string) =>
    `Backing up sample bank ${bankId.toUpperCase()}...`,
  RESTORING_PATTERNS: "Restoring patterns...",
  RESTORING_SAMPLES: "Restoring all sample banks...",
  RESTORING_SAMPLE_BANK: (bankId: string) =>
    `Restoring sample bank ${bankId.toUpperCase()}...`,
  WAITING_FOR_MODE_SWITCH: "Waiting for device mode switch...",

  // Discovery status
  SCANNING_FOR_DEVICES: "Scanning for Roland P6 devices...",
  FOUND_DEVICES: (count: number) => `Found ${count} potential P6 device(s)`,
  FOUND_MASS_STORAGE_MODE: "Found P6 in mass storage mode",
  FOUND_PATTERNS: (count: number) => `Found ${count} patterns`,
  FOUND_SAMPLES_IN_BANK: (count: number, bankId: string) =>
    `Found ${count} samples in bank ${bankId}`,
  FOUND_SAMPLES_ALL_BANKS: (count: number) =>
    `Found ${count} samples across all banks`,
  FOUND_SAMPLES_ARRAY: (count: number, bankId: string) =>
    `Found ${count} samples (array) in bank ${bankId}`,
  FOUND_SAMPLES_OBJECT: (count: number, bankKey: string, bankId: string) =>
    `Found ${count} samples (object[${bankKey}]) in bank ${bankId}`,

  // Mode status
  MAPPING_MASS_STORAGE_MODE: "Mapping mass storage mode",
} as const;

export const INFO_MESSAGES = {
  // Device requirements
  DEVICE_MUST_BE_CONNECTED:
    "Device must be connected to perform restore operations",
  DEVICE_MUST_BE_CONNECTED_FOR_PATTERN_RESTORE:
    "Device must be connected for pattern restore",
  DEVICE_MUST_BE_CONNECTED_FOR_SAMPLE_RESTORE:
    "Device must be connected for sample restore",
  PLEASE_SELECT_BACKUP: "Please select a backup to restore",

  // Mode requirements
  DEVICE_MUST_BE_IN_PATTERN_MODE: "Device must be in Pattern mode",
  DEVICE_MUST_BE_IN_SAMPLE_MODE: "Device must be in Sample mode",
  HOLD_PLAY_BUTTON: "Hold PLAY button while powering on",
  HOLD_BANK_SAMPLING_BUTTONS: "Hold BANK + SAMPLING buttons while powering on",

  // Backup verification
  BACKUP_PATH_NOT_FOUND:
    "❌ Backup path not found in preset configuration.\n\nThis preset may need to be recreated with a valid backup location.\n\nRemember: You must manually set the Roland P6 to the correct mode using button combinations before using any preset.",
  FAILED_TO_VERIFY_BACKUP:
    "❌ Failed to verify backup.\n\nAn unexpected error occurred during verification.\n\nRemember: The app can only work with the Roland P6 when you manually set it to the correct mode using button combinations while powering on.",

  // Preset instructions
  FAILED_TO_SAVE_PRESET_INSTRUCTION:
    "Failed to save preset. Please try again.\n\nNote: Make sure the Roland P6 is in the correct mode (manually set using button combinations) if this preset requires device access.",
  FAILED_TO_LOAD_PRESET_INSTRUCTION:
    "Failed to load preset.\n\nMake sure the Roland P6 is connected and in the correct mode.\nYou must manually set the device mode using button combinations while powering on.\n\nRefer to the User Guide for specific instructions.",

  // Full backup notes
  FULL_BACKUP_NOTE:
    "Note: Full backup does not switches device modes automatically",

  // Preset verification info
  PRESET_VERIFIED_INFO: (
    name: string,
    type: string,
    description: string,
    backupPath: string,
    createdAt: Date,
    lastUsed: Date | null,
  ) =>
    `✅ Preset Information Verified\n\nName: ${name}\nType: ${type}\nDescription: ${
      description || "None"
    }\nBackup Path: ${backupPath}\nCreated: ${createdAt.toLocaleString()}\nLast Used: ${
      lastUsed ? lastUsed.toLocaleString() : "Never"
    }\n\n⚠️ Note: This app cannot automatically change device modes.\nTo use this preset, you must manually set the Roland P6 to the correct mode by holding the appropriate button combination while powering on.\n\nRefer to the User Guide for specific button combinations for each mode.`,
} as const;

export const LOG_MESSAGES = {
  // Device logging
  DEVICE_CONNECTED: "Roland P6 device connected",
  DEVICE_DISCONNECTED: "Roland P6 device disconnected",
  DEVICE_STATUS_CHANGED: "BackupSection: Device status changed",
  DEVICE_CONNECTION_STATUS: (connected: boolean, mode: string) =>
    `Device is connected: ${connected}, Mode: ${mode}`,
  CAN_BACKUP_SAMPLES: (canBackup: boolean) =>
    `Can backup samples: ${canBackup}`,

  // Operation logging
  READING_DATA: (dataType: string, parameters?: any) =>
    `Reading data: ${dataType}${
      parameters ? ` ${JSON.stringify(parameters)}` : ""
    }`,
  WRITING_DATA: (dataType: string, data: any, parameters?: any) =>
    `Writing data: ${dataType}${
      parameters ? ` ${JSON.stringify(parameters)}` : ""
    }`,
  BACKUP_SAMPLES_READ_TYPE: (bankId: string, type: string, isArray: boolean) =>
    `backupSamples: read samples from bank ${bankId}, type: ${type} ${
      isArray ? "array" : "not array"
    }`,

  // Copy operations logging
  COPYING_SAMPLES_AS_ARRAY: (count: number, bankId: string) =>
    `Copying ${count} samples as array from bank ${bankId}`,
  COPYING_SAMPLES_FROM_OBJECT: (count: number, bankKey: string) =>
    `Copying ${count} samples from object[${bankKey}]`,
  PROCESSING_SAMPLE: (sample: any) =>
    `Processing sample: ${JSON.stringify({
      pad: sample.pad,
      name: sample.name,
      prmFile: sample.prmFile ? "exists" : "missing",
      wavFile: sample.wavFile ? "exists" : "missing",
      path: sample.path ? "exists" : "missing",
    })}`,

  // File system logging
  COPY_SAMPLES_INPUT_TYPE: (type: string, isArray: boolean, isNull: boolean) =>
    `copySampleFiles - input samples type: ${type} ${
      isArray ? "array" : "not array"
    } ${isNull ? "null" : "non-null"}`,
  READ_SAMPLES_RESULT_TYPE: (bankId: string, type: string, isArray: boolean) =>
    `readSamplesFromBank ${bankId} result type: ${type} ${
      isArray ? "array" : "not array"
    }`,

  // Warning messages
  SKIPPING_NULL_SAMPLE: "Skipping null/undefined sample",
  UNEXPECTED_SAMPLES_FORMAT: (format: string) =>
    `Expected samples to be an array or object, but got: ${format}`,
  UNEXPECTED_BANK_SAMPLES_FORMAT: (format: string) =>
    `Expected bankSamples to be an array, but got: ${format}`,
  BANK_SAMPLES_FORMAT_UNEXPECTED: (bankId: string, keys: string[]) =>
    `Bank ${bankId} samples format unexpected: ${keys.join(", ")}`,
  EXPECTED_SAMPLES_ARRAY: (bankId: string, keys: string[]) =>
    `Expected samples[${bankId}] to be an array, but it's not. Sample structure: ${keys.join(
      ", ",
    )}`,
  GOT_ARRAY_NO_BANK_ID:
    "Got an array of samples but no bankId specified. Using 'unknown' as bank.",
  ALL_BANKS_UNEXPECTED_FORMAT: (type: string, isArray: boolean) =>
    `All banks read returned unexpected format: ${type} ${
      isArray ? "array" : "not array"
    }`,

  // USB warnings
  PRM_PATH_NOT_FILE: (path: string) => `PRM path is not a file: ${path}`,
  WAV_PATH_NOT_FILE: (path: string) => `WAV path is not a file: ${path}`,
  ERROR_COPYING_PRM: "Error copying PRM file",
  ERROR_COPYING_WAV: "Error copying WAV file",
} as const;

export const OPERATION_NAMES = {
  BACKUP: "Backup",
  RESTORE: "Restore",
} as const;

export const UI_LABELS = {
  // Button labels
  SELECT_BACKUP_FOLDER: "Select Backup Folder",
  RESTORE_PATTERNS: "Restore Patterns",
  RESTORE_ALL_BANKS: "Restore All Banks",
  TRY_AGAIN: "Try Again",
  DISMISS: "Dismiss",
  CANCEL: "Cancel",
  CONTINUE: "Continue",
  READY: "Ready",
  CONTINUE_COUNTDOWN: (countdown: number) => `Continue (${countdown})`,
  CREATE_PRESET: "Create Preset",
  SAVE_PRESET: "Save Preset",
  LOAD: "Load",
  VERIFY: "Verify",
  DELETE: "Delete",
  BROWSE: "Browse",
  SKIP_BANK: "Skip Bank",
  RETRY: "Retry",
  AUTO_CONTINUE: "Auto Continue",

  // Section titles
  RESTORE_OPERATIONS: "Restore Operations",
  BACKUP_PRESETS: "Backup Presets",
  SELECT_BACKUP: "Select Backup",
  PATTERN_RESTORE: "Pattern Restore",
  SAMPLE_RESTORE: "Sample Restore",
  PATTERN_BACKUP: "Pattern Backup",
  SAMPLE_BACKUP: "Sample Backup",
  USER_GUIDE_TITLE: "Roland P6 Backup Guide",
  USER_GUIDE_SUBTITLE: "Quick reference for backup and restore operations",

  // Descriptions
  RESTORE_PATTERN_PRESETS: "Restore pattern presets to device",
  RESTORE_SAMPLE_BANKS: "Restore sample banks to device",
  BACKUP_ALL_PATTERN_PRESETS: "Backup all pattern presets",
  BACKUP_SAMPLE_BANKS: "Backup sample banks",
  BACKUP_EVERYTHING: "Backup everything (patterns and samples)",

  // Modal titles
  MODE_SWITCH_REQUIRED: "Mode Switch Required",
  OPERATION_FAILED: "Operation Failed",

  // Mode switch messages
  MODE_SWITCH_OPERATION_MESSAGE: (operation: string) =>
    `To perform ${operation}, your Roland P6 needs to be in a different mode.`,
  MODE_SWITCH_CONTINUE_MESSAGE: (operation: string) =>
    `Once you've switched modes, click "Continue" to proceed with the ${operation}.`,

  // Mode display names
  MODE_PATTERN_DISPLAY: "Pattern Mode",
  MODE_SAMPLE_DISPLAY: "Sample Mode",
  MODE_UNKNOWN_DISPLAY: "Unknown Mode",

  // Mode instructions
  MODE_INSTRUCTION_PATTERN:
    "Hold [ø] while powering on for pattern backup. Hold [REC] while powering on for pattern restore.",
  MODE_INSTRUCTION_SAMPLE:
    "Hold bank buttons [A/E]–[D/H] while powering on for sample export. Hold [SAMPLING] while powering on for sample import.",
  MODE_INSTRUCTION_DEFAULT: (mode: string) => `Switch your P6 to ${mode} mode.`,

  // Mode labels
  CURRENT_MODE_LABEL: "Current Mode:",
  REQUIRED_MODE_LABEL: "Required Mode:",
  MODE_INSTRUCTIONS_LABEL: "Instructions:",

  // Progress indicators
  PROGRESS_PERCENT: (percent: number) => `${percent}%`,
  SELECTED_PATH: (path: string) => `Selected: ${path}`,
  PROGRESS_TITLE: "Progress",

  // Automated backup messages
  BANK_SWITCHING_INSTRUCTION: (bankId: string) =>
    `Hold BANK ${bankId.toUpperCase()} + SAMPLING buttons while powering on`,
  BACKING_UP_BANK: (bankId: string) =>
    `Backing up Bank ${bankId.toUpperCase()}`,
  PLEASE_WAIT_DO_NOT_DISCONNECT: "Please wait, do not disconnect device",

  // Device status messages
  DETECTING_DEVICE: "Detecting device...",
  DETECT_DEVICE: "Detect Device",
  NOT_CONNECTED: "Not connected",
  CONNECTED_MODE: (mode: string) => {
    const names: Record<string, string> = {
      pattern_export: "Pattern Backup",
      pattern_import: "Pattern Restore",
      sample_export: "Sample Backup",
      sample_import: "Sample Restore",
      pattern: "Pattern",
      sample: "Sample",
      normal: "Normal",
      unknown: "Unknown",
    };
    return `Connected \u2014 ${names[mode] ?? mode} Mode`;
  },
  BANK_INFO: (bank: string) => ` (Bank ${bank.toUpperCase()})`,
  BANKS_INFO: (banks: string[]) =>
    ` (Banks: ${banks.map((b) => b.toUpperCase()).join(", ")})`,
  DEVICE_STATUS_TITLE: "Device Status",

  // Header navigation labels
  APP_TITLE: "P-6 Backup Tool",
  NAV_BACKUP: "Backup",
  NAV_RESTORE: "Restore",
  NAV_PRESETS: "Presets",
  NAV_GUIDE: "Guide",
  NAV_SETTINGS: "Settings",

  // Guide section titles
  GUIDE_PATTERN_BACKUP: "Pattern Backup",
  GUIDE_PATTERN_RESTORE: "Pattern Restore",
  GUIDE_SAMPLE_BACKUP: "Sample Backup",
  GUIDE_SAMPLE_RESTORE: "Sample Restore",

  // Form placeholders
  PLACEHOLDER_PRESET_NAME: "Preset name",
  PLACEHOLDER_DESCRIPTION: "Description (optional)",
  PLACEHOLDER_BACKUP_PATH: "Backup path (optional)",
  PLACEHOLDER_SEARCH_PRESETS: "Search presets...",
} as const;
