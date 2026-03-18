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
  mode === "sample_export" || mode === "sample_import";

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

  const dotClass = isLoading
    ? "loading"
    : deviceStatus.connected
    ? "connected"
    : "disconnected";

  return (
    <div className="section-block">
      <div className="status-row">
        <div className={`status-dot ${dotClass}`} />
        <span>{getStatusText()}</span>
      </div>

      {deviceStatus.connected &&
        isSampleMode(deviceStatus.mode) &&
        bankInfo.hasBankInfo && (
          <div style={{ marginTop: 6, fontSize: 13 }}>
            {bankInfo.currentBank && (
              <div><strong>Current Bank:</strong> {bankInfo.currentBank}</div>
            )}
            {bankInfo.currentBanks && bankInfo.currentBanks.length > 0 && (
              <div>
                <strong>Available Banks:</strong>{" "}
                {bankInfo.currentBanks.join(", ")}
              </div>
            )}
          </div>
        )}

      {deviceStatus.connected && deviceStatus.mode === "unknown" && (
        <div className="info-box" style={{ marginTop: 8 }}>
          <p>Power off and hold while powering on:</p>
          <p>
            • <strong>PLAY</strong> = Pattern backup &nbsp;•{" "}
            <strong>RECORD</strong> = Pattern restore
            <br />• <strong>BANK + SAMPLING</strong> = Sample backup &nbsp;•{" "}
            <strong>SAMPLE</strong> = Sample restore
          </p>
          <section
            className="field-row"
            style={{ justifyContent: "flex-end", marginTop: 8 }}
          >
            <button
              className="btn"
              onClick={handleRetryModeDetection}
              disabled={isRetryingMode}
            >
              {isRetryingMode ? "Checking…" : "Check Mode Again"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
};
