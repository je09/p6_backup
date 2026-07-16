import * as fs from "fs";
import { UsbDeviceManager } from "../../../shared/services/UsbDeviceManager";

jest.mock("child_process", () => ({ execFile: jest.fn() }));
jest.mock("../../../shared/services/Logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("UsbDeviceManager.checkP6MassStorageMode", () => {
  let manager: UsbDeviceManager;
  let statSpy: jest.SpyInstance;
  let readdirSpy: jest.SpyInstance;

  beforeEach(() => {
    manager = new UsbDeviceManager();
    statSpy = jest.spyOn(fs.promises, "stat");
    readdirSpy = jest.spyOn(fs.promises, "readdir");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns null when no P-6 volume is found", async () => {
    statSpy.mockRejectedValue(new Error("ENOENT"));
    const result = await manager.checkP6MassStorageMode();
    expect(result).toBeNull();
  });

  it("returns pattern_backup mode when BACKUP folder is present", async () => {
    statSpy.mockResolvedValue({ isDirectory: () => true } as any);
    readdirSpy.mockResolvedValue(["BACKUP"] as any);

    const result = await manager.checkP6MassStorageMode();
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("pattern_backup");
    expect(result!.path).toBe("/Volumes/P-6");
  });

  it("returns pattern_restore mode when RESTORE folder is present", async () => {
    statSpy.mockResolvedValue({ isDirectory: () => true } as any);
    readdirSpy.mockResolvedValue(["RESTORE"] as any);

    const result = await manager.checkP6MassStorageMode();
    expect(result!.mode).toBe("pattern_restore");
  });

  it("returns sample_export mode when EXPORT folder with banks containing PADs is present", async () => {
    statSpy.mockResolvedValue({ isDirectory: () => true } as any);
    readdirSpy
      .mockResolvedValueOnce(["EXPORT"] as any)          // root
      .mockResolvedValueOnce(["BANK_A", "BANK_B"] as any) // EXPORT contents
      .mockResolvedValueOnce(["PAD_1", "PAD_2"] as any)  // BANK_A contents
      .mockResolvedValueOnce(["PAD_1"] as any);           // BANK_B contents

    const result = await manager.checkP6MassStorageMode();
    expect(result!.mode).toBe("sample_export");
    expect(result!.banks).toEqual(["A", "B"]);
    expect(result!.currentBank).toBe("A");
  });

  it("excludes banks with no PAD subdirectories from availableBanks", async () => {
    statSpy.mockResolvedValue({ isDirectory: () => true } as any);
    readdirSpy
      .mockResolvedValueOnce(["EXPORT"] as any)
      .mockResolvedValueOnce(["BANK_A", "BANK_B"] as any)
      .mockResolvedValueOnce(["PAD_1"] as any)  // BANK_A has pads
      .mockResolvedValueOnce([] as any);         // BANK_B is empty

    const result = await manager.checkP6MassStorageMode();
    expect(result!.banks).toEqual(["A"]);
  });

  it("returns sample_import mode when IMPORT folder is present", async () => {
    statSpy.mockResolvedValue({ isDirectory: () => true } as any);
    readdirSpy.mockResolvedValue(["IMPORT"] as any);

    const result = await manager.checkP6MassStorageMode();
    expect(result!.mode).toBe("sample_import");
  });

  it("BACKUP is checked before RESTORE (mode priority)", async () => {
    statSpy.mockResolvedValue({ isDirectory: () => true } as any);
    readdirSpy.mockResolvedValue(["BACKUP", "RESTORE"] as any);

    const result = await manager.checkP6MassStorageMode();
    expect(result!.mode).toBe("pattern_backup");
  });

  it("returns unknown mode when path exists but has no recognised folders", async () => {
    statSpy.mockResolvedValue({ isDirectory: () => true } as any);
    readdirSpy.mockResolvedValue(["RANDOM_FOLDER"] as any);

    const result = await manager.checkP6MassStorageMode();
    expect(result!.mode).toBe("unknown");
  });
});
