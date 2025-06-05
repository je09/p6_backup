import React, { useState, useEffect, useCallback } from "react";
import {
  DeviceStatus,
  BackupResult,
  BackupType,
} from "../../shared/types/index";
import { SampleBankSelector } from "./SampleBankSelector";
import { PatternSelector } from "./PatternSelector";
import { AutomatedBackupManager } from "./AutomatedBackupManager";
import { ModeSwitchModal } from "./ModeSwitchModal";
import { BackupNameModal } from "./BackupNameModal";
import { Snackbar } from "./Snackbar";
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  STATUS_MESSAGES,
  INFO_MESSAGES,
  UI_LABELS,
  OPERATION_NAMES,
} from "../../shared/constants";
import { createComponentLogger } from "../utils/logger";
import { useBackupOrchestration } from "../hooks/useBackupOrchestration";
import { BackupProgressCard } from "./BackupProgressCard";
import { QuickActionButtons } from "./QuickActionButtons";
import { CombinedBackupOptions } from "./CombinedBackupOptions";
import { BankReadinessIndicator } from "./BankReadinessIndicator";

// BankReadinessIndicator moved to its own file

interface BackupSectionProps {
  deviceStatus: DeviceStatus;
  onBackupComplete: (result: BackupResult) => void;
}

export const BackupSection: React.FC<BackupSectionProps> = ({
  deviceStatus,
  onBackupComplete,
}) => {
  // Initialize component logger
  const log = createComponentLogger("BackupSection");

  // Snackbar state
  const [snackbar, setSnackbar] = useState<{
    visible: boolean;
    message: string;
    type: "success" | "error" | "warning" | "info";
    action?: { label: string; onClick: () => void };
  }>({
    visible: false,
    message: "",
    type: "info",
  });

  // Helper function to show snackbar messages
  const showSnackbar = (
    message: string,
    type: "success" | "error" | "warning" | "info",
    action?: { label: string; onClick: () => void }
  ) => {
    setSnackbar({
      visible: true,
      message,
      type,
      action,
    });
  };

  const hideSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, visible: false }));
  };

  // UI state (keep these local)
  const [availableBanks, setAvailableBanks] = useState<string[]>([]);
  const [availablePatterns, setAvailablePatterns] = useState<any[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [includePatterns, setIncludePatterns] = useState(false);
  const [includeSamples, setIncludeSamples] = useState(false);
  const [selectedCombinedBanks, setSelectedCombinedBanks] = useState<string[]>(
    []
  );

  // Mode switching state
  const [showModeSwitchModal, setShowModeSwitchModal] = useState(false);
  const [modeSwitchDetails, setModeSwitchDetails] = useState<{
    currentMode: string;
    requiredMode: string;
    operation: string;
    onContinue: () => void;
  } | null>(null);

  // Backup name modal state
  const [showBackupNameModal, setShowBackupNameModal] = useState(false);
  const [backupNameModalDetails, setBackupNameModalDetails] = useState<{
    title: string;
    subtitle?: string;
    onConfirm: (customName: string | undefined) => void;
  } | null>(null);

  // Store custom name for automated backup process
  const [currentBackupCustomName, setCurrentBackupCustomName] = useState<
    string | undefined
  >(undefined);

  // Use backup orchestration hook
  const backupOrchestration = useBackupOrchestration({
    deviceStatus,
    onBackupComplete,
    showSnackbar,
    log,
  });

  // Fetch available banks when device status changes
  useEffect(() => {
    const fetchAvailableBanks = async () => {
      if (
        deviceStatus.connected &&
        (deviceStatus.mode === "sample" ||
          deviceStatus.mode === "sample_export" ||
          deviceStatus.mode === "sample_import")
      ) {
        try {
          const banks = await window.electronAPI.getCurrentBanks();
          log.debug("Available banks from API", { banks });
          if (banks && Array.isArray(banks)) {
            // Convert banks to lowercase for consistency
            setAvailableBanks(banks.map((bank) => bank.toLowerCase()));
            log.debug("Set available banks", {
              banks: banks.map((bank) => bank.toLowerCase()),
            });
          } else {
            setAvailableBanks([]);
            log.debug("No banks detected, set available banks to empty array");
          }
        } catch (error) {
          log.error("Failed to fetch available banks", { error });
          setAvailableBanks([]);
        }
      } else {
        log.debug("Device not in sample mode or not connected", {
          mode: deviceStatus.mode,
        });
        setAvailableBanks([]);
      }
    };

    fetchAvailableBanks();
  }, [deviceStatus.connected, deviceStatus.mode]);

  // Fetch available patterns when device status changes
  useEffect(() => {
    const fetchAvailablePatterns = async () => {
      if (
        deviceStatus.connected &&
        (deviceStatus.mode === "pattern" ||
          deviceStatus.mode === "pattern_export" ||
          deviceStatus.mode === "pattern_import")
      ) {
        try {
          const patterns = await window.electronAPI.getCurrentPatterns();
          log.debug("Available patterns from API", { patterns });
          if (patterns && Array.isArray(patterns)) {
            setAvailablePatterns(patterns);
            log.debug("Set available patterns", { count: patterns.length });
          } else {
            setAvailablePatterns([]);
            setSelectedPatterns([]);
            log.debug(
              "No patterns detected, set available patterns to empty array"
            );
          }
        } catch (error) {
          log.error("Failed to fetch available patterns", { error });
          setAvailablePatterns([]);
          setSelectedPatterns([]);
        }
      } else {
        log.debug("Device not in pattern mode or not connected", {
          mode: deviceStatus.mode,
        });
        setAvailablePatterns([]);
        setSelectedPatterns([]);
      }
    };

    fetchAvailablePatterns();
  }, [deviceStatus.connected, deviceStatus.mode, includePatterns]);

  // Auto-select all patterns when available patterns change and patterns are enabled
  useEffect(() => {
    if (includePatterns && availablePatterns && availablePatterns.length > 0) {
      // Only auto-select if no patterns are currently selected
      if (selectedPatterns.length === 0) {
        setSelectedPatterns(availablePatterns.map((pattern) => pattern.id));
        log.debug("Auto-selected all available patterns", {
          count: availablePatterns.length,
        });
      }
    }
  }, [availablePatterns, includePatterns]);

  // Add debug logging for device status
  useEffect(() => {
    log.debug("Device status changed", deviceStatus);
    log.debug(
      `Device is connected: ${deviceStatus.connected}, Mode: ${deviceStatus.mode}`
    );

    // Log the conditions for enabling sample backup
    log.debug(
      `Can backup samples: ${
        deviceStatus.connected &&
        (deviceStatus.mode === "sample" ||
          deviceStatus.mode === "sample_export" ||
          deviceStatus.mode === "sample_import")
      }`
    );
  }, [deviceStatus]);

  // File copy success event listener
  useEffect(() => {
    const handleFileCopySuccess = (data: {
      fileName: string;
      message: string;
    }) => {
      showSnackbar(data.message, "info");
    };

    window.electronAPI.onFileCopySuccess(handleFileCopySuccess);

    // Cleanup listener on component unmount
    return () => {
      window.electronAPI.removeAllListeners("file-copy-success");
    };
  }, []);

  // Simple alias for combined backup with patterns only (no name prompt)
  const handlePatternBackup = async () => {
    if (!deviceStatus.connected) {
      showSnackbar(ERROR_MESSAGES.DEVICE_NOT_CONNECTED, "error");
      return;
    }

    // Set combined backup state for patterns only
    setIncludePatterns(true);
    setIncludeSamples(false);
    setSelectedCombinedBanks([]);

    // Select all available patterns for pattern-only backup
    if (availablePatterns && availablePatterns.length > 0) {
      setSelectedPatterns(availablePatterns.map((pattern) => pattern.id));
      log.debug("Auto-selected all patterns for Patterns backup", {
        count: availablePatterns.length,
      });
    }

    // Use automatic naming based on backup type
    await handleCombinedBackupWithName(undefined);
  };

  // Simple alias for combined backup with samples only (no name prompt)
  const handleSampleBackup = async (bankId?: string) => {
    if (!deviceStatus.connected) {
      showSnackbar(ERROR_MESSAGES.DEVICE_NOT_CONNECTED, "error");
      return;
    }

    // Set combined backup state for samples
    setIncludePatterns(false);
    setIncludeSamples(true);
    // Set specific bank or all banks (a-h)
    setSelectedCombinedBanks(
      bankId ? [bankId.toLowerCase()] : ["a", "b", "c", "d", "e", "f", "g", "h"]
    );

    // Use automatic naming based on backup type
    await handleCombinedBackupWithName(undefined);
  };

  // Simple alias for combined backup with both patterns and samples (no name prompt)
  const handleFullBackup = async () => {
    if (!deviceStatus.connected) {
      showSnackbar(ERROR_MESSAGES.DEVICE_NOT_CONNECTED, "error");
      return;
    }

    // Set combined backup state for everything
    setIncludePatterns(true);
    setIncludeSamples(true);
    // Set all available banks - use all 8 banks (a-h)
    setSelectedCombinedBanks(["a", "b", "c", "d", "e", "f", "g", "h"]);

    // Select all available patterns
    if (availablePatterns && availablePatterns.length > 0) {
      setSelectedPatterns(availablePatterns.map((pattern) => pattern.id));
      log.debug("Auto-selected all patterns for Everything backup", {
        count: availablePatterns.length,
      });
    }

    // Use automatic naming based on backup type
    await handleCombinedBackupWithName(undefined);
  };

  const handleCombinedBackupWithName = async (customName?: string) => {
    if (!deviceStatus.connected) {
      showSnackbar(ERROR_MESSAGES.DEVICE_NOT_CONNECTED, "error");
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
      // Check mode requirements for selected options
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

      // Note: Sample backup is now available in any mode, so we skip the sample mode check

      if (modeCheckRequired) {
        // Show mode switch modal
        const operationDescription =
          [includePatterns ? "Patterns" : "", includeSamples ? "Samples" : ""]
            .filter(Boolean)
            .join(" + ") + " Combined Backup";

        setModeSwitchDetails({
          currentMode,
          requiredMode,
          operation: operationDescription,
          onContinue: () => performCombinedBackupWithName(customName),
        });
        setShowModeSwitchModal(true);
        return;
      }

      // Mode is correct, proceed with backup
      await performCombinedBackupWithName(customName);
    } catch (error: any) {
      showSnackbar(error.message || ERROR_MESSAGES.UNKNOWN_ERROR, "error");
    }
  };

  const performCombinedBackupWithName = async (customName?: string) => {
    const operationParts = [];
    if (includePatterns) operationParts.push("patterns");
    if (includeSamples) operationParts.push("samples");

    try {
      // If we need to backup multiple sample banks, use the automated approach
      if (includeSamples && selectedCombinedBanks.length > 1) {
        // Start the automated combined backup process
        await performAutomatedCombinedBackupWithName(customName);
      } else {
        // Single operation or single bank - use the simple approach
        const options = {
          includePatterns,
          includeSamples,
          bankIds:
            includeSamples && selectedCombinedBanks.length > 0
              ? selectedCombinedBanks
              : undefined,
          customName: customName,
        };

        const result = await window.electronAPI.combinedBackup(options);
        onBackupComplete(result);

        if (result.success) {
          // Removed setTimeout as it's not needed
        } else {
          showSnackbar(
            result.message || ERROR_MESSAGES.FULL_BACKUP_FAILED,
            "error"
          );
        }
      }
    } catch (error: any) {
      if (error.message?.includes("mode")) {
        // Mode requirement error - this shouldn't happen after modal check, but handle gracefully
        const [, currentMode, requiredMode] =
          error.message.match(/Current mode: (\w+).*mode for.*mode: (\w+)/) ||
          [];
        if (currentMode && requiredMode) {
          setModeSwitchDetails({
            currentMode,
            requiredMode,
            operation: "Combined Backup",
            onContinue: () => performCombinedBackupWithName(customName),
          });
          setShowModeSwitchModal(true);
          return;
        }
      }
      showSnackbar(error.message || ERROR_MESSAGES.UNKNOWN_ERROR, "error");
    } finally {
      backupOrchestration.setIsBackupInProgress(false);
      // Removed backupOrchestration.setCurrentOperation("");
      backupOrchestration.setBackupProgress(0);
    }
  };

  const performAutomatedCombinedBackupWithName = async (
    customName?: string
  ) => {
    // Store the custom name for use in the automated backup process
    setCurrentBackupCustomName(customName);

    // Initialize the queue and state
    const bankQueue =
      selectedCombinedBanks.length > 0 ? selectedCombinedBanks : [];
    backupOrchestration.setCombinedBackupQueue(bankQueue);
    backupOrchestration.setCurrentCombinedBankIndex(0);
    backupOrchestration.setCombinedBackupResults([]);

    // Start with patterns if needed
    if (includePatterns) {
      backupOrchestration.setCombinedBackupMode("patterns");
      // Removed setCurrentOperation as it's not part of the public API
      backupOrchestration.setShowCombinedBankGuide(true);
    } else if (includeSamples && bankQueue.length > 0) {
      // Start with first sample bank
      backupOrchestration.setCombinedBackupMode("samples");
      // Removed setCurrentOperation as it's not part of the public API
      backupOrchestration.setShowCombinedBankGuide(true);
    } else {
      // No banks to process
      throw new Error("No banks selected for combined backup");
    }
  };

  const handleCombinedBankContinue = async () => {
    await backupOrchestration.handleCombinedBankContinue(); // No arguments needed
  };

  const handleCombinedBankCancel = () => {
    backupOrchestration.handleCombinedBankCancel();
    setCurrentBackupCustomName(undefined); // Clear custom name
  };

  const canBackupPatterns =
    deviceStatus.connected && deviceStatus.mode === "pattern";
  const canBackupSamples =
    deviceStatus.connected &&
    (deviceStatus.mode === "sample" ||
      deviceStatus.mode === "sample_export" ||
      deviceStatus.mode === "sample_import");
  const canFullBackup = deviceStatus.connected;

  // Check if device is ready for combined backup continue action
  const [isDeviceReadyForContinue, setIsDeviceReadyForContinue] =
    useState(false);

  // Helper function to check if device is ready with correct bank
  const checkDeviceReadiness = useCallback(async () => {
    if (!deviceStatus.connected) {
      log.debug("Device readiness check: Device not connected");
      setIsDeviceReadyForContinue(false);
      return;
    }

    if (backupOrchestration.combinedBackupMode === "patterns") {
      // For patterns, just check if device is in pattern mode
      const requiredPatternModes = [
        "pattern",
        "pattern_export",
        "pattern_import",
      ];
      const isReady = requiredPatternModes.includes(deviceStatus.mode || "");
      log.debug(
        `Pattern readiness check: mode=${deviceStatus.mode}, ready=${isReady}`
      );
      setIsDeviceReadyForContinue(isReady);
    } else if (backupOrchestration.combinedBackupMode === "samples") {
      // For samples, check both mode and bank
      const requiredSampleModes = ["sample", "sample_export", "sample_import"];
      if (!requiredSampleModes.includes(deviceStatus.mode || "")) {
        log.debug(`Sample readiness check: wrong mode=${deviceStatus.mode}`);
        setIsDeviceReadyForContinue(false);
        return;
      }

      try {
        const deviceCurrentBank = await window.electronAPI.getCurrentBank();
        const targetBank =
          backupOrchestration.combinedBackupQueue[
            backupOrchestration.currentCombinedBankIndex
          ];

        log.debug(
          `Bank readiness check: targetBank=${targetBank}, deviceBank=${deviceCurrentBank}, index=${backupOrchestration.currentCombinedBankIndex}`
        );

        if (deviceCurrentBank && targetBank) {
          const bankMatches =
            deviceCurrentBank.toLowerCase() === targetBank.toLowerCase();
          log.debug(
            `Bank match check: ${deviceCurrentBank.toLowerCase()} === ${targetBank.toLowerCase()} = ${bankMatches}`
          );
          setIsDeviceReadyForContinue(bankMatches);
        } else {
          log.debug(
            `Bank readiness check failed: deviceCurrentBank=${deviceCurrentBank}, targetBank=${targetBank}`
          );
          setIsDeviceReadyForContinue(false);
        }
      } catch (error) {
        log.warn("Could not check bank readiness", { error });
        setIsDeviceReadyForContinue(false);
      }
    } else {
      log.debug(
        `Device readiness check: unknown mode=${backupOrchestration.combinedBackupMode}`
      );
      setIsDeviceReadyForContinue(false);
    }
  }, [
    deviceStatus.connected,
    deviceStatus.mode,
    backupOrchestration.combinedBackupMode,
    backupOrchestration.combinedBackupQueue,
    backupOrchestration.currentCombinedBankIndex,
  ]);

  // Check device readiness when relevant state changes
  useEffect(() => {
    if (backupOrchestration.showCombinedBankGuide) {
      const performCheck = async () => {
        await checkDeviceReadiness();
      };
      performCheck();
    }
  }, [
    deviceStatus.connected,
    deviceStatus.mode,
    backupOrchestration.combinedBackupMode,
    backupOrchestration.currentCombinedBankIndex,
    backupOrchestration.showCombinedBankGuide,
    checkDeviceReadiness,
  ]);

  // Periodically check bank status when in sample mode
  useEffect(() => {
    if (
      backupOrchestration.showCombinedBankGuide &&
      backupOrchestration.combinedBackupMode === "samples"
    ) {
      const interval = setInterval(() => {
        checkDeviceReadiness();
      }, 2000); // Check every 2 seconds
      return () => clearInterval(interval);
    }
  }, [
    backupOrchestration.showCombinedBankGuide,
    backupOrchestration.combinedBackupMode,
    checkDeviceReadiness,
  ]);

  // Mode switching handlers
  const handleModeSwitchCancel = () => {
    setShowModeSwitchModal(false);
    setModeSwitchDetails(null);
  };

  const handleModeSwitchContinue = async () => {
    if (!modeSwitchDetails) return;

    setShowModeSwitchModal(false);

    try {
      // Wait for the device to be in the required mode
      const waitResult = await window.electronAPI.waitForMode(
        modeSwitchDetails.requiredMode
      );

      if (waitResult.success) {
        // Execute the original operation
        modeSwitchDetails.onContinue();
      } else {
        showSnackbar(
          waitResult.timedOut
            ? "Timeout waiting for device mode switch. Please ensure device is in the correct mode and try again."
            : "Failed to detect required device mode. Please check device connection and mode.",
          "error"
        );
      }
    } catch (error: any) {
      showSnackbar(error.message || "Mode switch failed", "error");
    } finally {
      setModeSwitchDetails(null);
    }
  };

  // Backup Name Modal handlers for cleaner JSX
  const handleBackupNameConfirm = (customName: string | undefined) => {
    setShowBackupNameModal(false);
    backupNameModalDetails?.onConfirm(customName);
    setBackupNameModalDetails(null);
  };
  const handleBackupNameCancel = () => {
    setShowBackupNameModal(false);
    setBackupNameModalDetails(null);
  };

  // Helper functions for button text and tooltip
  const getButtonText = () => {
    if (backupOrchestration.isBackingUp) return "Backing up...";
    if (!deviceStatus.connected) return "Device Not Connected";
    if (!isDeviceReadyForContinue) {
      if (backupOrchestration.combinedBackupMode === "patterns") {
        return "Switch to Pattern Mode";
      } else if (backupOrchestration.combinedBackupMode === "samples") {
        return `Select Bank ${backupOrchestration.combinedBackupQueue[
          backupOrchestration.currentCombinedBankIndex
        ]?.toUpperCase()}`;
      }
      return "Device Not Ready";
    }
    return "Continue";
  };

  // Move mode arrays outside the function to avoid recreation
  const requiredPatternModes = ["pattern", "pattern_export", "pattern_import"];
  const requiredSampleModes = ["sample", "sample_export", "sample_import"];

  const getButtonDisabledReason = () => {
    if (!deviceStatus.connected) return "Device must be connected";
    if (backupOrchestration.combinedBackupMode === "patterns") {
      if (!requiredPatternModes.includes(deviceStatus.mode || "")) {
        return "Device must be in Pattern mode (hold PLAY button while powering on)";
      }
    } else if (backupOrchestration.combinedBackupMode === "samples") {
      if (!requiredSampleModes.includes(deviceStatus.mode || "")) {
        return "Device must be in Sample mode (hold BANK + SAMPLING buttons while powering on)";
      }
      return `Device must have bank ${backupOrchestration.combinedBackupQueue[
        backupOrchestration.currentCombinedBankIndex
      ]?.toUpperCase()} selected`;
    }
    return "Device not ready";
  };

  // Destructure snackbar for cleaner usage
  const { visible, message, type, action } = snackbar;

  // Helper to get backup types and title
  const getCombinedBackupTypesAndTitle = () => {
    const backupTypes = [];
    if (includePatterns) backupTypes.push("Patterns");
    if (includeSamples) backupTypes.push("Samples");
    const backupTitle = `${backupTypes.join(" + ")} Combined Backup`;
    return { backupTypes, backupTitle };
  };

  // Handler for Create Combined Backup button
  const handleCreateCombinedBackup = () => {
    const { backupTypes, backupTitle } = getCombinedBackupTypesAndTitle();
    setBackupNameModalDetails({
      title: backupTitle,
      subtitle: `Choose a name for your ${backupTypes
        .join(" + ")
        .toLowerCase()} backup`,
      onConfirm: (customName) => {
        setShowBackupNameModal(false);
        handleCombinedBackupWithName(customName);
      },
    });
    setShowBackupNameModal(true);
  };

  // Helper: Render Mode Switch Modal
  const renderModeSwitchModal = () => {
    if (!(showModeSwitchModal && modeSwitchDetails)) return null;
    const { currentMode, requiredMode, operation } = modeSwitchDetails;
    return (
      <ModeSwitchModal
        isOpen={showModeSwitchModal}
        currentMode={currentMode}
        requiredMode={requiredMode}
        operation={operation}
        onContinue={handleModeSwitchContinue}
        onCancel={handleModeSwitchCancel}
      />
    );
  };

  // Helper: Render Backup Name Modal
  const renderBackupNameModal = () => {
    if (!(showBackupNameModal && backupNameModalDetails)) return null;
    const { title, subtitle } = backupNameModalDetails;
    return (
      <BackupNameModal
        isOpen={showBackupNameModal}
        title={title}
        subtitle={subtitle}
        onConfirm={handleBackupNameConfirm}
        onCancel={handleBackupNameCancel}
      />
    );
  };

  // Helper: Conditional props for Snackbar
  const getSnackbarActionProps = () => (action ? { action } : {});

  return (
    <div className="backup-layout">
      {backupOrchestration.isBackupInProgress && (
        <BackupProgressCard
          currentOperation={backupOrchestration.currentOperation}
          backupProgress={backupOrchestration.backupProgress}
        />
      )}
      <QuickActionButtons
        canBackupPatterns={canBackupPatterns}
        canFullBackup={canFullBackup}
        isBackupInProgress={backupOrchestration.isBackupInProgress}
        onPatternBackup={handlePatternBackup}
        onSampleBackup={() => handleSampleBackup()}
        onFullBackup={handleFullBackup}
        deviceStatus={deviceStatus}
      />
      {!backupOrchestration.showCombinedBankGuide && (
        <div className="advanced-card">
          <div className="card-header">
            <div className="card-title">Combined Backup</div>
            <div className="card-subtitle">
              Multiple modes in one organized folder
            </div>
          </div>
          <div className="card-content">
            <CombinedBackupOptions
              includePatterns={includePatterns}
              setIncludePatterns={setIncludePatterns}
              includeSamples={includeSamples}
              setIncludeSamples={setIncludeSamples}
              availablePatterns={availablePatterns}
              selectedPatterns={selectedPatterns}
              setSelectedPatterns={setSelectedPatterns}
              canBackupPatterns={canBackupPatterns}
              isBackupInProgress={backupOrchestration.isBackupInProgress}
              availableBanks={availableBanks}
              selectedCombinedBanks={selectedCombinedBanks}
              setSelectedCombinedBanks={setSelectedCombinedBanks}
              deviceStatus={deviceStatus}
              log={log}
            />
          </div>
          <div className="card-actions">
            <button
              className="action-button primary"
              onClick={handleCreateCombinedBackup}
              disabled={
                (!includePatterns && !includeSamples) ||
                backupOrchestration.isBackupInProgress ||
                !deviceStatus.connected
              }
            >
              Create Combined Backup
            </button>
          </div>
        </div>
      )}
      {renderModeSwitchModal()}
      {renderBackupNameModal()}
      <Snackbar
        visible={visible}
        message={message}
        type={type}
        onClose={hideSnackbar}
        {...getSnackbarActionProps()}
      />
    </div>
  );
};
