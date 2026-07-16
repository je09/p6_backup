import { useCallback, useEffect, useState } from "react";
import { DeviceMode, DeviceStatus, RestoreResult } from "../../shared/types/index";
import { BACKUP_CONSTANTS, DEVICE_MODES } from "../../shared/constants";

/**
 * One device session's worth of work. A restore is an ordered list of these:
 * each needs a particular device mode, and the user power-cycles between them.
 */
export type RestoreStage =
  | { kind: "samples"; banks: string[] }
  | { kind: "patterns"; patternIds: string[] };

export interface RestoreSelection {
  includePatterns: boolean;
  includeSamples: boolean;
  selectedPatterns: string[];
  selectedSampleBanks: string[];
  selectedSamples: { [bankId: string]: string[] };
  bankSizes: Record<string, number>;
}

const MODE_OPERATION: Record<RestoreStage["kind"], string> = {
  samples: "sample restore",
  patterns: "pattern restore",
};

/**
 * Split bank IDs into sessions whose cumulative sample size stays within what
 * the device accepts. A bank that alone exceeds the limit occupies its own
 * session — there is nothing else we can do with it.
 */
export function buildBatchesBySize(
  banks: string[],
  bankSizes: Record<string, number>
): string[][] {
  const batches: string[][] = [];
  let currentBatch: string[] = [];
  let currentSize = 0;
  for (const bank of banks) {
    const size = bankSizes[bank] ?? 0;
    if (
      currentBatch.length > 0 &&
      currentSize + size > BACKUP_CONSTANTS.MAX_SESSION_BYTES
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentSize = 0;
    }
    currentBatch.push(bank);
    currentSize += size;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

/**
 * Order the work for a selection. Patterns and samples need different device
 * modes, so whichever matches the mode the device is already in goes first and
 * saves the user a power cycle.
 */
export function buildRestorePlan(
  selection: RestoreSelection,
  deviceMode: string
): RestoreStage[] {
  const sampleStages: RestoreStage[] = selection.includeSamples
    ? buildBatchesBySize(
        selection.selectedSampleBanks.length > 0
          ? selection.selectedSampleBanks
          : [...BACKUP_CONSTANTS.SAMPLE_BANKS],
        selection.bankSizes
      ).map((banks) => ({ kind: "samples", banks }))
    : [];
  const patternStages: RestoreStage[] = selection.includePatterns
    ? [{ kind: "patterns", patternIds: selection.selectedPatterns }]
    : [];

  return deviceMode === DEVICE_MODES.PATTERN_IMPORT
    ? [...patternStages, ...sampleStages]
    : [...sampleStages, ...patternStages];
}

interface StageOutcome {
  kind: RestoreStage["kind"];
  message: string;
}

/** Compose the closing summary, labelling each kind when both ran. */
function summarise(outcomes: StageOutcome[]): string {
  const samples = outcomes.filter((o) => o.kind === "samples").map((o) => o.message);
  const patterns = outcomes.filter((o) => o.kind === "patterns").map((o) => o.message);
  if (samples.length > 0 && patterns.length > 0)
    return `Samples restored:\n${samples.join("\n")}\n\nPatterns restored:\n${patterns.join("\n")}`;
  return outcomes.map((o) => o.message).join("\n");
}

export interface ModeSwitchDetails {
  currentMode: DeviceMode;
  requiredMode: DeviceMode;
  operation: string;
  onContinue: () => void;
}

interface UseRestoreOrchestrationProps {
  deviceStatus: DeviceStatus;
  onRestoreComplete: (result: RestoreResult) => void;
}

/**
 * Drives a restore across the device sessions it takes to finish.
 *
 * The whole job is planned up front and then advanced one stage at a time, so
 * there is a single place that decides what runs next and a single place that
 * decides the restore is over.
 */
export function useRestoreOrchestration({
  deviceStatus,
  onRestoreComplete,
}: UseRestoreOrchestrationProps) {
  const [plan, setPlan] = useState<RestoreStage[] | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [backupPath, setBackupPath] = useState<string>("");
  const [selectedSamples, setSelectedSamples] = useState<{
    [bankId: string]: string[];
  }>({});
  const [outcomes, setOutcomes] = useState<StageOutcome[]>([]);

  const [isRestoreInProgress, setIsRestoreInProgress] = useState(false);
  const [currentOperation, setCurrentOperation] = useState("");
  const [restoredLog, setRestoredLog] = useState<string[]>([]);
  const [requiresDeviceDisconnect, setRequiresDeviceDisconnect] = useState(false);

  const [modeSwitchDetails, setModeSwitchDetails] =
    useState<ModeSwitchDetails | null>(null);
  const [completeMessage, setCompleteMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentStage = plan && stageIndex < plan.length ? plan[stageIndex] : null;
  const isPendingRestore = currentStage !== null;
  const remainingBanks = plan
    ? plan
        .slice(stageIndex)
        .flatMap((stage) => (stage.kind === "samples" ? stage.banks : []))
    : [];

  const reset = useCallback(() => {
    setPlan(null);
    setStageIndex(0);
    setOutcomes([]);
    setRestoredLog([]);
    setIsRestoreInProgress(false);
    setCurrentOperation("");
    setRequiresDeviceDisconnect(false);
  }, []);

  const fail = useCallback(
    (message: string) => {
      reset();
      setErrorMessage(message);
    },
    [reset]
  );

  // A stage that is waiting to run needs the device power-cycled into its mode
  // first, so the continue button stays gated until the device drops off.
  useEffect(() => {
    if (isPendingRestore && !isRestoreInProgress && outcomes.length > 0)
      setRequiresDeviceDisconnect(true);
  }, [isPendingRestore, isRestoreInProgress, outcomes.length]);

  useEffect(() => {
    if (!deviceStatus.connected) setRequiresDeviceDisconnect(false);
  }, [deviceStatus.connected]);

  const restoreSamplesStage = useCallback(
    async (
      stage: Extract<RestoreStage, { kind: "samples" }>,
      path: string,
      samples: { [bankId: string]: string[] }
    ): Promise<RestoreResult> => {
      setCurrentOperation(`Restoring banks ${stage.banks.join(", ")}...`);
      const results: RestoreResult[] = [];
      for (const bankId of stage.banks) {
        const bankResult = await window.electronAPI.restoreSamples(
          path,
          bankId,
          samples[bankId]
        );
        results.push(bankResult);
        if (bankResult.success)
          setRestoredLog((prev) => [
            ...prev,
            `Bank ${bankId.toUpperCase()} (${bankResult.itemCount} samples)`,
          ]);
      }
      const allSucceeded = results.every((r) => r.success);
      return {
        success: allSucceeded,
        message: allSucceeded
          ? results.map((r) => r.message).join("\n")
          : (results.find((r) => !r.success)?.message ?? "Restore failed"),
        itemCount: results.reduce((sum, r) => sum + (r.itemCount || 0), 0),
        timestamp: new Date(),
      };
    },
    []
  );

  const restorePatternsStage = useCallback(
    async (
      stage: Extract<RestoreStage, { kind: "patterns" }>,
      path: string
    ): Promise<RestoreResult> => {
      setCurrentOperation("Restoring patterns...");
      const result = await window.electronAPI.restorePatterns(
        path,
        stage.patternIds.length > 0 ? stage.patternIds : undefined
      );
      if (result.success)
        setRestoredLog((prev) => [...prev, `Patterns (${result.itemCount})`]);
      return result;
    },
    []
  );

  /**
   * Run the stage at `index`, then either queue the next one or finish. Every
   * stage — including the first — goes through here, so there is one code path
   * for "restore a session's worth of work".
   */
  const runStage = useCallback(
    async (
      activePlan: RestoreStage[],
      index: number,
      path: string,
      samples: { [bankId: string]: string[] },
      priorOutcomes: StageOutcome[]
    ): Promise<void> => {
      const stage = activePlan[index];
      if (!stage) return;
      const operation = MODE_OPERATION[stage.kind];

      try {
        const requirement =
          await window.electronAPI.checkModeRequirement(operation);
        if (requirement) {
          setModeSwitchDetails({
            currentMode: requirement.currentMode,
            requiredMode: requirement.requiredMode,
            operation,
            onContinue: () =>
              runStage(activePlan, index, path, samples, priorOutcomes),
          });
          return;
        }
      } catch {
        // Mode is unverifiable — let the restore call surface any real problem.
      }

      setIsRestoreInProgress(true);
      try {
        const result =
          stage.kind === "samples"
            ? await restoreSamplesStage(stage, path, samples)
            : await restorePatternsStage(stage, path);

        onRestoreComplete(result);
        if (!result.success) {
          fail(result.message);
          return;
        }

        const updated = [...priorOutcomes, { kind: stage.kind, message: result.message }];
        setOutcomes(updated);
        setStageIndex(index + 1);

        if (index + 1 >= activePlan.length) {
          setCompleteMessage(summarise(updated));
          setPlan(null);
          setStageIndex(0);
        }
      } catch (error: unknown) {
        fail(error instanceof Error ? error.message : String(error));
      } finally {
        setIsRestoreInProgress(false);
        setCurrentOperation("");
      }
    },
    [fail, onRestoreComplete, restorePatternsStage, restoreSamplesStage]
  );

  const startRestore = useCallback(
    async (selection: RestoreSelection, path: string) => {
      const newPlan = buildRestorePlan(selection, deviceStatus.mode);
      if (newPlan.length === 0) return;

      const samples = selection.selectedSamples ?? {};
      setPlan(newPlan);
      setStageIndex(0);
      setBackupPath(path);
      setSelectedSamples(samples);
      setOutcomes([]);
      setRestoredLog([]);
      await runStage(newPlan, 0, path, samples, []);
    },
    [deviceStatus.mode, runStage]
  );

  /** Continue after the user has power-cycled the device into the next mode. */
  const continueRestore = useCallback(async () => {
    if (!plan) return;
    await runStage(plan, stageIndex, backupPath, selectedSamples, outcomes);
  }, [plan, stageIndex, backupPath, selectedSamples, outcomes, runStage]);

  return {
    // Plan state
    currentStage,
    isPendingRestore,
    remainingBanks,
    backupPath,
    // Progress
    isRestoreInProgress,
    currentOperation,
    restoredLog,
    requiresDeviceDisconnect,
    // Outcomes
    completeMessage,
    errorMessage,
    dismissComplete: () => setCompleteMessage(null),
    dismissError: () => setErrorMessage(null),
    // Mode switching
    modeSwitchDetails,
    cancelModeSwitch: () => setModeSwitchDetails(null),
    // Actions
    startRestore,
    continueRestore,
    cancelRestore: reset,
  };
}
