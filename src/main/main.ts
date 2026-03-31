import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  globalShortcut,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { BackupService } from "../shared/services/BackupService";
import { FileSystemService } from "../shared/services/FileSystemService";
import { BackupDiscoveryService } from "../shared/services/BackupDiscoveryService";
import { ModeService } from "../shared/services/ModeService";
import { P6Device } from "../shared/models/P6Device";
import { UsbDeviceManager } from "../shared/services/UsbDeviceManager";
import { ModeDetector } from "../shared/services/ModeDetector";
import { logger, LogLevel } from "../shared/services/Logger";

class MainApplication {
  private mainWindow: BrowserWindow | null = null;
  private backupService: BackupService;
  private fileSystemService: FileSystemService;
  private backupDiscoveryService: BackupDiscoveryService;
  private modeService: ModeService;
  private p6Device: P6Device;

  constructor() {
    this.fileSystemService = new FileSystemService(
      (event: string, ...args: any[]) =>
        this.mainWindow?.webContents.send(event, ...args),
    );
    const usbManager = new UsbDeviceManager();
    const modeDetector = new ModeDetector(usbManager, {
      logLevel: "info",
      enableAutoRetry: true,
    });
    this.p6Device = new P6Device(
      usbManager,
      modeDetector,
      this.fileSystemService,
    );
    this.modeService = new ModeService(this.p6Device);
    this.backupService = new BackupService(
      this.p6Device,
      this.fileSystemService,
    );
    this.backupDiscoveryService = new BackupDiscoveryService(
      this.fileSystemService,
    );
    this.p6Device.onStatusChanged((status) =>
      this.mainWindow?.webContents.send("device:status-changed", status),
    );
    this.setupEventHandlers();
  }

  async createWindow(): Promise<void> {
    const iconPath =
      process.platform === "darwin"
        ? path.join(__dirname, "../assets/app.icns")
        : process.platform === "win32"
          ? path.join(__dirname, "../assets/icon.png")
          : path.join(__dirname, "../assets/icons/icon-512.png");
    const isDebugging = this.isDebugMode();
    this.mainWindow = new BrowserWindow({
      height: 580,
      width: 720,
      minHeight: 480,
      minWidth: 600,
      icon: iconPath,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "preload.js"),
        devTools: isDebugging,
        webSecurity: !isDebugging,
      },
      titleBarStyle: "hidden",
      backgroundColor: "#808080",
      show: false,
    });
    this.mainWindow.setWindowButtonVisibility(false);
    const indexPath = path.join(__dirname, "../index.html");
    if (!fs.existsSync(indexPath)) {
      logger.error("MainProcess", "index.html file NOT found at expected path");
    }
    this.mainWindow.loadFile(indexPath);
    if (isDebugging) this.mainWindow.webContents.openDevTools();
    this.mainWindow.once("ready-to-show", () => this.mainWindow?.show());
    this.mainWindow.webContents.on(
      "did-fail-load",
      (event, errorCode, errorDescription, validatedURL) =>
        logger.error(
          "MainProcess",
          `Failed to load: ${errorDescription} (${errorCode}) for URL: ${validatedURL}`,
        ),
    );
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
      this.unregisterGlobalShortcuts();
    });
    this.setupMenu();
  }

  private isDebugMode(): boolean {
    const debugArgs = ["--debug", "--inspect", "--inspect-brk", "--usb-debug"];
    const hasDebugArg = process.argv.some((arg) =>
      debugArgs.some((debugArg) => arg.includes(debugArg)),
    );
    const debugEnvVars = ["DEBUG", "ELECTRON_IS_DEV"];
    const hasDebugEnv = debugEnvVars.some((envVar) => process.env[envVar]);
    const hasRemoteDebugPort = process.argv.some((arg) =>
      arg.includes("--remote-debugging-port"),
    );
    const isInspected =
      typeof process.env.NODE_OPTIONS === "string" &&
      process.env.NODE_OPTIONS.includes("--inspect");
    const isNpmDev = process.cwd().includes("p6_backup");
    return (
      hasDebugArg ||
      hasDebugEnv ||
      hasRemoteDebugPort ||
      isInspected ||
      isNpmDev
    );
  }

  private setupMenu(): void {
    const isDebugging = this.isDebugMode();
    const template = [
      {
        label: "File",
        submenu: [
          {
            label: "New Backup",
            accelerator: "CmdOrCtrl+N",
            click: () => this.mainWindow?.webContents.send("menu:new-backup"),
          },
          {
            label: "Open Backup Folder",
            accelerator: "CmdOrCtrl+O",
            click: () => this.openBackupFolder(),
          },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "Device",
        submenu: [
          {
            label: "Detect P6 Device",
            accelerator: "CmdOrCtrl+D",
            click: () => this.detectDevice(),
          },
          {
            label: "Refresh Device Status",
            accelerator: "CmdOrCtrl+R",
            click: () => this.refreshDeviceStatus(),
          },
        ],
      },
      ...(isDebugging
        ? [
            {
              label: "Debug",
              submenu: [
                {
                  label: "Toggle DevTools",
                  accelerator: "F12",
                  click: () => this.toggleDevTools(),
                },
                {
                  label: "Reload",
                  accelerator: "CmdOrCtrl+R",
                  click: () => this.mainWindow?.webContents.reload(),
                },
                {
                  label: "Force Reload",
                  accelerator: "CmdOrCtrl+Shift+R",
                  click: () =>
                    this.mainWindow?.webContents.reloadIgnoringCache(),
                },
              ],
            },
          ]
        : []),
      {
        label: "Help",
        submenu: [
          { label: "About", click: () => this.showAbout() },
          { label: "User Guide", click: () => this.showUserGuide() },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template as any));
  }

  private setupEventHandlers(): void {
    const handleError = (msg: string) => (error: any) => {
      throw new Error(`${msg}: ${error}`);
    };

    ipcMain.handle("window:close", () => app.quit());
    ipcMain.handle("window:minimize", () => this.mainWindow?.minimize());

    ipcMain.handle(
      "backup:patterns",
      async (_, customName?: string, patternIds?: string[]) =>
        this.backupService
          .backupPatterns(customName, patternIds)
          .catch(handleError("Pattern backup failed")),
    );
    ipcMain.handle(
      "backup:samples",
      async (_, bankId?: string, customName?: string, padNumbers?: number[]) =>
        this.backupService
          .backupSamples(bankId, customName, padNumbers)
          .catch(handleError("Sample backup failed")),
    );
    ipcMain.handle("backup:create", async (_, options) =>
      this.backupService.backup(options).catch((error) => {
        logger.error("MainProcess", "Backup failed", undefined, error as Error);
        throw new Error(`Backup failed: ${error}`);
      }),
    );
    ipcMain.handle("backup:organize", async (_, options) =>
      this.backupService.organizeBackup(options).catch((error) => {
        logger.error(
          "MainProcess",
          "Organize backup failed",
          undefined,
          error as Error,
        );
        throw new Error(`Organize backup failed: ${error}`);
      }),
    );
    ipcMain.handle(
      "restore:patterns",
      async (_, backupPath: string, patternIds?: string[]) =>
        this.backupService
          .restorePatterns(backupPath, patternIds)
          .catch(handleError("Pattern restore failed")),
    );
    ipcMain.handle(
      "restore:samples",
      async (_, backupPath: string, bankId?: string, sampleNames?: string[]) =>
        this.backupService
          .restoreSamples(backupPath, bankId, sampleNames)
          .catch(handleError("Sample restore failed")),
    );
    ipcMain.handle("device:detect", async () => this.p6Device.detect());
    ipcMain.handle("device:getStatus", async () => this.p6Device.getStatus());
    ipcMain.handle("device:getCurrentBanks", async () =>
      this.p6Device.getCurrentBanks(),
    );
    ipcMain.handle("device:getCurrentBank", async () =>
      this.p6Device.getCurrentBank(),
    );
    ipcMain.handle("device:hasBankInfo", async () =>
      this.p6Device.hasBankInfo(),
    );
    ipcMain.handle("device:getCurrentPatterns", async () =>
      this.p6Device.readData("patterns").catch(() => []),
    );
    ipcMain.handle("device:getCurrentMode", async () =>
      this.p6Device.getCurrentMode(),
    );
    ipcMain.handle(
      "device:checkModeRequirement",
      async (_, operation: string) =>
        this.modeService.getOperationModeRequirement(operation),
    );
    ipcMain.handle(
      "device:waitForMode",
      async (_, requiredMode: string, timeoutMs?: number) =>
        this.modeService.waitForMode(requiredMode as any, timeoutMs),
    );
    ipcMain.handle("device:eject", async () => this.p6Device.ejectDevice());
    ipcMain.handle("device:retryModeDetection", async () =>
      this.p6Device.retryModeDetection(),
    );
    ipcMain.handle("fs:selectBackupLocation", async () => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        properties: ["openDirectory"],
        title: "Select Backup Location",
      });
      return !result.canceled && result.filePaths.length > 0
        ? result.filePaths[0]
        : null;
    });
    ipcMain.handle("fs:selectRestoreFile", async () => {
      const result = await dialog.showOpenDialog(this.mainWindow!, {
        properties: ["openDirectory"],
        title: "Select Backup to Restore",
      });
      return !result.canceled && result.filePaths.length > 0
        ? result.filePaths[0]
        : null;
    });
    ipcMain.handle("fs:discoverBackups", async () =>
      this.backupDiscoveryService.discoverBackups().catch((error) => {
        logger.error(
          "MainProcess",
          "Failed to discover backups",
          undefined,
          error as Error,
        );
        throw new Error(`Failed to discover backups: ${error}`);
      }),
    );
    ipcMain.handle("fs:getBackupDetails", async (_, backupPath: string) =>
      this.backupDiscoveryService
        .getBackupDetails(backupPath)
        .catch((error) => {
          logger.error(
            "MainProcess",
            "Failed to get backup details",
            undefined,
            error as Error,
          );
          throw new Error(`Failed to get backup details: ${error}`);
        }),
    );
    ipcMain.handle(
      "fs:renameBackup",
      async (_, backupPath: string, newName: string) => {
        const manifestPath = path.join(backupPath, "manifest.json");
        let manifest: any = {};
        try {
          const raw = await fs.promises.readFile(manifestPath, "utf-8");
          manifest = JSON.parse(raw);
        } catch {
          // If manifest doesn't exist, create a minimal one
        }
        manifest.displayName = newName;
        await fs.promises.writeFile(
          manifestPath,
          JSON.stringify(manifest, null, 2),
        );
        return backupPath;
      },
    );
    ipcMain.handle("log:write", async (_, logEntry: any) => {
      try {
        const { level, component, message, data, stack } = logEntry;
        const logMap: any = {
          DEBUG: () => logger.debug(component, message, data),
          INFO: () => logger.info(component, message, data),
          WARN: () =>
            logger.warn(
              component,
              message,
              data,
              stack ? new Error(stack) : undefined,
            ),
          ERROR: () =>
            logger.error(
              component,
              message,
              data,
              stack ? new Error(stack) : undefined,
            ),
          FATAL: () =>
            logger.fatal(
              component,
              message,
              data,
              stack ? new Error(stack) : undefined,
            ),
        };
        logMap[level]?.();
      } catch (error) {
        logger.error(
          "MainProcess",
          "Failed to write log entry",
          undefined,
          error as Error,
        );
      }
    });
    ipcMain.handle("log:getLevel", async () => logger.getLogLevel());
    ipcMain.handle("log:setLevel", async (_, level: number) =>
      logger.setLogLevel(level as LogLevel),
    );
    ipcMain.handle("log:getDirectory", async () => logger.getLogDirectory());
    ipcMain.handle("log:getFiles", async () => logger.getLogFiles());
    ipcMain.handle("log:clear", async () => logger.clearLogs());
  }

  private toggleDevTools(): void {
    if (!this.isDebugMode() || !this.mainWindow) return;
    const isDevToolsOpen = this.mainWindow.webContents.isDevToolsOpened();
    isDevToolsOpen
      ? this.mainWindow.webContents.closeDevTools()
      : this.mainWindow.webContents.openDevTools();
  }

  private registerGlobalShortcuts(): void {
    if (this.isDebugMode()) {
      globalShortcut.register("F12", () => this.toggleDevTools());
      globalShortcut.register("CommandOrControl+Shift+I", () =>
        this.toggleDevTools(),
      );
      globalShortcut.register("CommandOrControl+Shift+J", () =>
        this.toggleDevTools(),
      );
    }
  }
  private unregisterGlobalShortcuts(): void {
    globalShortcut.unregisterAll();
  }
  private async openBackupFolder(): Promise<void> {
    const backupPath = await this.fileSystemService.getDefaultBackupPath();
    await this.fileSystemService.openFolder(backupPath);
  }
  private async detectDevice(): Promise<void> {
    const detected = await this.p6Device.detect();
    this.mainWindow?.webContents.send("device:status-changed", {
      connected: detected,
      mode: this.p6Device.getCurrentMode(),
    });
  }
  private async refreshDeviceStatus(): Promise<void> {
    this.mainWindow?.webContents.send(
      "device:status-changed",
      this.p6Device.getStatus(),
    );
  }
  private showAbout(): void {
    dialog.showMessageBox(this.mainWindow!, {
      type: "info",
      title: "About Roland P6 Backup Tool",
      message: "Roland P6 Backup Tool v1.0.0",
      detail:
        "A comprehensive backup and restore solution for Roland P6 patterns and samples.",
    });
  }
  private showUserGuide(): void {
    this.mainWindow?.webContents.send("navigation:show-guide");
  }
  async initialize(): Promise<void> {
    await app.whenReady();
    this.registerGlobalShortcuts();
    await this.createWindow();
    app.on("activate", async () => {
      if (BrowserWindow.getAllWindows().length === 0) await this.createWindow();
    });
  }
  shutdown(): void {
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") app.quit();
    });
    app.on("will-quit", () => {
      this.unregisterGlobalShortcuts();
      this.p6Device.dispose();
    });
  }
}

const mainApp = new MainApplication();
(async () => {
  try {
    await mainApp.initialize();
    mainApp.shutdown();
  } catch (error) {
    logger.error(
      "MainProcess",
      "Failed to initialize application",
      undefined,
      error as Error,
    );
    app.quit();
  }
})();
