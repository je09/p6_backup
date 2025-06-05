import React, { useState, useEffect } from "react";
import { UI_LABELS } from "../../shared/constants";

const BANK_SWITCH_COUNTDOWN = 10;

interface BankSwitchingGuideProps {
  currentBankIndex: number;
  totalBanks: number;
  targetBanks: string[];
  onContinue: () => void;
  onCancel: () => void;
  isVisible: boolean;
}

export const BankSwitchingGuide: React.FC<BankSwitchingGuideProps> = ({
  currentBankIndex,
  totalBanks,
  targetBanks,
  onContinue,
  onCancel,
  isVisible,
}) => {
  const [countdown, setCountdown] = useState(BANK_SWITCH_COUNTDOWN);
  const [showCountdown, setShowCountdown] = useState(false);

  const currentBank = targetBanks[currentBankIndex];
  const isLastBank = currentBankIndex === totalBanks - 1;

  useEffect(() => {
    if (showCountdown && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (showCountdown && countdown === 0) {
      onContinue();
    }
  }, [countdown, showCountdown, onContinue]);

  if (!isVisible) return null;

  return (
    <div className="md-card" aria-label="Bank Switching Guide">
      <div className="md-card-content">
        <div className="md-linear-progress">
          <div
            className="md-linear-progress-bar"
            style={{ width: `${((currentBankIndex + 1) / totalBanks) * 100}%` }}
          />
        </div>

        <div className="md-text-headline">
          Bank {currentBank?.toUpperCase()} ({currentBankIndex + 1}/{totalBanks}
          )
        </div>

        <div className="md-text-body">
          {UI_LABELS.BANK_SWITCHING_INSTRUCTION(currentBank)}
        </div>
      </div>

      <div className="md-card-actions">
        <button
          className="md-button md-button-filled"
          aria-label={
            showCountdown ? `Continue in ${countdown} seconds` : "Ready"
          }
          onClick={() => {
            if (!showCountdown) {
              setShowCountdown(true);
              setCountdown(BANK_SWITCH_COUNTDOWN);
            } else {
              onContinue();
            }
          }}
        >
          {showCountdown
            ? UI_LABELS.CONTINUE_COUNTDOWN(countdown)
            : UI_LABELS.READY}
        </button>
        <button
          className="md-button md-button-text"
          aria-label="Cancel"
          onClick={onCancel}
        >
          {UI_LABELS.CANCEL}
        </button>
      </div>
    </div>
  );
};

interface AutomatedBackupManagerProps {
  targetBanks: string[];
  onBankBackupComplete: (bankId: string) => Promise<void>;
  onAllComplete: () => void;
  onError: (error: unknown) => void;
  onCancel: () => void;
}

export const AutomatedBackupManager: React.FC<AutomatedBackupManagerProps> = ({
  targetBanks,
  onBankBackupComplete,
  onAllComplete,
  onError,
  onCancel,
}) => {
  const [currentBankIndex, setCurrentBankIndex] = useState(0);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [completedBanks, setCompletedBanks] = useState<string[]>([]);
  const [errorBank, setErrorBank] = useState<string | null>(null);

  const handleContinueToNextBank = async () => {
    if (currentBankIndex >= targetBanks.length) {
      onAllComplete();
      return;
    }

    const currentBank = targetBanks[currentBankIndex];
    setIsBackingUp(true);
    setErrorBank(null);

    try {
      await onBankBackupComplete(currentBank);
      setCompletedBanks((prev) => [...prev, currentBank]);

      if (currentBankIndex + 1 < targetBanks.length) {
        setCurrentBankIndex(currentBankIndex + 1);
      } else {
        onAllComplete();
      }
    } catch (error) {
      setErrorBank(currentBank);
      onError(error);
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className="md-container">
      {isBackingUp ? (
        <div className="md-card" aria-label="Backing Up Bank">
          <div className="md-card-content">
            <div className="md-circular-progress">
              <svg className="md-circular-progress-svg" viewBox="0 0 40 40">
                <circle
                  className="md-circular-progress-circle"
                  cx="20"
                  cy="20"
                  r="18"
                  fill="none"
                  strokeWidth="4"
                />
              </svg>
            </div>
            <div className="md-text-headline">
              {UI_LABELS.BACKING_UP_BANK(targetBanks[currentBankIndex])}
            </div>
            <div className="md-text-body">
              {UI_LABELS.PLEASE_WAIT_DO_NOT_DISCONNECT}
            </div>
          </div>
        </div>
      ) : (
        <BankSwitchingGuide
          currentBankIndex={currentBankIndex}
          totalBanks={targetBanks.length}
          targetBanks={targetBanks}
          onContinue={handleContinueToNextBank}
          onCancel={onCancel}
          isVisible={true}
        />
      )}

      <div className="md-card">
        <div className="md-card-content">
          <div className="md-text-title">{UI_LABELS.PROGRESS_TITLE}</div>
          <div className="md-chip-set">
            {targetBanks.map((bank, index) => (
              <div
                key={bank}
                className={`md-chip ${
                  completedBanks.includes(bank)
                    ? "md-chip-completed"
                    : errorBank === bank
                    ? "md-chip-error"
                    : index === currentBankIndex
                    ? "md-chip-current"
                    : "md-chip-pending"
                }`}
                aria-label={
                  completedBanks.includes(bank)
                    ? `${bank.toUpperCase()} completed`
                    : errorBank === bank
                    ? `${bank.toUpperCase()} failed`
                    : index === currentBankIndex
                    ? `${bank.toUpperCase()} in progress`
                    : `${bank.toUpperCase()} pending`
                }
              >
                <span className="md-chip-label">{bank.toUpperCase()}</span>
                {completedBanks.includes(bank) && (
                  <span className="md-chip-icon">✓</span>
                )}
                {errorBank === bank && (
                  <span className="md-chip-icon" title="Backup failed">
                    !
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
