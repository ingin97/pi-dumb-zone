import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewedSummary, shouldReviewCompaction } from "./compaction-review.ts";

describe("shouldReviewCompaction", () => {
  it("reviews manual and threshold compaction in the TUI", () => {
    assert.equal(shouldReviewCompaction("manual", "tui", true), true);
    assert.equal(shouldReviewCompaction("threshold", "tui", true), true);
  });

  it("skips overflow recovery", () => {
    assert.equal(shouldReviewCompaction("overflow", "tui", true), false);
  });

  it("skips non-interactive modes and missing UI", () => {
    assert.equal(shouldReviewCompaction("manual", "rpc", true), false);
    assert.equal(shouldReviewCompaction("manual", "json", true), false);
    assert.equal(shouldReviewCompaction("manual", "print", true), false);
    assert.equal(shouldReviewCompaction("manual", "tui", false), false);
  });
});

describe("reviewedSummary", () => {
  it("uses the edited summary when it contains content", () => {
    assert.equal(reviewedSummary("original", "edited"), "edited");
  });

  it("falls back to the original summary when cancelled or emptied", () => {
    assert.equal(reviewedSummary("original", undefined), "original");
    assert.equal(reviewedSummary("original", "   \n"), "original");
  });
});
