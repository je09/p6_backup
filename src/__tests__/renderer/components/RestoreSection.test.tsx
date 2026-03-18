/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RestoreSection } from "../../../renderer/components/RestoreSection";
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
    selection,
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

// Helper: render, wait for backup list, click backup item, confirm the modal
async function openAndConfirmRestore(mode: string, apiOverrides: Partial<Record<string, jest.Mock>> = {}) {
  setupElectronAPI(apiOverrides);
  render(
    <RestoreSection
      deviceStatus={makeStatus(mode)}
      onRestoreComplete={jest.fn()}
    />
  );

  // Wait for backup list to populate
  await waitFor(() => expect(screen.getByText("backup-2024-01")).not.toBeNull());

  // Click the backup item
  fireEvent.click(screen.getByText("backup-2024-01"));

  // Wait for the selection modal, then confirm
  await waitFor(() => expect(screen.queryByTestId("confirm-patterns-and-samples")).not.toBeNull());
  fireEvent.click(screen.getByTestId("confirm-patterns-and-samples"));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RestoreSection — mode check before next batch sample restore", () => {
  it("shows mode switch modal instead of calling restoreSamples when device is in wrong mode", async () => {
    const restoreSamples = jest.fn();

    // Start in pattern_import: pattern restore happens first, sample restore queued
    // Then when "Continue" is clicked, device is still in wrong mode
    await openAndConfirmRestore("pattern_import", {
      restorePatterns: jest.fn().mockResolvedValue({
        success: true, message: "patterns ok", itemCount: 3, type: "backup", timestamp: new Date(),
      }),
      restoreSamples,
      // When "Continue Restore (Next Batch)" is clicked, device is in wrong mode
      checkModeRequirement: jest.fn().mockImplementation(async (op: string) => {
        if (op === "sample restore") {
          return { currentMode: "pattern_import", requiredMode: "sample_import" };
        }
        return null;
      }),
    });

    // Pattern restore completes → "Continue Restore (Next Batch)" button appears
    await waitFor(() =>
      expect(screen.queryByText("Continue Restore (Next Batch)")).not.toBeNull()
    );

    fireEvent.click(screen.getByText("Continue Restore (Next Batch)"));

    // Mode switch modal should appear, restoreSamples should NOT have been called
    await waitFor(() =>
      expect(screen.queryByTestId("mode-switch-modal")).not.toBeNull()
    );
    expect(restoreSamples).not.toHaveBeenCalled();
  });

  it("calls restoreSamples when device is already in sample_import mode", async () => {
    const restoreSamples = jest.fn().mockResolvedValue({
      success: true, message: "samples ok", itemCount: 2, type: "backup", timestamp: new Date(),
    });

    await openAndConfirmRestore("pattern_import", {
      restorePatterns: jest.fn().mockResolvedValue({
        success: true, message: "patterns ok", itemCount: 3, type: "backup", timestamp: new Date(),
      }),
      restoreSamples,
      checkModeRequirement: jest.fn().mockResolvedValue(null), // correct mode
    });

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

    // Start in sample_import: sample restore happens first, pattern restore queued
    await openAndConfirmRestore("sample_import", {
      restoreSamples: jest.fn().mockResolvedValue({
        success: true, message: "samples ok", itemCount: 2, type: "backup", timestamp: new Date(),
      }),
      restorePatterns,
      // When "Continue — Restore Patterns" is clicked, device is in wrong mode
      checkModeRequirement: jest.fn().mockImplementation(async (op: string) => {
        if (op === "pattern restore") {
          return { currentMode: "sample_import", requiredMode: "pattern_import" };
        }
        return null;
      }),
    });

    // Sample restore completes → "Continue — Restore Patterns" button appears
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

    await openAndConfirmRestore("sample_import", {
      restoreSamples: jest.fn().mockResolvedValue({
        success: true, message: "samples ok", itemCount: 2, type: "backup", timestamp: new Date(),
      }),
      restorePatterns,
      checkModeRequirement: jest.fn().mockResolvedValue(null), // correct mode
    });

    await waitFor(() =>
      expect(screen.queryByText("Continue — Restore Patterns")).not.toBeNull()
    );

    fireEvent.click(screen.getByText("Continue — Restore Patterns"));

    await waitFor(() => expect(restorePatterns).toHaveBeenCalled());
    expect(screen.queryByTestId("mode-switch-modal")).toBeNull();
  });
});
