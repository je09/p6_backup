import * as path from "path";
import * as fs from "fs";
import { FileSystemService } from "../services/FileSystemService";
import { createComponentLogger } from "../services/Logger";
import { ERROR_MESSAGES, LOG_MESSAGES } from "../constants/messages";
import { DATA_TYPES } from "../constants/device";
import { P6MassStorageInfo } from "../services/UsbDeviceManager";
import { DeviceStatus, PatternInfo, SampleBankData } from "../types/index";
import { parsePrmMetadata } from "../utils/prmParser";

export class DeviceDataService {
  private logger = createComponentLogger("DeviceDataService");
  private getStatus: () => DeviceStatus;
  private getMassStorageInfo: () => P6MassStorageInfo | null;

  constructor(
    _fileSystemService: FileSystemService,
    getStatus: () => DeviceStatus,
    getMassStorageInfo: () => P6MassStorageInfo | null
  ) {
    this.getStatus = getStatus;
    this.getMassStorageInfo = getMassStorageInfo;
  }

  async readData(dataType: string, parameters?: { bankId?: string }): Promise<PatternInfo[] | SampleBankData> {
    const status = this.getStatus();
    const massStorageInfo = this.getMassStorageInfo();
    if (!status.connected) {
      throw new Error(ERROR_MESSAGES.DEVICE_NOT_CONNECTED);
    }
    if (!massStorageInfo) {
      throw new Error(ERROR_MESSAGES.MASS_STORAGE_NOT_AVAILABLE);
    }
    this.logger.info(LOG_MESSAGES.READING_DATA(dataType, parameters), { dataType, parameters });
    switch (dataType.toLowerCase()) {
      case DATA_TYPES.PATTERNS:
        return await this.readPatternData(massStorageInfo);
      case DATA_TYPES.SAMPLES:
        return await this.readSampleData(massStorageInfo, parameters?.bankId ?? "");
      default:
        throw new Error(ERROR_MESSAGES.UNKNOWN_DATA_TYPE(dataType));
    }
  }

  async writeData(dataType: string, data: PatternInfo[] | SampleBankData | string, parameters?: { bankId?: string; bankPath?: string }): Promise<boolean> {
    const status = this.getStatus();
    const massStorageInfo = this.getMassStorageInfo();
    if (!status.connected) {
      throw new Error(ERROR_MESSAGES.DEVICE_NOT_CONNECTED);
    }
    if (!massStorageInfo) {
      throw new Error(ERROR_MESSAGES.MASS_STORAGE_NOT_AVAILABLE);
    }
    this.logger.info(LOG_MESSAGES.WRITING_DATA(dataType, data, parameters), { dataType, data, parameters });
    switch (dataType.toLowerCase()) {
      case DATA_TYPES.PATTERNS:
        return await this.writePatternData(massStorageInfo, data as PatternInfo[] | string, parameters);
      case DATA_TYPES.SAMPLES:
        return await this.writeSampleData(massStorageInfo, data as SampleBankData, parameters);
      default:
        throw new Error(ERROR_MESSAGES.UNKNOWN_DATA_TYPE(dataType));
    }
  }

  // BUG-07 fixed: removed the mkdir call that was writing to the device during a read operation.
  private async readPatternData(massStorageInfo: P6MassStorageInfo): Promise<PatternInfo[]> {
    try {
      const deviceBackupPath = path.join(massStorageInfo.path, "BACKUP");
      const files = await fs.promises.readdir(deviceBackupPath);
      const patternFiles = files.filter(
        (file: string) => file.startsWith("P6_PTN") && file.endsWith(".PRM")
      );
      const patterns = [];
      for (const file of patternFiles) {
        const match = file.match(/P6_PTN(\d+)-(\d+)\.PRM/);
        if (match) {
          const bankNumber = parseInt(match[1]);
          const patternNumber = parseInt(match[2]);
          const filePath = path.join(deviceBackupPath, file);
          const stats = await fs.promises.stat(filePath);
          let metadata;
          try {
            const content = await fs.promises.readFile(filePath, "ascii");
            metadata = parsePrmMetadata(content);
          } catch {
            // metadata stays undefined if file can't be read
          }
          patterns.push({
            id: `${bankNumber}-${patternNumber}`,
            bank: bankNumber,
            pattern: patternNumber,
            name: file.replace(".PRM", ""),
            path: filePath,
            size: stats.size,
            metadata,
          });
        }
      }
      return patterns;
    } catch (error) {
      this.logger.error("Failed to read patterns", undefined, error as Error);
      return [];
    }
  }

  private async readSampleData(massStorageInfo: P6MassStorageInfo, bankId: string): Promise<SampleBankData> {
    if (!bankId) {
      throw new Error(ERROR_MESSAGES.BANK_ID_REQUIRED);
    }
    const bankPath = path.join(massStorageInfo.path, "EXPORT", `BANK_${bankId.toUpperCase()}`);
    const entries = await fs.promises.readdir(bankPath);

    const padDirs = entries
      .filter((f: string) => /^PAD_\d+$/i.test(f))
      .sort((a: string, b: string) => {
        const n = (s: string) => parseInt(s.replace(/\D/g, ""), 10);
        return n(a) - n(b);
      });

    const sampleData: SampleBankData = { bankId, samples: [] };
    for (const padDir of padDirs) {
      const padPath = path.join(bankPath, padDir);
      const padFiles = (await fs.promises.readdir(padPath))
        .filter((f: string) => !f.startsWith("."))
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
    massStorageInfo: P6MassStorageInfo,
    data: PatternInfo[] | string,
    _parameters?: { bankId?: string; bankPath?: string }
  ): Promise<boolean> {
    try {
      const restorePath = path.join(massStorageInfo.path, "RESTORE");
      await fs.promises.mkdir(restorePath, { recursive: true });
      if (Array.isArray(data)) {
        for (const pattern of data) {
          if (pattern.path) {
            const fileName = path.basename(pattern.path);
            const destPath = path.join(restorePath, fileName);
            await fs.promises.copyFile(pattern.path, destPath);
          }
        }
      } else if (typeof data === "string") {
        const fileName = path.basename(data);
        const destPath = path.join(restorePath, fileName);
        if (fileName.endsWith(".PRM")) {
          await fs.promises.copyFile(data, destPath);
        }
      }
      return true;
    } catch (error) {
      this.logger.error("Failed to write patterns", undefined, error as Error);
      return false;
    }
  }

  private async writeSampleData(
    massStorageInfo: P6MassStorageInfo,
    data: SampleBankData,
    parameters?: { bankId?: string; bankPath?: string }
  ): Promise<boolean> {
    try {
      const importPath = path.join(massStorageInfo.path, "IMPORT");
      await fs.promises.mkdir(importPath, { recursive: true });
      if (parameters?.bankPath) {
        const bankName = parameters.bankId
          ? `BANK_${parameters.bankId.toUpperCase()}`
          : path.basename(parameters.bankPath);
        const destPath = path.join(importPath, bankName);
        await this.copyDirectory(parameters.bankPath, destPath);
      } else {
        const bankDir = path.join(importPath, `BANK_${data.bankId.toUpperCase()}`);
        await fs.promises.mkdir(bankDir, { recursive: true });
        for (const sample of data.samples) {
          const destPath = path.join(bankDir, sample.name);
          await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
          await fs.promises.copyFile(sample.path, destPath);
        }
      }
      return true;
    } catch (error) {
      this.logger.error("Failed to write samples", undefined, error as Error);
      return false;
    }
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.promises.mkdir(dest, { recursive: true });
    const files = await fs.promises.readdir(src);
    for (const file of files) {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      const stat = await fs.promises.stat(srcPath);
      if (stat.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }
  }
}
