import * as path from "path";
import { BackupResult, RestoreResult, SampleBankData, SampleFileInfo } from "../types/index";
import { FileSystemService } from "./FileSystemService";
import { ModeService } from "./ModeService";
import { IDeviceConnection } from "./interfaces";
import { ERROR_MESSAGES, BACKUP_CONSTANTS } from "../constants";
import { isSampleMode } from "../constants/device";
import { createComponentLogger } from "./Logger";
import { ModeError } from "../errors/ModeError";
import { BackupDirectoryService } from "./BackupDirectoryService";
import {
  BankSamples,
  countWavs,
  readSamplesJson,
  sampleBankDir,
  writeSamplesJson,
} from "./backupLayout";

export class SampleBackupService {
  private logger = createComponentLogger("SampleBackupService");
  private readonly backupDirService: BackupDirectoryService;

  constructor(
    private readonly device: IDeviceConnection,
    private readonly fileSystemService: FileSystemService,
    private readonly modeService: ModeService
  ) {
    this.backupDirService = new BackupDirectoryService(fileSystemService);
  }

  async backupSamples(
    bankId?: string,
    customName?: string,
    padNumbers?: number[]
  ): Promise<BackupResult> {
    try {
      await this.requireDevice("sample backup");
      if (bankId) this.verifyBankSelected(bankId);

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupDir = await this.backupDirService.createDirectory(
        bankId ? `samples-bank-${bankId}` : "samples-all",
        timestamp,
        customName
      );

      const samples = bankId
        ? { [bankId.toUpperCase()]: this.filterPads(
            (await this.readBank(bankId)).samples,
            padNumbers
          ) }
        : await this.readAllBanks();

      const enriched = await this.copySampleFiles(samples, backupDir);
      await writeSamplesJson(this.fileSystemService, backupDir, enriched);
      const itemCount = countWavs(enriched);

      return {
        success: true,
        backupPath: backupDir,
        timestamp: new Date(),
        itemCount,
        message: bankId
          ? `Successfully backed up bank ${bankId.toUpperCase()} (${itemCount} samples)`
          : `Successfully backed up all sample banks (${itemCount} samples)`,
      };
    } catch (error) {
      this.logger.error("Sample backup failed", { error });
      return {
        success: false,
        backupPath: "",
        timestamp: new Date(),
        itemCount: 0,
        message: `Sample backup failed: ${describe(error)}`,
      };
    }
  }

  async restoreSamples(
    backupPath: string,
    bankId?: string,
    sampleNames?: string[]
  ): Promise<RestoreResult> {
    try {
      await this.requireDevice("sample restore");
      const samples = await readSamplesJson(this.fileSystemService, backupPath);
      if (!samples) throw new Error("This backup contains no samples.json");

      const filterByNames = (list: SampleFileInfo[]) =>
        sampleNames && sampleNames.length > 0
          ? list.filter((s) => sampleNames.includes(s.name))
          : list;

      let itemCount = 0;
      let message: string;

      if (bankId) {
        const bankKey = Object.keys(samples).find(
          (k) => k.toLowerCase() === bankId.toLowerCase()
        );
        if (!bankKey)
          throw new Error(`Bank ${bankId.toUpperCase()} not found in backup`);
        const toRestore = filterByNames(samples[bankKey]);
        await this.writeSamplesToBank(toRestore, bankId);
        itemCount = countWavs({ [bankKey]: toRestore });
        message = `Successfully restored bank ${bankId.toUpperCase()} (${itemCount} samples)`;
      } else {
        for (const [bank, bankSamples] of Object.entries(samples)) {
          const toRestore = filterByNames(bankSamples);
          await this.writeSamplesToBank(toRestore, bank);
          itemCount += countWavs({ [bank]: toRestore });
        }
        message = `Successfully restored all sample banks (${itemCount} samples)`;
      }

      return { success: true, itemCount, message, timestamp: new Date() };
    } catch (error) {
      return {
        success: false,
        itemCount: 0,
        message: `Sample restore failed: ${describe(error)}`,
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

  /**
   * The device exposes only the bank it is set to, so backing up a different
   * one silently produces the wrong data. Refuse rather than guess.
   */
  private verifyBankSelected(bankId: string): void {
    if (!isSampleMode(this.device.getCurrentMode())) return;

    const deviceCurrentBank = this.device.getCurrentBank();
    if (
      deviceCurrentBank &&
      deviceCurrentBank.toLowerCase() !== bankId.toLowerCase()
    )
      throw new Error(
        ERROR_MESSAGES.BACKUP_WRONG_BANK(deviceCurrentBank, bankId)
      );

    const availableBanks = this.device.getCurrentBanks();
    if (
      availableBanks &&
      !availableBanks.some((b) => b.toLowerCase() === bankId.toLowerCase())
    )
      throw new Error(
        ERROR_MESSAGES.BACKUP_BANK_NOT_AVAILABLE(bankId, availableBanks)
      );
  }

  private filterPads(
    samples: SampleFileInfo[],
    padNumbers?: number[]
  ): SampleFileInfo[] {
    if (!padNumbers || padNumbers.length === 0) return samples;
    return samples.filter((s) => {
      const match = /^PAD_(\d+)\//i.exec(s.name);
      return match !== null && padNumbers.includes(parseInt(match[1], 10));
    });
  }

  private async readBank(bankId: string): Promise<SampleBankData> {
    const result = await this.device.readData("samples", { bankId });
    return (result as SampleBankData) ?? { bankId, samples: [] };
  }

  private async readAllBanks(): Promise<BankSamples> {
    const banksToRead =
      this.device.getCurrentBanks() ?? [...BACKUP_CONSTANTS.SAMPLE_BANKS];
    const allSamples: BankSamples = {};
    for (const bankId of banksToRead) {
      try {
        allSamples[bankId.toUpperCase()] = (await this.readBank(bankId)).samples;
      } catch (error) {
        this.logger.debug(`Bank ${bankId} not present on device, skipping`, {
          error,
        });
      }
    }
    return allSamples;
  }

  /**
   * Copy every sample into the backup's files/ tree, recording the size each
   * turned out to be. Sizes drive the batching of a later restore.
   */
  private async copySampleFiles(
    samples: BankSamples,
    backupDir: string
  ): Promise<BankSamples> {
    const enriched: BankSamples = {};
    for (const [bank, bankSamples] of Object.entries(samples)) {
      const bankDir = sampleBankDir(backupDir, bank);
      enriched[bank] = [];
      for (const sample of bankSamples) {
        const destPath = path.join(bankDir, sample.name);
        await this.fileSystemService.copyFile(sample.path, destPath);
        const { size } = await this.fileSystemService.getFileStats(destPath);
        enriched[bank].push({ ...sample, path: destPath, size });
      }
    }
    return enriched;
  }

  private async writeSamplesToBank(
    samples: SampleFileInfo[],
    bankId: string
  ): Promise<void> {
    const success = await this.device.writeData(
      "samples",
      { bankId, samples } satisfies SampleBankData,
      { bankId }
    );
    if (!success) throw new Error(`Failed to write samples to bank ${bankId}`);
    this.logger.debug(
      `Wrote ${samples.length} samples to bank ${bankId.toUpperCase()}`
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
