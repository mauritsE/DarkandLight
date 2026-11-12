import * as THREE from 'three';

const MAX = 1400;

/** A small CPU particle pool rendered as soft round points. */
export class Particles {
  points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 4);
  private size = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private grow = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private next = 0;
  private geo = new THREE.BufferGeometry();

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.15, d) * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb, a); }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  setScale(px: number) { (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = px; }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number, opts: { grav?: number; grow?: number; alpha?: number; bright?: number } = {}) {
    const i = this.next; this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const b = opts.bright ?? 1;
    this.col[i * 4] = (((color >> 16) & 255) / 255) * b; this.col[i * 4 + 1] = (((color >> 8) & 255) / 255) * b; this.col[i * 4 + 2] = ((color & 255) / 255) * b;
    this.size[i] = size; this.life[i] = this.maxLife[i] = life;
    this.grav[i] = opts.grav ?? 0; this.grow[i] = opts.grow ?? 0; this.alpha[i] = opts.alpha ?? 1;
  }

  burst(x: number, y: number, z: number, color: number, n: number, speed: number, size: number, life: number, bright = 1, grav = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random();
      this.emit(x, y, z, Math.cos(a) * speed * (0.3 + u), speed * (0.4 + Math.random()), Math.sin(a) * speed * (0.3 + u), color, size * (0.6 + Math.random() * 0.7), life * (0.6 + Math.random() * 0.6), { grav, bright });
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.col[i * 4 + 3] = Math.min(1, t * 2.5) * Math.min(1, (1 - t) * 8) * this.alpha[i];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}
