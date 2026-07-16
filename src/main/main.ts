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
          : path.join(__dirname, "../assets/icons/512x512.png");
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

  // A packaged build is never a debug build, regardless of the environment
  // it is launched from. Everything else is a local dev run.
  private isDebugMode(): boolean {
    return !app.isPackaged;
  }

  private navigate(view: string): void {
    this.mainWindow?.webContents.send("menu:navigate", view);
  }

  private setupMenu(): void {
    const isDebugging = this.isDebugMode();
    const isMac = process.platform === "darwin";

    // Tab order must match the renderer's, since these are its accelerators.
    const viewMenu = {
      label: "View",
      submenu: [
        { label: "Backup", accelerator: "CmdOrCtrl+1", click: () => this.navigate("backup") },
        { label: "Restore", accelerator: "CmdOrCtrl+2", click: () => this.navigate("restore") },
        { label: "Settings", accelerator: "CmdOrCtrl+3", click: () => this.navigate("settings") },
        { label: "Guide", accelerator: "CmdOrCtrl+4", click: () => this.navigate("guide") },
      ],
    };

    const settingsItem = {
      label: "Settings…",
      accelerator: "CmdOrCtrl+,",
      click: () => this.navigate("settings"),
    };

    const template = [
      // On macOS the first menu is always the application menu, whatever its
      // label. Without this entry, File's contents were being shown there.
      ...(isMac
        ? [
            {
              label: app.name,
              submenu: [
                { role: "about", label: `About ${app.name}` },
                { type: "separator" },
                settingsItem,
                { type: "separator" },
                { role: "services" },
                { type: "separator" },
                { role: "hide" },
                { role: "hideOthers" },
                { role: "unhide" },
                { type: "separator" },
                { role: "quit" },
              ],
            },
          ]
        : []),
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
          ...(isMac
            ? []
            : [{ type: "separator" }, settingsItem, { type: "separator" }, { role: "quit" }]),
        ],
      },
      // Without this, the clipboard shortcuts do nothing in any text field.
      { role: "editMenu" },
      viewMenu,
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
                // Reload sits on F5, not CmdOrCtrl+R: that belongs to Refresh
                // Device Status above, and two items cannot share it.
                {
                  label: "Reload",
                  accelerator: "F5",
                  click: () => this.mainWindow?.webContents.reload(),
                },
                {
                  label: "Force Reload",
                  accelerator: "Shift+F5",
                  click: () =>
                    this.mainWindow?.webContents.reloadIgnoringCache(),
                },
              ],
            },
          ]
        : []),
      { role: "windowMenu" },
      {
        role: "help",
        submenu: [
          { label: "User Guide", accelerator: "CmdOrCtrl+?", click: () => this.navigate("guide") },
          ...(isMac ? [] : [{ type: "separator" }, { label: "About", click: () => this.showAbout() }]),
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
        await this.assertInsideBackupRoot(backupPath);
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
    ipcMain.handle("fs:getBackupPath", async () =>
      this.fileSystemService.getDefaultBackupPath(),
    );
    ipcMain.handle("fs:setBackupPath", async (_, newPath: string) => {
      await this.fileSystemService.setBackupPath(newPath);
      await this.saveSettings({ backupPath: newPath });
    });
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
  /**
   * macOS shows its own About panel via the { role: "about" } menu item, so it
   * only needs the contents. Elsewhere there is no such panel and the Help menu
   * opens a dialog instead.
   */
  private setupAboutPanel(): void {
    app.setAboutPanelOptions({
      applicationName: "P-6 Backup Tool",
      applicationVersion: app.getVersion(),
      copyright: `© ${new Date().getFullYear()} je09 · MIT License`,
      credits: "Backup and restore for Roland P-6 patterns and samples.",
      iconPath: path.join(__dirname, "../assets/icon.png"),
    });
  }

  private showAbout(): void {
    dialog.showMessageBox(this.mainWindow!, {
      type: "info",
      title: "About P-6 Backup Tool",
      message: `P-6 Backup Tool ${app.getVersion()}`,
      detail:
        "Backup and restore for Roland P-6 patterns and samples.\n" +
        `© ${new Date().getFullYear()} je09 · MIT License`,
    });
  }
  // The renderer supplies backup paths, so any path it hands back must be
  // confirmed to sit under the configured backup root before we write to it.
  private async assertInsideBackupRoot(target: string): Promise<void> {
    const root = await this.fileSystemService.getDefaultBackupPath();
    const resolvedRoot = path.resolve(root);
    const resolvedTarget = path.resolve(target);
    const contained =
      resolvedTarget === resolvedRoot ||
      resolvedTarget.startsWith(resolvedRoot + path.sep);
    if (!contained) {
      logger.error(
        "MainProcess",
        `Rejected path outside backup root: ${resolvedTarget}`,
      );
      throw new Error("Path is outside the backup folder");
    }
  }

  private settingsPath(): string {
    return path.join(app.getPath("userData"), "settings.json");
  }

  private async loadSettings(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.settingsPath(), "utf-8");
      const settings = JSON.parse(raw);
      if (settings.backupPath) {
        try {
          await this.fileSystemService.setBackupPath(settings.backupPath);
        } catch {
          // Invalid path — silently fall back to default
        }
      }
    } catch {
      // File missing or unreadable — use defaults
    }
  }

  private async saveSettings(updates: Record<string, unknown>): Promise<void> {
    const filePath = this.settingsPath();
    let existing: Record<string, unknown> = {};
    try {
      const raw = await fs.promises.readFile(filePath, "utf-8");
      existing = JSON.parse(raw);
    } catch {
      // Start fresh
    }
    await fs.promises.writeFile(
      filePath,
      JSON.stringify({ ...existing, ...updates }, null, 2),
    );
  }

  async initialize(): Promise<void> {
    await app.whenReady();
    this.setupAboutPanel();
    await this.loadSettings();
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
