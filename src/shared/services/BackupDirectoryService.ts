import * as fs from "fs/promises";
import * as path from "path";
import { FileSystemService } from "./FileSystemService";

/**
 * Single source of truth for backup directory creation and path sanitisation.
 * Extracted from the duplicated createBackupDirectory() that existed verbatim
 * in BackupService, PatternBackupService, and SampleBackupService.
 */
export class BackupDirectoryService {
  constructor(private readonly fileSystemService: FileSystemService) {}

  async createDirectory(type: string, timestamp: string, customName?: string): Promise<string> {
    const baseDir = await this.fileSystemService.getDefaultBackupPath();
    const sanitized = customName
      ? customName.replace(/[<>:"/\\|?*]/g, "_").trim()
      : "";
    const dirName = sanitized ? `${sanitized}-${timestamp}` : `${type}-${timestamp}`;
    const backupDir = path.join(baseDir, dirName);
    await fs.mkdir(backupDir, { recursive: true });
    return backupDir;
  }
}
