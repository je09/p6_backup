import React, { useState, useEffect, useCallback } from "react";
import { DeviceStatus, DeviceMode, BackupResult } from "../../shared/types/index";
import { BackupModals } from "./BackupModals";
import { useSnackbar } from "../context/SnackbarContext";
import {
  ERROR_MESSAGES,
  MODE_ENTRY_INSTRUCTIONS,
  DEVICE_MODES,
  isPatternMode,
  isSampleMode,
} from "../../shared/constants";
import { createComponentLogger } from "../utils/logger";
import { useBackupOrchestration } from "../hooks/useBackupOrchestration";
import { useBackupState } from "../hooks/useBackupState";
import { BackupProgressCard } from "./BackupProgressCard";
import { BackupOptions } from "./BackupOptions";
import { groupDependenciesByBank } from "../../shared/utils/prmParser";

interface BackupSectionProps {
  deviceStatus: DeviceStatus;
  onBackupComplete: (result: BackupResult) => void;
  onBackupInProgressChange?: (inProgress: boolean) => void;
}

export const BackupSection: React.FC<BackupSectionProps> = ({
  deviceStatus,
  onBackupComplete,
  onBackupInProgressChange,
}) => {
  const log = createComponentLogger("BackupSection");

  const { showSnackbar } = useSnackbar();

  const [resultDialog, setResultDialog] = useState<{
    type: "success" | "error";
    title: string;
    message: string;
  } | null>(null);

  const showBackupError = useCallback((msg: string) => {
    setResultDialog({ type: "error", title: "Backup Failed", message: msg });
  }, []);

  const {
    availablePatterns,
    selectedPatterns,
    setSelectedPatterns,
    detectedDependencies,
    isLoadingPatterns,
  } = useBackupState(deviceStatus);

  const canBackupPatterns = isPatternMode(deviceStatus.mode);

  const [showModeSwitchModal, setShowModeSwitchModal] = useState(false);
  const [modeSwitchDetails, setModeSwitchDetails] = useState<{
    currentMode: DeviceMode;
    requiredMode: DeviceMode;
    operation: string;
    onContinue: () => void;
  } | null>(null);

  const [showBackupNameModal, setShowBackupNameModal] = useState(false);
  const [backupNameModalDetails, setBackupNameModalDetails] = useState<{
    title: string;
    subtitle?: string;
    onConfirm: (customName: string | undefined) => void;
  } | null>(null);

  const [isDeviceReadyForContinue, setIsDeviceReadyForContinue] =
    useState(false);

  const handleBackupCompleteWrapped = useCallback((result: BackupResult) => {
    if (result.success) {
      const name = result.backupPath ? result.backupPath.split(/[\\/]/).pop() ?? "" : "";
      setResultDialog({ type: "success", title: "Backup Complete", message: name ? `Saved as: ${name}` : "Your backup has been saved successfully." });
    }
    onBackupComplete(result);
  }, [onBackupComplete, setResultDialog]);

  const {
    isBackingUp,
    backupProgress,
    currentOperation,
    showBackupGuide,
    bankQueue,
    currentBankIndex,
    backupMode,
    startBackup,
    handleContinue,
    handleCancel,
  } = useBackupOrchestration({
    deviceStatus,
    onBackupComplete: handleBackupCompleteWrapped,
    showSnackbar,
    log,
  });

  // File copy notifications are handled once at the app level: both this and
  // RestoreSection are mounted together, and each removing all listeners on the
  // shared channel would have deafened the other.

  const checkDeviceReadiness = useCallback(async () => {
    if (!deviceStatus.connected) {
      setIsDeviceReadyForContinue(false);
      return;
    }
    if (backupMode === "patterns") {
      setIsDeviceReadyForContinue(isPatternMode(deviceStatus.mode));
    } else if (backupMode === "samples") {
      if (!isSampleMode(deviceStatus.mode)) {
        setIsDeviceReadyForContinue(false);
        return;
      }
      try {
        const deviceCurrentBank = await window.electronAPI.getCurrentBank();
        const targetBank = bankQueue[currentBankIndex];
        setIsDeviceReadyForContinue(
          !!(
            deviceCurrentBank &&
            targetBank &&
            deviceCurrentBank.toLowerCase() === targetBank.toLowerCase()
          )
        );
      } catch {
        setIsDeviceReadyForContinue(false);
      }
    } else {
      setIsDeviceReadyForContinue(false);
    }
  }, [
    deviceStatus.connected,
    deviceStatus.mode,
    backupMode,
    bankQueue,
    currentBankIndex,
  ]);

  useEffect(() => {
    if (showBackupGuide) checkDeviceReadiness();
  }, [
    deviceStatus.connected,
    deviceStatus.mode,
    backupMode,
    currentBankIndex,
    showBackupGuide,
    checkDeviceReadiness,
  ]);

  useEffect(() => {
    if (showBackupGuide && backupMode === "samples") {
      const id = setInterval(checkDeviceReadiness, 2000);
      return () => clearInterval(id);
    }
  }, [showBackupGuide, backupMode, checkDeviceReadiness]);

  useEffect(() => {
    onBackupInProgressChange?.(showBackupGuide);
  }, [showBackupGuide, onBackupInProgressChange]);

  const handleModeSwitchCancel = () => {
    setShowModeSwitchModal(false);
    setModeSwitchDetails(null);
  };

  const handleModeSwitchContinue = () => {
    if (!modeSwitchDetails) return;
    setShowModeSwitchModal(false);
    const onContinue = modeSwitchDetails.onContinue;
    setModeSwitchDetails(null);
    onContinue();
  };

  const handleBackupNameConfirm = (customName: string | undefined) => {
    setShowBackupNameModal(false);
    backupNameModalDetails?.onConfirm(customName);
    setBackupNameModalDetails(null);
  };

  const handleBackupNameCancel = () => {
    setShowBackupNameModal(false);
    setBackupNameModalDetails(null);
  };

  // Snapshot state at click time to avoid stale closure issues
  const handleCreateBackup = () => {
    const snapPatternIds = selectedPatterns.slice();
    // Unique bank letters derived from pattern metadata dependencies (lower-cased)
    const depBanks = [...new Set(detectedDependencies.map((d) => d.bankLetter.toLowerCase()))].sort();
    // Samples are included whenever dependencies are detected from selected patterns
    const snapSamples = depBanks.length > 0;
    // Per-bank pad lists (uppercase keys, e.g. { "A": [1, 3] })
    const snapBankPads = groupDependenciesByBank(detectedDependencies);

    const doStart = async (customName?: string) => {
      const resolvedBanks = snapSamples ? depBanks : [];

      // Patterns-only needs a single device session, so it skips the guide.
      if (!snapSamples) {
        try {
          const result = await window.electronAPI.backupPatterns(
            customName,
            snapPatternIds.length > 0 ? snapPatternIds : undefined
          );
          onBackupComplete(result);
          if (result.success) {
            setResultDialog({
              type: "success",
              title: "Backup Complete",
              message: customName
                ? `Saved as: ${customName}`
                : "Your backup has been saved successfully.",
            });
          } else {
            showBackupError(result.message || "Backup failed");
          }
        } catch (error: any) {
          showBackupError(error?.message || ERROR_MESSAGES.UNKNOWN_ERROR);
        }
        return;
      }

      // Patterns + samples: hand off to the multi-session orchestration.
      startBackup(resolvedBanks, "patterns", customName, snapPatternIds, snapBankPads);
    };

    setBackupNameModalDetails({
      title: "Backup",
      subtitle: "Choose a name for your backup",
      onConfirm: async (customName) => {
        setShowBackupNameModal(false);
        if (!deviceStatus.connected) {
          showSnackbar(ERROR_MESSAGES.DEVICE_NOT_CONNECTED, "error");
          return;
        }
        try {
          const req = await window.electronAPI.checkModeRequirement("pattern backup");
          if (req) {
            setModeSwitchDetails({
              currentMode: req.currentMode,
              requiredMode: req.requiredMode,
              operation: "Pattern Backup",
              onContinue: () => doStart(customName),
            });
            setShowModeSwitchModal(true);
            return;
          }
          doStart(customName);
        } catch (error: any) {
          showBackupError(error.message || ERROR_MESSAGES.UNKNOWN_ERROR);
        }
      },
    });
    setShowBackupNameModal(true);
  };

  const getDeviceStatusHint = () => {
    if (isBackingUp) return null;
    if (!deviceStatus.connected) return "Device not connected.";
    if (isDeviceReadyForContinue) return null;
    if (backupMode === "patterns")
      return `Switch device to Pattern Backup mode: ${MODE_ENTRY_INSTRUCTIONS[DEVICE_MODES.PATTERN_EXPORT]}.`;
    if (backupMode === "samples")
      return `Select Bank ${bankQueue[currentBankIndex]?.toUpperCase()} on the device.`;
    return "Device not ready.";
  };

  const getButtonDisabledReason = () => {
    if (!deviceStatus.connected) return "Device must be connected";
    if (backupMode === "patterns" && !isPatternMode(deviceStatus.mode))
      return `Device must be in a pattern mode — ${MODE_ENTRY_INSTRUCTIONS[DEVICE_MODES.PATTERN_EXPORT]}`;
    if (backupMode === "samples") {
      if (!isSampleMode(deviceStatus.mode))
        return `Device must be in a sample mode — ${MODE_ENTRY_INSTRUCTIONS[DEVICE_MODES.SAMPLE_EXPORT]}`;
      return `Device must have bank ${bankQueue[currentBankIndex]?.toUpperCase()} selected`;
    }
    return "Device not ready";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="section-block">
        <div className="section-heading">Backup</div>
        {showBackupGuide && (
          <>
            <p className="guide-instruction">{currentOperation}</p>
            {isBackingUp && (
              <BackupProgressCard
                currentOperation={currentOperation}
                backupProgress={backupProgress}
              />
            )}
            {getDeviceStatusHint() && (
              <p className="guide-instruction" style={{ fontStyle: "italic" }}>
                {getDeviceStatusHint()}
              </p>
            )}
            <section className="field-row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
              <button
                className="btn btn-default"
                onClick={handleCancel}
                disabled={isBackingUp}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleContinue}
                disabled={!isDeviceReadyForContinue || isBackingUp}
                title={!isDeviceReadyForContinue ? getButtonDisabledReason() : ""}
              >
                {isBackingUp ? "Backing up…" : "Continue"}
              </button>
            </section>
            <hr className="create-backup-divider" />
          </>
        )}
        {!showBackupGuide && (
          <BackupOptions
            availablePatterns={availablePatterns}
            selectedPatterns={selectedPatterns}
            setSelectedPatterns={setSelectedPatterns}
            canBackupPatterns={canBackupPatterns}
            isBackupInProgress={isBackingUp}
            isLoadingPatterns={isLoadingPatterns}
            detectedDependencies={detectedDependencies}
            deviceStatus={deviceStatus}
          />
        )}
        {!showBackupGuide && (
          <div className="create-backup-footer">
            <hr className="create-backup-divider" />
            <button
              className="btn btn-default create-backup-btn"
              onClick={handleCreateBackup}
              disabled={isBackingUp || !deviceStatus.connected || selectedPatterns.length === 0}
              title={selectedPatterns.length === 0 ? "Select at least one pattern to back up" : undefined}
            >
              Create Backup
            </button>
          </div>
        )}
      </div>
      {resultDialog && (
        <div className="mac-overlay">
          <div className="modal-dialog outer-border" style={{ width: "26rem", maxWidth: "90vw" }}>
            <div className="inner-border">
              <div className="modal-contents">
                <h1 className="modal-text">{resultDialog.title}</h1>
                <p style={{ marginBottom: 10 }}>{resultDialog.message}</p>
                <section className="field-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                  <button
                    className="btn btn-default"
                    onClick={() => {
                      if (resultDialog.type === "error") handleCancel();
                      setResultDialog(null);
                    }}
                  >
                    OK
                  </button>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
      <BackupModals
        showModeSwitchModal={showModeSwitchModal}
        modeSwitchDetails={modeSwitchDetails}
        liveMode={deviceStatus.mode}
        onModeSwitchContinue={handleModeSwitchContinue}
        onModeSwitchCancel={handleModeSwitchCancel}
        showBackupNameModal={showBackupNameModal}
        backupNameModalDetails={backupNameModalDetails}
        onBackupNameConfirm={handleBackupNameConfirm}
        onBackupNameCancel={handleBackupNameCancel}
      />
    </div>
  );
};
