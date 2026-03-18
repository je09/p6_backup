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

describe("ModeService.waitForMode", () => {
  it("resolves immediately when device already in required mode", async () => {
    const device = makeDevice("pattern_export");
    (device.retryModeDetection as jest.Mock).mockResolvedValue("pattern_export");
    const svc = new ModeService(device, 5000, 100);
    const result = await svc.waitForMode("pattern_export");
    expect(result.success).toBe(true);
    expect(result.finalMode).toBe("pattern_export");
    expect(result.timedOut).toBe(false);
  });

  it("times out when device never reaches required mode", async () => {
    const device = makeDevice("unknown");
    (device.retryModeDetection as jest.Mock).mockResolvedValue("unknown");
    const svc = new ModeService(device, 200, 50);
    const result = await svc.waitForMode("pattern_export");
    expect(result.success).toBe(false);
    expect(result.timedOut).toBe(true);
  });

  it("succeeds when device switches to required mode on second poll", async () => {
    const device = makeDevice("unknown");
    (device.retryModeDetection as jest.Mock)
      .mockResolvedValueOnce("unknown")
      .mockResolvedValueOnce("sample_export");
    const svc = new ModeService(device, 5000, 50);
    const result = await svc.waitForMode("sample_export");
    expect(result.success).toBe(true);
    expect(result.finalMode).toBe("sample_export");
  });
});
