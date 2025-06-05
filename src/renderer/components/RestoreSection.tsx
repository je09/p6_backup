import React, { useState, useEffect, useCallback } from "react";
import {
  DeviceStatus,
  RestoreResult,
  BackupInfo,
} from "../../shared/types/index";
import { ModeSwitchModal } from "./ModeSwitchModal";
import { RestoreSelectionModal } from "./RestoreSelectionModal";
import { Snackbar } from "./Snackbar";
import { createComponentLogger } from "../utils/logger";

interface RestoreSectionProps {
  deviceStatus: DeviceStatus;
  onRestoreComplete: (result: RestoreResult) => void;
}

const BackupListItem: React.FC<{
  backup: BackupInfo;
  selected: boolean;
  onSelect: (backup: BackupInfo) => void;
  formatBackupType: (backup: BackupInfo) => string;
  formatBackupSize: (size: number) => string;
  formatTimestamp: (timestamp: Date) => string;
}> = ({
  backup,
  selected,
  onSelect,
  formatBackupType,
  formatBackupSize,
  formatTimestamp,
}) => (
  <div
    className={`backup-item${selected ? " selected" : ""}`}
    onClick={() => onSelect(backup)}
  >
    <div className="backup-header">
      <div className="backup-name">{backup.name}</div>
      <div className="backup-timestamp">
        {formatTimestamp(backup.timestamp)}
      </div>
    </div>
    <div className="backup-details">
      <div className="backup-type">{formatBackupType(backup)}</div>
      <div className="backup-info">
        <span>{backup.itemCount} items</span>
        <span>•</span>
        <span>{formatBackupSize(backup.size)}</span>
        {backup.sampleBanks.length > 0 && (
          <>
            <span>•</span>
            <span>Banks: {backup.sampleBanks.join(", ")}</span>
          </>
        )}
      </div>
    </div>
    {backup.description && (
      <div className="backup-description">{backup.description}</div>
    )}
  </div>
);

export const RestoreSection: React.FC<RestoreSectionProps> = ({
  deviceStatus,
  onRestoreComplete,
}) => {
  const logger = createComponentLogger("RestoreSection");
  const [availableBackups, setAvailableBackups] = useState<BackupInfo[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupInfo | null>(null);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [backupFilter, setBackupFilter] = useState<
    "all" | "patterns" | "samples" | "combined"
  >("all");
  const [sortBy, setSortBy] = useState<"timestamp" | "name" | "type">(
    "timestamp"
  );
  const [isRestoreInProgress, setIsRestoreInProgress] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [currentOperation, setCurrentOperation] = useState<string>("");

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
  const [restoreModalType, setRestoreModalType] = useState<
    "detailed" | "simple"
  >("detailed");

  // Snackbar state
  const [snackbar, setSnackbar] = useState<{
    message: string;
    type: "success" | "error" | "warning" | "info";
    visible: boolean;
    action?: { label: string; onClick: () => void };
  }>({
    message: "",
    type: "info",
    visible: false,
  });

  // Snackbar helper functions
  const showSnackbar = (
    message: string,
    type: "success" | "error" | "warning" | "info" = "info",
    action?: { label: string; onClick: () => void }
  ) => {
    setSnackbar({ message, type, visible: true, action });
  };

  const hideSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, visible: false }));
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

  // Load available backups
  const loadAvailableBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const backups = await window.electronAPI.discoverBackups();
      setAvailableBackups(backups);
    } catch (error: any) {
      showSnackbar(
        `Failed to load backups: ${error.message || error}`,
        "error"
      );
    } finally {
      setIsLoadingBackups(false);
    }
  };

  // Filter and sort backups
  const filteredAndSortedBackups = React.useMemo(() => {
    let filtered = availableBackups;

    // Apply filter
    if (backupFilter !== "all") {
      filtered = availableBackups.filter((backup) => {
        switch (backupFilter) {
          case "patterns":
            return backup.hasPatterns && !backup.hasSamples;
          case "samples":
            return backup.hasSamples && !backup.hasPatterns;
          case "combined":
            return backup.hasPatterns && backup.hasSamples;
          default:
            return true;
        }
      });
    }

    // Apply sort
    return filtered.sort((a, b) => {
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

  const handleModeSwitchContinue = async () => {
    if (!modeSwitchDetails) return;

    setShowModeSwitchModal(false);
    setCurrentOperation("Waiting for device mode switch...");

    try {
      // Wait for the device to be in the required mode
      const waitResult = await window.electronAPI.waitForMode(
        modeSwitchDetails.requiredMode
      );

      if (waitResult.success) {
        setCurrentOperation("");
        // Execute the original operation
        modeSwitchDetails.onContinue();
      } else {
        setCurrentOperation("");
        showSnackbar(
          waitResult.timedOut
            ? "Timeout waiting for device mode switch. Please ensure device is in the correct mode and try again."
            : "Failed to detect required device mode. Please check device connection and mode.",
          "error"
        );
      }
    } catch (error: any) {
      setCurrentOperation("");
      showSnackbar(`Mode switch failed: ${error.message || error}`, "error");
    } finally {
      setModeSwitchDetails(null);
    }
  };

  const handleBackupSelection = useCallback(
    async (backup: BackupInfo) => {
      logger.debug("handleBackupSelection called with:", backup.name);
      logger.debug("Device status:", deviceStatus);

      // Set the selected backup
      setSelectedBackup(backup);

      // Automatically trigger detailed restore if device is connected
      if (deviceStatus.connected) {
        logger.debug("Device is connected, showing modal");
        // Show detailed selection modal immediately
        setRestoreModalType("detailed");
        setShowRestoreSelectionModal(true);
      } else {
        logger.debug("Device is not connected, modal not shown");
      }
    },
    [deviceStatus]
  );

  const performCustomRestore = async (selection: {
    includePatterns: boolean;
    includeSamples: boolean;
    selectedPatterns: string[];
    selectedSampleBanks: string[];
    selectedSamples: { [bankId: string]: string[] };
  }) => {
    if (!selectedBackup) return;

    setIsRestoreInProgress(true);
    setCurrentOperation("Performing custom restore...");
    setRestoreProgress(0);

    try {
      let result: RestoreResult = {
        success: true,
        message: "",
        type: "COMBINED" as any,
        itemCount: 0,
        timestamp: new Date(),
      };

      if (selection.includePatterns && selection.includeSamples) {
        // Combined restore with selection
        setCurrentOperation("Restoring selected patterns and samples...");
        // For now, use the existing methods separately
        const patternResult = await window.electronAPI.restorePatterns(
          selectedBackup.path
        );
        const sampleResult = await window.electronAPI.restoreSamples(
          selectedBackup.path
        );
        result = {
          success: patternResult.success && sampleResult.success,
          message: `${patternResult.message}\n${sampleResult.message}`,
          type: "COMBINED" as any,
          itemCount:
            (patternResult.itemCount || 0) + (sampleResult.itemCount || 0),
          timestamp: new Date(),
        };
      } else if (selection.includePatterns) {
        // Pattern-only restore
        setCurrentOperation("Restoring selected patterns...");
        result = await window.electronAPI.restorePatterns(selectedBackup.path);
      } else if (selection.includeSamples) {
        // Sample-only restore
        setCurrentOperation("Restoring selected samples...");
        if (selection.selectedSampleBanks.length > 0) {
          // Restore specific banks
          const results = [];
          for (const bankId of selection.selectedSampleBanks) {
            const bankResult = await window.electronAPI.restoreSamples(
              selectedBackup.path,
              bankId
            );
            results.push(bankResult);
          }
          result = {
            success: results.every((r) => r.success),
            message: results.map((r) => r.message).join("\n"),
            type: "SAMPLES_BANK" as any,
            itemCount: results.reduce((sum, r) => sum + (r.itemCount || 0), 0),
            timestamp: new Date(),
          };
        } else {
          // Restore all samples
          result = await window.electronAPI.restoreSamples(selectedBackup.path);
        }
      }

      setRestoreProgress(100);
      onRestoreComplete(result);

      if (result.success) {
        showSnackbar(
          `Restore completed successfully!\n${result.message}`,
          "success"
        );
      } else {
        showSnackbar(`Restore failed: ${result.message}`, "error");
      }
    } catch (error: any) {
      showSnackbar(`Restore failed: ${error.message || error}`, "error");
    } finally {
      setIsRestoreInProgress(false);
      setCurrentOperation("");
      setRestoreProgress(0);
      setShowRestoreSelectionModal(false);
    }
  };

  const canRestorePatterns =
    deviceStatus.connected &&
    (deviceStatus.mode === "pattern" ||
      deviceStatus.mode === "pattern_export" ||
      deviceStatus.mode === "pattern_import");
  const canRestoreSamples =
    deviceStatus.connected &&
    (deviceStatus.mode === "sample" ||
      deviceStatus.mode === "sample_export" ||
      deviceStatus.mode === "sample_import");

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
    <div className="backup-layout">
      <div className="md-card">
        <div className="md-card-content">
          <div className="md-card-header">
            <h3 className="md-text-title">Available Backups</h3>
            <p className="md-text-body">
              Select a backup to restore from your P6 backup library
            </p>
          </div>

          {/* Filter and Sort Controls */}
          <div className="backup-filters">
            <div className="filter-group">
              <label className="md-text-body-small">Filter by type:</label>
              <select
                value={backupFilter}
                onChange={(e) => setBackupFilter(e.target.value as any)}
                className="md-select"
              >
                <option value="all">All Backups</option>
                <option value="patterns">Patterns Only</option>
                <option value="samples">Samples Only</option>
                <option value="combined">Combined</option>
              </select>
            </div>
            <div className="filter-group">
              <label className="md-text-body-small">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="md-select"
              >
                <option value="timestamp">Date (Newest First)</option>
                <option value="name">Name</option>
                <option value="type">Type</option>
              </select>
            </div>
            <button
              className="md-button md-button-text"
              onClick={loadAvailableBackups}
              disabled={isLoadingBackups}
            >
              {isLoadingBackups ? "Loading..." : "Refresh"}
            </button>
          </div>

          {/* Backup List */}
          {isLoadingBackups ? (
            <div className="backup-loading">
              <div className="md-text-body">Loading available backups...</div>
            </div>
          ) : filteredAndSortedBackups.length === 0 ? (
            <div className="backup-empty">
              <div className="md-text-body">
                No backups found matching your criteria.
              </div>
              <div className="md-text-body-small">
                Create some backups first or try adjusting your filters.
              </div>
            </div>
          ) : (
            <div className="backup-list">
              {filteredAndSortedBackups.map((backup) => (
                <BackupListItem
                  key={backup.path}
                  backup={backup}
                  selected={selectedBackup?.path === backup.path}
                  onSelect={handleBackupSelection}
                  formatBackupType={formatBackupType}
                  formatBackupSize={formatBackupSize}
                  formatTimestamp={formatTimestamp}
                />
              ))}
            </div>
          )}

          {selectedBackup && (
            <div className="md-status-indicator md-status-success">
              <div className="md-status-dot"></div>
              <div className="md-text-body-small">
                Selected: {selectedBackup.name} (
                {formatBackupType(selectedBackup)})
              </div>
            </div>
          )}
        </div>
      </div>

      {isRestoreInProgress && (
        <div className="backup-progress-card">
          <div className="progress-content">
            <div className="progress-text">
              <div className="operation-name">{currentOperation}</div>
              <div className="progress-percent">{restoreProgress}%</div>
            </div>
            <div className="md-linear-progress">
              <div
                className="md-linear-progress-bar"
                style={{ width: `${restoreProgress}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      {!deviceStatus.connected && (
        <div className="md-status-indicator md-status-error">
          <div className="md-status-dot"></div>
          <div className="md-text-body">
            Device must be connected to perform restore operations
          </div>
        </div>
      )}

      {/* Mode Switch Modal */}
      {modeSwitchDetails && (
        <ModeSwitchModal
          isOpen={showModeSwitchModal}
          currentMode={modeSwitchDetails.currentMode}
          requiredMode={modeSwitchDetails.requiredMode}
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
          onConfirm={performCustomRestore}
          onCancel={() => setShowRestoreSelectionModal(false)}
        />
      )}

      {/* Snackbar */}
      <Snackbar
        message={snackbar.message}
        type={snackbar.type}
        visible={snackbar.visible}
        onClose={hideSnackbar}
        action={snackbar.action}
      />
    </div>
  );
};
