import * as fs from "fs/promises";
import * as path from "path";
import { BackupResult, RestoreResult, BackupType, PatternInfo, SampleBankData, SampleFileInfo, BackupStageResult } from "../types/index";
import { FileSystemService } from "./FileSystemService";
import { ModeService } from "./ModeService";
import { IDeviceConnection } from "./interfaces";
import { createComponentLogger } from "./Logger";
import { PatternBackupService } from "./PatternBackupService";
import { SampleBackupService } from "./SampleBackupService";
import { BackupDirectoryService } from "./BackupDirectoryService";
import { BACKUP_CONSTANTS } from "../constants";

export class BackupService {
  private readonly modeService: ModeService;
  private readonly patternService: PatternBackupService;
  private readonly sampleService: SampleBackupService;
  private readonly fileSystemService: FileSystemService;
  private readonly p6Device: IDeviceConnection;
  private readonly backupDirService: BackupDirectoryService;
  private logger = createComponentLogger("BackupService");

  constructor(
    p6Device: IDeviceConnection,
    fileSystemService?: FileSystemService,
    modeService?: ModeService,
    patternService?: PatternBackupService,
    sampleService?: SampleBackupService
  ) {
    this.p6Device = p6Device;
    this.fileSystemService = fileSystemService ?? new FileSystemService();
    this.backupDirService = new BackupDirectoryService(this.fileSystemService);
    this.modeService = modeService ?? new ModeService(this.p6Device);
    this.patternService = patternService ?? new PatternBackupService(
      this.p6Device,
      this.fileSystemService,
      this.modeService
    );
    this.sampleService = sampleService ?? new SampleBackupService(
      this.p6Device,
      this.fileSystemService,
      this.modeService
    );
  }

  backupPatterns(customName?: string, patternIds?: string[]): Promise<BackupResult> {
    return this.patternService.backupPatterns(customName, patternIds);
  }

  backupSamples(bankId?: string, customName?: string): Promise<BackupResult> {
    return this.sampleService.backupSamples(bankId, customName);
  }

  restorePatterns(backupPath: string, patternIds?: string[]): Promise<RestoreResult> {
    return this.patternService.restorePatterns(backupPath, patternIds);
  }

  restoreSamples(backupPath: string, bankId?: string, sampleNames?: string[]): Promise<RestoreResult> {
    return this.sampleService.restoreSamples(backupPath, bankId, sampleNames);
  }

  async backup(options: {
    includePatterns?: boolean;
    includeSamples?: boolean;
    bankIds?: string[];
    customName?: string;
  }): Promise<BackupResult> {
    this.logger.debug("backup called with options:", options);
    try {
      let deviceStatus = this.p6Device.getStatus();
      if (!deviceStatus.connected) {
        const isReady = await this.p6Device.isReady();
        if (!isReady) throw new Error("P6 device not connected");
        deviceStatus = this.p6Device.getStatus();
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupDir = await this.backupDirService.createDirectory(
        "backup",
        timestamp,
        options.customName
      );

      let totalItemCount = 0;
      const results: Array<{ type: string; itemCount: number; banks?: string[] }> = [];
      const messages: string[] = [];

      if (options.includePatterns) {
        try {
          const patterns = await this.p6Device.readData("patterns") as PatternInfo[];
          const patternList = patterns || [];
          await fs.writeFile(
            path.join(backupDir, "patterns.json"),
            JSON.stringify(patternList, null, 2)
          );
          await this.copyPatternFiles(patternList, backupDir);

          totalItemCount += patternList.length;
          results.push({ type: "patterns", itemCount: patternList.length });
          messages.push(`${patternList.length} patterns`);
        } catch (error) {
          throw new Error(`Pattern backup failed: ${error}`);
        }
      }

      if (options.includeSamples) {
        try {
          if (options.bankIds && options.bankIds.length > 0) {
            let bankItemCount = 0;
            const allBankSamples: Record<string, SampleFileInfo[]> = {};

            for (const bankId of options.bankIds) {
              const bankSamples = await this.p6Device.readData("samples", { bankId }) as SampleBankData;
              allBankSamples[bankId] = bankSamples.samples || [];
              bankItemCount += allBankSamples[bankId].length;
            }

            await fs.writeFile(
              path.join(backupDir, "samples.json"),
              JSON.stringify(allBankSamples, null, 2)
            );
            const enrichedBankSamples = await this.copySampleFiles(allBankSamples, backupDir);
            await fs.writeFile(
              path.join(backupDir, "samples.json"),
              JSON.stringify(enrichedBankSamples, null, 2)
            );

            totalItemCount += bankItemCount;
            results.push({
              type: "samples",
              banks: options.bankIds,
              itemCount: bankItemCount,
            });
            messages.push(
              `${bankItemCount} samples from banks ${options.bankIds.map((b) => b.toUpperCase()).join(", ")}`
            );
          } else {
            const banksToRead =
              this.p6Device.getCurrentBanks() ??
              [...BACKUP_CONSTANTS.SAMPLE_BANKS];
            let bankItemCount = 0;
            const allBankSamples: Record<string, SampleFileInfo[]> = {};

            for (const bankId of banksToRead) {
              try {
                const bankSamples = await this.p6Device.readData("samples", { bankId }) as SampleBankData;
                allBankSamples[bankId] = bankSamples.samples || [];
                bankItemCount += allBankSamples[bankId].length;
              } catch {
                // Bank doesn't exist on device, skip
              }
            }

            const samplesDir = path.join(backupDir, "samples");
            await fs.mkdir(samplesDir, { recursive: true });
            await fs.writeFile(
              path.join(samplesDir, "samples.json"),
              JSON.stringify(allBankSamples, null, 2)
            );
            const enrichedAllSamples = await this.copySampleFiles(allBankSamples, samplesDir);
            await fs.writeFile(
              path.join(samplesDir, "samples.json"),
              JSON.stringify(enrichedAllSamples, null, 2)
            );

            totalItemCount += bankItemCount;
            results.push({ type: "samples", itemCount: bankItemCount });
            messages.push(`${bankItemCount} samples from all banks`);
          }
        } catch (error) {
          throw new Error(`Sample backup failed: ${error}`);
        }
      }

      const manifest = {
        type: "backup",
        timestamp: new Date(),
        device: deviceStatus,
        options,
        results,
        totalItemCount,
        displayName: options.customName,
      };
      await fs.writeFile(
        path.join(backupDir, "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );

      return {
        success: true,
        backupPath: backupDir,
        type: BackupType.BACKUP,
        timestamp: new Date(),
        itemCount: totalItemCount,
        message: `Backup completed: ${messages.join(", ")}`,
      };
    } catch (error) {
      return {
        success: false,
        backupPath: "",
        type: BackupType.BACKUP,
        timestamp: new Date(),
        itemCount: 0,
        message: `Backup failed: ${error}`,
      };
    }
  }

  async organizeBackup(options: {
    includePatterns?: boolean;
    includeSamples?: boolean;
    bankIds?: string[];
    precompletedResults?: BackupStageResult[];
    customName?: string;
  }): Promise<BackupResult> {
    try {
      let deviceStatus = this.p6Device.getStatus();
      if (!deviceStatus.connected) {
        const isReady = await this.p6Device.isReady();
        if (!isReady) throw new Error("P6 device not connected");
        deviceStatus = this.p6Device.getStatus();
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupDir = await this.backupDirService.createDirectory(
        "backup",
        timestamp,
        options.customName
      );

      let totalItemCount = 0;
      const results: Array<{ type: string; itemCount: number; bank?: string }> = [];
      const messages: string[] = [];

      if (options.precompletedResults) {
        for (const completedResult of options.precompletedResults) {
          if (!completedResult.result?.success) continue;
          if (completedResult.type === "patterns") {
            await this.copyPatternsToCombined(completedResult, backupDir);
            totalItemCount += completedResult.result.itemCount;
            results.push({
              type: "patterns",
              itemCount: completedResult.result.itemCount,
            });
            messages.push(`${completedResult.result.itemCount} patterns`);
          } else if (completedResult.type === "samples") {
            await this.copySamplesToCombined(completedResult, backupDir);
            totalItemCount += completedResult.result.itemCount;
            results.push({
              type: "samples",
              bank: completedResult.bank,
              itemCount: completedResult.result.itemCount,
            });
            messages.push(
              `${completedResult.result.itemCount} samples from bank ${completedResult.bank.toUpperCase()}`
            );
          }
        }
      }

      const manifest = {
        type: "backup",
        timestamp: new Date(),
        device: deviceStatus,
        options,
        results,
        totalItemCount,
        displayName: options.customName,
      };
      await fs.writeFile(
        path.join(backupDir, "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );

      // Clean up staging directories created during orchestration
      for (const stage of options.precompletedResults ?? []) {
        const stagingPath = stage.result?.backupPath;
        if (stagingPath && stagingPath !== backupDir) {
          await fs.rm(stagingPath, { recursive: true, force: true }).catch(
            (e) => this.logger.warn(`Failed to remove staging dir ${stagingPath}`, { e })
          );
        }
      }

      return {
        success: true,
        backupPath: backupDir,
        type: BackupType.BACKUP,
        timestamp: new Date(),
        itemCount: totalItemCount,
        message: `Backup completed: ${messages.join(", ")}`,
      };
    } catch (error) {
      return {
        success: false,
        backupPath: "",
        type: BackupType.BACKUP,
        timestamp: new Date(),
        itemCount: 0,
        message: `Backup organization failed: ${error}`,
      };
    }
  }

  private async exists(pathToCheck: string): Promise<boolean> {
    try {
      await fs.access(pathToCheck);
      return true;
    } catch {
      return false;
    }
  }

  private async copyPatternFiles(
    patterns: PatternInfo[],
    backupDir: string
  ): Promise<void> {
    const patternsDir = path.join(backupDir, "patterns");
    await fs.mkdir(patternsDir, { recursive: true });

    for (const pattern of patterns) {
      if (pattern.path) {
        const destPath = path.join(patternsDir, path.basename(pattern.path));
        try {
          await this.fileSystemService.copyFile(pattern.path, destPath);
        } catch (error) {
          this.logger.warn(`Failed to copy pattern file ${pattern.name}`, {
            error,
          });
          await fs.writeFile(
            path.join(patternsDir, `${pattern.name}_metadata.json`),
            JSON.stringify(pattern, null, 2)
          );
        }
      }
    }
  }

  private async copySampleFiles(
    samples: Record<string, SampleFileInfo[]>,
    backupDir: string
  ): Promise<Record<string, SampleFileInfo[]>> {
    if (!samples || typeof samples !== "object" || Array.isArray(samples))
      return samples;
    const filesDir = path.join(backupDir, "files");
    await fs.mkdir(filesDir, { recursive: true });

    const enriched: Record<string, SampleFileInfo[]> = {};
    for (const [bank, bankSamples] of Object.entries(samples)) {
      if (!Array.isArray(bankSamples)) continue;
      const bankDir = path.join(filesDir, `BANK_${bank.toUpperCase()}`);
      await fs.mkdir(bankDir, { recursive: true });
      enriched[bank] = [];
      for (const sample of bankSamples) {
        if (!sample?.path) {
          enriched[bank].push(sample);
          continue;
        }
        try {
          const destPath = path.join(bankDir, sample.name);
          await fs.mkdir(path.dirname(destPath), { recursive: true });
          const stat = await fs.stat(sample.path);
          if (stat.isFile()) {
            await this.fileSystemService.copyFile(sample.path, destPath);
            enriched[bank].push({ ...sample, size: stat.size });
          } else {
            enriched[bank].push(sample);
          }
        } catch {
          enriched[bank].push(sample);
        }
      }
    }
    return enriched;
  }

  private async copyPatternsToCombined(
    completedResult: Extract<BackupStageResult, { type: "patterns" }>,
    backupDir: string
  ): Promise<void> {
    const sourcePatternsDir = path.join(
      completedResult.result.backupPath,
      "patterns"
    );
    if (!await this.exists(sourcePatternsDir)) return;

    const destFilesDir = path.join(backupDir, "files");
    await fs.mkdir(destFilesDir, { recursive: true });

    // Copy physical pattern files to final/files/
    const sourceFiles = await fs.readdir(sourcePatternsDir);
    const patternFiles = sourceFiles.filter((f) => f !== "patterns.json");
    await Promise.all(
      patternFiles.map((file) =>
        this.fileSystemService.copyFile(
          path.join(sourcePatternsDir, file),
          path.join(destFilesDir, file)
        )
      )
    );

    // Read patterns.json and rewrite paths to the final backup location
    const sourcePatternsJson = path.join(sourcePatternsDir, "patterns.json");
    if (await this.exists(sourcePatternsJson)) {
      const patternsData: PatternInfo[] = JSON.parse(
        await fs.readFile(sourcePatternsJson, "utf-8")
      );
      const updatedPatterns = patternsData.map((p) => ({
        ...p,
        path: path.join(destFilesDir, path.basename(p.path || "")),
      }));
      await fs.writeFile(
        path.join(backupDir, "patterns.json"),
        JSON.stringify(updatedPatterns, null, 2)
      );
    }
  }

  private async copySamplesToCombined(
    completedResult: Extract<BackupStageResult, { type: "samples" }>,
    backupDir: string
  ): Promise<void> {
    const destFilesDir = path.join(backupDir, "files");
    const bankUpper = completedResult.bank.toUpperCase();
    const destBankDir = path.join(destFilesDir, `BANK_${bankUpper}`);

    // Copy physical sample files to final/files/BANK_X/
    const sourceFilesDir = path.join(completedResult.result.backupPath, "files");
    const sourceBankDir = path.join(sourceFilesDir, `BANK_${bankUpper}`);
    if (await this.exists(sourceBankDir)) {
      await fs.mkdir(destFilesDir, { recursive: true });
      await this.fileSystemService.copyDirectory(sourceBankDir, destBankDir);
    }

    // Merge samples.json and rewrite paths to the final backup location
    const existingSamplesPath = path.join(backupDir, "samples.json");
    let combinedSamples: Record<string, SampleFileInfo[]> = {};
    if (await this.exists(existingSamplesPath)) {
      try {
        combinedSamples = JSON.parse(await fs.readFile(existingSamplesPath, "utf-8"));
      } catch (error) {
        this.logger.warn("Failed to read existing samples.json", { error });
      }
    }

    const bankSamplesPath = path.join(completedResult.result.backupPath, "samples.json");
    if (await this.exists(bankSamplesPath)) {
      try {
        const rawData = JSON.parse(await fs.readFile(bankSamplesPath, "utf-8"));
        let bankId: string;
        let bankSamples: SampleFileInfo[];

        if ("bankId" in rawData && Array.isArray(rawData.samples)) {
          bankId = rawData.bankId.toLowerCase();
          bankSamples = rawData.samples;
        } else {
          const entries = Object.entries(rawData as Record<string, SampleFileInfo[]>);
          if (entries.length === 0) return;
          [bankId, bankSamples] = entries[0] as [string, SampleFileInfo[]];
          bankId = bankId.toLowerCase();
        }

        // Update paths to final backup location
        const finalBankDir = path.join(destFilesDir, `BANK_${bankId.toUpperCase()}`);
        combinedSamples[bankId] = bankSamples.map((s) => ({
          ...s,
          path: path.join(finalBankDir, s.name),
        }));

        await fs.writeFile(existingSamplesPath, JSON.stringify(combinedSamples, null, 2));
      } catch (error) {
        this.logger.warn(`Failed to merge samples from bank ${completedResult.bank}`, { error });
      }
    }
  }

}
