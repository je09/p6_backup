import * as fs from "fs";
import { DeviceDataService } from "../../../shared/services/DeviceDataService";
import { DeviceStatus } from "../../../shared/types/index";
import { P6MassStorageInfo } from "../../../shared/services/UsbDeviceManager";

jest.mock("../../../shared/services/Logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

function makeService(
  connected = true,
  massStorageInfo: P6MassStorageInfo | null = { path: "/Volumes/P-6", mode: "pattern_export" }
) {
  const status: DeviceStatus = {
    connected, mode: "pattern_export", connectionType: "usb",
    firmwareVersion: "", deviceId: "", lastSeen: null,
  };
  return new DeviceDataService(() => status, () => massStorageInfo);
}

describe("DeviceDataService.readData", () => {
  let readdirSpy: jest.SpyInstance;
  let statSpy: jest.SpyInstance;

  beforeEach(() => {
    readdirSpy = jest.spyOn(fs.promises, "readdir");
    statSpy = jest.spyOn(fs.promises, "stat");
  });

  afterEach(() => jest.restoreAllMocks());

  it("throws when device is not connected", async () => {
    await expect(makeService(false, null).readData("patterns")).rejects.toThrow("not connected");
  });

  it("throws when mass storage is not available", async () => {
    await expect(makeService(true, null).readData("patterns")).rejects.toThrow("Mass storage not available");
  });

  it("throws for unknown data type", async () => {
    await expect(makeService().readData("unknown_type")).rejects.toThrow("Unknown data type: unknown_type");
  });

  describe("readData('samples')", () => {
    it("throws when bankId is not provided", async () => {
      await expect(makeService().readData("samples")).rejects.toThrow(
        "Bank ID is required for sample operations"
      );
    });

    it("throws when bankId is empty string", async () => {
      await expect(makeService().readData("samples", { bankId: "" })).rejects.toThrow(
        "Bank ID is required for sample operations"
      );
    });

    it("reads from EXPORT/BANK_X path and walks PAD subdirectories", async () => {
      readdirSpy
        .mockResolvedValueOnce(["PAD_1", ".DS_Store"] as any)   // BANK_A contents
        .mockResolvedValueOnce(["P6_A-1_REC.PRM", "P6_A-1_REC.WAV"] as any); // PAD_1 contents

      const result = await makeService().readData("samples", { bankId: "A" });

      expect(readdirSpy).toHaveBeenCalledWith("/Volumes/P-6/EXPORT/BANK_A");
      expect(result).toMatchObject({
        bankId: "A",
        samples: expect.arrayContaining([
          expect.objectContaining({ name: "PAD_1/P6_A-1_REC.WAV" }),
          expect.objectContaining({ name: "PAD_1/P6_A-1_REC.PRM" }),
        ]),
      });
    });

    it("uppercases the bankId when building the path", async () => {
      readdirSpy.mockResolvedValue([] as any);
      await makeService().readData("samples", { bankId: "b" });
      expect(readdirSpy).toHaveBeenCalledWith("/Volumes/P-6/EXPORT/BANK_B");
    });

    it("includes both WAV and PRM files from PAD subdirectories, excludes hidden files", async () => {
      readdirSpy
        .mockResolvedValueOnce(["PAD_1"] as any)
        .mockResolvedValueOnce(["P6_A-1_REC.WAV", "P6_A-1_REC.PRM", ".DS_Store"] as any);
      const result = (await makeService().readData("samples", { bankId: "A" })) as any;
      expect(result.samples).toHaveLength(2);
      expect(result.samples.some((s: any) => s.name.endsWith(".WAV"))).toBe(true);
      expect(result.samples.some((s: any) => s.name.endsWith(".PRM"))).toBe(true);
      expect(result.samples.every((s: any) => !s.name.includes(".DS_Store"))).toBe(true);
    });

    it("sorts PAD directories numerically (PAD_2 before PAD_10)", async () => {
      readdirSpy
        .mockResolvedValueOnce(["PAD_10", "PAD_2"] as any)
        .mockResolvedValueOnce(["P6_A-2_REC.WAV"] as any)   // PAD_2
        .mockResolvedValueOnce(["P6_A-10_REC.WAV"] as any); // PAD_10
      const result = (await makeService().readData("samples", { bankId: "A" })) as any;
      expect(result.samples[0].name).toMatch(/^PAD_2\//);
      expect(result.samples[1].name).toMatch(/^PAD_10\//);
    });
  });

  describe("readData('patterns')", () => {
    it("reads .PRM files from BACKUP folder", async () => {
      readdirSpy.mockResolvedValue(["P6_PTN1-1.PRM", "P6_PTN1-2.PRM", "IGNORE.txt"] as any);
      statSpy.mockResolvedValue({ size: 512 } as any);

      const result = (await makeService().readData("patterns")) as any[];
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ bank: 1, pattern: 1 });
    });

    it("returns empty array when BACKUP folder is unreadable", async () => {
      readdirSpy.mockRejectedValue(new Error("ENOENT"));
      const result = (await makeService().readData("patterns")) as any[];
      expect(result).toEqual([]);
    });
  });
});
