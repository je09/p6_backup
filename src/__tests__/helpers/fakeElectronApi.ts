import { FakeP6, FakeBackup } from "./FakeP6";

/**
 * The renderer's view of a FakeP6, standing in for window.electronAPI.
 *
 * The renderer never touches the device directly — it goes through IPC. Wiring
 * a FakeP6 up behind that boundary means a restore is checked against what the
 * hardware would actually accept: the right mode for the operation, and no more
 * than one session's worth of samples before a power cycle. A test that pushes
 * too much fails the way the device would, instead of merely counting calls.
 */
export function fakeElectronApi(
  device: FakeP6,
  backups: Record<string, FakeBackup>
) {
  const backupInfo = (path: string) => ({
    path,
    name: path.split("/").pop() ?? path,
    type: "backup" as const,
    timestamp: new Date("2024-01-01"),
    size: 1024,
    itemCount: 5,
    hasPatterns: backups[path].patternIds.length > 0,
    hasSamples: Object.keys(backups[path].samples).length > 0,
    sampleBanks: Object.keys(backups[path].samples),
    description: "",
  });

  return {
    discoverBackups: jest.fn(async () => Object.keys(backups).map(backupInfo)),

    checkModeRequirement: jest.fn(async (operation: string) =>
      device.modeRequirement(operation)
    ),

    restoreSamples: jest.fn(
      async (backupPath: string, bankId: string, _sampleNames?: string[]) => {
        // The device throws; the main process turns that into a failed result.
        try {
          const { itemCount } = device.importSamples(backups[backupPath], bankId);
          return {
            success: true,
            message: `Restored bank ${bankId.toUpperCase()}`,
            itemCount,
            timestamp: new Date(),
          };
        } catch (error) {
          return {
            success: false,
            message: error instanceof Error ? error.message : String(error),
            itemCount: 0,
            timestamp: new Date(),
          };
        }
      }
    ),

    restorePatterns: jest.fn(async (backupPath: string, patternIds?: string[]) => {
      try {
        const { itemCount } = device.importPatterns(
          backups[backupPath],
          patternIds
        );
        return {
          success: true,
          message: `Restored ${itemCount} patterns`,
          itemCount,
          timestamp: new Date(),
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : String(error),
          itemCount: 0,
          timestamp: new Date(),
        };
      }
    }),

    ejectDevice: jest.fn(async () => {
      device.eject();
      return true;
    }),

    getCurrentMode: jest.fn(async () => device.currentMode()),
    onFileCopySuccess: jest.fn(),
    removeAllListeners: jest.fn(),
    getBackupDetails: jest.fn(async (path: string) => backups[path]),
    renameBackup: jest.fn(async (path: string) => path),
  };
}
