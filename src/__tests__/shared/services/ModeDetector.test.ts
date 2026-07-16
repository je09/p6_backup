import { ModeDetector } from "../../../shared/services/ModeDetector";
import { UsbDeviceManager } from "../../../shared/services/UsbDeviceManager";

jest.mock("../../../shared/services/UsbDeviceManager");
jest.mock("../../../shared/services/Logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const UsbDeviceManagerMock = UsbDeviceManager as jest.MockedClass<typeof UsbDeviceManager>;

describe("ModeDetector", () => {
  let usbManager: jest.Mocked<UsbDeviceManager>;
  let detector: ModeDetector;

  beforeEach(() => {
    usbManager = new UsbDeviceManagerMock() as jest.Mocked<UsbDeviceManager>;
    detector = new ModeDetector(usbManager, {
      enableAutoRetry: false,
      maxAttempts: 1,
    });
  });

  describe("detectModeQuick", () => {
    it("returns unknown when no P-6 volume is mounted", async () => {
      usbManager.checkP6MassStorageMode.mockResolvedValue(null);
      const result = await detector.detectModeQuick();
      expect(result.mode).toBe("unknown");
      expect(result.confidence).toBe("low");
    });

    it.each([
      ["pattern_export", "BACKUP"],
      ["pattern_import", "RESTORE"],
      ["sample_export", "EXPORT"],
      ["sample_import", "IMPORT"],
    ] as const)(
      "returns %s when the volume has a %s folder",
      async (mode, _markerFolder) => {
        usbManager.checkP6MassStorageMode.mockResolvedValue({
          path: "/Volumes/P-6",
          mode,
        });
        const result = await detector.detectModeQuick();
        expect(result.mode).toBe(mode);
        expect(result.confidence).toBe("high");
      }
    );

    it("carries the mass storage info through in the result", async () => {
      const info = {
        path: "/Volumes/P-6",
        mode: "pattern_export" as const,
        banks: ["A"],
      };
      usbManager.checkP6MassStorageMode.mockResolvedValue(info);
      const result = await detector.detectModeQuick();
      expect(result.massStorageInfo).toBe(info);
    });

    // A P-6 volume with no marker folder is a device we cannot act on, so it
    // must never be reported as though its mode were known.
    it("returns unknown, at low confidence, for a volume with no marker", async () => {
      usbManager.checkP6MassStorageMode.mockResolvedValue({
        path: "/Volumes/P-6",
        mode: "unknown",
      });
      const result = await detector.detectModeQuick();
      expect(result.mode).toBe("unknown");
      expect(result.confidence).toBe("low");
    });

    it("returns unknown rather than throwing when the scan fails", async () => {
      usbManager.checkP6MassStorageMode.mockRejectedValue(new Error("EIO"));
      const result = await detector.detectModeQuick();
      expect(result.mode).toBe("unknown");
      expect(result.failureReason).toContain("EIO");
    });
  });

  describe("detectMode retrying", () => {
    beforeEach(() => {
      detector = new ModeDetector(usbManager, {
        enableAutoRetry: true,
        maxAttempts: 3,
        baseDelayMs: 1,
      });
    });

    // The OS mounts the volume a moment after the device is powered on.
    it("keeps looking until the volume appears", async () => {
      usbManager.checkP6MassStorageMode
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ path: "/Volumes/P-6", mode: "sample_import" });

      const result = await detector.detectMode();

      expect(result.mode).toBe("sample_import");
      expect(result.detectionMethod).toBe("retry");
    });

    it("gives up as unknown when no volume ever appears", async () => {
      usbManager.checkP6MassStorageMode.mockResolvedValue(null);

      const result = await detector.detectMode();

      expect(result.mode).toBe("unknown");
      expect(usbManager.checkP6MassStorageMode).toHaveBeenCalledTimes(4);
    });

    it("does not retry once the mode is known", async () => {
      usbManager.checkP6MassStorageMode.mockResolvedValue({
        path: "/Volumes/P-6",
        mode: "pattern_export",
      });

      const result = await detector.detectMode();

      expect(result.detectionMethod).toBe("direct");
      expect(usbManager.checkP6MassStorageMode).toHaveBeenCalledTimes(1);
    });
  });

  describe("getModeInstructions", () => {
    it("tells the user which button reaches the mode", () => {
      expect(detector.getModeInstructions("pattern_import")[0]).toContain("[REC]");
      expect(detector.getModeInstructions("sample_export")[0]).toMatch(/bank/i);
    });
  });
});
