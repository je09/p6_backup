import {
  MASS_STORAGE_MODE_MAP,
  DEVICE_MODES,
  MODE_ENTRY_INSTRUCTIONS,
  FILE_PATTERNS,
} from "../../../shared/constants/device";

describe("MASS_STORAGE_MODE_MAP", () => {
  it("maps pattern_export (BACKUP folder) to pattern_export", () => {
    expect(MASS_STORAGE_MODE_MAP["pattern_export"]).toBe("pattern_export");
  });

  it("maps pattern_import (RESTORE folder) to pattern_import", () => {
    expect(MASS_STORAGE_MODE_MAP["pattern_import"]).toBe("pattern_import");
  });

  it("maps sample_export (EXPORT folder) to sample_export", () => {
    expect(MASS_STORAGE_MODE_MAP["sample_export"]).toBe("sample_export");
  });

  it("maps sample_import (IMPORT folder) to sample_import", () => {
    expect(MASS_STORAGE_MODE_MAP["sample_import"]).toBe("sample_import");
  });

  it("maps normal to DEVICE_MODES.NORMAL", () => {
    expect(MASS_STORAGE_MODE_MAP["normal"]).toBe(DEVICE_MODES.NORMAL);
  });

  it("maps unknown to DEVICE_MODES.UNKNOWN", () => {
    expect(MASS_STORAGE_MODE_MAP["unknown"]).toBe(DEVICE_MODES.UNKNOWN);
  });

  it("does not collapse pattern_export and pattern_import to the same mode", () => {
    expect(MASS_STORAGE_MODE_MAP["pattern_export"]).not.toBe(
      MASS_STORAGE_MODE_MAP["pattern_import"]
    );
  });

  it("does not collapse sample_export and sample_import to the same mode", () => {
    expect(MASS_STORAGE_MODE_MAP["sample_export"]).not.toBe(
      MASS_STORAGE_MODE_MAP["sample_import"]
    );
  });

  it("resolves every mass storage mode to a known DeviceMode", () => {
    const known = Object.values(DEVICE_MODES);
    for (const mode of Object.values(MASS_STORAGE_MODE_MAP)) {
      expect(known).toContain(mode);
    }
  });
});

/**
 * Filenames as a real P-6 writes them, read off a device in sample export mode:
 * EXPORT/BANK_A/PAD_1/P6_A-1_REC.WAV, with a .PRM of the same stem beside it.
 */
describe("FILE_PATTERNS.SAMPLE_REGEX", () => {
  it("matches a sample the device actually produced", () => {
    const match = "P6_A-1_REC.WAV".match(FILE_PATTERNS.SAMPLE_REGEX);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("A");
    expect(match![2]).toBe("1");
    expect(match![3]).toBe("REC");
  });

  it("reads the bank and pad of every pad in a bank", () => {
    const pads = [1, 2, 3, 4, 5, 6].map(
      (pad) => `P6_C-${pad}_REC.WAV`.match(FILE_PATTERNS.SAMPLE_REGEX)!
    );
    expect(pads.map((m) => m[2])).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(pads.every((m) => m[1] === "C")).toBe(true);
  });

  it("accepts a sample named something other than REC", () => {
    const match = "P6_H-6_KICK.WAV".match(FILE_PATTERNS.SAMPLE_REGEX);
    expect(match).not.toBeNull();
    expect(match![3]).toBe("KICK");
  });

  it("does not match the .PRM settings file beside the sample", () => {
    expect("P6_A-1_REC.PRM".match(FILE_PATTERNS.SAMPLE_REGEX)).toBeNull();
  });

  it("does not match a bank outside A–H or a pad outside 1–6", () => {
    expect("P6_I-1_REC.WAV".match(FILE_PATTERNS.SAMPLE_REGEX)).toBeNull();
    expect("P6_A-7_REC.WAV".match(FILE_PATTERNS.SAMPLE_REGEX)).toBeNull();
  });
});

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
    const entries = Object.entries(MODE_ENTRY_INSTRUCTIONS).filter(
      ([mode]) => mode !== "unknown"
    );
    const instructions = entries.map(([, text]) => text);
    expect(new Set(instructions).size).toBe(instructions.length);
  });
});
