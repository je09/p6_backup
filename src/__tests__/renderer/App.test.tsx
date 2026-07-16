/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../../renderer/App";

jest.mock("../../renderer/utils/logger", () => ({
  createComponentLogger: () => ({
    info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

// Each tab reports whether it is mounted and, for restore, exposes an input we
// can type into to prove its state survives a tab switch.
jest.mock("../../renderer/components/BackupSection", () => ({
  BackupSection: () => <div data-testid="panel-backup" />,
}));
jest.mock("../../renderer/components/RestoreSection", () => ({
  RestoreSection: () => (
    <div data-testid="panel-restore">
      <input aria-label="restore-scratch" />
    </div>
  ),
}));
jest.mock("../../renderer/components/SettingsSection", () => ({
  SettingsSection: () => <div data-testid="panel-settings" />,
}));
jest.mock("../../renderer/components/UserGuide", () => ({
  UserGuide: () => <div data-testid="panel-guide" />,
}));
jest.mock("../../renderer/components/DeviceStatusCard", () => ({
  DeviceStatusCard: () => <div data-testid="device-status" />,
}));

const visible = (testId: string) => {
  const el = screen.getByTestId(testId);
  // A panel is hidden by display:none on its wrapper.
  return (el.closest("[style]") as HTMLElement)?.style.display !== "none";
};

beforeEach(() => {
  (window as any).electronAPI = {
    onDeviceStatusChanged: jest.fn(),
    onMenuNewBackup: jest.fn(),
    onNavigate: jest.fn(),
    removeAllListeners: jest.fn(),
    detectDevice: jest.fn().mockResolvedValue(false),
    getDeviceStatus: jest.fn(),
    onFileCopySuccess: jest.fn(),
  };
});

describe("App tabs", () => {
  it("shows the tabs in order with Guide last", async () => {
    render(<App />);
    const tabs = screen.getAllByRole("menu-item").map((t) => t.textContent);
    expect(tabs).toEqual(["Backup", "Restore", "Settings", "Guide"]);
  });

  it("keeps every tab mounted so switching does not destroy its state", async () => {
    render(<App />);
    // All four panels exist in the DOM at once, only one shown.
    expect(screen.getByTestId("panel-backup")).toBeTruthy();
    expect(screen.getByTestId("panel-restore")).toBeTruthy();
    expect(screen.getByTestId("panel-settings")).toBeTruthy();
    expect(screen.getByTestId("panel-guide")).toBeTruthy();
    expect(visible("panel-backup")).toBe(true);
    expect(visible("panel-restore")).toBe(false);
  });

  it("does not lose an in-progress tab's state when the user switches away and back", async () => {
    render(<App />);

    // Go to Restore and leave some state in it.
    fireEvent.click(screen.getByText("Restore"));
    await waitFor(() => expect(visible("panel-restore")).toBe(true));
    const input = screen.getByLabelText("restore-scratch") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "bank A queued" } });

    // Switch to Settings and back.
    fireEvent.click(screen.getByText("Settings"));
    await waitFor(() => expect(visible("panel-restore")).toBe(false));
    fireEvent.click(screen.getByText("Restore"));
    await waitFor(() => expect(visible("panel-restore")).toBe(true));

    // The same input node was never unmounted, so its value is intact.
    expect((screen.getByLabelText("restore-scratch") as HTMLInputElement).value).toBe(
      "bank A queued"
    );
  });
});
