/**
 * Detection against a simulated P-6, exercising the real UsbDeviceManager and
 * ModeDetector rather than mocking them out.
 *
 * The unit tests mock checkP6MassStorageMode directly, so they cannot see the
 * thing that actually broke on hardware: the device is on the USB bus before
 * its volume is mounted. These drive the stack through the same seams the OS
 * does — the filesystem and the USB bus — so that gap is reproducible.
 */
// jest.mock factories are hoisted above imports, so the fake has to be pulled
// in lazily here rather than through a top-level import binding.
// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.mock("fs", () => require("../helpers/FakeP6").fakeFs);
jest.mock("../../shared/services/Logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

import * as usb from "usb";
import { FakeP6, useFakeP6 } from "../helpers/FakeP6";
import { UsbDeviceManager } from "../../shared/services/UsbDeviceManager";
import { ModeDetector } from "../../shared/services/ModeDetector";

const getDeviceList = usb.getDeviceList as unknown as jest.Mock;

describe("mode detection against a simulated P-6", () => {
  let p6: FakeP6;
  let manager: UsbDeviceManager;

  function makeDetector(mountSettleMs = 200) {
    return new ModeDetector(manager, {
      enableAutoRetry: true,
      maxAttempts: 5,
      baseDelayMs: 1,
      mountSettleMs,
      logLevel: "error",
    });
  }

  beforeEach(() => {
    p6 = useFakeP6(new FakeP6());
    manager = new UsbDeviceManager();
    getDeviceList.mockImplementation(() => p6.usbDeviceList());
  });

  afterEach(() => {
    manager.dispose();
  });

  describe("each power-on mode is read from the volume it exposes", () => {
    it.each([
      ["pattern_export", "holding the pattern backup button"],
      ["pattern_import", "holding the pattern restore button"],
      ["sample_import", "holding [SAMPLING]"],
    ] as const)("detects %s when powered on %s", async (mode, _heldButton) => {
      p6.powerOnInto(mode);

      const result = await makeDetector().detectMode();

      expect(result.mode).toBe(mode);
      expect(result.massStorageInfo?.path).toBe("/Volumes/P-6");
    });

    it("detects sample_export and reports the banks holding pads", async () => {
      p6 = useFakeP6(new FakeP6({ banks: { A: [1, 2], C: [4] } }));
      p6.powerOnInto("sample_export");

      const result = await makeDetector().detectMode();

      expect(result.mode).toBe("sample_export");
      expect(result.massStorageInfo?.banks).toEqual(["A", "C"]);
      expect(result.massStorageInfo?.currentBank).toBe("A");
    });

    it("ignores banks with no pads recorded", async () => {
      p6 = useFakeP6(new FakeP6({ banks: { A: [1], B: [] } }));
      p6.powerOnInto("sample_export");

      const result = await makeDetector().detectMode();

      expect(result.massStorageInfo?.banks).toEqual(["A"]);
    });

    it("reports normal mode when the device mounts no volume", async () => {
      p6.powerOnInto("normal");

      const result = await makeDetector().detectMode();

      expect(result.mode).toBe("normal");
    });

    it("reports unknown when the device is powered off", async () => {
      p6.powerOff();

      const result = await makeDetector().detectMode();

      expect(result.mode).toBe("unknown");
    });
  });

  // The regression that shipped: USB enumerates first, the volume follows.
  describe("the gap between USB enumeration and the volume mounting", () => {
    it("does not call a device in sample restore mode 'normal'", async () => {
      p6 = useFakeP6(new FakeP6({ mountDelayMs: 120 }));
      p6.powerOnInto("sample_import");

      // The volume genuinely is not there yet.
      expect(await manager.checkP6MassStorageMode()).toBeNull();
      expect(manager.isP6UsbConnected()).toBe(true);

      const result = await makeDetector().detectMode();

      expect(result.mode).toBe("sample_import");
    });

    it("settles on normal only after giving the volume time to appear", async () => {
      p6.powerOnInto("normal");

      const started = Date.now();
      const result = await makeDetector(150).detectMode();

      expect(result.mode).toBe("normal");
      expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    });

    it("returns as soon as the volume is already mounted", async () => {
      p6.powerOnInto("sample_import"); // mountDelayMs 0

      const started = Date.now();
      const result = await makeDetector(5000).detectMode();

      expect(result.mode).toBe("sample_import");
      expect(Date.now() - started).toBeLessThan(500);
    });
  });

  describe("power cycling between modes, as a restore requires", () => {
    it("follows the device from sample restore to pattern restore", async () => {
      p6.powerOnInto("sample_import");
      expect((await makeDetector().detectMode()).mode).toBe("sample_import");

      p6.powerCycleInto("pattern_import");
      expect((await makeDetector().detectMode()).mode).toBe("pattern_import");
    });

    it("sees the device leave the bus while powered off", async () => {
      p6.powerOnInto("sample_import");
      expect(manager.isP6UsbConnected()).toBe(true);

      p6.powerOff();

      expect(manager.isP6UsbConnected()).toBe(false);
      expect((await makeDetector().detectMode()).mode).toBe("unknown");
    });

    it("reports normal after an eject leaves the device powered but unmounted", async () => {
      p6.powerOnInto("sample_import");
      expect((await makeDetector().detectMode()).mode).toBe("sample_import");

      p6.eject();

      const result = await makeDetector(30).detectMode();
      expect(result.mode).toBe("normal");
      expect(await manager.checkP6MassStorageMode()).toBeNull();
    });
  });

  describe("volume discovery", () => {
    it("finds the device under a differently cased label", async () => {
      p6 = useFakeP6(new FakeP6({ label: "p6" }));
      p6.powerOnInto("sample_import");

      const info = await manager.checkP6MassStorageMode();

      expect(info).toMatchObject({ path: "/Volumes/p6", mode: "sample_import" });
    });

    it("does not mistake another mounted volume for a P-6", async () => {
      p6 = useFakeP6(new FakeP6({ label: "Backup Drive" }));
      p6.powerOnInto("sample_import");

      expect(await manager.checkP6MassStorageMode()).toBeNull();
    });

    it("reports unknown for a P-6 volume with no marker folder", async () => {
      p6.powerOnInto("normal");
      // A volume is mounted, but it carries nothing that identifies a mode.
      (p6 as any).mountedAt = Date.now() - 1;

      const info = await manager.checkP6MassStorageMode();

      expect(info).toMatchObject({ mode: "unknown" });
    });
  });
});
