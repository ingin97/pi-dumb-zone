/**
 * Pi Dumb Zone
 *
 * A deliberately deterministic heuristic for suspiciously agreeable assistant
 * responses. It does not make model calls or inspect anything outside the
 * current assistant message.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// Add a case-insensitive regular expression here to flag another phrase. The
// matcher adds the global flag automatically, so `/your phrase/i` is enough.
export const DUMB_ZONE_PATTERNS: readonly RegExp[] = [
  // "You are absolutely right.", "You're completely right.", "You’re exactly right."
  /\byou(?:\s+are|['’]re)\s+(?:absolutely|completely|exactly)\s+right\b/i,
  // "You're right to question that."
  /\byou(?:\s+are|['’]re)\s+right\s+to\s+question\s+that\b/i,
  // "That's actually the better approach."
  /\bthat['’]?s\s+actually\s+the\s+better\s+approach\b/i,
  // "Exactly — the key thing is..."
  /\bexactly\s*(?:—|--|-|,)?\s*the\s+key\s+thing\s+is\b/i,
  // "100%."
  /\b100\s*%(?!\w)/i,
  // "I couldn't agree more."
  /\bi\s+couldn['’]?t\s+agree\s+more\b/i,
  // "That's an excellent point."
  /\bthat['’]?s\s+an\s+excellent\s+point\b/i,
];
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
const APPROACHING_DUMB_ZONE_TOKENS = 100_000;

function visibleWidth(text: string): number {
  return text.replace(ANSI_PATTERN, "").length;
}

function truncateToWidth(text: string, width: number, ellipsis = "..."): string {
  if (visibleWidth(text) <= width) return text;
  const plain = text.replace(ANSI_PATTERN, "");
  if (width <= visibleWidth(ellipsis)) return ellipsis.slice(0, width);
  return `${plain.slice(0, width - visibleWidth(ellipsis))}${ellipsis}`;
}

function sanitizeStatusText(text: string): string {
  return text.replace(/[\r\n\t]/g, " ").replace(/ +/g, " ").trim();
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

export function contextUsageDisplay(
  percent: number | null | undefined,
  contextWindow: number,
): string {
  const formattedPercent = percent != null ? percent.toFixed(1) : "?";
  return formattedPercent === "?"
    ? `?/${formatTokens(contextWindow)} (auto)`
    : `${formattedPercent}%/${formatTokens(contextWindow)} (auto)`;
}

function centerText(text: string, width: number): string {
  const padding = Math.max(0, width - visibleWidth(text));
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return `${" ".repeat(left)}${text}${" ".repeat(right)}`;
}

function boxedAlert(
  theme: ExtensionContext["ui"]["theme"],
  color: "error" | "warning",
  title: string,
  detail: string,
  width = 24,
): string {
  const border = theme.fg(color, `╭${"─".repeat(width + 2)}╮`);
  const divider = theme.fg(color, `├${"─".repeat(width + 2)}┤`);
  const bottom = theme.fg(color, `╰${"─".repeat(width + 2)}╯`);
  const line = (text: string) =>
    `${theme.fg(color, "│")} ${centerText(text, width)} ${theme.fg(color, "│")}`;

  return [border, line(theme.fg(color, title)), divider, line(detail), bottom].join("\n");
}

export function dumbZoneAlert(
  theme: ExtensionContext["ui"]["theme"],
  count: number,
  phrase: string,
): string {
  const detail = `matched: ${sanitizeStatusText(phrase)}`;
  return boxedAlert(
    theme,
    "error",
    `DUMB ZONE (${count})`,
    detail,
    Math.max(24, visibleWidth(detail)),
  );
}

function approachingDumbZoneAlert(theme: ExtensionContext["ui"]["theme"]): string {
  return boxedAlert(
    theme,
    "warning",
    "APPROACHING DUMB ZONE",
    `${formatTokens(APPROACHING_DUMB_ZONE_TOKENS)} context tokens`,
  );
}

export type Detection = {
  phrase: string;
  occurrences: number;
};

export function dumbZoneIndicator(
  detections: number,
  contextTokens: number,
): { color: "success" | "warning" | "error"; label?: string } {
  if (detections > 0) return { color: "error" };
  if (contextTokens >= APPROACHING_DUMB_ZONE_TOKENS) {
    return { color: "warning", label: "APPROACHING DUMB ZONE" };
  }
  return { color: "success" };
}

/** Returns a detection for a targeted strong-agreement phrase, or null. */
export function detectDumbZone(text: string): Detection | null {
  const matches = DUMB_ZONE_PATTERNS.flatMap((pattern) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    return Array.from(text.matchAll(new RegExp(pattern.source, flags)), (match) => ({
      phrase: match[0],
      index: match.index ?? 0,
    }));
  }).sort((a, b) => a.index - b.index);

  return matches.length > 0
    ? { phrase: matches[0].phrase, occurrences: matches.length }
    : null;
}

export function assistantText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        !!part &&
        typeof part === "object" &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n");
}

export default function dumbZone(pi: ExtensionAPI): void {
  let detections = 0;
  let contextWarningShown = false;

  const installFooter = (ctx: ExtensionContext): void => {
    if (!ctx.hasUI) return;

    ctx.ui.setFooter((_tui, theme, footerData) => {
      return {
        invalidate(): void {},
        render(width: number): string[] {
          const contextUsage = ctx.getContextUsage();
          const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
          const contextTokens = contextUsage?.tokens ?? 0;
          const contextPercentValue = contextUsage?.percent ?? 0;
          const contextPercentDisplay = contextUsageDisplay(
            contextUsage?.percent,
            contextWindow,
          );
          const contextPercentStr =
            contextPercentValue > 90
              ? theme.fg("error", contextPercentDisplay)
              : contextPercentValue > 70
                ? theme.fg("warning", contextPercentDisplay)
                : contextPercentDisplay;

          const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
          let latestCacheHitRate: number | undefined;
          for (const entry of ctx.sessionManager.getEntries()) {
            const entryUsage =
              entry.type === "message" && "usage" in entry.message
                ? entry.message.usage
                : (entry.type === "branch_summary" || entry.type === "compaction") && "usage" in entry
                  ? entry.usage
                  : undefined;
            if (!entryUsage) continue;
            usage.input += entryUsage.input ?? 0;
            usage.output += entryUsage.output ?? 0;
            usage.cacheRead += entryUsage.cacheRead ?? 0;
            usage.cacheWrite += entryUsage.cacheWrite ?? 0;
            usage.cost += entryUsage.cost?.total ?? 0;
            if (entry.type === "message" && entry.message.role === "assistant") {
              const promptTokens =
                (entryUsage.input ?? 0) +
                (entryUsage.cacheRead ?? 0) +
                (entryUsage.cacheWrite ?? 0);
              latestCacheHitRate =
                promptTokens > 0 ? ((entryUsage.cacheRead ?? 0) / promptTokens) * 100 : undefined;
            }
          }

          const indicator = dumbZoneIndicator(detections, contextTokens);
          const statsParts: string[] = [];
          if (usage.input) statsParts.push(`↑${formatTokens(usage.input)}`);
          if (usage.output) statsParts.push(`↓${formatTokens(usage.output)}`);
          if (usage.cacheRead) statsParts.push(`R${formatTokens(usage.cacheRead)}`);
          if (usage.cacheWrite) statsParts.push(`W${formatTokens(usage.cacheWrite)}`);
          if (latestCacheHitRate !== undefined) statsParts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
          const usingSubscription = (ctx.model as { provider?: string } | undefined)?.provider === "kimi-coding";
          if (usage.cost || usingSubscription) {
            statsParts.push(`$${usage.cost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`);
          }
          statsParts.push(contextPercentStr);
          if (indicator.label) statsParts.push(theme.fg(indicator.color, indicator.label));
          statsParts.push(theme.fg(indicator.color, "⬤"));

          const modelName = ctx.model?.id || "no-model";
          const rightSide = ctx.model?.reasoning
            ? ctx.thinkingLevel === "off"
              ? `${modelName} • thinking off`
              : `${modelName} • ${ctx.thinkingLevel}`
            : modelName;
          let statsLeft = statsParts.join(" ");
          if (visibleWidth(statsLeft) > width) statsLeft = truncateToWidth(statsLeft, width);

          const statsLeftWidth = visibleWidth(statsLeft);
          const rightSideWidth = visibleWidth(rightSide);
          const statsLine =
            statsLeftWidth + 2 + rightSideWidth <= width
              ? statsLeft + " ".repeat(width - statsLeftWidth - rightSideWidth) + rightSide
              : statsLeft;

          let pwd = ctx.sessionManager.getCwd();
          const branch = footerData.getGitBranch();
          if (branch) pwd = `${pwd} (${branch})`;
          const sessionName = ctx.sessionManager.getSessionName();
          if (sessionName) pwd = `${pwd} • ${sessionName}`;

          const lines = [
            truncateToWidth(theme.fg("dim", pwd), width, theme.fg("dim", "...")),
            theme.fg("dim", statsLine),
          ];

          const extensionStatuses = footerData.getExtensionStatuses();
          if (extensionStatuses.size > 0) {
            const statusLine = Array.from(extensionStatuses.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([, text]) => sanitizeStatusText(text))
              .join(" ");
            lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
          }

          return lines;
        },
      };
    });
  };

  pi.on("session_start", async (_event, ctx) => {
    detections = 0;
    contextWarningShown = false;
    installFooter(ctx);
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;

    const detection = detectDumbZone(assistantText(event.message));
    if (detection) {
      detections += detection.occurrences;
      installFooter(ctx);

      if (ctx.hasUI) {
        // The alert colors its own box. An error notification prepends "Error:",
        // which misaligns the box in the status area.
        ctx.ui.notify(dumbZoneAlert(ctx.ui.theme, detections, detection.phrase));
      }
    }

    if (!contextWarningShown && (ctx.getContextUsage()?.tokens ?? 0) >= APPROACHING_DUMB_ZONE_TOKENS) {
      contextWarningShown = true;
      if (ctx.hasUI) ctx.ui.notify(approachingDumbZoneAlert(ctx.ui.theme));
    }
  });
}
