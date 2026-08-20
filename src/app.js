/* Steak Frites — mock draft UI controller. Drives SteakDraft, renders the DOM. */
(function () {
  "use strict";
  const { CONFIG, STRATEGIES, createDraft, canRoster } = window.SteakDraft;
  const PLAYERS = window.PLAYERS;
  const POS = ["QB", "RB", "WR", "TE", "K", "DST"];
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ---- setup state --------------------------------------------------------
  const stratKeys = Object.keys(STRATEGIES);
  const setup = {
    teams: Array.from({ length: CONFIG.numTeams }, (_, i) => ({
      name: `Team ${i + 1}`, strategy: stratKeys[i % stratKeys.length], isUser: i === 0,
    })),
    keepers: [],
  };

  // ---- draft runtime ------------------------------------------------------
  let draft = null, running = false, userAuto = false, timer = null;
  let filterPos = "ALL", searchStr = "";

  // ================= SETUP =================
  function renderSetup() {
    const rows = $("team-rows"); rows.innerHTML = "";
    setup.teams.forEach((t, i) => {
      const row = el("div", "team-row");
      row.innerHTML = `<span>${i + 1}</span>`;
      const name = el("input"); name.type = "text"; name.value = t.name;
      name.oninput = () => (t.name = name.value || `Team ${i + 1}`);
      const sel = el("select");
      stratKeys.forEach((k) => { const o = el("option", null, STRATEGIES[k].label); o.value = k; if (k === t.strategy) o.selected = true; sel.appendChild(o); });
      sel.onchange = () => { t.strategy = sel.value; renderSetup(); };
      const you = el("label", "you-radio");
      you.innerHTML = `<input type="radio" name="youteam" ${t.isUser ? "checked" : ""}/> you`;
      you.querySelector("input").onchange = () => { setup.teams.forEach((x, j) => (x.isUser = j === i)); };
      row.append(name, sel, you);
      const desc = el("div", "strat-desc", STRATEGIES[t.strategy].desc);
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
    draft = createDraft({ players: PLAYERS, teams: setup.teams, keepers: setup.keepers, seed: (Math.random() * 1e9) | 0 });
    running = true; userAuto = false;
    $("setup").classList.add("hidden");
    $("results").classList.add("hidden");
    $("draft").classList.remove("hidden");
    buildPosFilters();
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
    ["ALL", ...POS].forEach((p) => {
      const b = el("button", p === filterPos ? "active" : "", p);
      b.onclick = () => { filterPos = p; buildPosFilters(); renderPlayers(); };
      box.appendChild(b);
    });
    $("player-search").oninput = (e) => { searchStr = e.target.value.toLowerCase(); renderPlayers(); };
  }

  function render() { renderClock(); renderPlayers(); renderRoster(); renderLog(); }

  function renderClock() {
    const o = draft.currentPickInfo();
    if (!o) { $("pick-num").textContent = "Draft complete"; $("on-clock").textContent = ""; return; }
    $("pick-num").textContent = `Pick ${o.round}.${String(o.pickInRound).padStart(2, "0")}`;
    const t = draft.currentTeam();
    const oc = $("on-clock");
    if (t.isUser && !userAuto) { oc.textContent = "🟡 Your pick — choose a player"; oc.className = "on-clock you"; }
    else { oc.textContent = `On the clock: ${t.name} · ${STRATEGIES[t.strategy].label}`; oc.className = "on-clock"; }
  }

  function renderPlayers() {
    const list = $("player-list"); list.innerHTML = "";
    const yours = draft.currentTeam();
    const canDraftNow = draft.isUserOnClock() && !userAuto;
    let avail = draft.available();
    if (filterPos !== "ALL") avail = avail.filter((p) => p.pos === filterPos);
    if (searchStr) avail = avail.filter((p) => p.name.toLowerCase().includes(searchStr));
    avail.slice(0, 200).forEach((p) => {
      const draftable = canDraftNow && canRoster(userTeam().roster, p.pos);
      const row = el("div", "prow" + (draftable ? " draftable" : ""));
      row.innerHTML = `<span class="rank">${p.adp}</span>
        <span><span class="badge b-${p.pos}">${p.pos}</span>
        <span class="pname">${p.name}</span><span class="pteam">${p.team}</span></span>
        <span class="rank">${draftable ? "＋" : ""}</span>`;
      if (draftable) row.onclick = () => onPickPlayer(p.name);
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
  function init() {
    renderSetup(); initKeeperSearch();
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
    $("draft").classList.add("hidden"); $("results").classList.add("hidden");
    $("setup").classList.remove("hidden"); renderSetup();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
