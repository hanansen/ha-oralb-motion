const COLORS = {
  Black: [44, 44, 50], White: [238, 238, 242],
  Pink: [226, 168, 172], Violet: [124, 98, 168],
};
const PART = {
  neck: [236, 236, 240], base: [70, 120, 190], btn: [190, 194, 200],
  glow: [110, 230, 190], bristle: [170, 205, 240],
};

class OralBMotionPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.a = [0, 32, 0]; this.gy = [0, 0, 0]; this.ts = 0;
    this.faces = this._build();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._started) { this._started = true; this._init(); }
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
    // handle (body colour), glowing ring, neck
    rev([[-1.55, .140], [-1.5, .160], [-1.3, .172], [-0.7, .168],
         [0, .150], [0.3, .132], [0.45, .120]], "body");
    rev([[0.455, .128], [0.505, .128]], "glow", true);
    rev([[0.505, .100], [0.6, .065], [0.8, .052], [0.95, .050]], "neck");
    // bottom cap
    F.push({
      part: "body", n: [-1, 0, 0],
      pts: Array.from({ length: N }, (_, j) =>
        [-1.55, .14 * Math.cos((TAU * j) / N), .14 * Math.sin((TAU * j) / N)]),
    });
    // round power button on the front
    F.push({
      part: "btn", n: [0, 0, 1],
      pts: Array.from({ length: 18 }, (_, j) =>
        [0.1 + .05 * Math.cos((TAU * j) / 18), .05 * Math.sin((TAU * j) / 18), .148]),
    });
    // round brush head
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
    // bristle tufts
    const tuft = (cnt, rad) => {
      for (let j = 0; j < cnt; j++) {
        const t = (TAU * j) / cnt, s = hs + rad * Math.cos(t), x = rad * 0.7 * Math.sin(t);
        F.push({ part: "bristle", line: true, pts: [[s, x, z1], [s, x, z1 + .10]] });
      }
    };
    tuft(1, 0); tuft(7, .05); tuft(13, .10);
    return F;
  }

  _init() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;padding:16px;min-height:100vh;box-sizing:border-box;
          color:var(--primary-text-color);background:var(--primary-background-color)}
        canvas{width:100%;max-width:640px;background:#59616d;border-radius:12px}
        #nums{font-family:monospace;margin:8px 0}
        .ctl{display:flex;flex-wrap:wrap;gap:12px 20px;margin-top:8px}
      </style>
      <canvas width="640" height="480"></canvas>
      <div id="st">connecting...</div><div id="nums"></div>
      <div class="ctl">
        <label>Long axis <select id="axis"><option>x</option><option selected>y</option><option>z</option></select></label>
        <label><input type="checkbox" id="flip"> Head at the other end</label>
        <label>Handle rotation <input type="range" id="roll" min="0" max="360" value="0"></label>
        <label>Colour <select id="color"><option>Black</option><option>White</option><option>Pink</option><option>Violet</option></select></label>
        <label><input type="checkbox" id="axes"> Show axes</label>
      </div>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this.c = $("canvas"); this.g = this.c.getContext("2d");
    this.st = $("#st"); this.nums = $("#nums");
    this.axis = $("#axis"); this.flip = $("#flip"); this.roll = $("#roll");
    this.color = $("#color"); this.showAxes = $("#axes");
    this._hass.connection
      .subscribeMessage((ev) => this._onEvent(ev), { type: "oralb_motion/subscribe" })
      .then((unsub) => { if (this._dead) unsub(); else this._unsub = unsub; })
      .catch((e) => { this.st.textContent = e.message || "subscribe failed"; });
    this._draw();
  }

  disconnectedCallback() {
    this._dead = true;
    if (this._unsub) this._unsub();
    cancelAnimationFrame(this._raf);
  }

  _onEvent(d) {
    if (d.status) { this.st.textContent = d.status; return; }
    const k = 0.25, a = this.a;
    this.a = [a[0] + k * (d.ax - a[0]), a[1] + k * (d.ay - a[1]), a[2] + k * (d.az - a[2])];
    this.gy = [d.gx, d.gy, d.gz]; this.ts = d.ts;
  }

  _rot(p, u) { // rotate p so that u maps to world-up (0,1,0)
    const cr = [-u[2], 0, u[0]], s = Math.hypot(...cr), ct = u[1];
    if (s < 1e-6) return ct > 0 ? p : [p[0], -p[1], -p[2]];
    const k = cr.map((v) => v / s);
    const kx = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]];
    const kd = k[0] * p[0] + k[1] * p[1] + k[2] * p[2];
    return p.map((v, i) => v * ct + kx[i] * s + k[i] * kd * (1 - ct));
  }

  _pr(p) { const f = 400 / (p[2] + 4); return [this.c.width / 2 + p[0] * f, this.c.height / 2 - p[1] * f, f]; }

  _line(p, q, col, w) {
    const A = this._pr(p), B = this._pr(q), g = this.g;
    g.strokeStyle = col; g.lineWidth = (w * (A[2] + B[2])) / 200; g.lineCap = "round";
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
  }

  _draw() {
    const g = this.g, a = this.a, m = Math.hypot(...a);
    g.clearRect(0, 0, this.c.width, this.c.height);
    if (m > 8) {
      const u = a.map((v) => v / m), i = "xyz".indexOf(this.axis.value);
      const phi = (this.roll.value * Math.PI) / 180, flip = this.flip.checked;
      const cp = Math.cos(phi), sp = Math.sin(phi);
      const body = COLORS[this.color.value];
      const T = (p) => { // local (s,x,z) -> body axes -> world
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
        if (n[2] > 0) continue; // facing away from the camera
        items.push({ f, pts, n, depth });
      }
      items.sort((p, q) => q.depth - p.depth);
      for (const it of items) {
        const base = it.f.part === "body" ? body : PART[it.f.part];
        if (it.f.line) {
          this._line(it.pts[0], it.pts[1], `rgb(${base})`, 2.4);
          continue;
        }
        const k = it.f.emit ? 1 : 0.3 + 0.7 * Math.max(0, (it.n[0] * L[0] + it.n[1] * L[1] + it.n[2] * L[2]) / ll);
        const fill = `rgb(${base.map((v) => Math.round(v * k))})`;
        g.beginPath();
        it.pts.forEach((p, j) => { const q = this._pr(p); if (j) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
        g.closePath(); g.fillStyle = fill; g.strokeStyle = fill; g.lineWidth = 0.6;
        g.fill(); g.stroke();
      }
      if (this.showAxes.checked) {
        [["#e55", [1, 0, 0]], ["#5e5", [0, 1, 0]], ["#58f", [0, 0, 1]]].forEach(([col, v]) =>
          this._line([0, 0, 0], this._rot(v.map((c) => c * 0.9), u), col, 3));
      }
    }
    this.nums.textContent =
      `accel ${a.map((v) => v.toFixed(1))}  gyro ${this.gy}  |g| ${m.toFixed(1)}  t ${this.ts}`;
    this._raf = requestAnimationFrame(() => this._draw());
  }
}
customElements.define("oralb-motion-panel", OralBMotionPanel);
