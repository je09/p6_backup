import { DeviceMode } from '../types/index';

export const DEVICE_MODES = {
    PATTERN_EXPORT: 'pattern_export',
    PATTERN_IMPORT: 'pattern_import',
    SAMPLE_EXPORT: 'sample_export',
    SAMPLE_IMPORT: 'sample_import',
    UNKNOWN: 'unknown',
} as const satisfies Record<string, DeviceMode>;

/** Modes in which the device exchanges patterns with the host. */
export const isPatternMode = (mode: DeviceMode): boolean =>
    mode === DEVICE_MODES.PATTERN_EXPORT || mode === DEVICE_MODES.PATTERN_IMPORT;

/** Modes in which the device exchanges samples with the host. */
export const isSampleMode = (mode: DeviceMode): boolean =>
    mode === DEVICE_MODES.SAMPLE_EXPORT || mode === DEVICE_MODES.SAMPLE_IMPORT;

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
export const MODE_ENTRY_INSTRUCTIONS: Record<DeviceMode, string> = {
    pattern_export: 'Hold [ø] while powering on the device',
    pattern_import: 'Hold [REC] while powering on the device',
    sample_export:
        'Hold bank buttons [A/E]–[D/H] while powering on (also hold [SAMPLING] for banks E–H)',
    sample_import: 'Hold [SAMPLING] while powering on the device',
    unknown: 'Please power on the device normally',
};

/** Human-readable name for each mode, for status text and dialogs. */
export const MODE_LABELS: Record<DeviceMode, string> = {
    pattern_export: 'Pattern Backup',
    pattern_import: 'Pattern Restore',
    sample_export: 'Sample Backup',
    sample_import: 'Sample Restore',
    unknown: 'Unknown',
};

export const DATA_TYPES = {
    PATTERNS: 'patterns',
    SAMPLES: 'samples',
} as const;
