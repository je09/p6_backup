import * as fs from "fs/promises";
import * as path from "path";
import { app, shell } from "electron";
import * as os from "os";
import { SUCCESS_MESSAGES } from "../constants/messages";
import { BackupInfo } from "../types/index";
import { createComponentLogger } from "./Logger";

// Type alias for backup types (must be outside the class)
type BackupType = "patterns" | "samples" | "combined" | "full";

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
    // Validate the path exists and is writable
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
      // Validate paths
      if (!sourcePath || !destinationPath) {
        this.logger.warn(
          "Cannot copy file: Source or destination path is empty"
        );
        return;
      }

      // Check if source exists
      try {
        await fs.access(sourcePath, fs.constants.R_OK);
      } catch (error) {
        this.logger.warn(`Source file not accessible: ${sourcePath}`, {
          error,
        });
        return;
      }

      // Check if source is a directory
      const stats = await fs.stat(sourcePath);
      if (stats.isDirectory()) {
        this.logger.warn(`Cannot copy directory as file: ${sourcePath}`);
        return;
      }

      // Ensure destination directory exists
      const destinationDir = path.dirname(destinationPath);
      await fs.mkdir(destinationDir, { recursive: true });

      // Try native copyFile first (faster when supported)
      try {
        await fs.copyFile(sourcePath, destinationPath);
        const fileName = path.basename(sourcePath);
        this.logger.debug(
          `Successfully copied ${fileName} to ${path.basename(destinationPath)}`
        );

        // Emit success event if eventEmitter is available
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
        // If copyFile fails with ENOTSUP (not supported), fall back to manual copy
        if (copyError.code === "ENOTSUP" || copyError.code === "EXDEV") {
          this.logger.debug(
            `Native copyFile not supported for ${sourcePath}, using manual copy`
          );
          await this.copyFileManually(sourcePath, destinationPath);
          return;
        } else {
          // Re-throw other errors
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
    const {
      createReadStream,
      createWriteStream,
      promises: fsPromises,
    } = require("fs");
    const { pipeline } = require("stream/promises");

    try {
      // Double-check that source is a file, not a directory
      const stats = await fsPromises.stat(sourcePath);
      if (stats.isDirectory()) {
        throw new Error(`EISDIR: illegal operation on a directory, read`);
      }

      // Ensure destination directory exists
      const destinationDir = path.dirname(destinationPath);
      await fsPromises.mkdir(destinationDir, { recursive: true });

      // Create streams
      const readStream = createReadStream(sourcePath);
      const writeStream = createWriteStream(destinationPath);

      // Handle errors on both streams
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

      // Use pipeline for proper error handling and cleanup
      await pipeline(readStream, writeStream);
      const fileName = path.basename(sourcePath);
      this.logger.debug(
        `Successfully copied ${fileName} to ${path.basename(
          destinationPath
        )} (manual)`
      );

      // Emit success event if eventEmitter is available
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

  async readJsonFile<T>(filePath: string): Promise<T> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Cannot read JSON file: ${error}`);
    }
  }

  async writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    try {
      // Ensure directory exists
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

  async discoverBackups(): Promise<BackupInfo[]> {
    try {
      await this.ensureBackupDirectoryExists();
      const backupDirs = await this.listDirectories(this.defaultBackupPath);
      const backupInfos: BackupInfo[] = [];

      for (const dirName of backupDirs) {
        const dirPath = path.join(this.defaultBackupPath, dirName);
        try {
          const backupInfo = await this.parseBackupDirectory(dirPath, dirName);
          if (backupInfo) {
            backupInfos.push(backupInfo);
          }
        } catch (error) {
          this.logger.warn(`Failed to parse backup directory ${dirName}`, {
            error,
          });
        }
      }

      // Sort by timestamp (newest first)
      backupInfos.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return backupInfos;
    } catch (error) {
      this.logger.error("Failed to discover backups", { error });
      throw new Error(`Could not discover backups: ${error}`);
    }
  }

  private async parseBackupDirectory(
    dirPath: string,
    dirName: string
  ): Promise<BackupInfo | null> {
    try {
      // First check if manifest.json exists
      const manifestPath = path.join(dirPath, "manifest.json");
      let manifest: any = null;

      try {
        const manifestData = await this.readJsonFile(manifestPath);
        manifest = manifestData;
      } catch (error) {
        // No manifest file, try to infer backup info from directory structure
        this.logger.debug(
          `No manifest found for ${dirName}, inferring backup info`
        );
      }

      if (manifest) {
        // Use manifest data if available
        return {
          name: this.extractCustomNameFromPath(dirName),
          path: dirPath,
          type: this.parseBackupType((manifest as any).type || dirName),
          timestamp: new Date((manifest as any).timestamp),
          itemCount:
            (manifest as any).totalItemCount ||
            (manifest as any).itemCount ||
            0,
          size: await this.getDirectorySize(dirPath),
          hasPatterns: await this.hasPatterns(dirPath),
          hasSamples: await this.hasSamples(dirPath),
          sampleBanks: await this.getSampleBanks(dirPath),
          description: this.generateBackupDescription(manifest),
        };
      } else {
        // Infer backup info from directory structure
        const stats = await this.getFileStats(dirPath);
        const hasPatterns = await this.hasPatterns(dirPath);
        const hasSamples = await this.hasSamples(dirPath);
        const sampleBanks = await this.getSampleBanks(dirPath);

        return {
          name: this.extractCustomNameFromPath(dirName),
          path: dirPath,
          type: this.inferBackupType(dirName, hasPatterns, hasSamples),
          timestamp: stats.modified,
          itemCount: await this.estimateItemCount(
            dirPath,
            hasPatterns,
            hasSamples
          ),
          size: await this.getDirectorySize(dirPath),
          hasPatterns,
          hasSamples,
          sampleBanks,
          description: this.generateInferredDescription(
            dirName,
            hasPatterns,
            hasSamples,
            sampleBanks
          ),
        };
      }
    } catch (error) {
      this.logger.warn(`Failed to parse backup directory ${dirName}`, {
        error,
      });
      return null;
    }
  }

  private extractCustomNameFromPath(dirName: string): string {
    // Extract custom name from directory name
    // Pattern: {customName}-{timestamp} or {type}-{timestamp}
    const parts = dirName.split("-");
    if (parts.length >= 2) {
      // Check if first part looks like a standard type
      const standardTypes = ["patterns", "samples", "full", "combined"];
      const firstPart = parts[0].toLowerCase();

      if (standardTypes.includes(firstPart)) {
        // No custom name, use directory name as display name
        return this.formatBackupDisplayName(dirName);
      } else {
        // First part is likely custom name
        return parts[0];
      }
    }
    return dirName;
  }

  private formatBackupDisplayName(dirName: string): string {
    // Convert directory name to readable display name
    const parts = dirName.split("-");
    if (parts.length >= 2) {
      const type = parts[0];
      const timestampPart = parts[parts.length - 1];

      // Format type name
      let formattedType = type.charAt(0).toUpperCase() + type.slice(1);
      if (type === "samples-bank") {
        formattedType = `Samples Bank ${parts[2]?.toUpperCase()}`;
      } else if (type === "samples-all") {
        formattedType = "All Samples";
      } else if (type.startsWith("combined")) {
        formattedType = "Combined Backup";
      }

      return formattedType;
    }
    return dirName;
  }

  // Helper to map string to BackupType
  private mapStringToBackupType(type: string): BackupType {
    const lower = type.toLowerCase();
    if (lower.includes("pattern") && !lower.includes("sample"))
      return "patterns";
    if (lower.includes("sample") && !lower.includes("pattern"))
      return "samples";
    if (lower.includes("combined")) return "combined";
    if (lower.includes("full")) return "full";
    return "full"; // fallback for unknown types
  }

  private parseBackupType(type: string): BackupType {
    return this.mapStringToBackupType(type);
  }

  private inferBackupType(
    dirName: string,
    hasPatterns: boolean,
    hasSamples: boolean
  ): BackupType {
    // Prefer directory name, fallback to content
    const type = this.mapStringToBackupType(dirName);
    if (type !== "full") return type;
    if (hasPatterns && hasSamples) return "combined";
    if (hasPatterns) return "patterns";
    if (hasSamples) return "samples";
    return "full"; // fallback if nothing matches
  }

  private async hasPatterns(dirPath: string): Promise<boolean> {
    // Check for patterns.json in root or Patterns directory
    const patternsFileRoot = path.join(dirPath, "patterns.json");
    const patternsDir = path.join(dirPath, "Patterns");
    const patternsFileInDir = path.join(patternsDir, "patterns.json");

    try {
      await fs.access(patternsFileRoot);
      return true;
    } catch {}
    try {
      const stat = await fs.stat(patternsDir);
      if (stat.isDirectory()) {
        try {
          await fs.access(patternsFileInDir);
          return true;
        } catch {}
        return true; // Patterns directory exists, even if file is missing
      }
    } catch {}
    return false;
  }

  private async hasSamples(dirPath: string): Promise<boolean> {
    try {
      // Check for samples.json or samples directory
      const samplesFile = path.join(dirPath, "samples.json");
      const samplesDir = path.join(dirPath, "samples");

      try {
        await fs.access(samplesFile);
        return true;
      } catch {}

      try {
        const stat = await fs.stat(samplesDir);
        return stat.isDirectory();
      } catch {}

      return false;
    } catch {
      return false;
    }
  }

  private async getSampleBanks(dirPath: string): Promise<string[]> {
    try {
      const banks: string[] = [];
      const samplesDir = path.join(dirPath, "samples");

      try {
        const items = await this.listDirectories(samplesDir);
        for (const item of items) {
          if (item.startsWith("BANK_")) {
            const bankLetter = item.replace("BANK_", "");
            banks.push(bankLetter);
          }
        }
      } catch {
        // No samples directory, check if it's a single bank backup
        const files = await this.listFiles(dirPath);
        if (files.includes("samples.json")) {
          // Try to read sample data to determine banks
          try {
            const samplesData = await this.readJsonFile(
              path.join(dirPath, "samples.json")
            );
            if (typeof samplesData === "object" && samplesData !== null) {
              banks.push(
                ...Object.keys(samplesData).filter(
                  (key) => key.length === 1 && key.match(/[A-H]/i)
                )
              );
            }
          } catch {}
        }
      }

      return banks.sort();
    } catch {
      return [];
    }
  }

  private async estimateItemCount(
    dirPath: string,
    hasPatterns: boolean,
    hasSamples: boolean
  ): Promise<number> {
    let count = 0;

    if (hasPatterns) {
      try {
        const patternsFile = path.join(dirPath, "patterns.json");
        const patternsData = await this.readJsonFile(patternsFile);
        if (Array.isArray(patternsData)) {
          count += patternsData.length;
        }
      } catch {}
    }

    if (hasSamples) {
      try {
        const samplesFile = path.join(dirPath, "samples.json");
        const samplesData = await this.readJsonFile(samplesFile);
        if (typeof samplesData === "object" && samplesData !== null) {
          for (const bank of Object.values(samplesData)) {
            if (Array.isArray(bank)) {
              count += bank.length;
            }
          }
        }
      } catch {}
    }

    return count;
  }

  private generateBackupDescription(manifest: any): string {
    if (manifest.results && Array.isArray(manifest.results)) {
      const descriptions = manifest.results
        .map((result: any) => {
          if (result.type === "patterns") {
            return `${result.itemCount} patterns`;
          } else if (result.type === "samples") {
            if (result.bank) {
              return `${
                result.itemCount
              } samples from bank ${result.bank.toUpperCase()}`;
            } else if (result.banks) {
              return `${result.itemCount} samples from banks ${result.banks
                .join(", ")
                .toUpperCase()}`;
            } else {
              return `${result.itemCount} samples`;
            }
          }
          return "";
        })
        .filter(Boolean);

      return descriptions.join(", ");
    }

    if (manifest.type && manifest.itemCount) {
      return `${manifest.itemCount} items`;
    }

    return "Backup";
  }

  private generateInferredDescription(
    dirName: string,
    hasPatterns: boolean,
    hasSamples: boolean,
    sampleBanks: string[]
  ): string {
    const parts: string[] = [];

    if (hasPatterns) {
      parts.push("Patterns");
    }

    if (hasSamples) {
      if (sampleBanks.length > 0) {
        if (sampleBanks.length === 1) {
          parts.push(`Samples (Bank ${sampleBanks[0]})`);
        } else {
          parts.push(`Samples (Banks ${sampleBanks.join(", ")})`);
        }
      } else {
        parts.push("Samples");
      }
    }

    return parts.length > 0 ? parts.join(" + ") : "Backup";
  }

  /**
   * Get detailed backup contents for selective restore operations
   */
  async getBackupDetails(backupPath: string): Promise<any> {
    try {
      const details: any = {
        patterns: [],
        samples: {},
        totalPatternSize: 0,
        totalSampleSize: 0,
        selectedPatternSize: 0,
        selectedSampleSize: 0,
      };

      // Check if patterns.json exists (root level for combined backups or Patterns folder for standalone)
      let patternsFile = path.join(backupPath, "patterns.json");
      let patternsFound = false;

      try {
        const patternsData = await this.readJsonFile(patternsFile);
        if (Array.isArray(patternsData)) {
          details.patterns = patternsData.map(
            (pattern: any, index: number) => ({
              id: pattern.id || `pattern-${index}`,
              name:
                pattern.name || `Pattern ${pattern.bank}-${pattern.pattern}`,
              bank: pattern.bank || Math.floor(index / 16) + 1,
              pattern: pattern.pattern || (index % 16) + 1,
              size: pattern.size || 0,
              selected: false,
            })
          );
          details.totalPatternSize = details.patterns.reduce(
            (sum: number, p: any) => sum + p.size,
            0
          );
          patternsFound = true;
        }
      } catch (error) {
        // Try looking in Patterns folder for standalone pattern backups
        patternsFile = path.join(backupPath, "Patterns", "patterns.json");
        try {
          const patternsData = await this.readJsonFile(patternsFile);
          if (Array.isArray(patternsData)) {
            details.patterns = patternsData.map(
              (pattern: any, index: number) => ({
                id: pattern.id || `pattern-${index}`,
                name:
                  pattern.name || `Pattern ${pattern.bank}-${pattern.pattern}`,
                bank: pattern.bank || Math.floor(index / 16) + 1,
                pattern: pattern.pattern || (index % 16) + 1,
                size: pattern.size || 0,
                selected: false,
              })
            );
            details.totalPatternSize = details.patterns.reduce(
              (sum: number, p: any) => sum + p.size,
              0
            );
            patternsFound = true;
          }
        } catch (error) {
          this.logger.debug(
            "No patterns.json found in root or Patterns folder"
          );
        }
      }

      // Check if samples.json exists
      const samplesFile = path.join(backupPath, "samples.json");
      try {
        const samplesData = await this.readJsonFile(samplesFile);
        if (samplesData && typeof samplesData === "object") {
          // Process samples organized by banks
          for (const [bankId, bankSamples] of Object.entries(samplesData)) {
            if (Array.isArray(bankSamples)) {
              details.samples[bankId.toUpperCase()] = bankSamples.map(
                (sample: any, index: number) => ({
                  id: sample.id || `${bankId}-${sample.pad || index}`,
                  name: sample.name || `Pad ${sample.pad || index + 1}`,
                  bank: bankId.toUpperCase(),
                  pad: sample.pad || index + 1,
                  size: sample.size || 0,
                  selected: false,
                })
              );
              details.totalSampleSize += bankSamples.reduce(
                (sum: number, s: any) => sum + (s.size || 0),
                0
              );
            }
          }
        }
      } catch (error) {
        this.logger.debug("No samples.json found or invalid format");
      }

      // If no JSON files, try to read from file structure
      if (
        details.patterns.length === 0 &&
        Object.keys(details.samples).length === 0
      ) {
        await this.parseBackupFileStructure(backupPath, details);
      }

      return details;
    } catch (error) {
      this.logger.error("Failed to get backup details", { error });
      throw new Error(`Could not read backup details: ${error}`);
    }
  }

  /**
   * Parse backup details from file structure when manifest is not available
   */
  private async parseBackupFileStructure(
    backupPath: string,
    details: any
  ): Promise<void> {
    try {
      // Look for patterns in Patterns directory or patterns/files directory
      let patternsDir = path.join(backupPath, "Patterns");
      try {
        const patternFiles = await this.listFiles(patternsDir);
        const patternRegex = /P6_PTN(\d+)-(\d+)\.P(T|R)M$/i;

        details.patterns = patternFiles
          .filter((file) => patternRegex.test(file))
          .map((file, index) => {
            const match = file.match(patternRegex);
            const bank = match
              ? parseInt(match[1])
              : Math.floor(index / 16) + 1;
            const pattern = match ? parseInt(match[2]) : (index % 16) + 1;

            return {
              id: `pattern-${bank}-${pattern}`,
              name: `Pattern ${bank}-${pattern}`,
              bank,
              pattern,
              size: 0, // Would need to stat file for actual size
              selected: false,
            };
          });
      } catch (error) {
        // Try old patterns/files directory structure
        patternsDir = path.join(backupPath, "patterns", "files");
        try {
          const patternFiles = await this.listFiles(patternsDir);
          const patternRegex = /P6_PTN(\d+)-(\d+)\.P(T|R)M$/i;

          details.patterns = patternFiles
            .filter((file) => patternRegex.test(file))
            .map((file, index) => {
              const match = file.match(patternRegex);
              const bank = match
                ? parseInt(match[1])
                : Math.floor(index / 16) + 1;
              const pattern = match ? parseInt(match[2]) : (index % 16) + 1;

              return {
                id: `pattern-${bank}-${pattern}`,
                name: `Pattern ${bank}-${pattern}`,
                bank,
                pattern,
                size: 0, // Would need to stat file for actual size
                selected: false,
              };
            });
        } catch (error) {
          this.logger.debug(
            "No patterns found in Patterns or patterns/files directory"
          );
        }
      }

      // Look for samples in files directory
      const samplesDir = path.join(backupPath, "samples", "files");
      try {
        const bankDirs = await this.listDirectories(samplesDir);

        for (const bankDir of bankDirs) {
          if (bankDir.startsWith("BANK_")) {
            const bankId = bankDir.replace("BANK_", "");
            const bankPath = path.join(samplesDir, bankDir);

            try {
              const padDirs = await this.listDirectories(bankPath);
              details.samples[bankId] = [];

              for (const padDir of padDirs) {
                if (padDir.startsWith("PAD_")) {
                  const padNumber = parseInt(padDir.replace("PAD_", "")) || 1;
                  details.samples[bankId].push({
                    id: `${bankId}-${padNumber}`,
                    name: `Pad ${padNumber}`,
                    bank: bankId,
                    pad: padNumber,
                    size: 0, // Would need to calculate directory size
                    selected: false,
                  });
                }
              }

              // Sort by pad number
              details.samples[bankId].sort((a: any, b: any) => a.pad - b.pad);
            } catch (error) {
              this.logger.warn(`Could not read bank directory ${bankDir}`, {
                error,
              });
            }
          }
        }
      } catch (error) {
        this.logger.debug("No samples files directory found");
      }

      // Look for combined backup structure
      const filesDir = path.join(backupPath, "files");
      try {
        const items = await this.listItems(filesDir);

        // Check for pattern files directly in files directory
        const patternFiles = items.files.filter((file) =>
          /\.P(T|R)M$/i.test(file)
        );
        if (patternFiles.length > 0 && details.patterns.length === 0) {
          details.patterns = patternFiles.map((file, index) => ({
            id: `pattern-${index}`,
            name: file.replace(/\.(PT|PR)M$/i, ""),
            bank: Math.floor(index / 16) + 1,
            pattern: (index % 16) + 1,
            size: 0,
            selected: false,
          }));
        }

        // Check for bank directories in files directory
        const bankDirs = items.directories.filter((dir) =>
          dir.startsWith("BANK_")
        );
        for (const bankDir of bankDirs) {
          const bankId = bankDir.replace("BANK_", "");
          if (!details.samples[bankId]) {
            details.samples[bankId] = [];

            const bankPath = path.join(filesDir, bankDir);
            try {
              const padDirs = await this.listDirectories(bankPath);

              for (const padDir of padDirs) {
                if (padDir.startsWith("PAD_")) {
                  const padNumber = parseInt(padDir.replace("PAD_", "")) || 1;
                  details.samples[bankId].push({
                    id: `${bankId}-${padNumber}`,
                    name: `Pad ${padNumber}`,
                    bank: bankId,
                    pad: padNumber,
                    size: 0,
                    selected: false,
                  });
                }
              }

              details.samples[bankId].sort((a: any, b: any) => a.pad - b.pad);
            } catch (error) {
              this.logger.warn(`Could not read bank directory ${bankDir}`, {
                error,
              });
            }
          }
        }
      } catch (error) {
        this.logger.debug("No files directory found");
      }
    } catch (error) {
      this.logger.warn("Error parsing backup file structure", { error });
    }
  }

  /**
   * List both files and directories in a path
   */
  private async listItems(
    dirPath: string
  ): Promise<{ files: string[]; directories: string[] }> {
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      return {
        files: items.filter((item) => item.isFile()).map((item) => item.name),
        directories: items
          .filter((item) => item.isDirectory())
          .map((item) => item.name),
      };
    } catch (error) {
      return { files: [], directories: [] };
    }
  }
}
