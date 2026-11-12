import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Game } from '../sim/game';
import { N, T, fbm } from '../sim/world';
import { M, S } from './materials';

const c = new THREE.Color(), c2 = new THREE.Color();
const hash = (i: number) => { const x = Math.sin(i * 127.1 + 11.7) * 43758.5453; return x - Math.floor(x); };

export class Terrain {
  group = new THREE.Group();
  mesh: THREE.Mesh;
  water: THREE.Mesh;
  roads: THREE.Mesh;
  trunks: THREE.InstancedMesh;
  leaves: THREE.InstancedMesh;
  crystals: THREE.Group;
  private light: Float32Array;
  private dark: Float32Array;
  private lightAttr: THREE.BufferAttribute;
  private darkAttr: THREE.BufferAttribute;
  private heightTex: THREE.DataTexture;
  waterU: Record<string, THREE.IUniform>;
  private ver = { t: -1, r: -1, tr: -1 };
  private isDark = false;

  constructor(private game: Game) {
    const geo = new THREE.BufferGeometry();
    const nv = N * N * 6;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    this.light = new Float32Array(nv * 3); this.dark = new Float32Array(nv * 3);
    this.lightAttr = new THREE.BufferAttribute(this.light, 3);
    this.darkAttr = new THREE.BufferAttribute(this.dark, 3);
    geo.setAttribute('color', this.lightAttr);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
    this.mesh.receiveShadow = true; this.mesh.castShadow = true;
    this.group.add(this.mesh);

    // water
    this.heightTex = new THREE.DataTexture(new Uint8Array((N + 1) * (N + 1) * 4), N + 1, N + 1, THREE.RGBAFormat);
    this.heightTex.magFilter = this.heightTex.minFilter = THREE.LinearFilter;
    this.waterU = {
      uTime: { value: 0 }, uH: { value: this.heightTex }, uN: { value: N },
      uShallow: { value: new THREE.Color(0x4fd0c8) }, uDeep: { value: new THREE.Color(0x1a5f9c) },
      uFoam: { value: new THREE.Color(0xffffff) }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.01 },
      uGlow: { value: 0 },
    };
    const wm = new THREE.ShaderMaterial({
      uniforms: this.waterU, transparent: true,
      vertexShader: `varying vec3 vW; varying float vDist;
        void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vec4 mv = viewMatrix * w; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime, uN, uFogDensity, uGlow; uniform sampler2D uH; uniform vec3 uShallow, uDeep, uFoam, uFogColor;
        varying vec3 vW; varying float vDist;
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(hsh(i),hsh(i+vec2(1,0)),f.x), mix(hsh(i+vec2(0,1)),hsh(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 uv = (vW.xz + 0.5) / (uN + 1.);
          float h = -2.;
          if (uv.x > 0. && uv.x < 1. && uv.y > 0. && uv.y < 1.) h = texture2D(uH, uv).r * 4. - 2.;
          float depth = clamp(-h / 1.1, 0., 1.);
          float n = noise(vW.xz * 0.6 + uTime * 0.25) * 0.6 + noise(vW.xz * 1.7 - uTime * 0.35) * 0.4;
          vec3 col = mix(uShallow, uDeep, smoothstep(0., 0.85, depth + (n - 0.5) * 0.15));
          col += (n - 0.5) * 0.08;
          float w1 = sin(depth * 26. - uTime * 1.6 + n * 3.) * 0.5 + 0.5;
          float foam = smoothstep(0.34, 0.0, depth) * smoothstep(0.55, 0.95, w1) * 0.7 + smoothstep(0.07, 0.0, depth) * 0.8;
          float spark = smoothstep(0.93, 1.0, noise(vW.xz * 3.2 + vec2(uTime * 0.7, -uTime * 0.5))) * (1. - depth * 0.5);
          col = mix(col, uFoam, clamp(foam, 0., 1.) * (0.85 - uGlow * 0.3));
          col += uFoam * spark * (0.35 + uGlow);
          float alpha = mix(0.55, 0.93, smoothstep(0., 0.5, depth));
          float fog = 1. - exp(-uFogDensity * uFogDensity * vDist * vDist);
          col = mix(col, uFogColor, fog);
          gl_FragColor = vec4(col, max(alpha, fog));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), wm);
    this.water.position.set(N / 2, 0, N / 2);
    this.group.add(this.water);

    // roads
    this.roads = new THREE.Mesh(new THREE.BufferGeometry(), M.road);
    this.roads.receiveShadow = true;
    this.group.add(this.roads);

    // trees
    const trunkGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.4, 5).translate(0, 0.2, 0);
    const leafGeo = mergeGeometries([
      new THREE.ConeGeometry(0.34, 0.6, 6).translate(0, 0.6, 0),
      new THREE.ConeGeometry(0.26, 0.5, 6).translate(0, 0.95, 0),
      new THREE.ConeGeometry(0.17, 0.42, 6).translate(0, 1.27, 0),
    ]);
    const max = N * N * 2;
    this.trunks = new THREE.InstancedMesh(trunkGeo, M.trunk, max);
    this.leaves = new THREE.InstancedMesh(leafGeo, M.foliage, max);
    this.trunks.castShadow = this.leaves.castShadow = true;
    this.leaves.receiveShadow = true;
    this.group.add(this.trunks, this.leaves);

    // dark world crystals
    this.crystals = new THREE.Group();
    const cg = new THREE.OctahedronGeometry(0.22).scale(1, 2.2, 1);
    const W = game.world, mats = [S.crystalA, S.crystalB];
    for (let k = 0; k < 2; k++) {
      const spots: number[] = [];
      for (let i = 0; i < N * N; i++) if (W.isWalk(i % N, (i / N) | 0) && hash(i * 3 + k * 17) < 0.012) spots.push(i);
      const im = new THREE.InstancedMesh(cg, mats[k], spots.length * 3);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
      spots.forEach((i, n) => {
        for (let j = 0; j < 3; j++) {
          const x = (i % N) + 0.2 + hash(i + j * 7) * 0.6, z = ((i / N) | 0) + 0.2 + hash(i * 5 + j) * 0.6;
          const sc = j === 0 ? 1 + hash(i) * 0.8 : 0.4 + hash(i + j) * 0.4;
          e.set((hash(i + j * 3) - 0.5) * 0.7, hash(i * 2 + j) * 6, (hash(i * 9 + j) - 0.5) * 0.7);
          m4.compose(p.set(x, W.heightAt(x, z) + 0.25 * sc, z), q.setFromEuler(e), s.setScalar(sc));
          im.setMatrixAt(n * 3 + j, m4);
        }
      });
      this.crystals.add(im);
    }
    this.crystals.visible = false;
    this.group.add(this.crystals);
    this.update();
  }

  setDark(dark: boolean) {
    this.isDark = dark;
    this.mesh.geometry.setAttribute('color', dark ? this.darkAttr : this.lightAttr);
    this.crystals.visible = dark;
    const u = this.waterU;
    (u.uShallow.value as THREE.Color).setHex(dark ? 0x3a1f6e : 0x4fd0c8);
    (u.uDeep.value as THREE.Color).setHex(dark ? 0x07050f : 0x1a5f9c);
    (u.uFoam.value as THREE.Color).setHex(dark ? 0xb07cff : 0xffffff);
    u.uGlow.value = dark ? 0.8 : 0;
  }

  update() {
    const g = this.game;
    if (this.ver.t !== g.terrainVer) { this.ver.t = g.terrainVer; this.rebuildTerrain(); this.ver.tr = -1; this.ver.r = -1; }
    if (this.ver.r !== g.roadVer) { this.ver.r = g.roadVer; this.rebuildRoads(); this.rebuildColors(); }
    if (this.ver.tr !== g.treeVer) { this.ver.tr = g.treeVer; this.rebuildTrees(); }
  }

  private rebuildTerrain() {
    const W = this.game.world, h = W.h, S1 = N + 1;
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute, a = pos.array as Float32Array;
    let k = 0;
    const put = (x: number, z: number) => { a[k++] = x; a[k++] = h[z * S1 + x]; a[k++] = z; };
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      // alternate the diagonal for a nicer low-poly look
      if ((x + z) % 2) { put(x, z); put(x, z + 1); put(x + 1, z); put(x + 1, z); put(x, z + 1); put(x + 1, z + 1); }
      else { put(x, z); put(x, z + 1); put(x + 1, z + 1); put(x, z); put(x + 1, z + 1); put(x + 1, z); }
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.geometry.computeBoundingSphere();
    const d = this.heightTex.image.data as Uint8Array;
    for (let i = 0; i < S1 * S1; i++) { d[i * 4] = Math.max(0, Math.min(255, ((h[i] + 2) / 4) * 255)); d[i * 4 + 3] = 255; }
    this.heightTex.needsUpdate = true;
    this.rebuildColors();
  }

  private rebuildColors() {
    const g = this.game, W = g.world;
    const L = this.light, D = this.dark;
    let k = 0;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, t = W.type[i], hh = W.tileH(x, z);
      const n = fbm(91, x * 0.25, z * 0.25, 2), r = hash(i);
      // light
      if (t === T.Water) c.setHex(0xd9cc97).multiplyScalar(Math.max(0.35, 1 + hh * 0.5));
      else if (t === T.Sand) c.setHex(0xead9a4).offsetHSL(0, 0, (r - 0.5) * 0.04);
      else if (t === T.Rock) { c.setHex(0x8f8c88).lerp(c2.setHex(0xf2f4f8), Math.min(1, Math.max(0, (hh - 1.7) / 0.7))).offsetHSL(0, 0, (r - 0.5) * 0.08); }
      else if (t === T.Forest) c.setHex(0x5d9a42).offsetHSL((n - 0.5) * 0.04, 0, (r - 0.5) * 0.04);
      else c.setHex(0x86bd52).offsetHSL((n - 0.5) * 0.07, (n - 0.5) * 0.1, (r - 0.5) * 0.022 + (n - 0.5) * 0.1);
      if (g.occ[i] && t !== T.Water) c.lerp(c2.setHex(0xc9b68c), 0.75);
      if (g.blight[i] && t !== T.Water) c.lerp(c2.setHex(0x4d3d5c), 0.72).offsetHSL(0, 0, (r - 0.5) * 0.06);
      // dark
      if (t === T.Water) c2.setHex(0x120c22);
      else if (t === T.Sand) c2.setHex(0x2b2440).offsetHSL(0, 0, (r - 0.5) * 0.03);
      else if (t === T.Rock) c2.setHex(0x17131f).offsetHSL(0, 0, (r - 0.5) * 0.04 + Math.max(0, hh - 1.5) * 0.04);
      else if (t === T.Forest) c2.setHex(0x181530).offsetHSL((n - 0.5) * 0.05, 0, (r - 0.5) * 0.03);
      else c2.setHex(0x251d3d).offsetHSL((n - 0.5) * 0.12, 0, (r - 0.5) * 0.035 + (n - 0.5) * 0.05);
      if (g.blight[i] && t !== T.Water) c2.lerp(new THREE.Color(0x4a1226), 0.6);
      for (let v = 0; v < 6; v++) { L[k] = c.r; L[k + 1] = c.g; L[k + 2] = c.b; D[k] = c2.r; D[k + 1] = c2.g; D[k + 2] = c2.b; k += 3; }
    }
    this.lightAttr.needsUpdate = true; this.darkAttr.needsUpdate = true;
  }

  private rebuildRoads() {
    const g = this.game, h = g.world.h, S1 = N + 1;
    const pos: number[] = [], col: number[] = [];
    for (const i of g.state.roads) {
      const x = i % N, z = (i / N) | 0, o = 0.035;
      const y = (dx: number, dz: number) => h[(z + dz) * S1 + x + dx] + o;
      const quad = [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]];
      c.setHex(0xcdbb92).offsetHSL(0, 0, (hash(i) - 0.5) * 0.07);
      for (const [dx, dz] of quad) { pos.push(x + dx, y(dx, dz), z + dz); col.push(c.r, c.g, c.b); }
      // a few cobbles
      for (let s = 0; s < 3; s++) {
        const cx = x + 0.2 + hash(i * 3 + s) * 0.6, cz = z + 0.2 + hash(i * 7 + s) * 0.6, r = 0.07 + hash(i + s) * 0.05;
        const cy = g.world.heightAt(cx, cz) + o + 0.012;
        c2.setHex(0xb09c78).offsetHSL(0, 0, (hash(i * 11 + s) - 0.5) * 0.1);
        for (const [dx, dz] of quad) { pos.push(cx + (dx - 0.5) * r * 2, cy, cz + (dz - 0.5) * r * 2); col.push(c2.r, c2.g, c2.b); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    this.roads.geometry.dispose();
    this.roads.geometry = geo;
  }

  private rebuildTrees() {
    const W = this.game.world;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    for (let i = 0; i < N * N; i++) {
      if (W.type[i] !== T.Forest) continue;
      const cnt = hash(i * 13) < 0.35 ? 2 : 1;
      for (let j = 0; j < cnt; j++) {
        const x = (i % N) + 0.15 + hash(i * 2 + j * 31) * 0.7, z = ((i / N) | 0) + 0.15 + hash(i * 5 + j * 17) * 0.7;
        const sc = 0.75 + hash(i + j * 3) * 0.6;
        m4.compose(p.set(x, W.heightAt(x, z) - 0.03, z), q.setFromAxisAngle(up, hash(i + j) * 6), s.set(sc, sc * (0.9 + hash(i * 7 + j) * 0.35), sc));
        this.trunks.setMatrixAt(n, m4); this.leaves.setMatrixAt(n, m4);
        c.setHex(0x3f8a3c).offsetHSL((hash(i * 3 + j) - 0.5) * 0.08, 0, (hash(i * 4 + j) - 0.5) * 0.12);
        this.leaves.setColorAt(n, c);
        n++;
      }
    }
    this.trunks.count = this.leaves.count = n;
    this.trunks.instanceMatrix.needsUpdate = this.leaves.instanceMatrix.needsUpdate = true;
    if (this.leaves.instanceColor) this.leaves.instanceColor.needsUpdate = true;
    this.trunks.computeBoundingSphere(); this.leaves.computeBoundingSphere();
  }
}
