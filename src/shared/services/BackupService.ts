import * as fs from "fs/promises";
import * as path from "path";
import {
  BackupResult,
  RestoreResult,
  BackupType,
  OperationStatus,
} from "../types/index";
import { FileSystemService } from "./FileSystemService";
import { ModeService } from "./ModeService";
import { P6Device } from "../models/P6Device";
import { BACKUP_CONSTANTS, ERROR_MESSAGES } from "../constants";
import { createComponentLogger } from "./Logger";

export class BackupService {
  private fileSystemService: FileSystemService;
  private modeService: ModeService;
  private p6Device: P6Device;
  private logger = createComponentLogger("BackupService");

  constructor(fileSystemService?: FileSystemService) {
    this.fileSystemService = fileSystemService || new FileSystemService();
    this.p6Device = new P6Device();
    this.modeService = new ModeService(this.p6Device);
  }

  async backupPatterns(customName?: string): Promise<BackupResult> {
    try {
      // Check device connection with retry for robustness
      let deviceStatus = this.p6Device.getStatus();
      if (!deviceStatus.connected) {
        this.logger.debug("Device not connected, checking readiness...");
        // Give the device a moment to update status and retry
        const isReady = await this.p6Device.isReady();
        if (!isReady) {
          throw new Error("P6 device not connected");
        }
        // Re-fetch status after readiness check
        deviceStatus = this.p6Device.getStatus();
        this.logger.debug("Device status after readiness check:", deviceStatus);
      }

      // Check if mode switching is required
      const modeRequirement =
        this.modeService.getOperationModeRequirement("pattern backup");
      if (modeRequirement) {
        throw new Error(
          `Device must be in ${modeRequirement.requiredMode} mode for pattern backup. Current mode: ${modeRequirement.currentMode}. Please switch device mode and try again.`
        );
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupDir = await this.createBackupDirectory(
        "patterns",
        timestamp,
        customName
      );

      // Check device mode and backup accordingly
      const patterns = await this.readPatternsFromDevice();

      // Create Patterns folder
      const patternsDir = path.join(backupDir, "Patterns");
      await fs.mkdir(patternsDir, { recursive: true });

      // Save patterns.json in Patterns folder
      const backupPath = path.join(patternsDir, "patterns.json");
      await fs.writeFile(backupPath, JSON.stringify(patterns, null, 2));

      // Copy pattern files to Patterns folder
      await this.copyPatternFiles(patterns, patternsDir);

      return {
        success: true,
        backupPath: backupDir,
        type: BackupType.PATTERNS,
        timestamp: new Date(),
        itemCount: patterns.length,
        message: `Successfully backed up ${patterns.length} patterns`,
      };
    } catch (error) {
      return {
        success: false,
        backupPath: "",
        type: BackupType.PATTERNS,
        timestamp: new Date(),
        itemCount: 0,
        message: `Pattern backup failed: ${error}`,
      };
    }
  }

  async backupSamples(
    bankId?: string,
    customName?: string
  ): Promise<BackupResult> {
    try {
      // Check device connection with retry for robustness
      let deviceStatus = this.p6Device.getStatus();
      if (!deviceStatus.connected) {
        this.logger.debug("Device not connected, checking readiness...");
        // Give the device a moment to update status and retry
        const isReady = await this.p6Device.isReady();
        if (!isReady) {
          throw new Error("P6 device not connected");
        }
        // Re-fetch status after readiness check
        deviceStatus = this.p6Device.getStatus();
        this.logger.debug("Device status after readiness check:", deviceStatus);
      }

      // Check if mode switching is required
      const modeRequirement =
        this.modeService.getOperationModeRequirement("sample backup");
      if (modeRequirement) {
        throw new Error(
          `Device must be in ${modeRequirement.requiredMode} mode for sample backup. Current mode: ${modeRequirement.currentMode}. Please switch device mode and try again.`
        );
      }

      // Add bank validation for specific bank backup when device is in any sample mode
      if (bankId) {
        const currentMode = deviceStatus.mode;
        const sampleModes = ["sample", "sample_export", "sample_import"];

        if (sampleModes.includes(currentMode)) {
          try {
            // Get current bank information from device
            const deviceCurrentBank = await this.p6Device.getCurrentBank();
            const availableBanks = await this.p6Device.getCurrentBanks();

            this.logger.debug(
              `BackupService.backupSamples: Target bank: ${bankId.toUpperCase()}, Device bank: ${deviceCurrentBank}, Available: ${availableBanks?.join(
                ", "
              )}`
            );

            if (
              deviceCurrentBank &&
              deviceCurrentBank.toLowerCase() !== bankId.toLowerCase()
            ) {
              throw new Error(
                ERROR_MESSAGES.COMBINED_BACKUP_WRONG_BANK(
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
                ERROR_MESSAGES.COMBINED_BACKUP_BANK_NOT_AVAILABLE(
                  bankId,
                  availableBanks
                )
              );
            }
          } catch (error: any) {
            // If bank checking fails, show a warning but allow user to proceed for non-critical errors
            if (
              error.message.includes("not available") ||
              error.message.includes("currently set to bank")
            ) {
              throw error; // Re-throw bank mismatch errors
            }
            this.logger.warn("Could not verify bank selection", {
              error: error.message,
            });
            // Continue with backup for other errors
          }
        }
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupType = bankId ? `samples-bank-${bankId}` : "samples-all";
      const backupDir = await this.createBackupDirectory(
        backupType,
        timestamp,
        customName
      );

      let samples;
      let itemCount = 0;

      if (bankId) {
        // Backup specific bank
        samples = await this.readSamplesFromBank(bankId);
        this.logger.debug(`backupSamples: read samples from bank ${bankId}`, {
          type: typeof samples,
          isArray: Array.isArray(samples) ? "array" : "not array",
        });

        // Calculate item count based on the format of samples
        if (Array.isArray(samples)) {
          // Direct array format
          itemCount = samples.length;
          this.logger.debug(
            `Found ${itemCount} samples (array) in bank ${bankId}`
          );
        } else if (samples && typeof samples === "object") {
          // Object format with bank as key
          const bankKey = Object.keys(samples).find(
            (key) => key.toLowerCase() === bankId.toLowerCase()
          );

          if (bankKey && Array.isArray(samples[bankKey])) {
            itemCount = samples[bankKey].length;
            this.logger.debug(
              `Found ${itemCount} samples (object[${bankKey}]) in bank ${bankId}`
            );
          } else {
            this.logger.warn(`Bank ${bankId} samples format unexpected`, {
              keys: Object.keys(samples),
            });
          }
        } else {
          this.logger.warn(`Unexpected samples type: ${typeof samples}`);
        }
      } else {
        // Backup all banks
        samples = await this.readAllSamples();

        // Calculate total samples across all banks
        if (samples && typeof samples === "object" && !Array.isArray(samples)) {
          // Handle normal object format with bank keys
          itemCount = Object.entries(samples).reduce(
            (total, [bank, bankSamples]) => {
              if (Array.isArray(bankSamples)) {
                return total + bankSamples.length;
              }
              return total;
            },
            0
          );
          this.logger.debug(`Found ${itemCount} samples across all banks`);
        } else {
          this.logger.warn("All banks read returned unexpected format", {
            type: typeof samples,
            isArray: Array.isArray(samples) ? "array" : "not array",
          });
        }
      }

      const backupPath = path.join(backupDir, "samples.json");
      await fs.writeFile(backupPath, JSON.stringify(samples, null, 2));

      // Copy sample files - copySampleFiles now handles different data formats
      await this.copySampleFiles(samples, backupDir, bankId);

      return {
        success: true,
        backupPath: backupDir,
        type: bankId ? BackupType.SAMPLES_BANK : BackupType.SAMPLES_ALL,
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
        type: bankId ? BackupType.SAMPLES_BANK : BackupType.SAMPLES_ALL,
        timestamp: new Date(),
        itemCount: 0,
        message: `Sample backup failed: ${error}`,
      };
    }
  }

  async combinedBackup(options: {
    includePatterns?: boolean;
    includeSamples?: boolean;
    bankIds?: string[];
    customName?: string;
  }): Promise<BackupResult> {
    this.logger.debug(
      "BackupService.combinedBackup called with options:",
      options
    );
    try {
      // Check device connection with retry for robustness
      let deviceStatus = this.p6Device.getStatus();
      if (!deviceStatus.connected) {
        this.logger.debug("Device not connected, checking readiness...");
        // Give the device a moment to update status and retry
        const isReady = await this.p6Device.isReady();
        if (!isReady) {
          throw new Error("P6 device not connected");
        }
        // Re-fetch status after readiness check
        deviceStatus = this.p6Device.getStatus();
        this.logger.debug("Device status after readiness check:", deviceStatus);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupType = this.determineCombinedBackupType(options);
      const backupDir = await this.createBackupDirectory(
        backupType,
        timestamp,
        options.customName
      );

      let totalItemCount = 0;
      const results: any[] = [];
      const messages: string[] = [];

      // Backup patterns if requested
      if (options.includePatterns) {
        try {
          const patterns = await this.readPatternsFromDevice();
          const patternsPath = path.join(backupDir, "patterns.json");
          await fs.writeFile(patternsPath, JSON.stringify(patterns, null, 2));
          await this.copyPatternFiles(patterns, backupDir);

          totalItemCount += patterns.length;
          results.push({ type: "patterns", itemCount: patterns.length });
          messages.push(`${patterns.length} patterns`);
        } catch (error) {
          throw new Error(`Pattern backup failed: ${error}`);
        }
      }

      // Backup samples if requested
      if (options.includeSamples) {
        try {
          if (options.bankIds && options.bankIds.length > 0) {
            // Backup specific banks
            let bankItemCount = 0;
            const allBankSamples: Record<string, any[]> = {};

            for (const bankId of options.bankIds) {
              const bankSamples = await this.readSamplesFromBank(bankId);
              allBankSamples[bankId] = Array.isArray(bankSamples)
                ? bankSamples
                : bankSamples[bankId] || [];
              bankItemCount += allBankSamples[bankId].length;
            }

            const samplesPath = path.join(backupDir, "samples.json");
            await fs.writeFile(
              samplesPath,
              JSON.stringify(allBankSamples, null, 2)
            );
            await this.copySampleFiles(allBankSamples, backupDir);

            totalItemCount += bankItemCount;
            results.push({
              type: "samples",
              banks: options.bankIds,
              itemCount: bankItemCount,
            });
            messages.push(
              `${bankItemCount} samples from banks ${options.bankIds
                .map((b) => b.toUpperCase())
                .join(", ")}`
            );
          } else {
            // Backup all samples
            const allSamples = await this.readAllSamples();
            const samplesDir = path.join(backupDir, "samples");
            await fs.mkdir(samplesDir, { recursive: true });

            const samplesPath = path.join(samplesDir, "samples.json");
            await fs.writeFile(
              samplesPath,
              JSON.stringify(allSamples, null, 2)
            );
            await this.copySampleFiles(allSamples, samplesDir);

            const sampleCount = Object.values(allSamples).reduce(
              (total, bankSamples) =>
                total + (Array.isArray(bankSamples) ? bankSamples.length : 0),
              0
            );

            totalItemCount += sampleCount;
            results.push({ type: "samples", itemCount: sampleCount });
            messages.push(`${sampleCount} samples from all banks`);
          }
        } catch (error) {
          throw new Error(`Sample backup failed: ${error}`);
        }
      }

      // Create backup manifest
      const manifest = {
        type: "combined",
        timestamp: new Date(),
        device: deviceStatus,
        options,
        results,
        totalItemCount,
      };

      await fs.writeFile(
        path.join(backupDir, "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );

      return {
        success: true,
        backupPath: backupDir,
        type: this.getBackupTypeEnum(backupType),
        timestamp: new Date(),
        itemCount: totalItemCount,
        message: `Combined backup completed: ${messages.join(", ")}`,
      };
    } catch (error) {
      return {
        success: false,
        backupPath: "",
        type: BackupType.FULL,
        timestamp: new Date(),
        itemCount: 0,
        message: `Combined backup failed: ${error}`,
      };
    }
  }

  // Utility: check if file or directory exists
  private async exists(pathToCheck: string): Promise<boolean> {
    try {
      await fs.access(pathToCheck);
      return true;
    } catch {
      return false;
    }
  }

  private async copyPatternsToCombined(
    completedResult: any,
    backupDir: string
  ) {
    // Copy patterns.json to root
    const sourcePatternsJson = path.join(
      completedResult.result.backupPath,
      "Patterns",
      "patterns.json"
    );
    const destPatternsJson = path.join(backupDir, "patterns.json");
    if (await this.exists(sourcePatternsJson)) {
      await this.fileSystemService.copyFile(
        sourcePatternsJson,
        destPatternsJson
      );
    }
    // Copy pattern files to unified files directory
    const sourcePatternsDir = path.join(
      completedResult.result.backupPath,
      "Patterns"
    );
    const destFilesDir = path.join(backupDir, "files");
    if (await this.exists(sourcePatternsDir)) {
      await fs.mkdir(destFilesDir, { recursive: true });
      const sourceFiles = await fs.readdir(sourcePatternsDir);
      await Promise.all(
        sourceFiles
          .filter((file) => file !== "patterns.json")
          .map(async (file) => {
            const sourceFile = path.join(sourcePatternsDir, file);
            const destFile = path.join(destFilesDir, file);
            await this.fileSystemService.copyFile(sourceFile, destFile);
          })
      );
    }
  }

  private async copySamplesToCombined(
    completedResult: any,
    backupDir: string,
    logger: any
  ) {
    // Merge samples.json
    const existingSamplesPath = path.join(backupDir, "samples.json");
    let combinedSamples: Record<string, any[]> = {};
    if (await this.exists(existingSamplesPath)) {
      try {
        const existingData = await fs.readFile(existingSamplesPath, "utf-8");
        combinedSamples = JSON.parse(existingData);
      } catch (error) {
        logger.warn("Failed to read existing samples.json", { error });
      }
    }
    const bankSamplesPath = path.join(
      completedResult.result.backupPath,
      "samples.json"
    );
    if (await this.exists(bankSamplesPath)) {
      try {
        const bankData = await fs.readFile(bankSamplesPath, "utf-8");
        const bankSamples = JSON.parse(bankData);
        Object.assign(combinedSamples, bankSamples);
        await fs.writeFile(
          existingSamplesPath,
          JSON.stringify(combinedSamples, null, 2)
        );
      } catch (error) {
        logger.warn(
          `Failed to merge samples from bank ${completedResult.bank}`,
          { error }
        );
      }
    }
    // Copy sample files
    const sourceFilesDir = path.join(
      completedResult.result.backupPath,
      "files"
    );
    const destFilesDir = path.join(backupDir, "files");
    if (await this.exists(sourceFilesDir)) {
      await fs.mkdir(destFilesDir, { recursive: true });
      const sourceBankDir = path.join(
        sourceFilesDir,
        `BANK_${completedResult.bank.toUpperCase()}`
      );
      const destBankDir = path.join(
        destFilesDir,
        `BANK_${completedResult.bank.toUpperCase()}`
      );
      if (await this.exists(sourceBankDir)) {
        await this.fileSystemService.copyDirectory(sourceBankDir, destBankDir);
      }
    }
  }

  async organizeCombinedBackup(options: {
    includePatterns?: boolean;
    includeSamples?: boolean;
    bankIds?: string[];
    precompletedResults?: any[];
    customName?: string;
  }): Promise<BackupResult> {
    try {
      // Check device connection with retry for robustness
      let deviceStatus = this.p6Device.getStatus();
      if (!deviceStatus.connected) {
        this.logger.debug("Device not connected, checking readiness...");
        // Give the device a moment to update status and retry
        const isReady = await this.p6Device.isReady();
        if (!isReady) throw new Error("P6 device not connected");
        deviceStatus = this.p6Device.getStatus();
        this.logger.debug("Device status after readiness check:", deviceStatus);
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupType = this.determineCombinedBackupType(options);
      const backupDir = await this.createBackupDirectory(
        backupType,
        timestamp,
        options.customName
      );
      let totalItemCount = 0;
      const results: any[] = [];
      const messages: string[] = [];
      // Process the precompleted results and organize them into the combined backup
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
            await this.copySamplesToCombined(
              completedResult,
              backupDir,
              this.logger
            );
            totalItemCount += completedResult.result.itemCount;
            results.push({
              type: "samples",
              bank: completedResult.bank,
              itemCount: completedResult.result.itemCount,
            });
            messages.push(
              `${
                completedResult.result.itemCount
              } samples from bank ${completedResult.bank.toUpperCase()}`
            );
          }
        }
      }
      // Create backup manifest
      const manifest = {
        type: "combined",
        timestamp: new Date(),
        device: deviceStatus,
        options,
        results,
        totalItemCount,
      };
      await fs.writeFile(
        path.join(backupDir, "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );
      return {
        success: true,
        backupPath: backupDir,
        type: this.getBackupTypeEnum(backupType),
        timestamp: new Date(),
        itemCount: totalItemCount,
        message: `Combined backup completed: ${messages.join(", ")}`,
      };
    } catch (error) {
      return {
        success: false,
        backupPath: "",
        type: BackupType.FULL,
        timestamp: new Date(),
        itemCount: 0,
        message: `Combined backup organization failed: ${error}`,
      };
    }
  }

  private determineCombinedBackupType(options: {
    includePatterns?: boolean;
    includeSamples?: boolean;
    bankIds?: string[];
  }): string {
    const parts: string[] = [];

    if (options.includePatterns) {
      parts.push("patterns");
    }

    if (options.includeSamples) {
      if (options.bankIds && options.bankIds.length > 0) {
        if (options.bankIds.length === 1) {
          parts.push(`samples-bank-${options.bankIds[0]}`);
        } else {
          parts.push(`samples-banks-${options.bankIds.join("-")}`);
        }
      } else {
        parts.push("samples-all");
      }
    }

    return parts.length > 1
      ? `combined-${parts.join("-")}`
      : parts[0] || "backup";
  }

  private getBackupTypeEnum(backupType: string): BackupType {
    if (backupType.includes("patterns") && backupType.includes("samples")) {
      return BackupType.FULL;
    } else if (backupType.includes("patterns")) {
      return BackupType.PATTERNS;
    } else if (backupType.includes("samples-bank")) {
      return BackupType.SAMPLES_BANK;
    } else if (backupType.includes("samples")) {
      return BackupType.SAMPLES_ALL;
    }
    return BackupType.FULL;
  }

  async fullBackup(customName?: string): Promise<BackupResult> {
    try {
      // Check device connection with retry for robustness
      let deviceStatus = this.p6Device.getStatus();
      if (!deviceStatus.connected) {
        this.logger.debug("Device not connected, checking readiness...");
        // Give the device a moment to update status and retry
        const isReady = await this.p6Device.isReady();
        if (!isReady) {
          throw new Error("P6 device not connected");
        }
        // Re-fetch status after readiness check
        deviceStatus = this.p6Device.getStatus();
        this.logger.debug("Device status after readiness check:", deviceStatus);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupDir = await this.createBackupDirectory(
        "full",
        timestamp,
        customName
      );

      // Note: Full backup requires sequential mode switching
      // This method will throw mode requirement errors that should be handled by the UI
      // The UI should coordinate mode switches between pattern and sample backups

      // Backup patterns - will check mode requirement and throw error if wrong mode
      const patternsResult = await this.backupPatterns();
      if (!patternsResult.success) {
        throw new Error(`Pattern backup failed: ${patternsResult.message}`);
      }

      // Backup all samples - will check mode requirement and throw error if wrong mode
      const samplesResult = await this.backupSamples();
      if (!samplesResult.success) {
        throw new Error(`Sample backup failed: ${samplesResult.message}`);
      }

      // Copy results to full backup directory
      await this.fileSystemService.copyDirectory(
        patternsResult.backupPath,
        path.join(backupDir, "patterns")
      );
      await this.fileSystemService.copyDirectory(
        samplesResult.backupPath,
        path.join(backupDir, "samples")
      );

      // Create backup manifest
      const manifest = {
        type: "full",
        timestamp: new Date(),
        device: deviceStatus,
        patterns: patternsResult,
        samples: samplesResult,
      };

      await fs.writeFile(
        path.join(backupDir, "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );

      return {
        success: true,
        backupPath: backupDir,
        type: BackupType.FULL,
        timestamp: new Date(),
        itemCount: patternsResult.itemCount + samplesResult.itemCount,
        message: `Full backup completed successfully`,
      };
    } catch (error) {
      return {
        success: false,
        backupPath: "",
        type: BackupType.FULL,
        timestamp: new Date(),
        itemCount: 0,
        message: `Full backup failed: ${error}`,
      };
    }
  }

  async restorePatterns(backupPath: string): Promise<RestoreResult> {
    try {
      // Check device connection with retry for robustness
      let deviceStatus = this.p6Device.getStatus();
      if (!deviceStatus.connected) {
        this.logger.debug("Device not connected, checking readiness...");
        // Give the device a moment to update status and retry
        const isReady = await this.p6Device.isReady();
        if (!isReady) {
          throw new Error("P6 device not connected");
        }
        // Re-fetch status after readiness check
        deviceStatus = this.p6Device.getStatus();
        this.logger.debug("Device status after readiness check:", deviceStatus);
      }

      // Check if mode switching is required
      const modeRequirement =
        this.modeService.getOperationModeRequirement("pattern restore");
      if (modeRequirement) {
        throw new Error(
          `Device must be in ${modeRequirement.requiredMode} mode for pattern restore. Current mode: ${modeRequirement.currentMode}. Please switch device mode and try again.`
        );
      }

      const patternsFile = path.join(backupPath, "patterns.json");
      const patternsData = await fs.readFile(patternsFile, "utf-8");
      const patterns = JSON.parse(patternsData);

      // Restore patterns to device
      await this.writePatternsToDevice(patterns);

      return {
        success: true,
        type: BackupType.PATTERNS,
        itemCount: patterns.length,
        message: `Successfully restored ${patterns.length} patterns`,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        type: BackupType.PATTERNS,
        itemCount: 0,
        message: `Pattern restore failed: ${error}`,
        timestamp: new Date(),
      };
    }
  }

  async restoreSamples(
    backupPath: string,
    bankId?: string
  ): Promise<RestoreResult> {
    try {
      // Check device connection with retry for robustness
      let deviceStatus = this.p6Device.getStatus();
      if (!deviceStatus.connected) {
        this.logger.debug("Device not connected, checking readiness...");
        // Give the device a moment to update status and retry
        const isReady = await this.p6Device.isReady();
        if (!isReady) {
          throw new Error("P6 device not connected");
        }
        // Re-fetch status after readiness check
        deviceStatus = this.p6Device.getStatus();
        this.logger.debug("Device status after readiness check:", deviceStatus);
      }

      // Check if mode switching is required
      const modeRequirement =
        this.modeService.getOperationModeRequirement("sample restore");
      if (modeRequirement) {
        throw new Error(
          `Device must be in ${modeRequirement.requiredMode} mode for sample restore. Current mode: ${modeRequirement.currentMode}. Please switch device mode and try again.`
        );
      }

      const samplesFile = path.join(backupPath, "samples.json");
      const samplesData = await fs.readFile(samplesFile, "utf-8");
      const samples = JSON.parse(samplesData);

      let itemCount = 0;
      let message = "";

      if (bankId) {
        // Restore specific bank
        if (!samples[bankId]) {
          throw new Error(`Bank ${bankId.toUpperCase()} not found in backup`);
        }
        await this.writeSamplesToBank(samples[bankId], bankId);
        itemCount = samples[bankId].length;
        message = `Successfully restored bank ${bankId.toUpperCase()} (${itemCount} samples)`;
      } else {
        // Restore all banks
        for (const [bank, bankSamples] of Object.entries(samples)) {
          await this.writeSamplesToBank(bankSamples as any[], bank);
          itemCount += (bankSamples as any[]).length;
        }
        message = `Successfully restored all sample banks (${itemCount} samples)`;
      }

      return {
        success: true,
        type: bankId ? BackupType.SAMPLES_BANK : BackupType.SAMPLES_ALL,
        itemCount,
        message,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        type: bankId ? BackupType.SAMPLES_BANK : BackupType.SAMPLES_ALL,
        itemCount: 0,
        message: `Sample restore failed: ${error}`,
        timestamp: new Date(),
      };
    }
  }

  private async createBackupDirectory(
    type: string,
    timestamp: string,
    customName?: string
  ): Promise<string> {
    const baseDir = await this.fileSystemService.getDefaultBackupPath();
    let dirName: string;

    if (customName) {
      // Sanitize custom name - remove invalid characters for file paths
      const sanitizedName = customName.replace(/[<>:"/\\|?*]/g, "_").trim();
      if (sanitizedName.length === 0) {
        // Fall back to timestamp if custom name is empty after sanitization
        dirName = `${type}-${timestamp}`;
      } else {
        // Use custom name with timestamp as suffix to ensure uniqueness
        dirName = `${sanitizedName}-${timestamp}`;
      }
    } else {
      // Default behavior - use type and timestamp
      dirName = `${type}-${timestamp}`;
    }

    const backupDir = path.join(baseDir, dirName);
    await fs.mkdir(backupDir, { recursive: true });
    return backupDir;
  }

  private async readPatternsFromDevice(): Promise<any[]> {
    try {
      // Use P6Device to read actual pattern data from the device
      const patterns = await this.p6Device.readData("patterns");
      return patterns || [];
    } catch (error) {
      this.logger.error("Failed to read patterns from device", { error });
      throw new Error(`Could not read patterns from device: ${error}`);
    }
  }

  private async readSamplesFromBank(bankId: string): Promise<any> {
    try {
      // Use P6Device to read actual sample data from the specified bank
      const result = await this.p6Device.readData("samples", { bankId });

      this.logger.debug(`readSamplesFromBank ${bankId} result`, {
        type: typeof result,
        isArray: Array.isArray(result) ? "array" : "not array",
      });

      // Return the result exactly as provided by P6Device
      // This preserves the original format which could be either:
      // 1. { bankId: samples[] } - when P6Device returns object with bank as key
      // 2. samples[] - if P6Device directly returns array of samples
      return result || { [bankId.toLowerCase()]: [] };
    } catch (error) {
      this.logger.error(`Failed to read samples from bank ${bankId}`, {
        bankId,
        error,
      });
      throw new Error(`Could not read samples from bank ${bankId}: ${error}`);
    }
  }

  private async readAllSamples(): Promise<Record<string, any[]>> {
    try {
      // Use P6Device to read all sample data from all banks
      const allSamples = await this.p6Device.readData("samples");
      return allSamples || {};
    } catch (error) {
      this.logger.error("Failed to read all samples", { error });
      throw new Error(`Could not read all samples: ${error}`);
    }
  }

  private async copyPatternFiles(
    patterns: any[],
    patternsDir: string
  ): Promise<void> {
    // Copy actual pattern files directly to the Patterns directory
    for (const pattern of patterns) {
      if (pattern.path) {
        const fileName = path.basename(pattern.path);
        const destPath = path.join(patternsDir, fileName);

        try {
          await this.fileSystemService.copyFile(pattern.path, destPath);
        } catch (error) {
          this.logger.warn(`Failed to copy pattern file ${pattern.name}`, {
            patternName: pattern.name,
            error,
          });
          // If we can't copy the file, save pattern metadata at least
          const metadataPath = path.join(
            patternsDir,
            `${pattern.name}_metadata.json`
          );
          await fs.writeFile(metadataPath, JSON.stringify(pattern, null, 2));
        }
      }
    }
  }

  private async copySampleFiles(
    samples: any,
    backupDir: string,
    bankId?: string
  ): Promise<void> {
    const filesDir = path.join(backupDir, "files");
    await fs.mkdir(filesDir, { recursive: true });

    this.logger.debug("copySampleFiles - input samples", {
      type: typeof samples,
      isArray: Array.isArray(samples) ? "array" : "not array",
      isNull: samples ? "non-null" : "null",
    });

    if (bankId) {
      // Copy samples from specific bank
      const bankDir = path.join(filesDir, `BANK_${bankId.toUpperCase()}`);
      await fs.mkdir(bankDir, { recursive: true });

      // Handle different sample formats from readSamplesFromBank
      if (Array.isArray(samples)) {
        // Directly use the array
        this.logger.debug(
          `Copying ${samples.length} samples as array from bank ${bankId}`
        );
        for (const sample of samples) {
          await this.copySampleFilesFromPad(sample, bankDir);
        }
      } else if (samples && typeof samples === "object") {
        // Check if it's the { bankId: samples[] } format
        const bankKey = Object.keys(samples).find(
          (key) => key.toLowerCase() === bankId.toLowerCase()
        );

        if (bankKey && Array.isArray(samples[bankKey])) {
          this.logger.debug(
            `Copying ${samples[bankKey].length} samples from object[${bankKey}]`
          );
          for (const sample of samples[bankKey]) {
            await this.copySampleFilesFromPad(sample, bankDir);
          }
        } else {
          this.logger.warn(
            `Expected samples[${bankId}] to be an array, but it's not`,
            {
              bankId,
              sampleStructure: Object.keys(samples),
            }
          );
        }
      } else {
        this.logger.warn(
          `Expected samples to be an array or object, but got: ${typeof samples}`
        );
      }
    } else {
      // Copy samples from all banks
      if (samples && typeof samples === "object") {
        if (Array.isArray(samples)) {
          // If it's an array but no bankId specified, we need to handle this case
          this.logger.warn(
            `Got an array of samples but no bankId specified. Using 'unknown' as bank.`
          );
          const bankDir = path.join(filesDir, "BANK_UNKNOWN");
          await fs.mkdir(bankDir, { recursive: true });
          for (const sample of samples) {
            await this.copySampleFilesFromPad(sample, bankDir);
          }
        } else {
          // Normal case - iterate through bank objects
          for (const [bank, bankSamples] of Object.entries(samples)) {
            const bankDir = path.join(filesDir, `BANK_${bank.toUpperCase()}`);
            await fs.mkdir(bankDir, { recursive: true });

            if (Array.isArray(bankSamples)) {
              this.logger.debug(
                `Copying ${bankSamples.length} samples from bank ${bank}`
              );
              for (const sample of bankSamples) {
                await this.copySampleFilesFromPad(sample, bankDir);
              }
            } else {
              this.logger.warn(
                `Expected bankSamples to be an array, but got: ${typeof bankSamples}`
              );
            }
          }
        }
      } else {
        this.logger.warn(
          `Expected samples to be an object, but got: ${typeof samples}`
        );
      }
    }
  }

  private async copySampleFilesFromPad(
    sample: any,
    bankDir: string
  ): Promise<void> {
    if (!sample) {
      this.logger.warn("Skipping null/undefined sample");
      return;
    }

    try {
      // Log sample data for debugging
      this.logger.debug(`Processing sample:`, {
        pad: sample.pad,
        name: sample.name,
        prmFile: sample.prmFile ? "exists" : "missing",
        wavFile: sample.wavFile ? "exists" : "missing",
        path: sample.path ? "exists" : "missing",
      });

      // Create pad directory structure
      const padNumber = sample.pad || "unknown";
      const padFolderName = `PAD_${padNumber}`;
      const padDestDir = path.join(bankDir, padFolderName);
      await fs.mkdir(padDestDir, { recursive: true });

      // Copy PRM file if it exists
      if (sample.prmFile) {
        try {
          // Check if the path is a file first
          const prmStats = await fs.stat(sample.prmFile);
          if (prmStats.isFile()) {
            const prmDestPath = path.join(
              padDestDir,
              path.basename(sample.prmFile)
            );
            await this.fileSystemService.copyFile(sample.prmFile, prmDestPath);
            this.logger.debug(
              `Copied PRM file: ${path.basename(sample.prmFile)}`
            );
          } else {
            this.logger.warn(`PRM path is not a file: ${sample.prmFile}`);
          }
        } catch (err) {
          this.logger.warn(`Error copying PRM file: ${err}`);
        }
      }

      // Copy WAV file if it exists
      if (sample.wavFile) {
        try {
          // Check if the path is a file first
          const wavStats = await fs.stat(sample.wavFile);
          if (wavStats.isFile()) {
            const wavDestPath = path.join(
              padDestDir,
              path.basename(sample.wavFile)
            );
            await this.fileSystemService.copyFile(sample.wavFile, wavDestPath);
            this.logger.debug(
              `Copied WAV file: ${path.basename(sample.wavFile)}`
            );
          } else {
            this.logger.warn(`WAV path is not a file: ${sample.wavFile}`);
          }
        } catch (err) {
          this.logger.warn(`Error copying WAV file: ${err}`);
        }
      }

      // If there's a path property but no specific file types, try to copy that
      if (sample.path && !sample.prmFile && !sample.wavFile) {
        try {
          const stats = await fs.stat(sample.path);
          if (stats.isFile()) {
            const destPath = path.join(padDestDir, path.basename(sample.path));
            await this.fileSystemService.copyFile(sample.path, destPath);
            this.logger.debug(
              `Copied file from path: ${path.basename(sample.path)}`
            );
          } else {
            this.logger.warn(`Path is not a file: ${sample.path}`);
          }
        } catch (err) {
          this.logger.warn(`Error copying from path: ${err}`);
        }
      }

      // Create a metadata file with sample info even if no files were copied
      const metadataPath = path.join(padDestDir, "metadata.json");
      await fs.writeFile(metadataPath, JSON.stringify(sample, null, 2));

      this.logger.debug(
        `Successfully processed sample ${
          sample.name || "unnamed"
        } from pad ${padNumber}`
      );
    } catch (error) {
      this.logger.warn(`Failed to process sample`, {
        sample: sample.name || "unnamed",
        error,
      });
    }
  }

  private async writePatternsToDevice(patterns: any[]): Promise<void> {
    try {
      // Use P6Device to write patterns to the device
      const success = await this.p6Device.writeData("patterns", patterns);
      if (!success) {
        throw new Error("Failed to write patterns to device");
      }
      this.logger.debug(
        `Successfully wrote ${patterns.length} patterns to device`
      );
    } catch (error) {
      this.logger.error(
        "Failed to write patterns to device",
        undefined,
        error as Error
      );
      throw new Error(`Could not write patterns to device: ${error}`);
    }
  }

  private async writeSamplesToBank(
    samples: any[],
    bankId: string
  ): Promise<void> {
    try {
      // Use P6Device to write samples to the specified bank
      const success = await this.p6Device.writeData("samples", samples, {
        bankId,
      });
      if (!success) {
        throw new Error(`Failed to write samples to bank ${bankId}`);
      }
      this.logger.debug(
        `Successfully wrote ${
          samples.length
        } samples to bank ${bankId.toUpperCase()}`
      );
    } catch (error) {
      this.logger.error(`Failed to write samples to bank ${bankId}`, {
        bankId,
        error,
      });
      throw new Error(`Could not write samples to bank ${bankId}: ${error}`);
    }
  }
}
