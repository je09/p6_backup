import { SampleBackupService } from "../../../shared/services/SampleBackupService";
import { IDeviceConnection } from "../../../shared/services/interfaces";
import { FileSystemService } from "../../../shared/services/FileSystemService";
import { DeviceStatus, SampleBankData } from "../../../shared/types/index";
import { ModeRequirement } from "../../../shared/services/ModeService";

jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue("{}"),
  stat: jest.fn().mockResolvedValue({ isFile: () => true }),
  copyFile: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../../shared/services/FileSystemService");
jest.mock("../../../shared/services/ModeService");
jest.mock("../../../shared/services/Logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

// Import AFTER mocking
import { ModeService } from "../../../shared/services/ModeService";
const ModeServiceMock = ModeService as jest.MockedClass<typeof ModeService>;

function makeDevice(mode = "sample_export", banks: string[] | null = ["A", "B"]): IDeviceConnection {
  return {
    getCurrentMode: jest.fn().mockReturnValue(mode),
    getStatus: jest.fn().mockReturnValue({ connected: true, mode } as Partial<DeviceStatus>),
    isReady: jest.fn().mockResolvedValue(true),
    retryModeDetection: jest.fn(),
    getCurrentBanks: jest.fn().mockReturnValue(banks),
    getCurrentBank: jest.fn().mockReturnValue(null),
    onStatusChanged: jest.fn(),
    readData: jest.fn().mockImplementation(async (_type: string, params?: any) => ({
      bankId: params?.bankId ?? "A", samples: [],
    } as SampleBankData)),
    writeData: jest.fn().mockResolvedValue(true),
  };
}

function makeModeService(requirement: ModeRequirement | null = null): jest.Mocked<ModeService> {
  const svc = new ModeServiceMock({} as any) as jest.Mocked<ModeService>;
  svc.getOperationModeRequirement = jest.fn().mockReturnValue(requirement);
  svc.waitForMode = jest.fn();
  return svc;
}

describe("SampleBackupService.backupSamples", () => {
  let fss: jest.Mocked<FileSystemService>;

  beforeEach(() => {
    fss = new (FileSystemService as any)() as jest.Mocked<FileSystemService>;
    fss.getDefaultBackupPath = jest.fn().mockResolvedValue("/backups");
    fss.copyFile = jest.fn().mockResolvedValue(undefined);
  });

  describe("single bank backup", () => {
    it("itemCount equals number of WAV files only, not WAV+PRM combined", async () => {
      const device = makeDevice();
      (device.readData as jest.Mock).mockResolvedValue({
        bankId: "A",
        samples: [
          { name: "PAD_1/P6_A-1_REC.WAV", path: "/dev/EXPORT/BANK_A/PAD_1/P6_A-1_REC.WAV" },
          { name: "PAD_1/P6_A-1_REC.PRM", path: "/dev/EXPORT/BANK_A/PAD_1/P6_A-1_REC.PRM" },
          { name: "PAD_2/P6_A-2_REC.WAV", path: "/dev/EXPORT/BANK_A/PAD_2/P6_A-2_REC.WAV" },
          { name: "PAD_2/P6_A-2_REC.PRM", path: "/dev/EXPORT/BANK_A/PAD_2/P6_A-2_REC.PRM" },
        ],
      });
      const svc = new SampleBackupService(device, fss, makeModeService());
      const result = await svc.backupSamples("A");
      expect(result.itemCount).toBe(2); // 2 WAV files, not 4 total
    });

    it("calls readData with the specified bankId", async () => {
      const device = makeDevice();
      const svc = new SampleBackupService(device, fss, makeModeService());
      await svc.backupSamples("A");
      expect(device.readData).toHaveBeenCalledWith("samples", { bankId: "A" });
    });

    it("returns success with the bank name in the message", async () => {
      const svc = new SampleBackupService(makeDevice(), fss, makeModeService());
      const result = await svc.backupSamples("B");
      expect(result.success).toBe(true);
      expect(result.message).toContain("B");
    });

    it("returns failure when device is in wrong mode", async () => {
      const modeReq: ModeRequirement = {
        operation: "sample backup", requiredMode: "sample_export", currentMode: "pattern_export",
      };
      const svc = new SampleBackupService(makeDevice("pattern_export"), fss, makeModeService(modeReq));
      const result = await svc.backupSamples("A");
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/mode/i);
    });
  });

  describe("all banks backup (no bankId)", () => {
    it("iterates over all available banks from getCurrentBanks", async () => {
      const device = makeDevice("sample_export", ["A", "B", "C"]);
      const svc = new SampleBackupService(device, fss, makeModeService());
      await svc.backupSamples();
      const calls = (device.readData as jest.Mock).mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls.map(([, p]: [string, any]) => p.bankId)).toEqual(["A", "B", "C"]);
    });

    it("falls back to all 8 banks when getCurrentBanks returns null", async () => {
      const device = makeDevice("sample_export", null);
      const svc = new SampleBackupService(device, fss, makeModeService());
      await svc.backupSamples();
      expect((device.readData as jest.Mock).mock.calls).toHaveLength(8);
    });

    it("skips banks that throw without failing the whole operation", async () => {
      const device = makeDevice("sample_export", ["A", "B"]);
      (device.readData as jest.Mock).mockImplementation(async (_type: string, params?: any) => {
        if (params?.bankId === "B") throw new Error("bank error");
        return { bankId: params?.bankId, samples: [] } as SampleBankData;
      });
      const svc = new SampleBackupService(device, fss, makeModeService());
      const result = await svc.backupSamples();
      expect(result.success).toBe(true);
    });

    it("never calls readData without a bankId", async () => {
      const device = makeDevice("sample_export", ["A"]);
      const svc = new SampleBackupService(device, fss, makeModeService());
      await svc.backupSamples();
      const callsWithoutBankId = (device.readData as jest.Mock).mock.calls.filter(
        ([, p]: [string, any]) => !p?.bankId
      );
      expect(callsWithoutBankId).toHaveLength(0);
    });
  });
});

describe("SampleBackupService.restoreSamples", () => {
  let fss: jest.Mocked<FileSystemService>;
  let fsMock: jest.Mocked<typeof import("fs/promises")>;

  beforeEach(() => {
    fss = new (FileSystemService as any)() as jest.Mocked<FileSystemService>;
    fss.getDefaultBackupPath = jest.fn().mockResolvedValue("/backups");
    fss.copyFile = jest.fn().mockResolvedValue(undefined);
    fsMock = jest.requireMock("fs/promises");
    jest.clearAllMocks();
    (fsMock.mkdir as jest.Mock).mockResolvedValue(undefined);
  });

  it("passes s.path from samples.json directly to writeData (backup-local paths)", async () => {
    // samples.json already stores backup-local paths (written by organizeBackup)
    (fsMock.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        a: [
          { name: "PAD_1/P6_A-1_REC.WAV", path: "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.WAV" },
          { name: "PAD_1/P6_A-1_REC.PRM", path: "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.PRM" },
        ],
      })
    );
    const device = makeDevice("sample_import");
    const svc = new SampleBackupService(device, fss, makeModeService());
    const result = await svc.restoreSamples("/backups/my-backup", "a");
    expect(result.success).toBe(true);
    const writtenData = (device.writeData as jest.Mock).mock.calls[0][1];
    expect(writtenData.samples[0].path).toBe(
      "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.WAV"
    );
    expect(writtenData.samples[1].path).toBe(
      "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.PRM"
    );
  });

  it("P6_B-1_REC in BANK_A/PAD_6 restores to BANK_A/PAD_6, not BANK_B", async () => {
    (fsMock.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        a: [
          { name: "PAD_6/P6_B-1_REC.WAV", path: "/backups/my-backup/files/BANK_A/PAD_6/P6_B-1_REC.WAV" },
          { name: "PAD_6/P6_B-1_REC.PRM", path: "/backups/my-backup/files/BANK_A/PAD_6/P6_B-1_REC.PRM" },
        ],
      })
    );
    const device = makeDevice("sample_import");
    const svc = new SampleBackupService(device, fss, makeModeService());
    const result = await svc.restoreSamples("/backups/my-backup", "a");
    expect(result.success).toBe(true);
    // writeData must be called with bankId "a" (not "b")
    expect((device.writeData as jest.Mock).mock.calls[0][2]).toEqual({ bankId: "a" });
    const writtenData = (device.writeData as jest.Mock).mock.calls[0][1];
    expect(writtenData.samples[0].path).toBe(
      "/backups/my-backup/files/BANK_A/PAD_6/P6_B-1_REC.WAV"
    );
  });

  it("itemCount counts WAV files only, not WAV+PRM", async () => {
    // 3 pads × 2 files (WAV+PRM) = 6 entries, but only 3 WAVs
    const bankSamples = [1, 2, 3].flatMap((n) => [
      { name: `PAD_${n}/P6_A-${n}_REC.WAV`, path: `/backups/my-backup/files/BANK_A/PAD_${n}/P6_A-${n}_REC.WAV` },
      { name: `PAD_${n}/P6_A-${n}_REC.PRM`, path: `/backups/my-backup/files/BANK_A/PAD_${n}/P6_A-${n}_REC.PRM` },
    ]);
    (fsMock.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({ a: bankSamples })
    );
    const device = makeDevice("sample_import");
    const svc = new SampleBackupService(device, fss, makeModeService());
    const result = await svc.restoreSamples("/backups/my-backup", "a");
    expect(result.itemCount).toBe(3); // WAV only
  });

  it("restores all banks using paths from samples.json directly", async () => {
    (fsMock.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({
        a: [{ name: "PAD_1/P6_A-1_REC.WAV", path: "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.WAV" }],
        b: [{ name: "PAD_1/P6_B-1_REC.WAV", path: "/backups/my-backup/files/BANK_B/PAD_1/P6_B-1_REC.WAV" }],
      })
    );
    const device = makeDevice("sample_import");
    const svc = new SampleBackupService(device, fss, makeModeService());
    const result = await svc.restoreSamples("/backups/my-backup");
    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(2);
    const calls = (device.writeData as jest.Mock).mock.calls;
    const bankACalls = calls.filter((c: any[]) => c[2]?.bankId === "a");
    const bankBCalls = calls.filter((c: any[]) => c[2]?.bankId === "b");
    expect(bankACalls[0][1].samples[0].path).toBe(
      "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.WAV"
    );
    expect(bankBCalls[0][1].samples[0].path).toBe(
      "/backups/my-backup/files/BANK_B/PAD_1/P6_B-1_REC.WAV"
    );
  });

  describe("sampleNames filtering", () => {
    const BANK_SAMPLES = [
      { name: "PAD_1/P6_A-1_REC.WAV", path: "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.WAV" },
      { name: "PAD_1/P6_A-1_REC.PRM", path: "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.PRM" },
      { name: "PAD_2/P6_A-2_REC.WAV", path: "/backups/my-backup/files/BANK_A/PAD_2/P6_A-2_REC.WAV" },
      { name: "PAD_2/P6_A-2_REC.PRM", path: "/backups/my-backup/files/BANK_A/PAD_2/P6_A-2_REC.PRM" },
    ];

    beforeEach(() => {
      (fsMock.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({ a: BANK_SAMPLES })
      );
    });

    it("restores all samples when sampleNames is not provided", async () => {
      const device = makeDevice("sample_import");
      const svc = new SampleBackupService(device, fss, makeModeService());
      const result = await svc.restoreSamples("/backups/my-backup", "a");
      expect(result.success).toBe(true);
      const written = (device.writeData as jest.Mock).mock.calls[0][1];
      expect(written.samples).toHaveLength(4);
    });

    it("restores all samples when sampleNames is an empty array", async () => {
      const device = makeDevice("sample_import");
      const svc = new SampleBackupService(device, fss, makeModeService());
      const result = await svc.restoreSamples("/backups/my-backup", "a", []);
      expect(result.success).toBe(true);
      const written = (device.writeData as jest.Mock).mock.calls[0][1];
      expect(written.samples).toHaveLength(4);
    });

    it("restores only matching samples when sampleNames is provided", async () => {
      const device = makeDevice("sample_import");
      const svc = new SampleBackupService(device, fss, makeModeService());
      const result = await svc.restoreSamples("/backups/my-backup", "a", [
        "PAD_1/P6_A-1_REC.WAV",
        "PAD_1/P6_A-1_REC.PRM",
      ]);
      expect(result.success).toBe(true);
      const written = (device.writeData as jest.Mock).mock.calls[0][1];
      expect(written.samples).toHaveLength(2);
      expect(written.samples[0].name).toBe("PAD_1/P6_A-1_REC.WAV");
      expect(written.samples[1].name).toBe("PAD_1/P6_A-1_REC.PRM");
    });

    it("itemCount counts only WAV files in the filtered set", async () => {
      const device = makeDevice("sample_import");
      const svc = new SampleBackupService(device, fss, makeModeService());
      // Select PAD_1 WAV + PRM — itemCount should be 1 (only the WAV)
      const result = await svc.restoreSamples("/backups/my-backup", "a", [
        "PAD_1/P6_A-1_REC.WAV",
        "PAD_1/P6_A-1_REC.PRM",
      ]);
      expect(result.itemCount).toBe(1);
    });
  });
});
