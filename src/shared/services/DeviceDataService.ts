import * as path from "path";
import * as fs from "fs";
import { createComponentLogger } from "../services/Logger";
import { ERROR_MESSAGES, BACKUP_CONSTANTS } from "../constants";
import { DATA_TYPES } from "../constants/device";
import { P6MassStorageInfo } from "../services/UsbDeviceManager";
import { DeviceStatus, PatternInfo, SampleBankData } from "../types/index";
import { parsePrmMetadata } from "../utils/prmParser";

const { FOLDERS, BANK_PREFIX } = BACKUP_CONSTANTS;

/** Pattern files as the device writes them: P6_PTN<bank>-<pattern>.PRM */
const PATTERN_FILE_REGEX = /^P6_PTN(\d+)-(\d+)\.PRM$/i;
const PAD_DIR_REGEX = /^PAD_\d+$/i;

/**
 * Reads and writes the device's mounted volume. Callers are expected to have
 * checked the mode: the folders here only exist in the matching one.
 */
export class DeviceDataService {
  private logger = createComponentLogger("DeviceDataService");

  constructor(
    private readonly getStatus: () => DeviceStatus,
    private readonly getMassStorageInfo: () => P6MassStorageInfo | null
  ) {}

  private requireVolume(): P6MassStorageInfo {
    if (!this.getStatus().connected)
      throw new Error(ERROR_MESSAGES.DEVICE_NOT_CONNECTED);
    const massStorageInfo = this.getMassStorageInfo();
    if (!massStorageInfo)
      throw new Error(ERROR_MESSAGES.MASS_STORAGE_NOT_AVAILABLE);
    return massStorageInfo;
  }

  async readData(
    dataType: string,
    parameters?: { bankId?: string }
  ): Promise<PatternInfo[] | SampleBankData> {
    const volume = this.requireVolume();
    this.logger.info("Reading data", { dataType, parameters });
    switch (dataType.toLowerCase()) {
      case DATA_TYPES.PATTERNS:
        return this.readPatternData(volume);
      case DATA_TYPES.SAMPLES:
        return this.readSampleData(volume, parameters?.bankId ?? "");
      default:
        throw new Error(ERROR_MESSAGES.UNKNOWN_DATA_TYPE(dataType));
    }
  }

  async writeData(
    dataType: string,
    data: PatternInfo[] | SampleBankData,
    parameters?: { bankId?: string }
  ): Promise<boolean> {
    const volume = this.requireVolume();
    this.logger.info("Writing data", { dataType, parameters });
    switch (dataType.toLowerCase()) {
      case DATA_TYPES.PATTERNS:
        return this.writePatternData(volume, data as PatternInfo[]);
      case DATA_TYPES.SAMPLES:
        return this.writeSampleData(volume, data as SampleBankData);
      default:
        throw new Error(ERROR_MESSAGES.UNKNOWN_DATA_TYPE(dataType));
    }
  }

  private async readPatternData(
    volume: P6MassStorageInfo
  ): Promise<PatternInfo[]> {
    try {
      const deviceBackupPath = path.join(volume.path, FOLDERS.BACKUP);
      const files = await fs.promises.readdir(deviceBackupPath);
      const patterns: PatternInfo[] = [];
      for (const file of files) {
        const match = PATTERN_FILE_REGEX.exec(file);
        if (!match) continue;
        const bank = parseInt(match[1], 10);
        const pattern = parseInt(match[2], 10);
        const filePath = path.join(deviceBackupPath, file);
        const stats = await fs.promises.stat(filePath);
        patterns.push({
          id: `${bank}-${pattern}`,
          bank,
          pattern,
          name: path.parse(file).name,
          path: filePath,
          size: stats.size,
          metadata: await this.readPrmMetadata(filePath),
        });
      }
      return patterns;
    } catch (error) {
      this.logger.error("Failed to read patterns", { error });
      return [];
    }
  }

  private async readPrmMetadata(filePath: string) {
    try {
      return parsePrmMetadata(await fs.promises.readFile(filePath, "ascii"));
    } catch {
      return undefined;
    }
  }

  private async readSampleData(
    volume: P6MassStorageInfo,
    bankId: string
  ): Promise<SampleBankData> {
    if (!bankId) throw new Error(ERROR_MESSAGES.BANK_ID_REQUIRED);
    const bankPath = path.join(
      volume.path,
      FOLDERS.EXPORT,
      `${BANK_PREFIX}${bankId.toUpperCase()}`
    );
    const entries = await fs.promises.readdir(bankPath);

    const padNumber = (dir: string) => parseInt(dir.replace(/\D/g, ""), 10);
    const padDirs = entries
      .filter((f) => PAD_DIR_REGEX.test(f))
      .sort((a, b) => padNumber(a) - padNumber(b));

    const sampleData: SampleBankData = { bankId, samples: [] };
    for (const padDir of padDirs) {
      const padPath = path.join(bankPath, padDir);
      const padFiles = (await fs.promises.readdir(padPath))
        .filter((f) => !f.startsWith("."))
        .sort();
      for (const file of padFiles) {
        sampleData.samples.push({
          name: `${padDir}/${file}`,
          path: path.join(padPath, file),
        });
      }
    }
    return sampleData;
  }

  private async writePatternData(
    volume: P6MassStorageInfo,
    data: PatternInfo[]
  ): Promise<boolean> {
    try {
      const restorePath = path.join(volume.path, FOLDERS.RESTORE);
      await fs.promises.mkdir(restorePath, { recursive: true });
      for (const pattern of data) {
        if (!pattern.path) continue;
        await fs.promises.copyFile(
          pattern.path,
          path.join(restorePath, path.basename(pattern.path))
        );
      }
      return true;
    } catch (error) {
      this.logger.error("Failed to write patterns", { error });
      return false;
    }
  }

  private async writeSampleData(
    volume: P6MassStorageInfo,
    data: SampleBankData
  ): Promise<boolean> {
    try {
      const bankDir = path.join(
        volume.path,
        FOLDERS.IMPORT,
        `${BANK_PREFIX}${data.bankId.toUpperCase()}`
      );
      await fs.promises.mkdir(bankDir, { recursive: true });
      for (const sample of data.samples) {
        const destPath = path.join(bankDir, sample.name);
        await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
        await fs.promises.copyFile(sample.path, destPath);
      }
      return true;
    } catch (error) {
      this.logger.error("Failed to write samples", { error });
      return false;
    }
  }
}
