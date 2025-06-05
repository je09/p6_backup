# Debugging the Roland P-6 Backup Tool

This document provides information on how to effectively debug the Roland P-6 Backup Tool using VS Code.

## Available Debug Configurations

The following debug configurations are available in VS Code:

### 1. Debug Main Process

This configuration targets the Electron main process which handles application lifecycle, IPC communication, and device integration.

- Use this when debugging issues related to the application's main process, device detection, or IPC message handling.

### 2. Debug Renderer Process 

This configuration attaches to the Chromium renderer process for debugging the React-based UI.

- Use this when debugging UI components, React state management, or issues with the UI rendering.

### 3. Debug USB Communication

This configuration specifically targets USB device communication with enhanced logging.

- Use this when debugging issues with device detection, connection, or data transfer.
- Sets the `DEBUG` environment variable to enable verbose USB logging.

### 4. Debug All

This compound configuration launches both the main and renderer process debuggers simultaneously.

- Use this for end-to-end debugging of the entire application.

## Debugging USB Device Communication

When debugging issues with the Roland P-6 device connection:

1. Select the "Debug USB Communication" configuration
2. Set breakpoints in the following files:
   - `src/shared/models/P6Device.ts`
   - `src/shared/services/UsbDeviceManager.ts`

### Common USB Debugging Scenarios

#### Device Not Detected

- Check breakpoints in the device detection methods in `P6Device.ts`
- Examine USB events in the console output
- Verify the vendor and product IDs are correctly identified

#### Data Transfer Issues

- Set breakpoints in the `readData` and `writeData` methods in `P6Device.ts`
- Check the format of data being sent to or received from the device
- Verify file paths and permissions when accessing mass storage

#### Bank Selection Issues

- Debug the `getCurrentBanks` and `getCurrentBank` methods
- Check the mappings in `mapMassStorageMode` method
- Verify that the UI components correctly use the bank availability info

## Debugging Sample and Pattern Backup

1. Set breakpoints in `BackupService.ts` methods
2. Pay particular attention to:
   - `readSamplesFromBank`
   - `copySampleFiles`
   - `copySampleFilesFromPad`

## Useful Debugging Tips

1. Use the VS Code Debug Console to examine variables and execute expressions
2. Enable "Auto Attach" to debug child processes automatically
3. Check the "Debug Console" for log messages from the application
4. Use conditional breakpoints for complex debugging scenarios

## Troubleshooting

If the debugger doesn't attach properly:

1. Run `npm run clean` to remove build artifacts
2. Run `npm run build:dev` to rebuild the project
3. Try launching the debugger again

For USB permission issues on macOS/Linux:
- Ensure your user has proper permissions to access USB devices
