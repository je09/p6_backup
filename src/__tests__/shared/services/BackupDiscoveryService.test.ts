import { BackupDiscoveryService } from "../../../shared/services/BackupDiscoveryService";
import { FileSystemService } from "../../../shared/services/FileSystemService";

jest.mock("fs/promises", () => ({
  readdir: jest.fn().mockResolvedValue([]),
  stat: jest.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
}));
jest.mock("../../../shared/services/FileSystemService");
jest.mock("../../../shared/services/Logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));
jest.mock("../../../shared/utils/prmParser", () => ({
  parsePrmMetadata: jest.fn().mockReturnValue(null),
}));

const BACKUP_PATH = "/Users/je09/P6Backups/full-backup-2026-03-19T18-35-42-919Z";

function makeFss(samplesData: any = null, patternsData: any = null): jest.Mocked<FileSystemService> {
  const fss = new (FileSystemService as any)() as jest.Mocked<FileSystemService>;
  fss.readJsonFile = jest.fn().mockImplementation(async (filePath: string) => {
    if (filePath.endsWith("samples.json")) return samplesData;
    if (filePath.endsWith("patterns.json")) return patternsData;
    return null;
  });
  fss.getDefaultBackupPath = jest.fn().mockResolvedValue("/backups");
  fss.listDirectories = jest.fn().mockResolvedValue([]);
  fss.ensureBackupDirectoryExists = jest.fn().mockResolvedValue(undefined);
  return fss;
}

describe("BackupDiscoveryService.getBackupDetails — pad number extraction", () => {
  it("derives pad numbers from PAD_X/ filename prefix, not array index", async () => {
    // Matches the real format produced by organizeBackup / SampleBackupService
    const samplesData = {
      a: [
        { name: "PAD_1/P6_A-1_REC.PRM", size: 829,    path: `${BACKUP_PATH}/files/BANK_A/PAD_1/P6_A-1_REC.PRM` },
        { name: "PAD_1/P6_A-1_REC.WAV", size: 352940, path: `${BACKUP_PATH}/files/BANK_A/PAD_1/P6_A-1_REC.WAV` },
        { name: "PAD_3/P6_A-3_REC.PRM", size: 826,    path: `${BACKUP_PATH}/files/BANK_A/PAD_3/P6_A-3_REC.PRM` },
        { name: "PAD_3/P6_A-3_REC.WAV", size: 524428, path: `${BACKUP_PATH}/files/BANK_A/PAD_3/P6_A-3_REC.WAV` },
      ],
    };
    const svc = new BackupDiscoveryService(makeFss(samplesData));
    const details = await svc.getBackupDetails(BACKUP_PATH);

    const bankA = details.samples["A"];
    expect(bankA).toHaveLength(4);

    expect(bankA.filter((e: any) => e.pad === 1)).toHaveLength(2);
    expect(bankA.filter((e: any) => e.pad === 3)).toHaveLength(2);
    // Without the fix, index-based assignment would incorrectly give pad 2 to
    // the second entry (PAD_1/P6_A-1_REC.WAV)
    expect(bankA.filter((e: any) => e.pad === 2)).toHaveLength(0);
  });

  it("handles non-contiguous pads — missing PAD_2 does not shift PAD_3 entries", async () => {
    // PAD_2 absent; PAD_3 entries must still get pad === 3, not pad === 3 via index fallback
    const samplesData = {
      b: [
        { name: "PAD_1/P6_B-1_REC.PRM", size: 829,    path: `${BACKUP_PATH}/files/BANK_B/PAD_1/P6_B-1_REC.PRM` },
        { name: "PAD_1/P6_B-1_REC.WAV", size: 164176, path: `${BACKUP_PATH}/files/BANK_B/PAD_1/P6_B-1_REC.WAV` },
        { name: "PAD_3/P6_B-3_REC.PRM", size: 826,    path: `${BACKUP_PATH}/files/BANK_B/PAD_3/P6_B-3_REC.PRM` },
        { name: "PAD_3/P6_B-3_REC.WAV", size: 524428, path: `${BACKUP_PATH}/files/BANK_B/PAD_3/P6_B-3_REC.WAV` },
      ],
    };
    const svc = new BackupDiscoveryService(makeFss(samplesData));
    const details = await svc.getBackupDetails(BACKUP_PATH);

    const bankB = details.samples["B"];
    expect(bankB.filter((e: any) => e.pad === 1)).toHaveLength(2);
    expect(bankB.filter((e: any) => e.pad === 2)).toHaveLength(0);
    expect(bankB.filter((e: any) => e.pad === 3)).toHaveLength(2);
  });

  it("uppercases the bank key regardless of how it appears in samples.json", async () => {
    const samplesData = {
      c: [
        { name: "PAD_2/P6_C-2_REC.PRM", size: 829,    path: `${BACKUP_PATH}/files/BANK_C/PAD_2/P6_C-2_REC.PRM` },
        { name: "PAD_2/P6_C-2_REC.WAV", size: 352940, path: `${BACKUP_PATH}/files/BANK_C/PAD_2/P6_C-2_REC.WAV` },
      ],
    };
    const svc = new BackupDiscoveryService(makeFss(samplesData));
    const details = await svc.getBackupDetails(BACKUP_PATH);

    expect(details.samples["C"]).toBeDefined();
    expect(details.samples["c"]).toBeUndefined();
    expect(details.samples["C"][0].pad).toBe(2);
  });

  it("falls back to sample.pad field when name has no PAD_X/ prefix", async () => {
    const samplesData = {
      d: [{ name: "unknown.wav", pad: 5, size: 10, path: `${BACKUP_PATH}/files/BANK_D/unknown.wav` }],
    };
    const svc = new BackupDiscoveryService(makeFss(samplesData));
    const details = await svc.getBackupDetails(BACKUP_PATH);

    expect(details.samples["D"][0].pad).toBe(5);
  });
});
