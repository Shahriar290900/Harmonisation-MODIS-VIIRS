// The three.js Earth: real NASA textures, the real Sun, the five fire satellites at their SGP4 positions, today's hot spots.
// Everything is in one Earth-fixed frame (earth/geo.ts). Pure imperative code; React (EarthView) only draws the HUD.
import {
  AdditiveBlending, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, Clock, Color, DoubleSide, Group, Line, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, PerspectiveCamera, Points,
  PointsMaterial, Quaternion, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Sprite, SpriteMaterial, CanvasTexture, Texture, TextureLoader, Vector3, WebGLRenderer, NoColorSpace
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { gsap } from 'gsap';
import type { SatTle, WorldKey, WorldSource } from '../data/live';
import { makeSats, subPoint, type Sat } from '../live/orbits';
import { altRadius, countryAt, subsolar, toXyz } from './geo';

export type Group2 = 'modis' | 'viirs';
export const GROUP_COLOR: Record<Group2, string> = { modis: '#00B4D8', viirs: '#9A72F7' }; // same data colours as the tokens --aqua and --viirs
const groupOfSat = (key: string): Group2 => (key === 'terra' || key === 'aqua' ? 'modis' : 'viirs');
const GROUP_OF: Record<WorldKey, Group2> = { modis: 'modis', noaa20: 'viirs', noaa21: 'viirs', snpp: 'viirs' };

export interface SatInfo { key: string; name: string; group: Group2; lat: number; lon: number; altKm: number; speedKms: number; over: string | null }
export interface Layers { hot: boolean; orbits: boolean; night: boolean; labels: boolean }
export interface EarthDebug {
  ready: boolean; textures: { day: boolean; night: boolean; bump: boolean; water: boolean }; frames: number; hotspots: number;
  sats: { name: string; lat: number; lon: number; altKm: number }[]; sun: { lat: number; lon: number }; following: string | null; distance: number;
}
export interface SceneOptions {
  container: HTMLElement; labelLayer: HTMLElement; phone: boolean; reduced: boolean;
  onTick: (sats: SatInfo[], sun: { lat: number; lon: number }) => void;
  onFollow: (key: string | null) => void; onFail: (why: string) => void;
  startView: { lat: number; lon: number; dist: number };
}

const ORBIT_BEHIND_S = 25 * 60, ORBIT_AHEAD_S = 110 * 60, ORBIT_STEP_S = 30, ORBIT_REBUILD_MS = 5 * 60_000;

const EARTH_VS = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vPos;
void main() { vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vPos = mv.xyz; gl_Position = projectionMatrix * mv; }`;
const EARTH_FS = /* glsl */ `
uniform sampler2D uDay, uNight, uBump, uWater; uniform vec3 uSun; uniform float uNightOn, uGlint, uRelief;
varying vec2 vUv; varying vec3 vN; varying vec3 vPos;
float hgt(vec2 uv) { return texture2D(uBump, uv).r; }
void main() {
  vec3 L = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);
  vec3 N = normalize(vN); vec3 V = normalize(-vPos);
  // relief: bump from the elevation map (screen-space derivatives), exaggerated so mountains read at globe scale
  vec2 dx = dFdx(vUv), dy = dFdy(vUv);
  if (abs(dx.x) > 0.5) dx = vec2(0.0); if (abs(dy.x) > 0.5) dy = vec2(0.0);
  float H = hgt(vUv); float bx = hgt(vUv + dx) - H; float by = hgt(vUv + dy) - H;
  vec3 sx = dFdx(vPos), sy = dFdy(vPos); vec3 r1 = cross(sy, N), r2 = cross(N, sx); float det = dot(sx, r1);
  vec3 Nb = normalize(abs(det) * N - uRelief * sign(det) * (bx * r1 + by * r2));
  float ndl = dot(N, L); float ndb = dot(Nb, L);
  float dayF = smoothstep(-0.08, 0.22, ndl);
  vec3 day = texture2D(uDay, vUv).rgb;
  vec3 lit = day * (0.06 + 1.05 * max(ndb, 0.0));
  float tw = smoothstep(-0.16, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.28, ndl));
  lit += vec3(1.0, 0.42, 0.16) * 0.10 * tw * day;
  float ocean = texture2D(uWater, vUv).r;
  vec3 Hh = normalize(L + V); float spec = pow(max(dot(Nb, Hh), 0.0), 1400.0) * ocean * uGlint * smoothstep(0.0, 0.25, ndl);
  lit += vec3(1.0, 0.96, 0.88) * spec * 0.35;
  vec3 nl = texture2D(uNight, vUv).rgb;
  vec3 night = day * 0.012 + nl * vec3(1.9, 1.5, 1.1) * 0.55 * uNightOn * (1.0 - ocean * 0.3);
  vec3 col = mix(night, lit, dayF);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.2);
  col += vec3(0.18, 0.42, 1.0) * rim * (0.10 + 0.9 * smoothstep(-0.35, 0.45, ndl)) * 0.85;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;
const ATMO_VS = /* glsl */ `varying vec3 vN; varying vec3 vW;
void main() { vN = normalize(normalMatrix * normal); vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ATMO_FS = /* glsl */ `uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
void main() {
  float i = pow(max(0.0, 0.66 - dot(vN, vec3(0.0, 0.0, 1.0))), 2.6);
  float s = 0.18 + 0.82 * smoothstep(-0.45, 0.35, dot(vW, uSun));
  gl_FragColor = vec4(vec3(0.28, 0.58, 1.0) * i * s * 1.9, 1.0);
}`;
const HOT_VS = /* glsl */ `attribute float aGroup; uniform float uSize, uPx; varying float vG;
void main() { vG = aGroup; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize * uPx * clamp(2.8 / length(mv.xyz), 0.8, 3.2); gl_Position = projectionMatrix * mv; }`;
const HOT_FS = /* glsl */ `uniform vec3 uModis, uViirs; varying float vG;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
  float core = smoothstep(0.55, 0.0, d); float glow = smoothstep(1.0, 0.2, d);
  vec3 c = mix(vG < 0.5 ? uModis : uViirs, vec3(1.0), core * 0.06);
  gl_FragColor = vec4(c * (glow * 0.3 + core * 0.18), glow * 0.7);
}`;
const ORBIT_VS = /* glsl */ `attribute float aT; uniform float uNow; varying float vA;
void main() {
  float dt = aT - uNow;
  vA = dt >= 0.0 ? mix(0.9, 0.3, clamp(dt / ${ORBIT_AHEAD_S}.0, 0.0, 1.0)) : 0.8 * clamp(1.0 + dt / ${ORBIT_BEHIND_S}.0, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ORBIT_FS = /* glsl */ `uniform vec3 uColor; varying float vA; void main() { gl_FragColor = vec4(uColor * vA, vA); }`;

function glowTexture(stops: [number, string][]): CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!; const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

interface SatObj { sat: Sat; group: Group2; model: Group; glow: Sprite; line: Line; label: HTMLElement; pos: Vector3; info: SatInfo | null; visible: boolean }

export class EarthScene {
  private o: SceneOptions;
  private renderer: WebGLRenderer; private scene = new Scene(); private camera: PerspectiveCamera; private controls: OrbitControls;
  private earth!: Mesh; private earthMat!: ShaderMaterial; private atmoMat!: ShaderMaterial; private hot: Points | null = null; private hotMat: ShaderMaterial;
  private hudRects: { left: number; right: number; top: number; bottom: number }[] = []; private hudAt = 0; private sunSprite: Sprite; private stars: Points; private sats: SatObj[] = []; private orbitT0 = 0; private orbitsGroup = new Group();
  private layers: Layers = { hot: true, orbits: true, night: true, labels: true };
  private tex = { day: false, night: false, bump: false, water: false };
  private loaded: Texture[] = [];
  private frames = 0; private hotCount = 0; private sun = { lat: 0, lon: 0 }; private sunAt = 0; private tickAt = 0; private overAt = 0;
  private followKey: string | null = null; private tween: gsap.core.Tween | null = null;
  private raf = 0; private active = true; private onScreen = true; private disposed = false; private clock = new Clock();
  private lastInput = performance.now(); private ro: ResizeObserver; private io: IntersectionObserver;
  private down: { x: number; y: number } | null = null; private cleanups: (() => void)[] = [];
  private w = 1; private h = 1;
  private tmpV = new Vector3(); private tmpV2 = new Vector3(); private tmpQ = new Quaternion(); private tmpQ2 = new Quaternion();

  constructor(o: SceneOptions) {
    this.o = o;
    const dpr = Math.min(devicePixelRatio || 1, o.phone ? 1.5 : 2);
    this.renderer = new WebGLRenderer({ antialias: !o.phone, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(dpr); this.renderer.setClearColor(new Color('#04060c'), 1);
    this.renderer.domElement.setAttribute('role', 'img');
    o.container.appendChild(this.renderer.domElement);
    const lost = (e: Event) => { e.preventDefault(); o.onFail('The 3D view lost its graphics context.'); };
    this.renderer.domElement.addEventListener('webglcontextlost', lost); this.cleanups.push(() => this.renderer.domElement.removeEventListener('webglcontextlost', lost));

    this.camera = new PerspectiveCamera(38, 1, 0.04, 200);
    toXyz(o.startView.lat, o.startView.lon, o.startView.dist, this.camera.position);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    Object.assign(this.controls, { enablePan: false, enableDamping: true, dampingFactor: 0.07, minDistance: 1.22, maxDistance: 9, zoomSpeed: 0.7, autoRotate: !o.reduced, autoRotateSpeed: 0.45 });
    this.controls.addEventListener('start', () => { this.lastInput = performance.now(); this.controls.autoRotate = false; this.killTween(); });
    this.controls.addEventListener('end', () => { this.lastInput = performance.now(); });

    const seg = o.phone ? 72 : 160;
    const earthMat = new ShaderMaterial({
      vertexShader: EARTH_VS, fragmentShader: EARTH_FS,
      uniforms: { uDay: { value: null }, uNight: { value: null }, uBump: { value: null }, uWater: { value: null }, uSun: { value: new Vector3(1, 0, 0) }, uNightOn: { value: 1 }, uGlint: { value: o.phone ? 0 : 1 }, uRelief: { value: 0.03 } }
    });
    this.earthMat = earthMat;
    const dummy = new Texture(); // 1x1 placeholder until the images arrive
    for (const k of ['uDay', 'uNight', 'uBump', 'uWater']) earthMat.uniforms[k].value = dummy;
    this.loaded.push(dummy);
    this.earth = new Mesh(new SphereGeometry(1, seg, seg / 2), earthMat); this.scene.add(this.earth);
    this.atmoMat = new ShaderMaterial({ vertexShader: ATMO_VS, fragmentShader: ATMO_FS, uniforms: { uSun: { value: new Vector3(1, 0, 0) } }, side: BackSide, blending: AdditiveBlending, transparent: true, depthWrite: false });
    this.scene.add(new Mesh(new SphereGeometry(1.06, seg / 2, seg / 4), this.atmoMat));

    // decorative stars (not data)
    const n = o.phone ? 900 : 2200, sp = new Float32Array(n * 3), sc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), b = 0.35 + Math.random() * 0.65;
      sp.set([r * Math.cos(a) * 60, u * 60, r * Math.sin(a) * 60], i * 3); sc.set([b * (0.85 + Math.random() * 0.15), b * 0.92, b], i * 3);
    }
    const sg = new BufferGeometry(); sg.setAttribute('position', new BufferAttribute(sp, 3)); sg.setAttribute('color', new BufferAttribute(sc, 3));
    this.stars = new Points(sg, new PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, transparent: true, opacity: 0.9 }));
    this.scene.add(this.stars);
    this.sunSprite = new Sprite(new SpriteMaterial({ map: glowTexture([[0, 'rgba(255,248,220,1)'], [0.12, 'rgba(255,226,150,0.85)'], [0.4, 'rgba(255,170,60,0.22)'], [1, 'rgba(255,140,40,0)']]), blending: AdditiveBlending, depthWrite: false, transparent: true }));
    this.sunSprite.scale.setScalar(6); this.scene.add(this.sunSprite);
    this.scene.add(this.orbitsGroup);

    const col = (h: string) => { const c = new Color(h); return new Vector3(c.r, c.g, c.b); };
    this.hotMat = new ShaderMaterial({
      vertexShader: HOT_VS, fragmentShader: HOT_FS, transparent: true, depthWrite: false, blending: AdditiveBlending,
      uniforms: { uSize: { value: o.phone ? 3.4 : 3.8 }, uPx: { value: dpr }, uModis: { value: col(GROUP_COLOR.modis) }, uViirs: { value: col(GROUP_COLOR.viirs) } }
    });

    this.updateSun(true);
    this.loadTextures();

    const el = this.renderer.domElement;
    const pd = (e: PointerEvent) => { this.down = { x: e.clientX, y: e.clientY }; };
    const pu = (e: PointerEvent) => {
      const d = this.down; this.down = null; if (!d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) { if (this.followKey) this.setFollow(null); return; }
      const r = el.getBoundingClientRect(); this.pick(e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('pointerdown', pd); el.addEventListener('pointerup', pu);
    this.cleanups.push(() => { el.removeEventListener('pointerdown', pd); el.removeEventListener('pointerup', pu); });

    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(o.container); this.resize();
    this.io = new IntersectionObserver((e) => { this.onScreen = e[0]?.isIntersecting ?? true; this.kick(); }, { threshold: 0 }); this.io.observe(o.container);
    const vis = () => this.kick(); document.addEventListener('visibilitychange', vis); this.cleanups.push(() => document.removeEventListener('visibilitychange', vis));
    this.kick();
  }

  private loadTextures() {
    const base = (import.meta.env.BASE_URL || './') + 'textures/';
    const L = new TextureLoader();
    const get = (file: string, key: 'day' | 'night' | 'bump' | 'water', uniform: string, srgb: boolean) => {
      L.load(base + file, (t) => {
        if (this.disposed) { t.dispose(); return; }
        t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace; t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true;
        this.earthMat.uniforms[uniform].value = t; this.loaded.push(t); this.tex[key] = true; this.kick();
      }, undefined, () => this.o.onFail(`Could not load the ${key} picture of Earth.`));
    };
    get('day.jpg', 'day', 'uDay', true); get('night.jpg', 'night', 'uNight', true); get('bump.png', 'bump', 'uBump', false); get('water.png', 'water', 'uWater', false);
  }

  private resize() {
    const r = this.o.container.getBoundingClientRect(); const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === this.w && h === this.h && this.frames > 0) return;
    this.w = w; this.h = h; this.renderer.setSize(w, h, false); this.camera.aspect = w / h;
    // keep the globe fully in view on tall/narrow screens
    this.camera.fov = w / h < 0.8 ? 50 : 38; this.camera.updateProjectionMatrix(); this.kick();
  }

  /** (Re)start the loop only while the view can be seen. */
  private kick() {
    const run = this.active && this.onScreen && !document.hidden && !this.disposed;
    if (run && !this.raf) { this.clock.getDelta(); this.raf = requestAnimationFrame(this.loop); }
    if (!run && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
  }
  setActive(a: boolean) { this.active = a; this.kick(); }

  private updateSun(force = false) {
    const t = Date.now(); if (!force && t - this.sunAt < 5000) return; this.sunAt = t;
    this.sun = subsolar(new Date(t));
    const d = toXyz(this.sun.lat, this.sun.lon, 1, this.tmpV);
    this.earthMat.uniforms.uSun.value.copy(d); this.atmoMat.uniforms.uSun.value.copy(d); this.sunSprite.position.copy(d).multiplyScalar(24);
  }

  setSats(tles: SatTle[]) {
    for (const s of this.sats) { this.orbitsGroup.remove(s.line, ...(s.line.userData.twins as Line[])); this.scene.remove(s.model, s.glow); s.label.remove(); s.line.geometry.dispose(); }
    this.sats = [];
    for (const sat of makeSats(tles)) {
      const group = groupOfSat(sat.key), color = new Color(GROUP_COLOR[group]);
      const model = new Group();
      const body = new Mesh(new BoxGeometry(1, 1, 1.7), new MeshBasicMaterial({ color: '#dfe7f5' }));
      const panelMat = new MeshBasicMaterial({ color, side: DoubleSide });
      const pl = new Mesh(new BoxGeometry(2.6, 0.06, 1.1), panelMat), pr = pl.clone(); pl.position.x = -1.95; pr.position.x = 1.95;
      model.add(body, pl, pr); this.scene.add(model);
      const glow = new Sprite(new SpriteMaterial({ map: glowTexture([[0, 'rgba(255,255,255,0.9)'], [0.25, GROUP_COLOR[group] + 'aa'], [1, GROUP_COLOR[group] + '00']]), blending: AdditiveBlending, depthWrite: false, transparent: true, depthTest: false }));
      this.scene.add(glow);
      const g = new BufferGeometry();
      const line = new Line(g, new ShaderMaterial({ vertexShader: ORBIT_VS, fragmentShader: ORBIT_FS, transparent: true, blending: AdditiveBlending, depthWrite: false, uniforms: { uNow: { value: 0 }, uColor: { value: new Vector3(color.r, color.g, color.b) } } }));
      line.frustumCulled = false; this.orbitsGroup.add(line);
      // 1 px lines are too faint on a sphere: two copies nudged up and down make the path about 3 px wide
      const twins = [0.0016, -0.0016].map((dy) => { const l = new Line(g, line.material); l.position.y = dy; l.frustumCulled = false; this.orbitsGroup.add(l); return l; });
      line.userData.twins = twins;
      const label = document.createElement('div'); label.className = 'ev-satlabel'; label.dataset.group = group;
      label.innerHTML = '<i></i><span></span>'; (label.lastChild as HTMLElement).textContent = sat.name; this.o.labelLayer.appendChild(label);
      this.sats.push({ sat, group, model, glow, line, label, pos: new Vector3(), info: null, visible: false });
    }
    this.buildOrbits();
    this.applyLayers();
  }

  private buildOrbits() {
    const t0 = Date.now(); this.orbitT0 = t0;
    for (const s of this.sats) {
      const n = Math.floor((ORBIT_BEHIND_S + ORBIT_AHEAD_S) / ORBIT_STEP_S) + 1;
      const p = new Float32Array(n * 3), tt = new Float32Array(n); let k = 0;
      for (let i = 0; i < n; i++) {
        const dt = -ORBIT_BEHIND_S + i * ORBIT_STEP_S, sp = subPoint(s.sat, new Date(t0 + dt * 1000)); if (!sp) continue;
        toXyz(sp.lat, sp.lon, altRadius(sp.altKm), this.tmpV); p.set([this.tmpV.x, this.tmpV.y, this.tmpV.z], k * 3); tt[k++] = dt;
      }
      s.line.geometry.dispose(); const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(p.subarray(0, k * 3), 3)); g.setAttribute('aT', new BufferAttribute(tt.subarray(0, k), 1)); s.line.geometry = g; for (const l of s.line.userData.twins as Line[]) l.geometry = g;
    }
  }

  setHotspots(sources: WorldSource[]): number {
    if (this.hot) { this.scene.remove(this.hot); this.hot.geometry.dispose(); this.hot = null; }
    const cap = this.o.phone ? 45_000 : 300_000;
    let total = 0; for (const s of sources) if (s.raw) total += s.raw.length / 4;
    const stride = Math.max(1, Math.ceil(total / cap)); const pos = new Float32Array(Math.ceil(total / stride) * 3 + 3), grp = new Float32Array(Math.ceil(total / stride) + 1);
    let k = 0, c = 0;
    for (const s of sources) {
      const r = s.raw; if (!r) continue; const g = GROUP_OF[s.key] === 'modis' ? 0 : 1;
      for (let i = 0; i < r.length; i += 4) {
        if (c++ % stride) continue;
        toXyz(r[i + 1] / 100, r[i] / 100, 1.003, this.tmpV); pos[k * 3] = this.tmpV.x; pos[k * 3 + 1] = this.tmpV.y; pos[k * 3 + 2] = this.tmpV.z; grp[k++] = g;
      }
    }
    this.hotCount = k;
    if (k) {
      const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(pos.subarray(0, k * 3), 3)); geo.setAttribute('aGroup', new BufferAttribute(grp.subarray(0, k), 1));
      this.hot = new Points(geo, this.hotMat); this.hot.frustumCulled = false; this.hot.renderOrder = 2; this.hot.visible = this.layers.hot; this.scene.add(this.hot);
    }
    this.kick(); return k;
  }

  setLayers(l: Layers) { this.layers = l; this.applyLayers(); }
  private applyLayers() {
    if (this.hot) this.hot.visible = this.layers.hot;
    this.orbitsGroup.visible = this.layers.orbits; this.earthMat.uniforms.uNightOn.value = this.layers.night ? 1 : 0;
    for (const s of this.sats) s.label.style.display = this.layers.labels ? '' : 'none';
  }

  private killTween() { this.tween?.kill(); this.tween = null; }
  /** Fly the camera over a point (cubic in-out, 1.6 s; reduced motion: instant). */
  flyTo(lat: number, lon: number, dist: number) {
    this.killTween(); this.setFollow(null); this.controls.autoRotate = false; this.lastInput = performance.now();
    const from = this.camera.position.clone(), d0 = from.length(), a = from.clone().normalize(), b = toXyz(lat, lon, 1);
    const q = new Quaternion().setFromUnitVectors(a, b);
    const put = (t: number) => { this.tmpQ.identity().slerp(q, t); this.camera.position.copy(a).applyQuaternion(this.tmpQ).multiplyScalar(d0 + (dist - d0) * t); this.camera.lookAt(0, 0, 0); };
    if (this.o.reduced) { put(1); this.controls.update(); return; }
    const st = { t: 0 };
    this.tween = gsap.to(st, { t: 1, duration: 1.6, ease: 'power3.inOut', onUpdate: () => put(st.t), onComplete: () => { this.tween = null; } });
  }
  /** Camera tracks a satellite until the user drags or picks another view. */
  setFollow(key: string | null) {
    if (this.followKey === key) return;
    this.followKey = key; if (key) { this.controls.autoRotate = false; this.killTween(); this.lastInput = performance.now(); }
    this.o.onFollow(key);
  }
  followSat(key: string) {
    const s = this.sats.find((x) => x.sat.key === key); if (!s) return;
    this.setFollow(key);
    if (this.camera.position.length() > 3.4) this.camera.position.setLength(3.0);
  }

  private pick(x: number, y: number) {
    let best: SatObj | null = null, bd = 34;
    for (const s of this.sats) {
      if (!s.visible) continue; const p = s.pos.clone().project(this.camera);
      const d = Math.hypot((p.x * 0.5 + 0.5) * this.w - x, (-p.y * 0.5 + 0.5) * this.h - y); if (d < bd) { bd = d; best = s; }
    }
    if (best) this.followSat(best.sat.key);
  }

  private occluded(p: Vector3): boolean {
    // the satellite is hidden when the line from the camera to it passes through the Earth
    const c = this.camera.position, d = this.tmpV.copy(p).sub(c), len = d.length(); d.divideScalar(len);
    const b = c.dot(d), disc = b * b - (c.lengthSq() - 1);
    if (disc <= 0) return false; const t = -b - Math.sqrt(disc);
    return t > 0 && t < len;
  }

  private loop = () => {
    this.raf = 0; if (this.disposed) return;
    const dt = Math.min(0.1, this.clock.getDelta()), now = Date.now(), perf = performance.now();
    this.updateSun();
    if (now - this.orbitT0 > ORBIT_REBUILD_MS) this.buildOrbits();
    const orbT = (now - this.orbitT0) / 1000;
    for (const s of this.sats) {
      const p = subPoint(s.sat, new Date(now));
      if (!p) { s.info = null; s.model.visible = s.glow.visible = false; s.visible = false; s.label.style.visibility = 'hidden'; continue; }
      toXyz(p.lat, p.lon, altRadius(p.altKm), s.pos);
      s.info = { key: s.sat.key, name: s.sat.name, group: s.group, lat: p.lat, lon: p.lon, altKm: p.altKm, speedKms: p.speedKms, over: s.info?.over ?? null };
      (s.line.material as ShaderMaterial).uniforms.uNow.value = orbT;
    }
    if (this.followKey) {
      const s = this.sats.find((x) => x.sat.key === this.followKey);
      if (s?.info) {
        const len = this.camera.position.length(); this.tmpQ.setFromUnitVectors(this.tmpV2.copy(this.camera.position).normalize(), this.tmpV.copy(s.pos).normalize());
        this.tmpQ2.identity().slerp(this.tmpQ, 1 - Math.exp(-dt * 3)); this.camera.position.applyQuaternion(this.tmpQ2).setLength(len);
      }
    }
    if (!this.o.reduced && !this.followKey && !this.tween && !this.controls.autoRotate && perf - this.lastInput > 9000 && this.controls.enabled) this.controls.autoRotate = true;
    // the Sun glow fades out when the Sun is in front of the globe, so it never smears over the picture
    const cd = this.tmpV.copy(this.camera.position).normalize().dot(this.earthMat.uniforms.uSun.value as Vector3);
    (this.sunSprite.material as SpriteMaterial).opacity = 1 - Math.min(1, Math.max(0, (cd - 0.2) / 0.4));
    const dist = this.camera.position.length();
    this.controls.rotateSpeed = Math.min(0.8, 0.12 + 0.28 * (dist - 1));
    this.controls.update();
    const cam = this.camera.position.length();
    const tNow = performance.now();
    if (tNow - this.hudAt > 400) {
      this.hudAt = tNow; const o = this.o.labelLayer.getBoundingClientRect();
      this.hudRects = [...(this.o.labelLayer.parentElement?.querySelectorAll('.ev-tl, .ev-count, .ev-legend, .ev-feed, .ev-cards') ?? [])].map((e) => { const r = e.getBoundingClientRect(); return { left: r.left - o.left - 4, right: r.right - o.left + 4, top: r.top - o.top - 4, bottom: r.bottom - o.top + 4 }; });
    }
    const hud = this.hudRects;
    for (const s of this.sats) {
      if (!s.info) continue;
      const sz = cam * 0.0105; s.model.position.copy(s.pos); s.model.scale.setScalar(sz); s.model.lookAt(0, 0, 0); s.model.visible = true;
      s.glow.position.copy(s.pos); s.glow.scale.setScalar(cam * 0.085); s.glow.visible = !this.occluded(s.pos);
      s.visible = s.glow.visible;
      const pr = s.pos.clone().project(this.camera);
      const lx = (pr.x * 0.5 + 0.5) * this.w, ly = (-pr.y * 0.5 + 0.5) * this.h;
      // a name never sits on top of a HUD panel (the satellite keeps its marker and its card)
      const lw = s.label.offsetWidth || 90, under = hud.some((r) => lx + 14 < r.right && lx + 14 + lw > r.left && ly - 8 < r.bottom && ly + 8 > r.top);
      const show = s.visible && pr.z < 1 && Math.abs(pr.x) < 1.05 && Math.abs(pr.y) < 1.05 && !under;
      s.label.style.visibility = show ? 'visible' : 'hidden';
      if (show) s.label.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`;
      s.label.dataset.follow = String(this.followKey === s.sat.key);
    }
    // country under each satellite, a few times a minute (cheap point-in-polygon on 110 m outlines)
    if (now - this.overAt > 4000) { this.overAt = now; for (const s of this.sats) if (s.info) s.info.over = countryAt(s.info.lat, s.info.lon); }
    this.renderer.render(this.scene, this.camera); this.frames++;
    if (now - this.tickAt > 1000) { this.tickAt = now; this.o.onTick(this.sats.filter((s) => s.info).map((s) => ({ ...s.info! })), this.sun); }
    this.kick2();
  };
  private kick2() { if (this.active && this.onScreen && !document.hidden && !this.disposed && !this.raf) this.raf = requestAnimationFrame(this.loop); }

  debug(): EarthDebug {
    const t = this.tex;
    return {
      ready: t.day && t.night && t.bump && t.water && this.frames > 0, textures: { ...t }, frames: this.frames, hotspots: this.hotCount,
      sats: this.sats.filter((s) => s.info).map((s) => ({ name: s.sat.name, lat: s.info!.lat, lon: s.info!.lon, altKm: s.info!.altKm })),
      sun: { ...this.sun }, following: this.followKey, distance: this.camera.position.length()
    };
  }

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); this.raf = 0; this.killTween();
    this.ro.disconnect(); this.io.disconnect(); this.cleanups.forEach((f) => f()); this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as Mesh; m.geometry?.dispose?.();
      const mat = m.material as MeshBasicMaterial | MeshBasicMaterial[] | undefined;
      for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) { (x as { map?: Texture | null }).map?.dispose(); x.dispose(); }
    });
    this.loaded.forEach((t) => t.dispose()); this.sats.forEach((s) => s.label.remove());
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
