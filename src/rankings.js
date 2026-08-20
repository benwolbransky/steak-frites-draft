/*
 * Steak Frites — custom draft board.
 *
 * The board is an ordered list of player names. Reordering it does NOT invent new
 * ADP numbers: the ESPN ADP values are kept as a fixed "ladder" of rungs, and a
 * player's effective adp is simply the rung at their board position. So the real
 * shape of the ADP curve (the gaps between tiers) survives, and moving someone up
 * genuinely means the market takes them earlier — the AI in draft.js scores off
 * `adp`, so it reacts to this with no changes of its own.
 *
 * Effective values are written back onto the player objects themselves, which is
 * what the engine and the UI both read. `espnAdp` keeps the untouched original.
 */
(function () {
  "use strict";

  const KEY = "steak-frites:board:v1";

  let pool = [];             // the live player objects (window.PLAYERS)
  let byName = new Map();
  let espnOrder = [];        // names in ESPN ADP order
  let espnRank = new Map();  // name -> 1-based ESPN rank
  let ladder = [];           // ADP values ascending; ladder[i] belongs to board slot i
  let board = [];            // names in YOUR order
  let rank = new Map();      // name -> 1-based board rank
  let touched = new Set();   // players YOU moved on purpose (see note in moveTo)

  // ---- persistence --------------------------------------------------------
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ board, touched: [...touched] }));
    } catch (e) { /* private browsing — the board just won't persist */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.board)) return null;
      return { board: saved.board, touched: Array.isArray(saved.touched) ? saved.touched : [] };
    } catch (e) { return null; }
  }

  // A saved board can be stale if data/players.js was regenerated: drop players who
  // are gone, and slot any new ones in at their ESPN position.
  function reconcile(saved) {
    const known = new Set(pool.map((p) => p.name));
    const out = saved.filter((n) => known.has(n));
    const have = new Set(out);
    espnOrder.forEach((n, i) => {
      if (!have.has(n)) out.splice(Math.min(i, out.length), 0, n);
    });
    return out;
  }

  // ---- core ---------------------------------------------------------------
  function apply() {
    rank = new Map();
    board.forEach((name, i) => {
      rank.set(name, i + 1);
      const p = byName.get(name);
      if (p) p.adp = ladder[i];
    });
  }

  function init(players) {
    pool = players;
    byName = new Map(players.map((p) => [p.name, p]));
    // Capture the untouched ESPN number once, before anything rewrites adp.
    players.forEach((p) => { if (p.espnAdp == null) p.espnAdp = p.adp; });

    espnOrder = players.slice().sort((a, b) => a.espnAdp - b.espnAdp).map((p) => p.name);
    espnRank = new Map(espnOrder.map((n, i) => [n, i + 1]));
    ladder = espnOrder.map((n) => byName.get(n).espnAdp);

    const saved = load();
    board = saved ? reconcile(saved.board) : espnOrder.slice();
    touched = new Set((saved ? saved.touched : []).filter((n) => byName.has(n)));
    apply();
  }

  // Moving one player necessarily shifts everyone in between by a spot. Those are
  // side effects, not decisions, so only the player you actually grabbed is marked
  // as moved — that's what the UI badges and counts.
  function moveTo(name, toRank, deliberate) {
    const from = board.indexOf(name);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(board.length - 1, (toRank | 0) - 1));
    if (to === from) return false;
    board.splice(from, 1);
    board.splice(to, 0, name);
    if (deliberate !== false) touched.add(name);
    apply(); save();
    return true;
  }

  function nudge(name, delta) {
    const r = rank.get(name);
    return r ? moveTo(name, r + delta) : false;
  }

  // Send one player back to where ESPN has them, leaving everyone else alone.
  function resetOne(name) {
    const r = espnRank.get(name);
    if (!r) return false;
    const ok = moveTo(name, r, false);
    touched.delete(name);
    apply(); save();
    return ok;
  }

  function resetAll() { board = espnOrder.slice(); touched.clear(); apply(); save(); }

  // + = you moved them up (earlier than ESPN), - = down.
  function delta(name) { return (espnRank.get(name) || 0) - (rank.get(name) || 0); }

  function movedCount() { return touched.size; }

  // Players in board order — what the UI lists and the engine drafts from.
  function ordered() { return board.map((n) => byName.get(n)).filter(Boolean); }

  window.SteakBoard = {
    init, moveTo, nudge, resetOne, resetAll,
    delta, movedCount, ordered,
    isMoved: (name) => touched.has(name),
    rankOf: (name) => rank.get(name) || 0,
    espnRankOf: (name) => espnRank.get(name) || 0,
    size: () => board.length,
  };
})();
