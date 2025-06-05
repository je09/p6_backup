import React from "react";
import { UI_LABELS } from "../../shared/constants";

export interface ErrorDetails {
  code: string;
  message: string;
  suggestion?: string;
  troubleshootingSteps?: string[];
}

interface ErrorHandlerProps {
  error: ErrorDetails | null;
  onDismiss: () => void;
  onRetry?: () => void;
}

// Icon mapping for error codes
const ERROR_ICONS: Record<string, string> = {
  DEVICE_NOT_CONNECTED: "🔌",
  DEVICE_NOT_FOUND: "🔌",
  BACKUP_FOLDER_EMPTY: "📁",
  BACKUP_FOLDER_INACCESSIBLE: "📁",
  INSUFFICIENT_SPACE: "💾",
  DEVICE_MODE_INVALID: "⚙️",
  BACKUP_FAILED: "❌",
  RESTORE_FAILED: "❌",
};

const getErrorIcon = (code: string) => ERROR_ICONS[code] || "⚠️";

export const ErrorHandler: React.FC<ErrorHandlerProps> = ({
  error,
  onDismiss,
  onRetry,
}) => {
  if (!error) return null;

  return (
    <div className="md-banner md-banner-error">
      <div className="md-banner-content">
        <div className="md-banner-header">
          <span className="md-banner-icon">{getErrorIcon(error.code)}</span>
          <h3 className="md-text-title">{UI_LABELS.OPERATION_FAILED}</h3>
        </div>

        <div className="md-banner-body">
          <p className="md-text-body">{error.message}</p>

          {error.suggestion && (
            <div className="md-banner-suggestion">
              <strong className="md-text-label">Suggestion:</strong>
              <p className="md-text-body">{error.suggestion}</p>
            </div>
          )}

          {error.troubleshootingSteps &&
            error.troubleshootingSteps.length > 0 && (
              <div className="md-banner-steps">
                <strong className="md-text-label">
                  Troubleshooting Steps:
                </strong>
                <ol className="md-list">
                  {error.troubleshootingSteps.map((step, index) => (
                    <li key={index} className="md-list-item">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            )}
        </div>

        <div className="md-banner-actions">
          {onRetry && (
            <button className="md-button-text" onClick={onRetry}>
              {UI_LABELS.TRY_AGAIN}
            </button>
          )}
          <button className="md-button-text" onClick={onDismiss}>
            {UI_LABELS.DISMISS}
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper function to create standardized error objects
export const createError = (
  code: string,
  message: string,
  suggestion?: string,
  troubleshootingSteps?: string[]
): ErrorDetails => ({
  code,
  message,
  suggestion,
  troubleshootingSteps,
});

// Predefined error types for common scenarios
export const ERROR_TYPES = {
  DEVICE_NOT_CONNECTED: (deviceName: string = "Roland P6") =>
    createError(
      "DEVICE_NOT_CONNECTED",
      `${deviceName} is not connected to your computer.`,
      "Make sure the device is properly connected via USB cable.",
      [
        "Check that the USB cable is securely connected to both the device and computer",
        "Try a different USB port or cable",
        "Restart the device and reconnect",
      ]
    ),

  DEVICE_MODE_INVALID: (currentMode: string, requiredMode: string) =>
    createError(
      "DEVICE_MODE_INVALID",
      `Device is in ${currentMode} mode, but ${requiredMode} mode is required for this operation.`,
      `Switch the device to ${requiredMode} mode and try again.`,
      [
        "Turn off the device",
        `Hold the appropriate button combination for ${requiredMode} mode`,
        "Turn on the device while holding the buttons",
        "Wait for the device to enter the correct mode",
      ]
    ),

  BACKUP_FOLDER_EMPTY: () =>
    createError(
      "BACKUP_FOLDER_EMPTY",
      "The backup folder on the device is empty or inaccessible.",
      "Make sure the device has data to backup and is in the correct mode.",
      [
        "Verify the device contains patterns or samples to backup",
        "Check that the device is in the correct backup mode",
        "Try reconnecting the device",
      ]
    ),

  BACKUP_FOLDER_INACCESSIBLE: () =>
    createError(
      "BACKUP_FOLDER_INACCESSIBLE",
      "Cannot access the backup folder on the device.",
      "The device may not be in mass storage mode or there may be a connection issue.",
      [
        "Disconnect and reconnect the device",
        "Make sure the device is in the correct mode",
        "Try a different USB port",
        "Restart the application",
      ]
    ),

  INSUFFICIENT_SPACE: (required: string, available: string) =>
    createError(
      "INSUFFICIENT_SPACE",
      `Insufficient disk space. Required: ${required}, Available: ${available}`,
      "Free up space on your computer or choose a different backup location.",
      [
        "Delete unnecessary files to free up space",
        "Choose a different backup location with more available space",
        "Consider backing up to an external drive",
      ]
    ),

  BACKUP_UNSUCCESSFUL: (details?: string) =>
    createError(
      "BACKUP_FAILED",
      `Backup operation was unsuccessful. ${details || ""}`,
      "Check device connection and try again.",
      [
        "Ensure the device remains connected during the backup process",
        "Check that the backup destination has sufficient space",
        "Verify the device is in the correct mode",
        "Try restarting both the device and application",
      ]
    ),

  RESTORE_UNSUCCESSFUL: (details?: string) =>
    createError(
      "RESTORE_FAILED",
      `Restore operation was unsuccessful. ${details || ""}`,
      "Check the backup file and device connection.",
      [
        "Verify the backup file is valid and not corrupted",
        "Ensure the device is connected and in restore mode",
        "Check that there is sufficient space on the device",
        "Try with a different backup file",
      ]
    ),
};
