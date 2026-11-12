import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Opts = THREE.MeshStandardMaterialParameters;
const std = (color: number, o: Opts = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });

/** Materials of the Light World city. In the Dark World these turn into pale ghosts. */
export const M = {
  wall: std(0xf1e4c8), wallWarm: std(0xe6c898), plaster: std(0xfaf3e3),
  timber: std(0x5b3a22), wood: std(0x9a6a3c), woodLight: std(0xc79a5e),
  thatch: std(0xd4b25c), roofRed: std(0xb9492f), roofBlue: std(0x3d5f94), roofGreen: std(0x4a7c5c), roofDark: std(0x50403d),
  stone: std(0x9f9d96), stoneDark: std(0x6d6b68), stoneLight: std(0xcac6bb),
  window: std(0x3a3340, { emissive: 0xffc66b, emissiveIntensity: 0.25 }),
  gold: std(0xe8b93c, { metalness: 0.6, roughness: 0.35 }),
  field: std(0xdcb94a), fieldGreen: std(0x8fbf4f), hedge: std(0x4f8a3a), dirt: std(0x8f6f4b),
  white: std(0xf6f3ec), red: std(0xc8413b), blue: std(0x3f68c8), green: std(0x4f9a55), yellow: std(0xe6b83a), purple: std(0x8a54c4),
  metal: std(0x5b5e66, { metalness: 0.7, roughness: 0.4 }),
  water: std(0x4aa3c7, { roughness: 0.3 }),
  road: std(0xffffff, { vertexColors: true, roughness: 1 }),
  trunk: std(0x6b4a2e), foliage: std(0xffffff),
  sail: std(0xf6ecd6, { side: THREE.DoubleSide }),
  ember: std(0x331100, { emissive: 0xff6a1a, emissiveIntensity: 2.2 }),
};
type MatKey = keyof typeof M;

/** Materials that stay solid in both worlds (the Rift Gate, light magic). */
export const S = {
  gateStone: std(0x8d8a99), gateDark: std(0x4b4860),
  lumen: std(0xfff2c0, { emissive: 0xffd66b, emissiveIntensity: 2.4 }),
  rune: std(0x221133, { emissive: 0xa46bff, emissiveIntensity: 2.2 }),
  // dark world
  obsidian: std(0x1a1524, { roughness: 0.5 }), bone: std(0xb9b0a0), darkWood: std(0x2a2030),
  ghoul: std(0x5a3b78), ghoulDark: std(0x2e1f40), spitter: std(0x3f6b4a), brute: std(0x6b2f2a), sovereign: std(0x2a1030, { metalness: 0.5, roughness: 0.4 }),
  eyeRed: std(0x220000, { emissive: 0xff3030, emissiveIntensity: 3 }),
  eyeGreen: std(0x002200, { emissive: 0x7dff5a, emissiveIntensity: 3 }),
  crystalA: std(0x1a2a40, { emissive: 0x3ad6ff, emissiveIntensity: 1.6 }),
  crystalB: std(0x2a1a40, { emissive: 0xb45aff, emissiveIntensity: 1.6 }),
  steel: std(0xc9ced6, { metalness: 0.7, roughness: 0.3 }),
  tabard: std(0xf2e6c4), tabardBlue: std(0x3d62b8), tabardGold: std(0xf0c64a, { emissive: 0xf0a020, emissiveIntensity: 0.6 }),
  skin: std(0xe2b48c), leather: std(0x7a5536),
  campGlow: [0xb04cff, 0xff5a2a, 0xff2a6a].map((c) => std(0x110011, { emissive: c, emissiveIntensity: 2.6 })),
};

const base = new Map<THREE.MeshStandardMaterial, { opacity: number; emissive: number; ei: number }>();
for (const k in M) {
  const m = M[k as MatKey];
  base.set(m, { opacity: m.opacity, emissive: m.emissive.getHex(), ei: m.emissiveIntensity });
}

/** Switch the city between solid (light world) and ghostly (dark world). */
export function setGhost(dark: boolean) {
  for (const [m, b] of base) {
    const special = m === M.window || m === M.ember;
    if (dark) {
      m.transparent = true; m.depthWrite = special;
      m.opacity = special ? 0.95 : m === M.foliage ? 0.5 : 0.3;
      if (m === M.window) m.emissiveIntensity = 3.2;
      else if (!special) { m.emissive.setHex(m === M.foliage || m === M.trunk ? 0x24104a : 0x6f8fd0); m.emissiveIntensity = m === M.foliage ? 0.5 : 0.35; }
    } else {
      m.transparent = false; m.depthWrite = true; m.opacity = b.opacity;
      m.emissive.setHex(b.emissive); m.emissiveIntensity = b.ei;
    }
    m.needsUpdate = true;
  }
}

/** Collects primitive shapes per material and merges them into a few meshes. */
export class MB {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(m: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    let arr = this.parts.get(m);
    if (!arr) this.parts.set(m, (arr = []));
    arr.push(g);
    return this;
  }
  /** Box with its bottom at y. */
  box(m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
    return this.add(m, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, ry, rx, rz);
  }
  cyl(m: THREE.Material, rt: number, rb: number, h: number, x = 0, y = 0, z = 0, seg = 8, rx = 0, rz = 0) {
    return this.add(m, new THREE.CylinderGeometry(rt, rb, h, seg), x, y + h / 2, z, 0, rx, rz);
  }
  /** Pyramid / cone roof. With seg=4 the base is a square of side r*√2. */
  cone(m: THREE.Material, r: number, h: number, x = 0, y = 0, z = 0, seg = 4) {
    return this.add(m, new THREE.ConeGeometry(r, h, seg), x, y + h / 2, z, seg === 4 ? Math.PI / 4 : 0);
  }
  sphere(m: THREE.Material, r: number, x = 0, y = 0, z = 0, detail = 0) {
    return this.add(m, new THREE.IcosahedronGeometry(r, detail), x, y, z);
  }
  /** Gable roof prism, ridge along local z. */
  gable(m: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0, ry = 0) {
    const a = w / 2, b = d / 2;
    const v = [[-a, 0, -b], [a, 0, -b], [0, h, -b], [-a, 0, b], [a, 0, b], [0, h, b]];
    const tris = [3, 4, 5, 1, 0, 2, 0, 3, 5, 0, 5, 2, 4, 1, 2, 4, 2, 5, 0, 1, 4, 0, 4, 3];
    const pos = new Float32Array(tris.length * 3);
    tris.forEach((i, k) => pos.set(v[i], k * 3));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return this.add(m, g, x, y, z, ry);
  }
  build(shadow = true): THREE.Group {
    const group = new THREE.Group();
    for (const [m, geos] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), m);
      mesh.castShadow = shadow; mesh.receiveShadow = shadow;
      group.add(mesh);
    }
    return group;
  }
}
