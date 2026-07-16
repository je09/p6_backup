import React, { useState, useEffect, useMemo, useRef } from "react";
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
import { FileCopyNotifier } from "./components/FileCopyNotifier";
import { createComponentLogger } from "./utils/logger";
import { UI_LABELS } from "../shared/constants";
import { SnackbarProvider } from "./context/SnackbarContext";

type View = "backup" | "restore" | "settings" | "guide";

// Order here drives both the tab strip and the ⌘1–⌘4 accelerators in the menu.
const TABS: Array<{ key: View; label: string }> = [
  { key: "backup", label: UI_LABELS.NAV_BACKUP },
  { key: "restore", label: UI_LABELS.NAV_RESTORE },
  { key: "settings", label: UI_LABELS.NAV_SETTINGS },
  { key: "guide", label: UI_LABELS.NAV_GUIDE },
];

/** Reachable mid-backup: the guide is what the user needs when they get stuck. */
const ALWAYS_AVAILABLE: View[] = ["backup", "guide"];

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

  // The menu listeners are registered once, so they read the flag from a ref
  // rather than closing over a state value that goes stale.
  const backupInProgress = useRef(false);
  const canOpen = (view: View) =>
    !backupInProgress.current || ALWAYS_AVAILABLE.includes(view);

  const handleBackupInProgressChange = (inProgress: boolean) => {
    backupInProgress.current = inProgress;
    setIsBackupInProgress(inProgress);
  };

  useEffect(() => {
    const onStatus = (status: DeviceStatus) => setDeviceStatus(status);
    const onBackup = () => setCurrentView("backup");
    const onNavigate = (view: string) => {
      if (canOpen(view as View)) setCurrentView(view as View);
    };
    window.electronAPI.onDeviceStatusChanged(onStatus);
    window.electronAPI.onMenuNewBackup(onBackup);
    window.electronAPI.onNavigate(onNavigate);
    handleDetectDevice();
    return () => {
      window.electronAPI.removeAllListeners("device:status-changed");
      window.electronAPI.removeAllListeners("menu:new-backup");
      window.electronAPI.removeAllListeners("menu:navigate");
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

  /**
   * Every tab stays mounted and inactive ones are hidden, so switching away
   * does not throw the tab's state away — a restore mid-way through its power
   * cycles would otherwise be destroyed by a click on another tab.
   */
  const PANELS: Record<View, React.ReactNode> = {
    backup: (
      <BackupSection
        deviceStatus={deviceStatus}
        onBackupComplete={handleBackupComplete}
        onBackupInProgressChange={handleBackupInProgressChange}
      />
    ),
    restore: (
      <RestoreSection
        deviceStatus={deviceStatus}
        onRestoreComplete={handleRestoreComplete}
      />
    ),
    settings: <SettingsSection />,
    guide: <UserGuide />,
  };

  return (
    <SnackbarProvider>
    <FileCopyNotifier />
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
            const locked =
              isBackupInProgress && !ALWAYS_AVAILABLE.includes(tab.key);
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
          {TABS.map((tab) => (
            <div
              key={tab.key}
              className={tab.key === "restore" ? "main-pane-fill" : "main-pane-scroll"}
              style={currentView === tab.key ? undefined : { display: "none" }}
            >
              {PANELS[tab.key]}
            </div>
          ))}
        </div>
      </div>
    </div>
    </SnackbarProvider>
  );
};
