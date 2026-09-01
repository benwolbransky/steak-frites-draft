/* Steak Frites — mock draft UI controller. Drives SteakDraft, renders the DOM. */
(function () {
  "use strict";
  const { CONFIG, STRATEGIES, createDraft, canRoster } = window.SteakDraft;
  const PLAYERS = window.PLAYERS;
  const BOARD = window.SteakBoard;
  const POS = ["QB", "RB", "WR", "TE", "K", "DST"];
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ---- setup state (pre-filled from data/league.js when present) ----------
  const stratKeys = Object.keys(STRATEGIES);
  const LC = window.LEAGUE_CONFIG || {};
  const setup = {
    teams: Array.from({ length: CONFIG.numTeams }, (_, i) => ({
      name: (LC.teams && LC.teams[i]) || `Team ${i + 1}`,
      strategy: CONFIG.AUTO_STRATEGY,        // rolled at draft time unless you set one
      isUser: false,
    })),
    keepers: (LC.keepers || []).map((k) => ({ name: k.name, teamIdx: k.teamIdx, round: k.round })),
  };
  const uIdx = LC.userTeam ? setup.teams.findIndex((t) => t.name === LC.userTeam) : 0;
  setup.teams[uIdx >= 0 ? uIdx : 0].isUser = true;

  // ---- draft runtime ------------------------------------------------------
  let draft = null, running = false, userAuto = false, timer = null;
  let filterPos = "ALL", searchStr = "";

  // ---- phone tabs (the bottom bar; inert on desktop, where all panels show) ----
  let activeTab = "players";

  function setTab(name) {
    activeTab = name;
    document.querySelectorAll("#draft .panel").forEach((p) => p.classList.toggle("tab-active", p.dataset.panel === name));
    document.querySelectorAll("#tabbar .tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    window.scrollTo({ top: 0 });
  }

  // ---- randomness dial ----------------------------------------------------
  // How far AI teams stray from ADP. It's the only source of variation between
  // mocks, so "Chalky" (0) also makes a draft perfectly reproducible.
  const REACH_KEY = "steak-frites:reach";

  // One setting, two pickers: on setup (choose before you start) and on the clock bar
  // (change it live, mid-draft). Both read and write reachKey.
  let reachKey = CONFIG.DEFAULT_REACH;

  function initReach() {
    try {
      const saved = localStorage.getItem(REACH_KEY);
      if (CONFIG.REACH[saved]) reachKey = saved;
    } catch (e) { /* private mode */ }

    ["reach-setup", "reach"].forEach((id) => {
      const sel = $(id);
      Object.entries(CONFIG.REACH).forEach(([key, j]) => {
        const o = el("option", null, j.label);
        o.value = key; o.title = j.desc;
        sel.appendChild(o);
      });
      sel.onchange = () => setReach(sel.value);
    });
    setReach(reachKey);
  }

  function setReach(key) {
    if (!CONFIG.REACH[key]) return;
    reachKey = key;
    try { localStorage.setItem(REACH_KEY, key); } catch (e) { /* private mode */ }
    $("reach-setup").value = key;
    $("reach").value = key;
    $("reach-desc").textContent = CONFIG.REACH[key].desc;
    if (draft) draft.reach = reachValue();       // takes effect on the next pick
  }

  function reachValue() { return CONFIG.REACH[reachKey].value; }

  function initTabs() {
    document.querySelectorAll("#tabbar .tab").forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });
  }

  // ================= YOUR BOARD (custom rankings) =================
  // Reordering rewrites each player's effective adp (see src/rankings.js), and the
  // AI drafts off adp — so moving someone up genuinely makes the league reach for them.
  let rankFilterPos = "ALL", rankSearch = "", sheetName = null;

  function deltaChip(name) {
    if (!BOARD.isMoved(name)) return "";      // ignore the one-spot drift from other moves
    const d = BOARD.delta(name);
    if (!d) return "";
    const up = d > 0;
    return `<span class="dchip ${up ? "up" : "down"}">${up ? "▲" : "▼"}${Math.abs(d)}</span>`;
  }

  function renderBoardStatus() {
    const n = BOARD.movedCount();
    $("board-status").innerHTML = n
      ? `<b>${n}</b> player${n === 1 ? "" : "s"} moved off ESPN ADP.`
      : "Straight ESPN ADP — nothing moved yet.";
  }

  function showRankings() {
    $("setup").classList.add("hidden");
    $("rankings").classList.remove("hidden");
    buildRankFilters();
    renderRankList();
  }

  function hideRankings() {
    closeSheet();
    $("rankings").classList.add("hidden");
    $("setup").classList.remove("hidden");
    renderBoardStatus();
  }

  function buildRankFilters() {
    const box = $("rank-filters"); box.innerHTML = "";
    ["ALL", ...POS].forEach((p) => {
      const b = el("button", p === rankFilterPos ? "active" : "", p);
      b.onclick = () => { rankFilterPos = p; buildRankFilters(); renderRankList(); };
      box.appendChild(b);
    });
    $("rank-search").oninput = (e) => { rankSearch = e.target.value.toLowerCase(); renderRankList(); };
  }

  function renderRankList() {
    const list = $("rank-list"); list.innerHTML = "";
    let rows = BOARD.ordered();
    if (rankFilterPos !== "ALL") rows = rows.filter((p) => p.pos === rankFilterPos);
    if (rankSearch) rows = rows.filter((p) => p.name.toLowerCase().includes(rankSearch));
    rows.slice(0, 250).forEach((p) => {
      const row = el("div", "prow draftable" + (p.name === sheetName ? " editing" : ""));
      row.innerHTML = `<span class="rank">${BOARD.rankOf(p.name)}</span>
        <span class="pmain"><span class="badge b-${p.pos}">${p.pos}</span>
        <span class="pname">${p.name}</span><span class="pteam">${p.team}</span>${deltaChip(p.name)}</span>
        <span class="rank espn">${p.espnAdp}</span>`;
      row.onclick = () => openSheet(p.name);
      list.appendChild(row);
    });
    if (!rows.length) list.appendChild(el("div", "hint", "No players match."));
    const n = BOARD.movedCount();
    $("rank-sub").textContent = n
      ? `Tap a player to move them. ${n} moved so far — the right-hand number is ESPN's.`
      : "Tap a player to move them. The right-hand number is where ESPN has them.";
  }

  // ---- the move sheet (shared by this screen and the draft's Available list) ----
  function openSheet(name) {
    sheetName = name;
    $("rank-sheet").classList.remove("hidden");
    renderSheet();
    refreshLists();
  }

  function closeSheet() {
    if (!sheetName) return;
    sheetName = null;
    $("rank-sheet").classList.add("hidden");
    refreshLists();
  }

  function renderSheet() {
    if (!sheetName) return;
    const p = PLAYERS.find((x) => x.name === sheetName);
    if (!p) return closeSheet();
    const r = BOARD.rankOf(sheetName), d = BOARD.delta(sheetName);
    $("rs-name").innerHTML = `<span class="badge b-${p.pos}">${p.pos}</span> ${p.name}
      <span class="pteam">${p.team}</span>`;
    const moved = BOARD.isMoved(sheetName) && d
      ? `<b>#${r}</b> on your board — ${d > 0 ? "up" : "down"} ${Math.abs(d)} from ESPN's #${BOARD.espnRankOf(sheetName)}`
      : `<b>#${r}</b> — ESPN has them #${BOARD.espnRankOf(sheetName)} (ADP ${p.espnAdp})`;
    $("rs-meta").innerHTML = moved;
    const input = $("rs-rank");
    if (document.activeElement !== input) input.value = r;
    input.max = BOARD.size();
  }

  // Re-render whichever list is on screen after a move.
  function refreshLists() {
    if (!$("rankings").classList.contains("hidden")) renderRankList();
    if (!$("draft").classList.contains("hidden") && draft) renderPlayers();
  }

  function initSheet() {
    const sheet = $("rank-sheet");
    const act = (a) => {
      if (!sheetName) return;
      if (a === "up") BOARD.nudge(sheetName, -1);
      else if (a === "down") BOARD.nudge(sheetName, +1);
      else if (a === "go") {
        const v = parseInt($("rs-rank").value, 10);
        if (v > 0) BOARD.moveTo(sheetName, v);
        $("rs-rank").blur();
      } else if (a === "reset") BOARD.resetOne(sheetName);
      renderSheet(); refreshLists(); renderBoardStatus();
    };
    sheet.querySelectorAll("[data-act]").forEach((b) => { b.onclick = () => act(b.dataset.act); });
    $("rs-close").onclick = closeSheet;
    sheet.querySelector(".rs-backdrop").onclick = closeSheet;
    $("rs-rank").onkeydown = (e) => { if (e.key === "Enter") act("go"); };
  }

  // ================= SETUP =================
  function renderSetup() {
    const rows = $("team-rows"); rows.innerHTML = "";
    setup.teams.forEach((t, i) => {
      const row = el("div", "team-row");
      row.innerHTML = `<span>${i + 1}</span>`;
      const name = el("input"); name.type = "text"; name.value = t.name;
      name.oninput = () => (t.name = name.value || `Team ${i + 1}`);
      const sel = el("select");
      const rand = el("option", null, "Random");
      rand.value = CONFIG.AUTO_STRATEGY;
      if (t.strategy === CONFIG.AUTO_STRATEGY) rand.selected = true;
      sel.appendChild(rand);
      stratKeys.forEach((k) => { const o = el("option", null, STRATEGIES[k].label); o.value = k; if (k === t.strategy) o.selected = true; sel.appendChild(o); });
      sel.onchange = () => { t.strategy = sel.value; renderSetup(); };
      const you = el("label", "you-radio");
      you.innerHTML = `<input type="radio" name="youteam" ${t.isUser ? "checked" : ""}/> you`;
      you.querySelector("input").onchange = () => { setup.teams.forEach((x, j) => (x.isUser = j === i)); };
      row.append(name, sel, you);
      const desc = el("div", "strat-desc", STRATEGIES[t.strategy]
        ? STRATEGIES[t.strategy].desc
        : "Rolled when the draft starts — sometimes the room follows a trend.");
      rows.append(row, desc);
    });
    // keeper team dropdown
    const kt = $("keeper-team"); kt.innerHTML = "";
    setup.teams.forEach((t, i) => { const o = el("option", null, t.name); o.value = i; kt.appendChild(o); });
    renderKeeperList();
  }

  function renderKeeperList() {
    const ul = $("keeper-list"); ul.innerHTML = "";
    setup.keepers.forEach((k, i) => {
      const li = el("li");
      li.innerHTML = `<span><b>${k.name}</b> → ${setup.teams[k.teamIdx].name} · R${k.round}</span>`;
      const x = el("button", null, "✕"); x.onclick = () => { setup.keepers.splice(i, 1); renderKeeperList(); };
      li.appendChild(x); ul.appendChild(li);
    });
  }

  // keeper search
  let keeperPick = null;
  function initKeeperSearch() {
    const input = $("keeper-search"), box = $("keeper-suggest"), add = $("keeper-add");
    box.style.display = "none";
    input.oninput = () => {
      const q = input.value.trim().toLowerCase();
      keeperPick = null; add.disabled = true; box.innerHTML = "";
      if (!q) { box.style.display = "none"; return; }
      const taken = new Set(setup.keepers.map((k) => k.name));
      const hits = PLAYERS.filter((p) => p.name.toLowerCase().includes(q) && !taken.has(p.name)).slice(0, 8);
      hits.forEach((p) => {
        const d = el("div", null, `${p.name} <span style="color:var(--muted)">${p.pos} · ${p.team}</span>`);
        d.onclick = () => { keeperPick = p; input.value = p.name; box.style.display = "none"; add.disabled = false; };
        box.appendChild(d);
      });
      box.style.display = hits.length ? "block" : "none";
    };
    add.onclick = () => {
      if (!keeperPick) return;
      setup.keepers.push({ name: keeperPick.name, teamIdx: +$("keeper-team").value, round: Math.max(1, Math.min(CONFIG.ROUNDS, +$("keeper-round").value || 1)) });
      keeperPick = null; input.value = ""; add.disabled = true; renderKeeperList();
    };
  }

  // ================= DRAFT =================
  function startDraft() {
    draft = createDraft({ players: BOARD.ordered(), teams: setup.teams, keepers: setup.keepers,
                          reach: reachValue(), seed: (Math.random() * 1e9) | 0 });
    running = true; userAuto = false;
    $("setup").classList.add("hidden");
    $("results").classList.add("hidden");
    $("draft").classList.remove("hidden");
    document.body.classList.add("in-draft");
    buildPosFilters();
    setTab("players");
    $("roster-title").textContent = `${userTeam().name} — your roster`;
    render(); tick();
  }

  function userTeam() { return draft.teams.find((t) => t.isUser); }
  function speed() { return +$("speed").value; }

  function tick() {
    clearTimeout(timer);
    if (draft.isComplete()) { running = false; render(); showResults(); return; }
    if (draft.isUserOnClock() && !userAuto) { running = false; render(); return; } // wait for human
    draft.step();                        // AI (or keeper) makes a pick
    if (userAuto && draft.isUserOnClock()) draft.autoPickUser();
    render();
    running = true;
    timer = setTimeout(tick, userAuto ? Math.min(speed(), 60) : speed());
  }

  function simToMyPick() {
    clearTimeout(timer);
    let guard = 0;
    while (!draft.isComplete() && !(draft.isUserOnClock() && !userAuto) && guard++ < 400) draft.step();
    render(); if (!draft.isComplete() && !draft.isUserOnClock()) tick();
    else if (draft.isComplete()) showResults();
  }

  function onPickPlayer(name) {
    if (!draft.isUserOnClock()) return;
    if (draft.draftPlayer(name)) { render(); tick(); }
  }

  // ---- render pieces ----
  function buildPosFilters() {
    const box = $("pos-filters"); box.innerHTML = "";
    ["ALL", "FLEX", ...POS].forEach((p) => {
      const b = el("button", p === filterPos ? "active" : "", p);
      b.onclick = () => { filterPos = p; buildPosFilters(); renderPlayers(); };
      box.appendChild(b);
    });
    $("player-search").oninput = (e) => { searchStr = e.target.value.toLowerCase(); renderPlayers(); };
  }

  function render() { renderClock(); renderPlayers(); renderRoster(); renderLog(); renderRoom(); }

  function renderClock() {
    const o = draft.currentPickInfo();
    if (!o) { $("pick-num").textContent = "Draft complete"; $("on-clock").textContent = ""; return; }
    $("pick-num").textContent = `Pick ${o.round}.${String(o.pickInRound).padStart(2, "0")}`;
    const t = draft.currentTeam();
    const oc = $("on-clock");
    const mine = t.isUser && !userAuto;
    if (mine) { oc.textContent = "🟡 Your pick — choose a player"; oc.className = "on-clock you"; }
    else { oc.textContent = `On the clock: ${t.name} · ${STRATEGIES[t.strategy].label}`; oc.className = "on-clock"; }
    const ptab = document.querySelector('#tabbar .tab[data-tab="players"]');
    if (ptab) ptab.classList.toggle("needs-pick", mine);
    // on a phone you may be sitting on the roster/board tab when your turn comes
    if (mine && activeTab !== "players") setTab("players");
  }

  function renderPlayers() {
    const list = $("player-list"); list.innerHTML = "";
    const yours = draft.currentTeam();
    const canDraftNow = draft.isUserOnClock() && !userAuto;
    let avail = draft.available();
    if (filterPos === "FLEX") avail = avail.filter((p) => CONFIG.FLEX_POS.includes(p.pos));
    else if (filterPos !== "ALL") avail = avail.filter((p) => p.pos === filterPos);
    if (searchStr) avail = avail.filter((p) => p.name.toLowerCase().includes(searchStr));
    avail.sort((a, b) => BOARD.rankOf(a.name) - BOARD.rankOf(b.name));
    avail.slice(0, 200).forEach((p) => {
      const draftable = canDraftNow && canRoster(userTeam().roster, p.pos);
      const row = el("div", "prow" + (draftable ? " draftable" : "") + (p.name === sheetName ? " editing" : ""));
      row.innerHTML = `<span class="rank">${BOARD.rankOf(p.name)}</span>
        <span class="pmain"><span class="badge b-${p.pos}">${p.pos}</span>
        <span class="pname">${p.name}</span><span class="pteam">${p.team}</span>${deltaChip(p.name)}</span>
        <span class="rowend">${draftable ? '<span class="plus">＋</span>' : ""}<button class="rankbtn" aria-label="Move ${p.name}">⋮</button></span>`;
      if (draftable) row.onclick = () => onPickPlayer(p.name);
      row.querySelector(".rankbtn").onclick = (e) => { e.stopPropagation(); openSheet(p.name); };
      list.appendChild(row);
    });
    if (!avail.length) list.appendChild(el("div", "hint", "No players match."));
  }

  const SLOT_TEMPLATE = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "K", "DST",
    "BENCH", "BENCH", "BENCH", "BENCH", "BENCH", "BENCH"];
  const SLOT_LABEL = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", FLEX: "FLEX", K: "K", DST: "DST", BENCH: "BN" };

  function fillTemplate(roster) {
    const byType = {}; roster.players.forEach((p) => { (byType[p.slot] = byType[p.slot] || []).push(p); });
    return SLOT_TEMPLATE.map((slot) => ({ slot, player: (byType[slot] || []).shift() || null }));
  }

  function renderRoster() {
    const box = $("roster-slots"); box.innerHTML = "";
    fillTemplate(userTeam().roster).forEach(({ slot, player }) => {
      const row = el("div", "slot" + (slot === "BENCH" ? " bench" : "") + (player ? "" : " empty"));
      const label = `<span class="slabel">${SLOT_LABEL[slot]}</span>`;
      const fill = player
        ? `<span class="sfill"><span class="badge b-${player.pos}">${player.pos}</span> ${player.name} <span class="pteam">${player.team}</span></span>`
        : `<span class="sfill">—</span>`;
      row.innerHTML = label + fill; box.appendChild(row);
    });
  }

  function renderRoom() {
    const note = draft && draft.room ? draft.room.note : "";
    $("room-note").textContent = note;
    $("room-note-results").textContent = note;
  }

  function renderLog() {
    const box = $("pick-log"); box.innerHTML = "";
    draft.picks.slice().reverse().forEach((pk) => {
      const t = draft.teams[pk.teamIdx];
      const row = el("div", "logrow" + (t.isUser ? " mine" : "") + (pk.isKeeper ? " keeper" : ""));
      row.innerHTML = `<span class="lp">${pk.round}.${String(pk.pickInRound).padStart(2, "0")}</span>
        <span><span class="badge b-${pk.player.pos}">${pk.player.pos}</span> ${pk.player.name}${pk.isKeeper ? '<span class="kchip">KEEP</span>' : ""}</span>
        <span class="lteam">${t.name}</span>`;
      box.appendChild(row);
    });
  }

  // ================= RESULTS =================
  function showResults() {
    running = false;
    $("draft").classList.add("hidden");
    $("results").classList.remove("hidden");
    const grid = $("results-grid"); grid.innerHTML = "";
    draft.teams.forEach((t) => {
      const card = el("div", "card team-card");
      card.innerHTML = `<h4>${t.name}${t.isUser ? " ⭐" : ""}</h4><div class="tstrat">${STRATEGIES[t.strategy].label}</div>`;
      fillTemplate(t.roster).forEach(({ slot, player }) => {
        const r = el("div", "rrow");
        r.innerHTML = `<span class="slabel">${SLOT_LABEL[slot]}</span><span>${player ? `<span class="badge b-${player.pos}">${player.pos}</span> ${player.name}` : "—"}</span>`;
        card.appendChild(r);
      });
      grid.appendChild(card);
    });
  }

  // ================= wire up =================
  // Build stamp: tells you whether the page you're on includes your latest changes.
  function renderBuild() {
    const b = window.BUILD;
    const box = $("build-stamp");
    if (!b) { box.textContent = "dev build (unstamped)"; return; }
    const d = new Date(b.at);
    box.textContent = `build ${b.hash} · ${d.toLocaleString([], {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
    box.title = `Source hash ${b.hash}, committed ${d.toString()}`;
  }

  function init() {
    renderBuild();
    BOARD.init(PLAYERS);
    renderSetup(); initKeeperSearch(); initTabs(); initSheet(); initReach(); renderBoardStatus();
    $("edit-board").onclick = showRankings;
    $("rank-done").onclick = hideRankings;
    $("rank-reset").onclick = () => {
      if (!BOARD.movedCount() || confirm("Put every player back at their ESPN ADP?")) {
        BOARD.resetAll(); renderRankList(); renderSheet(); renderBoardStatus();
      }
    };
    $("start-btn").onclick = startDraft;
    $("sim-pick").onclick = simToMyPick;
    $("autopick").onclick = () => { if (draft.isUserOnClock()) { draft.autoPickUser(); render(); tick(); } };
    $("sim-all").onclick = () => { userAuto = true; tick(); };
    $("reset").onclick = resetToSetup;
    $("results-reset").onclick = resetToSetup;
    $("results-back").onclick = () => { $("results").classList.add("hidden"); $("draft").classList.remove("hidden"); render(); };
    document.addEventListener("click", (e) => { if (!e.target.closest(".keeper-form")) $("keeper-suggest").style.display = "none"; });
  }

  function resetToSetup() {
    clearTimeout(timer); running = false; userAuto = false; draft = null;
    closeSheet();
    $("draft").classList.add("hidden"); $("results").classList.add("hidden");
    $("setup").classList.remove("hidden");
    document.body.classList.remove("in-draft");
    renderSetup();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
