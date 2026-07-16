import { DeviceMode } from "../types/index";
import { MODE_LABELS } from "./device";

export const ERROR_MESSAGES = {
  DEVICE_NOT_CONNECTED: "P6 device not connected",
  UNKNOWN_ERROR: "An unknown error occurred. Please try again.",
  UNKNOWN_DATA_TYPE: (dataType: string) => `Unknown data type: ${dataType}`,
  MASS_STORAGE_NOT_AVAILABLE: "Mass storage not available",
  BANK_ID_REQUIRED: "Bank ID is required for sample operations",
  BACKUP_WRONG_BANK: (deviceBank: string, targetBank: string) =>
    `Device is currently set to bank ${deviceBank.toUpperCase()} but trying to backup bank ${targetBank.toUpperCase()}. Please switch to bank ${targetBank.toUpperCase()} on your device and try again.`,
  BACKUP_BANK_NOT_AVAILABLE: (targetBank: string, availableBanks: string[]) =>
    `Bank ${targetBank.toUpperCase()} is not available on the device. Available banks: ${availableBanks.join(
      ", ",
    )}. Please check your device setup.`,
} as const;

export const SUCCESS_MESSAGES = {
  FILE_COPY_SUCCESS: (source: string, dest: string) =>
    `Copied ${source} to ${dest}`,
  MANUAL_COPY_SUCCESS: (source: string, dest: string) =>
    `Copied ${source} to ${dest} (manual)`,
} as const;

export const UI_LABELS = {
  APP_TITLE: "P-6 Backup Tool",
  NAV_BACKUP: "Backup",
  NAV_RESTORE: "Restore",
  NAV_SETTINGS: "Settings",
  NAV_GUIDE: "Guide",

  CANCEL: "Cancel",
  CONTINUE: "Continue",

  // Device status
  DETECTING_DEVICE: "Detecting device...",
  NOT_CONNECTED: "Not connected",
  CONNECTED_MODE: (mode: DeviceMode) =>
    `Connected — ${MODE_LABELS[mode]} Mode`,
  BANK_INFO: (bank: string) => ` (Bank ${bank.toUpperCase()})`,
  BANKS_INFO: (banks: string[]) =>
    ` (Banks: ${banks.map((b) => b.toUpperCase()).join(", ")})`,

  // Mode switch modal
  MODE_SWITCH_REQUIRED: "Mode Switch Required",
  MODE_SWITCH_OPERATION_MESSAGE: (operation: string) =>
    `To perform ${operation}, your Roland P6 needs to be in a different mode.`,
  CURRENT_MODE_LABEL: "Current Mode:",
  REQUIRED_MODE_LABEL: "Required Mode:",
  MODE_INSTRUCTIONS_LABEL: "Instructions:",
} as const;
