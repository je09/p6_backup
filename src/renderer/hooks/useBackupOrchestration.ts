import { useCallback, useRef, useState } from "react";
import { DeviceStatus, BackupResult, BackupStageResult } from "../../shared/types/index";
import { ERROR_MESSAGES, isPatternMode, isSampleMode } from "../../shared/constants";
import { createComponentLogger } from "../utils/logger";

type ComponentLogger = ReturnType<typeof createComponentLogger>;

export type BackupMode = "patterns" | "samples";

interface UseBackupOrchestrationProps {
  deviceStatus: DeviceStatus;
  onBackupComplete: (result: BackupResult) => void;
  showSnackbar: (
    message: string,
    type: "success" | "error" | "warning" | "info"
  ) => void;
  log: ComponentLogger;
}

/** What a run was asked to back up. Fixed at start, so it survives re-renders. */
interface BackupRequest {
  customName?: string;
  banks: string[];
  patternIds: string[];
  /** Pads to keep per bank, keyed by upper-case bank letter. */
  bankPads: Record<string, number[]>;
}

const EMPTY_REQUEST: BackupRequest = {
  customName: undefined,
  banks: [],
  patternIds: [],
  bankPads: {},
};

/**
 * Drives a backup across the device sessions it takes to finish.
 *
 * The P-6 exposes one thing at a time — patterns, or one bank of samples — so a
 * run is a queue the user power-cycles through, one stage per "Continue". Each
 * stage leaves a staging backup behind; the last one gathers them.
 */
export function useBackupOrchestration({
  deviceStatus,
  onBackupComplete,
  showSnackbar,
  log,
}: UseBackupOrchestrationProps) {
  const [backupProgress, setBackupProgress] = useState(0);
  const [currentOperation, setCurrentOperation] = useState("");
  const [showBackupGuide, setShowBackupGuide] = useState(false);
  const [bankQueue, setBankQueue] = useState<string[]>([]);
  const [currentBankIndex, setCurrentBankIndex] = useState(0);
  const [backupResults, setBackupResults] = useState<BackupStageResult[]>([]);
  const [backupMode, setBackupMode] = useState<BackupMode | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const request = useRef<BackupRequest>(EMPTY_REQUEST);

  const startBackup = useCallback(
    (
      banks: string[],
      initialMode: BackupMode,
      customName?: string,
      patternIds: string[] = [],
      bankPads: Record<string, number[]> = {}
    ) => {
      if (initialMode === "samples" && banks.length === 0) {
        showSnackbar("No banks selected for backup", "error");
        return;
      }

      request.current = { customName, banks, patternIds, bankPads };
      setBankQueue(banks);
      setCurrentBankIndex(0);
      setBackupResults([]);
      setBackupMode(initialMode);
      setCurrentOperation(
        initialMode === "patterns"
          ? "Please ensure device is in pattern mode, then continue..."
          : `Please switch to sample mode and select bank ${banks[0].toUpperCase()}, then continue...`
      );
      setShowBackupGuide(true);
    },
    [showSnackbar]
  );

  const resetOrchestrationState = useCallback(() => {
    request.current = EMPTY_REQUEST;
    setShowBackupGuide(false);
    setBankQueue([]);
    setCurrentBankIndex(0);
    setBackupResults([]);
    setBackupMode(null);
    setCurrentOperation("");
    setBackupProgress(0);
  }, []);

  const ejectDeviceWithFeedback = useCallback(
    async (successMsg: string, warnMsg: string) => {
      try {
        if (await window.electronAPI.ejectDevice()) {
          log.info(successMsg);
          showSnackbar("Device ejected", "success");
          setCurrentOperation(successMsg);
          return;
        }
        log.warn(warnMsg);
      } catch (error) {
        log.warn("Error during device ejection", { error });
      }
      showSnackbar("Device eject failed", "warning");
      setCurrentOperation(warnMsg);
    },
    [log, showSnackbar]
  );

  const completeBackup = useCallback(
    async (finalResults: BackupStageResult[]) => {
      try {
        setCurrentOperation("Organizing backup...");
        const finalResult = await window.electronAPI.organizeBackup({
          precompletedResults: finalResults,
          customName: request.current.customName,
        });
        setShowBackupGuide(false);
        setBackupProgress(100);
        onBackupComplete(finalResult);
        if (!finalResult.success) {
          showSnackbar(finalResult.message || "Backup failed", "error");
          return;
        }
        setCurrentOperation("Backup completed successfully");
        await ejectDeviceWithFeedback(
          "Backup completed successfully. Device ejected.",
          "Backup completed successfully. Manual device ejection required."
        );
      } catch (error) {
        setShowBackupGuide(false);
        showSnackbar(describe(error, "Failed to organize backup"), "error");
      }
    },
    [ejectDeviceWithFeedback, onBackupComplete, showSnackbar]
  );

  /**
   * The device exposes only the bank it is set to. Backing up while it is set
   * to another silently captures the wrong samples, so a mismatch is fatal —
   * but not being able to ask is only a warning.
   */
  const assertBankSelected = useCallback(
    async (targetBank: string) => {
      let deviceCurrentBank: string | null = null;
      let availableBanks: string[] | null = null;
      try {
        [deviceCurrentBank, availableBanks] = await Promise.all([
          window.electronAPI.getCurrentBank(),
          window.electronAPI.getCurrentBanks(),
        ]);
      } catch (error) {
        log.warn("Could not verify bank selection", { error });
        return;
      }

      const matches = (bank: string) =>
        bank.toLowerCase() === targetBank.toLowerCase();
      if (deviceCurrentBank && !matches(deviceCurrentBank))
        throw new Error(
          ERROR_MESSAGES.BACKUP_WRONG_BANK(deviceCurrentBank, targetBank)
        );
      if (availableBanks && !availableBanks.some(matches))
        throw new Error(
          ERROR_MESSAGES.BACKUP_BANK_NOT_AVAILABLE(targetBank, availableBanks)
        );
    },
    [log]
  );

  const runPatternStage = useCallback(async (): Promise<BackupStageResult[]> => {
    if (!isPatternMode(deviceStatus.mode))
      throw new Error("Device must be in a pattern mode to back up patterns");

    setCurrentOperation("Backing up patterns...");
    const { patternIds, customName } = request.current;
    const result = await window.electronAPI.backupPatterns(
      customName,
      patternIds.length > 0 ? patternIds : undefined
    );
    if (!result.success)
      throw new Error(`Pattern backup failed: ${result.message}`);

    await ejectDeviceWithFeedback(
      "Device ejected successfully after pattern backup",
      "Failed to eject device after pattern backup"
    );
    return [{ type: "patterns", result }];
  }, [deviceStatus.mode, ejectDeviceWithFeedback]);

  const runSampleStage = useCallback(
    async (bank: string): Promise<BackupStageResult[]> => {
      if (!isSampleMode(deviceStatus.mode))
        throw new Error("Device must be in a sample mode to back up samples");
      await assertBankSelected(bank);

      setCurrentOperation(`Backing up bank ${bank.toUpperCase()}...`);
      const result = await window.electronAPI.backupSamples(
        bank,
        undefined,
        request.current.bankPads[bank.toUpperCase()]
      );
      if (!result.success)
        throw new Error(
          `Sample backup for bank ${bank} failed: ${result.message}`
        );

      await ejectDeviceWithFeedback(
        `Device ejected successfully after backing up bank ${bank}`,
        `Failed to eject device after backing up bank ${bank}`
      );
      return [{ type: "samples", bank, result }];
    },
    [assertBankSelected, deviceStatus.mode, ejectDeviceWithFeedback]
  );

  /** Run the stage the guide is currently showing, then queue up the next. */
  const handleContinue = useCallback(async () => {
    if (!backupMode) return;
    setIsBackingUp(true);
    try {
      if (!deviceStatus.connected) throw new Error("Device disconnected");

      const isPatterns = backupMode === "patterns";
      const bank = bankQueue[currentBankIndex];
      if (!isPatterns && !bank)
        throw new Error("Internal error: bank index out of range");

      const stageResults = isPatterns
        ? await runPatternStage()
        : await runSampleStage(bank);
      const updatedResults = [...backupResults, ...stageResults];
      setBackupResults(updatedResults);

      // Patterns come first; the banks follow, one session each.
      if (isPatterns && bankQueue.length > 0) {
        setBackupMode("samples");
        setCurrentOperation(
          `Patterns complete. Now please switch to sample mode and select bank ${bankQueue[0].toUpperCase()}, then continue...`
        );
        return;
      }
      if (!isPatterns && currentBankIndex + 1 < bankQueue.length) {
        setCurrentBankIndex(currentBankIndex + 1);
        setCurrentOperation(
          `Bank ${bank.toUpperCase()} complete. Now please select bank ${bankQueue[
            currentBankIndex + 1
          ].toUpperCase()}, then continue...`
        );
        return;
      }
      await completeBackup(updatedResults);
    } catch (error) {
      setShowBackupGuide(false);
      showSnackbar(describe(error, "Backup failed"), "error");
    } finally {
      setIsBackingUp(false);
    }
  }, [
    backupMode,
    backupResults,
    bankQueue,
    completeBackup,
    currentBankIndex,
    deviceStatus.connected,
    runPatternStage,
    runSampleStage,
    showSnackbar,
  ]);

  return {
    backupProgress,
    currentOperation,
    showBackupGuide,
    bankQueue,
    currentBankIndex,
    backupMode,
    isBackingUp,
    startBackup,
    handleContinue,
    handleCancel: resetOrchestrationState,
  };
}

function describe(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
