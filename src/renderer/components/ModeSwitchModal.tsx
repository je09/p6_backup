import React from "react";
import { DeviceMode } from "../../shared/types/index";
import {
  UI_LABELS,
  MODE_ENTRY_INSTRUCTIONS,
  MODE_LABELS,
} from "../../shared/constants";

interface ModeSwitchModalProps {
  isOpen: boolean;
  requiredMode: DeviceMode;
  liveMode: DeviceMode;
  onCancel: () => void;
  onContinue: () => void;
  operation: string;
}

export const ModeSwitchModal: React.FC<ModeSwitchModalProps> = ({
  isOpen,
  requiredMode,
  liveMode,
  onCancel,
  onContinue,
  operation,
}) => {
  if (!isOpen) return null;

  const isReady = liveMode === requiredMode;

  return (
    <div className="mac-overlay">
      <div
        className="modal-dialog outer-border"
        style={{ width: "32rem", maxWidth: "90vw" }}
      >
        <div className="inner-border">
          <div className="modal-contents">
            <h1 className="modal-text">{UI_LABELS.MODE_SWITCH_REQUIRED}</h1>
            <p style={{ marginBottom: 10 }}>
              {UI_LABELS.MODE_SWITCH_OPERATION_MESSAGE(operation)}
            </p>

            <div className="mode-comparison">
              <div className="mode-box">
                <div className="mode-label">{UI_LABELS.CURRENT_MODE_LABEL}</div>
                <div className="mode-value">{MODE_LABELS[liveMode]}</div>
              </div>
              <div className="mode-arrow">→</div>
              <div className="mode-box">
                <div className="mode-label">{UI_LABELS.REQUIRED_MODE_LABEL}</div>
                <div className="mode-value">{MODE_LABELS[requiredMode]}</div>
              </div>
            </div>

            <div className="info-box">
              <p>
                <strong>{UI_LABELS.MODE_INSTRUCTIONS_LABEL}</strong>{" "}
                {MODE_ENTRY_INSTRUCTIONS[requiredMode]}
              </p>
              <p>
                {isReady ? (
                  <strong>
                    Device is in {MODE_LABELS[requiredMode]} mode — ready to
                    continue.
                  </strong>
                ) : (
                  <>
                    Waiting for device to switch to{" "}
                    <strong>{MODE_LABELS[requiredMode]}</strong> mode…
                  </>
                )}
              </p>
            </div>

            <section
              className="field-row"
              style={{ justifyContent: "flex-end", marginTop: 12 }}
            >
              <button className="btn" onClick={onCancel}>
                {UI_LABELS.CANCEL}
              </button>
              <button
                className="btn btn-default"
                onClick={onContinue}
                disabled={!isReady}
              >
                {UI_LABELS.CONTINUE}
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
