import * as usb from "usb";
import { Device } from "usb";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { promises as fsPromises, readdirSync } from "fs";
import * as path from "path";
import { createComponentLogger } from "./Logger";

const execAsync = promisify(execCb);

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
    const platformScans: Record<string, () => Promise<void>> = {
      darwin: async () => {
        try {
          const { stdout } = await execAsync("ls /Volumes");
          stdout
            .split("\n")
            .filter(Boolean)
            .forEach((volume: string) => {
              if (volume.includes("P-6")) {
                devices.push({
                  vendorId: 0x0582,
                  productId: 0x0300,
                  manufacturer: "Roland",
                  product: "P6 (Mass Storage)",
                  path: `/Volumes/${volume}`,
                });
              }
            });
        } catch (error) {
          this.logger.warn("Could not scan volumes", { error });
        }
      },
      win32: async () => {
        try {
          const { stdout } = await execAsync(
            "wmic logicaldisk get caption,volumename"
          );
          stdout
            .split("\n")
            .filter(Boolean)
            .forEach((line: string) => {
              if (line.includes("P-6")) {
                const match = line.match(/([A-Z]:)/);
                if (match) {
                  devices.push({
                    vendorId: 0x0582,
                    productId: 0x0300,
                    manufacturer: "Roland",
                    product: "P6 (Mass Storage)",
                    path: match[1],
                  });
                }
              }
            });
        } catch (error) {
          this.logger.warn("Could not scan drives", { error });
        }
      },
    };
    try {
      if (platformScans[process.platform]) {
        await platformScans[process.platform]!();
      }
    } catch (error) {
      this.logger.warn("Mass storage scan not available", { error });
    }
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
      const possiblePaths = this.getPossibleP6Paths();
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
            return { path: devicePath, mode: "normal" };
          }
        } catch {}
      }
    } catch {}
    return null;
  }

  private getPossibleP6Paths(): string[] {
    const paths: string[] = [];
    if (process.platform === "darwin") {
      paths.push("/Volumes/P-6");
      try {
        readdirSync("/Volumes").forEach((volume: string) => {
          if (
            volume.toLowerCase().includes("p6") ||
            volume.toLowerCase().includes("p-6")
          ) {
            const fullPath = `/Volumes/${volume}`;
            if (!paths.includes(fullPath)) paths.push(fullPath);
          }
        });
      } catch {}
    } else if (process.platform === "win32") {
      for (let i = 65; i <= 90; i++) paths.push(`${String.fromCharCode(i)}:`);
    } else {
      paths.push(
        "/media/P6",
        "/media/Roland",
        "/mnt/P6",
        "/mnt/P-6",
        "/mnt/Roland"
      );
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
