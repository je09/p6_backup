import * as path from "path";
import {
  BackupInfo,
  BackupDetails,
  BackupPatternItem,
  BackupSampleItem,
  PatternInfo,
  SampleFileInfo,
} from "../types/index";
import { createComponentLogger } from "./Logger";
import { FileSystemService } from "./FileSystemService";
import {
  BankSamples,
  manifestPath,
  readPatternsJson,
  readSamplesJson,
} from "./backupLayout";

/** The trailing ISO timestamp every generated backup directory name carries. */
const TIMESTAMP_SUFFIX = /-\d{4}-\d{2}-\d{2}T[\d-]+Z$/;
/** Directory name stems produced when the user gave no name of their own. */
const GENERATED_STEMS = [/^backup$/, /^patterns$/, /^samples-/];
/** Sample file names carry their pad: "PAD_3/P6_A-3_REC.WAV". */
const PAD_IN_NAME = /^PAD_(\d+)\//i;

interface BackupManifest {
  timestamp?: string;
  totalItemCount?: number;
  displayName?: string;
  results?: Array<{ type: string; itemCount: number; bank?: string; banks?: string[] }>;
}

/** What a backup holds, read from the backup itself rather than the device. */
export class BackupDiscoveryService {
  private logger = createComponentLogger("BackupDiscoveryService");

  constructor(private readonly fs: FileSystemService) {}

  async discoverBackups(): Promise<BackupInfo[]> {
    const backupRoot = await this.fs.getDefaultBackupPath();
    const dirNames = await this.fs.listDirectories(backupRoot);

    const backups: BackupInfo[] = [];
    for (const dirName of dirNames) {
      try {
        const info = await this.describeBackup(
          path.join(backupRoot, dirName),
          dirName
        );
        if (info) backups.push(info);
      } catch (error) {
        this.logger.warn(`Skipping unreadable backup directory ${dirName}`, {
          error,
        });
      }
    }

    return backups.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  async getBackupDetails(backupPath: string): Promise<BackupDetails> {
    const [patterns, samples] = await Promise.all([
      readPatternsJson(this.fs, backupPath),
      readSamplesJson(this.fs, backupPath),
    ]);
    return {
      patterns: (patterns ?? []).map(toPatternItem),
      samples: mapSamples(samples ?? {}),
    };
  }

  private async describeBackup(
    dirPath: string,
    dirName: string
  ): Promise<BackupInfo | null> {
    const [manifest, patterns, samples, stats, size] = await Promise.all([
      this.fs.readJsonFile<BackupManifest>(manifestPath(dirPath)),
      readPatternsJson(this.fs, dirPath),
      readSamplesJson(this.fs, dirPath),
      this.fs.getFileStats(dirPath),
      this.fs.getDirectorySize(dirPath),
    ]);

    const sampleBanks = Object.keys(samples ?? {}).sort();
    const hasPatterns = (patterns?.length ?? 0) > 0;
    const hasSamples = sampleBanks.length > 0;
    if (!hasPatterns && !hasSamples) return null;

    return {
      name: manifest?.displayName || nameFromDirectory(dirName),
      path: dirPath,
      type: "backup",
      // A backup renamed before manifests carried a timestamp has none to read.
      timestamp: parseTimestamp(manifest?.timestamp) ?? stats.modified,
      itemCount:
        manifest?.totalItemCount ??
        countItems(patterns, samples),
      size,
      hasPatterns,
      hasSamples,
      sampleBanks,
      description: describeContents(hasPatterns, sampleBanks),
    };
  }
}

function parseTimestamp(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function countItems(
  patterns: PatternInfo[] | null,
  samples: BankSamples | null
): number {
  const sampleCount = Object.values(samples ?? {}).reduce(
    (sum, bank) => sum + bank.length,
    0
  );
  return (patterns?.length ?? 0) + sampleCount;
}

function nameFromDirectory(dirName: string): string {
  const stem = dirName.replace(TIMESTAMP_SUFFIX, "");
  return GENERATED_STEMS.some((pattern) => pattern.test(stem))
    ? "Backup"
    : stem || dirName;
}

function describeContents(hasPatterns: boolean, sampleBanks: string[]): string {
  const parts: string[] = [];
  if (hasPatterns) parts.push("Patterns");
  if (sampleBanks.length === 1) parts.push(`Samples (Bank ${sampleBanks[0]})`);
  else if (sampleBanks.length > 1)
    parts.push(`Samples (Banks ${sampleBanks.join(", ")})`);
  return parts.join(" + ") || "Backup";
}

function toPatternItem(pattern: PatternInfo, index: number): BackupPatternItem {
  return {
    id: pattern.id || `pattern-${index}`,
    name: pattern.name || `Pattern ${pattern.bank}-${pattern.pattern}`,
    bank: pattern.bank,
    pattern: pattern.pattern,
    size: pattern.size || 0,
    metadata: pattern.metadata,
  };
}

function mapSamples(samples: BankSamples): Record<string, BackupSampleItem[]> {
  const mapped: Record<string, BackupSampleItem[]> = {};
  for (const [bankId, bankSamples] of Object.entries(samples)) {
    const bank = bankId.toUpperCase();
    mapped[bank] = bankSamples.map((sample, index) =>
      toSampleItem(sample, bank, index)
    );
  }
  return mapped;
}

function toSampleItem(
  sample: SampleFileInfo & { id?: string; pad?: number },
  bank: string,
  index: number
): BackupSampleItem {
  const match = PAD_IN_NAME.exec(sample.name ?? "");
  const pad = match ? parseInt(match[1], 10) : sample.pad ?? index + 1;
  return {
    id: sample.id || `${bank}-${pad}-${index}`,
    name: sample.name || `Pad ${pad}`,
    bank,
    pad,
    size: sample.size || 0,
  };
}
