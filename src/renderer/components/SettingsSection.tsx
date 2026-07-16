import React, { useState, useEffect } from "react";

export const SettingsSection: React.FC = () => {
  const [backupPath, setBackupPath] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.getBackupPath().then(setBackupPath).catch(() => {});
  }, []);

  const handleChange = async () => {
    setError(null);
    try {
      const selected = await window.electronAPI.selectBackupLocation();
      if (!selected) return;
      await window.electronAPI.setBackupPath(selected);
      setBackupPath(selected);
    } catch (err: any) {
      setError(err?.message || "Failed to update backup location");
    }
  };

  return (
    <div className="section-block">
      <div className="section-heading">Settings</div>
      <div className="field-row" style={{ alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12 }}>Backup location:</span>
        <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {backupPath || "—"}
        </span>
        <button className="btn btn-default" onClick={handleChange}>
          Change…
        </button>
      </div>
      {error && (
        <p style={{ fontSize: 11, fontStyle: "italic", margin: "6px 0 0" }}>{error}</p>
      )}
    </div>
  );
};
