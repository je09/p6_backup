import React, { useState } from "react";

interface BackupNameModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  defaultName?: string;
  onConfirm: (customName: string | undefined) => void;
  onCancel: () => void;
}

const sanitizePreview = (name: string) => name.replace(/[<>:"/\\|?*]/g, "_");

const NameOption: React.FC<{
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
  children?: React.ReactNode;
}> = ({ checked, onChange, label, description, children }) => (
  <div className="name-option">
    <label className="radio-option">
      <input
        type="radio"
        name="nameOption"
        checked={checked}
        onChange={onChange}
      />
      <span className="radio-label">{label}</span>
    </label>
    {description && <div className="option-description">{description}</div>}
    {checked && children}
  </div>
);

export const BackupNameModal: React.FC<BackupNameModalProps> = ({
  isOpen,
  title,
  subtitle,
  defaultName = "",
  onConfirm,
  onCancel,
}) => {
  const [customName, setCustomName] = useState(defaultName);
  const [useCustomName, setUseCustomName] = useState(false);

  if (!isOpen) return null;

  const resetState = () => {
    setCustomName(defaultName);
    setUseCustomName(false);
  };

  const handleConfirm = () => {
    onConfirm(
      useCustomName && customName.trim() ? customName.trim() : undefined
    );
    resetState();
  };

  const handleCancel = () => {
    onCancel();
    resetState();
  };

  const isNameValid =
    !useCustomName ||
    (customName.trim().length > 0 && customName.trim().length <= 100);

  return (
    <div className="md-modal-overlay">
      <div className="md-card backup-name-modal">
        <div className="md-card-content">
          <div className="md-text-headline">{title}</div>
          {subtitle && <div className="md-text-supporting">{subtitle}</div>}
          <div className="backup-name-options">
            <NameOption
              checked={!useCustomName}
              onChange={() => setUseCustomName(false)}
              label="Use automatic naming"
              description={
                'Backup will be named with type and timestamp (e.g., "patterns-2025-06-07T10-30-45-123Z")'
              }
            />
            <NameOption
              checked={useCustomName}
              onChange={() => setUseCustomName(true)}
              label="Use custom name"
            >
              <div className="custom-name-section">
                <input
                  type="text"
                  className="custom-name-input"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Enter backup name..."
                  maxLength={100}
                  autoFocus
                />
                {customName.trim() && (
                  <div className="name-preview">
                    <div className="preview-label">Preview:</div>
                    <div className="preview-name">
                      {sanitizePreview(customName.trim())}
                      -2025-06-07T10-30-45-123Z
                    </div>
                  </div>
                )}
                <div className="name-rules">
                  <div className="rule">
                    • Characters like {'<>:"/\\|?*'} will be replaced with
                    underscores
                  </div>
                  <div className="rule">
                    • Timestamp will be automatically added for uniqueness
                  </div>
                  <div className="rule">• Maximum 100 characters</div>
                </div>
              </div>
            </NameOption>
          </div>
        </div>
        <div className="md-card-actions">
          <button
            className="md-button md-button-text"
            onClick={handleConfirm}
            disabled={!isNameValid}
          >
            Start Backup
          </button>
          <button className="md-button md-button-text" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
