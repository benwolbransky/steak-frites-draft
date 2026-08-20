/*
 * Steak Frites draft engine — snake order, keepers, roster rules, AI strategies.
 * Pure logic, no DOM. The UI (app.js) drives it and renders state.
 */
(function () {
  "use strict";

  // ---- League configuration (Steak Frites) --------------------------------
  const STARTER_SLOTS = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, K: 1, DST: 1 };
  const FLEX_POS = ["RB", "WR", "TE"];
  const BENCH = 6;
  const STARTERS = Object.values(STARTER_SLOTS).reduce((a, b) => a + b, 0); // 10
  const ROUNDS = STARTERS + BENCH;                                          // 16
  // Soft roster caps so the AI doesn't hoard a position. RB/WR are uncapped
  // (they fill flex + bench); you only ever need one K and one DST.
  const POS_CAPS = { QB: 2, TE: 3, K: 1, DST: 1 };
  const ROSTER_MAX = STARTERS + BENCH;                                      // 16
  const KDST_START_ROUND = 13;   // AI won't draft K/DST before this (except forced)

  const STRATEGIES = {
    "2-RB":     { label: "2-RB (robust RB)",  desc: "Two RBs in the first few rounds, then best available." },
    "hero-RB":  { label: "Hero RB",           desc: "One anchor RB, load WR/TE, circle back to RB later." },
    "zero-RB":  { label: "Zero RB",           desc: "No RB early — WR/TE/QB — then attack RB from round 5." },
  };

  const CONFIG = { STARTER_SLOTS, FLEX_POS, BENCH, STARTERS, ROUNDS, POS_CAPS,
                   ROSTER_MAX, STRATEGIES, scoring: "0.5 PPR", numTeams: 10 };

  // ---- Roster helpers ------------------------------------------------------
  function newRoster() {
    return {
      players: [],                       // { ...player, slot }
      startersFilled: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 },
      flexFilled: 0,
      benchFilled: 0,
      posCount: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 },
    };
  }

  // Which slot a player of `pos` would occupy, or null if there is no room.
  function slotFor(roster, pos) {
    if (STARTER_SLOTS[pos] && roster.startersFilled[pos] < STARTER_SLOTS[pos]) return pos;
    if (FLEX_POS.includes(pos) && roster.flexFilled < STARTER_SLOTS.FLEX) return "FLEX";
    if (roster.benchFilled < BENCH) return "BENCH";
    return null;
  }

  function canRoster(roster, pos) {
    if (roster.players.length >= ROSTER_MAX) return false;
    if (POS_CAPS[pos] && roster.posCount[pos] >= POS_CAPS[pos]) return false;
    return slotFor(roster, pos) !== null;
  }

  function addToRoster(roster, player) {
    const slot = slotFor(roster, player.pos);
    if (!slot) return false;
    if (slot === "FLEX") roster.flexFilled++;
    else if (slot === "BENCH") roster.benchFilled++;
    else roster.startersFilled[slot]++;
    roster.posCount[player.pos]++;
    roster.players.push(Object.assign({ slot }, player));
    return true;
  }

  // Unfilled REQUIRED positions (starters, incl. flex + K/DST) for urgency scoring.
  function unmetNeeds(roster, picksLeft) {
    const need = {};
    for (const p of ["QB", "RB", "WR", "TE"]) {
      need[p] = Math.max(0, STARTER_SLOTS[p] - roster.startersFilled[p]);
    }
    need.FLEX = Math.max(0, STARTER_SLOTS.FLEX - roster.flexFilled);
    need.K = Math.max(0, 1 - roster.startersFilled.K);
    need.DST = Math.max(0, 1 - roster.startersFilled.DST);
    return need;
  }

  // ---- Snake order ---------------------------------------------------------
  // Returns an array of picks: { overall, round, pickInRound, teamIdx }.
  function buildOrder(numTeams, rounds) {
    const picks = [];
    let overall = 0;
    for (let r = 1; r <= rounds; r++) {
      const order = [];
      for (let t = 0; t < numTeams; t++) order.push(t);
      if (r % 2 === 0) order.reverse();               // snake
      order.forEach((teamIdx, i) => {
        picks.push({ overall: ++overall, round: r, pickInRound: i + 1, teamIdx });
      });
    }
    return picks;
  }

  // ---- AI pick selection ---------------------------------------------------
  // Lower "score" = drafted sooner. Base is ADP; strategy + needs + gating nudge it.
  function aiChoose(team, available, round, rng) {
    const roster = team.roster;
    const strat = team.strategy;
    const rbCount = roster.posCount.RB;
    const picksLeftForTeam = ROUNDS - roster.players.length;
    const needK = roster.startersFilled.K < 1;
    const needDST = roster.startersFilled.DST < 1;

    // Force K/DST at the very end if still missing (leave room for the other).
    const mustFillSpecial = [];
    if (needK && picksLeftForTeam <= (needDST ? 2 : 1)) mustFillSpecial.push("K");
    if (needDST && picksLeftForTeam <= (needK ? 2 : 1)) mustFillSpecial.push("DST");

    let best = null, bestScore = Infinity;
    for (const p of available) {
      if (!canRoster(roster, p.pos)) continue;

      if (mustFillSpecial.length) {
        if (!mustFillSpecial.includes(p.pos)) continue;   // only K/DST now
        const s = p.adp;                                   // best available K/DST
        if (s < bestScore) { best = p; bestScore = s; }
        continue;
      }

      let score = p.adp;

      // K/DST are end-of-draft picks — heavily deprioritise until late.
      if ((p.pos === "K" || p.pos === "DST") && round < KDST_START_ROUND) score += 500;
      // Don't stack QBs; a second QB only late/for value.
      if (p.pos === "QB" && roster.posCount.QB >= 1) score += 120;
      if (p.pos === "TE" && roster.startersFilled.TE >= 1) score += 40;

      // Strategy: RB timing is the whole personality.
      if (p.pos === "RB") {
        if (strat === "2-RB") {
          if (rbCount < 2 && round <= 5) score -= 28;      // grab RB2 early
        } else if (strat === "hero-RB") {
          if (rbCount === 0 && round === 1) score -= 45;   // the anchor
          else if (rbCount >= 1 && round >= 2 && round <= 4) score += 55; // steer to WR
          else if (rbCount < 2 && round >= 5) score -= 18; // circle back
        } else if (strat === "zero-RB") {
          if (round <= 4) score += 90;                     // avoid RB early
          else if (rbCount < 3 && round >= 5) score -= 22; // then hammer RB
        }
      }
      // Everyone: nudge toward filling an actual starting slot.
      const slot = slotFor(roster, p.pos);
      if (slot && slot !== "BENCH") score -= 8;
      if (slot === "BENCH") score += 6;

      score += (rng() - 0.5) * 6;   // small jitter so redrafts vary

      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  // ---- Draft state machine -------------------------------------------------
  function createDraft(opts) {
    const numTeams = CONFIG.numTeams;
    const players = opts.players.slice().sort((a, b) => a.adp - b.adp);
    const rng = mulberry32(opts.seed || 1234);

    const teams = [];
    for (let i = 0; i < numTeams; i++) {
      const t = opts.teams[i] || {};
      teams.push({
        idx: i,
        name: t.name || `Team ${i + 1}`,
        strategy: t.strategy || "2-RB",
        isUser: !!t.isUser,
        roster: newRoster(),
      });
    }

    const order = buildOrder(numTeams, CONFIG.ROUNDS);
    const drafted = new Set();     // player names off the board
    const picks = [];              // completed picks, in order

    // Keepers: assign to rosters and reserve their round pick.
    const keeperByPick = {};       // overall -> keeper player
    const missingKeepers = [];
    (opts.keepers || []).forEach((k) => {
      const pl = players.find((p) => p.name === k.name);
      if (!pl) { missingKeepers.push(k.name); return; }
      const team = teams[k.teamIdx];
      if (!team) return;
      // Reserve a DISTINCT pick for this team: the requested round if free, else the
      // nearest free round (so two keepers on the same round don't collide).
      const free = order.filter((o) => o.teamIdx === k.teamIdx && !keeperByPick[o.overall]);
      if (!free.length) { missingKeepers.push(k.name + " (no pick left)"); return; }
      let slot = free.find((o) => o.round === k.round);
      if (!slot) slot = free.slice().sort((a, b) =>
        Math.abs(a.round - k.round) - Math.abs(b.round - k.round) || a.round - b.round)[0];
      if (!addToRoster(team.roster, pl)) return;
      drafted.add(pl.name);
      keeperByPick[slot.overall] = pl;
    });

    const state = {
      config: CONFIG, teams, order, picks, missingKeepers, keeperByPick,
      cursor: 0,                   // index into order
      available() { return players.filter((p) => !drafted.has(p.name)); },
      isComplete() { return this.cursor >= order.length; },
      currentPickInfo() { return order[this.cursor] || null; },
      currentTeam() { const o = order[this.cursor]; return o ? teams[o.teamIdx] : null; },
      isUserOnClock() {
        const o = order[this.cursor];
        if (!o || keeperByPick[o.overall]) return false;   // keeper picks auto-resolve
        return !!teams[o.teamIdx].isUser;
      },
    };

    function record(player, isKeeper) {
      const o = order[state.cursor];
      const team = teams[o.teamIdx];
      if (!isKeeper) { addToRoster(team.roster, player); drafted.add(player.name); }
      picks.push({
        overall: o.overall, round: o.round, pickInRound: o.pickInRound,
        teamIdx: o.teamIdx, player, isKeeper: !!isKeeper,
      });
      state.cursor++;
    }

    // Draft a specific player (the human's pick). Returns false if illegal.
    state.draftPlayer = function (name) {
      if (state.isComplete()) return false;
      const o = order[state.cursor];
      if (keeperByPick[o.overall]) return false;   // reserved, resolve via step()
      const p = state.available().find((x) => x.name === name);
      if (!p || !canRoster(teams[o.teamIdx].roster, p.pos)) return false;
      record(p, false);
      return true;
    };

    // Advance one pick automatically: resolves a keeper, or makes the AI pick.
    // Returns the pick just made (or null if complete / waiting on the user).
    state.step = function () {
      if (state.isComplete()) return null;
      const o = order[state.cursor];
      const keeper = keeperByPick[o.overall];
      if (keeper) { record(keeper, true); return picks[picks.length - 1]; }
      const team = teams[o.teamIdx];
      if (team.isUser) return null;                // wait for the human
      const choice = aiChoose(team, state.available(), o.round, rng);
      if (choice) record(choice, false);
      else state.cursor++;                         // safety: nothing draftable
      return picks[picks.length - 1] || null;
    };

    // Auto-pick for the user's team using their assigned strategy.
    state.autoPickUser = function () {
      const team = state.currentTeam();
      if (!team || !team.isUser) return null;
      const choice = aiChoose(team, state.available(), order[state.cursor].round, rng);
      if (choice) { record(choice, false); return picks[picks.length - 1]; }
      return null;
    };

    return state;
  }

  // Deterministic RNG so a seed reproduces a draft.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  window.SteakDraft = { CONFIG, STRATEGIES, createDraft, slotFor, canRoster };
})();
