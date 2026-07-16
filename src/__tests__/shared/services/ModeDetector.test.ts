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
      logLevel: "error",
    });
  });

  describe("detectModeQuick", () => {
    it("returns unknown when no mass storage device found", async () => {
      usbManager.checkP6MassStorageMode.mockResolvedValue(null);
      const result = await detector.detectModeQuick();
      expect(result.mode).toBe("unknown");
      expect(result.confidence).toBe("low");
    });

    it("returns pattern_export when device has BACKUP folder", async () => {
      usbManager.checkP6MassStorageMode.mockResolvedValue({
        path: "/Volumes/P-6",
        mode: "pattern_export",
      });
      const result = await detector.detectModeQuick();
      expect(result.mode).toBe("pattern_export");
      expect(result.confidence).toBe("high");
    });

    it("returns pattern_import when device has RESTORE folder", async () => {
      usbManager.checkP6MassStorageMode.mockResolvedValue({
        path: "/Volumes/P-6",
        mode: "pattern_import",
      });
      const result = await detector.detectModeQuick();
      expect(result.mode).toBe("pattern_import");
    });

    it("returns sample_export when device has EXPORT folder", async () => {
      usbManager.checkP6MassStorageMode.mockResolvedValue({
        path: "/Volumes/P-6",
        mode: "sample_export",
        banks: ["A", "B"],
        currentBank: "A",
      });
      const result = await detector.detectModeQuick();
      expect(result.mode).toBe("sample_export");
    });

    it("returns sample_import when device has IMPORT folder", async () => {
      usbManager.checkP6MassStorageMode.mockResolvedValue({
        path: "/Volumes/P-6",
        mode: "sample_import",
      });
      const result = await detector.detectModeQuick();
      expect(result.mode).toBe("sample_import");
    });

    it("stores massStorageInfo in the result", async () => {
      const info = { path: "/Volumes/P-6", mode: "pattern_export", banks: ["A"] };
      usbManager.checkP6MassStorageMode.mockResolvedValue(info);
      const result = await detector.detectModeQuick();
      expect(result.massStorageInfo).toBe(info);
    });

    it("returns unknown when mass storage mode is 'unknown'", async () => {
      usbManager.checkP6MassStorageMode.mockResolvedValue({
        path: "/Volumes/P-6",
        mode: "unknown",
      });
      const result = await detector.detectModeQuick();
      expect(result.mode).toBe("unknown");
    });
  });

  describe("getModeInstructions", () => {
    it("returns instructions for pattern mode", () => {
      const instructions = detector.getModeInstructions("pattern");
      expect(instructions.length).toBeGreaterThan(0);
    });

    it("returns instructions for sample_export mode", () => {
      const instructions = detector.getModeInstructions("sample_export");
      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions[0]).toMatch(/bank/i);
    });

    it("returns fallback instructions for unknown mode", () => {
      const instructions = detector.getModeInstructions("unknown");
      expect(instructions.length).toBeGreaterThan(0);
    });
  });
});
