# 🥩 Steak Frites — Mock Draft

A self-contained mock-draft simulator for the **Steak Frites** fantasy league. Snake
draft with keepers, AI opponents that draft to ADP with distinct strategies, and a UI
to draft your own team (or watch the whole thing run).

No build step, no install — **open `index.html` in a browser**, or install it on your
phone as a home-screen app (see [On your iPhone](#on-your-iphone)).

```bash
open index.html          # macOS
# or just double-click index.html
```

## On your iPhone
yes pleacreen and runs it
fullscreen with its own icon — no Safari chrome, no App Store, and it works with no
signal once loaded (a service worker caches the whole app).

### 1. Publish it

Any static https host works. GitHub Pages is the shortest path:

```bash
# create the repo and push (needs the gh CLI: brew install gh)
gh repo create steak-frites-draft --public --source=. --push

# turn Pages on, serving from the main branch
gh api -X POST repos/:owner/steak-frites-draft/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

No `gh`? Create the repo at github.com/new, then:

```bash
git remote add origin https://github.com/<you>/steak-frites-draft.git
git push -u origin main
```

…and in the repo: **Settings → Pages → Source: Deploy from a branch → main / (root)**.

Either way the app lands at `https://<you>.github.io/steak-frites-draft/` a minute or
two later. Note a public repo makes `data/league.js` — your team names and everyone's
keepers — readable by anyone with the URL. Use a **private** repo if that matters;
Pages on a private repo needs a paid GitHub plan.

### 2. Install it

On the iPhone, open that URL **in Safari** (not Chrome — only Safari can install to the
home screen), then **Share → Add to Home Screen → Add**. It shows up as *Steak Frites*
with the frites icon and launches standalone.

### 3. Updating it

`git push` and Pages redeploys. The service worker is network-first, so a reopened app
picks up the new version on its own; bump `CACHE` in `sw.js` if you ever need to force
every cached file to refresh.

### Drafting on the phone

The draft screen is one panel at a time, with a bottom tab bar:

| Tab | |
|---|---|
| **Available** | the player pool — search, filter by position, tap a row to draft |
| **My team** | your roster by lineup slot |
| **Board** | every pick so far, newest first |

Tap **⋮** on any row in Available to re-rank that player without drafting them.

When you come on the clock the Available tab pulses and the app jumps back to it, so you
can sit on the board between picks without missing your turn. The clock bar stays pinned
to the top; its controls scroll sideways.

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

Two dials sit on the clock bar: **Speed** (how fast the AI picks tick by) and
**Random** (how much the AI strays from ADP — see [AI randomness](#ai-randomness)).

### Draft strategies

Every team is set to **Random** by default — its strategy is rolled when the draft
starts, so no two mocks have the same room. Half the time it's a free-for-all (each team
independent, 1-in-3 each); the other half **the room has a trend**: one strategy, picked
at random, that ~70% of the league is chasing. The draft board shows which you got
("*Hero RB is the trend this year — 7 of 10 teams*").

Set a team's strategy by hand and it is **never** overridden — pin one owner to Zero RB
and the other nine still roll around them.

The three personalities differ entirely in **when they take RBs**:

- **2-RB (robust RB)** — two RBs in the first few rounds, then best available.
- **Hero RB** — one anchor RB early, load up WR/TE, circle back to RB later.
- **Zero RB** — no RB before round 5; hammer WR/TE/QB first, then attack RB.

Everyone still fills a legal roster (a QB, ≥2 RB, ≥2 WR, a TE, a K and a DST), and
K/DST come off the board late, the way real drafts go.

### Your board (custom rankings)

The setup screen has a **Your board** card — open **Edit board** and you get the full
player pool in rank order. Tap anyone to open the move sheet: **▲/▼** shifts them a spot,
or type a rank and hit **Move** to jump them anywhere. **Reset to ESPN** puts one player
back; **Reset all** wipes the board clean.

**This is the market, not a cheat sheet.** The AI teams draft off the same board you're
editing, so moving a player up genuinely makes the league reach for them:

| Parker Washington (ESPN #85) | Taken around |
|---|---|
| left alone | pick 82 |
| moved to #8 | pick 12 |
| moved to #150 | pick 118 |

Under the hood the ESPN ADP values stay put as a fixed ladder of rungs, and a player's
effective ADP is whichever rung they're standing on. So reordering never invents fake
numbers — the real gaps between tiers survive, and only *who* occupies each slot changes.

You can also re-rank **mid-draft**: every row in the Available list has a **⋮** handle that
opens the same sheet (tapping the row itself still drafts). The AI reads the board at each
pick, so a bump takes effect on the very next pick, not the next mock.

Your board is saved in the browser, so it survives closing the app. A moved player carries a
**▲12 / ▼8** badge showing the gap vs ESPN — only players *you* moved get badged, not the
ones who drift a spot because someone jumped over them. K and DST are still held back until
round 13 no matter where you rank them; that gate lives in the draft engine.

### AI randomness

How deep down the board an AI team is willing to look. A team considers everyone within
`reach` of the best player left and picks among them **weighted toward the top**, so most
picks are near-ADP while a genuine reach happens often enough to keep mocks distinct. Set
it on the setup screen, or change it **mid-draft** from the clock bar (it applies from the
next pick on). Your choice is remembered.

| | Reach | Different 1.01s in 60 mocks | Pick-for-pick repeat | Your roster repeat |
|---|---|---|---|---|
| **Chalky** | 0 | 2 | 54% | 55% |
| **Normal** (default) | 18 | 12 | 9% | 15% |
| **Loose** | 34 | 16 | 6% | 15% |
| **Chaos** | 60 | 22 | 4% | 13% |

**Chalky** is strictly best-available. It's identical every time *only if you also set the
strategies by hand* — with teams on Random the strategy roll still varies the draft. Pin
the strategies and Chalky becomes a fixed baseline, which is the way to test a board edit:
run it, move a player, run it again, and every difference is your edit rather than noise.

#### Elite players don't free-fall

Reaching deep would normally let a first-round talent slide into the fourth. It doesn't,
because the further past a player's ADP the draft has gone, the harder the room corrects —
and the better the player, the harder that correction (`fallPull` in `src/draft.js`). Slide
past ADP for a top-24 RB/WR/TE, measured over 60 mocks at Normal:

| | Median | 95th | Worst |
|---|---|---|---|
| with the anti-fall rule | 2 picks | 10 | 16 |
| without it | 1 pick | 23 | 37 |

So the tail is what it fixes: elites still slip a couple of picks, but they stop sliding a
full two rounds. Late-round players are left free to drift, which is where the variety
comes from.

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

## Build stamp

The header shows `build <hash> · <date>` so you can tell whether the page you're playing
has your latest changes. The hash is a short digest of the app's own source files, so it
changes when they do and stays put when they don't; the date is when that build was
committed. During a draft on a phone it's hidden to save a row.

`data/version.js` is generated — the **pre-commit hook** refreshes it and stages it, so it
can't go stale. If you clone fresh, reinstall the hook:

```bash
cp scripts/hooks/pre-commit .git/hooks/ && chmod +x .git/hooks/pre-commit
node scripts/stamp-version.mjs      # or stamp by hand any time
```

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
index.html             app shell (loads the scripts + styles)
manifest.webmanifest   PWA metadata: name, icons, standalone display
sw.js                  service worker — offline cache for the whole app
icons/                 home-screen / launcher icons
data/players.js        ADP-ranked player pool (window.PLAYERS) — generated from live ESPN ADP
data/league.js         league defaults: draft order + keepers + your team (pre-fills setup)
src/draft.js           draft engine: snake order, keepers, roster rules, AI strategies (pure logic)
src/rankings.js        your custom board: reorders players and rewrites effective ADP
src/styles.css         theme + layout
src/app.js             UI controller: setup, draft loop, results
scripts/fetch-adp.mjs  refresh data/players.js from live ESPN ADP  (node scripts/fetch-adp.mjs)
data/version.js        generated build stamp (pre-commit hook) — shown in the header
scripts/stamp-version.mjs  writes data/version.js
scripts/make-icons.py  regenerate icons/                        (python3 scripts/make-icons.py)
```

The engine (`src/draft.js`) is pure logic with no DOM, so it's easy to test or reuse.
