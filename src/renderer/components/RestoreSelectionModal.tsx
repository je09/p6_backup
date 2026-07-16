import React, { useState, useEffect, useCallback, useMemo } from "react";
import { BackupInfo } from "../../shared/types/index";
import { PrmMetadata, SampleDependency, SCALE_NAMES } from "../../shared/utils/prmParser";
import { formatSize } from "../utils/formatters";

const MAX_SESSION_BYTES = 10 * 1024 * 1024;

interface PatternItem {
  id: string;
  name: string;
  bank: number;
  pattern: number;
  size: number;
  selected: boolean;
  metadata?: PrmMetadata;
}

interface SampleItem {
  id: string;
  name: string;
  bank: string;
  pad: number;
  size: number;
  selected: boolean;
}

interface BackupContentDetails {
  patterns?: PatternItem[];
  samples?: { [bankId: string]: SampleItem[] };
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
    /** Total selected bytes per bank — used for size-based session batching. */
    bankSizes: Record<string, number>;
  }) => void;
  onCancel: () => void;
}

function summarizeRange(values: number[], format: (v: number) => string): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? format(min) : `${format(min)}–${format(max)}`;
}

export const RestoreSelectionModal: React.FC<RestoreSelectionModalProps> = ({
  isOpen,
  backup,
  onConfirm,
  onCancel,
}) => {
  const [backupDetails, setBackupDetails] = useState<BackupContentDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [includePatterns, setIncludePatterns] = useState(false);
  const [includeSamples, setIncludeSamples] = useState(false);
  const [skipSamples, setSkipSamples] = useState(false);
  /** Set of "BANK-pad" keys excluded by the user in the required-samples panel. */
  const [excludedPads, setExcludedPads] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen && backup) {
      loadBackupDetails();
    }
  }, [isOpen, backup]);

  const loadBackupDetails = async () => {
    setIsLoading(true);
    setLoadError(null);
    setExcludedPads(new Set());
    setSkipSamples(false);
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
    } catch (error: any) {
      console.error("Failed to load backup details:", error);
      setLoadError(error?.message || String(error));
    } finally {
      setIsLoading(false);
    }
  };

  // ── Pattern selection ──────────────────────────────────────────────────────

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

  // ── Legacy bank-level sample selection (used when no metadata) ─────────────

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

  // ── Derived: required samples from selected pattern metadata ───────────────

  const selectedPatternItems = useMemo(
    () => backupDetails?.patterns?.filter((p) => p.selected) ?? [],
    [backupDetails]
  );

  const patternsHaveMetadata = useMemo(
    () => selectedPatternItems.some((p) => p.metadata),
    [selectedPatternItems]
  );

  /** Deduplicated list of pad dependencies from all selected patterns with metadata. */
  const requiredDeps = useMemo((): SampleDependency[] => {
    if (!patternsHaveMetadata) return [];
    const seen = new Set<string>();
    const deps: SampleDependency[] = [];
    for (const p of selectedPatternItems) {
      for (const dep of p.metadata?.dependencies ?? []) {
        const key = `${dep.bankLetter}-${dep.padNumber}`;
        if (!seen.has(key)) { seen.add(key); deps.push(dep); }
      }
    }
    return deps.sort(
      (a, b) => a.bankLetter.localeCompare(b.bankLetter) || a.padNumber - b.padNumber
    );
  }, [selectedPatternItems, patternsHaveMetadata]);

  /** Required deps grouped by bank with sizes looked up from backup data. */
  const requiredByBank = useMemo(() => {
    const groups: Record<string, { padNumber: number; size: number }[]> = {};
    for (const dep of requiredDeps) {
      const sampleEntry = backupDetails?.samples?.[dep.bankLetter]?.find(
        (s) => s.pad === dep.padNumber
      );
      if (!groups[dep.bankLetter]) groups[dep.bankLetter] = [];
      groups[dep.bankLetter].push({ padNumber: dep.padNumber, size: sampleEntry?.size ?? 0 });
    }
    return groups;
  }, [requiredDeps, backupDetails]);

  const requiredTotalSize = useMemo(() => {
    let total = 0;
    for (const [bank, pads] of Object.entries(requiredByBank)) {
      for (const { padNumber, size } of pads) {
        const key = `${bank}-${padNumber}`;
        if (!excludedPads.has(key)) total += size;
      }
    }
    return total;
  }, [requiredByBank, excludedPads]);

  const activeSampleSize = useMemo(() => {
    if (patternsHaveMetadata) return requiredTotalSize;
    return backupDetails?.selectedSampleSize ?? 0;
  }, [patternsHaveMetadata, requiredTotalSize, backupDetails]);

  const sessionCount = useMemo(
    () => Math.max(1, Math.ceil(activeSampleSize / MAX_SESSION_BYTES)),
    [activeSampleSize]
  );

  /** Session groupings for the legacy (no-metadata) bank selector info box. */
  const legacySessionBatches = useMemo((): { banks: string[]; size: number }[] => {
    if (!backupDetails?.samples) return [];
    const batches: { banks: string[]; size: number }[] = [];
    let cur: string[] = [];
    let curSize = 0;
    for (const [bankId, samples] of Object.entries(backupDetails.samples)) {
      const bankSize = samples.filter((s) => s.selected).reduce((a, s) => a + s.size, 0);
      if (cur.length > 0 && curSize + bankSize > MAX_SESSION_BYTES) {
        batches.push({ banks: cur, size: curSize });
        cur = [];
        curSize = 0;
      }
      cur.push(bankId.toUpperCase());
      curSize += bankSize;
    }
    if (cur.length > 0) batches.push({ banks: cur, size: curSize });
    return batches;
  }, [backupDetails]);

  // ── Selection summary (BPM/scale/length range) ─────────────────────────────

  const selectionSummary = useMemo(() => {
    const withMeta = selectedPatternItems.filter((p) => p.metadata);
    if (withMeta.length === 0) return null;
    const tempos = withMeta.map((p) => p.metadata!.tempo);
    const scales = withMeta.map((p) => p.metadata!.scale);
    const lengths = withMeta.map((p) => p.metadata!.length);
    return [
      summarizeRange(tempos, (v) => `${v} BPM`),
      summarizeRange(scales, (v) => SCALE_NAMES[v] ?? String(v)),
      summarizeRange(lengths, (v) => `${v} steps`),
    ].filter(Boolean).join(" · ");
  }, [selectedPatternItems]);

  // ── Confirm ────────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (!backupDetails) return;
    const selectedPatterns = backupDetails.patterns?.filter((p) => p.selected).map((p) => p.id) ?? [];

    if (patternsHaveMetadata && !skipSamples) {
      // Build selection from required deps minus excluded pads
      const selectedSampleBanks: string[] = [];
      const selectedSamples: Record<string, string[]> = {};
      const bankSizes: Record<string, number> = {};

      for (const [bank, pads] of Object.entries(requiredByBank)) {
        const activePads = pads.filter((pad) => !excludedPads.has(`${bank}-${pad.padNumber}`));
        if (activePads.length === 0) continue;
        selectedSampleBanks.push(bank);
        selectedSamples[bank] = activePads.flatMap(({ padNumber }) =>
          (backupDetails.samples?.[bank]?.filter((s) => s.pad === padNumber) ?? []).map((e) => e.name)
        );
        bankSizes[bank] = activePads
          .flatMap(({ padNumber }) => backupDetails.samples?.[bank]?.filter((s) => s.pad === padNumber) ?? [])
          .reduce((s, e) => s + e.size, 0);
      }

      onConfirm({
        includePatterns: includePatterns && selectedPatterns.length > 0,
        includeSamples: selectedSampleBanks.length > 0,
        selectedPatterns,
        selectedSampleBanks,
        selectedSamples,
        bankSizes,
      });
      return;
    }

    // Legacy path (no metadata or skipSamples)
    const selectedSampleBanks = Object.keys(backupDetails.samples || {}).filter((id) =>
      backupDetails.samples![id].some((s) => s.selected)
    );
    const selectedSamples: Record<string, string[]> = {};
    const bankSizes: Record<string, number> = {};
    Object.keys(backupDetails.samples || {}).forEach((id) => {
      const bankItems = backupDetails.samples![id];
      const sel = bankItems.filter((s) => s.selected);
      if (sel.length) selectedSamples[id] = sel.map((s) => s.name);
      bankSizes[id] = sel.reduce((sum, s) => sum + s.size, 0);
    });
    onConfirm({
      includePatterns: includePatterns && selectedPatterns.length > 0,
      includeSamples: includeSamples && selectedSampleBanks.length > 0,
      selectedPatterns,
      selectedSampleBanks,
      selectedSamples,
      bankSizes,
    });
  };

  const activeDepCount = useMemo(
    () => requiredDeps.filter((d) => !excludedPads.has(`${d.bankLetter}-${d.padNumber}`)).length,
    [requiredDeps, excludedPads]
  );

  const canConfirm =
    backupDetails &&
    ((includePatterns && backupDetails.patterns?.some((p) => p.selected)) ||
      (includeSamples &&
        (skipSamples
          ? false
          : patternsHaveMetadata
          ? activeDepCount > 0
          : Object.values(backupDetails.samples || {}).some((b) => b.some((s) => s.selected)))));

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
                {/* ── Patterns ── */}
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
                        {selectionSummary && (
                          <span className="selection-meta" style={{ marginLeft: 8 }}>
                            · {selectionSummary}
                          </span>
                        )}
                      </label>
                      <section className="field-row" style={{ marginLeft: "auto" }}>
                        <button className="btn" onClick={(e) => { e.stopPropagation(); selectAllPatterns(); }} disabled={!includePatterns}>All</button>
                        <button className="btn" onClick={(e) => { e.stopPropagation(); clearAllPatterns(); }} disabled={!includePatterns}>None</button>
                      </section>
                    </div>
                    {includePatterns && (
                      <div className="restore-modal-content">
                        {backupDetails.patterns.map((p) => {
                          const meta = p.metadata;
                          return (
                            <div key={p.id} className="field-row" style={{ marginBottom: 2 }}>
                              <input
                                type="checkbox"
                                id={`rp-${p.id}`}
                                checked={p.selected}
                                onChange={() => togglePattern(p.id)}
                              />
                              <label htmlFor={`rp-${p.id}`}>
                                {p.name} — Bank {p.bank}, P{p.pattern} ({formatSize(p.size)})
                                {meta && (
                                  <span className="pattern-chip-meta" style={{ marginLeft: 6 }}>
                                    {meta.tempo} BPM · {SCALE_NAMES[meta.scale] ?? meta.scale} · {meta.length} steps
                                  </span>
                                )}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Samples — pattern-centric when metadata present ── */}
                {backupDetails.samples && Object.keys(backupDetails.samples).length > 0 && (
                  <div className="restore-modal-section">
                    <div
                      className="restore-modal-section-header"
                      onClick={() => !patternsHaveMetadata && setIncludeSamples((v) => !v)}
                    >
                      {!patternsHaveMetadata && (
                        <input
                          type="checkbox"
                          id="restore-include-samples"
                          checked={includeSamples}
                          onChange={(e) => setIncludeSamples(e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      <label
                        htmlFor="restore-include-samples"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontWeight: patternsHaveMetadata ? 600 : undefined }}
                      >
                        {patternsHaveMetadata
                          ? `Samples used by selected patterns`
                          : `Samples (${Object.keys(backupDetails.samples).length} banks, ${formatSize(backupDetails.selectedSampleSize)})`}
                      </label>
                      {patternsHaveMetadata && !skipSamples && (
                        <button
                          className="btn"
                          style={{ marginLeft: "auto", fontSize: 11 }}
                          onClick={(e) => { e.stopPropagation(); setSkipSamples(true); }}
                        >
                          Skip samples
                        </button>
                      )}
                      {!patternsHaveMetadata && (
                        <section className="field-row" style={{ marginLeft: "auto" }}>
                          <button className="btn" onClick={(e) => { e.stopPropagation(); selectAllSamples(); }} disabled={!includeSamples}>All</button>
                          <button className="btn" onClick={(e) => { e.stopPropagation(); clearAllSamples(); }} disabled={!includeSamples}>None</button>
                        </section>
                      )}
                    </div>

                    {/* Pattern-centric required samples */}
                    {patternsHaveMetadata && (
                      skipSamples ? (
                        <div className="restore-modal-content" style={{ color: "#666", fontSize: 12 }}>
                          Samples skipped — assuming samples are already on device.{" "}
                          <button
                            className="btn"
                            style={{ fontSize: 11 }}
                            onClick={() => setSkipSamples(false)}
                          >
                            Include samples
                          </button>
                        </div>
                      ) : requiredDeps.length === 0 ? (
                        <div className="restore-modal-content" style={{ fontSize: 12, fontStyle: "italic" }}>
                          No sample dependencies detected in selected patterns.
                        </div>
                      ) : (
                        <div className="restore-modal-content">
                          {Object.entries(requiredByBank).sort().map(([bank, pads]) => (
                            <div key={bank} style={{ marginBottom: 6 }}>
                              <strong>Bank {bank}</strong>
                              <div style={{ paddingLeft: 12, marginTop: 2 }}>
                                {pads.map(({ padNumber, size }) => {
                                  const key = `${bank}-${padNumber}`;
                                  const excluded = excludedPads.has(key);
                                  return (
                                    <div key={padNumber} className="field-row" style={{ marginBottom: 2 }}>
                                      <input
                                        type="checkbox"
                                        id={`restore-pad-${key}`}
                                        checked={!excluded}
                                        onChange={() => {
                                          setExcludedPads((prev) => {
                                            const next = new Set(prev);
                                            if (excluded) next.delete(key); else next.add(key);
                                            return next;
                                          });
                                        }}
                                      />
                                      <label htmlFor={`restore-pad-${key}`}>
                                        Pad {padNumber}
                                        {size > 0 && <span style={{ color: "#666", marginLeft: 4 }}>({formatSize(size)})</span>}
                                      </label>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                          <div style={{ marginTop: 8, fontSize: 12 }}>
                            Total: {formatSize(activeSampleSize)}
                            {activeSampleSize > MAX_SESSION_BYTES
                              ? ` — will require ${sessionCount} sessions`
                              : " ✓ fits in one session"}
                          </div>
                        </div>
                      )
                    )}

                    {/* Legacy bank-level selector (no metadata) */}
                    {!patternsHaveMetadata && includeSamples && (
                      <div className="restore-modal-content">
                        {legacySessionBatches.length > 0 && (
                          <div className="info-box" style={{ marginBottom: 8, fontSize: 11 }}>
                            {legacySessionBatches.map((batch, i) => (
                              <p key={i} style={{ margin: i === 0 ? 0 : "4px 0 0" }}>
                                <strong>Session {i + 1} — Banks {batch.banks.join(", ")} ({formatSize(batch.size)}):</strong>{" "}
                                Hold <strong>[SAMPLING]</strong> while powering on
                              </p>
                            ))}
                          </div>
                        )}
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
                                <strong>Bank {bankId.toUpperCase()} ({new Set(samples.map(s => s.pad)).size} samples)</strong>
                              </label>
                            </div>
                          </div>
                        ))}
                        {backupDetails.selectedSampleSize > MAX_SESSION_BYTES && (
                          <div style={{ fontSize: 12, color: "#c00" }}>
                            Total: {formatSize(backupDetails.selectedSampleSize)} — will require {sessionCount} sessions
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div>
                <p>Failed to load backup details.</p>
                {loadError && <p style={{ fontSize: 12, fontStyle: "italic" }}>{loadError}</p>}
                <button className="btn" onClick={loadBackupDetails}>Retry</button>
              </div>
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
