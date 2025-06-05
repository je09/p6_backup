import { DeviceMode } from "../types/index";
import { P6Device } from "../models/P6Device";

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
  "pattern backup": "pattern",
  "pattern restore": "pattern",
  "sample backup": "sample",
  "sample restore": "sample",
};

export class ModeService {
  constructor(
    private p6Device: P6Device,
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
      const currentMode = this.p6Device.getCurrentMode();
      if (currentMode === requiredMode)
        return { success: true, finalMode: currentMode, timedOut: false };
      if (Date.now() - start >= timeout)
        return { success: false, finalMode: currentMode, timedOut: true };
      await new Promise((r) => setTimeout(r, this.pollInterval));
    }
  };
}
