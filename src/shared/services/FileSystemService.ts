import * as fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import * as path from "path";
import { shell } from "electron";
import * as os from "os";
import { SUCCESS_MESSAGES } from "../constants/messages";
import { createComponentLogger } from "./Logger";

/** Reported to the UI as each file lands, to show progress during a backup. */
export interface FileCopiedEvent {
  fileName: string;
  message: string;
}

export class FileSystemService {
  private defaultBackupPath: string;
  private logger = createComponentLogger("FileSystemService");

  constructor(private readonly onFileCopied?: (event: FileCopiedEvent) => void) {
    this.defaultBackupPath = path.join(os.homedir(), "P6Backups");
  }

  async getDefaultBackupPath(): Promise<string> {
    await this.ensureBackupDirectoryExists();
    return this.defaultBackupPath;
  }

  async setBackupPath(newPath: string): Promise<void> {
    try {
      await fs.access(newPath, fs.constants.W_OK);
    } catch (error) {
      throw new Error(`Cannot set backup path: ${error}`);
    }
    this.defaultBackupPath = newPath;
  }

  async ensureBackupDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.defaultBackupPath, { recursive: true });
    } catch (error) {
      throw new Error(`Cannot create backup directory: ${error}`);
    }
  }

  async openFolder(folderPath: string): Promise<void> {
    await shell.openPath(folderPath);
  }

  async copyDirectory(
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    await fs.mkdir(destinationPath, { recursive: true });
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      const from = path.join(sourcePath, entry.name);
      const to = path.join(destinationPath, entry.name);
      if (entry.isDirectory()) {
        await this.copyDirectory(from, to);
      } else {
        await this.copyFile(from, to);
      }
    }
  }

  /**
   * Copy one file, or throw. A skipped file would leave the user holding a
   * backup that is silently incomplete, so every failure is fatal.
   */
  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    if (!sourcePath || !destinationPath)
      throw new Error(
        `Cannot copy file: empty source or destination path (${sourcePath} -> ${destinationPath})`
      );

    const stats = await fs.stat(sourcePath);
    if (!stats.isFile())
      throw new Error(`Cannot copy file: ${sourcePath} is not a file`);

    await fs.mkdir(path.dirname(destinationPath), { recursive: true });

    const fileName = path.basename(sourcePath);
    try {
      await fs.copyFile(sourcePath, destinationPath);
      this.announceCopy(SUCCESS_MESSAGES.FILE_COPY_SUCCESS, sourcePath, destinationPath);
    } catch (error: any) {
      // Some filesystems the device mounts under reject the native copy.
      if (error.code !== "ENOTSUP" && error.code !== "EXDEV") throw error;
      this.logger.debug(
        `Native copyFile unsupported for ${fileName}, streaming instead`
      );
      await pipeline(
        createReadStream(sourcePath),
        createWriteStream(destinationPath)
      );
      this.announceCopy(SUCCESS_MESSAGES.MANUAL_COPY_SUCCESS, sourcePath, destinationPath);
    }
  }

  private announceCopy(
    message: (source: string, dest: string) => string,
    sourcePath: string,
    destinationPath: string
  ): void {
    const fileName = path.basename(sourcePath);
    const destName = path.basename(destinationPath);
    this.logger.debug(`Copied ${fileName} to ${destName}`);
    this.onFileCopied?.({ fileName, message: message(fileName, destName) });
  }

  async listDirectories(basePath: string): Promise<string[]> {
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  async listFiles(basePath: string): Promise<string[]> {
    const entries = await fs.readdir(basePath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();
  }

  async getFileStats(filePath: string): Promise<{
    size: number;
    modified: Date;
    isDirectory: boolean;
  }> {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      modified: stats.mtime,
      isDirectory: stats.isDirectory(),
    };
  }

  async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /** Parsed JSON, or null when the file is missing or unreadable as JSON. */
  async readJsonFile<T>(filePath: string): Promise<T | null> {
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      return null;
    }
    try {
      return JSON.parse(content) as T;
    } catch (error) {
      this.logger.warn(`Ignoring malformed JSON at ${filePath}`, { error });
      return null;
    }
  }

  async writeJsonFile(filePath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  async getDirectorySize(dirPath: string): Promise<number> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let totalSize = 0;
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      totalSize += entry.isDirectory()
        ? await this.getDirectorySize(entryPath)
        : (await fs.stat(entryPath)).size;
    }
    return totalSize;
  }
}
