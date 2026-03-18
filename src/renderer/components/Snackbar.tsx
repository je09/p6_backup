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
  success: "✓",
  error: "✕",
  warning: "!",
  info: "i",
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
    setTimeout(onClose, 300);
  };

  if (!visible && !isVisible) return null;

  return (
    <div className={`mac-notification${isVisible ? "" : " hidden"}`}>
      <div className="standard-dialog">
        <div className="mac-notification-content">
          <span
            style={{
              fontWeight: "bold",
              minWidth: 16,
              textAlign: "center",
              flexShrink: 0,
            }}
          >
            {ICONS[type]}
          </span>
          <span className="mac-notification-message">{message}</span>
          {action && (
            <button className="btn btn-default" onClick={action.onClick}>
              {action.label}
            </button>
          )}
          <button className="btn" onClick={handleClose} aria-label="Close">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
