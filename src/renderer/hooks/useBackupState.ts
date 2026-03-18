import { useState, useEffect } from "react";
import { DeviceStatus, PatternInfo } from "../../shared/types/index";
import { createComponentLogger } from "../utils/logger";

const log = createComponentLogger("useBackupState");

export interface BackupState {
  availableBanks: string[];
  availablePatterns: PatternInfo[];
  selectedPatterns: string[];
  setSelectedPatterns: (patterns: string[]) => void;
  includePatterns: boolean;
  setIncludePatterns: (v: boolean) => void;
  includeSamples: boolean;
  setIncludeSamples: (v: boolean) => void;
  selectedCombinedBanks: string[];
  setSelectedCombinedBanks: (banks: string[]) => void;
}

export function useBackupState(deviceStatus: DeviceStatus): BackupState {
  const [availableBanks, setAvailableBanks] = useState<string[]>([]);
  const [availablePatterns, setAvailablePatterns] = useState<PatternInfo[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [includePatterns, setIncludePatterns] = useState(false);
  const [includeSamples, setIncludeSamples] = useState(false);
  const [selectedCombinedBanks, setSelectedCombinedBanks] = useState<string[]>([]);

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
  }, [deviceStatus.connected, deviceStatus.mode, includePatterns]);

  return {
    availableBanks,
    availablePatterns,
    selectedPatterns,
    setSelectedPatterns,
    includePatterns,
    setIncludePatterns,
    includeSamples,
    setIncludeSamples,
    selectedCombinedBanks,
    setSelectedCombinedBanks,
  };
}
