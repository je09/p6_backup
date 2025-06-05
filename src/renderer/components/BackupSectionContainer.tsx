import React from "react";
import { DeviceStatus, BackupResult } from "../../shared/types/index";
import { BackupSection } from "./BackupSection";

interface BackupSectionContainerProps {
  deviceStatus: DeviceStatus;
  onBackupComplete: (result: BackupResult) => void;
}

export function BackupSectionContainer({
  deviceStatus,
  onBackupComplete,
}: BackupSectionContainerProps) {
  return (
    <BackupSection
      deviceStatus={deviceStatus}
      onBackupComplete={onBackupComplete}
    />
  );
}
