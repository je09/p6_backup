import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Menu,
  MenuItemConstructorOptions,
  globalShortcut,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { BackupService } from "../shared/services/BackupService";
import { FileSystemService } from "../shared/services/FileSystemService";
import { BackupDiscoveryService } from "../shared/services/BackupDiscoveryService";
import { ModeService } from "../shared/services/ModeService";
import { P6Device } from "../shared/models/P6Device";
import { logger, LogLevel } from "../shared/services/Logger";
import { IPC, IPC_EVENTS, UI_LABELS } from "../shared/constants";
import { manifestPath } from "../shared/services/backupLayout";

interface Settings {
  backupPath?: string;
}

class MainApplication {
  private mainWindow: BrowserWindow | null = null;
  private backupService: BackupService;
  private fileSystemService: FileSystemService;
  private backupDiscoveryService: BackupDiscoveryService;
  private modeService: ModeService;
  private p6Device: P6Device;

  constructor() {
    this.fileSystemService = new FileSystemService((event) =>
      this.send(IPC_EVENTS.FILE_COPY_SUCCESS, event)
    );
    this.p6Device = new P6Device();
    this.modeService = new ModeService(this.p6Device);
    this.backupService = new BackupService(this.p6Device, this.fileSystemService);
    this.backupDiscoveryService = new BackupDiscoveryService(
      this.fileSystemService
    );
    this.p6Device.onStatusChanged((status) =>
      this.send(IPC_EVENTS.DEVICE_STATUS_CHANGED, status)
    );
    this.setupEventHandlers();
  }

  private send(channel: string, ...args: unknown[]): void {
    this.mainWindow?.webContents.send(channel, ...args);
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
      (_event, errorCode, errorDescription, validatedURL) =>
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
    this.send(IPC_EVENTS.MENU_NAVIGATE, view);
  }

  private setupMenu(): void {
    const isDebugging = this.isDebugMode();
    const isMac = process.platform === "darwin";

    // Tab order must match the renderer's, since these are its accelerators.
    const viewMenu: MenuItemConstructorOptions = {
      label: "View",
      submenu: [
        { label: "Backup", accelerator: "CmdOrCtrl+1", click: () => this.navigate("backup") },
        { label: "Restore", accelerator: "CmdOrCtrl+2", click: () => this.navigate("restore") },
        { label: "Settings", accelerator: "CmdOrCtrl+3", click: () => this.navigate("settings") },
        { label: "Guide", accelerator: "CmdOrCtrl+4", click: () => this.navigate("guide") },
      ],
    };

    const settingsItem: MenuItemConstructorOptions = {
      label: "Settings…",
      accelerator: "CmdOrCtrl+,",
      click: () => this.navigate("settings"),
    };

    const template: MenuItemConstructorOptions[] = [
      // On macOS the first menu is always the application menu, whatever its
      // label. Without this entry, File's contents were being shown there.
      ...(isMac
        ? [
            {
              label: UI_LABELS.APP_TITLE,
              submenu: [
                { role: "about", label: `About ${UI_LABELS.APP_TITLE}` },
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
            } as MenuItemConstructorOptions,
          ]
        : []),
      {
        label: "File",
        submenu: [
          {
            label: "New Backup",
            accelerator: "CmdOrCtrl+N",
            click: () => this.send(IPC_EVENTS.MENU_NEW_BACKUP),
          },
          {
            label: "Open Backup Folder",
            accelerator: "CmdOrCtrl+O",
            click: () => this.openBackupFolder(),
          },
          ...(isMac
            ? []
            : ([
                { type: "separator" },
                settingsItem,
                { type: "separator" },
                { role: "quit" },
              ] as MenuItemConstructorOptions[])),
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
        ? ([
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
          ] as MenuItemConstructorOptions[])
        : []),
      { role: "windowMenu" },
      {
        role: "help",
        submenu: [
          { label: "User Guide", accelerator: "CmdOrCtrl+?", click: () => this.navigate("guide") },
          ...(isMac
            ? []
            : ([
                { type: "separator" },
                { label: "About", click: () => this.showAbout() },
              ] as MenuItemConstructorOptions[])),
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  private setupEventHandlers(): void {
    // The title bar's close button quits: this is a single-window utility, and
    // leaving it running headless on macOS would strand it with no way back.
    ipcMain.handle(IPC.WINDOW_CLOSE, () => app.quit());
    ipcMain.handle(IPC.WINDOW_MINIMIZE, () => this.mainWindow?.minimize());

    ipcMain.handle(
      IPC.BACKUP_PATTERNS,
      (_, customName?: string, patternIds?: string[]) =>
        this.backupService.backupPatterns(customName, patternIds)
    );
    ipcMain.handle(
      IPC.BACKUP_SAMPLES,
      (_, bankId?: string, customName?: string, padNumbers?: number[]) =>
        this.backupService.backupSamples(bankId, customName, padNumbers)
    );
    ipcMain.handle(IPC.BACKUP_ORGANIZE, (_, options) =>
      this.backupService.organizeBackup(options)
    );

    ipcMain.handle(
      IPC.RESTORE_PATTERNS,
      (_, backupPath: string, patternIds?: string[]) =>
        this.backupService.restorePatterns(backupPath, patternIds)
    );
    ipcMain.handle(
      IPC.RESTORE_SAMPLES,
      (_, backupPath: string, bankId?: string, sampleNames?: string[]) =>
        this.backupService.restoreSamples(backupPath, bankId, sampleNames)
    );

    ipcMain.handle(IPC.DEVICE_DETECT, () => this.p6Device.detect());
    ipcMain.handle(IPC.DEVICE_GET_STATUS, () => this.p6Device.getStatus());
    ipcMain.handle(IPC.DEVICE_GET_CURRENT_BANKS, () =>
      this.p6Device.getCurrentBanks()
    );
    ipcMain.handle(IPC.DEVICE_GET_CURRENT_BANK, () =>
      this.p6Device.getCurrentBank()
    );
    ipcMain.handle(IPC.DEVICE_HAS_BANK_INFO, () => this.p6Device.hasBankInfo());
    ipcMain.handle(IPC.DEVICE_GET_CURRENT_PATTERNS, () =>
      this.p6Device.readData("patterns").catch((error) => {
        logger.warn("MainProcess", "Could not read patterns", { error });
        return [];
      })
    );
    ipcMain.handle(IPC.DEVICE_CHECK_MODE_REQUIREMENT, (_, operation: string) =>
      this.modeService.getOperationModeRequirement(operation)
    );
    ipcMain.handle(IPC.DEVICE_EJECT, () => this.p6Device.ejectDevice());
    ipcMain.handle(IPC.DEVICE_RETRY_MODE_DETECTION, () =>
      this.p6Device.retryModeDetection()
    );

    ipcMain.handle(IPC.FS_SELECT_BACKUP_LOCATION, async () => {
      if (!this.mainWindow) return null;
      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ["openDirectory"],
        title: "Select Backup Location",
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });
    ipcMain.handle(IPC.FS_DISCOVER_BACKUPS, () =>
      this.backupDiscoveryService.discoverBackups()
    );
    ipcMain.handle(IPC.FS_GET_BACKUP_DETAILS, (_, backupPath: string) =>
      this.backupDiscoveryService.getBackupDetails(backupPath)
    );
    ipcMain.handle(
      IPC.FS_RENAME_BACKUP,
      async (_, backupPath: string, newName: string) => {
        await this.assertInsideBackupRoot(backupPath);
        const file = manifestPath(backupPath);
        const manifest =
          (await this.fileSystemService.readJsonFile<Record<string, unknown>>(
            file
          )) ?? {};
        // A backup that predates manifests gets one now. Without a timestamp it
        // would read back as an invalid date and sort to the end of the list.
        manifest.timestamp ??= (
          await this.fileSystemService.getFileStats(backupPath)
        ).modified.toISOString();
        manifest.displayName = newName;
        await this.fileSystemService.writeJsonFile(file, manifest);
        return backupPath;
      }
    );
    ipcMain.handle(IPC.FS_GET_BACKUP_PATH, () =>
      this.fileSystemService.getDefaultBackupPath()
    );
    ipcMain.handle(IPC.FS_SET_BACKUP_PATH, async (_, newPath: string) => {
      await this.fileSystemService.setBackupPath(newPath);
      await this.saveSettings({ backupPath: newPath });
    });

    ipcMain.handle(IPC.LOG_WRITE, (_, entry) => this.writeRendererLog(entry));
    ipcMain.handle(IPC.LOG_GET_LEVEL, () => logger.getLogLevel());
  }

  private writeRendererLog(entry: {
    level?: string;
    component?: string;
    message?: string;
    data?: unknown;
    stack?: string;
  }): void {
    const { level, component = "Renderer", message = "", data, stack } = entry;
    const parsed = LogLevel[level as keyof typeof LogLevel];
    if (parsed === undefined) {
      logger.warn("MainProcess", `Renderer sent unknown log level: ${level}`);
      return;
    }
    logger.log(parsed, component, message, data, stack ? new Error(stack) : undefined);
  }

  private toggleDevTools(): void {
    if (!this.isDebugMode() || !this.mainWindow) return;
    const { webContents } = this.mainWindow;
    if (webContents.isDevToolsOpened()) webContents.closeDevTools();
    else webContents.openDevTools();
  }

  private registerGlobalShortcuts(): void {
    if (!this.isDebugMode()) return;
    for (const accelerator of [
      "F12",
      "CommandOrControl+Shift+I",
      "CommandOrControl+Shift+J",
    ]) {
      globalShortcut.register(accelerator, () => this.toggleDevTools());
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
    await this.p6Device.detect();
    this.refreshDeviceStatus();
  }

  private refreshDeviceStatus(): void {
    this.send(IPC_EVENTS.DEVICE_STATUS_CHANGED, this.p6Device.getStatus());
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
    if (!this.mainWindow) return;
    dialog.showMessageBox(this.mainWindow, {
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
    const settings = await this.fileSystemService.readJsonFile<Settings>(
      this.settingsPath()
    );
    if (!settings?.backupPath) return;
    try {
      await this.fileSystemService.setBackupPath(settings.backupPath);
    } catch (error) {
      logger.warn(
        "MainProcess",
        `Saved backup path is unusable, falling back to the default`,
        { error }
      );
    }
  }

  private async saveSettings(updates: Settings): Promise<void> {
    const existing =
      (await this.fileSystemService.readJsonFile<Settings>(
        this.settingsPath()
      )) ?? {};
    await this.fileSystemService.writeJsonFile(this.settingsPath(), {
      ...existing,
      ...updates,
    });
  }

  async initialize(): Promise<void> {
    await app.whenReady();
    this.setupAboutPanel();
    await this.loadSettings();
    this.registerGlobalShortcuts();
    await this.createWindow();
    app.on("window-all-closed", () => app.quit());
    app.on("will-quit", () => {
      this.unregisterGlobalShortcuts();
      this.p6Device.dispose();
    });
  }
}

const mainApp = new MainApplication();
mainApp.initialize().catch((error) => {
  logger.error(
    "MainProcess",
    "Failed to initialize application",
    undefined,
    error as Error,
  );
  app.quit();
});
