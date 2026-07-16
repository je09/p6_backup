import { useState, useEffect, useMemo } from "react";
import { DeviceStatus, PatternInfo } from "../../shared/types/index";
import { isPatternMode, isSampleMode } from "../../shared/constants";
import { SampleDependency } from "../../shared/utils/prmParser";
import { createComponentLogger } from "../utils/logger";

const log = createComponentLogger("useBackupState");

export interface BackupState {
  availableBanks: string[];
  availablePatterns: PatternInfo[];
  selectedPatterns: string[];
  setSelectedPatterns: (patterns: string[]) => void;
  detectedDependencies: SampleDependency[];
  isLoadingPatterns: boolean;
}

export function useBackupState(deviceStatus: DeviceStatus): BackupState {
  const [availableBanks, setAvailableBanks] = useState<string[]>([]);
  const [availablePatterns, setAvailablePatterns] = useState<PatternInfo[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [isLoadingPatterns, setIsLoadingPatterns] = useState(false);

  useEffect(() => {
    const fetchAvailableBanks = async () => {
      if (!(deviceStatus.connected && isSampleMode(deviceStatus.mode))) {
        setAvailableBanks([]);
        return;
      }
      try {
        const banks = await window.electronAPI.getCurrentBanks();
        setAvailableBanks(banks?.map((bank) => bank.toLowerCase()) ?? []);
      } catch (error) {
        log.error("Failed to fetch available banks", { error });
        setAvailableBanks([]);
      }
    };
    fetchAvailableBanks();
  }, [deviceStatus.connected, deviceStatus.mode]);

  useEffect(() => {
    const fetchAvailablePatterns = async () => {
      if (!(deviceStatus.connected && isPatternMode(deviceStatus.mode))) {
        setAvailablePatterns([]);
        setSelectedPatterns([]);
        setIsLoadingPatterns(false);
        return;
      }
      setIsLoadingPatterns(true);
      try {
        const patterns = await window.electronAPI.getCurrentPatterns();
        setAvailablePatterns(patterns ?? []);
        if (!patterns?.length) setSelectedPatterns([]);
      } catch (error) {
        log.error("Failed to fetch available patterns", { error });
        setAvailablePatterns([]);
        setSelectedPatterns([]);
      } finally {
        setIsLoadingPatterns(false);
      }
    };
    fetchAvailablePatterns();
  }, [deviceStatus.connected, deviceStatus.mode]);

  const detectedDependencies = useMemo((): SampleDependency[] => {
    if (selectedPatterns.length === 0) return [];
    const selected = availablePatterns.filter((p) =>
      selectedPatterns.includes(p.id)
    );
    const allDeps: SampleDependency[] = [];
    selected.forEach((p) => {
      if (p.metadata?.dependencies) allDeps.push(...p.metadata.dependencies);
    });
    const seen = new Set<string>();
    return allDeps
      .filter((dep) => {
        const key = `${dep.bankLetter}-${dep.padNumber}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(
        (a, b) =>
          a.bankLetter.localeCompare(b.bankLetter) ||
          a.padNumber - b.padNumber
      );
  }, [selectedPatterns, availablePatterns]);

  return {
    availableBanks,
    availablePatterns,
    selectedPatterns,
    setSelectedPatterns,
    detectedDependencies,
    isLoadingPatterns,
  };
}
