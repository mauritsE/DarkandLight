import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Game } from '../sim/game';
import { BUILDINGS, BuildingId, CAMPS, MERCHANTS, UNITS, UnitKind } from '../sim/defs';
import type { Building, Entity, GameEvent } from '../sim/state';
import { N, T } from '../sim/world';
import { S, setGhost } from './materials';
import { CHIMNEY, buildingModel, campModel, scarModel, shipModel, unitModel, wellModel } from './models';
import { Particles } from './particles';
import { Terrain } from './terrain';

interface BView { g: THREE.Group; tier: number; born: number; warn: THREE.Sprite; portal?: THREE.Mesh }
interface UView { g: THREE.Group; body: THREE.Group; bar: THREE.Sprite; barBg: THREE.Sprite; ring?: THREE.Mesh; kind: UnitKind; h: number; face: number }
interface Walker { i: number; j: number; t: number; sp: number; off: number }

export type PreviewKind = BuildingId | 'road' | 'demolish' | 'beacon' | null;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const v3 = new THREE.Vector3();

function warnTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#d8342c'; x.beginPath(); x.arc(32, 32, 26, 0, 7); x.fill();
  x.lineWidth = 5; x.strokeStyle = '#fff'; x.stroke();
  x.fillStyle = '#fff'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('!', 32, 35);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Renderer {
  three: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  terrain!: Terrain;
  particles = new Particles();
  cam = { x: 40, z: 40, dist: 26, yaw: 0.6, tx: 40, tz: 40, tdist: 26, tyaw: 0.6, y: 0 };
  dark = false;
  selected = new Set<number>();
  time = 0;

  private game!: Game;
  private world = new THREE.Group();
  private buildGroup = new THREE.Group();
  private lightGroup = new THREE.Group();
  private darkGroup = new THREE.Group();
  private hemi = new THREE.HemisphereLight(0xdff1ff, 0x9a8a60, 1.1);
  private sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  private gateLight = new THREE.PointLight(0xffd27a, 0, 16, 1.5);
  private bMap = new Map<number, BView>();
  private uMap = new Map<number, UView>();
  private pMap = new Map<number, THREE.Mesh>();
  private ships: THREE.Group[] = [];
  private scars: (THREE.Group | null)[] = [];
  private wells: (THREE.Group | null)[] = [];
  private walkers: Walker[] = [];
  private walkerMesh: THREE.InstancedMesh;
  private warnMat = new THREE.SpriteMaterial({ map: warnTexture(), depthTest: false });
  private barMat = { bg: new THREE.SpriteMaterial({ color: 0x1a1020, depthTest: false }), good: new THREE.SpriteMaterial({ color: 0x46b85a, depthTest: false }), bad: new THREE.SpriteMaterial({ color: 0xc8303e, depthTest: false }) };
  private ringGeo = new THREE.RingGeometry(0.4, 0.46, 24).rotateX(-Math.PI / 2);
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xb89a48, transparent: true, opacity: 0.9, depthTest: false });
  private projGeo = new THREE.SphereGeometry(0.09, 6, 5);
  private projMat = [new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1) }), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 3, 0.9) })];
  private portalMat: THREE.ShaderMaterial;
  private preview = new THREE.Group();
  private previewKind: PreviewKind = null;
  private previewPad!: THREE.Mesh;
  private previewRing!: THREE.Mesh;
  private previewModel: THREE.Object3D | null = null;
  private roadVer = -1;
  private first = true;
  private ray = new THREE.Raycaster();

  constructor(canvas: HTMLCanvasElement) {
    this.three = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.three.shadowMap.enabled = true;
    this.three.shadowMap.type = THREE.PCFShadowMap;
    this.three.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color(0xa8d8f0);
    this.scene.fog = new THREE.FogExp2(0xbfe3f5, 0.0065);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.world, this.gateLight);
    this.world.add(this.buildGroup, this.lightGroup, this.darkGroup, this.particles.points, this.preview);
    this.darkGroup.visible = false;

    this.composer = new EffectComposer(this.three);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.portalMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(0x9a5cff) }, uB: { value: new THREE.Color(0x2a0a55) } },
      side: THREE.DoubleSide, transparent: true,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `uniform float uTime; uniform vec3 uA, uB; varying vec2 vUv;
        void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.; float a = atan(p.y, p.x);
          float s = sin(a * 3. + r * 9. - uTime * 2.5) * 0.5 + 0.5; float s2 = sin(a * 5. - r * 14. + uTime * 1.7) * 0.5 + 0.5;
          vec3 c = mix(uB, uA, s * 0.7 + s2 * 0.3) * (1.6 + 2.2 * (1. - r)); float al = smoothstep(1., 0.8, r);
          gl_FragColor = vec4(c, al); }`,
    });

    // villagers
    const wg = mergeGeometries([new THREE.BoxGeometry(0.11, 0.2, 0.08).translate(0, 0.12, 0).toNonIndexed(), new THREE.IcosahedronGeometry(0.055, 0).translate(0, 0.29, 0)].map((g) => { g.deleteAttribute('uv'); return g; }));
    this.walkerMesh = new THREE.InstancedMesh(wg, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), 44);
    this.walkerMesh.castShadow = true; this.walkerMesh.count = 0; this.walkerMesh.frustumCulled = false;
    const wc = new THREE.Color(), pal = [0xc8413b, 0x3f68c8, 0xe6b83a, 0x4f9a55, 0xf6f3ec, 0x8a54c4, 0xd98a4a];
    for (let i = 0; i < 44; i++) this.walkerMesh.setColorAt(i, wc.setHex(pal[i % pal.length]));
    this.lightGroup.add(this.walkerMesh);

    // placement preview
    this.previewPad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6dff8a, transparent: true, opacity: 0.45, depthTest: false }));
    this.previewRing = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false }));
    this.preview.add(this.previewPad, this.previewRing);
    this.preview.visible = false;
    this.resize();
  }

  setGame(game: Game) {
    this.game = game;
    if (this.terrain) { this.world.remove(this.terrain.group); }
    for (const v of this.bMap.values()) this.buildGroup.remove(v.g);
    for (const v of this.uMap.values()) this.darkGroup.remove(v.g);
    for (const s of [...this.scars, ...this.wells, ...this.ships]) s?.removeFromParent();
    this.bMap.clear(); this.uMap.clear(); this.scars = []; this.wells = []; this.ships = []; this.walkers = [];
    this.selected.clear();
    this.terrain = new Terrain(game);
    this.world.add(this.terrain.group);
    this.ships = MERCHANTS.map((m) => { const s = shipModel(m.color); s.visible = false; this.lightGroup.add(s); return s; });
    const st = game.world.start;
    this.cam.x = this.cam.tx = st.x + 0.5; this.cam.z = this.cam.tz = st.z + 2;
    this.first = true; this.roadVer = -1;
    this.setDark(false);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.three.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.particles.setScale(h * 0.9 * this.three.getPixelRatio());
  }

  setDark(dark: boolean) {
    this.dark = dark;
    setGhost(dark);
    this.terrain.setDark(dark);
    this.lightGroup.visible = !dark; this.darkGroup.visible = dark;
    const fog = this.scene.fog as THREE.FogExp2;
    (this.scene.background as THREE.Color).setHex(dark ? 0x0a0714 : 0xa8d8f0);
    fog.color.setHex(dark ? 0x130b24 : 0xbfe3f5); fog.density = dark ? 0.013 : 0.0065;
    this.hemi.color.setHex(dark ? 0x7a66e0 : 0xdff1ff); this.hemi.groundColor.setHex(dark ? 0x140c22 : 0x9a8a60); this.hemi.intensity = dark ? 1.25 : 1.1;
    this.sun.color.setHex(dark ? 0x9d8cff : 0xfff0d0); this.sun.intensity = dark ? 1.5 : 2.6;
    this.bloom.strength = dark ? 0.75 : 0.22; this.bloom.threshold = dark ? 0.55 : 0.9; this.bloom.radius = dark ? 0.7 : 0.5;
    this.three.toneMappingExposure = dark ? 1.15 : 1.0;
    this.terrain.waterU.uFogColor.value.copy(fog.color); this.terrain.waterU.uFogDensity.value = fog.density;
    (this.portalMat.uniforms.uA.value as THREE.Color).setHex(dark ? 0xffd27a : 0x9a5cff);
    (this.portalMat.uniforms.uB.value as THREE.Color).setHex(dark ? 0x7a4a10 : 0x2a0a55);
    this.gateLight.intensity = dark ? 9 : 0;
    if (!dark) this.selected.clear();
  }

  focus(x: number, z: number) { this.cam.tx = x; this.cam.tz = z; }

  // ---------- picking ----------
  private setRay(cx: number, cy: number) {
    this.ray.setFromCamera(new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1), this.camera);
    return this.ray.ray;
  }
  screenToGround(cx: number, cy: number): { x: number; z: number } | null {
    const r = this.setRay(cx, cy);
    if (r.direction.y >= -0.01) return null;
    let h = 0.3, x = 0, z = 0;
    for (let i = 0; i < 6; i++) {
      const t = (h - r.origin.y) / r.direction.y;
      x = r.origin.x + r.direction.x * t; z = r.origin.z + r.direction.z * t;
      h = Math.max(0, this.game.world.heightAt(x, z));
    }
    return { x, z };
  }
  private project(x: number, y: number, z: number) {
    v3.set(x, y, z).project(this.camera);
    return { x: (v3.x + 1) / 2 * window.innerWidth, y: (1 - v3.y) / 2 * window.innerHeight, ok: v3.z < 1 };
  }
  entityAt(cx: number, cy: number, team: number): number {
    let best = 0, bd = Infinity;
    const scale = 26 / this.cam.dist;
    for (const e of this.game.state.entities) {
      if (e.team !== team || e.hp <= 0) continue;
      const d = UNITS[e.kind];
      const p = this.project(e.x, this.game.world.heightAt(e.x, e.z) + (d.speed ? 0.4 : 1), e.z);
      if (!p.ok) continue;
      const dist = Math.hypot(p.x - cx, p.y - cy) - d.radius * 30 * scale;
      if (dist < 22 && dist < bd) { bd = dist; best = e.id; }
    }
    return best;
  }
  unitsInRect(x0: number, y0: number, x1: number, y1: number): number[] {
    const out: number[] = [];
    for (const e of this.game.state.entities) {
      if (e.team !== 0 || UNITS[e.kind].speed === 0) continue;
      const p = this.project(e.x, this.game.world.heightAt(e.x, e.z) + 0.3, e.z);
      if (p.ok && p.x >= Math.min(x0, x1) && p.x <= Math.max(x0, x1) && p.y >= Math.min(y0, y1) && p.y <= Math.max(y0, y1)) out.push(e.id);
    }
    return out;
  }

  // ---------- placement preview ----------
  setPreview(kind: PreviewKind) {
    if (kind === this.previewKind) return;
    this.previewKind = kind;
    if (this.previewModel) { this.preview.remove(this.previewModel); this.previewModel = null; }
    this.preview.visible = false;
    if (!kind) return;
    if (kind === 'beacon') this.previewModel = unitModel('beacon');
    else if (kind !== 'road' && kind !== 'demolish') this.previewModel = buildingModel(kind, 0, 0);
    if (this.previewModel) this.preview.add(this.previewModel);
  }
  updatePreview(tx: number, tz: number, ok: boolean) {
    const k = this.previewKind;
    if (!k) return;
    const s = k === 'road' || k === 'demolish' || k === 'beacon' ? 1 : BUILDINGS[k].size;
    const W = this.game.world;
    if (!W.inb(tx, tz) || !W.inb(tx + s - 1, tz + s - 1)) { this.preview.visible = false; return; }
    let h = 0;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) h += W.tileH(tx + dx, tz + dz);
    h = Math.max(0.05, h / (s * s));
    this.preview.visible = true;
    this.preview.position.set(tx + s / 2, h + 0.06, tz + s / 2);
    this.previewPad.scale.set(s, 1, s);
    (this.previewPad.material as THREE.MeshBasicMaterial).color.setHex(k === 'demolish' ? 0xff8a3a : ok ? 0x6dff8a : 0xff4a4a);
    const radius = k === 'beacon' ? UNITS.beacon.range : k !== 'road' && k !== 'demolish' ? BUILDINGS[k].radius ?? 0 : 0;
    this.previewRing.visible = radius > 0;
    this.previewRing.scale.set(radius, 1, radius);
    if (this.previewModel) this.previewModel.position.y = -0.04;
  }

  // ---------- effects ----------
  private hAt(x: number, z: number) { return Math.max(0, this.game.world.heightAt(x, z)); }
  onEvent(ev: GameEvent) {
    const P = this.particles;
    switch (ev.t) {
      case 'hit': if (this.dark) P.burst(ev.x, this.hAt(ev.x, ev.z) + 0.5, ev.z, ev.team === 0 ? 0xff5a6a : 0xffe08a, 5, 1.6, 0.14, 0.35, 2.2); break;
      case 'die': if (this.dark) P.burst(ev.x, this.hAt(ev.x, ev.z) + 0.4, ev.z, ev.team === 0 ? 0xffe9a8 : 0xb060ff, ev.kind === 'camp' ? 120 : 22, ev.kind === 'camp' ? 5 : 2.4, 0.22, 0.9, 2.2, 3); break;
      case 'spawn': P.burst(ev.x, this.hAt(ev.x, ev.z) + 0.2, ev.z, 0xffe08a, 26, 1.8, 0.16, 0.9, 2.5, -1); break;
      case 'upgrade': {
        const b = this.game.byId.get(ev.id);
        if (b) { const c = this.game.center(b); P.burst(c.x, this.hAt(c.x, c.z) + 0.8, c.z, 0xffe9a8, 30, 2, 0.18, 1.0, this.dark ? 2 : 1.3, 1); }
        break;
      }
      case 'breach': { const g = this.game.gateEnt(); if (g) P.burst(g.x, 1.5, g.z, 0xb060ff, 90, 5, 0.3, 1.4, 2.4, 2); break; }
      default: break;
    }
  }
  moveMarker(x: number, z: number, attack: boolean) {
    const y = this.hAt(x, z) + 0.15;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.particles.emit(x + Math.cos(a) * 0.15, y, z + Math.sin(a) * 0.15, Math.cos(a) * 1.2, 0.1, Math.sin(a) * 1.2, attack ? 0xff5a5a : 0x9dffb0, 0.13, 0.5, { bright: 2.2 });
    }
  }

  // ---------- sync ----------
  private facing(b: Building): number {
    const d = BUILDINGS[b.type], s = d.size, g = this.game, coast = d.needs === 'coast';
    const test = (x: number, z: number) => coast ? (!g.world.inb(x, z) || g.world.type[z * N + x] === T.Water) : (g.world.inb(x, z) && g.road[z * N + x] === 1);
    const score = [0, 0, 0, 0], depth = coast ? 3 : 1;
    for (let k = 0; k < s; k++) for (let r = 1; r <= depth; r++) {
      const w = depth + 1 - r;
      if (test(b.x + k, b.z + s - 1 + r)) score[0] += w;
      if (test(b.x + s - 1 + r, b.z + k)) score[1] += w;
      if (test(b.x + k, b.z - r)) score[2] += w;
      if (test(b.x - r, b.z + k)) score[3] += w;
    }
    let best = b.id % 4, m = 0;
    score.forEach((v, i) => { if (v > m) { m = v; best = i; } });
    return best * Math.PI / 2;
  }

  private syncBuildings() {
    const g = this.game, W = g.world;
    const refacing = this.roadVer !== g.roadVer;
    this.roadVer = g.roadVer;
    for (const b of g.state.buildings) {
      let v = this.bMap.get(b.id);
      const tier = b.tier ?? 0;
      if (v && v.tier !== tier) { this.buildGroup.remove(v.g); v = undefined; this.bMap.delete(b.id); }
      if (!v) {
        const grp = buildingModel(b.type, tier, b.id);
        const s = BUILDINGS[b.type].size, c = g.center(b);
        grp.position.set(c.x, W.tileH(b.x, b.z), c.z);
        grp.rotation.y = this.facing(b);
        const warn = new THREE.Sprite(this.warnMat);
        warn.scale.setScalar(0.55); warn.position.y = s * 0.55 + 1.1; warn.visible = false;
        grp.add(warn);
        v = { g: grp, tier, born: this.first ? -10 : this.time, warn };
        if (b.type === 'gate') {
          v.portal = new THREE.Mesh(new THREE.CircleGeometry(0.88, 24), this.portalMat);
          v.portal.position.y = 1.2; grp.add(v.portal);
        }
        this.buildGroup.add(grp); this.bMap.set(b.id, v);
        if (!this.first) this.particles.burst(c.x, grp.position.y + 0.2, c.z, 0xd8c8a0, 18, 1.6, 0.3, 0.7, 1, 2);
      } else if (refacing) v.g.rotation.y = this.facing(b);
      const age = this.time - v.born;
      if (age < 0.5) { const t = age / 0.5, k = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2); v.g.scale.set(0.6 + 0.4 * t, Math.max(0.02, k), 0.6 + 0.4 * t); }
      else v.g.scale.setScalar(1);
      v.warn.visible = !this.dark && (b.status === 'noRoad' || b.status === 'noInput' || b.status === 'noResource') && this.time % 1.2 < 0.9;
      // chimney smoke
      const ch = CHIMNEY[b.type];
      if (ch && !this.dark && b.status === 'ok' && Math.random() < 0.06) {
        v3.set(ch[0], ch[1], ch[2]).applyAxisAngle(THREE.Object3D.DEFAULT_UP, v.g.rotation.y);
        this.particles.emit(v.g.position.x + v3.x, v.g.position.y + v3.y, v.g.position.z + v3.z, 0.15 + Math.random() * 0.1, 0.5, 0.05, 0xe8e4dc, 0.25, 2.6, { grow: 0.25, alpha: 0.5 });
      }
      if (b.type === 'spire' && (b.fuel ?? 0) > 0 && Math.random() < 0.1) {
        this.particles.emit(v.g.position.x + (Math.random() - 0.5) * 0.5, v.g.position.y + 3.6, v.g.position.z + (Math.random() - 0.5) * 0.5, 0, 0.6, 0, 0xffe9a8, 0.12, 1.4, { bright: 2 });
      }
    }
    if (this.bMap.size > g.state.buildings.length) {
      for (const [id, v] of this.bMap) if (!g.byId.has(id)) {
        this.particles.burst(v.g.position.x, v.g.position.y + 0.3, v.g.position.z, 0xb8a888, 20, 1.8, 0.3, 0.7, 1, 2);
        this.buildGroup.remove(v.g); this.bMap.delete(id);
      }
    }
    const gate = g.gateEnt();
    if (gate) this.gateLight.position.set(gate.x, this.hAt(gate.x, gate.z) + 2, gate.z);
  }

  private makeUnit(e: Entity): UView {
    const g = new THREE.Group(), d = UNITS[e.kind];
    let body: THREE.Group, h = 1;
    if (e.kind === 'camp') { body = campModel(e.camp); h = 4.2 + e.camp; const l = new THREE.PointLight(CAMPS[e.camp].color, 30, 18, 1.5); l.position.y = 3; g.add(l); }
    else if (e.kind === 'gate') { body = new THREE.Group(); h = 3.3; }
    else { body = unitModel(e.kind); h = e.kind === 'beacon' ? 3 : e.kind === 'sovereign' ? 3.4 : e.kind === 'brute' ? 1.9 : 1.35; }
    g.add(body);
    const w = d.speed === 0 ? 1.6 : 0.3 + d.radius;
    const barBg = new THREE.Sprite(this.barMat.bg), bar = new THREE.Sprite(e.team === 0 ? this.barMat.good : this.barMat.bad);
    barBg.center.set(0, 0.5); bar.center.set(0, 0.5);
    barBg.scale.set(w, 0.085, 1); bar.scale.set(w, 0.055, 1);
    barBg.position.set(0, h, 0); bar.position.set(0, h, 0);
    barBg.userData.w = w; barBg.renderOrder = 10; bar.renderOrder = 11;
    g.add(barBg, bar);
    const v: UView = { g, body, bar, barBg, kind: e.kind, h, face: e.face };
    if (e.team === 0 && d.speed > 0) {
      v.ring = new THREE.Mesh(this.ringGeo, this.ringMat); v.ring.position.y = 0.06; v.ring.visible = false; v.ring.scale.setScalar(d.radius / 0.3);
      g.add(v.ring);
    }
    this.darkGroup.add(g);
    return v;
  }

  private syncUnits(dt: number) {
    const g = this.game, S0 = g.state;
    const right = v3.set(1, 0, 0).applyQuaternion(this.camera.quaternion).clone();
    for (const e of S0.entities) {
      let v = this.uMap.get(e.id);
      if (!v) { v = this.makeUnit(e); this.uMap.set(e.id, v); }
      const d = UNITS[e.kind], y = this.hAt(e.x, e.z);
      v.g.position.set(e.x, y, e.z);
      if (d.speed > 0) {
        let df = e.face - v.face; df = Math.atan2(Math.sin(df), Math.cos(df));
        v.face += df * Math.min(1, dt * 12);
        v.body.rotation.y = v.face;
        const atk = S0.time - (e.atkT ?? -9);
        const lunge = atk < 0.25 ? Math.sin((atk / 0.25) * Math.PI) * 0.22 : 0;
        v.body.position.set(Math.sin(v.face) * lunge, e.moving ? Math.abs(Math.sin(this.time * 11 + e.id)) * 0.07 : 0, Math.cos(v.face) * lunge);
        v.body.rotation.x = lunge * 0.8;
      } else if (e.kind === 'camp') {
        v.body.rotation.y = Math.sin(this.time * 0.3 + e.id) * 0.03;
      }
      const frac = clamp(e.hp / (e.kind === 'camp' ? CAMPS[e.camp].hp : d.hp), 0, 1);
      const show = this.dark && (frac < 0.999 || d.speed === 0 || this.selected.has(e.id)) && !e.down;
      v.bar.visible = v.barBg.visible = show;
      if (show) {
        const w = v.barBg.userData.w as number;
        v.bar.scale.x = Math.max(0.001, w * frac);
        v.barBg.position.set(-right.x * w / 2, v.h, -right.z * w / 2);
        v.bar.position.copy(v.barBg.position);
      }
      if (v.ring) v.ring.visible = this.selected.has(e.id);
    }
    if (this.uMap.size > S0.entities.length) {
      for (const [id, v] of this.uMap) if (!g.entById.has(id)) { this.darkGroup.remove(v.g); this.uMap.delete(id); this.selected.delete(id); }
    }
    // projectiles
    const seen = new Set<number>();
    for (const p of S0.projectiles) {
      seen.add(p.id);
      let m = this.pMap.get(p.id);
      if (!m) { m = new THREE.Mesh(this.projGeo, this.projMat[p.team]); this.darkGroup.add(m); this.pMap.set(p.id, m); }
      m.position.set(p.x, this.hAt(p.x, p.z) + p.y, p.z);
      if (this.dark && Math.random() < 0.5) this.particles.emit(m.position.x, m.position.y, m.position.z, 0, 0, 0, p.team ? 0x8dff6a : 0xffd27a, 0.1, 0.25, { bright: 2 });
    }
    for (const [id, m] of this.pMap) if (!seen.has(id)) { this.darkGroup.remove(m); this.pMap.delete(id); }
    // strongholds → scars in the light world, purified wells once destroyed
    S0.camps.forEach((cs, ci) => {
      const site = g.world.campSites[ci], y = this.hAt(site.x + 0.5, site.z + 0.5);
      if (cs.alive && !this.scars[ci]) { const s = scarModel(); s.position.set(site.x + 0.5, y, site.z + 0.5); this.lightGroup.add(s); this.scars[ci] = s; }
      if (!cs.alive && this.scars[ci]) { this.scars[ci]!.removeFromParent(); this.scars[ci] = null; }
      if (!cs.alive && !this.wells[ci]) { const w = wellModel(); w.position.set(site.x + 0.5, y, site.z + 0.5); this.world.add(w); this.wells[ci] = w; }
      if (cs.alive && !this.dark && Math.random() < 0.25) {
        const a = Math.random() * 6.28, r = Math.random() * 6;
        this.particles.emit(site.x + 0.5 + Math.cos(a) * r, y + 0.1, site.z + 0.5 + Math.sin(a) * r, 0, 0.5 + Math.random() * 0.5, 0, 0x5a2a8a, 0.22, 2.5, { alpha: 0.6 });
      }
      if (!cs.alive && Math.random() < 0.15) this.particles.emit(site.x + 0.5 + (Math.random() - 0.5), y + 0.4, site.z + 0.5 + (Math.random() - 0.5), 0, 0.8, 0, 0xffe9a8, 0.12, 1.6, { bright: 2 });
    });
  }

  private syncShips() {
    const g = this.game, harbor = g.find('harbor');
    g.state.ships.forEach((sh, i) => {
      const m = this.ships[i];
      if (!harbor || sh.phase === 'away') { m.visible = false; return; }
      const th = this.bMap.get(harbor.id)?.g.rotation.y ?? 0, c = g.center(harbor);
      const dx = Math.sin(th), dz = Math.cos(th), lat = (i - 1) * 1.7;
      const dockX = c.x + dx * 3.6 - dz * lat, dockZ = c.z + dz * 3.6 + dx * lat;
      let k = 0, rot = th + Math.PI;
      if (sh.phase === 'arriving') k = sh.t / 14;
      else if (sh.phase === 'leaving') { k = 1 - sh.t / 14; rot = th; }
      else rot = th + Math.PI / 2;
      const e = k * k * (3 - 2 * k), far = 46;
      m.visible = true;
      m.position.set(dockX + dx * far * e, 0.02 + Math.sin(this.time * 1.6 + i) * 0.04, dockZ + dz * far * e);
      let dr = rot - m.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      m.rotation.y += dr * 0.05;
      m.rotation.z = Math.sin(this.time * 1.3 + i * 2) * 0.04;
      if (k > 0.02 && Math.random() < 0.3) this.particles.emit(m.position.x, 0.05, m.position.z, (Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4, 0xffffff, 0.2, 1.2, { alpha: 0.6, grow: 0.2 });
    });
  }

  private syncWalkers(dt: number) {
    const g = this.game, roads = g.state.roads;
    const want = roads.length < 3 ? 0 : Math.min(44, Math.floor(g.state.pop / 5), roads.length);
    while (this.walkers.length < want) { const i = roads[Math.floor(Math.random() * roads.length)]; this.walkers.push({ i, j: i, t: 1, sp: 0.8 + Math.random() * 0.6, off: (Math.random() - 0.5) * 0.5 }); }
    this.walkers.length = Math.min(this.walkers.length, want);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    this.walkers.forEach((w, n) => {
      if (!g.road[w.i] || !g.road[w.j]) { w.i = w.j = roads[Math.floor(Math.random() * roads.length)]; w.t = 1; }
      w.t += dt * w.sp;
      if (w.t >= 1) {
        const prev = w.i; w.i = w.j; w.t = 0;
        const x = w.i % N, z = (w.i / N) | 0, opts: number[] = [];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = (z + dz) * N + x + dx; if (g.world.inb(x + dx, z + dz) && g.road[ni]) opts.push(ni); }
        const fwd = opts.filter((o) => o !== prev);
        w.j = fwd.length ? fwd[Math.floor(Math.random() * fwd.length)] : opts.length ? opts[0] : w.i;
      }
      const ax = (w.i % N) + 0.5, az = ((w.i / N) | 0) + 0.5, bx = (w.j % N) + 0.5, bz = ((w.j / N) | 0) + 0.5;
      const dx = bx - ax, dz = bz - az;
      const x = ax + dx * w.t - dz * w.off * 0.5, z = az + dz * w.t + dx * w.off * 0.5;
      p.set(x, this.hAt(x, z) + 0.03 + Math.abs(Math.sin(this.time * 9 + n)) * 0.025, z);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(dx, dz));
      m4.compose(p, q, s); this.walkerMesh.setMatrixAt(n, m4);
    });
    this.walkerMesh.count = this.walkers.length;
    this.walkerMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- frame ----------
  frame(dt: number) {
    this.time += dt;
    const c = this.cam, k = 1 - Math.exp(-dt * 10);
    c.tx = clamp(c.tx, 2, N - 2); c.tz = clamp(c.tz, 2, N - 2); c.tdist = clamp(c.tdist, 9, 70);
    c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k; c.dist += (c.tdist - c.dist) * k; c.yaw += (c.tyaw - c.yaw) * k;
    c.y += (this.hAt(c.x, c.z) - c.y) * k;
    const pitch = 0.62 + 0.36 * clamp((c.dist - 9) / 40, 0, 1);
    this.camera.position.set(c.x + Math.sin(c.yaw) * Math.cos(pitch) * c.dist, c.y + Math.sin(pitch) * c.dist, c.z + Math.cos(c.yaw) * Math.cos(pitch) * c.dist);
    this.camera.lookAt(c.x, c.y, c.z);
    this.camera.updateMatrixWorld();

    const sh = clamp(c.dist * 1.15, 22, 60), sc = this.sun.shadow.camera;
    this.sun.position.set(c.x - 28, 55, c.z + 20); this.sun.target.position.set(c.x, 0, c.z);
    if (sc.right !== sh) { sc.left = -sh; sc.right = sh; sc.top = sh; sc.bottom = -sh; sc.near = 1; sc.far = 160; sc.updateProjectionMatrix(); }

    this.terrain.update();
    this.terrain.waterU.uTime.value = this.time;
    this.portalMat.uniforms.uTime.value = this.time;
    this.syncBuildings();
    this.syncUnits(dt);
    if (!this.dark) { this.syncShips(); this.syncWalkers(dt); }
    else {
      // drifting embers of the dark world
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * 6.28, r = Math.random() * c.dist * 0.9;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        this.particles.emit(x, this.hAt(x, z) + Math.random() * 2, z, (Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, Math.random() < 0.5 ? 0xb07cff : 0x5ad6ff, 0.09, 3.5, { bright: 1.8 });
      }
      const gate = this.game.gateEnt();
      if (gate && !gate.down && Math.random() < 0.4) {
        const a = Math.random() * 6.28;
        this.particles.emit(gate.x + Math.cos(a) * 1.2, this.hAt(gate.x, gate.z) + 0.3, gate.z + Math.sin(a) * 1.2, 0, 1 + Math.random(), 0, 0xffd27a, 0.11, 1.6, { bright: 2.2 });
      }
    }
    this.particles.update(dt);
    this.first = false;
    this.composer.render();
  }
}

export { S as SolidMats };
