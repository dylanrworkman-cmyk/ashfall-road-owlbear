// Ashfall Road: DM Notes tool (background script).
// GM-only sticky notes that start hidden from players, plus arrows that stay
// attached to their note. No campaign content lives in this file: the GM types
// every note inside Owlbear.
import OBR, { buildImage, buildPath, buildLine, Command } from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3/+esm";

const NS = "com.ashfall-road";
const TOOL = `${NS}/dm-notes`;
const MODE_NOTE = `${NS}/dm-notes/note`;
const MODE_ARROW = `${NS}/dm-notes/arrow`;
const NOTE_KEY = `${NS}/note`;
const ARROW_KEY = `${NS}/arrow`;
const EDITOR = `${NS}/note-editor`;
const MENU_EDIT = `${NS}/note-edit`;

const here = (p) => new URL(p, import.meta.url).href;

// The sticky-note image: 1200 x 800 px drawn at 100 px per square, so a new
// note is 12 x 8 squares on any scene. Resize it with Owlbear's handles.
const IMG = { w: 1200, h: 800, dpi: 100 };
const INK = "#2b1d14";
const ARROW_RED = "#b3261e";

const hasNote = [{ key: ["metadata", NOTE_KEY], value: undefined, operator: "!=" }];
const hasArrow = [{ key: ["metadata", ARROW_KEY], value: undefined, operator: "!=" }];

// ---------- text helpers ----------
function toRich(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const [title, ...rest] = lines;
  const out = [{ type: "heading-two", children: [{ text: title || "Note" }] }];
  for (const l of rest) out.push({ type: "paragraph", children: [{ text: l }] });
  return out;
}

// ---------- geometry ----------
function noteRect(note, dpi) {
  const w = (IMG.w / IMG.dpi) * dpi * (note.scale?.x ?? 1);
  const h = (IMG.h / IMG.dpi) * dpi * (note.scale?.y ?? 1);
  const c = note.position; // the image's grid offset is its centre
  return { x0: c.x - w / 2, y0: c.y - h / 2, x1: c.x + w / 2, y1: c.y + h / 2, cx: c.x, cy: c.y };
}

// Where the line from the note's centre toward the tip leaves the note.
function edgePoint(r, tip) {
  const dx = tip.x - r.cx, dy = tip.y - r.cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: r.cx, y: r.cy };
  const tx = dx === 0 ? Infinity : ((dx > 0 ? r.x1 : r.x0) - r.cx) / dx;
  const ty = dy === 0 ? Infinity : ((dy > 0 ? r.y1 : r.y0) - r.cy) / dy;
  const t = Math.min(tx, ty);
  if (t >= 1) return { ...tip }; // tip is inside the note
  return { x: r.cx + dx * t, y: r.cy + dy * t };
}

function arrowCommands(start, tip, dpi) {
  const dx = tip.x - start.x, dy = tip.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return [[Command.MOVE, 0, 0]];
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const L = Math.min(dpi * 0.55, len * 0.6), W = L * 0.45;
  const ex = dx - ux * L * 0.9, ey = dy - uy * L * 0.9; // stop the shaft at the head
  return [
    [Command.MOVE, 0, 0], [Command.LINE, ex, ey],
    [Command.MOVE, dx, dy],
    [Command.LINE, dx - ux * L + nx * W, dy - uy * L + ny * W],
    [Command.LINE, dx - ux * L - nx * W, dy - uy * L - ny * W],
    [Command.CLOSE],
  ];
}

// ---------- items ----------
async function makeNote(at) {
  const dpi = await OBR.scene.grid.getDpi();
  const note = buildImage(
    { url: here("sticky.png"), mime: "image/png", width: IMG.w, height: IMG.h },
    { dpi: IMG.dpi, offset: { x: IMG.w / 2, y: IMG.h / 2 } },
  )
    .position(at)
    .layer("NOTE")
    .name("DM note")
    .visible(false) // hidden from players from the start
    .locked(false)
    .textItemType("TEXT")
    .textType("RICH")
    .richText(toRich("New note\nDouble-click (or right-click > Edit DM note) to write here."))
    .plainText("New note")
    .textWidth("AUTO")
    .textHeight("AUTO")
    .textPadding(Math.round(dpi * 0.4))
    .fontSize(Math.round(dpi * 0.42))
    .textLineHeight(1.25)
    .textAlign("LEFT")
    .textAlignVertical("TOP")
    .textFillColor(INK)
    .metadata({ [NOTE_KEY]: { v: 1 } })
    .build();
  await OBR.scene.items.addItems([note]);
  return note;
}

async function makeArrow(note, tip) {
  const dpi = await OBR.scene.grid.getDpi();
  const start = edgePoint(noteRect(note, dpi), tip);
  const arrow = buildPath()
    .commands(arrowCommands(start, tip, dpi))
    .position(start)
    .layer("NOTE")
    .name("DM note arrow")
    .visible(note.visible)
    .strokeColor(ARROW_RED)
    .strokeOpacity(0.85)
    .strokeWidth(Math.max(2, Math.round(dpi * 0.07)))
    .fillColor(ARROW_RED)
    .fillOpacity(0.85)
    .attachedTo(note.id)
    .metadata({ [ARROW_KEY]: { tip, start } })
    .build();
  // follow the note for hide/show, lock, copy and delete, but keep the tip still
  arrow.disableAttachmentBehavior = ["POSITION", "ROTATION", "SCALE"];
  await OBR.scene.items.addItems([arrow]);
}

function openEditor(id) {
  return OBR.popover.open({
    id: EDITOR,
    url: here(`note-editor.html?id=${encodeURIComponent(id)}`),
    width: 420,
    height: 380,
  });
}

// ---------- keep arrows anchored to their notes ----------
let syncing = false;
async function syncArrows(items) {
  if (syncing) return;
  const notes = new Map(items.filter((i) => i.metadata?.[NOTE_KEY]).map((i) => [i.id, i]));
  const arrows = items.filter((i) => i.metadata?.[ARROW_KEY]);
  if (!arrows.length) return;
  const dpi = await OBR.scene.grid.getDpi();
  const changes = [];
  for (const a of arrows) {
    const note = notes.get(a.attachedTo);
    if (!note) continue; // Owlbear deletes attachments with their parent
    const m = a.metadata[ARROW_KEY];
    // If the arrow itself was dragged, move its tip by the same amount.
    const mx = a.position.x - m.start.x, my = a.position.y - m.start.y;
    const dragged = Math.abs(mx) > 0.5 || Math.abs(my) > 0.5;
    const tip = dragged ? { x: m.tip.x + mx, y: m.tip.y + my } : m.tip;
    const start = edgePoint(noteRect(note, dpi), tip);
    if (dragged || Math.abs(start.x - a.position.x) > 0.5 || Math.abs(start.y - a.position.y) > 0.5) {
      changes.push({ id: a.id, start, tip, commands: arrowCommands(start, tip, dpi) });
    }
  }
  if (!changes.length) return;
  syncing = true;
  try {
    await OBR.scene.items.updateItems(changes.map((c) => c.id), (drafts) => {
      for (const d of drafts) {
        const c = changes.find((x) => x.id === d.id);
        d.position = c.start;
        d.commands = c.commands;
        d.metadata[ARROW_KEY] = { tip: c.tip, start: c.start };
      }
    });
  } finally {
    syncing = false;
  }
}

// ---------- tool ----------
let preview = null; // local preview line while dragging an arrow
let dragNote = null;

async function setup() {
  await OBR.tool.create({
    id: TOOL,
    icons: [{ icon: here("note-tool.svg"), label: "DM Notes", filter: { roles: ["GM"] } }],
    disabled: { roles: ["PLAYER"] },
    defaultMode: MODE_NOTE,
  });

  await OBR.tool.createMode({
    id: MODE_NOTE,
    icons: [{ icon: here("note-mode.svg"), label: "Place a note (click). Click a note to edit it.", filter: { activeTools: [TOOL] } }],
    cursors: [{ cursor: "copy" }],
    // dragging a note (or an arrow) just moves it, as usual
    preventDrag: {
      target: [
        { key: ["metadata", NOTE_KEY], value: undefined, operator: "!=", coordinator: "||" },
        { key: ["metadata", ARROW_KEY], value: undefined, operator: "!=" },
      ],
    },
    async onToolClick(_ctx, ev) {
      if (ev.target?.metadata?.[NOTE_KEY]) { await openEditor(ev.target.id); return false; }
      if (ev.target?.metadata?.[ARROW_KEY]) return true; // select it (e.g. to delete)
      const note = await makeNote(ev.pointerPosition);
      await OBR.player.select([note.id]);
      await openEditor(note.id);
      return false;
    },
    async onToolDoubleClick(_ctx, ev) {
      if (ev.target?.metadata?.[NOTE_KEY]) { await openEditor(ev.target.id); return false; }
      return true;
    },
  });

  await OBR.tool.createMode({
    id: MODE_ARROW,
    icons: [{ icon: here("arrow-mode.svg"), label: "Arrow: drag from a note to a spot on the map", filter: { activeTools: [TOOL] } }],
    cursors: [{ cursor: "crosshair" }],
    async onToolDragStart(_ctx, ev) {
      dragNote = ev.target?.metadata?.[NOTE_KEY] ? ev.target : null;
      if (!dragNote) {
        OBR.notification.show("Start the arrow on a DM note, then drag to the spot it should point at.", "INFO");
        return;
      }
      const dpi = await OBR.scene.grid.getDpi();
      preview = buildLine()
        .startPosition(ev.pointerPosition)
        .endPosition(ev.pointerPosition)
        .strokeColor(ARROW_RED)
        .strokeWidth(Math.max(2, Math.round(dpi * 0.07)))
        .strokeDash([dpi * 0.2, dpi * 0.15])
        .layer("NOTE")
        .build();
      await OBR.scene.local.addItems([preview]);
    },
    async onToolDragMove(_ctx, ev) {
      if (!preview) return;
      await OBR.scene.local.updateItems([preview.id], (d) => { d[0].endPosition = ev.pointerPosition; }, true);
    },
    async onToolDragEnd(_ctx, ev) {
      const note = dragNote;
      await clearPreview();
      if (!note) return;
      const [fresh] = await OBR.scene.items.getItems([note.id]);
      if (fresh) await makeArrow(fresh, ev.pointerPosition);
    },
    async onToolDragCancel() { await clearPreview(); },
    onToolClick(_ctx, ev) {
      if (ev.target?.metadata?.[ARROW_KEY]) return true; // allow selecting an arrow to delete it
      return false;
    },
  });

  await OBR.contextMenu.create({
    id: MENU_EDIT,
    icons: [{
      icon: here("note-mode.svg"),
      label: "Edit DM note",
      filter: { min: 1, max: 1, roles: ["GM"], every: hasNote },
    }],
    onClick(ctx) { openEditor(ctx.items[0].id); },
  });

  // Keep arrows attached while the GM moves or resizes notes.
  const run = async () => {
    if ((await OBR.player.getRole()) !== "GM") return;
    OBR.scene.items.onChange((items) => { syncArrows(items).catch(console.error); });
  };
  if (await OBR.scene.isReady()) run();
  else {
    const off = OBR.scene.onReadyChange((ready) => { if (ready) { off(); run(); } });
  }
}

async function clearPreview() {
  if (preview) { try { await OBR.scene.local.deleteItems([preview.id]); } catch {} }
  preview = null;
  dragNote = null;
}

OBR.onReady(() => { setup().catch((e) => console.error("[Ashfall Road notes]", e)); });
