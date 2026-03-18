import { DeviceMode } from "../types/index";

const PREFIX = "MODE_MISMATCH:";

export class ModeError extends Error {
  constructor(
    public readonly currentMode: DeviceMode,
    public readonly requiredMode: DeviceMode,
    public readonly operation: string
  ) {
    super(
      `${PREFIX}${JSON.stringify({ currentMode, requiredMode, operation })}`
    );
    this.name = "ModeError";
  }

  /** Parse a ModeError from an Error that crossed the IPC boundary. */
  static fromError(
    error: Error
  ): { currentMode: string; requiredMode: string; operation: string } | null {
    if (!error.message.startsWith(PREFIX)) return null;
    try {
      return JSON.parse(error.message.slice(PREFIX.length));
    } catch {
      return null;
    }
  }
}
