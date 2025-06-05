import React from "react";
import { UI_LABELS } from "../../shared/constants";

interface HeaderProps {
  currentView: "backup" | "restore" | "guide";
  onViewChange: (view: "backup" | "restore" | "guide") => void;
}

const TABS: Array<{
  key: "backup" | "restore" | "guide";
  label: string;
}> = [
  { key: "backup", label: UI_LABELS.NAV_BACKUP },
  { key: "restore", label: UI_LABELS.NAV_RESTORE },
  { key: "guide", label: UI_LABELS.NAV_GUIDE },
];

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onViewChange,
}) => (
  <header className="md-top-app-bar">
    <div className="md-top-app-bar-content">
      <div className="md-top-app-bar-title">
        <span className="md-text-title">{UI_LABELS.APP_TITLE}</span>
      </div>
      <div className="md-tab-bar">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`md-tab ${
              currentView === tab.key ? "md-tab-active" : ""
            }`}
            onClick={() => onViewChange(tab.key)}
          >
            <span className="md-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  </header>
);
