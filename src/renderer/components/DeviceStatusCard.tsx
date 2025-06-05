import React, { useState, useEffect } from "react";
import { DeviceStatus } from "../../shared/types/index";
import { UI_LABELS } from "../../shared/constants";
import { createComponentLogger } from "../utils/logger";

interface DeviceStatusCardProps {
  deviceStatus: DeviceStatus;
  isLoading: boolean;
}

interface BankInfo {
  currentBanks: string[] | null;
  currentBank: string | null;
  hasBankInfo: boolean;
}

const INITIAL_BANK_INFO: BankInfo = {
  currentBanks: null,
  currentBank: null,
  hasBankInfo: false,
};

const isSampleMode = (mode?: string) =>
  mode === "sample" || mode === "sample_export" || mode === "sample_import";

export const DeviceStatusCard: React.FC<DeviceStatusCardProps> = ({
  deviceStatus,
  isLoading,
}) => {
  const [bankInfo, setBankInfo] = useState<BankInfo>(INITIAL_BANK_INFO);
  const [isRetryingMode, setIsRetryingMode] = useState(false);
  const logger = createComponentLogger("DeviceStatusCard");

  useEffect(() => {
    const fetchBankInfo = async () => {
      if (deviceStatus.connected && isSampleMode(deviceStatus.mode)) {
        try {
          const [banks, currentBank, hasBankInfo] = await Promise.all([
            window.electronAPI.getCurrentBanks(),
            window.electronAPI.getCurrentBank(),
            window.electronAPI.hasBankInfo(),
          ]);
          setBankInfo({ currentBanks: banks, currentBank, hasBankInfo });
        } catch (error) {
          logger.error("Failed to fetch bank info", { error });
        }
      } else {
        setBankInfo(INITIAL_BANK_INFO);
      }
    };
    fetchBankInfo();
  }, [deviceStatus.connected, deviceStatus.mode]);

  const handleRetryModeDetection = async () => {
    setIsRetryingMode(true);
    try {
      const newMode = await window.electronAPI.retryModeDetection();
      logger.debug("Mode detection retry result:", newMode);
    } catch (error) {
      logger.error("Failed to retry mode detection", { error });
    } finally {
      setIsRetryingMode(false);
    }
  };

  const getStatusText = (): string => {
    if (isLoading) return UI_LABELS.DETECTING_DEVICE;
    if (deviceStatus.connected && deviceStatus.mode) {
      let statusText = UI_LABELS.CONNECTED_MODE(deviceStatus.mode);
      if (isSampleMode(deviceStatus.mode) && bankInfo.hasBankInfo) {
        if (bankInfo.currentBank) {
          statusText += UI_LABELS.BANK_INFO(bankInfo.currentBank);
        } else if (bankInfo.currentBanks && bankInfo.currentBanks.length > 0) {
          statusText += UI_LABELS.BANKS_INFO(bankInfo.currentBanks);
        }
      }
      return statusText;
    }
    return UI_LABELS.NOT_CONNECTED;
  };

  const getStatusColor = () => {
    if (isLoading) return "warning";
    return deviceStatus.connected ? "success" : "error";
  };

  return (
    <div className="md-card">
      <div className="card-content">
        <div className={`md-status-indicator md-status-${getStatusColor()}`}>
          <div className="md-status-dot"></div>
          <span className="md-text-body">{getStatusText()}</span>
        </div>

        {deviceStatus.connected &&
          isSampleMode(deviceStatus.mode) &&
          bankInfo.hasBankInfo && (
            <div className="md-card-section">
              <div className="md-text-subtitle" style={{ marginBottom: "8px" }}>
                Sample Bank Information
              </div>
              {bankInfo.currentBank && (
                <div className="md-text-body" style={{ marginBottom: "4px" }}>
                  <strong>Current Bank:</strong> {bankInfo.currentBank}
                </div>
              )}
              {bankInfo.currentBanks && bankInfo.currentBanks.length > 0 && (
                <div className="md-text-body">
                  <strong>Available Banks:</strong>{" "}
                  {bankInfo.currentBanks.join(", ")}
                </div>
              )}
            </div>
          )}

        {deviceStatus.connected && deviceStatus.mode === "unknown" && (
          <div className="md-banner">
            <div className="md-text-body">
              Device mode unknown. Power off and hold buttons while powering on:
              <br />• PLAY button = Pattern backup
              <br />• RECORD button = Pattern restore
              <br />• BANK + [SAMPLE] = Sample backup
              <br />• SAMPLE button = Sample restore
            </div>
            <div className="md-card-actions" style={{ marginTop: "12px" }}>
              <button
                className="md-button md-button-text"
                onClick={handleRetryModeDetection}
                disabled={isRetryingMode}
              >
                {isRetryingMode
                  ? "Checking Mode..."
                  : "Check Device Mode Again"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
