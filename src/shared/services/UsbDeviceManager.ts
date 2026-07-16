import * as usb from "usb";
import { Device } from "usb";
import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { promises as fsPromises, readdirSync } from "fs";
import * as path from "path";
import { createComponentLogger } from "./Logger";

const execFileAsync = promisify(execFileCb);

export interface UsbDeviceInfo {
  vendorId: number;
  productId: number;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  path?: string;
}

export interface P6MassStorageInfo {
  path: string;
  mode: string;
  banks?: string[];
  currentBank?: string;
}

export class UsbDeviceManager {
  private static readonly ROLAND_VENDOR_ID = 0x0582;
  private static readonly P6_PRODUCT_ID = 0x0300;
  private static readonly P6_DEVICE_LABEL = "P6";
  private deviceList: UsbDeviceInfo[] = [];
  private onDeviceConnectedCallback?: (device: UsbDeviceInfo) => void;
  private onDeviceDisconnectedCallback?: (device: UsbDeviceInfo) => void;
  private isScanning = false;
  private logger = createComponentLogger("UsbDeviceManager");

  constructor() {
    try {
      if (usb && typeof usb.getDeviceList === "function") {
        this.logger.info("UsbDeviceManager initialized - using polling mode");
      } else {
        this.logger.warn("USB library not properly available");
      }
    } catch (error) {
      this.logger.warn("Error testing USB library:", error);
    }
  }

  async scanForP6Devices(
    descriptorTimeoutMs: number = 2000
  ): Promise<UsbDeviceInfo[]> {
    if (this.isScanning) {
      this.logger.debug("USB scan already in progress, skipping...");
      return [...this.deviceList];
    }
    this.isScanning = true;
    const devices: UsbDeviceInfo[] = [];
    try {
      if (!usb || typeof usb.getDeviceList !== "function") {
        this.logger.warn("USB library not properly initialized");
        return devices;
      }
      for (const device of usb.getDeviceList()) {
        const descriptor = device.deviceDescriptor;
        const deviceInfo: UsbDeviceInfo = {
          vendorId: descriptor.idVendor,
          productId: descriptor.idProduct,
        };
        if (deviceInfo.vendorId === UsbDeviceManager.ROLAND_VENDOR_ID) {
          try {
            device.open();
            const readDescriptor = async (
              idx: number,
              key: "manufacturer" | "product" | "serialNumber"
            ) => {
              if (idx) {
                try {
                  (deviceInfo as any)[key] =
                    await this.getStringDescriptorWithTimeout(
                      device,
                      idx,
                      descriptorTimeoutMs
                    );
                } catch (err: any) {
                  this.logger.warn(`Failed to read ${key}`, {
                    error: err.message,
                  });
                }
              }
            };
            await Promise.allSettled([
              readDescriptor(descriptor.iManufacturer, "manufacturer"),
              readDescriptor(descriptor.iProduct, "product"),
              readDescriptor(descriptor.iSerialNumber, "serialNumber"),
            ]);
            await new Promise((r) => setTimeout(r, 100));
            device.close();
          } catch (error) {
            this.logger.warn("Could not read device descriptors", { error });
            try {
              device.close();
            } catch {}
          }
          devices.push(deviceInfo);
        }
      }
      await this.scanMassStorageDevices(devices);
    } catch (error) {
      this.logger.error("Error scanning for P6 devices", { error });
    } finally {
      this.isScanning = false;
    }
    this.deviceList = devices;
    return devices;
  }

  private async scanMassStorageDevices(
    devices: UsbDeviceInfo[]
  ): Promise<void> {
    try {
      for (const volumePath of await this.findP6VolumePaths()) {
        devices.push({
          vendorId: UsbDeviceManager.ROLAND_VENDOR_ID,
          productId: UsbDeviceManager.P6_PRODUCT_ID,
          manufacturer: "Roland",
          product: "P6 (Mass Storage)",
          path: volumePath,
        });
      }
    } catch (error) {
      this.logger.warn("Mass storage scan not available", { error });
    }
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

  private async getStringDescriptor(
    device: Device,
    index: number
  ): Promise<string> {
    return new Promise((resolve) => {
      device.getStringDescriptor(index, (error: any, data?: string) => {
        if (error) {
          this.logger.warn(
            `Descriptor read error for index ${index}: ${
              error.message || error
            }`
          );
          resolve("Unknown");
        } else {
          resolve(data || "Unknown");
        }
      });
    });
  }

  isP6UsbConnected(): boolean {
    try {
      if (!usb || typeof usb.getDeviceList !== "function") return false;
      return usb.getDeviceList().some(
        (d) => d.deviceDescriptor.idVendor === UsbDeviceManager.ROLAND_VENDOR_ID
      );
    } catch {
      return false;
    }
  }

  private async getStringDescriptorWithTimeout(
    device: Device,
    index: number,
    timeoutMs: number = 2000
  ): Promise<string> {
    return Promise.race([
      this.getStringDescriptor(device, index),
      new Promise<string>((resolve) =>
        setTimeout(() => {
          this.logger.warn(`Descriptor read timeout for index ${index}`);
          resolve("Timeout");
        }, timeoutMs)
      ),
    ]);
  }

  async checkP6MassStorageMode(): Promise<P6MassStorageInfo | null> {
    try {
      const possiblePaths = await this.getPossibleP6Paths();
      this.logger.debug("Checking possible P6 paths:", possiblePaths);
      for (const devicePath of possiblePaths) {
        try {
          const stat = await fsPromises.stat(devicePath);
          if (stat.isDirectory()) {
            const contents = await fsPromises.readdir(devicePath);
            if (contents.includes("BACKUP"))
              return { path: devicePath, mode: "pattern_backup" };
            if (contents.includes("RESTORE"))
              return { path: devicePath, mode: "pattern_restore" };
            if (contents.includes("EXPORT")) {
              try {
                const exportPath = path.join(devicePath, "EXPORT");
                const exportContents = await fsPromises.readdir(exportPath);
                const bankFolders = exportContents.filter((f: string) => /^BANK_[A-H]$/i.test(f));
                const banks: string[] = [];
                for (const folder of bankFolders) {
                  try {
                    const bankContents = await fsPromises.readdir(path.join(exportPath, folder));
                    const hasPads = bankContents.some((f: string) => /^PAD_\d+$/i.test(f));
                    if (hasPads) {
                      const match = folder.match(/^BANK_([A-H])$/i);
                      if (match?.[1]) banks.push(match[1].toUpperCase());
                    }
                  } catch {}
                }
                if (banks.length > 0)
                  return {
                    path: devicePath,
                    mode: "sample_export",
                    banks,
                    currentBank: banks[0],
                  };
              } catch {
                return { path: devicePath, mode: "sample_export" };
              }
              return { path: devicePath, mode: "sample_export" };
            }
            if (contents.includes("IMPORT"))
              return { path: devicePath, mode: "sample_import" };
            // A P6 volume with no marker folder tells us nothing about its
            // mode. Never claim "normal" here — callers act on that.
            return { path: devicePath, mode: "unknown" };
          }
        } catch {}
      }
    } catch {}
    return null;
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

  onDeviceConnected(callback: (device: UsbDeviceInfo) => void): void {
    this.onDeviceConnectedCallback = callback;
  }
  onDeviceDisconnected(callback: (device: UsbDeviceInfo) => void): void {
    this.onDeviceDisconnectedCallback = callback;
  }
  getConnectedP6Devices(): UsbDeviceInfo[] {
    return [...this.deviceList];
  }
  dispose(): void {
    this.deviceList = [];
    this.onDeviceConnectedCallback = undefined;
    this.onDeviceDisconnectedCallback = undefined;
    this.logger.info("UsbDeviceManager disposed");
  }
}
