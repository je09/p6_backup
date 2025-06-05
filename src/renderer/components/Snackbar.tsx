import React, { useEffect, useState } from "react";

export interface SnackbarProps {
  message: string;
  type: "success" | "error" | "warning" | "info";
  visible: boolean;
  onClose: () => void;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

const ICONS: Record<string, string> = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",
};

export const Snackbar: React.FC<SnackbarProps> = ({
  message,
  type,
  visible,
  onClose,
  duration = 8000,
  action,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setIsVisible(true);
      if (duration > 0) {
        const timer = setTimeout(() => handleClose(), duration);
        return () => clearTimeout(timer);
      }
    } else {
      setIsVisible(false);
    }
  }, [visible, duration]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Wait for exit animation
  };

  if (!visible && !isVisible) return null;

  return (
    <div
      className={`md-snackbar ${
        isVisible ? "md-snackbar-visible" : "md-snackbar-hidden"
      } md-snackbar-${type}`}
    >
      <div className="md-snackbar-content">
        <span className="md-snackbar-icon">{ICONS[type] || ICONS.info}</span>
        <span className="md-snackbar-message">{message}</span>
        {action && (
          <button className="md-snackbar-action" onClick={action.onClick}>
            {action.label}
          </button>
        )}
        <button
          className="md-snackbar-close"
          onClick={handleClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
