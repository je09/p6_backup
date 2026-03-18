import React from "react";
import { ModeSwitchModal } from "./ModeSwitchModal";
import { BackupNameModal } from "./BackupNameModal";

export interface ModeSwitchDetails {
  currentMode: string;
  requiredMode: string;
  operation: string;
  onContinue: () => void;
}

export interface BackupNameModalDetails {
  title: string;
  subtitle?: string;
  onConfirm: (customName: string | undefined) => void;
}

interface BackupModalsProps {
  showModeSwitchModal: boolean;
  modeSwitchDetails: ModeSwitchDetails | null;
  liveMode: string;
  onModeSwitchContinue: () => void;
  onModeSwitchCancel: () => void;
  showBackupNameModal: boolean;
  backupNameModalDetails: BackupNameModalDetails | null;
  onBackupNameConfirm: (customName: string | undefined) => void;
  onBackupNameCancel: () => void;
}

export const BackupModals: React.FC<BackupModalsProps> = ({
  showModeSwitchModal,
  modeSwitchDetails,
  liveMode,
  onModeSwitchContinue,
  onModeSwitchCancel,
  showBackupNameModal,
  backupNameModalDetails,
  onBackupNameConfirm,
  onBackupNameCancel,
}) => (
  <>
    {showModeSwitchModal && modeSwitchDetails && (
      <ModeSwitchModal
        isOpen={showModeSwitchModal}

        requiredMode={modeSwitchDetails.requiredMode}
        liveMode={liveMode}
        operation={modeSwitchDetails.operation}
        onContinue={onModeSwitchContinue}
        onCancel={onModeSwitchCancel}
      />
    )}
    {showBackupNameModal && backupNameModalDetails && (
      <BackupNameModal
        isOpen={showBackupNameModal}
        title={backupNameModalDetails.title}
        subtitle={backupNameModalDetails.subtitle}
        onConfirm={onBackupNameConfirm}
        onCancel={onBackupNameCancel}
      />
    )}
  </>
);
