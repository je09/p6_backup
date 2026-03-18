import { MASS_STORAGE_MODE_MAP, DEVICE_MODES } from "../../../shared/constants/device";

describe("MASS_STORAGE_MODE_MAP", () => {
  it("maps pattern_backup (BACKUP folder) to pattern_export", () => {
    expect(MASS_STORAGE_MODE_MAP["pattern_backup"]).toBe("pattern_export");
  });

  it("maps pattern_restore (RESTORE folder) to pattern_import", () => {
    expect(MASS_STORAGE_MODE_MAP["pattern_restore"]).toBe("pattern_import");
  });

  it("maps sample_export (EXPORT folder) to sample_export", () => {
    expect(MASS_STORAGE_MODE_MAP["sample_export"]).toBe("sample_export");
  });

  it("maps sample_import (IMPORT folder) to sample_import", () => {
    expect(MASS_STORAGE_MODE_MAP["sample_import"]).toBe("sample_import");
  });

  it("maps pattern_export to pattern_export", () => {
    expect(MASS_STORAGE_MODE_MAP["pattern_export"]).toBe("pattern_export");
  });

  it("maps pattern_import to pattern_import", () => {
    expect(MASS_STORAGE_MODE_MAP["pattern_import"]).toBe("pattern_import");
  });

  it("maps unknown to DEVICE_MODES.UNKNOWN", () => {
    expect(MASS_STORAGE_MODE_MAP["unknown"]).toBe(DEVICE_MODES.UNKNOWN);
  });

  it("does not collapse pattern_backup and pattern_restore to the same mode", () => {
    expect(MASS_STORAGE_MODE_MAP["pattern_backup"]).not.toBe(
      MASS_STORAGE_MODE_MAP["pattern_restore"]
    );
  });

  it("does not collapse sample_export and sample_import to the same mode", () => {
    expect(MASS_STORAGE_MODE_MAP["sample_export"]).not.toBe(
      MASS_STORAGE_MODE_MAP["sample_import"]
    );
  });
});
