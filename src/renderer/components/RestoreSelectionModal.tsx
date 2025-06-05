import React, { useState, useEffect, useCallback } from "react";
import { BackupInfo } from "../../shared/types/index";

interface BackupContentDetails {
  patterns?: {
    id: string;
    name: string;
    bank: number;
    pattern: number;
    size: number;
    selected: boolean;
  }[];
  samples?: {
    [bankId: string]: {
      id: string;
      name: string;
      bank: string;
      pad: number;
      size: number;
      selected: boolean;
    }[];
  };
  totalPatternSize: number;
  totalSampleSize: number;
  selectedPatternSize: number;
  selectedSampleSize: number;
}

interface RestoreSelectionModalProps {
  isOpen: boolean;
  backup: BackupInfo;
  onConfirm: (selection: {
    includePatterns: boolean;
    includeSamples: boolean;
    selectedPatterns: string[];
    selectedSampleBanks: string[];
    selectedSamples: { [bankId: string]: string[] };
  }) => void;
  onCancel: () => void;
}

// Helper components for rendering patterns and samples
const PatternList: React.FC<{
  patterns: BackupContentDetails["patterns"];
  onToggle: (id: string) => void;
  formatSize: (bytes: number) => string;
}> = ({ patterns, onToggle, formatSize }) => (
  <div className="pattern-list">
    {patterns?.map((pattern) => (
      <label key={pattern.id} className="pattern-item">
        <input
          type="checkbox"
          checked={pattern.selected}
          onChange={() => onToggle(pattern.id)}
        />
        <div className="pattern-info">
          <span className="pattern-name">{pattern.name}</span>
          <span className="pattern-location">
            Bank {pattern.bank}, Pattern {pattern.pattern}
          </span>
          <span className="pattern-size">{formatSize(pattern.size)}</span>
        </div>
      </label>
    ))}
  </div>
);

const SampleBanks: React.FC<{
  samples: BackupContentDetails["samples"];
  onToggleSample: (bankId: string, sampleId: string) => void;
  onToggleBank: (bankId: string) => void;
  formatSize: (bytes: number) => string;
}> = ({ samples, onToggleSample, onToggleBank, formatSize }) => (
  <div className="sample-banks">
    {Object.entries(samples || {}).map(([bankId, samples]) => (
      <div key={bankId} className="bank-section">
        <div className="bank-header">
          <label className="bank-toggle">
            <input
              type="checkbox"
              checked={samples.every((s) => s.selected)}
              onChange={() => onToggleBank(bankId)}
              ref={(input) => {
                if (input) {
                  input.indeterminate =
                    samples.some((s) => s.selected) &&
                    !samples.every((s) => s.selected);
                }
              }}
            />
            <span className="bank-title">
              Bank {bankId.toUpperCase()} ({samples.length} samples)
            </span>
          </label>
        </div>
        <div className="sample-list">
          {samples.map((sample) => (
            <label key={sample.id} className="sample-item">
              <input
                type="checkbox"
                checked={sample.selected}
                onChange={() => onToggleSample(bankId, sample.id)}
              />
              <div className="sample-info">
                <span className="sample-name">{sample.name}</span>
                <span className="sample-location">Pad {sample.pad}</span>
                <span className="sample-size">{formatSize(sample.size)}</span>
              </div>
            </label>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export const RestoreSelectionModal: React.FC<RestoreSelectionModalProps> = ({
  isOpen,
  backup,
  onConfirm,
  onCancel,
}) => {
  const [backupDetails, setBackupDetails] =
    useState<BackupContentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [includePatterns, setIncludePatterns] = useState(false);
  const [includeSamples, setIncludeSamples] = useState(false);

  // Size threshold for samples (10MB)
  const SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB in bytes

  useEffect(() => {
    if (isOpen && backup) {
      loadBackupDetails();
    }
  }, [isOpen, backup]);

  const loadBackupDetails = async () => {
    setIsLoading(true);
    try {
      const details = await window.electronAPI.getBackupDetails(backup.path);

      // Process the details and set default selections
      const processedDetails: BackupContentDetails = {
        patterns: details.patterns?.map((pattern: any) => ({
          ...pattern,
          selected: true, // Default all selected
        })),
        samples: {},
        totalPatternSize: 0,
        totalSampleSize: 0,
        selectedPatternSize: 0,
        selectedSampleSize: 0,
      };

      // Process samples by bank
      if (details.samples) {
        Object.keys(details.samples).forEach((bankId) => {
          processedDetails.samples![bankId] = details.samples[bankId].map(
            (sample: any) => ({
              ...sample,
              selected: true, // Default all selected
            })
          );
        });
      }

      // Calculate sizes
      if (processedDetails.patterns) {
        processedDetails.totalPatternSize = processedDetails.patterns.reduce(
          (sum, p) => sum + p.size,
          0
        );
        processedDetails.selectedPatternSize =
          processedDetails.totalPatternSize;
      }

      if (processedDetails.samples) {
        Object.values(processedDetails.samples).forEach((bankSamples) => {
          const bankSize = bankSamples.reduce((sum, s) => sum + s.size, 0);
          processedDetails.totalSampleSize += bankSize;
          processedDetails.selectedSampleSize += bankSize;
        });
      }

      setBackupDetails(processedDetails);
      setIncludePatterns(
        !!processedDetails.patterns && processedDetails.patterns.length > 0
      );
      setIncludeSamples(
        !!processedDetails.samples &&
          Object.keys(processedDetails.samples).length > 0
      );
    } catch (error) {
      console.error("Failed to load backup details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Refactored selection handlers to avoid mutation
  const selectAllPatterns = useCallback(() => {
    setBackupDetails(
      (prev) =>
        prev && {
          ...prev,
          patterns: prev.patterns?.map((p) => ({ ...p, selected: true })),
          selectedPatternSize: prev.totalPatternSize,
        }
    );
  }, []);

  const clearAllPatterns = useCallback(() => {
    setBackupDetails(
      (prev) =>
        prev && {
          ...prev,
          patterns: prev.patterns?.map((p) => ({ ...p, selected: false })),
          selectedPatternSize: 0,
        }
    );
  }, []);

  const selectAllSamples = useCallback(() => {
    setBackupDetails(
      (prev) =>
        prev && {
          ...prev,
          samples: Object.fromEntries(
            Object.entries(prev.samples || {}).map(([bankId, samples]) => [
              bankId,
              samples.map((s) => ({ ...s, selected: true })),
            ])
          ),
          selectedSampleSize: prev.totalSampleSize,
        }
    );
  }, []);

  const clearAllSamples = useCallback(() => {
    setBackupDetails(
      (prev) =>
        prev && {
          ...prev,
          samples: Object.fromEntries(
            Object.entries(prev.samples || {}).map(([bankId, samples]) => [
              bankId,
              samples.map((s) => ({ ...s, selected: false })),
            ])
          ),
          selectedSampleSize: 0,
        }
    );
  }, []);

  const togglePatternSelection = useCallback((patternId: string) => {
    setBackupDetails((prev) => {
      if (!prev?.patterns) return prev;
      const patterns = prev.patterns.map((p) =>
        p.id === patternId ? { ...p, selected: !p.selected } : p
      );
      const selectedPatternSize = patterns
        .filter((p) => p.selected)
        .reduce((sum, p) => sum + p.size, 0);
      return { ...prev, patterns, selectedPatternSize };
    });
  }, []);

  const toggleSampleSelection = useCallback(
    (bankId: string, sampleId: string) => {
      setBackupDetails((prev) => {
        if (!prev?.samples?.[bankId]) return prev;
        const samples = prev.samples[bankId].map((s) =>
          s.id === sampleId ? { ...s, selected: !s.selected } : s
        );
        const newSamples = { ...prev.samples, [bankId]: samples };
        let selectedSampleSize = 0;
        Object.values(newSamples).forEach((bankSamples) => {
          selectedSampleSize += bankSamples
            .filter((s) => s.selected)
            .reduce((sum, s) => sum + s.size, 0);
        });
        return { ...prev, samples: newSamples, selectedSampleSize };
      });
    },
    []
  );

  const toggleBankSelection = useCallback((bankId: string) => {
    setBackupDetails((prev) => {
      if (!prev?.samples?.[bankId]) return prev;
      const allSelected = prev.samples[bankId].every((s) => s.selected);
      const samples = prev.samples[bankId].map((s) => ({
        ...s,
        selected: !allSelected,
      }));
      const newSamples = { ...prev.samples, [bankId]: samples };
      let selectedSampleSize = 0;
      Object.values(newSamples).forEach((bankSamples) => {
        selectedSampleSize += bankSamples
          .filter((s) => s.selected)
          .reduce((sum, s) => sum + s.size, 0);
      });
      return { ...prev, samples: newSamples, selectedSampleSize };
    });
  }, []);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getSelectedSampleBanks = (): string[] => {
    if (!backupDetails?.samples) return [];

    return Object.keys(backupDetails.samples).filter((bankId) =>
      backupDetails.samples![bankId].some((s) => s.selected)
    );
  };

  const handleConfirm = () => {
    if (!backupDetails) return;

    const selectedPatterns =
      backupDetails.patterns?.filter((p) => p.selected).map((p) => p.id) || [];

    const selectedSampleBanks = getSelectedSampleBanks();

    const selectedSamples: { [bankId: string]: string[] } = {};
    if (backupDetails.samples) {
      Object.keys(backupDetails.samples).forEach((bankId) => {
        const selected = backupDetails
          .samples![bankId].filter((s) => s.selected)
          .map((s) => s.id);
        if (selected.length > 0) {
          selectedSamples[bankId] = selected;
        }
      });
    }

    onConfirm({
      includePatterns: includePatterns && selectedPatterns.length > 0,
      includeSamples: includeSamples && selectedSampleBanks.length > 0,
      selectedPatterns,
      selectedSampleBanks,
      selectedSamples,
    });
  };

  const isOverThreshold =
    backupDetails && backupDetails.selectedSampleSize > SIZE_THRESHOLD;
  const canConfirm =
    backupDetails &&
    ((includePatterns && backupDetails.patterns?.some((p) => p.selected)) ||
      (includeSamples &&
        Object.values(backupDetails.samples || {}).some((bank) =>
          bank.some((s) => s.selected)
        )));

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="md-card restore-selection-modal">
        <div className="md-card-content">
          <div className="md-text-headline">
            Restore Selection: {backup.name}
          </div>
          <div className="md-text-body">
            Choose which items to restore from this backup
          </div>

          {isLoading ? (
            <div className="loading-content">
              <div className="md-text-body">Loading backup details...</div>
            </div>
          ) : backupDetails ? (
            <div className="restore-content">
              {/* Summary */}
              <div className="restore-summary">
                <div className="summary-item">
                  <span>Backup Created:</span>
                  <span>{new Date(backup.timestamp).toLocaleString()}</span>
                </div>
                <div className="summary-item">
                  <span>Total Size:</span>
                  <span>{formatSize(backup.size)}</span>
                </div>
              </div>

              {/* Size Warning */}
              {isOverThreshold && (
                <div className="size-warning">
                  ⚠️ Selected samples exceed 10MB (
                  {formatSize(backupDetails.selectedSampleSize)}). You'll need
                  to power cycle the device during restore to prevent data
                  corruption.
                </div>
              )}

              {/* Patterns Section */}
              {backupDetails.patterns && backupDetails.patterns.length > 0 && (
                <div className="restore-section">
                  <div className="section-header">
                    <label className="section-toggle">
                      <input
                        type="checkbox"
                        checked={includePatterns}
                        onChange={(e) => setIncludePatterns(e.target.checked)}
                      />
                      <span className="toggle-slider"></span>
                      <span className="section-title">
                        Patterns ({backupDetails.patterns.length} items,{" "}
                        {formatSize(backupDetails.selectedPatternSize)})
                      </span>
                    </label>
                    <div className="section-controls">
                      <button
                        className="md-button md-button-text"
                        onClick={selectAllPatterns}
                        disabled={!includePatterns}
                      >
                        Select All
                      </button>
                      <button
                        className="md-button md-button-text"
                        onClick={clearAllPatterns}
                        disabled={!includePatterns}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                  {includePatterns && (
                    <PatternList
                      patterns={backupDetails.patterns}
                      onToggle={togglePatternSelection}
                      formatSize={formatSize}
                    />
                  )}
                </div>
              )}

              {/* Samples Section */}
              {backupDetails.samples &&
                Object.keys(backupDetails.samples).length > 0 && (
                  <div className="restore-section">
                    <div className="section-header">
                      <label className="section-toggle">
                        <input
                          type="checkbox"
                          checked={includeSamples}
                          onChange={(e) => setIncludeSamples(e.target.checked)}
                        />
                        <span className="toggle-slider"></span>
                        <span className="section-title">
                          Samples ({Object.keys(backupDetails.samples).length}{" "}
                          banks, {formatSize(backupDetails.selectedSampleSize)})
                        </span>
                      </label>
                      <div className="section-controls">
                        <button
                          className="md-button md-button-text"
                          onClick={selectAllSamples}
                          disabled={!includeSamples}
                        >
                          Select All
                        </button>
                        <button
                          className="md-button md-button-text"
                          onClick={clearAllSamples}
                          disabled={!includeSamples}
                        >
                          Clear All
                        </button>
                      </div>
                    </div>
                    {includeSamples && (
                      <SampleBanks
                        samples={backupDetails.samples}
                        onToggleSample={toggleSampleSelection}
                        onToggleBank={toggleBankSelection}
                        formatSize={formatSize}
                      />
                    )}
                  </div>
                )}
            </div>
          ) : (
            <div className="error-content">
              <div className="md-text-body">Failed to load backup details</div>
            </div>
          )}
        </div>

        <div className="md-card-actions">
          <button
            className="md-button md-button-filled"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            Restore Selected Items
          </button>
          <button className="md-button md-button-text" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
