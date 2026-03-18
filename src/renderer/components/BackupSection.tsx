import React, { useState, useEffect, useCallback } from "react";
import { DeviceStatus, BackupResult } from "../../shared/types/index";
import { BackupModals } from "./BackupModals";
import { useSnackbar } from "../context/SnackbarContext";
import { ERROR_MESSAGES } from "../../shared/constants";
import { ModeError } from "../../shared/errors/ModeError";
import { createComponentLogger } from "../utils/logger";
import { useBackupOrchestration } from "../hooks/useBackupOrchestration";
import { useBackupState } from "../hooks/useBackupState";
import { BackupProgressCard } from "./BackupProgressCard";
import { BackupOptions } from "./BackupOptions";

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

  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [completeBackupName, setCompleteBackupName] = useState("");

  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const showBackupError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setShowErrorDialog(true);
  }, []);

  const {
    availableBanks,
    availablePatterns,
    selectedPatterns,
    setSelectedPatterns,
    includePatterns,
    setIncludePatterns,
    includeSamples,
    setIncludeSamples,
    selectedCombinedBanks,
    setSelectedCombinedBanks,
  } = useBackupState(deviceStatus);

  const canBackupPatterns = ["pattern", "pattern_export", "pattern_import"].includes(
    deviceStatus.mode || ""
  );

  const [showModeSwitchModal, setShowModeSwitchModal] = useState(false);
  const [modeSwitchDetails, setModeSwitchDetails] = useState<{
    currentMode: string;
    requiredMode: string;
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
      setCompleteBackupName(name);
      setShowCompleteDialog(true);
    }
    onBackupComplete(result);
  }, [onBackupComplete]);

  const {
    isBackingUp,
    backupProgress,
    currentOperation,
    showBackupGuide,
    bankQueue,
    currentBankIndex,
    backupMode,
    startBackup,
    resetProgress,
    handleContinue,
    handleCancel,
  } = useBackupOrchestration({
    deviceStatus,
    onBackupComplete: handleBackupCompleteWrapped,
    showSnackbar,
    log,
  });

  useEffect(() => {
    window.electronAPI.onFileCopySuccess((data: { message: string }) =>
      showSnackbar(data.message, "info")
    );
    return () => window.electronAPI.removeAllListeners("file-copy-success");
  }, [showSnackbar]);

  const checkDeviceReadiness = useCallback(async () => {
    if (!deviceStatus.connected) {
      setIsDeviceReadyForContinue(false);
      return;
    }
    if (backupMode === "patterns") {
      const isReady = ["pattern", "pattern_export", "pattern_import"].includes(
        deviceStatus.mode || ""
      );
      setIsDeviceReadyForContinue(isReady);
    } else if (backupMode === "samples") {
      if (
        !["sample", "sample_export", "sample_import"].includes(
          deviceStatus.mode || ""
        )
      ) {
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
    const snapPatterns = includePatterns;
    const snapSamples = includeSamples;
    const snapBanks = selectedCombinedBanks.slice();
    const snapPatternIds = selectedPatterns.slice();
    const allBanks = ["a", "b", "c", "d", "e", "f", "g", "h"];

    const doStart = async (customName?: string) => {
      const resolvedBanks = snapSamples
        ? snapBanks.length > 0 ? snapBanks : allBanks
        : [];

      // Patterns-only: use direct backup API — no need for multi-step orchestration
      if (snapPatterns && !snapSamples) {
        try {
          const patternIds = snapPatternIds.length > 0 ? snapPatternIds : undefined;
          const result = await window.electronAPI.backupPatterns(customName, patternIds);
          onBackupComplete(result);
          if (result.success) {
            setCompleteBackupName(customName ?? "Backup");
            setShowCompleteDialog(true);
          } else {
            showBackupError(result.message || "Backup failed");
          }
        } catch (error: any) {
          const modeInfo = ModeError.fromError(error);
          if (modeInfo) {
            setModeSwitchDetails({
              currentMode: modeInfo.currentMode,
              requiredMode: modeInfo.requiredMode,
              operation: "Pattern Backup",
              onContinue: () => doStart(customName),
            });
            setShowModeSwitchModal(true);
            return;
          }
          showBackupError(error.message || ERROR_MESSAGES.UNKNOWN_ERROR);
        }
        return;
      }

      // Samples-only with a single bank: use direct API — device is already in sample mode for that bank
      if (!snapPatterns && snapSamples && resolvedBanks.length === 1) {
        try {
          const result = await window.electronAPI.backupSamples(resolvedBanks[0], customName);
          onBackupComplete(result);
          if (result.success) {
            setCompleteBackupName(customName ?? "Backup");
            setShowCompleteDialog(true);
          } else {
            showBackupError(result.message || "Backup failed");
          }
        } catch (error: any) {
          const modeInfo = ModeError.fromError(error);
          if (modeInfo) {
            setModeSwitchDetails({
              currentMode: modeInfo.currentMode,
              requiredMode: modeInfo.requiredMode,
              operation: "Sample Backup",
              onContinue: () => doStart(customName),
            });
            setShowModeSwitchModal(true);
            return;
          }
          showBackupError(error.message || ERROR_MESSAGES.UNKNOWN_ERROR);
        }
        return;
      }

      // Combined or multi-bank samples: use multi-step orchestration
      try {
        if (snapPatterns) {
          startBackup(resolvedBanks, "patterns", customName, snapPatternIds);
        } else {
          startBackup(resolvedBanks, "samples", customName);
        }
      } catch (error: any) {
        const modeInfo = ModeError.fromError(error);
        if (modeInfo) {
          setModeSwitchDetails({
            currentMode: modeInfo.currentMode,
            requiredMode: modeInfo.requiredMode,
            operation: "Backup",
            onContinue: () => doStart(customName),
          });
          setShowModeSwitchModal(true);
          return;
        }
        showBackupError(error.message || ERROR_MESSAGES.UNKNOWN_ERROR);
      } finally {
        resetProgress();
      }
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
          const modeToCheck = snapPatterns ? "pattern backup" : "sample backup";
          const req = await window.electronAPI.checkModeRequirement(modeToCheck);
          if (req) {
            setModeSwitchDetails({
              currentMode: req.currentMode,
              requiredMode: req.requiredMode,
              operation: snapPatterns ? "Pattern Backup" : "Sample Backup",
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

  const getButtonText = () => {
    if (isBackingUp) return "Backing up…";
    if (!deviceStatus.connected) return "Device Not Connected";
    if (!isDeviceReadyForContinue) {
      if (backupMode === "patterns") return "Switch to Pattern Mode";
      if (backupMode === "samples")
        return `Select Bank ${bankQueue[currentBankIndex]?.toUpperCase()}`;
      return "Device Not Ready";
    }
    return "Continue";
  };

  const getButtonDisabledReason = () => {
    if (!deviceStatus.connected) return "Device must be connected";
    if (backupMode === "patterns") {
      if (!["pattern", "pattern_export", "pattern_import"].includes(deviceStatus.mode || ""))
        return "Device must be in Pattern mode (hold PLAY while powering on)";
    } else if (backupMode === "samples") {
      if (!["sample", "sample_export", "sample_import"].includes(deviceStatus.mode || ""))
        return "Device must be in Sample mode (hold BANK + SAMPLING while powering on)";
      return `Device must have bank ${bankQueue[currentBankIndex]?.toUpperCase()} selected`;
    }
    return "Device not ready";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {showBackupGuide && (
        <div className="section-block">
          <div className="section-heading">Backup</div>
          <p className="guide-instruction">{currentOperation}</p>
          {isBackingUp && (
            <BackupProgressCard
              currentOperation={currentOperation}
              backupProgress={backupProgress}
            />
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
              {getButtonText()}
            </button>
          </section>
        </div>
      )}
      {!showBackupGuide && (
        <div className="section-block">
          <div className="section-heading">Backup</div>
          <BackupOptions
            includePatterns={includePatterns}
            setIncludePatterns={setIncludePatterns}
            includeSamples={includeSamples}
            setIncludeSamples={setIncludeSamples}
            availablePatterns={availablePatterns}
            selectedPatterns={selectedPatterns}
            setSelectedPatterns={setSelectedPatterns}
            canBackupPatterns={canBackupPatterns}
            isBackupInProgress={isBackingUp}
            availableBanks={availableBanks}
            selectedCombinedBanks={selectedCombinedBanks}
            setSelectedCombinedBanks={setSelectedCombinedBanks}
            deviceStatus={deviceStatus}
            log={log}
          />
          <div className="create-backup-footer">
            <hr className="create-backup-divider" />
            <button
              className="btn btn-default create-backup-btn"
              onClick={handleCreateBackup}
              disabled={isBackingUp || !deviceStatus.connected || (!includePatterns && !includeSamples)}
            >
              Create Backup
            </button>
          </div>
        </div>
      )}
      {showCompleteDialog && (
        <div className="mac-overlay">
          <div className="modal-dialog outer-border" style={{ width: "26rem", maxWidth: "90vw" }}>
            <div className="inner-border">
              <div className="modal-contents">
                <h1 className="modal-text">Backup Complete</h1>
                <p>Your backup has been saved successfully.</p>
                {completeBackupName && (
                  <p style={{ fontSize: 12, color: "#555" }}>
                    Saved as: <strong>{completeBackupName}</strong>
                  </p>
                )}
                <section className="field-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                  <button
                    className="btn btn-default"
                    onClick={() => setShowCompleteDialog(false)}
                  >
                    OK
                  </button>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
      {showErrorDialog && (
        <div className="mac-overlay">
          <div className="modal-dialog outer-border" style={{ width: "26rem", maxWidth: "90vw" }}>
            <div className="inner-border">
              <div className="modal-contents">
                <h1 className="modal-text">Backup Failed</h1>
                <p style={{ marginBottom: 10 }}>{errorMessage}</p>
                <section className="field-row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                  <button
                    className="btn btn-default"
                    onClick={() => { setShowErrorDialog(false); handleCancel(); }}
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
        liveMode={deviceStatus.mode ?? "unknown"}
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
