/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BackupSection } from "../../../renderer/components/BackupSection";
import { DeviceStatus } from "../../../shared/types/index";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("../../../renderer/utils/logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

jest.mock("../../../renderer/components/BackupModals", () => ({
  BackupModals: jest.fn(() => null),
}));
jest.mock("../../../renderer/components/Snackbar", () => ({
  Snackbar: () => null,
}));
jest.mock("../../../renderer/components/BackupProgressCard", () => ({
  BackupProgressCard: ({ currentOperation }: { currentOperation: string }) => (
    <div data-testid="progress-card">{currentOperation}</div>
  ),
}));
// Stub BackupOptions so we can control pattern/sample toggles in tests
jest.mock("../../../renderer/components/BackupOptions", () => ({
  BackupOptions: ({
    setIncludePatterns,
    setIncludeSamples,
    setSelectedCombinedBanks,
  }: {
    setIncludePatterns: (v: boolean) => void;
    setIncludeSamples: (v: boolean) => void;
    setSelectedCombinedBanks: (v: string[]) => void;
  }) => (
    <div>
      <button
        data-testid="toggle-patterns"
        onClick={() => setIncludePatterns(true)}
      >
        Include Patterns
      </button>
      <button
        data-testid="toggle-samples"
        onClick={() => setIncludeSamples(true)}
      >
        Include Samples
      </button>
      <button
        data-testid="select-banks-ab"
        onClick={() => setSelectedCombinedBanks(["a", "b"])}
      >
        Select A+B
      </button>
    </div>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_RESULT = {
  success: true, itemCount: 1, backupPath: "/tmp/b",
  message: "ok", type: "backup" as any, timestamp: new Date(),
};

function makeStatus(mode = "pattern_export"): DeviceStatus {
  return {
    connected: true, mode: mode as any, connectionType: "usb",
    firmwareVersion: "", deviceId: "", lastSeen: null,
  };
}

function setupElectronAPI(overrides: Partial<Record<string, jest.Mock>> = {}) {
  (window as any).electronAPI = {
    checkModeRequirement: jest.fn().mockResolvedValue(null),
    backup: jest.fn().mockResolvedValue(BASE_RESULT),
    backupPatterns: jest.fn().mockResolvedValue(BASE_RESULT),
    backupSamples: jest.fn().mockResolvedValue(BASE_RESULT),
    organizeBackup: jest.fn().mockResolvedValue(BASE_RESULT),
    ejectDevice: jest.fn().mockResolvedValue(true),
    getCurrentBanks: jest.fn().mockResolvedValue(null),
    getCurrentBank: jest.fn().mockResolvedValue(null),
    getCurrentPatterns: jest.fn().mockResolvedValue([]),
    onFileCopySuccess: jest.fn(),
    removeAllListeners: jest.fn(),
    waitForMode: jest.fn().mockResolvedValue({ success: true, finalMode: "sample_export", timedOut: false }),
    ...overrides,
  };
}

// ── "Create Backup" button disabled state ─────────────────────────────────────

describe("Create Backup button", () => {
  it("is disabled when device is not connected", () => {
    setupElectronAPI();
    const disconnected: DeviceStatus = { ...makeStatus(), connected: false };
    render(
      <BackupSection
        deviceStatus={disconnected}
        onBackupComplete={jest.fn()}
      />
    );
    const btn = screen.getByText("Create Backup") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("is disabled when device is connected but neither patterns nor samples selected", () => {
    setupElectronAPI();
    render(
      <BackupSection
        deviceStatus={makeStatus("pattern_export")}
        onBackupComplete={jest.fn()}
      />
    );
    expect((screen.getByText("Create Backup") as HTMLButtonElement).disabled).toBe(true);
  });

  it("is enabled when device is connected and patterns are selected", () => {
    setupElectronAPI();
    render(
      <BackupSection
        deviceStatus={makeStatus("pattern_export")}
        onBackupComplete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("toggle-patterns"));
    expect((screen.getByText("Create Backup") as HTMLButtonElement).disabled).toBe(false);
  });

  it("is enabled when device is connected and samples are selected", () => {
    setupElectronAPI();
    render(
      <BackupSection
        deviceStatus={makeStatus("pattern_export")}
        onBackupComplete={jest.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("toggle-samples"));
    expect((screen.getByText("Create Backup") as HTMLButtonElement).disabled).toBe(false);
  });
});

// ── Clicking Create Backup opens name modal ───────────────────────────────────

describe("Create Backup flow", () => {
  it("opens the backup name modal when Create Backup is clicked", async () => {
    const BackupModalsMock = jest.requireMock(
      "../../../renderer/components/BackupModals"
    ).BackupModals as jest.Mock;

    setupElectronAPI();
    render(
      <BackupSection
        deviceStatus={makeStatus("pattern_export")}
        onBackupComplete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("toggle-patterns"));
    fireEvent.click(screen.getByText("Create Backup"));

    // BackupModals should have been called with showBackupNameModal=true
    await waitFor(() => {
      const lastCall = BackupModalsMock.mock.calls[BackupModalsMock.mock.calls.length - 1][0];
      expect(lastCall.showBackupNameModal).toBe(true);
    });

    BackupModalsMock.mockImplementation(() => null);
  });

  it("starts the orchestration guide after confirming backup name", async () => {
    const BackupModalsMock = jest.requireMock(
      "../../../renderer/components/BackupModals"
    ).BackupModals as jest.Mock;

    // Render the modal confirm button so we can fire it
    BackupModalsMock.mockImplementation(
      ({ onBackupNameConfirm, showBackupNameModal }: any) =>
        showBackupNameModal ? (
          <button data-testid="confirm-name" onClick={() => onBackupNameConfirm(undefined)}>
            Confirm
          </button>
        ) : null
    );

    setupElectronAPI();
    render(
      <BackupSection
        deviceStatus={makeStatus("pattern_export")}
        onBackupComplete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("toggle-patterns"));
    fireEvent.click(screen.getByText("Create Backup"));

    await waitFor(() => expect(screen.queryByTestId("confirm-name")).not.toBeNull());
    fireEvent.click(screen.getByTestId("confirm-name"));

    // Guide should appear (Cancel button renders only in guide mode)
    await waitFor(() => {
      expect(screen.queryByText("Cancel")).not.toBeNull();
    });

    BackupModalsMock.mockImplementation(() => null);
  });

  it("starts directly in samples mode when only samples selected", async () => {
    const BackupModalsMock = jest.requireMock(
      "../../../renderer/components/BackupModals"
    ).BackupModals as jest.Mock;
    BackupModalsMock.mockImplementation(
      ({ onBackupNameConfirm, showBackupNameModal }: any) =>
        showBackupNameModal ? (
          <button data-testid="confirm-name" onClick={() => onBackupNameConfirm(undefined)}>
            Confirm
          </button>
        ) : null
    );

    setupElectronAPI();
    render(
      <BackupSection
        deviceStatus={makeStatus("sample_export")}
        onBackupComplete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("toggle-samples"));
    fireEvent.click(screen.getByText("Create Backup"));
    await waitFor(() => expect(screen.queryByTestId("confirm-name")).not.toBeNull());
    fireEvent.click(screen.getByTestId("confirm-name"));

    // Guide should appear
    await waitFor(() => {
      expect(screen.queryByText("Cancel")).not.toBeNull();
    });

    BackupModalsMock.mockImplementation(() => null);
  });
});

// ── Guide UI ──────────────────────────────────────────────────────────────────

describe("backup guide UI", () => {
  async function openGuide() {
    const BackupModalsMock = jest.requireMock(
      "../../../renderer/components/BackupModals"
    ).BackupModals as jest.Mock;
    BackupModalsMock.mockImplementation(
      ({ onBackupNameConfirm, showBackupNameModal }: any) =>
        showBackupNameModal ? (
          <button data-testid="confirm-name" onClick={() => onBackupNameConfirm(undefined)}>
            Confirm
          </button>
        ) : null
    );

    setupElectronAPI();
    const utils = render(
      <BackupSection
        deviceStatus={makeStatus("pattern_export")}
        onBackupComplete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("toggle-patterns"));
    fireEvent.click(screen.getByText("Create Backup"));
    await waitFor(() => expect(screen.queryByTestId("confirm-name")).not.toBeNull());
    fireEvent.click(screen.getByTestId("confirm-name"));
    await waitFor(() => expect(screen.queryByText("Cancel")).not.toBeNull());

    BackupModalsMock.mockImplementation(() => null);
    return utils;
  }

  it("renders Continue and Cancel buttons when guide is active", async () => {
    await openGuide();
    expect(screen.getByText("Cancel")).not.toBeNull();
    const btns = screen.getAllByRole("button");
    expect(btns.some((b) => b.textContent?.includes("Continue") || b.textContent?.includes("Switch") || b.textContent?.includes("Select"))).toBe(true);
  });

  it("Cancel button hides the guide", async () => {
    await openGuide();
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => {
      expect(screen.queryByText("Cancel")).toBeNull();
    });
    // The normal backup UI is shown again
    expect(screen.getByText("Create Backup")).not.toBeNull();
  });
});
