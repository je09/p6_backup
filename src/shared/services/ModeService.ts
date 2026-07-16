import { DeviceMode } from "../types/index";
import { DEVICE_MODES } from "../constants/device";
import { IDeviceStatus } from "./interfaces";

export interface ModeRequirement {
  operation: string;
  requiredMode: DeviceMode;
  currentMode: DeviceMode;
}

/** The mode each operation needs the device to be power-cycled into. */
const OPERATION_MODE_MAP = {
  "pattern backup": DEVICE_MODES.PATTERN_EXPORT,
  "sample backup": DEVICE_MODES.SAMPLE_EXPORT,
  "pattern restore": DEVICE_MODES.PATTERN_IMPORT,
  "sample restore": DEVICE_MODES.SAMPLE_IMPORT,
} as const satisfies Record<string, DeviceMode>;

export type ModeOperation = keyof typeof OPERATION_MODE_MAP;

export class ModeService {
  constructor(private readonly p6Device: IDeviceStatus) {}

  /**
   * What stands between the device and `operation`: null when it is already in
   * the right mode, or when the operation has no mode requirement at all.
   */
  getOperationModeRequirement = (operation: string): ModeRequirement | null => {
    const requiredMode = OPERATION_MODE_MAP[operation as ModeOperation];
    if (!requiredMode) return null;
    const currentMode = this.p6Device.getCurrentMode();
    return currentMode === requiredMode
      ? null
      : { operation, requiredMode, currentMode };
  };
}
