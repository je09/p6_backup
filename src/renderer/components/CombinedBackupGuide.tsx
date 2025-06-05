import React from "react";

/**
 * CombinedBackupGuide
 *
 * A presentational component that displays a guide or instructions for the combined backup process.
 * Extend this component with props if you want to make the guide dynamic.
 */
const steps = [
  "Connect your device and ensure it is in the correct mode.",
  "Select whether to include patterns and/or samples in your backup.",
  "If including patterns, choose which patterns to back up.",
  "If including samples, select the sample banks to include (or leave empty for all banks).",
  "Click the backup button to start the process.",
  "Wait for the progress indicator to complete. Do not disconnect your device during backup.",
  "Once finished, verify your backup files in the output location.",
];

export const CombinedBackupGuide: React.FC = () => (
  <div className="combined-backup-guide">
    <h3>Combined Backup Guide</h3>
    <ol>
      {steps.map((step, i) => (
        <li key={i}>{step}</li>
      ))}
    </ol>
    <p className="guide-note">
      Note: Some options may be disabled depending on your device's mode or
      connection status.
    </p>
  </div>
);
