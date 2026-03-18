import React, { useCallback } from "react";
import { PatternSelector } from "./PatternSelector";
import { SampleBankSelector } from "./SampleBankSelector";

interface CombinedBackupOptionsProps {
  includePatterns: boolean;
  setIncludePatterns: (v: boolean) => void;
  includeSamples: boolean;
  setIncludeSamples: (v: boolean) => void;
  availablePatterns: any[];
  selectedPatterns: string[];
  setSelectedPatterns: (v: string[]) => void;
  canBackupPatterns: boolean;
  isBackupInProgress: boolean;
  availableBanks: string[];
  selectedCombinedBanks: string[];
  setSelectedCombinedBanks: (v: string[]) => void;
  deviceStatus: { connected: boolean };
  log: any;
}

interface OptionSectionProps {
  checked: boolean;
  onHeaderClick: () => void;
  disabled?: boolean;
  title: string;
  warning?: string;
  children?: React.ReactNode;
}

const OptionSection: React.FC<OptionSectionProps> = ({
  checked,
  onHeaderClick,
  disabled,
  title,
  warning,
  children,
}) => (
  <div className="option-section">
    <div className={`option-header${disabled ? " option-disabled" : ""}`}>
      <div className="field-row" style={{ margin: 0, gap: 8 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onHeaderClick}
          disabled={disabled}
        />
        <label
          style={{ cursor: disabled ? "not-allowed" : "pointer" }}
          onClick={disabled ? undefined : onHeaderClick}
        >
          {title}
        </label>
        {warning && (
          <span style={{ fontSize: 11, color: "#666", fontStyle: "italic" }}>
            — {warning}
          </span>
        )}
      </div>
    </div>
    <div className="option-content">
      {children}
    </div>
  </div>
);

export const CombinedBackupOptions: React.FC<CombinedBackupOptionsProps> = ({
  includePatterns,
  setIncludePatterns,
  includeSamples,
  setIncludeSamples,
  availablePatterns,
  selectedPatterns,
  setSelectedPatterns,
  canBackupPatterns,
  isBackupInProgress,
  availableBanks,
  selectedCombinedBanks,
  setSelectedCombinedBanks,
  deviceStatus,
  log,
}) => {
  const handlePatternToggle = useCallback(() => {
    const checked = !includePatterns;
    log.debug("Pattern checkbox changed", { checked });
    setIncludePatterns(checked);
    if (checked && !includeSamples) setSelectedCombinedBanks([]);
    if (!checked) setSelectedPatterns([]);
  }, [
    includePatterns,
    setIncludePatterns,
    setSelectedCombinedBanks,
    setSelectedPatterns,
    includeSamples,
    log,
  ]);

  const handleSamplesToggle = useCallback(() => {
    const checked = !includeSamples;
    log.debug("Samples checkbox changed", { checked });
    setIncludeSamples(checked);
    if (!checked && includePatterns) setSelectedCombinedBanks([]);
  }, [includeSamples, setIncludeSamples, setSelectedCombinedBanks, includePatterns, log]);

  const handlePatternSelectionChange = useCallback((patterns: string[]) => {
    setSelectedPatterns(patterns);
    if (patterns.length > 0 && !includePatterns) setIncludePatterns(true);
  }, [setSelectedPatterns, includePatterns, setIncludePatterns]);

  const handleBankSelectionChange = useCallback((banks: string[]) => {
    setSelectedCombinedBanks(banks);
    if (banks.length > 0 && !includeSamples) setIncludeSamples(true);
  }, [setSelectedCombinedBanks, includeSamples, setIncludeSamples]);

  return (
    <div>
      <OptionSection
        checked={includePatterns}
        onHeaderClick={handlePatternToggle}
        disabled={isBackupInProgress}
        title="Include Patterns"
        warning={
          !canBackupPatterns && deviceStatus.connected
            ? "Device must be in pattern mode"
            : undefined
        }
      >
        <div style={{ marginBottom: 4 }}>Patterns to backup:</div>
        <PatternSelector
          selectedPatterns={selectedPatterns}
          onPatternSelectionChange={handlePatternSelectionChange}
          disabled={!canBackupPatterns || isBackupInProgress}
          availablePatterns={availablePatterns}
        />
      </OptionSection>

      <OptionSection
        checked={includeSamples}
        onHeaderClick={handleSamplesToggle}
        disabled={isBackupInProgress}
        title="Include Samples"
      >
        <div style={{ marginBottom: 4 }}>
          Sample Banks (leave empty for all):
        </div>
        <SampleBankSelector
          selectedBanks={selectedCombinedBanks}
          onBankSelectionChange={handleBankSelectionChange}
          disabled={isBackupInProgress}
          availableBanks={availableBanks}
        />
      </OptionSection>
    </div>
  );
};
