import React, { useCallback, useMemo } from "react";
import { PatternInfo } from "../../shared/types/index";
import { SampleDependency } from "../../shared/utils/prmParser";
import { PatternSelector } from "./PatternSelector";

interface BackupOptionsProps {
  availablePatterns: PatternInfo[];
  selectedPatterns: string[];
  setSelectedPatterns: (v: string[]) => void;
  canBackupPatterns: boolean;
  isBackupInProgress: boolean;
  detectedDependencies: SampleDependency[];
  deviceStatus: { connected: boolean };
}

function groupByBank(deps: SampleDependency[]): Record<string, number[]> {
  const groups: Record<string, number[]> = {};
  for (const dep of deps) {
    if (!groups[dep.bankLetter]) groups[dep.bankLetter] = [];
    groups[dep.bankLetter].push(dep.padNumber);
  }
  return groups;
}

export const BackupOptions: React.FC<BackupOptionsProps> = ({
  availablePatterns,
  selectedPatterns,
  setSelectedPatterns,
  canBackupPatterns,
  isBackupInProgress,
  detectedDependencies,
  deviceStatus,
}) => {
  const dependencyGroups = useMemo(
    () => groupByBank(detectedDependencies),
    [detectedDependencies],
  );

  const handlePatternSelectionChange = useCallback(
    (patterns: string[]) => setSelectedPatterns(patterns),
    [setSelectedPatterns],
  );

  return (
    <div>
      {!canBackupPatterns && deviceStatus.connected && (
        <p style={{ fontSize: 11, fontStyle: "italic", margin: "0 0 6px" }}>
          Device must be in Pattern Mode to load patterns.
        </p>
      )}
      <PatternSelector
        selectedPatterns={selectedPatterns}
        onPatternSelectionChange={handlePatternSelectionChange}
        disabled={!canBackupPatterns || isBackupInProgress}
        availablePatterns={availablePatterns}
      />

      {detectedDependencies.length > 0 && (
        <div className="info-box" style={{ marginTop: 8 }}>
          <div style={{ marginBottom: 4, fontSize: 12 }}>
            <strong>Samples used by selected patterns:</strong>
          </div>
          {Object.entries(dependencyGroups)
            .sort()
            .map(([bank, pads]) => (
              <div key={bank} style={{ fontSize: 12 }}>
                Bank {bank} — Pads {pads.join(", ")}
              </div>
            ))}
          <div style={{ marginTop: 6, fontSize: 11 }}>
            These will be backed up automatically after patterns.
          </div>
        </div>
      )}

      {!deviceStatus.connected && (
        <div className="info-box" style={{ marginTop: 8, fontSize: 13 }}>
          <p style={{ margin: "0 0 4px" }}>
            <strong>How to connect your device:</strong>
          </p>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            <li>
              Backup: hold <strong>[PLAY]</strong> while powering on
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};
