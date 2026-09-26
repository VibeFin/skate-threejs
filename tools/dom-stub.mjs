// The smallest DOM the HUD will boot on: enough element surface for the
// constructor and the combo readout, nothing more. Scoring is what is being
// measured, so layout is deliberately absent.
//
// It exists because the score is the HUD's, and only the HUD's — the ride model
// used to keep a running total of its own and it was wrong by the whole combo
// multiplier. A harness that wants to know what the player sees has to boot the
// real `Hud`, and the real `Hud` wants a document.
//
// Dev harness. Nothing under tools/ is bundled into dist/.

class Stub {
  constructor(tag = "div") {
    this.tagName = tag;
    this._cls = "";
    this.id = "";
    this._text = "";
    this._html = "";
    this.style = { setProperty() {} };
    this.children = [];
    this._q = new Map();
    this.offsetWidth = 0;
    this.classList = {
      add: (...c) => this._set(new Set([...this._list(), ...c])),
      remove: (...c) => {
        const s = this._list();
        for (const x of c) s.delete(x);
        this._set(s);
      },
      toggle: (c, on) => {
        const s = this._list();
        if (on === undefined ? s.has(c) : !on) s.delete(c);
        else s.add(c);
        this._set(s);
      },
      contains: (c) => this._list().has(c),
    };
  }
  _list() {
    return new Set(this._cls.split(/\s+/).filter(Boolean));
  }
  _set(s) {
    this._cls = [...s].join(" ");
  }
  get className() {
    return this._cls;
  }
  set className(v) {
    this._cls = String(v);
  }
  /**
   * `textContent` and `innerHTML` are ONE piece of content, because in a browser
   * they are.
   *
   * They used to be two independent fields here, and that is a stub telling the
   * harness what it wants to hear: the HUD clears its held-trick badge with
   * `heldEl.textContent = ""` and paints it with `heldEl.innerHTML = …`, so a
   * check reading the markup went on seeing "INDY / HOLDING" for the rest of the
   * run after the game had wiped it, and a check reading the text went on seeing
   * "" after the game had painted it. Either way the number under test is the
   * stub's, not the HUD's.
   *
   * Writing one now replaces the other, the way the DOM does — text in, markup
   * out is the escaped text; markup in, text out is the tags stripped and the
   * five entities put back.
   */
  get textContent() {
    return this._text;
  }
  set textContent(v) {
    this._text = String(v);
    this._html = escapeText(this._text);
    this._wiped();
  }
  get innerHTML() {
    return this._html;
  }
  set innerHTML(v) {
    this._html = String(v);
    this._text = stripTags(this._html);
    this._wiped();
  }
  /** New content means the old children — and the old query answers — are gone. */
  _wiped() {
    this.children.length = 0;
    for (const key of [...this._q.keys()]) if (key.startsWith("all:")) this._q.delete(key);
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  replaceWith() {}
  remove() {}
  addEventListener() {}
  querySelector(sel) {
    if (!this._q.has(sel)) this._q.set(sel, new Stub());
    return this._q.get(sel);
  }
  querySelectorAll(sel) {
    const key = `all:${sel}`;
    if (!this._q.has(key)) {
      this._q.set(
        key,
        Array.from({ length: countIn(this._html, sel) }, () => new Stub("i")),
      );
    }
    return this._q.get(key);
  }
}

/**
 * How many ticks the HUD's own markup put in that meter.
 *
 * Counted out of the template rather than guessed. Both meters are written as
 * `"<i></i>".repeat(N)` inside the block carrying the id in the selector, so N
 * is right there — and a hard-coded 14 here is a stub that goes on answering
 * 14 after the speed bar has been rebuilt with twenty segments, which is a
 * harness quietly measuring a HUD that no longer exists.
 */
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

/** Markup → the text a browser would report for it. */
function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e]);
}

/** …and back the other way, so `textContent = "<x>"` is not markup. */
function escapeText(text) {
  return text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

function countIn(html, selector) {
  const id = /#([\w-]+)/.exec(selector)?.[1];
  if (!id) return 4;
  const from = html.indexOf(`id="${id}"`);
  if (from < 0) return 4;
  const to = html.indexOf("</div>", from);
  const ticks = html.slice(from, to < 0 ? undefined : to).match(/<i><\/i>/g);
  return ticks ? ticks.length : 4;
}

export function installDom() {
  const doc = {
    createElement: (tag) => new Stub(tag),
    head: new Stub("head"),
    body: new Stub("body"),
    addEventListener() {},
  };
  globalThis.document = doc;
  globalThis.window = { addEventListener() {}, setTimeout: () => 0, requestAnimationFrame: () => 0 };
  globalThis.setTimeout = globalThis.setTimeout ?? (() => 0);
  return doc;
}
