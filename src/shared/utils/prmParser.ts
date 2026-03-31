/**
 * Roland P-6 PRM file parser.
 *
 * Extracts pattern metadata (tempo, length, scale, shuffle) and sample
 * dependencies (which Bank/Pad combinations are referenced by the pattern's
 * step sequencer and granular engine) from the plain-ASCII PRM format.
 */

const BANK_LETTERS = "ABCDEFGH";

export interface SampleDependency {
  /** "A"–"H" */
  bankLetter: string;
  /** 1–6 */
  padNumber: number;
}

export interface PrmMetadata {
  /** Tempo in BPM (TEMPO field / 100) */
  tempo: number;
  /** Pattern length in steps (LENG field, 1–64) */
  length: number;
  /** Step duration index (SCALE field, 0–5) */
  scale: number;
  /** Shuffle/swing amount (SHUFFLE field) */
  shuffle: number;
  /** Unique bank/pad pairs referenced by this pattern */
  dependencies: SampleDependency[];
}

export const SCALE_NAMES: Record<number, string> = {
  0: "1/8",
  1: "1/16",
  2: "1/32",
  3: "1/8T",
  4: "1/16T",
  5: "1/32T",
};

/**
 * Convert a part index (0–47) to a SampleDependency.
 * Index 48 is the GRANULAR pad itself (not a sample dependency).
 */
function partIndexToDependency(idx: number): SampleDependency | null {
  if (idx < 0 || idx > 47) return null;
  return {
    bankLetter: BANK_LETTERS[Math.floor(idx / 6)],
    padNumber: (idx % 6) + 1,
  };
}

/** Parse a STEP_NOTE_SMPL or similar compound value line into key→value map. */
function tokenize(valueStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const token of valueStr.split(/\s+/)) {
    const eq = token.indexOf("=");
    if (eq > 0) {
      result[token.slice(0, eq)] = token.slice(eq + 1);
    }
  }
  return result;
}

/**
 * Parse a Roland P-6 PRM file's text content and return structured metadata.
 *
 * The parser is intentionally forgiving: missing fields fall back to defaults
 * so that partial or future-format files don't throw.
 */
export function parsePrmMetadata(content: string): PrmMetadata {
  let tempo = 0;
  let length = 0;
  let scale = 1;
  let shuffle = 0;

  const depSet = new Set<string>(); // "A:1" dedup keys
  const deps: SampleDependency[] = [];

  function addDep(idx: number) {
    const dep = partIndexToDependency(idx);
    if (!dep) return;
    const key = `${dep.bankLetter}:${dep.padNumber}`;
    if (!depSet.has(key)) {
      depSet.add(key);
      deps.push(dep);
    }
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd();
    const tabEq = line.indexOf("\t= ");
    if (tabEq === -1) continue;

    const key = line.slice(0, tabEq).trim();
    const value = line.slice(tabEq + 3).trim();

    // ── Scalar header fields ──────────────────────────────────────────────
    if (key === "TEMPO") {
      tempo = parseInt(value, 10) / 100;
      continue;
    }
    if (key === "LENG") {
      length = parseInt(value, 10);
      continue;
    }
    if (key === "SCALE") {
      scale = parseInt(value, 10);
      continue;
    }
    if (key === "SHUFFLE") {
      shuffle = parseInt(value, 10);
      continue;
    }

    // ── Granular phrase source ────────────────────────────────────────────
    if (key === "GRANU_PHRASE") {
      const phraseIdx = parseInt(value, 10);
      addDep(phraseIdx);
      continue;
    }

    // ── Step note records (sampler) ───────────────────────────────────────
    if (key.startsWith("STEP_NOTE_SMPL")) {
      const pairs = tokenize(value);
      for (let i = 1; i <= 8; i++) {
        const partVal = pairs[`PART${i}`];
        const veloVal = pairs[`VELO${i}`];
        if (partVal === undefined) continue;
        const partIdx = parseInt(partVal, 10);
        const velo = veloVal !== undefined ? parseInt(veloVal, 10) : 0;
        if (partIdx !== -1 && velo > 0) {
          addDep(partIdx);
        }
      }
      continue;
    }
  }

  // Sort dependencies: bank A→H, pad 1→6
  deps.sort((a, b) => {
    const bankDiff = a.bankLetter.charCodeAt(0) - b.bankLetter.charCodeAt(0);
    return bankDiff !== 0 ? bankDiff : a.padNumber - b.padNumber;
  });

  return { tempo, length, scale, shuffle, dependencies: deps };
}

/**
 * Group a flat list of SampleDependency objects by bank letter.
 * Returns a sorted map: { "A": [1, 3], "B": [2], ... }
 */
export function groupDependenciesByBank(
  deps: SampleDependency[]
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const dep of deps) {
    if (!result[dep.bankLetter]) result[dep.bankLetter] = [];
    if (!result[dep.bankLetter].includes(dep.padNumber)) {
      result[dep.bankLetter].push(dep.padNumber);
    }
  }
  for (const pads of Object.values(result)) pads.sort((a, b) => a - b);
  return result;
}
