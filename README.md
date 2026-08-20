# 🥩 Steak Frites — Mock Draft

A self-contained mock-draft simulator for the **Steak Frites** fantasy league. Snake
draft with keepers, AI opponents that draft to ADP with distinct strategies, and a UI
to draft your own team (or watch the whole thing run).

No build step, no install — **open `index.html` in a browser.**

```bash
open index.html          # macOS
# or just double-click index.html
```

## League settings

| | |
|---|---|
| Teams | 10 |
| Scoring | ½ PPR |
| Draft | Snake, with keepers |
| Starters | **QB · 2 RB · 2 WR · 2 FLEX · TE · K · DST** (10) |
| Flex | RB / WR / TE |
| Bench | 6 |
| Rounds | 16 |

## How it works

1. **Setup** — name the teams, give each one a draft **strategy**, pick which team is
   *you*, and (optionally) add keepers.
2. **Draft** — AI teams pick automatically to ADP (nudged by their strategy); when
   you're on the clock, click an available player. Controls let you *auto-pick* your
   turn, *sim to your next pick*, or *auto-draft all* to watch it play out. Adjust the
   speed of the AI picks.
3. **Results** — every team's final roster, laid out by lineup slot.

### Draft strategies

Every team follows one personality — the difference is entirely **when they take RBs**:

- **2-RB (robust RB)** — two RBs in the first few rounds, then best available.
- **Hero RB** — one anchor RB early, load up WR/TE, circle back to RB later.
- **Zero RB** — no RB before round 5; hammer WR/TE/QB first, then attack RB.

Everyone still fills a legal roster (a QB, ≥2 RB, ≥2 WR, a TE, a K and a DST), and
K/DST come off the board late, the way real drafts go.

### Keepers

Add a keeper on the setup screen: pick the player, the team, and the **round** it costs.
The keeper is locked onto that team and consumes its pick in that round (so the team
makes one fewer live pick). If a team keeps two players on the same round, the second
bumps to the nearest free round. Leave it empty for a straight draft.

### League defaults

`data/league.js` pre-fills the setup screen with this league's **draft order**, **keepers**,
and which slot is you (`Ben W`). Everything is still editable before you start — the config
is just the starting point. Edit that file to change the defaults permanently (see the
comments in it for the format); delete it and the app falls back to generic Team 1–10.
Draft *strategies* aren't set there — pick them per team on the setup screen.

## Updating ADP

`data/players.js` is generated from **live ESPN ADP**. Refresh it anytime (needs Node 18+):

```bash
node scripts/fetch-adp.mjs          # current season (2026)
node scripts/fetch-adp.mjs 2027     # a specific season
```

The script pulls ESPN's public player endpoint, keeps QB/RB/WR/TE/K/DST, orders by ADP
(`ownership.averageDraftPosition`, falling back to ESPN's PPR draft rank for players with
no crowd ADP yet), and rewrites `data/players.js`. Each entry is `{ name, pos, team, adp }`;
the draft order and the AI both read `adp`. No API key is required.

## Project structure

```
index.html            app shell (loads the scripts + styles)
data/players.js        ADP-ranked player pool (window.PLAYERS) — generated from live ESPN ADP
data/league.js         league defaults: draft order + keepers + your team (pre-fills setup)
src/draft.js           draft engine: snake order, keepers, roster rules, AI strategies (pure logic)
src/styles.css         theme + layout
src/app.js             UI controller: setup, draft loop, results
scripts/fetch-adp.mjs  refresh data/players.js from live ESPN ADP  (node scripts/fetch-adp.mjs)
```

The engine (`src/draft.js`) is pure logic with no DOM, so it's easy to test or reuse.
