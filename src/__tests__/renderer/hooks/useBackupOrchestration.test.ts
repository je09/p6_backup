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

  it("reports an error and skips the guide when initialMode is samples but queue is empty", () => {
    const props = makeProps();
    const { result } = renderHook(() => useBackupOrchestration(props));

    act(() => {
      result.current.startBackup([], "samples");
    });

    expect(props.showSnackbar).toHaveBeenCalledWith(
      "No banks selected for backup",
      "error"
    );
    expect(result.current.showBackupGuide).toBe(false);
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
      expect.stringMatching(/must be in a (pattern|sample) mode/i),
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

    const options = (window as any).electronAPI.organizeBackup.mock.calls[0][0];
    expect(options.precompletedResults.map((s: any) => s.type)).toEqual([
      "patterns",
      "samples",
    ]);
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
      expect.stringMatching(/must be in a (pattern|sample) mode/i),
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

// ─── multi-stage progression ─────────────────────────────────────────────────

const API = () => (window as any).electronAPI;

/**
 * Props whose callbacks survive a rerender, the way App passes them. Rebuilding
 * them per rerender would hand each stage a fresh spy to report through.
 */
function makeStableProps() {
  const showSnackbar = jest.fn();
  const onBackupComplete = jest.fn();
  const log = {
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  } as any;
  const build = (deviceStatus = makeStatus()) => ({
    deviceStatus,
    onBackupComplete,
    showSnackbar,
    log,
  });
  return { build, showSnackbar, onBackupComplete };
}

/** Drive the guide from the patterns stage through every queued bank. */
async function runFullBackup(banks: string[]) {
  const props = makeStableProps();
  const { result, rerender } = renderHook(
    (p: ReturnType<typeof props.build>) => useBackupOrchestration(p),
    { initialProps: props.build(makeStatus("pattern_export")) }
  );

  act(() => {
    result.current.startBackup(banks, "patterns", "my-backup");
  });
  await act(async () => {
    await result.current.handleContinue();
  });

  rerender(props.build(makeStatus("sample_export")));
  for (let i = 0; i < banks.length; i++) {
    await act(async () => {
      await result.current.handleContinue();
    });
  }
  return { result, props };
}

describe("multi-stage backup — patterns then every bank in turn", () => {
  it("backs up each bank once, in queue order", async () => {
    const { result } = await runFullBackup(["a", "b", "c"]);

    const banksBackedUp = API().backupSamples.mock.calls.map(
      (c: any[]) => c[0]
    );
    expect(banksBackedUp).toEqual(["a", "b", "c"]);
    expect(API().backupPatterns).toHaveBeenCalledTimes(1);
    expect(result.current.showBackupGuide).toBe(false);
  });

  it("organizes once at the end with every stage result", async () => {
    await runFullBackup(["a", "b", "c"]);

    expect(API().organizeBackup).toHaveBeenCalledTimes(1);
    const options = API().organizeBackup.mock.calls[0][0];
    expect(options).toMatchObject({ customName: "my-backup" });
    // The stage results are the record of what was captured, in the order the
    // device sessions ran: patterns first, then one session per bank.
    expect(options.precompletedResults).toHaveLength(4);
    expect(options.precompletedResults.map((s: any) => s.type)).toEqual([
      "patterns", "samples", "samples", "samples",
    ]);
    expect(
      options.precompletedResults
        .filter((s: any) => s.type === "samples")
        .map((s: any) => s.bank)
    ).toEqual(["a", "b", "c"]);
  });

  it("ejects between every stage so the user can switch banks", async () => {
    await runFullBackup(["a", "b"]);

    // one eject per stage (patterns, bank a, bank b) plus one on completion
    expect(API().ejectDevice).toHaveBeenCalledTimes(4);
  });

  it("completes without a samples stage when no banks are queued", async () => {
    const { result } = renderHook(() =>
      useBackupOrchestration(makeProps(makeStatus("pattern_export")))
    );

    act(() => {
      result.current.startBackup([], "patterns");
    });
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(API().backupSamples).not.toHaveBeenCalled();
    const options = API().organizeBackup.mock.calls[0][0];
    expect(options.precompletedResults.map((s: any) => s.type)).toEqual([
      "patterns",
    ]);
    expect(result.current.showBackupGuide).toBe(false);
  });

  it("passes the selected patterns and per-bank pads through to the device", async () => {
    const props = makeProps(makeStatus("pattern_export"));
    const { result, rerender } = renderHook(
      (p: ReturnType<typeof makeProps>) => useBackupOrchestration(p),
      { initialProps: props }
    );

    act(() => {
      result.current.startBackup(["a"], "patterns", undefined, ["1-1", "1-2"], {
        A: [1, 3],
      });
    });
    await act(async () => {
      await result.current.handleContinue();
    });
    rerender(makeProps(makeStatus("sample_export")));
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(API().backupPatterns).toHaveBeenCalledWith(undefined, ["1-1", "1-2"]);
    expect(API().backupSamples).toHaveBeenCalledWith("a", undefined, [1, 3]);
  });
});

describe("multi-stage backup — a failing stage stops the run", () => {
  it("aborts and reports when the pattern stage fails", async () => {
    const props = makeProps(makeStatus("pattern_export"));
    API().backupPatterns.mockResolvedValue({
      ...BASE_BACKUP_RESULT,
      success: false,
      message: "device busy",
    });
    const { result } = renderHook(() => useBackupOrchestration(props));

    act(() => {
      result.current.startBackup(["a"], "patterns");
    });
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(props.showSnackbar).toHaveBeenCalledWith(
      expect.stringContaining("device busy"),
      "error"
    );
    expect(API().backupSamples).not.toHaveBeenCalled();
    expect(result.current.showBackupGuide).toBe(false);
  });

  it("aborts and reports when a bank fails, without organizing", async () => {
    API().backupSamples.mockResolvedValue({
      ...BASE_BACKUP_RESULT,
      success: false,
      message: "bank read error",
    });
    const props = makeProps(makeStatus("pattern_export"));
    const { result, rerender } = renderHook(
      (p: ReturnType<typeof makeProps>) => useBackupOrchestration(p),
      { initialProps: props }
    );

    act(() => {
      result.current.startBackup(["a", "b"], "patterns");
    });
    await act(async () => {
      await result.current.handleContinue();
    });
    rerender(makeProps(makeStatus("sample_export")));
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(API().organizeBackup).not.toHaveBeenCalled();
    expect(result.current.showBackupGuide).toBe(false);
  });

  it("reports when the device disconnects mid-run", async () => {
    const props = makeProps(makeStatus("pattern_export"));
    const { result, rerender } = renderHook(
      (p: ReturnType<typeof makeProps>) => useBackupOrchestration(p),
      { initialProps: props }
    );

    act(() => {
      result.current.startBackup(["a"], "patterns");
    });

    const disconnected = makeProps({ ...makeStatus("pattern_export"), connected: false });
    rerender(disconnected);
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(disconnected.showSnackbar).toHaveBeenCalledWith(
      "Device disconnected",
      "error"
    );
    expect(API().backupPatterns).not.toHaveBeenCalled();
  });
});

describe("multi-stage backup — bank verification before writing", () => {
  it("refuses to back up when the device is on a different bank", async () => {
    API().getCurrentBank.mockResolvedValue("c");
    const props = makeProps(makeStatus("sample_export"));
    const { result } = renderHook(() => useBackupOrchestration(props));

    act(() => {
      result.current.startBackup(["a"], "samples");
    });
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(props.showSnackbar).toHaveBeenCalledWith(
      expect.stringMatching(/currently set to bank/i),
      "error"
    );
    expect(API().backupSamples).not.toHaveBeenCalled();
  });

  it("refuses to back up a bank the device does not report", async () => {
    API().getCurrentBanks.mockResolvedValue(["b", "c"]);
    const props = makeProps(makeStatus("sample_export"));
    const { result } = renderHook(() => useBackupOrchestration(props));

    act(() => {
      result.current.startBackup(["a"], "samples");
    });
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(props.showSnackbar).toHaveBeenCalledWith(
      expect.stringContaining("not available"),
      "error"
    );
    expect(API().backupSamples).not.toHaveBeenCalled();
  });

  it("proceeds when the bank cannot be verified at all", async () => {
    API().getCurrentBank.mockRejectedValue(new Error("descriptor timeout"));
    const props = makeProps(makeStatus("sample_export"));
    const { result } = renderHook(() => useBackupOrchestration(props));

    act(() => {
      result.current.startBackup(["a"], "samples");
    });
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(API().backupSamples).toHaveBeenCalledWith("a", undefined, undefined);
  });

  it("matches the selected bank case-insensitively", async () => {
    API().getCurrentBank.mockResolvedValue("A");
    API().getCurrentBanks.mockResolvedValue(["A", "B"]);
    const props = makeProps(makeStatus("sample_export"));
    const { result } = renderHook(() => useBackupOrchestration(props));

    act(() => {
      result.current.startBackup(["a"], "samples");
    });
    await act(async () => {
      await result.current.handleContinue();
    });

    expect(API().backupSamples).toHaveBeenCalledWith("a", undefined, undefined);
    expect(props.showSnackbar).not.toHaveBeenCalledWith(
      expect.stringMatching(/currently set to bank/i),
      "error"
    );
  });
});

describe("multi-stage backup — eject and organize failures", () => {
  it("keeps going and warns when the device will not eject", async () => {
    API().ejectDevice.mockResolvedValue(false);
    const { result, props } = await runFullBackup(["a"]);

    expect(props.showSnackbar).toHaveBeenCalledWith(
      "Device eject failed",
      "warning"
    );
    expect(API().organizeBackup).toHaveBeenCalledTimes(1);
    expect(result.current.showBackupGuide).toBe(false);
  });

  it("keeps going and warns when ejecting throws", async () => {
    API().ejectDevice.mockRejectedValue(new Error("diskutil busy"));
    const { props } = await runFullBackup(["a"]);

    expect(props.showSnackbar).toHaveBeenCalledWith(
      "Device eject failed",
      "warning"
    );
    expect(API().organizeBackup).toHaveBeenCalledTimes(1);
  });

  it("reports an unsuccessful organize", async () => {
    API().organizeBackup.mockResolvedValue({
      ...BASE_BACKUP_RESULT,
      success: false,
      message: "no space left",
    });
    const { props } = await runFullBackup(["a"]);

    expect(props.showSnackbar).toHaveBeenCalledWith("no space left", "error");
  });

  it("reports a thrown organize and hides the guide", async () => {
    API().organizeBackup.mockRejectedValue(new Error("manifest write failed"));
    const { result, props } = await runFullBackup(["a"]);

    expect(props.showSnackbar).toHaveBeenCalledWith(
      "manifest write failed",
      "error"
    );
    expect(result.current.showBackupGuide).toBe(false);
  });
});
