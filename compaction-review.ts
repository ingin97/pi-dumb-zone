/**
 * Compaction Review Spike
 *
 * Reuses Pi's built-in compaction implementation, then opens the generated
 * summary in Pi's multiline editor before the compaction result is persisted.
 */
import { compact, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

export function shouldReviewCompaction(
  reason: "manual" | "threshold" | "overflow",
  mode: "tui" | "rpc" | "json" | "print",
  hasUI: boolean,
): boolean {
  return hasUI && mode === "tui" && reason !== "overflow";
}

export default function compactionReview(pi: ExtensionAPI): void {
  pi.on("session_before_compact", async (event, ctx) => {
    if (!shouldReviewCompaction(event.reason, ctx.mode, ctx.hasUI)) return;

    const model = ctx.model;
    if (!model) {
      ctx.ui.notify("Compaction review skipped: no active model", "warning");
      return;
    }

    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
      ctx.ui.notify(`Compaction review skipped: ${auth.error}`, "warning");
      return;
    }

    try {
      // Generate the exact same kind of result Pi would normally generate.
      const generated = await compact(
        event.preparation,
        model,
        auth.apiKey,
        auth.headers,
        event.customInstructions,
        event.signal,
        ctx.thinkingLevel,
        undefined,
        auth.env,
      );

      const edited = await ctx.ui.editor("Review compaction summary", generated.summary);

      // Cancelling the editor keeps Pi's generated summary. An empty edit is
      // treated the same way so a stray delete cannot erase all context.
      const summary = edited?.trim() ? edited : generated.summary;
      if (edited !== undefined && !edited.trim()) {
        ctx.ui.notify("Empty compaction summary ignored; using Pi's generated summary", "warning");
      }

      return {
        compaction: {
          ...generated,
          summary,
        },
      };
    } catch (error) {
      if (!event.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Compaction review failed; using Pi default: ${message}`, "warning");
      }

      // Returning nothing falls back to Pi's normal compaction path.
      return;
    }
  });
}
