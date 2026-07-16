/**
 * The P-6 accepts at most ~10 MB of samples per import session, so a restore is
 * split into batches the user runs one power-cycle at a time. Getting these
 * boundaries wrong means either a failed import or more power-cycles than
 * necessary.
 */
import {
  buildBatchesBySize,
  MAX_SAMPLE_BATCH_BYTES,
} from "../../../renderer/hooks/useRestoreOrchestration";

const MB = 1024 * 1024;

describe("buildBatchesBySize", () => {
  it("returns no batches for no banks", () => {
    expect(buildBatchesBySize([], {})).toEqual([]);
  });

  it("keeps banks in one batch when they fit under the limit", () => {
    const batches = buildBatchesBySize(["a", "b", "c"], {
      a: 2 * MB,
      b: 3 * MB,
      c: 4 * MB,
    });
    expect(batches).toEqual([["a", "b", "c"]]);
  });

  it("starts a new batch once the limit would be exceeded", () => {
    const batches = buildBatchesBySize(["a", "b", "c"], {
      a: 6 * MB,
      b: 5 * MB, // 11 MB with a — must not ride along
      c: 1 * MB,
    });
    expect(batches).toEqual([["a"], ["b", "c"]]);
  });

  it("fills a batch exactly to the limit without splitting", () => {
    const batches = buildBatchesBySize(["a", "b"], {
      a: 6 * MB,
      b: MAX_SAMPLE_BATCH_BYTES - 6 * MB,
    });
    expect(batches).toEqual([["a", "b"]]);
  });

  it("splits when the total is one byte over the limit", () => {
    const batches = buildBatchesBySize(["a", "b"], {
      a: 6 * MB,
      b: MAX_SAMPLE_BATCH_BYTES - 6 * MB + 1,
    });
    expect(batches).toEqual([["a"], ["b"]]);
  });

  it("gives a bank that alone exceeds the limit its own batch", () => {
    const batches = buildBatchesBySize(["a", "big", "b"], {
      a: 1 * MB,
      big: 25 * MB,
      b: 1 * MB,
    });
    expect(batches).toEqual([["a"], ["big"], ["b"]]);
  });

  it("does not drop an oversized bank that arrives first", () => {
    const batches = buildBatchesBySize(["big", "a"], {
      big: 30 * MB,
      a: 1 * MB,
    });
    expect(batches).toEqual([["big"], ["a"]]);
    expect(batches.flat()).toEqual(["big", "a"]);
  });

  it("treats a bank with no recorded size as empty", () => {
    const batches = buildBatchesBySize(["a", "unknown"], { a: 1 * MB });
    expect(batches).toEqual([["a", "unknown"]]);
  });

  it("preserves every bank exactly once, in order", () => {
    const banks = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const sizes = Object.fromEntries(banks.map((b) => [b, 4 * MB]));
    const batches = buildBatchesBySize(banks, sizes);

    expect(batches.flat()).toEqual(banks);
    for (const batch of batches) {
      const total = batch.reduce((sum, b) => sum + sizes[b], 0);
      // Only a lone oversized bank may exceed the limit.
      if (batch.length > 1) expect(total).toBeLessThanOrEqual(MAX_SAMPLE_BATCH_BYTES);
    }
  });
});
