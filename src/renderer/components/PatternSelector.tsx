import React, { useMemo, useCallback } from "react";

interface Pattern {
  id: string;
  name: string;
  bank: number;
  pattern: number;
  size: number;
}

interface PatternSelectorProps {
  selectedPatterns: string[];
  onPatternSelectionChange: (patterns: string[]) => void;
  disabled?: boolean;
  availablePatterns?: Pattern[];
}

const PatternChip: React.FC<{
  pattern: Pattern;
  selected: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
  formatSize: (bytes: number) => string;
}> = ({ pattern, selected, disabled, onToggle, formatSize }) => (
  <div
    key={pattern.id}
    className={`pattern-chip${selected ? " pattern-chip-selected" : ""}${
      disabled ? " pattern-chip-disabled" : ""
    }`}
    onClick={() => !disabled && onToggle(pattern.id)}
  >
    <div className="pattern-chip-main">
      <span className="pattern-chip-label">Pattern {pattern.pattern}</span>
      <span className="pattern-chip-size">{formatSize(pattern.size)}</span>
    </div>
    <div className="pattern-chip-name">{pattern.name}</div>
    {selected && <span className="pattern-chip-checkmark">✓</span>}
  </div>
);

export const PatternSelector: React.FC<PatternSelectorProps> = ({
  selectedPatterns,
  onPatternSelectionChange,
  disabled = false,
  availablePatterns = [],
}) => {
  const patternsByBank = useMemo(() => {
    return availablePatterns.reduce((acc, pattern) => {
      const bankKey = `Bank ${pattern.bank}`;
      if (!acc[bankKey]) acc[bankKey] = [];
      acc[bankKey].push(pattern);
      return acc;
    }, {} as Record<string, Pattern[]>);
  }, [availablePatterns]);

  const handlePatternToggle = useCallback(
    (patternId: string) => {
      if (disabled) return;
      const isSelected = selectedPatterns.includes(patternId);
      onPatternSelectionChange(
        isSelected
          ? selectedPatterns.filter((id) => id !== patternId)
          : [...selectedPatterns, patternId]
      );
    },
    [disabled, selectedPatterns, onPatternSelectionChange]
  );

  const handleSelectAll = useCallback(() => {
    if (disabled) return;
    onPatternSelectionChange(availablePatterns.map((p) => p.id));
  }, [disabled, availablePatterns, onPatternSelectionChange]);

  const handleClearAll = useCallback(() => {
    if (disabled) return;
    onPatternSelectionChange([]);
  }, [disabled, onPatternSelectionChange]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (availablePatterns.length === 0) {
    return (
      <div className="md-container">
        <div className="md-card-header">
          <h4 className="md-text-title">Patterns</h4>
        </div>
        <div className="md-text-body empty-patterns-message">
          No patterns found. Ensure device is in pattern mode and has patterns
          to backup.
        </div>
      </div>
    );
  }

  return (
    <div className="md-container">
      <div className="md-card-header">
        <h4 className="md-text-title">
          Patterns ({availablePatterns.length} found)
        </h4>
        <div className="md-card-actions">
          <button
            className="md-button-text"
            onClick={handleSelectAll}
            disabled={disabled}
          >
            Select All
          </button>
          <button
            className="md-button-text"
            onClick={handleClearAll}
            disabled={disabled}
          >
            Clear All
          </button>
        </div>
      </div>
      <div className="pattern-banks">
        {Object.entries(patternsByBank)
          .sort()
          .map(([bankName, patterns]) => (
            <div key={bankName} className="pattern-bank-section">
              <div className="pattern-bank-header">
                <h5 className="md-text-title-small">{bankName}</h5>
                <span className="pattern-count">
                  ({patterns.length} patterns)
                </span>
              </div>
              <div className="pattern-grid">
                {patterns.map((pattern) => (
                  <PatternChip
                    key={pattern.id}
                    pattern={pattern}
                    selected={selectedPatterns.includes(pattern.id)}
                    disabled={disabled}
                    onToggle={handlePatternToggle}
                    formatSize={formatSize}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>
      {selectedPatterns.length > 0 && (
        <div className="pattern-selection-info">
          <div className="md-text-body-small pattern-selection-count">
            Selected: {selectedPatterns.length} of {availablePatterns.length}{" "}
            patterns
          </div>
          <div className="md-text-body-small pattern-selection-note">
            Note: Currently all patterns will be backed up. Selective pattern
            backup coming soon.
          </div>
        </div>
      )}
    </div>
  );
};
