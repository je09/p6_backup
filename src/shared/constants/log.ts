export const LOG_MESSAGES = {
    // Connection logging
    ATTEMPTING_CONNECTION: 'Attempting to connect to Roland P6...',
    DEVICE_CONNECTED: 'Roland P6 device connected:',
    DEVICE_DISCONNECTED: 'Roland P6 device disconnected:',
    ALREADY_CONNECTED: 'P6 already connected',
    DEVICE_READY: 'P6 device connected and ready',
    CURRENT_DEVICE_DISCONNECTED: 'Current P6 device disconnected',
    CONNECTION_LOST: 'Connection to device lost',
    CONNECTION_FAILED: 'Failed to connect to device:',
    CONNECTION_CHECK_FAILED: 'Connection check failed:',
    CONNECTION_MONITORING_ERROR: 'Error monitoring connection:',
    DEVICE_ALREADY_CONNECTED: 'Device already connected',
    DEVICE_DETECTED: 'Roland P6 device detected and ready',
    DEVICE_DETECTION_FAILED: 'Device detection failed:',

    // Mode logging
    MAPPING_MASS_STORAGE_MODE: 'Mapping mass storage mode:',
    DETECTING_DEVICE_MODE: 'Detecting current device mode...',
    CURRENT_MODE: 'Current device mode:',
    MODE_SWITCH_REQUESTED: (mode: string) => `Requested mode switch to: ${mode}`,
    MODE_SWITCH_COMPLETE: (mode: string) => `Mode switch complete. New mode: ${mode}`,
    RAW_DEVICE_MODE: (rawMode: string, mappedMode: string) => `Raw device mode: ${rawMode}, mapped to: ${mappedMode}`,
    FOUND_MASS_STORAGE_MODE: 'Found device in mass storage mode:',
    ERROR_GETTING_MODE: 'Error getting device mode:',

    // Operation logging
    STARTING_BACKUP: 'Starting backup operation...',
    STARTING_RESTORE: 'Starting restore operation...',
    OPERATION_COMPLETE: (type: string) => `${type} operation completed successfully`,
    CHECKING_STATUS: 'Checking device status...',
    SCANNING_DEVICES: 'Scanning for P6 devices...',
    FOUND_DEVICES: (count: number) => `Found ${count} P6 devices:`,
    STARTING_AUTO_DETECTION: 'Starting auto-detection...',
    AUTO_DETECTION_ERROR: 'Auto-detection error:',

    // File operations
    READING_FILE: (path: string) => `Reading file: ${path}`,
    WRITING_FILE: (path: string) => `Writing file: ${path}`,
    FILE_WRITTEN: (path: string) => `File written successfully: ${path}`,
    READING_DATA: 'Reading data:',
    WRITING_DATA: 'Writing data:',
    
    // Error handling
    ERROR_CONNECTING: 'Error handling device connection:',
    OPERATION_FAILED: (type: string, error: string) => `${type} operation failed: ${error}`,
    RETRYING_OPERATION: (attempt: number, max: number) => 
        `Retrying operation (${attempt}/${max})...`,

    // Device data operations
    FAILED_TO_READ_DATA: (type: string) => `Failed to read ${type} data:`,
    FAILED_TO_READ_PATTERNS: 'Failed to read patterns:',
    FAILED_TO_READ_SAMPLES: 'Failed to read samples:',
    FAILED_TO_READ_BANK: (bank: string) => `Failed to read bank ${bank}:`,
    FAILED_TO_WRITE_DATA: (type: string) => `Failed to write ${type} data:`,
    FAILED_TO_WRITE_PATTERNS: 'Failed to write patterns:',
    FAILED_TO_WRITE_SAMPLES: 'Failed to write samples:',
    FOUND_PATTERNS: (count: number) => `Found ${count} patterns`,
    FOUND_SAMPLES: (count: number, bank?: string) => bank ? `Found ${count} samples in bank ${bank}` : `Found ${count} samples`,
    COPIED_PATTERN: (name: string) => `Copied pattern: ${name}`,
    COPIED_BANK: (bank: string) => `Copied bank ${bank}`,
    COPIED_BANK_FROM_PATH: (path: string) => `Copied bank from path: ${path}`,
    BANK_INFORMATION: 'Bank information:',

    // Version and serial number
    ERROR_GETTING_VERSION: 'Error getting firmware version:',
    COULD_NOT_DETECT_VERSION: 'Could not detect version:',
    COULD_NOT_READ_SERIAL: 'Could not read serial number:',
    
    // USB operations
    USB_ENUMERATION_FAILED: 'USB enumeration failed:',
    READINESS_CHECK_FAILED: 'Device readiness check failed:',

    // Device eject operations
    EJECT_NO_MASS_STORAGE: 'Cannot eject: no mass storage device found',
    EJECTING_DEVICE: 'Ejecting device:',
    EJECT_SUCCESS: 'Device ejected successfully:',
    EJECT_FAILED: 'Failed to eject device:',
    EJECT_ERROR: 'Error during device ejection:',

    // File operations
    FAILED_TO_UPDATE_INFO_FILE: 'Failed to update info file:',
    UPDATED_INFO_FILE: (count: number) => `Updated info file with ${count} entries`,
} as const;
