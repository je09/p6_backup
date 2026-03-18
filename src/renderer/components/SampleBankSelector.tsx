import React from "react";
import { createComponentLogger } from "../utils/logger";

interface SampleBankSelectorProps {
  selectedBanks: string[];
  onBankSelectionChange: (banks: string[]) => void;
  disabled?: boolean;
  availableBanks?: string[];
}

const SAMPLE_BANKS = [
  { id: "a", name: "Bank A", pairs: "A:E" },
  { id: "b", name: "Bank B", pairs: "B:F" },
  { id: "c", name: "Bank C", pairs: "C:G" },
  { id: "d", name: "Bank D", pairs: "D:H" },
  { id: "e", name: "Bank E", pairs: "A:E" },
  { id: "f", name: "Bank F", pairs: "B:F" },
  { id: "g", name: "Bank G", pairs: "C:G" },
  { id: "h", name: "Bank H", pairs: "D:H" },
];

export const SampleBankSelector: React.FC<SampleBankSelectorProps> = ({
  selectedBanks,
  onBankSelectionChange,
  disabled = false,
  availableBanks = [],
}) => {
  const logger = createComponentLogger("SampleBankSelector");
  logger.debug("SampleBankSelector props:", { selectedBanks, disabled, availableBanks });

  const effectiveAvailableBanks =
    availableBanks.length === 0
      ? SAMPLE_BANKS.map((b) => b.id)
      : availableBanks;
  const availableBankSet = React.useMemo(
    () => new Set(effectiveAvailableBanks.map((b) => b.toLowerCase())),
    [effectiveAvailableBanks]
  );

  const handleBankToggle = (bankId: string) => {
    if (disabled) return;
    const isSelected = selectedBanks.includes(bankId);
    onBankSelectionChange(
      isSelected
        ? selectedBanks.filter((id) => id !== bankId)
        : [...selectedBanks, bankId]
    );
  };

  const handleSelectAll = () => {
    if (disabled) return;
    onBankSelectionChange(SAMPLE_BANKS.map((b) => b.id));
  };

  const handleClearAll = () => {
    if (disabled) return;
    onBankSelectionChange([]);
  };

  return (
    <div>
      <section className="field-row" style={{ marginBottom: 6 }}>
        <button className="btn" onClick={handleSelectAll} disabled={disabled}>
          Select All
        </button>
        <button className="btn" onClick={handleClearAll} disabled={disabled}>
          Clear
        </button>
      </section>
      <div className="bank-grid">
        {SAMPLE_BANKS.map((bank) => {
          const isSelected = selectedBanks.includes(bank.id);
          const isAvailable = availableBankSet.has(bank.id);
          return (
            <button
              key={bank.id}
              className={`btn${isSelected ? " btn-default" : ""}`}
              onClick={() => handleBankToggle(bank.id)}
              disabled={disabled}
              title={
                !isAvailable
                  ? "Bank not currently available"
                  : `${bank.name} (${bank.pairs})`
              }
              style={!isAvailable ? { opacity: 0.5 } : undefined}
            >
              {bank.name}
            </button>
          );
        })}
      </div>
      {selectedBanks.length > 0 && (
        <div style={{ fontSize: 11, marginTop: 4 }}>
          Selected: {selectedBanks.map((id) => id.toUpperCase()).join(", ")}
        </div>
      )}
      <div className="info-box" style={{ marginTop: 8, fontSize: 13 }}>
        <p style={{ margin: "0 0 4px" }}>
          <strong>How to connect your device:</strong>
        </p>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          <li>
            Backup: hold <strong>[BANK] + [SAMPLING]</strong> while powering on
          </li>
          <li>
            Restore: hold <strong>[SAMPLING]</strong> while powering on
          </li>
          {selectedBanks.some((b) => ["e", "f", "g", "h"].includes(b)) && (
            <li>
              Banks E–H require pressing <strong>[SAMPLING]</strong> again — they
              are handled in a separate session
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};
