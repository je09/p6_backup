import { DeviceMode, DeviceStatus, PatternInfo, SampleBankData } from "../types/index";

export interface IDeviceStatus {
  isReady(): Promise<boolean>;
  getStatus(): DeviceStatus;
  getCurrentMode(): DeviceMode;
  getCurrentBanks(): string[] | null;
  getCurrentBank(): string | null;
}

export interface IDeviceEvents {
  onStatusChanged(callback: (status: DeviceStatus) => void): void;
}

export interface IDeviceModeOps {
  retryModeDetection(): Promise<DeviceMode>;
}

export interface IDeviceIO {
  readData(
    dataType: string,
    parameters?: { bankId?: string }
  ): Promise<PatternInfo[] | SampleBankData>;
  writeData(
    dataType: string,
    data: PatternInfo[] | SampleBankData,
    parameters?: { bankId?: string }
  ): Promise<boolean>;
}

/** What P6Device offers. Services depend on the narrower pieces above. */
export interface IDeviceConnection
  extends IDeviceStatus,
    IDeviceEvents,
    IDeviceModeOps,
    IDeviceIO {}
