import React from "react";
import { UI_LABELS, INFO_MESSAGES } from "../../shared/constants";

interface GuideCardProps {
  title: string;
  subtitle?: string;
  steps?: string[];
  children?: React.ReactNode;
}

const GuideCard: React.FC<GuideCardProps> = ({
  title,
  subtitle,
  steps,
  children,
}) => (
  <div className="md-card">
    <div className="md-card-content">
      <div className="md-card-header">
        <h2 className="md-text-title">{title}</h2>
        {subtitle && <p className="md-text-body">{subtitle}</p>}
      </div>
      <div className="md-text-body">
        {steps && (
          <ol style={{ paddingLeft: 20 }}>
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        )}
        {children}
      </div>
    </div>
  </div>
);

const guideCards = [
  {
    title: UI_LABELS.GUIDE_PATTERN_BACKUP,
    subtitle: "Enter backup mode to save your patterns",
    steps: [
      "Power off P6",
      "Hold PLAY button while powering on",
      'Device connects as "P6" with BACKUP folder',
      "Use app to backup patterns",
    ],
  },
  {
    title: UI_LABELS.GUIDE_PATTERN_RESTORE,
    subtitle: "Enter restore mode to load saved patterns",
    steps: [
      "Power off P6",
      "Hold RECORD button while powering on",
      "Device connects with RESTORE folder",
      "Select backup in app and restore",
    ],
  },
  {
    title: UI_LABELS.GUIDE_SAMPLE_BACKUP,
    subtitle: "Enter sample mode to backup individual banks",
    steps: [
      "Power off P6",
      "Hold BANK button + SAMPLING button while powering on",
      "Device connects with EXPORT folder",
      "App automatically detects which bank is loaded",
      "Repeat for each bank (A-H) you want to backup",
    ],
    children: (
      <div className="md-status-indicator md-status-success">
        <div className="md-status-dot"></div>
        <em>Tip: Use Automated Backup for step-by-step guidance</em>
      </div>
    ),
  },
  {
    title: "Bank Detection",
    children: (
      <>
        <strong>Enhanced Sample Mode Detection:</strong>
        <br />
        • Automatically identifies current bank (A-H)
        <br />
        • Shows bank info in device status
        <br />
        • Displays available banks in sample mode
        <br />
        <br />
        <strong>Sample Mode Status Examples:</strong>
        <br />
        • "Connected - Sample Mode (Bank A)"
        <br />
        • "Connected - Sample Mode (Banks: A, B)"
        <br />
        <br />
        <em>
          The app now shows exactly which bank is loaded, making sample backup
          more precise and user-friendly.
        </em>
      </>
    ),
  },
  {
    title: "Sample Restore",
    steps: [
      "Power off P6",
      "Hold SAMPLE button while powering on",
      "Device connects with IMPORT folder",
      "Select backup and restore specific banks",
    ],
  },
  {
    title: "Device Modes",
    subtitle: "Quick reference for button combinations",
    children: (
      <>
        <strong>Pattern Backup:</strong> PLAY button + power
        <br />
        <strong>Pattern Restore:</strong> RECORD button + power
        <br />
        <strong>Sample Export:</strong> BANK + SAMPLING + power
        <br />
        <strong>Sample Import:</strong> SAMPLE button + power
      </>
    ),
  },
  {
    title: "Troubleshooting",
    subtitle: "Common issues and solutions",
    children: (
      <>
        <div className="md-status-indicator md-status-error">
          <div className="md-status-dot"></div>
          <div>
            <strong>Device Not Detected:</strong>
            <br />
            • Check USB connection
            <br />
            • Verify correct mode
            <br />• Try different USB port
          </div>
        </div>
        <br />
        <div className="md-status-indicator md-status-warning">
          <div className="md-status-dot"></div>
          <div>
            <strong>Backup Issues:</strong>
            <br />
            • Ensure device is in backup mode
            <br />
            • Check available storage space
            <br />• Verify files are not corrupted
          </div>
        </div>
      </>
    ),
  },
];

export const UserGuide: React.FC = () => {
  return (
    <div className="backup-layout">
      <div className="backup-header">
        <h1 className="md-text-headline">{UI_LABELS.USER_GUIDE_TITLE}</h1>
        <p className="backup-subtitle">{UI_LABELS.USER_GUIDE_SUBTITLE}</p>
      </div>
      {guideCards.map((card, i) => (
        <GuideCard key={i} {...card} />
      ))}
    </div>
  );
};
