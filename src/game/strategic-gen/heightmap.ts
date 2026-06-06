import { StrategicGenContext, create2DArray, forEachCell, SeededRNG } from './gen-context';
import { StrategicGenConfig } from './strategic-gen-config';

// Simple Perlin-like noise using value noise with interpolation
function makeNoise(rng: SeededRNG): (x: number, y: number) => number {
  const perm: number[] = [];
  for (let i = 0; i < 512; i++) perm[i] = rng.nextInt(0, 255);

  function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a: number, b: number, t: number): number { return a + t * (b - a); }
  function grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  return (x: number, y: number): number => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v
    ) * 0.5 + 0.5;
  };
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise(x * frequency, y * frequency);
    maxValue += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / maxValue;
}

export function generateStrategicHeightmap(ctx: StrategicGenContext, config: StrategicGenConfig): number[][] {
  const { width, height, rng } = ctx;
  const noise1 = makeNoise(rng);
  const noise2 = makeNoise(rng);
  const noise3 = makeNoise(rng);

  const elevation = create2DArray(width, height, () => 0);

  forEachCell(width, height, (x, y) => {
    const nx = x / width;
    const ny = y / height;

    const continental = fbm(noise1, nx * 3, ny * 3, 4, 2.0, 0.5);
    const mountain = fbm(noise2, nx * 5, ny * 5, 5, 2.1, 0.45);
    const local = fbm(noise3, nx * 10, ny * 10, 3, 2.0, 0.5);

    elevation[y][x] = continental * 0.55 + mountain * 0.30 + local * 0.15;
  });

  return elevation;
}

export function normalizeHeightmap(elevation: number[][]): void {
  const height = elevation.length;
  const width = elevation[0].length;
  let min = Infinity, max = -Infinity;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      min = Math.min(min, elevation[y][x]);
      max = Math.max(max, elevation[y][x]);
    }
  }
  const range = max - min || 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      elevation[y][x] = (elevation[y][x] - min) / range;
    }
  }
}

export function applyWorldShape(elevation: number[][], width: number, height: number, shape: StrategicGenConfig['worldShape']): void {
  switch (shape) {
    case 'peninsula':
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const nx = x / (width - 1);
          const ny = y / (height - 1);
          const centerBias = 1 - Math.abs(nx - 0.45) * 1.1;
          const southTaper = 1 - Math.max(0, ny - 0.55) * 0.9;
          elevation[y][x] += centerBias * southTaper * 0.18;
        }
      }
      break;
    case 'island':
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dx = Math.abs(x - width / 2) / (width / 2);
          const dy = Math.abs(y - height / 2) / (height / 2);
          const d = Math.sqrt(dx * dx + dy * dy);
          elevation[y][x] += (1 - Math.pow(d, 1.8)) * 0.35 - d * 0.25;
        }
      }
      break;
    case 'continent':
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const nx = x / (width - 1);
          const ny = y / (height - 1);
          const edgeDist = Math.min(nx, 1 - nx, ny, 1 - ny);
          elevation[y][x] += edgeDist * 0.15;
        }
      }
      break;
    case 'river_basin':
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const ny = y / (height - 1);
          const center = 1 - Math.abs(x / (width - 1) - 0.5) * 0.6;
          elevation[y][x] += center * 0.1 + ny * 0.08;
        }
      }
      break;
    case 'inland':
    default:
      break;
  }
}

export function computeSeaLevelByRatio(elevation: number[][], seaRatio: number): number {
  const height = elevation.length;
  const width = elevation[0].length;
  const all: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      all.push(elevation[y][x]);
    }
  }
  all.sort((a, b) => a - b);
  const idx = Math.floor(all.length * seaRatio);
  return all[Math.min(idx, all.length - 1)];
}
