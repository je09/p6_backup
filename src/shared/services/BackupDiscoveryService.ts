import * as fs from "fs/promises";
import * as path from "path";
import { BackupInfo } from "../types/index";
import { parsePrmMetadata, PrmMetadata } from "../utils/prmParser";
import { createComponentLogger } from "./Logger";
import { FileSystemService } from "./FileSystemService";


export class BackupDiscoveryService {
  private logger = createComponentLogger("BackupDiscoveryService");

  constructor(private readonly fs: FileSystemService) {}

  async discoverBackups(): Promise<BackupInfo[]> {
    try {
      await this.fs.ensureBackupDirectoryExists();
      const backupRoot = await this.fs.getDefaultBackupPath();
      const backupDirs = await this.fs.listDirectories(backupRoot);
      const backupInfos: BackupInfo[] = [];

      for (const dirName of backupDirs) {
        const dirPath = path.join(backupRoot, dirName);
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

      let patternsFile = path.join(backupPath, "patterns.json");

      const rootPatternsData = await this.fs.readJsonFile(patternsFile, true);
      if (rootPatternsData && Array.isArray(rootPatternsData)) {
        details.patterns = await Promise.all(
          rootPatternsData.map(async (pattern: any, index: number) => ({
            id: pattern.id || `pattern-${index}`,
            name: pattern.name || `Pattern ${pattern.bank}-${pattern.pattern}`,
            bank: pattern.bank || Math.floor(index / 16) + 1,
            pattern: pattern.pattern || (index % 16) + 1,
            size: pattern.size || 0,
            selected: false,
            metadata: pattern.metadata ?? await this.parsePrmFile(pattern.path),
          }))
        );
        details.totalPatternSize = details.patterns.reduce(
          (sum: number, p: any) => sum + p.size,
          0
        );
      } else {
        patternsFile = path.join(backupPath, "patterns", "patterns.json");
        const nestedPatternsData = await this.fs.readJsonFile(
          patternsFile,
          true
        );
        if (nestedPatternsData && Array.isArray(nestedPatternsData)) {
          details.patterns = await Promise.all(
            nestedPatternsData.map(async (pattern: any, index: number) => ({
              id: pattern.id || `pattern-${index}`,
              name: pattern.name || `Pattern ${pattern.bank}-${pattern.pattern}`,
              bank: pattern.bank || Math.floor(index / 16) + 1,
              pattern: pattern.pattern || (index % 16) + 1,
              size: pattern.size || 0,
              selected: false,
              metadata: pattern.metadata ?? await this.parsePrmFile(pattern.path),
            }))
          );
          details.totalPatternSize = details.patterns.reduce(
            (sum: number, p: any) => sum + p.size,
            0
          );
        } else {
          this.logger.debug(
            "No patterns.json found in root or patterns folder"
          );
        }
      }

      const samplesFile = path.join(backupPath, "samples.json");
      const samplesData = await this.fs.readJsonFile(samplesFile, true);
      if (samplesData && typeof samplesData === "object") {
        for (const [bankId, bankSamples] of Object.entries(samplesData)) {
          if (Array.isArray(bankSamples)) {
            details.samples[bankId.toUpperCase()] = bankSamples.map(
              (sample: any, index: number) => {
                const padMatch = (sample.name || '').match(/^PAD_(\d+)\//i);
                const pad = padMatch ? parseInt(padMatch[1], 10) : (sample.pad ?? (index + 1));
                return {
                  id: sample.id || `${bankId}-${pad}`,
                  name: sample.name || `Pad ${pad}`,
                  bank: bankId.toUpperCase(),
                  pad,
                  size: sample.size || 0,
                  selected: false,
                };
              }
            );
            details.totalSampleSize += bankSamples.reduce(
              (sum: number, s: any) => sum + (s.size || 0),
              0
            );
          }
        }
      } else {
        this.logger.debug("No samples.json found or invalid format");
      }

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

  private async parseBackupDirectory(
    dirPath: string,
    dirName: string
  ): Promise<BackupInfo | null> {
    try {
      const manifestPath = path.join(dirPath, "manifest.json");
      let manifest: any = null;

      manifest = await this.fs.readJsonFile(manifestPath, true);

      if (manifest) {
        return {
          name: (manifest as any).displayName || this.extractCustomNameFromPath(dirName),
          path: dirPath,
          type: "backup" as const,
          timestamp: new Date((manifest as any).timestamp),
          itemCount:
            (manifest as any).totalItemCount ||
            (manifest as any).itemCount ||
            0,
          size: await this.fs.getDirectorySize(dirPath),
          hasPatterns: await this.hasPatterns(dirPath),
          hasSamples: await this.hasSamples(dirPath),
          sampleBanks: await this.getSampleBanks(dirPath),
          description: this.generateBackupDescription(manifest),
        };
      } else {
        const stats = await this.fs.getFileStats(dirPath);
        const hasPatterns = await this.hasPatterns(dirPath);
        const hasSamples = await this.hasSamples(dirPath);
        const sampleBanks = await this.getSampleBanks(dirPath);

        return {
          name: this.extractCustomNameFromPath(dirName),
          path: dirPath,
          type: "backup" as const,
          timestamp: stats.modified,
          itemCount: await this.estimateItemCount(
            dirPath,
            hasPatterns,
            hasSamples
          ),
          size: await this.fs.getDirectorySize(dirPath),
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
    // Directory names are like "backup-2024-01-01T00-00-00-000Z" or "MyName-2024-..."
    const standardPrefixes = ["backup-"];
    for (const prefix of standardPrefixes) {
      if (dirName.toLowerCase().startsWith(prefix)) {
        return "Backup";
      }
    }
    // Custom name: everything before the first timestamp segment
    const parts = dirName.split("-");
    return parts[0] || dirName;
  }

  /** Read a PRM file and parse its metadata. Returns undefined on any error. */
  private async parsePrmFile(filePath: string): Promise<PrmMetadata | undefined> {
    try {
      const content = await fs.readFile(filePath, "ascii");
      return parsePrmMetadata(content);
    } catch {
      return undefined;
    }
  }

  private async hasPatterns(dirPath: string): Promise<boolean> {
    const patternsFileRoot = path.join(dirPath, "patterns.json");
    const patternsDir = path.join(dirPath, "patterns");
    const patternsFileInDir = path.join(patternsDir, "patterns.json");

    if (await this.fs.pathExists(patternsFileRoot)) return true;
    if (await this.fs.pathExists(patternsDir)) {
      const stats = await this.fs.getFileStats(patternsDir);
      if (stats.isDirectory) {
        if (await this.fs.pathExists(patternsFileInDir)) return true;
        return true;
      }
    }
    return false;
  }

  private async hasSamples(dirPath: string): Promise<boolean> {
    const samplesFile = path.join(dirPath, "samples.json");
    const samplesDir = path.join(dirPath, "samples");

    if (await this.fs.pathExists(samplesFile)) return true;
    if (await this.fs.pathExists(samplesDir)) {
      const stats = await this.fs.getFileStats(samplesDir);
      return stats.isDirectory;
    }
    return false;
  }

  private async getSampleBanks(dirPath: string): Promise<string[]> {
    try {
      const banks: string[] = [];
      const samplesDir = path.join(dirPath, "samples");

      if (await this.fs.pathExists(samplesDir)) {
        const stats = await this.fs.getFileStats(samplesDir);
        if (stats.isDirectory) {
          const items = await this.fs.listDirectories(samplesDir);
          for (const item of items) {
            if (item.startsWith("BANK_")) {
              banks.push(item.replace("BANK_", ""));
            }
          }
        }
      } else {
        const files = await this.fs.listFiles(dirPath);
        if (files.includes("samples.json")) {
          try {
            const samplesData = await this.fs.readJsonFile(
              path.join(dirPath, "samples.json")
            );
            if (typeof samplesData === "object" && samplesData !== null) {
              banks.push(
                ...Object.keys(samplesData as object).filter(
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
      const patternsData =
        (await this.fs.readJsonFile(path.join(dirPath, "patterns.json"), true)) ??
        (await this.fs.readJsonFile(path.join(dirPath, "patterns", "patterns.json"), true));
      if (Array.isArray(patternsData)) {
        count += patternsData.length;
      }
    }

    if (hasSamples) {
      const samplesData = await this.fs.readJsonFile(
        path.join(dirPath, "samples.json"),
        true
      );
      if (typeof samplesData === "object" && samplesData !== null) {
        for (const bank of Object.values(samplesData as object)) {
          if (Array.isArray(bank)) {
            count += bank.length;
          }
        }
      }
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
              return `${result.itemCount} samples from bank ${result.bank.toUpperCase()}`;
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
    _dirName: string,
    hasPatterns: boolean,
    hasSamples: boolean,
    sampleBanks: string[]
  ): string {
    const parts: string[] = [];

    if (hasPatterns) parts.push("Patterns");

    if (hasSamples) {
      if (sampleBanks.length === 1) {
        parts.push(`Samples (Bank ${sampleBanks[0]})`);
      } else if (sampleBanks.length > 1) {
        parts.push(`Samples (Banks ${sampleBanks.join(", ")})`);
      } else {
        parts.push("Samples");
      }
    }

    return parts.length > 0 ? parts.join(" + ") : "Backup";
  }

  private async parseBackupFileStructure(
    backupPath: string,
    details: any
  ): Promise<void> {
    try {
      const patternsDir = path.join(backupPath, "patterns");
      const patternRegex = /P6_PTN(\d+)-(\d+)\.P(T|R)M$/i;

      const tryReadPatterns = async (dir: string) => {
        const files = await this.fs.listFiles(dir);
        return files
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
              size: 0,
              selected: false,
            };
          });
      };

      try {
        details.patterns = await tryReadPatterns(patternsDir);
      } catch {
        try {
          details.patterns = await tryReadPatterns(backupPath);
        } catch {
          this.logger.debug("No patterns found in patterns/ or root");
        }
      }

      const samplesFilesDir = path.join(backupPath, "samples", "files");
      try {
        const bankDirs = await this.fs.listDirectories(samplesFilesDir);
        for (const bankDir of bankDirs) {
          if (!bankDir.startsWith("BANK_")) continue;
          const bankId = bankDir.replace("BANK_", "");
          const bankPath = path.join(samplesFilesDir, bankDir);
          try {
            const padDirs = await this.fs.listDirectories(bankPath);
            details.samples[bankId] = padDirs
              .filter((d) => d.startsWith("PAD_"))
              .map((padDir) => {
                const padNumber = parseInt(padDir.replace("PAD_", "")) || 1;
                return {
                  id: `${bankId}-${padNumber}`,
                  name: `Pad ${padNumber}`,
                  bank: bankId,
                  pad: padNumber,
                  size: 0,
                  selected: false,
                };
              })
              .sort((a: any, b: any) => a.pad - b.pad);
          } catch (error) {
            this.logger.warn(`Could not read bank directory ${bankDir}`, {
              error,
            });
          }
        }
      } catch {
        this.logger.debug("No samples files directory found");
      }

      const filesDir = path.join(backupPath, "files");
      try {
        const allEntries = await this.fs.listFiles(filesDir);
        const patternFiles = allEntries.filter((f) => /\.P(T|R)M$/i.test(f));
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

        const bankDirs = await this.fs.listDirectories(filesDir);
        for (const bankDir of bankDirs.filter((d) => d.startsWith("BANK_"))) {
          const bankId = bankDir.replace("BANK_", "");
          if (details.samples[bankId]) continue;
          details.samples[bankId] = [];
          const bankPath = path.join(filesDir, bankDir);
          try {
            const padDirs = await this.fs.listDirectories(bankPath);
            details.samples[bankId] = padDirs
              .filter((d) => d.startsWith("PAD_"))
              .map((padDir) => {
                const padNumber = parseInt(padDir.replace("PAD_", "")) || 1;
                return {
                  id: `${bankId}-${padNumber}`,
                  name: `Pad ${padNumber}`,
                  bank: bankId,
                  pad: padNumber,
                  size: 0,
                  selected: false,
                };
              })
              .sort((a: any, b: any) => a.pad - b.pad);
          } catch (error) {
            this.logger.warn(`Could not read bank directory ${bankDir}`, {
              error,
            });
          }
        }
      } catch {
        this.logger.debug("No files directory found");
      }
    } catch (error) {
      this.logger.warn("Error parsing backup file structure", { error });
    }
  }
}
