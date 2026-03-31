import { useState, useEffect, useMemo } from "react";
import { DeviceStatus, PatternInfo } from "../../shared/types/index";
import { SampleDependency } from "../../shared/utils/prmParser";
import { createComponentLogger } from "../utils/logger";

const log = createComponentLogger("useBackupState");

export interface BackupState {
  availableBanks: string[];
  availablePatterns: PatternInfo[];
  selectedPatterns: string[];
  setSelectedPatterns: (patterns: string[]) => void;
  detectedDependencies: SampleDependency[];
}

export function useBackupState(deviceStatus: DeviceStatus): BackupState {
  const [availableBanks, setAvailableBanks] = useState<string[]>([]);
  const [availablePatterns, setAvailablePatterns] = useState<PatternInfo[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);

  useEffect(() => {
    const fetchAvailableBanks = async () => {
      if (
        deviceStatus.connected &&
        (deviceStatus.mode === "sample" ||
          deviceStatus.mode === "sample_export" ||
          deviceStatus.mode === "sample_import")
      ) {
        try {
          const banks = await window.electronAPI.getCurrentBanks();
          if (banks && Array.isArray(banks)) {
            setAvailableBanks(banks.map((bank) => bank.toLowerCase()));
          } else {
            setAvailableBanks([]);
          }
        } catch (error) {
          log.error("Failed to fetch available banks", { error });
          setAvailableBanks([]);
        }
      } else {
        setAvailableBanks([]);
      }
    };
    fetchAvailableBanks();
  }, [deviceStatus.connected, deviceStatus.mode]);

  useEffect(() => {
    const fetchAvailablePatterns = async () => {
      if (
        deviceStatus.connected &&
        (deviceStatus.mode === "pattern" ||
          deviceStatus.mode === "pattern_export" ||
          deviceStatus.mode === "pattern_import")
      ) {
        try {
          const patterns = await window.electronAPI.getCurrentPatterns();
          if (patterns && Array.isArray(patterns)) {
            setAvailablePatterns(patterns);
          } else {
            setAvailablePatterns([]);
            setSelectedPatterns([]);
          }
        } catch (error) {
          log.error("Failed to fetch available patterns", { error });
          setAvailablePatterns([]);
          setSelectedPatterns([]);
        }
      } else {
        setAvailablePatterns([]);
        setSelectedPatterns([]);
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
  };
}
