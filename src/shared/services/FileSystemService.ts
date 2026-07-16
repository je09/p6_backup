import * as fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import * as path from "path";
import { shell } from "electron";
import * as os from "os";
import { SUCCESS_MESSAGES } from "../constants/messages";
import { createComponentLogger } from "./Logger";

export class FileSystemService {
  private defaultBackupPath: string;
  private eventEmitter?: (event: string, ...args: any[]) => void;
  private logger = createComponentLogger("FileSystemService");

  constructor(eventEmitter?: (event: string, ...args: any[]) => void) {
    this.defaultBackupPath = path.join(os.homedir(), "P6Backups");
    this.eventEmitter = eventEmitter;
    this.ensureBackupDirectoryExists();
  }

  async getDefaultBackupPath(): Promise<string> {
    await this.ensureBackupDirectoryExists();
    return this.defaultBackupPath;
  }

  async setBackupPath(newPath: string): Promise<void> {
    try {
      await fs.access(newPath, fs.constants.W_OK);
      this.defaultBackupPath = newPath;
    } catch (error) {
      throw new Error(`Cannot set backup path: ${error}`);
    }
  }

  async ensureBackupDirectoryExists(): Promise<void> {
    try {
      await fs.mkdir(this.defaultBackupPath, { recursive: true });
    } catch (error) {
      throw new Error(`Cannot create backup directory: ${error}`);
    }
  }

  async openFolder(folderPath: string): Promise<void> {
    try {
      await shell.openPath(folderPath);
    } catch (error) {
      throw new Error(`Cannot open folder: ${error}`);
    }
  }

  async copyDirectory(
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    try {
      await fs.mkdir(destinationPath, { recursive: true });

      const entries = await fs.readdir(sourcePath, { withFileTypes: true });

      for (const entry of entries) {
        const sourceEntryPath = path.join(sourcePath, entry.name);
        const destinationEntryPath = path.join(destinationPath, entry.name);

        if (entry.isDirectory()) {
          await this.copyDirectory(sourceEntryPath, destinationEntryPath);
        } else {
          await this.copyFile(sourceEntryPath, destinationEntryPath);
        }
      }
    } catch (error) {
      throw new Error(`Cannot copy directory: ${error}`);
    }
  }

  async copyFile(sourcePath: string, destinationPath: string): Promise<void> {
    try {
      if (!sourcePath || !destinationPath) {
        this.logger.warn(
          "Cannot copy file: Source or destination path is empty"
        );
        return;
      }

      try {
        await fs.access(sourcePath, fs.constants.R_OK);
      } catch (error) {
        this.logger.warn(`Source file not accessible: ${sourcePath}`, {
          error,
        });
        return;
      }

      const stats = await fs.stat(sourcePath);
      if (stats.isDirectory()) {
        this.logger.warn(`Cannot copy directory as file: ${sourcePath}`);
        return;
      }

      const destinationDir = path.dirname(destinationPath);
      await fs.mkdir(destinationDir, { recursive: true });

      try {
        await fs.copyFile(sourcePath, destinationPath);
        const fileName = path.basename(sourcePath);
        this.logger.debug(
          `Successfully copied ${fileName} to ${path.basename(destinationPath)}`
        );

        if (this.eventEmitter) {
          this.eventEmitter("file-copy-success", {
            fileName,
            message: SUCCESS_MESSAGES.FILE_COPY_SUCCESS(
              fileName,
              path.basename(destinationPath)
            ),
          });
        }
        return;
      } catch (copyError: any) {
        if (copyError.code === "ENOTSUP" || copyError.code === "EXDEV") {
          this.logger.debug(
            `Native copyFile not supported for ${sourcePath}, using manual copy`
          );
          await this.copyFileManually(sourcePath, destinationPath);
          return;
        } else {
          throw copyError;
        }
      }
    } catch (error) {
      this.logger.error(
        `Cannot copy file: ${sourcePath} -> ${destinationPath}`,
        { error }
      );
      throw new Error(`Cannot copy file: ${error}`);
    }
  }

  private async copyFileManually(
    sourcePath: string,
    destinationPath: string
  ): Promise<void> {
    try {
      const stats = await fs.stat(sourcePath);
      if (stats.isDirectory()) {
        throw new Error(`EISDIR: illegal operation on a directory, read`);
      }

      const destinationDir = path.dirname(destinationPath);
      await fs.mkdir(destinationDir, { recursive: true });

      const readStream = createReadStream(sourcePath);
      const writeStream = createWriteStream(destinationPath);

      readStream.on("error", (err: any) => {
        this.logger.error(`Read stream error for ${sourcePath}`, {
          error: err,
        });
        writeStream.end();
      });

      writeStream.on("error", (err: any) => {
        this.logger.error(`Write stream error for ${destinationPath}`, {
          error: err,
        });
        readStream.destroy();
      });

      await pipeline(readStream, writeStream);
      const fileName = path.basename(sourcePath);
      this.logger.debug(
        `Successfully copied ${fileName} to ${path.basename(
          destinationPath
        )} (manual)`
      );

      if (this.eventEmitter) {
        this.eventEmitter("file-copy-success", {
          fileName,
          message: SUCCESS_MESSAGES.MANUAL_COPY_SUCCESS(
            fileName,
            path.basename(destinationPath)
          ),
        });
      }
    } catch (error) {
      this.logger.error(
        `Manual file copy failed: ${sourcePath} -> ${destinationPath}`,
        { error }
      );
      throw new Error(`Manual file copy failed: ${error}`);
    }
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      throw new Error(`Cannot delete directory: ${error}`);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      throw new Error(`Cannot delete file: ${error}`);
    }
  }

  async listDirectories(basePath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      throw new Error(`Cannot list directories: ${error}`);
    }
  }

  async listFiles(basePath: string, extension?: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      let files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);

      if (extension) {
        files = files.filter((file) => file.endsWith(extension));
      }

      return files.sort();
    } catch (error) {
      throw new Error(`Cannot list files: ${error}`);
    }
  }

  async getFileStats(filePath: string): Promise<{
    size: number;
    created: Date;
    modified: Date;
    isDirectory: boolean;
    isFile: boolean;
  }> {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
      };
    } catch (error) {
      throw new Error(`Cannot get file stats: ${error}`);
    }
  }

  async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readJsonFile<T>(
    filePath: string,
    allowMissing: boolean = false
  ): Promise<T | null> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch (error: any) {
      if (allowMissing && error.code === "ENOENT") {
        return null;
      }
      throw new Error(`Cannot read JSON file: ${error}`);
    }
  }

  async writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      const content = JSON.stringify(data, null, 2);
      await fs.writeFile(filePath, content, "utf-8");
    } catch (error) {
      throw new Error(`Cannot write JSON file: ${error}`);
    }
  }

  async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(entryPath);
        } else {
          const stats = await fs.stat(entryPath);
          totalSize += stats.size;
        }
      }

      return totalSize;
    } catch (error) {
      throw new Error(`Cannot calculate directory size: ${error}`);
    }
  }

  formatFileSize(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  getRelativePath(fromPath: string, toPath: string): string {
    return path.relative(fromPath, toPath);
  }

  joinPath(...paths: string[]): string {
    return path.join(...paths);
  }

  getFileName(filePath: string): string {
    return path.basename(filePath);
  }

  getFileExtension(filePath: string): string {
    return path.extname(filePath);
  }

  getDirectoryName(filePath: string): string {
    return path.dirname(filePath);
  }
}
