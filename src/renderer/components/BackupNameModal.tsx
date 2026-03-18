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
    onConfirm(useCustomName && customName.trim() ? customName.trim() : undefined);
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
    <div className="mac-overlay">
      <div
        className="modal-dialog outer-border"
        style={{ width: "30rem", maxWidth: "90vw" }}
      >
        <div className="inner-border">
          <div className="modal-contents">
            <h1 className="modal-text">{title}</h1>
            {subtitle && <p style={{ marginBottom: 10 }}>{subtitle}</p>}

            <div className="name-option-row">
              <div className="field-row" style={{ marginBottom: 4 }}>
                <input
                  type="radio"
                  id="auto-name"
                  name="nameOption"
                  checked={!useCustomName}
                  onChange={() => setUseCustomName(false)}
                />
                <label htmlFor="auto-name">Use automatic naming</label>
              </div>
              <div className="name-option-desc">
                Backup named with type and timestamp (e.g.,
                &ldquo;patterns-2025-06-07T10-30-45Z&rdquo;)
              </div>
            </div>

            <div className="name-option-row">
              <div className="field-row" style={{ marginBottom: 4 }}>
                <input
                  type="radio"
                  id="custom-name"
                  name="nameOption"
                  checked={useCustomName}
                  onChange={() => setUseCustomName(true)}
                />
                <label htmlFor="custom-name">Use custom name</label>
              </div>
              {useCustomName && (
                <div style={{ marginLeft: 22 }}>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Enter backup name…"
                    maxLength={100}
                    autoFocus
                    style={{ width: "100%", marginBottom: 6 }}
                  />
                  {customName.trim() && (
                    <div className="name-preview">
                      {sanitizePreview(customName.trim())}-2025-06-07T10-30-45Z
                    </div>
                  )}
                  <div className="name-rules">
                    <div>• Special chars will be replaced with underscores</div>
                    <div>• Timestamp added automatically for uniqueness</div>
                    <div>• Maximum 100 characters</div>
                  </div>
                </div>
              )}
            </div>

            <section
              className="field-row"
              style={{ justifyContent: "flex-end", marginTop: 12 }}
            >
              <button className="btn" onClick={handleCancel}>
                Cancel
              </button>
              <button
                className="btn btn-default"
                onClick={handleConfirm}
                disabled={!isNameValid}
              >
                Start Backup
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
