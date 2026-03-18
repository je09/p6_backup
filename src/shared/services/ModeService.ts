import { DeviceMode } from "../types/index";
import { IDeviceConnection } from "./interfaces";

export interface ModeRequirement {
  operation: string;
  requiredMode: DeviceMode;
  currentMode: DeviceMode;
}

export interface ModeWaitResult {
  success: boolean;
  finalMode: DeviceMode;
  timedOut: boolean;
}

const OPERATION_MODE_MAP: Record<string, DeviceMode> = {
  "pattern backup": "pattern_export",
  "pattern restore": "pattern_import",
  "sample backup": "sample_export",
  "sample restore": "sample_import",
};

export class ModeService {
  constructor(
    private p6Device: IDeviceConnection,
    private maxWaitTime: number = 30000,
    private pollInterval: number = 1000
  ) {}

  getOperationModeRequirement = (operation: string): ModeRequirement | null => {
    const requiredMode = OPERATION_MODE_MAP[operation] || "unknown";
    if (requiredMode === "unknown") return null;
    const currentMode = this.p6Device.getCurrentMode();
    return currentMode === requiredMode
      ? null
      : { operation, requiredMode, currentMode };
  };

  waitForMode = async (
    requiredMode: DeviceMode,
    timeoutMs?: number
  ): Promise<ModeWaitResult> => {
    const timeout = timeoutMs ?? this.maxWaitTime;
    const start = Date.now();
    while (true) {
      // Actively scan for mode change rather than reading stale cached state
      const detectedMode = await this.p6Device.retryModeDetection();
      if (detectedMode === requiredMode)
        return { success: true, finalMode: detectedMode, timedOut: false };
      if (Date.now() - start >= timeout)
        return { success: false, finalMode: detectedMode, timedOut: true };
      await new Promise((r) => setTimeout(r, this.pollInterval));
    }
  };
}
