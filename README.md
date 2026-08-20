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
makes one fewer live pick). Leave it empty for a straight draft.

## Updating ADP

`data/players.js` is a **seed** board ordered by approximate half-PPR ADP — it is *not*
live ESPN ADP. Before a real mock, refresh it: replace the array with the current board
(each entry is `{ name, pos, team, adp }`, `adp` = overall rank, 1 = first off the board;
`pos` ∈ `QB | RB | WR | TE | K | DST`). The draft order and the AI both read `adp`.

## Project structure

```
index.html        app shell (loads the three scripts + styles)
data/players.js    the ADP-ranked player pool  (window.PLAYERS)  — edit this to refresh
src/draft.js       draft engine: snake order, keepers, roster rules, AI strategies (pure logic)
src/styles.css     theme + layout
src/app.js         UI controller: setup, draft loop, results
```

The engine (`src/draft.js`) is pure logic with no DOM, so it's easy to test or reuse.
