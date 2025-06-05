import React from "react";
import { UI_LABELS } from "../../shared/constants";

interface ModeSwitchModalProps {
  isOpen: boolean;
  currentMode: string;
  requiredMode: string;
  onCancel: () => void;
  onContinue: () => void;
  operation: string;
}

const getModeDisplayName = (mode: string): string => {
  switch (mode) {
    case "pattern":
      return UI_LABELS.MODE_PATTERN_DISPLAY;
    case "sample":
      return UI_LABELS.MODE_SAMPLE_DISPLAY;
    case "unknown":
      return UI_LABELS.MODE_UNKNOWN_DISPLAY;
    default:
      return mode;
  }
};

const getModeInstructions = (requiredMode: string): string => {
  switch (requiredMode) {
    case "pattern":
      return UI_LABELS.MODE_INSTRUCTION_PATTERN;
    case "sample":
      return UI_LABELS.MODE_INSTRUCTION_SAMPLE;
    default:
      return UI_LABELS.MODE_INSTRUCTION_DEFAULT(requiredMode);
  }
};

export const ModeSwitchModal: React.FC<ModeSwitchModalProps> = ({
  isOpen,
  currentMode,
  requiredMode,
  onCancel,
  onContinue,
  operation,
}) => {
  if (!isOpen) return null;

  return (
    <div className="md-modal-overlay">
      <div className="md-modal">
        <div className="md-modal-header">
          <h3 className="md-text-title">{UI_LABELS.MODE_SWITCH_REQUIRED}</h3>
        </div>
        <div className="md-modal-content">
          <p className="md-text-body">
            {UI_LABELS.MODE_SWITCH_OPERATION_MESSAGE(operation)}
          </p>
          <div className="md-mode-comparison">
            <div className="md-mode-item">
              <span className="md-mode-label">
                {UI_LABELS.CURRENT_MODE_LABEL}
              </span>
              <span className="md-mode-value md-mode-current">
                {getModeDisplayName(currentMode)}
              </span>
            </div>
            <div className="md-mode-arrow">→</div>
            <div className="md-mode-item">
              <span className="md-mode-label">
                {UI_LABELS.REQUIRED_MODE_LABEL}
              </span>
              <span className="md-mode-value md-mode-required">
                {getModeDisplayName(requiredMode)}
              </span>
            </div>
          </div>
          <div className="md-mode-instructions">
            <p className="md-text-body">
              <strong>{UI_LABELS.MODE_INSTRUCTIONS_LABEL}</strong>{" "}
              {getModeInstructions(requiredMode)}
            </p>
            <p className="md-text-body">
              {UI_LABELS.MODE_SWITCH_CONTINUE_MESSAGE(operation)}
            </p>
          </div>
        </div>
        <div className="md-modal-actions">
          <button className="md-button-text" onClick={onCancel}>
            {UI_LABELS.CANCEL}
          </button>
          <button className="md-button-text" onClick={onContinue}>
            {UI_LABELS.CONTINUE}
          </button>
        </div>
      </div>
    </div>
  );
};
