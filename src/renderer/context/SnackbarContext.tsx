import React, { createContext, useCallback, useContext, useState } from "react";
import { Snackbar } from "../components/Snackbar";

interface SnackbarAction {
  label: string;
  onClick: () => void;
}

interface SnackbarState {
  visible: boolean;
  message: string;
  type: "success" | "error" | "warning" | "info";
  action?: SnackbarAction;
}

interface SnackbarContextValue {
  showSnackbar(
    message: string,
    type: "success" | "error" | "warning" | "info",
    action?: SnackbarAction
  ): void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

const INITIAL: SnackbarState = { visible: false, message: "", type: "info" };

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SnackbarState>(INITIAL);

  const showSnackbar = useCallback(
    (
      message: string,
      type: "success" | "error" | "warning" | "info",
      action?: SnackbarAction
    ) => setState({ visible: true, message, type, action }),
    []
  );

  const hideSnackbar = useCallback(
    () => setState((prev) => ({ ...prev, visible: false })),
    []
  );

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      <Snackbar
        visible={state.visible}
        message={state.message}
        type={state.type}
        action={state.action}
        onClose={hideSnackbar}
      />
    </SnackbarContext.Provider>
  );
};

export function useSnackbar(): SnackbarContextValue {
  const ctx = useContext(SnackbarContext);
  if (!ctx) throw new Error("useSnackbar must be used inside <SnackbarProvider>");
  return ctx;
}
