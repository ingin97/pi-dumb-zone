import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assistantText,
  detectDumbZone,
  dumbZoneIndicator,
} from "./dumb-zone.ts";

describe("detectDumbZone", () => {
  it("detects the phrase regardless of case", () => {
    assert.deepEqual(detectDumbZone("You Are Absolutely Right."), {
      phrase: "You Are Absolutely Right",
      occurrences: 1,
    });
  });

  it("detects contractions, curly apostrophes, and completely", () => {
    assert.equal(detectDumbZone("You're absolutely right.")?.occurrences, 1);
    assert.equal(detectDumbZone("You’re completely right.")?.occurrences, 1);
    assert.equal(detectDumbZone("You are completely right.")?.occurrences, 1);
  });

  it("allows flexible whitespace", () => {
    assert.equal(detectDumbZone("You are\n  absolutely\tright.")?.occurrences, 1);
  });

  it("counts multiple occurrences", () => {
    assert.equal(
      detectDumbZone("You are absolutely right. YOU'RE COMPLETELY RIGHT!")?.occurrences,
      2,
    );
  });

  it("detects the additional strong-agreement phrases", () => {
    const phrases = [
      "You're right to question that.",
      "That's actually the better approach.",
      "Exactly — the key thing is...",
      "You’re exactly right.",
      "100%.",
      "I couldn’t agree more.",
      "That’s an excellent point.",
    ];

    for (const phrase of phrases) {
      assert.equal(detectDumbZone(phrase)?.occurrences, 1, phrase);
    }
  });

  it("rejects near misses", () => {
    assert.equal(detectDumbZone("You are right."), null);
    assert.equal(detectDumbZone("You are absolutely righteous."), null);
    assert.equal(detectDumbZone("They are absolutely right."), null);
  });
});

describe("dumbZoneIndicator", () => {
  it("turns yellow and warns at 100k context tokens", () => {
    assert.deepEqual(dumbZoneIndicator(0, 100_000), {
      color: "warning",
      label: "APPROACHING DUMB ZONE",
    });
  });

  it("keeps the red detection state higher priority", () => {
    assert.deepEqual(dumbZoneIndicator(1, 100_000), { color: "error" });
  });

  it("stays green below the context warning threshold", () => {
    assert.deepEqual(dumbZoneIndicator(0, 99_999), { color: "success" });
  });
});


describe("assistantText", () => {
  it("extracts only text content", () => {
    assert.equal(
      assistantText({
        content: [
          { type: "thinking", thinking: "You are absolutely right" },
          { type: "text", text: "First" },
          { type: "image", data: "ignored" },
          { type: "text", text: "Second" },
        ],
      }),
      "First\nSecond",
    );
  });

  it("supports string content and safely ignores invalid content", () => {
    assert.equal(assistantText({ content: "plain text" }), "plain text");
    assert.equal(assistantText({ content: [{ type: "text", text: 42 }] }), "");
    assert.equal(assistantText(null), "");
  });
});
