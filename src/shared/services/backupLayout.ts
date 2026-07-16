/**
 * The on-disk shape of a backup, in one place.
 *
 *   <backup>/
 *     manifest.json          what this backup holds
 *     patterns.json          PatternInfo[], each .path pointing into files/
 *     samples.json           { "A": SampleFileInfo[] }, .path pointing into files/
 *     files/
 *       P6_PTN1-1.PRM
 *       BANK_A/PAD_1/P6_A-1_REC.WAV
 *
 * Backups written before this layout settled keep patterns under patterns/ and
 * samples under samples/; the readers below still accept those, the writers
 * only ever produce the shape above.
 */
import * as path from "path";
import { PatternInfo, SampleFileInfo } from "../types/index";
import { BACKUP_CONSTANTS } from "../constants";
import { FileSystemService } from "./FileSystemService";

/** Samples in a backup, keyed by upper-case bank letter. */
export type BankSamples = Record<string, SampleFileInfo[]>;

const {
  FILES_DIRNAME,
  BANK_PREFIX,
  PATTERNS_FILENAME,
  SAMPLES_FILENAME,
  MANIFEST_FILENAME,
} = BACKUP_CONSTANTS;

export const filesDir = (backupDir: string): string =>
  path.join(backupDir, FILES_DIRNAME);

export const sampleBankDir = (backupDir: string, bank: string): string =>
  path.join(filesDir(backupDir), `${BANK_PREFIX}${bank.toUpperCase()}`);

export const manifestPath = (backupDir: string): string =>
  path.join(backupDir, MANIFEST_FILENAME);

export async function writePatternsJson(
  fs: FileSystemService,
  backupDir: string,
  patterns: PatternInfo[]
): Promise<void> {
  await fs.writeJsonFile(path.join(backupDir, PATTERNS_FILENAME), patterns);
}

export async function writeSamplesJson(
  fs: FileSystemService,
  backupDir: string,
  samples: BankSamples
): Promise<void> {
  await fs.writeJsonFile(path.join(backupDir, SAMPLES_FILENAME), samples);
}

/** Patterns in a backup, or null if it holds none. Accepts the legacy layout. */
export async function readPatternsJson(
  fs: FileSystemService,
  backupDir: string
): Promise<PatternInfo[] | null> {
  for (const candidate of [
    path.join(backupDir, PATTERNS_FILENAME),
    path.join(backupDir, "patterns", PATTERNS_FILENAME),
  ]) {
    const data = await fs.readJsonFile<PatternInfo[]>(candidate);
    if (Array.isArray(data)) return data;
  }
  return null;
}

/** Samples in a backup, or null if it holds none. Accepts the legacy layouts. */
export async function readSamplesJson(
  fs: FileSystemService,
  backupDir: string
): Promise<BankSamples | null> {
  for (const candidate of [
    path.join(backupDir, SAMPLES_FILENAME),
    path.join(backupDir, "samples", SAMPLES_FILENAME),
  ]) {
    const data = await fs.readJsonFile<unknown>(candidate);
    const normalized = normalizeSamples(data);
    if (normalized) return normalized;
  }
  return null;
}

/**
 * Single-bank backups used to store `{ bankId, samples }` where multi-bank ones
 * stored `{ bank: samples }`. Both read back as the latter.
 */
function normalizeSamples(data: unknown): BankSamples | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const record = data as Record<string, unknown>;
  if (typeof record.bankId === "string" && Array.isArray(record.samples))
    return { [record.bankId.toUpperCase()]: record.samples as SampleFileInfo[] };

  const banks: BankSamples = {};
  for (const [bank, samples] of Object.entries(record)) {
    if (Array.isArray(samples)) banks[bank.toUpperCase()] = samples;
  }
  return Object.keys(banks).length > 0 ? banks : null;
}

/**
 * How many actual samples a bank set holds. The device writes a .PRM of
 * settings beside every .WAV, and counting those as samples double-reports.
 */
export function countWavs(samples: BankSamples): number {
  return Object.values(samples)
    .flat()
    .filter((s) => s.name.toUpperCase().endsWith(".WAV")).length;
}
