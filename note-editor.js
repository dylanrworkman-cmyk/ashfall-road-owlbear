// Popover editor for one DM note. Static SDK import (see app.js for why).
import OBR from "https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3/+esm";

const EDITOR = "com.ashfall-road/note-editor";
const id = new URLSearchParams(location.search).get("id");
const $ = (s) => document.querySelector(s);
let armedDelete = false;

function richToPlain(rich) {
  const walk = (n) => (typeof n.text === "string" ? n.text : (n.children || []).map(walk).join(""));
  return (rich || []).map(walk).join("\n");
}
function toRich(text) {
  const [title, ...rest] = String(text || "").replace(/\r/g, "").split("\n");
  return [
    { type: "heading-two", children: [{ text: title || "Note" }] },
    ...rest.map((l) => ({ type: "paragraph", children: [{ text: l }] })),
  ];
}
const close = () => OBR.popover.close(EDITOR);

OBR.onReady(async () => {
  const [item] = await OBR.scene.items.getItems([id]);
  if (!item) { $("#msg").textContent = "That note is gone."; return; }
  const t = item.text || {};
  $("#text").value = t.richText?.length ? richToPlain(t.richText) : (t.plainText || "");
  $("#show").checked = !!item.visible;
  $("#text").focus();
  if ($("#text").value.startsWith("New note")) $("#text").select();

  async function save() {
    const text = $("#text").value.trim() || "Note";
    const visible = $("#show").checked;
    await OBR.scene.items.updateItems([id], (d) => {
      d[0].text.richText = toRich(text);
      d[0].text.plainText = text;
      d[0].text.type = "RICH";
      d[0].visible = visible;
    });
    close();
  }
  $("#save").onclick = save;
  $("#cancel").onclick = close;
  $("#text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
    if (e.key === "Escape") close();
  });
  $("#del").onclick = async () => {
    if (!armedDelete) { armedDelete = true; $("#del").textContent = "Click again to delete"; return; }
    await OBR.scene.items.deleteItems([id]); // its arrows go with it
    close();
  };
});
