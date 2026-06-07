/**
 * 区域随机数与噪声 - RegionRNG / RegionNoise
 * 从 region-tile-generator 中提取的随机数和 Perlin 噪声实现
 */

export class RegionRNG {
  private state: number;
  constructor(seed: number) { this.state = seed | 0; }
  next(): number {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

export class RegionNoise {
  private perm: Uint8Array;
  private gradX: Float32Array;
  private gradY: Float32Array;

  constructor(seed: number) {
    const rng = new RegionRNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.nextInt(0, i);
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.gradX = new Float32Array(256);
    this.gradY = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const angle = rng.next() * Math.PI * 2;
      this.gradX[i] = Math.cos(angle);
      this.gradY[i] = Math.sin(angle);
    }
  }

  private fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }

  noise2D(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this.fade(xf);
    const v = this.fade(yf);
    const aa = this.perm[this.perm[xi] + yi];
    const ab = this.perm[this.perm[xi] + yi + 1];
    const ba = this.perm[this.perm[xi + 1] + yi];
    const bb = this.perm[this.perm[xi + 1] + yi + 1];
    const x1 = (this.gradX[aa] * xf + this.gradY[aa] * yf) * (1 - u) + (this.gradX[ba] * (xf - 1) + this.gradY[ba] * yf) * u;
    const x2 = (this.gradX[ab] * xf + this.gradY[ab] * (yf - 1)) * (1 - u) + (this.gradX[bb] * (xf - 1) + this.gradY[bb] * (yf - 1)) * u;
    return (x1 * (1 - v) + x2 * v) * 0.5 + 0.5;
  }

  fbm(x: number, y: number, octaves: number, persistence: number, lacunarity: number, scale: number): number {
    let total = 0, amplitude = 1, frequency = scale, maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += amplitude * this.noise2D(x * frequency, y * frequency);
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return total / maxValue;
  }
}
