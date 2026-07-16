import React, { useState, useEffect, useMemo } from "react";
import {
  DeviceStatus,
  BackupResult,
  RestoreResult,
} from "../shared/types/index";
import { DeviceStatusCard } from "./components/DeviceStatusCard";
import { BackupSection } from "./components/BackupSection";
import { RestoreSection } from "./components/RestoreSection";
import { UserGuide } from "./components/UserGuide";
import { SettingsSection } from "./components/SettingsSection";
import { createComponentLogger } from "./utils/logger";
import { UI_LABELS } from "../shared/constants";
import { SnackbarProvider } from "./context/SnackbarContext";

type View = "backup" | "restore" | "guide" | "settings";

const TABS: Array<{ key: View; label: string }> = [
  { key: "backup", label: UI_LABELS.NAV_BACKUP },
  { key: "restore", label: UI_LABELS.NAV_RESTORE },
  { key: "guide", label: UI_LABELS.NAV_GUIDE },
  { key: "settings", label: UI_LABELS.NAV_SETTINGS },
];

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
  const [currentView, setCurrentView] = useState<View>("backup");
  const [isLoading, setIsLoading] = useState(false);
  const [isBackupInProgress, setIsBackupInProgress] = useState(false);

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
          <BackupSection
            deviceStatus={deviceStatus}
            onBackupComplete={handleBackupComplete}
            onBackupInProgressChange={setIsBackupInProgress}
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
      case "settings":
        return <SettingsSection />;
      default:
        return null;
    }
  };

  return (
    <SnackbarProvider>
    <div className="app-desktop">
      <div className="window app-window">
        <div className="title-bar app-title-bar">
          <button
            aria-label="Close"
            className="close"
            onClick={() => window.electronAPI.windowClose()}
          />
          <h1 className="title">{UI_LABELS.APP_TITLE}</h1>
          <button aria-label="Minimize" className="resize" onClick={() => window.electronAPI.windowMinimize()} />
        </div>
        <ul role="menu-bar">
          {TABS.map((tab) => {
            const locked = isBackupInProgress && tab.key !== "backup";
            return (
              <li
                key={tab.key}
                role="menu-item"
                tabIndex={0}
                className={[
                  currentView === tab.key ? "nav-active" : "",
                  locked ? "nav-locked" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => !locked && setCurrentView(tab.key)}
                onKeyDown={(e) => e.key === "Enter" && !locked && setCurrentView(tab.key)}
                title={locked ? "Backup in progress — please wait" : undefined}
              >
                {tab.label}
              </li>
            );
          })}
        </ul>
        <div className="separator" />
        <div className="main-pane window-pane">
          <DeviceStatusCard deviceStatus={deviceStatus} isLoading={isLoading} />
          <div className={currentView === "restore" ? "main-pane-fill" : "main-pane-scroll"}>
            {renderCurrentView()}
          </div>
        </div>
      </div>
    </div>
    </SnackbarProvider>
  );
};
