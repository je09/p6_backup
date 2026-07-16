/**
 * The renderer's side of the log. Entries are shipped to the main process,
 * which owns the log file, and mirrored to the devtools console.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

class RendererLogger {
  private static instance: RendererLogger;
  /** Assumed until the main process answers with the real level. */
  private logLevel: LogLevel = LogLevel.INFO;

  private constructor() {
    window.electronAPI
      ?.getLogLevel()
      .then((level) => {
        this.logLevel = level;
      })
      .catch((error) =>
        console.warn("Failed to read log level from main process:", error)
      );
  }

  public static getInstance(): RendererLogger {
    if (!RendererLogger.instance) RendererLogger.instance = new RendererLogger();
    return RendererLogger.instance;
  }

  private log(
    level: LogLevel,
    component: string,
    message: string,
    data?: unknown,
    error?: Error
  ): void {
    if (level < this.logLevel) return;

    window.electronAPI?.sendLog({
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      component,
      message,
      data,
      stack: error?.stack,
    });

    const args = [
      `[${LogLevel[level]}][${component}] ${message}`,
      ...(data === undefined ? [] : [data]),
      ...(error ? [error] : []),
    ];
    if (level >= LogLevel.ERROR) console.error(...args);
    else if (level === LogLevel.WARN) console.warn(...args);
    else console.info(...args);
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
}

const logger = RendererLogger.getInstance();

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
