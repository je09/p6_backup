import { useState, useCallback } from "react";
import { DeviceStatus, BackupResult } from "../../shared/types/index";

interface UseBackupOrchestrationProps {
  deviceStatus: DeviceStatus;
  onBackupComplete: (result: BackupResult) => void;
  showSnackbar: (
    message: string,
    type: "success" | "error" | "warning" | "info",
    action?: { label: string; onClick: () => void }
  ) => void;
  log: any;
}

export function useBackupOrchestration({
  deviceStatus,
  onBackupComplete,
  showSnackbar,
  log,
}: UseBackupOrchestrationProps) {
  // Backup orchestration state
  const [isBackupInProgress, setIsBackupInProgress] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [currentOperation, setCurrentOperation] = useState<string>("");
  const [showCombinedBankGuide, setShowCombinedBankGuide] = useState(false);
  const [combinedBackupQueue, setCombinedBackupQueue] = useState<string[]>([]);
  const [currentCombinedBankIndex, setCurrentCombinedBankIndex] = useState(0);
  const [combinedBackupResults, setCombinedBackupResults] = useState<any[]>([]);
  const [combinedBackupMode, setCombinedBackupMode] = useState<
    "patterns" | "samples" | null
  >(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [currentBackupCustomName, setCurrentBackupCustomName] = useState<
    string | undefined
  >(undefined);

  // handlePatternBackup
  const handlePatternBackup = async (options: {
    setIncludePatterns: (v: boolean) => void;
    setIncludeSamples: (v: boolean) => void;
    setSelectedCombinedBanks: (v: string[]) => void;
    setSelectedPatterns: (v: string[]) => void;
    availablePatterns: any[];
    includePatterns: boolean;
    includeSamples: boolean;
    handleCombinedBackupWithName: (customName?: string) => Promise<void>;
  }) => {
    const {
      setIncludePatterns,
      setIncludeSamples,
      setSelectedCombinedBanks,
      setSelectedPatterns,
      availablePatterns,
      handleCombinedBackupWithName,
    } = options;
    if (!deviceStatus.connected) {
      showSnackbar("Device not connected", "error");
      return;
    }
    setIncludePatterns(true);
    setIncludeSamples(false);
    setSelectedCombinedBanks([]);
    if (availablePatterns && availablePatterns.length > 0) {
      setSelectedPatterns(availablePatterns.map((pattern: any) => pattern.id));
      log.debug("Auto-selected all patterns for Patterns backup", {
        count: availablePatterns.length,
      });
    }
    await handleCombinedBackupWithName(undefined);
  };

  // handleSampleBackup
  const handleSampleBackup = async (options: {
    setIncludePatterns: (v: boolean) => void;
    setIncludeSamples: (v: boolean) => void;
    setSelectedCombinedBanks: (v: string[]) => void;
    handleCombinedBackupWithName: (customName?: string) => Promise<void>;
    bankId?: string;
  }) => {
    const {
      setIncludePatterns,
      setIncludeSamples,
      setSelectedCombinedBanks,
      handleCombinedBackupWithName,
      bankId,
    } = options;
    if (!deviceStatus.connected) {
      showSnackbar("Device not connected", "error");
      return;
    }
    setIncludePatterns(false);
    setIncludeSamples(true);
    setSelectedCombinedBanks(
      bankId ? [bankId.toLowerCase()] : ["a", "b", "c", "d", "e", "f", "g", "h"]
    );
    await handleCombinedBackupWithName(undefined);
  };

  // handleFullBackup
  const handleFullBackup = async (options: {
    setIncludePatterns: (v: boolean) => void;
    setIncludeSamples: (v: boolean) => void;
    setSelectedCombinedBanks: (v: string[]) => void;
    setSelectedPatterns: (v: string[]) => void;
    availablePatterns: any[];
    handleCombinedBackupWithName: (customName?: string) => Promise<void>;
  }) => {
    const {
      setIncludePatterns,
      setIncludeSamples,
      setSelectedCombinedBanks,
      setSelectedPatterns,
      availablePatterns,
      handleCombinedBackupWithName,
    } = options;
    if (!deviceStatus.connected) {
      showSnackbar("Device not connected", "error");
      return;
    }
    setIncludePatterns(true);
    setIncludeSamples(true);
    setSelectedCombinedBanks(["a", "b", "c", "d", "e", "f", "g", "h"]);
    if (availablePatterns && availablePatterns.length > 0) {
      setSelectedPatterns(availablePatterns.map((pattern: any) => pattern.id));
      log.debug("Auto-selected all patterns for Everything backup", {
        count: availablePatterns.length,
      });
    }
    await handleCombinedBackupWithName(undefined);
  };

  // handleCombinedBackupWithName
  const handleCombinedBackupWithName = async (options: {
    includePatterns: boolean;
    includeSamples: boolean;
    selectedCombinedBanks: string[];
    setModeSwitchDetails: (details: any) => void;
    setShowModeSwitchModal: (v: boolean) => void;
    customName?: string;
  }) => {
    const {
      includePatterns,
      includeSamples,
      selectedCombinedBanks,
      setModeSwitchDetails,
      setShowModeSwitchModal,
      customName,
    } = options;
    if (!deviceStatus.connected) {
      showSnackbar("Device not connected", "error");
      return;
    }
    if (!includePatterns && !includeSamples) {
      showSnackbar(
        "Please select at least one backup type (patterns or samples)",
        "warning"
      );
      return;
    }
    try {
      let modeCheckRequired = false;
      let requiredMode = "";
      let currentMode = "";
      if (includePatterns) {
        const patternModeRequirement =
          await window.electronAPI.checkModeRequirement("pattern backup");
        if (patternModeRequirement) {
          modeCheckRequired = true;
          requiredMode = patternModeRequirement.requiredMode;
          currentMode = patternModeRequirement.currentMode;
        }
      }
      if (modeCheckRequired) {
        const operationDescription =
          [includePatterns ? "Patterns" : "", includeSamples ? "Samples" : ""]
            .filter(Boolean)
            .join(" + ") + " Combined Backup";
        setModeSwitchDetails({
          currentMode,
          requiredMode,
          operation: operationDescription,
          onContinue: () =>
            performCombinedBackupWithName({
              includePatterns,
              includeSamples,
              selectedCombinedBanks,
              setIsBackupInProgress,
              setCurrentOperation,
              setBackupProgress,
              onBackupComplete,
              setModeSwitchDetails,
              setShowModeSwitchModal,
              performAutomatedCombinedBackupWithName,
              customName,
            }),
        });
        setShowModeSwitchModal(true);
        return;
      }
      await performCombinedBackupWithName({
        includePatterns,
        includeSamples,
        selectedCombinedBanks,
        setIsBackupInProgress,
        setCurrentOperation,
        setBackupProgress,
        onBackupComplete,
        setModeSwitchDetails,
        setShowModeSwitchModal,
        performAutomatedCombinedBackupWithName,
        customName,
      });
    } catch (error: any) {
      showSnackbar(error.message || "Unknown error", "error");
    }
  };

  // performCombinedBackupWithName
  type CombinedBackupOptions = {
    includePatterns: boolean;
    includeSamples: boolean;
    selectedCombinedBanks: string[];
    setIsBackupInProgress: (v: boolean) => void;
    setCurrentOperation: (v: string) => void;
    setBackupProgress: (v: number) => void;
    onBackupComplete: (result: BackupResult) => void;
    setModeSwitchDetails: (details: any) => void;
    setShowModeSwitchModal: (v: boolean) => void;
    performAutomatedCombinedBackupWithName: (
      customName?: string
    ) => Promise<void>;
    customName?: string;
  };

  const performCombinedBackupWithName = async (
    options: CombinedBackupOptions
  ) => {
    const {
      includePatterns,
      includeSamples,
      selectedCombinedBanks,
      setIsBackupInProgress,
      setCurrentOperation,
      setBackupProgress,
      onBackupComplete,
      setModeSwitchDetails,
      setShowModeSwitchModal,
      performAutomatedCombinedBackupWithName,
      customName,
    } = options;
    setIsBackupInProgress(true);
    const operationParts = [];
    if (includePatterns) operationParts.push("patterns");
    if (includeSamples) operationParts.push("samples");
    setCurrentOperation(
      `Starting combined backup (${operationParts.join(" + ")})...`
    );
    setBackupProgress(0);
    try {
      if (includeSamples && selectedCombinedBanks.length > 1) {
        await performAutomatedCombinedBackupWithName(customName);
      } else {
        const backupOptions = {
          includePatterns: includePatterns,
          includeSamples: includeSamples,
          bankIds:
            includeSamples && selectedCombinedBanks.length > 0
              ? selectedCombinedBanks
              : undefined,
          customName: customName,
        };
        const result = await window.electronAPI.combinedBackup(backupOptions);
        setBackupProgress(100);
        onBackupComplete(result);
        if (result.success) {
          setCurrentOperation("Combined backup completed successfully");
          setTimeout(() => setCurrentOperation(""), 3000);
        } else {
          showSnackbar(result.message || "Full backup failed", "error");
        }
      }
    } catch (error: any) {
      if (error.message?.includes("mode")) {
        const [, currentMode, requiredMode] =
          error.message.match(/Current mode: (\w+).*mode for.*mode: (\w+)/) ||
          [];
        if (currentMode && requiredMode) {
          setModeSwitchDetails({
            currentMode,
            requiredMode,
            operation: "Combined Backup",
            onContinue: () =>
              performCombinedBackupWithName({
                includePatterns,
                includeSamples,
                selectedCombinedBanks,
                setIsBackupInProgress,
                setCurrentOperation,
                setBackupProgress,
                onBackupComplete,
                setModeSwitchDetails,
                setShowModeSwitchModal,
                performAutomatedCombinedBackupWithName,
                customName,
              }),
          });
          setShowModeSwitchModal(true);
          return;
        }
      }
      showSnackbar(error.message || "Unknown error", "error");
    } finally {
      setIsBackupInProgress(false);
      setCurrentOperation("");
      setBackupProgress(0);
    }
  };

  // performAutomatedCombinedBackupWithName
  const performAutomatedCombinedBackupWithName = async (
    customName?: string
  ) => {
    setCurrentBackupCustomName(customName);
    const bankQueue = combinedBackupQueue.length > 0 ? combinedBackupQueue : [];
    setCombinedBackupQueue(bankQueue);
    setCurrentCombinedBankIndex(0);
    setCombinedBackupResults([]);
    if (combinedBackupMode === "patterns") {
      setCombinedBackupMode("patterns");
      setCurrentOperation(
        "Please ensure device is in pattern mode, then continue..."
      );
      setShowCombinedBankGuide(true);
    } else if (combinedBackupMode === "samples" && bankQueue.length > 0) {
      setCombinedBackupMode("samples");
      setCurrentOperation(
        `Please switch to sample mode and select bank ${bankQueue[0]?.toUpperCase()}, then continue...`
      );
      setShowCombinedBankGuide(true);
    } else {
      throw new Error("No banks selected for combined backup");
    }
  };

  // handleCombinedBankContinue
  const handleCombinedBankContinue = async () => {
    setIsBackingUp(true);
    try {
      if (combinedBackupMode === "patterns") {
        if (!deviceStatus.connected) {
          throw new Error("Device disconnected");
        }
        const currentMode = deviceStatus.mode;
        const requiredPatternModes = [
          "pattern",
          "pattern_export",
          "pattern_import",
        ];
        if (!requiredPatternModes.includes(currentMode)) {
          throw new Error(`Wrong mode: ${currentMode}`);
        }
        setCurrentOperation("Backing up patterns...");
        const result = await window.electronAPI.backupPatterns(
          currentBackupCustomName
        );
        setCombinedBackupResults((prev: any[]) => [
          ...prev,
          { type: "patterns", result },
        ]);
        if (!result.success) {
          throw new Error(`Pattern backup failed: ${result.message}`);
        }
        await ejectDeviceWithFeedback(
          "Device ejected successfully after pattern backup",
          "Failed to eject device after pattern backup"
        );
        if (
          combinedBackupMode === "patterns" &&
          combinedBackupQueue.length > 0
        ) {
          setCombinedBackupMode("samples");
          setCurrentOperation(
            `Patterns complete. Now please switch to sample mode and select bank ${combinedBackupQueue[0]?.toUpperCase()}, then continue...`
          );
        } else {
          await completeCombinedBackup();
          return;
        }
      } else if (combinedBackupMode === "samples") {
        if (!deviceStatus.connected) {
          throw new Error("Device disconnected");
        }
        const currentMode = deviceStatus.mode;
        const requiredSampleModes = [
          "sample",
          "sample_export",
          "sample_import",
        ];
        if (!requiredSampleModes.includes(currentMode)) {
          throw new Error(`Wrong mode: ${currentMode}`);
        }
        const currentBank = combinedBackupQueue[currentCombinedBankIndex];
        const sampleModes = ["sample", "sample_export", "sample_import"];
        if (sampleModes.includes(currentMode)) {
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
              error.message.includes("currently set to bank")
            ) {
              throw error;
            }
            log.warn("Could not verify bank selection", {
              error: error.message,
            });
          }
        }
        setCurrentOperation(`Backing up bank ${currentBank.toUpperCase()}...`);
        const result = await window.electronAPI.backupSamples(
          currentBank,
          currentBackupCustomName
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
        const newResult = { type: "samples", bank: currentBank, result };
        const updatedResults = [...combinedBackupResults, newResult];
        setCombinedBackupResults(updatedResults);
        if (currentCombinedBankIndex + 1 < combinedBackupQueue.length) {
          const nextBank = combinedBackupQueue[currentCombinedBankIndex + 1];
          setCurrentCombinedBankIndex(currentCombinedBankIndex + 1);
          setCurrentOperation(
            `Bank ${currentBank.toUpperCase()} complete. Now please select bank ${nextBank.toUpperCase()}, then continue...`
          );
        } else {
          await completeCombinedBackup(updatedResults);
          return;
        }
      }
    } catch (error: any) {
      setShowCombinedBankGuide(false);
      showSnackbar(error.message || "Combined backup failed", "error");
    } finally {
      setIsBackingUp(false);
    }
  };

  // Helper to eject device and show result
  const ejectDeviceWithFeedback = async (
    successMsg: string,
    warnMsg: string
  ) => {
    try {
      const ejectSuccess = await window.electronAPI.ejectDevice();
      if (ejectSuccess) {
        log.info(successMsg);
        showSnackbar("Device ejected", "success");
        setCurrentOperation(successMsg);
      } else {
        log.warn(warnMsg);
        showSnackbar("Device eject failed", "warning");
        setCurrentOperation(warnMsg);
      }
    } catch (ejectError) {
      log.warn("Error during device ejection", { error: ejectError });
      showSnackbar("Device eject failed", "warning");
      setCurrentOperation(warnMsg);
    }
  };

  // Helper to reset all orchestration state
  const resetOrchestrationState = () => {
    setShowCombinedBankGuide(false);
    setCombinedBackupQueue([]);
    setCurrentCombinedBankIndex(0);
    setCombinedBackupResults([]);
    setCombinedBackupMode(null);
    setIsBackupInProgress(false);
    setCurrentOperation("");
    setBackupProgress(0);
    setCurrentBackupCustomName(undefined);
  };

  // completeCombinedBackup
  const completeCombinedBackup = async (updatedResults?: any[]) => {
    try {
      setCurrentOperation("Organizing combined backup...");
      const resultsToUse = updatedResults || combinedBackupResults;
      const options = {
        includePatterns: combinedBackupMode === "patterns",
        includeSamples: combinedBackupMode === "samples",
        bankIds: combinedBackupQueue,
        precompletedResults: resultsToUse,
        customName: currentBackupCustomName,
      };
      const finalResult = await window.electronAPI.organizeCombinedBackup(
        options
      );
      setShowCombinedBankGuide(false);
      setBackupProgress(100);
      onBackupComplete(finalResult);
      if (finalResult.success) {
        setCurrentOperation("Combined backup completed successfully");
        await ejectDeviceWithFeedback(
          "Combined backup completed successfully. Device ejected.",
          "Combined backup completed successfully. Manual device ejection required."
        );
        setTimeout(() => setCurrentOperation(""), 3000);
      } else {
        showSnackbar(finalResult.message || "Combined backup failed", "error");
      }
    } catch (error: any) {
      setShowCombinedBankGuide(false);
      showSnackbar(
        error.message || "Failed to organize combined backup",
        "error"
      );
    } finally {
      setCurrentBackupCustomName(undefined);
    }
  };

  // handleCombinedBankCancel
  const handleCombinedBankCancel = () => {
    resetOrchestrationState();
  };

  return {
    isBackupInProgress,
    backupProgress,
    currentOperation,
    showCombinedBankGuide,
    combinedBackupQueue,
    currentCombinedBankIndex,
    combinedBackupResults,
    combinedBackupMode,
    isBackingUp,
    currentBackupCustomName,
    setShowCombinedBankGuide,
    setCombinedBackupQueue,
    setCurrentCombinedBankIndex,
    setCombinedBackupResults,
    setCombinedBackupMode,
    setIsBackupInProgress,
    setBackupProgress,
    setCurrentBackupCustomName,
    // Expose orchestration methods
    handleCombinedBackupWithName,
    performCombinedBackupWithName,
    handleCombinedBankContinue,
    completeCombinedBackup,
    handleCombinedBankCancel,
    handlePatternBackup,
    handleSampleBackup,
    handleFullBackup,
  };
}
