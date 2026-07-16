import { P6Device } from "../../../shared/models/P6Device";
import { UsbDeviceManager, UsbDeviceInfo } from "../../../shared/services/UsbDeviceManager";
import { ModeDetector, ModeDetectionResult } from "../../../shared/services/ModeDetector";
import { DeviceMode } from "../../../shared/types/index";

jest.mock("../../../shared/services/UsbDeviceManager");
jest.mock("../../../shared/services/ModeDetector");
jest.mock("../../../shared/services/DeviceDataService");
jest.mock("fs", () => ({
  promises: { stat: jest.fn().mockResolvedValue({ isDirectory: () => true }) },
}));
// Keeps ejectDevice from shelling out to a real diskutil/umount during tests.
jest.mock("child_process", () => ({
  execFile: jest.fn((_cmd, _args, cb) => cb(null, { stdout: "", stderr: "" })),
}));
jest.mock("../../../shared/services/Logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

import { execFile } from "child_process";

const execFileMock = execFile as unknown as jest.Mock;
const UsbMock = UsbDeviceManager as jest.MockedClass<typeof UsbDeviceManager>;
const DetectorMock = ModeDetector as jest.MockedClass<typeof ModeDetector>;

const P6_VOLUME: UsbDeviceInfo = { path: "/Volumes/P-6" };

function makeDetectionResult(
  mode: DeviceMode,
  path = "/Volumes/P-6"
): ModeDetectionResult {
  return {
    mode,
    confidence: "high",
    massStorageInfo: { path, mode },
    detectionMethod: "direct",
    timestamp: new Date(),
  };
}

describe("P6Device", () => {
  let usbManager: jest.Mocked<UsbDeviceManager>;
  let modeDetector: jest.Mocked<ModeDetector>;

  // The constructor starts an auto-detection interval, so every device built
  // here has to be disposed or the interval keeps the Jest worker alive.
  const devices: P6Device[] = [];

  function makeDevice(): P6Device {
    const device = new P6Device(usbManager, modeDetector);
    devices.push(device);
    return device;
  }

  beforeEach(() => {
    usbManager = new UsbMock() as jest.Mocked<UsbDeviceManager>;
    modeDetector = new DetectorMock(usbManager) as jest.Mocked<ModeDetector>;

    usbManager.scanForP6Devices.mockResolvedValue([]);
    modeDetector.detectMode.mockResolvedValue(makeDetectionResult("pattern_export"));
    modeDetector.detectModeQuick.mockResolvedValue(makeDetectionResult("pattern_export"));
  });

  afterEach(() => {
    while (devices.length) devices.pop()!.dispose();
  });

  describe("initial state", () => {
    it("starts as disconnected with unknown mode", () => {
      const device = makeDevice();
      expect(device.getStatus().connected).toBe(false);
      expect(device.getCurrentMode()).toBe("unknown");
    });
  });

  describe("connect", () => {
    it("reports failure when no P-6 volume is mounted", async () => {
      const device = makeDevice();
      expect(await device.connect()).toBe(false);
      expect(device.getStatus().connected).toBe(false);
    });

    it("connects to a mounted P-6 and reads its mode", async () => {
      usbManager.scanForP6Devices.mockResolvedValue([P6_VOLUME]);
      const device = makeDevice();

      expect(await device.connect()).toBe(true);
      expect(device.getStatus().connected).toBe(true);
      expect(device.getCurrentMode()).toBe("pattern_export");
    });

    it("notifies status listeners with the detected mode", async () => {
      usbManager.scanForP6Devices.mockResolvedValue([P6_VOLUME]);
      const device = makeDevice();
      const listener = jest.fn();
      device.onStatusChanged(listener);

      await device.connect();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ connected: true, mode: "pattern_export" })
      );
    });

    it("detects the mode once per connect", async () => {
      usbManager.scanForP6Devices.mockResolvedValue([P6_VOLUME]);
      const device = makeDevice();

      await device.connect();

      expect(modeDetector.detectMode).toHaveBeenCalledTimes(1);
    });

    it("is a no-op when already connected", async () => {
      usbManager.scanForP6Devices.mockResolvedValue([P6_VOLUME]);
      const device = makeDevice();
      await device.connect();
      modeDetector.detectMode.mockClear();

      expect(await device.connect()).toBe(true);
      expect(modeDetector.detectMode).not.toHaveBeenCalled();
    });

    it("stays disconnected if mode detection throws", async () => {
      usbManager.scanForP6Devices.mockResolvedValue([P6_VOLUME]);
      modeDetector.detectMode.mockRejectedValue(new Error("EIO"));
      const device = makeDevice();

      expect(await device.connect()).toBe(false);
      expect(device.getCurrentMode()).toBe("unknown");
    });
  });

  describe("bank info", () => {
    it("exposes the banks the volume reports in sample export mode", async () => {
      usbManager.scanForP6Devices.mockResolvedValue([P6_VOLUME]);
      modeDetector.detectMode.mockResolvedValue({
        ...makeDetectionResult("sample_export"),
        massStorageInfo: {
          path: "/Volumes/P-6",
          mode: "sample_export",
          banks: ["A", "B"],
          currentBank: "A",
        },
      });
      const device = makeDevice();

      await device.connect();

      expect(device.getCurrentBanks()).toEqual(["A", "B"]);
      expect(device.getCurrentBank()).toBe("A");
      expect(device.hasBankInfo()).toBe(true);
    });

    it("reports no bank info in a pattern mode", async () => {
      usbManager.scanForP6Devices.mockResolvedValue([P6_VOLUME]);
      const device = makeDevice();

      await device.connect();

      expect(device.getCurrentBanks()).toBeNull();
      expect(device.hasBankInfo()).toBe(false);
    });
  });

  describe("retryModeDetection", () => {
    it("returns the detected mode and updates status", async () => {
      const device = makeDevice();
      expect(await device.retryModeDetection()).toBe("pattern_export");
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
    beforeEach(() => {
      usbManager.scanForP6Devices.mockResolvedValue([P6_VOLUME]);
    });

    it("resets to disconnected with unknown mode", async () => {
      const device = makeDevice();
      await device.connect();
      expect(device.getStatus().connected).toBe(true);

      await device.ejectDevice();

      expect(device.getStatus().connected).toBe(false);
      expect(device.getCurrentMode()).toBe("unknown");
    });

    it("unmounts the volume through the OS", async () => {
      const device = makeDevice();
      await device.connect();

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
      modeDetector.detectMode.mockResolvedValue(
        makeDetectionResult("sample_import", hostile)
      );
      const device = makeDevice();
      await device.connect();

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
      await device.connect();

      const ok = await device.ejectDevice();

      expect(ok).toBe(false);
      // A busy volume must not leave the app claiming the device is gone.
      expect(device.getStatus().connected).toBe(true);
    });

    it("still resets state when no volume was ever mounted", async () => {
      modeDetector.detectMode.mockResolvedValue({
        ...makeDetectionResult("unknown"),
        massStorageInfo: null,
      });
      const device = makeDevice();
      await device.connect();

      const ok = await device.ejectDevice();

      expect(ok).toBe(true);
      expect(execFileMock).not.toHaveBeenCalled();
      expect(device.getStatus().connected).toBe(false);
    });
  });
});
