const COLORS = {
  Black: [44, 44, 50], White: [238, 238, 242],
  Pink: [226, 168, 172], Violet: [124, 98, 168],
};
const PART = {
  neck: [236, 236, 240], base: [70, 120, 190], btn: [190, 194, 200],
  glow: [110, 230, 190], bristle: [170, 205, 240],
};

class OralBMotionCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.a = [0, 32, 0]; this.gy = [0, 0, 0];
    this.faces = this._build();
    this._attached = false; this._visible = false;
    this._subbing = false; this._unsub = null; this._raf = null; this._retryAt = 0;
    this._onVis = () => this._updateSub();
  }

  // ---- Lovelace API ----
  setConfig(config) {
    const c = {
      axis: "y", flip: false, roll: 0, color: "Black",
      show_axes: false, show_status: true, background: "#59616d", ...config,
    };
    if (!["x", "y", "z"].includes(c.axis)) throw new Error("axis must be x, y or z");
    if (!COLORS[c.color]) throw new Error(`color must be one of: ${Object.keys(COLORS).join(", ")}`);
    this._config = c;
    this._render();
  }
  set hass(hass) { this._hass = hass; this._updateSub(); }
  getCardSize() { return 5; }
  getGridOptions() { return { columns: 6, rows: 4, min_columns: 3, min_rows: 3 }; }
  static getStubConfig() { return {}; }

  connectedCallback() {
    this._attached = true;
    this._io = new IntersectionObserver((es) => {
      this._visible = es.some((e) => e.isIntersecting);
      this._updateSub();
    });
    this._io.observe(this);
    document.addEventListener("visibilitychange", this._onVis);
    this._updateSub();
  }
  disconnectedCallback() {
    this._attached = false; this._visible = false;
    if (this._io) { this._io.disconnect(); this._io = null; }
    document.removeEventListener("visibilitychange", this._onVis);
    this._updateSub();
  }

  // ---- subscription: only while visible ----
  _want() { return this._attached && this._visible && !document.hidden && !!this._hass; }

  _updateSub() {
    if (this._want()) {
      this._kick();
      if (!this._unsub && !this._subbing && Date.now() >= this._retryAt) {
        this._subbing = true;
        const msg = { type: "oralb_motion/subscribe" };
        if (this._config.entry_id) msg.entry_id = this._config.entry_id;
        this._hass.connection
          .subscribeMessage((ev) => this._onEvent(ev), msg)
          .then((unsub) => { this._subbing = false; this._unsub = unsub; this._updateSub(); })
          .catch((e) => {
            this._subbing = false; this._retryAt = Date.now() + 10000;
            this._setStatus(e.message || "subscribe failed");
          });
      }
    } else if (this._unsub) {
      this._unsub(); this._unsub = null;
      this._setStatus("paused");
    }
  }

  _setStatus(t) { if (this.stEl) this.stEl.textContent = t; }

  _onEvent(d) {
    if (d.status) { this._setStatus(d.status); return; }
    const k = 0.25, a = this.a;
    this.a = [a[0] + k * (d.ax - a[0]), a[1] + k * (d.ay - a[1]), a[2] + k * (d.az - a[2])];
    this.gy = [d.gx, d.gy, d.gz];
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block}
        ha-card{overflow:hidden}
        canvas{display:block;width:100%;height:auto}
        .st{padding:6px 16px;font-size:12px;color:var(--secondary-text-color)}
      </style>
      <ha-card><canvas width="640" height="480"></canvas><div class="st"></div></ha-card>`;
    const card = this.shadowRoot.querySelector("ha-card");
    if (this._config.title) card.header = this._config.title;
    this.c = this.shadowRoot.querySelector("canvas");
    this.c.style.background = this._config.background;
    this.g = this.c.getContext("2d");
    this.stEl = this.shadowRoot.querySelector(".st");
    this.stEl.style.display = this._config.show_status ? "" : "none";
    this.stEl.textContent = "waiting for brush";
    this._kick();
  }

  // ---- model, in local coordinates (s = along handle, x = side, z = front) ----
  _build() {
    const F = [], N = 28, TAU = Math.PI * 2;
    const rev = (prof, part, emit) => {
      for (let k = 0; k < prof.length - 1; k++) {
        const [s0, r0] = prof[k], [s1, r1] = prof[k + 1];
        const ds = s1 - s0, dr = r1 - r0, len = Math.hypot(ds, dr);
        for (let j = 0; j < N; j++) {
          const a0 = (TAU * j) / N, a1 = (TAU * (j + 1)) / N, am = (a0 + a1) / 2;
          F.push({
            part, emit,
            pts: [
              [s0, r0 * Math.cos(a0), r0 * Math.sin(a0)],
              [s0, r0 * Math.cos(a1), r0 * Math.sin(a1)],
              [s1, r1 * Math.cos(a1), r1 * Math.sin(a1)],
              [s1, r1 * Math.cos(a0), r1 * Math.sin(a0)],
            ],
            n: [-dr / len, (ds / len) * Math.cos(am), (ds / len) * Math.sin(am)],
          });
        }
      }
    };
    rev([[-1.55, .140], [-1.5, .160], [-1.3, .172], [-0.7, .168],
         [0, .150], [0.3, .132], [0.45, .120]], "body");
    rev([[0.455, .128], [0.505, .128]], "glow", true);
    rev([[0.505, .100], [0.6, .065], [0.8, .052], [0.95, .050]], "neck");
    F.push({
      part: "body", n: [-1, 0, 0],
      pts: Array.from({ length: N }, (_, j) =>
        [-1.55, .14 * Math.cos((TAU * j) / N), .14 * Math.sin((TAU * j) / N)]),
    });
    F.push({
      part: "btn", n: [0, 0, 1],
      pts: Array.from({ length: 18 }, (_, j) =>
        [0.1 + .05 * Math.cos((TAU * j) / 18), .05 * Math.sin((TAU * j) / 18), .148]),
    });
    const hs = 1.10, rs = .16, rx = .11, z0 = -.035, z1 = .035, M = 26;
    const ep = (t) => [hs + rs * Math.cos(t), rx * Math.sin(t)];
    for (let j = 0; j < M; j++) {
      const t0 = (TAU * j) / M, t1 = (TAU * (j + 1)) / M, tm = (t0 + t1) / 2;
      const [s0, x0] = ep(t0), [s1, x1] = ep(t1);
      const nl = Math.hypot(rx * Math.cos(tm), rs * Math.sin(tm));
      F.push({
        part: "neck",
        pts: [[s0, x0, z0], [s1, x1, z0], [s1, x1, z1], [s0, x0, z1]],
        n: [(rx * Math.cos(tm)) / nl, (rs * Math.sin(tm)) / nl, 0],
      });
    }
    F.push({ part: "base", n: [0, 0, 1],
      pts: Array.from({ length: M }, (_, j) => { const [s, x] = ep((TAU * j) / M); return [s, x, z1]; }) });
    F.push({ part: "neck", n: [0, 0, -1],
      pts: Array.from({ length: M }, (_, j) => { const [s, x] = ep((TAU * j) / M); return [s, x, z0]; }) });
    const tuft = (cnt, rad) => {
      for (let j = 0; j < cnt; j++) {
        const t = (TAU * j) / cnt, s = hs + rad * Math.cos(t), x = rad * 0.7 * Math.sin(t);
        F.push({ part: "bristle", line: true, pts: [[s, x, z1], [s, x, z1 + .10]] });
      }
    };
    tuft(1, 0); tuft(7, .05); tuft(13, .10);
    return F;
  }

  // ---- rendering ----
  _rot(p, u) { // rotate p so that u maps to world-up (0,1,0)
    const cr = [-u[2], 0, u[0]], s = Math.hypot(...cr), ct = u[1];
    if (s < 1e-6) return ct > 0 ? p : [p[0], -p[1], -p[2]];
    const k = cr.map((v) => v / s);
    const kx = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]];
    const kd = k[0] * p[0] + k[1] * p[1] + k[2] * p[2];
    return p.map((v, i) => v * ct + kx[i] * s + k[i] * kd * (1 - ct));
  }
  _pr(p) {
    const f = (this.c.width * 0.625) / (p[2] + 4);
    return [this.c.width / 2 + p[0] * f, this.c.height / 2 - p[1] * f, f];
  }
  _line(p, q, col, w) {
    const A = this._pr(p), B = this._pr(q), g = this.g;
    g.strokeStyle = col; g.lineWidth = (w * (A[2] + B[2])) / 200; g.lineCap = "round";
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
  }

  _kick() {
    if (!this._raf && this.c && this._want()) {
      this._raf = requestAnimationFrame(() => { this._raf = null; this._draw(); });
    }
  }

  _draw() {
    if (!this._want()) return;
    const g = this.g, a = this.a, m = Math.hypot(...a), cfg = this._config;
    g.clearRect(0, 0, this.c.width, this.c.height);
    if (m > 8) {
      const u = a.map((v) => v / m), i = "xyz".indexOf(cfg.axis);
      const phi = (Number(cfg.roll) * Math.PI) / 180, flip = !!cfg.flip;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const body = COLORS[cfg.color];
      const T = (p) => {
        let [s, x, z] = p;
        [x, z] = [x * cp - z * sp, x * sp + z * cp];
        if (flip) { s = -s; z = -z; }
        const b = [0, 0, 0]; b[i] = s; b[(i + 1) % 3] = x; b[(i + 2) % 3] = z;
        return this._rot(b, u);
      };
      const L = [-0.35, 0.55, -0.75], ll = Math.hypot(...L);
      const items = [];
      for (const f of this.faces) {
        const pts = f.pts.map(T);
        const depth = pts.reduce((t, p) => t + p[2], 0) / pts.length;
        if (f.line) { items.push({ f, pts, depth }); continue; }
        const n = T(f.n);
        if (n[2] > 0) continue;
        items.push({ f, pts, n, depth });
      }
      items.sort((p, q) => q.depth - p.depth);
      for (const it of items) {
        const base = it.f.part === "body" ? body : PART[it.f.part];
        if (it.f.line) { this._line(it.pts[0], it.pts[1], `rgb(${base})`, 2.4); continue; }
        const k = it.f.emit ? 1 : 0.3 + 0.7 * Math.max(0, (it.n[0] * L[0] + it.n[1] * L[1] + it.n[2] * L[2]) / ll);
        const fill = `rgb(${base.map((v) => Math.round(v * k))})`;
        g.beginPath();
        it.pts.forEach((p, j) => { const q = this._pr(p); if (j) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
        g.closePath(); g.fillStyle = fill; g.strokeStyle = fill; g.lineWidth = 0.6;
        g.fill(); g.stroke();
      }
      if (cfg.show_axes) {
        [["#e55", [1, 0, 0]], ["#5e5", [0, 1, 0]], ["#58f", [0, 0, 1]]].forEach(([col, v]) =>
          this._line([0, 0, 0], this._rot(v.map((c) => c * 0.9), u), col, 3));
      }
    }
    this._kick();
  }
}

if (!customElements.get("oralb-motion-card")) {
  customElements.define("oralb-motion-card", OralBMotionCard);
}
window.customCards = window.customCards || [];
window.customCards.push({
  type: "oralb-motion-card",
  name: "Oral-B Motion",
  description: "Live 3D tilt view of an Oral-B iO brush",
  preview: false,
});