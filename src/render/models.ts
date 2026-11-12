// Procedural low-poly models for buildings, strongholds and units.
import * as THREE from 'three';
import type { BuildingId, UnitKind } from '../sim/defs';
import { M, MB, S } from './materials';

const PI = Math.PI;

function house(b: MB, tier: number, v: number) {
  const flip = v % 2 ? PI / 2 : 0;
  const g = new MB();
  if (tier === 0) {
    g.box(M.stone, 1.3, 0.1, 1.1);
    g.box(v % 3 ? M.wall : M.wallWarm, 1.2, 0.6, 1.0, 0, 0.1);
    g.gable(M.thatch, 1.2, 0.55, 1.5, 0, 0.7, 0, PI / 2);
    g.box(M.timber, 0.22, 0.38, 0.06, -0.2, 0.1, 0.5);
    g.box(M.window, 0.2, 0.2, 0.06, 0.3, 0.32, 0.5).box(M.window, 0.2, 0.2, 0.06, -0.3, 0.32, -0.5);
    g.box(M.stoneDark, 0.16, 0.5, 0.16, 0.35, 0.8, -0.15);
    g.box(M.hedge, 0.5, 0.16, 0.2, 0.55, 0, 0.75).box(M.woodLight, 0.3, 0.2, 0.3, -0.65, 0, 0.7);
  } else if (tier === 1) {
    g.box(M.stone, 1.45, 0.28, 1.2);
    g.box(M.plaster, 1.35, 0.85, 1.1, 0, 0.28);
    for (const x of [-0.66, 0, 0.66]) g.box(M.timber, 0.06, 0.85, 1.14, x, 0.28);
    g.box(M.timber, 1.39, 0.06, 1.14, 0, 0.66);
    g.gable(v % 3 ? M.roofRed : M.roofGreen, 1.3, 0.7, 1.6, 0, 1.13, 0, PI / 2);
    g.box(M.timber, 0.24, 0.42, 0.06, 0, 0.28, 0.56);
    for (const x of [-0.4, 0.4]) g.box(M.window, 0.2, 0.22, 0.06, x, 0.78, 0.56).box(M.window, 0.2, 0.22, 0.06, x, 0.78, -0.56);
    g.box(M.window, 0.2, 0.22, 0.06, -0.4, 0.36, 0.56);
    g.box(M.stoneDark, 0.18, 0.7, 0.18, 0.42, 1.25, 0.1);
    g.box(M.hedge, 0.35, 0.2, 0.25, 0.65, 0, 0.78);
  } else {
    g.box(M.stoneLight, 1.5, 0.3, 1.3);
    g.box(M.plaster, 1.3, 1.35, 1.1, 0, 0.3);
    g.box(M.stoneLight, 1.36, 0.08, 1.16, 0, 0.95);
    g.gable(M.roofBlue, 1.3, 0.85, 1.5, 0, 1.65, 0, PI / 2);
    g.cyl(M.plaster, 0.3, 0.3, 1.9, 0.6, 0.3, 0.45, 8).cone(M.roofBlue, 0.4, 0.7, 0.6, 2.2, 0.45, 8).sphere(M.gold, 0.07, 0.6, 2.95, 0.45);
    g.box(M.timber, 0.26, 0.48, 0.06, -0.15, 0.3, 0.56);
    for (const x of [-0.4, 0.1]) for (const y of [0.45, 1.12]) g.box(M.window, 0.2, 0.3, 0.06, x, y + (y < 1 ? 0.6 : 0), 0.56);
    for (const x of [-0.4, 0.4]) g.box(M.window, 0.2, 0.3, 0.06, x, 1.15, -0.56);
    g.box(M.gold, 1.6, 0.05, 0.08, 0, 2.48, 0);
    g.box(M.stoneDark, 0.18, 0.6, 0.18, -0.4, 1.9, -0.2);
  }
  const grp = g.build();
  grp.rotation.y = flip + (v % 4 >= 2 ? PI : 0);
  return grp;
}

const BUILDERS: Record<BuildingId, (g: MB, v: number) => void> = {
  house: () => {},
  townhall: (g) => {
    g.box(M.stone, 2.7, 0.3, 2.7);
    g.box(M.stoneLight, 2.0, 1.5, 1.8, -0.2, 0.3, 0.1);
    for (let i = -4; i <= 4; i++) if (i % 2 === 0) g.box(M.stoneLight, 0.22, 0.2, 0.2, -0.2 + i * 0.22, 1.8, 0.95).box(M.stoneLight, 0.22, 0.2, 0.2, -0.2 + i * 0.22, 1.8, -0.75);
    g.gable(M.roofBlue, 1.5, 0.8, 1.9, -0.2, 1.8, 0.1, PI / 2);
    g.cyl(M.stoneLight, 0.5, 0.55, 2.6, 0.9, 0.3, -0.8, 8).cone(M.roofBlue, 0.68, 1.1, 0.9, 2.9, -0.8, 8).sphere(M.gold, 0.1, 0.9, 4.05, -0.8);
    g.cyl(M.timber, 0.03, 0.03, 0.8, -0.9, 2.3, 0.1, 5).box(M.yellow, 0.5, 0.3, 0.03, -0.63, 2.75, 0.1);
    g.box(M.timber, 0.5, 0.75, 0.08, -0.2, 0.3, 1.0);
    for (const x of [-0.9, 0.5]) g.box(M.window, 0.25, 0.4, 0.06, x, 1.0, 1.0);
    g.box(M.window, 0.2, 0.3, 0.06, 0.9, 2.0, -0.3);
    g.box(M.hedge, 0.5, 0.25, 0.5, 1.0, 0.3, 0.9).box(M.hedge, 0.5, 0.25, 0.5, -1.05, 0.3, -1.0);
  },
  market: (g) => {
    g.box(M.stoneLight, 2.7, 0.08, 2.7);
    g.cyl(M.stone, 0.35, 0.4, 0.3, 0, 0.08, 0, 8).cyl(M.water, 0.28, 0.28, 0.05, 0, 0.36, 0, 8);
    g.cyl(M.timber, 0.03, 0.03, 0.6, -0.3, 0.3, 0, 4).cyl(M.timber, 0.03, 0.03, 0.6, 0.3, 0.3, 0, 4).gable(M.roofRed, 0.9, 0.25, 0.5, 0, 0.9, 0);
    const stalls: [number, number, THREE.Material, number][] = [[-0.85, -0.85, M.red, 0], [0.85, -0.85, M.blue, 0], [-0.85, 0.85, M.yellow, PI], [0.85, 0.85, M.green, PI]];
    for (const [x, z, col, r] of stalls) {
      g.box(M.wood, 0.8, 0.3, 0.45, x, 0.08, z);
      for (const sx of [-0.36, 0.36]) g.cyl(M.timber, 0.025, 0.025, 0.75, x + sx, 0.08, z - 0.2, 4).cyl(M.timber, 0.025, 0.025, 0.75, x + sx, 0.08, z + 0.2, 4);
      g.gable(col, 0.6, 0.22, 0.9, x, 0.83, z, PI / 2 + r);
      g.box(M.white, 0.9, 0.02, 0.1, x, 0.84, z);
      g.sphere(M.red, 0.07, x - 0.2, 0.44, z).sphere(M.yellow, 0.07, x, 0.44, z).sphere(M.green, 0.07, x + 0.2, 0.44, z);
    }
  },
  chapel: (g) => {
    g.box(M.stone, 1.7, 0.15, 1.5);
    g.box(M.plaster, 0.9, 0.9, 1.3, -0.25, 0.15, 0);
    g.gable(M.roofDark, 1.0, 0.6, 1.4, -0.25, 1.05, 0);
    g.box(M.plaster, 0.55, 1.7, 0.55, 0.45, 0.15, 0.35).cone(M.roofDark, 0.45, 0.9, 0.45, 1.85, 0.35).box(M.gold, 0.04, 0.3, 0.04, 0.45, 2.7, 0.35).box(M.gold, 0.16, 0.04, 0.04, 0.45, 2.88, 0.35);
    g.box(M.timber, 0.3, 0.45, 0.06, -0.25, 0.15, 0.66);
    for (const z of [-0.35, 0.2]) g.box(M.window, 0.06, 0.4, 0.18, -0.71, 0.5, z);
    g.box(M.window, 0.2, 0.25, 0.06, 0.45, 1.35, 0.63);
  },
  spire: (g) => {
    g.cyl(M.stoneLight, 0.75, 0.85, 0.3, 0, 0, 0, 8).cyl(M.stoneLight, 0.38, 0.55, 1.6, 0, 0.3, 0, 6).cyl(M.gold, 0.45, 0.45, 0.08, 0, 1.9, 0, 6);
    g.cyl(M.stoneLight, 0.2, 0.34, 1.2, 0, 1.98, 0, 6);
    g.add(S.lumen, new THREE.OctahedronGeometry(0.34), 0, 3.7, 0);
    for (let i = 0; i < 3; i++) g.box(M.gold, 0.04, 0.5, 0.04, Math.cos(i * 2.09) * 0.3, 3.15, Math.sin(i * 2.09) * 0.3, 0, 0, 0);
    for (let i = 0; i < 4; i++) g.add(S.lumen, new THREE.OctahedronGeometry(0.09), Math.cos(i * PI / 2) * 0.72, 0.5, Math.sin(i * PI / 2) * 0.72);
  },
  warehouse: (g) => {
    g.box(M.stone, 1.7, 0.12, 1.6);
    g.box(M.wood, 1.5, 0.75, 1.2, 0, 0.12, -0.1);
    g.gable(M.roofDark, 1.4, 0.55, 1.65, 0, 0.87, -0.1, PI / 2);
    g.box(M.timber, 0.5, 0.55, 0.06, 0, 0.12, 0.5);
    g.box(M.woodLight, 0.3, 0.3, 0.3, 0.55, 0.12, 0.68).box(M.woodLight, 0.3, 0.3, 0.3, 0.2, 0.12, 0.7).box(M.woodLight, 0.28, 0.28, 0.28, 0.4, 0.42, 0.68, 0.3);
    g.cyl(M.wood, 0.14, 0.14, 0.3, -0.55, 0.12, 0.7, 8);
  },
  woodcutter: (g) => {
    g.box(M.wood, 0.9, 0.55, 0.8, -0.3, 0, -0.3).gable(M.roofGreen, 1.0, 0.45, 1.0, -0.3, 0.55, -0.3);
    g.box(M.timber, 0.2, 0.36, 0.05, -0.3, 0, 0.11);
    for (let i = 0; i < 3; i++) g.cyl(M.woodLight, 0.09, 0.09, 0.9, 0.45, 0.02 + (i === 2 ? 0.15 : 0), 0.35 + (i === 2 ? 0.09 : i * 0.18), 6, 0, PI / 2);
    g.cyl(M.wood, 0.16, 0.18, 0.2, 0.55, 0, -0.35, 7).box(M.metal, 0.04, 0.22, 0.12, 0.55, 0.2, -0.35, 0, 0, 0.5);
  },
  sawmill: (g) => {
    g.box(M.stone, 1.7, 0.1, 1.5);
    g.box(M.wood, 1.0, 0.7, 1.0, -0.3, 0.1, -0.15).gable(M.roofRed, 1.1, 0.5, 1.15, -0.3, 0.8, -0.15);
    g.cyl(M.metal, 0.4, 0.4, 0.04, 0.45, 0.25, 0.1, 12, 0, PI / 2).box(M.timber, 0.5, 0.3, 0.9, 0.5, 0.1, 0.1);
    for (let i = 0; i < 4; i++) g.box(M.woodLight, 0.7, 0.06, 0.2, -0.3, 0.1 + i * 0.065, 0.62);
    g.box(M.stoneDark, 0.16, 0.5, 0.16, -0.55, 1.0, -0.3);
  },
  fishery: (g) => {
    g.box(M.wood, 0.9, 0.55, 0.8, -0.3, 0.05, -0.3).gable(M.roofBlue, 1.0, 0.45, 1.0, -0.3, 0.6, -0.3);
    g.box(M.woodLight, 0.5, 0.06, 1.5, 0.45, 0.02, 0.6);
    for (const z of [0.2, 0.9, 1.3]) g.cyl(M.timber, 0.04, 0.04, 0.5, 0.25, -0.35, z, 5).cyl(M.timber, 0.04, 0.04, 0.5, 0.65, -0.35, z, 5);
    g.cyl(M.timber, 0.02, 0.02, 0.7, -0.75, 0, 0.5, 4).cyl(M.timber, 0.02, 0.02, 0.7, -0.15, 0, 0.5, 4).box(M.white, 0.6, 0.3, 0.02, -0.45, 0.35, 0.5);
    g.cyl(M.wood, 0.13, 0.13, 0.25, -0.3, 0.05, 0.25, 8);
  },
  quarry: (g) => {
    g.box(M.dirt, 1.7, 0.06, 1.7);
    g.box(M.stoneLight, 0.6, 0.5, 0.5, -0.4, 0, -0.4, 0.3).box(M.stone, 0.5, 0.35, 0.5, 0.1, 0, -0.5, -0.2).box(M.stoneLight, 0.4, 0.3, 0.4, -0.5, 0.06, 0.2, 0.6).box(M.stone, 0.3, 0.25, 0.3, -0.35, 0.45, -0.4, 0.8);
    g.cyl(M.timber, 0.04, 0.04, 1.2, 0.5, 0, 0.4, 5).box(M.timber, 0.8, 0.05, 0.05, 0.25, 1.15, 0.4).cyl(M.timber, 0.012, 0.012, 0.6, -0.1, 0.55, 0.4, 4).box(M.stoneLight, 0.22, 0.2, 0.22, -0.1, 0.36, 0.4);
    g.box(M.wood, 0.5, 0.4, 0.45, 0.5, 0, -0.45).gable(M.roofDark, 0.55, 0.25, 0.6, 0.5, 0.4, -0.45);
  },
  farm: (g) => {
    g.box(M.wall, 0.85, 0.55, 0.75, -0.85, 0, -0.85).gable(M.thatch, 0.95, 0.45, 0.9, -0.85, 0.55, -0.85);
    g.box(M.timber, 0.2, 0.34, 0.05, -0.85, 0, -0.46);
    for (let i = 0; i < 7; i++) g.box(i % 2 ? M.field : M.yellow, 0.26, 0.2 + (i % 3) * 0.03, 1.5, -0.1 + i * 0.2 - 0.02, 0, 0.5);
    for (let i = 0; i < 4; i++) g.box(M.field, 0.9, 0.18, 0.2, 0.7, 0, -1.15 + i * 0.26);
    for (let i = 0; i < 4; i++) g.box(M.fieldGreen, 0.2, 0.12, 1.5, -1.2 + i * 0.26, 0, 0.5);
    g.cyl(M.thatch, 0.02, 0.3, 0.5, -0.1, 0, -0.9, 7);
    for (let i = 0; i < 6; i++) g.box(M.timber, 0.04, 0.22, 0.04, -1.35 + i * 0.55, 0, 1.35);
    g.box(M.timber, 2.8, 0.03, 0.03, 0, 0.16, 1.35);
  },
  bakery: (g) => {
    g.box(M.stone, 1.6, 0.12, 1.4);
    g.box(M.wallWarm, 1.3, 0.75, 1.0, 0, 0.12, -0.1).gable(M.roofRed, 1.1, 0.55, 1.5, 0, 0.87, -0.1, PI / 2);
    g.cyl(M.stoneDark, 0.3, 0.36, 0.6, 0.55, 0.12, 0.45, 8).sphere(M.stoneDark, 0.3, 0.55, 0.72, 0.45, 1).box(M.ember, 0.2, 0.14, 0.05, 0.55, 0.3, 0.8);
    g.box(M.stoneDark, 0.2, 0.9, 0.2, 0.45, 0.9, -0.3);
    g.box(M.timber, 0.24, 0.4, 0.06, -0.3, 0.12, 0.41).box(M.window, 0.22, 0.2, 0.06, 0.1, 0.4, 0.41);
    g.box(M.yellow, 0.4, 0.04, 0.3, -0.3, 0.6, 0.55);
  },
  sheepfarm: (g) => {
    g.box(M.wood, 0.9, 0.6, 0.8, -0.85, 0, -0.85).gable(M.roofRed, 1.0, 0.5, 0.95, -0.85, 0.6, -0.85);
    g.box(M.fieldGreen, 2.3, 0.04, 1.6, 0.15, 0, 0.45);
    for (let i = 0; i <= 8; i++) g.box(M.timber, 0.05, 0.28, 0.05, -1.0 + i * 0.29, 0, 1.3).box(M.timber, 0.05, 0.28, 0.05, -1.0 + i * 0.29, 0, -0.35);
    g.box(M.timber, 2.35, 0.03, 0.03, 0.16, 0.2, 1.3).box(M.timber, 2.35, 0.03, 0.03, 0.16, 0.2, -0.35).box(M.timber, 0.03, 0.03, 1.65, 1.32, 0.2, 0.47).box(M.timber, 0.03, 0.03, 1.65, -1.0, 0.2, 0.47);
    const sheep: [number, number][] = [[-0.4, 0.3], [0.3, 0.8], [0.8, 0.1], [0.1, 0.0], [-0.6, 0.95]];
    for (const [x, z] of sheep) g.sphere(M.white, 0.15, x, 0.2, z, 1).box(M.timber, 0.09, 0.09, 0.1, x + 0.15, 0.2, z);
  },
  weaver: (g) => {
    g.box(M.stone, 1.6, 0.12, 1.4);
    g.box(M.plaster, 1.2, 0.8, 1.0, -0.1, 0.12, -0.1);
    for (const x of [-0.7, 0.5]) g.box(M.timber, 0.06, 0.8, 1.04, x, 0.12, -0.1);
    g.gable(M.roofGreen, 1.1, 0.55, 1.4, -0.1, 0.92, -0.1, PI / 2);
    g.box(M.timber, 0.22, 0.4, 0.06, -0.1, 0.12, 0.41);
    g.cyl(M.timber, 0.02, 0.02, 0.6, 0.6, 0.12, 0.6, 4).cyl(M.timber, 0.02, 0.02, 0.6, -0.5, 0.12, 0.6, 4).box(M.timber, 1.14, 0.02, 0.02, 0.05, 0.7, 0.6);
    g.box(M.red, 0.26, 0.36, 0.02, -0.3, 0.33, 0.6).box(M.blue, 0.26, 0.42, 0.02, 0.05, 0.27, 0.6).box(M.purple, 0.26, 0.32, 0.02, 0.4, 0.37, 0.6);
  },
  mine: (g) => {
    g.box(M.dirt, 1.7, 0.06, 1.7);
    g.box(M.stoneDark, 1.3, 0.9, 0.9, 0, 0, -0.4).box(M.stone, 0.9, 0.5, 0.7, -0.2, 0.7, -0.45, 0.2).box(M.stoneDark, 0.5, 0.3, 0.5, 0.35, 0.9, -0.4, -0.3);
    g.box(M.timber, 0.08, 0.7, 0.08, -0.3, 0, 0.08).box(M.timber, 0.08, 0.7, 0.08, 0.3, 0, 0.08).box(M.timber, 0.76, 0.08, 0.1, 0, 0.7, 0.08);
    g.box(M.roofDark, 0.52, 0.66, 0.04, 0, 0.02, 0.06);
    g.box(M.wood, 0.36, 0.2, 0.26, 0.1, 0.1, 0.6).box(M.metal, 0.3, 0.1, 0.2, 0.1, 0.3, 0.6);
    g.box(M.timber, 0.04, 0.02, 0.9, 0.0, 0.06, 0.55).box(M.timber, 0.04, 0.02, 0.9, 0.2, 0.06, 0.55);
    g.box(M.metal, 0.25, 0.2, 0.25, -0.55, 0.06, 0.55, 0.4);
  },
  forge: (g) => {
    g.box(M.stoneDark, 1.6, 0.14, 1.5);
    g.box(M.stone, 1.2, 0.85, 1.0, -0.1, 0.14, -0.15).gable(M.roofDark, 1.1, 0.5, 1.35, -0.1, 0.99, -0.15, PI / 2);
    g.box(M.stoneDark, 0.3, 1.5, 0.3, 0.3, 0.9, -0.35).box(M.ember, 0.2, 0.05, 0.2, 0.3, 2.38, -0.35);
    g.box(M.ember, 0.34, 0.28, 0.05, -0.1, 0.24, 0.36);
    g.box(M.metal, 0.3, 0.14, 0.14, 0.55, 0.34, 0.55).box(M.timber, 0.16, 0.2, 0.16, 0.55, 0.14, 0.55);
    g.box(M.woodLight, 0.3, 0.02, 0.5, -0.55, 0.14, 0.6);
  },
  harbor: (g) => {
    g.box(M.stone, 2.6, 0.2, 1.4, 0, 0, -0.6);
    g.box(M.wood, 1.2, 0.8, 0.9, -0.6, 0.2, -0.75).gable(M.roofBlue, 1.0, 0.5, 1.35, -0.6, 1.0, -0.75, PI / 2);
    g.box(M.timber, 0.3, 0.5, 0.05, -0.6, 0.2, -0.28);
    g.box(M.woodLight, 1.0, 0.08, 2.6, 0.5, 0.12, 1.1);
    for (const z of [0.4, 1.2, 2.0]) for (const x of [0.05, 0.95]) g.cyl(M.timber, 0.06, 0.06, 0.9, x, -0.6, z, 5);
    g.cyl(M.timber, 0.05, 0.05, 1.3, 0.85, 0.2, -0.5, 5).box(M.timber, 0.05, 0.05, 1.0, 0.85, 1.45, -0.1).cyl(M.timber, 0.012, 0.012, 0.6, 0.85, 0.85, 0.35, 4).box(M.woodLight, 0.25, 0.22, 0.25, 0.85, 0.63, 0.35);
    g.box(M.woodLight, 0.3, 0.3, 0.3, 0.2, 0.2, -0.3).cyl(M.wood, 0.14, 0.14, 0.3, 0.5, 0.2, 1.9, 8).cyl(M.wood, 0.14, 0.14, 0.3, 0.2, 0.2, 0.2, 8);
    g.cyl(M.timber, 0.03, 0.03, 1.0, -1.1, 1.0, -1.1, 4).box(M.blue, 0.4, 0.25, 0.02, -0.88, 1.7, -1.1);
  },
  gate: (g) => {
    g.cyl(S.gateStone, 1.35, 1.45, 0.2, 0, 0, 0, 10).cyl(S.gateDark, 1.05, 1.05, 0.06, 0, 0.2, 0, 10);
    for (let i = 0; i < 10; i++) {
      const a = (i / 9) * PI, x = Math.cos(a) * 0.95, y = 0.3 + Math.sin(a) * 1.5;
      g.box(i % 2 ? S.gateStone : S.gateDark, 0.36, 0.42, 0.42, x, y, 0, 0, 0, a + PI / 2);
    }
    for (const x of [-0.95, 0.95]) g.box(S.gateStone, 0.5, 0.35, 0.55, x, 0.2, 0);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2 + 0.3; g.box(S.rune, 0.1, 0.34, 0.1, Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.2); }
    g.add(S.lumen, new THREE.OctahedronGeometry(0.14), 0, 2.2, 0);
  },
  barracks: (g) => {
    g.box(M.dirt, 2.7, 0.06, 2.7);
    for (let i = 0; i < 12; i++) {
      const t = -1.25 + i * 0.227;
      if (Math.abs(t) > 0.3) g.cyl(M.timber, 0.07, 0.08, 0.6, t, 0, 1.25, 5);
      g.cyl(M.timber, 0.07, 0.08, 0.6, t, 0, -1.25, 5).cyl(M.timber, 0.07, 0.08, 0.6, 1.25, 0, t, 5).cyl(M.timber, 0.07, 0.08, 0.6, -1.25, 0, t, 5);
    }
    g.box(M.stone, 1.4, 0.8, 0.9, -0.35, 0.06, -0.6).gable(M.roofRed, 1.0, 0.5, 1.5, -0.35, 0.86, -0.6, PI / 2);
    g.box(M.timber, 0.3, 0.5, 0.05, -0.35, 0.06, -0.14);
    g.cone(M.white, 0.45, 0.6, 0.7, 0.06, 0.5).cone(M.white, 0.4, 0.5, 0.75, 0.06, -0.5);
    g.cyl(M.timber, 0.03, 0.03, 0.7, -0.6, 0.06, 0.6, 4).box(M.thatch, 0.3, 0.3, 0.08, -0.6, 0.5, 0.6);
    g.cyl(M.timber, 0.04, 0.04, 1.8, 1.0, 0.06, -1.0, 4).box(M.red, 0.5, 0.35, 0.03, 0.73, 1.5, -1.0);
    g.box(M.metal, 0.5, 0.04, 0.1, 0.2, 0.3, 0.9).box(M.timber, 0.06, 0.3, 0.06, 0.0, 0.06, 0.9).box(M.timber, 0.06, 0.3, 0.06, 0.4, 0.06, 0.9);
  },
};

export function buildingModel(type: BuildingId, tier: number, v: number): THREE.Group {
  if (type === 'house') return house(new MB(), tier, v);
  const g = new MB();
  BUILDERS[type](g, v);
  return g.build();
}

/** Height at which smoke leaves the chimney, if any. */
export const CHIMNEY: Partial<Record<BuildingId, [number, number, number]>> = {
  bakery: [0.45, 1.9, -0.3], forge: [0.3, 2.5, -0.35], sawmill: [-0.55, 1.6, -0.3],
};

export function campModel(ci: number): THREE.Group {
  const g = new MB(), glow = S.campGlow[ci];
  const k = 1 + ci * 0.25;
  g.cyl(S.obsidian, 1.5 * k, 1.8 * k, 0.3, 0, 0, 0, 7);
  g.cyl(S.obsidian, 0.35 * k, 0.8 * k, 2.6 * k, 0, 0.3, 0, 5).cone(S.obsidian, 0.5 * k, 1.4 * k, 0, 0.3 + 2.6 * k, 0, 5);
  g.add(glow, new THREE.OctahedronGeometry(0.3 * k), 0, 0.3 + 2.0 * k, 0.75 * k * 0.6);
  g.add(glow, new THREE.TorusGeometry(0.62 * k, 0.05, 5, 12), 0, 0.3 + 1.2 * k, 0, 0, PI / 2);
  const spikes = 6 + ci * 2;
  for (let i = 0; i < spikes; i++) {
    const a = (i / spikes) * PI * 2, r = 1.25 * k, h = (0.9 + (i % 3) * 0.5) * k;
    g.add(S.obsidian, new THREE.ConeGeometry(0.2 * k, h, 4), Math.cos(a) * r, 0.3 + h / 2 - 0.1, Math.sin(a) * r, a, 0.25, 0);
    if (i % 2 === 0) g.add(glow, new THREE.OctahedronGeometry(0.08), Math.cos(a) * r * 0.82, 0.5, Math.sin(a) * r * 0.82);
  }
  for (let i = 0; i < 3 + ci; i++) {
    const a = i * 2.1 + 0.5, r = 2.3 * k;
    g.cyl(S.darkWood, 0.04, 0.04, 1.6, Math.cos(a) * r, 0, Math.sin(a) * r, 4).box(glow, 0.34, 0.5, 0.03, Math.cos(a) * r + 0.19, 1.05, Math.sin(a) * r);
    g.sphere(S.bone, 0.1, Math.cos(a) * r, 1.66, Math.sin(a) * r);
  }
  if (ci === 2) for (const x of [-1.9, 1.9]) g.cyl(S.obsidian, 0.3, 0.45, 2.4, x, 0, 0, 5).cone(S.obsidian, 0.42, 1.0, x, 2.4, 0, 5).add(glow, new THREE.OctahedronGeometry(0.16), x, 1.7, 0.36);
  return g.build();
}

export function wellModel(): THREE.Group {
  const g = new MB();
  g.cyl(S.gateStone, 1.0, 1.1, 0.3, 0, 0, 0, 8).cyl(S.lumen, 0.75, 0.75, 0.06, 0, 0.28, 0, 8);
  g.add(S.lumen, new THREE.OctahedronGeometry(0.25), 0, 1.3, 0);
  for (let i = 0; i < 4; i++) g.box(S.gateStone, 0.2, 0.7, 0.2, Math.cos(i * PI / 2 + 0.78) * 0.95, 0.3, Math.sin(i * PI / 2 + 0.78) * 0.95);
  return g.build();
}

export function scarModel(): THREE.Group {
  const g = new MB();
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9, r = 0.4 + (i % 3) * 0.5, h = 0.8 + (i % 4) * 0.45;
    g.add(S.obsidian, new THREE.ConeGeometry(0.22, h, 4), Math.cos(a) * r, h / 2 - 0.1, Math.sin(a) * r, a, 0.3, 0);
  }
  g.add(S.rune, new THREE.OctahedronGeometry(0.2), 0, 1.5, 0);
  return g.build();
}

export function shipModel(color: number): THREE.Group {
  const g = new MB();
  const flag = new THREE.MeshStandardMaterial({ color, flatShading: true });
  g.box(M.wood, 0.7, 0.3, 1.7, 0, 0.0, 0).box(M.timber, 0.76, 0.08, 1.76, 0, 0.3, 0);
  g.add(M.wood, new THREE.ConeGeometry(0.36, 0.7, 4), 0, 0.15, 1.15, PI / 4, PI / 2, 0);
  g.box(M.wood, 0.6, 0.3, 0.45, 0, 0.3, -0.6).box(M.window, 0.3, 0.12, 0.02, 0, 0.42, -0.83);
  g.cyl(M.timber, 0.04, 0.05, 1.9, 0, 0.3, 0.15, 5).box(M.timber, 1.2, 0.04, 0.04, 0, 1.9, 0.15).box(M.timber, 1.0, 0.04, 0.04, 0, 0.95, 0.15);
  g.box(M.sail, 1.1, 0.9, 0.03, 0, 0.98, 0.2).box(flag, 0.34, 0.2, 0.02, 0.17, 2.05, 0.15).box(flag, 1.1, 0.14, 0.035, 0, 1.4, 0.2);
  return g.build();
}

/** Humanoid / monster figures. Origin at the feet, facing +z. */
export function unitModel(kind: UnitKind): THREE.Group {
  const g = new MB();
  switch (kind) {
    case 'swordsman':
      g.box(S.leather, 0.1, 0.22, 0.1, -0.08, 0, 0).box(S.leather, 0.1, 0.22, 0.1, 0.08, 0, 0);
      g.box(S.tabardBlue, 0.3, 0.3, 0.18, 0, 0.22, 0).box(S.tabard, 0.14, 0.26, 0.19, 0, 0.24, 0);
      g.sphere(S.skin, 0.1, 0, 0.62, 0).box(S.steel, 0.22, 0.1, 0.22, 0, 0.64, 0);
      g.box(S.steel, 0.04, 0.42, 0.04, 0.2, 0.3, 0.12).box(S.tabardGold, 0.12, 0.03, 0.05, 0.2, 0.3, 0.12);
      g.box(S.tabardBlue, 0.04, 0.26, 0.22, -0.19, 0.24, 0.06).box(S.tabardGold, 0.045, 0.1, 0.1, -0.195, 0.32, 0.06);
      break;
    case 'archer':
      g.box(S.leather, 0.09, 0.22, 0.09, -0.07, 0, 0).box(S.leather, 0.09, 0.22, 0.09, 0.07, 0, 0);
      g.box(M.green, 0.26, 0.3, 0.16, 0, 0.22, 0).sphere(S.skin, 0.095, 0, 0.61, 0);
      g.cone(M.green, 0.14, 0.2, 0, 0.64, 0, 6);
      g.add(S.leather, new THREE.TorusGeometry(0.2, 0.015, 4, 8, PI), 0.17, 0.4, 0.12, PI / 2, 0, -PI / 2);
      g.box(S.leather, 0.07, 0.26, 0.07, 0, 0.26, -0.12, 0, 0, 0.3);
      break;
    case 'knight':
      g.box(S.steel, 0.12, 0.26, 0.12, -0.1, 0, 0).box(S.steel, 0.12, 0.26, 0.12, 0.1, 0, 0);
      g.box(S.steel, 0.38, 0.36, 0.24, 0, 0.26, 0).box(S.tabardGold, 0.16, 0.32, 0.25, 0, 0.28, 0);
      g.box(S.steel, 0.2, 0.2, 0.2, 0, 0.64, 0).box(S.lumen, 0.14, 0.03, 0.02, 0, 0.74, 0.1).cone(S.tabardGold, 0.06, 0.2, 0, 0.84, 0, 4);
      g.box(S.lumen, 0.05, 0.6, 0.05, 0.27, 0.34, 0.14).box(S.tabardGold, 0.16, 0.04, 0.06, 0.27, 0.34, 0.14);
      g.box(S.tabard, 0.3, 0.42, 0.03, 0, 0.2, -0.14);
      break;
    case 'beacon':
      g.cyl(S.gateStone, 0.42, 0.5, 0.25, 0, 0, 0, 6).cyl(S.gateStone, 0.2, 0.32, 1.6, 0, 0.25, 0, 6).cyl(S.gateDark, 0.3, 0.2, 0.15, 0, 1.85, 0, 6);
      g.add(S.lumen, new THREE.OctahedronGeometry(0.26), 0, 2.4, 0);
      break;
    case 'ghoul':
      g.box(S.ghoulDark, 0.09, 0.2, 0.09, -0.08, 0, 0).box(S.ghoulDark, 0.09, 0.2, 0.09, 0.08, 0, 0);
      g.box(S.ghoul, 0.3, 0.28, 0.2, 0, 0.2, 0.03, 0, 0.25).sphere(S.ghoul, 0.11, 0, 0.56, 0.1);
      g.box(S.eyeRed, 0.04, 0.03, 0.02, -0.045, 0.57, 0.2).box(S.eyeRed, 0.04, 0.03, 0.02, 0.045, 0.57, 0.2);
      g.box(S.ghoulDark, 0.07, 0.3, 0.07, -0.2, 0.14, 0.12, 0, -0.5).box(S.ghoulDark, 0.07, 0.3, 0.07, 0.2, 0.14, 0.12, 0, -0.5);
      g.cone(S.bone, 0.03, 0.1, -0.07, 0.64, 0.08, 4).cone(S.bone, 0.03, 0.1, 0.07, 0.64, 0.08, 4);
      break;
    case 'spitter':
      for (const x of [-0.14, 0.14]) for (const z of [-0.1, 0.1]) g.box(S.ghoulDark, 0.05, 0.2, 0.05, x, 0, z, 0, 0, x > 0 ? -0.3 : 0.3);
      g.sphere(S.spitter, 0.2, 0, 0.3, -0.05, 1).cyl(S.spitter, 0.06, 0.1, 0.3, 0, 0.4, 0.1, 6, 0.6).sphere(S.spitter, 0.09, 0, 0.72, 0.22);
      g.sphere(S.eyeGreen, 0.05, 0, 0.72, 0.3).sphere(S.eyeGreen, 0.06, -0.1, 0.42, -0.14).sphere(S.eyeGreen, 0.05, 0.12, 0.44, -0.1);
      break;
    case 'brute':
      g.box(S.ghoulDark, 0.18, 0.3, 0.18, -0.15, 0, 0).box(S.ghoulDark, 0.18, 0.3, 0.18, 0.15, 0, 0);
      g.box(S.brute, 0.6, 0.5, 0.36, 0, 0.3, 0).box(S.brute, 0.26, 0.22, 0.24, 0, 0.8, 0.06);
      g.box(S.eyeRed, 0.06, 0.04, 0.02, -0.07, 0.92, 0.19).box(S.eyeRed, 0.06, 0.04, 0.02, 0.07, 0.92, 0.19);
      g.box(S.brute, 0.16, 0.5, 0.16, -0.4, 0.3, 0.05).box(S.brute, 0.16, 0.5, 0.16, 0.4, 0.3, 0.05);
      g.cyl(S.darkWood, 0.05, 0.05, 0.7, 0.4, 0.2, 0.25, 5, 0.9).sphere(S.obsidian, 0.16, 0.4, 0.75, 0.6);
      g.cone(S.bone, 0.05, 0.16, -0.12, 1.02, 0.06, 4).cone(S.bone, 0.05, 0.16, 0.12, 1.02, 0.06, 4);
      break;
    case 'sovereign':
      g.cone(S.sovereign, 0.6, 1.5, 0, 0, 0, 7);
      g.box(S.sovereign, 0.7, 0.5, 0.4, 0, 1.0, 0).box(S.obsidian, 0.3, 0.3, 0.3, 0, 1.5, 0.02);
      g.box(S.eyeRed, 0.07, 0.04, 0.02, -0.07, 1.68, 0.18).box(S.eyeRed, 0.07, 0.04, 0.02, 0.07, 1.68, 0.18);
      for (let i = 0; i < 5; i++) g.cone(S.campGlow[2], 0.045, 0.26, Math.cos(i * 1.256) * 0.14, 1.8, Math.sin(i * 1.256) * 0.14 + 0.02, 4);
      g.box(S.sovereign, 0.2, 0.7, 0.2, -0.5, 0.8, 0.05, 0, 0, 0.2).box(S.sovereign, 0.2, 0.7, 0.2, 0.5, 0.8, 0.05, 0, 0, -0.2);
      g.box(S.campGlow[2], 0.07, 1.5, 0.07, 0.62, 0.5, 0.3).cone(S.campGlow[2], 0.14, 0.4, 0.62, 2.0, 0.3, 4);
      g.box(S.obsidian, 0.9, 1.1, 0.04, 0, 0.3, -0.3);
      break;
    default:
      break;
  }
  return g.build();
}
