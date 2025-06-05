# 🔧 Refactoring Plan: Component Decomposition and Modernization

## 1. Component Decomposition

**Goal**: Break up the monolithic component into smaller, focused components and hooks.

### a. UI Components

Extract all presentational/UI-only blocks into their own files:

- `CombinedBackupOptions`
- `CombinedBackupGuide`
- `QuickActionButtons`
- `BackupProgressCard`
- `BankReadinessIndicator` ✅ (already done)
- `Snackbar` ✅ (already done)
- Modals ✅ (already done)

### b. Container/Logic Component

Create a `BackupSectionContainer` that:

- Handles all state and logic
- Passes data down to UI components via props

## 2. Custom Hooks

**Goal**: Move business logic, polling, and orchestration out of the component body.

- `useDeviceStatus`: Polling + device connection/mode state
- `useBackupOrchestration`: Backup logic (combined + automated flows)
- `useModalManager`: Manages modal open/close behavior
- `useSnackbarManager`: Handles snackbar state and triggers
- `useAvailableBanks`, `useAvailablePatterns`: Fetch and manage resources

## 3. Service Layer

**Goal**: Abstract all `window.electronAPI` calls into a typed service module.

- Create `DeviceService.ts` in `src/renderer/services/`
- All device communication, mode checks, and backup triggers live here
- Define strict TypeScript types for inputs/outputs

## 4. State Management

**Goal**: Avoid state bloat; improve traceability and control.

- Use `useReducer` for complex flows: backup progress, queue, results
- Consider React Context for shared global state (device, backup status)

## 5. Constants & Types

**Goal**: Modularize and scope constants/types to reduce cognitive load.

- Group into domain-specific modules:
  - `backupTypes.ts`
  - `modalTypes.ts`
- Avoid importing large catch-all files

## 6. Testing

**Goal**: Ensure extracted logic is testable and maintainable.

- Unit test: custom hooks and service functions
- Integration test: container/component behavior

## 7. Directory Structure

**Goal**: Organize by feature/domain, not by type.

📁 features/backup/
├── components/
├── hooks/
├── services/
├── types/
└── BackupSectionContainer.tsx

## 8. Error Handling

**Goal**: Centralize and standardize error handling.

- Use React **error boundaries** for UI
- Catch async errors in **hooks/services**, not in components

## 9. Logging

**Goal**: Eliminate scattered inline logging.

- Move `log.debug/info/warn` to a logging utility used in hooks/services

## 10. Progressive Refactor

**Goal**: Avoid overhauls—iterate safely.

- Start with easy UI extractions
- Migrate logic into hooks/services incrementally
- Introduce `useReducer` and context over time
- Add tests alongside each extraction
