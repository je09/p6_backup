import { app } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

interface LogEntry {
  timestamp: string;
  level: string;
  component: string;
  message: string;
  data?: any;
  stack?: string;
}

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logDirectory: string = "";
  private currentLogFile: string = "";
  private maxLogFileSize = 10 * 1024 * 1024; // 10MB
  private maxLogFiles = 5;

  private constructor() {
    if (Logger.isRenderer) return;
    this.logLevel = this.determineLogLevel();
    this.logDirectory = this.setupLogDirectory();
    this.currentLogFile = this.getCurrentLogFileName();
    this.initializeLogDirectory();
  }

  private static get isRenderer() {
    return typeof window !== "undefined" && !!window.electronAPI;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) Logger.instance = new Logger();
    return Logger.instance;
  }

  private determineLogLevel(): LogLevel {
    const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLogLevel && envLogLevel in LogLevel)
      return LogLevel[envLogLevel as keyof typeof LogLevel];
    const isDev =
      process.env.NODE_ENV === "development" ||
      process.env.ELECTRON_DEV === "true" ||
      !app?.isPackaged;
    return isDev ? LogLevel.DEBUG : LogLevel.INFO;
  }

  private setupLogDirectory(): string {
    const appName = "P6BackupTool";
    const dirs: Record<string, string> = {
      darwin: path.join(os.homedir(), "Library", "Logs", appName),
      win32: path.join(os.homedir(), "AppData", "Local", appName, "logs"),
      linux: path.join(os.homedir(), ".local", "share", appName, "logs"),
    };
    return dirs[os.platform()] || path.join(os.homedir(), ".p6-backup-logs");
  }

  private getCurrentLogFileName(): string {
    return path.join(
      this.logDirectory,
      `p6-backup-${new Date().toISOString().split("T")[0]}.log`
    );
  }

  private initializeLogDirectory(): void {
    try {
      if (!fs.existsSync(this.logDirectory))
        fs.mkdirSync(this.logDirectory, { recursive: true });
      this.rotateLogsIfNeeded();
    } catch (error) {
      console.error("Failed to initialize log directory:", error);
    }
  }

  private rotateLogsIfNeeded(): void {
    try {
      if (
        fs.existsSync(this.currentLogFile) &&
        fs.statSync(this.currentLogFile).size > this.maxLogFileSize
      )
        this.rotateLogFile();
      this.cleanupOldLogs();
    } catch (error) {
      console.error("Failed to rotate logs:", error);
    }
  }

  private rotateLogFile(): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.renameSync(
        this.currentLogFile,
        this.currentLogFile.replace(".log", `-${timestamp}.log`)
      );
    } catch (error) {
      console.error("Failed to rotate log file:", error);
    }
  }

  private cleanupOldLogs(): void {
    try {
      const files = fs
        .readdirSync(this.logDirectory)
        .filter((f) => f.startsWith("p6-backup-") && f.endsWith(".log"))
        .map((f) => ({
          name: f,
          path: path.join(this.logDirectory, f),
          mtime: fs.statSync(path.join(this.logDirectory, f)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
      files.slice(this.maxLogFiles).forEach((f) => {
        try {
          fs.unlinkSync(f.path);
        } catch (e) {
          console.error(`Failed to delete old log file ${f.name}:`, e);
        }
      });
    } catch (error) {
      console.error("Failed to cleanup old logs:", error);
    }
  }

  private log(
    level: LogLevel,
    component: string,
    message: string,
    data?: any,
    error?: Error
  ): void {
    if (Logger.isRenderer) {
      window.electronAPI?.sendLog?.({
        timestamp: new Date().toISOString(),
        level: LogLevel[level],
        component,
        message,
        data: data
          ? typeof data === "object"
            ? JSON.stringify(data, null, 2)
            : data
          : undefined,
        stack: error?.stack,
      });
      return;
    }
    if (level < this.logLevel) return;
    this.rotateLogsIfNeeded();
    const logLine = [
      new Date().toISOString(),
      `[${LogLevel[level]}]`,
      `[${component}]`,
      message,
      data
        ? `Data: ${
            typeof data === "object" ? JSON.stringify(data, null, 2) : data
          }`
        : "",
      error?.stack ? `Stack: ${error.stack}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    try {
      fs.appendFileSync(this.currentLogFile, logLine + "\n", "utf8");
    } catch (e) {
      console.error("Failed to write to log file:", e);
    }
    // Console output
    if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
      console.error(
        `[${LogLevel[level]}][${component}] ${message}`,
        data || "",
        error || ""
      );
    } else if (level === LogLevel.WARN) {
      console.warn(`[WARN][${component}] ${message}`, data || "", error || "");
    } else if (level === LogLevel.INFO) {
      if (this.logLevel <= LogLevel.INFO)
        console.info(`[INFO][${component}] ${message}`, data || "");
    } else if (level === LogLevel.DEBUG) {
      if (this.logLevel <= LogLevel.DEBUG)
        console.log(`[DEBUG][${component}] ${message}`, data || "");
    }
  }

  public debug(component: string, message: string, data?: any) {
    this.log(LogLevel.DEBUG, component, message, data);
  }
  public info(component: string, message: string, data?: any) {
    this.log(LogLevel.INFO, component, message, data);
  }
  public warn(component: string, message: string, data?: any, error?: Error) {
    this.log(LogLevel.WARN, component, message, data, error);
  }
  public error(component: string, message: string, data?: any, error?: Error) {
    this.log(LogLevel.ERROR, component, message, data, error);
  }
  public fatal(component: string, message: string, data?: any, error?: Error) {
    this.log(LogLevel.FATAL, component, message, data, error);
  }

  public getLogLevel() {
    return this.logLevel;
  }
  public setLogLevel(level: LogLevel) {
    this.logLevel = level;
    this.info("Logger", `Log level changed to ${LogLevel[level]}`);
  }
  public getLogDirectory() {
    return this.logDirectory;
  }
  public getLogFiles(): string[] {
    if (Logger.isRenderer) return [];
    try {
      return fs
        .readdirSync(this.logDirectory)
        .filter((f) => f.startsWith("p6-backup-") && f.endsWith(".log"))
        .sort();
    } catch (error: any) {
      this.error("Logger", "Failed to get log files", {
        error: error?.message || error,
      });
      return [];
    }
  }
  public clearLogs(): void {
    if (Logger.isRenderer) return;
    try {
      this.getLogFiles().forEach((f) =>
        fs.unlinkSync(path.join(this.logDirectory, f))
      );
      this.info("Logger", "All log files cleared");
    } catch (error: any) {
      this.error("Logger", "Failed to clear logs", {
        error: error?.message || error,
      });
    }
  }
}

export const logger = Logger.getInstance();
export const createComponentLogger = (componentName: string) => ({
  debug: (message: string, data?: any) =>
    logger.debug(componentName, message, data),
  info: (message: string, data?: any) =>
    logger.info(componentName, message, data),
  warn: (message: string, data?: any, error?: Error) =>
    logger.warn(componentName, message, data, error),
  error: (message: string, data?: any, error?: Error) =>
    logger.error(componentName, message, data, error),
  fatal: (message: string, data?: any, error?: Error) =>
    logger.fatal(componentName, message, data, error),
});
