#!/usr/bin/env node
/*
 * Fetch live ESPN fantasy ADP and (re)write ../data/players.js.
 *
 *   node scripts/fetch-adp.mjs [season]
 *
 * Pulls ESPN's public player-info endpoint, keeps QB/RB/WR/TE/K/DST, orders by
 * ADP (ownership.averageDraftPosition, falling back to the PPR draft rank for
 * players with no crowd ADP yet), and writes the board the app reads.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SEASON = process.argv[2] || "2026";
const LIMIT = 400;                     // fetch deep enough to include K/DST
const KEEP = 240;                      // players to write (160-pick draft + buffer)

const POS = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST" };
const TEAM = {
  0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
  8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA",
  16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT",
  24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};

const URL = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${SEASON}` +
  `/segments/0/leaguedefaults/3?view=kona_player_info`;
const FILTER = {
  players: {
    limit: LIMIT,
    sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "PPR" },
  },
};

const res = await fetch(URL, {
  headers: {
    "x-fantasy-filter": JSON.stringify(FILTER),
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
  },
});
if (!res.ok) { console.error(`ESPN ${res.status} ${res.statusText}`); process.exit(1); }
const data = await res.json();
const raw = data.players || [];
if (!raw.length) { console.error("no players returned — ESPN may have changed the API"); process.exit(1); }

const players = [];
for (const row of raw) {
  const p = row.player || {};
  const pos = POS[p.defaultPositionId];
  if (!pos) continue;                                   // skip IDP/other
  const adpRaw = p.ownership && p.ownership.averageDraftPosition;
  const pprRank = p.draftRanksByRankType && p.draftRanksByRankType.PPR
    && p.draftRanksByRankType.PPR.rank;
  const adp = (adpRaw && adpRaw > 0) ? adpRaw : (pprRank || 999);
  players.push({
    name: (p.fullName || "").replace(/\s+D\/ST$/, " D/ST").trim(),
    pos, team: TEAM[p.proTeamId] || "FA", adp: Math.round(adp * 10) / 10,
  });
}

players.sort((a, b) => a.adp - b.adp);
const board = players.slice(0, KEEP);

const counts = board.reduce((m, p) => ((m[p.pos] = (m[p.pos] || 0) + 1), m), {});
const lines = board.map((p) =>
  `  { name: ${JSON.stringify(p.name)}, pos: ${JSON.stringify(p.pos)}, ` +
  `team: ${JSON.stringify(p.team)}, adp: ${p.adp} },`);
const out =
`/*
 * Steak Frites — draft player pool. GENERATED from live ESPN ADP.
 * Source: ESPN fantasy (season ${SEASON}), pulled ${new Date().toISOString().slice(0, 10)}.
 * Regenerate:  node scripts/fetch-adp.mjs [season]
 * Each entry: { name, pos, team, adp }  (adp = ESPN average draft position).
 */
window.PLAYERS = [
${lines.join("\n")}
];
`;

const dir = dirname(fileURLToPath(import.meta.url));
const target = join(dir, "..", "data", "players.js");
writeFileSync(target, out);
console.log(`wrote ${board.length} players -> data/players.js`);
console.log("by position:", counts);
console.log("top 5:", board.slice(0, 5).map((p) => `${p.name} (${p.pos} ${p.adp})`).join(", "));
