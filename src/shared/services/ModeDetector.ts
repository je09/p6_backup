import { DeviceMode } from "../types/index";
import { DEVICE_MODES, MODE_ENTRY_INSTRUCTIONS } from "../constants/device";
import { UsbDeviceManager, type P6MassStorageInfo } from "./UsbDeviceManager";
import { createComponentLogger } from "./Logger";

export interface ModeDetectionResult {
  mode: DeviceMode;
  confidence: "high" | "low";
  massStorageInfo: P6MassStorageInfo | null;
  detectionMethod: "direct" | "retry";
  timestamp: Date;
  failureReason?: string;
}

export interface ModeDetectionConfig {
  maxAttempts: number;
  baseDelayMs: number;
  timeoutMs: number;
  enableAutoRetry: boolean;
}

/**
 * The P-6 does not report its mode; it is inferred from the marker folder its
 * volume exposes. A device with no mounted volume is simply `unknown`.
 */
export class ModeDetector {
  private static readonly DEFAULT_CONFIG: ModeDetectionConfig = {
    maxAttempts: 5,
    baseDelayMs: 1000,
    timeoutMs: 30000,
    enableAutoRetry: true,
  };

  private config: ModeDetectionConfig;
  private currentDetectionPromise: Promise<ModeDetectionResult> | null = null;
  private logger = createComponentLogger("ModeDetector");

  constructor(
    private readonly usbManager: UsbDeviceManager,
    config: Partial<ModeDetectionConfig> = {}
  ) {
    this.config = { ...ModeDetector.DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect the mode, retrying while the volume settles. Concurrent callers
   * share one in-flight detection rather than each polling the filesystem.
   */
  async detectMode(): Promise<ModeDetectionResult> {
    if (this.currentDetectionPromise) return this.currentDetectionPromise;
    this.currentDetectionPromise = this.performModeDetection();
    try {
      return await this.currentDetectionPromise;
    } finally {
      this.currentDetectionPromise = null;
    }
  }

  /** One look at the volume, with no retrying. */
  async detectModeQuick(): Promise<ModeDetectionResult> {
    try {
      const massStorageInfo = await this.usbManager.checkP6MassStorageMode();
      if (!massStorageInfo) return this.failure("No P-6 volume found", "direct");
      return {
        mode: massStorageInfo.mode,
        confidence:
          massStorageInfo.mode === DEVICE_MODES.UNKNOWN ? "low" : "high",
        massStorageInfo,
        detectionMethod: "direct",
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error("Quick mode detection failed", { error });
      return this.failure(`Detection error: ${error}`, "direct");
    }
  }

  getModeInstructions(mode: DeviceMode): string[] {
    return [MODE_ENTRY_INSTRUCTIONS[mode]];
  }

  getConfig(): ModeDetectionConfig {
    return { ...this.config };
  }

  private async performModeDetection(): Promise<ModeDetectionResult> {
    const quickResult = await this.detectModeQuick();
    if (quickResult.confidence === "high") return quickResult;
    if (!this.config.enableAutoRetry) return quickResult;
    return this.performRetryDetection();
  }

  /**
   * The volume takes a moment to mount after the device is powered on, and a
   * device seen in that gap looks like no device at all. Retrying with a
   * widening delay gives it time to appear.
   */
  private async performRetryDetection(): Promise<ModeDetectionResult> {
    const startTime = Date.now();
    let lastReason: string | undefined;
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      if (Date.now() - startTime > this.config.timeoutMs)
        return this.failure("Detection timed out", "retry");

      const result = await this.detectModeQuick();
      if (result.confidence === "high")
        return { ...result, detectionMethod: "retry" };
      lastReason = result.failureReason;

      if (attempt < this.config.maxAttempts)
        await new Promise((r) =>
          setTimeout(r, this.config.baseDelayMs * attempt)
        );
    }
    return this.failure(lastReason ?? "All retry attempts failed", "retry");
  }

  private failure(
    reason: string,
    method: ModeDetectionResult["detectionMethod"]
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
}
