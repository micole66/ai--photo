#!/usr/bin/env node
// polymarket_hype_scan.mjs
//
// Scan Polymarket "pop culture" (Culture tag_id=596) markets for the pattern:
//   YES is bid up above a threshold (default 0.80) on hype, while the
//   fundamental/base-rate answer is likely NO.
//
// Data source: Gamma API  https://gamma-api.polymarket.com
//   /markets?tag_id=596&closed=false&active=true&order=volume24hr&ascending=false
//
// It cannot know the "correct" answer, so it produces a transparent HEURISTIC
// "NO-likelihood / fragility" score from market structure signals:
//   - YES price level (higher = more to fade)
//   - recent momentum (1d/1w/1m price change) — sharp pumps are fragile
//   - thin liquidity (easy to be moved by hype)
//   - competition (many sibling "Yes/No" candidates in the same event => each
//     candidate's true probability is diluted) — optional, via event grouping
//   - time-to-resolution with a very specific narrative
//
// Usage:
//   node polymarket_hype_scan.mjs [--yes-min 0.80] [--pages 20] [--limit 100]
//                                 [--json out.json] [--md out.md]
//
// No external deps. Node 18+ (uses global fetch).

const BASE = "https://gamma-api.polymarket.com";
const CULTURE_TAG_ID = 596;

function parseArgs(argv) {
  const a = {
    yesMin: 0.8,
    pages: 20,
    limit: 100,
    maxRows: null,
    json: null,
    md: null,
    live: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--yes-min") a.yesMin = parseFloat(next());
    else if (k === "--pages") a.pages = parseInt(next(), 10);
    else if (k === "--limit") a.limit = parseInt(next(), 10);
    else if (k === "--max-rows") a.maxRows = parseInt(next(), 10);
    else if (k === "--json") a.json = next();
    else if (k === "--md") a.md = next();
    else if (k === "--help" || k === "-h") a.help = true;
  }
  return a;
}

async function fetchMarketsPage(offset, limit) {
  const url =
    `${BASE}/markets?tag_id=${CULTURE_TAG_ID}` +
    `&closed=false&active=true&limit=${limit}&offset=${offset}` +
    `&order=volume24hr&ascending=false`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 422) return { done: true, page: [] }; // offset beyond API limit
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  return { done: false, page: Array.isArray(data) ? data : [] };
}

// Parse the outcomePrices / outcomes JSON strings safely.
function parseOutcomes(m) {
  let outcomes = [];
  let prices = [];
  try {
    outcomes = typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : m.outcomes || [];
  } catch {
    outcomes = [];
  }
  try {
    prices =
      typeof m.outcomePrices === "string"
        ? JSON.parse(m.outcomePrices).map(Number)
        : (m.outcomePrices || []).map(Number);
  } catch {
    prices = [];
  }
  return { outcomes, prices };
}

// Classify a market's *kind* from its question text. This matters because a
// high YES means very different things depending on the question shape:
//   - "Will X be nominated for ...?"  -> after nominations drop, YES≈certain. NOT hype.
//   - "Will X win / be the best / #1 / top ...?" -> winner-take-all race. REAL hype risk.
//   - "Will [metric] be at least N?"  -> specific high bar. Often hype if bid up.
//   - "Will X happen by <date>?"      -> event bet. Depends on base rate.
function classifyKind(question) {
  const q = String(question).toLowerCase();
  if (/\bnominat/.test(q)) return "nomination";
  if (/\b(win|winner|wins|best|top|#1|number one|no\.?\s?1|highest|most|champion|first place|beats?|outgross|more than)\b/.test(q))
    return "winnerRace";
  if (/\bat least\b|\bor more\b|\bor above\b|\b>=|\bmetascore\b|\bscore\b|\bgross\b|sales be\b/.test(q))
    return "threshold";
  if (/\bby (november|december|january|april|june|the end|end of)\b/.test(q)) return "byDeadline";
  return "other";
}

// Heuristic fragility score in [0,1]; higher = more likely a hype-inflated YES.
//
// Key insight: a market at 99% that barely moved is NOT hype — it's near-certain
// and YES is the correct answer (an ANTI-target). Real "pumped YES, likely NO"
// cases look like:
//   - a candidate in a multi-way race (winners take all) bid to 80%+ on attention
//   - a specific unlikely threshold bid up on narrative
//   - thin liquidity + a sharp rise toward high YES with no resolution progress
function fragilityScore(row) {
  const yes = row.yes;
  if (yes == null) return 0;

  // Nominations that are essentially locked in after the announcement are
  // information, not hype. They are not a fade-the-YES target.
  if (row.kind === "nomination" && yes >= 0.9) return 0;

  const ch = row.changes;
  const absMom = [ch.d1, ch.w1, ch.m1]
    .filter((v) => v != null && Number.isFinite(v))
    .reduce((s, v) => s + Math.abs(v), 0);

  // --- Near-certainty exclusion -------------------------------------------
  // YES already ≥ 0.97 and essentially stable => treat as correct, not hype.
  if (yes >= 0.97 && absMom < 0.04) return 0;
  // YES ≥ 0.995 regardless => effectively resolved/certain.
  if (yes >= 0.995) return 0;

  // 1) How much of the price is "extra" above a coin-flip (fade potential).
  const level = Math.max(0, (yes - 0.5) / 0.5); // 0 at 50%, ~1 at 100%

  // 2) Pump momentum: rise toward high YES. Only positive changes count as pump.
  const w = { d1: 0.5, w1: 0.3, m1: 0.2 };
  let rise = 0;
  let wsum = 0;
  for (const k of ["d1", "w1", "m1"]) {
    if (ch[k] != null && Number.isFinite(ch[k])) {
      rise += Math.max(0, ch[k]) * w[k];
      wsum += w[k];
    }
  }
  const momentum = wsum ? Math.max(0, Math.min(1, rise / wsum / 0.25)) : 0; // 1 if +25pt weighted

  // 3) Thin liquidity => easier to be moved by hype.
  const liq = row.liquidityNum;
  const liqScore =
    liq == null ? 0.5 : Math.max(0, Math.min(1, 1 - Math.log10(Math.max(liq, 100)) / 6));

  // 4) Competition: many sibling candidates in the same event dilute each YES.
  //    Strongest structural sign of an overpriced single candidate.
  const comp = Math.max(0, Math.min(1, (row.eventGroupSize - 1) / 4));

  // 5) Time-to-resolution with a specific narrative: mild factor.
  const days = row.daysToEnd;
  const timeScore = days == null ? 0.3 : Math.max(0, Math.min(1, days / 365));

  // Kind multiplier: winner-take-all races are the prime "pumped YES" habitat.
  let kindMult = 1.0;
  if (row.kind === "winnerRace") kindMult = 1.15;
  else if (row.kind === "nomination") kindMult = 0.35; // mostly informational
  else if (row.kind === "threshold") kindMult = 1.05;
  else if (row.kind === "byDeadline") kindMult = 0.9;

  // Combine (weights sum to 1). Competition + momentum are the real tells.
  let score =
    0.28 * level +
    0.34 * momentum +
    0.14 * liqScore +
    0.16 * comp +
    0.08 * timeScore;

  score *= kindMult;
  return Math.max(0, Math.min(1, score));
}

function isNearCertain(row) {
  if (row.yes == null) return true;
  const absMom = [row.changes.d1, row.changes.w1, row.changes.m1]
    .filter((v) => v != null && Number.isFinite(v))
    .reduce((s, v) => s + Math.abs(v), 0);
  if (row.yes >= 0.995) return true;
  if (row.yes >= 0.97 && absMom < 0.04) return true;
  return false;
}

function round(x, n = 3) {
  return Number.isFinite(x) ? Number(x.toFixed(n)) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("usage: node polymarket_hype_scan.mjs [--yes-min 0.80] [--pages 20] [--limit 100] [--json out.json] [--md out.md]");
    return;
  }

  const seen = new Set();
  const all = [];

  for (let p = 0; p < args.pages; p++) {
    const offset = p * args.limit;
    const { done, page } = await fetchMarketsPage(offset, args.limit);
    if (done || !page.length) break;
    let added = 0;
    for (const m of page) {
      if (m.id && seen.has(m.id)) continue;
      if (m.id) seen.add(m.id);
      added++;
      const { outcomes, prices } = parseOutcomes(m);

      // Keep only clean binary Yes/No markets.
      const norm = outcomes.map((o) => String(o).toLowerCase());
      const yesIdx = norm.findIndex((o) => o === "yes");
      const noIdx = norm.findIndex((o) => o === "no");
      if (yesIdx === -1) continue; // not a Yes/No market (e.g. multi-candidate)
      const yes = prices[yesIdx];
      if (!Number.isFinite(yes)) continue;

      const no = noIdx !== -1 ? prices[noIdx] : 1 - yes;

      // Event group size (# of Yes/No sibling markets in same event) for competition.
      const ev = Array.isArray(m.events) && m.events[0] ? m.events[0] : null;
      const eventSlug = ev ? ev.slug : m.slug;
      // group size is filled in a post-pass from the scan itself
      const eventGroupSize = 1;

      let daysToEnd = null;
      if (m.endDate) {
        const end = new Date(m.endDate).getTime();
        if (Number.isFinite(end)) daysToEnd = (end - Date.now()) / 86400000;
      }

      const row = {
        id: m.id,
        question: m.question,
        kind: classifyKind(m.question),
        slug: m.slug,
        eventSlug,
        eventGroupSize,
        yes: round(yes),
        no: round(no),
        spread: round(m.spread),
        liquidityNum: m.liquidityNum != null ? Number(m.liquidityNum) : null,
        volume24hr: m.volume24hr != null ? Number(m.volume24hr) : null,
        changes: {
          d1: m.oneDayPriceChange != null ? Number(m.oneDayPriceChange) : null,
          w1: m.oneWeekPriceChange != null ? Number(m.oneWeekPriceChange) : null,
          m1: m.oneMonthPriceChange != null ? Number(m.oneMonthPriceChange) : null,
          y1: m.oneYearPriceChange != null ? Number(m.oneYearPriceChange) : null,
        },
        daysToEnd: daysToEnd != null ? Math.round(daysToEnd) : null,
        feeType: m.feeType || null,
        endDate: m.endDate || null,
      };

      all.push(row);
    }
    if (added === 0) break;
    // small politeness delay
    await new Promise((r) => setTimeout(r, 150));
  }

  // Post-pass: compute event group sizes (# binary Yes/No candidates per event)
  // from the scan itself, then apply them to every row.
  const groupCounts = new Map();
  for (const r of all) {
    const key = r.eventSlug || r.slug;
    groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
  }
  for (const r of all) {
    const key = r.eventSlug || r.slug;
    r.eventGroupSize = groupCounts.get(key) || 1;
  }

  // Filter: YES >= threshold. Exclude near-certain (YES already correct).
  // Sort by fragility desc, then YES desc.
  const candidates = all
    .filter((r) => r.yes != null && r.yes >= args.yesMin)
    .filter((r) => !isNearCertain(r));

  const targets = candidates
    .map((r) => ({ ...r, fragility: round(fragilityScore(r), 3) }))
    .sort((a, b) => b.fragility - a.fragility || b.yes - a.yes);

  const limited = args.maxRows ? targets.slice(0, args.maxRows) : targets;

  const summary = {
    generatedAt: new Date().toISOString(),
    tagId: CULTURE_TAG_ID,
    yesMin: args.yesMin,
    totalMarketsScanned: all.length,
    binaryYesNo: all.length,
    yesAtOrAboveThreshold: candidates.length,
    nearCertainExcluded: all.length - candidates.filter((r) => r.yes != null && r.yes >= args.yesMin).length,
    returned: limited.length,
  };

  const payload = { summary, targets: limited };

  const jsonStr = JSON.stringify(payload, null, 2);
  if (args.json) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(args.json, jsonStr);
    console.error(`wrote ${args.json}`);
  }

  if (args.md) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(args.md, renderMd(payload));
    console.error(`wrote ${args.md}`);
  }

  if (!args.json && !args.md) {
    process.stdout.write(renderMd(payload) + "\n");
  } else if (!args.md) {
    // still echo a short summary to stderr
    console.error(renderMd(payload).split("\n").slice(0, 40).join("\n"));
  }
}

function fmtPct(x) {
  if (x == null) return "n/a";
  return (x * 100).toFixed(1) + "%";
}
function fmtChg(x) {
  if (x == null) return "n/a";
  const s = (x * 100).toFixed(1) + "%";
  return x > 0 ? "+" + s : s;
}
function fmtUsd(x) {
  if (x == null) return "n/a";
  if (x >= 1e6) return "$" + (x / 1e6).toFixed(2) + "M";
  if (x >= 1e3) return "$" + (x / 1e3).toFixed(1) + "k";
  return "$" + x.toFixed(0);
}

function renderMd(payload) {
  const { summary, targets } = payload;
  const L = [];
  L.push(`# Polymarket pop-culture: YES > ${(summary.yesMin * 100).toFixed(0)}% (hype) — likely NO`);
  L.push("");
  L.push(`Generated: ${summary.generatedAt}`);
  L.push(`Tag: Culture (tag_id=${summary.tagId}) · markets scanned: ${summary.totalMarketsScanned} · YES≥threshold: ${summary.yesAtOrAboveThreshold} · shown: ${summary.returned}`);
  L.push("");
  L.push("> Heuristic ranking. \"Fragility\" = how likely a high YES is hype-driven and NO is the fundamental answer. Signals: YES level, recent momentum (1d/1w/1m), thin liquidity, sibling competition, time-to-resolution. Not financial advice; verify fundamentals before acting.");
  L.push("");
  if (!targets.length) {
    L.push("_No markets with YES ≥ threshold found in the scanned sample._");
    return L.join("\n");
  }
  L.push("| # | Fragility | Kind | YES | NO | 1d | 1w | 1m | 24h vol | Liquidity | Question |");
  L.push("|---|-----------|------|-----|-----|----|----|----|---------|-----------|----------|");
  targets.forEach((r, i) => {
    L.push(
      `| ${i + 1} | ${(r.fragility * 100).toFixed(0)} | ${r.kind} | ${fmtPct(r.yes)} | ${fmtPct(r.no)} | ${fmtChg(r.changes.d1)} | ${fmtChg(r.changes.w1)} | ${fmtChg(r.changes.m1)} | ${fmtUsd(r.volume24hr)} | ${fmtUsd(r.liquidityNum)} | ${r.question.replace(/\|/g, "/")} |`
    );
  });
  L.push("");
  L.push("## Notes per top candidate");
  L.push("");
  for (const r of targets.slice(0, 5)) {
    L.push(`### ${r.question}`);
    L.push(`- YES ${fmtPct(r.yes)} / NO ${fmtPct(r.no)} · fragility ${(r.fragility * 100).toFixed(0)}/100`);
    L.push(`- Momentum: 1d ${fmtChg(r.changes.d1)} · 1w ${fmtChg(r.changes.w1)} · 1m ${fmtChg(r.changes.m1)} · 1y ${fmtChg(r.changes.y1)}`);
    L.push(`- Liquidity ${fmtUsd(r.liquidityNum)} · 24h vol ${fmtUsd(r.volume24hr)} · spread ${r.spread ?? "n/a"} · ends ${r.endDate ?? "n/a"} (${r.daysToEnd ?? "?"}d)`);
    L.push(`- Event: ${r.eventSlug} · candidates in event: ${r.eventGroupSize} · feeType ${r.feeType ?? "n/a"}`);
    L.push("");
  }
  return L.join("\n");
}

main().catch((e) => {
  console.error("error:", e.message || e);
  process.exit(1);
});