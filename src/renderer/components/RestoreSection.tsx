import React, { useState, useEffect, useCallback } from "react";
import {
  DeviceStatus,
  RestoreResult,
  BackupInfo,
} from "../../shared/types/index";
import { ModeSwitchModal } from "./ModeSwitchModal";
import { RestoreSelectionModal } from "./RestoreSelectionModal";
import { useSnackbar } from "../context/SnackbarContext";

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

const MAX_SAMPLE_BATCH_BYTES = 10 * 1024 * 1024; // 10 MB hardware limit per session

/**
 * Split a list of bank IDs into sessions where cumulative selected sample size ≤ 10 MB.
 * A bank that alone exceeds the limit occupies its own session.
 */
function buildBatchesBySize(
  banks: string[],
  bankSizes: Record<string, number>
): string[][] {
  const batches: string[][] = [];
  let currentBatch: string[] = [];
  let currentSize = 0;
  for (const bank of banks) {
    const size = bankSizes[bank] ?? 0;
    if (currentBatch.length > 0 && currentSize + size > MAX_SAMPLE_BATCH_BYTES) {
      batches.push(currentBatch);
      currentBatch = [];
      currentSize = 0;
    }
    currentBatch.push(bank);
    currentSize += size;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

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
  const [isRestoreInProgress, setIsRestoreInProgress] = useState(false);
  const [currentOperation, setCurrentOperation] = useState<string>("");

  // Multi-batch sample restore state
  const [pendingBatches, setPendingBatches] = useState<{
    batches: string[][];
    backupPath: string;
    selectedSamples: { [bankId: string]: string[] };
  } | null>(null);

  // Pending pattern restore (queued after sample restore in combined flow)
  const [pendingPatternRestore, setPendingPatternRestore] = useState<{
    backupPath: string;
    patternIds: string[];
  } | null>(null);

  // Pattern restore queued to fire only AFTER all sample batches complete
  const [queuedPatternRestore, setQueuedPatternRestore] = useState<{
    backupPath: string;
    patternIds: string[];
  } | null>(null);

  // Mode switching state
  const [showModeSwitchModal, setShowModeSwitchModal] = useState(false);
  const [modeSwitchDetails, setModeSwitchDetails] = useState<{
    currentMode: string;
    requiredMode: string;
    operation: string;
    onContinue: () => void;
  } | null>(null);

  // Restore selection modal state
  const [showRestoreSelectionModal, setShowRestoreSelectionModal] =
    useState(false);

  // Restore complete dialog state
  const [showRestoreCompleteDialog, setShowRestoreCompleteDialog] =
    useState(false);
  const [restoreCompleteMessage, setRestoreCompleteMessage] = useState("");

  // Restore error dialog state
  const [showRestoreErrorDialog, setShowRestoreErrorDialog] = useState(false);
  const [restoreErrorMessage, setRestoreErrorMessage] = useState("");
  // Log of completed restore steps shown near the progress bar
  const [restoredLog, setRestoredLog] = useState<string[]>([]);
  // Accumulated message from the samples phase of a combined restore (shown together with patterns result)
  const [pendingSamplesMessage, setPendingSamplesMessage] = useState<
    string | null
  >(null);

  // Track whether device needs to disconnect (power off) before next batch
  const [requiresDeviceDisconnect, setRequiresDeviceDisconnect] =
    useState(false);

  // Rename state
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Overwrite confirmation before restore
  const [pendingRestoreSelection, setPendingRestoreSelection] = useState<{
    includePatterns: boolean;
    includeSamples: boolean;
    selectedPatterns: string[];
    selectedSampleBanks: string[];
    selectedSamples: { [bankId: string]: string[] };
    bankSizes: Record<string, number>;
  } | null>(null);

  const { showSnackbar } = useSnackbar();

  const showRestoreError = (msg: string) => {
    setPendingBatches(null);
    setPendingPatternRestore(null);
    setQueuedPatternRestore(null);
    setPendingSamplesMessage(null);
    setRestoredLog([]);
    setIsRestoreInProgress(false);
    setCurrentOperation("");
    setRestoreErrorMessage(msg);
    setShowRestoreErrorDialog(true);
  };

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

  // When device disconnects, clear the disconnect gate so continue buttons re-enable on reconnect
  useEffect(() => {
    if (!deviceStatus.connected) {
      setRequiresDeviceDisconnect(false);
    }
  }, [deviceStatus.connected]);

  // Require device power-off between batches / before pattern restore
  useEffect(() => {
    if (pendingBatches || pendingPatternRestore) {
      setRequiresDeviceDisconnect(true);
    }
  }, [pendingBatches, pendingPatternRestore]);

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

  // Mode switching handlers
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
      showSnackbar("Name contains invalid characters: / \\ : * ? \" < > |", "error");
      return;
    }
    if (trimmed.length > 128) {
      showSnackbar("Name must be 128 characters or fewer", "error");
      return;
    }
    try {
      await window.electronAPI.renameBackup(
        selectedBackup.path,
        trimmed,
      );
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

  const performCustomRestore = async (selection: {
    includePatterns: boolean;
    includeSamples: boolean;
    selectedPatterns: string[];
    selectedSampleBanks: string[];
    selectedSamples: { [bankId: string]: string[] };
    bankSizes: Record<string, number>;
  }) => {
    if (!selectedBackup) return;

    // Determine which mode is needed for the first restore operation
    let modeOperation: string | null = null;
    if (selection.includePatterns && !selection.includeSamples) {
      modeOperation = "pattern restore";
    } else if (selection.includeSamples) {
      // For combined, if already in pattern_import start with patterns; otherwise start with samples
      if (selection.includePatterns && deviceStatus.mode === "pattern_import") {
        modeOperation = "pattern restore";
      } else {
        modeOperation = "sample restore";
      }
    }

    if (modeOperation) {
      try {
        const req =
          await window.electronAPI.checkModeRequirement(modeOperation);
        if (req) {
          setShowRestoreSelectionModal(false);
          setModeSwitchDetails({
            currentMode: req.currentMode,
            requiredMode: req.requiredMode,
            operation: modeOperation,
            onContinue: () => performCustomRestore(selection),
          });
          setShowModeSwitchModal(true);
          return;
        }
      } catch {
        // fall through — let the individual restore calls surface any mode errors
      }
    }

    setIsRestoreInProgress(true);
    setCurrentOperation("Performing custom restore...");
    setRestoredLog([]);
    setShowRestoreSelectionModal(false);

    try {
      let result: RestoreResult = {
        success: true,
        message: "",
        itemCount: 0,
        timestamp: new Date(),
      };
      let patternsQueued = false;
      let hasMoreBatches = false;

      const patternIds =
        selection.selectedPatterns.length > 0
          ? selection.selectedPatterns
          : undefined;
      const selectedSamples = selection.selectedSamples ?? {};

      if (selection.includePatterns && selection.includeSamples) {
        // Combined restore — patterns and samples require different device modes.
        // Restore whichever matches the current device mode; queue the other.
        const currentMode = deviceStatus.mode;
        if (currentMode === "pattern_import") {
          setCurrentOperation("Restoring patterns...");
          result = await window.electronAPI.restorePatterns(
            selectedBackup.path,
            patternIds,
          );
          if (result.success)
            setRestoredLog((prev) => [
              ...prev,
              `Patterns (${result.itemCount})`,
            ]);
          // Queue sample restore for after mode switch
          const banksToRestore =
            selection.selectedSampleBanks.length > 0
              ? selection.selectedSampleBanks
              : ["A", "B", "C", "D", "E", "F", "G", "H"];
          setPendingBatches({
            batches: [banksToRestore],
            backupPath: selectedBackup.path,
            selectedSamples,
          });
        } else {
          // Assume sample_import mode — restore samples, queue patterns
          setCurrentOperation("Restoring samples...");
          const banksToRestore =
            selection.selectedSampleBanks.length > 0
              ? selection.selectedSampleBanks
              : ["A", "B", "C", "D", "E", "F", "G", "H"];
          const chunks = buildBatchesBySize(banksToRestore, selection.bankSizes);
          const firstChunk = chunks[0];
          const chunkResults = [];
          for (const bankId of firstChunk) {
            const bankResult = await window.electronAPI.restoreSamples(
              selectedBackup.path,
              bankId,
              selectedSamples[bankId],
            );
            chunkResults.push(bankResult);
            if (bankResult.success)
              setRestoredLog((prev) => [
                ...prev,
                `Bank ${bankId.toUpperCase()} (${bankResult.itemCount} samples)`,
              ]);
          }
          if (chunks.length > 1) {
            // More sample batches remain — queue pattern restore to fire after they all finish
            setPendingBatches({
              batches: chunks.slice(1),
              backupPath: selectedBackup.path,
              selectedSamples,
            });
            setQueuedPatternRestore({
              backupPath: selectedBackup.path,
              patternIds: selection.selectedPatterns,
            });
          } else {
            // Single chunk — all samples done, promote pattern restore immediately
            setPendingPatternRestore({
              backupPath: selectedBackup.path,
              patternIds: selection.selectedPatterns,
            });
          }
          patternsQueued = true;
          result = {
            success: chunkResults.every((r) => r.success),
            message: chunkResults.every((r) => r.success)
              ? chunkResults.map((r) => r.message).join("\n")
              : chunkResults.find((r) => !r.success)?.message ?? "Restore failed",
            type: "COMBINED" as any,
            itemCount: chunkResults.reduce(
              (sum, r) => sum + (r.itemCount || 0),
              0,
            ),
            timestamp: new Date(),
          };
        }
      } else if (selection.includePatterns) {
        // Pattern-only restore
        setCurrentOperation("Restoring selected patterns...");
        result = await window.electronAPI.restorePatterns(
          selectedBackup.path,
          patternIds,
        );
      } else if (selection.includeSamples) {
        // Sample-only restore
        setCurrentOperation("Restoring selected samples...");
        const banksToRestore =
          selection.selectedSampleBanks.length > 0
            ? selection.selectedSampleBanks
            : ["A", "B", "C", "D", "E", "F", "G", "H"];

        const chunks = buildBatchesBySize(banksToRestore, selection.bankSizes);

        const firstChunk = chunks[0];
        const chunkResults = [];
        for (const bankId of firstChunk) {
          const bankResult = await window.electronAPI.restoreSamples(
            selectedBackup.path,
            bankId,
            selectedSamples[bankId],
          );
          chunkResults.push(bankResult);
          if (bankResult.success)
            setRestoredLog((prev) => [
              ...prev,
              `Bank ${bankId.toUpperCase()} (${bankResult.itemCount} samples)`,
            ]);
        }

        if (chunks.length > 1) {
          hasMoreBatches = true;
          setPendingBatches({
            batches: chunks.slice(1),
            backupPath: selectedBackup.path,
            selectedSamples,
          });
        }

        result = {
          success: chunkResults.every((r) => r.success),
          message: chunkResults.every((r) => r.success)
            ? chunkResults.map((r) => r.message).join("\n")
            : chunkResults.find((r) => !r.success)?.message ?? "Restore failed",
          type: "SAMPLES_BANK" as any,
          itemCount: chunkResults.reduce(
            (sum, r) => sum + (r.itemCount || 0),
            0,
          ),
          timestamp: new Date(),
        };
      }

      onRestoreComplete(result);

      if (result.success) {
        if (patternsQueued) {
          // Patterns will follow — store samples message for combined dialog later
          setPendingSamplesMessage(result.message);
        } else if (!hasMoreBatches) {
          // Single-chunk restore: all done, show complete dialog
          setRestoreCompleteMessage(result.message);
          setShowRestoreCompleteDialog(true);
        }
        // Multi-chunk: more batches remain — pending modal handles the "continue" flow
      } else {
        showRestoreError(result.message);
      }
    } catch (error: any) {
      showRestoreError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRestoreInProgress(false);
      setCurrentOperation("");
    }
  };

  const performPendingPatternRestore = async () => {
    if (!pendingPatternRestore) return;
    try {
      const req =
        await window.electronAPI.checkModeRequirement("pattern restore");
      if (req) {
        setModeSwitchDetails({
          currentMode: req.currentMode,
          requiredMode: req.requiredMode,
          operation: "pattern restore",
          onContinue: performPendingPatternRestore,
        });
        setShowModeSwitchModal(true);
        return;
      }
    } catch {
      // fall through and let restorePatterns handle it
    }
    setIsRestoreInProgress(true);
    setCurrentOperation("Restoring patterns...");
    try {
      const patternIds =
        pendingPatternRestore.patternIds.length > 0
          ? pendingPatternRestore.patternIds
          : undefined;
      const result = await window.electronAPI.restorePatterns(
        pendingPatternRestore.backupPath,
        patternIds,
      );
      setPendingPatternRestore(null);
      if (result.success)
        setRestoredLog((prev) => [...prev, `Patterns (${result.itemCount})`]);
      onRestoreComplete(result);
      if (result.success) {
        const combinedMessage = pendingSamplesMessage
          ? `Samples restored:\n${pendingSamplesMessage}\n\nPatterns restored:\n${result.message}`
          : result.message;
        setPendingSamplesMessage(null);
        setRestoreCompleteMessage(combinedMessage);
        setShowRestoreCompleteDialog(true);
      } else {
        showRestoreError(result.message);
      }
    } catch (error: any) {
      showRestoreError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRestoreInProgress(false);
      setCurrentOperation("");
    }
  };

  const performNextBatchRestore = async () => {
    if (!pendingBatches) return;
    try {
      const req =
        await window.electronAPI.checkModeRequirement("sample restore");
      if (req) {
        setModeSwitchDetails({
          currentMode: req.currentMode,
          requiredMode: req.requiredMode,
          operation: "sample restore",
          onContinue: performNextBatchRestore,
        });
        setShowModeSwitchModal(true);
        return;
      }
    } catch {
      // fall through and let restoreSamples handle it
    }
    const { batches, backupPath, selectedSamples } = pendingBatches;
    const nextBatch = batches[0];
    const remaining = batches.slice(1);

    setIsRestoreInProgress(true);
    setCurrentOperation(`Restoring banks ${nextBatch.join(", ")}...`);

    try {
      const results = [];
      for (const bankId of nextBatch) {
        const bankResult = await window.electronAPI.restoreSamples(
          backupPath,
          bankId,
          selectedSamples[bankId],
        );
        results.push(bankResult);
        if (bankResult.success)
          setRestoredLog((prev) => [
            ...prev,
            `Bank ${bankId.toUpperCase()} (${bankResult.itemCount} samples)`,
          ]);
      }

      setPendingBatches(
        remaining.length > 0
          ? { batches: remaining, backupPath, selectedSamples }
          : null,
      );

      const result: RestoreResult = {
        success: results.every((r) => r.success),
        message: results.every((r) => r.success)
          ? results.map((r) => r.message).join("\n")
          : results.find((r) => !r.success)?.message ?? "Restore failed",
        itemCount: results.reduce((sum, r) => sum + (r.itemCount || 0), 0),
        timestamp: new Date(),
      };
      onRestoreComplete(result);

      if (result.success) {
        if (queuedPatternRestore) {
          // Accumulate samples message — don't show dialog until patterns are done too
          setPendingSamplesMessage((prev) =>
            prev ? `${prev}\n${result.message}` : result.message,
          );
          if (remaining.length === 0) {
            // All sample batches done — promote queued pattern restore
            setPendingPatternRestore(queuedPatternRestore);
            setQueuedPatternRestore(null);
          }
        } else if (remaining.length === 0) {
          // Last batch — all done
          setRestoreCompleteMessage(result.message);
          setShowRestoreCompleteDialog(true);
        }
        // More batches remain — pending modal handles the "continue" flow
      } else {
        showRestoreError(result.message);
      }
    } catch (error: any) {
      showRestoreError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRestoreInProgress(false);
      setCurrentOperation("");
    }
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

  const isPendingRestore = !!(pendingBatches || pendingPatternRestore);

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
          <p style={{ fontStyle: "italic", fontSize: 13 }}>No backups found. Use the Backup tab to create your first backup.</p>
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
                      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 8, marginBottom: 0 }}>
                        ✓ {restoredLog[restoredLog.length - 1]}
                      </p>
                    )}
                  </>
                ) : pendingPatternRestore ? (
                  <>
                    <h1 className="modal-text">
                      Step Complete — Pattern Restore Next
                    </h1>
                    <p style={{ marginBottom: 4 }}>
                      Restoring:{" "}
                      <strong>
                        {pendingPatternRestore.backupPath.split("/").pop()}
                      </strong>
                    </p>
                    <div className="info-box" style={{ margin: "8px 0" }}>
                      <p>
                        <strong>Sample restore complete.</strong> Press{" "}
                        <strong>[KYBD]</strong> on the P-6 to save, then wait
                        for the unit to finish — it will show{" "}
                        <strong>done</strong> on screen. Then power it off,
                        hold <strong>[REC]</strong> and power back on to enter
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
                        onClick={performPendingPatternRestore}
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
                ) : pendingBatches ? (
                  <>
                    <h1 className="modal-text">
                      Step Complete — More Banks to Restore
                    </h1>
                    <p style={{ marginBottom: 4 }}>
                      Restoring:{" "}
                      <strong>
                        {pendingBatches.backupPath.split("/").pop()}
                      </strong>
                    </p>
                    <div className="info-box" style={{ margin: "8px 0" }}>
                      <p>
                        <strong>Step complete.</strong> Press{" "}
                        <strong>[KYBD]</strong> on the P-6 to save, then wait
                        for the unit to finish — this can take up to 6 minutes.
                        It will show <strong>done</strong> on screen. Then
                        power it off, hold <strong>[SAMPLING]</strong> and
                        power back on to enter Sample Restore mode. Reconnect
                        via USB.
                      </p>
                      <p>
                        Remaining banks to restore:{" "}
                        <strong>
                          {pendingBatches.batches.flat().join(", ")}
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
                        onClick={performNextBatchRestore}
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
      {showRestoreCompleteDialog && (
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
                  {restoreCompleteMessage
                    .split("\n")
                    .filter(Boolean)
                    .map((line, i) => (
                      <p key={i} style={{ margin: "2px 0" }}>
                        {line}
                      </p>
                    ))}
                </div>
                <section
                  className="field-row"
                  style={{ justifyContent: "flex-end", marginTop: 12 }}
                >
                  <button
                    className="btn btn-default"
                    onClick={() => {
                      setShowRestoreCompleteDialog(false);
                      setPendingSamplesMessage(null);
                      setRestoredLog([]);
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

      {/* Restore Error Dialog */}
      {showRestoreErrorDialog && (
        <div className="mac-overlay">
          <div
            className="modal-dialog outer-border"
            style={{ width: "28rem", maxWidth: "90vw" }}
          >
            <div className="inner-border">
              <div className="modal-contents">
                <h1 className="modal-text">Restore Failed</h1>
                <p style={{ marginBottom: 10 }}>{restoreErrorMessage}</p>
                <section
                  className="field-row"
                  style={{ justifyContent: "flex-end", marginTop: 12 }}
                >
                  <button
                    className="btn btn-default"
                    onClick={() => setShowRestoreErrorDialog(false)}
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
          isOpen={showModeSwitchModal}
          requiredMode={modeSwitchDetails.requiredMode}
          liveMode={deviceStatus.mode ?? "unknown"}
          operation={modeSwitchDetails.operation}
          onCancel={handleModeSwitchCancel}
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
          <div className="modal-dialog outer-border" style={{ width: "28rem", maxWidth: "90vw" }}>
            <div className="inner-border">
              <div className="modal-contents">
                <h1 className="modal-text">Confirm Restore</h1>
                <p style={{ marginBottom: 10 }}>
                  This will overwrite existing data on your device
                  {pendingRestoreSelection.selectedSampleBanks.length > 0 &&
                    ` (Banks: ${pendingRestoreSelection.selectedSampleBanks.map((b) => b.toUpperCase()).join(", ")})`}.
                  This cannot be undone.
                </p>
                <section className="field-row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                  <button className="btn" onClick={() => setPendingRestoreSelection(null)}>
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
