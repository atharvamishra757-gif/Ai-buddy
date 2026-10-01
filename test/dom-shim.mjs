/**
 * Minimal DOM shim so we can EXECUTE the real frontend modules in Node.
 *
 * No browser automation exists on this machine, so instead of eyeballing the
 * app we run every page module against a tiny DOM. This catches the bugs a
 * syntax check cannot: calling a function that was never exported/imported,
 * wrong argument shapes, undefined variables on live render paths.
 */

class ClassList {
  constructor(el) {
    this.el = el;
    this.set = new Set();
  }
  add(...c) {
    c.forEach((x) => x && this.set.add(x));
    this.el._syncClass();
  }
  remove(...c) {
    c.forEach((x) => this.set.delete(x));
    this.el._syncClass();
  }
  toggle(c, force) {
    const on = force === undefined ? !this.set.has(c) : Boolean(force);
    if (on) this.set.add(c);
    else this.set.delete(c);
    this.el._syncClass();
    return on;
  }
  contains(c) {
    return this.set.has(c);
  }
  get value() {
    return [...this.set].join(" ");
  }
}

let nodeCount = 0;

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this._class = "";
    this._events = {};
    this._text = "";
    this._html = "";
    this._cl = null;
    nodeCount++;
  }
  get className() {
    return this._class;
  }
  set className(v) {
    this._class = v || "";
    this._cl = null;
  }
  get classList() {
    if (!this._cl) {
      this._cl = new ClassList(this);
      this._cl.set = new Set(String(this._class).split(/\s+/).filter(Boolean));
    }
    return this._cl;
  }
  _syncClass() {
    this._class = this._cl ? this._cl.value : this._class;
  }
  get innerHTML() {
    return this._html;
  }
  set innerHTML(v) {
    this._html = v;
  }
  get textContent() {
    return this._text;
  }
  set textContent(v) {
    this._text = String(v);
  }
  get outerHTML() {
    return `<${this.tagName.toLowerCase()} class="${this._class}">`;
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
    if (k === "class") this.className = v;
    if (k.startsWith("data-")) {
      this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
    }
  }
  getAttribute(k) {
    return this.attributes[k];
  }
  hasAttribute(k) {
    return k in this.attributes;
  }
  removeAttribute(k) {
    delete this.attributes[k];
  }
  addEventListener(type, fn) {
    (this._events[type] ||= []).push(fn);
  }
  removeEventListener() {}
  dispatch(type) {
    for (const fn of this._events[type] || [])
      fn({
        type,
        target: this,
        currentTarget: this,
        preventDefault() {},
        stopPropagation() {},
      });
  }
  append(...kids) {
    for (const k of kids) {
      if (k !== null && k !== undefined && k !== false) this.children.push(k);
    }
  }
  appendChild(k) {
    this.append(k);
    return k;
  }
  insertBefore(node) {
    this.children.push(node);
    return node;
  }
  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    return node;
  }
  replaceChild(next) {
    return next;
  }
  remove() {}
  contains() {
    return false;
  }
  querySelector(sel) {
    return findAll(this, (n) => matches(n, sel))[0] || null;
  }
  querySelectorAll(sel) {
    return findAll(this, (n) => matches(n, sel));
  }
  closest(sel) {
    return this.classList && sel ? this : null;
  }
  matches(sel) {
    return matches(this, sel);
  }
  focus() {}
  blur() {}
  click() {}
  scrollIntoView() {}
  scrollTo() {}
  get firstChild() {
    return this.children[0] || null;
  }
  get value() {
    return this._value || "";
  }
  set value(v) {
    this._value = v;
  }
  get scrollHeight() {
    return 60;
  }
  toString() {
    return `<${this.tagName.toLowerCase()} class="${this._class}">(${this.children.length})`;
  }
}

/** Recursively collect text for assertions. */
export function textOf(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node instanceof El) {
    if (node._text) return node._text;
    if (node._html) return node._html.replace(/<[^>]*>/g, " ");
    return node.children.map(textOf).join(" ");
  }
  return "";
}

export function findAll(node, predicate, acc = []) {
  if (!node) return acc;
  if (node instanceof El) {
    if (predicate(node)) acc.push(node);
    for (const c of node.children) findAll(c, predicate, acc);
  }
  return acc;
}

export function countNodes(node = doc.documentElement) {
  return node instanceof El
    ? 1 +
        node.children.reduce(
          (a, c) => a + (c instanceof El ? countNodes(c) : 0),
          0,
        )
    : 0;
}

const registry = new Map();

function mkEl(id, cls) {
  const e = new El("div");
  e.id = id;
  e.className = cls || "";
  registry.set(id, e);
  return e;
}

const app = mkEl("app");
const pageRoot = mkEl("page-root", "page");
const toasts = mkEl("toasts", "toasts");
const modalRoot = mkEl("modal-root");

export const doc = {
  createElement: (t) => new El(t),
  createElementNS: (_ns, t) => new El(t),
  createTextNode: (t) => {
    const e = new El("#text");
    e._text = String(t);
    return e;
  },
  createDocumentFragment: () => new El("#fragment"),
  getElementById: (id) => registry.get(id) || null,
  querySelector: (sel) => findAll(doc.body, (n) => matches(n, sel))[0] || null,
  querySelectorAll: (sel) => findAll(doc.body, (n) => matches(n, sel)),
  addEventListener: () => {},
  removeEventListener: () => {},
  body: new El("body"),
  documentElement: new El("html"),
  head: new El("head"),
  visibilityState: "visible",
  title: "",
};

// Mount the real page skeleton so #app / #page-root resolve, exactly as index.html does.
doc.body.append(app, pageRoot, toasts, modalRoot);
doc.documentElement.append(doc.head, doc.body);

/** Extremely small selector matcher: tag, .class, #id, [attr], combinations. */
export function matches(node, sel) {
  if (!(node instanceof El)) return false;
  return sel
    .split(",")
    .map((s) => s.trim())
    .some((one) => {
      const parts = one.match(/^([a-zA-Z0-9]*)((?:[.#][\w-]+|\[[^\]]+\])*)$/);
      if (!parts) return false;
      const [, tag, rest] = parts;
      if (tag && node.tagName.toLowerCase() !== tag.toLowerCase()) return false;
      const tokens = rest.match(/[.#][\w-]+|\[[^\]]+\]/g) || [];
      return tokens.every((t) => {
        if (t.startsWith(".")) return node.classList.contains(t.slice(1));
        if (t.startsWith("#"))
          return node.attributes.id === t.slice(1) || node.id === t.slice(1);
        const m = t.slice(1, -1).match(/^([\w-]+)(?:=["']?([^"']*)["']?)?$/);
        if (!m) return false;
        const [, k, v] = m;
        const val = node.dataset[k] ?? node.attributes[k];
        return v === undefined ? val !== undefined : String(val) === v;
      });
    });
}

/* ---------------------------- globals ---------------------------- */

const store = new Map();

globalThis.document = doc;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.location = {
  hash: "",
  href: `${process.env.BASE ? process.env.BASE.replace(/\/api$/, "") : "http://localhost:4173"}/`,
  reload: () => {},
};
globalThis.history = { replaceState: () => {} };
try {
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "node", clipboard: { writeText: async () => {} } },
    configurable: true,
    writable: true,
  });
} catch {
  /* Node exposes a read-only navigator; the app never uses it. */
}
globalThis.CustomEvent = class {
  constructor(type, opts) {
    this.type = type;
    this.detail = opts?.detail;
  }
};
globalThis.Event = globalThis.CustomEvent;
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.AudioContext = undefined;
globalThis.Notification = class {
  static permission = "denied";
  static requestPermission() {
    return Promise.resolve("denied");
  }
};
globalThis.matchMedia = (q) => ({
  matches: false,
  media: String(q),
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
});
globalThis.MutationObserver = class {
  constructor(cb) {
    this.cb = cb;
  }
  observe() {}
  disconnect() {}
};
globalThis.Element = El;
globalThis.Node = El;
globalThis.HTMLElement = El;
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
globalThis.confirm = () => true;
globalThis.alert = () => {};

const winListeners = {};
globalThis.window = {
  document: doc,
  addEventListener: (t, fn) => {
    (winListeners[t] ||= []).push(fn);
  },
  removeEventListener: () => {},
  dispatchEvent: (e) => {
    for (const fn of winListeners[e.type] || []) fn(e);
  },
  location: globalThis.location,
  localStorage: globalThis.localStorage,
  matchMedia: globalThis.matchMedia,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  getComputedStyle: globalThis.getComputedStyle,
  innerWidth: 1440,
  innerHeight: 900,
};
globalThis.addEventListener = globalThis.window.addEventListener;
globalThis.removeEventListener = () => {};

/* --------------------------- fetch shim --------------------------- */

const BASE = process.env.BASE || "http://127.0.0.1:4173/api";
const ORIGIN = BASE.replace(/\/api$/, "");
let authToken = "";
const realFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (url, opts = {}) => {
  const raw = String(url);
  // api.js already prefixes `/api`; only prepend the origin for relative paths.
  const path = raw.startsWith("http")
    ? raw
    : ORIGIN + (raw.startsWith("/") ? raw : "/" + raw);
  const headers = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(opts.headers || {}),
  };
  const res = await realFetch(path, { ...opts, headers });
  return {
    ok: res.ok,
    status: res.status,
    headers: res.headers,
    text: () => res.text(),
    json: () => res.json(),
  };
};

export function setToken(t) {
  authToken = t;
}
export { app, pageRoot, toasts, modalRoot, El, nodeCount };
export default {
  doc,
  app,
  pageRoot,
  toasts,
  modalRoot,
  setToken,
  textOf,
  findAll,
  countNodes,
  El,
};
