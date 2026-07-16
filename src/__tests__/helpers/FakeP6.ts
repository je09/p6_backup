/**
 * A stand-in for a real Roland P-6 over USB mass storage.
 *
 * The behaviour modelled here is what the detection stack actually reads, and
 * was confirmed against a physical P-6:
 *
 *  - The device announces itself on the USB bus immediately at power-on, but
 *    the OS does not mount its volume until a second or two later. Code that
 *    looks in that gap sees a device with no volume.
 *  - The mode is not reported by the device. It is inferred purely from which
 *    marker folder the mounted volume exposes.
 *  - In normal mode the device is on the bus but mounts no volume at all.
 *  - The mode is chosen by which button is held at power-on and only changes
 *    across a power cycle.
 *  - Ejecting unmounts the volume while the device stays powered.
 */

export type P6Mode =
  | "pattern_export"
  | "pattern_import"
  | "sample_export"
  | "sample_import"
  | "normal";

export const ROLAND_VENDOR_ID = 0x0582;
export const P6_PRODUCT_ID = 0x0300;

/** Marker folder the device exposes for each mass storage mode. */
const MARKER_FOLDER: Record<Exclude<P6Mode, "normal">, string> = {
  pattern_export: "BACKUP",
  pattern_import: "RESTORE",
  sample_export: "EXPORT",
  sample_import: "IMPORT",
};

export interface FakeP6Options {
  /** How long after power-on the OS takes to mount the volume. */
  mountDelayMs?: number;
  /** Volume label, as it appears under /Volumes. */
  label?: string;
  /** Banks and their pads, exposed in sample_export mode. */
  banks?: Record<string, number[]>;
}

export class FakeP6 {
  private poweredOn = false;
  private mode: P6Mode = "normal";
  private mountedAt: number | null = null;
  private ejected = false;

  mountDelayMs: number;
  label: string;
  banks: Record<string, number[]>;

  constructor(options: FakeP6Options = {}) {
    this.mountDelayMs = options.mountDelayMs ?? 0;
    this.label = options.label ?? "P-6";
    this.banks = options.banks ?? { A: [1, 2], B: [1] };
  }

  get volumePath(): string {
    return `/Volumes/${this.label}`;
  }

  /** Power on holding whatever puts the device into `mode`. */
  powerOnInto(mode: P6Mode): this {
    this.poweredOn = true;
    this.mode = mode;
    this.ejected = false;
    this.mountedAt = mode === "normal" ? null : Date.now() + this.mountDelayMs;
    return this;
  }

  powerOff(): this {
    this.poweredOn = false;
    this.mountedAt = null;
    this.ejected = false;
    return this;
  }

  /** Power cycle into a new mode, as the user does between restore stages. */
  powerCycleInto(mode: P6Mode): this {
    return this.powerOff().powerOnInto(mode);
  }

  /** Unmount the volume but leave the device powered, as diskutil eject does. */
  eject(): this {
    this.ejected = true;
    this.mountedAt = null;
    return this;
  }

  /** The device enumerates on the bus as soon as it is powered. */
  isOnBus(): boolean {
    return this.poweredOn;
  }

  /** The volume only exists once the OS has had time to mount it. */
  isVolumeMounted(): boolean {
    if (!this.poweredOn || this.ejected || this.mountedAt === null) return false;
    return Date.now() >= this.mountedAt;
  }

  usbDeviceList(): unknown[] {
    if (!this.poweredOn) return [];
    return [
      {
        deviceDescriptor: {
          idVendor: ROLAND_VENDOR_ID,
          idProduct: P6_PRODUCT_ID,
          iManufacturer: 0,
          iProduct: 0,
          iSerialNumber: 0,
        },
        open: () => undefined,
        close: () => undefined,
      },
    ];
  }

  /** Contents of the volume root, or of a path beneath it. */
  private entriesAt(target: string): string[] | null {
    if (!this.isVolumeMounted()) return null;
    const root = this.volumePath;
    if (target === root) {
      if (this.mode === "normal") return [".fseventsd", "info.txt"];
      return [".fseventsd", MARKER_FOLDER[this.mode], "info.txt"];
    }
    if (!target.startsWith(root + "/")) return null;

    const rest = target.slice(root.length + 1).split("/");
    if (this.mode === "sample_export" && rest[0] === "EXPORT") {
      if (rest.length === 1) return Object.keys(this.banks).map((b) => `BANK_${b}`);
      const bankMatch = /^BANK_([A-H])$/i.exec(rest[1]);
      if (rest.length === 2 && bankMatch) {
        const pads = this.banks[bankMatch[1].toUpperCase()];
        if (!pads) return null;
        return pads.map((p) => `PAD_${p}`);
      }
      return null;
    }
    if (this.mode !== "normal" && rest[0] === MARKER_FOLDER[this.mode] && rest.length === 1)
      return [];
    return null;
  }

  // ── Backing for the fs and usb seams the detection stack reads ────────────

  readdirSync(target: string): string[] {
    if (target === "/Volumes") {
      const volumes = ["Macintosh HD"];
      if (this.isVolumeMounted()) volumes.push(this.label);
      return volumes;
    }
    const entries = this.entriesAt(target);
    if (entries === null) throw enoent(target);
    return entries;
  }

  async stat(target: string): Promise<{ isDirectory: () => boolean }> {
    const entries = this.entriesAt(target);
    if (entries === null) throw enoent(target);
    return { isDirectory: () => true };
  }

  async readdir(target: string): Promise<string[]> {
    const entries = this.entriesAt(target);
    if (entries === null) throw enoent(target);
    return entries;
  }
}

function enoent(target: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(
    `ENOENT: no such file or directory, '${target}'`
  );
  error.code = "ENOENT";
  return error;
}

// ── Module seam ───────────────────────────────────────────────────────────────
// The device under test is swapped per test; the fs mock reads through to it.

let current: FakeP6 | null = null;

export function useFakeP6(device: FakeP6): FakeP6 {
  current = device;
  return device;
}

function device(): FakeP6 {
  if (!current) throw new Error("No FakeP6 installed — call useFakeP6() first");
  return current;
}

/** Drop-in for the `fs` module, backed by whichever FakeP6 is installed. */
export const fakeFs = {
  readdirSync: (target: string) => device().readdirSync(target),
  promises: {
    stat: (target: string) => device().stat(target),
    readdir: (target: string) => device().readdir(target),
  },
};
