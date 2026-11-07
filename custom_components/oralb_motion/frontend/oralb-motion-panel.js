class OralBMotionPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.a = [0, 32, 0]; this.gy = [0, 0, 0]; this.ts = 0;
  }
  set hass(hass) {
    this._hass = hass;
    if (!this._started) { this._started = true; this._init(); }
  }
  _init() {
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;padding:16px;min-height:100vh;box-sizing:border-box;
          color:var(--primary-text-color);background:var(--primary-background-color)}
        canvas{width:100%;max-width:640px;background:var(--card-background-color);border-radius:12px}
        #nums{font-family:monospace;margin:8px 0}
      </style>
      <canvas width="640" height="480"></canvas>
      <div id="st">connecting...</div><div id="nums"></div>
      <label>Long axis of brush:
        <select id="axis"><option>x</option><option selected>y</option><option>z</option></select>
      </label>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this.c = $("canvas"); this.g = this.c.getContext("2d");
    this.st = $("#st"); this.nums = $("#nums"); this.axis = $("#axis");
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
    const x = [u[2] * -0 + u[1] * 0 - u[2] * 1 * 0, 0, 0];
    const cr = [-u[2], 0, u[0]]; // u x (0,1,0)
    const s = Math.hypot(...cr), ct = u[1];
    if (s < 1e-6) return ct > 0 ? p : [p[0], -p[1], -p[2]];
    const k = cr.map((v) => v / s);
    const kx = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]];
    const kd = k[0] * p[0] + k[1] * p[1] + k[2] * p[2];
    return p.map((v, i) => v * ct + kx[i] * s + k[i] * kd * (1 - ct));
  }
  _pr(p) { const f = 260 / (p[2] + 4); return [this.c.width / 2 + p[0] * f, this.c.height / 2 - p[1] * f, f]; }
  _line(p, q, col, w) {
    const A = this._pr(p), B = this._pr(q), g = this.g;
    g.strokeStyle = col; g.lineWidth = (w * (A[2] + B[2])) / 520; g.lineCap = "round";
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke();
  }
  _draw() {
    const g = this.g, a = this.a, m = Math.hypot(...a);
    g.clearRect(0, 0, this.c.width, this.c.height);
    if (m > 8) {
      const u = a.map((v) => v / m), i = "xyz".indexOf(this.axis.value);
      const L = [0, 0, 0]; L[i] = 1;
      const tail = this._rot(L.map((v) => -v * 1.3), u);
      const neck = this._rot(L.map((v) => v * 0.7), u);
      const head = this._rot(L.map((v) => v * 1.3), u);
      this._line(tail, neck, "#4a90d9", 34);
      this._line(neck, head, "#bbb", 14);
      this._line(neck, head, "#fff", 6);
      [["#e55", [1, 0, 0]], ["#5e5", [0, 1, 0]], ["#58f", [0, 0, 1]]].forEach(([col, v]) =>
        this._line([0, 0, 0], this._rot(v, u), col, 3));
    }
    this.nums.textContent =
      `accel ${a.map((v) => v.toFixed(1))}  gyro ${this.gy}  |g| ${m.toFixed(1)}  t ${this.ts}`;
    this._raf = requestAnimationFrame(() => this._draw());
  }
}
customElements.define("oralb-motion-panel", OralBMotionPanel);