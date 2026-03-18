import React, { useMemo, useCallback } from "react";
import { formatSize } from "../utils/formatters";

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


export const PatternSelector: React.FC<PatternSelectorProps> = ({
  selectedPatterns,
  onPatternSelectionChange,
  disabled = false,
  availablePatterns = [],
}) => {
  const patternsByBank = useMemo(() => {
    return availablePatterns.reduce((acc, p) => {
      const key = `Bank ${p.bank}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {} as Record<string, Pattern[]>);
  }, [availablePatterns]);

  const handleToggle = useCallback(
    (id: string) => {
      if (disabled) return;
      onPatternSelectionChange(
        selectedPatterns.includes(id)
          ? selectedPatterns.filter((x) => x !== id)
          : [...selectedPatterns, id]
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

  if (availablePatterns.length === 0) {
    return (
      <div style={{ fontSize: 13, fontStyle: "italic", padding: "4px 0" }}>
        No patterns found. Ensure device is in pattern mode.
      </div>
    );
  }

  return (
    <div>
      <section className="field-row" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 13 }}>
          {availablePatterns.length} patterns found
        </span>
        <button className="btn" onClick={handleSelectAll} disabled={disabled}>
          All
        </button>
        <button className="btn" onClick={handleClearAll} disabled={disabled}>
          None
        </button>
      </section>

      {Object.entries(patternsByBank)
        .sort()
        .map(([bankName, patterns]) => (
          <div key={bankName} className="pattern-section">
            <div className="pattern-section-header">
              <strong>{bankName}</strong>
              <span>{patterns.length} patterns</span>
            </div>
            <div className="pattern-grid">
              {patterns.map((p) => {
                const selected = selectedPatterns.includes(p.id);
                return (
                  <div
                    key={p.id}
                    className={`pattern-chip${selected ? " pattern-chip-selected" : ""}${disabled ? " pattern-chip-disabled" : ""}`}
                    onClick={() => handleToggle(p.id)}
                  >
                    <div className="pattern-chip-main">
                      <span className="pattern-chip-label">
                        P{p.pattern}
                      </span>
                      <span className="pattern-chip-size">
                        {formatSize(p.size)}
                      </span>
                    </div>
                    <div className="pattern-chip-name">{p.name}</div>
                    {selected && (
                      <span className="pattern-chip-checkmark">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {selectedPatterns.length > 0 && (
        <div className="selection-info">
          {selectedPatterns.length} of {availablePatterns.length} selected
        </div>
      )}
    </div>
  );
};
