/**
 * @jest-environment jsdom
 */
/**
 * Restore driven through the real UI against a simulated P-6.
 *
 * The other restore tests assert on mock call counts, which cannot tell whether
 * the device would have accepted the transfer. Here the fake enforces what the
 * hardware enforces — the operation's required mode, and a byte budget per
 * power-on session — so pushing too much in one session fails the way a real
 * P-6 fails, and the batching is checked against the constraint it exists for.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { RestoreSection } from "../../renderer/components/RestoreSection";
import { SnackbarProvider } from "../../renderer/context/SnackbarContext";
import { DeviceStatus } from "../../shared/types/index";
import { FakeP6, P6Mode, FakeBackup } from "../helpers/FakeP6";
import { fakeElectronApi } from "../helpers/fakeElectronApi";

jest.mock("../../renderer/utils/logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));
jest.mock("../../renderer/components/Snackbar", () => ({ Snackbar: () => null }));
jest.mock("../../renderer/components/ModeSwitchModal", () => ({
  ModeSwitchModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="mode-switch-modal" /> : null,
}));

let mockSelection: any;
jest.mock("../../renderer/components/RestoreSelectionModal", () => ({
  RestoreSelectionModal: ({
    isOpen,
    onConfirm,
  }: {
    isOpen: boolean;
    onConfirm: (s: any) => void;
  }) =>
    isOpen ? (
      <button data-testid="confirm-selection" onClick={() => onConfirm(mockSelection)}>
        Confirm
      </button>
    ) : null,
}));

const MB = 1024 * 1024;
const BACKUP_PATH = "/backups/session-test";

const BACKUP: FakeBackup = {
  patternIds: ["1-1", "1-2"],
  samples: {
    A: { bytes: 6 * MB, count: 3 },
    B: { bytes: 6 * MB, count: 3 },
    C: { bytes: 6 * MB, count: 3 },
  },
};

function makeStatus(mode: string, connected = true): DeviceStatus {
  return {
    connected,
    mode: mode as any,
    connectionType: "usb",
    firmwareVersion: "",
    deviceId: "",
    lastSeen: null,
  };
}

describe("restore against a simulated P-6", () => {
  let p6: FakeP6;

  const view = (mode: string, connected = true) => (
    <SnackbarProvider>
      <RestoreSection
        deviceStatus={makeStatus(mode, connected)}
        onRestoreComplete={jest.fn()}
      />
    </SnackbarProvider>
  );

  /** Power cycle the device into `mode`, and tell the UI what it now sees. */
  async function powerCycleInto(
    rerender: (ui: React.ReactElement) => void,
    mode: P6Mode
  ) {
    p6.powerOff();
    rerender(view("unknown", false));
    await waitFor(() =>
      expect(screen.queryByText("Waiting for device to power off…")).toBeNull()
    );
    p6.powerOnInto(mode);
    rerender(view(mode));
  }

  async function startRestore(mode: P6Mode) {
    p6.powerOnInto(mode);
    const { rerender } = render(view(mode));

    await waitFor(() => expect(screen.getByText("session-test")).not.toBeNull());
    fireEvent.dblClick(screen.getByText("session-test"));
    await waitFor(() =>
      expect(screen.queryByTestId("confirm-selection")).not.toBeNull()
    );
    fireEvent.click(screen.getByTestId("confirm-selection"));

    await waitFor(() => expect(screen.queryByText("Confirm Restore")).not.toBeNull());
    const dialog = screen.getByText("Confirm Restore").closest(".modal-contents") as HTMLElement;
    await act(async () => {
      fireEvent.click(within(dialog).getByText("Restore"));
    });
    return { rerender };
  }

  beforeEach(() => {
    p6 = new FakeP6();
    (window as any).electronAPI = fakeElectronApi(p6, { [BACKUP_PATH]: BACKUP });
    mockSelection = {
      includePatterns: false,
      includeSamples: true,
      selectedPatterns: [],
      selectedSampleBanks: ["A", "B", "C"],
      selectedSamples: {},
      bankSizes: { A: 6 * MB, B: 6 * MB, C: 6 * MB },
    };
  });

  it("never exceeds what the device accepts in one session", async () => {
    const { rerender } = await startRestore("sample_import");

    // 18 MB of banks cannot land in one power-on session.
    await waitFor(() => expect(p6.imported.banks).toEqual(["A"]));
    expect(p6.bytesUsedThisSession).toBeLessThanOrEqual(p6.sessionByteLimit);
    expect(screen.queryByText("Restore Failed")).toBeNull();

    await powerCycleInto(rerender, "sample_import");
    await waitFor(() =>
      expect(screen.queryByText("Continue Restore (Next Batch)")).not.toBeNull()
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Continue Restore (Next Batch)"));
    });

    await waitFor(() => expect(p6.imported.banks).toEqual(["A", "B"]));
    expect(p6.bytesUsedThisSession).toBeLessThanOrEqual(p6.sessionByteLimit);
  });

  it("lands every selected bank exactly once across the power cycles", async () => {
    const { rerender } = await startRestore("sample_import");

    for (let i = 0; i < 2; i++) {
      await powerCycleInto(rerender, "sample_import");
      await waitFor(() =>
        expect(screen.queryByText("Continue Restore (Next Batch)")).not.toBeNull()
      );
      await act(async () => {
        fireEvent.click(screen.getByText("Continue Restore (Next Batch)"));
      });
    }

    await waitFor(() => expect(screen.queryByText("Restore Complete")).not.toBeNull());
    expect(p6.imported.banks).toEqual(["A", "B", "C"]);
  });

  it("is refused by the device when the mode is wrong", async () => {
    mockSelection = { ...mockSelection, includePatterns: true, includeSamples: false };

    // Powered into sample import, but the user asked for a pattern restore.
    await startRestore("sample_import");

    await waitFor(() =>
      expect(screen.queryByTestId("mode-switch-modal")).not.toBeNull()
    );
    expect(p6.imported.patterns).toEqual([]);
  });

  it("restores patterns and samples across the modes each one needs", async () => {
    mockSelection = {
      ...mockSelection,
      includePatterns: true,
      selectedSampleBanks: ["A"],
      bankSizes: { A: 6 * MB },
    };

    // Starting in pattern import means patterns go first, samples after a cycle.
    const { rerender } = await startRestore("pattern_import");
    await waitFor(() => expect(p6.imported.patterns).toEqual(["1-1", "1-2"]));

    await powerCycleInto(rerender, "sample_import");
    await waitFor(() =>
      expect(screen.queryByText("Continue Restore (Next Batch)")).not.toBeNull()
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Continue Restore (Next Batch)"));
    });

    await waitFor(() => expect(p6.imported.banks).toEqual(["A"]));
    await waitFor(() => expect(screen.queryByText("Restore Complete")).not.toBeNull());
  });

  it("surfaces a device refusal rather than reporting success", async () => {
    // A device that accepts almost nothing refuses even a single bank.
    p6 = new FakeP6({ sessionByteLimit: 1024 });
    (window as any).electronAPI = fakeElectronApi(p6, { [BACKUP_PATH]: BACKUP });
    mockSelection = { ...mockSelection, selectedSampleBanks: ["A"], bankSizes: { A: 6 * MB } };

    await startRestore("sample_import");

    await waitFor(() => expect(screen.queryByText("Restore Failed")).not.toBeNull());
    expect(screen.queryByText(/Import session limit exceeded/)).not.toBeNull();
    expect(p6.imported.banks).toEqual([]);
  });
});
