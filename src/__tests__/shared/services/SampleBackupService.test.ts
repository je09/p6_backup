import { SampleBackupService } from "../../../shared/services/SampleBackupService";
import { IDeviceConnection } from "../../../shared/services/interfaces";
import { FileSystemService } from "../../../shared/services/FileSystemService";
import { BankSamples } from "../../../shared/services/backupLayout";
import { DeviceStatus, DeviceMode, SampleBankData } from "../../../shared/types/index";
import { ModeRequirement } from "../../../shared/services/ModeService";

jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
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

function makeDevice(
  mode: DeviceMode = "sample_export",
  banks: string[] | null = ["A", "B"]
): IDeviceConnection {
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
  return svc;
}

function makeFss(): jest.Mocked<FileSystemService> {
  const fss = new (FileSystemService as any)() as jest.Mocked<FileSystemService>;
  fss.getDefaultBackupPath = jest.fn().mockResolvedValue("/backups");
  fss.copyFile = jest.fn().mockResolvedValue(undefined);
  fss.writeJsonFile = jest.fn().mockResolvedValue(undefined);
  fss.readJsonFile = jest.fn().mockResolvedValue(null);
  fss.getFileStats = jest.fn().mockResolvedValue({
    size: 1024, modified: new Date(), isDirectory: false,
  });
  return fss;
}

/** The samples.json a backup holds, as readJsonFile would return it. */
function givenBackupContains(fss: jest.Mocked<FileSystemService>, samples: BankSamples) {
  fss.readJsonFile.mockImplementation(async (filePath: string) =>
    filePath.endsWith("samples.json") ? (samples as any) : null
  );
}

describe("SampleBackupService.backupSamples", () => {
  let fss: jest.Mocked<FileSystemService>;

  beforeEach(() => {
    fss = makeFss();
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

    // The device only exposes the bank it is set to, so backing up a different
    // one would silently capture the wrong samples.
    it("refuses when the device is set to a different bank", async () => {
      const device = makeDevice();
      (device.getCurrentBank as jest.Mock).mockReturnValue("B");
      const svc = new SampleBackupService(device, fss, makeModeService());
      const result = await svc.backupSamples("A");
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/currently set to bank B/i);
    });

    it("refuses when the bank is not among those the device reports", async () => {
      const device = makeDevice("sample_export", ["A", "B"]);
      const svc = new SampleBackupService(device, fss, makeModeService());
      const result = await svc.backupSamples("C");
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not available/i);
    });

    // A copy that cannot happen must fail the backup, never be skipped: the
    // user would keep a backup that is quietly missing files.
    it("fails the backup when a sample file cannot be copied", async () => {
      const device = makeDevice();
      (device.readData as jest.Mock).mockResolvedValue({
        bankId: "A",
        samples: [{ name: "PAD_1/P6_A-1_REC.WAV", path: "/dev/EXPORT/BANK_A/PAD_1/P6_A-1_REC.WAV" }],
      });
      fss.copyFile.mockRejectedValue(new Error("ENOENT: no such file"));

      const svc = new SampleBackupService(device, fss, makeModeService());
      const result = await svc.backupSamples("A");

      expect(result.success).toBe(false);
      expect(result.message).toContain("ENOENT");
    });

    it("records the size each copied sample turned out to be", async () => {
      const device = makeDevice();
      (device.readData as jest.Mock).mockResolvedValue({
        bankId: "A",
        samples: [{ name: "PAD_1/P6_A-1_REC.WAV", path: "/dev/EXPORT/BANK_A/PAD_1/P6_A-1_REC.WAV" }],
      });
      fss.getFileStats.mockResolvedValue({
        size: 352940, modified: new Date(), isDirectory: false,
      });

      const svc = new SampleBackupService(device, fss, makeModeService());
      await svc.backupSamples("A");

      const [, written] = fss.writeJsonFile.mock.calls[0];
      expect((written as BankSamples).A[0].size).toBe(352940);
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

  beforeEach(() => {
    fss = makeFss();
  });

  it("passes s.path from samples.json directly to writeData (backup-local paths)", async () => {
    // samples.json already stores backup-local paths (written at backup time)
    givenBackupContains(fss, {
      A: [
        { name: "PAD_1/P6_A-1_REC.WAV", path: "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.WAV" },
        { name: "PAD_1/P6_A-1_REC.PRM", path: "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.PRM" },
      ],
    });
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
    givenBackupContains(fss, {
      A: [
        { name: "PAD_6/P6_B-1_REC.WAV", path: "/backups/my-backup/files/BANK_A/PAD_6/P6_B-1_REC.WAV" },
        { name: "PAD_6/P6_B-1_REC.PRM", path: "/backups/my-backup/files/BANK_A/PAD_6/P6_B-1_REC.PRM" },
      ],
    });
    const device = makeDevice("sample_import");
    const svc = new SampleBackupService(device, fss, makeModeService());
    const result = await svc.restoreSamples("/backups/my-backup", "a");
    expect(result.success).toBe(true);
    // writeData must be called with the bank the caller asked for, not the one
    // the sample filename happens to mention.
    expect((device.writeData as jest.Mock).mock.calls[0][2]).toEqual({ bankId: "a" });
    const writtenData = (device.writeData as jest.Mock).mock.calls[0][1];
    expect(writtenData.samples[0].path).toBe(
      "/backups/my-backup/files/BANK_A/PAD_6/P6_B-1_REC.WAV"
    );
  });

  it("finds the bank whatever case the backup recorded it in", async () => {
    givenBackupContains(fss, {
      A: [{ name: "PAD_1/P6_A-1_REC.WAV", path: "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.WAV" }],
    });
    const device = makeDevice("sample_import");
    const svc = new SampleBackupService(device, fss, makeModeService());
    expect((await svc.restoreSamples("/backups/my-backup", "a")).success).toBe(true);
    expect((await svc.restoreSamples("/backups/my-backup", "A")).success).toBe(true);
  });

  it("fails when the bank is not in the backup", async () => {
    givenBackupContains(fss, {
      A: [{ name: "PAD_1/P6_A-1_REC.WAV", path: "/x.WAV" }],
    });
    const svc = new SampleBackupService(makeDevice("sample_import"), fss, makeModeService());
    const result = await svc.restoreSamples("/backups/my-backup", "C");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Bank C not found/i);
  });

  it("itemCount counts WAV files only, not WAV+PRM", async () => {
    // 3 pads × 2 files (WAV+PRM) = 6 entries, but only 3 WAVs
    const bankSamples = [1, 2, 3].flatMap((n) => [
      { name: `PAD_${n}/P6_A-${n}_REC.WAV`, path: `/backups/my-backup/files/BANK_A/PAD_${n}/P6_A-${n}_REC.WAV` },
      { name: `PAD_${n}/P6_A-${n}_REC.PRM`, path: `/backups/my-backup/files/BANK_A/PAD_${n}/P6_A-${n}_REC.PRM` },
    ]);
    givenBackupContains(fss, { A: bankSamples });
    const device = makeDevice("sample_import");
    const svc = new SampleBackupService(device, fss, makeModeService());
    const result = await svc.restoreSamples("/backups/my-backup", "a");
    expect(result.itemCount).toBe(3); // WAV only
  });

  it("restores all banks using paths from samples.json directly", async () => {
    givenBackupContains(fss, {
      A: [{ name: "PAD_1/P6_A-1_REC.WAV", path: "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.WAV" }],
      B: [{ name: "PAD_1/P6_B-1_REC.WAV", path: "/backups/my-backup/files/BANK_B/PAD_1/P6_B-1_REC.WAV" }],
    });
    const device = makeDevice("sample_import");
    const svc = new SampleBackupService(device, fss, makeModeService());
    const result = await svc.restoreSamples("/backups/my-backup");
    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(2);
    const calls = (device.writeData as jest.Mock).mock.calls;
    const bankACalls = calls.filter((c: any[]) => c[2]?.bankId === "A");
    const bankBCalls = calls.filter((c: any[]) => c[2]?.bankId === "B");
    expect(bankACalls[0][1].samples[0].path).toBe(
      "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.WAV"
    );
    expect(bankBCalls[0][1].samples[0].path).toBe(
      "/backups/my-backup/files/BANK_B/PAD_1/P6_B-1_REC.WAV"
    );
  });

  // Single-bank backups used to store { bankId, samples } rather than a map.
  it("reads a backup written in the legacy single-bank shape", async () => {
    fss.readJsonFile.mockImplementation(async (filePath: string) =>
      filePath.endsWith("samples.json")
        ? ({
            bankId: "a",
            samples: [{ name: "PAD_1/P6_A-1_REC.WAV", path: "/legacy/files/BANK_A/PAD_1/P6_A-1_REC.WAV" }],
          } as any)
        : null
    );
    const device = makeDevice("sample_import");
    const svc = new SampleBackupService(device, fss, makeModeService());

    const result = await svc.restoreSamples("/legacy", "a");

    expect(result.success).toBe(true);
    expect((device.writeData as jest.Mock).mock.calls[0][1].samples[0].path).toBe(
      "/legacy/files/BANK_A/PAD_1/P6_A-1_REC.WAV"
    );
  });

  it("fails when the backup has no samples.json at all", async () => {
    const svc = new SampleBackupService(makeDevice("sample_import"), fss, makeModeService());
    const result = await svc.restoreSamples("/backups/empty", "a");
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no samples\.json/i);
  });

  describe("sampleNames filtering", () => {
    const BANK_SAMPLES = [
      { name: "PAD_1/P6_A-1_REC.WAV", path: "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.WAV" },
      { name: "PAD_1/P6_A-1_REC.PRM", path: "/backups/my-backup/files/BANK_A/PAD_1/P6_A-1_REC.PRM" },
      { name: "PAD_2/P6_A-2_REC.WAV", path: "/backups/my-backup/files/BANK_A/PAD_2/P6_A-2_REC.WAV" },
      { name: "PAD_2/P6_A-2_REC.PRM", path: "/backups/my-backup/files/BANK_A/PAD_2/P6_A-2_REC.PRM" },
    ];

    beforeEach(() => {
      givenBackupContains(fss, { A: BANK_SAMPLES });
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
