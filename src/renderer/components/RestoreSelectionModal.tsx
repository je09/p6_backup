import React, { useState, useEffect, useCallback } from "react";
import { BackupInfo } from "../../shared/types/index";
import { formatSize } from "../utils/formatters";

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


export const RestoreSelectionModal: React.FC<RestoreSelectionModalProps> = ({
  isOpen,
  backup,
  onConfirm,
  onCancel,
}) => {
  const [backupDetails, setBackupDetails] = useState<BackupContentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [includePatterns, setIncludePatterns] = useState(false);
  const [includeSamples, setIncludeSamples] = useState(false);
  const SIZE_THRESHOLD = 10 * 1024 * 1024;

  useEffect(() => {
    if (isOpen && backup) {
      loadBackupDetails();
    }
  }, [isOpen, backup]);

  const loadBackupDetails = async () => {
    setIsLoading(true);
    try {
      const details = await window.electronAPI.getBackupDetails(backup.path);
      const processedDetails: BackupContentDetails = {
        patterns: details.patterns?.map((p: any) => ({ ...p, selected: true })),
        samples: {},
        totalPatternSize: 0,
        totalSampleSize: 0,
        selectedPatternSize: 0,
        selectedSampleSize: 0,
      };
      if (details.samples) {
        Object.keys(details.samples).forEach((bankId) => {
          processedDetails.samples![bankId] = details.samples![bankId].map(
            (s: any) => ({ ...s, selected: true })
          );
        });
      }
      if (processedDetails.patterns) {
        processedDetails.totalPatternSize = processedDetails.patterns.reduce(
          (sum, p) => sum + p.size, 0
        );
        processedDetails.selectedPatternSize = processedDetails.totalPatternSize;
      }
      if (processedDetails.samples) {
        Object.values(processedDetails.samples).forEach((bank) => {
          const s = bank.reduce((sum, s) => sum + s.size, 0);
          processedDetails.totalSampleSize += s;
          processedDetails.selectedSampleSize += s;
        });
      }
      setBackupDetails(processedDetails);
      setIncludePatterns(!!processedDetails.patterns?.length);
      setIncludeSamples(!!Object.keys(processedDetails.samples || {}).length);
    } catch (error) {
      console.error("Failed to load backup details:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectAllPatterns = useCallback(() =>
    setBackupDetails((prev) =>
      prev && {
        ...prev,
        patterns: prev.patterns?.map((p) => ({ ...p, selected: true })),
        selectedPatternSize: prev.totalPatternSize,
      }
    ), []);

  const clearAllPatterns = useCallback(() =>
    setBackupDetails((prev) =>
      prev && {
        ...prev,
        patterns: prev.patterns?.map((p) => ({ ...p, selected: false })),
        selectedPatternSize: 0,
      }
    ), []);

  const selectAllSamples = useCallback(() =>
    setBackupDetails((prev) =>
      prev && {
        ...prev,
        samples: Object.fromEntries(
          Object.entries(prev.samples || {}).map(([id, s]) => [
            id, s.map((x) => ({ ...x, selected: true })),
          ])
        ),
        selectedSampleSize: prev.totalSampleSize,
      }
    ), []);

  const clearAllSamples = useCallback(() =>
    setBackupDetails((prev) =>
      prev && {
        ...prev,
        samples: Object.fromEntries(
          Object.entries(prev.samples || {}).map(([id, s]) => [
            id, s.map((x) => ({ ...x, selected: false })),
          ])
        ),
        selectedSampleSize: 0,
      }
    ), []);

  const togglePattern = useCallback((patternId: string) => {
    setBackupDetails((prev) => {
      if (!prev?.patterns) return prev;
      const patterns = prev.patterns.map((p) =>
        p.id === patternId ? { ...p, selected: !p.selected } : p
      );
      return {
        ...prev, patterns,
        selectedPatternSize: patterns.filter((p) => p.selected).reduce((s, p) => s + p.size, 0),
      };
    });
  }, []);

  const toggleBank = useCallback((bankId: string) => {
    setBackupDetails((prev) => {
      if (!prev?.samples?.[bankId]) return prev;
      const allSelected = prev.samples[bankId].every((s) => s.selected);
      const newSamples = {
        ...prev.samples,
        [bankId]: prev.samples[bankId].map((s) => ({ ...s, selected: !allSelected })),
      };
      const size = Object.values(newSamples).flat().filter((s) => s.selected).reduce((a, s) => a + s.size, 0);
      return { ...prev, samples: newSamples, selectedSampleSize: size };
    });
  }, []);

  const handleConfirm = () => {
    if (!backupDetails) return;
    const selectedPatterns = backupDetails.patterns?.filter((p) => p.selected).map((p) => p.id) || [];
    const selectedSampleBanks = Object.keys(backupDetails.samples || {}).filter((id) =>
      backupDetails.samples![id].some((s) => s.selected)
    );
    const selectedSamples: Record<string, string[]> = {};
    Object.keys(backupDetails.samples || {}).forEach((id) => {
      const sel = backupDetails.samples![id].filter((s) => s.selected).map((s) => s.name);
      if (sel.length) selectedSamples[id] = sel;
    });
    onConfirm({
      includePatterns: includePatterns && selectedPatterns.length > 0,
      includeSamples: includeSamples && selectedSampleBanks.length > 0,
      selectedPatterns,
      selectedSampleBanks,
      selectedSamples,
    });
  };

  const canConfirm =
    backupDetails &&
    ((includePatterns && backupDetails.patterns?.some((p) => p.selected)) ||
      (includeSamples &&
        Object.values(backupDetails.samples || {}).some((b) => b.some((s) => s.selected))));

  const isOverThreshold = backupDetails && backupDetails.selectedSampleSize > SIZE_THRESHOLD;

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="mac-overlay">
      <div
        className="modal-dialog outer-border"
        style={{ width: "36rem", maxWidth: "92vw", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
      >
        <div className="inner-border" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="modal-contents" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <h1 className="modal-text">Restore: {backup.name}</h1>
            <p style={{ marginBottom: 10 }}>Choose what to restore from this backup.</p>

            <div style={{ overflowY: "auto", flex: 1 }}>
            {isLoading ? (
              <p>Loading backup details…</p>
            ) : backupDetails ? (
              <>
                {isOverThreshold && (
                  <div className="info-box" style={{ marginBottom: 10 }}>
                    <p>
                      Selected samples exceed 10MB ({formatSize(backupDetails.selectedSampleSize)}).
                      You may need to power cycle the device during restore.
                    </p>
                  </div>
                )}

                {backupDetails.patterns && backupDetails.patterns.length > 0 && (
                  <div className="restore-modal-section">
                    <div
                      className="restore-modal-section-header"
                      onClick={() => setIncludePatterns((v) => !v)}
                    >
                      <input
                        type="checkbox"
                        id="restore-include-patterns"
                        checked={includePatterns}
                        onChange={(e) => setIncludePatterns(e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <label
                        htmlFor="restore-include-patterns"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Patterns ({backupDetails.patterns.length} items,{" "}
                        {formatSize(backupDetails.selectedPatternSize)})
                      </label>
                      <section className="field-row" style={{ marginLeft: "auto" }}>
                        <button className="btn" onClick={(e) => { e.stopPropagation(); selectAllPatterns(); }} disabled={!includePatterns}>All</button>
                        <button className="btn" onClick={(e) => { e.stopPropagation(); clearAllPatterns(); }} disabled={!includePatterns}>None</button>
                      </section>
                    </div>
                    {includePatterns && (
                      <div className="restore-modal-content">
                        {backupDetails.patterns.map((p) => (
                          <div key={p.id} className="field-row" style={{ marginBottom: 2 }}>
                            <input
                              type="checkbox"
                              id={`rp-${p.id}`}
                              checked={p.selected}
                              onChange={() => togglePattern(p.id)}
                            />
                            <label htmlFor={`rp-${p.id}`}>
                              {p.name} — Bank {p.bank}, P{p.pattern} ({formatSize(p.size)})
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {backupDetails.samples && Object.keys(backupDetails.samples).length > 0 && (
                  <div className="restore-modal-section">
                    <div
                      className="restore-modal-section-header"
                      onClick={() => setIncludeSamples((v) => !v)}
                    >
                      <input
                        type="checkbox"
                        id="restore-include-samples"
                        checked={includeSamples}
                        onChange={(e) => setIncludeSamples(e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <label
                        htmlFor="restore-include-samples"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Samples ({Object.keys(backupDetails.samples).length} banks,{" "}
                        {formatSize(backupDetails.selectedSampleSize)})
                      </label>
                      <section className="field-row" style={{ marginLeft: "auto" }}>
                        <button className="btn" onClick={(e) => { e.stopPropagation(); selectAllSamples(); }} disabled={!includeSamples}>All</button>
                        <button className="btn" onClick={(e) => { e.stopPropagation(); clearAllSamples(); }} disabled={!includeSamples}>None</button>
                      </section>
                    </div>
                    {includeSamples && (
                      <div className="restore-modal-content">
                        <div className="info-box" style={{ marginBottom: 8, fontSize: 11 }}>
                          <p style={{ margin: 0 }}>
                            <strong>Banks A–D:</strong> Hold <strong>[SAMPLING]</strong> while powering on (Session 1)
                            <br />
                            <strong>Banks E–H:</strong> Hold <strong>[SAMPLING]</strong> while powering on again (Session 2)
                          </p>
                        </div>
                        {Object.entries(backupDetails.samples).map(([bankId, samples]) => (
                          <div key={bankId} style={{ marginBottom: 8 }}>
                            <div className="field-row" style={{ marginBottom: 4 }}>
                              <input
                                type="checkbox"
                                id={`rb-${bankId}`}
                                checked={samples.every((s) => s.selected)}
                                onChange={() => toggleBank(bankId)}
                              />
                              <label htmlFor={`rb-${bankId}`}>
                                <strong>Bank {bankId.toUpperCase()} ({samples.length} samples)</strong>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p>Failed to load backup details.</p>
            )}
            </div>

            <section
              className="field-row"
              style={{ justifyContent: "flex-end", marginTop: 12 }}
            >
              <button className="btn" onClick={onCancel}>Cancel</button>
              <button
                className="btn btn-default"
                onClick={handleConfirm}
                disabled={!canConfirm}
              >
                Restore Selected
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
