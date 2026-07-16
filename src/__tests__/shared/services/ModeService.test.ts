import { ModeService } from "../../../shared/services/ModeService";
import { IDeviceConnection } from "../../../shared/services/interfaces";
import { DeviceMode, DeviceStatus } from "../../../shared/types/index";

function makeDevice(mode: DeviceMode): IDeviceConnection {
  return {
    getCurrentMode: () => mode,
    getStatus: () => ({ connected: true, mode } as DeviceStatus),
    isReady: jest.fn(),
    retryModeDetection: jest.fn(),
    getCurrentBanks: jest.fn(),
    getCurrentBank: jest.fn(),
    onStatusChanged: jest.fn(),
    readData: jest.fn(),
    writeData: jest.fn(),
  };
}

describe("ModeService.getOperationModeRequirement", () => {
  describe("pattern backup", () => {
    it("returns null when device is in pattern_export mode (correct for backup)", () => {
      const svc = new ModeService(makeDevice("pattern_export"));
      expect(svc.getOperationModeRequirement("pattern backup")).toBeNull();
    });

    it("returns requirement when device is in pattern_import mode", () => {
      const svc = new ModeService(makeDevice("pattern_import"));
      const req = svc.getOperationModeRequirement("pattern backup");
      expect(req).not.toBeNull();
      expect(req!.requiredMode).toBe("pattern_export");
      expect(req!.currentMode).toBe("pattern_import");
    });

    it("returns requirement when device is in sample_export mode", () => {
      const svc = new ModeService(makeDevice("sample_export"));
      const req = svc.getOperationModeRequirement("pattern backup");
      expect(req).not.toBeNull();
      expect(req!.requiredMode).toBe("pattern_export");
    });

    it("returns requirement when device is in unknown mode", () => {
      const svc = new ModeService(makeDevice("unknown"));
      const req = svc.getOperationModeRequirement("pattern backup");
      expect(req).not.toBeNull();
      expect(req!.requiredMode).toBe("pattern_export");
    });
  });

  describe("pattern restore", () => {
    it("returns null when device is in pattern_import mode (correct for restore)", () => {
      const svc = new ModeService(makeDevice("pattern_import"));
      expect(svc.getOperationModeRequirement("pattern restore")).toBeNull();
    });

    it("returns requirement when device is in pattern_export mode", () => {
      const svc = new ModeService(makeDevice("pattern_export"));
      const req = svc.getOperationModeRequirement("pattern restore");
      expect(req).not.toBeNull();
      expect(req!.requiredMode).toBe("pattern_import");
      expect(req!.currentMode).toBe("pattern_export");
    });
  });

  describe("sample backup", () => {
    it("returns null when device is in sample_export mode", () => {
      const svc = new ModeService(makeDevice("sample_export"));
      expect(svc.getOperationModeRequirement("sample backup")).toBeNull();
    });

    it("returns requirement when device is in sample_import mode", () => {
      const svc = new ModeService(makeDevice("sample_import"));
      const req = svc.getOperationModeRequirement("sample backup");
      expect(req).not.toBeNull();
      expect(req!.requiredMode).toBe("sample_export");
    });

    it("returns requirement when device is in pattern_export mode", () => {
      const svc = new ModeService(makeDevice("pattern_export"));
      const req = svc.getOperationModeRequirement("sample backup");
      expect(req).not.toBeNull();
      expect(req!.requiredMode).toBe("sample_export");
    });
  });

  describe("sample restore", () => {
    it("returns null when device is in sample_import mode", () => {
      const svc = new ModeService(makeDevice("sample_import"));
      expect(svc.getOperationModeRequirement("sample restore")).toBeNull();
    });

    it("returns requirement when device is in sample_export mode", () => {
      const svc = new ModeService(makeDevice("sample_export"));
      const req = svc.getOperationModeRequirement("sample restore");
      expect(req).not.toBeNull();
      expect(req!.requiredMode).toBe("sample_import");
    });
  });

  describe("unknown operations", () => {
    it("returns null for unknown operation names", () => {
      const svc = new ModeService(makeDevice("unknown"));
      expect(svc.getOperationModeRequirement("nonexistent op")).toBeNull();
    });
  });
});

