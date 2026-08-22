#!/usr/bin/env node

/*
 * Fetch live ESPN fantasy player data and (re)write ../data/players.js.
 *
 *   node scripts/fetch-adp.mjs [season]
 *
 * ESPN's public kona_player_info endpoint.
 *
 * Each entry:
 *   { name, pos, team, adp }
 *
 * ADP comes from ESPN's ownership.averageDraftPosition.
 * If ESPN has no ADP yet, we fall back to the PPR draft rank.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SEASON = process.argv[2] || "2026";
const LIMIT = 500;
const KEEP = 300;

// ESPN position IDs
const POS = {
  1: "QB",
  2: "RB",
  3: "WR",
  4: "TE",
  5: "K",
  16: "DST",
};

// ESPN pro-team IDs
const TEAM = {
  0: "FA",
  1: "ATL",
  2: "BUF",
  3: "CHI",
  4: "CIN",
  5: "CLE",
  6: "DAL",
  7: "DEN",
  8: "DET",
  9: "GB",
  10: "TEN",
  11: "IND",
  12: "KC",
  13: "LV",
  14: "LAR",
  15: "MIA",
  16: "MIN",
  17: "NE",
  18: "NO",
  19: "NYG",
  20: "NYJ",
  21: "PHI",
  22: "ARI",
  23: "PIT",
  24: "LAC",
  25: "SF",
  26: "SEA",
  27: "TB",
  28: "WSH",
  29: "CAR",
  30: "JAX",
  33: "BAL",
  34: "HOU",
};

const URL =
  `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}` +
  `/segments/0/leaguedefaults/3?view=kona_player_info`;

const FILTER = {
  players: {
    limit: LIMIT,

    // ESPN requires a sort when using a player limit.
    // PPR is used only for ordering the returned pool.
    sortDraftRanks: {
      sortPriority: 100,
      sortAsc: true,
      value: "PPR",
    },
  },
};

console.log(`Fetching ESPN player pool for ${SEASON}...`);
console.log(URL);

const res = await fetch(URL, {
  headers: {
    "X-Fantasy-Filter": JSON.stringify(FILTER),
    "User-Agent": "Mozilla/5.0",
    Accept: "application/json",
  },
});

if (!res.ok) {
  const body = await res.text().catch(() => "");
  console.error(`ESPN ${res.status} ${res.statusText}`);

  if (body) {
    console.error(body.slice(0, 500));
  }

  process.exit(1);
}

const data = await res.json();
const raw = data.players || [];

if (!raw.length) {
  console.error(
    "No players returned — ESPN may have changed the API response."
  );
  process.exit(1);
}

console.log(`ESPN returned ${raw.length} players.`);

const players = [];

for (const row of raw) {
  const p = row.player || {};

  const pos = POS[p.defaultPositionId];

  // Ignore IDP / unknown positions.
  if (!pos) continue;

  const adpRaw = p.ownership?.averageDraftPosition;

  const pprRank =
    p.draftRanksByRankType?.PPR?.rank;

  const adp =
    adpRaw && adpRaw > 0
      ? adpRaw
      : pprRank || 999;

  const name = (p.fullName || "")
    .replace(/\s+D\/ST$/, " D/ST")
    .trim();

  if (!name) continue;

  players.push({
    name,
    pos,
    team: TEAM[p.proTeamId] || "FA",
    adp: Math.round(adp * 10) / 10,
  });
}

// Lowest ADP = earliest draft selection.
players.sort((a, b) => a.adp - b.adp);

const board = players.slice(0, KEEP);

const counts = board.reduce((m, p) => {
  m[p.pos] = (m[p.pos] || 0) + 1;
  return m;
}, {});

const lines = board.map(
  (p) =>
    `  { name: ${JSON.stringify(p.name)}, pos: ${JSON.stringify(p.pos)}, ` +
    `team: ${JSON.stringify(p.team)}, adp: ${p.adp} },`
);

const out = `/*
 * Steak Frites — draft player pool. GENERATED from live ESPN ADP.
 * Source: ESPN fantasy (season ${SEASON}), pulled ${new Date()
   .toISOString()
   .slice(0, 10)}.
 * Regenerate:  node scripts/fetch-adp.mjs [season]
 * Each entry: { name, pos, team, adp }
 * adp = ESPN average draft position, with PPR rank as fallback.
 */

window.PLAYERS = [
${lines.join("\n")}
];

`;

const dir = dirname(fileURLToPath(import.meta.url));
const target = join(dir, "..", "data", "players.js");

writeFileSync(target, out);

console.log(`\nWrote ${board.length} players -> data/players.js`);
console.log("By position:", counts);

console.log(
  "Top 5:",
  board
    .slice(0, 5)
    .map((p) => `${p.name} (${p.pos} ${p.adp})`)
    .join(", ")
);