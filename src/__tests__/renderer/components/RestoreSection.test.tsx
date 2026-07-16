/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { RestoreSection } from "../../../renderer/components/RestoreSection";
import { SnackbarProvider } from "../../../renderer/context/SnackbarContext";
import { DeviceStatus } from "../../../shared/types/index";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../../../renderer/utils/logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

jest.mock("../../../renderer/components/Snackbar", () => ({
  Snackbar: () => null,
}));

// ModeSwitchModal — render a detectable element when open
jest.mock("../../../renderer/components/ModeSwitchModal", () => ({
  ModeSwitchModal: ({ isOpen, operation }: { isOpen: boolean; operation: string }) =>
    isOpen ? <div data-testid="mode-switch-modal">{operation}</div> : null,
}));

// RestoreSelectionModal — expose a button that fires onConfirm with preset selection
jest.mock("../../../renderer/components/RestoreSelectionModal", () => ({
  RestoreSelectionModal: ({
    isOpen,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    onConfirm: (s: any) => void;
    onCancel: () => void;
    selection?: any;
  }) =>
    isOpen ? (
      <div>
        <button
          data-testid="confirm-patterns-and-samples"
          onClick={() =>
            onConfirm({
              includePatterns: true,
              includeSamples: true,
              selectedPatterns: [],
              selectedSampleBanks: ["A"],
              selectedSamples: {},
              bankSizes: { A: 0 },
            })
          }
        >
          Confirm Both
        </button>
        <button data-testid="cancel-modal" onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_BACKUP = {
  path: "/backups/backup-2024-01",
  name: "backup-2024-01",
  type: "backup" as const,
  timestamp: new Date("2024-01-01"),
  size: 1024,
  itemCount: 5,
  hasPatterns: true,
  hasSamples: true,
  sampleBanks: ["A"],
  description: "",
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

function setupElectronAPI(overrides: Partial<Record<string, jest.Mock>> = {}) {
  (window as any).electronAPI = {
    discoverBackups: jest.fn().mockResolvedValue([MOCK_BACKUP]),
    restorePatterns: jest.fn().mockResolvedValue({ success: true, message: "ok", itemCount: 3, type: "backup", timestamp: new Date() }),
    restoreSamples: jest.fn().mockResolvedValue({ success: true, message: "ok", itemCount: 2, type: "backup", timestamp: new Date() }),
    checkModeRequirement: jest.fn().mockResolvedValue(null),
    waitForMode: jest.fn().mockResolvedValue({ success: true, finalMode: "sample_import", timedOut: false }),
    onFileCopySuccess: jest.fn(),
    removeAllListeners: jest.fn(),
    ...overrides,
  };
}

/**
 * Render RestoreSection, confirm the mock selection modal, and return `rerender`
 * so individual tests can simulate device disconnect/reconnect.
 *
 * After confirming, the component enters a pending state gated by
 * `requiresDeviceDisconnect`. Tests must call `simulateDeviceCycle` to clear
 * that gate before the "Continue" buttons become clickable.
 */
async function openAndConfirmRestore(
  mode: string,
  apiOverrides: Partial<Record<string, jest.Mock>> = {}
) {
  setupElectronAPI(apiOverrides);
  const { rerender } = render(
    <SnackbarProvider>
      <RestoreSection deviceStatus={makeStatus(mode)} onRestoreComplete={jest.fn()} />
    </SnackbarProvider>
  );

  await waitFor(() => expect(screen.getByText("backup-2024-01")).not.toBeNull());
  fireEvent.dblClick(screen.getByText("backup-2024-01"));
  await waitFor(() => expect(screen.queryByTestId("confirm-patterns-and-samples")).not.toBeNull());
  fireEvent.click(screen.getByTestId("confirm-patterns-and-samples"));

  // Selecting content raises an overwrite confirmation before anything is written.
  await waitFor(() => expect(screen.queryByText("Confirm Restore")).not.toBeNull());
  const confirmDialog = screen.getByText("Confirm Restore").closest(
    ".modal-contents"
  ) as HTMLElement;
  fireEvent.click(within(confirmDialog).getByText("Restore"));

  return { rerender };
}

/** Simulate device power-off → power-on in a new mode to clear requiresDeviceDisconnect. */
async function simulateDeviceCycle(
  rerender: ReturnType<typeof render>["rerender"],
  reconnectMode: string
) {
  rerender(
    <SnackbarProvider>
      <RestoreSection deviceStatus={makeStatus("unknown", false)} onRestoreComplete={jest.fn()} />
    </SnackbarProvider>
  );
  // Allow effects to run (requiresDeviceDisconnect → false)
  await waitFor(() =>
    expect(screen.queryByText("Waiting for device to power off…")).toBeNull()
  );
  rerender(
    <SnackbarProvider>
      <RestoreSection deviceStatus={makeStatus(reconnectMode)} onRestoreComplete={jest.fn()} />
    </SnackbarProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RestoreSection — mode check before next batch sample restore", () => {
  it("shows mode switch modal instead of calling restoreSamples when device is in wrong mode", async () => {
    const restoreSamples = jest.fn();

    const { rerender } = await openAndConfirmRestore("pattern_import", {
      restorePatterns: jest.fn().mockResolvedValue({
        success: true, message: "patterns ok", itemCount: 3, type: "backup", timestamp: new Date(),
      }),
      restoreSamples,
      checkModeRequirement: jest.fn().mockImplementation(async (op: string) => {
        if (op === "sample restore") {
          return { currentMode: "pattern_import", requiredMode: "sample_import" };
        }
        return null;
      }),
    });

    // Pattern restore completes → pending overlay appears with disconnect gate
    await waitFor(() =>
      expect(screen.queryByText("Waiting for device to power off…")).not.toBeNull()
    );

    // Simulate device power-off → reconnect in sample_import mode
    await simulateDeviceCycle(rerender, "sample_import");

    await waitFor(() =>
      expect(screen.queryByText("Continue Restore (Next Batch)")).not.toBeNull()
    );
    fireEvent.click(screen.getByText("Continue Restore (Next Batch)"));

    // Device is in wrong mode → mode switch modal should appear
    await waitFor(() =>
      expect(screen.queryByTestId("mode-switch-modal")).not.toBeNull()
    );
    expect(restoreSamples).not.toHaveBeenCalled();
  });

  it("calls restoreSamples when device is already in sample_import mode", async () => {
    const restoreSamples = jest.fn().mockResolvedValue({
      success: true, message: "samples ok", itemCount: 2, type: "backup", timestamp: new Date(),
    });

    const { rerender } = await openAndConfirmRestore("pattern_import", {
      restorePatterns: jest.fn().mockResolvedValue({
        success: true, message: "patterns ok", itemCount: 3, type: "backup", timestamp: new Date(),
      }),
      restoreSamples,
      checkModeRequirement: jest.fn().mockResolvedValue(null),
    });

    await waitFor(() =>
      expect(screen.queryByText("Waiting for device to power off…")).not.toBeNull()
    );
    await simulateDeviceCycle(rerender, "sample_import");

    await waitFor(() =>
      expect(screen.queryByText("Continue Restore (Next Batch)")).not.toBeNull()
    );
    fireEvent.click(screen.getByText("Continue Restore (Next Batch)"));

    await waitFor(() => expect(restoreSamples).toHaveBeenCalled());
    expect(screen.queryByTestId("mode-switch-modal")).toBeNull();
  });
});

describe("RestoreSection — mode check before pending pattern restore", () => {
  it("shows mode switch modal instead of calling restorePatterns when device is in wrong mode", async () => {
    const restorePatterns = jest.fn();

    const { rerender } = await openAndConfirmRestore("sample_import", {
      restoreSamples: jest.fn().mockResolvedValue({
        success: true, message: "samples ok", itemCount: 2, type: "backup", timestamp: new Date(),
      }),
      restorePatterns,
      checkModeRequirement: jest.fn().mockImplementation(async (op: string) => {
        if (op === "pattern restore") {
          return { currentMode: "sample_import", requiredMode: "pattern_import" };
        }
        return null;
      }),
    });

    // Sample restore completes → pending pattern restore queued, disconnect gate active
    await waitFor(() =>
      expect(screen.queryByText("Waiting for device to power off…")).not.toBeNull()
    );
    await simulateDeviceCycle(rerender, "pattern_import");

    await waitFor(() =>
      expect(screen.queryByText("Continue — Restore Patterns")).not.toBeNull()
    );
    fireEvent.click(screen.getByText("Continue — Restore Patterns"));

    await waitFor(() =>
      expect(screen.queryByTestId("mode-switch-modal")).not.toBeNull()
    );
    expect(restorePatterns).not.toHaveBeenCalled();
  });

  it("calls restorePatterns when device is already in pattern_import mode", async () => {
    const restorePatterns = jest.fn().mockResolvedValue({
      success: true, message: "patterns ok", itemCount: 3, type: "backup", timestamp: new Date(),
    });

    const { rerender } = await openAndConfirmRestore("sample_import", {
      restoreSamples: jest.fn().mockResolvedValue({
        success: true, message: "samples ok", itemCount: 2, type: "backup", timestamp: new Date(),
      }),
      restorePatterns,
      checkModeRequirement: jest.fn().mockResolvedValue(null),
    });

    await waitFor(() =>
      expect(screen.queryByText("Waiting for device to power off…")).not.toBeNull()
    );
    await simulateDeviceCycle(rerender, "pattern_import");

    await waitFor(() =>
      expect(screen.queryByText("Continue — Restore Patterns")).not.toBeNull()
    );
    fireEvent.click(screen.getByText("Continue — Restore Patterns"));

    await waitFor(() => expect(restorePatterns).toHaveBeenCalled());
    expect(screen.queryByTestId("mode-switch-modal")).toBeNull();
  });
});
