// src/warp.js
// AETHER — "Signal Space"
//
// A self-contained WebGL world that opens when the visitor sends a signal.
// No engine, no dependencies: one fullscreen fragment shader renders a
// procedural deep-space environment (star field with warp streaks, volume
// nebula, a lit planet with atmosphere and night-side city lights, a distant
// sun, grain and vignetting) driven by pointer look and scroll travel.

const VERTEX_SHADER = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform float uTravel;
uniform float uSpeed;     // 0..1 travel throttle
uniform float uWarp;      // 0..1 jump intensity (drives streaks + flash)
uniform vec2  uLook;      // yaw, pitch
uniform float uFade;      // 0..1 scene fade-in

varying vec2 vUv;

// ── hashes ──────────────────────────────────────────────────────────────────
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// ── value noise / fbm ──────────────────────────────────────────────────────
float vnoise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

float vnoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash21(i.xy + i.z * 37.0);
  float n100 = hash21(i.xy + vec2(1.0, 0.0) + i.z * 37.0);
  float n010 = hash21(i.xy + vec2(0.0, 1.0) + i.z * 37.0);
  float n110 = hash21(i.xy + vec2(1.0, 1.0) + i.z * 37.0);
  float n001 = hash21(i.xy + (i.z + 1.0) * 37.0);
  float n101 = hash21(i.xy + vec2(1.0, 0.0) + (i.z + 1.0) * 37.0);
  float n011 = hash21(i.xy + vec2(0.0, 1.0) + (i.z + 1.0) * 37.0);
  float n111 = hash21(i.xy + vec2(1.0, 1.0) + (i.z + 1.0) * 37.0);
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}

vec3 rotateY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}
vec3 rotateX(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// Ridged noise — gives the nebula filament structure instead of soft cotton.
float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 4; i++) {
    float n = vnoise(p);
    v += a * (1.0 - abs(n * 2.0 - 1.0));
    p = p * 2.13 + vec2(3.1, 7.7);
    a *= 0.5;
  }
  return v;
}

// Layered star field. Stars are point sources; only the warp jump stretches
// them into radial streaks.
vec3 starField(vec2 p, float t, float warp, vec2 look, float px, float bandFactor) {
  vec3 col = vec3(0.0);

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float density = 120.0 - fi * 26.0;                       // cells across the screen
    vec2 uv = p * density + look * (6.0 + fi * 9.0);          // parallax when looking around

    vec2 id = floor(uv);
    vec2 gv = fract(uv) - 0.5;

    if (hash21(id + fi * 31.7) < 0.93) continue;

    // Keep the star well inside its cell so its halo is never clipped.
    vec2 starPos = (hash22(id + fi * 7.3) - 0.5) * 0.42;
    vec2 off = gv - starPos;
    float dist = length(off);

    // magnitude distribution: a few bright, very many faint
    float mag = pow(hash21(id + 3.37), 3.2);
    float twinkle = 0.88 + 0.12 * sin(t * 2.1 + hash21(id + 9.1) * 24.0);
    float bright = (0.10 + mag * 1.45) * twinkle * (0.55 + 0.85 * bandFactor);

    // sizes are authored in pixels, then converted into cell units
    float corePx = px * (0.85 + mag * 1.35);
    float core = corePx * density;
    float dot_ = smoothstep(core * 1.5, 0.0, dist) * bright;
    float bloom = smoothstep(core * 2.6, 0.0, dist) * bright * 0.13;

    // radial streak while jumping
    vec2 radial = normalize(p + vec2(1e-5));
    float along = dot(off, radial);
    float perp = length(off - radial * along);
    float streakLen = warp * 0.18;
    float streak = smoothstep(core * 0.8, 0.0, perp) *
                   smoothstep(streakLen, 0.0, abs(along)) * warp * bright * 1.7;

    vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.88, 0.72), hash21(id + 5.13));
    col += tint * (dot_ + bloom + streak);
  }

  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float px = 1.0 / uRes.y;

  // Camera ray with pointer look and a whisper of camera shake.
  float shake = (1.0 - uWarp) * 0.0009;
  vec3 rd = normalize(vec3(p * 1.55 + vec2(sin(uTime * 1.7), cos(uTime * 1.3)) * shake, -1.0));
  rd = rotateY(rd, uLook.x);
  rd = rotateX(rd, uLook.y);

  vec3 sunDir = normalize(vec3(-0.72, 0.30, -0.62));

  // ── deep space base (very dark, so the stars read) ───────────────────────
  vec3 col = mix(vec3(0.0018, 0.0022, 0.0045), vec3(0.0035, 0.0045, 0.0090),
                 smoothstep(0.85, -0.25, rd.y));

  // ── nebula: filamentary, and only where it belongs ──────────────────────
  vec2 nuv = rd.xy * 4.2 + vec2(uTravel * 0.0025, uLook.y * 0.16);
  float fil = ridged(nuv);
  float region = smoothstep(0.46, 0.88, fbm(rd.xy * 0.8 + 5.0));
  float density = pow(smoothstep(0.55, 1.05, fil), 2.3) * region;
  vec3 nebulaTint = mix(vec3(0.24, 0.38, 0.86), vec3(0.78, 0.34, 0.38), fbm(nuv * 0.5));
  col += nebulaTint * density * 0.20;

  // ── stars, denser along the galactic band ───────────────────────────────
  float bandFactor = smoothstep(0.55, 0.02, abs(dot(rd, normalize(vec3(0.35, 0.88, 0.32)))));
  col += starField(p, uTime, uWarp, uLook, px, bandFactor);
  col += vec3(0.020, 0.023, 0.036) * bandFactor * 0.5;

  // ── distant sun: small disc, tight halo ─────────────────────────────────
  float sunDot = dot(rd, sunDir);
  float sunDisc = smoothstep(0.99988, 0.99996, sunDot);
  float halo = pow(max(sunDot, 0.0), 9000.0) * 1.2 +
               pow(max(sunDot, 0.0), 420.0) * 0.11 +
               pow(max(sunDot, 0.0), 55.0) * 0.022;
  col += vec3(1.0, 0.96, 0.90) * sunDisc * 7.0;
  col += vec3(1.0, 0.84, 0.60) * halo;

  // ── planet ───────────────────────────────────────────────────────────────
  vec3 planetPos = vec3(0.78, -0.36, -5.25 + uTravel * 0.0009);
  float planetR = 1.26;
  vec3 oc = -planetPos;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - planetR * planetR;
  float disc = b * b - c;

  float limbGlow = 0.0;

  if (disc > 0.0) {
    float tHit = -b - sqrt(disc);
    if (tHit > 0.0) {
      vec3 hit = rd * tHit - planetPos;
      vec3 nrm = normalize(hit);

      vec3 sp = rotateY(hit, uTravel * 0.0025);
      float terrain = vnoise3(sp * 3.2) * 0.58 + vnoise3(sp * 8.0) * 0.28 + vnoise3(sp * 19.0) * 0.14;
      float ice = smoothstep(0.74, 0.94, abs(nrm.y) + terrain * 0.10);

      vec3 ocean = vec3(0.055, 0.115, 0.215);
      vec3 land = mix(vec3(0.19, 0.175, 0.125), vec3(0.38, 0.33, 0.22), terrain);
      vec3 surf = mix(ocean, land, smoothstep(0.455, 0.505, terrain));
      surf = mix(surf, vec3(0.70, 0.76, 0.84), ice * 0.85);

      // weather: slow cloud bands over the surface
      float clouds = smoothstep(0.60, 0.88, vnoise3(sp * 3.9 + vec3(0.0, uTime * 0.008, 0.0)));
      surf = mix(surf, vec3(0.90, 0.92, 0.95), clouds * 0.32);

      float ndl = dot(nrm, sunDir);
      float day = smoothstep(-0.05, 0.10, ndl);
      float dusk = smoothstep(-0.18, 0.02, ndl) * (1.0 - smoothstep(0.01, 0.18, ndl));

      vec3 lit = surf * day * 1.9 * vec3(1.05, 1.0, 0.93);

      // specular glint off the ocean
      float oceanMask = 1.0 - smoothstep(0.455, 0.505, terrain);
      float glint = pow(max(dot(reflect(rd, nrm), sunDir), 0.0), 110.0) * oceanMask * day;
      lit += vec3(1.0, 0.95, 0.85) * glint * 0.35;

      // city lights on the night side
      float night = 1.0 - smoothstep(-0.06, 0.10, ndl);
      lit += vec3(0.016, 0.022, 0.045) * night * (0.5 + 0.5 * terrain);
      if (night > 0.001) {
        vec2 grid = sp.xy * 74.0 + sp.z * 24.0;
        vec2 cell = floor(grid);
        vec2 sub = fract(grid) - 0.5;
        if (hash21(cell) > 0.981) {
          vec2 jitter = (hash22(cell + 3.7) - 0.5) * 0.55;
          float d = length(sub - jitter);
          float lamp = smoothstep(0.20, 0.0, d) * night * step(0.48, terrain);
          lit += vec3(1.0, 0.66, 0.28) * lamp * 1.15;
        }
      }

      // atmosphere: cool rim, warm terminator haze
      float fres = pow(1.0 - max(dot(nrm, -rd), 0.0), 3.0);
      vec3 sky = mix(vec3(0.16, 0.38, 0.80), vec3(0.60, 0.78, 1.0), fres);
      lit += sky * fres * (0.10 + 0.42 * max(ndl, 0.0));
      lit += vec3(0.95, 0.58, 0.34) * dusk * 0.11;
      // thin scattering band right at the day/night line
      lit += vec3(0.30, 0.48, 0.82) * exp(-abs(ndl) * 7.0) * 0.30 * max(ndl + 0.25, 0.0);

      col = lit;
    }
  }

  // outer atmospheric ring hugging the limb
  float closest = length(oc + rd * max(-b, 0.0));
  float ring = smoothstep(planetR * 1.038, planetR * 0.998, closest) *
               smoothstep(planetR * 0.988, planetR * 1.002, closest);
  vec3 ringCol = mix(vec3(0.20, 0.42, 0.88), vec3(0.75, 0.88, 1.0),
                     smoothstep(planetR * 0.99, planetR * 1.035, closest));
  col += ringCol * ring * 0.85;

  // ── jump ignition ────────────────────────────────────────────────────────
  col += vec3(0.70, 0.82, 1.0) * uWarp * uWarp * 0.85;

  // ── grade: filmic tonemap, vignette, grain ──────────────────────────────
  col *= 1.0 - 0.38 * dot(p, p) * 0.85;
  col = aces(col * 1.05);
  col = pow(col, vec3(0.4545));
  float grain = hash21(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5;
  col += grain * 0.010;
  col *= uFade;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class WarpWorld {
  constructor(options = {}) {
    this.canvas = options.canvas;
    this.options = options;
    this.gl = null;
    this.program = null;
    this.uniforms = {};
    this.active = false;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // camera + travel state
    this.look = { x: 0, y: 0, targetX: 0, targetY: 0 };
    this.speed = this.reducedMotion ? 0 : 0.35;
    this.targetSpeed = this.speed;
    this.travel = 0;
    this.time = 0;
    this.warp = 0;
    this.fade = 0;
    this.frame = null;
    this.lastTime = 0;
    this.frameSamples = 0;
    this.renderScale = 1;
    this.dragging = false;
    this.lastPointer = { x: 0, y: 0 };
    this.listeners = {};

    this.onStateChange = options.onStateChange || (() => {});
  }

  // ── setup ─────────────────────────────────────────────────────────────────
  init() {
    if (this.gl) return true;
    const gl = this.canvas.getContext('webgl', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return false;
    this.gl = gl;

    const vertex = this.compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = this.compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertex || !fragment) return false;

    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[warp] link failed:', gl.getProgramInfoLog(program));
      return false;
    }
    this.program = program;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    ['uRes', 'uTime', 'uTravel', 'uSpeed', 'uWarp', 'uLook', 'uFade'].forEach((name) => {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    });

    this.bindEvents();
    return true;
  }

  compile(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[warp] shader error:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  bindEvents() {
    const canvas = this.canvas;

    this.onPointerDown = (event) => {
      if (!this.active) return;
      this.dragging = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add('is-dragging');
    };
    this.onPointerMove = (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastPointer.x;
      const dy = event.clientY - this.lastPointer.y;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.look.targetX -= dx * 0.0026;
      this.look.targetY = Math.max(-0.9, Math.min(0.9, this.look.targetY - dy * 0.0022));
      this.wake();
    };
    this.onPointerUp = (event) => {
      this.dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.classList.remove('is-dragging');
    };
    this.onWheel = (event) => {
      if (!this.active) return;
      event.preventDefault();
      this.targetSpeed = Math.max(0, Math.min(1, this.targetSpeed - event.deltaY * 0.0012));
      this.wake();
    };
    this.onKey = (event) => {
      if (event.key === 'Escape' && this.active) {
        event.preventDefault();
        this.options.onExit?.();
      }
      if (event.key === 'ArrowUp') this.targetSpeed = Math.min(1, this.targetSpeed + 0.08);
      if (event.key === 'ArrowDown') this.targetSpeed = Math.max(0, this.targetSpeed - 0.08);
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') this.wake();
    };
    this.onVisibility = () => {
      if (document.hidden) this.stopLoop();
      else if (this.active) this.wake();
    };
    this.onResize = () => {
      this.resize();
      this.wake();
    };

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('resize', this.onResize);
  }

  resize() {
    if (!this.gl) return;
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const maxPixels = 2300000;
    let scale = this.renderScale * dpr;

    // keep the shader inside a sane pixel budget
    while (width * scale * height * scale > maxPixels && scale > 0.45) scale -= 0.08;
    if (width * scale * height * scale > maxPixels) scale = 0.45;

    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  async open() {
    if (this.active) return true;
    if (!this.init()) {
      this.options.onUnavailable?.();
      return false;
    }
    this.active = true;
    this.fade = 0;
    this.warp = this.reducedMotion ? 0 : 1;
    this.look.targetX = 0;
    this.look.targetY = 0;
    this.resize();
    this.options.onOpen?.();
    this.lastTime = performance.now();
    this.startLoop();
    return true;
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.stopLoop();
    this.options.onClose?.();
  }

  // In reduced-motion the scene is frozen, so the loop only runs while the
  // fade and look settle. wake() restarts it for each interaction.
  wake() {
    if (this.reducedMotion) this.settled = false;
    this.startLoop();
  }

  startLoop() {
    if (this.frame) return;
    this.lastTime = performance.now();
    const tick = (now) => {
      if (!this.active) return;
      this.frame = requestAnimationFrame(tick);
      this.render(now);
    };
    this.frame = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  render(now) {
    const gl = this.gl;
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // ease look + speed
    this.look.x += (this.look.targetX - this.look.x) * Math.min(1, dt * 6);
    this.look.y += (this.look.targetY - this.look.y) * Math.min(1, dt * 6);
    this.speed += (this.targetSpeed - this.speed) * Math.min(1, dt * 3);
    this.time += dt * (this.reducedMotion ? 0 : 1);
    this.travel += dt * this.speed * (this.reducedMotion ? 0 : 60);
    this.warp = Math.max(0, this.warp - dt * 0.8);
    this.fade = Math.min(1, this.fade + dt * 1.6);

    // Nothing is animating any more in reduced motion: stop until next input.
    if (this.reducedMotion) {
      const lookSettled =
        Math.abs(this.look.targetX - this.look.x) < 0.0008 &&
        Math.abs(this.look.targetY - this.look.y) < 0.0008;
      const speedSettled = Math.abs(this.targetSpeed - this.speed) < 0.0015;
      if (this.fade >= 1 && lookSettled && speedSettled) {
        this.stopLoop();
      }
    }

    gl.uniform2f(this.uniforms.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniforms.uTime, this.time);
    gl.uniform1f(this.uniforms.uTravel, this.travel);
    gl.uniform1f(this.uniforms.uSpeed, this.speed);
    gl.uniform1f(this.uniforms.uWarp, this.warp);
    gl.uniform2f(this.uniforms.uLook, this.look.x, this.look.y);
    gl.uniform1f(this.uniforms.uFade, this.fade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.options.onTick?.({
      speed: this.speed,
      travel: this.travel,
      look: this.look,
    });
  }

  destroy() {
    this.close();
    const canvas = this.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('resize', this.onResize);
  }
}
