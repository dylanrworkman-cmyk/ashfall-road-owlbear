// Ashfall Road — Owlbear Rodeo extension.
// Everything here is player-safe on purpose: this code is public on the web.
// Nothing about the story lives in this file; the GM types stone names and
// inscriptions into the room when the players find them.

const KEY = "com.ashfall-road/state";
const FIRE = [
  { n: "Ashes", c: "#6d6a66" }, { n: "Embers", c: "#a4552f" }, { n: "Low", c: "#c7773a" },
  { n: "Warm", c: "#e3a444" }, { n: "Roaring", c: "#f2cf6a" },
];
const NOTCH_DAY = 10;       // "The Notch is about ten days out."
const MAX_REM = 60;         // keep room metadata well under Owlbear's 16 kB
const DEFAULT = {
  v: 1,
  road: { day: 1, larder: 14, oil: 12, fire: 3, wheels: 2, axle: 1 },
  watch: ["", "", ""],
  rem: [],
  stones: [0, 1, 2, 3].map(() => ({ found: false, lit: false, carved: false, name: "", where: "", words: "" })),
};

// ---------- SDK (real inside Owlbear, a local stand-in for previews) ----------
async function loadOBR() {
  const srcs = [
    "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3/+esm",
    "https://esm.sh/@owlbear-rodeo/sdk@3",
  ];
  for (const s of srcs) {
    try { const m = await import(s); return m.default || m.OBR || m; } catch (e) { /* try next */ }
  }
  return null;
}
function mockOBR() {
  // Lets the page run outside Owlbear (a browser tab, a test) with local-only state.
  let meta = {}; const subs = [];
  const role = new URLSearchParams(location.search).get("role") === "player" ? "PLAYER" : "GM";
  return {
    isAvailable: false,
    onReady: (f) => setTimeout(f, 0),
    player: { getRole: async () => role, getName: async () => (role === "GM" ? "Preview GM" : "Preview player") },
    room: {
      getMetadata: async () => structuredClone(meta),
      setMetadata: async (u) => { meta = { ...meta, ...structuredClone(u) }; subs.forEach((f) => f(structuredClone(meta))); },
      onMetadataChange: (f) => { subs.push(f); return () => {}; },
    },
    notification: { show: async (m) => console.log("[notify]", m) },
  };
}

let OBR, role = "PLAYER", me = "Someone", state = structuredClone(DEFAULT);
const $ = (s) => document.querySelector(s);
const isGM = () => role === "GM";

function normalize(s) {
  const d = structuredClone(DEFAULT);
  if (!s || typeof s !== "object") return d;
  return {
    v: 1,
    road: { ...d.road, ...(s.road || {}) },
    watch: Array.isArray(s.watch) ? [0, 1, 2].map((i) => String(s.watch[i] || "")) : d.watch,
    rem: Array.isArray(s.rem) ? s.rem.slice(0, MAX_REM) : [],
    stones: [0, 1, 2, 3].map((i) => ({ ...d.stones[i], ...((s.stones || [])[i] || {}) })),
  };
}

// Read-modify-write against the freshest copy so two people editing at once don't clobber each other.
async function change(fn) {
  const meta = await OBR.room.getMetadata();
  const s = normalize(meta[KEY]);
  fn(s);
  await OBR.room.setMetadata({ [KEY]: s });
}

// ---------- render ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderRoad() {
  const r = state.road;
  $("#oil-n").textContent = r.oil;
  const total = Math.max(12, r.oil);
  $("#kegs").innerHTML = Array.from({ length: total }, (_, i) => `<div class="keg${i < r.oil ? " full" : ""}"></div>`).join("");
  const nightsLeft = Math.max(0, NOTCH_DAY - r.day + 1);
  const w = $("#oil-warn");
  if (r.oil === 0) { w.hidden = false; w.textContent = "The oil is gone. No ring tonight unless someone finds more."; }
  else if (r.oil < nightsLeft) { w.hidden = false; w.textContent = `Only ${r.oil} keg${r.oil === 1 ? "" : "s"} for about ${nightsLeft} more nights to the Notch. Tamsin is counting twice.`; }
  else if (r.oil <= 3) { w.hidden = false; w.textContent = "Oil is low. Tamsin is counting twice."; }
  else w.hidden = true;

  $("#fire").innerHTML = FIRE.map((f, i) =>
    `<button style="background:${f.c}" class="${i === r.fire ? "on" : ""}" data-act="fire" data-v="${i}" ${isGM() ? "" : "disabled"} aria-pressed="${i === r.fire}">${f.n}</button>`).join("");
  for (const k of ["day", "larder", "wheels", "axle"]) $("#" + k).textContent = r[k];

  const labels = ["First", "Middle", "Dawn"];
  const box = $("#watch");
  if (!box.children.length) {
    box.innerHTML = labels.map((l, i) => `<label>${l}<input data-watch="${i}" maxlength="60" placeholder="who's up?"></label>`).join("");
  }
  box.querySelectorAll("input").forEach((inp) => { if (document.activeElement !== inp) inp.value = state.watch[+inp.dataset.watch] || ""; });
}

function renderRem() {
  const list = state.rem;
  $("#rem-empty").hidden = list.length > 0;
  $("#rem").innerHTML = list.map((e) => `
    <li class="${e.forgotten ? "forgotten" : ""}" data-id="${esc(e.id)}">
      <span class="nm">${esc(e.name)}</span>
      ${e.note ? `<span class="nt">${esc(e.note)}</span>` : ""}
      <span class="by">added by ${esc(e.by || "someone")}${e.forgotten ? ` · forgotten${e.forgottenBy ? " by " + esc(e.forgottenBy) : ""}` : ""}</span>
      <span class="act">
        <button data-act="forget">${e.forgotten ? "Remembered" : "Forgotten"}</button>
        ${isGM() ? `<button data-act="remove" title="GM only">Remove</button>` : ""}
      </span>
    </li>`).join("");
}

const stoneSvg = (i, s) => `<svg viewBox="0 0 44 58" aria-hidden="true">
  <path d="M8 56 L6 16 Q6 4 22 3 Q38 4 38 16 L36 56 Z" fill="${s.found ? "#5d5a55" : "#2d2723"}" stroke="#8a7a66" stroke-width="1.5"/>
  ${s.lit ? `<ellipse cx="22" cy="54" rx="12" ry="3.5" fill="#8fb4d8" opacity=".55"/><path d="M22 44c3 3 3.5 5 3.5 6.5a3.5 3.5 0 0 1-7 0c0-1.5.5-3.5 3.5-6.5z" fill="#cfe3f5"/>` : ""}
  <text x="22" y="30" text-anchor="middle" font-size="13" fill="${s.found ? "#efe2c4" : "#6f6358"}" font-family="Georgia,serif">${["I", "II", "III", "IV"][i]}</text></svg>`;

function renderStones() {
  $("#stones").innerHTML = state.stones.map((s, i) => {
    const n = ["I", "II", "III", "IV"][i];
    if (!s.found && !isGM()) return `<div class="stone unknown">${stoneSvg(i, s)}<div><div class="t"><small>Waystone ${n}</small>Not yet found</div><div class="w">Somewhere farther east.</div></div></div>`;
    return `<div class="stone${s.found ? "" : " unknown"}" data-i="${i}">
      ${stoneSvg(i, s)}
      <div>
        <div class="t"><small>Waystone ${n}${!s.found ? " · hidden from players" : ""}</small>${esc(s.name || (s.found ? "Waystone " + n : "Not yet found"))}</div>
        ${s.where ? `<div class="w">${esc(s.where)}</div>` : ""}
        <div class="tags"><span class="tag ${s.lit ? "on" : ""}">${s.lit ? "lit tonight" : "unlit"}</span><span class="tag carved ${s.carved ? "on" : ""}">${s.carved ? "our names carved" : "not carved yet"}</span></div>
        ${s.words ? `<p class="ins">${esc(s.words)}</p>` : ""}
      </div>
      ${isGM() ? `<div class="gmctl">
        <div class="row">
          <button data-act="stone" data-f="found" class="${s.found ? "on" : ""}">${s.found ? "Found ✓" : "Mark found"}</button>
          <button data-act="stone" data-f="lit" class="${s.lit ? "on" : ""}">${s.lit ? "Lit ✓" : "Light it"}</button>
          <button data-act="stone" data-f="carved" class="${s.carved ? "on" : ""}">${s.carved ? "Carved ✓" : "Names carved"}</button>
        </div>
        <input data-sf="name" maxlength="40" placeholder="Name players know it by" value="${esc(s.name)}">
        <input data-sf="where" maxlength="80" placeholder="Where it stands" value="${esc(s.where)}">
        <textarea data-sf="words" maxlength="300" placeholder="What the players can read on it (only what they've seen)">${esc(s.words)}</textarea>
        <span class="gmnote">Players see this card once it's marked found.</span>
      </div>` : ""}
    </div>`;
  }).join("");
}

function renderAll() {
  const focus = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.sf
    ? { i: document.activeElement.closest(".stone")?.dataset.i, f: document.activeElement.dataset.sf } : null;
  document.querySelectorAll(".gm").forEach((el) => (el.hidden = !isGM()));
  renderRoad(); renderRem();
  if (!focus) renderStones();
}

// ---------- events ----------
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", x === b));
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== "tab-" + b.dataset.tab));
  try { localStorage.setItem("ar-tab", b.dataset.tab); } catch (e) {}
}));

document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button[data-act]"); if (!b || !OBR) return;
  const a = b.dataset.act;
  if (["oil", "day", "larder", "wheels", "axle"].includes(a) && isGM()) {
    const lim = { oil: 40, day: 30, larder: 60, wheels: 6, axle: 4 }[a];
    await change((s) => { s.road[a] = clamp(s.road[a] + +b.dataset.d, a === "day" ? 1 : 0, lim); });
  } else if (a === "fire" && isGM()) {
    await change((s) => { s.road.fire = clamp(+b.dataset.v, 0, 4); });
  } else if (a === "forget" || a === "remove") {
    const id = b.closest("li").dataset.id;
    await change((s) => {
      const e = s.rem.find((x) => x.id === id); if (!e) return;
      if (a === "remove") { if (isGM()) s.rem = s.rem.filter((x) => x.id !== id); }
      else { e.forgotten = !e.forgotten; e.forgottenBy = e.forgotten ? me : ""; }
    });
  } else if (a === "stone" && isGM()) {
    const i = +b.closest(".stone").dataset.i, f = b.dataset.f;
    await change((s) => { s.stones[i][f] = !s.stones[i][f]; });
  }
});

$("#rem-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const name = $("#rem-name").value.trim(), note = $("#rem-note").value.trim();
  if (!name || !OBR) return;
  await change((s) => {
    if (s.rem.length >= MAX_REM) return;
    s.rem.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name.slice(0, 40), note: note.slice(0, 80), by: me, forgotten: false });
  });
  $("#rem-name").value = ""; $("#rem-note").value = ""; $("#rem-name").focus();
});

// Text fields save when you leave them (or press Enter in a one-line box).
document.addEventListener("change", async (ev) => {
  const t = ev.target; if (!OBR) return;
  if (t.dataset.watch !== undefined) {
    await change((s) => { s.watch[+t.dataset.watch] = t.value.slice(0, 60); });
  } else if (t.dataset.sf && isGM()) {
    const i = +t.closest(".stone").dataset.i, f = t.dataset.sf;
    await change((s) => { s.stones[i][f] = t.value.slice(0, f === "words" ? 300 : 80); });
    renderStones();
  }
});

$("#export").addEventListener("click", async () => {
  const out = {
    from: "owlbear", at: new Date().toISOString(),
    road: state.road, fire: FIRE[state.road.fire].n, watch: state.watch,
    remembrance: state.rem.map((e) => ({ name: e.name, note: e.note, by: e.by, forgotten: !!e.forgotten, forgottenBy: e.forgottenBy || "" })),
    stones: state.stones,
  };
  const text = "ASHFALL-ROAD-OWLBEAR " + JSON.stringify(out);
  const msg = $("#export-msg");
  try { await navigator.clipboard.writeText(text); msg.textContent = "Copied. Paste it to Claude at the wrap."; }
  catch (e) { console.log(text); msg.textContent = "Couldn't copy; it's in the console."; }
  setTimeout(() => (msg.textContent = ""), 5000);
});

// ---------- boot ----------
(async () => {
  let real = await loadOBR();
  OBR = real && real.isAvailable ? real : mockOBR();
  const start = async () => {
    role = await OBR.player.getRole();
    try { me = (await OBR.player.getName()) || me; } catch (e) {}
    $("#who").textContent = (OBR.isAvailable ? "" : "preview · ") + (isGM() ? "GM" : me);
    const meta = await OBR.room.getMetadata();
    if (!meta[KEY] && isGM()) await OBR.room.setMetadata({ [KEY]: structuredClone(DEFAULT) });
    state = normalize(meta[KEY]);
    renderAll();
    OBR.room.onMetadataChange((m) => { state = normalize(m[KEY]); renderAll(); });
    try { const t = localStorage.getItem("ar-tab"); if (t) document.querySelector(`.tabs [data-tab="${t}"]`)?.click(); } catch (e) {}
  };
  if (OBR.isReady) start(); else OBR.onReady(start);
})();
