import React from "react";

// BankReadinessIndicator moved from BackupSection
interface BankReadinessIndicatorProps {
  targetBank: string;
  isReady: boolean;
  currentBank: string | null;
}

export const BankReadinessIndicator: React.FC<BankReadinessIndicatorProps> = ({
  targetBank,
  isReady,
  currentBank,
}) => {
  const bank = targetBank.toUpperCase();
  return isReady ? (
    <div className="mode-success">
      ✅ Device is ready! Bank {bank} is correctly selected.
    </div>
  ) : (
    <div className="mode-warning">
      ⚠️ Device is in Sample mode but bank {bank} is not selected.
      {currentBank && (
        <div style={{ marginTop: 4, fontSize: "0.9em" }}>
          Current bank: {currentBank.toUpperCase()} → Switch to: {bank}
        </div>
      )}
    </div>
  );
};
