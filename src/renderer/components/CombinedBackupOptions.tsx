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

interface OptionToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title: string;
  children?: React.ReactNode;
  warning?: React.ReactNode;
}

const OptionToggle: React.FC<OptionToggleProps> = ({
  checked,
  onChange,
  disabled,
  title,
  children,
  warning,
}) => (
  <label className="option-toggle">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
    />
    <span className="toggle-slider"></span>
    <div className="toggle-content">
      <span className="toggle-title">{title}</span>
      {warning}
    </div>
    {checked && children}
  </label>
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
  const handlePatternToggle = useCallback(
    (checked: boolean) => {
      log.debug("Pattern checkbox changed", { checked });
      setIncludePatterns(checked);
      if (checked && !includeSamples) setSelectedCombinedBanks([]);
      if (checked && availablePatterns?.length > 0) {
        setSelectedPatterns(availablePatterns.map((p) => p.id));
        log.debug("Auto-selected all patterns when enabling patterns", {
          count: availablePatterns.length,
        });
      } else if (!checked) {
        setSelectedPatterns([]);
      }
    },
    [
      setIncludePatterns,
      setSelectedCombinedBanks,
      setSelectedPatterns,
      includeSamples,
      availablePatterns,
      log,
    ]
  );

  const handleSamplesToggle = useCallback(
    (checked: boolean) => {
      log.debug("Samples checkbox changed", { checked });
      setIncludeSamples(checked);
      if (!checked && includePatterns) setSelectedCombinedBanks([]);
    },
    [setIncludeSamples, setSelectedCombinedBanks, includePatterns, log]
  );

  return (
    <div className="combined-options">
      <OptionToggle
        checked={includePatterns}
        onChange={handlePatternToggle}
        disabled={isBackupInProgress}
        title="Include Patterns"
        warning={
          !canBackupPatterns && deviceStatus.connected ? (
            <span className="toggle-warning">
              Device must be in pattern mode
            </span>
          ) : null
        }
      >
        <div className="pattern-selection">
          <div className="selection-label">Patterns to backup:</div>
          <PatternSelector
            selectedPatterns={selectedPatterns}
            onPatternSelectionChange={setSelectedPatterns}
            disabled={!canBackupPatterns || isBackupInProgress}
            availablePatterns={availablePatterns}
          />
        </div>
      </OptionToggle>
      <OptionToggle
        checked={includeSamples}
        onChange={handleSamplesToggle}
        disabled={isBackupInProgress}
        title="Include Samples"
      >
        <div className="sample-selection">
          <div className="selection-label">
            Sample Banks (leave empty for all banks):
          </div>
          <SampleBankSelector
            selectedBanks={selectedCombinedBanks}
            onBankSelectionChange={setSelectedCombinedBanks}
            disabled={isBackupInProgress}
            availableBanks={availableBanks}
          />
        </div>
      </OptionToggle>
    </div>
  );
};
