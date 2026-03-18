import { useState, useCallback, useRef } from "react";
import { DeviceStatus, BackupResult, BackupStageResult } from "../../shared/types/index";
import { createComponentLogger } from "../utils/logger";

type ComponentLogger = ReturnType<typeof createComponentLogger>;

interface UseBackupOrchestrationProps {
  deviceStatus: DeviceStatus;
  onBackupComplete: (result: BackupResult) => void;
  showSnackbar: (
    message: string,
    type: "success" | "error" | "warning" | "info",
    action?: { label: string; onClick: () => void }
  ) => void;
  log: ComponentLogger;
}

export function useBackupOrchestration({
  deviceStatus,
  onBackupComplete,
  showSnackbar,
  log,
}: UseBackupOrchestrationProps) {
  const [isBackupInProgress, setIsBackupInProgress] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [currentOperation, setCurrentOperation] = useState<string>("");
  const [showBackupGuide, setShowBackupGuide] = useState(false);
  const [bankQueue, setBankQueue] = useState<string[]>([]);
  const [currentBankIndex, setCurrentBankIndex] = useState(0);
  const [backupResults, setBackupResults] = useState<BackupStageResult[]>([]);
  const [backupMode, setBackupMode] = useState<"patterns" | "samples" | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // Refs for values needed in callbacks without causing stale closures
  const customNameRef = useRef<string | undefined>(undefined);
  const queueRef = useRef<string[]>([]);
  const modeRef = useRef<"patterns" | "samples" | null>(null);
  const selectedPatternIdsRef = useRef<string[]>([]);

  const resetProgress = useCallback(() => {
    setIsBackupInProgress(false);
    setBackupProgress(0);
  }, []);

  /** Initialize and start an automated multi-step backup. */
  const startBackup = useCallback(
    (
      banks: string[],
      initialMode: "patterns" | "samples",
      customName?: string,
      selectedPatternIds?: string[]
    ) => {
      customNameRef.current = customName;
      queueRef.current = banks;
      modeRef.current = initialMode;
      selectedPatternIdsRef.current = selectedPatternIds ?? [];

      setBankQueue(banks);
      setCurrentBankIndex(0);
      setBackupResults([]);
      setBackupMode(initialMode);

      if (initialMode === "patterns") {
        setCurrentOperation(
          "Please ensure device is in pattern mode, then continue..."
        );
        setShowBackupGuide(true);
      } else if (banks.length > 0) {
        setCurrentOperation(
          `Please switch to sample mode and select bank ${banks[0]?.toUpperCase()}, then continue...`
        );
        setShowBackupGuide(true);
      } else {
        throw new Error("No banks selected for backup");
      }
    },
    []
  );

  const ejectDeviceWithFeedback = async (
    successMsg: string,
    warnMsg: string
  ) => {
    try {
      const ok = await window.electronAPI.ejectDevice();
      if (ok) {
        log.info(successMsg);
        showSnackbar("Device ejected", "success");
        setCurrentOperation(successMsg);
      } else {
        log.warn(warnMsg);
        showSnackbar("Device eject failed", "warning");
        setCurrentOperation(warnMsg);
      }
    } catch (error) {
      log.warn("Error during device ejection", { error });
      showSnackbar("Device eject failed", "warning");
      setCurrentOperation(warnMsg);
    }
  };

  const resetOrchestrationState = useCallback(() => {
    setShowBackupGuide(false);
    setBankQueue([]);
    setCurrentBankIndex(0);
    setBackupResults([]);
    setBackupMode(null);
    setIsBackupInProgress(false);
    setCurrentOperation("");
    setBackupProgress(0);
    customNameRef.current = undefined;
    queueRef.current = [];
    modeRef.current = null;
  }, []);

  const completeBackup = useCallback(
    async (
      finalResults: BackupStageResult[],
      queue: string[],
      hasPatterns: boolean,
      hasSamples: boolean,
      customName?: string
    ) => {
      try {
        setCurrentOperation("Organizing backup...");
        const options = {
          includePatterns: hasPatterns,
          includeSamples: hasSamples,
          bankIds: queue,
          precompletedResults: finalResults,
          customName,
        };
        const finalResult = await window.electronAPI.organizeBackup(options);
        setShowBackupGuide(false);
        setBackupProgress(100);
        onBackupComplete(finalResult);
        if (finalResult.success) {
          setCurrentOperation("Backup completed successfully");
          await ejectDeviceWithFeedback(
            "Backup completed successfully. Device ejected.",
            "Backup completed successfully. Manual device ejection required."
          );
          setTimeout(() => setCurrentOperation(""), 3000);
        } else {
          showSnackbar(finalResult.message || "Backup failed", "error");
        }
      } catch (error: any) {
        setShowBackupGuide(false);
        showSnackbar(error.message || "Failed to organize backup", "error");
      }
    },
    [onBackupComplete, showSnackbar]
  );

  const handleContinue = useCallback(async () => {
    setIsBackingUp(true);
    try {
      if (backupMode === "patterns") {
        if (!deviceStatus.connected) throw new Error("Device disconnected");

        const requiredPatternModes = [
          "pattern",
          "pattern_export",
          "pattern_import",
        ];
        if (!requiredPatternModes.includes(deviceStatus.mode)) {
          throw new Error(`Wrong mode: ${deviceStatus.mode}`);
        }

        setCurrentOperation("Backing up patterns...");
        const patternIds = selectedPatternIdsRef.current.length > 0
          ? selectedPatternIdsRef.current
          : undefined;
        const result = await window.electronAPI.backupPatterns(undefined, patternIds);
        const updatedResults: BackupStageResult[] = [
          ...backupResults,
          { type: "patterns" as const, result },
        ];
        setBackupResults(updatedResults);

        if (!result.success) {
          throw new Error(`Pattern backup failed: ${result.message}`);
        }

        await ejectDeviceWithFeedback(
          "Device ejected successfully after pattern backup",
          "Failed to eject device after pattern backup"
        );

        if (bankQueue.length > 0) {
          setBackupMode("samples");
          modeRef.current = "samples";
          setCurrentOperation(
            `Patterns complete. Now please switch to sample mode and select bank ${bankQueue[0]?.toUpperCase()}, then continue...`
          );
        } else {
          await completeBackup(
            updatedResults,
            queueRef.current,
            true,
            false,
            customNameRef.current
          );
        }
      } else if (backupMode === "samples") {
        if (!deviceStatus.connected) throw new Error("Device disconnected");

        const requiredSampleModes = [
          "sample",
          "sample_export",
          "sample_import",
        ];
        if (!requiredSampleModes.includes(deviceStatus.mode)) {
          throw new Error(`Wrong mode: ${deviceStatus.mode}`);
        }

        const currentBank = bankQueue[currentBankIndex];
        try {
          const deviceCurrentBank = await window.electronAPI.getCurrentBank();
          const availableBanks = await window.electronAPI.getCurrentBanks();
          if (
            deviceCurrentBank &&
            deviceCurrentBank.toLowerCase() !== currentBank.toLowerCase()
          ) {
            throw new Error(
              `Wrong bank: ${deviceCurrentBank} (expected ${currentBank})`
            );
          }
          if (
            availableBanks &&
            !availableBanks.some(
              (b: string) => b.toLowerCase() === currentBank.toLowerCase()
            )
          ) {
            throw new Error(`Bank ${currentBank} not available`);
          }
        } catch (error: any) {
          if (
            error.message.includes("not available") ||
            error.message.includes("currently set to bank") ||
            error.message.includes("Wrong bank")
          ) {
            throw error;
          }
          log.warn("Could not verify bank selection", { error: error.message });
        }

        setCurrentOperation(`Backing up bank ${currentBank.toUpperCase()}...`);
        const result = await window.electronAPI.backupSamples(
          currentBank,
          undefined
        );
        if (!result.success) {
          throw new Error(
            `Sample backup for bank ${currentBank} failed: ${result.message}`
          );
        }

        await ejectDeviceWithFeedback(
          `Device ejected successfully after backing up bank ${currentBank}`,
          `Failed to eject device after backing up bank ${currentBank}`
        );

        const updatedResults: BackupStageResult[] = [
          ...backupResults,
          { type: "samples" as const, bank: currentBank, result },
        ];
        setBackupResults(updatedResults);

        if (currentBankIndex + 1 < bankQueue.length) {
          const nextBank = bankQueue[currentBankIndex + 1];
          setCurrentBankIndex(currentBankIndex + 1);
          setCurrentOperation(
            `Bank ${currentBank.toUpperCase()} complete. Now please select bank ${nextBank.toUpperCase()}, then continue...`
          );
        } else {
          const hasPatterns = updatedResults.some((r) => r.type === "patterns");
          await completeBackup(
            updatedResults,
            queueRef.current,
            hasPatterns,
            true,
            customNameRef.current
          );
        }
      }
    } catch (error: any) {
      setShowBackupGuide(false);
      showSnackbar(error.message || "Backup failed", "error");
    } finally {
      setIsBackingUp(false);
    }
  }, [
    backupMode,
    bankQueue,
    backupResults,
    currentBankIndex,
    deviceStatus.connected,
    deviceStatus.mode,
    completeBackup,
    showSnackbar,
  ]);

  const handleCancel = useCallback(() => {
    resetOrchestrationState();
  }, [resetOrchestrationState]);

  return {
    // State (read-only)
    isBackupInProgress,
    backupProgress,
    currentOperation,
    showBackupGuide,
    bankQueue,
    currentBankIndex,
    backupMode,
    isBackingUp,
    // Actions
    startBackup,
    resetProgress,
    handleContinue,
    handleCancel,
  };
}
