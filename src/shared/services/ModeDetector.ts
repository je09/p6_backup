import { DeviceMode } from "../types/index";
import { DEVICE_MODES, MASS_STORAGE_MODE_MAP } from "../constants/device";
import { UsbDeviceManager, type P6MassStorageInfo } from "./UsbDeviceManager";
import { createComponentLogger } from "./Logger";

export interface ModeDetectionResult {
  mode: DeviceMode;
  confidence: "high" | "medium" | "low";
  massStorageInfo: P6MassStorageInfo | null;
  detectionMethod: "direct" | "retry" | "inference";
  timestamp: Date;
  failureReason?: string;
}

export interface ModeDetectionConfig {
  maxAttempts: number;
  baseDelayMs: number;
  timeoutMs: number;
  enableAutoRetry: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
}

export class ModeDetector {
  private static readonly DEFAULT_CONFIG: ModeDetectionConfig = {
    maxAttempts: 5,
    baseDelayMs: 1000,
    timeoutMs: 30000,
    enableAutoRetry: true,
    logLevel: "info",
  };
  private static readonly logLevels = { debug: 0, info: 1, warn: 2, error: 3 };

  private usbManager: UsbDeviceManager;
  private config: ModeDetectionConfig;
  private currentDetectionPromise: Promise<ModeDetectionResult> | null = null;
  private logger = createComponentLogger("ModeDetector");

  constructor(
    usbManager: UsbDeviceManager,
    config: Partial<ModeDetectionConfig> = {}
  ) {
    this.usbManager = usbManager;
    this.config = { ...ModeDetector.DEFAULT_CONFIG, ...config };
  }

  async detectMode(): Promise<ModeDetectionResult> {
    if (this.currentDetectionPromise) {
      this.log(
        "info",
        "Mode detection already in progress, returning existing promise"
      );
      return this.currentDetectionPromise;
    }
    this.currentDetectionPromise = this.performModeDetection();
    try {
      return await this.currentDetectionPromise;
    } finally {
      this.currentDetectionPromise = null;
    }
  }

  async detectModeQuick(): Promise<ModeDetectionResult> {
    try {
      const massStorageInfo = await this.usbManager.checkP6MassStorageMode();
      if (!massStorageInfo)
        return this.failure("No mass storage device found", "direct");
      const mode = this.mapMassStorageMode(massStorageInfo.mode);
      return {
        mode,
        confidence: this.confidence(massStorageInfo, mode),
        massStorageInfo,
        detectionMethod: "direct",
        timestamp: new Date(),
      };
    } catch (error) {
      this.log("error", "Quick mode detection failed:", error);
      return this.failure(`Detection error: ${error}`, "direct");
    }
  }

  async refreshAndDetect(): Promise<ModeDetectionResult> {
    try {
      const massStorageInfo = await this.usbManager.checkP6MassStorageMode();
      if (!massStorageInfo)
        return this.failure(
          "No mass storage device found after refresh",
          "direct"
        );
      const mode = this.mapMassStorageMode(massStorageInfo.mode);
      return {
        mode,
        confidence: this.confidence(massStorageInfo, mode),
        massStorageInfo,
        detectionMethod: "direct",
        timestamp: new Date(),
      };
    } catch (error) {
      this.log("error", "Refresh detection failed:", error);
      return this.failure(`Refresh error: ${error}`, "direct");
    }
  }

  async validateModeStability(
    expectedMode: DeviceMode,
    checkCount = 3
  ): Promise<boolean> {
    for (let i = 0; i < checkCount; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const result = await this.detectModeQuick();
      if (result.mode !== expectedMode) {
        this.log(
          "warn",
          `Mode stability check failed: expected ${expectedMode}, got ${result.mode}`
        );
        return false;
      }
    }
    this.log("info", `Mode ${expectedMode} is stable`);
    return true;
  }

  getModeInstructions(mode: DeviceMode): string[] {
    const instructions: Record<DeviceMode, string[]> = {
      pattern: [
        "PLAY button = Pattern backup mode",
        "RECORD button = Pattern restore mode",
      ],
      pattern_export: [
        "Hold PLAY button while powering on for pattern backup mode",
      ],
      pattern_import: [
        "Hold RECORD button while powering on for pattern restore mode",
      ],
      sample: [
        "BANK + SAMPLING buttons = Sample export mode",
        "SAMPLE button = Sample import mode",
      ],
      sample_export: [
        "Hold BANK + SAMPLING buttons while powering on for sample export mode",
      ],
      sample_import: [
        "Hold SAMPLE button while powering on for sample import mode",
      ],
      unknown: [
        "Please power on the device normally",
        "Ensure device is connected via USB",
        "Try different mode combinations if needed",
      ],
    };
    return instructions[mode] || instructions.unknown;
  }

  updateConfig(newConfig: Partial<ModeDetectionConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.log("debug", "Updated mode detection config:", this.config);
  }

  getConfig(): ModeDetectionConfig {
    return { ...this.config };
  }

  // Private methods
  private async performModeDetection(): Promise<ModeDetectionResult> {
    const quickResult = await this.detectModeQuick();
    if (
      quickResult.mode !== DEVICE_MODES.UNKNOWN &&
      quickResult.confidence === "high"
    )
      return quickResult;
    if (!this.config.enableAutoRetry) return quickResult;
    return this.performRetryDetection();
  }

  private async performRetryDetection(): Promise<ModeDetectionResult> {
    const startTime = Date.now();
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      if (Date.now() - startTime > this.config.timeoutMs)
        return this.failure("Detection timed out", "retry");
      try {
        const result = await this.refreshAndDetect();
        if (result.mode !== DEVICE_MODES.UNKNOWN)
          return { ...result, detectionMethod: "retry" };
        lastError = result.failureReason;
        if (attempt < this.config.maxAttempts)
          await new Promise((r) =>
            setTimeout(r, this.config.baseDelayMs * attempt)
          );
      } catch (error) {
        this.log("warn", `Detection attempt ${attempt} failed:`, error);
        lastError = `Attempt ${attempt} error: ${error}`;
        if (attempt < this.config.maxAttempts)
          await new Promise((r) =>
            setTimeout(r, this.config.baseDelayMs * attempt)
          );
      }
    }
    return this.failure(lastError || "All retry attempts failed", "retry");
  }

  private mapMassStorageMode(mode: string): DeviceMode {
    return (
      MASS_STORAGE_MODE_MAP[mode as keyof typeof MASS_STORAGE_MODE_MAP] ||
      DEVICE_MODES.UNKNOWN
    );
  }

  private confidence(
    massStorageInfo: P6MassStorageInfo,
    mode: DeviceMode
  ): "high" | "medium" | "low" {
    if (mode !== DEVICE_MODES.UNKNOWN && massStorageInfo.mode !== "unknown")
      return "high";
    if (massStorageInfo.path && massStorageInfo.mode === "unknown")
      return "medium";
    return "low";
  }

  private failure(
    reason: string,
    method: "direct" | "retry" | "inference"
  ): ModeDetectionResult {
    return {
      mode: DEVICE_MODES.UNKNOWN,
      confidence: "low",
      massStorageInfo: null,
      detectionMethod: method,
      timestamp: new Date(),
      failureReason: reason,
    };
  }

  private log(
    level: ModeDetectionConfig["logLevel"],
    message: string,
    ...args: any[]
  ): void {
    const { logLevels } = ModeDetector;
    if (logLevels[level] >= logLevels[this.config.logLevel]) {
      const msg = `[ModeDetector] ${message}`;
      this.logger[level]?.(msg, ...args);
    }
  }
}
