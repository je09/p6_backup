import {
  DEVICE_MODES,
  MODE_ENTRY_INSTRUCTIONS,
  MODE_LABELS,
  isPatternMode,
  isSampleMode,
} from "../../../shared/constants/device";

/**
 * These tell the user which button to hold at power-on. Getting one wrong
 * strands them: the app asks for a mode, the button they are told to hold
 * reaches a different one, and the app rejects the device it just asked for.
 */
describe("MODE_ENTRY_INSTRUCTIONS", () => {
  it("enters pattern restore with [REC], not the sample import button", () => {
    expect(MODE_ENTRY_INSTRUCTIONS.pattern_import).toContain("[REC]");
    expect(MODE_ENTRY_INSTRUCTIONS.pattern_import).not.toContain("[SAMPLING]");
  });

  it("enters sample import with [SAMPLING]", () => {
    expect(MODE_ENTRY_INSTRUCTIONS.sample_import).toContain("[SAMPLING]");
  });

  it("enters pattern backup with [ø]", () => {
    expect(MODE_ENTRY_INSTRUCTIONS.pattern_export).toContain("[ø]");
  });

  it("enters sample export with the bank buttons", () => {
    expect(MODE_ENTRY_INSTRUCTIONS.sample_export).toContain("[A/E]–[D/H]");
  });

  // One button press cannot reach two modes. Two modes sharing an instruction
  // is exactly what the drift looked like: pattern restore and sample import
  // both claimed [SAMPLING].
  it("gives every mode its own distinct instruction", () => {
    const instructions = Object.entries(MODE_ENTRY_INSTRUCTIONS)
      .filter(([mode]) => mode !== DEVICE_MODES.UNKNOWN)
      .map(([, text]) => text);
    expect(new Set(instructions).size).toBe(instructions.length);
  });

  // The UI indexes these by mode with no fallback, so a gap renders "undefined".
  it("covers every mode", () => {
    for (const mode of Object.values(DEVICE_MODES)) {
      expect(MODE_ENTRY_INSTRUCTIONS[mode]).toBeTruthy();
      expect(MODE_LABELS[mode]).toBeTruthy();
    }
  });
});

describe("mode predicates", () => {
  it("classifies the pattern modes", () => {
    expect(isPatternMode(DEVICE_MODES.PATTERN_EXPORT)).toBe(true);
    expect(isPatternMode(DEVICE_MODES.PATTERN_IMPORT)).toBe(true);
    expect(isPatternMode(DEVICE_MODES.SAMPLE_EXPORT)).toBe(false);
    expect(isPatternMode(DEVICE_MODES.UNKNOWN)).toBe(false);
  });

  it("classifies the sample modes", () => {
    expect(isSampleMode(DEVICE_MODES.SAMPLE_EXPORT)).toBe(true);
    expect(isSampleMode(DEVICE_MODES.SAMPLE_IMPORT)).toBe(true);
    expect(isSampleMode(DEVICE_MODES.PATTERN_EXPORT)).toBe(false);
    expect(isSampleMode(DEVICE_MODES.UNKNOWN)).toBe(false);
  });
});
