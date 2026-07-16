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
    /**
     * Sample files as the device writes them: P6_<bank>-<pad>_<name>.WAV,
     * e.g. P6_A-1_REC.WAV. The trailing name is whatever the sample is called,
     * and the same stem is reused for the .PRM settings file beside it.
     */
    SAMPLE_REGEX: /^P6_([A-H])-([1-6])(?:_(.+))?\.WAV$/i,
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

/**
 * Which button the user holds at power-on to reach each mode, per the P-6
 * owner's manual. This is the only place these belong: the same instructions
 * used to live in four copies that drifted apart, and pattern restore ended up
 * telling users to hold [SAMPLING] — the button that enters sample import —
 * leaving them stuck in a mode the app then rejected.
 *
 * No two modes may share an instruction; MODE_ENTRY_INSTRUCTIONS is tested for
 * that, since a duplicate is what the drift looked like.
 */
export const MODE_ENTRY_INSTRUCTIONS: Record<string, string> = {
    pattern_export: 'Hold [ø] while powering on the device',
    pattern_import: 'Hold [REC] while powering on the device',
    sample_export:
        'Hold bank buttons [A/E]–[D/H] while powering on (also hold [SAMPLING] for banks E–H)',
    sample_import: 'Hold [SAMPLING] while powering on the device',
    unknown: 'Please power on the device normally',
};

export const MASS_STORAGE_MODE_MAP: Record<string, DeviceMode> = {
    'pattern_export': DEVICE_MODES.PATTERN_EXPORT,
    'pattern_import': DEVICE_MODES.PATTERN_IMPORT,
    'sample_export': DEVICE_MODES.SAMPLE_EXPORT,
    'sample_import': DEVICE_MODES.SAMPLE_IMPORT,
    'normal': DEVICE_MODES.NORMAL,
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
