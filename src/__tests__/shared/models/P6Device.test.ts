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
// Keeps ejectDevice from shelling out to a real diskutil/umount during tests.
jest.mock("child_process", () => ({
  execFile: jest.fn((_cmd, _args, cb) => cb(null, { stdout: "", stderr: "" })),
}));
jest.mock("../../../shared/services/Logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
  logger: {
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(),
  },
}));

// Import AFTER mocking to get the mock constructors
import { DeviceConnectionService } from "../../../shared/services/DeviceConnectionService";
import { execFile } from "child_process";

const execFileMock = execFile as unknown as jest.Mock;
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
      maxAttempts: 5, baseDelayMs: 1000, timeoutMs: 30000, enableAutoRetry: true,
      mountSettleMs: 4000, logLevel: "info",
    });
    modeDetector.getModeInstructions.mockReturnValue([]);

    // Capture the onConnected callback registered with DeviceConnectionService
    ConnSvcMock.prototype.setOnConnected.mockImplementation((cb) => { onConnectedCb = cb; });
    ConnSvcMock.prototype.setOnDisconnected.mockImplementation(() => {});
    ConnSvcMock.prototype.connectDevice.mockResolvedValue(null);
  });

  // The constructor starts an auto-detection interval, so every device built
  // here has to be disposed or the interval keeps the Jest worker alive.
  const devices: P6Device[] = [];

  afterEach(() => {
    while (devices.length) devices.pop()!.dispose();
  });

  function makeDevice(): P6Device {
    const fss = new (FileSystemService as any)() as jest.Mocked<FileSystemService>;
    const device = new P6Device(usbManager, modeDetector, fss);
    devices.push(device);
    return device;
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

    it("unmounts the volume through the OS", async () => {
      const device = makeDevice();
      await onConnectedCb!(ROLAND_DEVICE);

      const ok = await device.ejectDevice();

      expect(ok).toBe(true);
      expect(execFileMock).toHaveBeenCalledTimes(1);
      const [command, args] = execFileMock.mock.calls[0];
      expect(command).toBe("diskutil");
      expect(args).toEqual(["eject", "/Volumes/P-6"]);
    });

    // Volume labels come from the device, so the mount path is attacker
    // controlled. It must reach execFile as one argv entry and never a shell.
    // The payload deliberately targets a throwaway path: if a future refactor
    // reintroduces a shell, this test must not be the thing that does damage.
    it("passes a hostile volume label through as a single argument", async () => {
      const hostile = '/Volumes/P-6"; rm -rf /tmp/madeup; echo "';
      modeDetector.detectMode.mockResolvedValue({
        mode: "sample_import" as any,
        confidence: "high",
        massStorageInfo: { path: hostile, mode: "sample_import" },
        detectionMethod: "direct",
        timestamp: new Date(),
      });
      const device = makeDevice();
      await onConnectedCb!(ROLAND_DEVICE);

      await device.ejectDevice();

      const [command, args, third] = execFileMock.mock.calls[0];
      expect(command).toBe("diskutil");
      // One argv entry, passed through verbatim — never spliced into a string
      // and never handed an options object that could re-enable a shell.
      expect(args).toEqual(["eject", hostile]);
      expect(command).not.toContain("rm -rf");
      expect(typeof third).toBe("function");
    });

    it("reports failure when the volume will not unmount", async () => {
      execFileMock.mockImplementationOnce((_cmd: any, _args: any, cb: any) =>
        cb(new Error("Volume in use by another process"))
      );
      const device = makeDevice();
      await onConnectedCb!(ROLAND_DEVICE);

      const ok = await device.ejectDevice();

      expect(ok).toBe(false);
      // A busy volume must not leave the app claiming the device is gone.
      expect(device.getStatus().connected).toBe(true);
    });

    it("still resets state when no volume was ever mounted", async () => {
      modeDetector.detectMode.mockResolvedValue({
        mode: "normal" as any,
        confidence: "high",
        massStorageInfo: null,
        detectionMethod: "direct",
        timestamp: new Date(),
      });
      const device = makeDevice();
      await onConnectedCb!(ROLAND_DEVICE);

      const ok = await device.ejectDevice();

      expect(ok).toBe(true);
      expect(execFileMock).not.toHaveBeenCalled();
      expect(device.getStatus().connected).toBe(false);
    });
  });
});
