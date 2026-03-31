import * as fs from "fs/promises";
import * as path from "path";
import { BackupResult, RestoreResult, BackupType, SampleBankData, SampleFileInfo } from "../types/index";
import { FileSystemService } from "./FileSystemService";
import { ModeService } from "./ModeService";
import { IDeviceConnection } from "./interfaces";
import { ERROR_MESSAGES, BACKUP_CONSTANTS } from "../constants";
import { createComponentLogger } from "./Logger";
import { ModeError } from "../errors/ModeError";
import { BackupDirectoryService } from "./BackupDirectoryService";

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
      let deviceStatus = this.device.getStatus();
      if (!deviceStatus.connected) {
        const isReady = await this.device.isReady();
        if (!isReady) throw new Error("P6 device not connected");
        deviceStatus = this.device.getStatus();
      }

      const modeRequirement =
        this.modeService.getOperationModeRequirement("sample backup");
      if (modeRequirement) {
        throw new ModeError(
          modeRequirement.currentMode,
          modeRequirement.requiredMode,
          "sample backup"
        );
      }

      if (bankId) {
        const currentMode = deviceStatus.mode;
        const sampleModes = ["sample", "sample_export", "sample_import"];
        if (sampleModes.includes(currentMode)) {
          try {
            const deviceCurrentBank = this.device.getCurrentBank();
            const availableBanks = this.device.getCurrentBanks();

            this.logger.debug(
              `backupSamples: Target bank: ${bankId.toUpperCase()}, Device bank: ${deviceCurrentBank}, Available: ${availableBanks?.join(", ")}`
            );

            if (
              deviceCurrentBank &&
              deviceCurrentBank.toLowerCase() !== bankId.toLowerCase()
            ) {
              throw new Error(
                ERROR_MESSAGES.BACKUP_WRONG_BANK(
                  deviceCurrentBank,
                  bankId
                )
              );
            }

            if (
              availableBanks &&
              !availableBanks.some(
                (b) => b.toLowerCase() === bankId.toLowerCase()
              )
            ) {
              throw new Error(
                ERROR_MESSAGES.BACKUP_BANK_NOT_AVAILABLE(
                  bankId,
                  availableBanks
                )
              );
            }
          } catch (error: any) {
            if (
              error.message.includes("not available") ||
              error.message.includes("currently set to bank")
            ) {
              throw error;
            }
            this.logger.warn("Could not verify bank selection", {
              error: error.message,
            });
          }
        }
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupType = bankId ? `samples-bank-${bankId}` : "samples-all";
      const backupDir = await this.backupDirService.createDirectory(
        backupType,
        timestamp,
        customName
      );

      let samples: SampleBankData | Record<string, SampleFileInfo[]>;
      let itemCount = 0;

      if (bankId) {
        samples = await this.readSamplesFromBank(bankId);
        if (padNumbers && padNumbers.length > 0) {
          samples.samples = samples.samples.filter((s) => {
            const m = s.name.match(/^PAD_(\d+)\//i);
            return m !== null && padNumbers.includes(parseInt(m[1], 10));
          });
        }
        itemCount = samples.samples.filter((s) => s.name.toUpperCase().endsWith(".WAV")).length;
      } else {
        samples = await this.readAllSamples();
        itemCount = Object.values(samples).reduce(
          (total, bankSamples) => total + bankSamples.length,
          0
        );
      }

      await fs.writeFile(
        path.join(backupDir, "samples.json"),
        JSON.stringify(samples, null, 2)
      );
      const enrichedSamples = await this.copySampleFiles(samples, backupDir, bankId);
      await fs.writeFile(
        path.join(backupDir, "samples.json"),
        JSON.stringify(enrichedSamples, null, 2)
      );

      return {
        success: true,
        backupPath: backupDir,
        type: bankId ? BackupType.BACKUP : BackupType.BACKUP,
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
        type: bankId ? BackupType.BACKUP : BackupType.BACKUP,
        timestamp: new Date(),
        itemCount: 0,
        message: `Sample backup failed: ${error instanceof Error ? error.message : error}`,
      };
    }
  }

  async restoreSamples(
    backupPath: string,
    bankId?: string,
    sampleNames?: string[]
  ): Promise<RestoreResult> {
    try {
      let deviceStatus = this.device.getStatus();
      if (!deviceStatus.connected) {
        const isReady = await this.device.isReady();
        if (!isReady) throw new Error("P6 device not connected");
        deviceStatus = this.device.getStatus();
      }

      const modeRequirement =
        this.modeService.getOperationModeRequirement("sample restore");
      if (modeRequirement) {
        throw new ModeError(
          modeRequirement.currentMode,
          modeRequirement.requiredMode,
          "sample restore"
        );
      }

      const samplesData = await fs.readFile(
        path.join(backupPath, "samples.json"),
        "utf-8"
      );
      const parsed = JSON.parse(samplesData);

      // Normalize: single-bank backups store SampleBankData ({ bankId, samples }),
      // multi-bank backups store Record<bankId, SampleFileInfo[]>.
      let samples: Record<string, SampleFileInfo[]>;
      if ("bankId" in parsed && Array.isArray(parsed.samples)) {
        samples = { [parsed.bankId]: parsed.samples };
      } else {
        samples = parsed;
      }

      let itemCount = 0;
      let message = "";

      const filterByNames = (list: SampleFileInfo[]) =>
        sampleNames && sampleNames.length > 0
          ? list.filter((s) => sampleNames.includes(s.name))
          : list;

      if (bankId) {
        // Case-insensitive key lookup
        const bankKey = Object.keys(samples).find(
          (k) => k.toLowerCase() === bankId.toLowerCase()
        );
        if (!bankKey) {
          throw new Error(`Bank ${bankId.toUpperCase()} not found in backup`);
        }
        // s.path in samples.json already points to the file's location in the backup directory
        const toRestore = filterByNames(samples[bankKey] as SampleFileInfo[]);
        await this.writeSamplesToBank(toRestore, bankId);
        itemCount = toRestore.filter((s) => s.name.toUpperCase().endsWith(".WAV")).length;
        message = `Successfully restored bank ${bankId.toUpperCase()} (${itemCount} samples)`;
      } else {
        for (const [bank, bankSamples] of Object.entries(samples)) {
          const toRestore = filterByNames(bankSamples as SampleFileInfo[]);
          await this.writeSamplesToBank(toRestore, bank);
          itemCount += toRestore.filter((s) => s.name.toUpperCase().endsWith(".WAV")).length;
        }
        message = `Successfully restored all sample banks (${itemCount} samples)`;
      }

      return {
        success: true,
        type: bankId ? BackupType.BACKUP : BackupType.BACKUP,
        itemCount,
        message,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        type: bankId ? BackupType.BACKUP : BackupType.BACKUP,
        itemCount: 0,
        message: `Sample restore failed: ${error instanceof Error ? error.message : error}`,
        timestamp: new Date(),
      };
    }
  }

  private async readSamplesFromBank(bankId: string): Promise<SampleBankData> {
    try {
      const result = await this.device.readData("samples", { bankId });
      return (result as SampleBankData) || { bankId, samples: [] };
    } catch (error) {
      this.logger.error(`Failed to read samples from bank ${bankId}`, {
        bankId,
        error,
      });
      throw new Error(`Could not read samples from bank ${bankId}: ${error}`);
    }
  }

  private async readAllSamples(): Promise<Record<string, SampleFileInfo[]>> {
    const banksToRead =
      this.device.getCurrentBanks() ??
      [...BACKUP_CONSTANTS.SAMPLE_BANKS];
    const allSamples: Record<string, SampleFileInfo[]> = {};
    for (const bankId of banksToRead) {
      try {
        const bankData = (await this.device.readData("samples", {
          bankId,
        })) as SampleBankData;
        allSamples[bankId] = bankData.samples || [];
      } catch {
        // Bank doesn't exist on device, skip
      }
    }
    return allSamples;
  }

  private async copySampleFiles(
    samples: SampleBankData | Record<string, SampleFileInfo[]>,
    backupDir: string,
    bankId?: string
  ): Promise<SampleBankData | Record<string, SampleFileInfo[]>> {
    const filesDir = path.join(backupDir, "files");
    await fs.mkdir(filesDir, { recursive: true });

    if ("bankId" in samples) {
      const bank = bankId || (samples as SampleBankData).bankId;
      const bankDir = path.join(filesDir, `BANK_${bank.toUpperCase()}`);
      await fs.mkdir(bankDir, { recursive: true });
      const enrichedSamples: SampleFileInfo[] = [];
      for (const sample of samples.samples) {
        const size = await this.copySingleSampleFile(sample, bankDir);
        enrichedSamples.push(size !== undefined ? { ...sample, size } : sample);
      }
      return { ...(samples as SampleBankData), samples: enrichedSamples };
    } else {
      const enriched: Record<string, SampleFileInfo[]> = {};
      for (const [bank, bankSamples] of Object.entries(samples as Record<string, SampleFileInfo[]>)) {
        if (!Array.isArray(bankSamples)) continue;
        const bankDir = path.join(filesDir, `BANK_${bank.toUpperCase()}`);
        await fs.mkdir(bankDir, { recursive: true });
        enriched[bank] = [];
        for (const sample of bankSamples) {
          const size = await this.copySingleSampleFile(sample, bankDir);
          enriched[bank].push(size !== undefined ? { ...sample, size } : sample);
        }
      }
      return enriched;
    }
  }

  private async copySingleSampleFile(
    sample: SampleFileInfo,
    destDir: string
  ): Promise<number | undefined> {
    if (!sample?.path) return undefined;
    const destPath = path.join(destDir, sample.name);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    try {
      const stat = await fs.stat(sample.path);
      if (stat.isFile()) {
        await this.fileSystemService.copyFile(sample.path, destPath);
        return stat.size;
      }
    } catch (err) {
      this.logger.warn(`Error copying sample file ${sample.name}`, { err });
    }
    return undefined;
  }

  private async writeSamplesToBank(
    samples: SampleFileInfo[],
    bankId: string
  ): Promise<void> {
    try {
      const success = await this.device.writeData(
        "samples",
        { bankId, samples } satisfies SampleBankData,
        { bankId }
      );
      if (!success)
        throw new Error(`Failed to write samples to bank ${bankId}`);
      this.logger.debug(
        `Successfully wrote ${samples.length} samples to bank ${bankId.toUpperCase()}`
      );
    } catch (error) {
      this.logger.error(`Failed to write samples to bank ${bankId}`, {
        bankId,
        error,
      });
      throw error instanceof Error ? error : new Error(`Could not write samples to bank ${bankId}`);
    }
  }
}
