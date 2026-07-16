import * as fs from "fs/promises";
import * as path from "path";
import { BackupResult, RestoreResult, PatternInfo } from "../types/index";
import { parsePrmMetadata } from "../utils/prmParser";
import { FileSystemService } from "./FileSystemService";
import { ModeService } from "./ModeService";
import { IDeviceConnection } from "./interfaces";
import { ERROR_MESSAGES } from "../constants";
import { createComponentLogger } from "./Logger";
import { ModeError } from "../errors/ModeError";
import { BackupDirectoryService } from "./BackupDirectoryService";
import { filesDir, readPatternsJson, writePatternsJson } from "./backupLayout";

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

  async backupPatterns(
    customName?: string,
    patternIds?: string[]
  ): Promise<BackupResult> {
    try {
      await this.requireDevice("pattern backup");

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupDir = await this.backupDirService.createDirectory(
        "patterns",
        timestamp,
        customName
      );

      const allPatterns = (await this.device.readData(
        "patterns"
      )) as PatternInfo[];
      const patterns =
        patternIds && patternIds.length > 0
          ? allPatterns.filter((p) => patternIds.includes(p.id))
          : allPatterns;

      // Copy first, so patterns.json records where the files ended up.
      const copied = await this.copyPatternFiles(patterns, backupDir);
      await writePatternsJson(this.fileSystemService, backupDir, copied);

      return {
        success: true,
        backupPath: backupDir,
        timestamp: new Date(),
        itemCount: copied.length,
        message: `Successfully backed up ${copied.length} patterns`,
      };
    } catch (error) {
      this.logger.error("Pattern backup failed", { error });
      return {
        success: false,
        backupPath: "",
        timestamp: new Date(),
        itemCount: 0,
        message: `Pattern backup failed: ${describe(error)}`,
      };
    }
  }

  async restorePatterns(
    backupPath: string,
    patternIds?: string[]
  ): Promise<RestoreResult> {
    try {
      await this.requireDevice("pattern restore");

      const allPatterns = await readPatternsJson(
        this.fileSystemService,
        backupPath
      );
      if (!allPatterns) throw new Error("This backup contains no patterns.json");

      const patterns =
        patternIds && patternIds.length > 0
          ? allPatterns.filter((p) => patternIds.includes(p.id))
          : allPatterns;

      // p.path already points at the file's location inside the backup.
      const success = await this.device.writeData("patterns", patterns);
      if (!success) throw new Error("Device rejected the patterns");

      return {
        success: true,
        itemCount: patterns.length,
        message: `Successfully restored ${patterns.length} patterns`,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error("Pattern restore failed", { error });
      return {
        success: false,
        itemCount: 0,
        message: `Pattern restore failed: ${describe(error)}`,
        timestamp: new Date(),
      };
    }
  }

  private async requireDevice(operation: string): Promise<void> {
    if (!this.device.getStatus().connected && !(await this.device.isReady()))
      throw new Error(ERROR_MESSAGES.DEVICE_NOT_CONNECTED);

    const requirement = this.modeService.getOperationModeRequirement(operation);
    if (requirement)
      throw new ModeError(
        requirement.currentMode,
        requirement.requiredMode,
        operation
      );
  }

  /** Copy each pattern into the backup's files/ tree, reading its metadata. */
  private async copyPatternFiles(
    patterns: PatternInfo[],
    backupDir: string
  ): Promise<PatternInfo[]> {
    const destDir = filesDir(backupDir);
    const copied: PatternInfo[] = [];
    for (const pattern of patterns) {
      if (!pattern.path) continue;
      const destPath = path.join(destDir, path.basename(pattern.path));
      await this.fileSystemService.copyFile(pattern.path, destPath);
      copied.push({
        ...pattern,
        path: destPath,
        metadata: await this.readPrmMetadata(destPath),
      });
    }
    return copied;
  }

  private async readPrmMetadata(filePath: string) {
    try {
      return parsePrmMetadata(await fs.readFile(filePath, "ascii"));
    } catch (error) {
      this.logger.warn(`Could not read PRM metadata from ${filePath}`, {
        error,
      });
      return undefined;
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
