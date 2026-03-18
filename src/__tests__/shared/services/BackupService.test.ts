import { BackupService } from "../../../shared/services/BackupService";
import { IDeviceConnection } from "../../../shared/services/interfaces";
import { FileSystemService } from "../../../shared/services/FileSystemService";
import { DeviceStatus, PatternInfo, SampleBankData } from "../../../shared/types/index";

// Must mock fs/promises with a factory so properties are writable
const mockMkdir = jest.fn().mockResolvedValue(undefined);
const mockWriteFile = jest.fn().mockResolvedValue(undefined);
jest.mock("fs/promises", () => ({
  mkdir: (...args: any[]) => mockMkdir(...args),
  writeFile: (...args: any[]) => mockWriteFile(...args),
  access: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  readFile: jest.fn().mockResolvedValue("{}"),
  stat: jest.fn().mockResolvedValue({ isFile: () => true }),
  copyFile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../shared/services/FileSystemService");
jest.mock("../../../shared/services/PatternBackupService");
jest.mock("../../../shared/services/SampleBackupService");
jest.mock("../../../shared/services/Logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
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

describe("BackupService.backup", () => {
  let fss: jest.Mocked<FileSystemService>;

  beforeEach(() => {
    fss = new (FileSystemService as any)() as jest.Mocked<FileSystemService>;
    fss.getDefaultBackupPath = jest.fn().mockResolvedValue("/backups");
    fss.copyFile = jest.fn().mockResolvedValue(undefined);
    jest.clearAllMocks();
    // Re-apply after clearAllMocks
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  describe("when includeSamples is true and no bankIds provided", () => {
    it("iterates over available banks from device instead of calling readData without bankId", async () => {
      const device = makeDevice({
        getCurrentBanks: jest.fn().mockReturnValue(["A", "B"]),
        readData: jest.fn().mockImplementation(async (type: string, params?: any) => {
          if (type === "patterns") return [] as PatternInfo[];
          if (!params?.bankId) throw new Error("Bank ID is required for sample operations");
          return { bankId: params.bankId, samples: [] } as SampleBankData;
        }),
      });

      const svc = new BackupService(device, fss);
      const result = await svc.backup({ includePatterns: false, includeSamples: true });

      expect(result.success).toBe(true);
      const sampleCalls = (device.readData as jest.Mock).mock.calls.filter(
        ([type]: [string]) => type === "samples"
      );
      expect(sampleCalls).toHaveLength(2);
      expect(sampleCalls[0][1].bankId).toBe("A");
      expect(sampleCalls[1][1].bankId).toBe("B");
    });

    it("falls back to all 8 banks (A–H) when getCurrentBanks returns null", async () => {
      const device = makeDevice({
        getCurrentBanks: jest.fn().mockReturnValue(null),
        readData: jest.fn().mockImplementation(async (type: string, params?: any) => {
          if (type === "patterns") return [] as PatternInfo[];
          if (!params?.bankId) throw new Error("Bank ID is required for sample operations");
          return { bankId: params.bankId, samples: [] } as SampleBankData;
        }),
      });

      const svc = new BackupService(device, fss);
      const result = await svc.backup({ includePatterns: false, includeSamples: true });

      expect(result.success).toBe(true);
      const sampleCalls = (device.readData as jest.Mock).mock.calls.filter(
        ([type]: [string]) => type === "samples"
      );
      expect(sampleCalls).toHaveLength(8);
      const usedBankIds = sampleCalls.map(([, p]: [string, any]) => p.bankId);
      expect(usedBankIds).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    });

    it("skips banks that throw (bank not on device)", async () => {
      const device = makeDevice({
        getCurrentBanks: jest.fn().mockReturnValue(["A", "B", "C"]),
        readData: jest.fn().mockImplementation(async (type: string, params?: any) => {
          if (type === "patterns") return [] as PatternInfo[];
          if (params?.bankId === "B") throw new Error("Bank B not found");
          return { bankId: params.bankId, samples: [] } as SampleBankData;
        }),
      });

      const svc = new BackupService(device, fss);
      const result = await svc.backup({ includePatterns: false, includeSamples: true });

      expect(result.success).toBe(true);
      const sampleCalls = (device.readData as jest.Mock).mock.calls.filter(
        ([type]: [string]) => type === "samples"
      );
      expect(sampleCalls).toHaveLength(3);
    });
  });

  describe("when bankIds are provided explicitly", () => {
    it("only reads the specified banks", async () => {
      const device = makeDevice({
        readData: jest.fn().mockImplementation(async (type: string, params?: any) => {
          if (type === "patterns") return [] as PatternInfo[];
          return { bankId: params.bankId, samples: [] } as SampleBankData;
        }),
      });

      const svc = new BackupService(device, fss);
      await svc.backup({
        includePatterns: false,
        includeSamples: true,
        bankIds: ["A", "C"],
      });

      const sampleCalls = (device.readData as jest.Mock).mock.calls.filter(
        ([type]: [string]) => type === "samples"
      );
      expect(sampleCalls).toHaveLength(2);
      expect(sampleCalls[0][1].bankId).toBe("A");
      expect(sampleCalls[1][1].bankId).toBe("C");
    });
  });

  describe("patterns + samples combined", () => {
    it("backs up both patterns and samples in a single folder", async () => {
      const patterns: PatternInfo[] = [
        { id: "1-1", bank: 1, pattern: 1, name: "P6_PTN1-1", path: "/dev/BACKUP/P6_PTN1-1.PRM", size: 512 },
      ];
      const device = makeDevice({
        getCurrentBanks: jest.fn().mockReturnValue(["A"]),
        readData: jest.fn().mockImplementation(async (type: string, params?: any) => {
          if (type === "patterns") return patterns;
          return { bankId: params.bankId, samples: [] } as SampleBankData;
        }),
      });

      const svc = new BackupService(device, fss);
      const result = await svc.backup({
        includePatterns: true,
        includeSamples: true,
      });

      expect(result.success).toBe(true);
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining("manifest.json"),
        expect.any(String)
      );
    });
  });

  describe("when device is disconnected", () => {
    it("attempts to reconnect via isReady before backing up", async () => {
      const device = makeDevice({
        getStatus: jest.fn()
          .mockReturnValueOnce({ connected: false, mode: "unknown" })
          .mockReturnValue({ connected: true, mode: "pattern_export" }),
        isReady: jest.fn().mockResolvedValue(true),
        readData: jest.fn().mockResolvedValue([]),
      });

      const svc = new BackupService(device, fss);
      await svc.backup({ includePatterns: true, includeSamples: false });

      expect(device.isReady).toHaveBeenCalled();
    });

    it("returns failure when device cannot be reached", async () => {
      const device = makeDevice({
        getStatus: jest.fn().mockReturnValue({ connected: false, mode: "unknown" }),
        isReady: jest.fn().mockResolvedValue(false),
      });

      const svc = new BackupService(device, fss);
      const result = await svc.backup({ includePatterns: true });

      expect(result.success).toBe(false);
      expect(result.message).toContain("not connected");
    });
  });
});
