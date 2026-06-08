// ===== 程序化地形生成系统 - 基于风蚀模拟 =====
//
// 本文件实现了一个完整的地形生成管线，包含以下阶段：
//   阶段1: 多倍频噪声基础高度图 (fBm)
//   阶段2: 风蚀模拟 (沙粒搬运 → 沙丘形成)
//   阶段3: 海平面与水域判定
//   阶段4: 河流生成 (最陡下降路径追踪)
//   阶段5: 湿度与生物群落分配
//   阶段6: 城市与基础设施放置
//   阶段7: 分层模板地形系统（多尺度蔓延式生成）
//
// 核心算法说明：
// - 噪声系统：基于改进型 Perlin 噪声（排列表梯度噪声），无外部依赖
// - 风蚀模拟：模拟风吹沙粒在地面上的沉积/侵蚀过程，形成垂直于风向的沙丘脊线
// - 所有随机过程均基于种子，保证可复现性

import { MapCell, TerrainType, Position } from './types';
import { TERRAIN_CONFIGS, MAP_WIDTH, MAP_HEIGHT } from './config';

// ============================================================
// 第一部分：配置接口与类型定义
// ============================================================

/** 程序化地图生成配置 */
export interface ProcGenConfig {
  seed: number;
  width: number;
  height: number;
  windDirection: number;
  windStrength: number;
  seaLevel?: number;
  numRivers: number;
  numCities: number;
  latitudeRange: { min: number; max: number };
}

/** 生成的地图数据结构 */
export interface GeneratedMap {
  heightmap: number[][];
  moisture: number[][];
  temperature: number[][];
  cells: MapCell[][];
  metadata: {
    seaLevel: number;
    windDir: number;
    cities: Position[];
    rivers: Position[][];
    biomeCounts: Record<TerrainType, number>;
  };
}

/** 默认配置 */
const DEFAULT_CONFIG: Required<Omit<ProcGenConfig, 'seaLevel'>> & { seaLevel: number | undefined } = {
  seed: 42,
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  windDirection: Math.PI * 0.25,
  windStrength: 0.6,
  seaLevel: undefined,
  numRivers: 2,
  numCities: 3,
  latitudeRange: { min: -60, max: 60 },
};

// ============================================================
// 第二部分：伪随机数生成器 (PRNG) - 基于种子可复现
// ============================================================

/**
 * Mulberry32 PRNG - 轻量快速伪随机数生成器
 * 使用32位整数运算，输出均匀分布于 [0, 1) 区间
 * 参考: https://gist.github.com/tommyettinger/46a87453324488318914309590d580f8
 */
class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** 返回 [0, 1) 范围的浮点数 */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 返回 [min, max) 范围的整数 */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /** 返回近似正态分布（Box-Muller简化版） */
  nextNormal(): number {
    const u1 = Math.max(this.next(), 1e-10);
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ============================================================
// 第三部分：Perlin 梯度噪声实现（自包含，无外部依赖）
// ============================================================

/**
 * 改进型 2D Perlin 噪声生成器
 *
 * 算法原理：
 * 1. 使用排列表 (permutation table) 将坐标映射到伪随机梯度向量
 * 2. 对每个网格单元的四个角计算梯度点积
 * 3. 使用平滑缓动函数 (fade/Smoothstep) 进行插值
 *
 * 排列表大小为 256，复制为 512 以避免取模操作时的边界问题
 * 梯度使用 12 个方向向量（单位圆上均匀分布）
 */

const PERM_SIZE = 256;
const GRADIENTS_2D: readonly [number, number][] = Object.freeze([
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 0.7], [-1, 0.7], [1, -0.7], [-1, -0.7],
]);

class PerlinNoise {
  private perm: Uint8Array;

  constructor(seed: number) {
    const rng = new SeededRNG(seed);
    this.perm = new Uint8Array(PERM_SIZE * 2);

    // Fisher-Yates 洗牌算法生成排列表
    const p = new Uint8Array(PERM_SIZE);
    for (let i = 0; i < PERM_SIZE; i++) p[i] = i;
    for (let i = PERM_SIZE - 1; i > 0; i--) {
      const j = rng.nextInt(0, i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }

    // 复制排列表以避免边界检查
    for (let i = 0; i < PERM_SIZE * 2; i++) {
      this.perm[i] = p[i & (PERM_SIZE - 1)];
    }
  }

  /**
   * 缓动函数 (Fade / Smoothstep): 6t^5 - 15t^4 + 10t^3
   * 使插值在网格边界处具有 C2 连续性（二阶导数连续）
   * 这保证了生成的噪声表面光滑无棱角
   */
  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  /** 线性插值 */
  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  /**
   * 计算梯度点积
   * hash 决定使用哪个梯度方向，然后与距离向量做点积
   * 点积结果表示该方向的"高度贡献"
   */
  private grad(hash: number, x: number, y: number): number {
    const g = GRADIENTS_2D[hash % 12];
    return g[0] * x + g[1] * y;
  }

  /**
   * 核心 2D Perlin 噪声函数
   *
   * 输入: (x, y) 连续坐标
   * 输出: [-1, 1] 范围的噪声值
   *
   * 算法步骤：
   * 1. 确定所在网格单元及其四个角点
   * 2. 对每个角点计算距离向量和梯度点积
   * 3. 用 fade 函数对两个轴分别插值
   * 4. 双线性插值得最终值
   */
  noise2D(x: number, y: number): number {
    // 确定网格单元左下角坐标（带小数部分的掩码）
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;

    // 单元格内的相对位置（小数部分）
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    // 缓动函数处理后的插值权重
    const u = this.fade(xf);
    const v = this.fade(yf);

    // 四个角点的哈希值（从排列表中查找）
    const aa = this.perm[this.perm[xi] + yi];
    const ab = this.perm[this.perm[xi] + yi + 1];
    const ba = this.perm[this.perm[xi + 1] + yi];
    const bb = this.perm[this.perm[xi + 1] + yi + 1];

    // 四个角点的梯度点积
    const n00 = this.grad(aa, xf, yf);
    const n01 = this.grad(ab, xf, yf - 1);
    const n10 = this.grad(ba, xf - 1, yf);
    const n11 = this.grad(bb, xf - 1, yf - 1);

    // 双线性插值
    const x1 = this.lerp(n00, n10, u);
    const x2 = this.lerp(n01, n11, u);
    return this.lerp(x1, x2, v);
  }

  /**
   * 分形布朗运动 (fractal Brownian motion, fBm)
   *
   * 通过叠加多个不同频率和振幅的倍频 (octave) 来产生更丰富的细节：
   *   result = Σ amplitude * noise(frequency * coord)
   *   其中 frequency 每层翻倍，amplitude 按 persistence 衰减
   *
   * 参数:
   *   octaves     - 叠加层数 (越多细节越丰富但计算越慢)
   *   persistence - 振幅衰减系数 (0.5 为标准值，越小越平滑)
   *   lacunarity  - 频率增长因子 (标准值为 2.0)
   *   scale       - 整体缩放因子（控制噪声的"波长"）
   *
   * 输出范围约为 [-1, 1]，实际因叠加可能略超
   */
  fbm(
    x: number,
    y: number,
    octaves: number = 6,
    persistence: number = 0.5,
    lacunarity: number = 2.0,
    scale: number = 0.05,
  ): number {
    let total = 0;
    let amplitude = 1;
    let maxValue = 0;
    let freqX = scale;
    let freqY = scale;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * freqX, y * freqY) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      freqX *= lacunarity;
      freqY *= lacunarity;
    }

    return total / maxValue;
  }
}

// ============================================================
// 第四部分：工具函数
// ============================================================

/** 创建空的二维数组 */
function create2DArray<T>(width: number, height: number, initializer: () => T): T[][] {
  const arr: T[][] = [];
  for (let z = 0; z < height; z++) {
    arr[z] = [];
    for (let x = 0; x < width; x++) {
      arr[z][x] = initializer();
    }
  }
  return arr;
}

/** 安全获取高度图值（越界返回极低值） */
function safeGet(heightmap: number[][], x: number, z: number, w: number, h: number): number {
  if (x < 0 || x >= w || z < 0 || z >= h) return -999;
  return heightmap[z][x];
}

/** 计算两点之间的欧几里得距离 */
function dist(a: Position, b: Position): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}

/** 曼哈顿距离（用于路径搜索中的代价估算） */
function manhattanDist(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/**
 * A* 寻路算法 - 使用 parentMap 用于正确回溯路径
 * 在网格地图上寻找从 start 到 goal 的最短路径，避开水域
 */
function findPathAStar(
  cells: MapCell[][],
  start: Position,
  goal: Position,
  width: number,
  height: number,
): Position[] {
  const key = (p: Position) => `${p.x},${p.z}`;
  const parentMap = new Map<string, string | null>();
  parentMap.set(key(start), null);

  const gScore = new Map<string, number>();
  gScore.set(key(start), 0);

  const openList: string[] = [key(start)];
  const closedSet = new Set<string>();

  while (openList.length > 0) {
    // 选 f 最小的节点 (f = g + h)
    openList.sort((a, b) => {
      const fa = (gScore.get(a) ?? Infinity) + manhattanDist(
        { x: parseInt(a.split(',')[0]), z: parseInt(a.split(',')[1]) }, goal
      );
      const fb = (gScore.get(b) ?? Infinity) + manhattanDist(
        { x: parseInt(b.split(',')[0]), z: parseInt(b.split(',')[1]) }, goal
      );
      return fa - fb;
    });

    const currentKey = openList.shift()!;
    const cx = parseInt(currentKey.split(',')[0]);
    const cz = parseInt(currentKey.split(',')[1]);

    if (cx === goal.x && cz === goal.z) {
      // 回溯构建路径
      const path: Position[] = [];
      let ck: string | null = currentKey;
      while (ck !== null) {
        const parts = ck.split(',');
        path.unshift({ x: parseInt(parts[0]), z: parseInt(parts[1]) });
        ck = parentMap.get(ck) ?? null;
      }
      return path;
    }

    closedSet.add(currentKey);

    const dirs = [
      { x: 0, z: -1 }, { x: 0, z: 1 },
      { x: -1, z: 0 }, { x: 1, z: 0 },
    ];

    for (const d of dirs) {
      const nx = cx + d.x;
      const nz = cz + d.z;
      if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;

      const nk = `${nx},${nz}`;
      if (closedSet.has(nk)) continue;

      const cell = cells[nz][nx];
      // 水域不可通行（除非是桥梁）
      if (cell.terrain === 'water') continue;

      const moveCost = cell.terrain === 'mountain' ? 5
        : cell.terrain === 'swamp' ? 4
        : cell.terrain === 'forest' ? 2
        : 1;
      const tentativeG = (gScore.get(currentKey) ?? 0) + moveCost;

      if (!gScore.has(nk) || tentativeG < (gScore.get(nk) ?? Infinity)) {
        parentMap.set(nk, currentKey);
        gScore.set(nk, tentativeG);
        if (!openList.includes(nk)) {
          openList.push(nk);
        }
      }
    }
  }

  return [];
}

// ============================================================
// 第五部分：核心地形生成管线
// ============================================================

/**
 * 阶段1: 基础高度图生成 - 使用分形布朗运动 (fBm)
 *
 * 算法原理：
 * - 对地图上每个格子采样多层 Perlin 噪声并叠加
 * - 低频噪声决定大尺度地貌（山脉走向、盆地位置）
 * - 高频噪声添加局部细节（丘陵起伏、地表纹理）
 * - 6 个倍频提供从大陆尺度到局部尺度的丰富层次
 *
 * @param noise - 已初始化的 Perlin 噪声生成器
 * @param config - 生成配置
 * @returns 二维高度数组，值大致在 [-1, 1] 范围
 */
function generateBaseHeightmap(noise: PerlinNoise, config: Required<ProcGenConfig>): number[][] {
  const { width, height, seed } = config;
  const heightmap = create2DArray(width, height, () => 0);

  // 主噪声参数：6 层倍频，persistence=0.5 保证各层能量均衡衰减
  const baseScale = Math.max(0.02, 3.0 / Math.max(width, height));
  // 尺寸自适应：大地图用更细的尺度，小地图用较粗的尺度

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      // 用 fBm 地形 - 控制整体地势
      let h = noise.fbm(x, z, 6, 0.5, 2.0, baseScale);

      // 加入第二层"扭曲"噪声，使地形更有自然感
      // 使用不同的偏移量避免与主噪声完全相关
      const warpX = x + noise.fbm(x + 100, z + 100, 3, 0.5, 2.0, baseScale * 2) * 3;
      const warpZ = z + noise.fbm(x + 200, z + 200, 3, 0.5, 2.0, baseScale * 2) * 3;
      h += noise.fbm(warpX, warpZ, 4, 0.35, 2.0, baseScale * 1.5) * 0.5;

      // 边缘渐变：让地图边缘略微降低，形成自然岛屿感
      const edgeFactorX = 1 - Math.pow(Math.abs(x - width / 2) / (width / 2), 2);
      const edgeFactorZ = 1 - Math.pow(Math.abs(z - height / 2) / (height / 2), 2);
      h *= edgeFactorX * edgeFactorZ * 0.5 + 0.5;

      heightmap[z][x] = h;
    }
  }

  return heightmap;
}

/**
 * 阶段2: 风蚀模拟 - 核心创新算法
 *
 * 物理模型灵感来源：
 * 风蚀是沙漠地貌形成的主要动力。当风吹过沙质地表时：
 * - 沙粒被风从迎风面吹起（侵蚀/起沙）
 * - 当风速减慢或遇到障碍物时沙粒沉积下来（堆积）
 * - 反复迭代后形成垂直于主导风向的沙丘脊线
 *
 * 算法步骤：
 * 1. 根据主导风向确定迎风边缘（粒子从此处生成）
 * 2. 每次迭代发射大量沙粒
 * 3. 沙粒沿风向移动，带有湍流扰动
 * 4. 碰撞检测：
 *    - 如果前方比当前位置高（上坡）→ 沉积一部分沙子
 *    - 如果当前位置是洼地（周围都比这里高）→ 侵蚀（带走沙子）
 *    - 坡度超过临界角时停止移动
 * 5. 迭代 50-80 次后可见明显沙丘形态
 *
 * @param heightmap - 输入/输出的高度图（就地修改）
 * @param config - 生成配置
 * @param rng - 随机数生成器
 */
function applyWindErosion(
  heightmap: number[][],
  config: Required<ProcGenConfig>,
  rng: SeededRNG,
): void {
  const { width, height, windDirection, windStrength } = config;

  // 风向向量（归一化）
  const windDx = Math.cos(windDirection);
  const windDz = Math.sin(windDirection);

  // 粒子系统参数
  const iterations = Math.max(40, Math.min(100, Math.round(width * height * 0.4)));
  // 迭代次数根据地图尺寸自适应：越大地图需要更多粒子
  const particlesPerIteration = Math.max(width, height) * 2;
  // 每次迭代的粒子数
  const sedimentRate = 0.003 * windStrength;
  // 沉积/侵蚀速率（乘以风力强度）
  const erosionRate = 0.002 * windStrength;
  // 最大侵蚀深度限制（防止出现深坑）
  const maxErosion = 0.15;
  const turbulence = 0.35;
  // 湍流强度（粒子轨迹偏离直线的程度）
  const slopeThreshold = 0.08;
  // 临界坡度角（超过此角度粒子停止）

  // 确定迎风边缘：粒子从风向的反方向边缘生成
  // 例如东风（windDir=0）时，粒子从西边（x=0）开始
  const spawnEdge: Array<{ x: number; z: number }> = [];

  if (Math.abs(windDx) > Math.abs(windDz)) {
    // 主要沿 X 方向
    const edgeX = windDx > 0 ? 0 : width - 1;
    for (let z = 0; z < height; z++) {
      spawnEdge.push({ x: edgeX, z });
    }
  } else {
    // 主要沿 Z 方向
    const edgeZ = windDz > 0 ? 0 : height - 1;
    for (let x = 0; x < width; x++) {
      spawnEdge.push({ x, z: edgeZ });
    }
  }

  // ========== 开始风蚀迭代 ==========
  for (let iter = 0; iter < iterations; iter++) {
    // 每次迭代中，风向有微小随机变化（模拟自然风的阵发性）
    const currentWindAngle = windDirection + (rng.next() - 0.5) * 0.3 * turbulence;
    const cdx = Math.cos(currentWindAngle);
    const cdz = Math.sin(currentWindAngle);

    for (let p = 0; p < particlesPerIteration; p++) {
      // 从迎风边缘随机选取起点
      const spawnPoint = spawnEdge[rng.nextInt(0, spawnEdge.length)];
      let px = spawnPoint.x + (rng.next() - 0.5) * 2;
      let pz = spawnPoint.z + (rng.next() - 0.5) * 2;

      // 粒子携带的沙量（初始为零，沿途可拾取或沉积）
      let sediment = 0;

      // 粒子最大寿命（防止无限循环）
      const maxSteps = Math.max(width, height) * 3;
      let step = 0;

      while (step < maxSteps) {
        // 边界检查
        if (px < 0.5 || px > width - 1.5 || pz < 0.5 || pz > height - 1.5) break;

        const ix = Math.round(px);
        const iz = Math.round(pz);
        if (ix < 0 || ix >= width || iz < 0 || iz >= height) break;

        const currentH = heightmap[iz][ix];

        // 计算粒子前进方向前方的地面高度
        const nextX = px + cdx;
        const nextZ = pz + cdz;
        const nix = Math.round(nextX);
        const niz = Math.round(nextZ);

        let frontH: number;
        if (nix < 0 || nix >= width || niz < 0 || niz >= height) {
          frontH = currentH - 0.1; // 出界视为下坡
        } else {
          frontH = heightmap[niz][nix];
        }

        // 计算坡度（前方高度 - 当前高度）
        const slope = frontH - currentH;

        // --- 沉积逻辑 ---
        // 上坡或平坡时：粒子携带的沙子会沉积一部分
        if (slope >= -0.001) {
          const depositAmount = sediment * sedimentRate * (1 + slope * 3);
          heightmap[iz][ix] += depositAmount;
          sediment -= depositAmount;
        }

        // --- 侵蚀逻辑 ---
        // 下坡且当前处于相对低洼处：粒子拾取沙子
        if (slope < -0.005 && sediment < 0.5) {
          // 检查周围是否确实更高（真正的洼地才侵蚀）
          let neighborSum = 0;
          let neighborCount = 0;
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dz === 0) continue;
              const nx = ix + dx, nz = iz + dz;
              if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
                neighborSum += heightmap[nz][nx];
                neighborCount++;
              }
            }
          }
          const avgNeighbor = neighborCount > 0 ? neighborSum / neighborCount : currentH;

          if (currentH > avgNeighbor - 0.02) {
            // 不是特别深的坑才允许侵蚀
            const erodeAmount = Math.min(erosionRate * (1 - sediment), maxErosion);
            // 侵蚀量随已有携沙量减少（饱和效应）
            heightmap[iz][ix] -= erodeAmount;
            sediment += erodeAmount;
          }
        }

        // --- 坡度终止检查 ---
        if (Math.abs(slope) > slopeThreshold) {
          // 坡度过陡，粒子在此停止并沉积剩余沙量
          heightmap[iz][ix] += sediment * 0.5;
          break;
        }

        // 移动粒子（加入湍流扰动）
        px += cdx + (rng.next() - 0.5) * turbulence;
        pz += cdz + (rng.next() - 0.5) * turbulence;
        step++;
      }

      // 如果粒子走到边界还没停，在最后位置沉积剩余沙量
      if (step >= maxSteps && sediment > 0.001) {
        const fx = Math.max(0, Math.min(width - 1, Math.round(px)));
        const fz = Math.max(0, Math.min(height - 1, Math.round(pz)));
        heightmap[fz][fx] += sediment * 0.3;
      }
    }
  }
}

/**
 * 阶段3: 海平面与水域判定
 *
 * 算法原理：
 * - 统计高度图的直方图分布
 * - 将海平面设在约28百分位附近（确保约28%的区域成为水域）
 * - 低于海平面的格子标记为水域
 * - 对海岸线应用轻微平滑以消除锯齿
 *
 * @param heightmap - 输入/输出的高度图
 * @param config - 生成配置
 * @returns 计算出的海平面高度值
 */
function applySeaLevel(
  heightmap: number[][],
  config: Required<ProcGenConfig>,
): number {
  const { width, height, seaLevel: forcedSeaLevel } = config;

  if (forcedSeaLevel !== undefined) {
    return forcedSeaLevel;
  }

  // 收集所有高度值用于统计
  const allHeights: number[] = [];
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      allHeights.push(heightmap[z][x]);
    }
  }
  allHeights.sort((a, b) => a - b);

  // 约28百分位作为海平面（确保约28%区域为水域）
  const percentileIndex = Math.floor(allHeights.length * 0.28);
  let seaLevel = allHeights[percentileIndex];

  // 微调：确保至少有一些水域（但不至于太多）
  // 同时确保海平面不会太高导致陆地太少
  const waterTargetRatio = 0.22 + (width * height < 200 ? 0.08 : 0);
  // 小地图稍微多给点水域比例

  // 应用海平面标记（后续在生物群落分配中使用）
  // 此处仅返回海平面值，实际的水域标记在阶段5中进行
  return seaLevel;
}

/**
 * 阶段4: 河流生成 - 最陡下降路径追踪
 *
 * 算法原理：
 * 1. 从地图上最高的非水域格子中选择源头
 * 2. 每一步移动到周围8方向中高度最低的邻居（最陡下降）
 * 3. 沿途雕刻河道（略微降低高度以形成明显的河谷）
 * 4. 河流到达水域或地图边缘后终止
 * 5. 多条河流之间保持最小间距
 *
 * @param heightmap - 输入/输出的高度图（河流沿线会被雕刻）
 * @param config - 生成配置
 * @param seaLevel - 当前海平面
 * @param rng - 随机数生成器
 * @returns 河流路径数组（每条河流是一组位置坐标）
 */
function generateRivers(
  heightmap: number[][],
  config: Required<ProcGenConfig>,
  seaLevel: number,
  rng: SeededRNG,
): Position[][] {
  const { width, height, numRivers } = config;
  const rivers: Position[][] = [];
  const riverCells = new Set<string>(); // 已被河流占用的格子
  // 收集所有可能的源头候选（高海拔非水域区域）
  const candidates: Array<{ x: number; z: number; h: number }> = [];
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (heightmap[z][x] > seaLevel + 0.1) {
        candidates.push({ x, z, h: heightmap[z][x] });
      }
    }
  }

  // 按高度降序排序
  candidates.sort((a, b) => b.h - a.h);

  // 河流间最小间距
  const minRiverSeparation = Math.max(3, Math.floor(Math.min(width, height) / 4));

  for (let r = 0; r < numRivers && candidates.length > 0; r++) {
    // 选择一个尚未被河流覆盖的高地源头
    let sourceIdx = -1;
    for (let i = 0; i < Math.min(candidates.length, 20); i++) {
      const c = candidates[i];
      let tooClose = false;
      for (const rc of Array.from(riverCells)) {
        const parts = rc.split(',');
        const rx = parseInt(parts[0]), rz = parseInt(parts[1]);
        if (Math.abs(c.x - rx) + Math.abs(c.z - rz) < minRiverSeparation) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        sourceIdx = i;
        break;
      }
    }

    if (sourceIdx < 0) continue; // 找不到合适的源头

    const source = candidates[sourceIdx];
    const riverPath: Position[] = [];
    let cx = source.x, cz = source.z;
    const visited = new Set<string>();
    const maxRiverLength = width + height;

    // 最陡下降追踪
    for (let step = 0; step < maxRiverLength; step++) {
      const ck = `${cx},${cz}`;
      if (visited.has(ck)) break; // 防止环路
      visited.add(ck);
      riverPath.push({ x: cx, z: cz });
      riverCells.add(ck);

      // 到达水域则终止
      if (heightmap[cz][cx] <= seaLevel) break;

      // 查找最陡下降方向（8邻域）
      let bestDir = -1;
      let bestDrop = 0;
      const dirs8 = [
        { x: -1, z: -1 }, { x: 0, z: -1 }, { x: 1, z: -1 },
        { x: -1, z: 0 },                    { x: 1, z: 0 },
        { x: -1, z: 1 },  { x: 0, z: 1 },  { x: 1, z: 1 },
      ];
      for (let di = 0; di < 8; di++) {
        const nx = cx + dirs8[di].x;
        const nz = cz + dirs8[di].z;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
        const drop = heightmap[cz][cx] - heightmap[nz][nx];
        if (drop > bestDrop) {
          bestDrop = drop;
          bestDir = di;
        }
      }

      if (bestDir < 0) break; // 已经在局部最低点
      cx += dirs8[bestDir].x;
      cz += dirs8[bestDir].z;
    }

    if (riverPath.length >= 3) {
      rivers.push(riverPath);

      // 沿河流路径雕刻河道（降低高度形成河谷）
      const channelDepth = 0.04;
      for (const pos of riverPath) {
        heightmap[pos.z][pos.x] -= channelDepth;
        // 河道两侧也略微降低（河岸效果）
        for (const d of [
          { x: -1, z: 0 }, { x: 1, z: 0 },
          { x: 0, z: -1 }, { x: 0, z: 1 },
        ]) {
          const nx = pos.x + d.x, nz = pos.z + d.z;
          if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
            heightmap[nz][nx] -= channelDepth * 0.3;
          }
        }
      }
    }
  }

  return rivers;
}

/**
 * 阶段5: 湿度、温度计算与生物群落分配
 *
 * 湿度模型：
 * - 基于到最近水域的距离（越近越湿润）
 * - 河流沿线湿度额外提升
 * - 形成从海岸/河岸向内陆递减的湿度场
 *
 * 温度模型：
 * - 基于纬度（z 坐标映射到 config.latitudeRange）
 * - 中纬度最温暖，两极寒冷（简化模型）
 * - 海拔越高温度越低（绝热降温率 ~0.006/米）
 *
 * 生物群落规则（高度 + 湿度 + 温度 → TerrainType）：
 *   水面以下         → water
 *   极高海拔         → mountain
 *   高海拔           → mountain / rocky
 *   低海拔+干燥      → desert / plains
 *   低海拔+潮湿      → forest
 *   近水+平坦+低海拔 → swamp
 *   近水+平坦+中等   → city (候补)
 *   其他             → plains
 *
 * @param heightmap - 最终高度图
 * @param config - 生成配置
 * @param seaLevel - 海平面
 * @param rivers - 河流路径数据
 * @param rng - 随机数生成器
 * @returns 包含湿度、温度和最终单元格数据的对象
 */
function assignBiomes(
  heightmap: number[][],
  config: Required<ProcGenConfig>,
  seaLevel: number,
  rivers: Position[][],
  rng: SeededRNG,
): {
  moisture: number[][];
  temperature: number[][];
  cells: MapCell[][];
  biomeCounts: Record<TerrainType, number>;
} {
  const { width, height, latitudeRange } = config;
  const moisture = create2DArray(width, height, () => 0);
  const temperature = create2DArray(width, height, () => 0);
  const biomeCounts: Record<string, number> = {
    plains: 0, forest: 0, mountain: 0, water: 0,
    city: 0, road: 0, swamp: 0, desert: 0, fortress: 0, bridge: 0,
  };

  // ---- 步骤A: 计算湿度场 ----
  // 先标记所有水域格子
  const isWater = create2DArray(width, height, () => false);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      isWater[z][x] = heightmap[z][x] <= seaLevel;
    }
  }

  // BFS 计算每个格子到最近水域的距离
  const distToWater = create2DArray(width, height, () => Infinity);
  const queue: Array<{ x: number; z: number; d: number }> = [];

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (isWater[z][x]) {
        distToWater[z][x] = 0;
        queue.push({ x, z, d: 0 });
      }
    }
  }

  // 多源 BFS
  let qi = 0;
  while (qi < queue.length) {
    const curr = queue[qi++];
    for (const d of [
      { x: -1, z: 0 }, { x: 1, z: 0 },
      { x: 0, z: -1 }, { x: 0, z: 1 },
    ]) {
      const nx = curr.x + d.x, nz = curr.z + d.z;
      if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
        if (distToWater[nz][nx] > curr.d + 1) {
          distToWater[nz][nx] = curr.d + 1;
          queue.push({ x: nx, z: nz, d: curr.d + 1 });
        }
      }
    }
  }

  // 距离转湿度：指数衰减，距离越远湿度越低
  const maxDist = Math.max(width, height);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      let m = Math.exp(-distToWater[z][x] / (maxDist * 0.35));
      // 河流沿线湿度加成
      for (const river of rivers) {
        for (const rp of river) {
          if (rp.x === x && rp.z === z) {
            m = Math.min(1, m + 0.35);
            break;
          }
        }
        // 河流旁边也加一点
        for (const rp of river) {
          if (Math.abs(rp.x - x) + Math.abs(rp.z - z) <= 1) {
            m = Math.min(1, m + 0.12);
          }
        }
      }
      moisture[z][x] = Math.max(0, Math.min(1, m));
    }
  }

  // ---- 步骤B: 计算温度场 ----
  // 纬度映射：z=0 → latitudeRange.min, z=height-1 → latitudeRange.max
  for (let z = 0; z < height; z++) {
    const latFrac = z / (height - 1); // 0 → 1
    const lat = latitudeRange.min + latFrac * (latitudeRange.max - latitudeRange.min);
    // 简化的温度模型：赤道最热，两极冷
    // 使用余弦模拟纬度-温度关系
    const latTemp = Math.cos((lat * Math.PI) / 90); // -60~60 度映射到 cos
    for (let x = 0; x < width; x++) {
      // 海拔降温：每单位高度降低温度
      const elevation = heightmap[z][x];
      const elevFactor = Math.max(0.3, 1 - elevation * 0.4);
      temperature[z][x] = latTemp * elevFactor;
    }
  }

  // ---- 步骤C: 分配生物群落 ----
  const cells: MapCell[][] = create2DArray(width, height, (): MapCell => ({
    position: { x: 0, z: 0 },
    terrain: 'plains',
    unit: null,
    fortified: false,
    capturePointId: null,
  }));

  // 统计高度信息用于阈值设定
  let hMin = Infinity, hMax = -Infinity;
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (heightmap[z][x] > seaLevel) {
        hMin = Math.min(hMin, heightmap[z][x]);
        hMax = Math.max(hMax, heightmap[z][x]);
      }
    }
  }
  const hRange = hMax - hMin;
  const highAltitudeThreshold = hMin + hRange * 0.65;
  // 高于65%范围的算高山
  const midAltitudeThreshold = hMin + hRange * 0.35;

  // 河流格子集合（用于快速查找）
  const riverCellSet = new Set<string>();
  for (const river of rivers) {
    for (const rp of river) {
      riverCellSet.add(`${rp.x},${rp.z}`);
    }
  }

  // 局部平坦度预计算（用于城市/沼泽判定）
  const localVariance = create2DArray(width, height, () => 0);
  const varRadius = 1;
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, sumSq = 0, count = 0;
      for (let dz = -varRadius; dz <= varRadius; dz++) {
        for (let dx = -varRadius; dx <= varRadius; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
            const v = heightmap[nz][nx];
            sum += v;
            sumSq += v * v;
            count++;
          }
        }
      }
      if (count > 0) {
        const mean = sum / count;
        localVariance[z][x] = Math.sqrt(sumSq / count - mean * mean);
      }
    }
  }

  // 生物群落分配核心逻辑
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const h = heightmap[z][x];
      const m = moisture[z][x];
      const t = temperature[z][x];
      const lv = localVariance[z][x];
      const dw = distToWater[z][x];
      const isRiverHere = riverCellSet.has(`${x},${z}`);

      let terrain: TerrainType;

      if (h <= seaLevel) {
        // 水面以下 → 水域
        terrain = 'water';
      } else if (h > highAltitudeThreshold) {
        // 高海拔 → 山地
        terrain = 'mountain';
      } else if (h > midAltitudeThreshold && m < 0.35) {
        // 中高海拔 + 干燥 → 山地（干旱高地）
        terrain = 'mountain';
      } else if (isRiverHere) {
        // 河流经过 → 平原（河道本身不单独显示为特殊地形，
        // 但在渲染时可以画河流纹理；这里用平原表示可通过的河道区域）
        terrain = 'plains';
      } else if (lv < 0.03 && dw <= 1 && m > 0.7 && h < midAltitudeThreshold * 0.6) {
        // 非常平坦 + 非常近水(1格内) + 非常潮湿 + 很低海拔 → 沼泽（严格条件）
        terrain = 'swamp';
      } else if (m < 0.22 && h < midAltitudeThreshold) {
        // 干燥 + 低海拔 → 沙漠
        terrain = 'desert';
      } else if (m > 0.45 && h < midAltitudeThreshold && t > -0.1) {
        // 潮湿 + 低海拔 + 温暖 → 森林
        terrain = 'forest';
      } else if (m > 0.6 && lv < 0.1 && dw <= 4 && h < midAltitudeThreshold) {
        // 很湿 + 很平坦 + 近水 → 候选城市位置（先标为平原，后面替换）
        terrain = 'plains'; // 城市在阶段6中放置
      } else {
        // 默认 → 平原
        terrain = 'plains';
      }

      cells[z][x] = {
        position: { x, z },
        terrain,
        unit: null,
        fortified: false,
        capturePointId: null,
      };
      biomeCounts[terrain]++;
    }
  }

  // 沼泽全局上限：如果沼泽数量超过总格子的5%，随机将多余的沼泽转为平原
  const totalCells = width * height;
  const maxSwamp = Math.floor(totalCells * 0.05);
  let swampCount = biomeCounts['swamp'] ?? 0;
  if (swampCount > maxSwamp) {
    const excessSwamp = swampCount - maxSwamp;
    const swampPositions: Array<{ x: number; z: number }> = [];
    for (let z = 0; z < height; z++)
      for (let x = 0; x < width; x++)
        if (cells[z][x].terrain === 'swamp')
          swampPositions.push({ x, z });
    for (let i = 0; i < excessSwamp && i < swampPositions.length; i++) {
      const swapIdx = rng.nextInt(i, swampPositions.length);
      [swampPositions[i], swampPositions[swapIdx]] = [swampPositions[swapIdx], swampPositions[i]];
      const pos = swampPositions[i];
      cells[pos.z][pos.x].terrain = 'plains';
      biomeCounts['swamp']--;
      biomeCounts['plains']++;
    }
  }

  return { moisture, temperature, cells, biomeCounts: biomeCounts as Record<TerrainType, number> };
}

/**
 * 阶段6: 城市与基础设施放置
 *
 * 城市选址规则（综合考虑战略性和合理性）：
 * 1. 地形平坦（局部方差低于阈值）
 * 2. 靠近水源（距水域/河流 3-5 格以内）
 * 3. 不在水面上
 * 4. 不太靠近地图边缘（留出部署缓冲区）
 * 5. 城市之间至少相隔一定距离
 *
 * 公路生成：
 * - 使用改进 A* 算法连接所有城市对
 * - 路径上的格子标记为 road
 * - 遇到水域时自动放 bridge
 *
 * 要塞放置：
 * - 在城市附近的制高点（高地格子上）
 * - 提供防御加成的战略要点
 *
 * @param cells - 输入/输出的地图格子数组
 * @param heightmap - 高度图
 * @param moisture - 湿度图
 * @param config - 生成配置
 * @param rng - 随机数生成器
 * @returns 城市位置列表
 */
function placeCitiesAndInfrastructure(
  cells: MapCell[][],
  heightmap: number[][],
  moisture: number[][],
  config: Required<ProcGenConfig>,
  rng: SeededRNG,
): Position[] {
  const { width, height, numCities, windDirection } = config;
  const cities: Position[] = [];
  const deploymentBuffer = 2; // 边缘部署缓冲区
  // 预计算局部平坦度（同阶段5的计算）
  const localVariance = create2DArray(width, height, () => 0);
  const varRadius = 1;
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, sumSq = 0, count = 0;
      for (let dz = -varRadius; dz <= varRadius; dz++) {
        for (let dx = -varRadius; dx <= varRadius; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
            const v = heightmap[nz][nx];
            sum += v;
            sumSq += v * v;
            count++;
          }
        }
      }
      if (count > 0) {
        const mean = sum / count;
        localVariance[z][x] = Math.sqrt(sumSq / count - mean * mean);
      }
    }
  }

  // 计算到水域的距离（复用概念）
  const nearWater = create2DArray(width, height, () => false);
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (cells[z][x].terrain === 'water') {
        for (let dz = -5; dz <= 5; dz++) {
          for (let dx = -5; dx <= 5; dx++) {
            const nx = x + dx, nz = z + dz;
            if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
              const d = Math.abs(dx) + Math.abs(dz);
              if (d >= 2 && d <= 5) {
                nearWater[nz][nx] = true;
              }
            }
          }
        }
      }
    }
  }

  // 收集所有符合条件的城市候选点
  const cityCandidates: Array<{
    x: number; z: number;
    score: number;
    variance: number;
    moist: number;
  }> = [];

  const flatThreshold = 0.07; // 平坦度阈值
  for (let z = deploymentBuffer; z < height - deploymentBuffer; z++) {
    for (let x = deploymentBuffer; x < width - deploymentBuffer; x++) {
      if (cells[z][x].terrain === 'water') continue;
      if (cells[z][x].terrain === 'mountain') continue;
      if (localVariance[z][x] > flatThreshold) continue; // 不够平坦

      // 评分：综合平坦度、近水性、中心度
      const flatScore = 1 - localVariance[z][x] / flatThreshold;
      const waterScore = nearWater[z][x] ? 1.0 : Math.max(0, 0.5 - moisture[z][x] * 0.5);
      // 不太干也不太湿的地方更适合建城
      const centerScore = 1 - (Math.abs(x - width / 2) + Math.abs(z - height / 2)) /
        ((width + height) / 2);

      const score = flatScore * 3 + waterScore * 2 + centerScore * 1;

      cityCandidates.push({
        x, z,
        score,
        variance: localVariance[z][x],
        moist: moisture[z][x],
      });
    }
  }

  // 按评分降序排序
  cityCandidates.sort((a, b) => b.score - a.score);

  // 选择城市位置（保证间距）
  const minCitySeparation = Math.max(3, Math.floor(Math.min(width, height) / 5));
  for (const candidate of cityCandidates) {
    if (cities.length >= numCities) break;

    let tooClose = false;
    for (const city of cities) {
      if (manhattanDist(candidate, city) < minCitySeparation) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) {
      cities.push({ x: candidate.x, z: candidate.z });
      cells[candidate.z][candidate.x].terrain = 'city';
    }
  }

  // --- 公路连接（城市之间修建道路）---
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      // 只连接相邻城市（不完全图，避免道路过多）
      // 使用简单的就近连接策略
      const path = findPathAStar(cells, cities[i], cities[j], width, height);
      if (path.length > 0) {
        for (const pos of path) {
          const cell = cells[pos.z][pos.x];
          // 道路覆盖平原、沙漠等平坦地形，不覆盖城市/要塞/森林/山地/沼泽
          if (cell.terrain === 'plains' || cell.terrain === 'desert') {
            cell.terrain = 'road';
          } else if (cell.terrain === 'water') {
            // 需要架桥
            cell.terrain = 'bridge';
          }
          // 其他地形（森林、山地、沼泽、城市、要塞）保留原样，道路绕行
        }
      }
    }
  }

  // --- 要塞放置（在城市附近的高地上）---
  const fortressCount = Math.min(cities.length, Math.max(1, Math.floor(numCities / 2)));
  let placedFortresses = 0;

  for (const city of cities) {
    if (placedFortresses >= fortressCount) break;

    // 在城市周围搜索最高点
    let bestFortPos: Position | null = null;
    let bestFortHeight = -Infinity;
    const searchRadius = Math.min(5, Math.floor(Math.min(width, height) / 4));

    for (let dz = -searchRadius; dz <= searchRadius; dz++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const fx = city.x + dx, fz = city.z + dz;
        if (fx < 0 || fx >= width || fz < 0 || fz >= height) continue;
        if (cells[fz][fx].terrain === 'water') continue;
        if (cells[fz][fx].terrain === 'city') continue;
        // 不要放在其他要塞上
        if (cells[fz][fx].terrain === 'fortress') continue;

        if (heightmap[fz][fx] > bestFortHeight) {
          bestFortHeight = heightmap[fz][fx];
          bestFortPos = { x: fx, z: fz };
        }
      }
    }

    if (bestFortPos && heightmap[bestFortPos.z][bestFortPos.x] > midHeight(heightmap, width, height)) {
      cells[bestFortPos.z][bestFortPos.x].terrain = 'fortress';
      placedFortresses++;
    }
  }

  return cities;
}

/** 计算高度图中位数（用于要塞放置的高度判断） */
function midHeight(heightmap: number[][], width: number, height: number): number {
  const vals: number[] = [];
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      vals.push(heightmap[z][x]);
    }
  }
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

// ============================================================
// 第六部分：边缘列强制通行处理
// ============================================================

/**
 * 确保地图边缘列（部署区）是可通行的
 *
 * 游戏机制要求：红方从左侧边缘（列0,1）部署，蓝方从右侧边缘（列width-2,width-1）部署
 * 因此这些列必须是非水域的可通行地形
 *
 * 处理策略：
 * - 水域 → 替换为平原
 * - 山地 → 替换为平原（车辆需能通过部署区）
 * - 沼泽 → 替换为平原
 */
function ensureEdgePassable(cells: MapCell[][], width: number, height: number): void {
  const impassable: TerrainType[] = ['water', 'mountain', 'swamp'];
  for (let z = 0; z < height; z++) {
    // 左侧部署区（列0 ~ 列1）
    for (let x = 0; x <= 1; x++) {
      if (impassable.includes(cells[z][x].terrain)) {
        cells[z][x].terrain = 'plains';
      }
    }
    // 右侧部署区（列width-2 ~ 列width-1）
    for (let x = width - 2; x <= width - 1; x++) {
      if (impassable.includes(cells[z][x].terrain)) {
        cells[z][x].terrain = 'plains';
      }
    }
  }
}

// ============================================================
// 第七部分：主入口函数
// ============================================================

/**
 * 生成程序化地图 - 主入口函数
 *
 * 完整执行上述全部7个阶段的生成管线：
 * 1. 初始化噪声生成器和随机数生成器
 * 2. 生成基础高度图 (fBm)
 * 3. 应用风蚀模拟
 * 4. 计算海平面
 * 5. 生成河流
 * 6. 分配生物群落
 * 7. 放置城市和基础设施
 * 8. 确保边缘可通行
 *
 * @param partialConfig - 部分配置（未提供的字段使用默认值）
 * @returns 完整的生成地图数据
 *
 * @example
 * // 生成默认大小的战术地图
 * const map = generateProceduralMap({ seed: 12345 });
 *
 * // 生成大型战略地图
 * const bigMap = generateProceduralMap({
 *   seed: 999,
 *   width: 64,
 *   height: 48,
 *   numCities: 5,
 *   numRivers: 3,
 *   windDirection: Math.PI * 0.75, // 北偏东风
 *   windStrength: 0.8,
 * });
 */
export function generateProceduralMap(partialConfig: Partial<ProcGenConfig> = {}): GeneratedMap {
  // 合并默认配置与用户配置
  const config: Required<ProcGenConfig> = {
    ...DEFAULT_CONFIG,
    ...partialConfig,
    seaLevel: partialConfig.seaLevel ?? DEFAULT_CONFIG.seaLevel,
  } as Required<ProcGenConfig>;

  const { width, height, seed } = config;

  // 初始化随机系统（使用不同种子避免相关性）
  const noise = new PerlinNoise(seed);
  const rng = new SeededRNG(seed + 7919); // 大质数偏移
  console.log(`[ProcGen] 开始生成地图 ${width}x${height}, 种子=${seed}, 风向=${(config.windDirection * 180 / Math.PI).toFixed(1)}°`);

  // ===== 阶段1: 基础高度图 =====
  let heightmap = generateBaseHeightmap(noise, config);

  // ===== 阶段2: 风蚀模拟 =====
  applyWindErosion(heightmap, config, rng);

  // ===== 阶段3: 海平面计算 =====
  const seaLevel = applySeaLevel(heightmap, config);

  // ===== 阶段4: 河流生成 =====
  const rivers = generateRivers(heightmap, config, seaLevel, rng);

  // ===== 阶段5: 生物群落分配 =====
  const { moisture, temperature, cells, biomeCounts } = assignBiomes(heightmap, config, seaLevel, rivers, rng);

  // ===== 阶段6: 城市与基础设施 =====
  const cities = placeCitiesAndInfrastructure(cells, heightmap, moisture, config, rng);

  // ===== 后处理: 确保边缘列可通行 =====
  ensureEdgePassable(cells, width, height);

  // 更新生物群落计数（因为城市/道路/要塞可能改变了类型）
  const finalBiomeCounts: Record<TerrainType, number> = {
    plains: 0, forest: 0, mountain: 0, water: 0,
    city: 0, road: 0, swamp: 0, desert: 0, fortress: 0, bridge: 0,
  };
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      finalBiomeCounts[cells[z][x].terrain]++;
    }
  }

  console.log(`[ProcGen] 地图生成完成 - 城市:${cities.length}条, 河流:${rivers.length}条`, finalBiomeCounts);

  return {
    heightmap,
    moisture,
    temperature,
    cells,
    metadata: {
      seaLevel,
      windDir: config.windDirection,
      cities,
      rivers,
      biomeCounts: finalBiomeCounts,
    },
  };
}

// ============================================================
// 第八部分：子区域提取（用于战略模式的大地图）
// ============================================================

/**
 * 从大地图中提取子区域
 *
 * 战术模式使用较小的地图（如16x12），而战略模式可能使用更大的世界地图（如64x48）。
 * 此函数允许从一个大的程序化地图中裁剪出一个矩形子区域，用于战术战斗。
 *
 * 处理要点：
 * - 直接截取指定区域的单元格
 * - 保持原始的位置坐标不变（或可选择性地重新编号）
 * - 截取的数据完全兼容 GameMap 格式
 *
 * @param fullMap - 由 generateProceduralMap 生成的大地图
 * @param regionX - 子区域左上角 X 坐标
 * @param regionZ - 子区域左上角 Z 坐标
 * @param w - 子区域宽度
 * @param h - 子区域高度
 * @returns 截取后的 MapCell 二维数组
 *
 * @example
 * // 生成 64x48 的战略地图
 * const worldMap = generateProceduralMap({ seed: 42, width: 64, height: 48 });
 *
 * // 从其中提取一个 16x12 区域用于战术战斗
 * const tacticalRegion = extractSubRegion(worldMap, 10, 5, 16, 12);
 */
export function extractSubRegion(
  fullMap: GeneratedMap,
  regionX: number,
  regionZ: number,
  w: number,
  h: number,
): MapCell[][] {
  const fw = fullMap.cells[0]?.length ?? 0;
  const fh = fullMap.cells.length;

  // 边界安全检查
  if (regionX < 0 || regionZ < 0 || regionX + w > fw || regionZ + h > fh) {
    throw new Error(
      `[ProcGen] 子区域越界: 请求(${regionX},${regionZ})+(${w}x${h}), ` +
      `地图大小${fw}x${fh}`
    );
  }

  const subCells: MapCell[][] = [];
  for (let z = regionZ; z < regionZ + h; z++) {
    const row: MapCell[] = [];
    for (let x = regionX; x < regionX + w; x++) {
      row.push({ ...fullMap.cells[z][x] });
    }
    subCells.push(row);
  }

  return subCells;
}

// ============================================================
// 第九部分：辅助导出 - 快捷生成函数
// ============================================================

/**
 * 快速生成战术地图（16x12，游戏默认尺寸）
 * 封装常用配置，方便直接调用
 */
export function generateTacticalMap(seed?: number): GeneratedMap {
  return generateProceduralMap({
    seed: seed ?? Math.floor(Math.random() * 100000),
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    windDirection: (Math.random() - 0.5) * Math.PI,
    windStrength: 0.5 + Math.random() * 0.4,
    numRivers: 2,
    numCities: 3,
  });
}

/**
 * 快速生成战略地图（64x48 或更大）
 * 适用于战略层面的世界地图展示
 */
export function generateStrategicMap(seed?: number, size: 'medium' | 'large' = 'medium'): GeneratedMap {
  const sizes = {
    medium: { width: 48, height: 36, cities: 5, rivers: 3 },
    large: { width: 96, height: 72, cities: 8, rivers: 5 },
  };
  const s = sizes[size];
  return generateProceduralMap({
    seed: seed ?? Math.floor(Math.random() * 100000),
    width: s.width,
    height: s.height,
    windDirection: (Math.random() - 0.5) * Math.PI * 0.8,
    windStrength: 0.6 + Math.random() * 0.3,
    numRivers: s.rivers,
    numCities: s.cities,
    latitudeRange: { min: -50, max: 50 },
  });
}

// ============================================================
// 第十部分：分层/多尺度地形生成系统（Hierarchical Terrain Generation）
// ============================================================
//
// 核心思想：
//   将大地图划分为宏观模板格子（macro grid），每个格子使用预定义的地形模板填充。
//   模板是 NxN 的地形图案，描述了特定地貌类型的微观结构。
//   通过噪声驱动的宏观分配 + 模板微观生成，实现从战略到战术的多尺度一致性。
//
// 系统组成：
//   1. TemplateType - 模板类型枚举（27种地形模板）
//   2. TemplateDef   - 模板定义（尺寸、权重、约束、生成函数）
//   3. 宏观分配算法 - 基于BFS蔓延式扩散的加权随机选择 + 邻域连通性感知
//   4. 微观展开算法 - 将每个宏格子的模板展开为实际地形网格
//   5. 边缘通行处理 - 确保部署区可通行

// ---------- 10.1 模板类型定义 ----------

/** 地形模板类型 - 每种类型代表一种特定的地貌模式 */
export type TemplateType =
  | 'city_block'       // 城市街区 - 建筑群与街道网格
  | 'forest_road'      // 森林公路 - 稠密森林+穿越公路
  | 'forest_rail'      // 森林铁路 - 森林+铁路线
  | 'industrial_zone'  // 工业区 - 工厂+仓库+铁路+道路
  | 'farmland'         // 农田 - 规则农田块+灌溉渠
  | 'dense_forest'     // 密林 - 纯森林，可能有小空地
  | 'mountain_range'   // 山脉 - 连绵山地+山谷通道
  | 'river_delta'      // 河口三角洲 - 水网+湿地
  | 'coastal_city'     // 沿海城市 - 城市+港口+海滩
  | 'desert_oasis'     // 沙漠绿洲 - 沙漠中心绿洲+植被
  | 'plains_village'   // 平原村庄 - 平原散布房屋+农田
  | 'swamp_wetland'    // 沼泽湿地 - 大片沼泽+少量高地
  | 'fortress_hill'    // 要塞山丘 - 高地要塞+周边防御地形
  | 'crossroads'       // 十字路口 - 道路交汇枢纽
  | 'open_plains'      // 开阔平原 - 纯平原草地
  | 'highway_intersection'  // 高速公路互通立交
  | 'military_base'         // 军事基地（营房+操场+围墙）
  | 'port_dock'             // 港口码头（泊位+仓库+道路）
  | 'mining_town'           // 矿业小镇（山脉+矿区建筑）
  | 'orchard'               // 果园（规则排列的树木+小路）
  | 'ancient_ruins'         // 古代遗迹（废墟散布+森林）
  | 'airfield'              // 机场跑道（长跑道+建筑群）
  | 'power_plant'           // 发电站（大型设施+输电线路）
  | 'suburban'              // 郊区住宅（房屋+花园+弯曲道路）
  | 'lake_shore'            // 湖岸（湖泊+沙滩+度假设施）
  | 'canyon'                // 峡谷（深谷+河流+陡壁）
  | 'railway_junction';      // 铁路枢纽（多条铁路交汇+车站）

// ---------- 10.2 模板接口与配置接口 ----------

/** 模板地形放置约束条件 */
interface TerrainRequirements {
  minHeight?: number;   // 最低高度要求（归一化 0~1）
  maxHeight?: number;   // 最高高度要求
  minMoisture?: number; // 最低湿度要求（归一化 0~1）
  maxMoisture?: number; // 最高湿度要求
  nearWater?: boolean;  // 是否需要靠近水源
  nearCity?: boolean;   // 是否需要靠近城市类模板
}

/** 地形模板定义 */
interface TemplateDef {
  size: number;                                    // 模板网格尺寸 (N x N)
  weight: number;                                  // 基础概率权重（宏观分配时使用）
  terrainRequirements: TerrainRequirements;         // 放置约束
  generate(rng: SeededRNG, macroX: number, macroZ: number, neighbors: TemplateType[]): TerrainType[][];
}

/** 分层地图生成配置 */
export interface HierarchicalConfig {
  seed: number;
  macroWidth: number;      // 宏观地图宽度（模板格子数）
  macroHeight: number;     // 宏观地图高度（模板格子数）
  windDirection?: number;  // 风向（影响某些模板的方向性）
  forcedTemplates?: Array<{ x: number; z: number; type: TemplateType }>; // 强制指定位置的模板
}

/** 分层地图生成结果 */
export interface HierarchicalMap {
  cells: MapCell[][];                          // 微观最终地形
  macroGrid: TemplateType[][];                 // 宏观模板分配
  /** 跟踪每个宏观格子的实际像素边界（用于点击缩放）*/
  macroBounds: Array<{ x: number; z: number; width: number; height: number; type: TemplateType }>;
  width: number;                               // 最终宽度（由各模板尺寸动态决定）
  height: number;                              // 最终高度（由各模板尺寸动态决定）
  metadata: {
    templateCounts: Record<TemplateType, number>;  // 各模板使用次数统计
    biomeCounts: Record<TerrainType, number>;     // 各地形类型数量统计
  };
}

// ---------- 10.3 图案旋转/镜像工具函数 ----------

/** 旋转方向枚举 */
type Rotation = 0 | 1 | 2 | 3; // 0=0°, 1=90°, 2=180°, 3=270°

/**
 * 对二维数组进行旋转操作
 * @param grid 原始二维数组
 * @param rot 旋转次数（每次90度顺时针）
 * @returns 旋转后的新数组
 */
function rotateGrid<T>(grid: T[][], rot: Rotation): T[][] {
  const h = grid.length;
  const w = grid[0].length;
  if (rot === 0) return grid.map(row => [...row]);
  if (rot === 2) {
    return grid.map((row, z) => row.map((_, x) => grid[h - 1 - z][w - 1 - x]));
  }
  if (rot === 1) {
    const result: T[][] = [];
    for (let x = 0; x < w; x++) {
      result[x] = [];
      for (let z = h - 1; z >= 0; z--) {
        result[x].push(grid[z][x]);
      }
    }
    return result;
  }
  // rot === 3 (270° = 逆时针90°)
  const result: T[][] = [];
  for (let x = w - 1; x >= 0; x--) {
    result[w - 1 - x] = [];
    for (let z = 0; z < h; z++) {
      result[w - 1 - x].push(grid[z][x]);
    }
  }
  return result;
}

/** 对二维数组进行水平镜像翻转 */
function mirrorHorizontal<T>(grid: T[][]): T[][] {
  return grid.map(row => [...row].reverse());
}

/** 对二维数组进行垂直镜像翻转 */
function mirrorVertical<T>(grid: T[][]): T[][] {
  return [...grid].reverse();
}

// ---------- 10.4 模板实现 ----------

const TEMPLATE_REGISTRY: Record<TemplateType, TemplateDef> = {

  // ===== city_block: 城市街区 (8x8) =====
  city_block: {
    size: 8,
    weight: 10,
    terrainRequirements: { minMoisture: 0.2, maxMoisture: 0.7, nearCity: true },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('plains'));
      const basePattern: TerrainType[][] = [
        ['road','road','road','road','road','road','road','road'],
        ['road','city','city','city','road','city','city','road'],
        ['road','city','road','city','road','city','road','road'],
        ['road','city','city','city','road','city','city','road'],
        ['road','city','road','city','road','city','road','road'],
        ['road','city','city','city','road','city','city','road'],
        ['road','city','road','city','road','city','road','road'],
        ['road','road','road','road','road','road','road','road'],
      ];
      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          g[z][x] = basePattern[z][x];

      const rot = rng.nextInt(0, 4) as Rotation;
      let result = rotateGrid(g, rot);
      if (rng.next() > 0.6) result = mirrorHorizontal(result);

      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (result[z][x] === 'city' && rng.next() < 0.08) {
            result[z][x] = rng.next() < 0.6 ? 'city' : 'plains';
          }
          if (result[z][x] === 'plains' && rng.next() < 0.05) {
            result[z][x] = 'forest';
          }
        }
      }
      return result;
    },
  },

  // ===== forest_road: 森林公路 (6x6) =====
  forest_road: {
    size: 6,
    weight: 12,
    terrainRequirements: { minMoisture: 0.35, maxMoisture: 0.85 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 6;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('forest'));

      const roadStyle = rng.nextInt(0, 4);
      if (roadStyle === 0) {
        const row = rng.nextInt(1, s - 1);
        for (let x = 0; x < s; x++) g[row][x] = 'road';
      } else if (roadStyle === 1) {
        const col = rng.nextInt(1, s - 1);
        for (let z = 0; z < s; z++) g[z][col] = 'road';
      } else if (roadStyle === 2) {
        for (let i = 0; i < s; i++) g[i][i] = 'road';
      } else {
        for (let i = 0; i < s; i++) g[i][s - 1 - i] = 'road';
      }

      const density = rng.next();
      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (g[z][x] === 'forest') {
            if (density > 0.7 && rng.next() < 0.15) g[z][x] = 'plains';
            if (density < 0.3 && rng.next() < 0.1) g[z][x] = 'swamp';
          }
        }
      }
      return g;
    },
  },

  // ===== forest_rail: 森林铁路 (6x6) =====
  forest_rail: {
    size: 6,
    weight: 8,
    terrainRequirements: { minMoisture: 0.3, maxMoisture: 0.75 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 6;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('forest'));

      const railDir = rng.nextInt(0, 2);
      if (railDir === 0) {
        const row = rng.nextInt(1, s - 2);
        for (let x = 0; x < s; x++) g[row][x] = 'road';
      } else {
        const col = rng.nextInt(1, s - 2);
        for (let z = 0; z < s; z++) g[z][col] = 'road';
      }

      if (rng.next() < 0.35) {
        const crossDir = railDir === 0 ? 1 : 0;
        if (crossDir === 0) {
          const crossRow = rng.nextInt(1, s - 2);
          for (let x = 0; x < s; x++) {
            if (g[crossRow][x] === 'forest') g[crossRow][x] = 'road';
          }
        } else {
          const crossCol = rng.nextInt(1, s - 2);
          for (let z = 0; z < s; z++) {
            if (g[z][crossCol] === 'forest') g[z][crossCol] = 'road';
          }
        }
      }

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'forest' && rng.next() < 0.08)
            g[z][x] = 'plains';

      return g;
    },
  },

  // ===== industrial_zone: 工业区 (8x8) =====
  industrial_zone: {
    size: 8,
    weight: 7,
    terrainRequirements: { minMoisture: 0.15, maxMoisture: 0.55, nearCity: true },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('city'));

      for (let z = 0; z < s; z += 2) {
        for (let x = 0; x < s; x++) {
          if ((z === 2 || z === 4 || z === 6) && x % 2 === 1) {
            g[z][x] = 'road';
          }
        }
      }
      for (let x = 0; x < s; x++) {
        if (g[7]) g[7][x] = 'road';
      }

      const rot = rng.nextInt(0, 4) as Rotation;
      let result = rotateGrid(g, rot);

      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (result[z][x] === 'city' && rng.next() < 0.06) {
            result[z][x] = rng.next() < 0.5 ? 'city' : 'plains';
          }
        }
      }
      return result;
    },
  },

  // ===== farmland: 农田 (6x6) =====
  farmland: {
    size: 6,
    weight: 11,
    terrainRequirements: { minMoisture: 0.25, maxMoisture: 0.65, maxHeight: 0.45 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 6;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('plains'));

      for (let z = 1; z < s; z += 2) {
        for (let x = 1; x < s; x += 2) {
          g[z][x] = 'water';
        }
      }

      const rot = rng.nextInt(0, 4) as Rotation;
      let result = rotateGrid(g, rot);

      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (result[z][x] === 'plains' && rng.next() < 0.05) {
            result[z][x] = 'road';
          }
          if (result[z][x] === 'water' && rng.next() < 0.03) {
            result[z][x] = 'road';
          }
        }
      }
      return result;
    },
  },

  // ===== dense_forest: 密林 (6x6) =====
  dense_forest: {
    size: 6,
    weight: 14,
    terrainRequirements: { minMoisture: 0.45 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 6;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('forest'));

      const clearings = rng.nextInt(1, 3);
      for (let c = 0; c < clearings; c++) {
        const cx = rng.nextInt(0, s);
        const cz = rng.nextInt(0, s);
        g[cz][cx] = 'plains';
        if (rng.next() < 0.4 && cx + 1 < s) g[cz][cx + 1] = 'plains';
      }

      if (rng.next() < 0.3) {
        const pathLen = rng.nextInt(2, 4);
        let px = rng.nextInt(0, s / 2);
        let pz = rng.nextInt(0, s);
        for (let i = 0; i < pathLen && px < s; i++) {
          if (g[pz][px] !== 'water') g[pz][px] = 'road';
          px++;
          if (rng.next() < 0.35 && pz + 1 < s) pz++;
        }
      }

      return g;
    },
  },

  // ===== mountain_range: 山脉 (8x8) =====
  mountain_range: {
    size: 8,
    weight: 9,
    terrainRequirements: { minHeight: 0.5, maxMoisture: 0.5 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('mountain'));

      const valleyStyle = rng.nextInt(0, 3);
      if (valleyStyle === 0) {
        const vz = rng.nextInt(2, s - 3);
        for (let x = 0; x < s; x++) {
          g[vz][x] = 'plains';
          if (vz + 1 < s) g[vz + 1][x] = rng.next() < 0.5 ? 'plains' : 'mountain';
        }
      } else if (valleyStyle === 1) {
        const vx = rng.nextInt(2, s - 3);
        for (let z = 0; z < s; z++) {
          g[z][vx] = 'plains';
          if (vx + 1 < s) g[z][vx + 1] = rng.next() < 0.5 ? 'plains' : 'mountain';
        }
      } else {
        for (let i = 1; i < s - 1; i++) {
          g[i][Math.min(i, s - 1)] = 'plains';
          g[i][Math.max(0, s - 1 - i)] = rng.next() < 0.4 ? 'plains' : 'mountain';
        }
      }

      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (g[z][x] === 'mountain' && rng.next() < 0.12) {
            g[z][x] = 'plains';
          }
        }
      }

      const rot = rng.nextInt(0, 4) as Rotation;
      return rotateGrid(g, rot);
    },
  },

  // ===== river_delta: 河口三角洲 (8x8) =====
  river_delta: {
    size: 8,
    weight: 4,
    terrainRequirements: { minMoisture: 0.65, nearWater: true },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('water'));

      // 减少沼泽比例：从60%降至30%，水域占50%，平原岛屿20%
      const numIslands = rng.nextInt(3, 6);
      for (let i = 0; i < numIslands; i++) {
        const ix = rng.nextInt(1, s - 2);
        const iz = rng.nextInt(1, s - 2);
        g[iz][ix] = rng.next() < 0.35 ? 'swamp' : 'plains';
        if (rng.next() < 0.25 && ix + 1 < s - 1) g[iz][ix + 1] = 'plains';
        if (rng.next() < 0.15 && iz + 1 < s - 1) g[iz + 1][ix] = 'plains';
      }

      if (rng.next() < 0.6) {
        // 更宽的主河道
        const mainCh = rng.nextInt(2, s - 3);
        for (let x = 0; x < s; x++) g[mainCh][x] = 'water';
        if (mainCh + 1 < s) for (let x = 0; x < s; x++) g[mainCh + 1][x] = 'water';
      }

      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (g[z][x] === 'water' && rng.next() < 0.03) {
            g[z][x] = 'plains';
          }
        }
      }

      return g;
    },
  },

  // ===== coastal_city: 沿海城市 (8x8) =====
  coastal_city: {
    size: 8,
    weight: 7,
    terrainRequirements: { nearWater: true, minMoisture: 0.5 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('plains'));

      const waterEdge = rng.nextInt(0, 4);
      if (waterEdge === 0) {
        for (let x = 0; x < s; x++) g[0][x] = 'water';
      } else if (waterEdge === 1) {
        for (let x = 0; x < s; x++) g[s - 1][x] = 'water';
      } else if (waterEdge === 2) {
        for (let z = 0; z < s; z++) g[z][0] = 'water';
      } else {
        for (let z = 0; z < s; z++) g[z][s - 1] = 'water';
      }

      const cityRows = waterEdge < 2 ? [2, 3, 4] : [2, 3, 4];
      for (const cr of cityRows) {
        if (cr >= 0 && cr < s) {
          for (let x = 1; x < s - 1; x++) {
            if (g[cr][x] !== 'water') g[cr][x] = 'city';
          }
        }
      }

      const roadRow = waterEdge < 2 ? 5 : 3;
      if (roadRow >= 0 && roadRow < s) {
        for (let x = 0; x < s; x++) {
          if (g[roadRow][x] !== 'water') g[roadRow][x] = 'road';
        }
      }

      const beachRow = waterEdge < 2 ? 1 : 5;
      if (beachRow >= 0 && beachRow < s) {
        for (let x = 0; x < s; x++) {
          if (g[beachRow][x] === 'plains') g[beachRow][x] = 'plains';
        }
      }

      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (g[z][x] === 'city' && rng.next() < 0.07) {
            g[z][x] = 'city';
          }
        }
      }

      return g;
    },
  },

  // ===== desert_oasis: 沙漠绿洲 (6x6) =====
  desert_oasis: {
    size: 6,
    weight: 6,
    terrainRequirements: { maxMoisture: 0.25, maxHeight: 0.4 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 6;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('desert'));

      const ox = rng.nextInt(1, s - 2);
      const oz = rng.nextInt(1, s - 2);
      const oasisRadius = rng.nextInt(1, 2);

      for (let dz = -oasisRadius; dz <= oasisRadius; dz++) {
        for (let dx = -oasisRadius; dx <= oasisRadius; dx++) {
          const nx = ox + dx, nz = oz + dz;
          if (nx >= 0 && nx < s && nz >= 0 && nz < s) {
            if (dx === 0 && dz === 0) {
              g[nz][nx] = 'water';
            } else if (Math.abs(dx) + Math.abs(dz) <= oasisRadius) {
              g[nz][nx] = rng.next() < 0.6 ? 'forest' : 'plains';
            }
          }
        }
      }

      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (g[z][x] === 'desert' && rng.next() < 0.04) {
            g[z][x] = 'plains';
          }
        }
      }

      return g;
    },
  },

  // ===== plains_village: 平原村庄 (6x6) =====
  plains_village: {
    size: 6,
    weight: 13,
    terrainRequirements: { maxHeight: 0.4, minMoisture: 0.2, maxMoisture: 0.6 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 6;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('plains'));

      const numHouses = rng.nextInt(3, 7);
      for (let h = 0; h < numHouses; h++) {
        const hx = rng.nextInt(1, s - 1);
        const hz = rng.nextInt(1, s - 1);
        g[hz][hx] = 'city';
      }

      const hasRoad = rng.next() < 0.7;
      if (hasRoad) {
        const rdir = rng.nextInt(0, 2);
        if (rdir === 0) {
          const rz = rng.nextInt(1, s - 2);
          for (let x = 0; x < s; x++) {
            if (g[rz][x] !== 'city') g[rz][x] = 'road';
          }
        } else {
          const rx = rng.nextInt(1, s - 2);
          for (let z = 0; z < s; z++) {
            if (g[z][rx] !== 'city') g[z][rx] = 'road';
          }
        }
      }

      if (rng.next() < 0.35) {
        const sx = rng.nextInt(1, s - 1);
        const sz = rng.nextInt(1, s - 1);
        if (g[sz][sx] === 'plains') g[sz][sx] = 'city';
      }

      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (g[z][x] === 'plains' && rng.next() < 0.04) {
            g[z][x] = 'forest';
          }
        }
      }

      return g;
    },
  },

  // ===== swamp_wetland: 沼泽湿地 (8x8) =====
  swamp_wetland: {
    size: 8,
    weight: 3,
    terrainRequirements: { minMoisture: 0.6, maxHeight: 0.35 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('plains'));

      // 大幅减少沼泽比例：从70%沼泽降至30%，干燥岛屿更大更密集
      const numDryIslands = rng.nextInt(5, 9);
      for (let i = 0; i < numDryIslands; i++) {
        const ix = rng.nextInt(0, s - 1);
        const iz = rng.nextInt(0, s - 1);
        g[iz][ix] = 'plains';
        if (rng.next() < 0.6 && ix + 1 < s) g[iz][ix + 1] = 'plains';
        if (rng.next() < 0.5 && iz + 1 < s) g[iz + 1][ix] = 'plains';
        if (rng.next() < 0.35 && ix + 1 < s && iz + 1 < s) g[iz + 1][ix + 1] = 'plains';
      }

      // 填充剩余空隙为沼泽（但占比已大幅降低）
      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'plains' && rng.next() < 0.35)
            g[z][x] = 'swamp';

      const mainIslandX = rng.nextInt(2, s - 3);
      const mainIslandZ = rng.nextInt(2, s - 3);
      g[mainIslandZ][mainIslandX] = 'plains';
      if (mainIslandX + 1 < s) g[mainIslandZ][mainIslandX + 1] = 'plains';
      if (mainIslandZ + 1 < s) g[mainIslandZ + 1][mainIslandX] = 'plains';
      if (mainIslandX + 1 < s && mainIslandZ + 1 < s) g[mainIslandZ + 1][mainIslandX + 1] = 'plains';

      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (g[z][x] === 'swamp' && rng.next() < 0.03) {
            g[z][x] = 'water';
          }
        }
      }

      return g;
    },
  },

  // ===== fortress_hill: 要塞山丘 (6x6) =====
  fortress_hill: {
    size: 6,
    weight: 5,
    terrainRequirements: { minHeight: 0.45 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 6;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('mountain'));

      for (let z = 0; z < 3; z++) {
        for (let x = 0; x < 3; x++) {
          g[z][x] = 'mountain';
        }
      }
      for (let z = 3; z < s; z++) {
        for (let x = 0; x < s; x++) {
          g[z][x] = 'plains';
        }
      }

      // 要塞建筑使用 city 地形（不是 fortress，fortress 由阶段6专门放置）
      const f1x = rng.nextInt(0, 2), f1z = rng.nextInt(0, 2);
      g[f1z][f1x] = 'city';
      if (rng.next() < 0.5) {
        const f2x = rng.nextInt(0, 2), f2z = rng.nextInt(0, 2);
        if (f2x !== f1x || f2z !== f1z) g[f2z][f2x] = 'city';
      }

      const approachRow = 3;
      if (approachRow < s) {
        for (let x = 1; x < s - 1; x++) g[approachRow][x] = 'road';
      }

      const rot = rng.nextInt(0, 4) as Rotation;
      return rotateGrid(g, rot);
    },
  },

  // ===== crossroads: 十字路口 (6x6) =====
  crossroads: {
    size: 6,
    weight: 10,
    terrainRequirements: { maxHeight: 0.45, minMoisture: 0.15, maxMoisture: 0.6 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 6;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('plains'));

      const hRoad = rng.nextInt(2, s - 2);
      const vRoad = rng.nextInt(2, s - 2);

      for (let x = 0; x < s; x++) g[hRoad][x] = 'road';
      for (let z = 0; z < s; z++) g[z][vRoad] = 'road';

      if (rng.next() < 0.5) {
        const bx = vRoad + (rng.next() < 0.5 ? 1 : -1);
        const bz = hRoad + (rng.next() < 0.5 ? 1 : -1);
        if (bx >= 0 && bx < s && bz >= 0 && bz < s) {
          if (g[bz][bx] === 'plains') g[bz][bx] = 'city';
        }
      }

      for (let z = 0; z < s; z++) {
        for (let x = 0; x < s; x++) {
          if (g[z][x] === 'plains' && rng.next() < 0.04) {
            g[z][x] = 'forest';
          }
        }
      }

      return g;
    },
  },

  // ===== open_plains: 开阔平原 (6x6) =====
  open_plains: {
    size: 6,
    weight: 15,
    terrainRequirements: { maxHeight: 0.35, maxMoisture: 0.55 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 6;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('plains'));

      const numForest = rng.nextInt(0, 3);
      for (let f = 0; f < numForest; f++) {
        const fx = rng.nextInt(0, s);
        const fz = rng.nextInt(0, s);
        g[fz][fx] = 'forest';
      }

      if (rng.next() < 0.2) {
        const rx = rng.nextInt(0, s / 2);
        const rz = rng.nextInt(0, s);
        for (let i = 0; i < 3 && rx + i < s; i++) {
          if (g[rz][rx + i] === 'plains') g[rz][rx + i] = 'road';
        }
      }

      return g;
    },
  },

  // ===== highway_intersection: 高速公路互通立交 (8x8) =====
  highway_intersection: {
    size: 8,
    weight: 7,
    terrainRequirements: { maxHeight: 0.5, minMoisture: 0.1, maxMoisture: 0.55 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('road'));

      const center = Math.floor(s / 2);
      const radius = 2;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dz * dz <= radius * radius) {
            const cz = center + dz, cx = center + dx;
            if (cz >= 0 && cz < s && cx >= 0 && cx < s) g[cz][cx] = 'road';
          }
        }
      }

      for (let arm = 0; arm < 4; arm++) {
        const armW = rng.nextInt(1, 3);
        for (let w = 0; w < armW; w++) {
          if (arm === 0) { const r = center - radius - 1 - w; if (r >= 0) g[r][center] = 'road'; }
          else if (arm === 1) { const r = center + radius + 1 + w; if (r < s) g[r][center] = 'road'; }
          else if (arm === 2) { const c = center + radius + 1 + w; if (c < s) g[center][c] = 'road'; }
          else { const c = center - radius - 1 - w; if (c >= 0) g[center][c] = 'road'; }
        }
      }

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'plains') g[z][x] = rng.next() < 0.6 ? 'city' : 'plains';

      const numBuildings = rng.nextInt(2, 5);
      for (let b = 0; b < numBuildings; b++) {
        const bx = rng.nextInt(0, s), bz = rng.nextInt(0, s);
        if (g[bz][bx] !== 'road') g[bz][bx] = 'city';
      }

      const rot = rng.nextInt(0, 4) as Rotation;
      let result = rotateGrid(g, rot);
      if (rng.next() > 0.65) result = mirrorHorizontal(result);

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (result[z][x] === 'plains' && rng.next() < 0.08)
            result[z][x] = 'forest';

      return result;
    },
  },

  // ===== military_base: 军事基地 (8x8) =====
  military_base: {
    size: 8,
    weight: 5,
    terrainRequirements: { minHeight: 0.25, maxHeight: 0.55, minMoisture: 0.15, maxMoisture: 0.5 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('city'));

      for (let z = 1; z < s - 1; z++) {
        g[z][1] = 'city';
        g[z][s - 2] = 'city';
      }
      for (let x = 1; x < s - 1; x++) {
        g[1][x] = 'city';
        g[s - 2][x] = 'city';
      }

      for (let z = 2; z < s - 2; z++)
        for (let x = 2; x < s - 2; x++)
          g[z][x] = rng.next() < 0.45 ? 'city' : 'road';

      const paradeRow = Math.floor(s / 2);
      for (let x = 2; x < s - 2; x++) g[paradeRow][x] = 'road';

      const gateCol = rng.nextInt(2, s - 3);
      g[s - 2][gateCol] = 'road';
      if (gateCol > 1) g[s - 2][gateCol - 1] = 'road';
      if (gateCol < s - 2) g[s - 2][gateCol + 1] = 'road';

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'road' && rng.next() < 0.06)
            g[z][x] = 'forest';

      const rot = rng.nextInt(0, 4) as Rotation;
      return rotateGrid(g, rot);
    },
  },

  // ===== port_dock: 港口码头 (8x8) =====
  port_dock: {
    size: 8,
    weight: 5,
    terrainRequirements: { nearWater: true, minMoisture: 0.4 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('water'));

      const landSide = rng.nextInt(0, 3);
      const landWidth = rng.nextInt(3, 5);
      if (landSide === 0) {
        for (let z = s - landWidth; z < s; z++)
          for (let x = 0; x < s; x++) g[z][x] = 'plains';
      } else if (landSide === 1) {
        for (let z = 0; z < landWidth; z++)
          for (let x = 0; x < s; x++) g[z][x] = 'plains';
      } else if (landSide === 2) {
        for (let z = 0; z < s; z++)
          for (let x = s - landWidth; x < s; x++) g[z][x] = 'plains';
      } else {
        for (let z = 0; z < s; z++)
          for (let x = 0; x < landWidth; x++) g[z][x] = 'plains';
      }

      const dockRow = landSide < 2
        ? (landSide === 0 ? s - landWidth : landWidth - 1)
        : (landSide === 2 ? s - 1 : 0);
      if (dockRow >= 0 && dockRow < s) {
        for (let x = 1; x < s - 1; x += rng.nextInt(2, 3)) {
          g[dockRow][x] = 'road';
          if (dockRow + (landSide === 0 ? -1 : 1) >= 0 && dockRow + (landSide === 0 ? -1 : 1) < s)
            g[dockRow + (landSide === 0 ? -1 : 1)][x] = 'road';
        }
      }

      const numWarehouses = rng.nextInt(2, 5);
      for (let w = 0; w < numWarehouses; w++) {
        const wx = rng.nextInt(1, s - 1), wz = rng.nextInt(1, s - 1);
        if (g[wz][wx] === 'plains') g[wz][wx] = 'city';
      }

      const numCranes = rng.nextInt(1, 3);
      for (let c = 0; c < numCranes; c++) {
        const cx = rng.nextInt(1, s - 1), cz = rng.nextInt(1, s - 1);
        if ((g[cz][cx] === 'plains' || g[cz][cx] === 'road')) g[cz][cx] = 'city';
      }

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'plains' && rng.next() < 0.05)
            g[z][x] = 'road';

      const rot = rng.nextInt(0, 4) as Rotation;
      return rotateGrid(g, rot);
    },
  },

  // ===== mining_town: 矿业小镇 (6x6) =====
  mining_town: {
    size: 6,
    weight: 5,
    terrainRequirements: { minHeight: 0.45, maxMoisture: 0.4 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 6;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('mountain'));

      const mountainEdge = rng.nextInt(0, 3);
      if (mountainEdge === 0) {
        for (let x = 0; x < s; x++) { g[0][x] = 'mountain'; g[1][x] = rng.next() < 0.5 ? 'mountain' : 'plains'; }
      } else if (mountainEdge === 1) {
        for (let x = 0; x < s; x++) { g[s - 1][x] = 'mountain'; g[s - 2][x] = rng.next() < 0.5 ? 'mountain' : 'plains'; }
      } else if (mountainEdge === 2) {
        for (let z = 0; z < s; z++) { g[z][0] = 'mountain'; g[z][1] = rng.next() < 0.5 ? 'mountain' : 'plains'; }
      } else {
        for (let z = 0; z < s; z++) { g[z][s - 1] = 'mountain'; g[z][s - 2] = rng.next() < 0.5 ? 'mountain' : 'plains'; }
      }

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'plains' || g[z][x] === undefined as unknown) g[z][x] = 'plains';

      // 矿区建筑统一使用 city 地形
      const numBuildings = rng.nextInt(2, 5);
      for (let b = 0; b < numBuildings; b++) {
        const bx = rng.nextInt(0, s), bz = rng.nextInt(0, s);
        if (g[bz][bx] === 'plains') g[bz][bx] = 'city';
      }

      const roadDir = rng.nextInt(0, 2);
      if (roadDir === 0) {
        const rz = rng.nextInt(1, s - 2);
        for (let x = 0; x < s; x++) if (g[rz][x] !== 'mountain') g[rz][x] = 'road';
      } else {
        const rx = rng.nextInt(1, s - 2);
        for (let z = 0; z < s; z++) if (g[z][rx] !== 'mountain') g[z][rx] = 'road';
      }

      const rot = rng.nextInt(0, 4) as Rotation;
      return rotateGrid(g, rot);
    },
  },

  // ===== orchard: 果园 (6x6) =====
  orchard: {
    size: 6,
    weight: 8,
    terrainRequirements: { maxHeight: 0.35, minMoisture: 0.25, maxMoisture: 0.6 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 6;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('forest'));

      const pathSpacing = 2;
      for (let z = pathSpacing; z < s; z += pathSpacing) {
        for (let x = 0; x < s; x++) g[z][x] = 'road';
      }

      const vPath = rng.nextInt(0, 3);
      if (vPath > 0) {
        const col = vPath * 2;
        if (col < s) for (let z = 0; z < s; z++) g[z][col] = 'road';
      }

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'forest' && rng.next() < 0.08)
            g[z][x] = 'plains';

      const rot = rng.nextInt(0, 4) as Rotation;
      let result = rotateGrid(g, rot);
      if (rng.next() > 0.7) result = mirrorHorizontal(result);
      return result;
    },
  },

  // ===== ancient_ruins: 古代遗迹 (8x8) =====
  ancient_ruins: {
    size: 8,
    weight: 4,
    terrainRequirements: { minMoisture: 0.3, maxMoisture: 0.7 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('forest'));

      const ruinDensity = rng.next();
      const numRuins = ruinDensity > 0.5 ? rng.nextInt(5, 10) : rng.nextInt(3, 6);
      for (let r = 0; r < numRuins; r++) {
        const rx = rng.nextInt(0, s), rz = rng.nextInt(0, s);
        // 废墟建筑使用 city 地形
        g[rz][rx] = 'city';
        if (rng.next() < 0.3 && rx + 1 < s) g[rz][rx + 1] = 'city';
        if (rng.next() < 0.2 && rz + 1 < s) g[rz + 1][rx] = 'plains';
      }

      if (rng.next() < 0.5) {
        const pathLen = rng.nextInt(3, 6);
        let px = rng.nextInt(0, s / 2), pz = rng.nextInt(0, s);
        for (let i = 0; i < pathLen && px < s; i++) {
          if (g[pz][px] !== 'water') g[pz][px] = 'road';
          px++;
          if (rng.next() < 0.3 && pz + 1 < s) pz++;
        }
      }

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'forest' && rng.next() < 0.12)
            g[z][x] = 'plains';

      const rot = rng.nextInt(0, 4) as Rotation;
      let result = rotateGrid(g, rot);
      if (rng.next() > 0.65) result = mirrorHorizontal(result);
      return result;
    },
  },

  // ===== airfield: 机场跑道 (10x10) =====
  airfield: {
    size: 10,
    weight: 4,
    terrainRequirements: { maxHeight: 0.4, minMoisture: 0.15, maxMoisture: 0.5 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 10;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('plains'));

      const runwayRow = rng.nextInt(3, s - 4);
      const runwayWidth = 2;
      for (let w = 0; w < runwayWidth; w++) {
        const r = runwayRow + w;
        if (r >= 0 && r < s) for (let x = 0; x < s; x++) g[r][x] = 'road';
      }

      const tarmacStart = rng.nextInt(0, 3);
      const tarmacEnd = rng.nextInt(s - 3, s);
      for (let z = tarmacStart; z < tarmacEnd; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] !== 'road' && (z < runwayRow || z >= runwayRow + runwayWidth))
            g[z][x] = rng.next() < 0.5 ? 'road' : 'plains';

      // 控制塔和机库使用 city 地形
      const towerX = rng.nextInt(0, Math.floor(s / 3));
      const towerZ = rng.nextInt(tarmacStart, Math.min(runwayRow, tarmacEnd));
      if (towerZ >= 0 && towerZ < s && towerX >= 0 && towerX < s) g[towerZ][towerX] = 'city';

      const numHangars = rng.nextInt(2, 5);
      for (let h = 0; h < numHangars; h++) {
        const hx = rng.nextInt(Math.floor(s / 2), s - 1);
        const hz = rng.nextInt(tarmacStart, tarmacEnd - 1);
        if (hz >= 0 && hz < s && hx >= 0 && hx < s && g[hz][hx] !== 'road')
          g[hz][hx] = 'city';
      }

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'plains' && rng.next() < 0.04)
            g[z][x] = 'forest';

      const rot = rng.nextInt(0, 4) as Rotation;
      let result = rotateGrid(g, rot);
      if (rng.next() > 0.6) result = mirrorHorizontal(result);
      return result;
    },
  },

  // ===== power_plant: 发电站 (8x8) =====
  power_plant: {
    size: 8,
    weight: 4,
    terrainRequirements: { minMoisture: 0.2, maxMoisture: 0.55, nearWater: true },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('city'));

      const buildingCluster = rng.nextInt(1, 4);
      if (buildingCluster === 1) {
        for (let z = 1; z < s - 2; z++)
          for (let x = 1; x < Math.floor(s * 0.6); x++)
            g[z][x] = 'city';
      } else if (buildingCluster === 2) {
        for (let z = 1; z < s - 2; z++)
          for (let x = Math.floor(s * 0.4); x < s - 1; x++)
            g[z][x] = 'city';
      } else {
        for (let z = 1; z < Math.floor(s * 0.55); z++)
          for (let x = 1; x < s - 1; x++)
            g[z][x] = 'city';
      }

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] !== 'city') g[z][x] = 'plains';

      const coolingRow = buildingCluster < 2 ? s - 2 : 0;
      if (coolingRow >= 0 && coolingRow < s) {
        for (let x = 1; x < s - 1; x++)
          g[coolingRow][x] = rng.next() < 0.6 ? 'water' : 'plains';
      }

      // 烟囱等设施使用 city 地形
      const numStacks = rng.nextInt(1, 3);
      for (let st = 0; st < numStacks; st++) {
        const sx = rng.nextInt(1, s - 2), sz = rng.nextInt(1, s - 3);
        if (g[sz][sx] === 'city') g[sz][sx] = 'city';
      }

      const lineRow = rng.nextInt(1, s - 2);
      for (let x = 0; x < s; x++)
        if (g[lineRow][x] === 'plains') g[lineRow][x] = 'road';

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'plains' && rng.next() < 0.06)
            g[z][x] = 'forest';

      const rot = rng.nextInt(0, 4) as Rotation;
      let result = rotateGrid(g, rot);
      if (rng.next() > 0.65) result = mirrorHorizontal(result);
      return result;
    },
  },

  // ===== suburban: 郊区住宅 (8x8) =====
  suburban: {
    size: 8,
    weight: 9,
    terrainRequirements: { maxHeight: 0.3, minMoisture: 0.2, maxMoisture: 0.55 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('plains'));

      // 住宅房屋使用 city 地形
      const curveStyle = rng.nextInt(0, 3);
      if (curveStyle === 0) {
        for (let x = 0; x < s; x++) {
          const row = Math.floor(s / 2) + Math.round(Math.sin(x * 0.8) * 1.5);
          if (row >= 0 && row < s) g[row][x] = 'road';
        }
      } else if (curveStyle === 1) {
        for (let z = 0; z < s; z++) {
          const col = Math.floor(s / 2) + Math.round(Math.sin(z * 0.8) * 1.5);
          if (col >= 0 && col < s) g[z][col] = 'road';
        }
      } else {
        const mainR = rng.nextInt(2, s - 3);
        for (let x = 0; x < s; x++) g[mainR][x] = 'road';
        const branchR = rng.nextInt(2, s - 3);
        for (let x = 0; x < Math.floor(s * 0.6); x++) g[branchR][x] = 'road';
      }

      const numHouses = rng.nextInt(6, 12);
      for (let h = 0; h < numHouses; h++) {
        const hx = rng.nextInt(0, s), hz = rng.nextInt(0, s);
        if (g[hz][hx] === 'plains') g[hz][hx] = 'city';
      }

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'plains' && rng.next() < 0.15)
            g[z][x] = 'forest';

      const rot = rng.nextInt(0, 4) as Rotation;
      let result = rotateGrid(g, rot);
      if (rng.next() > 0.6) result = mirrorHorizontal(result);
      return result;
    },
  },

  // ===== lake_shore: 湖岸 (8x8) =====
  lake_shore: {
    size: 8,
    weight: 6,
    terrainRequirements: { nearWater: true, minMoisture: 0.45, maxHeight: 0.35 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('water'));

      const waterEdge = rng.nextInt(0, 3);
      const shoreWidth = rng.nextInt(3, 5);
      if (waterEdge === 0) {
        for (let z = shoreWidth; z < s; z++)
          for (let x = 0; x < s; x++) g[z][x] = 'plains';
      } else if (waterEdge === 1) {
        for (let z = 0; z < s - shoreWidth; z++)
          for (let x = 0; x < s; x++) g[z][x] = 'plains';
      } else if (waterEdge === 2) {
        for (let z = 0; z < s; z++)
          for (let x = shoreWidth; x < s; x++) g[z][x] = 'plains';
      } else {
        for (let z = 0; z < s; z++)
          for (let x = 0; x < s - shoreWidth; x++) g[z][x] = 'plains';
      }

      // 度假设施使用 city 地形
      const beachRow = waterEdge === 0 ? shoreWidth : (waterEdge === 1 ? s - shoreWidth - 1 : -1);
      if (beachRow >= 0 && beachRow < s) {
        for (let x = 0; x < s; x++)
          if (g[beachRow][x] === 'plains') g[beachRow][x] = 'plains';
      }

      const numResorts = rng.nextInt(2, 5);
      for (let r = 0; r < numResorts; r++) {
        const rx = rng.nextInt(1, s - 1), rz = rng.nextInt(1, s - 1);
        if (g[rz][rx] === 'plains') g[rz][rx] = 'city';
      }

      const dockX = rng.nextInt(1, s - 2);
      if (beachRow >= 0 && beachRow < s) g[beachRow][dockX] = 'road';
      if (beachRow + (waterEdge === 0 ? -1 : 1) >= 0 && beachRow + (waterEdge === 0 ? -1 : 1) < s)
        g[beachRow + (waterEdge === 0 ? -1 : 1)][dockX] = 'road';

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'plains' && rng.next() < 0.08)
            g[z][x] = 'forest';

      const rot = rng.nextInt(0, 4) as Rotation;
      return rotateGrid(g, rot);
    },
  },

  // ===== canyon: 峡谷 (8x8) =====
  canyon: {
    size: 8,
    weight: 5,
    terrainRequirements: { minHeight: 0.5, maxMoisture: 0.4 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('mountain'));

      const canyonStyle = rng.nextInt(0, 2);
      const canyonWidth = rng.nextInt(1, 3);
      if (canyonStyle === 0) {
        const leftWall = Math.floor((s - canyonWidth) / 2);
        for (let z = 0; z < s; z++) {
          for (let x = leftWall; x < leftWall + canyonWidth; x++) {
            if (x >= 0 && x < s) g[z][x] = rng.next() < 0.4 ? 'water' : 'road';
          }
        }
      } else {
        const topWall = Math.floor((s - canyonWidth) / 2);
        for (let x = 0; x < s; x++) {
          for (let z = topWall; z < topWall + canyonWidth; z++) {
            if (z >= 0 && z < s) g[z][x] = rng.next() < 0.4 ? 'water' : 'road';
          }
        }
      }

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'mountain' && rng.next() < 0.08)
            g[z][x] = 'plains';

      const rot = rng.nextInt(0, 4) as Rotation;
      let result = rotateGrid(g, rot);
      if (rng.next() > 0.65) result = mirrorHorizontal(result);
      return result;
    },
  },

  // ===== railway_junction: 铁路枢纽 (8x8) =====
  railway_junction: {
    size: 8,
    weight: 5,
    terrainRequirements: { maxHeight: 0.45, minMoisture: 0.15, maxMoisture: 0.5 },
    generate(rng, _mx, _mz, _neighbors) {
      const s = 8;
      const g: TerrainType[][] = Array.from({ length: s }, () => Array(s).fill('plains'));

      const mainLineDir = rng.nextInt(0, 2);
      const mainPos = rng.nextInt(2, s - 3);
      if (mainLineDir === 0) {
        for (let x = 0; x < s; x++) g[mainPos][x] = 'road';
        if (mainPos + 1 < s) for (let x = 0; x < s; x++) g[mainPos + 1][x] = 'road';
      } else {
        for (let z = 0; z < s; z++) g[z][mainPos] = 'road';
        if (mainPos + 1 < s) for (let z = 0; z < s; z++) g[z][mainPos + 1] = 'road';
      }

      const numBranches = rng.nextInt(1, 3);
      for (let b = 0; b < numBranches; b++) {
        const branchDir = 1 - mainLineDir;
        const branchPos = rng.nextInt(2, s - 3);
        if (branchDir === 0) {
          for (let x = 0; x < Math.floor(s * 0.6); x++) g[branchPos][x] = 'road';
        } else {
          for (let z = 0; z < Math.floor(s * 0.6); z++) g[z][branchPos] = 'road';
        }
      }

      // 车站建筑使用 city 地形
      const stationZ = rng.nextInt(1, s - 3);
      const stationX = rng.nextInt(1, s - 3);
      g[stationZ][stationX] = 'city';
      if (stationX + 1 < s) g[stationZ][stationX + 1] = 'city';
      if (stationZ + 1 < s) { g[stationZ + 1][stationX] = 'road'; g[stationZ + 1][stationX + 1] = 'road'; }

      const yardStart = mainLineDir === 0 ? mainPos + 2 : stationZ + 2;
      if (yardStart < s) {
        for (let i = 0; i < 3; i++) {
          if (mainLineDir === 0) {
            if (yardStart + i < s) for (let x = Math.floor(s * 0.5); x < s - 1; x++) g[yardStart + i][x] = 'plains';
          } else {
            for (let z = yardStart; z < Math.min(yardStart + 3, s); z++)
              if (mainPos + 2 + i < s) g[z][mainPos + 2 + i] = 'plains';
          }
        }
      }

      for (let z = 0; z < s; z++)
        for (let x = 0; x < s; x++)
          if (g[z][x] === 'plains' && rng.next() < 0.05)
            g[z][x] = 'forest';

      const rot = rng.nextInt(0, 4) as Rotation;
      let result = rotateGrid(g, rot);
      if (rng.next() > 0.65) result = mirrorHorizontal(result);
      return result;
    },
  },
};

// ---------- 10.5 宏观分配算法 ----------

/**
 * 获取指定位置的有效候选模板列表
 *
 * 根据以下条件筛选可用模板：
 * 1. 高度约束：模板要求的最低/最大高度范围
 * 2. 湿度约束：模板要求的湿度范围
 * 3. 近水/近城约束
 * 4. 邻居兼容性：与周围已分配模板的类型兼容性评分
 */
function getValidTemplates(
  macroX: number,
  macroZ: number,
  heightMap: number[][],
  moistureMap: number[][],
  isNearWater: boolean[][],
  isNearCity: boolean[][],
  macroGrid: (TemplateType | null)[][],
  macroW: number,
  macroH: number,
): Array<{ type: TemplateType; score: number }> {
  const h = heightMap[macroZ]?.[macroX] ?? 0.5;
  const m = moistureMap[macroZ]?.[macroX] ?? 0.5;
  const nw = isNearWater[macroZ]?.[macroX] ?? false;
  const nc = isNearCity[macroZ]?.[macroX] ?? false;

  const candidates: Array<{ type: TemplateType; score: number }> = [];

  const dirOffsets = [
    { dx: -1, dz: 0 }, { dx: 1, dz: 0 },
    { dx: 0, dz: -1 }, { dx: 0, dz: 1 },
  ];

  for (const [type, def] of Object.entries(TEMPLATE_REGISTRY)) {
    const req = def.terrainRequirements;

    if (req.minHeight !== undefined && h < req.minHeight) continue;
    if (req.maxHeight !== undefined && h > req.maxHeight) continue;
    if (req.minMoisture !== undefined && m < req.minMoisture) continue;
    if (req.maxMoisture !== undefined && m > req.maxMoisture) continue;
    if (req.nearWater && !nw) continue;
    if (req.nearCity && !nc) continue;

    let neighborScore = 0;
    let neighborCount = 0;
    for (const d of dirOffsets) {
      const nx = macroX + d.dx;
      const nz = macroZ + d.dz;
      if (nx < 0 || nx >= macroW || nz < 0 || nz >= macroH) continue;
      const nType = macroGrid[nz]?.[nx];
      if (!nType) continue;
      neighborCount++;

      if (areTypesCompatible(type as TemplateType, nType)) {
        neighborScore += 1.0;
      } else {
        neighborScore -= 0.5;
      }
    }

    const compatibilityBonus = neighborCount > 0 ? neighborScore / neighborCount : 0.5;
    const finalScore = def.weight * (0.7 + compatibilityBonus * 0.6);

    candidates.push({ type: type as TemplateType, score: Math.max(0.1, finalScore) });
  }

  return candidates;
}

/**
 * 判断两种模板类型是否相邻兼容
 * 兼容规则基于地理合理性：
 * - 自然地形之间通常兼容
 * - 城市/工业区倾向于与其他人工地形相邻
 * - 极端地形（沙漠/山脉）与对立极端不兼容
 */
function areTypesCompatible(a: TemplateType, b: TemplateType): boolean {
  const naturalSet = new Set<TemplateType>([
    'dense_forest', 'forest_road', 'forest_rail', 'open_plains',
    'farmland', 'mountain_range', 'river_delta', 'swamp_wetland',
    'orchard', 'ancient_ruins', 'canyon', 'lake_shore',
  ]);
  const urbanSet = new Set<TemplateType>([
    'city_block', 'industrial_zone', 'coastal_city', 'plains_village',
    'crossroads', 'fortress_hill', 'highway_intersection',
    'military_base', 'port_dock', 'mining_town', 'suburban',
    'airfield', 'power_plant', 'railway_junction',
  ]);
  const aridSet = new Set<TemplateType>(['desert_oasis']);
  const wetSet = new Set<TemplateType>(['river_delta', 'swamp_wetland', 'coastal_city', 'lake_shore', 'port_dock']);

  if (a === b) return true;
  if (naturalSet.has(a) && naturalSet.has(b)) return true;
  if (urbanSet.has(a) && urbanSet.has(b)) return true;
  if (aridSet.has(a) && wetSet.has(b)) return false;
  if (wetSet.has(a) && aridSet.has(b)) return false;

  const compatiblePairs: [TemplateType, TemplateType][] = [
    ['city_block', 'forest_road'], ['city_block', 'crossroads'],
    ['city_block', 'open_plains'], ['city_block', 'farmland'],
    ['industrial_zone', 'city_block'], ['industrial_zone', 'forest_road'],
    ['industrial_zone', 'crossroads'], ['industrial_zone', 'open_plains'],
    ['coastal_city', 'city_block'], ['coastal_city', 'open_plains'],
    ['coastal_city', 'farmland'], ['coastal_city', 'river_delta'],
    ['coastal_city', 'lake_shore'], ['coastal_city', 'port_dock'],
    ['plains_village', 'open_plains'], ['plains_village', 'farmland'],
    ['plains_village', 'forest_road'], ['plains_village', 'orchard'],
    ['desert_oasis', 'open_plains'], ['desert_oasis', 'mountain_range'],
    ['mountain_range', 'canyon'], ['mountain_range', 'fortress_hill'],
    ['mountain_range', 'mining_town'], ['canyon', 'river_delta'],
    ['river_delta', 'swamp_wetland'], ['river_delta', 'lake_shore'],
    ['airfield', 'open_plains'], ['airfield', 'city_block'],
    ['power_plant', 'industrial_zone'], ['power_plant', 'river_delta'],
    ['military_base', 'city_block'], ['military_base', 'open_plains'],
    ['suburban', 'city_block'], ['suburban', 'plains_village'],
    ['suburban', 'crossroads'], ['railway_junction', 'industrial_zone'],
    ['railway_junction', 'forest_rail'], ['railway_junction', 'city_block'],
  ];

  for (const [pa, pb] of compatiblePairs) {
    if ((a === pa && b === pb) || (a === pb && b === pa)) return true;
  }

  return false;
}

/** 加权随机选择 */
function weightedRandomSelect<T extends { score: number }>(items: T[], rng: SeededRNG): T | undefined {
  if (items.length === 0) return undefined;
  const totalScore = items.reduce((sum, item) => sum + Math.max(0.01, item.score), 0);
  let r = rng.next() * totalScore;
  for (const item of items) {
    r -= Math.max(0.01, item.score);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

// ---------- 10.6 分层地图主生成函数 ----------

/**
 * 生成分层/多尺度地形地图
 *
 * 算法流程：
 * 步骤1: 使用 fBm 噪声生成宏观高度图和湿度图（与阶段1-5类似但更简化）
 * 步骤2: 计算近水/近城标记
 * 步骤3: BFS蔓延式宏观模板分配（从种子城市开始生长，邻域感知加权选择）
 * 步骤4: 将每个宏格子的模板展开为微观地形
 * 步骤5: 边缘通行处理
 *
 * @param config - 分层地图配置
 * @returns 完整的分层地图数据
 */
export function generateHierarchicalMap(config: HierarchicalConfig): HierarchicalMap {
  const { seed, macroWidth, macroHeight, windDirection, forcedTemplates } = config;
  const rng = new SeededRNG(seed);
  const noise = new PerlinNoise(seed);

  console.log(`[Hierarchical] 开始生成分层地图 ${macroWidth}x${macroHeight} 宏格, 种子=${seed}`);

  // ===== 步骤1: 宏观高度图与湿度图 =====
  const heightMap = create2DArray(macroWidth, macroHeight, () => 0);
  const moistureMap = create2DArray(macroWidth, macroHeight, () => 0);

  const noiseScale = Math.max(0.03, 2.0 / Math.max(macroWidth, macroHeight));
  for (let z = 0; z < macroHeight; z++) {
    for (let x = 0; x < macroWidth; x++) {
      heightMap[z][x] = (noise.fbm(x, z, 5, 0.5, 2.0, noiseScale) + 1) / 2; // 归一化到 [0, 1]
      moistureMap[z][x] = (noise.fbm(x + 500, z + 500, 3, 0.5, 2.0, noiseScale * 1.5) + 1) / 2;
    }
  }

  // 边缘渐变
  for (let z = 0; z < macroHeight; z++) {
    for (let x = 0; x < macroWidth; x++) {
      const edgeX = 1 - Math.pow(Math.abs(x - macroWidth / 2) / (macroWidth / 2), 2);
      const edgeZ = 1 - Math.pow(Math.abs(z - macroHeight / 2) / (macroHeight / 2), 2);
      heightMap[z][x] *= edgeX * edgeZ * 0.5 + 0.5;
      heightMap[z][x] = Math.max(0, Math.min(1, heightMap[z][x]));
    }
  }

  // ===== 步骤2: 近水/近城标记 =====
  const isNearWater = create2DArray(macroWidth, macroHeight, () => false);
  const isNearCity = create2DArray(macroWidth, macroHeight, () => false);
  const waterThreshold = 0.32;

  // 标记低洼区域为"近水"
  for (let z = 0; z < macroHeight; z++) {
    for (let x = 0; x < macroWidth; x++) {
      if (heightMap[z][x] < waterThreshold) isNearWater[z][x] = true;
      else {
        for (const d of [
          { dx: -1, dz: 0 }, { dx: 1, dz: 0 },
          { dx: 0, dz: -1 }, { dx: 0, dz: 1 },
        ]) {
          const nx = x + d.dx, nz = z + d.dz;
          if (nx >= 0 && nx < macroWidth && nz >= 0 && nz < macroHeight) {
            if (heightMap[nz][nx] < waterThreshold) { isNearWater[z][x] = true; break; }
          }
        }
      }
    }
  }

  // ===== 步骤3: 蔓延式宏观模板分配（从种子城市开始生长）=====
  const macroGrid: (TemplateType | null)[][] = create2DArray(macroWidth, macroHeight, () => null);

  if (forcedTemplates) {
    for (const ft of forcedTemplates) {
      if (ft.x >= 0 && ft.x < macroWidth && ft.z >= 0 && ft.z < macroHeight) {
        macroGrid[ft.z][ft.x] = ft.type;
      }
    }
  }

  let seedX = Math.floor(macroWidth / 2);
  let seedZ = Math.floor(macroHeight / 2);
  if (heightMap[seedZ]?.[seedX] < waterThreshold) {
    let bestDist = Infinity;
    for (let z = 0; z < macroHeight; z++) {
      for (let x = 0; x < macroWidth; x++) {
        if (heightMap[z][x] >= waterThreshold) {
          const d = Math.abs(x - seedX) + Math.abs(z - seedZ);
          if (d < bestDist) { bestDist = d; seedX = x; seedZ = z; }
        }
      }
    }
  }
  macroGrid[seedZ][seedX] = 'city_block';

  type FrontierEntry = { x: number; z: number; dist: number };
  const frontier: FrontierEntry[] = [{ x: seedX, z: seedZ, dist: 0 }];
  const visited = new Set<string>(`${seedX},${seedZ}`);

  const roadTemplates = new Set<TemplateType>([
    'city_block', 'industrial_zone', 'coastal_city', 'plains_village',
    'suburban', 'port_dock', 'mining_town', 'military_base',
    'power_plant', 'airfield', 'railway_junction', 'highway_intersection',
    'crossroads', 'lake_shore',
  ]);
  const natureTemplates = new Set<TemplateType>([
    'forest_road', 'forest_rail', 'dense_forest', 'farmland',
    'orchard', 'mountain_range', 'open_plains', 'desert_oasis',
    'ancient_ruins', 'canyon',
  ]);
  const wetTemplates = new Set<TemplateType>(['river_delta', 'swamp_wetland']);

  while (frontier.length > 0) {
    const idx = Math.floor(rng.next() * Math.min(frontier.length, 3));
    const entry = frontier.splice(idx, 1)[0];

    const neighbors = [
      { x: entry.x - 1, z: entry.z },
      { x: entry.x + 1, z: entry.z },
      { x: entry.x, z: entry.z - 1 },
      { x: entry.x, z: entry.z + 1 },
    ];
    for (let i = neighbors.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
    }

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= macroWidth || n.z < 0 || n.z >= macroHeight) continue;
      const key = `${n.x},${n.z}`;
      if (visited.has(key)) continue;
      if (macroGrid[n.z][n.x] !== null) continue;

      visited.add(key);

      const rawCandidates = getValidTemplates(
        n.x, n.z, heightMap, moistureMap,
        isNearWater, isNearCity, macroGrid, macroWidth, macroHeight,
      );

      if (rawCandidates.length === 0) {
        macroGrid[n.z][n.x] = 'open_plains';
        frontier.push({ ...n, dist: entry.dist + 1 });
        continue;
      }

      const neighborTypes: TemplateType[] = [];
      for (const nn of [
        { x: n.x - 1, z: n.z }, { x: n.x + 1, z: n.z },
        { x: n.x, z: n.z - 1 }, { x: n.x, z: n.z + 1 },
      ]) {
        if (nn.x >= 0 && nn.x < macroWidth && nn.z >= 0 && nn.z < macroHeight) {
          const nt = macroGrid[nn.z]?.[nn.x];
          if (nt) neighborTypes.push(nt);
        }
      }

      const scoredCandidates = rawCandidates.map(c => {
        let bonus = 0;
        for (const nt of neighborTypes) {
          if (roadTemplates.has(c.type) && roadTemplates.has(nt)) bonus += 15;
          else if (natureTemplates.has(c.type) && natureTemplates.has(nt)) bonus += 12;
          else if (wetTemplates.has(c.type) && wetTemplates.has(nt)) bonus += 10;

          if ((roadTemplates.has(c.type) || c.type === 'crossroads' || c.type === 'highway_intersection') &&
              (roadTemplates.has(nt) || nt === 'crossroads' || nt === 'highway_intersection')) {
            bonus += 20;
          }
          if ((c.type === 'forest_road' || c.type === 'forest_rail') &&
              (natureTemplates.has(nt) || roadTemplates.has(nt))) {
            bonus += 12;
          }
          if ((c.type === 'forest_rail' || c.type === 'railway_junction' || c.type === 'industrial_zone') &&
              (nt === 'forest_rail' || nt === 'railway_junction' || nt === 'industrial_zone')) {
            bonus += 18;
          }
          if (wetTemplates.has(c.type) && isNearWater[n.z][n.x]) bonus += 8;
        }

        const distFactor = Math.max(0.3, 1 - entry.dist / (macroWidth + macroHeight));
        if (roadTemplates.has(c.type) && distFactor > 0.5) bonus += 10 * distFactor;

        return { ...c, score: c.score + bonus };
      });

      const selected = weightedRandomSelect(scoredCandidates, rng);
      macroGrid[n.z][n.x] = selected?.type ?? 'open_plains';
      frontier.push({ ...n, dist: entry.dist + 1 });
    }
  }

  // 填充所有未分配格子
  for (let z = 0; z < macroHeight; z++) {
    for (let x = 0; x < macroWidth; x++) {
      if (!macroGrid[z][x]) macroGrid[z][x] = 'open_plains';
    }
  }

  // 更新近城标记（基于已分配的城市类模板）
  for (let z = 0; z < macroHeight; z++) {
    for (let x = 0; x < macroWidth; x++) {
      const t = macroGrid[z][x];
      if (t === 'city_block' || t === 'industrial_zone' ||
          t === 'coastal_city' || t === 'plains_village' ||
          t === 'suburban' || t === 'military_base' || t === 'port_dock') {
        isNearCity[z][x] = true;
        for (const d of [
          { dx: -1, dz: 0 }, { dx: 1, dz: 0 },
          { dx: 0, dz: -1 }, { dx: 0, dz: 1 },
        ]) {
          const nx = x + d.dx, nz = z + d.dz;
          if (nx >= 0 && nx < macroWidth && nz >= 0 && nz < macroHeight) {
            isNearCity[nz][nx] = true;
          }
        }
      }
    }
  }

  // ===== 步骤4: 微观展开 - 将模板展开为实际地形网格 =====
  // All nulls were filled at step 3, macroGrid is now fully populated
  const filledGrid: TemplateType[][] = macroGrid as TemplateType[][];
  const cells: MapCell[][] = [];
  const macroBounds: HierarchicalMap['macroBounds'] = [];
  let curX = 0, curZ = 0;

  // 第一遍：计算每行的最大高度（因为不同模板可能有不同尺寸）
  const rowMaxHeights: number[] = [];
  for (let mz = 0; mz < macroHeight; mz++) {
    let maxH = 0;
    for (let mx = 0; mx < macroWidth; mx++) {
      maxH = Math.max(maxH, TEMPLATE_REGISTRY[filledGrid[mz][mx]].size);
    }
    rowMaxHeights.push(maxH);
  }

  for (let mz = 0; mz < macroHeight; mz++) {
    const rowMaxH = rowMaxHeights[mz];
    for (let mx = 0; mx < macroWidth; mx++) {
      const templateType = filledGrid[mz][mx];
      const templateDef = TEMPLATE_REGISTRY[templateType];
      const ts = templateDef.size;

      // 收集邻居信息用于模板生成
      const neighbors: TemplateType[] = [];
      if (mx > 0) neighbors.push(filledGrid[mz][mx - 1]);
      if (mx < macroWidth - 1) neighbors.push(filledGrid[mz][mx + 1]);
      if (mz > 0) neighbors.push(filledGrid[mz - 1][mx]);
      if (mz < macroHeight - 1) neighbors.push(filledGrid[mz + 1][mx]);

      const templateGrid = templateDef.generate(rng, mx, mz, neighbors);

      // 将模板写入最终 cells 数组
      const bounds = { x: curX, z: curZ, width: ts, height: ts, type: templateType };
      macroBounds.push(bounds);

      for (let lz = 0; lz < ts; lz++) {
        const globalZ = curZ + lz;
        for (let lx = 0; lx < ts; lx++) {
          const globalX = curX + lx;
          while (cells.length <= globalZ) cells.push([]);
          while (cells[globalZ].length <= globalX) {
            cells[globalZ].push({
              position: { x: cells[globalZ].length, z: globalZ },
              terrain: 'plains',
              unit: null,
              fortified: false,
              capturePointId: null,
            });
          }
          cells[globalZ][globalX] = {
            position: { x: globalX, z: globalZ },
            terrain: templateGrid[lz][lx],
            unit: null,
            fortified: false,
            capturePointId: null,
          };
        }
      }

      curX += ts;
    }
    curX = 0;
    curZ += rowMaxH;
  }

  const finalWidth = cells[0]?.length ?? 0;
  const finalHeight = cells.length;

  // ===== 步骤4.5: 填充变长模板留下的空隙（小模板未覆盖的区域） =====
  for (let z = 0; z < finalHeight; z++) {
    if (!cells[z]) { cells[z] = []; }
    for (let x = 0; x < finalWidth; x++) {
      if (!cells[z][x]) {
        cells[z][x] = { position: { x, z }, terrain: 'plains' as TerrainType, unit: null, fortified: false, capturePointId: null };
      }
    }
  }

  // ===== 步骤5: 边缘通行处理 =====
  ensureEdgePassable(cells, finalWidth, finalHeight);

  // 统计
  const templateCounts: Record<string, number> = {};
  const biomeCounts: Record<string, number> = {};
  for (let z = 0; z < macroHeight; z++)
    for (let x = 0; x < macroWidth; x++) {
      templateCounts[filledGrid[z][x]] = (templateCounts[filledGrid[z][x]] ?? 0) + 1;
    }
  for (let z = 0; z < finalHeight; z++)
    for (let x = 0; x < finalWidth; x++) {
      biomeCounts[cells[z][x].terrain] = (biomeCounts[cells[z][x].terrain] ?? 0) + 1;
    }

  console.log(`[Hierarchical] 地图生成完成 ${finalWidth}x${finalHeight}`, templateCounts, biomeCounts);

  return {
    cells,
    macroGrid: filledGrid,
    macroBounds,
    width: finalWidth,
    height: finalHeight,
    metadata: {
      templateCounts: templateCounts as Record<TemplateType, number>,
      biomeCounts: biomeCounts as Record<TerrainType, number>,
    },
  };
}

// ============================================================
// 第十一部分：分层地图辅助导出函数
// ============================================================

/**
 * 从分层地图中提取子区域（用于战术模式）
 */
export function extractHierarchicalSubRegion(
  hmap: HierarchicalMap,
  regionX: number,
  regionZ: number,
  w: number,
  h: number,
): MapCell[][] {
  const subCells: MapCell[][] = [];
  for (let z = regionZ; z < regionZ + h; z++) {
    const row: MapCell[] = [];
    for (let x = regionX; x < regionX + w; x++) {
      if (z >= 0 && z < hmap.height && x >= 0 && x < hmap.width) {
        row.push({ ...hmap.cells[z][x] });
      } else {
        row.push({
          position: { x: x - regionX, z: z - regionZ },
          terrain: 'plains',
          unit: null,
          fortified: false,
          capturePointId: null,
        });
      }
    }
    subCells.push(row);
  }
  return subCells;
}

/**
 * 快速生成分层战术地图（适合游戏默认尺寸）
 */
export function generateHierarchicalTactical(seed?: number): HierarchicalMap {
  return generateHierarchicalMap({
    seed: seed ?? Math.floor(Math.random() * 100000),
    macroWidth: 4,
    macroHeight: 3,
  });
}

/**
 * 快速生成分层战略地图（更大尺寸）
 */
export function generateHierarchicalStrategic(seed?: number): HierarchicalMap {
  return generateHierarchicalMap({
    seed: seed ?? Math.floor(Math.random() * 100000),
    macroWidth: 8,
    macroHeight: 6,
  });
}

/**
 * 获取所有可用的模板类型列表
 */
export function getAvailableTemplates(): TemplateType[] {
  return Object.keys(TEMPLATE_REGISTRY) as TemplateType[];
}

/**
 * 生成单个独立模板（用于预览或测试）
 * @param type 模板类型
 * @param seed 随机种子
 * @returns NxN 的地形网格
 */
export function generateSingleTemplate(type: TemplateType, seed: number = 42): TerrainType[][] {
  const def = TEMPLATE_REGISTRY[type];
  if (!def) throw new Error(`[ProcGen] 未知模板类型: ${type}`);
  const rng = new SeededRNG(seed);
  return def.generate(rng, 0, 0, []);
}

// ============================================================
// 第十二部分：两阶段融合地图生成系统 (Fused Map Generation)
// ============================================================
//
// 核心思想：
//   将"风蚀地形生成"(阶段1-6) 与 "分层模板系统"(第十部分) 融合为统一管线。
//   阶段1: 风蚀基础地形（宏观区域地形）→ 高度图/湿度图/水域
//   阶段2: 战略覆盖层（城市/道路/据点）→ 区域划分 → 城市选址 → 道路网络 → 据点放置
//   阶段3: 分层模板细节展开 → 上下文感知的模板分配 → 微观地形填充
//
// 管线流程:
//   [阶段1] 风蚀地形 → 高度图/湿度图/水域
//   [阶段2] 区域划分 → 城市选址(山谷/河边) → 道路网络(A*最平坦路径) → 据点放置
//   [阶段3] 每个区域根据上下文分配模板 → 微观地形填充

// ---------- 12.1 融合系统类型定义 ----------

/** 城市数据 */
export interface CityData {
  id: string;
  name: string;
  position: Position;
  size: 'hamlet' | 'town' | 'city' | 'metropolis';
  population: number;
  isCapital?: boolean;
  nearbyTerrain: string;
}

/** 道路段数据 */
export interface RoadSegment {
  from: string;
  to: string;
  path: Position[];
  length: number;
  roadType: 'highway' | 'main_road' | 'dirt_road' | 'rail';
}

/** 据点数据 */
export interface StrongholdData {
  id: string;
  name: string;
  position: Position;
  type: 'fortress' | 'outpost' | 'supply_depot' | 'airfield';
  controllingCity?: string;
}

/** 区域数据 */
export interface RegionData {
  id: string;
  name: string;
  bounds: { x: number; z: number; width: number; height: number };
  centerCity?: string;
  dominantTerrain: TerrainType;
  hasRoad: boolean;
  hasRiver: boolean;
  hasCoast: boolean;
  assignedTemplate: TemplateType | null;
}

/** 融合地图配置 */
export interface FusedMapConfig {
  seed: number;
  baseWidth: number;
  baseHeight: number;
  windDirection: number;
  windStrength: number;
  regionCount: { min: number; max: number };
  cityDensity: number;
  strongholdCount: number;
  roadNetworkDensity: 'sparse' | 'normal' | 'dense';
  microDetailLevel: 'low' | 'medium' | 'high';
  detailGridSize?: number;
}

/** 融合地图结果 */
export interface FusedMapResult {
  baseHeightmap: number[][];
  baseMoisture: number[][];
  baseTemperature: number[][];
  baseCells: MapCell[][];
  cities: CityData[];
  roads: RoadSegment[];
  strongholds: StrongholdData[];
  regions: RegionData[];
  detailedRegions?: Array<{
    regionId: string;
    cells: MapCell[][];
    width: number;
    height: number;
    offsetX: number;
    offsetZ: number;
  }>;
  macroOverlay: MapCell[][];
  /** 像素级局部细节图 - 每个网格点都有一个局部详情 */
  pixelDetails: Array<{
    x: number;
    z: number;
    /** 周围8格的上下文分析 */
    context: {
      cityDensity: number;        // 0-1, 周围城市密度
      roadConnectivity: number;   // 0-1, 道路连通性
      dominantNeighborType: 'urban' | 'suburban' | 'rural' | 'wilderness';
      nearbyCities: Array<{ id: string; name: string; distance: number }>;
      nearbyRoads: Array<{ from: string; to: string; distance: number }>;
    };
    /** 局部性质判定 */
    localType: 'city_center' | 'suburb' | 'town' | 'village' | 'outpost' | 'wilderness' | 'road_junction' | 'crossroads';
    /** 局部细节地形网格 (如 9x9 或 13x13) */
    detailGrid: MapCell[][];
    detailSize: number;
  }>;
  metadata: {
    totalCities: number;
    totalRoads: number;
    totalStrongholds: number;
    totalRegions: number;
    regionTemplateDistribution: Record<string, number>;
    generationTimeMs: number;
  };
}

export interface MegaMapChunk {
  chunkX: number;
  chunkZ: number;
  offsetX: number;
  offsetZ: number;
  cells: MapCell[][];
  width: number;
  height: number;
}

export interface MegaMapResult {
  totalWidth: number;
  totalHeight: number;
  chunkSize: number;       // 128 (4096/32)
  gridChunksX: number;     // 32
  gridChunksZ: number;     // 32
  chunks: MegaMapChunk[];
  overviewCells: MapCell[][];   // 缩略版用于显示 (32×32)
  cities: CityData[];
  roads: RoadSegment[];
  strongholds: StrongholdData[];
  baseHeightmap: number[][];
  seed: number;
}

/** 融合地图默认配置 */
const DEFAULT_FUSED_CONFIG: Required<FusedMapConfig> = {
  seed: 42,
  baseWidth: 80,
  baseHeight: 60,
  windDirection: Math.PI * 0.25,
  windStrength: 0.6,
  regionCount: { min: 4, max: 8 },
  cityDensity: 1.5,
  strongholdCount: 4,
  roadNetworkDensity: 'normal',
  microDetailLevel: 'medium',
  detailGridSize: 13,
};

// ---------- 12.2 城市名称生成器 ----------

const CITY_NAME_PREFIXES = [
  '金', '银', '铜', '铁', '玉', '石', '青', '碧', '赤', '白', '玄', '苍',
  '龙', '凤', '鹤', '鹏', '麟', '虎', '狼', '鹰', '熊', '豹', '蛇', '龟',
  '北', '南', '东', '西', '中', '上', '下', '新', '古', '大', '小', '长',
];

const CITY_NAME_ROOTS = [
  '安', '宁', '平', '定', '昌', '盛', '泰', '华', '荣', '富', '贵', '祥',
  '瑞', '福', '禄', '寿', '喜', '德', '仁', '义', '礼', '智', '信', '忠',
  '阳', '阴', '山', '川', '河', '海', '江', '湖', '林', '原', '野', '漠',
  '城', '关', '堡', '寨', '镇', '港', '埠', '集', '坊', '里', '巷', '街',
  '云', '风', '雨', '雪', '霜', '露', '霞', '虹', '星', '月', '日', '天',
  '松', '竹', '梅', '兰', '菊', '荷', '柳', '桐', '柏', '槐', '杨', '枫',
];

const CITY_NAME_SUFFIXES = [
  '城', '镇', '州', '府', '县', '关', '口', '湾', '浦', '港', '津', '渡',
  '原', '野', '丘', '岭', '峰', '谷', '渊', '泽', '滨', '渚', '岛', '矶',
  '', '', '', '',
];

function generateCityName(rng: SeededRNG): string {
  const usePrefix = rng.next() > 0.35;
  const useSuffix = rng.next() > 0.25;
  let name = '';
  if (usePrefix) name += CITY_NAME_PREFIXES[rng.nextInt(0, CITY_NAME_PREFIXES.length)];
  name += CITY_NAME_ROOTS[rng.nextInt(0, CITY_NAME_ROOTS.length)];
  if (useSuffix) {
    const suffix = CITY_NAME_SUFFIXES[rng.nextInt(0, CITY_NAME_SUFFIXES.length)];
    if (suffix) name += suffix;
  }
  return name;
}

const STRONGHOLD_NAMES: Record<string, string[]> = {
  fortress: ['要塞', '堡垒', '据点', '防线', '关隘', '壁垒'],
  outpost: ['哨站', '前哨', '观察所', '巡逻站', '警戒点', '联络站'],
  supply_depot: ['补给站', '军需库', '后勤中心', '物资中转', '仓库区', '补给基地'],
  airfield: ['机场', '航空站', '飞行场', '空降基地', '航空港', '起降场'],
};

function generateStrongholdName(type: StrongholdData['type'], rng: SeededRNG): string {
  const pool = STRONGHOLD_NAMES[type] ?? STRONGHOLD_NAMES.fortress;
  const prefix = CITY_NAME_PREFIXES[rng.nextInt(0, CITY_NAME_PREFIXES.length)];
  const root = CITY_NAME_ROOTS[rng.nextInt(0, CITY_NAME_ROOTS.length)];
  const suffix = pool[rng.nextInt(0, pool.length)];
  return prefix + root + suffix;
}

// ---------- 12.3 阶段2A：区域划分 ----------

/**
 * 将宏观地图划分为若干区域（类Voronoi，带高度惩罚）
 * 使用 k-means++ 风格初始化区域中心，优先选择中等海拔位置
 * 每个格子分配到最近的区域中心，但跨越山脉/河流时增加代价
 */
function divideIntoRegions(
  heightmap: number[][],
  moisture: number[][],
  cells: MapCell[][],
  countRange: { min: number; max: number },
  rng: SeededRNG,
  width: number,
  height: number,
): RegionData[] {
  const targetCount = rng.nextInt(countRange.min, countRange.max + 1);

  // 统计高度范围用于归一化
  let hMin = Infinity, hMax = -Infinity;
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++) {
      if (heightmap[z][x] > hMax) hMax = heightmap[z][x];
      if (heightmap[z][x] < hMin) hMin = heightmap[z][x];
    }
  const hRange = Math.max(0.001, hMax - hMin);

  // 收集候选中心点（偏好中等海拔）
  const candidates: Array<{ x: number; z: number; score: number }> = [];
  for (let z = 2; z < height - 2; z++) {
    for (let x = 2; x < width - 2; x++) {
      const normalizedH = (heightmap[z][x] - hMin) / hRange;
      // 中等海拔得分最高（0.3~0.7范围最佳）
      const altitudeScore = 1 - Math.abs(normalizedH - 0.5) * 2;
      // 远离边缘
      const edgeScore = 1 - (Math.abs(x - width / 2) / (width / 2) + Math.abs(z - height / 2) / (height / 2)) / 2;
      candidates.push({ x, z, score: altitudeScore * 0.7 + edgeScore * 0.3 });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  // K-means++ 初始化：选第一个中心后，每个新中心与已有中心的距离尽可能远
  const centers: Position[] = [];
  if (candidates.length > 0) {
    centers.push({ x: candidates[0].x, z: candidates[0].z });
  }

  while (centers.length < targetCount && candidates.length > centers.length) {
    let bestIdx = -1;
    let bestDist = -1;
    for (let i = 0; i < Math.min(candidates.length, centers.length * 20); i++) {
      const c = candidates[i];
      let minDistToCenter = Infinity;
      for (const center of centers) {
        const d = manhattanDist(c, center);
        if (d < minDistToCenter) minDistToCenter = d;
      }
      // 加权随机：距离越远越可能被选中
      const weighted = minDistToCenter * (0.8 + rng.next() * 0.4);
      if (weighted > bestDist) {
        bestDist = weighted;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      centers.push({ x: candidates[bestIdx].x, z: candidates[bestIdx].z });
    } else {
      break;
    }
  }

  // 确保至少有目标数量的中心
  while (centers.length < targetCount && candidates.length > centers.length) {
    const idx = centers.length;
    if (idx < candidates.length) {
      centers.push({ x: candidates[idx].x, z: candidates[idx].z });
    } else {
      break;
    }
  }

  // 为每个格子分配到最近的区域（带地形代价）
  const assignment: number[][] = create2DArray(width, height, () => -1);

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      let bestRegion = 0;
      let bestCost = Infinity;
      for (let ri = 0; ri < centers.length; ri++) {
        const c = centers[ri];
        const baseDist = manhattanDist({ x, z }, c);
        // 地形代价：跨山地或水域增加代价
        let terrainPenalty = 0;
        const cellTerrain = cells[z][x]?.terrain;
        if (cellTerrain === 'mountain') terrainPenalty = 8;
        else if (cellTerrain === 'water') terrainPenalty = 15;
        else if (cellTerrain === 'swamp') terrainPenalty = 4;
        else if (cellTerrain === 'forest') terrainPenalty = 1;

        // 高度差惩罚
        const heightDiff = Math.abs(heightmap[z][x] - heightmap[c.z][c.x]);
        terrainPenalty += heightDiff * 5;

        const cost = baseDist + terrainPenalty;
        if (cost < bestCost) {
          bestCost = cost;
          bestRegion = ri;
        }
      }
      assignment[z][x] = bestRegion;
    }
  }

  // 构建区域数据
  const regions: RegionData[] = [];
  for (let ri = 0; ri < centers.length; ri++) {
    const regionCells: Array<{ x: number; z: number }> = [];
    let minX = width, maxX = 0, minZ = height, maxZ = 0;
    const terrainCounts: Record<string, number> = {};
    let hasRoadInRegion = false;
    let hasRiverInRegion = false;
    let hasCoastInRegion = false;

    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        if (assignment[z][x] === ri) {
          regionCells.push({ x, z });
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;

          const t = cells[z][x]?.terrain ?? 'plains';
          terrainCounts[t] = (terrainCounts[t] ?? 0) + 1;
          if (t === 'road') hasRoadInRegion = true;
          if (t === 'water') {
            // 边缘水域视为海岸
            if (x <= 1 || x >= width - 2 || z <= 1 || z >= height - 2) {
              hasCoastInRegion = true;
            }
            // 内部大片水域可能是河流/湖泊
            hasRiverInRegion = true;
          }
        }
      }
    }

    // 找出主导地形
    let dominantTerrain: TerrainType = 'plains';
    let maxCount = 0;
    for (const [t, count] of Object.entries(terrainCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantTerrain = t as TerrainType;
      }
    }

    regions.push({
      id: `region_${ri}`,
      name: `${CITY_NAME_PREFIXES[ri % CITY_NAME_PREFIXES.length]}${CITY_NAME_ROOTS[ri % CITY_NAME_ROOTS.length]}地区`,
      bounds: {
        x: Math.max(0, minX),
        z: Math.max(0, minZ),
        width: Math.max(1, maxX - minX + 1),
        height: Math.max(1, maxZ - minZ + 1),
      },
      dominantTerrain,
      hasRoad: hasRoadInRegion,
      hasRiver: hasRiverInRegion,
      hasCoast: hasCoastInRegion,
      assignedTemplate: null,
    });
  }

  console.log(`[FusedMap] 区域划分完成: ${regions.length} 个区域`);
  return regions;
}

// ---------- 12.4 阶段2B：城市选址 ----------

interface CityCandidate {
  x: number;
  z: number;
  flatness: number;
  waterProximity: number;
  centrality: number;
  heightScore: number;
  totalScore: number;
}

function placeCities(
  regions: RegionData[],
  heightmap: number[][],
  cells: MapCell[][],
  moisture: number[][],
  cityDensity: number,
  rng: SeededRNG,
  width: number,
  height: number,
): CityData[] {
  const cities: CityData[] = [];

  // 预计算局部平坦度
  const localVariance = create2DArray(width, height, () => 0);
  const varRadius = 2;
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, sumSq = 0, count = 0;
      for (let dz = -varRadius; dz <= varRadius; dz++) {
        for (let dx = -varRadius; dx <= varRadius; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
            const v = heightmap[nz][nx];
            sum += v;
            sumSq += v * v;
            count++;
          }
        }
      }
      if (count > 0) {
        const mean = sum / count;
        localVariance[z][x] = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
      }
    }
  }

  // 计算每个格子到最近水域的距离
  const distToWater = create2DArray(width, height, () => Infinity);
  const wq: Array<{ x: number; z: number; d: number }> = [];
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++)
      if (cells[z][x].terrain === 'water') {
        distToWater[z][x] = 0;
        wq.push({ x, z, d: 0 });
      }
  let wi = 0;
  while (wi < wq.length) {
    const cur = wq[wi++];
    for (const d of [{ x: -1, z: 0 }, { x: 1, z: 0 }, { x: 0, z: -1 }, { x: 0, z: 1 }]) {
      const nx = cur.x + d.x, nz = cur.z + d.z;
      if (nx >= 0 && nx < width && nz >= 0 && nz < height && distToWater[nz][nx] > cur.d + 1) {
        distToWater[nz][nx] = cur.d + 1;
        wq.push({ x: nx, z: nz, d: cur.d + 1 });
      }
    }
  }

  // 对每个区域收集候选城市位置并评分
  const regionCandidates: Map<number, CityCandidate[]> = new Map();

  for (let ri = 0; ri < regions.length; ri++) {
    const reg = regions[ri];
    const candidates: CityCandidate[] = [];
    const scanRadius = 3;

    for (let z = reg.bounds.z; z < reg.bounds.z + reg.bounds.height; z++) {
      for (let x = reg.bounds.x; x < reg.bounds.x + reg.bounds.width; x++) {
        if (x < 0 || x >= width || z < 0 || z >= height) continue;
        if (cells[z][x].terrain === 'water' || cells[z][x].terrain === 'mountain') continue;

        // 平坦度评分
        const flatness = Math.max(0, 1 - localVariance[z][x] / 0.12);

        // 近水评分
        const waterProximity = Math.max(0, 1 - distToWater[z][x] / (Math.min(width, height) * 0.2));

        // 中心性评分（相对于区域中心）
        const cx = reg.bounds.x + reg.bounds.width / 2;
        const cz = reg.bounds.z + reg.bounds.height / 2;
        const centrality = 1 - (Math.abs(x - cx) + Math.abs(z - cz)) / (reg.bounds.width + reg.bounds.height);

        // 高度评分（偏好低地但不最低洼）
        let hMinL = Infinity, hMaxL = -Infinity;
        for (let dz = -scanRadius; dz <= scanRadius; dz++)
          for (let dx = -scanRadius; dx <= scanRadius; dx++) {
            const nx = x + dx, nz = z + dz;
            if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
              const hv = heightmap[nz][nx];
              if (hv < hMinL) hMinL = hv;
              if (hv > hMaxL) hMaxL = hv;
            }
          }
        const localHRange = Math.max(0.001, hMaxL - hMinL);
        const normalizedLocalH = (heightmap[z][x] - hMinL) / localHRange;
        // 偏好山谷底部附近（normalizedLocalH 在 0~0.35 范围）
        const heightScore = normalizedLocalH < 0.4 ? 1 - normalizedLocalH / 0.4 : Math.max(0, 0.5 - (normalizedLocalH - 0.4) * 1.5);

        // 周围平原/水域数量检查
        let plainsOrWaterNearby = 0;
        const checkRadius = 5;
        for (let dz = -checkRadius; dz <= checkRadius; dz++)
          for (let dx = -checkRadius; dx <= checkRadius; dx++) {
            const nx = x + dx, nz = z + dz;
            if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
              const t = cells[nz][nx].terrain;
              if (t === 'plains' || t === 'water') plainsOrWaterNearby++;
            }
          }

        const totalScore = flatness * 3.0 + waterProximity * 2.5 + centrality * 1.0 + heightScore * 1.5 +
          (plainsOrWaterNearby > 10 ? 1.5 : 0);

        if (flatness > 0.25 && totalScore > 1.5) {
          candidates.push({ x, z, flatness, waterProximity, centrality, heightScore, totalScore });
        }
      }
    }

    candidates.sort((a, b) => b.totalScore - a.totalScore);
    regionCandidates.set(ri, candidates);
  }

  // 全局寻找大都市候选（全图最高分）
  const allMetropolisCandidates: Array<{ candidate: CityCandidate; regionIndex: number }> = [];
  for (const [ri, cands] of Array.from(regionCandidates.entries())) {
    if (cands.length > 0) {
      allMetropolisCandidates.push({ candidate: cands[0], regionIndex: ri });
    }
  }
  allMetropolisCandidates.sort((a, b) => b.candidate.totalScore - a.candidate.totalScore);

  // 放置大都市（最多1个）
  const placedPositions: Set<string> = new Set();
  const minCitySeparation = Math.max(4, Math.floor(Math.min(width, height) / 10));

  if (allMetropolisCandidates.length > 0 && allMetropolisCandidates[0].candidate.totalScore > 6) {
    const mc = allMetropolisCandidates[0].candidate;
    const posKey = `${mc.x},${mc.z}`;
    cities.push({
      id: `city_metropolis_0`,
      name: generateCityName(rng) + '都',
      position: { x: mc.x, z: mc.z },
      size: 'metropolis',
      population: rng.nextInt(500000, 2000000),
      isCapital: true,
      nearbyTerrain: cells[mc.z][mc.x].terrain,
    });
    placedPositions.add(posKey);
    regions[allMetropolisCandidates[0].regionIndex].centerCity = cities[cities.length - 1].id;
  }

  // 为每个区域放置城市（基于密度和评分百分位）
  for (let ri = 0; ri < regions.length; ri++) {
    const cands = regionCandidates.get(ri) ?? [];
    if (cands.length === 0) continue;

    const regionTargetCities = Math.max(1, Math.round(cityDensity * (0.8 + rng.next() * 0.4)));
    let placedInRegion = 0;

    for (let ci = 0; ci < cands.length && placedInRegion < regionTargetCities; ci++) {
      const cand = cands[ci];
      const posKey = `${cand.x},${cand.z}`;
      if (placedPositions.has(posKey)) continue;

      // 检查与现有城市的最小间距
      let tooClose = false;
      for (const existing of cities) {
        if (manhattanDist(cand, existing.position) < minCitySeparation) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // 根据评分百分位决定城市规模
      let size: CityData['size'];
      const percentile = ci / Math.max(1, cands.length);
      if (percentile < 0.08) size = 'city';
      else if (percentile < 0.30) size = 'town';
      else size = 'hamlet';

      const popRanges: Record<CityData['size'], [number, number]> = {
        metropolis: [500000, 2000000],
        city: [80000, 400000],
        town: [8000, 50000],
        hamlet: [200, 3000],
      };
      const [pmin, pmax] = popRanges[size];

      cities.push({
        id: `city_${ri}_${cities.length}`,
        name: generateCityName(rng),
        position: { x: cand.x, z: cand.z },
        size,
        population: rng.nextInt(pmin, pmax),
        nearbyTerrain: cells[cand.z][cand.x].terrain,
      });

      placedPositions.add(posKey);
      placedInRegion++;

      // 第一个放置的城市作为该区域的中心城市
      if (!regions[ri].centerCity) {
        regions[ri].centerCity = cities[cities.length - 1].id;
      }
    }
  }

  console.log(`[FusedMap] 城市放置完成: ${cities.length} 座城市`);
  return cities;
}

// ---------- 12.5 阶段2C：道路网络生成 ----------

/**
 * 地形感知 A* 寻路（用于道路生成）
 * 代价函数综合考虑高度差、距离、地形类型、水域规避
 */
function findTerrainAwarePath(
  heightmap: number[][],
  cells: MapCell[][],
  start: Position,
  goal: Position,
  width: number,
  height: number,
): Position[] {
  const key = (p: Position) => `${p.x},${p.z}`;
  const parentMap = new Map<string, string | null>();
  parentMap.set(key(start), null);
  const gScore = new Map<string, number>();
  gScore.set(key(start), 0);

  const openList: string[] = [key(start)];
  const closedSet = new Set<string>();

  // 8方向寻路（道路可以斜向走）
  const dirs8 = [
    { x: 0, z: -1 }, { x: 0, z: 1 },
    { x: -1, z: 0 }, { x: 1, z: 0 },
    { x: -1, z: -1 }, { x: 1, z: -1 },
    { x: -1, z: 1 }, { x: 1, z: 1 },
  ];

  while (openList.length > 0) {
    openList.sort((a, b) => {
      const fa = (gScore.get(a) ?? Infinity) + manhattanDist(
        { x: parseInt(a.split(',')[0]), z: parseInt(a.split(',')[1]) }, goal
      );
      const fb = (gScore.get(b) ?? Infinity) + manhattanDist(
        { x: parseInt(b.split(',')[0]), z: parseInt(b.split(',')[1]) }, goal
      );
      return fa - fb;
    });

    const currentKey = openList.shift()!;
    const cx = parseInt(currentKey.split(',')[0]);
    const cz = parseInt(currentKey.split(',')[1]);

    if (cx === goal.x && cz === goal.z) {
      const path: Position[] = [];
      let ck: string | null = currentKey;
      while (ck !== null) {
        const parts = ck.split(',');
        path.unshift({ x: parseInt(parts[0]), z: parseInt(parts[1]) });
        ck = parentMap.get(ck) ?? null;
      }
      return path;
    }

    closedSet.add(currentKey);

    for (const d of dirs8) {
      const nx = cx + d.x;
      const nz = cz + d.z;
      if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;

      const nk = `${nx},${nz}`;
      if (closedSet.has(nk)) continue;

      const cell = cells[nz][nx];
      // 深水不可通行
      if (cell.terrain === 'water') continue;

      // 地形移动代价
      let terrainCost = 1;
      if (cell.terrain === 'mountain') terrainCost = 8;
      else if (cell.terrain === 'swamp') terrainCost = 5;
      else if (cell.terrain === 'forest') terrainCost = 2.5;
      else if (cell.terrain === 'desert') terrainCost = 1.5;

      // 高度差代价
      const heightDiff = Math.abs(heightmap[nz][nx] - heightmap[cz][cx]);
      const slopeCost = heightDiff * 10;

      // 斜向移动略高代价
      const diagonalCost = (d.x !== 0 && d.z !== 0) ? 1.414 : 1;

      const moveCost = (terrainCost + slopeCost) * diagonalCost;
      const tentativeG = (gScore.get(currentKey) ?? 0) + moveCost;

      if (!gScore.has(nk) || tentativeG < (gScore.get(nk) ?? Infinity)) {
        parentMap.set(nk, currentKey);
        gScore.set(nk, tentativeG);
        if (!openList.includes(nk)) openList.push(nk);
      }
    }
  }

  return [];
}

/**
 * 根据两个城市的大小决定道路类型
 */
function determineRoadType(fromSize: CityData['size'], toSize: CityData['size']): RoadSegment['roadType'] {
  const sizeRank: Record<CityData['size'], number> = {
    metropolis: 4, city: 3, town: 2, hamlet: 1,
  };
  const fromRank = sizeRank[fromSize];
  const toRank = sizeRank[toSize];
  const avgRank = (fromRank + toRank) / 2;

  if (avgRank >= 3.5) return 'highway';
  if (avgRank >= 2.5) return 'main_road';
  return 'dirt_road';
}

/**
 * 生成道路网络
 * 使用最小生成树(MST)保证连通性，然后按密度添加额外边
 * 对每条边使用地形感知A*寻路
 */
function generateRoadNetwork(
  cities: CityData[],
  heightmap: number[][],
  cells: MapCell[][],
  density: 'sparse' | 'normal' | 'dense',
  rng: SeededRNG,
  width: number,
  height: number,
): RoadSegment[] {
  if (cities.length < 2) return [];

  const roads: RoadSegment[] = [];
  const n = cities.length;

  // 构建所有可能的边及其权重（欧几里得距离）
  const edges: Array<{ from: number; to: number; weight: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.push({
        from: i,
        to: j,
        weight: dist(cities[i].position, cities[j].position),
      });
    }
  }
  edges.sort((a, b) => a.weight - b.weight);

  // Union-Find 用于 MST
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(u: number): number {
    if (parent[u] !== u) parent[u] = find(parent[u]);
    return parent[u];
  }
  function union(u: number, v: number): void {
    const pu = find(u), pv = find(v);
    if (pu !== pv) parent[pu] = pv;
  }

  // Kruskal MST
  const mstEdges: typeof edges = [];
  for (const e of edges) {
    if (find(e.from) !== find(e.to)) {
      union(e.from, e.to);
      mstEdges.push(e);
    }
  }

  // 大都市额外连接（hub节点策略）
  const metropolisIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (cities[i].size === 'metropolis') metropolisIndices.push(i);
  }

  // 根据密度决定额外边的数量
  const extraEdgeRatio = density === 'sparse' ? 0.2 : density === 'normal' ? 0.45 : 0.75;
  const targetExtraEdges = Math.floor(mstEdges.length * extraEdgeRatio);

  // 收集所有非MST边作为备选
  const nonMSTEdges = edges.filter(me => !mstEdges.some(e => e.from === me.from && e.to === me.to));

  // 优先添加连接大都市的边
  const hubExtras: typeof edges = [];
  const normalExtras: typeof edges = [];
  for (const e of nonMSTEdges) {
    const connectsHub = metropolisIndices.includes(e.from) || metropolisIndices.includes(e.to);
    if (connectsHub) hubExtras.push(e);
    else normalExtras.push(e);
  }

  // 按权重排序后选取最短的额外边
  hubExtras.sort((a, b) => a.weight - b.weight);
  normalExtras.sort((a, b) => a.weight - b.weight);

  const selectedExtraEdges = [...hubExtras.slice(0, Math.ceil(targetExtraEdges * 0.6))];
  const remainingSlots = targetExtraEdges - selectedExtraEdges.length;
  selectedExtraEdges.push(...normalExtras.slice(0, remainingSlots));

  // 合并所有需要修建的道路边
  const allRoadEdges = [...mstEdges, ...selectedExtraEdges];

  // 对每条边进行A*寻路
  const usedPaths = new Set<string>();
  for (const edge of allRoadEdges) {
    const fromCity = cities[edge.from];
    const toCity = cities[edge.to];
    const path = findTerrainAwarePath(heightmap, cells, fromCity.position, toCity.position, width, height);

    if (path.length >= 2) {
      const roadType = determineRoadType(fromCity.size, toCity.size);

      // 可能升级为铁路（大城市之间有概率）
      const finalRoadType: RoadSegment['roadType'] =
        (fromCity.size === 'metropolis' || toCity.size === 'metropolis') &&
        rng.next() < 0.2 ? 'rail' : roadType;

      roads.push({
        from: fromCity.id,
        to: toCity.id,
        path,
        length: path.length,
        roadType: finalRoadType,
      });

      // 更新宏观叠加层中的道路标记
      for (const p of path) {
        const cell = cells[p.z][p.x];
        if (cell.terrain !== 'city' && cell.terrain !== 'water' && cell.terrain !== 'mountain') {
          if (finalRoadType === 'highway' || finalRoadType === 'rail') {
            cell.terrain = 'road';
          } else if (finalRoadType === 'main_road' && (cell.terrain === 'plains' || cell.terrain === 'desert')) {
            cell.terrain = 'road';
          } else if (finalRoadType === 'dirt_road' && cell.terrain === 'plains') {
            cell.terrain = 'road';
          }
        }
      }
    }
  }

  console.log(`[FusedMap] 道路网络生成完成: ${roads.length} 条道路`);
  return roads;
}

// ---------- 12.6 阶段2D：据点放置 ----------

function placeStrongholds(
  cities: CityData[],
  roads: RoadSegment[],
  heightmap: number[][],
  cells: MapCell[][],
  count: number,
  rng: SeededRNG,
  width: number,
  height: number,
): StrongholdData[] {
  const strongholds: StrongholdData[] = [];

  // 收集所有道路经过的格子
  const roadCells = new Set<string>();
  for (const road of roads) {
    for (const p of road.path) {
      roadCells.add(`${p.x},${p.z}`);
    }
  }

  // 计算全局高度中位数用于判断"高地"
  const allHeights: number[] = [];
  for (let z = 0; z < height; z++)
    for (let x = 0; x < width; x++)
      allHeights.push(heightmap[z][x]);
  allHeights.sort((a, b) => a - b);
  const medianHeight = allHeights[Math.floor(allHeights.length / 2)];

  // 按据点类型分别收集候选位置
  interface StrongholdCandidate {
    x: number; z: number;
    type: StrongholdData['type'];
    score: number;
    nearbyCity?: string;
  }

  const fortressCandidates: StrongholdCandidate[] = [];
  const outpostCandidates: StrongholdCandidate[] = [];
  const depotCandidates: StrongholdCandidate[] = [];
  const airfieldCandidates: StrongholdCandidate[] = [];

  // 要塞候选：道路附近的高地
  for (const rc of Array.from(roadCells).slice(0, Math.min(roadCells.size, 200))) {
    const parts = rc.split(',');
    const rx = parseInt(parts[0]), rz = parseInt(parts[1]);
    // 搜索周围的高地
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++) {
        const fx = rx + dx, fz = rz + dz;
        if (fx < 0 || fx >= width || fz < 0 || fz >= height) continue;
        if (cells[fz][fx].terrain === 'water' || cells[fz][fx].terrain === 'city') continue;
        if (heightmap[fz][fx] > medianHeight + 0.05) {
          // 找到附近的控制城市
          let nearestCity: CityData | undefined;
          let nearestDist = Infinity;
          for (const city of cities) {
            const d = manhattanDist({ x: fx, z: fz }, city.position);
            if (d < nearestDist) { nearestDist = d; nearestCity = city; }
          }
          fortressCandidates.push({
            x: fx, z: fz, type: 'fortress',
            score: (heightmap[fz][fx] - medianHeight) * 10 + (nearestDist < 8 ? 3 : 0),
            nearbyCity: nearestCity?.id,
          });
        }
      }
    }
  }

  // 前哨候选：远离城市的边缘地带
  const edgeMargin = Math.floor(Math.min(width, height) * 0.1);
  for (let ez = 0; ez < height; ez += 3) {
    for (let ex = 0; ex < width; ex += 3) {
      if (ex < edgeMargin || ex >= width - edgeMargin || ez < edgeMargin || ez >= height - edgeMargin) {
        if (cells[ez][ex].terrain === 'water' || cells[ez][ex].terrain === 'mountain') continue;
        let minCityDist = Infinity;
        for (const city of cities) {
          const d = manhattanDist({ x: ex, z: ez }, city.position);
          if (d < minCityDist) minCityDist = d;
        }
        if (minCityDist > 6) {
          outpostCandidates.push({
            x: ex, z: ez, type: 'outpost',
            score: minCityDist * 0.5 + (cells[ez][ex].terrain === 'forest' ? 2 : 0),
          });
        }
      }
    }
  }

  // 补给站候选：大城市附近
  for (const city of cities) {
    if (city.size === 'metropolis' || city.size === 'city') {
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const dxPos = city.position.x + dx, dzPos = city.position.z + dz;
          if (dxPos < 0 || dxPos >= width || dzPos < 0 || dzPos >= height) continue;
          if (cells[dzPos][dxPos].terrain !== 'plains' && cells[dzPos][dxPos].terrain !== 'road') continue;
          depotCandidates.push({
            x: dxPos, z: dzPos, type: 'supply_depot',
            score: 5 - manhattanDist({ x: dxPos, z: dzPos }, city.position) * 0.3,
            nearbyCity: city.id,
          });
        }
      }
    }
  }

  // 机场候选：远离山脉的大片平坦区域
  for (let z = 3; z < height - 3; z += 4) {
    for (let x = 3; x < width - 3; x += 4) {
      if (cells[z][x].terrain !== 'plains') continue;
      // 检查周围是否平坦且无山地
      let flatCount = 0;
      let nearMountain = false;
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
            if (cells[nz][nx].terrain === 'mountain') nearMountain = true;
            if (cells[nz][nx].terrain === 'plains' || cells[nz][nx].terrain === 'desert') flatCount++;
          }
        }
      }
      if (flatCount >= 30 && !nearMountain) {
        airfieldCandidates.push({
          x, z, type: 'airfield',
          score: flatCount * 0.15,
        });
      }
    }
  }

  // 排序并选择
  fortressCandidates.sort((a, b) => b.score - a.score);
  outpostCandidates.sort((a, b) => b.score - a.score);
  depotCandidates.sort((a, b) => b.score - a.score);
  airfieldCandidates.sort((a, b) => b.score - a.score);

  const placedPos = new Set<string>();

  // 分配据点（按优先级轮询各类型）
  const typePools: Array<{ pool: StrongholdCandidate[]; type: StrongholdData['type']; quota: number }> = [
    { pool: fortressCandidates, type: 'fortress', quota: Math.ceil(count * 0.35) },
    { pool: outpostCandidates, type: 'outpost', quota: Math.ceil(count * 0.25) },
    { pool: depotCandidates, type: 'supply_depot', quota: Math.ceil(count * 0.25) },
    { pool: airfieldCandidates, type: 'airfield', quota: Math.max(1, Math.floor(count * 0.15)) },
  ];

  let placed = 0;
  for (const tp of typePools) {
    for (const cand of tp.pool) {
      if (placed >= count) break;
      const posKey = `${cand.x},${cand.z}`;
      if (placedPos.has(posKey)) continue;
      // 不放在城市上
      let onCity = false;
      for (const city of cities) {
        if (city.position.x === cand.x && city.position.z === cand.z) { onCity = true; break; }
      }
      if (onCity) continue;

      strongholds.push({
        id: `stronghold_${strongholds.length}`,
        name: generateStrongholdName(cand.type, rng),
        position: { x: cand.x, z: cand.z },
        type: cand.type,
        controllingCity: cand.nearbyCity,
      });
      placedPos.add(posKey);
      placed++;
    }
  }

  // 在宏观叠加层上标记据点
  for (const sh of strongholds) {
    const cell = cells[sh.position.z][sh.position.x];
    if (sh.type === 'fortress') cell.terrain = 'fortress';
    else if (sh.type === 'airfield' || sh.type === 'supply_depot') {
      if (cell.terrain === 'plains' || cell.terrain === 'desert') cell.terrain = 'city';
    }
  }

  console.log(`[FusedMap] 据点放置完成: ${strongholds.length} 个据点`);
  return strongholds;
}

// ---------- 12.7 阶段3：上下文感知模板分配 ----------

interface RegionContext {
  hasHighway: boolean;
  hasMainRoad: boolean;
  hasRail: boolean;
  hasAnyRoad: boolean;
  hasCity: boolean;
  citySize: CityData['size'] | null;
  nearWater: boolean;
  isMountainous: boolean;
  isFlat: boolean;
  neighborTemplates: TemplateType[];
}

function analyzeRegionContext(
  region: RegionData,
  cities: CityData[],
  roads: RoadSegment[],
  _strongholds: StrongholdData[],
  cells: MapCell[][],
  regions: RegionData[],
  ri: number,
): RegionContext {
  const ctx: RegionContext = {
    hasHighway: false,
    hasMainRoad: false,
    hasRail: false,
    hasAnyRoad: false,
    hasCity: false,
    citySize: null,
    nearWater: region.hasCoast || region.hasRiver,
    isMountainous: region.dominantTerrain === 'mountain',
    isFlat: region.dominantTerrain === 'plains' || region.dominantTerrain === 'farmland' as never || region.dominantTerrain === 'desert',
    neighborTemplates: [],
  };

  // 检查区域内是否有道路通过
  for (const road of roads) {
    for (const p of road.path) {
      if (p.x >= region.bounds.x && p.x < region.bounds.x + region.bounds.width &&
          p.z >= region.bounds.z && p.z < region.bounds.z + region.bounds.height) {
        ctx.hasAnyRoad = true;
        if (road.roadType === 'highway') ctx.hasHighway = true;
        if (road.roadType === 'main_road') ctx.hasMainRoad = true;
        if (road.roadType === 'rail') ctx.hasRail = true;
      }
    }
  }

  // 检查区域内是否有城市
  for (const city of cities) {
    if (city.position.x >= region.bounds.x && city.position.x < region.bounds.x + region.bounds.width &&
        city.position.z >= region.bounds.z && city.position.z < region.bounds.z + region.bounds.height) {
      ctx.hasCity = true;
      if (!ctx.citySize || (city.size === 'metropolis' || (city.size === 'city' && ctx.citySize !== 'metropolis'))) {
        ctx.citySize = city.size;
      }
    }
  }

  // 收集相邻区域的已分配模板
  const dirOffsets = [
    { dx: -1, dz: 0 }, { dx: 1, dz: 0 },
    { dx: 0, dz: -1 }, { dx: 0, dz: 1 },
  ];
  for (const d of dirOffsets) {
    const ni = ri < 0 ? ri : ri; // 保持原有索引逻辑
    const nbrX = region.bounds.x + region.bounds.width / 2 + d.dx * (region.bounds.width / 2 + 1);
    const nbrZ = region.bounds.z + region.bounds.height / 2 + d.dz * (region.bounds.height / 2 + 1);
    for (let nri = 0; nri < regions.length; nri++) {
      if (nri === ni) continue;
      const nr = regions[nri];
      if (nbrX >= nr.bounds.x && nbrX < nr.bounds.x + nr.bounds.width &&
          nbrZ >= nr.bounds.z && nbrZ < nr.bounds.z + nr.bounds.height) {
        if (nr.assignedTemplate) ctx.neighborTemplates.push(nr.assignedTemplate);
      }
    }
  }

  // 补充判断山地（如果主导地形不是 mountain 但区域内有大量 mountain 格子）
  if (!ctx.isMountainous) {
    let mountainCount = 0;
    let totalCount = 0;
    for (let z = region.bounds.z; z < region.bounds.z + region.bounds.height && z < cells.length; z++) {
      for (let x = region.bounds.x; x < region.bounds.x + region.bounds.width && x < (cells[z]?.length ?? 0); x++) {
        totalCount++;
        if (cells[z][x].terrain === 'mountain') mountainCount++;
      }
    }
    if (totalCount > 0 && mountainCount / totalCount > 0.35) {
      ctx.isMountainous = true;
    }
  }

  return ctx;
}

function assignContextAwareTemplates(
  regions: RegionData[],
  cities: CityData[],
  roads: RoadSegment[],
  strongholds: StrongholdData[],
  cells: MapCell[][],
  heightmap: number[][],
  rng: SeededRNG,
): void {
  for (let ri = 0; ri < regions.length; ri++) {
    const region = regions[ri];
    const context = analyzeRegionContext(region, cities, roads, strongholds, cells, regions, ri);

    let bestTemplate: TemplateType = 'open_plains';
    let bestScore = -Infinity;

    for (const [type, def] of Object.entries(TEMPLATE_REGISTRY)) {
      let score = def.weight;

      // 道路上下文加成
      if (context.hasHighway && ['highway_intersection', 'crossroads', 'city_block', 'industrial_zone'].includes(type)) score += 30;
      if (context.hasMainRoad && ['forest_road', 'suburban', 'plains_village', 'crossroads'].includes(type)) score += 25;
      if (context.hasRail && ['forest_rail', 'railway_junction', 'industrial_zone'].includes(type)) score += 25;

      // 城市上下文加成
      if (context.hasCity && context.citySize === 'metropolis' &&
          ['city_block', 'industrial_zone', 'suburban', 'power_plant', 'highway_intersection'].includes(type)) score += 28;
      if (context.hasCity && context.citySize === 'city' &&
          ['suburban', 'plains_village', 'city_block', 'coastal_city', 'port_dock'].includes(type)) score += 22;
      if (context.hasCity && context.citySize === 'town' &&
          ['plains_village', 'farmland', 'orchard', 'suburban'].includes(type)) score += 18;
      if (context.hasCity && context.citySize === 'hamlet' &&
          ['open_plains', 'farmland', 'orchard', 'plains_village'].includes(type)) score += 14;

      // 水域上下文加成
      if (context.nearWater && !context.hasCity &&
          ['lake_shore', 'river_delta', 'coastal_city', 'port_dock', 'swamp_wetland'].includes(type)) score += 24;
      if (context.nearWater && context.hasCity && context.citySize !== 'hamlet' &&
          ['coastal_city', 'port_dock', 'lake_shore'].includes(type)) score += 22;

      // 地形上下文加成
      if (context.isMountainous &&
          ['mountain_range', 'canyon', 'mining_town', 'ancient_ruins', 'fortress_hill'].includes(type)) score += 26;
      if (context.isFlat && !context.hasAnyRoad && !context.hasCity &&
          ['farmland', 'orchard', 'open_plains', 'desert_oasis', 'dense_forest'].includes(type)) score += 20;

      // 据点上下文加成
      const hasFortress = strongholds.some(s =>
        s.type === 'fortress' &&
        s.position.x >= region.bounds.x && s.position.x < region.bounds.x + region.bounds.width &&
        s.position.z >= region.bounds.z && s.position.z < region.bounds.z + region.bounds.height
      );
      const hasAirfield = strongholds.some(s =>
        s.type === 'airfield' &&
        s.position.x >= region.bounds.x && s.position.x < region.bounds.x + region.bounds.width &&
        s.position.z >= region.bounds.z && s.position.z < region.bounds.z + region.bounds.height
      );
      if (hasFortress && ['fortress_hill', 'military_base', 'mountain_range'].includes(type)) score += 24;
      if (hasAirfield && ['airfield', 'open_plains', 'military_base'].includes(type)) score += 22;

      // 邻居兼容性加成（BFS风格的一致性奖励）
      for (const nt of context.neighborTemplates) {
        if (areTypesCompatible(type as TemplateType, nt)) score += 8;
        if (type === nt) score += 12;
      }

      // 加入少量随机扰动避免千篇一律
      score += rng.next() * 5;

      if (score > bestScore) {
        bestScore = score;
        bestTemplate = type as TemplateType;
      }
    }

    region.assignedTemplate = bestTemplate;
  }

  // 日志统计
  const templateDist: Record<string, number> = {};
  for (const r of regions) {
    if (r.assignedTemplate) templateDist[r.assignedTemplate] = (templateDist[r.assignedTemplate] ?? 0) + 1;
  }
  console.log(`[FusedMap] 模板分配完成`, templateDist);
}

// ---------- 12.8 阶段3b：微观细节展开 ----------

function expandDetailedRegions(
  regions: RegionData[],
  heightmap: number[][],
  moisture: number[][],
  cells: MapCell[][],
  detailLevel: 'low' | 'medium' | 'high',
  rng: SeededRNG,
  width: number,
  height: number,
): NonNullable<FusedMapResult['detailedRegions']> {
  const detailedRegions: NonNullable<FusedMapResult['detailedRegions']> = [];

  // 预先填充占位，确保索引与 regions 一一对应
  for (const region of regions) {
    const placeholderCells: MapCell[][] = create2DArray(
      Math.max(1, region.bounds.width), Math.max(1, region.bounds.height),
      () => ({ position: { x: 0, z: 0 }, terrain: 'plains' as TerrainType, unit: null, fortified: false, capturePointId: null })
    );
    detailedRegions.push({ regionId: region.id, cells: placeholderCells, width: region.bounds.width, height: region.bounds.height, offsetX: region.bounds.x, offsetZ: region.bounds.z });
  }

  // 根据 detailLevel 决定微观展开分辨率
  const resolutionMultiplier: Record<typeof detailLevel, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };
  const mult = resolutionMultiplier[detailLevel];

  let ri = 0;  // 区域索引计数器，确保 detailedRegions 与 regions 索引对应

  for (const region of regions) {
    if (!region.assignedTemplate) continue;

    const templateDef = TEMPLATE_REGISTRY[region.assignedTemplate];
    if (!templateDef) continue;

    // 微观展开尺寸
    const detailWidth = region.bounds.width * mult;
    const detailHeight = region.bounds.height * mult;

    // 收集邻居模板信息
    const neighbors: TemplateType[] = [];
    for (const other of regions) {
      if (other.id === region.id) continue;
      // 检查是否相邻
      const adjacent =
        (region.bounds.x + region.bounds.width === other.bounds.x ||
         other.bounds.x + other.bounds.width === region.bounds.x ||
         region.bounds.z + region.bounds.height === other.bounds.z ||
         other.bounds.z + other.bounds.height === region.bounds.z);
      if (adjacent && other.assignedTemplate) {
        neighbors.push(other.assignedTemplate);
      }
    }

    // 生成微观模板网格
    const templateGrid = templateDef.generate(rng, region.bounds.x, region.bounds.z, neighbors);

    // 将模板映射到详细区域（考虑缩放）
    const detailCells: MapCell[][] = create2DArray(detailWidth, detailHeight, (): MapCell => ({
      position: { x: 0, z: 0 },
      terrain: 'plains',
      unit: null,
      fortified: false,
      capturePointId: null,
    }));

    const ts = templateDef.size;
    for (let lz = 0; lz < detailHeight; lz++) {
      for (let lx = 0; lx < detailWidth; lx++) {
        // 从原始区域采样基础地形，然后用模板覆盖
        const srcX = region.bounds.x + Math.floor(lx / mult);
        const srcZ = region.bounds.z + Math.floor(lz / mult);

        let baseTerrain: TerrainType = 'plains';
        if (srcZ >= 0 && srcZ < height && srcX >= 0 && srcX < width) {
          baseTerrain = cells[srcZ][srcX].terrain;
        }

        // 映射到模板坐标
        const tx = Math.floor((lx / detailWidth) * ts);
        const tz = Math.floor((lz / detailHeight) * ts);

        let finalTerrain: TerrainType = baseTerrain;
        if (tz < ts && tx < ts && tz < templateGrid.length && tx < (templateGrid[tz]?.length ?? 0)) {
          const templateTerrain = templateGrid[tz][tx];
          // 模板地形优先，但保留关键战略地形
          if (baseTerrain !== 'water' && baseTerrain !== 'fortress') {
            finalTerrain = templateTerrain;
          }
        }

        detailCells[lz][lx] = {
          position: { x: lx, z: lz },
          terrain: finalTerrain,
          unit: null,
          fortified: false,
          capturePointId: null,
        };
      }
    }

    // 原地更新（保持索引对应）
    detailedRegions[ri] = {
      regionId: region.id,
      cells: detailCells,
      width: detailWidth,
      height: detailHeight,
      offsetX: region.bounds.x,
      offsetZ: region.bounds.z,
    };
    ri++;
  }

  return detailedRegions;
}

// ---------- 12.9 主入口函数 ----------

/**
 * 融合两阶段地图生成器
 *
 * 管线流程:
 *   [阶段1] 风蚀地形 → 高度图/湿度图/水域
 *   [阶段2] 区域划分 → 城市选址(山谷/河边) → 道路网络(A*最平坦路径) → 据点放置
 *   [阶段3] 每个区域根据上下文分配模板 → 微观地形填充
 *
 * @param partialConfig - 部分融合配置（未提供的字段使用默认值）
 * @returns 完整的融合地图结果
 */

export interface MegaMapConfig {
  seed: number;
  totalSize: number;          // 4096
  gridDivisions: number;      // 32 → 每块 128×128
  cityDensity: number;
  roadDensity: 'sparse' | 'normal' | 'dense';
}

const DEFAULT_MEGA_CONFIG: Required<MegaMapConfig> = {
  seed: 42,
  totalSize: 4096,
  gridDivisions: 32,
  cityDensity: 2.0,
  roadDensity: 'normal',
};

export function generateMegaMap(partialConfig: Partial<MegaMapConfig> = {}): MegaMapResult {
  const config = { ...DEFAULT_MEGA_CONFIG, ...partialConfig };
  const startTime = Date.now();

  const TOTAL = config.totalSize;        // 4096
  const DIV = config.gridDivisions;      // 32
  const CHUNK = Math.floor(TOTAL / DIV); // 128

  console.log(`[MegaMap] 开始生成 ${TOTAL}×${TOTAL} 超大地图 (${DIV}×${DIV} 分块, 每块 ${CHUNK}×${CHUNK})`);

  const megaRng = new SeededRNG(config.seed);
  const perlin = new PerlinNoise(config.seed + 1000);

  const heightmap = create2DArray(TOTAL, TOTAL, () => 0);
  const moisture = create2DArray(TOTAL, TOTAL, () => 0);

  console.log(`[MegaMap] 生成高度图...`);
  for (let z = 0; z < TOTAL; z++) {
    for (let x = 0; x < TOTAL; x++) {
      let h = 0;
      let amp = 1.0;
      let freq = 0.003;
      for (let o = 0; o < 6; o++) {
        h += amp * (
          perlin.noise2D(x * freq, z * freq) +
          perlin.noise2D(x * freq * 2.17 + 100, z * freq * 2.17 + 100) * 0.5
        );
        amp *= 0.5;
        freq *= 2.07;
      }
      heightmap[z][x] = (h + 1) * 0.5;

      const mx = (x / TOTAL) * 6 - 3;
      const mz = (z / TOTAL) * 6 - 3;
      let m = 0.5 +
        perlin.noise2D(x * 0.004 + 500, z * 0.004 + 500) * 0.35 -
        Math.abs(mx) * 0.04 - Math.abs(mz) * 0.03 +
        (perlin.noise2D(x * 0.008 + 800, z * 0.008 + 800) > 0.15 ? 0.15 : 0);
      moisture[z][x] = Math.max(0, Math.min(1, m));
    }
  }

  console.log(`[MegaMap] 高度图完成, 应用风蚀效果...`);
  applyWindErosionToHeightmap(heightmap, TOTAL, TOTAL, Math.PI * 0.25, 0.55);

  console.log(`[MegaMap] 放置城市和生成道路...`);
  const cities = placeCitiesOnMegaMap(TOTAL, DIV, heightmap, moisture, config.cityDensity, megaRng);
  const roads = generateRoadsOnMegaMap(cities, heightmap, TOTAL, config.roadDensity, megaRng);
  const strongholds: StrongholdData[] = [];

  console.log(`[MegaMap] 生成 ${DIV}×${DIV} 缩略图和分块数据...`);
  const overviewCells = create2DArray(DIV, DIV, () => ({
    position: { x: 0, z: 0 }, terrain: 'plains' as TerrainType,
    unit: null, fortified: false, capturePointId: null,
  }));

  const chunks: MegaMapChunk[] = [];
  for (let cz = 0; cz < DIV; cz++) {
    for (let cx = 0; cx < DIV; cx++) {
      const ox = cx * CHUNK;
      const oz = cz * CHUNK;

      const chunkCells = create2DArray(CHUNK, CHUNK, () => ({
        position: { x: 0, z: 0 }, terrain: 'plains' as TerrainType,
        unit: null, fortified: false, capturePointId: null,
        isRoad: false, roadType: '' as string | undefined,
      }));

      const terrainCounts: Record<string, number> = {};
      for (let lz = 0; lz < CHUNK; lz++) {
        for (let lx = 0; lx < CHUNK; lx++) {
          const gx = ox + lx;
          const gz = oz + lz;
          const h = heightmap[gz]?.[gx] ?? 0.5;
          const m = moisture[gz]?.[gx] ?? 0.5;
          const terrain = classifyTerrain(h, m, megaRng);
          chunkCells[lz][lx] = {
            position: { x: gx, z: gz },
            terrain,
            unit: null,
            fortified: false,
            capturePointId: null,
            isRoad: false,
            roadType: undefined,
          };
          terrainCounts[terrain] = (terrainCounts[terrain] || 0) + 1;
        }
      }

      for (const road of roads) {
        for (const pt of road.path) {
          if (pt.x >= ox && pt.x < ox + CHUNK && pt.z >= oz && pt.z < oz + CHUNK) {
            const lx = pt.x - ox;
            const lz = pt.z - oz;
            if (lz >= 0 && lz < CHUNK && lx >= 0 && lx < CHUNK) {
              chunkCells[lz][lx].isRoad = true;
              chunkCells[lz][lx].roadType = road.roadType;
              const rw = road.roadType === 'highway' ? 1 : 0;
              for (let dz = -rw; dz <= rw; dz++)
                for (let dx = -rw; dx <= rw; dx++) {
                  const nx = lx + dx, nz = lz + dz;
                  if (nz >= 0 && nz < CHUNK && nx >= 0 && nx < CHUNK) {
                    chunkCells[nz][nx].isRoad = true;
                    chunkCells[nz][nx].roadType = road.roadType;
                  }
                }
            }
          }
        }
      }

      let dominantTerrain = 'plains';
      let maxCount = 0;
      for (const [t, c] of Object.entries(terrainCounts)) {
        if (c > maxCount) { maxCount = c; dominantTerrain = t; }
      }

      overviewCells[cz][cx] = {
        position: { x: cx, z: cz },
        terrain: dominantTerrain as TerrainType,
        unit: null, fortified: false, capturePointId: null,
      };

      chunks.push({
        chunkX: cx,
        chunkZ: cz,
        offsetX: ox,
        offsetZ: oz,
        cells: chunkCells,
        width: CHUNK,
        height: CHUNK,
      });
    }
  }

  console.log(`[MegaMap] 清理小块水域...`);
  const MIN_WATER_AREA = Math.floor(CHUNK * CHUNK * 0.015);
  for (const chunk of chunks) {
    const visited = new Set<string>();
    const w = chunk.width, h = chunk.height;
    for (let z = 0; z < h; z++) {
      for (let x = 0; x < w; x++) {
        if (chunk.cells[z][x].terrain !== 'water' || visited.has(`${x},${z}`)) continue;
        const region: [number, number][] = [];
        const stack: [number, number][] = [[x, z]];
        while (stack.length > 0) {
          const [cx, cz] = stack.pop()!;
          const key = `${cx},${cz}`;
          if (visited.has(key)) continue;
          if (cx < 0 || cx >= w || cz < 0 || cz >= h) continue;
          if (chunk.cells[cz][cx].terrain !== 'water') continue;
          visited.add(key);
          region.push([cx, cz]);
          stack.push([cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]);
        }
        if (region.length < MIN_WATER_AREA) {
          for (const [rx, rz] of region) {
            const h = heightmap[chunk.offsetZ + rz]?.[chunk.offsetX + rx] ?? 0.35;
            const m = moisture[chunk.offsetZ + rz]?.[chunk.offsetX + rx] ?? 0.5;
            chunk.cells[rz][rx].terrain = h < 0.30 ? 'swamp' : 'plains';
            chunk.cells[rz][rx].isRoad = false;
          }
        }
      }
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[MegaMap] 完成! ${TOTAL}×${TOTAL}, ${chunks.length} 个分块, ${cities.length} 座城市, ${roads.length} 条道路, 耗时 ${elapsed}ms`);

  return {
    totalWidth: TOTAL,
    totalHeight: TOTAL,
    chunkSize: CHUNK,
    gridChunksX: DIV,
    gridChunksZ: DIV,
    chunks,
    overviewCells,
    cities,
    roads,
    strongholds,
    baseHeightmap: heightmap,
    seed: config.seed,
  };
}

function classifyTerrain(height: number, moisture: number, rng: SeededRNG): TerrainType {
  if (height < 0.22) return 'water';
  if (height < 0.27 && moisture > 0.50) return 'swamp';
  if (moisture < 0.18 && height > 0.45 && height < 0.72) return 'desert';
  if (height > 0.82) return 'mountain';
  if (height > 0.7) return 'forest';
  if (moisture > 0.65 && height > 0.3 && height < 0.6) return 'forest';
  if (rng.next() < 0.03 && height > 0.35 && height < 0.55 && moisture > 0.25) return 'city';
  return 'plains';
}

function applyWindErosionToHeightmap(heightmap: number[][], w: number, h: number, windDir: number, windStr: number) {
  const steps = Math.floor(Math.min(w, h) * 0.08);
  const particles = Math.floor(w * h * 0.0003);

  const sinD = Math.sin(windDir);
  const cosD = Math.cos(windDir);

  for (let p = 0; p < particles; p++) {
    let x = Math.random() * w;
    let z = Math.random() * h;
    let sediment = 0;

    for (let s = 0; s < steps; s++) {
      const ix = Math.floor(x);
      const iz = Math.floor(z);
      if (ix < 1 || ix >= w - 1 || iz < 1 || iz >= h - 1) break;

      const hC = heightmap[iz][ix];
      const hN00 = heightmap[iz - 1]?.[ix] ?? hC;
      const hN10 = heightmap[iz + 1]?.[ix] ?? hC;
      const hN01 = heightmap[iz]?.[ix - 1] ?? hC;
      const hN11 = heightmap[iz]?.[ix + 1] ?? hC;

      const gX = ((hN11 ?? hC) - (hN01 ?? hC)) * 0.5;
      const gZ = ((hN10 ?? hC) - (hN00 ?? hC)) * 0.5;
      const gradLen = Math.sqrt(gX * gX + gZ * gZ) || 1;

      const hDiff = hC - (hN00 + hN10 + hN01 + hN11) / 4;

      if (sediment > hDiff * windStr * 3) {
        const depo = Math.min(sediment, hDiff * windStr * 0.5);
        heightmap[iz][ix] += depo * 0.05;
        sediment -= depo;
      } else {
        const ero = Math.min(-hDiff * windStr, 0.02) * (1 - sediment * 2);
        heightmap[iz][ix] += ero;
        sediment -= ero;
      }

      x += cosD * 0.8 + gX / gradLen * 0.12;
      z += sinD * 0.8 + gZ / gradLen * 0.12;
    }
  }
}

function placeCitiesOnMegaMap(
  totalSize: number, div: number,
  heightmap: number[][], moisture: number[][],
  density: number, rng: SeededRNG
): CityData[] {
  const cities: CityData[] = [];
  const targetCount = Math.floor(div * div * density * 0.04);
  const candidates: Array<{ x: number; z: number; score: number }> = [];

  const step = Math.max(4, Math.floor(totalSize / 60));
  for (let z = step; z < totalSize - step; z += step) {
    for (let x = step; x < totalSize - step; x += step) {
      const h = heightmap[z][x];
      const m = moisture[z][x];
      if (h < 0.25 || h > 0.78 || m < 0.12) continue;

      let flatScore = 0;
      const r = 6;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++)
          flatScore += 1 - Math.abs(h - (heightmap[z + dz]?.[x + dx] ?? h));

      const waterBonus = (() => {
        for (let d = 3; d <= 10; d++) {
          for (const [ddx, ddz] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
            if ((heightmap[z + ddz]?.[x + ddx] ?? 1) < 0.30) return 1.5;
          }
        }
        return 0;
      })();

      const centrality = 1 - (Math.abs(x - totalSize / 2) + Math.abs(z - totalSize / 2)) / totalSize;

      candidates.push({ x, z, score: flatScore * 0.4 + waterBonus * 2 + centrality * 0.5 + rng.next() * 0.8 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const minDist = totalSize / div * 1.5;
  for (const c of candidates) {
    if (cities.length >= targetCount) break;
    let tooClose = false;
    for (const city of cities) {
      if (Math.hypot(city.position.x - c.x, city.position.z - c.z) < minDist) {
        tooClose = true; break;
      }
    }
    if (!tooClose) {
      cities.push({
        id: `mega_city_${cities.length}`,
        name: `${CITY_NAME_PREFIXES[Math.floor(rng.next() * CITY_NAME_PREFIXES.length)]}${CITY_NAME_SUFFIXES[Math.floor(rng.next() * CITY_NAME_SUFFIXES.length)]}`,
        position: { x: c.x, z: c.z },
        size: cities.length < targetCount * 0.1 ? 'metropolis' : cities.length < targetCount * 0.35 ? 'city' : cities.length < targetCount * 0.7 ? 'town' : 'hamlet',
        population: 1000 + Math.floor(rng.next() * 90000),
        nearbyTerrain: 'plains',
      });
    }
  }

  return cities;
}

function generateRoadsOnMegaMap(
  cities: CityData[],
  heightmap: number[][],
  totalSize: number,
  density: 'sparse' | 'normal' | 'dense',
  rng: SeededRNG
): RoadSegment[] {
  const roads: RoadSegment[] = [];
  if (cities.length < 2) return roads;

  const edgeList: Array<{ from: number; to: number; dist: number }> = [];
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      edgeList.push({
        from: i, to: j,
        dist: Math.hypot(cities[i].position.x - cities[j].position.x, cities[i].position.z - cities[j].position.z),
      });
    }
  }
  edgeList.sort((a, b) => a.dist - b.dist);

  const ufParent = Array.from({ length: cities.length }, (_, i) => i);
  function find(u: number): number { return ufParent[u] === u ? u : (ufParent[u] = find(ufParent[u])); }

  const extraRatio = density === 'sparse' ? 0.25 : density === 'dense' ? 0.65 : 0.45;
  const targetEdges = Math.floor(cities.length * 2.5);

  for (const edge of edgeList) {
    if (roads.length >= targetEdges) break;
    const rf = find(edge.from), rt = find(edge.to);
    const isNew = rf !== rt;
    const isExtra = !isNew && rng.next() < extraRatio * (1 - edge.dist / (totalSize * 0.5));

    if (isNew || isExtra) {
      if (isNew) ufParent[rf] = rt;

      const path = astarPathMega(
        cities[edge.from].position, cities[edge.to].position,
        heightmap, totalSize
      );

      const rType: RoadSegment['roadType'] =
        edge.dist > totalSize * 0.15 ? 'highway' :
        edge.dist > totalSize * 0.05 ? 'main_road' :
        rng.next() < 0.18 ? 'rail' : 'dirt_road';

      roads.push({
        from: cities[edge.from].id,
        to: cities[edge.to].id,
        roadType: rType,
        length: path.length,
        path,
      });
    }
  }

  return roads;
}

function astarPathMega(
  start: Position, end: Position,
  heightmap: number[][], size: number
): Position[] {
  const openSet = new Set<string>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  const key = (p: Position) => `${p.x},${p.z}`;
  const sk = key(start), ek = key(end);
  gScore.set(sk, 0);
  fScore.set(sk, Math.hypot(end.x - start.x, end.z - start.z));
  openSet.add(sk);

  let iter = 0;
  while (openSet.size > 0 && iter < size * 10) {
    iter++;
    let best: string | null = null;
    let bestF = Infinity;
    for (const k of openSet) {
      const f = fScore.get(k) ?? Infinity;
      if (f < bestF) { bestF = f; best = k; }
    }
    if (!best) break;
    if (best === ek) break;

    openSet.delete(best);
    const [cx, cz] = best.split(',').map(Number);

    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue;

      const nk = key({ x: nx, z: nz });
      const hC = heightmap[cz]?.[cx] ?? 0.5;
      const hN = heightmap[nz]?.[nx] ?? 0.5;
      const slopeCost = Math.abs(hN - hC) * 8;
      const diag = dx !== 0 && dz !== 0 ? 1.414 : 1;
      const cost = (gScore.get(best) ?? 0) + diag + slopeCost;

      if (cost < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, best);
        gScore.set(nk, cost);
        fScore.set(nk, cost + Math.hypot(end.x - nx, end.z - nz));
        openSet.add(nk);
      }
    }
  }

  const path: Position[] = [];
  let cur = ek;
  while (cur && cur !== sk) {
    const [x, z] = cur.split(',').map(Number);
    path.unshift({ x, z });
    cur = cameFrom.get(cur) ?? '';
  }
  if (path.length > 0) path.unshift(start);

  if (path.length < 2) {
    const dx = end.x - start.x, dz = end.z - start.z;
    const dist = Math.max(Math.abs(dx), Math.abs(dz));
    const steps = Math.max(dist, 2);
    for (let i = 0; i <= steps; i++) {
      path.push({ x: Math.round(start.x + dx * i / steps), z: Math.round(start.z + dz * i / steps) });
    }
  }

  return path;
}

export function saveMegaMapChunk(mega: MegaMapResult, chunkIndex: number): { localStorageKey: string; exportJson: string } {
  const chunk = mega.chunks[chunkIndex];
  if (!chunk) return { localStorageKey: '', exportJson: '' };

  const roadsInChunk = mega.roads.filter(r =>
    r.path.some(pt => pt.x >= chunk.offsetX && pt.x < chunk.offsetX + chunk.width &&
                     pt.z >= chunk.offsetZ && pt.z < chunk.offsetZ + chunk.height)
  );

  const citiesInChunk = mega.cities.filter(c =>
    c.position.x >= chunk.offsetX && c.position.x < chunk.offsetX + chunk.width &&
    c.position.z >= chunk.offsetZ && c.position.z < chunk.offsetZ + chunk.height
  );

  const saveData = {
    version: '3.0',
    savedAt: new Date().toISOString(),
    type: 'mega_chunk',
    mapSeed: mega.seed,
    chunk: {
      index: chunkIndex,
      gridPos: { x: chunk.chunkX, z: chunk.chunkZ },
      worldPos: { x: chunk.offsetX, z: chunk.offsetZ },
      size: { width: chunk.width, height: chunk.height },
    },
    cells: chunk.cells.map(row => row.map(cell => cell.terrain)),
    context: {
      citiesInChunk: citiesInChunk.map(c => ({ id: c.id, name: c.name, position: c.position, size: c.size })),
      roadsInChunk: roadsInChunk.map(r => ({ from: r.from, to: r.to, type: r.roadType, length: r.length, pathLength: r.path.length })),
    },
  };

  const json = JSON.stringify(saveData, null, 2);
  const lsKey = `mega_chunk_${chunk.chunkX}_${chunk.chunkZ}_${Date.now()}`;
  try { localStorage.setItem(lsKey, json); } catch {}
  return { localStorageKey: lsKey, exportJson: json };
}

export function generateFusedMap(partialConfig: Partial<FusedMapConfig> = {}): FusedMapResult {
  const startTime = Date.now();

  const config: Required<FusedMapConfig> = {
    ...DEFAULT_FUSED_CONFIG,
    ...partialConfig,
  };

  const { seed, baseWidth, baseHeight, windDirection, windStrength } = config;
  const fusedRng = new SeededRNG(seed + 131071); // 大质数偏移避免与阶段1冲突

  console.log(`[FusedMap] ========== 开始融合地图生成 ==========`);
  console.log(`[FusedMap] 配置: ${baseWidth}x${baseHeight}, 种子=${seed}, 密度=${config.cityDensity}, 道路=${config.roadNetworkDensity}`);

  // ===== 阶段1: 风蚀基础地形 =====
  console.log(`[FusedMap] -- 阶段1: 风蚀基础地形生成 --`);

  const baseResult = generateProceduralMap({
    seed: seed,
    width: baseWidth,
    height: baseHeight,
    windDirection: windDirection,
    windStrength: windStrength,
    numRivers: Math.max(2, Math.floor(baseWidth / 18)),
    numCities: 0,
    latitudeRange: { min: -50, max: 50 },
  });

  const baseHeightmap = baseResult.heightmap;
  const baseMoisture = baseResult.moisture;
  const baseTemperature = baseResult.temperature;
  const baseCells = structuredClone(baseResult.cells);

  console.log(`[FusedMap] 阶段1完成: 基础地形 ${baseWidth}x${baseHeight}`);

  // ===== 阶段2: 战略覆盖层 =====
  console.log(`[FusedMap] -- 阶段2: 战略覆盖层生成 --`);

  // 2A: 区域划分
  const regions = divideIntoRegions(baseHeightmap, baseMoisture, baseCells, config.regionCount, fusedRng, baseWidth, baseHeight);

  // 2B: 城市选址
  const cities = placeCities(regions, baseHeightmap, baseCells, baseMoisture, config.cityDensity, fusedRng, baseWidth, baseHeight);

  // 在基础地图上标记城市
  for (const city of cities) {
    const cell = baseCells[city.position.z][city.position.x];
    if (cell.terrain !== 'water' && cell.terrain !== 'mountain') {
      cell.terrain = 'city';
    }
  }

  // 2C: 道路网络
  const roads = generateRoadNetwork(cities, baseHeightmap, baseCells, config.roadNetworkDensity, fusedRng, baseWidth, baseHeight);

  // 2D: 据点放置
  const strongholds = placeStrongholds(cities, roads, baseHeightmap, baseCells, config.strongholdCount, fusedRng, baseWidth, baseHeight);

  // 构建宏观叠加层的深拷贝
  const macroOverlay = structuredClone(baseCells);

  console.log(`[FusedMap] 阶段2完成: ${regions.length}区域, ${cities.length}城市, ${roads.length}道路, ${strongholds.length}据点`);

  // ===== 阶段3: 像素级上下文感知局部细节生成 =====
  console.log(`[FusedMap] -- 阶段3: 像素级局部细节生成 --`);

  assignContextAwareTemplates(regions, cities, roads, strongholds, baseCells, baseHeightmap, fusedRng);

  // 像素级局部细节展开（为每个网格点生成局部详情图）
  const pixelDetails = generatePixelLevelDetails(
    baseWidth, baseHeight,
    cities, roads, strongholds,
    baseCells, baseHeightmap, baseMoisture,
    config.microDetailLevel, fusedRng,
    config.detailGridSize
  );

  // 统计元数据
  const regionTemplateDistribution: Record<string, number> = {};
  for (const r of regions) {
    if (r.assignedTemplate) {
      regionTemplateDistribution[r.assignedTemplate] = (regionTemplateDistribution[r.assignedTemplate] ?? 0) + 1;
    }
  }

  const generationTimeMs = Date.now() - startTime;

  const result: FusedMapResult = {
    baseHeightmap,
    baseMoisture,
    baseTemperature,
    baseCells,
    cities,
    roads,
    strongholds,
    regions,
    macroOverlay,
    pixelDetails,
    metadata: {
      totalCities: cities.length,
      totalRoads: roads.length,
      totalStrongholds: strongholds.length,
      totalRegions: regions.length,
      regionTemplateDistribution,
      generationTimeMs,
    },
  };

  console.log(`[FusedMap] ========== 融合地图生成完成 (${generationTimeMs}ms) ==========`);
  console.log(`[FusedMap] 最终统计:`, result.metadata);

  return result;
}

// ---------- 12.9.5 像素级局部细节生成系统 ----------

/**
 * 分析单个网格点周围8格的上下文环境
 */
function analyzePixelContext(
  x: number, z: number,
  width: number, height: number,
  cities: CityData[],
  roads: RoadSegment[]
): {
  cityDensity: number;
  roadConnectivity: number;
  dominantNeighborType: 'urban' | 'suburban' | 'rural' | 'wilderness';
  nearbyCities: Array<{ id: string; name: string; distance: number }>;
  nearbyRoads: Array<{ from: string; to: string; distance: number }>;
} {
  // 周围8格 + 中心格
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],          [1, 0],
    [-1, 1],  [0, 1],  [1, 1]
  ];

  let cityCount = 0;
  let roadCount = 0;
  const totalNeighbors = neighbors.length;

  const nearbyCities: Array<{ id: string; name: string; distance: number }> = [];
  const nearbyRoads: Array<{ from: string; to: string; distance: number }> = [];

  for (const [dx, dz] of neighbors) {
    const nx = x + dx;
    const nz = z + dz;
    if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;

    // 检查该位置是否有城市
    const cityAtPos = cities.find(c => c.position.x === nx && c.position.z === nz);
    if (cityAtPos) {
      cityCount++;
      nearbyCities.push({
        id: cityAtPos.id,
        name: cityAtPos.name,
        distance: Math.abs(dx) + Math.abs(dz)
      });
    }

    // 检查是否有道路经过
    const roadAtPos = roads.some(r =>
      r.path.some(p => p.x === nx && p.z === nz)
    );
    if (roadAtPos) {
      roadCount++;
      // 找到该道路
      const road = roads.find(r => r.path.some(p => p.x === nx && p.z === nz));
      if (road && !nearbyRoads.some(nr => nr.from === road.from && nr.to === road.to)) {
        nearbyRoads.push({
          from: road.from,
          to: road.to,
          distance: Math.abs(dx) + Math.abs(dz)
        });
      }
    }
  }

  // 也检查中心位置
  const centerCity = cities.find(c => c.position.x === x && c.position.z === z);
  if (centerCity) {
    nearbyCities.unshift({ id: centerCity.id, name: centerCity.name, distance: 0 });
  }

  const centerRoads = roads.filter(r => r.path.some(p => p.x === x && p.z === z));
  for (const road of centerRoads) {
    if (!nearbyRoads.some(nr => nr.from === road.from && nr.to === road.to)) {
      nearbyRoads.push({ from: road.from, to: road.to, distance: 0 });
    }
  }

  // 计算密度
  const cityDensity = totalNeighbors > 0 ? cityCount / totalNeighbors : 0;
  const roadConnectivity = totalNeighbors > 0 ? roadCount / totalNeighbors : 0;

  // 判定主导邻居类型
  let dominantNeighborType: 'urban' | 'suburban' | 'rural' | 'wilderness';
  if (cityDensity >= 0.6) {
    dominantNeighborType = 'urban';
  } else if (cityDensity >= 0.3) {
    dominantNeighborType = 'suburban';
  } else if (roadConnectivity >= 0.3) {
    dominantNeighborType = 'rural';
  } else {
    dominantNeighborType = 'wilderness';
  }

  return {
    cityDensity,
    roadConnectivity,
    dominantNeighborType,
    nearbyCities: nearbyCities.slice(0, 5),
    nearbyRoads: nearbyRoads.slice(0, 5)
  };
}

/**
 * 根据上下文判定局部类型
 */
function determineLocalType(
  context: ReturnType<typeof analyzePixelContext>,
  isCityPosition: boolean,
  isRoadJunction: boolean
): FusedMapResult['pixelDetails'][0]['localType'] {
  // 如果是城市位置
  if (isCityPosition) {
    if (context.cityDensity >= 0.7 && context.nearbyCities.length >= 5) {
      return 'city_center';  // 周围都是城市 → 市中心
    }
    if (context.cityDensity >= 0.4) {
      return 'suburb';  // 一半左右是城市 → 郊区
    }
    return 'town';  // 少量周边城市 → 城镇
  }

  // 如果是道路交叉口
  if (isRoadJunction) {
    if (context.nearbyRoads.length >= 3) {
      return 'crossroads';  // 多条道路交汇 → 十字路口
    }
    return 'road_junction';  // 普通道路节点
  }

  // 根据周围密度判断
  if (context.cityDensity >= 0.5) {
    return 'suburb';  // 高城市密度 → 郊区（非城市格）
  }
  if (context.cityDensity >= 0.2 || context.roadConnectivity >= 0.4) {
    return 'town';  // 中等密度或有道路 → 村镇
  }
  if (context.cityDensity >= 0.1 || context.roadConnectivity >= 0.2) {
    return 'village';  // 低密度 → 小村庄
  }
  if (context.roadConnectivity >= 0.1) {
    return 'outpost';  // 有少量道路 → 哨站/驿站
  }
  return 'wilderness';  // 荒野
}

/**
 * 为每个网格点生成局部细节地形网格
 */
function generateDetailGrid(
  centerX: number, centerZ: number,
  localType: FusedMapResult['pixelDetails'][0]['localType'],
  context: ReturnType<typeof analyzePixelContext>,
  baseCells: MapCell[][],
  baseHeightmap: number[][],
  baseMoisture: number[][],
  detailSize: number,
  rng: SeededRNG,
  width: number,
  height: number
): MapCell[][] {
  const halfSize = Math.floor(detailSize / 2);
  const grid: MapCell[][] = [];

  for (let dz = -halfSize; dz <= halfSize; dz++) {
    const row: MapCell[] = [];
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      const wx = centerX + dx;
      const wz = centerZ + dz;

      let terrain: TerrainType = 'plains';

      if (wx >= 0 && wx < width && wz >= 0 && wz < height) {
        // 使用基础地形的变体，根据局部类型调整
        const baseTerrain = baseCells[wz][wx].terrain;
        const heightVal = baseHeightmap[wz]?.[wx] ?? 0.5;
        const moistureVal = baseMoisture[wz]?.[wx] ?? 0.5;

        // 根据局部类型生成不同的地形分布
        terrain = generateContextualTerrain(
          baseTerrain, heightVal, moistureVal,
          localType, context,
          dx, dz, detailSize, rng
        );
      } else {
        // 边界外使用边缘地形
        terrain = 'plains';
      }

      row.push({
        position: { x: dx + halfSize, z: dz + halfSize },
        terrain,
        unit: null,
        fortified: false,
        capturePointId: null
      });
    }
    grid.push(row);
  }

  return grid;
}

/**
 * 根据上下文生成具体的地形类型
 */
function generateContextualTerrain(
  baseTerrain: TerrainType,
  height: number,
  moisture: number,
  localType: FusedMapResult['pixelDetails'][0]['localType'],
  context: ReturnType<typeof analyzePixelContext>,
  offsetX: number,
  offsetZ: number,
  gridSize: number,
  rng: SeededRNG
): TerrainType {
  const distFromCenter = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ) / (gridSize / 2);

  switch (localType) {
    case 'city_center':
      // 市中心：核心是城市建筑，外围是密集城区
      if (distFromCenter < 0.3) return 'city';
      if (distFromCenter < 0.7) return rng.next() < 0.8 ? 'city' : 'plains';
      return rng.next() < 0.5 ? 'city' : 'plains';

    case 'suburb':
      // 郊区：混合住宅和空地
      if (distFromCenter < 0.4) return rng.next() < 0.6 ? 'plains' : 'forest';
      if (rng.next() < context.cityDensity * 0.8) return 'plains';
      return baseTerrain;

    case 'town':
      // 村镇：小规模聚落
      if (distFromCenter < 0.3 && rng.next() < 0.7) return 'plains';
      if (rng.next() < 0.3) return 'forest';
      return baseTerrain;

    case 'village':
      // 小村庄：零星建筑
      if (distFromCenter < 0.2 && rng.next() < 0.4) return 'plains';
      return baseTerrain;

    case 'outpost':
      // 哨站：孤立建筑
      if (distFromCenter < 0.15 && rng.next() < 0.5) return 'plains';
      return baseTerrain;

    case 'road_junction':
    case 'crossroads':
      // 道路节点：沿道路方向有路径
      if (Math.abs(offsetX) <= 1 || Math.abs(offsetZ) <= 1) {
        return rng.next() < 0.7 ? 'plains' : baseTerrain;
      }
      return baseTerrain;

    case 'wilderness':
    default:
      // 荒野：保持原始地形，加入细微变化
      if (height > 0.75) return 'mountain';
      if (height > 0.6) return 'plains';
      if (moisture > 0.7 && height < 0.35) return 'water';
      if (moisture > 0.5 && rng.next() < 0.3) return 'forest';
      return baseTerrain;
  }
}

/**
 * 为整个地图的每个网格点生成像素级局部细节
 */
function generatePixelLevelDetails(
  width: number,
  height: number,
  cities: CityData[],
  roads: RoadSegment[],
  strongholds: StrongholdData[],
  baseCells: MapCell[][],
  baseHeightmap: number[][],
  baseMoisture: number[][],
  detailLevel: 'low' | 'medium' | 'high',
  rng: SeededRNG,
  customDetailSize?: number
): FusedMapResult['pixelDetails'] {
  const detailSize = customDetailSize || (detailLevel === 'low' ? 9 : detailLevel === 'medium' ? 13 : 17);
  const pixelDetails: FusedMapResult['pixelDetails'] = [];

  console.log(`[PixelDetails] 开始生成 ${width}x${height} 的像素级细节图 (细节尺寸: ${detailSize}x${detailSize})`);

  // 预计算道路交叉点（用于快速判断）
  const roadJunctionPositions = new Set<string>();
  for (const road of roads) {
    for (const point of road.path) {
      const key = `${point.x},${point.z}`;
      // 如果这个点被多条道路使用，则是交叉口
      const count = roads.filter(r => r.path.some(p => p.x === point.x && p.z === point.z)).length;
      if (count >= 2) {
        roadJunctionPositions.add(key);
      }
    }
  }

  let processedCount = 0;
  const totalCount = width * height;

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      // 分析上下文
      const context = analyzePixelContext(x, z, width, height, cities, roads);

      // 判断是否是城市位置或道路交叉口
      const isCityPosition = cities.some(c => c.position.x === x && c.position.z === z);
      const isRoadJunction = roadJunctionPositions.has(`${x},${z}`);

      // 判定局部类型
      const localType = determineLocalType(context, isCityPosition, isRoadJunction);

      // 生成局部细节网格
      const detailGrid = generateDetailGrid(
        x, z, localType, context,
        baseCells, baseHeightmap, baseMoisture,
        detailSize, rng, width, height
      );

      pixelDetails.push({
        x,
        z,
        context,
        localType,
        detailGrid,
        detailSize
      });

      processedCount++;
      if (processedCount % 500 === 0) {
        console.log(`[PixelDetails] 进度: ${processedCount}/${totalCount} (${Math.round(processedCount/totalCount*100)}%)`);
      }
    }
  }

  console.log(`[PixelDetails] 完成! 共生成 ${pixelDetails.length} 个像素级细节图`);

  postProcessDetailGrids(pixelDetails, width, height, baseCells, roads, baseHeightmap, baseMoisture, rng);

  return pixelDetails;
}

function postProcessDetailGrids(
  pixelDetails: FusedMapResult['pixelDetails'],
  width: number,
  height: number,
  baseCells: MapCell[][],
  roads: RoadSegment[],
  baseHeightmap: number[][],
  baseMoisture: number[][],
  rng: SeededRNG
) {
  console.log('[PixelPostProcess] 开始后处理：道路连续性 + 地形一致性 + 邻域混合');

  const detailMap = new Map<string, FusedMapResult['pixelDetails'][0]>();
  for (const pd of pixelDetails) {
    detailMap.set(`${pd.x},${pd.z}`, pd);
  }

  for (const pd of pixelDetails) {
    const grid = pd.detailGrid;
    const ds = pd.detailSize;
    const half = Math.floor(ds / 2);
    const centerTerrain = baseCells[pd.z]?.[pd.x]?.terrain || 'plains';

    for (let dz = 0; dz < ds; dz++) {
      for (let dx = 0; dx < ds; dx++) {
        const distFromCenter = Math.sqrt((dx - half) ** 2 + (dz - half) ** 2) / half;
        if (distFromCenter < 0.35 && rng.next() < 0.7) {
          grid[dz][dx].terrain = centerTerrain;
        }
      }
    }

    const neighbors = [
      { dx: -1, dz: 0, edgeX: 0, edgeZ: 'all', weight: 0.2 },
      { dx: 1, dz: 0, edgeX: ds - 1, edgeZ: 'all', weight: 0.2 },
      { dx: 0, dz: -1, edgeX: 'all', edgeZ: 0, weight: 0.2 },
      { dx: 0, dz: 1, edgeX: 'all', edgeZ: ds - 1, weight: 0.2 },
      { dx: -1, dz: -1, edgeX: 0, edgeZ: 0, weight: 0.08 },
      { dx: 1, dz: -1, edgeX: ds - 1, edgeZ: 0, weight: 0.08 },
      { dx: -1, dz: 1, edgeX: 0, edgeZ: ds - 1, weight: 0.08 },
      { dx: 1, dz: 1, edgeX: ds - 1, edgeZ: ds - 1, weight: 0.08 },
    ];

    for (const n of neighbors) {
      const nx = pd.x + n.dx;
      const nz = pd.z + n.dz;
      if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
      const neighborTerrain = baseCells[nz][nx]?.terrain;
      if (!neighborTerrain || neighborTerrain === centerTerrain) continue;

      const blendRange = Math.max(1, Math.floor(ds * 0.18));
      for (let bz = 0; bz < ds; bz++) {
        for (let bx = 0; bx < ds; bx++) {
          let inEdge = false;
          if (n.edgeX === 'all' && typeof n.edgeZ === 'number') {
            if (Math.abs(bz - n.edgeZ) <= blendRange) inEdge = true;
          } else if (n.edgeZ === 'all' && typeof n.edgeX === 'number') {
            if (Math.abs(bx - n.edgeX) <= blendRange) inEdge = true;
          } else if (typeof n.edgeX === 'number' && typeof n.edgeZ === 'number') {
            const cornerDist = Math.sqrt((bx - n.edgeX) ** 2 + (bz - n.edgeZ) ** 2);
            if (cornerDist <= blendRange * 1.5) inEdge = true;
          }
          if (inEdge && rng.next() < n.weight) {
            grid[bz][bx].terrain = neighborTerrain as any;
          }
        }
      }
    }
  }

  console.log('[PixelPostProcess] 阶段1完成：地形一致性 + 邻域混合');
  overlayRoadsOnDetailMaps(pixelDetails, roads, rng);
  console.log('[PixelPostProcess] 阶段2完成：道路连续性覆盖');
}

function overlayRoadsOnDetailMaps(
  pixelDetails: FusedMapResult['pixelDetails'],
  roads: RoadSegment[],
  rng: SeededRNG
) {
  const detailMap = new Map<string, FusedMapResult['pixelDetails'][0]>();
  for (const pd of pixelDetails) {
    detailMap.set(`${pd.x},${pd.z}`, pd);
  }

  const roadWidthMap: Record<RoadSegment['roadType'], number> = {
    highway: 2.2,
    main_road: 1.6,
    dirt_road: 1.1,
    rail: 1.0,
  };

  let totalRoadCells = 0;

  for (const road of roads) {
    const path = road.path;
    if (path.length < 2) continue;

    const rWidth = roadWidthMap[road.roadType] || 1;
    const rtName = road.roadType;

    for (let i = 0; i < path.length; i++) {
      const pt = path[i];
      const pd = detailMap.get(`${pt.x},${pt.z}`);
      if (!pd) continue;

      const grid = pd.detailGrid;
      const ds = pd.detailSize;
      const half = Math.floor(ds / 2);

      let inDir: [number, number] | null = null;
      let outDir: [number, number] | null = null;

      if (i > 0) {
        const prev = path[i - 1];
        inDir = [prev.x - pt.x, prev.z - pt.z];
      }
      if (i < path.length - 1) {
        const next = path[i + 1];
        outDir = [next.x - pt.x, next.z - pt.z];
      }

      if (inDir && !outDir) outDir = [...inDir] as [number, number];
      if (!inDir && outDir) inDir = [...outDir] as [number, number];

      drawConnectedRoadLine(grid, ds, half, inDir, outDir, rWidth, rtName);
      totalRoadCells++;
    }
  }

  console.log(`[RoadOverlay] 完成! 在 ${totalRoadCells} 个细节格子上绘制了连续道路`);
}

function drawConnectedRoadLine(
  grid: MapCell[][],
  gridSize: number,
  half: number,
  inDir: [number, number] | null,
  outDir: [number, number] | null,
  width: number,
  roadType: string
) {
  const cx = half;
  const cz = half;

  function markAsRoad(x: number, z: number) {
    if (z >= 0 && z < gridSize && x >= 0 && x < gridSize) {
      grid[z][x].isRoad = true;
      grid[z][x].roadType = roadType;
    }
  }

  function markCircle(ox: number, oz: number, r: number) {
    const rr = Math.ceil(r) + 1;
    for (let dz = -rr; dz <= rr; dz++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dz * dz <= r * r + 0.5) {
          markAsRoad(Math.round(ox + dx), Math.round(oz + dz));
        }
      }
    }
  }

  markCircle(cx, cz, width);

  function dirToEdge(dir: [number, number]): [number, number] {
    const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2);
    if (len < 0.01) return [0, 0];
    return [dir[0] / len, dir[1] / len];
  }

  if (inDir && outDir) {
    const entryEdge = dirToEdge([inDir[0], inDir[1]]);
    const exitEdge = dirToEdge([-outDir[0], -outDir[1]]);

    const startX = cx + entryEdge[0] * half;
    const startZ = cz + entryEdge[1] * half;
    const endX = cx + exitEdge[0] * half;
    const endZ = cz + exitEdge[1] * half;

    const dist = Math.sqrt((endX - startX) ** 2 + (endZ - startZ) ** 2);
    const steps = Math.max(Math.ceil(dist), 6);

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = startX + (endX - startX) * t;
      const z = startZ + (endZ - startZ) * t;
      markCircle(x, z, width * 0.85);
    }
  } else if (inDir) {
    const edge = dirToEdge([inDir[0], inDir[1]]);
    const farX = cx + edge[0] * half;
    const farZ = cz + edge[1] * half;
    const steps = Math.max(Math.ceil(half), 4);

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = cx + (farX - cx) * t;
      const z = cz + (farZ - cz) * t;
      markCircle(x, z, width * 0.85);
    }
  } else if (outDir) {
    const edge = dirToEdge([-outDir[0], -outDir[1]]);
    const farX = cx + edge[0] * half;
    const farZ = cz + edge[1] * half;
    const steps = Math.max(Math.ceil(half), 4);

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = cx + (farX - cx) * t;
      const z = cz + (farZ - cz) * t;
      markCircle(x, z, width * 0.85);
    }
  }
}

// ---------- 12.10 保存/加载/列表函数 ----------

/**
 * 保存融合地图结果到 localStorage 和返回可导出的JSON
 */
export function saveFusedMap(result: FusedMapResult): { localStorageKey: string; exportJson: string } {
  const saveData = {
    version: '1.0',
    savedAt: new Date().toISOString(),
    configSnapshot: {
      totalCities: result.metadata.totalCities,
      totalRoads: result.metadata.totalRoads,
      totalStrongholds: result.metadata.totalStrongholds,
      totalRegions: result.metadata.totalRegions,
    },
    cities: result.cities,
    roads: result.roads.map(r => ({ from: r.from, to: r.to, length: r.length, roadType: r.roadType })),
    strongholds: result.strongholds,
    regions: result.regions.map(r => ({
      id: r.id,
      name: r.name,
      bounds: r.bounds,
      centerCity: r.centerCity,
      dominantTerrain: r.dominantTerrain,
      hasRoad: r.hasRoad,
      hasRiver: r.hasRiver,
      hasCoast: r.hasCoast,
      assignedTemplate: r.assignedTemplate,
    })),
    metadata: result.metadata,
  };

  const key = `fused_map_${Date.now()}`;
  try {
    localStorage.setItem(key, JSON.stringify(saveData));
  } catch (e) {
    console.warn('[FusedMap] localStorage 保存失败:', e);
  }

  return { localStorageKey: key, exportJson: JSON.stringify(saveData, null, 2) };
}

/**
 * 加载已保存的融合地图
 */
export function loadFusedMap(key: string): FusedMapResult | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== '1.0') {
      console.warn('[FusedMap] 版本不匹配');
      return null;
    }
    // 返回恢复的数据（注意：完整的 cells 数组未保存，仅保存元数据和结构数据）
    return data as unknown as FusedMapResult;
  } catch (e) {
    console.warn('[FusedMap] 加载失败:', e);
    return null;
  }
}

/**
 * 获取所有已保存的地图列表
 */
export function listSavedMaps(): Array<{ key: string; savedAt: string; cityCount: number }> {
  const maps: Array<{ key: string; savedAt: string; cityCount: number }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('fused_map_')) {
        try {
          const d = JSON.parse(localStorage.getItem(key)!);
          maps.push({
            key,
            savedAt: d.savedAt ?? 'unknown',
            cityCount: d.cities?.length ?? d.metadata?.totalCities ?? 0,
          });
        } catch { /* skip invalid entries */ }
      }
    }
  } catch { /* localStorage unavailable */ }
  return maps.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * 保存单个区域的微观详情
 */
export function saveRegionDetail(
  fusedResult: FusedMapResult,
  regionIndex: number,
): { localStorageKey: string; exportJson: string } {
  const region = fusedResult.regions[regionIndex];
  const detail = fusedResult.detailedRegions?.[regionIndex];
  if (!region || !detail) {
    return { localStorageKey: '', exportJson: '' };
  }

  const saveData = {
    version: '1.0',
    savedAt: new Date().toISOString(),
    type: 'region_detail',
    mapSeed: fusedResult.metadata.generationTimeMs,
    region: {
      id: region.id,
      name: region.name,
      bounds: region.bounds,
      assignedTemplate: region.assignedTemplate,
      dominantTerrain: region.dominantTerrain,
      hasRoad: region.hasRoad,
      hasRiver: region.hasRiver,
      hasCoast: region.hasCoast,
      centerCity: region.centerCity,
    },
    detail: {
      width: detail.width,
      height: detail.height,
      cells: detail.cells.map(row =>
        row.map(cell => cell.terrain)
      ),
    },
    context: {
      citiesInRegion: fusedResult.cities
        .filter(c => {
          const cx = c.position.x, cz = c.position.z;
          return cx >= region.bounds.x && cx < region.bounds.x + region.bounds.width &&
                 cz >= region.bounds.z && cz < region.bounds.z + region.bounds.height;
        })
        .map(c => ({ id: c.id, name: c.name, size: c.size, position: c.position })),
      roadsThroughRegion: fusedResult.roads
        .filter(r => r.path.some(p =>
          p.x >= region.bounds.x && p.x < region.bounds.x + region.bounds.width &&
          p.z >= region.bounds.z && p.z < region.bounds.z + region.bounds.height
        ))
        .map(r => ({ from: r.from, to: r.to, length: r.length, roadType: r.roadType })),
    },
  };

  const key = `fused_region_${region.id}_${Date.now()}`;
  try {
    localStorage.setItem(key, JSON.stringify(saveData));
  } catch (e) {
    console.warn('[FusedMap] 保存区域详情失败:', e);
  }

  return { localStorageKey: key, exportJson: JSON.stringify(saveData, null, 2) };
}

// ---------- 12.11 便捷预设函数 ----------

/**
 * 快速生成一个默认大小的融合地图
 */
export function generateDefaultFusedMap(seed?: number): FusedMapResult {
  return generateFusedMap({
    seed: seed ?? Math.floor(Math.random() * 100000),
  });
}

/**
 * 生成"东亚"风格的地图（多山+多河+密集城市）
 */
export function generateEastAsiaStyleMap(seed?: number): FusedMapResult {
  return generateFusedMap({
    seed: seed ?? Math.floor(Math.random() * 100000),
    baseWidth: 96,
    baseHeight: 72,
    windDirection: Math.PI * 0.75, // 东风为主
    windStrength: 0.7,
    regionCount: { min: 6, max: 10 },
    cityDensity: 2.2,
    strongholdCount: 6,
    roadNetworkDensity: 'dense',
    microDetailLevel: 'high',
  });
}

/**
 * 生成"欧洲"风格地图（平原多+河流网+中等城市）
 */
export function generateEuropeStyleMap(seed?: number): FusedMapResult {
  return generateFusedMap({
    seed: seed ?? Math.floor(Math.random() * 100000),
    baseWidth: 88,
    baseHeight: 64,
    windDirection: Math.PI * 0.4, // 西风为主
    windStrength: 0.5,
    regionCount: { min: 4, max: 7 },
    cityDensity: 1.4,
    strongholdCount: 4,
    roadNetworkDensity: 'normal',
    microDetailLevel: 'medium',
  });
}