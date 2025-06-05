import React from "react";

interface BackupProgressCardProps {
  currentOperation: string;
  backupProgress: number;
}

export const BackupProgressCard: React.FC<BackupProgressCardProps> = ({
  currentOperation,
  backupProgress,
}) => (
  <div className="backup-progress-card">
    <div className="progress-content">
      <div className="progress-text">
        <div className="operation-name">{currentOperation}</div>
        <div className="progress-percent">{backupProgress}%</div>
      </div>
      <div className="md-linear-progress">
        <div
          className="md-linear-progress-bar"
          style={{ width: `${backupProgress}%` }}
          aria-valuenow={backupProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>
    </div>
  </div>
);
