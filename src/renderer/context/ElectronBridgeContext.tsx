import React, { createContext, useContext } from "react";
import { IElectronBridge } from "../services/IElectronBridge";
import { electronBridge } from "../services/ElectronBridge";

const ElectronBridgeContext = createContext<IElectronBridge>(electronBridge);

/**
 * Override the default bridge (e.g. with a mock in tests).
 * In production the default value is the real ElectronBridge singleton,
 * so wrapping with this provider is optional unless you need to inject a mock.
 */
export const ElectronBridgeProvider: React.FC<{
  bridge?: IElectronBridge;
  children: React.ReactNode;
}> = ({ bridge = electronBridge, children }) => (
  <ElectronBridgeContext.Provider value={bridge}>
    {children}
  </ElectronBridgeContext.Provider>
);

export function useElectronBridge(): IElectronBridge {
  return useContext(ElectronBridgeContext);
}
