import * as fs from "fs/promises";
import * as path from "path";
import { BackupResult, RestoreResult, BackupType, PatternInfo } from "../types/index";
import { FileSystemService } from "./FileSystemService";
import { ModeService } from "./ModeService";
import { IDeviceConnection } from "./interfaces";
import { createComponentLogger } from "./Logger";
import { ModeError } from "../errors/ModeError";
import { BackupDirectoryService } from "./BackupDirectoryService";

export class PatternBackupService {
  private logger = createComponentLogger("PatternBackupService");
  private readonly backupDirService: BackupDirectoryService;

  constructor(
    private readonly device: IDeviceConnection,
    private readonly fileSystemService: FileSystemService,
    private readonly modeService: ModeService
  ) {
    this.backupDirService = new BackupDirectoryService(fileSystemService);
  }

  async backupPatterns(customName?: string, patternIds?: string[]): Promise<BackupResult> {
    try {
      let deviceStatus = this.device.getStatus();
      if (!deviceStatus.connected) {
        const isReady = await this.device.isReady();
        if (!isReady) throw new Error("P6 device not connected");
        deviceStatus = this.device.getStatus();
      }

      const modeRequirement =
        this.modeService.getOperationModeRequirement("pattern backup");
      if (modeRequirement) {
        throw new ModeError(
          modeRequirement.currentMode,
          modeRequirement.requiredMode,
          "pattern backup"
        );
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupDir = await this.backupDirService.createDirectory(
        "patterns",
        timestamp,
        customName
      );

      const allPatterns = await this.readPatternsFromDevice();
      const patterns =
        patternIds && patternIds.length > 0
          ? allPatterns.filter((p) => patternIds.includes(p.id))
          : allPatterns;

      const patternsDir = path.join(backupDir, "patterns");
      await fs.mkdir(patternsDir, { recursive: true });

      // Copy files first so we can record their backup locations in patterns.json
      const patternsWithBackupPaths = await this.copyPatternFiles(patterns, patternsDir);
      await fs.writeFile(
        path.join(patternsDir, "patterns.json"),
        JSON.stringify(patternsWithBackupPaths, null, 2)
      );

      return {
        success: true,
        backupPath: backupDir,
        type: BackupType.BACKUP,
        timestamp: new Date(),
        itemCount: patternsWithBackupPaths.length,
        message: `Successfully backed up ${patternsWithBackupPaths.length} patterns`,
      };
    } catch (error) {
      return {
        success: false,
        backupPath: "",
        type: BackupType.BACKUP,
        timestamp: new Date(),
        itemCount: 0,
        message: `Pattern backup failed: ${error instanceof Error ? error.message : error}`,
      };
    }
  }

  async restorePatterns(backupPath: string, patternIds?: string[]): Promise<RestoreResult> {
    try {
      let deviceStatus = this.device.getStatus();
      if (!deviceStatus.connected) {
        const isReady = await this.device.isReady();
        if (!isReady) throw new Error("P6 device not connected");
        deviceStatus = this.device.getStatus();
      }

      const modeRequirement =
        this.modeService.getOperationModeRequirement("pattern restore");
      if (modeRequirement) {
        throw new ModeError(
          modeRequirement.currentMode,
          modeRequirement.requiredMode,
          "pattern restore"
        );
      }

      // patterns.json stores the absolute path of each file within the backup directory.
      // Try root-level first (backup), then patterns/ subdirectory.
      let patternsJsonPath = path.join(backupPath, "patterns.json");
      try {
        await fs.access(patternsJsonPath);
      } catch {
        patternsJsonPath = path.join(backupPath, "patterns", "patterns.json");
      }

      const patternsData = await fs.readFile(patternsJsonPath, "utf-8");
      const allPatterns: PatternInfo[] = JSON.parse(patternsData);
      const patterns =
        patternIds && patternIds.length > 0
          ? allPatterns.filter((p) => patternIds.includes(p.id))
          : allPatterns;

      // p.path already points to the file's location in the backup directory.
      await this.writePatternsToDevice(patterns);

      return {
        success: true,
        type: BackupType.BACKUP,
        itemCount: patterns.length,
        message: `Successfully restored ${patterns.length} patterns`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        type: BackupType.BACKUP,
        itemCount: 0,
        message: `Pattern restore failed: ${error instanceof Error ? error.message : error}`,
        timestamp: new Date(),
      };
    }
  }

  private async readPatternsFromDevice(): Promise<PatternInfo[]> {
    try {
      const patterns = await this.device.readData("patterns");
      return (patterns as PatternInfo[]) || [];
    } catch (error) {
      this.logger.error("Failed to read patterns from device", { error });
      throw new Error(`Could not read patterns from device: ${error}`);
    }
  }

  private async copyPatternFiles(
    patterns: PatternInfo[],
    patternsDir: string
  ): Promise<PatternInfo[]> {
    const updated: PatternInfo[] = [];
    for (const pattern of patterns) {
      if (pattern.path) {
        const fileName = path.basename(pattern.path);
        const destPath = path.join(patternsDir, fileName);
        try {
          await this.fileSystemService.copyFile(pattern.path, destPath);
          updated.push({ ...pattern, path: destPath });
        } catch (error) {
          this.logger.warn(`Failed to copy pattern file ${pattern.name}`, { error });
          updated.push(pattern);
        }
      } else {
        updated.push(pattern);
      }
    }
    return updated;
  }

  private async writePatternsToDevice(patterns: PatternInfo[]): Promise<void> {
    try {
      const success = await this.device.writeData("patterns", patterns);
      if (!success) throw new Error("Failed to write patterns to device");
      this.logger.debug(
        `Successfully wrote ${patterns.length} patterns to device`
      );
    } catch (error) {
      this.logger.error(
        "Failed to write patterns to device",
        undefined,
        error as Error
      );
      throw new Error(`Could not write patterns to device: ${error}`);
    }
  }
}
