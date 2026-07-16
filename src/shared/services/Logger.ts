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

const MAX_LOG_FILE_SIZE = 10 * 1024 * 1024;
const MAX_LOG_FILES = 5;

/**
 * Writes the app's log to a dated file. Only the main process writes: the
 * renderer ships its entries over IPC, so there is one file and one ordering.
 */
class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logDirectory = "";
  /** The date the current file is named for, so it rolls over at midnight. */
  private currentLogDate = "";
  private currentLogFile = "";
  /** Tracked as we append, so rotation costs no stat per line. */
  private currentLogSize = 0;

  private constructor() {
    if (Logger.isRenderer) return;
    this.logLevel = this.determineLogLevel();
    this.logDirectory = Logger.resolveLogDirectory();
    try {
      fs.mkdirSync(this.logDirectory, { recursive: true });
    } catch (error) {
      console.error("Failed to create log directory:", error);
    }
  }

  private static get isRenderer() {
    return typeof window !== "undefined";
  }

  public static getInstance(): Logger {
    if (!Logger.instance) Logger.instance = new Logger();
    return Logger.instance;
  }

  private determineLogLevel(): LogLevel {
    const envLogLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLogLevel && envLogLevel in LogLevel)
      return LogLevel[envLogLevel as keyof typeof LogLevel];
    return app?.isPackaged ? LogLevel.INFO : LogLevel.DEBUG;
  }

  private static resolveLogDirectory(): string {
    const appName = "P6BackupTool";
    const dirs: Record<string, string> = {
      darwin: path.join(os.homedir(), "Library", "Logs", appName),
      win32: path.join(os.homedir(), "AppData", "Local", appName, "logs"),
      linux: path.join(os.homedir(), ".local", "share", appName, "logs"),
    };
    return dirs[os.platform()] ?? path.join(os.homedir(), ".p6-backup-logs");
  }

  /**
   * Point at the file for today, rotating it away if it has grown too big. The
   * date is re-checked per line, since a session can cross midnight.
   */
  private useCurrentLogFile(): void {
    const today = new Date().toISOString().split("T")[0];
    if (today !== this.currentLogDate) {
      this.currentLogDate = today;
      this.currentLogFile = path.join(
        this.logDirectory,
        `p6-backup-${today}.log`
      );
      this.currentLogSize = this.sizeOf(this.currentLogFile);
      this.cleanupOldLogs();
    }

    if (this.currentLogSize <= MAX_LOG_FILE_SIZE) return;
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.renameSync(
        this.currentLogFile,
        this.currentLogFile.replace(/\.log$/, `-${stamp}.log`)
      );
      this.currentLogSize = 0;
      this.cleanupOldLogs();
    } catch (error) {
      console.error("Failed to rotate log file:", error);
    }
  }

  private sizeOf(file: string): number {
    try {
      return fs.statSync(file).size;
    } catch {
      return 0;
    }
  }

  private cleanupOldLogs(): void {
    try {
      const files = fs
        .readdirSync(this.logDirectory)
        .filter((f) => f.startsWith("p6-backup-") && f.endsWith(".log"))
        .map((name) => {
          const file = path.join(this.logDirectory, name);
          return { file, mtime: fs.statSync(file).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);

      for (const { file } of files.slice(MAX_LOG_FILES)) {
        try {
          fs.unlinkSync(file);
        } catch (error) {
          console.error(`Failed to delete old log file ${file}:`, error);
        }
      }
    } catch (error) {
      console.error("Failed to clean up old logs:", error);
    }
  }

  public log(
    level: LogLevel,
    component: string,
    message: string,
    data?: unknown,
    error?: Error
  ): void {
    if (level < this.logLevel) return;

    const details = data === undefined ? "" : ` Data: ${format(data)}`;
    const stack = error?.stack ? ` Stack: ${error.stack}` : "";
    const line = `${new Date().toISOString()} [${LogLevel[level]}] [${component}] ${message}${details}${stack}\n`;

    this.useCurrentLogFile();
    try {
      fs.appendFileSync(this.currentLogFile, line, "utf8");
      this.currentLogSize += Buffer.byteLength(line);
    } catch (e) {
      console.error("Failed to write to log file:", e);
    }

    const consoleArgs = [
      `[${LogLevel[level]}][${component}] ${message}`,
      ...(data === undefined ? [] : [data]),
      ...(error ? [error] : []),
    ];
    if (level >= LogLevel.ERROR) console.error(...consoleArgs);
    else if (level === LogLevel.WARN) console.warn(...consoleArgs);
    else console.info(...consoleArgs);
  }

  public debug(component: string, message: string, data?: unknown) {
    this.log(LogLevel.DEBUG, component, message, data);
  }
  public info(component: string, message: string, data?: unknown) {
    this.log(LogLevel.INFO, component, message, data);
  }
  public warn(component: string, message: string, data?: unknown, error?: Error) {
    this.log(LogLevel.WARN, component, message, data, error);
  }
  public error(component: string, message: string, data?: unknown, error?: Error) {
    this.log(LogLevel.ERROR, component, message, data, error);
  }
  public fatal(component: string, message: string, data?: unknown, error?: Error) {
    this.log(LogLevel.FATAL, component, message, data, error);
  }

  public getLogLevel() {
    return this.logLevel;
  }
}

function format(data: unknown): string {
  if (typeof data !== "object" || data === null) return String(data);
  try {
    return JSON.stringify(data, replaceErrors, 2);
  } catch {
    return String(data);
  }
}

/** Errors serialise to "{}" otherwise, which loses the whole reason for logging. */
function replaceErrors(_key: string, value: unknown) {
  return value instanceof Error
    ? { name: value.name, message: value.message, stack: value.stack }
    : value;
}

export const logger = Logger.getInstance();

export const createComponentLogger = (componentName: string) => ({
  debug: (message: string, data?: unknown) =>
    logger.debug(componentName, message, data),
  info: (message: string, data?: unknown) =>
    logger.info(componentName, message, data),
  warn: (message: string, data?: unknown, error?: Error) =>
    logger.warn(componentName, message, data, error),
  error: (message: string, data?: unknown, error?: Error) =>
    logger.error(componentName, message, data, error),
  fatal: (message: string, data?: unknown, error?: Error) =>
    logger.fatal(componentName, message, data, error),
});
