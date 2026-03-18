import { P6Device } from "../../../shared/models/P6Device";
import { UsbDeviceManager } from "../../../shared/services/UsbDeviceManager";
import { ModeDetector } from "../../../shared/services/ModeDetector";
import { FileSystemService } from "../../../shared/services/FileSystemService";
import { UsbDeviceInfo } from "../../../shared/services/UsbDeviceManager";
import { ModeDetectionResult } from "../../../shared/services/ModeDetector";

jest.mock("../../../shared/services/UsbDeviceManager");
jest.mock("../../../shared/services/ModeDetector");
jest.mock("../../../shared/services/FileSystemService");
jest.mock("../../../shared/services/DeviceConnectionService");
jest.mock("fs");
jest.mock("fs/promises", () => ({
  stat: jest.fn().mockResolvedValue({ isDirectory: () => true }),
}));
jest.mock("../../../shared/services/Logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

// Import AFTER mocking to get the mock constructors
import { DeviceConnectionService } from "../../../shared/services/DeviceConnectionService";
const ConnSvcMock = DeviceConnectionService as jest.MockedClass<typeof DeviceConnectionService>;
const UsbMock = UsbDeviceManager as jest.MockedClass<typeof UsbDeviceManager>;
const DetectorMock = ModeDetector as jest.MockedClass<typeof ModeDetector>;

const ROLAND_DEVICE: UsbDeviceInfo = { vendorId: 0x0582, productId: 0x0300, manufacturer: "Roland", product: "P-6" };

function makeDetectionResult(mode: string): ModeDetectionResult {
  return {
    mode: mode as any,
    confidence: "high",
    massStorageInfo: { path: "/Volumes/P-6", mode },
    detectionMethod: "direct",
    timestamp: new Date(),
  };
}

describe("P6Device", () => {
  let usbManager: jest.Mocked<UsbDeviceManager>;
  let modeDetector: jest.Mocked<ModeDetector>;
  let onConnectedCb: ((d: UsbDeviceInfo) => void) | undefined;

  beforeEach(() => {
    usbManager = new UsbMock() as jest.Mocked<UsbDeviceManager>;
    modeDetector = new DetectorMock(usbManager) as jest.Mocked<ModeDetector>;

    modeDetector.detectMode.mockResolvedValue(makeDetectionResult("pattern_export"));
    modeDetector.detectModeQuick.mockResolvedValue(makeDetectionResult("pattern_export"));
    modeDetector.getConfig.mockReturnValue({
      maxAttempts: 5, baseDelayMs: 1000, timeoutMs: 30000, enableAutoRetry: true, logLevel: "info",
    });
    modeDetector.getModeInstructions.mockReturnValue([]);

    // Capture the onConnected callback registered with DeviceConnectionService
    ConnSvcMock.prototype.setOnConnected.mockImplementation((cb) => { onConnectedCb = cb; });
    ConnSvcMock.prototype.setOnDisconnected.mockImplementation(() => {});
    ConnSvcMock.prototype.connectDevice.mockResolvedValue(null);
  });

  function makeDevice(): P6Device {
    const fss = new (FileSystemService as any)() as jest.Mocked<FileSystemService>;
    return new P6Device(usbManager, modeDetector, fss);
  }

  describe("constructor wiring", () => {
    it("registers setOnConnected with DeviceConnectionService", () => {
      makeDevice();
      expect(ConnSvcMock.prototype.setOnConnected).toHaveBeenCalledWith(expect.any(Function));
    });

    it("registers setOnDisconnected with DeviceConnectionService", () => {
      makeDevice();
      expect(ConnSvcMock.prototype.setOnDisconnected).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe("initial state", () => {
    it("starts as disconnected with unknown mode", () => {
      const device = makeDevice();
      expect(device.getStatus().connected).toBe(false);
      expect(device.getCurrentMode()).toBe("unknown");
    });
  });

  describe("handleDeviceConnected (via onConnected callback)", () => {
    it("sets connected=true", async () => {
      const device = makeDevice();
      await onConnectedCb!(ROLAND_DEVICE);
      expect(device.getStatus().connected).toBe(true);
    });

    it("calls detectMode to determine the mode (not left as unknown)", async () => {
      const device = makeDevice();
      await onConnectedCb!(ROLAND_DEVICE);
      expect(modeDetector.detectMode).toHaveBeenCalled();
      expect(device.getCurrentMode()).toBe("pattern_export");
    });

    it("notifies status listeners with the detected mode", async () => {
      const device = makeDevice();
      const listener = jest.fn();
      device.onStatusChanged(listener);
      await onConnectedCb!(ROLAND_DEVICE);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ connected: true, mode: "pattern_export" })
      );
    });

    it("detects sample_export when device connects in sample mode", async () => {
      modeDetector.detectMode.mockResolvedValue(makeDetectionResult("sample_export"));
      const device = makeDevice();
      await onConnectedCb!(ROLAND_DEVICE);
      expect(device.getCurrentMode()).toBe("sample_export");
    });

    it("detects pattern_import when device has RESTORE folder", async () => {
      modeDetector.detectMode.mockResolvedValue(makeDetectionResult("pattern_import"));
      const device = makeDevice();
      await onConnectedCb!(ROLAND_DEVICE);
      expect(device.getCurrentMode()).toBe("pattern_import");
    });

    it("falls back to unknown if mode detection throws", async () => {
      modeDetector.detectMode.mockRejectedValue(new Error("USB error"));
      const device = makeDevice();
      await onConnectedCb!(ROLAND_DEVICE);
      expect(device.getCurrentMode()).toBe("unknown");
    });
  });

  describe("retryModeDetection", () => {
    it("returns the detected mode and updates status", async () => {
      const device = makeDevice();
      const mode = await device.retryModeDetection();
      expect(mode).toBe("pattern_export");
      expect(device.getCurrentMode()).toBe("pattern_export");
    });

    it("notifies listeners after retry", async () => {
      const device = makeDevice();
      const listener = jest.fn();
      device.onStatusChanged(listener);
      await device.retryModeDetection();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "pattern_export" })
      );
    });
  });

  describe("ejectDevice", () => {
    it("resets to disconnected with unknown mode", async () => {
      const device = makeDevice();
      await onConnectedCb!(ROLAND_DEVICE);
      expect(device.getStatus().connected).toBe(true);

      await device.ejectDevice();

      expect(device.getStatus().connected).toBe(false);
      expect(device.getCurrentMode()).toBe("unknown");
    });
  });
});
