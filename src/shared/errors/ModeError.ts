import { DeviceMode } from "../types/index";
import { MODE_ENTRY_INSTRUCTIONS, MODE_LABELS } from "../constants/device";

/** The message is shown to the user as-is, so it has to stand on its own. */
export class ModeError extends Error {
  constructor(
    public readonly currentMode: DeviceMode,
    public readonly requiredMode: DeviceMode,
    public readonly operation: string
  ) {
    super(
      `Device is in ${MODE_LABELS[currentMode]} mode, but ${operation} needs ` +
        `${MODE_LABELS[requiredMode]} mode. ${MODE_ENTRY_INSTRUCTIONS[requiredMode]}.`
    );
    this.name = "ModeError";
  }
}
