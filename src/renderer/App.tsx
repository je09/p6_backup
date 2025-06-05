import React, { useState, useEffect, useMemo } from "react";
import {
  DeviceStatus,
  BackupResult,
  RestoreResult,
} from "../shared/types/index";
import { Header } from "./components/Header";
import { DeviceStatusCard } from "./components/DeviceStatusCard";
import { BackupSectionContainer } from "./components/BackupSectionContainer";
import { RestoreSection } from "./components/RestoreSection";
import { UserGuide } from "./components/UserGuide";
import { createComponentLogger } from "./utils/logger";

export const App: React.FC = () => {
  const logger = useMemo(() => createComponentLogger("App"), []);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>({
    connected: false,
    mode: "unknown",
    connectionType: "usb",
    firmwareVersion: "",
    deviceId: "",
    lastSeen: null,
  });
  const [currentView, setCurrentView] = useState<
    "backup" | "restore" | "guide"
  >("backup");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const onStatus = (status: DeviceStatus) => setDeviceStatus(status);
    const onBackup = () => setCurrentView("backup");
    const onGuide = () => setCurrentView("guide");
    window.electronAPI.onDeviceStatusChanged(onStatus);
    window.electronAPI.onMenuNewBackup(onBackup);
    window.electronAPI.onNavigationShowGuide(onGuide);
    handleDetectDevice();
    return () => {
      window.electronAPI.removeAllListeners("device:status-changed");
      window.electronAPI.removeAllListeners("menu:new-backup");
      window.electronAPI.removeAllListeners("navigation:show-guide");
    };
  }, []);

  const handleDetectDevice = async () => {
    setIsLoading(true);
    try {
      if (await window.electronAPI.detectDevice()) {
        setDeviceStatus(await window.electronAPI.getDeviceStatus());
      }
    } catch (error) {
      logger.error("Device detection failed", { error });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupComplete = (result: BackupResult) =>
    logger.info("Backup completed:", JSON.stringify(result));
  const handleRestoreComplete = (result: RestoreResult) =>
    logger.info("Restore completed:", JSON.stringify(result));

  const renderCurrentView = () => {
    switch (currentView) {
      case "backup":
        return (
          <BackupSectionContainer
            deviceStatus={deviceStatus}
            onBackupComplete={handleBackupComplete}
          />
        );
      case "restore":
        return (
          <RestoreSection
            deviceStatus={deviceStatus}
            onRestoreComplete={handleRestoreComplete}
          />
        );
      case "guide":
        return <UserGuide />;
      default:
        return null;
    }
  };

  return (
    <div className="md-app">
      <Header currentView={currentView} onViewChange={setCurrentView} />
      <main className="md-main-content">
        <div className="md-container">
          <DeviceStatusCard deviceStatus={deviceStatus} isLoading={isLoading} />
          {renderCurrentView()}
        </div>
      </main>
    </div>
  );
};
