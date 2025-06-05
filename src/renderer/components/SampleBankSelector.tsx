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
  // Log props for debugging
  const logger = createComponentLogger("SampleBankSelector");
  logger.debug("SampleBankSelector props:", {
    selectedBanks,
    disabled,
    availableBanks,
  });

  // If no available banks are specified, allow all banks (for backward compatibility)
  const effectiveAvailableBanks =
    availableBanks.length === 0
      ? SAMPLE_BANKS.map((bank) => bank.id)
      : availableBanks;
  const availableBankSet = React.useMemo(
    () => new Set(effectiveAvailableBanks.map((b) => b.toLowerCase())),
    [effectiveAvailableBanks]
  );

  const handleBankToggle = (bankId: string) => {
    if (disabled) return;

    const isSelected = selectedBanks.includes(bankId);
    if (isSelected) {
      onBankSelectionChange(selectedBanks.filter((id) => id !== bankId));
    } else {
      onBankSelectionChange([...selectedBanks, bankId]);
    }
  };

  const handleSelectAll = () => {
    if (disabled) return;
    onBankSelectionChange(SAMPLE_BANKS.map((bank) => bank.id));
  };

  const handleClearAll = () => {
    if (disabled) return;
    onBankSelectionChange([]);
  };

  return (
    <div className="md-container">
      <div className="md-card-header">
        <h4 className="md-text-title">Sample Banks</h4>
        <div className="md-card-actions">
          <button className="md-button-text" onClick={handleSelectAll}>
            Select All
          </button>
          <button className="md-button-text" onClick={handleClearAll}>
            Clear All
          </button>
        </div>
      </div>

      <div className="md-sample-bank-grid">
        {SAMPLE_BANKS.map((bank) => {
          const isSelected = selectedBanks.includes(bank.id);
          const isAvailable = availableBankSet.has(bank.id.toLowerCase());
          // Use disabled directly
          const className = [
            "md-chip",
            isSelected && "md-chip-selected",
            disabled && "md-chip-disabled",
            !isAvailable && "md-chip-unavailable",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={bank.id}
              className={className}
              onClick={() => !disabled && handleBankToggle(bank.id)}
              title={
                !isAvailable
                  ? "Bank not currently available - mode switching may be required"
                  : ""
              }
            >
              <span className="md-chip-label">{bank.name}</span>
              <span className="md-chip-sublabel">({bank.pairs})</span>
            </div>
          );
        })}
      </div>

      {selectedBanks.length > 0 && (
        <div className="md-text-body-small">
          Selected: {selectedBanks.map((id) => id.toUpperCase()).join(", ")}
        </div>
      )}
    </div>
  );
};
