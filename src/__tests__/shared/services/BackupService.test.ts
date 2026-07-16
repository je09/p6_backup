import { BackupService } from "../../../shared/services/BackupService";
import { IDeviceConnection } from "../../../shared/services/interfaces";
import { FileSystemService } from "../../../shared/services/FileSystemService";
import { BankSamples } from "../../../shared/services/backupLayout";
import {
  BackupStageResult,
  DeviceStatus,
  PatternInfo,
} from "../../../shared/types/index";

const mockRm = jest.fn().mockResolvedValue(undefined);
jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  rm: (...args: any[]) => mockRm(...args),
}));

jest.mock("../../../shared/services/FileSystemService");
jest.mock("../../../shared/services/PatternBackupService");
jest.mock("../../../shared/services/SampleBackupService");
jest.mock("../../../shared/services/Logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

function makeDevice(overrides: Partial<IDeviceConnection> = {}): IDeviceConnection {
  return {
    getCurrentMode: jest.fn().mockReturnValue("pattern_export"),
    getStatus: jest.fn().mockReturnValue({
      connected: true,
      mode: "pattern_export",
    } as Partial<DeviceStatus>),
    isReady: jest.fn().mockResolvedValue(true),
    retryModeDetection: jest.fn(),
    getCurrentBanks: jest.fn().mockReturnValue(null),
    getCurrentBank: jest.fn().mockReturnValue(null),
    onStatusChanged: jest.fn(),
    readData: jest.fn(),
    writeData: jest.fn(),
    ...overrides,
  };
}

function patternStage(backupPath: string, itemCount = 1): BackupStageResult {
  return {
    type: "patterns",
    result: {
      success: true, backupPath, itemCount, timestamp: new Date(), message: "ok",
    },
  };
}

function sampleStage(backupPath: string, bank: string, itemCount = 2): BackupStageResult {
  return {
    type: "samples",
    bank,
    result: {
      success: true, backupPath, itemCount, timestamp: new Date(), message: "ok",
    },
  };
}

/** Reads back what the service wrote to a given file. */
function writtenTo(fss: jest.Mocked<FileSystemService>, suffix: string): any {
  const call = [...fss.writeJsonFile.mock.calls]
    .reverse()
    .find(([filePath]) => (filePath as string).endsWith(suffix));
  return call?.[1];
}

describe("BackupService.organizeBackup", () => {
  let fss: jest.Mocked<FileSystemService>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRm.mockResolvedValue(undefined);
    fss = new (FileSystemService as any)() as jest.Mocked<FileSystemService>;
    fss.getDefaultBackupPath = jest.fn().mockResolvedValue("/backups");
    fss.copyFile = jest.fn().mockResolvedValue(undefined);
    fss.copyDirectory = jest.fn().mockResolvedValue(undefined);
    fss.writeJsonFile = jest.fn().mockResolvedValue(undefined);
    fss.readJsonFile = jest.fn().mockResolvedValue(null);
  });

  it("writes a manifest naming what was gathered", async () => {
    const svc = new BackupService(makeDevice(), fss);

    const result = await svc.organizeBackup({
      precompletedResults: [
        patternStage("/backups/patterns-stage", 4),
        sampleStage("/backups/samples-stage", "a", 6),
      ],
    });

    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(10);
    const manifest = writtenTo(fss, "manifest.json");
    expect(manifest.totalItemCount).toBe(10);
    expect(manifest.results).toEqual([
      { type: "patterns", itemCount: 4 },
      { type: "samples", bank: "a", itemCount: 6 },
    ]);
  });

  it("records the custom name as the backup's display name", async () => {
    const svc = new BackupService(makeDevice(), fss);

    await svc.organizeBackup({
      precompletedResults: [patternStage("/backups/patterns-stage")],
      customName: "My Session",
    });

    expect(writtenTo(fss, "manifest.json").displayName).toBe("My Session");
  });

  // Each stage ran in its own device session and left its files behind; the
  // gathered backup has to point at its own copies, not the staging ones.
  it("repoints pattern paths at the gathered backup", async () => {
    const staged: PatternInfo[] = [
      {
        id: "1-1", bank: 1, pattern: 1, name: "P6_PTN1-1",
        path: "/backups/patterns-stage/files/P6_PTN1-1.PRM", size: 512,
      },
    ];
    fss.readJsonFile.mockImplementation(async (filePath: string) =>
      filePath === "/backups/patterns-stage/patterns.json" ? (staged as any) : null
    );
    const svc = new BackupService(makeDevice(), fss);

    const result = await svc.organizeBackup({
      precompletedResults: [patternStage("/backups/patterns-stage")],
    });

    const patterns = writtenTo(fss, "patterns.json") as PatternInfo[];
    expect(patterns[0].path).toBe(`${result.backupPath}/files/P6_PTN1-1.PRM`);
    expect(fss.copyDirectory).toHaveBeenCalledWith(
      "/backups/patterns-stage/files",
      `${result.backupPath}/files`
    );
  });

  it("repoints sample paths at the gathered backup", async () => {
    const staged: BankSamples = {
      A: [{ name: "PAD_1/P6_A-1_REC.WAV", path: "/backups/a-stage/files/BANK_A/PAD_1/P6_A-1_REC.WAV", size: 10 }],
    };
    fss.readJsonFile.mockImplementation(async (filePath: string) =>
      filePath === "/backups/a-stage/samples.json" ? (staged as any) : null
    );
    const svc = new BackupService(makeDevice(), fss);

    const result = await svc.organizeBackup({
      precompletedResults: [sampleStage("/backups/a-stage", "a")],
    });

    const samples = writtenTo(fss, "samples.json") as BankSamples;
    expect(samples.A[0].path).toBe(
      `${result.backupPath}/files/BANK_A/PAD_1/P6_A-1_REC.WAV`
    );
    expect(fss.copyDirectory).toHaveBeenCalledWith(
      "/backups/a-stage/files/BANK_A",
      `${result.backupPath}/files/BANK_A`
    );
  });

  // Every bank is its own device session, so they arrive as separate stages and
  // must accumulate rather than overwrite each other.
  it("merges banks gathered from separate sessions", async () => {
    const stagedA: BankSamples = { A: [{ name: "PAD_1/a.WAV", path: "/backups/a-stage/files/BANK_A/PAD_1/a.WAV" }] };
    const stagedB: BankSamples = { B: [{ name: "PAD_1/b.WAV", path: "/backups/b-stage/files/BANK_B/PAD_1/b.WAV" }] };
    const finalSoFar: Record<string, any> = {};

    fss.readJsonFile.mockImplementation(async (filePath: string) => {
      if (filePath === "/backups/a-stage/samples.json") return stagedA as any;
      if (filePath === "/backups/b-stage/samples.json") return stagedB as any;
      // The gathered backup's own samples.json, as written so far.
      return (finalSoFar[filePath] as any) ?? null;
    });
    fss.writeJsonFile.mockImplementation(async (filePath: string, data: unknown) => {
      finalSoFar[filePath] = data;
    });

    const svc = new BackupService(makeDevice(), fss);
    await svc.organizeBackup({
      precompletedResults: [
        sampleStage("/backups/a-stage", "a"),
        sampleStage("/backups/b-stage", "b"),
      ],
    });

    const samples = writtenTo(fss, "samples.json") as BankSamples;
    expect(Object.keys(samples).sort()).toEqual(["A", "B"]);
  });

  it("removes the staging directories once gathered", async () => {
    const svc = new BackupService(makeDevice(), fss);

    await svc.organizeBackup({
      precompletedResults: [
        patternStage("/backups/patterns-stage"),
        sampleStage("/backups/a-stage", "a"),
      ],
    });

    expect(mockRm).toHaveBeenCalledWith("/backups/patterns-stage", {
      recursive: true, force: true,
    });
    expect(mockRm).toHaveBeenCalledWith("/backups/a-stage", {
      recursive: true, force: true,
    });
  });

  it("ignores stages that failed", async () => {
    const failed: BackupStageResult = {
      type: "patterns",
      result: {
        success: false, backupPath: "", itemCount: 0, timestamp: new Date(), message: "nope",
      },
    };
    const svc = new BackupService(makeDevice(), fss);

    const result = await svc.organizeBackup({
      precompletedResults: [failed, sampleStage("/backups/a-stage", "a", 3)],
    });

    expect(result.itemCount).toBe(3);
    expect(writtenTo(fss, "manifest.json").results).toEqual([
      { type: "samples", bank: "a", itemCount: 3 },
    ]);
  });

  // Every stage ends by ejecting, so the gather always runs with no device.
  describe("with no device attached", () => {
    const ejected = () =>
      makeDevice({
        getStatus: jest.fn().mockReturnValue({ connected: false, mode: "unknown" }),
        isReady: jest.fn().mockResolvedValue(false),
      });

    it("gathers the backup anyway", async () => {
      const svc = new BackupService(ejected(), fss);

      const result = await svc.organizeBackup({
        precompletedResults: [
          patternStage("/backups/patterns-stage", 4),
          sampleStage("/backups/a-stage", "a", 6),
        ],
      });

      expect(result.success).toBe(true);
      expect(result.itemCount).toBe(10);
    });

    it("never asks the device for anything", async () => {
      const device = ejected();
      const svc = new BackupService(device, fss);

      await svc.organizeBackup({
        precompletedResults: [patternStage("/backups/patterns-stage")],
      });

      expect(device.isReady).not.toHaveBeenCalled();
      expect(device.readData).not.toHaveBeenCalled();
    });
  });
});
