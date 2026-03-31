import { DeviceMode } from '../types/index';

export const DEVICE_MODES = {
    PATTERN: 'pattern' as DeviceMode,
    PATTERN_EXPORT: 'pattern_export' as DeviceMode,
    PATTERN_IMPORT: 'pattern_import' as DeviceMode,
    SAMPLE: 'sample' as DeviceMode,
    SAMPLE_EXPORT: 'sample_export' as DeviceMode,
    SAMPLE_IMPORT: 'sample_import' as DeviceMode,
    NORMAL: 'normal' as DeviceMode,
    UNKNOWN: 'unknown' as DeviceMode,
} as const;

export const FILE_PATTERNS = {
    PATTERN_PREFIX: 'P6_PTN',
    PATTERN_EXTENSION: '.PRM',
    PATTERN_REGEX: /P6_PTN(\d+)-(\d+)\.PRM/,
    PRM_EXTENSION: '.PRM',
    WAV_EXTENSION: '.WAV',
    SAMPLE_PREFIX: 'P6_',
    SAMPLE_EXTENSION: '.WAV',
    SAMPLE_REGEX: /P6_([A-H])S(\d+)\.WAV/i,
    BANK_PREFIX: 'BANK_',
    PAD_PREFIX: 'PAD_',
    BACKUP_FOLDER: 'BACKUP',
    RESTORE_FOLDER: 'RESTORE',
    EXPORT_FOLDER: 'EXPORT',
    IMPORT_FOLDER: 'IMPORT',
    INFO_FILE: 'info.txt',
    INFO_ENTRY_FORMAT: '{bank}-{pad}:\t{name}',
    CONFIG_FILE: 'config.json',
    MANIFEST_FILE: 'manifest.json',
    VERSION_REGEX: /version\s*:\s*([0-9.]+)/i,
    VERSION_FILES: ['VERSION.DAT', 'SYSINFO.DAT'] as const,
    SERIAL_FILES: ['EXPLORER.DAT', 'FOLDER.DAT', 'ROLAND', 'SYSINFO.DAT', 'VERSION.DAT'] as const,
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

export const MASS_STORAGE_MODE_MAP: Record<string, DeviceMode> = {
    'pattern_backup': 'pattern_export',
    'pattern_restore': 'pattern_import',
    'sample_export': 'sample_export',
    'sample_import': 'sample_import',
    'pattern_export': 'pattern_export',
    'pattern_import': 'pattern_import',
    'normal': 'normal' as DeviceMode,
    'unknown': DEVICE_MODES.UNKNOWN,
};

export const DATA_TYPES = {
    PATTERNS: 'patterns',
    SAMPLES: 'samples',
} as const;

export const SAMPLE_PATTERNS = {
    BANK_RANGE: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    PAD_RANGE: [1, 2, 3, 4, 5, 6],
} as const;
