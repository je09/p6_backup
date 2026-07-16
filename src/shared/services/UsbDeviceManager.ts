import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { promises as fsPromises, readdirSync } from "fs";
import * as path from "path";
import { BACKUP_CONSTANTS } from "../constants";
import { DEVICE_MODES } from "../constants/device";
import { DeviceMode } from "../types/index";
import { createComponentLogger } from "./Logger";

const execFileAsync = promisify(execFileCb);

/** A detected P-6, identified by the mount point of its mass storage volume. */
export interface UsbDeviceInfo {
  path: string;
}

export interface P6MassStorageInfo {
  path: string;
  /** Read from the marker folder on the volume; `unknown` if there is none. */
  mode: DeviceMode;
  banks?: string[];
  currentBank?: string;
}

const { BACKUP, RESTORE, EXPORT, IMPORT } = BACKUP_CONSTANTS.FOLDERS;
const BANK_DIR_REGEX = /^BANK_([A-H])$/i;
const PAD_DIR_REGEX = /^PAD_\d+$/i;

/**
 * Finds P-6 devices by their mounted volume. The P-6 only reaches the host in
 * its export/import modes, where it mounts as a labelled volume, so the volume
 * is both the detection signal and the data channel.
 */
export class UsbDeviceManager {
  private logger = createComponentLogger("UsbDeviceManager");

  /** Every mounted volume that looks like a P-6, as a device entry. */
  async scanForP6Devices(): Promise<UsbDeviceInfo[]> {
    const paths = await this.findP6VolumePaths();
    return paths.map((volumePath) => ({ path: volumePath }));
  }

  /** Matches volume labels the P-6 presents, e.g. "P-6", "P6", "P6 SAMPLES". */
  private static isP6VolumeLabel(label: string): boolean {
    return /p-?6/i.test(label);
  }

  /**
   * Mount points of every attached volume whose label looks like a P-6. This is
   * the single source of P6 paths on all platforms — matching on the label
   * matters on Windows, where enumerating bare drive letters would otherwise
   * match the system drive.
   */
  private async findP6VolumePaths(): Promise<string[]> {
    const scans: Record<string, () => Promise<string[]>> = {
      darwin: async () => this.listMatchingSubdirectories(["/Volumes"]),
      linux: async () =>
        this.listMatchingSubdirectories([
          "/media",
          `/media/${process.env.USER ?? ""}`,
          "/mnt",
          "/run/media",
          `/run/media/${process.env.USER ?? ""}`,
        ]),
      win32: async () => this.listWindowsP6Drives(),
    };
    const scan = scans[process.platform];
    if (!scan) return [];
    try {
      return await scan();
    } catch (error) {
      this.logger.warn("Could not scan volumes", { error });
      return [];
    }
  }

  private listMatchingSubdirectories(roots: string[]): string[] {
    const matches: string[] = [];
    for (const root of roots) {
      try {
        for (const entry of readdirSync(root)) {
          if (!UsbDeviceManager.isP6VolumeLabel(entry)) continue;
          const fullPath = path.join(root, entry);
          if (!matches.includes(fullPath)) matches.push(fullPath);
        }
      } catch {
        // Root not present on this system — expected, try the next one.
      }
    }
    return matches;
  }

  private async listWindowsP6Drives(): Promise<string[]> {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName | ConvertTo-Json -Compress",
    ]);
    const parsed = JSON.parse(stdout);
    const drives: Array<{ DeviceID?: string; VolumeName?: string }> =
      Array.isArray(parsed) ? parsed : [parsed];
    return drives
      .filter(
        (drive) =>
          drive.DeviceID && UsbDeviceManager.isP6VolumeLabel(drive.VolumeName ?? "")
      )
      .map((drive) => drive.DeviceID!);
  }

  /** The mode of the first mounted P-6 volume, or null if none is mounted. */
  async checkP6MassStorageMode(): Promise<P6MassStorageInfo | null> {
    const markerModes: Array<[string, DeviceMode]> = [
      [BACKUP, DEVICE_MODES.PATTERN_EXPORT],
      [RESTORE, DEVICE_MODES.PATTERN_IMPORT],
      [EXPORT, DEVICE_MODES.SAMPLE_EXPORT],
      [IMPORT, DEVICE_MODES.SAMPLE_IMPORT],
    ];

    for (const devicePath of await this.getPossibleP6Paths()) {
      let contents: string[];
      try {
        const stat = await fsPromises.stat(devicePath);
        if (!stat.isDirectory()) continue;
        contents = await fsPromises.readdir(devicePath);
      } catch {
        continue; // Volume vanished between listing and reading it.
      }

      const marker = markerModes.find(([folder]) => contents.includes(folder));
      // A P-6 volume with no marker folder tells us nothing about its mode.
      // Never claim a specific mode here — callers act on it.
      if (!marker) return { path: devicePath, mode: DEVICE_MODES.UNKNOWN };

      const [, mode] = marker;
      if (mode !== DEVICE_MODES.SAMPLE_EXPORT) return { path: devicePath, mode };

      const banks = await this.readExportBanks(path.join(devicePath, EXPORT));
      return banks.length > 0
        ? { path: devicePath, mode, banks, currentBank: banks[0] }
        : { path: devicePath, mode };
    }
    return null;
  }

  /** Bank letters under EXPORT/ that actually hold pads. */
  private async readExportBanks(exportPath: string): Promise<string[]> {
    let entries: string[];
    try {
      entries = await fsPromises.readdir(exportPath);
    } catch {
      return [];
    }

    const banks: string[] = [];
    for (const entry of entries) {
      const match = BANK_DIR_REGEX.exec(entry);
      if (!match) continue;
      try {
        const bankContents = await fsPromises.readdir(path.join(exportPath, entry));
        if (bankContents.some((f) => PAD_DIR_REGEX.test(f)))
          banks.push(match[1].toUpperCase());
      } catch {
        // Unreadable bank folder — treat as holding nothing.
      }
    }
    return banks;
  }

  private async getPossibleP6Paths(): Promise<string[]> {
    const paths: string[] = [];
    // The conventional mount point, checked first so it wins on ties.
    if (process.platform === "darwin") paths.push("/Volumes/P-6");
    for (const discovered of await this.findP6VolumePaths()) {
      if (!paths.includes(discovered)) paths.push(discovered);
    }
    return paths;
  }
}
