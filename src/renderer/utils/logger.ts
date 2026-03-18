// Renderer-side logger utility
// This file provides a convenient interface for React components to use the logging system

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

class RendererLogger {
  private static instance: RendererLogger;
  private logLevel: LogLevel = LogLevel.INFO; // Default to INFO in renderer

  private constructor() {
    // Get log level from main process
    this.initializeLogLevel();
  }

  public static getInstance(): RendererLogger {
    if (!RendererLogger.instance) {
      RendererLogger.instance = new RendererLogger();
    }
    return RendererLogger.instance;
  }

  private async initializeLogLevel(): Promise<void> {
    try {
      if (window.electronAPI?.getLogLevel) {
        this.logLevel = await window.electronAPI.getLogLevel();
      }
    } catch (error) {
      console.warn("Failed to get log level from main process:", error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private formatLogEntry(
    level: LogLevel,
    component: string,
    message: string,
    data?: any,
    error?: Error
  ): LogEntry {
    return {
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
    };
  }

  private async sendLog(logEntry: LogEntry): Promise<void> {
    try {
      if (window.electronAPI?.sendLog) {
        await window.electronAPI.sendLog(logEntry as unknown as Record<string, unknown>);
      } else {
        // Fallback to console if IPC is not available
        console.log(
          `[${logEntry.level}][${logEntry.component}] ${logEntry.message}`,
          logEntry.data || ""
        );
      }
    } catch (error) {
      console.error("Failed to send log to main process:", error);
    }
  }

  // Public logging methods
  public debug(component: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const logEntry = this.formatLogEntry(
      LogLevel.DEBUG,
      component,
      message,
      data
    );
    this.sendLog(logEntry);

    if (this.logLevel <= LogLevel.DEBUG) {
      console.log(`[DEBUG][${component}] ${message}`, data || "");
    }
  }

  public info(component: string, message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const logEntry = this.formatLogEntry(
      LogLevel.INFO,
      component,
      message,
      data
    );
    this.sendLog(logEntry);

    if (this.logLevel <= LogLevel.INFO) {
      console.info(`[INFO][${component}] ${message}`, data || "");
    }
  }

  public warn(
    component: string,
    message: string,
    data?: any,
    error?: Error
  ): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const logEntry = this.formatLogEntry(
      LogLevel.WARN,
      component,
      message,
      data,
      error
    );
    this.sendLog(logEntry);

    if (this.logLevel <= LogLevel.WARN) {
      console.warn(`[WARN][${component}] ${message}`, data || "", error || "");
    }
  }

  public error(
    component: string,
    message: string,
    data?: any,
    error?: Error
  ): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const logEntry = this.formatLogEntry(
      LogLevel.ERROR,
      component,
      message,
      data,
      error
    );
    this.sendLog(logEntry);

    console.error(`[ERROR][${component}] ${message}`, data || "", error || "");
  }

  public fatal(
    component: string,
    message: string,
    data?: any,
    error?: Error
  ): void {
    const logEntry = this.formatLogEntry(
      LogLevel.FATAL,
      component,
      message,
      data,
      error
    );
    this.sendLog(logEntry);

    console.error(`[FATAL][${component}] ${message}`, data || "", error || "");
  }

  // Utility methods
  public async getLogLevel(): Promise<LogLevel> {
    if (window.electronAPI?.getLogLevel) {
      this.logLevel = await window.electronAPI.getLogLevel();
    }
    return this.logLevel;
  }

  public async setLogLevel(level: LogLevel): Promise<void> {
    this.logLevel = level;
    if (window.electronAPI?.setLogLevel) {
      await window.electronAPI.setLogLevel(level);
    }
    this.info("RendererLogger", `Log level changed to ${LogLevel[level]}`);
  }

  public async getLogDirectory(): Promise<string> {
    if (window.electronAPI?.getLogDirectory) {
      return await window.electronAPI.getLogDirectory();
    }
    return "";
  }

  public async getLogFiles(): Promise<string[]> {
    if (window.electronAPI?.getLogFiles) {
      return await window.electronAPI.getLogFiles();
    }
    return [];
  }

  public async clearLogs(): Promise<void> {
    if (window.electronAPI?.clearLogs) {
      await window.electronAPI.clearLogs();
      this.info("RendererLogger", "All log files cleared");
    }
  }
}

// Export singleton instance
export const logger = RendererLogger.getInstance();

// Export convenience functions for common components
export const createComponentLogger = (componentName: string) => {
  return {
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
  };
};
