import React, { useState, useEffect, useCallback } from "react";
import {
  DeviceStatus,
  RestoreResult,
  BackupInfo,
} from "../../shared/types/index";
import { ModeSwitchModal } from "./ModeSwitchModal";
import { RestoreSelectionModal } from "./RestoreSelectionModal";
import { useSnackbar } from "../context/SnackbarContext";
import {
  useRestoreOrchestration,
  RestoreSelection,
} from "../hooks/useRestoreOrchestration";

interface RestoreSectionProps {
  deviceStatus: DeviceStatus;
  onRestoreComplete: (result: RestoreResult) => void;
}

const BackupListItem: React.FC<{
  backup: BackupInfo;
  selected: boolean;
  onSelect: (backup: BackupInfo) => void;
  onDoubleClick: (backup: BackupInfo) => void;
  formatBackupType: (backup: BackupInfo) => string;
  formatBackupSize: (size: number) => string;
  formatTimestamp: (timestamp: Date) => string;
}> = ({
  backup,
  selected,
  onSelect,
  onDoubleClick,
  formatBackupType,
  formatBackupSize,
  formatTimestamp,
}) => (
  <div
    className={`backup-item${selected ? " selected" : ""}`}
    onClick={() => onSelect(backup)}
    onDoubleClick={() => onDoubleClick(backup)}
  >
    <div className="backup-item-name">{backup.name}</div>
    <div className="backup-item-meta">
      <span>{formatBackupType(backup)}</span>
      <span>{backup.itemCount} items</span>
      <span>{formatBackupSize(backup.size)}</span>
      {backup.sampleBanks.length > 0 && (
        <span>Banks: {backup.sampleBanks.join(", ")}</span>
      )}
      <span>{formatTimestamp(backup.timestamp)}</span>
    </div>
    {backup.description && (
      <div className="backup-item-desc">{backup.description}</div>
    )}
  </div>
);

export const RestoreSection: React.FC<RestoreSectionProps> = ({
  deviceStatus,
  onRestoreComplete,
}) => {
  const [availableBackups, setAvailableBackups] = useState<BackupInfo[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [backupFilter] = useState<"all">("all");
  const [sortBy, setSortBy] = useState<"timestamp" | "name" | "type">(
    "timestamp",
  );
  // Restore selection modal state
  const [showRestoreSelectionModal, setShowRestoreSelectionModal] =
    useState(false);

  // Rename state
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Overwrite confirmation before restore
  const [pendingRestoreSelection, setPendingRestoreSelection] =
    useState<RestoreSelection | null>(null);

  const { showSnackbar } = useSnackbar();

  const {
    currentStage,
    isPendingRestore,
    remainingBanks,
    backupPath: restoringPath,
    isRestoreInProgress,
    currentOperation,
    restoredLog,
    requiresDeviceDisconnect,
    completeMessage,
    errorMessage,
    dismissComplete,
    dismissError,
    modeSwitchDetails,
    cancelModeSwitch,
    startRestore,
    continueRestore,
  } = useRestoreOrchestration({ deviceStatus, onRestoreComplete });

  // File copy success event listener
  useEffect(() => {
    const handleFileCopySuccess = (data: {
      fileName: string;
      message: string;
    }) => {
      showSnackbar(data.message, "info");
    };

    window.electronAPI.onFileCopySuccess(handleFileCopySuccess);

    // Load available backups on component mount
    loadAvailableBackups();

    // Cleanup listener on component unmount
    return () => {
      window.electronAPI.removeAllListeners("file-copy-success");
    };
  }, []);

  // Load available backups
  const loadAvailableBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const backups = await window.electronAPI.discoverBackups();
      setAvailableBackups(backups);
    } catch (error: any) {
      showSnackbar(
        `Failed to load backups: ${error.message || error}`,
        "error",
      );
    } finally {
      setIsLoadingBackups(false);
    }
  };

  // Filter and sort backups
  const filteredAndSortedBackups = React.useMemo(() => {
    const filtered = availableBackups;

    // Apply sort
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "timestamp":
          return (
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
        case "name":
          return a.name.localeCompare(b.name);
        case "type":
          return a.type.localeCompare(b.type);
        default:
          return 0;
      }
    });
  }, [availableBackups, backupFilter, sortBy]);

  const handleModeSwitchContinue = () => {
    if (!modeSwitchDetails) return;
    const { onContinue } = modeSwitchDetails;
    cancelModeSwitch();
    onContinue();
  };

  const handleRenameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedBackup) return;
    setRenameValue(selectedBackup.name);
    setShowRenameDialog(true);
  };

  const handleRenameConfirm = async () => {
    const trimmed = renameValue.trim();
    if (!selectedBackup || !trimmed) return;
    if (/[/\\:*?"<>|]/.test(trimmed)) {
      showSnackbar(
        'Name contains invalid characters: / \\ : * ? " < > |',
        "error",
      );
      return;
    }
    if (trimmed.length > 128) {
      showSnackbar("Name must be 128 characters or fewer", "error");
      return;
    }
    try {
      await window.electronAPI.renameBackup(selectedBackup.path, trimmed);
      setShowRenameDialog(false);
      await loadAvailableBackups();
      setSelectedBackup(null);
    } catch (error: any) {
      showSnackbar(`Rename failed: ${error.message || error}`, "error");
    }
  };

  const handleBackupSelection = useCallback((backup: BackupInfo) => {
    setSelectedBackup((prev) => (prev?.path === backup.path ? null : backup));
  }, []);

  const handleRestoreClick = () => {
    if (selectedBackup) setShowRestoreSelectionModal(true);
  };

  const performCustomRestore = async (selection: RestoreSelection) => {
    if (!selectedBackup) return;
    setShowRestoreSelectionModal(false);
    await startRestore(selection, selectedBackup.path);
  };

  // Helper functions for formatting backup information
  const formatBackupSize = (size: number): string => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatBackupType = (backup: BackupInfo): string => {
    const types = [];
    if (backup.hasPatterns) types.push("Patterns");
    if (backup.hasSamples) types.push("Samples");
    return types.join(" + ") || backup.type;
  };

  const formatTimestamp = (timestamp: Date): string => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div style={{ display: "contents" }}>
      <div className="section-block section-block-fill">
        <div className="section-heading">Available Backups</div>
        {!isPendingRestore && (
          <div className="filter-row">
            <label>Sort:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="timestamp">Date</option>
              <option value="name">Name</option>
              <option value="type">Type</option>
            </select>
            <button
              className="btn"
              onClick={loadAvailableBackups}
              disabled={isLoadingBackups}
            >
              {isLoadingBackups ? "Loading…" : "Refresh"}
            </button>
          </div>
        )}

        {isLoadingBackups ? (
          <p>Loading available backups…</p>
        ) : filteredAndSortedBackups.length === 0 ? (
          <p style={{ fontStyle: "italic", fontSize: 13 }}>
            No backups found. Use the Backup tab to create your first backup.
          </p>
        ) : (
          <div className="backup-list">
            {filteredAndSortedBackups.map((backup) => (
              <BackupListItem
                key={backup.path}
                backup={backup}
                selected={selectedBackup?.path === backup.path}
                onSelect={handleBackupSelection}
                onDoubleClick={(backup) => {
                  setSelectedBackup(backup);
                  setShowRestoreSelectionModal(true);
                }}
                formatBackupType={formatBackupType}
                formatBackupSize={formatBackupSize}
                formatTimestamp={formatTimestamp}
              />
            ))}
          </div>
        )}

        {selectedBackup && (
          <div className="selected-indicator">
            <span>&#9654;</span>
            <span>
              Selected: <strong>{selectedBackup.name}</strong> (
              {formatBackupType(selectedBackup)})
            </span>
            <section className="field-row" style={{ marginLeft: "auto" }}>
              <button className="btn" onClick={handleRenameClick}>
                Rename
              </button>
              <button
                className="btn btn-default"
                onClick={handleRestoreClick}
                disabled={!deviceStatus.connected}
                title={
                  !deviceStatus.connected
                    ? "Device must be connected to restore"
                    : ""
                }
              >
                Restore
              </button>
            </section>
          </div>
        )}
      </div>

      {!isPendingRestore && !deviceStatus.connected && (
        <div className="info-box">
          <p>Device must be connected to perform restore operations.</p>
        </div>
      )}

      {/* Pending Restore Modal — covers backup list so user cannot interact with other backups */}
      {(isPendingRestore || isRestoreInProgress) && (
        <div className="mac-overlay">
          <div
            className="modal-dialog outer-border"
            style={{ width: "32rem", maxWidth: "90vw" }}
          >
            <div className="inner-border">
              <div className="modal-contents">
                {isRestoreInProgress ? (
                  <>
                    <h1 className="modal-text">Restore in Progress</h1>
                    <p style={{ marginBottom: 8 }}>{currentOperation}</p>
                    <div className="mac-progress mac-progress--indeterminate" />
                    {restoredLog.length > 0 && (
                      <p
                        style={{
                          fontSize: 12,
                          opacity: 0.7,
                          marginTop: 8,
                          marginBottom: 0,
                        }}
                      >
                        ✓ {restoredLog[restoredLog.length - 1]}
                      </p>
                    )}
                  </>
                ) : currentStage?.kind === "patterns" ? (
                  <>
                    <h1 className="modal-text">
                      Step Complete — Pattern Restore Next
                    </h1>
                    <p style={{ marginBottom: 4 }}>
                      Restoring:{" "}
                      <strong>
                        {restoringPath.split("/").pop()}
                      </strong>
                    </p>
                    <div className="info-box" style={{ margin: "8px 0" }}>
                      <p>
                        <strong>Sample restore complete.</strong> Press{" "}
                        <strong>[KYBD]</strong> on the P-6 to save, then wait
                        for the unit to finish — it will show{" "}
                        <strong>done</strong> on screen. Then power it off, hold{" "}
                        <strong>[REC]</strong> and power back on to enter
                        Pattern Restore mode. Reconnect via USB.
                      </p>
                    </div>
                    {!deviceStatus.connected && (
                      <p style={{ marginBottom: 8, fontStyle: "italic" }}>
                        Waiting for device to reconnect…
                      </p>
                    )}
                    <section
                      className="field-row"
                      style={{ justifyContent: "flex-end", marginTop: 12 }}
                    >
                      <button
                        className="btn btn-default"
                        onClick={continueRestore}
                        disabled={
                          isRestoreInProgress ||
                          requiresDeviceDisconnect ||
                          !deviceStatus.connected
                        }
                      >
                        {requiresDeviceDisconnect
                          ? "Waiting for device to power off…"
                          : "Continue — Restore Patterns"}
                      </button>
                    </section>
                  </>
                ) : currentStage?.kind === "samples" ? (
                  <>
                    <h1 className="modal-text">
                      Step Complete — More Banks to Restore
                    </h1>
                    <p style={{ marginBottom: 4 }}>
                      Restoring:{" "}
                      <strong>
                        {restoringPath.split("/").pop()}
                      </strong>
                    </p>
                    <div className="info-box" style={{ margin: "8px 0" }}>
                      <p>
                        <strong>Step complete.</strong> Press{" "}
                        <strong>[KYBD]</strong> on the P-6 to save, then wait
                        for the unit to finish. It will show{" "}
                        <strong>done</strong> on screen. Then power it off, hold{" "}
                        <strong>[SAMPLING]</strong> and power back on to enter
                        Sample Restore mode. Reconnect via USB.
                      </p>
                      <p>
                        Remaining banks to restore:{" "}
                        <strong>
                          {remainingBanks.join(", ")}
                        </strong>
                      </p>
                    </div>
                    {!deviceStatus.connected && (
                      <p style={{ marginBottom: 8, fontStyle: "italic" }}>
                        Waiting for device to reconnect…
                      </p>
                    )}
                    <section
                      className="field-row"
                      style={{ justifyContent: "flex-end", marginTop: 12 }}
                    >
                      <button
                        className="btn btn-default"
                        onClick={continueRestore}
                        disabled={
                          isRestoreInProgress ||
                          requiresDeviceDisconnect ||
                          !deviceStatus.connected
                        }
                      >
                        {requiresDeviceDisconnect
                          ? "Waiting for device to power off…"
                          : "Continue Restore (Next Batch)"}
                      </button>
                    </section>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore Complete Dialog */}
      {completeMessage !== null && (
        <div className="mac-overlay">
          <div
            className="modal-dialog outer-border"
            style={{ width: "28rem", maxWidth: "90vw" }}
          >
            <div className="inner-border">
              <div className="modal-contents">
                <h1 className="modal-text">Restore Complete</h1>
                <div
                  style={{
                    maxHeight: "14rem",
                    overflowY: "auto",
                    marginBottom: 10,
                  }}
                >
                  {completeMessage
                    .split("\n")
                    .filter(Boolean)
                    .map((line, i) => (
                      <p key={i} style={{ margin: "2px 0" }}>
                        {line}
                      </p>
                    ))}
                </div>
                <div className="info-box" style={{ margin: "8px 0" }}>
                  {restoredLog.some((entry) => entry.startsWith("Bank")) ? (
                    <p>
                      Press <strong>[KYBD]</strong> on the P-6 to save. Sample
                      writing can take <strong>up to 6 minutes</strong> — wait
                      for <strong>done</strong> to appear on screen before
                      powering off.
                    </p>
                  ) : (
                    <p>
                      Press <strong>[KYBD]</strong> on the P-6 to save, then
                      wait for <strong>done</strong> to appear on screen.
                    </p>
                  )}
                </div>
                <section
                  className="field-row"
                  style={{ justifyContent: "flex-end", marginTop: 12 }}
                >
                  <button
                    className="btn btn-default"
                    onClick={dismissComplete}
                  >
                    OK
                  </button>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore Error Dialog */}
      {errorMessage !== null && (
        <div className="mac-overlay">
          <div
            className="modal-dialog outer-border"
            style={{ width: "28rem", maxWidth: "90vw" }}
          >
            <div className="inner-border">
              <div className="modal-contents">
                <h1 className="modal-text">Restore Failed</h1>
                <p style={{ marginBottom: 10 }}>{errorMessage}</p>
                <section
                  className="field-row"
                  style={{ justifyContent: "flex-end", marginTop: 12 }}
                >
                  <button
                    className="btn btn-default"
                    onClick={dismissError}
                  >
                    OK
                  </button>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      {showRenameDialog && selectedBackup && (
        <div className="mac-overlay">
          <div
            className="modal-dialog outer-border"
            style={{ width: "28rem", maxWidth: "90vw" }}
          >
            <div className="inner-border">
              <div className="modal-contents">
                <h1 className="modal-text">Rename Backup</h1>
                <p style={{ marginBottom: 8 }}>
                  Enter a new name for this backup:
                </p>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRenameConfirm()}
                  placeholder="Backup name…"
                  maxLength={100}
                  autoFocus
                  style={{ width: "100%", marginBottom: 4 }}
                />
                <section
                  className="field-row"
                  style={{ justifyContent: "flex-end", marginTop: 12 }}
                >
                  <button
                    className="btn"
                    onClick={() => setShowRenameDialog(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-default"
                    onClick={handleRenameConfirm}
                    disabled={
                      !renameValue.trim() ||
                      renameValue.trim() === selectedBackup.name
                    }
                  >
                    Rename
                  </button>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mode Switch Modal */}
      {modeSwitchDetails && (
        <ModeSwitchModal
          isOpen={modeSwitchDetails !== null}
          requiredMode={modeSwitchDetails.requiredMode}
          liveMode={deviceStatus.mode ?? "unknown"}
          operation={modeSwitchDetails.operation}
          onCancel={cancelModeSwitch}
          onContinue={handleModeSwitchContinue}
        />
      )}

      {/* Restore Selection Modal */}
      {showRestoreSelectionModal && selectedBackup && (
        <RestoreSelectionModal
          isOpen={showRestoreSelectionModal}
          backup={selectedBackup}
          onConfirm={(sel) => {
            setShowRestoreSelectionModal(false);
            setPendingRestoreSelection(sel);
          }}
          onCancel={() => setShowRestoreSelectionModal(false)}
        />
      )}

      {/* Overwrite confirmation */}
      {pendingRestoreSelection && (
        <div className="mac-overlay">
          <div
            className="modal-dialog outer-border"
            style={{ width: "28rem", maxWidth: "90vw" }}
          >
            <div className="inner-border">
              <div className="modal-contents">
                <h1 className="modal-text">Confirm Restore</h1>
                <p style={{ marginBottom: 10 }}>
                  This will overwrite existing data on your device
                  {pendingRestoreSelection.selectedSampleBanks.length > 0 &&
                    ` (Banks: ${pendingRestoreSelection.selectedSampleBanks.map((b) => b.toUpperCase()).join(", ")})`}
                  . This cannot be undone.
                </p>
                <section
                  className="field-row"
                  style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}
                >
                  <button
                    className="btn"
                    onClick={() => setPendingRestoreSelection(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-default"
                    onClick={() => {
                      const sel = pendingRestoreSelection;
                      setPendingRestoreSelection(null);
                      performCustomRestore(sel);
                    }}
                  >
                    Restore
                  </button>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
