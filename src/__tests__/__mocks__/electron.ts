export const app = {
  getPath: jest.fn(() => "/tmp"),
  getVersion: jest.fn(() => "1.0.0"),
};
export const shell = {
  openPath: jest.fn(),
  showItemInFolder: jest.fn(),
};
export const ipcMain = { handle: jest.fn() };
export const ipcRenderer = { on: jest.fn(), invoke: jest.fn() };
export const BrowserWindow = jest.fn();
export const dialog = { showOpenDialog: jest.fn() };
