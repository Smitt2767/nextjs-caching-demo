/**
 * The three hero variants, and how long one costs to render.
 *
 * Shared by the experiment panel (which shows *which* variant you got) and the
 * cached panel (which shows that rendering it is paid for once per variant
 * rather than once per visitor). Two components rendering the same copy from
 * two definitions would drift, and the drift would look like a caching bug.
 */

export const HERO_COPY: Record<string, { headline: string; body: string }> = {
  control: {
    headline: "Ship your side project this weekend",
    body: "Everything you need, nothing you don't.",
  },
  urgency: {
    headline: "Your competitors shipped last week",
    body: "Stop planning. Start deploying. Today.",
  },
  reassurance: {
    headline: "Take your time. We'll be here.",
    body: "No credit card, no deadline, no pressure.",
  },
};

/**
 * Stands in for a hero that is genuinely expensive to build — a personalised
 * product grid, a pricing table, anything with a query behind it.
 *
 * Fixed and deliberately obvious, for the reason RESEARCH.md gives for the
 * 2000ms slots on /ppr: a saving you have to squint at proves nothing.
 */
export const HERO_RENDER_MS = 600;
