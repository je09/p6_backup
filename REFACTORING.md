# P6 Backup Tool — Comprehensive Refactoring Plan

## Context

This is an Electron + TypeScript desktop application for backing up and restoring data from the Roland P-6 device. The codebase has accumulated significant architectural debt through incremental growth without a clear design contract. The result is a service layer with broken dependency management, duplicate state, stale-reference bugs, broken data paths, and a frontend hook that manages far too much complexity. The goal of this refactoring is to make the application correct (fix bugs), maintainable (clear responsibilities, proper DI), and optimized (remove redundant scanning, polling, and unnecessary re-renders).

---

## Part 1: Catalogue of Issues

### CRITICAL BUGS

#### BUG-01: Data type case mismatch — device data never read correctly

**File:** `src/shared/services/DeviceDataService.ts:35-42`

`DeviceDataService.readData` switch uses uppercase `"PATTERNS"` and `"SAMPLES"`, but all callers pass lowercase `"patterns"` / `"samples"` (via `DATA_TYPES` constants which are lowercase). The switch always falls to the `default` branch, throwing `UNKNOWN_DATA_TYPE`. **Pattern and sample reads are completely broken.**

```typescript
// DeviceDataService — switch cases use UPPERCASE
case "PATTERNS": ...
case "SAMPLES":  ...

// DATA_TYPES constant — values are lowercase
export const DATA_TYPES = { PATTERNS: 'patterns', SAMPLES: 'samples' }

// BackupService calls: p6Device.readData("patterns")  ← lowercase → always throws
```

#### BUG-02: Dual P6Device instances — BackupService and main.ts operate on separate devices

**File:** `src/shared/services/BackupService.ts:21-25`

`BackupService` constructor unconditionally creates `new P6Device()` and `new ModeService()` internally. `main.ts` creates its own `P6Device` for IPC handlers. The result is **two independent device instances**, each with its own USB listeners and auto-detection intervals. The device status shown in the UI comes from main.ts's instance; the actual backup operations run against BackupService's instance. These can diverge — e.g., showing "connected" while backup fails with "not connected."

```typescript
// BackupService.ts — creates its OWN P6Device, ignoring the one from main.ts
constructor(fileSystemService?: FileSystemService) {
  this.p6Device = new P6Device(); // ← isolated instance, no shared state
  this.modeService = new ModeService(this.p6Device);
}
```

#### BUG-03: `DeviceDataService` receives stale `massStorageInfo` at construction time

**File:** `src/shared/models/P6Device.ts:54-58`

`P6Device` passes `this.massStorageInfo` (which is `null`) to `DeviceDataService` constructor. The service stores it as its own value. Later, when `P6Device.handleDeviceConnected` calls `this.dataService.setMassStorageInfo(this.massStorageInfo)`, it updates the service's copy, but only after connection. Any read/write before that explicit call will fail with `MASS_STORAGE_NOT_AVAILABLE`.

#### BUG-04: `performAutomatedCombinedBackupWithName` reads stale React state

**File:** `src/renderer/hooks/useBackupOrchestration.ts:320-343`

The function reads `combinedBackupQueue` state and then immediately sets it:

```typescript
const bankQueue = combinedBackupQueue.length > 0 ? combinedBackupQueue : [];
setCombinedBackupQueue(bankQueue); // ← this updates state async
```

Since React state updates are asynchronous, `combinedBackupQueue` is always the value from the previous render. The bank queue is never populated correctly before the guide shows. Combined multi-bank backup is broken.

#### BUG-05: `DeviceConnectionService.detectAndConnectDevice` double-scans and discards result

**File:** `src/shared/services/DeviceConnectionService.ts:57-80`

When finding a device via mass storage, the method:

1. Creates a `virtualDevice` with `vendorId: 0x0000`
2. Calls `this.connectDevice()` — which calls `usbManager.scanForP6Devices()` again (second USB scan)
3. Returns the `virtualDevice` from step 1, but the internal `currentDevice` is set to whatever the second scan found (or nothing)

The returned virtual device object is meaningless and disconnected from actual state.

#### BUG-06: `DeviceModeService.validateModeStability` always returns `true`

**File:** `src/shared/services/DeviceModeService.ts:38-41`

```typescript
async validateModeStability(): Promise<boolean> {
  // Could call modeDetector.validateModeStability if needed
  return true; // ← unconditional stub
}
```

Any caller relying on mode stability validation gets a false positive.

#### BUG-07: `readPatternData` creates a directory on the device during a read

**File:** `src/shared/services/DeviceDataService.ts:70-71`

```typescript
const patternsPath = path.join(this.massStorageInfo.path, "patterns");
await fs.promises.mkdir(patternsPath, { recursive: true }); // ← WRITES to device
```

A read operation must not mutate the source. This creates a `patterns/` folder on the Roland P-6 device's mass storage, potentially corrupting the device filesystem layout.

#### BUG-08: `ModeService.waitForMode` never triggers a mode scan

**File:** `src/shared/services/ModeService.ts:39-53`

`waitForMode` polls `this.p6Device.getCurrentMode()` in a loop. `getCurrentMode()` returns the cached `this.status.mode` — it never triggers a fresh USB/filesystem scan. The P6Device auto-detection runs every 8 seconds. If the user switches device mode, `waitForMode` can wait up to ~8 seconds after the switch before detecting it (or time out at 30s). The poll should trigger `retryModeDetection()`.

---

### SOLID VIOLATIONS

#### SRP-01: `P6Device` is a God Object (474 lines)

**File:** `src/shared/models/P6Device.ts`

`P6Device` instantiates and owns all services (`UsbDeviceManager`, `ModeDetector`, `FileSystemService`, `DeviceConnectionService`, `DeviceDataService`, `DeviceModeService`), manages connection monitoring intervals, manages auto-detection intervals, provides data read/write pass-through, and provides mode detection. It violates the Single Responsibility Principle by being a facade, a registry, and an orchestrator simultaneously.

#### SRP-02: `BackupService` is 1220 lines

**File:** `src/shared/services/BackupService.ts`

A single class handles patterns backup, samples backup, combined/full backup, patterns restore, samples restore, manifest creation, backup organization, folder creation, mode validation, and error recovery. Each of these is a distinct responsibility.

#### SRP-03: `FileSystemService` mixes infrastructure and domain logic (1028 lines)

**File:** `src/shared/services/FileSystemService.ts`

The service mixes low-level file I/O (copy, delete, stat) with high-level domain operations (backup discovery, manifest parsing, backup type inference, display name formatting). These are two distinct responsibilities.

#### OCP-01: `DeviceDataService` uses string switch for dispatch

**File:** `src/shared/services/DeviceDataService.ts:35-42`

Adding a new data type requires modifying the switch, violating Open/Closed. Should use a registry or strategy pattern.

#### DIP-01: `BackupService` instantiates concrete dependencies

**File:** `src/shared/services/BackupService.ts:21-25`

`BackupService` creates `new P6Device()` and `new ModeService()` in its constructor. High-level policy (backup orchestration) depends directly on low-level details (device implementation), not on abstractions.

#### DIP-02: `P6Device` instantiates all services internally

**File:** `src/shared/models/P6Device.ts:44-61`

Same violation — all services are `new`-ed in the constructor. There is no way to inject mocks for testing, or swap implementations.

#### ISP-01: `P6Device` exposes a massive interface

**File:** `src/shared/models/P6Device.ts`

Consumers of `P6Device` receive access to connection management, mode detection, data I/O, status reading, and configuration — regardless of which subset they need. `BackupService` only needs readiness checks and data I/O; `ModeService` only needs `getCurrentMode()`.

---

### BAD DESIGN PATTERNS

#### DESIGN-01: Two redundant mode services

`DeviceModeService` (wraps `ModeDetector`) and `ModeService` (wraps `P6Device`) both exist. Their responsibilities partially overlap. `DeviceModeService.validateModeStability` is a stub. `ModeService.waitForMode` doesn't trigger scans. Neither is needed separately — mode management should live in one place.

#### DESIGN-02: Duplicate `FILE_PATTERNS` constant

**Files:** `src/shared/constants/device.ts` and `src/shared/constants/index.ts`

`FILE_PATTERNS` is defined in both files with **different content** — different regex patterns, different file lists. They are both exported, creating ambiguity about which is authoritative. Because `index.ts` re-exports from `device.ts`, the names clash.

#### DESIGN-03: `DEVICE_MODES` constant names are misleading

**File:** `src/shared/constants/device.ts:3-11`

```typescript
DEVICE_MODES.PATTERN_BACKUP === "pattern";
DEVICE_MODES.PATTERN_RESTORE === "pattern"; // same value
DEVICE_MODES.PATTERN_EXPORT === "pattern"; // same value
```

Multiple distinct constant names map to the same string value `'pattern'`. This hides that `pattern_backup` and `pattern_restore` are the same effective mode. The `DeviceMode` type and `P6Mode` enum serve the same purpose with different granularity — two competing representations exist simultaneously.

#### DESIGN-04: `useBackupOrchestration` hook leaks internal state setters

**File:** `src/renderer/hooks/useBackupOrchestration.ts:552-580`

The hook returns raw React `setState` functions (`setShowCombinedBankGuide`, `setCombinedBackupQueue`, `setCurrentCombinedBankIndex`, etc.). Callers can mutate internal state arbitrarily, bypassing all business logic. The hook's encapsulation is broken.

#### DESIGN-05: Hook receives parent-component state setters as parameters

**File:** `src/renderer/hooks/useBackupOrchestration.ts:38-70`

`handlePatternBackup` receives `setIncludePatterns`, `setIncludeSamples`, `setSelectedPatterns` — setters from the parent component's own `useState`. The hook is orchestrating state that doesn't belong to it. This creates a circular dependency between component and hook.

#### DESIGN-06: Error message parsing via regex

**File:** `src/renderer/hooks/useBackupOrchestration.ts:284-286`

```typescript
const [, currentMode, requiredMode] =
  error.message.match(/Current mode: (\w+).*mode for.*mode: (\w+)/) || [];
```

Parsing structured information from unstructured error message strings is fragile. If the error message text ever changes, the regex silently fails and error handling is skipped.

#### DESIGN-07: `require()` calls inside class methods

**Files:** `src/shared/models/P6Device.ts:336, 433`, `src/shared/services/DeviceDataService.ts:67, 108`

Node's `require()` is called inside method bodies to import `fs`, `path`, and `usb`. These should be static module imports at the top of the file.

#### DESIGN-08: `UI_CONSTANTS.COLORS` is disconnected from the actual theme

**File:** `src/shared/constants/index.ts:67-77`

`UI_CONSTANTS.COLORS.PRIMARY = "#1a73e8"` (Google blue) but the actual SCSS theme uses `#f9a825` (amber). These constants are never actually used — the real colors live only in SCSS variables — making the constants dead code that misleads.

#### DESIGN-09: `BackupOperation` and `OperationStatus` are inconsistent

**File:** `src/shared/types/index.ts:97-119`

`BackupOperation.status` uses string literals `"in-progress"` (hyphen) while `OperationStatus` enum value is `"in_progress"` (underscore). Neither is used consistently anywhere.

#### DESIGN-10: `BACKUP_CONSTANTS.MAX_BANKS_PER_RESTORE` is defined but never enforced

**File:** `src/shared/constants/index.ts:51`

The limit of 2 banks per restore is declared but no code checks it.

#### DESIGN-11: No `dispose()` lifecycle on `P6Device`

**File:** `src/shared/models/P6Device.ts`

`connectionCheckInterval` and `autoDetectionInterval` (both `setInterval`) are never cleared when the Electron app closes. `UsbDeviceManager.dispose()` exists but is never called. This causes resource leaks and potentially keeps the process alive.

#### DESIGN-12: `BackupSection` component is 791 lines

**File:** `src/renderer/components/BackupSection.tsx`

A single React component manages backup selections, IPC calls, polling, modal state, snackbar state, and bank/pattern fetching. Component files of this size are hard to maintain and test.

#### DESIGN-13: `useBackupOrchestration` functions are not memoized

**File:** `src/renderer/hooks/useBackupOrchestration.ts`

Orchestration functions like `handleCombinedBankContinue` close over React state but are not wrapped in `useCallback`. Every render creates new function references, causing unnecessary child component re-renders.

#### DESIGN-14: `completeCombinedBackup` uses stale closure state

**File:** `src/renderer/hooks/useBackupOrchestration.ts:509-545`

`completeCombinedBackup` reads `combinedBackupMode` and `combinedBackupQueue` from closure scope (stale state references). When called from within a callback chain, the state values will be those from the render when the callback was created, not the current render.

---

### CODE SMELLS

- **SMELL-01:** `connectionCheckInterval: any` — should be `NodeJS.Timeout | null`
- **SMELL-02:** `DeviceModeService.massStorageInfo: any` — untyped
- **SMELL-03:** `P6Device.readData` / `writeData` accept `parameters?: any` — untyped
- **SMELL-04:** `P6Device.getDeviceInfo()` returns `any` — untyped
- **SMELL-05:** `combinedBackupResults: any[]` in the hook — untyped
- **SMELL-06:** `availablePatterns: any[]` passed to hook — untyped
- **SMELL-07:** `handleCombinedBackupWithName` in the hook accepts an opaque `options` object containing state setters — anti-pattern
- **SMELL-08:** `DeviceConnectionService.startMonitoring()` / `stopMonitoring()` are empty stubs
- **SMELL-09:** `P6Device.handleUnknownModeDetection` has a "no-op in production" comment — dead code
- **SMELL-10:** `CombinedBackupGuide` component is imported/defined but not rendered anywhere
- **SMELL-11:** `ErrorHandler` utilities (ERROR_TYPES, createError) are exported but never imported/used in the app
- **SMELL-12:** `BackupSectionContainer` is a pass-through wrapper component with no added value
- **SMELL-13:** `isReady()` in `P6Device` has an unexplained `await new Promise(resolve => setTimeout(resolve, 100))` delay

---

## Part 2: Multi-Phase Refactoring Plan

---

### Phase 1: Fix Critical Bugs (No Architecture Changes)

**Goal:** Make the application work correctly without restructuring. These are isolated fixes.

#### 1.1 Fix data type case mismatch (BUG-01)

**File:** `src/shared/services/DeviceDataService.ts`

Change switch cases from uppercase to lowercase to match actual call sites:

```typescript
// Before
case "PATTERNS": ...
case "SAMPLES": ...

// After
case "patterns": ...
case "samples": ...
```

Alternatively, normalize `dataType` with `dataType.toLowerCase()` before the switch.

#### 1.2 Fix `BackupService` dependency — inject `P6Device` instead of creating it (BUG-02)

**File:** `src/shared/services/BackupService.ts`, `src/main/main.ts`

Change `BackupService` constructor to accept `P6Device` as a required argument:

```typescript
constructor(p6Device: P6Device, fileSystemService?: FileSystemService)
```

In `main.ts`, pass the existing `P6Device` instance to `BackupService`:

```typescript
const p6Device = new P6Device();
const backupService = new BackupService(p6Device, fileSystemService);
```

#### 1.3 Fix `DeviceDataService` stale reference (BUG-03)

**File:** `src/shared/models/P6Device.ts`, `src/shared/services/DeviceDataService.ts`

Pass a getter callback instead of a value-at-construction-time:

```typescript
// DeviceDataService constructor accepts a getter
constructor(
  fileSystemService: FileSystemService,
  getStatus: () => DeviceStatus,
  getMassStorageInfo: () => P6MassStorageInfo | null
)
```

In `P6Device`, pass `() => this.status` and `() => this.massStorageInfo`. Remove `setMassStorageInfo()`.

#### 1.4 Fix stale React state in `performAutomatedCombinedBackupWithName` (BUG-04)

**File:** `src/renderer/hooks/useBackupOrchestration.ts`

Pass `bankQueue` and `initialMode` as parameters to the function instead of reading from state:

```typescript
const performAutomatedCombinedBackupWithName = async (
  bankQueue: string[],
  initialMode: "patterns" | "samples",
  customName?: string
) => { ... }
```

The caller (`performCombinedBackupWithName`) already has access to the current selection.

#### 1.5 Fix `DeviceConnectionService.detectAndConnectDevice` double-scan (BUG-05)

**File:** `src/shared/services/DeviceConnectionService.ts`

Remove the redundant second `connectDevice()` call inside `detectAndConnectDevice`. Return the actual found device directly. Use `DEVICE_DETAILS.VENDOR_ID` / `PRODUCT_ID` for the virtual device, or remove the virtualDevice pattern entirely and return `massStorageInfo` separately.

#### 1.6 Fix `DeviceModeService.validateModeStability` stub (BUG-06)

**File:** `src/shared/services/DeviceModeService.ts`

Delegate to `modeDetector.validateModeStability(expectedMode, checkCount)`. Accept `expectedMode` and `checkCount` parameters matching the underlying implementation.

#### 1.7 Remove directory creation from `readPatternData` (BUG-07)

**File:** `src/shared/services/DeviceDataService.ts`

Remove the `mkdir` call for the `patterns/` subfolder from `readPatternData`. The method should only read from the device, never write to it. If a temp staging directory is needed for pattern processing, it belongs in the backup destination path, managed by `FileSystemService`.

#### 1.8 Fix `ModeService.waitForMode` to trigger active detection (BUG-08)

**File:** `src/shared/services/ModeService.ts`

Change the polling body to call `this.p6Device.retryModeDetection()` or `this.p6Device.detectCurrentMode()` on each iteration instead of just reading the cached mode:

```typescript
while (true) {
  const detectedMode = await this.p6Device.retryModeDetection(); // active scan
  if (detectedMode === requiredMode) return { success: true, ... };
  if (Date.now() - start >= timeout) return { success: false, ... };
  await new Promise(r => setTimeout(r, this.pollInterval));
}
```

---

### Phase 2: Eliminate Structural Duplication and Dead Code

**Goal:** Remove redundant constructs that confuse the codebase without changing core architecture.

#### 2.1 Consolidate `FILE_PATTERNS` into one definition

**Files:** `src/shared/constants/device.ts`, `src/shared/constants/index.ts`

Merge the two `FILE_PATTERNS` objects into a single authoritative definition in `src/shared/constants/device.ts`. Keep the superset of fields. Remove the duplicate from `index.ts`.

#### 2.2 Consolidate mode representations

**Files:** `src/shared/types/index.ts`, `src/shared/constants/device.ts`

Remove `P6Mode` enum. `DeviceMode` type is the single mode representation used throughout. Keep only `DeviceMode`. Remove `DEVICE_MODES.PATTERN_BACKUP`, `DEVICE_MODES.PATTERN_RESTORE` (they are aliases for `'pattern'`) — replace with `DEVICE_MODES.PATTERN = 'pattern'` and `DEVICE_MODES.SAMPLE = 'sample'`. Update all references.

#### 2.3 Remove dead `UI_CONSTANTS.COLORS`

**File:** `src/shared/constants/index.ts`

These constants are never imported or used. The real theme lives in SCSS. Remove `UI_CONSTANTS.COLORS` entirely to avoid misleading developers.

#### 2.4 Remove `BackupSectionContainer` pass-through

**File:** `src/renderer/components/BackupSectionContainer.tsx`

This is a component with no logic that just passes props to `BackupSection`. Delete it and have `App.tsx` render `BackupSection` directly.

#### 2.5 Remove unused `CombinedBackupGuide` and `ErrorHandler`

**Files:** `src/renderer/components/CombinedBackupGuide.tsx`, `src/renderer/components/ErrorHandler.tsx`

Both are defined but never rendered or imported by the active component tree. Remove them (or integrate `ErrorHandler` in Phase 4).

#### 2.6 Consolidate `OperationStatus` and `BackupOperation.status` literals

**File:** `src/shared/types/index.ts`

Change `BackupOperation.status` to use `OperationStatus` enum type. Fix the hyphen vs underscore inconsistency. Update all references.

#### 2.7 Remove empty stubs `startMonitoring` / `stopMonitoring`

**File:** `src/shared/services/DeviceConnectionService.ts`

Remove these empty methods. If connection monitoring is needed, it belongs in `P6Device`.

#### 2.8 Remove `P6Device.handleUnknownModeDetection` no-op

**File:** `src/shared/models/P6Device.ts`

Remove the dead method and its call site.

---

### Phase 3: Dependency Injection and Service Boundaries

**Goal:** Make dependencies explicit and injectable. Eliminate internal `new` calls in service constructors.

#### 3.1 Extract interfaces for major services

**New file:** `src/shared/services/interfaces.ts`

Define interfaces for the stable surface area:

```typescript
export interface IDeviceConnection {
  isConnected(): boolean;
  getStatus(): DeviceStatus;
  getCurrentMode(): DeviceMode;
  retryModeDetection(): Promise<DeviceMode>;
  onStatusChanged(cb: (status: DeviceStatus) => void): void;
}

export interface IDeviceData {
  readPatterns(): Promise<PatternInfo[]>;
  readSamples(bankId: string): Promise<SampleData>;
  writePatterns(data: PatternInfo[]): Promise<boolean>;
  writeSamples(data: SampleData, bankId: string): Promise<boolean>;
}

export interface IFileSystem {
  // Existing public methods
}
```

#### 3.2 Refactor `BackupService` to accept injected dependencies

**File:** `src/shared/services/BackupService.ts`

```typescript
export class BackupService {
  constructor(
    private readonly device: IDeviceConnection,
    private readonly deviceData: IDeviceData,
    private readonly fs: IFileSystem,
  ) {}
}
```

#### 3.3 Refactor `P6Device` to accept injected services

**File:** `src/shared/models/P6Device.ts`

```typescript
export class P6Device {
  constructor(
    private readonly usbManager: UsbDeviceManager,
    private readonly modeDetector: ModeDetector,
    private readonly fileSystemService: FileSystemService,
  ) {
    this.connectionService = new DeviceConnectionService(usbManager);
    this.dataService = new DeviceDataService(
      fileSystemService,
      () => this.status,
      () => this.massStorageInfo,
    );
    this.modeService = new DeviceModeService(modeDetector);
    this.setupUsbEventHandlers();
    this.startAutoDetection();
  }
}
```

#### 3.4 Create a `ServiceContainer` / factory in main.ts

**File:** `src/main/main.ts`

Create all services once and pass them as dependencies:

```typescript
const fileSystemService = new FileSystemService();
const usbManager = new UsbDeviceManager();
const modeDetector = new ModeDetector(usbManager);
const p6Device = new P6Device(usbManager, modeDetector, fileSystemService);
const modeService = new ModeService(p6Device);
const backupService = new BackupService(
  p6Device,
  p6Device /* as IDeviceData */,
  fileSystemService,
);
```

#### 3.5 Fix `require()` in method bodies

**Files:** `src/shared/models/P6Device.ts`, `src/shared/services/DeviceDataService.ts`

Convert all inline `require('fs')`, `require('path')`, `require('usb')` to top-of-file ES6 `import` statements.

---

### Phase 4: Decompose Oversized Components and Services

**Goal:** Apply SRP — each unit has one reason to change.

#### 4.1 Split `FileSystemService` into two services

**New file:** `src/shared/services/BackupDiscoveryService.ts`

Extract backup-domain methods from `FileSystemService`:

- `discoverBackups()`, `parseBackupDirectory()`, `extractCustomNameFromPath()`, `formatBackupDisplayName()`, `mapStringToBackupType()`, `inferBackupType()`, `getBackupDetails()`, `hasPatterns()`, `hasSamples()`, `getSampleBanks()`, `estimateItemCount()`, `generateBackupDescription()`

`FileSystemService` retains only infrastructure: copy, delete, stat, list, read/write JSON, path utilities.

#### 4.2 Split `BackupService` into `PatternBackupService` and `SampleBackupService`

**New files:** `src/shared/services/PatternBackupService.ts`, `src/shared/services/SampleBackupService.ts`

- `PatternBackupService`: `backupPatterns()`, `restorePatterns()`
- `SampleBackupService`: `backupSamples()`, `restoreSamples()`

Retain a thin `BackupOrchestrator` (renamed from `BackupService`) for `combinedBackup()`, `fullBackup()`, `organizeCombinedBackup()` that delegates to the two sub-services.

#### 4.3 Consolidate `DeviceModeService` and `ModeService` into one

**File:** `src/shared/services/ModeService.ts`

Merge both into one `ModeService` that takes `ModeDetector` directly (not via `P6Device`). Expose:

- `detectMode(): Promise<DeviceMode>`
- `waitForMode(mode, timeout?): Promise<ModeWaitResult>`
- `getOperationModeRequirement(op): ModeRequirement | null`
- `validateModeStability(mode, count?): Promise<boolean>`

Remove `DeviceModeService` entirely.

#### 4.4 Decompose `BackupSection` into focused components

**Target structure:**

```
BackupSection (orchestrator, ~150 lines)
  ├── useBackupState hook (selection state: patterns, banks, toggles)
  ├── useBackupOrchestration hook (operation flow only)
  ├── BackupControls (QuickActionButtons + CombinedBackupOptions)
  └── BackupModals (ModeSwitchModal + BackupNameModal rendering)
```

`BackupSection` becomes a thin coordinator that:

1. Reads device status (prop)
2. Provides selection state via `useBackupState`
3. Triggers operations via `useBackupOrchestration`
4. Renders `BackupControls` or `BackupProgressCard`
5. Renders modals conditionally

#### 4.5 Refactor `useBackupOrchestration` — remove state setter coupling

**File:** `src/renderer/hooks/useBackupOrchestration.ts`

The hook must own its own backup selection state (patterns, banks) instead of receiving parent setters. Functions like `handlePatternBackup` should not accept `setIncludePatterns` as a parameter:

```typescript
// Before — wrong, hook receives parent's setState
handlePatternBackup({ setIncludePatterns, setSelectedPatterns, ... })

// After — hook owns its selection state
const { handlePatternBackup } = useBackupOrchestration({ deviceStatus, onBackupComplete });
// hook internally sets its own includePatterns, selectedPatterns state
```

Wrap all callbacks in `useCallback`. Use `useRef` for values that should not trigger re-renders (e.g., `currentBackupCustomName`).

#### 4.6 Replace regex error parsing with structured errors

**Files:** `src/renderer/hooks/useBackupOrchestration.ts`, `src/shared/services/BackupService.ts`

Create a typed `ModeError` class:

```typescript
export class ModeError extends Error {
  constructor(
    public readonly currentMode: DeviceMode,
    public readonly requiredMode: DeviceMode,
    public readonly operation: string,
  ) {
    super(`Mode mismatch: ${currentMode} → ${requiredMode}`);
  }
}
```

Throw `ModeError` in `BackupService`. In the hook, use `instanceof ModeError` for detection.

---

### Phase 5: Lifecycle Management and Resource Cleanup

**Goal:** Prevent resource leaks and make application shutdown clean.

#### 5.1 Add `dispose()` to `P6Device`

**File:** `src/shared/models/P6Device.ts`

```typescript
dispose(): void {
  this.stopAutoDetection();
  this.stopConnectionMonitoring();
  this.usbManager.dispose();
}
```

#### 5.2 Call `p6Device.dispose()` on Electron `app.on('will-quit')`

**File:** `src/main/main.ts`

```typescript
app.on("will-quit", () => {
  p6Device.dispose();
});
```

#### 5.3 Add cleanup for polling `useEffect` in `BackupSection`

**File:** `src/renderer/components/BackupSection.tsx`

Ensure all `setInterval` / `setTimeout` calls inside `useEffect` return cleanup functions:

```typescript
useEffect(() => {
  const id = setInterval(checkDeviceReadiness, 2000);
  return () => clearInterval(id);
}, [deviceStatus.mode]);
```

#### 5.4 Remove unexplained 100ms delay in `P6Device.isReady()`

**File:** `src/shared/models/P6Device.ts:203`

```typescript
await new Promise((resolve) => setTimeout(resolve, 100)); // unexplained
```

Remove this. If a debounce is genuinely needed, document why.

---

### Phase 6: Type Safety Improvements

**Goal:** Eliminate `any` types throughout the service and hook layers.

#### 6.1 Type `connectionCheckInterval` and `autoDetectionInterval`

```typescript
private connectionCheckInterval: NodeJS.Timeout | null = null;
private autoDetectionInterval: NodeJS.Timeout | null = null;
```

#### 6.2 Type `DeviceModeService.massStorageInfo`

Change from `any` to `P6MassStorageInfo | null`.

#### 6.3 Type `readData` / `writeData` parameters

Replace `parameters?: any` with a union type:

```typescript
type ReadParameters =
  | { type: "patterns" }
  | { type: "samples"; bankId: string };
```

#### 6.4 Type `getDeviceInfo()` return value

Define a `DeviceInfoResult` interface. Remove the `any` return type.

#### 6.5 Type `combinedBackupResults` in the hook

Define a `CombinedBackupStageResult` type:

```typescript
type CombinedBackupStageResult =
  | { type: "patterns"; result: BackupResult }
  | { type: "samples"; bank: string; result: BackupResult };
```

#### 6.6 Type `availablePatterns` throughout the component tree

Define a `PatternInfo` interface (or reuse the one from `BackupService`) and replace `any[]`.

---

### Phase 7: Add Error Boundaries and Observability

**Goal:** Prevent UI crashes from propagating and make failures visible.

#### 7.1 Add `ErrorBoundary` component at App root

**New file:** `src/renderer/components/ErrorBoundary.tsx`

React class component wrapping `<App>` to catch uncaught render errors and display a recovery UI instead of a blank screen.

#### 7.2 Activate and integrate `ErrorHandler`

**File:** `src/renderer/components/ErrorHandler.tsx`

The `ErrorHandler` utilities (already written, currently unused) should be used in the restored `ErrorBoundary` and for standardizing error display in `BackupSection` and `RestoreSection`.

#### 7.3 Add `BACKUP_CONSTANTS.MAX_BANKS_PER_RESTORE` enforcement

**File:** `src/shared/services/SampleBackupService.ts`

Before executing a restore, check that `targetBanks.length <= BACKUP_CONSTANTS.MAX_BANKS_PER_RESTORE` and throw a descriptive error if exceeded.

---

## Part 3: Critical Files to Modify

| File                                             | Primary Change                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `src/shared/services/DeviceDataService.ts`       | BUG-01 case fix, BUG-07 remove mkdir, BUG-03 getter pattern, top-level imports |
| `src/shared/services/BackupService.ts`           | BUG-02 accept injected P6Device, split into sub-services (Phase 4.2)           |
| `src/shared/models/P6Device.ts`                  | BUG-03 getter callbacks, DIP-02 constructor injection, dispose() method        |
| `src/shared/services/ModeService.ts`             | BUG-08 active scan in waitForMode, merge DeviceModeService                     |
| `src/shared/services/DeviceConnectionService.ts` | BUG-05 remove double-scan                                                      |
| `src/renderer/hooks/useBackupOrchestration.ts`   | BUG-04 params instead of state, Phase 4.5 remove setter coupling               |
| `src/shared/constants/device.ts`                 | DESIGN-02 merge FILE_PATTERNS, DESIGN-03 simplify DEVICE_MODES                 |
| `src/shared/constants/index.ts`                  | Remove duplicate FILE_PATTERNS, dead UI_CONSTANTS.COLORS                       |
| `src/shared/types/index.ts`                      | Remove P6Mode enum, fix OperationStatus inconsistency                          |
| `src/main/main.ts`                               | ServiceContainer pattern, dispose on quit                                      |
| `src/renderer/components/BackupSection.tsx`      | Split into focused components (Phase 4.4)                                      |

---

## Part 4: Verification Checklist

After each phase, verify the following end-to-end:

1. **Device detection:** Connect P6 in pattern backup mode → app shows "Connected / Pattern mode"
2. **Pattern backup:** Click "Backup Patterns" → backup folder created with `.PRM` files and `manifest.json`
3. **Sample backup (single bank):** Connect in sample export mode → click bank → backup completes
4. **Combined backup (multi-bank):** Trigger multi-bank orchestration → each bank prompt appears → all results organized
5. **Pattern restore:** Select existing pattern backup → restore completes → RESTORE folder populated on device
6. **Sample restore:** Select sample backup → restore completes → IMPORT folder populated on device
7. **Mode switch:** Start pattern backup in wrong mode → mode switch modal appears → after switch, backup proceeds
8. **Device disconnect:** Unplug device during backup → error shown, state resets, auto-detection resumes
9. **App quit:** Close app → no zombie intervals, USB listeners disposed
10. **TypeScript build:** `tsc --noEmit` with zero errors after each phase

Run the existing application manually (there are no automated tests in this codebase) after each phase to confirm no regressions.
