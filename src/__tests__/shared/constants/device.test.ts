import { MASS_STORAGE_MODE_MAP, DEVICE_MODES } from "../../../shared/constants/device";

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
