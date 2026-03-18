import React from "react";

interface BackupProgressCardProps {
  currentOperation: string;
  backupProgress: number;
}

export const BackupProgressCard: React.FC<BackupProgressCardProps> = ({
  currentOperation,
  backupProgress,
}) => (
  <div className="section-block">
    <div className="mac-progress-label">
      <span><strong>Backup in Progress</strong> — {currentOperation}</span>
      <span>{backupProgress}%</span>
    </div>
    <div className="mac-progress">
      <div
        className="mac-progress-fill"
        style={{ width: `${backupProgress}%` }}
        role="progressbar"
        aria-valuenow={backupProgress}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  </div>
);
