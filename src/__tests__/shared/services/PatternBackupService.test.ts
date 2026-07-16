import { PatternBackupService } from "../../../shared/services/PatternBackupService";
import { IDeviceConnection } from "../../../shared/services/interfaces";
import { FileSystemService } from "../../../shared/services/FileSystemService";
import { DeviceStatus, PatternInfo } from "../../../shared/types/index";
import { ModeRequirement } from "../../../shared/services/ModeService";

jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue("{}"),
  access: jest.fn().mockResolvedValue(undefined),
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

import { ModeService } from "../../../shared/services/ModeService";
const ModeServiceMock = ModeService as jest.MockedClass<typeof ModeService>;

const ALL_PATTERNS: PatternInfo[] = [
  { id: "1-1", bank: 1, pattern: 1, name: "P6_PTN1-1", path: "/dev/BACKUP/P6_PTN1-1.RPM", size: 512 },
  { id: "1-2", bank: 1, pattern: 2, name: "P6_PTN1-2", path: "/dev/BACKUP/P6_PTN1-2.RPM", size: 512 },
  { id: "2-1", bank: 2, pattern: 1, name: "P6_PTN2-1", path: "/dev/BACKUP/P6_PTN2-1.RPM", size: 512 },
];

function makeDevice(patterns: PatternInfo[] = ALL_PATTERNS): IDeviceConnection {
  return {
    getCurrentMode: jest.fn().mockReturnValue("pattern_export"),
    getStatus: jest.fn().mockReturnValue({ connected: true, mode: "pattern_export" } as Partial<DeviceStatus>),
    isReady: jest.fn().mockResolvedValue(true),
    retryModeDetection: jest.fn(),
    getCurrentBanks: jest.fn().mockReturnValue(null),
    getCurrentBank: jest.fn().mockReturnValue(null),
    onStatusChanged: jest.fn(),
    readData: jest.fn().mockResolvedValue(patterns),
    writeData: jest.fn().mockResolvedValue(true),
  };
}

function makeModeService(requirement: ModeRequirement | null = null): jest.Mocked<ModeService> {
  const svc = new ModeServiceMock({} as any) as jest.Mocked<ModeService>;
  svc.getOperationModeRequirement = jest.fn().mockReturnValue(requirement);

  return svc;
}

describe("PatternBackupService.backupPatterns", () => {
  let fss: jest.Mocked<FileSystemService>;

  beforeEach(() => {
    fss = new (FileSystemService as any)() as jest.Mocked<FileSystemService>;
    fss.getDefaultBackupPath = jest.fn().mockResolvedValue("/backups");
    fss.copyFile = jest.fn().mockResolvedValue(undefined);
    jest.clearAllMocks();
  });

  it("backs up all patterns when no patternIds provided", async () => {
    const device = makeDevice();
    const svc = new PatternBackupService(device, fss, makeModeService());

    const result = await svc.backupPatterns();

    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(3);
  });

  it("backs up all patterns when patternIds is empty array", async () => {
    const device = makeDevice();
    const svc = new PatternBackupService(device, fss, makeModeService());

    const result = await svc.backupPatterns(undefined, []);

    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(3);
  });

  it("backs up only the selected patterns when patternIds provided", async () => {
    const device = makeDevice();
    const svc = new PatternBackupService(device, fss, makeModeService());

    const result = await svc.backupPatterns(undefined, ["1-1", "2-1"]);

    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(2);
  });

  it("backs up a single selected pattern", async () => {
    const device = makeDevice();
    const svc = new PatternBackupService(device, fss, makeModeService());

    const result = await svc.backupPatterns(undefined, ["1-2"]);

    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(1);
  });

  it("returns itemCount 0 when patternIds match nothing", async () => {
    const device = makeDevice();
    const svc = new PatternBackupService(device, fss, makeModeService());

    const result = await svc.backupPatterns(undefined, ["9-9"]);

    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(0);
  });
});

describe("PatternBackupService.restorePatterns", () => {
  let fss: jest.Mocked<FileSystemService>;

  const BACKUP_PATTERNS: PatternInfo[] = [
    { id: "1-1", bank: 1, pattern: 1, name: "P6_PTN1-1", path: "/backups/my-backup/patterns/P6_PTN1-1.RPM", size: 512 },
    { id: "1-2", bank: 1, pattern: 2, name: "P6_PTN1-2", path: "/backups/my-backup/patterns/P6_PTN1-2.RPM", size: 512 },
    { id: "2-1", bank: 2, pattern: 1, name: "P6_PTN2-1", path: "/backups/my-backup/patterns/P6_PTN2-1.RPM", size: 512 },
  ];

  beforeEach(() => {
    fss = new (FileSystemService as any)() as jest.Mocked<FileSystemService>;
    fss.getDefaultBackupPath = jest.fn().mockResolvedValue("/backups");
    fss.copyFile = jest.fn().mockResolvedValue(undefined);
    fss.writeJsonFile = jest.fn().mockResolvedValue(undefined);
    fss.readJsonFile = jest.fn().mockImplementation(async (filePath: string) =>
      filePath.endsWith("patterns.json") ? BACKUP_PATTERNS : null
    );
    jest.clearAllMocks();
  });

  function makeRestoreDevice(): IDeviceConnection {
    return {
      getCurrentMode: jest.fn().mockReturnValue("pattern_import"),
      getStatus: jest.fn().mockReturnValue({ connected: true, mode: "pattern_import" } as Partial<DeviceStatus>),
      isReady: jest.fn().mockResolvedValue(true),
      retryModeDetection: jest.fn(),
      getCurrentBanks: jest.fn().mockReturnValue(null),
      getCurrentBank: jest.fn().mockReturnValue(null),
      onStatusChanged: jest.fn(),
      readData: jest.fn().mockResolvedValue([]),
      writeData: jest.fn().mockResolvedValue(true),
    };
  }

  it("restores all patterns when patternIds is not provided", async () => {
    const device = makeRestoreDevice();
    const svc = new PatternBackupService(device, fss, makeModeService());
    const result = await svc.restorePatterns("/backups/my-backup");
    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(3);
    const written = (device.writeData as jest.Mock).mock.calls[0][1] as PatternInfo[];
    expect(written).toHaveLength(3);
  });

  it("restores all patterns when patternIds is an empty array", async () => {
    const device = makeRestoreDevice();
    const svc = new PatternBackupService(device, fss, makeModeService());
    const result = await svc.restorePatterns("/backups/my-backup", []);
    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(3);
  });

  it("restores only the selected patterns when patternIds is provided", async () => {
    const device = makeRestoreDevice();
    const svc = new PatternBackupService(device, fss, makeModeService());
    const result = await svc.restorePatterns("/backups/my-backup", ["1-1", "2-1"]);
    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(2);
    const written = (device.writeData as jest.Mock).mock.calls[0][1] as PatternInfo[];
    expect(written.map((p) => p.id)).toEqual(["1-1", "2-1"]);
  });

  it("restores a single selected pattern", async () => {
    const device = makeRestoreDevice();
    const svc = new PatternBackupService(device, fss, makeModeService());
    const result = await svc.restorePatterns("/backups/my-backup", ["1-2"]);
    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(1);
    const written = (device.writeData as jest.Mock).mock.calls[0][1] as PatternInfo[];
    expect(written[0].id).toBe("1-2");
  });

  it("returns itemCount 0 when patternIds match nothing", async () => {
    const device = makeRestoreDevice();
    const svc = new PatternBackupService(device, fss, makeModeService());
    const result = await svc.restorePatterns("/backups/my-backup", ["9-9"]);
    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(0);
    const written = (device.writeData as jest.Mock).mock.calls[0][1] as PatternInfo[];
    expect(written).toHaveLength(0);
  });
});
