// Roland P6 Backup Tool - Type Definitions

// Device Status and Operations
export interface DeviceStatus {
    connected: boolean;
    deviceName?: string;
    firmwareVersion?: string;
    lastSync?: Date;
    error?: string;
    mode?: 'unknown' | 'backup' | 'restore' | 'sync' | 'pattern' | 'sample';
    connectionType?: 'usb';
    deviceId?: string;
    lastSeen?: Date | null;
}

export interface DeviceInfo {
    name: string;
    firmwareVersion: string;
    serialNumber?: string;
    connected: boolean;
}

// Backup and Restore Operations
export type BackupType = 'full' | 'patterns' | 'samples' | 'custom';

export interface BackupResult {
    success: boolean;
    message: string;
    filePath?: string;
    timestamp: Date;
    size?: number;
    patterns?: number;
    samples?: number;
}

export interface RestoreResult {
    success: boolean;
    message: string;
    timestamp: Date;
    patterns?: number;
    samples?: number;
}

export interface BackupOptions {
    includePatterns: boolean;
    includeSamples: boolean;
    sampleBanks?: string[];
    location: string;
    name?: string;
}

export interface RestoreOptions {
    restorePatterns: boolean;
    restoreSamples: boolean;
    sampleBanks?: string[];
    overwriteExisting: boolean;
}

// Sample Bank Management
export interface SampleBank {
    id: string;
    name: string;
    sampleCount: number;
    totalSize: number;
    selected: boolean;
}

export interface Sample {
    id: string;
    name: string;
    size: number;
    duration: number;
    format: string;
    bankId: string;
}

// Preset Configuration
export type PresetType = 'backup' | 'restore' | 'full' | 'patterns' | 'samples';

export const PresetType = {
    BACKUP: 'backup' as const,
    RESTORE: 'restore' as const,
    FULL: 'full' as const,
    PATTERNS: 'patterns' as const,
    SAMPLES: 'samples' as const,
} as const;

export interface PresetConfig {
    id: string;
    name: string;
    type: PresetType;
    description?: string;
    settings: BackupOptions | RestoreOptions;
    createdAt: Date;
    lastUsed?: Date;
    isDefault?: boolean;
    configuration?: {
        backupPath?: string;
        samples?: {
            selectedBanks?: string[];
        };
    };
}

export interface PresetSettings {
    backup?: BackupOptions;
    restore?: RestoreOptions;
}

// Application State
export interface AppState {
    deviceStatus: DeviceStatus;
    currentOperation?: string;
    progress?: number;
    error?: string;
    lastBackup?: Date;
    lastRestore?: Date;
}

// File System Operations
export interface FileSelectOptions {
    title: string;
    filters: { name: string; extensions: string[] }[];
    properties?: string[];
}

// Progress and Status Updates
export interface ProgressUpdate {
    step: string;
    progress: number;
    message: string;
    timestamp: Date;
}

export interface OperationStatus {
    isRunning: boolean;
    operation?: string;
    progress?: ProgressUpdate;
    error?: string;
}

// Menu and Navigation
export interface MenuAction {
    action: string;
    label: string;
    shortcut?: string;
}

export interface NavigationRoute {
    route: string;
    title: string;
    icon?: string;
}

// Error Handling
export interface AppError {
    code: string;
    message: string;
    details?: any;
    timestamp: Date;
    recoverable: boolean;
}

// Communication Protocols
export interface DeviceCommand {
    command: string;
    parameters?: any[];
    timeout?: number;
}

export interface DeviceResponse {
    success: boolean;
    data?: any;
    error?: string;
    timestamp: Date;
}

// Log and Debug
export interface LogEntry {
    level: 'debug' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: Date;
    component?: string;
    data?: any;
}
