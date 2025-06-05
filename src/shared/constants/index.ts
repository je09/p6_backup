// Export all constants from individual files
export * from './messages';
export * from './device';

// Note: LOG_MESSAGES is exported separately to avoid naming conflicts
export { LOG_MESSAGES } from './log';

// Additional common constants that don't fit into the main categories
export const DEVICE_CONSTANTS = {
    CONNECTION_CHECK_INTERVAL: 5000,    // 5 seconds
    DETECTION_TIMEOUT: 5000,
    OPERATION_TIMEOUT: 30000,          // 30 seconds
    MODE_CHANGE_TIMEOUT: 10000,        // 10 seconds
    AUTO_DETECTION_INTERVAL: 8000,     // 8 seconds
    RECONNECTION_DELAY: 1000,          // 1 second delay for reconnection

    MODE_INSTRUCTIONS: {
        pattern: 'For pattern backup: Hold PLAY button while powering on. For pattern restore: Hold RECORD button while powering on.',
        sample: 'For sample backup: Hold BANK + SAMPLING buttons while powering on. For sample restore: Hold SAMPLE button while powering on.',
        pattern_backup: 'Hold the PLAY button while powering on the device',
        pattern_restore: 'Hold the RECORD button while powering on the device',
        sample_export: 'Hold the BANK + SAMPLING buttons while powering on the device',
        sample_import: 'Hold the SAMPLE button while powering on the device',
        unknown: 'Please power on the device normally',
    } as Record<string, string>,

    MODE_DESCRIPTIONS: {
        pattern: 'Pattern Mode - Ready for pattern backup/restore operations',
        sample: 'Sample Mode - Ready for sample backup/restore operations',
        pattern_backup: 'Pattern Backup Mode - Device has BACKUP folder for exporting patterns',
        pattern_restore: 'Pattern Restore Mode - Device has RESTORE folder for importing patterns',
        sample_export: 'Sample Export Mode - Device has EXPORT folder with BANK_<letter> folders for exporting samples',
        sample_import: 'Sample Import Mode - Device has IMPORT folder for importing samples',
        unknown: 'Unknown Mode - Device mode could not be determined',
    } as Record<string, string>,
} as const;

export const BACKUP_CONSTANTS = {
    MAX_BACKUP_SIZE: 100 * 1024 * 1024, // 100MB
    BACKUP_FILE_EXTENSION: '.p6backup',
    PATTERN_FILE_EXTENSION: '.RPM',
    SAMPLE_FILE_EXTENSION: '.wav',
    MANIFEST_FILENAME: 'manifest.json',
    MAX_BANKS_PER_RESTORE: 2,
    BACKUP_FILE_EXTENSIONS: ['.p6b', '.backup'],
    DEFAULT_BACKUP_FOLDER: 'P6_Backups',
    BANK_FOLDER_PREFIX: 'BANK_',
    
    FOLDERS: {
        BACKUP: 'BACKUP',
        RESTORE: 'RESTORE',
        EXPORT: 'EXPORT',
        IMPORT: 'IMPORT',
    },
    
    SAMPLE_BANKS: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
} as const;

export const UI_CONSTANTS = {
    COLORS: {
        PRIMARY: '#1a73e8',
        SECONDARY: '#34a853',
        WARNING: '#fbbc04',
        ERROR: '#ea4335',
        SUCCESS: '#34a853',
        BACKGROUND: '#f8f9fa',
        SURFACE: '#ffffff',
        TEXT_PRIMARY: '#202124',
        TEXT_SECONDARY: '#5f6368',
    },

    BREAKPOINTS: {
        MOBILE: 768,
        TABLET: 1024,
        DESKTOP: 1440,
    },

    ANIMATION_DURATION: {
        SHORT: 200,
        MEDIUM: 300,
        LONG: 500,
    },
} as const;
