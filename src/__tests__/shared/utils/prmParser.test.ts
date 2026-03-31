import { parsePrmMetadata, groupDependenciesByBank, SCALE_NAMES } from "../../../shared/utils/prmParser";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal PRM file with arbitrary scalar overrides. */
function makeHeader(overrides: Record<string, number> = {}): string {
  const defaults: Record<string, number> = {
    LENG: 16,
    SCALE: 1,
    TRANSPOSE: 0,
    LEVEL: 100,
    TEMPO: 12000,
    SHUFFLE: 0,
  };
  return Object.entries({ ...defaults, ...overrides })
    .map(([k, v]) => `${k}\t= ${v}`)
    .join("\n");
}

/** Build a STEP_NOTE_SMPL line with a single active slot (slot 1). */
function makeStepNote(step: number, partIdx: number, velo = 100): string {
  const slots = Array.from({ length: 8 }, (_, i) => {
    const n = i + 1;
    if (n === 1) {
      return `PART${n}=${partIdx} NOTE${n}=60 VELO${n}=${velo} LENG${n}=0 SUB${n}=0 PROB${n}=10 MT${n}=0`;
    }
    return `PART${n}=-1 NOTE${n}=-1 VELO${n}=0 LENG${n}=0 SUB${n}=0 PROB${n}=10 MT${n}=0`;
  }).join(" ");
  return `STEP_NOTE_SMPL ${step}\t= ${slots} RESERVED_STEP1=0 RESERVED_STEP2=0`;
}

// ── Tests: scalar parsing ──────────────────────────────────────────────────

describe("parsePrmMetadata — scalar fields", () => {
  it("parses tempo correctly (raw / 100)", () => {
    const result = parsePrmMetadata(makeHeader({ TEMPO: 6600 }));
    expect(result.tempo).toBeCloseTo(66.0);
  });

  it("parses length", () => {
    const result = parsePrmMetadata(makeHeader({ LENG: 32 }));
    expect(result.length).toBe(32);
  });

  it("parses scale", () => {
    const result = parsePrmMetadata(makeHeader({ SCALE: 2 }));
    expect(result.scale).toBe(2);
  });

  it("parses shuffle", () => {
    const result = parsePrmMetadata(makeHeader({ SHUFFLE: -45 }));
    expect(result.shuffle).toBe(-45);
  });

  it("returns zeros / defaults when fields are missing", () => {
    const result = parsePrmMetadata("nothing here");
    expect(result.tempo).toBe(0);
    expect(result.length).toBe(0);
    expect(result.dependencies).toEqual([]);
  });
});

// ── Tests: dependency extraction ───────────────────────────────────────────

describe("parsePrmMetadata — sampler step dependencies", () => {
  it("extracts Bank A Pad 1 from part index 0", () => {
    const content = [makeHeader(), makeStepNote(1, 0)].join("\n");
    const { dependencies } = parsePrmMetadata(content);
    expect(dependencies).toEqual([{ bankLetter: "A", padNumber: 1 }]);
  });

  it("extracts Bank A Pad 6 from part index 5", () => {
    const content = [makeHeader(), makeStepNote(1, 5)].join("\n");
    const { dependencies } = parsePrmMetadata(content);
    expect(dependencies).toEqual([{ bankLetter: "A", padNumber: 6 }]);
  });

  it("extracts Bank B Pad 1 from part index 6", () => {
    const content = [makeHeader(), makeStepNote(1, 6)].join("\n");
    const { dependencies } = parsePrmMetadata(content);
    expect(dependencies).toEqual([{ bankLetter: "B", padNumber: 1 }]);
  });

  it("extracts Bank H Pad 6 from part index 47", () => {
    const content = [makeHeader(), makeStepNote(1, 47)].join("\n");
    const { dependencies } = parsePrmMetadata(content);
    expect(dependencies).toEqual([{ bankLetter: "H", padNumber: 6 }]);
  });

  it("ignores slots with PART=-1 (inactive)", () => {
    // slot with part -1, velo > 0 — should be ignored
    const line = `STEP_NOTE_SMPL 1\t= PART1=-1 NOTE1=60 VELO1=100 LENG1=0 SUB1=0 PROB1=10 MT1=0 ` +
      Array.from({ length: 7 }, (_, i) => {
        const n = i + 2;
        return `PART${n}=-1 NOTE${n}=-1 VELO${n}=0 LENG${n}=0 SUB${n}=0 PROB${n}=10 MT${n}=0`;
      }).join(" ");
    const { dependencies } = parsePrmMetadata(line);
    expect(dependencies).toEqual([]);
  });

  it("ignores slots with VELO=0 (silent)", () => {
    const content = [makeHeader(), makeStepNote(1, 0, 0)].join("\n");
    const { dependencies } = parsePrmMetadata(content);
    expect(dependencies).toEqual([]);
  });

  it("deduplicates when same pad appears on multiple steps", () => {
    const content = [
      makeHeader(),
      makeStepNote(1, 0),
      makeStepNote(2, 0),
      makeStepNote(3, 0),
    ].join("\n");
    const { dependencies } = parsePrmMetadata(content);
    expect(dependencies).toHaveLength(1);
    expect(dependencies[0]).toEqual({ bankLetter: "A", padNumber: 1 });
  });

  it("collects multiple distinct pads from different steps", () => {
    const content = [
      makeHeader(),
      makeStepNote(1, 0),   // Bank A Pad 1
      makeStepNote(2, 6),   // Bank B Pad 1
      makeStepNote(3, 47),  // Bank H Pad 6
    ].join("\n");
    const { dependencies } = parsePrmMetadata(content);
    expect(dependencies).toHaveLength(3);
    expect(dependencies.map(d => `${d.bankLetter}${d.padNumber}`)).toEqual(["A1", "B1", "H6"]);
  });

  it("sorts dependencies bank A→H, pad 1→6", () => {
    const content = [
      makeHeader(),
      makeStepNote(1, 47), // H6
      makeStepNote(2, 6),  // B1
      makeStepNote(3, 0),  // A1
    ].join("\n");
    const { dependencies } = parsePrmMetadata(content);
    expect(dependencies.map(d => `${d.bankLetter}${d.padNumber}`)).toEqual(["A1", "B1", "H6"]);
  });

  it("ignores part index 48 (GRANULAR pad itself, not a sample)", () => {
    const content = [makeHeader(), makeStepNote(1, 48)].join("\n");
    const { dependencies } = parsePrmMetadata(content);
    expect(dependencies).toEqual([]);
  });
});

// ── Tests: GRANU_PHRASE ────────────────────────────────────────────────────

describe("parsePrmMetadata — granular phrase dependency", () => {
  it("extracts dependency from GRANU_PHRASE", () => {
    const content = `${makeHeader()}\nGRANU_PHRASE\t= 6`;
    const { dependencies } = parsePrmMetadata(content);
    // index 6 → Bank B Pad 1
    expect(dependencies).toContainEqual({ bankLetter: "B", padNumber: 1 });
  });

  it("ignores GRANU_PHRASE = -1", () => {
    const content = `${makeHeader()}\nGRANU_PHRASE\t= -1`;
    const { dependencies } = parsePrmMetadata(content);
    expect(dependencies).toEqual([]);
  });

  it("deduplicates granular phrase with a matching step note", () => {
    const content = [
      makeHeader(),
      makeStepNote(1, 6),      // Bank B Pad 1
      "GRANU_PHRASE\t= 6",     // Bank B Pad 1 again
    ].join("\n");
    const { dependencies } = parsePrmMetadata(content);
    expect(dependencies).toHaveLength(1);
  });
});

// ── Tests: groupDependenciesByBank ────────────────────────────────────────

describe("groupDependenciesByBank", () => {
  it("groups pads by bank letter", () => {
    const deps = [
      { bankLetter: "A", padNumber: 1 },
      { bankLetter: "A", padNumber: 3 },
      { bankLetter: "B", padNumber: 2 },
    ];
    expect(groupDependenciesByBank(deps)).toEqual({ A: [1, 3], B: [2] });
  });

  it("returns empty object for empty input", () => {
    expect(groupDependenciesByBank([])).toEqual({});
  });

  it("sorts pads within each bank", () => {
    const deps = [
      { bankLetter: "A", padNumber: 5 },
      { bankLetter: "A", padNumber: 2 },
      { bankLetter: "A", padNumber: 1 },
    ];
    expect(groupDependenciesByBank(deps)).toEqual({ A: [1, 2, 5] });
  });
});

// ── Tests: SCALE_NAMES ────────────────────────────────────────────────────

describe("SCALE_NAMES", () => {
  it("has entries for all 6 scale values", () => {
    expect(Object.keys(SCALE_NAMES)).toHaveLength(6);
    for (let i = 0; i <= 5; i++) {
      expect(SCALE_NAMES[i]).toBeDefined();
    }
  });
});
