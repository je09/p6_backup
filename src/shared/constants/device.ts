import { DeviceMode } from '../types/index';

export const DEVICE_MODES: Record<string, DeviceMode> = {
    PATTERN_BACKUP: 'pattern',
    PATTERN_RESTORE: 'pattern',
    PATTERN_EXPORT: 'pattern',
    PATTERN_IMPORT: 'pattern',
    SAMPLE_EXPORT: 'sample',
    SAMPLE_IMPORT: 'sample',
    UNKNOWN: 'unknown',
} as const;

export const FILE_PATTERNS = {
    PATTERN_PREFIX: 'P6_PTN',
    PATTERN_EXTENSION: '.PRM',
    PATTERN_REGEX: /P6_PTN(\d+)-(\d+)\.PRM/,
    PRM_EXTENSION: '.PRM',
    WAV_EXTENSION: '.WAV',
    BANK_PREFIX: 'BANK_',
    PAD_PREFIX: 'PAD_',
    BACKUP_FOLDER: 'BACKUP',
    RESTORE_FOLDER: 'RESTORE',
    EXPORT_FOLDER: 'EXPORT',
    IMPORT_FOLDER: 'IMPORT',
    INFO_FILE: 'info.txt',
    INFO_ENTRY_FORMAT: '{bank}-{pad}:\t{name}',
    VERSION_REGEX: /v?(\d+\.\d+(?:\.\d+)?)/i,
    VERSION_FILES: ['version.txt', 'firmware.txt', 'info.txt'],
    SERIAL_FILES: ['serial.txt', 'device.txt', 'info.txt'],
} as const;

export const DEVICE_STATUS = {
    INITIAL: {
        connected: false,
        mode: DEVICE_MODES.UNKNOWN,
        connectionType: 'usb' as const,
        firmwareVersion: '',
        deviceId: '',
        lastSeen: null,
    }
} as const;

export const DEVICE_DETAILS = {
    VENDOR_ID: 0x0582, // Roland Corporation VID
    PRODUCT_ID: 0x0300, // P6 PID
    DEVICE_ID: {
        UNKNOWN: 'P6_UNKNOWN',
        MASS_STORAGE_PREFIX: 'P6_MS_',
    },
    FIRMWARE: {
        UNKNOWN_VERSION: 'Unknown',
        DEFAULT_VERSION: '1.0.0'
    },
    UNKNOWN_SERIAL: 'UNKNOWN',
    UNKNOWN_VERSION: 'Unknown',
    UNKNOWN_DEVICE_ID: 'UNKNOWN'
} as const;

export const MASS_STORAGE_MODE_MAP = {
    'pattern_backup': DEVICE_MODES.PATTERN_BACKUP,
    'pattern_restore': DEVICE_MODES.PATTERN_RESTORE,
    'sample_export': DEVICE_MODES.SAMPLE_EXPORT,
    'sample_import': DEVICE_MODES.SAMPLE_IMPORT,
    'pattern_export': DEVICE_MODES.PATTERN_EXPORT,
    'pattern_import': DEVICE_MODES.PATTERN_IMPORT,
    'unknown': DEVICE_MODES.UNKNOWN,
} as const;

export const DATA_TYPES = {
    PATTERNS: 'patterns',
    SAMPLES: 'samples',
} as const;

export const SAMPLE_PATTERNS = {
    BANK_RANGE: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    PAD_RANGE: [1, 2, 3, 4, 5, 6],
} as const;
