/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import { useBackupOrchestration } from "../../../renderer/hooks/useBackupOrchestration";
import { DeviceStatus } from "../../../shared/types/index";

jest.mock("../../../renderer/utils/logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

const BASE_BACKUP_RESULT = {
  success: true,
  itemCount: 2,
  backupPath: "/tmp/backup",
  message: "ok",
  type: "backup" as any,
  timestamp: new Date(),
};

function makeStatus(mode = "pattern_export"): DeviceStatus {
  return {
    connected: true,
    mode: mode as any,
    connectionType: "usb",
    firmwareVersion: "",
    deviceId: "",
    lastSeen: null,
  };
}

function makeProps(deviceStatus = makeStatus()) {
  return {
    deviceStatus,
    onBackupComplete: jest.fn(),
    showSnackbar: jest.fn(),
    log: {
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    } as any,
  };
}

beforeEach(() => {
  (window as any).electronAPI = {
    backupPatterns: jest.fn().mockResolvedValue({ ...BASE_BACKUP_RESULT }),
    backupSamples: jest.fn().mockResolvedValue({ ...BASE_BACKUP_RESULT }),
    organizeBackup: jest.fn().mockResolvedValue({ ...BASE_BACKUP_RESULT }),
    ejectDevice: jest.fn().mockResolvedValue(true),
    getCurrentBank: jest.fn().mockResolvedValue(null),
    getCurrentBanks: jest.fn().mockResolvedValue(null),
  };
});

// ─── startBackup ─────────────────────────────────────────────────────────────

describe("startBackup", () => {
  it("shows guide and sets patterns mode when initialMode is patterns", () => {
    const { result } = renderHook(() => useBackupOrchestration(makeProps()));

    act(() => {
      result.current.startBackup(["a", "b"], "patterns");
    });

    expect(result.current.showBackupGuide).toBe(true);
    expect(result.current.backupMode).toBe("patterns");
    expect(result.current.bankQueue).toEqual(["a", "b"]);
    expect(result.current.currentBankIndex).toBe(0);
  });

  it("shows guide and sets samples mode when initialMode is samples", () => {
    const { result } = renderHook(() => useBackupOrchestration(makeProps()));

    act(() => {
      result.current.startBackup(["a", "b"], "samples");
    });

    expect(result.current.showBackupGuide).toBe(true);
    expect(result.current.backupMode).toBe("samples");
  });

  it("throws when initialMode is samples but queue is empty", () => {
    const { result } = renderHook(() => useBackupOrchestration(makeProps()));

    expect(() => {
      act(() => {
        result.current.startBackup([], "samples");
      });
    }).toThrow("No banks selected");
  });
});

// ─── handleContinue — patterns stage ─────────────────────────────────────────

describe("handleContinue — patterns stage", () => {
  it("calls backupPatterns and transitions to samples mode", async () => {
    const props = makeProps(makeStatus("pattern_export"));
    const { result } = renderHook(() => useBackupOrchestration(props));

    act(() => {
      result.current.startBackup(["a", "b"], "patterns");
    });

    await act(async () => {
      await result.current.handleContinue();
    });

    expect((window as any).electronAPI.backupPatterns).toHaveBeenCalled();
    expect(result.current.backupMode).toBe("samples");
    expect(result.current.showBackupGuide).toBe(true);
  });

  it("shows error when device is not connected", async () => {
    const props = makeProps({ ...makeStatus(), connected: false });
    const { result } = renderHook(() => useBackupOrchestration(props));

    act(() => {
      result.current.startBackup(["a"], "patterns");
    });

    await act(async () => {
      await result.current.handleContinue();
    });

    expect(props.showSnackbar).toHaveBeenCalledWith(
      expect.stringContaining("disconnected"),
      "error"
    );
    expect(result.current.showBackupGuide).toBe(false);
  });

  it("shows error when device is in wrong mode for patterns", async () => {
    const props = makeProps(makeStatus("sample_export"));
    const { result } = renderHook(() => useBackupOrchestration(props));

    act(() => {
      result.current.startBackup(["a"], "patterns");
    });

    await act(async () => {
      await result.current.handleContinue();
    });

    expect((window as any).electronAPI.backupPatterns).not.toHaveBeenCalled();
    expect(props.showSnackbar).toHaveBeenCalledWith(
      expect.stringContaining("Wrong mode"),
      "error"
    );
  });

  it("completes without samples stage when queue is empty", async () => {
    const props = makeProps(makeStatus("pattern_export"));
    const { result } = renderHook(() => useBackupOrchestration(props));

    // patterns-only: no bank queue
    act(() => {
      result.current.startBackup([], "patterns");
    });

    await act(async () => {
      await result.current.handleContinue();
    });

    expect((window as any).electronAPI.backupPatterns).toHaveBeenCalled();
    expect((window as any).electronAPI.organizeBackup).toHaveBeenCalled();
    expect(result.current.showBackupGuide).toBe(false);
    expect(props.onBackupComplete).toHaveBeenCalled();
  });
});

// ─── handleContinue — samples stage ──────────────────────────────────────────

describe("handleContinue — samples stage", () => {
  async function setupAfterPatterns(banks: string[]) {
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof makeProps>) => useBackupOrchestration(props),
      { initialProps: makeProps(makeStatus("pattern_export")) }
    );

    act(() => {
      result.current.startBackup(banks, "patterns");
    });

    // complete patterns stage
    await act(async () => {
      await result.current.handleContinue();
    });

    // switch device to sample mode
    rerender(makeProps(makeStatus("sample_export")));

    return { result, rerender };
  }

  it("calls backupSamples with the current bank", async () => {
    const { result } = await setupAfterPatterns(["a", "b"]);

    await act(async () => {
      await result.current.handleContinue();
    });

    expect((window as any).electronAPI.backupSamples).toHaveBeenCalledWith(
      "a",
      undefined,
      undefined
    );
  });

  it("advances to next bank after backing up current bank", async () => {
    const { result } = await setupAfterPatterns(["a", "b"]);

    await act(async () => {
      await result.current.handleContinue();
    });

    expect(result.current.currentBankIndex).toBe(1);
    expect(result.current.showBackupGuide).toBe(true);
  });

  it("calls organizeBackup after last bank is done", async () => {
    const { result } = await setupAfterPatterns(["a"]);

    await act(async () => {
      await result.current.handleContinue();
    });

    expect((window as any).electronAPI.organizeBackup).toHaveBeenCalledWith(
      expect.objectContaining({ includePatterns: true, includeSamples: true })
    );
    expect(result.current.showBackupGuide).toBe(false);
  });

  it("shows error when device is in wrong mode for samples", async () => {
    const wrongProps = makeProps(makeStatus("pattern_export"));
    const { result } = renderHook(() => useBackupOrchestration(wrongProps));

    act(() => {
      result.current.startBackup(["a"], "samples");
    });

    await act(async () => {
      await result.current.handleContinue();
    });

    expect(wrongProps.showSnackbar).toHaveBeenCalledWith(
      expect.stringContaining("Wrong mode"),
      "error"
    );
    expect((window as any).electronAPI.backupSamples).not.toHaveBeenCalled();
  });
});

// ─── handleCancel ─────────────────────────────────────────────────────────────

describe("handleCancel", () => {
  it("resets all orchestration state", () => {
    const { result } = renderHook(() => useBackupOrchestration(makeProps()));

    act(() => {
      result.current.startBackup(["a", "b"], "patterns");
    });

    expect(result.current.showBackupGuide).toBe(true);

    act(() => {
      result.current.handleCancel();
    });

    expect(result.current.showBackupGuide).toBe(false);
    expect(result.current.backupMode).toBeNull();
    expect(result.current.bankQueue).toEqual([]);
    expect(result.current.currentBankIndex).toBe(0);
  });
});
