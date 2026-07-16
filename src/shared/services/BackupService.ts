import * as fs from "fs/promises";
import * as path from "path";
import {
  BackupResult,
  RestoreResult,
  BackupStageResult,
} from "../types/index";
import { FileSystemService } from "./FileSystemService";
import { ModeService } from "./ModeService";
import { IDeviceConnection } from "./interfaces";
import { createComponentLogger } from "./Logger";
import { PatternBackupService } from "./PatternBackupService";
import { SampleBackupService } from "./SampleBackupService";
import { BackupDirectoryService } from "./BackupDirectoryService";
import {
  BankSamples,
  filesDir,
  manifestPath,
  readPatternsJson,
  readSamplesJson,
  sampleBankDir,
  writePatternsJson,
  writeSamplesJson,
} from "./backupLayout";

interface BackupManifest {
  type: "backup";
  timestamp: Date;
  results: Array<{ type: string; itemCount: number; bank?: string }>;
  totalItemCount: number;
  displayName?: string;
}

/**
 * Facade over the per-kind backup services, plus the one job neither of them
 * can do alone: folding the staging directories left by a multi-stage run into
 * a single backup.
 */
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
    this.patternService =
      patternService ??
      new PatternBackupService(
        this.p6Device,
        this.fileSystemService,
        this.modeService
      );
    this.sampleService =
      sampleService ??
      new SampleBackupService(
        this.p6Device,
        this.fileSystemService,
        this.modeService
      );
  }

  backupPatterns(customName?: string, patternIds?: string[]): Promise<BackupResult> {
    return this.patternService.backupPatterns(customName, patternIds);
  }

  backupSamples(
    bankId?: string,
    customName?: string,
    padNumbers?: number[]
  ): Promise<BackupResult> {
    return this.sampleService.backupSamples(bankId, customName, padNumbers);
  }

  restorePatterns(backupPath: string, patternIds?: string[]): Promise<RestoreResult> {
    return this.patternService.restorePatterns(backupPath, patternIds);
  }

  restoreSamples(
    backupPath: string,
    bankId?: string,
    sampleNames?: string[]
  ): Promise<RestoreResult> {
    return this.sampleService.restoreSamples(backupPath, bankId, sampleNames);
  }

  /**
   * Gather the staging backups a multi-stage run produced into one backup, then
   * delete them.
   *
   * Must not touch the device: every stage ends by ejecting it, so by now it is
   * gone by design.
   */
  async organizeBackup(options: {
    precompletedResults?: BackupStageResult[];
    customName?: string;
  }): Promise<BackupResult> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupDir = await this.backupDirService.createDirectory(
        "backup",
        timestamp,
        options.customName
      );

      const stages = (options.precompletedResults ?? []).filter(
        (stage) => stage.result?.success
      );

      let totalItemCount = 0;
      const results: BackupManifest["results"] = [];
      const messages: string[] = [];

      for (const stage of stages) {
        const { itemCount } = stage.result;
        totalItemCount += itemCount;
        if (stage.type === "patterns") {
          await this.gatherPatterns(stage.result.backupPath, backupDir);
          results.push({ type: "patterns", itemCount });
          messages.push(`${itemCount} patterns`);
        } else {
          await this.gatherSamples(stage.result.backupPath, backupDir);
          results.push({ type: "samples", bank: stage.bank, itemCount });
          messages.push(
            `${itemCount} samples from bank ${stage.bank.toUpperCase()}`
          );
        }
      }

      const manifest: BackupManifest = {
        type: "backup",
        timestamp: new Date(),
        results,
        totalItemCount,
        displayName: options.customName,
      };
      await this.fileSystemService.writeJsonFile(
        manifestPath(backupDir),
        manifest
      );

      await this.removeStagingDirs(stages, backupDir);

      return {
        success: true,
        backupPath: backupDir,
        timestamp: new Date(),
        itemCount: totalItemCount,
        message: `Backup completed: ${messages.join(", ")}`,
      };
    } catch (error) {
      this.logger.error("Backup organization failed", { error });
      return {
        success: false,
        backupPath: "",
        timestamp: new Date(),
        itemCount: 0,
        message: `Backup organization failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /** Move one staging run's patterns into the final backup, repointing paths. */
  private async gatherPatterns(
    stagingDir: string,
    backupDir: string
  ): Promise<void> {
    await this.fileSystemService.copyDirectory(
      filesDir(stagingDir),
      filesDir(backupDir)
    );

    const patterns = await readPatternsJson(this.fileSystemService, stagingDir);
    if (!patterns) return;
    await writePatternsJson(
      this.fileSystemService,
      backupDir,
      patterns.map((p) => ({
        ...p,
        path: path.join(filesDir(backupDir), path.basename(p.path)),
      }))
    );
  }

  /** Merge one staging run's bank into the final backup's samples.json. */
  private async gatherSamples(
    stagingDir: string,
    backupDir: string
  ): Promise<void> {
    const staged = await readSamplesJson(this.fileSystemService, stagingDir);
    if (!staged) return;

    const combined: BankSamples =
      (await readSamplesJson(this.fileSystemService, backupDir)) ?? {};

    for (const [bank, samples] of Object.entries(staged)) {
      await this.fileSystemService.copyDirectory(
        sampleBankDir(stagingDir, bank),
        sampleBankDir(backupDir, bank)
      );
      combined[bank] = samples.map((s) => ({
        ...s,
        path: path.join(sampleBankDir(backupDir, bank), s.name),
      }));
    }

    await writeSamplesJson(this.fileSystemService, backupDir, combined);
  }

  private async removeStagingDirs(
    stages: BackupStageResult[],
    backupDir: string
  ): Promise<void> {
    for (const stage of stages) {
      const stagingPath = stage.result.backupPath;
      if (!stagingPath || stagingPath === backupDir) continue;
      await fs
        .rm(stagingPath, { recursive: true, force: true })
        .catch((error) =>
          this.logger.warn(`Failed to remove staging dir ${stagingPath}`, {
            error,
          })
        );
    }
  }
}
