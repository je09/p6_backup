import React from "react";

interface QuickActionButtonsProps {
  canBackupPatterns: boolean;
  canFullBackup: boolean;
  isBackupInProgress: boolean;
  onPatternBackup: () => void;
  onSampleBackup: () => void;
  onFullBackup: () => void;
  deviceStatus: { connected: boolean; mode: string };
}

interface BackupActionButtonProps {
  className: string;
  onClick: () => void;
  disabled: boolean;
  title: string;
  subtitle: string;
  warning?: string | null;
}

const BackupActionButton: React.FC<BackupActionButtonProps> = ({
  className,
  onClick,
  disabled,
  title,
  subtitle,
  warning,
}) => (
  <button
    className={`backup-action-button ${className}${
      disabled ? " disabled" : ""
    }`}
    onClick={onClick}
    disabled={disabled}
  >
    <div className="action-content">
      <div className="action-title">{title}</div>
      <div className="action-subtitle">{subtitle}</div>
      {warning && <div className="action-warning">{warning}</div>}
    </div>
  </button>
);

export const QuickActionButtons: React.FC<QuickActionButtonsProps> = ({
  canBackupPatterns,
  canFullBackup,
  isBackupInProgress,
  onPatternBackup,
  onSampleBackup,
  onFullBackup,
  deviceStatus,
}) => {
  const { connected } = deviceStatus;
  return (
    <div className="quick-actions">
      <BackupActionButton
        className="patterns"
        onClick={onPatternBackup}
        disabled={!canBackupPatterns || isBackupInProgress}
        title="Patterns"
        subtitle="All patterns backup"
        warning={
          !canBackupPatterns && connected ? "Switch to pattern mode" : null
        }
      />
      <BackupActionButton
        className="samples"
        onClick={onSampleBackup}
        disabled={!canFullBackup || isBackupInProgress}
        title="All Samples"
        subtitle="Complete sample library backup"
      />
      <BackupActionButton
        className="full"
        onClick={onFullBackup}
        disabled={!canFullBackup || isBackupInProgress}
        title="Everything"
        subtitle="Complete device backup"
      />
    </div>
  );
};
