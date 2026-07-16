export * from "./messages";
export * from "./device";
export * from "./ipc";

export const DEVICE_CONSTANTS = {
  /** How often to check a connected device is still there. */
  CONNECTION_CHECK_INTERVAL: 5000,
  /** How often to look for a device while none is connected. */
  AUTO_DETECTION_INTERVAL: 8000,
  /** Grace period before a failed connection check is believed. */
  CONNECTION_RETRY_DELAY: 500,
} as const;

export const BACKUP_CONSTANTS = {
  /** Marker folders the device exposes, one per mass storage mode. */
  FOLDERS: {
    BACKUP: "BACKUP",
    RESTORE: "RESTORE",
    EXPORT: "EXPORT",
    IMPORT: "IMPORT",
  },

  BANK_PREFIX: "BANK_",
  PAD_PREFIX: "PAD_",
  MANIFEST_FILENAME: "manifest.json",
  PATTERNS_FILENAME: "patterns.json",
  SAMPLES_FILENAME: "samples.json",
  /** Where a backup keeps the payload it copied off the device. */
  FILES_DIRNAME: "files",

  SAMPLE_BANKS: ["A", "B", "C", "D", "E", "F", "G", "H"],

  /**
   * Bytes the P-6 accepts per import session. Restoring more than this needs
   * the user to power-cycle the device, so a restore is planned in batches
   * that each stay under it.
   */
  MAX_SESSION_BYTES: 10 * 1024 * 1024,
} as const;
