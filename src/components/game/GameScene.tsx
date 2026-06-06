'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/store/game-store';
import { useShallow } from 'zustand/react/shallow';
import { TERRAIN_CONFIGS, UNIT_CONFIGS, MAP_WIDTH, MAP_HEIGHT, WEATHER_CONFIGS, FORTIFY_DEFENSE_BONUS, FORTIFY_DURATION, MINE_DETECTION_RANGE } from '@/game/config';
import { Position, TerrainType, Unit, Faction, DamagePopup, MapCell, WeatherType, UnitType } from '@/game/types';
import { isUnitDetected, estimateDamage as engineEstimateDamage, getHeroSupplyBonus, calculateKillProbability, getVeterancyTitle } from '@/game/engine';
import { getHeroesForFaction } from '@/game/heroes';

// ===== Constants =====
const CELL_SIZE = 1.0;
const CELL_GAP = 0.05;
const CELL_TOTAL = CELL_SIZE + CELL_GAP;
const MAP_OFFSET_X = -(MAP_WIDTH * CELL_TOTAL) / 2;
const MAP_OFFSET_Z = -(MAP_HEIGHT * CELL_TOTAL) / 2;

// v81.0: Track unit facing directions for direction indicator arrows
const _unitDirMap = new Map<string, { x: number; z: number; lastPx: number; lastPz: number }>();

// ===== Shared Combat VFX Geometries =====
// Pre-created geometries for combat visual effects to avoid per-frame GPU allocations.
// These live for the lifetime of the page — do NOT dispose them in VFX cleanup loops.
const _combatGeo = {
  muzzleFlash: new THREE.SphereGeometry(0.15, 8, 6),
  hitSpark: new THREE.SphereGeometry(0.04, 4, 3),
  hitFlash: new THREE.SphereGeometry(0.1, 6, 4),
  trail: new THREE.SphereGeometry(0.04, 4, 3),
  smallExplosion: new THREE.SphereGeometry(0.08, 6, 4),
  largeExplosion: new THREE.SphereGeometry(0.2, 8, 6),
};
const _sharedCombatGeoSet = new Set<THREE.BufferGeometry>(Object.values(_combatGeo));

// ===== Easing Helpers =====
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ===== 兵棋符号系统 v2 — SVG路径白色剪影 × 彩色底座 =====

const FACTION_COLORS: Record<Faction, { base: string; dark: string }> = {
  red:  { base: '#c62828', dark: '#b71c1c' },
  blue: { base: '#1565c0', dark: '#0d47a1' },
};

const UNIT_ACCENT_COLORS: Record<UnitType, number> = {
  tank: 0xff4444, ifv: 0xff8800, artillery: 0xffcc00,
  scout: 0x44ff44, infantry: 0x44ccff, sam: 0x00cccc,
  engineer: 0xffaa00, supply: 0x44ff88, helicopter: 0xcc44ff,
  mlrs: 0xff4488, atgm: 0xff4488, uav: 0xa9e34b,
  command: 0xffcc00, ew: 0x20c997,
};

/** SVG路径数据 — 每个单位的白色剪影 (viewBox 0 0 100 100) */
const SILHOUETTE_PATHS: Record<UnitType, string[]> = {
  tank: [
    'M22,72 L22,55 Q22,48 28,45 L28,42 Q26,40 26,36 L26,30 Q26,25 32,23 L68,23 Q74,25 74,30 L74,36 Q74,40 72,42 L72,45 Q78,48 78,55 L78,72 Q78,78 70,80 L30,80 Q22,78 22,72 Z',
    'M35,52 Q35,42 50,42 Q65,42 65,52 Q65,60 50,60 Q35,60 35,52 Z',
    'M54,46 L90,46 L90,50 L54,50 Z',
    'M16,76 L84,76 L84,82 L16,82 Z','M16,66 L84,66 L84,70 L16,70 Z',
  ],
  ifv: [
    'M26,73 L26,56 Q26,49 33,47 L33,43 Q31,41 31,37 L31,31 Q31,26 38,24 L62,24 Q69,26 69,31 L69,37 Q69,41 67,43 L67,47 Q74,49 74,56 L74,73 Q74,79 66,81 L34,81 Q26,79 26,73 Z',
    'M42,50 Q42,42 50,42 Q58,42 58,50 Q58,56 50,56 Q42,56 42,50 Z',
    'M54,44 L82,44 L82,47 L54,47 Z',
    'M17,77 L83,77 L83,81 L17,81 Z','M17,68 L83,68 L83,72 L17,72 Z',
  ],
  artillery: [
    'M20,75 L20,62 Q20,56 28,54 L28,48 L72,48 L72,54 Q80,56 80,62 L80,75 Q80,80 72,82 L28,82 Q20,80 20,75 Z',
    'M26,58 L26,35 L30,35 L30,58 Z','M70,58 L70,35 L74,35 L74,58 Z',
    'M44,48 L88,22 L92,24 L46,52 Z','M86,20 Q90,18 90,22 Q90,26 86,24 Z',
  ],
  scout: [
    'M28,72 L28,58 Q28,53 34,51 L34,46 Q32,44 32,39 L32,33 Q32,28 38,26 L62,26 Q68,28 68,33 L68,39 Q68,44 66,46 L66,51 Q72,53 72,58 L72,72 Q72,78 64,80 L36,80 Q28,78 28,72 Z',
    'M44,38 L44,15 L46,15 L46,38 Z','M46,14 Q50,10 50,14 Q50,18 46,14 Z',
    'M24,78 L30,78 L30,82 L24,82 Z','M36,78 L42,78 L42,82 L36,82 Z',
    'M48,78 L54,78 L54,82 L48,82 Z','M60,78 L66,78 L66,82 L60,82 Z',
    'M70,78 L76,78 L76,82 L70,82 Z',
  ],
  infantry: [
    'M50,18 Q56,18 56,24 Q56,30 50,30 Q44,30 44,24 Q44,18 50,18 Z',
    'M42,32 L58,32 L56,54 L52,78 L48,78 L44,54 Z',
    'M44,54 L38,82 L35,82 L40,56 Z','M56,54 L62,82 L65,82 L60,56 Z',
    'M54,42 L78,48 L76,52 L54,48 Z','M44,22 Q44,16 50,16 Q56,16 56,22',
  ],
  sam: [
    'M24,74 L24,58 Q24,52 32,50 L32,44 L68,44 L68,50 Q76,52 76,58 L76,74 Q76,80 67,82 L33,82 Q24,80 24,74 Z',
    'M50,38 Q62,34 66,38 Q62,44 50,44 Q38,44 34,38 Q38,34 50,38 Z',
    'M46,44 L46,28 L54,28 L54,44 Z',
    'M30,48 L22,32 L24,30 L32,44 Z','M70,48 L78,32 L76,30 L68,44 Z',
    'M18,78 L28,78 L28,82 L18,82 Z','M72,78 L82,78 L82,82 L72,82 Z',
  ],
  engineer: [
    'M22,74 L22,57 Q22,50 30,48 L30,42 L70,42 L70,48 Q78,50 78,57 L78,74 Q78,80 69,82 L31,82 Q22,80 22,74 Z',
    'M56,42 L85,12 L88,14 L58,44 Z','M83,10 Q87,8 87,12 Q87,16 83,14 Z',
    'M78,48 L90,48 L90,64 L78,64 Z',
    'M18,78 L28,78 L28,82 L18,82 Z','M72,78 L82,78 L82,82 L72,82 Z',
  ],
  supply: [
    'M62,74 L62,58 Q62,52 70,50 L70,44 L70,30 Q70,25 64,23 L64,23 Q58,25 58,30 L58,44 L58,50 Q66,52 66,58 L66,74 Q66,80 57,82 L29,82 Q22,80 22,74 L22,58 Q22,52 30,50 L30,44 L30,30 Q30,25 36,23 L36,23 Q42,25 42,30 L42,44 L42,50 Q50,52 50,58 Z',
    'M62,56 L68,56 L68,60 L62,60 Z','M62,50 L68,50 L68,54 L62,54 Z',
    'M22,78 L30,78 L30,82 L22,82 Z','M38,78 L46,78 L46,82 L38,82 Z',
    'M54,78 L62,78 L62,82 L54,82 Z','M70,78 L78,78 L78,82 L70,82 Z',
  ],
  helicopter: [
    'M22,56 Q22,42 36,40 L36,34 Q36,28 50,26 Q64,28 64,34 L64,40 Q78,42 78,56 Q78,66 66,68 L34,68 Q22,66 22,56 Z',
    'M66,48 Q78,44 82,48 Q78,52 66,52 Z',
    'M50,34 L95,34 L95,36 L50,36 Z','M50,32 L95,32 L95,34 L50,34 Z',
    'M34,62 L12,58 L11,60 L34,64 Z','M34,66 L12,70 L11,72 L34,68 Z',
    'M42,56 L58,56 L58,60 L42,60 Z','M42,62 L58,62 L58,66 L42,66 Z',
  ],
  mlrs: [
    'M22,74 L22,56 Q22,50 30,48 L30,42 L70,42 L70,48 Q78,50 78,56 L78,74 Q78,80 69,82 L31,82 Q22,80 22,74 Z',
    'M34,38 L66,38 L66,24 L34,24 Z',
    'M40,30 L44,30 L44,36 L40,36 Z','M48,30 L52,30 L52,36 L48,36 Z','M56,30 L60,30 L60,36 L56,36 Z',
    'M40,40 L44,40 L44,46 L40,46 Z','M48,40 L52,40 L52,46 L48,46 Z','M56,40 L60,40 L60,46 L56,46 Z',
    'M26,58 L30,58 L30,76 L26,76 Z','M70,58 L74,58 L74,76 L70,76 Z',
    'M18,78 L28,78 L28,82 L18,82 Z','M72,78 L82,78 L82,82 L72,82 Z',
  ],
  atgm: [
    'M24,74 L24,60 Q24,54 32,52 L32,46 L68,46 L68,52 Q76,54 76,60 L76,74 Q76,80 67,82 L33,82 Q24,80 24,74 Z',
    'M50,44 L50,28 L52,28 L52,44 Z',
    'M46,42 L86,18 L89,20 L48,44 Z','M84,16 Q88,14 88,18 Q88,22 84,20 Z',
    'M18,78 L28,78 L28,82 L18,82 Z','M72,78 L82,78 L82,82 L72,82 Z',
  ],
  uav: [
    'M34,54 Q34,46 50,44 Q66,46 66,54 L66,58 Q66,64 50,66 Q34,64 66,58 Z',
    'M30,50 Q30,38 50,34 Q70,38 70,50 Q70,54 50,58 Q30,54 30,50 Z',
    'M26,56 L18,60 L17,62 L26,58 Z','M74,56 L82,60 L83,62 L74,58 Z',
    'M50,48 Q54,46 54,50 Q54,54 50,52 Q46,54 46,50 Q46,46 50,48 Z',
  ],
  command: [
    'M24,74 L24,56 Q24,50 32,48 L32,42 L68,42 L68,48 Q76,50 76,56 L76,74 Q76,80 67,82 L33,82 Q24,80 24,74 Z',
    'M46,42 L46,18 L48,18 L48,42 Z',
    'M30,24 Q30,16 46,12 Q50,10 54,12 Q70,16 70,24 Q70,28 50,32 Q30,28 30,24 Z',
    'M62,38 Q66,36 66,40 Q66,44 62,42 Q58,44 58,40 Q58,36 62,38 Z',
    'M18,78 L28,78 L28,82 L18,82 Z','M72,78 L82,78 L82,82 L72,82 Z',
  ],
  ew: [
    'M24,74 L24,56 Q24,50 32,48 L32,42 L68,42 L68,48 Q76,50 76,56 L76,74 Q76,80 67,82 L33,82 Q24,80 24,74 Z',
    'M50,44 Q66,34 74,38 Q66,44 58,50 Q50,44 42,50 Q34,44 26,38 Q34,34 50,44 Z',
    'M58,38 L66,34 L68,36 L60,42 Z',
    'M50,36 Q54,32 58,34 Q54,38 50,40 Q46,38 42,34 Q46,32 50,36 Z',
    'M18,78 L28,78 L28,82 L18,82 Z','M72,78 L82,78 L82,82 L72,82 Z',
  ],
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

function parseSvgPath(ctx: CanvasRenderingContext2D, d: string) {
  let x = 0, y = 0;
  const parts = d.match(/[MLHVQCSZmlhvqcsz][^MLHVQCSZmlhvqcsz]*/gi) || [];
  for (const p of parts) {
    const cmd = p[0];
    const nums = [...(p.slice(1).match(/-?[0-9.]+/g) || [])].map(Number);
    let i = 0;
    switch (cmd) {
      case 'M': x = nums[i++]; y = nums[i++]; ctx.moveTo(x, y); break;
      case 'm': x += nums[i++]; y += nums[i++]; ctx.moveTo(x, y); break;
      case 'L': while (i < nums.length) { x = nums[i++]; y = nums[i++]; ctx.lineTo(x, y); } break;
      case 'l': while (i < nums.length) { x += nums[i++]; y += nums[i++]; ctx.lineTo(x, y); } break;
      case 'H': x = nums[0]; ctx.lineTo(x, y); break; case 'h': x += nums[0]; ctx.lineTo(x, y); break;
      case 'V': y = nums[0]; ctx.lineTo(x, y); break; case 'v': y += nums[0]; ctx.lineTo(x, y); break;
      case 'Z': case 'z': ctx.closePath(); break;
      case 'Q':
        while (i + 3 < nums.length) { const cx = nums[i++], cy = nums[i++], ex = nums[i++], ey = nums[i++];
          ctx.quadraticCurveTo(cx, cy, ex, ey); x = ex; y = ey; } break;
      case 'q':
        while (i + 3 < nums.length) { const cx = x + nums[i++], cy = y + nums[i++], ex = x + nums[i++], ey = y + nums[i++];
          ctx.quadraticCurveTo(cx, cy, ex, ey); x = ex; y = ey; } break;
      default: break;
    }
  }
}

function drawNatoSymbol(unitType: UnitType, faction: Faction, size: number = 256, isHero?: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const fc = FACTION_COLORS[faction];
  const PAD = Math.round(size * 0.06);

  ctx.clearRect(0, 0, size, size);
  const fw = size - PAD * 2, fh = fw * 0.78, fx = PAD, fy = (size - fh) / 2;

  // 底座
  roundRect(ctx, fx, fy, fw, fh, size * 0.06);
  ctx.fillStyle = fc.base; ctx.fill();

  // 内边框
  roundRect(ctx, fx + size * 0.02, fy + size * 0.02, fw - size * 0.04, fh - size * 0.04, size * 0.04);
  ctx.strokeStyle = fc.dark; ctx.lineWidth = size * 0.012; ctx.stroke();

  // 白色剪影
  const paths = SILHOUETTE_PATHS[unitType];
  const area = Math.min(fw, fh) * 0.82;
  const scale = area / 100;

  ctx.save();
  ctx.translate(c, c + (fy + fh / 2 - c) * 0.05);
  ctx.scale(scale, scale);
  ctx.translate(-50, -50);

  ctx.fillStyle = '#ffffff';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  for (const d of paths) {
    ctx.beginPath();
    parseSvgPath(ctx, d);
    ctx.fill();
  }

  ctx.restore();

  // 英雄装饰
  if (isHero) {
    ctx.save();
    roundRect(ctx, fx - size * 0.01, fy - size * 0.01, fw + size * 0.02, fh + size * 0.02, size * 0.05);
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = size * 0.025;
    ctx.setLineDash([size * 0.04, size * 0.02]); ctx.stroke(); ctx.setLineDash([]);
    // 星标
    ctx.beginPath();
    const sr = size * 0.055, ir = sr * 0.4;
    for (let j = 0; j < 10; j++) {
      const r = j % 2 === 0 ? sr : ir, a = (Math.PI / 5) * j - Math.PI / 2;
      const px = c + Math.cos(a) * sr * 1.6, py = fy - size * 0.03 + Math.sin(a) * sr * 1.6;
      j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fillStyle = '#ffd700'; ctx.fill();
    ctx.restore();
  }

  return canvas;
}

/** 使用预生成的PNG图片作为棋子纹理 */
const _textureLoader = new THREE.TextureLoader();
const _natoTextureCache = new Map<string, THREE.Texture>();

function getNatoSymbolTexture(unitType: UnitType, faction: Faction, isHero?: boolean): THREE.Texture {
  const cacheKey = `${unitType}_${faction}${isHero ? '_hero' : ''}`;

  if (_natoTextureCache.has(cacheKey)) {
    return _natoTextureCache.get(cacheKey)!;
  }

  const heroSuffix = isHero ? '_hero' : '';
  const textureUrl = `/nato-symbols/${unitType}_${faction}${heroSuffix}.png`;
  const texture = _textureLoader.load(textureUrl);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  _natoTextureCache.set(cacheKey, texture);
  return texture;
}

// ===== Health Bar Canvas Texture Helper =====
interface HealthBarOptions {
  hp: number;
  maxHp: number;
  isHero?: boolean;
  isFortified?: boolean;
  isStealthed?: boolean;
  flashIntensity?: number; // 0..1 damage flash intensity
  // v32.0: Ammo and morale for secondary bars
  ammo?: number;
  maxAmmo?: number;
  morale?: number;
}

// v34.0: Smooth HP color gradient (green→yellow→red) instead of discrete steps
function getHpColor(ratio: number): string {
  if (ratio > 0.7) {
    // Green zone (100%-70%): lerp from bright green to yellow-green
    const t = (ratio - 0.7) / 0.3; // 0 at 70%, 1 at 100%
    const r = Math.round(74 + (34 - 74) * (1 - t));  // 74→34
    const g = Math.round(222 + (197 - 222) * (1 - t)); // 222→197
    const b = Math.round(128 + (94 - 128) * (1 - t));  // 128→94
    return `rgb(${r},${g},${b})`;
  } else if (ratio > 0.3) {
    // Yellow-orange zone (70%-30%): lerp from yellow to orange
    const t = (ratio - 0.3) / 0.4; // 0 at 30%, 1 at 70%
    // v90.0: Fixed dead code — (251-251) was always 0, r was constant 251.
    // Now properly interpolates from orange (249) at t=0 to yellow (251) at t=1.
    const r = Math.round(249 + (251 - 249) * t); // 249→251
    const g = Math.round(146 + (191 - 146) * t); // 146→191
    const b = Math.round(60 + (36 - 60) * (1 - t)); // 60→36
    return `rgb(${r},${g},${b})`;
  } else {
    // Red zone (30%-0%): lerp from red to dark red
    const t = ratio / 0.3; // 0 at 0%, 1 at 30%
    const r = Math.round(220 + (248 - 220) * t); // 220→248
    const g = Math.round(38 + (113 - 38) * t);  // 38→113
    const b = Math.round(38 + (113 - 38) * t);  // 38→113
    return `rgb(${r},${g},${b})`;
  }
}

// v57.0: Reusable off-screen canvas for HP bar animation updates — avoids createElement per frame
const _hpBarOffscreen = (typeof document !== 'undefined') ? document.createElement('canvas') : null;

// v87.0: Shared canvas for drawing labels — cloned before THREE.CanvasTexture to avoid shared buffer race
// THREE.CanvasTexture holds a reference to the canvas; if canvas is mutated, all textures change.
// v88.0: Fixed by cloning canvas data via drawImage before texture creation.
const _sharedLabelCanvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
const _sharedLabelCtx = _sharedLabelCanvas ? _sharedLabelCanvas.getContext('2d') : null;

/** v88.0: Clone canvas content to a new canvas element for safe THREE.CanvasTexture creation */
function _cloneCanvas(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const clone = document.createElement('canvas');
  clone.width = w;
  clone.height = h;
  clone.getContext('2d')!.drawImage(src, 0, 0);
  return clone;
}

function createHealthBarCanvas(opts: HealthBarOptions, target?: HTMLCanvasElement): HTMLCanvasElement {
  const { hp, maxHp, isHero, isFortified, isStealthed, flashIntensity, ammo, maxAmmo, morale } = opts;
  const canvas = target || document.createElement('canvas');
  const width = 128;
  const showIcons = isHero || isFortified || isStealthed;
  const iconBarHeight = showIcons ? 14 : 0;
  const textBarHeight = 16;
  // v32.0: Add space for ammo/morale bars
  const showSecondaryBars = (ammo !== undefined && maxAmmo !== undefined && maxAmmo > 0) || (morale !== undefined);
  const secondaryBarHeight = showSecondaryBars ? 8 : 0;
  const height = 20 + textBarHeight + iconBarHeight + secondaryBarHeight;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const isFullHealth = ratio >= 0.99;
  const fillColor = getHpColor(ratio);

  // === Icon row (top, only if needed) ===
  let yOffset = 0;
  if (showIcons) {
    yOffset = iconBarHeight;
    let iconX = width / 2;
    const iconY = iconBarHeight / 2;

    if (isHero) {
      // Golden star ★
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(251,191,36,0.6)';
      ctx.shadowBlur = 3;
      ctx.fillText('★', iconX, iconY);
      ctx.shadowBlur = 0;
      iconX -= 14;
    }
    if (isFortified) {
      // Shield icon 🛡
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#60a5fa';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('◆', iconX, iconY);
      iconX -= 14;
    }
    if (isStealthed) {
      // Stealth eye icon
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#a78bfa';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('◉', iconX, iconY);
    }
  }

  // === HP Bar ===
  const barX = 4;
  const barY = yOffset + 2;
  const barWidth = width - 8;
  const barHeight = 16;
  const barRadius = 3;

  // Damage flash overlay - bright white flash when taking damage
  const isFlashing = flashIntensity !== undefined && flashIntensity > 0.01;

  // Background (dark gray)
  ctx.globalAlpha = isFullHealth ? 0.3 : 0.75;
  ctx.fillStyle = '#222222';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barWidth, barHeight, barRadius);
  ctx.fill();

  // HP fill
  if (ratio > 0.001) {
    const fillWidth = Math.max(barRadius * 2, barWidth * ratio);
    ctx.globalAlpha = isFullHealth ? 0.35 : 1.0;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillWidth, barHeight, barRadius);
    ctx.fill();

    // Highlight on top half of fill for 3D effect
    ctx.globalAlpha = isFullHealth ? 0.15 : 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillWidth, barHeight * 0.4, [barRadius, barRadius, 0, 0]);
    ctx.fill();

    // Damage flash white overlay
    if (isFlashing) {
      ctx.globalAlpha = flashIntensity * 0.8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillWidth, barHeight, barRadius);
      ctx.fill();
    }
  }

  // White border
  ctx.globalAlpha = 1.0;
  ctx.strokeStyle = isFlashing
    ? `rgba(255,255,255,${0.5 + flashIntensity * 0.5})`
    : isFullHealth ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barWidth, barHeight, barRadius);
  ctx.stroke();

  // v32.0: HP Text (below bar) — moved BEFORE secondary bars to fix textY reference error
  const textY = barY + barHeight + textBarHeight - 1;
  ctx.globalAlpha = 1.0;
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = isFullHealth ? 'rgba(255,255,255,0.4)' : '#e0e0e0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 2;
  ctx.fillText(`${Math.ceil(hp)}/${maxHp}`, width / 2, textY);
  ctx.shadowBlur = 0;

  // === v32.0: Ammo & Morale secondary bars (below HP text) ===
  let secondaryY = textY + 2;
  if (showSecondaryBars) {
    ctx.globalAlpha = 0.6;
    // Ammo bar (left half)
    if (ammo !== undefined && maxAmmo !== undefined && maxAmmo > 0) {
      const ammoRatio = Math.max(0, Math.min(1, ammo / maxAmmo));
      const ammoBarW = (width - 12) / 2 - 2;
      const ammoX = 4;
      ctx.fillStyle = '#333333';
      ctx.beginPath();
      ctx.roundRect(ammoX, secondaryY, ammoBarW, 5, 1);
      ctx.fill();
      if (ammoRatio > 0) {
        const ammoColor = ammoRatio > 0.5 ? '#60a5fa' : ammoRatio > 0.2 ? '#fbbf24' : '#f87171';
        ctx.fillStyle = ammoColor;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.roundRect(ammoX, secondaryY, ammoBarW * ammoRatio, 5, 1);
        ctx.fill();
      }
      // Morale bar (right half)
      if (morale !== undefined) {
        const moraleRatio = Math.max(0, Math.min(1, morale / 100));
        const moraleBarW = (width - 12) / 2 - 2;
        const moraleX = width / 2 + 2;
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#333333';
        ctx.beginPath();
        ctx.roundRect(moraleX, secondaryY, moraleBarW, 5, 1);
        ctx.fill();
        if (moraleRatio > 0) {
          const moraleColor = moraleRatio > 0.7 ? '#4ade80' : moraleRatio > 0.3 ? '#fbbf24' : '#f87171';
          ctx.fillStyle = moraleColor;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.roundRect(moraleX, secondaryY, moraleBarW * moraleRatio, 5, 1);
          ctx.fill();
        }
      }
    }
  }

  return canvas;
}

// ===== Tracer Line Interface =====
interface TracerLine {
  coreLine: THREE.Line;
  glowLine: THREE.Line;
  startTime: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  duration: number;
  isCounter: boolean;
  completed: boolean;
}

// ===== Particle System =====
interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  // v77.0: Per-particle gravity — smoke rises (negative), debris falls (positive)
  gravity: number;
}

// ===== Battle Visual Effect Types =====
let effectIdCounter = 0;
let deathAnimIdCounter = 0;

interface ProjectileAnimation {
  id: number;
  mainSphere: THREE.Mesh;
  trailSpheres: THREE.Mesh[];
 pointLight: THREE.PointLight;
 from: THREE.Vector3;
 to: THREE.Vector3;
 startTime: number;
 duration: number;
 isCounter: boolean;
 completed: boolean;
 objects: THREE.Object3D[];
}

interface ExplosionAnimation {
  id: number;
 particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; gravity?: number }[];
  centralFlash: THREE.Mesh | null;
  shockwave: THREE.Mesh | null;
 startTime: number;
  duration: number;
  position?: THREE.Vector3;
  isCounter?: boolean;
  objects: THREE.Object3D[];
}

interface MuzzleFlashAnimation {
  id: number;
  sphere: THREE.Mesh;
  pointLight: THREE.PointLight | null;
  startTime: number;
  duration: number;
  objects: THREE.Object3D[];
}

interface CameraShakeEffect {
  startTime: number;
  duration: number;
  intensity: number;
}

// ===== Reinforcement Arrival Effect =====
interface ReinforcementEffect {
  id: number;
  beam: THREE.Mesh;
  groundRing: THREE.Mesh;
  particles: THREE.Mesh[];
  startTime: number;
  duration: number;
  faction: 'red' | 'blue';
  objects: THREE.Object3D[];
}

// ===== Level Up Effect =====
interface LevelUpEffect {
  id: number;
  spiralParticles: { mesh: THREE.Mesh; angle: number; radius: number; baseY: number; speed: number }[];
  flash: THREE.Mesh;
  textSprite: THREE.Sprite;
  startTime: number;
  duration: number;
  objects: THREE.Object3D[];
}

// ===== Capture Point Pulse Effect =====
interface CapturePulseEffect {
  cpId: string;
  ring: THREE.Mesh;
  glowRing: THREE.Mesh;
  objects: THREE.Object3D[];
}

// v93.0: Floating 3D damage/heal number sprites
interface FloatingDamageSprite {
  id: number;
  sprite: THREE.Sprite;
  startTime: number;
  duration: number;      // ms (1500 for damage/heal, 2000 for kill)
  startY: number;        // world Y position at spawn
  riseDistance: number;   // how far the sprite rises over its lifetime
  popupType: DamagePopup['type'];
  objects: THREE.Object3D[];
}

class ParticleManager {
  private particles: Particle[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // v76.0: Pre-create shared geometry pool for particles (reused across all effects)
    this._sharedGeoSmall = new THREE.SphereGeometry(0.03, 4, 4);
    this._sharedGeoMed = new THREE.SphereGeometry(0.06, 4, 4);
    this._sharedGeoLarge = new THREE.SphereGeometry(0.1, 4, 4);
  }

  // v76.0: Shared geometry pool — eliminates ~40 GPU allocations per explosion
  private _sharedGeoSmall: THREE.SphereGeometry;
  private _sharedGeoMed: THREE.SphereGeometry;
  private _sharedGeoLarge: THREE.SphereGeometry;

  /** Pick a shared geometry based on approximate size, or create one if no match */
  private _getSharedGeo(size: number): THREE.SphereGeometry {
    if (size <= 0.035) return this._sharedGeoSmall;
    if (size <= 0.07) return this._sharedGeoMed;
    return this._sharedGeoLarge;
  }

  spawnExplosion(position: THREE.Vector3, count: number = 20) {
    for (let i = 0; i < count; i++) {
      const size = 0.02 + Math.random() * 0.05;
      // v76.0: Use shared geometry from pool
      const geo = this._getSharedGeo(size);
      const hue = 0.04 + Math.random() * 0.06;
      const color = new THREE.Color().setHSL(hue, 1.0, 0.5 + Math.random() * 0.3);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);

      const speed = 0.5 + Math.random() * 1.5;
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5 + 0.5,
        (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(speed);

      const life = 0.6 + Math.random() * 0.6;
      this.particles.push({
        mesh,
        velocity: dir,
        life,
        maxLife: life,
        gravity: 2.0, // v77.0: explosion debris falls
      });
    }
  }

  spawnSmoke(position: THREE.Vector3, count: number = 12) {
    for (let i = 0; i < count; i++) {
      const size = 0.04 + Math.random() * 0.08;
      const geo = this._getSharedGeo(size);
      const lightness = 0.2 + Math.random() * 0.3;
      const color = new THREE.Color().setHSL(0, 0, lightness);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);

      const speed = 0.3 + Math.random() * 0.7;
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        Math.random() * 1.0 + 0.3,
        (Math.random() - 0.5) * 0.8
      ).normalize().multiplyScalar(speed);

      const smokeLife = 0.8 + Math.random() * 0.8;
      this.particles.push({
        mesh,
        velocity: dir,
        life: smokeLife,
        maxLife: smokeLife,
        gravity: 0.0, // v77.0: smoke lingers, no gravity
      });
    }
  }

  spawnMuzzleFlash(position: THREE.Vector3, direction: THREE.Vector3) {
    for (let i = 0; i < 8; i++) {
      const size = 0.02 + Math.random() * 0.04;
      const geo = this._getSharedGeo(size);
      const color = new THREE.Color().setHSL(0.12, 1.0, 0.7 + Math.random() * 0.3);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);

      const spread = 0.5;
      const dir = direction.clone().normalize().multiplyScalar(1.5 + Math.random() * 1.0);
      dir.x += (Math.random() - 0.5) * spread;
      dir.y += (Math.random() - 0.5) * spread;
      dir.z += (Math.random() - 0.5) * spread;

      const flashLife = 0.1 + Math.random() * 0.15;
      this.particles.push({
        mesh,
        velocity: dir,
        life: flashLife,
        maxLife: flashLife,
        gravity: 1.0, // v77.0: muzzle flash slight fall
      });
    }
  }

  /** v76.0: Spawn a lingering death smoke column — particles rise and fade slowly */
  spawnDeathSmokeColumn(position: THREE.Vector3, faction: 'red' | 'blue') {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const geo = this._getSharedGeo(0.06 + Math.random() * 0.06);
      const lightness = faction === 'red' ? 0.15 + Math.random() * 0.2 : 0.2 + Math.random() * 0.2;
      const color = new THREE.Color().setHSL(0, 0, lightness);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
      const mesh = new THREE.Mesh(geo, mat);
      // Stagger initial positions in a column
      mesh.position.copy(position);
      mesh.position.x += (Math.random() - 0.5) * 0.3;
      mesh.position.z += (Math.random() - 0.5) * 0.3;
      mesh.position.y += Math.random() * 0.4;
      this.scene.add(mesh);

      const speed = 0.1 + Math.random() * 0.2;
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 0.15,
        0.3 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.15
      );

      const smokeLife = 1.5 + Math.random() * 1.5;
      this.particles.push({
        mesh,
        velocity: dir,
        life: smokeLife,
        maxLife: smokeLife,
        gravity: -0.3, // v77.0: death smoke rises (buoyancy)
      });
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        // v76.0: Don't dispose shared geometry — only dispose material
        (p.mesh.material as THREE.Material).dispose();
        // v87.0: Swap-with-last instead of splice to avoid O(n) shift per dead particle
        const lastIdx = this.particles.length - 1;
        if (i !== lastIdx) {
          this.particles[i] = this.particles[lastIdx];
        }
        this.particles.pop();
        continue;
      }

      p.mesh.position.addScaledVector(p.velocity, dt);
      // v77.0: Use per-particle gravity (debris falls, smoke rises)
      p.velocity.y -= p.gravity * dt;

      const lifeRatio = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = lifeRatio;
      p.mesh.scale.setScalar(lifeRatio);
    }
  }

  dispose() {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      // v76.0: Don't dispose shared geometry — only dispose material
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    // v76.0: Dispose shared geometries
    this._sharedGeoSmall.dispose();
    this._sharedGeoMed.dispose();
    this._sharedGeoLarge.dispose();
  }
}

// ===== Fog of War Helper =====
function computeVisibleCells(playerUnits: Unit[], mapCells: { terrain: string }[][], weather?: WeatherType): Set<string> {
  const visible = new Set<string>();
  const weatherVisionMod = weather ? WEATHER_CONFIGS[weather].visionModifier : 0;
  for (const unit of playerUnits) {
    if (!unit.isAlive) continue;
    // Apply weather visionModifier (e.g. fog: -3 reduces vision by 3 cells)
    const baseVision = Math.max(0, unit.stats.vision + weatherVisionMod);
    // v87.0: Compute effectiveVision BEFORE the loop so search radius includes terrain bonus
    const unitTerrain = mapCells[unit.position.z]?.[unit.position.x]?.terrain;
    const unitTerrainCfg = unitTerrain ? TERRAIN_CONFIGS[unitTerrain] : null;
    const effectiveVision = baseVision + (unitTerrainCfg?.stats.visionBonus ?? 0);
    const vision = effectiveVision; // rename for clarity; loop uses effectiveVision
    for (let dz = -vision; dz <= vision; dz++) {
      for (let dx = -vision; dx <= vision; dx++) {
        const x = unit.position.x + dx;
        const z = unit.position.z + dz;
        if (x < 0 || x >= MAP_WIDTH || z < 0 || z >= MAP_HEIGHT) continue;

        // Terrain reduces vision through obstacles
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Check if line of sight is blocked by terrain
        let blocked = false;
        let visionPenalty = 0;

        // Trace line from unit to target cell
        const steps = Math.max(Math.abs(dx), Math.abs(dz));
        if (steps > 0) {
          for (let s = 1; s < steps; s++) {
            const cx = unit.position.x + Math.round(dx * s / steps);
            const cz = unit.position.z + Math.round(dz * s / steps);
            if (cx < 0 || cx >= MAP_WIDTH || cz < 0 || cz >= MAP_HEIGHT) continue;
            const terrain = mapCells[cz]?.[cx]?.terrain;
            const terrainCfg = terrain ? TERRAIN_CONFIGS[terrain] : null;
            if (terrainCfg) {
              if (terrainCfg.stats.visionBlock >= 99) {
                // Terrain blocks vision entirely unless unit is on similar blocking terrain
                // v87.0: use pre-computed unitTerrainCfg from outer scope
                if (!unitTerrainCfg || unitTerrainCfg.stats.visionBlock < 99) {
                  blocked = true;
                  break;
                }
              }
              if (terrainCfg.stats.visionBlock > 0 && terrainCfg.stats.visionBlock < 99) {
                visionPenalty += terrainCfg.stats.visionBlock;
              }
            }
          }
        }

        // v87.0: effectiveVision already computed in outer scope (terrain vision bonus applied)
        if (!blocked && (dist - visionPenalty) <= effectiveVision) {
          visible.add(`${x},${z}`);
        }
      }
    }
  }
  return visible;
}

// ===== BFS Path Finder for Movement Preview =====
function findBFSPath(
  startPos: Position,
  endPos: Position,
  movablePositions: Position[],
  mapCells: { terrain: string; unit: any }[][],
  unitType: string
): Position[] {
  if (startPos.x === endPos.x && startPos.z === endPos.z) return [];
  
  const isVehicle = unitType !== 'infantry' && unitType !== 'helicopter';
  const isHelicopter = unitType === 'helicopter';
  const movableSet = new Set(movablePositions.map(p => `${p.x},${p.z}`));
  movableSet.add(`${startPos.x},${startPos.z}`); // Start is always valid
  
  if (!movableSet.has(`${endPos.x},${endPos.z}`)) return [];
  
  // BFS from end to start for shortest path
  const visited = new Map<string, string>(); // key -> parent key
  const queue: Position[] = [endPos];
  visited.set(`${endPos.x},${endPos.z}`, '');
  
  const dirs = [{ x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 }];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = `${current.x},${current.z}`;
    
    if (current.x === startPos.x && current.z === startPos.z) {
      // Reconstruct path
      const path: Position[] = [];
      let key: string = currentKey;
      while (key && key !== `${endPos.x},${endPos.z}`) {
        const [x, z] = key.split(',').map(Number);
        path.push({ x, z });
        key = visited.get(key) || '';
      }
      path.push(endPos);
      return path;
    }
    
    for (const dir of dirs) {
      const nx = current.x + dir.x;
      const nz = current.z + dir.z;
      const nKey = `${nx},${nz}`;
      
      if (visited.has(nKey)) continue;
      if (!movableSet.has(nKey)) continue;
      
      // Check passability
      const cell = mapCells[nz]?.[nx];
      if (!cell) continue;
      const terrain = TERRAIN_CONFIGS[cell.terrain];
      if (!terrain) continue;
      if (!terrain.stats.isPassable && !isHelicopter) continue;
      if (isVehicle && !terrain.stats.isPassableByVehicle) continue;
      
      visited.set(nKey, currentKey);
      queue.push({ x: nx, z: nz });
    }
  }
  
  return []; // No path found
}

// ===== Veterancy Badge Canvas Texture Helper =====
function createVeterancyBadgeCanvas(title: string): HTMLCanvasElement {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  if (title === '传奇') {
    // Gold crown shape
    ctx.fillStyle = '#fbbf24';
    ctx.shadowColor = 'rgba(251,191,36,0.7)';
    ctx.shadowBlur = 6;
    // Crown base
    ctx.beginPath();
    ctx.moveTo(12, 42);
    ctx.lineTo(12, 28);
    ctx.lineTo(20, 36);
    ctx.lineTo(cx, 22);
    ctx.lineTo(44, 36);
    ctx.lineTo(52, 28);
    ctx.lineTo(52, 42);
    ctx.closePath();
    ctx.fill();
    // Crown gems
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.arc(cx, 30, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(20, 34, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(44, 34, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (title === '精英') {
    // Silver diamond
    ctx.fillStyle = '#c0c0c0';
    ctx.shadowColor = 'rgba(192,192,192,0.7)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(cx, 10);
    ctx.lineTo(cx + 18, cy);
    ctx.lineTo(cx, 54);
    ctx.lineTo(cx - 18, cy);
    ctx.closePath();
    ctx.fill();
    // Inner diamond highlight
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.moveTo(cx, 18);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx, 46);
    ctx.lineTo(cx - 10, cy);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    // Center star dot
    ctx.fillStyle = '#9ca3af';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (title === '老兵') {
    // Bronze circle with star
    ctx.fillStyle = '#cd7f32';
    ctx.shadowColor = 'rgba(205,127,50,0.6)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Inner circle
    ctx.strokeStyle = '#daa520';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();
    // 5-point star in center
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const x = cx + Math.cos(angle) * 10;
      const y = cy + Math.sin(angle) * 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  return canvas;
}

// ===== Damage Estimate Helpers =====
// v78.0: Return a new frozen object each call to prevent mutation corruption
function getPlainsFallbackCell(): MapCell {
  return Object.freeze({ position: { x: 0, z: 0 }, terrain: 'plains', unit: null, fortified: false, capturePointId: null });
}

function estimateDamage(attacker: Unit, defender: Unit, cell: MapCell | null | undefined, hasMoved?: boolean, weather?: WeatherType, nearbyUnits?: Unit[]): { min: number; max: number; reduction: number; isFlanking: boolean } {
  return engineEstimateDamage(attacker, defender, cell ?? getPlainsFallbackCell(), hasMoved, weather, nearbyUnits);
}

// ===== Counter-Attack Danger Zone Helper =====
// v70.0: Refactored to use unit's live abilities (consistent with tooltip/ring calculations)
function getEnemyAttackRange(enemyUnit: Unit): number {
  let range = enemyUnit.stats.attackRange;
  const bonus = enemyUnit.abilities?.find(a => a.effect?.attackRangeBonus)?.effect?.attackRangeBonus ?? 0;
  range += bonus;
  return range;
}

export default function GameScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  // v72.0: minimapCanvasRef removed — duplicate minimap (Minimap.tsx handles rendering)
  const [hoveredUnitInfo, setHoveredUnitInfo] = useState<{ name: string; x: number; y: number } | null>(null);
  const [damageEstimate, setDamageEstimate] = useState<{ min: number; max: number; counterMin?: number; counterMax?: number; reduction?: number; isFlanking?: boolean; counterReduction?: number; x: number; y: number } | null>(null);
  const [cursorInfo, setCursorInfo] = useState<{ terrainName: string; unitName?: string; x: number; y: number } | null>(null);
  const [terrainTooltip, setTerrainTooltip] = useState<TerrainTooltipData | null>(null);
  // v49.0: Refs for equality-guarded setState in animate() — prevents React re-renders when values haven't changed
  const prevCursorInfoRef = useRef<string | null>(null);
  const prevTerrainTooltipRef = useRef<string | null>(null);
  const prevHoveredUnitRef = useRef<string | null>(null);
  const prevDamageEstRef = useRef<string | null>(null);

  interface TerrainTooltipData {
    terrainName: string;
    moveCost: number;
    attackBonus: number;
    defenseBonus: number;
    visionBonus: number;
    unitName?: string;
    unitHp?: number;
    unitMaxHp?: number;
    unitFaction?: string;
    unitLevel?: number;
    unitIsHero?: boolean;
    unitHeroAbilities?: Array<{ id: string; name: string; icon: string; type: string; description: string; currentCooldown: number; cooldown: number }>;
    unitInSupplyRange?: boolean;
    unitIsStealthed?: boolean;
    unitAmmo?: number;
    unitMaxAmmo?: number;
    unitMorale?: number;
    currentWeather?: string;
    weatherMoveModifier?: number;
    weatherAttackModifier?: number;
    unitXp?: number;
    unitXpToNextLevel?: number;
    unitEffectiveDefense?: number;
    unitAttack?: number;
    unitDefense?: number;
    unitArmor?: number;
    unitMoveRange?: number;
    unitVision?: number;
    unitAttackRange?: number;
    unitArmorPen?: number;
    unitTempBuff?: number;
    fortified: boolean;
    hasMinefield: boolean;
    minefieldOwner?: string;
    capturePoint?: { owner: string | null; type: string };
    // v60.0: Capture contest progress
    captureRedProgress?: number;
    captureBlueProgress?: number;
    captureThreshold?: number;
    isPassable: boolean;
    // v67.0: Veterancy title
    unitVeterancyTitle?: string | null;
    // v61.0: Enemy threat count on this cell
    enemyThreatCount?: number;
    // v62.0: Unit combat history + terrain height
    unitTotalDamageDealt?: number;
    unitKillCount?: number;
    terrainHeight?: number;
    // v64.0: Fortification remaining turns
    fortifiedRemainingTurns?: number;
    screenX: number;
    screenY: number;
  }

  // Floating damage number state
  const [screenFlash, setScreenFlash] = useState<{color: string; opacity: number} | null>(null);
  // v51.0: Track screen flash timeout to prevent overlapping flashes
  const screenFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ===== Visual Effect Refs =====
  const reinforcementEffectsRef = useRef<ReinforcementEffect[]>([]);
  // v27.0: Death animation tracking
  interface DeathAnimation {
    id: number;
    mesh: THREE.Group;
    startTime: number;
    duration: number;
    startPos: THREE.Vector3;
    faction: 'red' | 'blue';
  }
  const deathAnimationsRef = useRef<DeathAnimation[]>([]);
  const prevUnitIdsRef = useRef<Set<string>>(new Set());
  // v93.0: Track last seen map hash to reset refs on new game
  const lastMapHashRef = useRef<string>('');
  const levelUpEffectsRef = useRef<LevelUpEffect[]>([]);
  const processedLevelUpIdsRef = useRef<Set<number>>(new Set());
  const capturePulseEffectsRef = useRef<CapturePulseEffect[]>([]);
  // v81.0: Track capture point progress arc meshes for live animation
  const captureProgressArcsRef = useRef<{ cpId: string; redArc: THREE.Mesh; blueArc: THREE.Mesh; lastHeight: number; lastRedRatio: number; lastBlueRatio: number }[]>([]);
  // v92.0: O(1) lookup Map alongside captureProgressArcsRef array
  const captureProgressArcMapRef = useRef<Map<string, { cpId: string; redArc: THREE.Mesh; blueArc: THREE.Mesh; lastHeight: number; lastRedRatio: number; lastBlueRatio: number }>>(new Map());
  // v93.0: Floating 3D damage number sprites
  const floatingDamageSpritesRef = useRef<FloatingDamageSprite[]>([]);

  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    renderer: THREE.WebGLRenderer;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    mapGroup: THREE.Group;
    unitGroup: THREE.Group;
    highlightGroup: THREE.Group;
    fogGroup: THREE.Group;
    gridGroup: THREE.Group;
    coordGroup: THREE.Group;
    pathGroup: THREE.Group;
    rangeGroup: THREE.Group;
    selectionGroup: THREE.Group;
    projectileGroup: THREE.Group;
    effectsGroup: THREE.Group;
    interactiveGroup: THREE.Group;
    cursorGroup: THREE.Group;
    // v54.0: Pre-allocated cursor meshes (reused every frame)
    cursorRingMesh: THREE.Mesh;
    // v54.0: Reusable Map for liveUnitMap (cleared + repopulated each frame)
    _liveUnitMap: Map<string, Unit> | null;
    cellMeshes: THREE.Mesh[][];
    flatCellMeshes: THREE.Mesh[]; // v48.0: pre-flattened for raycasting performance
    unitMeshes: Map<string, THREE.Group>;
    waterMeshes: THREE.Mesh[];
    animationId: number;
    hoveredCell: { x: number; z: number } | null;
    startTime: number;
    particleManager: ParticleManager | null;
    attackFlashes: { mesh: THREE.Mesh; startTime: number }[];
    lastAttackablePositions: Position[];
    prevUnitAliveMap: Map<string, boolean>;
    ghostMesh: THREE.Group | null;
    ghostPosition: Position | null;
    ghostUnitType: string | null;
    projectiles: { line: THREE.Line; startTime: number; from: THREE.Vector3; to: THREE.Vector3; age: number }[];
    shakeTargets: { unitId: string; startTime: number; originalPos: THREE.Vector3 }[];
    lastCombatLogLength: number;
    projectileAnimations: ProjectileAnimation[];
    explosionAnimations: ExplosionAnimation[];
    muzzleFlashAnims: MuzzleFlashAnimation[];
    cameraShake: CameraShakeEffect | null;
    weatherGroup: THREE.Group;
    weatherPoints: THREE.Points | null;
    weatherFogPlane: THREE.Mesh | null;
    weatherSandFogPlane: THREE.Mesh | null;
    weatherParticlePositions: Float32Array | null;
    weatherParticleVelocities: Float32Array | null;
    weatherParticleOffsets: Float32Array | null;
    weatherParticleYVelocities: Float32Array | null;
    weatherRainLines: THREE.Group | null;
    weatherDriftFogPlanes: THREE.Mesh[];
    // v84.0: Ambient weather particle layer (secondary atmospheric dust)
    ambientWeatherParticles: THREE.Points | null;
    ambientWeatherPositions: Float32Array | null;
    ambientLight: THREE.AmbientLight;
    directionalLight: THREE.DirectionalLight;
    hemisphereLight: THREE.HemisphereLight;
    weatherLightTransition: {
      startTime: number;
      duration: number;
      fromAmbientIntensity: number;
      fromAmbientColor: THREE.Color;
      fromDirIntensity: number;
      fromDirColor: THREE.Color;
      fromHemiIntensity: number;
      toAmbientIntensity: number;
      toAmbientColor: THREE.Color;
      toDirIntensity: number;
      toDirColor: THREE.Color;
      toHemiIntensity: number;
      toFogNear: number;
      toFogFar: number;
      toSceneFog: boolean;
    } | null;
    weatherFadeIn: { startTime: number; duration: number } | null;
    displayedHpMap: Map<string, number>; // unitId -> displayed HP (for smooth animation)
    tracerLines: TracerLine[]; // glowing attack tracer lines
    damageFlashMap: Map<string, number>; // unitId -> flash start timestamp (performance.now)
    pathPreviewGroup: THREE.Group;
    damagePreviewSprites: THREE.Object3D[];
    threatGroup: THREE.Group;
    dangerZoneGroup: THREE.Group;
    // v57.0: Cached unit group array for raycasting (rebuilt only when unitMeshes.size changes)
    _unitGroupArray: THREE.Group[];
    _unitGroupArrayVersion: number;
    // v57.0: Reusable buffer for visible enemies — avoids per-frame allocation
    _visibleEnemiesBuffer: Unit[] | null;
    prevHoveredCellMesh: THREE.Mesh | null;
    rallyGlowActive: boolean;
    rallyGlowStart: number;
    // v55.0: Cached range group meshes (avoid per-frame alloc)
    rangeMeshes: {
      outerRing: THREE.Mesh;
      innerRing: THREE.Mesh;
    } | null;
    rangeSelectedUnitId: string | null;
    rangeOuterGeo: THREE.RingGeometry;
    rangeInnerGeo: THREE.RingGeometry;
    // v55.0: Cached movement path (rebuild only when hovered path changes)
    prevPathKey: string | null;
    // v55.0: Cached danger zone (rebuild only on hoveredCell change)
    prevDangerHoverKey: string | null;
    // v55.0: Cached interactive group (rebuild only on attackablePositions change)
    prevInteractiveKey: string | null;
    // v71.0: Selection ping tracking
    _prevSelectedUnitId: string | null;
    _selectionPings: Array<{ mesh: THREE.Mesh; startTime: number; x: number; z: number }>;
    // v55.0: Per-enemy interactive mesh data for per-frame updates
    interactiveEnemyData: {
      ring: THREE.Mesh;
      blade: THREE.Mesh;
      guard: THREE.Mesh;
      tip: THREE.Mesh;
      baseY: number;
      worldX: number;
      worldZ: number;
      atkX: number;
    }[] | null;
    // v56.0: Cached selection meshes (rebuild only on selectedUnit change)
    selectionMeshes: {
      glowDisc: THREE.Mesh;
      dashLine: THREE.LineSegments;
      visionDisc: THREE.Mesh | null;
      visionDashLine: THREE.LineSegments | null;
      beam: THREE.Mesh;
      sparkles: THREE.Mesh[];
      // v82.0: Thin vertical light beam above selected unit
      selectionBeam: THREE.Mesh | null;
      // v58.0: Attack range ring for ranged/hero units
      attackRangeDisc: THREE.Mesh | null;
      attackRangeDashLine: THREE.LineSegments | null;
      attackRangeDashFloats: Float32Array | null;
    } | null;
    selectionSelectedUnitId: string | null;
    // v56.0: Pre-allocated Float32Arrays for selection dash points
    selectionDashFloats: Float32Array;
    selectionVisionDashFloats: Float32Array;
    // v76.0: Track pending setTimeout IDs for cleanup on unmount
    pendingTimeouts: ReturnType<typeof setTimeout>[];
    // v91.0: Rain splash ring particles
    rainSplashRings: Array<{ mesh: THREE.Mesh; startTime: number }>;
    // v91.0: Shared geometry for rain splash rings (avoid per-splash allocation)
    rainSplashGeo: THREE.RingGeometry;
    // v92.0: Pooled materials for rain splash rings (avoid per-splash allocation)
    rainSplashMaterialPool: THREE.MeshBasicMaterial[];
    rainSplashMaterialIdx: number;
    // v92.0: Lightning flash state
    lightningFlashEnd: number;
    nextLightningTime: number;
    // v93.0: Movement animation progress (per-unit, avoids per-frame setState)
    _movementProgress: Record<string, number> | undefined;
    // v93.0: Inner screen flash timer for unmount race guard
    _screenFlashInnerTimer: ReturnType<typeof setTimeout> | null;
    // v93.0: Last damage popup count for detecting new popups in animate loop
    lastDamagePopupCount: number;
  } | null>(null);

  // Combined selector: only subscribe to the specific state fields this component needs.
  // Previously used 18 separate useGameStore calls; consolidated into one with useShallow
  // to avoid re-rendering on unrelated store changes.
  const {
    onCellClick,
    selectedUnit,
    movablePositions,
    attackablePositions,
    units,
    currentFaction,
    turn,
    phase,
    isAnimating,
    capturePoints,
    combatLog,
    currentWeather,
    damagePopups,
    hoveredMovePath,
    attackPreviewTargets,
    animationKey,
    replayState,
    map: gameMap,
    showThreatOverlay,
    showDefenseOverlay,
  } = useGameStore(useShallow((s) => ({
    onCellClick: s.onCellClick,
    selectedUnit: s.selectedUnit,
    movablePositions: s.movablePositions,
    attackablePositions: s.attackablePositions,
    units: s.units,
    currentFaction: s.currentFaction,
    turn: s.turn,
    phase: s.phase,
    isAnimating: s.isAnimating,
    capturePoints: s.capturePoints,
    combatLog: s.combatLog,
    currentWeather: s.currentWeather,
    damagePopups: s.damagePopups,
    hoveredMovePath: s.hoveredMovePath,
    attackPreviewTargets: s.attackPreviewTargets,
    animationKey: s.animationKey,
    replayState: s.replayState,
    map: s.map,
    showThreatOverlay: s.showThreatOverlay,
    showDefenseOverlay: s.showDefenseOverlay,
  })));
  // Replay state for 3D combat replay visualization
  
  // Read settings from window globals (set by GameUI)
  // v57.0: Poll settings with equality guard — only setState when value changes
  const [showDamageNums, setShowDamageNums] = useState(true);
  useEffect(() => {
    const check = () => {
      const s = (window as any).__ironChessSettings;
      const newVal = s ? s.showDamageNumbers !== false : true;
      setShowDamageNums(prev => prev === newVal ? prev : newVal);
    };
    check();
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, []);

  // Cell coordinate to world coordinate
  // v55.0: Accept optional target Vector3 for zero-allocation reuse in animate()
  const cellToWorld = useCallback((pos: Position, target?: THREE.Vector3): THREE.Vector3 => {
    const v = target || new THREE.Vector3();
    v.set(
      MAP_OFFSET_X + pos.x * CELL_TOTAL + CELL_SIZE / 2,
      0,
      MAP_OFFSET_Z + pos.z * CELL_TOTAL + CELL_SIZE / 2
    );
    return v;
  }, []);

  // v90.0: Shared geometries for path preview dots/arrows (avoid per-path alloc)
  const pathPreviewGeoRef = useRef<{
    dotSmall: THREE.SphereGeometry;
    dotLarge: THREE.SphereGeometry;
    arrow: THREE.ConeGeometry;
  } | null>(null);
  if (!pathPreviewGeoRef.current) {
    pathPreviewGeoRef.current = {
      dotSmall: new THREE.SphereGeometry(0.04, 8, 6),
      dotLarge: new THREE.SphereGeometry(0.08, 8, 6),
      arrow: new THREE.ConeGeometry(0.05, 0.12, 4),
    };
  }

  // ===== v19.0: Movement Path Preview (3D dots) =====
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const group = scene.pathPreviewGroup;
    const sharedGeo = pathPreviewGeoRef.current!;

    // Clear old path dots
    // v63.0: Also dispose Sprite textures (movement cost labels)
    // v90.0: Don't dispose shared geometries, only materials
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if (child instanceof THREE.Mesh) {
        // v90.0: Skip geometry dispose for shared geos
        if (child.geometry !== sharedGeo.dotSmall && child.geometry !== sharedGeo.dotLarge && child.geometry !== sharedGeo.arrow) {
          child.geometry.dispose();
        }
        (child.material as THREE.Material).dispose();
      } else if (child instanceof THREE.Sprite) {
        const mat = child.material as THREE.SpriteMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      }
    }

    if (!hoveredMovePath || hoveredMovePath.length < 2) return;

    // Unit's origin position (first cell in the path)
    const origin = hoveredMovePath[0];

    // v53.0: Calculate cumulative movement cost for each cell in path
    let totalCost = 0;
    const pathCosts: number[] = [0]; // Origin costs 0
    const weatherMod = currentWeather && currentWeather !== 'clear'
      ? (WEATHER_CONFIGS[currentWeather]?.movementModifier ?? 1.0) : 1.0;

    for (let i = 1; i < hoveredMovePath.length; i++) {
      const p = hoveredMovePath[i];
      const cell = gameMap.cells[p.z]?.[p.x];
      if (cell) {
        const moveCost = TERRAIN_CONFIGS[cell.terrain].stats.moveCost;
        totalCost += moveCost * weatherMod;
      }
      pathCosts.push(Math.round(totalCost * 10) / 10);
    }

    // Create dots along the path
    for (let i = 0; i < hoveredMovePath.length; i++) {
      const p = hoveredMovePath[i];
      const isFirst = i === 0;
      const isLast = i === hoveredMovePath.length - 1;
      const isFirstOrLast = isFirst || isLast;
      // v90.0: Reuse shared geometry instead of creating new one per cell
      const geo = isFirstOrLast ? sharedGeo.dotLarge : sharedGeo.dotSmall;
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00ffcc,
        transparent: true,
        opacity: isFirstOrLast ? 0.9 : 0.6,
      });
      const dot = new THREE.Mesh(geo, mat);
      const worldPos = cellToWorld(p);
      const cell = gameMap.cells[p.z]?.[p.x];
      const height = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
      dot.position.set(worldPos.x, height + 0.15, worldPos.z);
      group.add(dot);

      // v69.0: Movement path arrow direction — use LOCAL direction (prev→current) not global (origin→current)
      if (!isFirst) {
        const prev = hoveredMovePath[i - 1];
        const dx = p.x - prev.x;
        const dz = p.z - prev.z;
        const angle = Math.atan2(dx, dz);

        // v90.0: Reuse shared cone geometry instead of creating new one per cell
        const arrowMat = new THREE.MeshBasicMaterial({
          color: 0x64c8ff,
          transparent: true,
          opacity: 0.5,
        });
        const arrow = new THREE.Mesh(sharedGeo.arrow, arrowMat);
        // Place the arrow slightly above the dot, offset toward the direction
        arrow.position.set(
          worldPos.x - Math.sin(angle) * 0.15,
          height + 0.22,
          worldPos.z - Math.cos(angle) * 0.15
        );
        // ConeGeometry points up (Y-axis) by default; rotate to point along movement direction
        arrow.rotation.x = Math.PI / 2;
        arrow.rotation.z = -angle;
        group.add(arrow);
      }
    }

    // v53.0: Show movement cost label at the destination cell
    if (pathCosts.length > 1 && selectedUnit) {
      const destIdx = pathCosts.length - 1;
      const destPos = hoveredMovePath[destIdx];
      const destCell = gameMap.cells[destPos.z]?.[destPos.x];
      const cost = pathCosts[destIdx];
      const maxMove = selectedUnit.stats.moveRange || 3;

      // Create canvas text sprite for cost
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 48;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, 128, 48);
        // Cost text
        const costText = `${cost}/${maxMove}`;
        const overBudget = cost > maxMove;
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Background pill
        const textWidth = ctx.measureText(costText).width;
        ctx.fillStyle = overBudget ? 'rgba(220,50,50,0.85)' : 'rgba(0,0,0,0.75)';
        ctx.beginPath();
        ctx.roundRect(64 - textWidth / 2 - 8, 4, textWidth + 16, 36, 8);
        ctx.fill();
        // Text
        ctx.fillStyle = overBudget ? '#ffcccc' : '#00ffcc';
        ctx.fillText(costText, 64, 24);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(0.8, 0.3, 1);
        const destWorldPos = cellToWorld(destPos);
        const destHeight = destCell ? TERRAIN_CONFIGS[destCell.terrain].stats.height * CELL_SIZE : 0;
        sprite.position.set(destWorldPos.x, destHeight + 0.45, destWorldPos.z);
        group.add(sprite);
      }
    }
  }, [hoveredMovePath, gameMap, cellToWorld, currentWeather, selectedUnit]);

  // ===== v19.0: Attack Damage Preview Sprites =====
 useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear old sprites/lines
    for (const obj of scene.damagePreviewSprites) {
      scene.effectsGroup.remove(obj);
      if (obj instanceof THREE.Sprite) {
        const mat = obj.material as THREE.SpriteMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      } else if (obj instanceof THREE.Line) {
        (obj.geometry as THREE.BufferGeometry).dispose();
        (obj.material as THREE.Material).dispose();
      }
    }
    scene.damagePreviewSprites = [];

    if (!attackPreviewTargets || attackPreviewTargets.length === 0) return;

    for (const target of attackPreviewTargets) {
      const unit = units.find(u => u.id === target.unitId);
      if (!unit) continue;
      const worldPos = cellToWorld(target.position);
      const cell = gameMap.cells[target.position.z]?.[target.position.x];
      const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
      const unitHeight = 1.2;

      // Create canvas for damage text
      const canvas = document.createElement('canvas');
      const width = 128;
      // Lines: damage + kill probability + counter damage (if any) + terrain (if any) + effective def (if any) + weather (if any)
      const hasCounter = target.counterDamage > 0;
      const hasTerrainInfo = !!target.targetTerrain && (target.targetDefenseBonus ?? 0) !== 0;
      const hasWeatherMod = currentWeather && currentWeather !== 'clear' && (WEATHER_CONFIGS[currentWeather]?.attackModifier ?? 1) < 1;
      const lines = 2 + (hasCounter ? 1 : 0) + (hasTerrainInfo ? 1 : 0) + (hasWeatherMod ? 1 : 0);
      const lineHeight = 28;
      const height = lines * lineHeight;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      // Semi-transparent background
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.roundRect(2, 0, width - 4, height - 2, 5);
      ctx.fill();

      // Estimated damage text (red)
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#ff5252';
      ctx.textAlign = 'center';
      ctx.fillText(`-${target.estimatedDamage}`, width / 2, lineHeight - 10);

      // Kill probability with color coding
      const kp = target.killProbability;
      const kpColor = kp >= 70 ? '#4ade80' : kp >= 30 ? '#fbbf24' : '#f87171';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = kpColor;
      ctx.fillText(`击杀: ${kp}%`, width / 2, lineHeight * 2 - 10);

      // v38.0: Terrain defense info
      let currentLine = 3; // line 1=damage, 2=kill probability, 3=next
      if (hasCounter) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(`反击: -${target.counterDamage}`, width / 2, lineHeight * currentLine - 10);
        currentLine++;
      }

      if (hasTerrainInfo && target.targetDefenseBonus !== undefined) {
        const terrainNames: Record<string, string> = { forest: '森林', mountain: '山地', hill: '丘陵', city: '城市', fortress: '要塞', swamp: '沼泽', desert: '沙漠', water: '水域', road: '道路', bridge: '桥梁', plains: '平原' };
        const terrainName = terrainNames[target.targetTerrain ?? ''] || target.targetTerrain;
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#81d4fa';
        ctx.fillText(`${terrainName} 防+${target.targetDefenseBonus}`, width / 2, lineHeight * currentLine - 10);
        currentLine++;
      }

      // v59.0: Effective defense breakdown (base defense → total)
      if (unit && hasTerrainInfo) {
        const baseDef = unit.stats.defense;
        const totalDef = baseDef + (target.targetDefenseBonus ?? 0);
        if (target.targetDefenseBonus && target.targetDefenseBonus !== 0) {
          ctx.font = '10px sans-serif';
          ctx.fillStyle = '#90caf9';
          ctx.fillText(`有效防御: ${baseDef} → ${totalDef}`, width / 2, lineHeight * currentLine - 10);
          currentLine++;
        }
      }

      // v57.0: Weather modifier indicator in 3D damage preview
      if (hasWeatherMod && currentWeather) {
        const weatherCfg = WEATHER_CONFIGS[currentWeather];
        if (weatherCfg) {
          const weatherIcons: Record<string, string> = { rain: '🌧️', snow: '❄️', sandstorm: '🌪️', fog: '🌫️' };
          const weatherIcon = weatherIcons[currentWeather] || '';
          ctx.font = '11px sans-serif';
          ctx.fillStyle = '#93c5fd';
          ctx.fillText(`${weatherIcon} 伤害 ×${weatherCfg.attackModifier}`, width / 2, lineHeight * currentLine - 10);
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
 });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(0.7, (height / width) * 0.7, 1);
      sprite.position.set(worldPos.x, terrainHeight + unitHeight + 0.3, worldPos.z);
      sprite.userData = { isDamagePreview: true };
      scene.effectsGroup.add(sprite);
      scene.damagePreviewSprites.push(sprite);

      // v53.0: Draw attack line from selected unit to target
      if (selectedUnit) {
        const attackerWorldPos = cellToWorld(selectedUnit.position);
        const attackerCell = gameMap.cells[selectedUnit.position.z]?.[selectedUnit.position.x];
        const attackerHeight = attackerCell ? TERRAIN_CONFIGS[attackerCell.terrain].stats.height * CELL_SIZE : 0;
        const points = [
          new THREE.Vector3(attackerWorldPos.x, attackerHeight + 0.2, attackerWorldPos.z),
          new THREE.Vector3(worldPos.x, terrainHeight + 0.2, worldPos.z),
        ];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineDashedMaterial({
          color: 0xff4444,
          dashSize: 0.15,
          gapSize: 0.1,
          transparent: true,
          opacity: 0.6,
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        line.userData = { isDamagePreview: true };
        scene.effectsGroup.add(line);
        scene.damagePreviewSprites.push(line);
      }
    }
 }, [attackPreviewTargets, units, gameMap, cellToWorld, selectedUnit, currentWeather]);

  // ===== Dispose cleanup =====
 useEffect(() => {
    return () => {
      const scene = sceneRef.current;
      if (!scene) return;
      const group = scene.pathPreviewGroup;
      // v90.0: Dispose shared path preview geos on unmount
      if (pathPreviewGeoRef.current) {
        pathPreviewGeoRef.current.dotSmall.dispose();
        pathPreviewGeoRef.current.dotLarge.dispose();
        pathPreviewGeoRef.current.arrow.dispose();
        pathPreviewGeoRef.current = null;
      }
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
 }
      }
      for (const sprite of scene.damagePreviewSprites) {
        scene.effectsGroup.remove(sprite);
        if (sprite instanceof THREE.Sprite) {
          const mat = sprite.material as THREE.SpriteMaterial;
          if (mat.map) mat.map.dispose();
          mat.dispose();
        }
      }
    };
  }, []);

  // ===== Enhanced Threat Zone Overlay =====
  // v86.0: Red-based danger zone with deeper red for multiple threats,
  // terrain-aware movement (infantry traverse marshland, vehicles can't),
  // dirty flag optimization based on unit count/positions.
  const threatDirtyRef = useRef<string>('');
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const threatGroup = scene.threatGroup;

    // Clear existing threat meshes
    const clearThreatGroup = () => {
      while (threatGroup.children.length > 0) {
        const child = threatGroup.children[0];
        threatGroup.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        } else if (child instanceof THREE.Sprite) {
          const mat = child.material as THREE.SpriteMaterial;
          if (mat.map) mat.map.dispose();
          mat.dispose();
        }
      }
    };

    if (!showThreatOverlay || !gameMap || !selectedUnit) {
      clearThreatGroup();
      threatGroup.visible = false;
      threatDirtyRef.current = '';
      return;
    }

    const playerFaction = currentFaction;
    const state = useGameStore.getState();

    // Get all visible enemy units
    const visibleEnemies = state.units.filter(u => {
      if (u.faction === playerFaction || !u.isAlive || !isUnitDetected(state, u, playerFaction)) return false;
      let range = u.stats.attackRange;
      const rangeBonus = u.abilities?.find(a => a.type === 'passive' && a.effect?.attackRangeBonus)?.effect?.attackRangeBonus ?? 0;
      range += rangeBonus;
      const dist = Math.abs(u.position.x - selectedUnit.position.x) + Math.abs(u.position.z - selectedUnit.position.z);
      return dist >= 1 && dist <= range;
    });

    // v86.0: Dirty flag — only rebuild when enemy positions/count change
    const dirtyKey = visibleEnemies.map(u => `${u.id}:${u.position.x},${u.position.z}`).sort().join('|');
    if (dirtyKey === threatDirtyRef.current) return;
    threatDirtyRef.current = dirtyKey;

    threatGroup.visible = true;
    clearThreatGroup();

    // Helper: check if unit can attack a cell (accounting for hero passives)
    const canUnitAttackCell = (unit: Unit, cellX: number, cellZ: number): boolean => {
      let range = unit.stats.attackRange;
      // Check passive abilities for attack range bonus
      const rangeBonus = unit.abilities?.find(a => a.type === 'passive' && a.effect?.attackRangeBonus)?.effect?.attackRangeBonus ?? 0;
      range += rangeBonus;
      const dist = Math.abs(unit.position.x - cellX) + Math.abs(unit.position.z - cellZ);
      return dist >= 1 && dist <= range;
    };

    // v86.0: Check if an enemy unit could potentially move to a cell based on terrain
    // Infantry can traverse marshland/swamp, vehicles can't
    const canEnemyTraverse = (enemy: Unit, cellX: number, cellZ: number): boolean => {
      const cell = gameMap.cells[cellZ]?.[cellX];
      if (!cell) return false;
      const terrain = TERRAIN_CONFIGS[cell.terrain];
      if (!terrain) return false;
      if (!terrain.stats.isPassable) return false;
      const isVehicle = UNIT_CONFIGS[enemy.type]?.isVehicle;
      if (isVehicle && !terrain.stats.isPassableByVehicle) return false;
      return true;
    };

    // Shared geometries for performance
    const cellGeo = new THREE.PlaneGeometry(0.9, 0.9);

    // v86.0: Red-based threat colors — deeper red for multiple threats
    const getThreatColor = (count: number): { color: number; opacity: number } => {
      if (count === 0) return { color: 0x4ade80, opacity: 0.06 };
      if (count === 1) return { color: 0xef4444, opacity: 0.12 };
      if (count === 2) return { color: 0xdc2626, opacity: 0.18 };
      if (count <= 4) return { color: 0xb91c1c, opacity: 0.24 };
      return { color: 0x991b1b, opacity: 0.30 };
    };

    // Iterate all cells
    const cells = gameMap.cells;
    for (let z = 0; z < cells.length; z++) {
      for (let x = 0; x < cells[z].length; x++) {
        // Count how many visible enemies can attack this cell
        let count = 0;
        for (const enemy of visibleEnemies) {
          if (canUnitAttackCell(enemy, x, z)) {
            count++;
          }
        }

        // v86.0: Also mark non-traversable terrain for enemy vehicles (if infantry can reach)
        if (count === 0) {
          for (const enemy of visibleEnemies) {
            const dist = Math.abs(enemy.position.x - x) + Math.abs(enemy.position.z - z);
            const maxRange = enemy.stats.attackRange + (enemy.abilities?.find(a => a.type === 'passive' && a.effect?.attackRangeBonus)?.effect?.attackRangeBonus ?? 0);
            if (dist <= maxRange + (enemy.stats.moveRange ?? 3)) {
              // Enemy is in range to move+attack, but check if terrain blocks this cell for them
              if (!canEnemyTraverse(enemy, x, z)) {
                count += 0.5; // Partial threat (can't reach but shows as light indicator)
              }
            }
          }
        }

        const { color, opacity } = getThreatColor(Math.floor(count));
        const mat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(cellGeo, mat);
        const worldPos = cellToWorld({ x, z });
        const cell = cells[z][x];
        const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(worldPos.x, terrainHeight + 0.02, worldPos.z);
        threatGroup.add(mesh);

        // Show count number for threatened cells
        const displayCount = Math.floor(count);
        if (displayCount > 0) {
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 64;
          const ctx = canvas.getContext('2d')!;
          ctx.font = 'bold 36px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = displayCount >= 5 ? '#ff4444' : displayCount >= 3 ? '#ff6666' : '#ff8888';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(String(displayCount), 32, 32);
          const texture = new THREE.CanvasTexture(canvas);
          const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.85,
            depthTest: false,
          });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.scale.set(0.35, 0.35, 1);
          sprite.position.set(worldPos.x, terrainHeight + 0.15, worldPos.z);
          threatGroup.add(sprite);
        }
      }
    }

    return () => {
      clearThreatGroup();
      threatGroup.visible = false;
      cellGeo.dispose();
    };
  }, [showThreatOverlay, animationKey, currentFaction, gameMap, cellToWorld, selectedUnit]);

  // ===== Terrain Decorations =====
  const addTerrainDecorations = useCallback((parent: THREE.Mesh, terrain: TerrainType, pos: Position, baseHeight: number, mapGroupRef: THREE.Group | null) => {
    const worldPos = cellToWorld(pos);

    switch (terrain) {
      case 'forest': {
        for (let i = 0; i < 3; i++) {
          const treeGroup = new THREE.Group();
          const trunkGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.2, 6);
          const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
          const trunk = new THREE.Mesh(trunkGeo, trunkMat);
          trunk.position.y = 0.1;
          treeGroup.add(trunk);

          const leafGeo = new THREE.ConeGeometry(0.12, 0.25, 6);
          const leafMat = new THREE.MeshStandardMaterial({ color: 0x1b5e20 });
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          leaf.position.y = 0.3;
          treeGroup.add(leaf);

          const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            baseHeight,
            (Math.random() - 0.5) * 0.5
          );
          treeGroup.position.set(
            worldPos.x + offset.x,
            offset.y,
            worldPos.z + offset.z
          );
          treeGroup.scale.setScalar(0.6 + Math.random() * 0.4);
          mapGroupRef?.add(treeGroup);
        }
        break;
      }
      case 'mountain': {
        const peakGeo = new THREE.ConeGeometry(0.35, 0.5, 5);
        const peakMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, roughness: 0.9 });
        const peak = new THREE.Mesh(peakGeo, peakMat);
        peak.position.y = baseHeight + 0.25;
        parent.add(peak);

        const snowGeo = new THREE.ConeGeometry(0.12, 0.12, 5);
        const snowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
        const snow = new THREE.Mesh(snowGeo, snowMat);
        snow.position.y = baseHeight + 0.47;
        parent.add(snow);
        break;
      }
      case 'water': {
        const waterMat = parent.material as THREE.MeshStandardMaterial;
        waterMat.transparent = true;
        waterMat.opacity = 0.8;
        waterMat.metalness = 0.3;
        waterMat.roughness = 0.2;
        break;
      }
      case 'city': {
        for (let i = 0; i < 2; i++) {
          const buildingGeo = new THREE.BoxGeometry(0.2, 0.25 + Math.random() * 0.15, 0.2);
          const buildingMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(0.08, 0.2 + Math.random() * 0.2, 0.4 + Math.random() * 0.2)
          });
          const building = new THREE.Mesh(buildingGeo, buildingMat);
          const offset = new THREE.Vector3(
            (i === 0 ? -0.15 : 0.15),
            baseHeight + 0.15,
            (Math.random() - 0.5) * 0.3
          );
          building.position.set(offset.x, offset.y, offset.z);
          parent.add(building);
        }
        break;
      }
      case 'fortress': {
        const wallGeo = new THREE.BoxGeometry(CELL_SIZE * 0.9, 0.15, CELL_SIZE * 0.9);
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.9 });
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.y = baseHeight + 0.08;
        parent.add(wall);

        for (let dx = -1; dx <= 1; dx += 2) {
          for (let dz = -1; dz <= 1; dz += 2) {
            const towerGeo = new THREE.BoxGeometry(0.1, 0.2, 0.1);
            const towerMat = new THREE.MeshStandardMaterial({ color: 0x455a64 });
            const tower = new THREE.Mesh(towerGeo, towerMat);
            tower.position.set(dx * 0.35, baseHeight + 0.1, dz * 0.35);
            parent.add(tower);
          }
        }
        break;
      }
      case 'bridge': {
        const bridgeGeo = new THREE.BoxGeometry(CELL_SIZE, 0.03, CELL_SIZE * 0.6);
        const bridgeMat = new THREE.MeshStandardMaterial({ color: 0xbcaaa4, roughness: 0.9 });
        const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
        bridge.position.y = baseHeight + 0.02;
        parent.add(bridge);
        break;
      }
      case 'road': {
        const lineGeo = new THREE.BoxGeometry(CELL_SIZE * 0.1, 0.005, CELL_SIZE * 0.8);
        const lineMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5 });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.y = baseHeight + 0.03;
        parent.add(line);
        break;
      }
      // v34.0: Swamp decorations — puddles, reeds, scattered rocks
      case 'swamp': {
        // Shallow water puddle overlay
        const puddleGeo = new THREE.CircleGeometry(0.3, 12);
        const puddleMat = new THREE.MeshStandardMaterial({
          color: 0x2e7d32,
          transparent: true,
          opacity: 0.35,
          metalness: 0.2,
        });
        const puddle = new THREE.Mesh(puddleGeo, puddleMat);
        puddle.rotation.x = -Math.PI / 2;
        puddle.position.set(
          (Math.random() - 0.5) * 0.2,
          baseHeight + 0.01,
          (Math.random() - 0.5) * 0.2
        );
        parent.add(puddle);

        // Scattered small rocks
        for (let i = 0; i < 2; i++) {
          const rockGeo = new THREE.SphereGeometry(0.03 + Math.random() * 0.02, 5, 4);
          const rockMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 1.0 });
          const rock = new THREE.Mesh(rockGeo, rockMat);
          rock.position.set(
            (Math.random() - 0.5) * 0.6,
            baseHeight + 0.02,
            (Math.random() - 0.5) * 0.6
          );
          rock.scale.y = 0.6;
          parent.add(rock);
        }
        break;
      }
      // v34.0: Desert decorations — sand dunes, scattered stones, dry brush
      case 'desert': {
        // Small sand dune
        const duneGeo = new THREE.SphereGeometry(0.2, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
        const duneMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 1.0 });
        const dune = new THREE.Mesh(duneGeo, duneMat);
        dune.position.set(
          (Math.random() - 0.5) * 0.3,
          baseHeight + 0.01,
          (Math.random() - 0.5) * 0.3
        );
        dune.scale.set(1 + Math.random() * 0.5, 0.3 + Math.random() * 0.15, 1 + Math.random() * 0.5);
        parent.add(dune);

        // Scattered small stones
        for (let i = 0; i < 3; i++) {
          const stoneGeo = new THREE.SphereGeometry(0.015 + Math.random() * 0.015, 4, 3);
          const stoneMat = new THREE.MeshStandardMaterial({ color: 0xa1887f, roughness: 0.9 });
          const stone = new THREE.Mesh(stoneGeo, stoneMat);
          stone.position.set(
            (Math.random() - 0.5) * 0.7,
            baseHeight + 0.015,
            (Math.random() - 0.5) * 0.7
          );
          parent.add(stone);
        }
        break;
      }
    }
  }, [cellToWorld]);

  // ===== Create Terrain Cell =====
  const createTerrainCell = useCallback((terrain: TerrainType, pos: Position, mapGroupRef: THREE.Group | null): THREE.Mesh => {
    const config = TERRAIN_CONFIGS[terrain];
    const height = config.stats.height * CELL_SIZE;

    // v68.0: Terrain height gradient — higher terrain gets a brightness boost
    const baseColor = new THREE.Color(config.stats.color);
    const heightBrightness = Math.min(0.08, config.stats.height * 0.02);
    baseColor.r = Math.min(1, baseColor.r + heightBrightness);
    baseColor.g = Math.min(1, baseColor.g + heightBrightness);
    baseColor.b = Math.min(1, baseColor.b + heightBrightness * 0.7);

    const geometry = new THREE.BoxGeometry(CELL_SIZE, Math.max(0.05, height), CELL_SIZE);
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.8,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    const worldPos = cellToWorld(pos);
    mesh.position.set(worldPos.x, height / 2, worldPos.z);
    mesh.userData = { cellPos: pos, terrain };

    addTerrainDecorations(mesh, terrain, pos, height, mapGroupRef);

    return mesh;
  }, [cellToWorld, addTerrainDecorations]);

  // ===== Create Unit Mesh =====
  const createUnitMesh = useCallback((unit: Unit): THREE.Group => {
    const group = new THREE.Group();

    const shadowGeo = new THREE.CircleGeometry(0.48, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    const shadowDecal = new THREE.Mesh(shadowGeo, shadowMat);
    shadowDecal.rotation.x = -Math.PI / 2;
    shadowDecal.position.y = 0.002;
    shadowDecal.renderOrder = -1;
    shadowDecal.name = 'groundShadow';
    group.add(shadowDecal);

    const natoTexture = getNatoSymbolTexture(unit.type, unit.faction, unit.isHero);
    const natoGeo = new THREE.PlaneGeometry(0.7, 0.7);
    const natoMat = new THREE.MeshBasicMaterial({
      map: natoTexture,
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const natoSprite = new THREE.Mesh(natoGeo, natoMat);
    natoSprite.name = 'natoSymbol';
    natoSprite.rotation.x = Math.PI / 2;
    natoSprite.rotation.z = Math.PI;
    natoSprite.position.y = 0.35;
    group.add(natoSprite);

    const unitNames: Record<UnitType, string> = {
      tank: '坦克', ifv: '步兵战车', artillery: '火炮',
      scout: '侦察车', infantry: '步兵', sam: '防空导弹',
      engineer: '工兵', supply: '补给车', helicopter: '直升机',
      mlrs: '火箭炮', atgm: '反坦克导弹', uav: '无人机',
      command: '指挥车', ew: '电子战',
    };

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 128;
    labelCanvas.height = 32;
    const labelCtx = labelCanvas.getContext('2d')!;
    labelCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    labelCtx.roundRect(0, 0, 128, 32, 4);
    labelCtx.fill();
    labelCtx.fillStyle = '#ffffff';
    labelCtx.font = 'bold 16px sans-serif';
    labelCtx.textAlign = 'center';
    labelCtx.textBaseline = 'middle';
    labelCtx.fillText(unitNames[unit.type], 64, 16);

    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    const labelMat = new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthTest: false,
    });
    const labelSprite = new THREE.Sprite(labelMat);
    labelSprite.name = 'unitLabel';
    labelSprite.scale.set(0.8, 0.2, 1);
    labelSprite.position.y = -0.15;
    group.add(labelSprite);

    if (unit.stats.armor > 5) {
      const armorPercent = Math.min(1, unit.stats.armor / 40);
      const armorBarGeo = new THREE.PlaneGeometry(0.38 * armorPercent, 0.03);
      const armorBarMat = new THREE.MeshBasicMaterial({ color: 0xffb300, side: THREE.DoubleSide });
      const armorBar = new THREE.Mesh(armorBarGeo, armorBarMat);
      armorBar.position.y = 0.55;
      armorBar.position.x = -0.38 * (1 - armorPercent) / 2;
      armorBar.rotation.x = -Math.PI / 4;
      group.add(armorBar);
      const armorBgGeo = new THREE.PlaneGeometry(0.4, 0.04);
      const armorBgMat = new THREE.MeshBasicMaterial({ color: 0x332200, side: THREE.DoubleSide });
      const armorBg = new THREE.Mesh(armorBgGeo, armorBgMat);
      armorBg.position.y = 0.55;
      armorBg.rotation.x = -Math.PI / 4;
      group.add(armorBg);
    }

    group.userData = { unitId: unit.id };
    return group;
  }, []);

  // v72.0: getMinimapUnitShape removed (was only used by deleted drawMinimap)

  // v47.0: Trigger rally glow when player's turn starts
  useEffect(() => {
    if (sceneRef.current && turn > 0 && phase === 'selectUnit' && currentFaction === 'red') {
      sceneRef.current.rallyGlowActive = true;
      sceneRef.current.rallyGlowStart = Date.now();
    }
  }, [turn, phase, currentFaction]);

  // ===== Initialize Three.js Scene =====
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a2332);
    scene.fog = new THREE.Fog(0x1a2332, 15, 30);

    // Camera - Orthographic for top-down strategy view
    const aspect = container.clientWidth / container.clientHeight;
    const frustumSize = 14;
    const camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      100
    );
    camera.position.set(0, 20, 0.01);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 12, 8);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -15;
    directionalLight.shadow.camera.right = 15;
    directionalLight.shadow.camera.top = 15;
    directionalLight.shadow.camera.bottom = -15;
    scene.add(directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x362d1e, 0.3);
    scene.add(hemisphereLight);

    // Map group
    const mapGroup = new THREE.Group();
    scene.add(mapGroup);

    // Unit group
    const unitGroup = new THREE.Group();
    scene.add(unitGroup);

    // Highlight group
    const highlightGroup = new THREE.Group();
    scene.add(highlightGroup);

    // Fog of war group
    const fogGroup = new THREE.Group();
    scene.add(fogGroup);

    // Grid lines group
    const gridGroup = new THREE.Group();
    scene.add(gridGroup);

    // v70.0: Coordinate overlay group (toggled with C key)
    const coordGroup = new THREE.Group();
    coordGroup.visible = false;
    scene.add(coordGroup);

    // Path preview group
    const pathGroup = new THREE.Group();
    scene.add(pathGroup);

    // Attack range group
    const rangeGroup = new THREE.Group();
    scene.add(rangeGroup);

    // Selection glow group
    const selectionGroup = new THREE.Group();
    scene.add(selectionGroup);

    // Projectile group
    const projectileGroup = new THREE.Group();
    scene.add(projectileGroup);

    // Effects group for battle visual effects (projectile spheres, explosions, muzzle flashes)
    const effectsGroup = new THREE.Group();
    scene.add(effectsGroup);

    // Interactive elements group (pulsing rings, crosshairs, hover glows)
    const interactiveGroup = new THREE.Group();
    scene.add(interactiveGroup);

    // Cursor group (hover cell outline)
    const cursorGroup = new THREE.Group();
    scene.add(cursorGroup);

    // v54.0: Pre-allocate cursor geometry/materials (reused every frame instead of allocating)
    const cursorRingGeo = new THREE.RingGeometry(0.42, 0.48, 4);
    const cursorRingMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const cursorRingMesh = new THREE.Mesh(cursorRingGeo, cursorRingMat);
    cursorRingMesh.rotation.x = -Math.PI / 2;
    cursorRingMesh.rotation.z = Math.PI / 4;
    cursorRingMesh.visible = false;
    cursorGroup.add(cursorRingMesh);

    // Weather effects group
    const weatherGroup = new THREE.Group();
    weatherGroup.renderOrder = 1;
    scene.add(weatherGroup);

    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(30, 30);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x263238, roughness: 1.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // ===== 6. Better Grid Lines =====
    const gridLineMaterial = new THREE.LineBasicMaterial({ color: 0x455a64, transparent: true, opacity: 0.35 });
    const mapWidth = MAP_WIDTH * CELL_TOTAL;
    const mapHeight = MAP_HEIGHT * CELL_TOTAL;
    const gridPoints: THREE.Vector3[] = [];

    // Vertical lines
    for (let i = 0; i <= MAP_WIDTH; i++) {
      const x = MAP_OFFSET_X + i * CELL_TOTAL - CELL_GAP / 2;
      gridPoints.push(new THREE.Vector3(x, 0.005, MAP_OFFSET_Z - CELL_GAP / 2));
      gridPoints.push(new THREE.Vector3(x, 0.005, MAP_OFFSET_Z + mapHeight - CELL_GAP / 2));
    }
    // Horizontal lines
    for (let j = 0; j <= MAP_HEIGHT; j++) {
      const z = MAP_OFFSET_Z + j * CELL_TOTAL - CELL_GAP / 2;
      gridPoints.push(new THREE.Vector3(MAP_OFFSET_X - CELL_GAP / 2, 0.005, z));
      gridPoints.push(new THREE.Vector3(MAP_OFFSET_X + mapWidth - CELL_GAP / 2, 0.005, z));
    }

    const gridLineGeo = new THREE.BufferGeometry().setFromPoints(gridPoints);
    const gridLines = new THREE.LineSegments(gridLineGeo, gridLineMaterial);
    gridGroup.add(gridLines);

    // v70.0: Create coordinate text sprites for overlay
    // v71.0: Fixed — each sprite gets its own canvas (Texture.clone() shares image ref)
    // v89.0: Replaced with chess-style edge labels (column letters + row numbers)
    const _coordLabelSprites: THREE.Sprite[] = [];
    const _labelCanvas = _sharedLabelCanvas!;
    const _labelCtx = _sharedLabelCtx!;
    _labelCanvas.width = 64;
    _labelCanvas.height = 32;

    // Column letters along the bottom edge (A, B, C, ...)
    for (let x = 0; x < MAP_WIDTH; x++) {
      const letter = String.fromCharCode(65 + x); // A=65
      _labelCtx.clearRect(0, 0, 64, 32);
      _labelCtx.fillStyle = 'rgba(180,180,180,0.55)';
      _labelCtx.font = 'bold 22px monospace';
      _labelCtx.textAlign = 'center';
      _labelCtx.textBaseline = 'middle';
      _labelCtx.fillText(letter, 32, 16);
      // v88.0: Clone canvas for safe texture creation
      const texCanvas = _cloneCanvas(_labelCanvas, 64, 32);
      const spriteMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(texCanvas), transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(
        MAP_OFFSET_X + x * CELL_TOTAL + CELL_SIZE / 2,
        0.02,
        MAP_OFFSET_Z + MAP_HEIGHT * CELL_TOTAL + 0.3 // just outside bottom edge
      );
      sprite.scale.set(0.5, 0.25, 1);
      sprite.userData.isCoordLabel = true;
      coordGroup.add(sprite);
      _coordLabelSprites.push(sprite);
    }

    // Row numbers along the left edge (1, 2, 3, ...)
    for (let z = 0; z < MAP_HEIGHT; z++) {
      const num = String(z + 1);
      _labelCtx.clearRect(0, 0, 64, 32);
      _labelCtx.fillStyle = 'rgba(180,180,180,0.55)';
      _labelCtx.font = 'bold 22px monospace';
      _labelCtx.textAlign = 'center';
      _labelCtx.textBaseline = 'middle';
      _labelCtx.fillText(num, 32, 16);
      // v88.0: Clone canvas for safe texture creation
      const texCanvas = _cloneCanvas(_labelCanvas, 64, 32);
      const spriteMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(texCanvas), transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(
        MAP_OFFSET_X - 0.35, // just outside left edge
        0.02,
        MAP_OFFSET_Z + z * CELL_TOTAL + CELL_SIZE / 2
      );
      sprite.scale.set(0.5, 0.25, 1);
      sprite.userData.isCoordLabel = true;
      coordGroup.add(sprite);
      _coordLabelSprites.push(sprite);
    }

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const cellMeshes: THREE.Mesh[][] = [];
    const unitMeshes = new Map<string, THREE.Group>();
    const waterMeshes: THREE.Mesh[] = [];

    // Timer for delta time (replacing deprecated THREE.Clock)
    const startTime = performance.now();

    // Particle manager
    const particleManager = new ParticleManager(scene);

    // Attack flash tracking
    const attackFlashes: { mesh: THREE.Mesh; startTime: number }[] = [];
    const lastAttackablePositions: Position[] = [];
    const prevUnitAliveMap = new Map<string, boolean>();
    const displayedHpMap = new Map<string, number>();
    const damageFlashMap = new Map<string, number>();

    // Store references
    sceneRef.current = {
      scene, camera, renderer, raycaster, mouse,
      mapGroup, unitGroup, highlightGroup, fogGroup, gridGroup, coordGroup,
      pathGroup, rangeGroup, selectionGroup, projectileGroup,
      effectsGroup, interactiveGroup, cursorGroup,
      // v54.0: Pre-allocated cursor meshes for reuse
      cursorRingMesh,
      _liveUnitMap: null,
      cellMeshes, flatCellMeshes: cellMeshes.flat(), unitMeshes, waterMeshes,
      animationId: 0,
      hoveredCell: null,
      startTime,
      particleManager,
      attackFlashes,
      lastAttackablePositions,
      prevUnitAliveMap,
      displayedHpMap,
      ghostMesh: null,
      ghostPosition: null,
      ghostUnitType: null,
      projectiles: [],
      shakeTargets: [],
      lastCombatLogLength: 0,
      lastDamagePopupCount: 0,
      projectileAnimations: [],
      explosionAnimations: [],
      muzzleFlashAnims: [],
      cameraShake: null,
      weatherGroup,
      weatherPoints: null,
      weatherFogPlane: null,
      weatherSandFogPlane: null,
      weatherParticlePositions: null,
      weatherParticleVelocities: null,
      weatherParticleOffsets: null,
      weatherParticleYVelocities: null,
      weatherRainLines: null,
      weatherDriftFogPlanes: [],
      ambientWeatherParticles: null,
      ambientWeatherPositions: null,
      ambientLight,
      directionalLight,
      hemisphereLight,
      weatherLightTransition: null,
      weatherFadeIn: null,
      tracerLines: [],
      damageFlashMap,
      // v19.0: Path preview group
      pathPreviewGroup: new THREE.Group(),
      // v34.0: Add pathPreviewGroup to scene (was missing — path preview invisible)
      // Initialized below after sceneRef assignment
      // v19.0: Damage preview sprites
      damagePreviewSprites: [],
      // Threat heatmap group
      threatGroup: new THREE.Group(),
      // Counter-attack danger zone group
      dangerZoneGroup: new THREE.Group(),
      prevHoveredCellMesh: null,
      rallyGlowActive: false,
      rallyGlowStart: 0,
      // v55.0: Cached range meshes
      rangeMeshes: null,
      rangeSelectedUnitId: null,
      rangeOuterGeo: null as unknown as THREE.RingGeometry,
      rangeInnerGeo: null as unknown as THREE.RingGeometry,
      // v55.0: Cached danger zone / interactive keys
      prevPathKey: null,
      prevDangerHoverKey: null,
      prevInteractiveKey: null,
      // v71.0: Selection ping tracking
      _prevSelectedUnitId: null as string | null,
      _selectionPings: [] as Array<{ mesh: THREE.Mesh; startTime: number; x: number; z: number }>,
      interactiveEnemyData: null,
      // v56.0: Cached selection meshes + pre-allocated dash point arrays
      selectionMeshes: null,
      selectionSelectedUnitId: null,
      selectionDashFloats: new Float32Array(48 * 3),   // 48 dash points (x,y,z)
      selectionVisionDashFloats: new Float32Array(96 * 3), // 96 vision dash points (x,y,z)
      // v76.0: Pending timeout tracking for safe cleanup
      pendingTimeouts: [],
      // v91.0: Rain splash ring system
      rainSplashRings: [],
      rainSplashGeo: new THREE.RingGeometry(0.02, 0.08, 12),
      // v92.0: Pooled splash materials (6 instances cycled via index)
      rainSplashMaterialPool: Array.from({ length: 6 }, () => new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      })),
      rainSplashMaterialIdx: 0,
      // v92.0: Lightning flash state
      lightningFlashEnd: 0,
      nextLightningTime: Date.now() + 5000 + Math.random() * 10000,
      // v93.0: Movement animation progress buffer
      _movementProgress: undefined,
      // v93.0: Inner screen flash timer
      _screenFlashInnerTimer: null,
      // v56.0: Cached unit group array for raycasting
      _unitGroupArray: null as unknown as THREE.Group[],
      _unitGroupArrayVersion: 0,
      // v57.0: Reusable visible enemies buffer
      _visibleEnemiesBuffer: null,
    };
    // v34.0: Add pathPreviewGroup to scene
    scene.add(sceneRef.current.pathPreviewGroup);
    // Add threat group to scene (initially hidden)
    sceneRef.current.threatGroup.visible = false;
    scene.add(sceneRef.current.threatGroup);
    // Add danger zone group to scene (initially hidden)
    sceneRef.current.dangerZoneGroup.visible = false;
    scene.add(sceneRef.current.dangerZoneGroup);

    // Camera controls - right-click pan, scroll zoom
    let isPanning = false;
    let previousMousePosition = { x: 0, y: 0 };
    let cameraTarget = new THREE.Vector3(0, 0, 0);
    let cameraZoom = 14; // frustumSize

    const updateOrthoCamera = () => {
      const a = container.clientWidth / container.clientHeight;
      camera.left = -cameraZoom * a / 2;
      camera.right = cameraZoom * a / 2;
      camera.top = cameraZoom / 2;
      camera.bottom = -cameraZoom / 2;
      camera.updateProjectionMatrix();
      camera.position.set(cameraTarget.x, 20, cameraTarget.z + 0.01);
      camera.lookAt(cameraTarget.x, 0, cameraTarget.z);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2 || e.button === 1) { // right-click or middle-click = pan
        isPanning = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isPanning) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        // Pan: move camera target in world space
        const panSpeed = cameraZoom * 0.001;
        cameraTarget.x -= deltaX * panSpeed;
        cameraTarget.z -= deltaY * panSpeed;

        // Clamp target to map bounds
        const boundX = MAP_WIDTH * CELL_TOTAL / 2 + 2;
        const boundZ = MAP_HEIGHT * CELL_TOTAL / 2 + 2;
        cameraTarget.x = Math.max(-boundX, Math.min(boundX, cameraTarget.x));
        cameraTarget.z = Math.max(-boundZ, Math.min(boundZ, cameraTarget.z));

        updateOrthoCamera();
        previousMousePosition = { x: e.clientX, y: e.clientY };
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2 || e.button === 1) {
        isPanning = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraZoom = Math.max(6, Math.min(28, cameraZoom + e.deltaY * 0.01));
      updateOrthoCamera();
    };

    // Click handler
    const onClick = (e: MouseEvent) => {
      if (!sceneRef.current) return;
      if (e.button !== 0) return; // v53.0: Only process left-click
      // Block input during animation
      if (useGameStore.getState().isAnimating) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);

      const allCellMeshes = sceneRef.current.flatCellMeshes;
      const intersects = raycaster.intersectObjects(allCellMeshes);

      if (intersects.length > 0) {
        const cellPos = intersects[0].object.userData.cellPos as Position;
        if (cellPos) {
          onCellClick(cellPos);
        }
      }
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('wheel', onWheel);
    renderer.domElement.addEventListener('click', onClick);
    // v76.0: Store named reference for cleanup (was anonymous — leaked on unmount)
    const onContextMenu = (e: Event) => e.preventDefault();
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    // Window resize
    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      updateOrthoCamera();
    };
    window.addEventListener('resize', onResize);

    // ===== Animation Loop =====
    let lastFrameTime = performance.now();
    // v51.0: Pre-allocated temp vectors OUTSIDE animate() to avoid per-frame allocation
    // v55.0: Pre-allocated temp vectors for zero-allocation cellToWorld in animate()
    const _tv1 = new THREE.Vector3();
    const _tv2 = new THREE.Vector3(); // v78.0: Separate vector for tracer animation (avoids _tv1 data race)
    const _c2w1 = new THREE.Vector3();
    const _c2w2 = new THREE.Vector3();
    const _cameraPanTarget = new THREE.Vector3();
    const animate = () => {
      const id = requestAnimationFrame(animate);
      if (sceneRef.current) sceneRef.current.animationId = id;

      // v66.0: Cache rect for all per-frame screen projection calls (avoid forced layout reflow)
      let _cachedRect: DOMRect | null = null;
      const getCachedRect = () => _cachedRect || (_cachedRect = renderer.domElement.getBoundingClientRect());

      const now = performance.now();
      const dt = Math.min((now - lastFrameTime) / 1000, 0.1); // cap delta at 100ms
      const elapsed = (now - startTime) / 1000;
      lastFrameTime = now;

      // v35.0: Read fresh store state each frame to avoid stale closure references
      // (units, selectedUnit, currentFaction, phase, etc. are captured from initial render)
      const liveState = useGameStore.getState();
      const liveUnits = liveState.units;
      const liveSelectedUnit = liveState.selectedUnit;
      const liveCurrentFaction = liveState.currentFaction;
      const livePhase = liveState.phase;
      const liveMovablePositions = liveState.movablePositions;
      const liveAttackablePositions = liveState.attackablePositions;
      const liveCurrentWeather = liveState.currentWeather;
      const liveCombatLog = liveState.combatLog;
      const liveReplayState = liveState.replayState;
      // v48.0: Build unit lookup map once per frame (O(1) lookups instead of O(n) .find() × 10)
      // v54.0: Reuse Map instead of allocating new one each frame
      let liveUnitMap: Map<string, typeof liveUnits[0]>;
      const _mapRef = sceneRef.current;
      if (_mapRef) {
        if (!_mapRef._liveUnitMap) _mapRef._liveUnitMap = new Map<string, typeof liveUnits[0]>();
        liveUnitMap = _mapRef._liveUnitMap;
        liveUnitMap.clear();
      } else {
        liveUnitMap = new Map<string, typeof liveUnits[0]>();
      }
      for (const u of liveUnits) { liveUnitMap.set(u.id, u); liveUnitMap.set(`${u.position.x},${u.position.z}`, u); }

      // Apply settings (grid visibility)
      const appSettings = (window as any).__ironChessSettings;
      if (appSettings && sceneRef.current?.gridGroup) {
        sceneRef.current.gridGroup.visible = appSettings.showGridLines !== false;
      }
      // v70.0: Apply coordinate overlay visibility
      // v89.0: Also hide coord labels when zoomed in too close (> 12 frustum) to avoid clutter
      if (appSettings && sceneRef.current?.coordGroup) {
        const coordEnabled = !!appSettings.showCoordinates;
        const zoomedOutEnough = cameraZoom >= 12;
        sceneRef.current.coordGroup.visible = coordEnabled && zoomedOutEnough;
      }

      // Fog of War: hide enemy units outside visible range
      if (sceneRef.current && liveState.map) {
        const playerUnits = liveUnits.filter(u => u.faction === liveCurrentFaction);
        const visibleCells = computeVisibleCells(playerUnits, liveState.map.cells as { terrain: string }[][], liveState.currentWeather);
        for (const [unitId, ug] of sceneRef.current.unitMeshes) {
          const ud = liveUnitMap.get(unitId);
          if (!ud || !ud.isAlive) { ug.visible = false; continue; }
          if (ud.faction === liveCurrentFaction) { ug.visible = true; continue; }
          const key = `${ud.position.x},${ud.position.z}`;
          ug.visible = visibleCells.has(key);
        }
      }

      // v71.0: Selection ping effect — emit a ring when selectedUnit changes
      const selId = liveSelectedUnit?.id ?? null;
      if (selId && selId !== sceneRef.current!._prevSelectedUnitId) {
        sceneRef.current!._prevSelectedUnitId = selId;
        // v90.0: Use liveUnitMap.get() instead of .find() in hot path
        const su = liveUnitMap.get(selId);
        if (su && su.isAlive) {
          const wp = cellToWorld(su.position);
          const pingGeo = new THREE.RingGeometry(0.3, 0.5, 32);
          const pingMat = new THREE.MeshBasicMaterial({
            color: su.faction === 'red' ? 0x4caf50 : 0x42a5f5,
            transparent: true, opacity: 0.8, side: THREE.DoubleSide
          });
          const pingMesh = new THREE.Mesh(pingGeo, pingMat);
          pingMesh.rotation.x = -Math.PI / 2;
          pingMesh.position.set(wp.x, 0.05, wp.z);
          effectsGroup.add(pingMesh);
          sceneRef.current!._selectionPings.push({ mesh: pingMesh, startTime: performance.now(), x: wp.x, z: wp.z });
          // v87.0: Auto-pan camera to selected unit if it's off-screen (only during player turn)
          if (su.faction === 'red' && !useGameStore.getState().panCameraTarget) {
            const camW = camera.right - camera.left;
            const camH = camera.top - camera.bottom;
            const dx = Math.abs(wp.x - cameraTarget.x);
            const dz = Math.abs(wp.z - cameraTarget.z);
            if (dx > camW * 0.35 || dz > camH * 0.35) {
              useGameStore.getState().setPanCameraTarget({ x: wp.x, z: wp.z });
            }
          }
        }
      } else if (!selId) {
        sceneRef.current!._prevSelectedUnitId = null;
      }
      // Animate and clean up pings
      const pingNow = performance.now();
      const activePings: Array<{ mesh: THREE.Mesh; startTime: number; x: number; z: number }> = [];
      for (const ping of sceneRef.current!._selectionPings) {
        const age = (pingNow - ping.startTime) / 1000;
        if (age > 0.5) {
          effectsGroup.remove(ping.mesh);
          ping.mesh.geometry.dispose();
          (ping.mesh.material as THREE.Material).dispose();
        } else {
          const t = age / 0.5;
          ping.mesh.scale.set(1 + t * 1.5, 1 + t * 1.5, 1);
          (ping.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
          activePings.push(ping);
        }
      }
      sceneRef.current!._selectionPings = activePings;

      // ===== Smooth camera pan from minimap click =====
      const panTarget = useGameStore.getState().panCameraTarget;
      if (panTarget) {
        _cameraPanTarget.set(panTarget.x, 0, panTarget.z);
        const dist = cameraTarget.distanceTo(_cameraPanTarget);
        if (dist < 0.05) {
          // Close enough — snap and clear
          cameraTarget.copy(_cameraPanTarget);
          useGameStore.getState().setPanCameraTarget(null);
        } else {
          // Lerp toward target (~0.15 factor per frame at 60fps ≈ smooth ease)
          const lerpFactor = 1 - Math.pow(0.001, dt);
          cameraTarget.lerp(_cameraPanTarget, lerpFactor);
        }
        updateOrthoCamera();
      }

      // Broadcast camera world position to store (throttled — only when moved > 0.1 unit)
      const prevCamPos = useGameStore.getState().cameraPosition;
      if (!prevCamPos || Math.abs(cameraTarget.x - prevCamPos.x) > 0.1 || Math.abs(cameraTarget.z - prevCamPos.z) > 0.1) {
        useGameStore.getState().setCameraPosition({ x: cameraTarget.x, z: cameraTarget.z });
      }
      // v31.0: Broadcast camera zoom to store (throttled)
      const prevCamZoom = useGameStore.getState().cameraZoom;
      if (Math.abs(cameraZoom - prevCamZoom) > 0.5) {
        useGameStore.getState().setCameraZoom(cameraZoom);
      }
      // v83: Broadcast camera aspect ratio for minimap viewport accuracy
      const prevAspect = useGameStore.getState().cameraAspect;
      if (Math.abs(aspect - prevAspect) > 0.01) {
        useGameStore.getState().setCameraAspect(aspect);
      }

      // ===== 0. Movement Animation =====
      // v93.0: Animation progress stored in sceneRef to avoid per-frame setState
      if (sceneRef.current) {
        const storeState = useGameStore.getState();
        const anim = storeState.movementAnimation;
        if (anim && anim.path.length > 1) {
          // v48.0: Scale step duration with gameSpeed for faster animations at higher speeds
          const liveGameSpeed = useGameStore.getState().gameSpeed || 1;
          const STEP_DURATION = 0.15 / liveGameSpeed;
          const unitMesh = sceneRef.current.unitMeshes.get(anim.unitId);
          if (unitMesh) {
            // v93.0: Read accumulated progress from sceneRef (avoids per-frame store writes)
            const baseProgress = sceneRef.current._movementProgress?.[anim.unitId] ?? anim.progress;
            const newProgress = baseProgress + dt / STEP_DURATION;
            if (newProgress >= 1.0) {
              // Move to next step
              const nextStep = anim.currentStep + 1;
              if (nextStep >= anim.path.length - 1) {
                // Animation complete - set to final position
                const finalPos = anim.path[anim.path.length - 1];
                const finalWorldPos = cellToWorld(finalPos, _c2w1);
                const finalCell = gameMap.cells[finalPos.z]?.[finalPos.x];
                const finalTerrainHeight = finalCell ? TERRAIN_CONFIGS[finalCell.terrain].stats.height * CELL_SIZE : 0;
                unitMesh.position.set(finalWorldPos.x, finalTerrainHeight, finalWorldPos.z);
                
                // Check if there's a pending attack
                if (anim.pendingAttack) {
                  // Execute the pending attack
                  useGameStore.getState().executePendingAttack();
                } else {
                  useGameStore.getState().clearMovementAnimation();
                }
                // v93.0: Clear sceneRef progress on animation completion
                if (sceneRef.current._movementProgress) delete sceneRef.current._movementProgress[anim.unitId];
              } else {
                // Advance to next step
                const currentPos = anim.path[nextStep];
                const currentWorldPos = cellToWorld(currentPos, _c2w1);
                const currentCell = gameMap.cells[currentPos.z]?.[currentPos.x];
                const currentTerrainHeight = currentCell ? TERRAIN_CONFIGS[currentCell.terrain].stats.height * CELL_SIZE : 0;
                unitMesh.position.set(currentWorldPos.x, currentTerrainHeight, currentWorldPos.z);
                
                // v93.0: Only write to store on step change, not every frame
                useGameStore.setState({
                  movementAnimation: {
                    ...anim,
                    currentStep: nextStep,
                    progress: 0,
                  }
                });
                // v93.0: Clear sceneRef progress when step changes
                if (sceneRef.current._movementProgress) delete sceneRef.current._movementProgress[anim.unitId];
              }
            } else {
              // v93.0: Interpolate position without per-frame setState — progress stored in sceneRef
              const fromPos = anim.path[anim.currentStep];
              const toPos = anim.path[Math.min(anim.currentStep + 1, anim.path.length - 1)];
              const fromWorld = cellToWorld(fromPos, _c2w1);
              const toWorld = cellToWorld(toPos, _c2w2);
              const fromCell = gameMap.cells[fromPos.z]?.[fromPos.x];
              const toCell = gameMap.cells[toPos.z]?.[toPos.x];
              const fromTerrainHeight = fromCell ? TERRAIN_CONFIGS[fromCell.terrain].stats.height * CELL_SIZE : 0;
              const toTerrainHeight = toCell ? TERRAIN_CONFIGS[toCell.terrain].stats.height * CELL_SIZE : 0;
              
              const x = fromWorld.x + (toWorld.x - fromWorld.x) * newProgress;
              const z = fromWorld.z + (toWorld.z - fromWorld.z) * newProgress;
              const y = fromTerrainHeight + (toTerrainHeight - fromTerrainHeight) * newProgress;
              unitMesh.position.set(x, y, z);
              
              // v93.0: Store progress in sceneRef to avoid per-frame setState (eliminates ~60 setState/sec)
              // Only the store snapshot is read at the top of this block; actual progress lives here.
              if (!sceneRef.current._movementProgress) sceneRef.current._movementProgress = {};
              sceneRef.current._movementProgress[anim.unitId] = newProgress;
            }
          }
        }
      }

      // ===== 1. Water Animation =====
      if (sceneRef.current) {
        for (const waterMesh of sceneRef.current.waterMeshes) {
          const baseY = waterMesh.userData.baseY as number;
          // v92.0: Enhanced wave displacement using world position for smoother spatial wave
          const wave = Math.sin(elapsed * 1.5 + waterMesh.position.x * 0.5 + waterMesh.position.z * 0.3) * 0.03;
          const wave2 = Math.sin(elapsed * 2.2 + waterMesh.position.x * 0.8 - waterMesh.position.z * 0.4) * 0.01;
          waterMesh.position.y = baseY + wave + wave2;

          // Animate water material for shimmer effect
          const mat = waterMesh.material as THREE.MeshStandardMaterial;
          mat.opacity = 0.7 + Math.sin(elapsed * 2.0 + waterMesh.position.x * 0.5 + waterMesh.position.z * 0.3) * 0.1;
        }
      }

      // ===== v34.0: Helicopter rotor spin + hover bob animation =====
      if (sceneRef.current) {
        for (const [unitId, unitGroup] of sceneRef.current.unitMeshes) {
          const unitData = liveUnitMap.get(unitId);
          if (unitData && unitData.type === 'helicopter' && unitData.isAlive) {
            // Find main rotor by name
            const mainRotor = unitGroup.getObjectByName('mainRotor');
            if (mainRotor) {
              mainRotor.rotation.y += dt * 25; // Spin main rotor
            }
            // Find tail rotor by name
            const tailRotor = unitGroup.getObjectByName('tailRotor');
            if (tailRotor) {
              tailRotor.rotation.y += dt * 40; // Spin tail rotor faster
            }
            // Subtle hover bobbing (absolute from base, not cumulative)
            const cellKey = `${unitData.position.x},${unitData.position.z}`;
            if (unitGroup.userData.lastHoverCell !== cellKey) {
              // Recapture base Y when unit moves to a new cell
              unitGroup.userData.baseTerrainY = unitGroup.position.y;
              unitGroup.userData.lastHoverCell = cellKey;
            }
            if (unitGroup.userData.baseTerrainY == null) {
              unitGroup.userData.baseTerrainY = unitGroup.position.y;
            }
            unitGroup.position.y = unitGroup.userData.baseTerrainY + Math.sin(elapsed * 3 + unitData.position.x) * 0.015;
          }
        }
      }

      // ===== v47.0: Unit Spawn Materialize Animation =====
      if (sceneRef.current) {
        for (const [unitId, unitGroup] of sceneRef.current.unitMeshes) {
          if (unitGroup.userData.spawnTime) {
            const age = Date.now() - unitGroup.userData.spawnTime;
            const materializeDuration = 400;
            if (age < materializeDuration) {
              const t = age / materializeDuration;
              // Ease-out cubic: fast start, slow finish
              const eased = 1 - Math.pow(1 - t, 3);
              unitGroup.scale.setScalar(Math.max(0.01, eased));
              // v56.0: Fix Y drift — use absolute positioning instead of +=
              const baseY = unitGroup.userData.baseTerrainY ?? unitGroup.position.y;
              const floatOffset = Math.sin(t * Math.PI) * 0.15;
              unitGroup.position.y = baseY + floatOffset;
            } else {
              unitGroup.scale.setScalar(1);
              // v56.0: Reset to base terrain Y after spawn animation
              const baseY = unitGroup.userData.baseTerrainY;
              if (baseY != null) unitGroup.position.y = baseY;
              delete unitGroup.userData.spawnTime;
            }
          }
        }
      }

      // ===== v47.0: Turn Start Rally Glow =====
      if (sceneRef.current && sceneRef.current.rallyGlowActive) {
        const rallyAge = Date.now() - sceneRef.current.rallyGlowStart;
        const rallyDuration = 1800;
        if (rallyAge < rallyDuration) {
          const rallyT = rallyAge / rallyDuration;
          // Pulsing green glow on available (canAct) friendly units
          const pulseIntensity = Math.sin(rallyAge * 0.008) * 0.5 + 0.5;
          const fadeOut = rallyT > 0.6 ? 1 - (rallyT - 0.6) / 0.4 : 1;
          for (const [unitId, unitGroup] of sceneRef.current.unitMeshes) {
            const unitData = liveUnitMap.get(unitId);
            if (!unitData || !unitData.isAlive) continue;
            if (unitData.faction !== liveCurrentFaction) continue;
            if (!unitData.canAttack && !unitData.canMove) continue;
            // Apply emissive glow
            unitGroup.traverse((child) => {
              if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                child.material.emissive.set(0x00ff66);
                child.material.emissiveIntensity = pulseIntensity * 0.4 * fadeOut;
              }
            });
          }
        } else {
          // Clear rally glow
          sceneRef.current.rallyGlowActive = false;
          for (const [unitId, unitGroup] of sceneRef.current.unitMeshes) {
            unitGroup.traverse((child) => {
              if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                child.material.emissive.setHex(0x000000);
                child.material.emissiveIntensity = 0;
              }
            });
          }
        }
      }

      // ===== v35.0: Per-unit-type idle animations =====
      // v57.0: Pre-filter visible enemies once per frame — reuse buffer to avoid allocation
      if (sceneRef.current && !sceneRef.current._visibleEnemiesBuffer) {
        sceneRef.current._visibleEnemiesBuffer = [];
      }
      const _visibleEnemies = sceneRef.current?._visibleEnemiesBuffer ?? [];
      _visibleEnemies.length = 0;
      if (sceneRef.current) {
        for (let i = 0; i < liveUnits.length; i++) {
          const u = liveUnits[i];
          // v65.0: Removed !u.isStealthed — isUnitDetected already handles stealth filtering.
          // Detected stealthed enemies MUST be tracked for turret rotation.
          if (u.faction !== liveCurrentFaction && u.isAlive) {
            if (!isUnitDetected(liveState, u, liveCurrentFaction)) continue;
            _visibleEnemies.push(u);
          }
        }
      }
      if (sceneRef.current) {
        for (const [unitId, unitGroup] of sceneRef.current.unitMeshes) {
          const unitData = liveUnitMap.get(unitId);
          if (!unitData || !unitData.isAlive) continue;

          // Skip stealthed enemy units (they're hidden)
          if (unitData.isStealthed && unitData.faction !== liveCurrentFaction) continue;

          switch (unitData.type) {
            // --- Tank/IFV Turret Tracking ---
            case 'tank':
            case 'ifv': {
              if (!unitGroup.userData.idleTurret) {
                const turret = unitGroup.getObjectByName('turret');
                unitGroup.userData.idleTurret = turret;
                unitGroup.userData.turretTargetAngle = unitGroup.rotation.y;
                unitGroup.userData.lastTurretUpdate = 0;
              }
              const idleTurret = unitGroup.userData.idleTurret;
              if (idleTurret && elapsed - unitGroup.userData.lastTurretUpdate > 0.5) {
                let nearestDist = Infinity;
                let targetAngle = unitGroup.userData.turretTargetAngle;
                const visionRange = unitData.stats.vision ?? 3;
                // v57.0: Use pre-filtered enemy list instead of iterating all liveUnits
                for (const enemy of _visibleEnemies) {
                  if (enemy.faction !== unitData.faction) {
                    const dist = Math.abs(enemy.position.x - unitData.position.x) + Math.abs(enemy.position.z - unitData.position.z);
                    if (dist <= visionRange && dist < nearestDist) {
                      nearestDist = dist;
                      targetAngle = Math.atan2(
                        enemy.position.z - unitData.position.z,
                        enemy.position.x - unitData.position.x
                      );
                    }
                  }
                }
                unitGroup.userData.turretTargetAngle = targetAngle;
                unitGroup.userData.lastTurretUpdate = elapsed;
              }
              if (idleTurret) {
                idleTurret.rotation.y = THREE.MathUtils.lerp(
                  idleTurret.rotation.y,
                  unitGroup.userData.turretTargetAngle,
                  0.02
                );
              }
              break;
            }

            // --- SAM Radar Spin ---
            case 'sam': {
              if (!unitGroup.userData.idleRadarDisc) {
                const radar = unitGroup.getObjectByName('radar');
                unitGroup.userData.idleRadarDisc = radar;
              }
              const idleRadarDisc = unitGroup.userData.idleRadarDisc;
              if (idleRadarDisc) {
                idleRadarDisc.rotation.y += dt * 2;
              }
              break;
            }

            // --- Scout Antenna Sway ---
            case 'scout': {
              if (!unitGroup.userData.idleAntenna) {
                const antenna = unitGroup.getObjectByName('antenna');
                unitGroup.userData.idleAntenna = antenna;
              }
              const idleAntenna = unitGroup.userData.idleAntenna;
              if (idleAntenna) {
                idleAntenna.rotation.z = Math.sin(elapsed * 3) * 0.1;
              }
              break;
            }

            // --- Infantry Breathing ---
            case 'infantry': {
              if (!unitGroup.userData.idleBody) {
                const torso = unitGroup.getObjectByName('torso');
                unitGroup.userData.idleBody = torso;
                unitGroup.userData.idleBaseY = torso?.position.y ?? 0.2;
              }
              const idleBody = unitGroup.userData.idleBody;
              if (idleBody) {
                idleBody.position.y = unitGroup.userData.idleBaseY + Math.sin(elapsed * 2) * 0.02;
              }
              break;
            }

            // --- Supply Truck Cross Pulse ---
            case 'supply': {
              if (!unitGroup.userData.idleCrossMeshes) {
                const crossV = unitGroup.getObjectByName('crossV') as THREE.Mesh | undefined;
                const crossH = unitGroup.getObjectByName('crossH') as THREE.Mesh | undefined;
                // Ensure emissive is set for pulsing
                if (crossV && crossV.material) {
                  const mat = crossV.material as THREE.MeshStandardMaterial;
                  mat.emissive = mat.emissive || new THREE.Color(0xffffff);
                  mat.emissiveIntensity = 0.3;
                }
                if (crossH && crossH.material) {
                  const mat = crossH.material as THREE.MeshStandardMaterial;
                  mat.emissive = mat.emissive || new THREE.Color(0xffffff);
                  mat.emissiveIntensity = 0.3;
                }
                unitGroup.userData.idleCrossMeshes = [crossV, crossH];
              }
              const idleCrosses = unitGroup.userData.idleCrossMeshes;
              if (idleCrosses) {
                const pulseVal = 0.3 + Math.sin(elapsed * 2) * 0.15;
                for (const crossMesh of idleCrosses) {
                  if (crossMesh && crossMesh.material) {
                    (crossMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = pulseVal;
                  }
                }
              }
              break;
            }

            // --- Artillery Barrel Adjust ---
            case 'artillery': {
              if (!unitGroup.userData.idleBarrel) {
                const barrel = unitGroup.getObjectByName('barrel');
                unitGroup.userData.idleBarrel = barrel;
              }
              const idleBarrel = unitGroup.userData.idleBarrel;
              if (idleBarrel) {
                idleBarrel.rotation.x = -0.3 + Math.sin(elapsed * 0.5) * 0.05;
              }
              break;
            }

            // --- MLRS Idle Glow ---
            case 'mlrs': {
              if (!unitGroup.userData.idlePodMeshes) {
                const meshes: THREE.Mesh[] = [];
                // Main pod
                const pod = unitGroup.getObjectByName('pod') as THREE.Mesh | undefined;
                if (pod && pod.material) {
                  const mat = pod.material as THREE.MeshStandardMaterial;
                  mat.emissive = mat.emissive || new THREE.Color(0x444444);
                  mat.emissiveIntensity = 0.2;
                }
                if (pod) meshes.push(pod);
                // Rocket tubes
                for (const child of unitGroup.children) {
                  if (child.name === 'tube' && child instanceof THREE.Mesh) {
                    const tube = child as THREE.Mesh;
                    if (tube.material) {
                      const mat = tube.material as THREE.MeshStandardMaterial;
                      mat.emissive = mat.emissive || new THREE.Color(0x444444);
                      mat.emissiveIntensity = 0.2;
                    }
                    meshes.push(tube);
                  }
                }
                unitGroup.userData.idlePodMeshes = meshes;
              }
              const idlePods = unitGroup.userData.idlePodMeshes;
              if (idlePods) {
                const glowVal = 0.2 + Math.sin(elapsed * 1.5) * 0.1;
                for (const podMesh of idlePods) {
                  if (podMesh && podMesh.material) {
                    (podMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = glowVal;
                  }
                }
              }
              break;
            }

            // Helicopter already handled above — skip here
            case 'helicopter':
            default:
              break;
          }
        }
      }

      // ===== 2. Attack Flash Animation =====
      if (sceneRef.current) {
        for (let i = sceneRef.current.attackFlashes.length - 1; i >= 0; i--) {
          const flash = sceneRef.current.attackFlashes[i];
          const flashAge = (Date.now() - flash.startTime) / 1000;
          if (flashAge > 0.6) {
            sceneRef.current.scene.remove(flash.mesh);
            flash.mesh.geometry.dispose();
            (flash.mesh.material as THREE.Material).dispose();
            // v90.0: swap-with-last instead of splice(i,1) for O(1) removal
            sceneRef.current.attackFlashes[i] = sceneRef.current.attackFlashes[sceneRef.current.attackFlashes.length - 1];
            sceneRef.current.attackFlashes.pop();
          } else {
            const intensity = Math.max(0, 1 - flashAge / 0.6);
            const pulse = Math.sin(flashAge * 15) * 0.5 + 0.5;
            const mat = flash.mesh.material as THREE.MeshBasicMaterial;
            mat.opacity = intensity * pulse * 0.6;
          }
        }
      }

      // v74.0: Animate capture point pulse rings
      if (sceneRef.current) {
        const mapGroup = sceneRef.current.mapGroup;
        for (const child of mapGroup.children) {
          if ((child as THREE.Mesh).userData?.isCapturePulse) {
            const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
            const baseOpacity = (child as THREE.Mesh).userData.baseOpacity;
            mat.opacity = baseOpacity * (0.5 + 0.5 * Math.sin(elapsed * 2));
          }
        }
      }

      // v74.0: Dim ambient light when all player units have acted (end-turn reminder)
      // v76.0: Skip during weather light transitions (avoids oscillation with weather system)
      if (sceneRef.current && liveCurrentFaction === 'red' && livePhase === 'selectUnit'
          && !sceneRef.current.weatherLightTransition) {
        const redUnits = liveUnits.filter((u: any) => u.faction === 'red' && u.isAlive);
        const actedUnits = redUnits.filter((u: any) => !u.canMove || !u.canAttack);
        const allActed = redUnits.length > 0 && actedUnits.length >= redUnits.length;
        const { ambientLight } = sceneRef.current;
        const targetIntensity = allActed ? 0.35 : 0.5;
        // Smooth lerp to target
        ambientLight.intensity += (targetIntensity - ambientLight.intensity) * 0.05;
      }

      // ===== Hover highlight + Unit tooltip + Cursor Effect =====
      if (sceneRef.current && !isPanning) {
        raycaster.setFromCamera(mouse, camera);
        const allCellMeshes = sceneRef.current.flatCellMeshes;
        const intersects = raycaster.intersectObjects(allCellMeshes);

        // Reset only previously hovered cell emissive (perf optimization)
        if (sceneRef.current.prevHoveredCellMesh) {
          const prevMesh = sceneRef.current.prevHoveredCellMesh;
          (prevMesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
          (prevMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
        }

        // v54.0: Hide pre-allocated cursor meshes (no more clear+recreate)
        const { cursorGroup: cg, cursorRingMesh } = sceneRef.current;
        cursorRingMesh.visible = false;

        if (intersects.length > 0) {
          const mesh = intersects[0].object as THREE.Mesh;
          // Store reference for efficient emissive reset next frame
          sceneRef.current.prevHoveredCellMesh = mesh;
          // Brighter hover emissive
          (mesh.material as THREE.MeshStandardMaterial).emissive.setHex(0x666666);
          (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.5;

          // Bright yellow/white outline ring on hovered cell
          const cellPos = mesh.userData.cellPos as Position;
          if (cellPos) {
            const worldPos = cellToWorld(cellPos, _c2w1);
            const cell = gameMap.cells[cellPos.z]?.[cellPos.x];
            const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

            // v54.0: Reuse pre-allocated cursor meshes
            cursorRingMesh.visible = false;
            cursorRingMesh.position.set(worldPos.x, terrainHeight + 0.035, worldPos.z);

            // Update hoveredCell for game store and local ref
            // v56.0: Guard against redundant dispatch when cell hasn't changed
            const prevHovered = sceneRef.current.hoveredCell;
            if (!prevHovered || prevHovered.x !== cellPos.x || prevHovered.z !== cellPos.z) {
              sceneRef.current.hoveredCell = { x: cellPos.x, z: cellPos.z };
              useGameStore.getState().setHoveredCell({ x: cellPos.x, z: cellPos.z });
            }

            // Check for friendly unit on this cell (for cursor styling)
            const hoveredUnit = liveUnitMap.get(`${cellPos.x},${cellPos.z}`);
            // [REMOVED] friendlyGlowMesh & whiteGlowMesh hover indicators

            // v74.0: Context-sensitive cursor styling
            if (sceneRef.current.renderer) {
              let cursorStyle = 'default';
              if (hoveredUnit) {
                if (hoveredUnit.faction === liveCurrentFaction && hoveredUnit.isAlive) {
                  cursorStyle = 'pointer'; // Clickable friendly unit
                } else if (hoveredUnit.faction !== liveCurrentFaction && hoveredUnit.isAlive) {
                  // Check if this enemy is attackable
                  if (liveSelectedUnit && liveAttackablePositions.some(p => p.x === cellPos.x && p.z === cellPos.z)) {
                    cursorStyle = 'crosshair'; // Attackable enemy
                  } else {
                    cursorStyle = 'not-allowed'; // Enemy out of range
                  }
                }
              } else if (liveSelectedUnit && liveMovablePositions.some(p => p.x === cellPos.x && p.z === cellPos.z)) {
                cursorStyle = 'cell'; // Movable cell (fallback to default if 'cell' unsupported)
              }
              sceneRef.current.renderer.domElement.style.cursor = cursorStyle;
            }
          }
        } else {
          sceneRef.current.hoveredCell = null;
          useGameStore.getState().setHoveredCell(null);
          if (prevCursorInfoRef.current !== null) { prevCursorInfoRef.current = null; setCursorInfo(null); }
          if (prevTerrainTooltipRef.current !== null) { prevTerrainTooltipRef.current = null; setTerrainTooltip(null); }
          // v74.0: Reset cursor when hovering off map
          if (sceneRef.current.renderer) sceneRef.current.renderer.domElement.style.cursor = 'default';
        }

        // Update cursor info popup (terrain name + unit info) + terrain detailed tooltip
        if (intersects.length > 0) {
          const cellMesh = intersects[0].object as THREE.Mesh;
          const cellPos = cellMesh.userData.cellPos as Position;
          if (cellPos) {
            const cell = gameMap.cells[cellPos.z]?.[cellPos.x];
            if (cell) {
              const terrainConfig = TERRAIN_CONFIGS[cell.terrain];
              // v62.0: Don't leak info about undetected stealthed enemies in terrain tooltip
              let unitOnCell = cell.unit && cell.unit.isAlive ? cell.unit : undefined;
              if (unitOnCell && unitOnCell.isStealthed && unitOnCell.faction !== liveCurrentFaction) {
                if (!isUnitDetected(liveState, unitOnCell, liveCurrentFaction)) {
                  unitOnCell = undefined;
                }
              }
              const worldPos = cellToWorld(cellPos, _c2w1);
              const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
              _tv1.set(worldPos.x, terrainHeight + 0.3, worldPos.z);
              _tv1.project(camera);
              const rect = getCachedRect();
              const cursorScreenX = (_tv1.x * 0.5 + 0.5) * rect.width + rect.left;
              const cursorScreenY = (-_tv1.y * 0.5 + 0.5) * rect.height + rect.top;
              const cursorKey = `${cellPos.x},${cellPos.z},${unitOnCell?.id ?? ''},${Math.round(cursorScreenX)},${Math.round(cursorScreenY)}`;
              if (cursorKey !== prevCursorInfoRef.current) {
                prevCursorInfoRef.current = cursorKey;
                setCursorInfo({
                  terrainName: terrainConfig?.name ?? cell.terrain,
                  unitName: unitOnCell ? unitOnCell.name : undefined,
                  x: cursorScreenX,
                  y: cursorScreenY,
                });
              }

              // Detailed terrain tooltip
              const cpForCell = cell.capturePointId ? capturePoints.find(cp => cp.id === cell.capturePointId) : undefined;
              // v72.0: Include enemy attack positions hash for stale threat count fix
              const enemyAttackHash = liveUnits
                .filter(e => e.faction !== liveCurrentFaction && e.isAlive && e.canAttack && isUnitDetected(liveState, e, liveCurrentFaction))
                .map(e => `${e.position.x},${e.position.z}`)
                .join('|');
              const tooltipKey = `${cellPos.x},${cellPos.z},${cell.fortified},${cell.hasMinefield},${unitOnCell?.stats.hp},${cpForCell?.owner},${unitOnCell?.abilities?.[0]?.currentCooldown},${unitOnCell?.isStealthed},${unitOnCell?.stats.ammo},${enemyAttackHash}`;
              if (tooltipKey !== prevTerrainTooltipRef.current) {
                prevTerrainTooltipRef.current = tooltipKey;
                // v55.0: Include hero abilities in tooltip for enemy hero units
                const unitIsHero = unitOnCell?.isHero;
                const unitHeroAbilities = unitIsHero ? unitOnCell?.abilities?.map(a => ({
                  id: a.id,
                  name: a.name,
                  icon: a.icon,
                  type: a.type,
                  description: a.description,
                  currentCooldown: a.currentCooldown ?? 0,
                  cooldown: a.cooldown ?? 0,
                })) : undefined;
                // v55.0: Check if unit is in supply healing range
                let unitInSupplyRange = false;
                if (unitOnCell) {
                  const friendlySupplyTrucks = liveUnits.filter(u =>
                    u.type === 'supply' && u.isAlive && u.faction === unitOnCell.faction && u.id !== unitOnCell.id
                  );
                  for (const truck of friendlySupplyTrucks) {
                    const truckBonus = getHeroSupplyBonus(truck);
                    const truckRange = (UNIT_CONFIGS.supply.healRange ?? 1) + truckBonus.rangeBonus;
                    const dist = Math.abs(unitOnCell.position.x - truck.position.x) + Math.abs(unitOnCell.position.z - truck.position.z);
                    if (dist > 0 && dist <= truckRange) {
                      unitInSupplyRange = true;
                      break;
                    }
                  }
                }
                setTerrainTooltip({
                  terrainName: terrainConfig?.name ?? cell.terrain,
                  moveCost: terrainConfig?.stats.moveCost ?? 1,
                  attackBonus: terrainConfig?.stats.attackBonus ?? 0,
                  defenseBonus: terrainConfig?.stats.defenseBonus ?? 0,
                  visionBonus: terrainConfig?.stats.visionBonus ?? 0,
                  unitName: unitOnCell?.name,
                  unitHp: unitOnCell?.stats.hp,
                  unitMaxHp: unitOnCell?.stats.maxHp,
                  unitFaction: unitOnCell?.faction,
                  unitLevel: unitOnCell?.level,
                  unitIsHero,
                  unitHeroAbilities,
                  unitInSupplyRange,
                  unitIsStealthed: unitOnCell?.isStealthed,
                  unitAmmo: unitOnCell?.stats.ammo,
                  unitMaxAmmo: unitOnCell?.stats.maxAmmo,
                  unitMorale: unitOnCell?.stats.morale,
                  currentWeather: liveState.currentWeather,
                  weatherMoveModifier: liveState.currentWeather && liveState.currentWeather !== 'clear' ? (WEATHER_CONFIGS[liveState.currentWeather]?.movementModifier ?? 1.0) : 1,
                  weatherAttackModifier: liveState.currentWeather && liveState.currentWeather !== 'clear' ? (WEATHER_CONFIGS[liveState.currentWeather]?.attackModifier ?? 1.0) : 1,
                  // v57.0: Compute unit's effective defense (base + terrain + fortification)
                  unitXp: unitOnCell?.xp,
                  unitXpToNextLevel: unitOnCell?.xpToNextLevel,
                  unitEffectiveDefense: unitOnCell ? unitOnCell.stats.defense
                    + (terrainConfig?.stats.defenseBonus ?? 0)
                    + (cell.fortified ? FORTIFY_DEFENSE_BONUS : 0) : undefined,
                  // v59.0: Additional unit stats for tooltip
                  unitAttack: unitOnCell?.stats.attack,
                  unitDefense: unitOnCell?.stats.defense,
                  unitArmor: unitOnCell?.stats.armor,
                  unitMoveRange: unitOnCell?.stats.moveRange,
                  unitVision: unitOnCell?.stats.vision,
                  unitAttackRange: unitOnCell?.stats.attackRange,
                  unitArmorPen: unitOnCell?.stats.armorPenetration,
                  unitTempBuff: unitOnCell?.tempDamageBuff,
                  fortified: cell.fortified ?? false,
                  hasMinefield: cell.hasMinefield ?? false,
                  minefieldOwner: cell.minefieldOwner,
                  capturePoint: cpForCell ? { owner: cpForCell.owner, type: cpForCell.type } : undefined,
                  // v60.0: Capture contest progress
                  captureRedProgress: cpForCell?.captureProgress?.red,
                  captureBlueProgress: cpForCell?.captureProgress?.blue,
                  captureThreshold: cpForCell?.captureThreshold,
                  isPassable: terrainConfig?.stats.isPassable ?? true,
                  // v61.0: Count enemies that can attack this cell
                  enemyThreatCount: (() => {
                    const hx = cellPos.x, hz = cellPos.z;
                    let threats = 0;
                    for (const e of liveUnits) {
                      if (e.faction === liveCurrentFaction || !e.isAlive || !e.canAttack) continue;
                      if (!isUnitDetected(liveState, e, liveCurrentFaction)) continue;
                      const dist = Math.abs(e.position.x - hx) + Math.abs(e.position.z - hz);
                      const eRange = e.stats.attackRange + (e.abilities?.find(a => a.effect?.attackRangeBonus)?.effect?.attackRangeBonus ?? 0);
                      if (dist <= eRange) threats++;
                    }
                    return threats;
                  })(),
                  // v62.0: Unit combat history + terrain height
                  unitTotalDamageDealt: unitOnCell?.totalDamageDealt,
                  unitKillCount: unitOnCell?.killCount,
                  terrainHeight: terrainConfig?.stats.height,
                  // v64.0: Fortification remaining turns
                  fortifiedRemainingTurns: cell.fortified && cell.fortifiedByTurn != null
                    ? Math.max(0, (cell.fortifiedByTurn < 0 ? -cell.fortifiedByTurn : 0) + FORTIFY_DURATION - liveState.turn + 1)
                    : undefined,
                  // v67.0: Veterancy title
                  unitVeterancyTitle: unitOnCell ? getVeterancyTitle(unitOnCell) : undefined,
                  screenX: cursorScreenX,
                  screenY: cursorScreenY,
                });
              }
            }
          }
        }

        // ===== 3. Unit Hover Tooltip =====
        // v57.0: Cache unit group array — avoids Array.from() allocation per frame
        if (!sceneRef.current._unitGroupArray || sceneRef.current._unitGroupArrayVersion !== sceneRef.current.unitMeshes.size) {
          sceneRef.current._unitGroupArray = Array.from(sceneRef.current.unitMeshes.values());
          sceneRef.current._unitGroupArrayVersion = sceneRef.current.unitMeshes.size;
        }
        const unitIntersects = raycaster.intersectObjects(sceneRef.current._unitGroupArray, true);
        if (unitIntersects.length > 0) {
          let obj: THREE.Object3D | null = unitIntersects[0].object;
          while (obj && !obj.userData.unitId) {
            obj = obj.parent;
          }
          if (obj && obj.userData.unitId) {
            const unitId = obj.userData.unitId as string;
            const unit = liveUnitMap.get(unitId);
            if (unit) {
              const worldPos = cellToWorld(unit.position, _c2w1);
              const cell = gameMap.cells[unit.position.z]?.[unit.position.x];
              const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
              _tv1.set(worldPos.x, terrainHeight + 0.7, worldPos.z);
              _tv1.project(camera);

              const rect = getCachedRect();
              const unitScreenX = (_tv1.x * 0.5 + 0.5) * rect.width + rect.left;
              const unitScreenY = (-_tv1.y * 0.5 + 0.5) * rect.height + rect.top;

              const unitConfig = UNIT_CONFIGS[unit.type];
              const unitHoverKey = `${unitId},${Math.round(unitScreenX)},${Math.round(unitScreenY)}`;
              if (unitHoverKey !== prevHoveredUnitRef.current) {
                prevHoveredUnitRef.current = unitHoverKey;
                setHoveredUnitInfo({
                  name: unitConfig?.name ?? unit.type,
                  x: unitScreenX,
                  y: unitScreenY,
                });
              }
            } else {
              if (prevHoveredUnitRef.current !== null) {
                prevHoveredUnitRef.current = null;
                setHoveredUnitInfo(null);
              }
            }
          } else {
            if (prevHoveredUnitRef.current !== null) {
              prevHoveredUnitRef.current = null;
              setHoveredUnitInfo(null);
            }
          }
        } else {
          if (prevHoveredUnitRef.current !== null) {
            prevHoveredUnitRef.current = null;
            setHoveredUnitInfo(null);
          }
        }
      }

      // ===== Selected unit animation =====
      if (sceneRef.current) {
        const time = Date.now() * 0.003;
        for (const [, mesh] of sceneRef.current.unitMeshes) {
          const unitId = mesh.userData.unitId;
          const unit = liveUnitMap.get(unitId);
          if (unit && unit.isAlive) {
            if (liveSelectedUnit && liveSelectedUnit.id === unitId) {
              const scale = 1.0 + Math.sin(time * 2) * 0.05;
              mesh.scale.setScalar(scale);
            } else {
              mesh.scale.setScalar(1.0);
            }
            
            // Unit status indicators - dimming
            const hasActed = !unit.canMove && !unit.canAttack;
            const hasMoved = !unit.canMove;
            const hasAttacked = !unit.canAttack;
            const lowHp = unit.stats.hp / unit.stats.maxHp < 0.3;
            
            // v78.0: Cache acted state on mesh userData to skip traverse when unchanged
            const actedKey = `${hasActed}|${hasMoved}|${hasAttacked}|${lowHp}|${unit.level}`;
            if (mesh.userData.lastActedKey === actedKey) {
              // Only update selected unit pulse and low HP flash
              if (lowHp) {
                const flashIntensity = Math.sin(time * 4) * 0.5 + 0.5;
                mesh.traverse(child => {
                  if (child instanceof THREE.Mesh && child.material && 'emissive' in child.material) {
                    (child.material as THREE.MeshStandardMaterial).emissive.setHex(0xff0000);
                    (child.material as THREE.MeshStandardMaterial).emissiveIntensity = flashIntensity * 0.5;
                  }
                });
              }
            } else {
              mesh.userData.lastActedKey = actedKey;
            
              // Apply visual effects to unit meshes
              mesh.traverse(child => {
                if (child instanceof THREE.Mesh && child.material) {
                  const mat = child.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
                  if ('opacity' in mat && 'transparent' in mat) {
                    if (hasActed) {
                      mat.transparent = true;
                      mat.opacity = 0.35;
                      if (mat instanceof THREE.MeshStandardMaterial) { mat.color.setRGB(0.25, 0.25, 0.28); mat.emissive.setHex(0x000000); mat.emissiveIntensity = 0; }
                    } else if (hasMoved || hasAttacked) {
                      mat.transparent = true;
                      mat.opacity = 0.55;
                      if (mat instanceof THREE.MeshStandardMaterial) { const c = mat.color; c.r *= 0.6; c.g *= 0.6; c.b *= 0.6; }
                    } else {
                      if (mat.transparent) {
                        mat.transparent = false;
                        mat.opacity = 1.0;
                      }
                    }
                    // Low HP flashing - red emissive
                    if (lowHp && 'emissive' in mat && 'emissiveIntensity' in mat) {
                      const flashIntensity = Math.sin(time * 4) * 0.5 + 0.5;
                      (mat as THREE.MeshStandardMaterial).emissive.setHex(0xff0000);
                      (mat as THREE.MeshStandardMaterial).emissiveIntensity = flashIntensity * 0.5;
                    } else if ('emissive' in mat && 'emissiveIntensity' in mat && !(liveSelectedUnit && liveSelectedUnit.id === unitId)) {
                      // Veteran emissive glow based on level
                      if (unit.level >= 2) {
                        const VETERAN_EMISSIVE: Record<number, number> = {
                          2: 0.05,
                          3: 0.1,
                          4: 0.15,
                          5: 0.25,
                        };
                        const emissiveVal = VETERAN_EMISSIVE[unit.level] ?? 0.05;
                        const baseColor = unit.faction === 'red' ? 0xc62828 : 0x1565c0;
                        (mat as THREE.MeshStandardMaterial).emissive.setHex(baseColor);
                        (mat as THREE.MeshStandardMaterial).emissiveIntensity = emissiveVal;
                      } else {
                        (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0;
                      }
                    }
                  }
                }
              });
            }
            // Store current level for future change detection
            mesh.userData.lastLevel = unit.level;

            // Floating level stars above unit
              const starsGroup = mesh.getObjectByName('levelStars') as THREE.Group | undefined;
              if (!starsGroup) {
                const sg = new THREE.Group();
                sg.name = 'levelStars';
                const starCount = Math.min(unit.level - 1, 5);
                const isHighLevel = unit.level >= 4;
                const starColor = isHighLevel ? 0xffd700 : 0xffc107;
                const starSize = isHighLevel ? 0.06 : 0.045;
                const spacing = 0.12;
                const startX = -(starCount - 1) * spacing / 2;
                for (let si = 0; si < starCount; si++) {
                  const starGeo = new THREE.SphereGeometry(starSize, 6, 6);
                  const starMat = new THREE.MeshBasicMaterial({ 
                    color: starColor,
                    transparent: true,
                    opacity: 0.9,
                  });
                  const starMesh = new THREE.Mesh(starGeo, starMat);
                  starMesh.position.set(startX + si * spacing, 1.2, 0);
                  starMesh.userData.starIndex = si;
                  sg.add(starMesh);
                  // Glow for high level
                  if (isHighLevel) {
                    const glowGeo = new THREE.SphereGeometry(starSize * 1.8, 6, 6);
                    const glowMat = new THREE.MeshBasicMaterial({
                      color: 0xffd700,
                      transparent: true,
                      opacity: 0.15,
                    });
                    const glowMesh = new THREE.Mesh(glowGeo, glowMat);
                    glowMesh.position.copy(starMesh.position);
                    glowMesh.userData.isGlow = true;
                    glowMesh.userData.starIndex = si;
                    sg.add(glowMesh);
                  }
                }
                mesh.add(sg);
              }
              // Animate floating stars
              const sg2 = mesh.getObjectByName('levelStars') as THREE.Group | undefined;
              if (sg2) {
                sg2.traverse((child) => {
                  if (child instanceof THREE.Mesh && child.userData.starIndex !== undefined) {
                    const idx = child.userData.starIndex as number;
                    const floatY = 1.2 + Math.sin(elapsed * 2 + idx * 0.8) * 0.05;
                    child.position.y = floatY;
                    if (!child.userData.isGlow) {
                      const pulse = 0.7 + Math.sin(elapsed * 3 + idx * 1.2) * 0.3;
                      (child.material as THREE.MeshBasicMaterial).opacity = pulse;
                    }
                  }
                });
              }
            }
            // v81.0: Unit Facing Direction Indicator — track position changes & render arrow
            if (unit) {
              const dirState = _unitDirMap.get(unitId);
              const curPos = unit.position;
              if (!dirState) {
                // First frame seeing this unit — default facing "up" (z: -1)
                _unitDirMap.set(unitId, { x: 0, z: -1, lastPx: curPos.x, lastPz: curPos.z });
              } else if (dirState.lastPx !== curPos.x || dirState.lastPz !== curPos.z) {
                // Position changed — compute new direction
                const dx = curPos.x - dirState.lastPx;
                const dz = curPos.z - dirState.lastPz;
                const len = Math.sqrt(dx * dx + dz * dz);
                if (len > 0) {
                  dirState.x = dx / len;
                  dirState.z = dz / len;
                }
                dirState.lastPx = curPos.x;
                dirState.lastPz = curPos.z;
              }

              // Get or create direction arrow mesh
              let dirArrow = mesh.getObjectByName('dirArrow') as THREE.Mesh | undefined;
              if (!dirArrow) {
                const arrowGeo = new THREE.ConeGeometry(0.08, 0.18, 3);
                arrowGeo.rotateX(Math.PI / 2); // Point along Z axis
                const factionColor = unit.faction === 'red' ? 0xc62828 : 0x1565c0;
                const arrowMat = new THREE.MeshBasicMaterial({
                  color: factionColor,
                  transparent: true,
                  opacity: 0.4,
                  depthWrite: false,
                });
                dirArrow = new THREE.Mesh(arrowGeo, arrowMat);
                dirArrow.name = 'dirArrow';
                dirArrow.renderOrder = -1; // Render before main unit geometry
                mesh.add(dirArrow);
              }
              // Position arrow on ground shadow plane, offset slightly toward movement direction
              dirArrow.position.set(0, 0.02, 0.22);
              // Rotate to face movement direction using atan2(dir.x, dir.z)
              const dirStateNow = _unitDirMap.get(unitId)!;
              const targetAngle = Math.atan2(dirStateNow.x, dirStateNow.z);
              // Smooth rotation interpolation (v80)
              let angleDiff = targetAngle - dirArrow.rotation.y;
              // Normalize to [-PI, PI] for shortest rotation path
              while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
              while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
              dirArrow.rotation.y += angleDiff * 0.15;

              // v91.0: Smooth unit group rotation — tanks/units turn to face movement direction
              const unitTargetAngle = targetAngle;
              let unitAngleDiff = unitTargetAngle - mesh.rotation.y;
              // Normalize to [-PI, PI]
              unitAngleDiff = ((unitAngleDiff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
              mesh.rotation.y += unitAngleDiff * Math.min(1, dt * 8);
            }
          }
        }

      // ===== Unit Selection Glow Effect (v56.0: cached meshes, rebuild only on unit change) =====
      if (sceneRef.current) {
        const { selectionGroup: sg } = sceneRef.current;

        // Remove old ghost mesh (v38.0: add proper disposal)
        if (sceneRef.current.ghostMesh) {
          sceneRef.current.ghostMesh.traverse(child => {
            if (child instanceof THREE.Mesh) {
              child.geometry?.dispose();
              if (child.material) (child.material as THREE.Material).dispose();
            }
          });
          scene.remove(sceneRef.current.ghostMesh);
          sceneRef.current.ghostMesh = null;
          sceneRef.current.ghostPosition = null;
          sceneRef.current.ghostUnitType = null;
        }

        // Determine whether cached meshes need to be rebuilt
        const currentUnitId = liveSelectedUnit ? liveSelectedUnit.id : null;
        const showVision = !!(liveSelectedUnit && liveSelectedUnit.isAlive
          && liveSelectedUnit.faction === liveCurrentFaction && !liveSelectedUnit.isStealthed);
        const cachedMeshes = sceneRef.current.selectionMeshes;
        const prevHasVision = !!(cachedMeshes && cachedMeshes.visionDisc);
        const needsRebuild = currentUnitId !== sceneRef.current.selectionSelectedUnitId || prevHasVision !== showVision;

        // Dispose old cached meshes when selection changes
        if (needsRebuild && cachedMeshes) {
          cachedMeshes.glowDisc.geometry.dispose();
          (cachedMeshes.glowDisc.material as THREE.Material).dispose();
          cachedMeshes.dashLine.geometry.dispose();
          (cachedMeshes.dashLine.material as THREE.Material).dispose();
          // [REMOVED] outerRing - no longer in selectionMeshes type definition
          // cachedMeshes.outerRing.geometry.dispose();
          // (cachedMeshes.outerRing.material as THREE.Material).dispose();
          if (cachedMeshes.visionDisc) {
            cachedMeshes.visionDisc.geometry.dispose();
            (cachedMeshes.visionDisc.material as THREE.Material).dispose();
          }
          if (cachedMeshes.visionDashLine) {
            cachedMeshes.visionDashLine.geometry.dispose();
            (cachedMeshes.visionDashLine.material as THREE.Material).dispose();
          }
          cachedMeshes.beam.geometry.dispose();
          (cachedMeshes.beam.material as THREE.Material).dispose();
          if (cachedMeshes.selectionBeam) {
            cachedMeshes.selectionBeam.geometry.dispose();
            (cachedMeshes.selectionBeam.material as THREE.Material).dispose();
          }
          for (const spark of cachedMeshes.sparkles) {
            spark.geometry.dispose();
            (spark.material as THREE.Material).dispose();
          }
          // v59.0: Dispose attack range ring meshes (added in v58.0)
          if (cachedMeshes.attackRangeDisc) {
            cachedMeshes.attackRangeDisc.geometry.dispose();
            (cachedMeshes.attackRangeDisc.material as THREE.Material).dispose();
          }
          if (cachedMeshes.attackRangeDashLine) {
            cachedMeshes.attackRangeDashLine.geometry.dispose();
            (cachedMeshes.attackRangeDashLine.material as THREE.Material).dispose();
          }
          while (sg.children.length > 0) sg.remove(sg.children[0]);
          sceneRef.current.selectionMeshes = null;
          sceneRef.current.selectionSelectedUnitId = null;
        }

        if (liveSelectedUnit && liveSelectedUnit.isAlive) {
          const worldPos = cellToWorld(liveSelectedUnit.position, _c2w1);
          const cell = gameMap.cells[liveSelectedUnit.position.z]?.[liveSelectedUnit.position.x];
          const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
          const isRed = liveSelectedUnit.faction === 'red';
          const isHero = liveSelectedUnit.isHero;
          const factionColor = isHero ? 0xffd700 : (isRed ? 0xc62828 : 0x1565c0);
          const factionColorLight = isHero ? 0xffeb3b : (isRed ? 0xff5252 : 0x448aff);

          // --- Rebuild cached meshes if selection changed ---
          if (needsRebuild) {
            const sm: NonNullable<typeof sceneRef.current.selectionMeshes> = {
              glowDisc: null!, dashLine: null!,
              visionDisc: null, visionDashLine: null,
              beam: null!, sparkles: [],
              selectionBeam: null,
              attackRangeDisc: null, attackRangeDashLine: null, attackRangeDashFloats: null,
            };

            // Subtle glow disc underneath the unit
            const glowGeo = new THREE.CircleGeometry(0.45, 32);
            // v91.0: MeshStandardMaterial with emissive for natural glow effect
            // [REDUCED] Very subtle glow per user request to remove visible rings
            const glowMat = new THREE.MeshStandardMaterial({
              color: 0x000000, emissive: factionColor, emissiveIntensity: 0.08, transparent: true, opacity: 0.05, side: THREE.DoubleSide,
            });
            sm.glowDisc = new THREE.Mesh(glowGeo, glowMat);
            sm.glowDisc.rotation.x = -Math.PI / 2;
            sg.add(sm.glowDisc);

            // Animated rotating dashed circle (using line segments + pre-allocated buffer)
            const dashGeo = new THREE.BufferGeometry();
            dashGeo.setAttribute('position', new THREE.BufferAttribute(sceneRef.current.selectionDashFloats, 3));
            dashGeo.setDrawRange(0, 48);
            const dashMat = new THREE.LineBasicMaterial({
              color: factionColorLight, transparent: true, opacity: 0.8,
            });
            sm.dashLine = new THREE.LineSegments(dashGeo, dashMat);
            sg.add(sm.dashLine);

            // [REMOVED] Vision Range Circle (Feature 2)

            // [REMOVED] Attack Range Ring (for hero extended range)

            // Soft vertical beam of light above the unit (base height 1.5, scaled per frame)
            const beamGeo = new THREE.CylinderGeometry(0.08, 0.15, 1.5, 8, 1, true);
            const beamMat = new THREE.MeshBasicMaterial({
              color: factionColorLight, transparent: true, opacity: 0.15, side: THREE.DoubleSide,
            });
            sm.beam = new THREE.Mesh(beamGeo, beamMat);
            sg.add(sm.beam);

            // v82.0: Thin vertical light beam above selected unit (pulsing glow)
            const selBeamColor = isRed ? 0xff4444 : 0x4488ff;
            const selBeamGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.5, 4);
            const selBeamMat = new THREE.MeshBasicMaterial({
              color: selBeamColor, transparent: true, opacity: 0.3, depthWrite: false,
            });
            sm.selectionBeam = new THREE.Mesh(selBeamGeo, selBeamMat);
            sm.selectionBeam.name = 'selectionBeam';
            sg.add(sm.selectionBeam);

            // Hero units: extra golden sparkle particles (pre-allocated)
            if (isHero) {
              const sparkleCount = 8;
              const sparkGeo = new THREE.SphereGeometry(0.025, 4, 4);
              for (let si = 0; si < sparkleCount; si++) {
                const sparkMat = new THREE.MeshBasicMaterial({
                  color: 0xffd700, transparent: true, opacity: 0.6,
                });
                const spark = new THREE.Mesh(sparkGeo.clone(), sparkMat);
                sm.sparkles.push(spark);
                sg.add(spark);
              }
              sparkGeo.dispose();
            }

            sceneRef.current.selectionMeshes = sm;
            sceneRef.current.selectionSelectedUnitId = currentUnitId;
          }

          // --- Per-frame dynamic updates (no allocations) ---
          const sm = sceneRef.current.selectionMeshes!;

          // Glow disc: pulse opacity + position (very subtle after reduction)
          (sm.glowDisc.material as THREE.MeshBasicMaterial).opacity = 0.02 + Math.sin(elapsed * 3) * 0.01;
          sm.glowDisc.position.set(worldPos.x, terrainHeight + 0.015, worldPos.z);

          // Dashed circle: write into pre-allocated Float32Array, update GPU buffer
          const dashSegments = 48;
          const dashCount = 24;
          const ringRadius = 0.48;
          const rotationOffset = elapsed * 1.5;
          const dashBuf = sceneRef.current.selectionDashFloats;
          let di = 0;
          for (let i = 0; i < dashSegments; i++) {
            if (Math.floor(i / (dashSegments / dashCount)) % 2 === 1) continue;
            const a1 = rotationOffset + (i / dashSegments) * Math.PI * 2;
            const a2 = rotationOffset + ((i + 1) / dashSegments) * Math.PI * 2;
            dashBuf[di++] = Math.cos(a1) * ringRadius;
            dashBuf[di++] = 0;
            dashBuf[di++] = Math.sin(a1) * ringRadius;
            dashBuf[di++] = Math.cos(a2) * ringRadius;
            dashBuf[di++] = 0;
            dashBuf[di++] = Math.sin(a2) * ringRadius;
          }
          sm.dashLine.geometry.setDrawRange(0, di / 3);
          (sm.dashLine.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
          sm.dashLine.position.set(worldPos.x, terrainHeight + 0.03, worldPos.z);

          // Vision disc/dashes: pulse opacity + update vision dash rotation
          if (sm.visionDisc) {
            (sm.visionDisc.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(elapsed * 2) * 0.05;
            sm.visionDisc.position.set(worldPos.x, terrainHeight + 0.01, worldPos.z);
          }
          if (sm.visionDashLine) {
            const visionSegments = 96;
            const visionDashCount = 48;
            const visionRotationOffset = -elapsed * 0.5;
            const weatherVisionMod = liveCurrentWeather ? WEATHER_CONFIGS[liveCurrentWeather].visionModifier : 0;
            const visionRange = Math.max(0, liveSelectedUnit.stats.vision + weatherVisionMod);
            const unitTerrain = gameMap.cells[liveSelectedUnit.position.z]?.[liveSelectedUnit.position.x];
            const unitTerrainCfg = unitTerrain ? TERRAIN_CONFIGS[unitTerrain.terrain] : null;
            const effectiveVision = visionRange + (unitTerrainCfg ? unitTerrainCfg.stats.visionBonus : 0);
            const visionRadius = effectiveVision * CELL_TOTAL;

            const vBuf = sceneRef.current.selectionVisionDashFloats;
            let vi = 0;
            for (let vj = 0; vj < visionSegments; vj++) {
              if (Math.floor(vj / (visionSegments / visionDashCount)) % 2 === 1) continue;
              const va1 = visionRotationOffset + (vj / visionSegments) * Math.PI * 2;
              const va2 = visionRotationOffset + ((vj + 1) / visionSegments) * Math.PI * 2;
              vBuf[vi++] = Math.cos(va1) * visionRadius;
              vBuf[vi++] = 0;
              vBuf[vi++] = Math.sin(va1) * visionRadius;
              vBuf[vi++] = Math.cos(va2) * visionRadius;
              vBuf[vi++] = 0;
              vBuf[vi++] = Math.sin(va2) * visionRadius;
            }
            sm.visionDashLine.geometry.setDrawRange(0, vi / 3);
            (sm.visionDashLine.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
            (sm.visionDashLine.material as THREE.LineBasicMaterial).opacity = 0.25 + Math.sin(elapsed * 2) * 0.1;
            sm.visionDashLine.position.set(worldPos.x, terrainHeight + 0.02, worldPos.z);
          }

          // v58.0: Animate attack range ring
          // v84.0: Enhanced pulse animation for better visibility
          if (sm.attackRangeDisc && sm.attackRangeDashLine && sm.attackRangeDashFloats) {
            sm.attackRangeDisc.position.set(worldPos.x, terrainHeight + 0.015, worldPos.z);
            (sm.attackRangeDisc.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(elapsed * 3) * 0.15;

            const rangeBonus = liveSelectedUnit.abilities?.find(a => a.effect?.attackRangeBonus)?.effect?.attackRangeBonus ?? 0;
            const atkRadius = (liveSelectedUnit.stats.attackRange + rangeBonus) * CELL_TOTAL;
            const atkBuf = sm.attackRangeDashFloats;
            const atkSegments = 48;
            const atkDashCount = 24;
            const atkRotation = elapsed * 0.3;
            let ai = 0;
            for (let aj = 0; aj < atkSegments; aj++) {
              if (Math.floor(aj / (atkSegments / atkDashCount)) % 2 === 1) continue;
              const aa1 = atkRotation + (aj / atkSegments) * Math.PI * 2;
              const aa2 = atkRotation + ((aj + 1) / atkSegments) * Math.PI * 2;
              atkBuf[ai++] = Math.cos(aa1) * atkRadius;
              atkBuf[ai++] = 0;
              atkBuf[ai++] = Math.sin(aa1) * atkRadius;
              atkBuf[ai++] = Math.cos(aa2) * atkRadius;
              atkBuf[ai++] = 0;
              atkBuf[ai++] = Math.sin(aa2) * atkRadius;
            }
            sm.attackRangeDashLine.geometry.setDrawRange(0, ai / 3);
            (sm.attackRangeDashLine.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
            (sm.attackRangeDashLine.material as THREE.LineBasicMaterial).opacity = 0.3 + Math.sin(elapsed * 3) * 0.15;
            sm.attackRangeDashLine.position.set(worldPos.x, terrainHeight + 0.02, worldPos.z);
          }

          // Beam: pulse height via scale + opacity + position
          const beamHeight = 1.5 + Math.sin(elapsed * 2) * 0.2;
          sm.beam.scale.y = beamHeight / 1.5;
          sm.beam.position.set(worldPos.x, terrainHeight + beamHeight / 2 + 0.1, worldPos.z);
          (sm.beam.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(elapsed * 2.5) * 0.05;

          // v82.0: Thin selection beam — pulsing glow above unit
          if (sm.selectionBeam) {
            sm.selectionBeam.position.set(worldPos.x, terrainHeight + 0.75 + Math.sin(elapsed * 3) * 0.1, worldPos.z);
            (sm.selectionBeam.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(elapsed * 2) * 0.1;
          }

          // Hero sparkles: animate positions + opacity (no allocations)
          for (let si = 0; si < sm.sparkles.length; si++) {
            const spark = sm.sparkles[si];
            const sparkAngle = elapsed * 2 + (si / sm.sparkles.length) * Math.PI * 2;
            const sparkRadius = 0.35 + Math.sin(elapsed * 4 + si * 1.5) * 0.1;
            const sparkY = terrainHeight + 0.3 + Math.sin(elapsed * 3 + si * 0.8) * 0.15;
            spark.position.set(
              worldPos.x + Math.cos(sparkAngle) * sparkRadius,
              sparkY,
              worldPos.z + Math.sin(sparkAngle) * sparkRadius
            );
            (spark.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(elapsed * 5 + si) * 0.4;
          }
          
          // Ghost preview when hovering over movable positions
          // v82: Added liveSelectedUnit guard to outer condition to prevent return inside animate()
          if (livePhase === 'moveUnit' && !isPanning && liveSelectedUnit) {
            raycaster.setFromCamera(mouse, camera);
            const allCellMeshes = sceneRef.current.flatCellMeshes;
            const cellIntersects = raycaster.intersectObjects(allCellMeshes);

            let newGhostPos: Position | null = null;
            if (cellIntersects.length > 0) {
              const hoveredPos = cellIntersects[0].object.userData.cellPos as Position;
              if (hoveredPos && liveMovablePositions.some(p => p.x === hoveredPos.x && p.z === hoveredPos.z)) {
                newGhostPos = hoveredPos;
              }
            }

            // v38.1: Only recreate ghost mesh when unit TYPE changes; only update position otherwise
            const currentGhostMesh = sceneRef.current.ghostMesh as THREE.Group | null;
            const prevGhostUnitType = sceneRef.current.ghostUnitType;
            if (newGhostPos) {
              // Check if we need to recreate the mesh (unit type changed)
              if (prevGhostUnitType !== liveSelectedUnit.type) {
                // Dispose old ghost properly
                if (currentGhostMesh) {
                  currentGhostMesh.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                      child.geometry?.dispose();
                      if (child.material) (child.material as THREE.Material).dispose();
                    }
                  });
                  scene.remove(currentGhostMesh);
                }
                const ghostMesh = createUnitMesh(liveSelectedUnit);
                ghostMesh.traverse(child => {
                  if (child instanceof THREE.Mesh && child.material) {
                    const mat = child.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
                    if ('transparent' in mat) {
                      mat.transparent = true;
                      mat.opacity = 0.3;
                    }
                  }
                });
                const ghostWorldPos = cellToWorld(newGhostPos, _c2w1);
                const ghostCell = liveState.map.cells[newGhostPos.z]?.[newGhostPos.x];
                const ghostTerrainHeight = ghostCell ? TERRAIN_CONFIGS[ghostCell.terrain].stats.height * CELL_SIZE : 0;
                ghostMesh.position.set(ghostWorldPos.x, ghostTerrainHeight, ghostWorldPos.z);
                if (liveSelectedUnit.faction === 'blue') ghostMesh.rotation.y = Math.PI;
                scene.add(ghostMesh);
                sceneRef.current.ghostMesh = ghostMesh;
                sceneRef.current.ghostUnitType = liveSelectedUnit.type;
              } else if (currentGhostMesh) {
                // Same unit type — just update position
                const ghostWorldPos = cellToWorld(newGhostPos, _c2w1);
                const ghostCell = liveState.map.cells[newGhostPos.z]?.[newGhostPos.x];
                const ghostTerrainHeight = ghostCell ? TERRAIN_CONFIGS[ghostCell.terrain].stats.height * CELL_SIZE : 0;
                currentGhostMesh.position.set(ghostWorldPos.x, ghostTerrainHeight, ghostWorldPos.z);
              }
              sceneRef.current.ghostPosition = newGhostPos;
            } else if (!newGhostPos && currentGhostMesh) {
              // No longer hovering a valid position — dispose ghost
              currentGhostMesh.traverse(child => {
                if (child instanceof THREE.Mesh) {
                  child.geometry?.dispose();
                  if (child.material) (child.material as THREE.Material).dispose();
                }
              });
              scene.remove(currentGhostMesh);
              sceneRef.current.ghostMesh = null;
              sceneRef.current.ghostPosition = null;
              sceneRef.current.ghostUnitType = null;
            }
          }
        }
      }

      // ===== Pulsing Red Rings & Crosshairs on Attackable Enemy Units =====
      // v55.0: Only rebuild meshes when attackablePositions set changes (was rebuilding every frame)
      if (sceneRef.current && liveAttackablePositions.length > 0) {
        const { interactiveGroup: ig } = sceneRef.current;
        // Compute stable cache key from sorted attackable positions
        const interactiveKey = liveAttackablePositions
          .map(p => `${p.x},${p.z}`)
          .sort()
          .join('|');

        if (interactiveKey !== sceneRef.current.prevInteractiveKey) {
          // v55.0: Attackable positions changed — dispose old meshes and rebuild
          sceneRef.current.prevInteractiveKey = interactiveKey;

          // Dispose previous interactive effects
          while (ig.children.length > 0) {
            const child = ig.children[0];
            ig.remove(child);
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              (child.material as THREE.Material).dispose();
            }
          }

          const enemyDataArr: typeof sceneRef.current.interactiveEnemyData = [];

          for (const atkPos of liveAttackablePositions) {
            // v90.0: Use liveUnitMap with isAlive check instead of .find() fallback
            const enemy = liveUnitMap.get(`${atkPos.x},${atkPos.z}`);
            if (!enemy || !enemy.isAlive) continue;

            const worldPos = cellToWorld(enemy.position, _c2w1);
            const cell = gameMap.cells[enemy.position.z]?.[enemy.position.x];
            const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

            // Base ring geometry (no pulse baked in — scale applied per-frame)
            const ringGeo = new THREE.RingGeometry(0.42, 0.52, 24);
            const ringMat = new THREE.MeshBasicMaterial({
              color: 0xff1744,
              transparent: true,
              opacity: 0.5,
              side: THREE.DoubleSide,
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(worldPos.x, terrainHeight + 0.03, worldPos.z);
            ig.add(ring);

            // Sword cross shape (shared material across parts)
            const swordMat = new THREE.MeshBasicMaterial({
              color: 0xff1744,
              transparent: true,
              opacity: 0.9,
            });
            // Vertical bar (sword blade)
            const bladeGeo = new THREE.BoxGeometry(0.025, 0.18, 0.025);
            const blade = new THREE.Mesh(bladeGeo, swordMat);
            blade.position.set(worldPos.x, terrainHeight + 0.75, worldPos.z);
            ig.add(blade);
            // Horizontal bar (crossguard)
            const guardGeo = new THREE.BoxGeometry(0.1, 0.025, 0.025);
            const guard = new THREE.Mesh(guardGeo, swordMat);
            guard.position.set(worldPos.x, terrainHeight + 0.78, worldPos.z);
            ig.add(guard);
            // Small diamond tip
            const tipGeo = new THREE.OctahedronGeometry(0.03, 0);
            const tipMat = new THREE.MeshBasicMaterial({ color: 0xff5252, transparent: true, opacity: 0.8 });
            const tip = new THREE.Mesh(tipGeo, tipMat);
            tip.position.set(worldPos.x, terrainHeight + 0.87, worldPos.z);
            ig.add(tip);

            enemyDataArr.push({
              ring, blade, guard, tip,
              baseY: terrainHeight,
              worldX: worldPos.x,
              worldZ: worldPos.z,
              atkX: atkPos.x,
            });
          }

          sceneRef.current.interactiveEnemyData = enemyDataArr;
        }

        // v55.0: Per-frame updates: pulse scale/opacity and bobbing position
        const pulseScale = 1.0 + Math.sin(elapsed * 4) * 0.15;
        const pulseOpacity = 0.5 + Math.sin(elapsed * 4) * 0.3;
        const interactiveData = sceneRef.current.interactiveEnemyData;
        if (interactiveData) {
          for (const ed of interactiveData) {
            ed.ring.scale.set(pulseScale, pulseScale, pulseScale);
            (ed.ring.material as THREE.MeshBasicMaterial).opacity = pulseOpacity;

            const floatY = ed.baseY + 0.75 + Math.sin(elapsed * 3 + ed.atkX) * 0.06;
            ed.blade.position.y = floatY;
            ed.guard.position.y = floatY + 0.03;
            ed.tip.position.y = floatY + 0.12;
          }
        }
      } else if (sceneRef.current && sceneRef.current.interactiveGroup) {
        // Clear interactive group when no attackable positions
        const { interactiveGroup: ig } = sceneRef.current;
        while (ig.children.length > 0) {
          const child = ig.children[0];
          ig.remove(child);
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        }
        sceneRef.current.prevInteractiveKey = null;
        sceneRef.current.interactiveEnemyData = null;
      }

      // ===== Combat Animation: Projectiles, Shake, Muzzle Flash =====
      if (sceneRef.current) {
        // Detect new combat log entries for projectiles
        const currentLogLength = liveCombatLog.length;
        const lastLogLength = sceneRef.current.lastCombatLogLength;
        
        if (currentLogLength > lastLogLength && lastLogLength >= 0) {
          // New combat happened - spawn projectile + muzzle flash
          const newEntries = liveCombatLog.slice(lastLogLength);
          for (const entry of newEntries) {
            let attackerPos: Position | null = null;
            let defenderPos: Position | null = null;
            
            // v59.0: Use unitId for exact matching instead of substring name match
            // (was buggy: entry.attacker.includes(u.name) matched multiple units of same type)
            // v91.0: Use liveUnitMap.get() instead of allStoreUnits.find() — O(1) vs O(n)
            const allStoreUnits = liveUnits; // v91.0: reuse already-fetched liveUnits for fallback path
            if (entry.attackerUnitId) {
              const attUnit = liveUnitMap.get(entry.attackerUnitId);
              if (attUnit) attackerPos = attUnit.position;
            } else {
              // Fallback for old saves without unitId
              for (const u of allStoreUnits) {
                if (entry.attacker.includes(u.name) && u.faction === entry.attackerFaction) {
                  attackerPos = u.position;
                }
              }
            }
            const defenderFaction: Faction = entry.attackerFaction === 'red' ? 'blue' : 'red';
            if (entry.defenderUnitId) {
              const defUnit = liveUnitMap.get(entry.defenderUnitId);
              if (defUnit) defenderPos = defUnit.position;
            } else {
              for (const u of allStoreUnits) {
                if (entry.defender.includes(u.name) && u.faction === defenderFaction) {
                  defenderPos = u.position;
                }
              }
            }
            
            if (attackerPos && defenderPos) {
              const fromWorld = cellToWorld(attackerPos, _c2w1);
              const toWorld = cellToWorld(defenderPos, _c2w2);
              const fromCell = gameMap.cells[attackerPos.z]?.[attackerPos.x];
              const toCell = gameMap.cells[defenderPos.z]?.[defenderPos.x];
              const fromH = fromCell ? TERRAIN_CONFIGS[fromCell.terrain].stats.height * CELL_SIZE : 0;
              const toH = toCell ? TERRAIN_CONFIGS[toCell.terrain].stats.height * CELL_SIZE : 0;
              
              // Spawn projectile line from attacker to defender (existing tracer effect)
              // v91.0: Use pre-allocated _tv1/_tv2 instead of new Vector3() allocations per event
              _tv1.set(fromWorld.x, fromH + 0.3, fromWorld.z);
              _tv2.set(toWorld.x, toH + 0.3, toWorld.z);
              const points = [_tv1.clone(), _tv2.clone()];
              const projGeo = new THREE.BufferGeometry().setFromPoints(points);
              const projMat = new THREE.LineBasicMaterial({
                color: entry.attackerFaction === 'red' ? 0xff5252 : 0x448aff,
                transparent: true,
                opacity: 1.0,
              });
              const projLine = new THREE.Line(projGeo, projMat);
              sceneRef.current.projectileGroup.add(projLine);
              sceneRef.current.projectiles.push({
                line: projLine,
                startTime: Date.now(),
                from: points[0],
                to: points[1],
                age: 0,
              });

              // ===== Glowing Attack Tracer Line =====
              // v91.0: Reuse _tv1/_tv2 (already set above), clone for persistence in tracerLines array
              const isCounterAttack = entry.eventType === 'counter';
              const tracerFrom = _tv1.clone();
              const tracerTo = _tv2.clone();
              const tracerCoreColor = isCounterAttack ? 0x60a5fa : (entry.attackerFaction === 'red' ? 0xff5252 : 0xfbbf24);
              const tracerGlowColor = isCounterAttack ? 0x3b82f6 : (entry.attackerFaction === 'red' ? 0xff8a80 : 0xfcd34d);

              // Core line (thin, bright)
              const tracerInitPoints = [
                tracerFrom.clone(),
                tracerFrom.clone(), // starts at origin, will animate to target
              ];
              const tracerCoreGeo = new THREE.BufferGeometry().setFromPoints(tracerInitPoints);
              const tracerCoreMat = new THREE.LineBasicMaterial({
                color: tracerCoreColor,
                transparent: true,
                opacity: 1.0,
                depthWrite: false,
              });
              const tracerCore = new THREE.Line(tracerCoreGeo, tracerCoreMat);
              sceneRef.current.effectsGroup.add(tracerCore);

              // Glow line (wider effect via second line with additive blending)
              // v76.0: Added depthWrite:false to prevent Z-fighting artifacts
              const tracerGlowGeo = new THREE.BufferGeometry().setFromPoints(tracerInitPoints);
              // v76.0→v79.0: depthWrite:false to prevent Z-fighting artifacts
              const tracerGlowMat = new THREE.LineBasicMaterial({
                color: tracerGlowColor,
                transparent: true,
                opacity: 0.4,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              });
              const tracerGlow = new THREE.Line(tracerGlowGeo, tracerGlowMat);
              sceneRef.current.effectsGroup.add(tracerGlow);

              sceneRef.current.tracerLines.push({
                coreLine: tracerCore,
                glowLine: tracerGlow,
                startTime: Date.now(),
                from: tracerFrom,
                to: tracerTo,
                duration: 300,
                isCounter: isCounterAttack,
                completed: false,
              });

              // ===== Feature 1: Glowing Sphere Projectile Trail =====
              // v91.0: Reuse _tv1/_tv2 (same from/to values), clone for persistence
              const isCounter = entry.eventType === 'counter';
              const projFrom = _tv1.clone();
              const projTo = _tv2.clone();
              const projColor = isCounter ? 0xfbbf24 : (entry.attackerFaction === 'red' ? 0xff6b35 : 0x64b5f6);
              
              // Main projectile sphere
              const mainGeo = _combatGeo.muzzleFlash;
              const mainMat = new THREE.MeshBasicMaterial({
                color: projColor,
                transparent: true,
                opacity: 1.0,
              });
              const mainSphere = new THREE.Mesh(mainGeo, mainMat);
              mainSphere.position.copy(projFrom);
              effectsGroup.add(mainSphere);
              
              // Point light following the projectile
              const projLight = new THREE.PointLight(projColor, 2.0, 3.0);
              projLight.position.copy(projFrom);
              effectsGroup.add(projLight);
              
              // Trail spheres (4 smaller spheres following with delay)
              const trailSpheres: THREE.Mesh[] = [];
              for (let t = 0; t < 4; t++) {
                const trailGeo = _combatGeo.smallExplosion;
                const trailMat = new THREE.MeshBasicMaterial({
                  color: projColor,
                  transparent: true,
                  opacity: 0.7 - t * 0.15,
                });
                const trailMesh = new THREE.Mesh(trailGeo, trailMat);
                trailMesh.position.copy(projFrom);
                trailMesh.scale.setScalar(1 - t * 0.1875); // 0.08→0.035 via scale
                effectsGroup.add(trailMesh);
                trailSpheres.push(trailMesh);
              }
              
              const allProjObjects: THREE.Object3D[] = [mainSphere, projLight, ...trailSpheres];
              sceneRef.current.projectileAnimations.push({
                id: ++effectIdCounter,
                mainSphere,
                trailSpheres,
                pointLight: projLight,
                from: projFrom,
                to: projTo,
                startTime: Date.now(),
                duration: 300,
                isCounter,
                completed: false,
                objects: allProjObjects,
              });
              
              // ===== Feature 3: Muzzle Flash at Attacker =====
              // v91.0: Use pre-allocated _tv1 for muzzle direction, avoid new Vector3()
              _tv1.subVectors(projTo, projFrom).normalize();
              const muzzleDir = _tv1.clone();
              const muzzleOffset = muzzleDir.multiplyScalar(0.25);
              const muzzlePos = new THREE.Vector3(
                projFrom.x + muzzleOffset.x,
                projFrom.y + muzzleOffset.y,
                projFrom.z + muzzleOffset.z
              );
              
              const mfGeo = _combatGeo.muzzleFlash;
              // v91.0: MeshStandardMaterial with emissive orange for natural glow (intensity 2)
              const mfMat = new THREE.MeshStandardMaterial({
                color: 0x000000,
                emissive: 0xff8800,
                emissiveIntensity: 2,
                transparent: true,
                opacity: 0.0,
              });
              const mfSphere = new THREE.Mesh(mfGeo, mfMat);
              mfSphere.position.copy(muzzlePos);
              effectsGroup.add(mfSphere);
              
              const mfLight = new THREE.PointLight(0xffff88, 0.0, 2.5);
              mfLight.position.copy(muzzlePos);
              effectsGroup.add(mfLight);
              
              sceneRef.current.muzzleFlashAnims.push({
                id: ++effectIdCounter,
                sphere: mfSphere,
                pointLight: mfLight,
                startTime: Date.now(),
                duration: 200,
                objects: [mfSphere, mfLight],
              });
              
              // ===== v47.0: Hit Impact Spark Particles (all attacks, not just kills) =====
              if (entry.eventType !== 'destroy') {
                const hitPos = new THREE.Vector3(toWorld.x, toH + 0.2, toWorld.z);
                const sparkCount = 5;
                for (let sp = 0; sp < sparkCount; sp++) {
                  const spAngle = Math.random() * Math.PI * 2;
                  const spSpeed = 0.6 + Math.random() * 0.6;
                  const spVel = new THREE.Vector3(
                    Math.cos(spAngle) * spSpeed,
                    0.2 + Math.random() * 0.4,
                    Math.sin(spAngle) * spSpeed
                  );
                  const spGeo = _combatGeo.hitSpark;
                  const spColor = new THREE.Color().setHSL(0.08 + Math.random() * 0.04, 1.0, 0.55 + Math.random() * 0.2);
                  const spMat = new THREE.MeshBasicMaterial({ color: spColor, transparent: true, opacity: 1.0 });
                  const spMesh = new THREE.Mesh(spGeo, spMat);
                  spMesh.position.copy(hitPos);
                  effectsGroup.add(spMesh);

                  sceneRef.current.explosionAnimations.push({
                    id: ++effectIdCounter,
                    particles: [{ mesh: spMesh, velocity: spVel, gravity: -2.5 }],
                    centralFlash: null,
                    shockwave: null,
                    startTime: Date.now(),
                    duration: 400,
                    isCounter: entry.eventType === 'counter',
                    position: hitPos.clone(),
                    objects: [spMesh],
                  });
                }
                // Small flash at hit point
                const hfGeo = _combatGeo.hitFlash;
                const hfMat = new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9 });
                const hitFlash = new THREE.Mesh(hfGeo, hfMat);
                hitFlash.position.copy(hitPos);
                hitFlash.scale.setScalar(0);
                effectsGroup.add(hitFlash);
                sceneRef.current.explosionAnimations.push({
                  id: ++effectIdCounter,
                  particles: [],
                  centralFlash: hitFlash,
                  shockwave: null,
                  startTime: Date.now(),
                  duration: 250,
                  isCounter: false,
                  position: hitPos.clone(),
                  objects: [hitFlash],
                });
              }

              // ===== Feature 2: Explosion on Kill (enhanced for v47.0) =====
              if (entry.eventType === 'destroy') {
                const expPos = new THREE.Vector3(toWorld.x, toH + 0.25, toWorld.z);
                const expObjects: THREE.Object3D[] = [];
                
                // Ring of particles expanding outward
                const expParticles: { mesh: THREE.Mesh; velocity: THREE.Vector3 }[] = [];
                const particleCount = 10;
                for (let p = 0; p < particleCount; p++) {
                  const angle = (p / particleCount) * Math.PI * 2;
                  const speed = 1.2 + Math.random() * 0.8;
                  const vel = new THREE.Vector3(
                    Math.cos(angle) * speed,
                    0.3 + Math.random() * 0.5,
                    Math.sin(angle) * speed
                  );
                  const pGeo = _combatGeo.smallExplosion;
                  const hue = 0.04 + Math.random() * 0.06;
                  const pColor = new THREE.Color().setHSL(hue, 1.0, 0.5 + Math.random() * 0.3);
                  const pMat = new THREE.MeshBasicMaterial({ color: pColor, transparent: true, opacity: 1.0 });
                  const pMesh = new THREE.Mesh(pGeo, pMat);
                  pMesh.position.copy(expPos);
                  pMesh.scale.setScalar(0);
                  effectsGroup.add(pMesh);
                  expParticles.push({ mesh: pMesh, velocity: vel });
                  expObjects.push(pMesh);
                }
                
                // Central white flash sphere
                const cfGeo = _combatGeo.largeExplosion;
                const cfMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 });
                const centralFlash = new THREE.Mesh(cfGeo, cfMat);
                centralFlash.position.copy(expPos);
                centralFlash.scale.setScalar(0);
                effectsGroup.add(centralFlash);
                expObjects.push(centralFlash);
                
                // Shockwave ring
                const swGeo = new THREE.RingGeometry(0.1, 0.15, 24);
                const swMat = new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
                const shockwave = new THREE.Mesh(swGeo, swMat);
                shockwave.position.copy(expPos);
                shockwave.rotation.x = -Math.PI / 2;
                shockwave.position.y += 0.05;
                shockwave.scale.setScalar(0);
                effectsGroup.add(shockwave);
                expObjects.push(shockwave);
                
                sceneRef.current.explosionAnimations.push({
                  id: ++effectIdCounter,
                  particles: expParticles,
                  centralFlash,
                  shockwave,
                  startTime: Date.now(),
                  duration: 500,
                  position: expPos,
                  objects: expObjects,
                });
              }
              
              // ===== Feature 4: Camera Shake on Heavy Damage =====
              // v75.0: Logarithmic intensity scaling based on damage value
              // v86.0: Scaled by shakeIntensity from store (unit-type-based)
              if (entry.damage > 0) {
                const storeShakeIntensity = useGameStore.getState().shakeIntensity || 1;
                const shakeIntensity = Math.min(0.8, 0.1 + Math.log10(Math.max(1, entry.damage)) * 0.15) * storeShakeIntensity;
                const shakeDuration = entry.damage >= 50 ? 400 : entry.damage >= 25 ? 300 : 200;
                sceneRef.current.cameraShake = {
                  startTime: Date.now(),
                  duration: shakeDuration,
                  intensity: Math.min(2.5, shakeIntensity),
                };
              }
              
              // v59.0: Use defenderUnitId for exact matching
              // v90.0: Use liveUnitMap.get() instead of .find() for ID lookups
              const defenderId = entry.defenderUnitId
                ? (liveUnitMap.get(entry.defenderUnitId)?.id || '')
                : (liveUnits.find(u => entry.defender.includes(u.name) && u.faction !== entry.attackerFaction)?.id || '');
              const defenderMesh = sceneRef.current.unitMeshes.get(defenderId);
              if (defenderMesh) {
                sceneRef.current.shakeTargets.push({
                  unitId: defenderMesh.userData.unitId,
                  startTime: Date.now(),
                  originalPos: defenderMesh.position.clone(),
                });
              }
              
              // Screen edge flash (vignette) — v47.0: adaptive intensity
              const flashColor = entry.attackerFaction === 'red' ? 'rgba(198, 40, 40, 0.8)' : 'rgba(21, 101, 192, 0.8)';
              const isDestroy = entry.eventType === 'destroy';
              const isCritical = entry.damage && entry.damage >= 30;
              const flashIntensity = isDestroy ? 0.6 : (isCritical ? 0.45 : 0.25);
              // v51.0: Clear previous flash timeout to prevent overlapping/cancelled flashes
              if (screenFlashTimeoutRef.current) clearTimeout(screenFlashTimeoutRef.current);
              setScreenFlash({ color: flashColor, opacity: flashIntensity });
              // v78.0: Fade out before removing to avoid jarring snap
              const fadeTimeout = setTimeout(() => {
                setScreenFlash(prev => prev ? { ...prev, opacity: 0 } : null);
                const removeTimeout = setTimeout(() => {
                  screenFlashTimeoutRef.current = null;
                  setScreenFlash(null);
                }, 300);
                screenFlashTimeoutRef.current = removeTimeout;
              }, isDestroy ? 300 : 150);
              screenFlashTimeoutRef.current = fadeTimeout;
            }
          }
        }
        sceneRef.current.lastCombatLogLength = currentLogLength;

        // ===== Combat Replay 3D Visualization =====
        if (liveReplayState?.isReplaying && liveReplayState.currentReplayStep >= 0) {
          const action = liveReplayState.replayActions[liveReplayState.currentReplayStep];
          if (action && (action.type === 'attack' || action.type === 'destroy') && action.unitId && action.targetId) {
            const fromUnit = liveUnitMap.get(action.unitId) || liveUnits.find(u => u.id === action.unitId || u.name === action.unitId);
            const toUnit = liveUnitMap.get(action.targetId) || liveUnits.find(u => u.id === action.targetId || u.name === action.targetId);
            if (fromUnit && toUnit) {
              // v51.0: Fix — access map.cells, not map[z][x] directly
              const liveMap = liveState.map;
              const fromCell = liveMap?.cells?.[fromUnit.position.z]?.[fromUnit.position.x];
              const toCell = liveMap?.cells?.[toUnit.position.z]?.[toUnit.position.x];
              if (fromCell && toCell) {
                const fromH = (fromCell.terrain ? TERRAIN_CONFIGS[fromCell.terrain].stats.height : 0) * CELL_SIZE;
                const toH = (toCell.terrain ? TERRAIN_CONFIGS[toCell.terrain].stats.height : 0) * CELL_SIZE;
                const fromWorld = cellToWorld(fromUnit.position, _c2w1);
                const toWorld = cellToWorld(toUnit.position, _c2w2);
                
                const projColor = action.type === 'destroy' ? 0xff4444 : (fromUnit.faction === 'red' ? 0xff6b35 : 0x64b5f6);
                
                // Replay tracer line
                const tLineGeo = new THREE.BufferGeometry().setFromPoints([
                  new THREE.Vector3(fromWorld.x, fromH + 0.3, fromWorld.z),
                  new THREE.Vector3(toWorld.x, toH + 0.3, toWorld.z),
                ]);
                const tLineMat = new THREE.LineBasicMaterial({ color: projColor, transparent: true, opacity: 0.8 });
                const tLine = new THREE.Line(tLineGeo, tLineMat);
                effectsGroup.add(tLine);
                
                // Replay projectile sphere
                const rpGeo = _combatGeo.muzzleFlash;
                const rpMat = new THREE.MeshBasicMaterial({ color: projColor, transparent: true, opacity: 1.0 });
                const rpSphere = new THREE.Mesh(rpGeo, rpMat);
                rpSphere.scale.setScalar(0.8); // 0.15→0.12 via scale
                rpSphere.position.copy(fromWorld); rpSphere.position.y += 0.3;
                effectsGroup.add(rpSphere);
                
                // v60.0: Add PointLight to scene (was orphaned — never added or cleaned up)
                const rpLight = new THREE.PointLight(projColor, 0.5, 2);
                rpLight.position.copy(fromWorld); rpLight.position.y += 0.5;
                effectsGroup.add(rpLight);
                
                sceneRef.current.projectileAnimations.push({
                  id: ++effectIdCounter,
                  mainSphere: rpSphere,
                  trailSpheres: [],
                  pointLight: rpLight,
                  from: fromWorld.clone(),
                  to: toWorld.clone(),
                  startTime: Date.now(),
                  duration: 400,
                  isCounter: false,
                  completed: false,
                  objects: [tLine, rpSphere, rpLight],
                });
                
                // Muzzle flash at attacker
                const mfGeo = _combatGeo.muzzleFlash;
                const mfMat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.9 });
                const mfSphere = new THREE.Mesh(mfGeo, mfMat);
                mfSphere.scale.setScalar(0.8); // 0.15→0.12 via scale
                mfSphere.position.copy(fromWorld); mfSphere.position.y += 0.3;
                effectsGroup.add(mfSphere);
                
                sceneRef.current.muzzleFlashAnims.push({
                  id: ++effectIdCounter,
                  sphere: mfSphere,
                  pointLight: null,
                  startTime: Date.now(),
                  duration: 200,
                  objects: [mfSphere],
                });
                
                // Explosion on destroy
                if (action.type === 'destroy') {
                  const expPos = new THREE.Vector3(toWorld.x, toH + 0.25, toWorld.z);
                  const expParticles: { mesh: THREE.Mesh; velocity: THREE.Vector3 }[] = [];
                  for (let p = 0; p < 8; p++) {
                    const angle = (p / 8) * Math.PI * 2;
                    const speed = 1.0 + Math.random() * 0.6;
                    const pGeo = _combatGeo.smallExplosion;
                    const pMat = new THREE.MeshBasicMaterial({ color: 0xff6633, transparent: true, opacity: 1.0 });
                    const pMesh = new THREE.Mesh(pGeo, pMat);
                    pMesh.position.copy(expPos);
                    effectsGroup.add(pMesh);
                    expParticles.push({ mesh: pMesh, velocity: new THREE.Vector3(Math.cos(angle) * speed, 0.2 + Math.random() * 0.3, Math.sin(angle) * speed) });
                  }
                  const centralGeo = _combatGeo.largeExplosion;
                  const centralMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
                  const centralFlash = new THREE.Mesh(centralGeo, centralMat);
                  centralFlash.scale.setScalar(1.25); // 0.2→0.25 via scale
                  centralFlash.position.copy(expPos);
                  effectsGroup.add(centralFlash);
                  
                  const shockwave = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.6, 24), new THREE.MeshBasicMaterial({ color: 0xff8844, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
                  shockwave.rotation.x = -Math.PI / 2;
                  shockwave.position.copy(expPos);
                  shockwave.position.y += 0.1;
                  effectsGroup.add(shockwave);
                  
                  sceneRef.current.explosionAnimations.push({
                    id: ++effectIdCounter,
                    particles: expParticles,
                    centralFlash,
                    shockwave,
                    startTime: Date.now(),
                    duration: 400,
                    position: expPos,
                    objects: expParticles.map(p => p.mesh).concat(centralFlash, shockwave),
                  });
                }
              }
            }
          }
        }
        
        // Update projectile animations (existing line tracers)
        for (let i = sceneRef.current.projectiles.length - 1; i >= 0; i--) {
          const proj = sceneRef.current.projectiles[i];
          proj.age = (Date.now() - proj.startTime) / 1000;
          if (proj.age > 0.5) {
            sceneRef.current.projectileGroup.remove(proj.line);
            proj.line.geometry.dispose();
            (proj.line.material as THREE.Material).dispose();
            // v90.0: swap-with-last instead of splice(i,1) for O(1) removal
            sceneRef.current.projectiles[i] = sceneRef.current.projectiles[sceneRef.current.projectiles.length - 1];
            sceneRef.current.projectiles.pop();
          } else {
            const mat = proj.line.material as THREE.LineBasicMaterial;
            mat.opacity = Math.max(0, 1 - proj.age / 0.5);
          }
        }
        
        // ===== Update Projectile Sphere Animations =====
        for (let i = sceneRef.current.projectileAnimations.length - 1; i >= 0; i--) {
          const pa = sceneRef.current.projectileAnimations[i];
          const age = Date.now() - pa.startTime;
          const progress = Math.min(1, age / pa.duration);
          
          if (progress >= 1 && !pa.completed) {
            // Impact flash - briefly scale up and fade the sphere
            pa.completed = true;
            pa.mainSphere.scale.setScalar(2.5);
            const impactLight = new THREE.PointLight(
              pa.isCounter ? 0xfbbf24 : 0xff4444,
              4.0,
              3.0
            );
            impactLight.position.copy(pa.to);
            effectsGroup.add(impactLight);
            pa.objects.push(impactLight);
            // v65.0: Guard against unmounted scene on timeout callback
            // v76.0: Track timeout for cleanup on unmount
            const _efg = effectsGroup; // capture ref for closure
            const tid = setTimeout(() => {
              if (_efg && _efg.children.includes(impactLight)) {
                _efg.remove(impactLight);
                impactLight.dispose();
              }
            }, 150);
            if (sceneRef.current) sceneRef.current.pendingTimeouts.push(tid);
          }
          
          if (age > pa.duration + 200) {
            // Cleanup all objects
            for (const obj of pa.objects) {
              effectsGroup.remove(obj);
              if (obj instanceof THREE.Mesh) {
                // Don't dispose shared combat VFX geometries
                if (!_sharedCombatGeoSet.has(obj.geometry)) obj.geometry.dispose();
                (obj.material as THREE.Material).dispose();
              } else if (obj instanceof THREE.PointLight) {
                obj.dispose();
              }
            }
            // v90.0: swap-with-last instead of splice(i,1) for O(1) removal
            sceneRef.current.projectileAnimations[i] = sceneRef.current.projectileAnimations[sceneRef.current.projectileAnimations.length - 1];
            sceneRef.current.projectileAnimations.pop();
          } else if (!pa.completed) {
            // Animate main sphere along path
            const t = easeOutCubic(progress);
            pa.mainSphere.position.lerpVectors(pa.from, pa.to, t);
            pa.pointLight.position.copy(pa.mainSphere.position);
            
            // Arc trajectory (slight upward curve)
            const arcHeight = 0.4 * Math.sin(progress * Math.PI);
            pa.mainSphere.position.y += arcHeight;
            pa.pointLight.position.y = pa.mainSphere.position.y;
            
            // Animate trail spheres with delay
            for (let ti = 0; ti < pa.trailSpheres.length; ti++) {
              const trailDelay = (ti + 1) * 0.08;
              const trailProgress = Math.max(0, Math.min(1, (age / pa.duration) - trailDelay));
              const tt = easeOutCubic(trailProgress);
              pa.trailSpheres[ti].position.lerpVectors(pa.from, pa.to, tt);
              pa.trailSpheres[ti].position.y += 0.4 * Math.sin(trailProgress * Math.PI);
              // Fade trail spheres
              const trailMat = pa.trailSpheres[ti].material as THREE.MeshBasicMaterial;
              trailMat.opacity = Math.max(0, (0.7 - ti * 0.15) * (1 - trailProgress));
            }
            
            // Pulsing glow on main sphere
            const pulse = 0.9 + Math.sin(age * 0.03) * 0.2;
            pa.mainSphere.scale.setScalar(pulse);
            pa.pointLight.intensity = 1.5 + Math.sin(age * 0.03) * 0.5;
          } else {
            // Fade out after impact
            const fadeProgress = (age - pa.duration) / 200;
            const mainMat = pa.mainSphere.material as THREE.MeshBasicMaterial;
            mainMat.opacity = Math.max(0, 1 - fadeProgress);
            pa.pointLight.intensity = Math.max(0, 4.0 * (1 - fadeProgress));
          }
        }

        // ===== Update Glowing Tracer Lines =====
        for (let i = sceneRef.current.tracerLines.length - 1; i >= 0; i--) {
          const tracer = sceneRef.current.tracerLines[i];
          const age = Date.now() - tracer.startTime;
          const travelProgress = Math.min(1, age / tracer.duration);

          if (!tracer.completed && travelProgress < 1) {
            // Animate: extend the line from source toward target
            // v78.0: Use _tv2 to avoid data race with tooltip _tv1 usage
            _tv2.lerpVectors(tracer.from, tracer.to, easeOutCubic(travelProgress));
            // Add slight arc
            _tv2.y += 0.15 * Math.sin(travelProgress * Math.PI);

            // Update core line geometry
            const corePositions = tracer.coreLine.geometry.attributes.position as THREE.BufferAttribute;
            corePositions.setXYZ(0, tracer.from.x, tracer.from.y, tracer.from.z);
            corePositions.setXYZ(1, _tv2.x, _tv2.y, _tv2.z);
            corePositions.needsUpdate = true;

            // Update glow line geometry
            const glowPositions = tracer.glowLine.geometry.attributes.position as THREE.BufferAttribute;
            glowPositions.setXYZ(0, tracer.from.x, tracer.from.y, tracer.from.z);
            glowPositions.setXYZ(1, _tv2.x, _tv2.y, _tv2.z);
            glowPositions.needsUpdate = true;
          }

          if (travelProgress >= 1 && !tracer.completed) {
            tracer.completed = true;
          }

          // Fade out after travel completes
          if (tracer.completed) {
            const fadeAge = age - tracer.duration;
            const fadeDuration = 200;
            const fadeProgress = Math.min(1, fadeAge / fadeDuration);

            const coreMat = tracer.coreLine.material as THREE.LineBasicMaterial;
            const glowMat = tracer.glowLine.material as THREE.LineBasicMaterial;
            coreMat.opacity = Math.max(0, 1 - fadeProgress);
            glowMat.opacity = Math.max(0, 0.4 * (1 - fadeProgress));

            if (fadeProgress >= 1) {
              // Cleanup
              effectsGroup.remove(tracer.coreLine);
              effectsGroup.remove(tracer.glowLine);
              tracer.coreLine.geometry.dispose();
              (tracer.coreLine.material as THREE.Material).dispose();
              tracer.glowLine.geometry.dispose();
              (tracer.glowLine.material as THREE.Material).dispose();
              // v90.0: swap-with-last instead of splice(i,1) for O(1) removal
              sceneRef.current.tracerLines[i] = sceneRef.current.tracerLines[sceneRef.current.tracerLines.length - 1];
              sceneRef.current.tracerLines.pop();
            }
          }
        }
        
        // ===== Update Explosion Animations =====
        for (let i = sceneRef.current.explosionAnimations.length - 1; i >= 0; i--) {
          const exp = sceneRef.current.explosionAnimations[i];
          const age = Date.now() - exp.startTime;
          const progress = Math.min(1, age / exp.duration);
          
          if (age > exp.duration) {
            for (const obj of exp.objects) {
              effectsGroup.remove(obj);
              if (obj instanceof THREE.Mesh) {
                // Don't dispose shared combat VFX geometries
                if (!_sharedCombatGeoSet.has(obj.geometry)) obj.geometry.dispose();
                (obj.material as THREE.Material).dispose();
              }
            }
            // v90.0: swap-with-last instead of splice(i,1) for O(1) removal
            sceneRef.current.explosionAnimations[i] = sceneRef.current.explosionAnimations[sceneRef.current.explosionAnimations.length - 1];
            sceneRef.current.explosionAnimations.pop();
          } else {
            // Expand particles outward
            for (const p of exp.particles) {
              const pProgress = Math.min(1, age / (exp.duration * 0.8));
              const baseX = exp.position ? exp.position.x : p.mesh.position.x;
              const baseY = exp.position ? exp.position.y : p.mesh.position.y;
              const baseZ = exp.position ? exp.position.z : p.mesh.position.z;
              const grav = p.gravity !== undefined ? p.gravity : 0;
              p.mesh.position.x = baseX + p.velocity.x * pProgress;
              p.mesh.position.y = baseY + p.velocity.y * pProgress + 0.5 * grav * pProgress * pProgress;
              p.mesh.position.z = baseZ + p.velocity.z * pProgress;
              // Scale from 0 to 0.3
              const scale = Math.min(0.3, pProgress * 0.3);
              p.mesh.scale.setScalar(scale);
              // Fade out
              (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - pProgress * pProgress);
            }
            
            // Central flash: scale up and fade
            if (exp.centralFlash) {
              const flashProgress = Math.min(1, age / (exp.duration * 0.4));
              const flashScale = 1.5 * flashProgress;
              exp.centralFlash.scale.setScalar(flashScale);
              (exp.centralFlash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - flashProgress);
            }
            
            // Shockwave ring: expand and fade
            if (exp.shockwave) {
              const swProgress = Math.min(1, age / exp.duration);
              const swScale = 2.5 * swProgress;
              exp.shockwave.scale.setScalar(swScale);
              (exp.shockwave.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - swProgress));
            }
          }
        }
        
        // ===== Update Muzzle Flash Animations =====
        for (let i = sceneRef.current.muzzleFlashAnims.length - 1; i >= 0; i--) {
          const mf = sceneRef.current.muzzleFlashAnims[i];
          const age = Date.now() - mf.startTime;
          const progress = Math.min(1, age / mf.duration);
          
          if (age > mf.duration) {
            for (const obj of mf.objects) {
              effectsGroup.remove(obj);
              if (obj instanceof THREE.Mesh) {
                // Don't dispose shared combat VFX geometries
                if (!_sharedCombatGeoSet.has(obj.geometry)) obj.geometry.dispose();
                (obj.material as THREE.Material).dispose();
              } else if (obj instanceof THREE.PointLight) {
                obj.dispose();
              }
            }
            // v90.0: swap-with-last instead of splice(i,1) for O(1) removal
            sceneRef.current.muzzleFlashAnims[i] = sceneRef.current.muzzleFlashAnims[sceneRef.current.muzzleFlashAnims.length - 1];
            sceneRef.current.muzzleFlashAnims.pop();
          } else {
            // Scale 0 → 0.4 → 0 with a smooth bell curve
            const scaleProgress = Math.sin(progress * Math.PI);
            const sphereScale = 0.4 * scaleProgress;
            mf.sphere.scale.setScalar(sphereScale);
            (mf.sphere.material as THREE.MeshBasicMaterial).opacity = scaleProgress;
            
            // Point light intensity follows the flash
            // v35.0: Guard against null pointLight (replay muzzle flashes may not have one)
            if (mf.pointLight) mf.pointLight.intensity = 3.0 * scaleProgress;
          }
        }
        
        // Update shake animations on defender units
        for (let i = sceneRef.current.shakeTargets.length - 1; i >= 0; i--) {
          const shake = sceneRef.current.shakeTargets[i];
          const shakeAge = (Date.now() - shake.startTime) / 1000;
          if (shakeAge > 0.4) {
            // Reset position
            const mesh = sceneRef.current.unitMeshes.get(shake.unitId);
            if (mesh) {
              mesh.position.copy(shake.originalPos);
            }
            // v90.0: swap-with-last instead of splice(i,1) for O(1) removal
            sceneRef.current.shakeTargets[i] = sceneRef.current.shakeTargets[sceneRef.current.shakeTargets.length - 1];
            sceneRef.current.shakeTargets.pop();
          } else {
            const mesh = sceneRef.current.unitMeshes.get(shake.unitId);
            if (mesh) {
              const intensity = Math.max(0, 1 - shakeAge / 0.4) * 0.05;
              mesh.position.x = shake.originalPos.x + (Math.random() - 0.5) * intensity;
              mesh.position.z = shake.originalPos.z + (Math.random() - 0.5) * intensity;
            }
          }
        }
        
        // ===== Update Camera Shake =====
        if (sceneRef.current.cameraShake) {
          const cs = sceneRef.current.cameraShake;
          const shakeAge = (Date.now() - cs.startTime) / cs.duration;
          if (shakeAge >= 1) {
            sceneRef.current.cameraShake = null;
          }
        }

        // ===== Reinforcement Arrival Detection & Effects =====
        {
          const storeState = useGameStore.getState();
          const currentUnits = storeState.units;
          // v93.0: Reset stale refs when a new game starts (map dimensions change)
          const mapDims = `${gameMap.cells.length}x${gameMap.cells[0]?.length}`;
          if (mapDims !== lastMapHashRef.current) {
            lastMapHashRef.current = mapDims;
            prevUnitIdsRef.current = new Set();
            processedLevelUpIdsRef.current = new Set();
          }
          const currentUnitIds = new Set(currentUnits.filter(u => u.isAlive).map(u => u.id));
          const prevUnitIds = prevUnitIdsRef.current;

          // Detect new units (reinforcements)
          for (const unitId of currentUnitIds) {
            if (!prevUnitIds.has(unitId)) {
              const unit = currentUnits.find(u => u.id === unitId);
              if (unit && unit.isAlive) {
                const pos = cellToWorld(unit.position, _c2w1);
                const cell = gameMap.cells[unit.position.z]?.[unit.position.x];
                const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
                const isRed = unit.faction === 'red';
                const beamColor = isRed ? 0xffb300 : 0x42a5f5;
                const ringColor = isRed ? 0xffc107 : 0x64b5f6;

                // Create beam of light
                const beamHeight = 3.0;
                const beamGeo = new THREE.CylinderGeometry(0.03, 0.12, beamHeight, 12, 1, true);
                const beamMat = new THREE.MeshBasicMaterial({
                  color: beamColor,
                  transparent: true,
                  opacity: 0.9,
                  side: THREE.DoubleSide,
                });
                const beam = new THREE.Mesh(beamGeo, beamMat);
                beam.position.set(pos.x, terrainHeight + beamHeight / 2, pos.z);
                effectsGroup.add(beam);

                // Create expanding ground ring
                const groundRingGeo = new THREE.RingGeometry(0.05, 0.15, 32);
                const groundRingMat = new THREE.MeshBasicMaterial({
                  color: ringColor,
                  transparent: true,
                  opacity: 0.8,
                  side: THREE.DoubleSide,
                });
                const groundRing = new THREE.Mesh(groundRingGeo, groundRingMat);
                groundRing.rotation.x = -Math.PI / 2;
                groundRing.position.set(pos.x, terrainHeight + 0.02, pos.z);
                effectsGroup.add(groundRing);

                // Create particle burst
                const burstParticles: THREE.Mesh[] = [];
                for (let i = 0; i < 20; i++) {
                  const size = 0.03 + Math.random() * 0.04;
                  const pGeo = new THREE.SphereGeometry(size, 4, 4);
                  const pMat = new THREE.MeshBasicMaterial({
                    color: beamColor,
                    transparent: true,
                    opacity: 1.0,
                  });
                  const pMesh = new THREE.Mesh(pGeo, pMat);
                  pMesh.position.set(pos.x, terrainHeight + 0.5 + Math.random() * 0.5, pos.z);
                  pMesh.userData.speed = 1.5 + Math.random() * 1.0;
                  effectsGroup.add(pMesh);
                  burstParticles.push(pMesh);
                }

                const allObjects: THREE.Object3D[] = [beam, groundRing, ...burstParticles];
                effectIdCounter++;
                reinforcementEffectsRef.current.push({
                  id: effectIdCounter,
                  beam,
                  groundRing,
                  particles: burstParticles,
                  startTime: Date.now(),
                  duration: 1500,
                  faction: isRed ? 'red' : 'blue',
                  objects: allObjects,
                });
              }
            }
          }
          prevUnitIdsRef.current = currentUnitIds;
        }

        // ===== Update Reinforcement Arrival Effects =====
        for (let i = reinforcementEffectsRef.current.length - 1; i >= 0; i--) {
          const re = reinforcementEffectsRef.current[i];
          const age = Date.now() - re.startTime;
          const progress = Math.min(1, age / re.duration);

          if (age > re.duration) {
            for (const obj of re.objects) {
              effectsGroup.remove(obj);
              if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                (obj.material as THREE.Material).dispose();
              }
            }
            // v90.0: swap-with-last instead of splice(i,1) for O(1) removal
            reinforcementEffectsRef.current[i] = reinforcementEffectsRef.current[reinforcementEffectsRef.current.length - 1];
            reinforcementEffectsRef.current.pop();
          } else {
            // Beam: fade out
            const beamMat = re.beam.material as THREE.MeshBasicMaterial;
            beamMat.opacity = Math.max(0, 0.9 * (1 - progress * progress));

            // Ground ring: expand and fade
            const ringScale = 1 + progress * 5;
            re.groundRing.scale.setScalar(ringScale);
            const ringMat = re.groundRing.material as THREE.MeshBasicMaterial;
            ringMat.opacity = Math.max(0, 0.8 * (1 - progress));

            // Particles: fly outward and fade
            for (let pi = 0; pi < re.particles.length; pi++) {
              const p = re.particles[pi];
              const angle = (pi / re.particles.length) * Math.PI * 2;
              const speed = p.userData.speed;
              p.position.x += Math.cos(angle) * speed * dt;
              p.position.z += Math.sin(angle) * speed * dt;
              p.position.y += (0.5 + progress * 2) * dt;
              const pMat = p.material as THREE.MeshBasicMaterial;
              pMat.opacity = Math.max(0, 1 - progress * progress);
              const pScale = Math.max(0.1, 1 - progress * 0.7);
              p.scale.setScalar(pScale);
            }
          }
        }

        // ===== v27.0: Update Death Animations =====
        for (let i = deathAnimationsRef.current.length - 1; i >= 0; i--) {
          const da = deathAnimationsRef.current[i];
          const age = Date.now() - da.startTime;
          const progress = Math.min(1, age / da.duration);

          if (age > da.duration) {
            effectsGroup.remove(da.mesh);
            // Dispose geometries and materials
            da.mesh.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (child.material instanceof THREE.Material) child.material.dispose();
              }
            });
            // v90.0: swap-with-last instead of splice(i,1) for O(1) removal
            deathAnimationsRef.current[i] = deathAnimationsRef.current[deathAnimationsRef.current.length - 1];
            deathAnimationsRef.current.pop();
          } else {
            // v92.0: Death animation — tilt phase (first 0.3s), then fade+sink
            const tiltPhaseEnd = 300 / da.duration; // 0.3s / total duration
            let opacity: number;
            let sinkY: number;
            let scale: number;

            if (progress < tiltPhaseEnd) {
              // Tilt phase: rotate 45 degrees on Z axis, no sinking yet
              const tiltProgress = progress / tiltPhaseEnd;
              const tiltAngle = tiltProgress * (Math.PI / 4); // 0 → 45 degrees
              da.mesh.rotation.z = tiltAngle;
              da.mesh.rotation.x = tiltProgress * (Math.PI / 8); // slight forward tilt
              opacity = 1.0;
              sinkY = 0;
              scale = 1.0;
            } else {
              // Fade + sink phase: keep max tilt, then fade out and sink
              const fadeProgress = (progress - tiltPhaseEnd) / (1 - tiltPhaseEnd);
              da.mesh.rotation.z = Math.PI / 4; // maintain 45 degree tilt
              da.mesh.rotation.x = Math.PI / 8;
              opacity = Math.max(0, 1 - fadeProgress * fadeProgress);
              sinkY = -fadeProgress * 0.3;
              scale = Math.max(0.01, 1 - fadeProgress * 0.5);
            }

            da.mesh.position.y = da.startPos.y + sinkY;
            da.mesh.scale.setScalar(scale);
            da.mesh.traverse((child) => {
              if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
                child.material.opacity = opacity;
              }
            });
          }
        }

        // ===== Level Up Notification Detection & Effects =====
        {
          const storeState = useGameStore.getState();
          const notifications = storeState.levelUpNotifications || [];
          for (const notif of notifications) {
            if (processedLevelUpIdsRef.current.has(notif.id)) continue;
            processedLevelUpIdsRef.current.add(notif.id);

            // Find the unit position
            const unit = storeState.units.find(u => u.id === notif.unitId);
            if (!unit) continue;

            const pos = cellToWorld(unit.position, _c2w1);
            const cell = gameMap.cells[unit.position.z]?.[unit.position.x];
            const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

            // Create spiral particles rising upward
            const spiralParticles: LevelUpEffect['spiralParticles'] = [];
            for (let i = 0; i < 24; i++) {
              const size = 0.025 + Math.random() * 0.03;
              const sGeo = new THREE.SphereGeometry(size, 4, 4);
              const sMat = new THREE.MeshBasicMaterial({
                color: 0xffd700,
                transparent: true,
                opacity: 1.0,
              });
              const sMesh = new THREE.Mesh(sGeo, sMat);
              const baseAngle = (i / 24) * Math.PI * 2;
              sMesh.position.set(
                pos.x + Math.cos(baseAngle) * 0.3,
                terrainHeight + 0.1,
                pos.z + Math.sin(baseAngle) * 0.3
              );
              effectsGroup.add(sMesh);
              spiralParticles.push({
                mesh: sMesh,
                angle: baseAngle,
                radius: 0.3 + Math.random() * 0.1,
                baseY: terrainHeight + 0.1,
                speed: 2.0 + Math.random() * 1.5,
              });
            }

            // Bright flash at unit position
            const flashGeo = new THREE.SphereGeometry(0.5, 12, 8);
            const flashMat = new THREE.MeshBasicMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0.9,
            });
            const flash = new THREE.Mesh(flashGeo, flashMat);
            flash.position.set(pos.x, terrainHeight + 0.4, pos.z);
            effectsGroup.add(flash);

            // Floating "+1 LEVEL" text using canvas texture sprite
            const textCanvas = document.createElement('canvas');
            textCanvas.width = 256;
            textCanvas.height = 64;
            const textCtx = textCanvas.getContext('2d')!;
            textCtx.clearRect(0, 0, 256, 64);
            textCtx.font = 'bold 36px sans-serif';
            textCtx.textAlign = 'center';
            textCtx.textBaseline = 'middle';
            // Gold text with shadow
            textCtx.shadowColor = 'rgba(0,0,0,0.7)';
            textCtx.shadowBlur = 6;
            textCtx.fillStyle = '#ffd700';
            textCtx.fillText('+1 LEVEL', 128, 32);
            const textTexture = new THREE.CanvasTexture(textCanvas);
            const textSpriteMat = new THREE.SpriteMaterial({
              map: textTexture,
              transparent: true,
              opacity: 1.0,
              depthTest: false,
            });
            const textSprite = new THREE.Sprite(textSpriteMat);
            textSprite.scale.set(0.8, 0.2, 1);
            textSprite.position.set(pos.x, terrainHeight + 1.0, pos.z);
            effectsGroup.add(textSprite);

            const allObj: THREE.Object3D[] = [flash, textSprite, ...spiralParticles.map(sp => sp.mesh)];
            effectIdCounter++;
            levelUpEffectsRef.current.push({
              id: effectIdCounter,
              spiralParticles,
              flash,
              textSprite,
              startTime: Date.now(),
              duration: 2000,
              objects: allObj,
            });

            // v89.0: Golden screen flash on level-up
            // v93.0: Track both timeout IDs to prevent unmount race condition
            if (screenFlashTimeoutRef.current) clearTimeout(screenFlashTimeoutRef.current);
            if (sceneRef.current._screenFlashInnerTimer) clearTimeout(sceneRef.current._screenFlashInnerTimer);
            setScreenFlash({ color: 'rgba(255, 215, 0, 0.8)', opacity: 0.35 });
            const lvlFadeTimeout = setTimeout(() => {
              setScreenFlash(prev => prev ? { ...prev, opacity: 0 } : null);
              const lvlRemoveTimeout = setTimeout(() => {
                sceneRef.current && (sceneRef.current._screenFlashInnerTimer = null);
                screenFlashTimeoutRef.current = null;
                setScreenFlash(null);
              }, 400);
              screenFlashTimeoutRef.current = lvlRemoveTimeout;
              if (sceneRef.current) sceneRef.current._screenFlashInnerTimer = lvlRemoveTimeout;
            }, 200);
            screenFlashTimeoutRef.current = lvlFadeTimeout;
          }
        }

        // ===== Update Level Up Effects =====
        for (let i = levelUpEffectsRef.current.length - 1; i >= 0; i--) {
          const lu = levelUpEffectsRef.current[i];
          const age = Date.now() - lu.startTime;
          const progress = Math.min(1, age / lu.duration);

          if (age > lu.duration) {
            for (const obj of lu.objects) {
              effectsGroup.remove(obj);
              if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                (obj.material as THREE.Material).dispose();
              } else if (obj instanceof THREE.Sprite) {
                (obj.material as THREE.Material).dispose();
                if ((obj.material as THREE.SpriteMaterial).map) {
                  (obj.material as THREE.SpriteMaterial).map!.dispose();
                }
              }
            }
            // v90.0: swap-with-last instead of splice(i,1) for O(1) removal
            levelUpEffectsRef.current[i] = levelUpEffectsRef.current[levelUpEffectsRef.current.length - 1];
            levelUpEffectsRef.current.pop();
          } else {
            // Flash: scale up quickly and fade
            const flashProgress = Math.min(1, age / 300);
            const flashScale = 0.5 + flashProgress * 1.5;
            lu.flash.scale.setScalar(flashScale);
            const flashMat = lu.flash.material as THREE.MeshBasicMaterial;
            flashMat.opacity = Math.max(0, 0.9 * (1 - flashProgress));

            // Spiral particles: rotate and rise
            for (const sp of lu.spiralParticles) {
              sp.angle += sp.speed * dt * 3;
              const currentY = sp.baseY + progress * 1.5;
              sp.mesh.position.x += (Math.cos(sp.angle) * sp.radius - (sp.mesh.position.x - lu.flash.position.x)) * dt * 8;
              sp.mesh.position.z += (Math.sin(sp.angle) * sp.radius - (sp.mesh.position.z - lu.flash.position.z)) * dt * 8;
              sp.mesh.position.y += (currentY - sp.mesh.position.y) * dt * 5;
              const sMat = sp.mesh.material as THREE.MeshBasicMaterial;
              sMat.opacity = Math.max(0, 1 - progress * progress);
              const sScale = Math.max(0.1, 1 - progress * 0.5);
              sp.mesh.scale.setScalar(sScale);
            }

            // Text sprite: rise and fade
            const textRise = progress * 1.5;
            lu.textSprite.position.y = lu.flash.position.y + 0.8 + textRise;
            const textMat = lu.textSprite.material as THREE.SpriteMaterial;
            textMat.opacity = Math.max(0, 1 - progress * progress);
          }
        }

        // ===== v93.0: Floating 3D Damage Number Sprites =====
        {
          const storePopups = useGameStore.getState().damagePopups || [];
          const popupCount = storePopups.length;
          const lastPopupCount = sceneRef.current.lastDamagePopupCount;

          // Detect new damage popups and create 3D sprites
          if (popupCount > lastPopupCount) {
            const newPopups = storePopups.slice(lastPopupCount);
            for (const popup of newPopups) {
              const wp = cellToWorld({ x: popup.x, z: popup.z });
              const cell = gameMap.cells[popup.z]?.[popup.x];
              const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

              // Determine color based on popup type
              const isHeal = popup.type === 'heal';
              const isCounter = popup.type === 'counter';
              const isKill = popup.type === 'kill';
              const isXp = popup.type === 'xp';
              const isLevelUp = popup.type === 'levelup';
              const isAmmo = popup.type === 'ammo';
              const isMorale = popup.type === 'morale';
              const isResupply = popup.type === 'resupply';

              // Color logic: red for damage, green for heal, yellow for counter/critical, blue for ammo/resupply, purple for morale
              let textColor = '#ff5252'; // default damage red
              if (isHeal) textColor = '#4caf50';
              else if (isCounter) textColor = '#fbbf24';
              else if (isKill) textColor = '#ff1744';
              else if (isXp) textColor = '#facc15';
              else if (isLevelUp) textColor = '#fbbf24';
              else if (isAmmo || isResupply) textColor = '#42a5f5';
              else if (isMorale) textColor = '#ab47bc';
              else {
                // Damage severity color coding
                const absVal = Math.abs(popup.value);
                if (absVal >= 50) textColor = '#ff1744';
                else if (absVal >= 25) textColor = '#ff6d00';
                else if (absVal >= 10) textColor = '#ffab00';
              }

              // Build display text
              let displayText: string;
              if (isKill) displayText = `\u2620 -${popup.value}`;
              else if (isLevelUp) displayText = `\u2B06 LV.${popup.value}`;
              else if (isXp) displayText = `+${popup.value} XP`;
              else if (isAmmo) displayText = `+${popup.value} AMMO`;
              else if (isMorale) displayText = `+${popup.value} MORALE`;
              else if (isResupply) displayText = '+AMMO';
              else if (isHeal) displayText = `+${popup.value}`;
              else if (isCounter) displayText = `-${popup.value}`;
              else displayText = `-${popup.value}`;

              // Font size: larger for kills, smaller for ammo/morale/resupply
              const fontSize = isKill ? 40 : isLevelUp ? 32 : (isAmmo || isMorale || isResupply) ? 22 : 30;

              // Render text to canvas using _sharedLabelCanvas pattern
              const canvas = _sharedLabelCanvas || document.createElement('canvas');
              const cw = 256;
              const ch = 64;
              canvas.width = cw;
              canvas.height = ch;
              const ctx = _sharedLabelCtx || canvas.getContext('2d')!;
              ctx.clearRect(0, 0, cw, ch);
              ctx.font = `bold ${fontSize}px sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              // Dark outline for readability
              ctx.shadowColor = 'rgba(0,0,0,0.8)';
              ctx.shadowBlur = 4;
              ctx.strokeStyle = 'rgba(0,0,0,0.6)';
              ctx.lineWidth = 3;
              ctx.strokeText(displayText, cw / 2, ch / 2);
              // Fill with color
              ctx.fillStyle = textColor;
              ctx.fillText(displayText, cw / 2, ch / 2);
              ctx.shadowBlur = 0;

              // Clone canvas for safe THREE.CanvasTexture creation (avoids shared buffer race)
              const clonedCanvas = _cloneCanvas(canvas, cw, ch);
              const texture = new THREE.CanvasTexture(clonedCanvas);
              const spriteMat = new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 1.0,
                depthTest: false,
              });
              const sprite = new THREE.Sprite(spriteMat);
              sprite.scale.set(0.8, 0.2, 1);
              const startY = terrainHeight + 1.2; // start above the unit
              sprite.position.set(wp.x, startY, wp.z);
              effectsGroup.add(sprite);

              const duration = isKill ? 2000 : 1500;
              const riseDistance = isKill ? 2.0 : 1.5;
              effectIdCounter++;
              floatingDamageSpritesRef.current.push({
                id: effectIdCounter,
                sprite,
                startTime: Date.now(),
                duration,
                startY,
                riseDistance,
                popupType: popup.type,
                objects: [sprite],
              });
            }
            sceneRef.current.lastDamagePopupCount = popupCount;
          }
        }

        // Update floating damage sprites (rise + fade)
        for (let i = floatingDamageSpritesRef.current.length - 1; i >= 0; i--) {
          const fds = floatingDamageSpritesRef.current[i];
          const age = Date.now() - fds.startTime;
          const progress = Math.min(1, age / fds.duration);

          if (age > fds.duration) {
            // Remove sprite from scene and dispose
            for (const obj of fds.objects) {
              effectsGroup.remove(obj);
              if (obj instanceof THREE.Sprite) {
                const mat = obj.material as THREE.SpriteMaterial;
                mat.dispose();
                if (mat.map) mat.map.dispose();
              }
            }
            // v90.0: swap-with-last for O(1) removal
            floatingDamageSpritesRef.current[i] = floatingDamageSpritesRef.current[floatingDamageSpritesRef.current.length - 1];
            floatingDamageSpritesRef.current.pop();
          } else {
            // Rise upward
            fds.sprite.position.y = fds.startY + progress * fds.riseDistance;
            // Fade opacity
            const mat = fds.sprite.material as THREE.SpriteMaterial;
            mat.opacity = Math.max(0, 1 - progress);
            // Kill popup: slight scale pulse at start
            if (fds.popupType === 'kill' && progress < 0.2) {
              const pulseScale = 1 + Math.sin(progress / 0.2 * Math.PI) * 0.3;
              fds.sprite.scale.set(0.8 * pulseScale, 0.2 * pulseScale, 1);
            }
          }
        }

        // [REMOVED] Capture Point Pulse Effect per user request
      }

      // ===== Movement Path Preview (glowing animated line with arrows) =====
      if (sceneRef.current && liveSelectedUnit && livePhase === 'moveUnit' && !isPanning) {
        const { pathGroup: pg } = sceneRef.current;
        
        raycaster.setFromCamera(mouse, camera);
        // v51.0: Use pre-flattened cellMeshes instead of per-frame .flat() allocation
        const allCellMeshes = sceneRef.current.flatCellMeshes;
        const cellIntersects = raycaster.intersectObjects(allCellMeshes);
        
        // Compute path key from hovered cell to detect actual changes
        let pathKey: string | null = null;
        let path: Position[] | null = null;
        if (cellIntersects.length > 0) {
          const hoveredPos = cellIntersects[0].object.userData.cellPos as Position;
          if (hoveredPos && liveMovablePositions.some(p => p.x === hoveredPos.x && p.z === hoveredPos.z)) {
            const foundPath = findBFSPath(
              liveSelectedUnit.position,
              hoveredPos,
              liveMovablePositions,
              gameMap.cells as { terrain: string; unit: any }[][],
              liveSelectedUnit.type
            );
            if (foundPath.length > 1) {
              path = foundPath;
              pathKey = foundPath.map(p => `${p.x},${p.z}`).join('|');
            }
          }
        }
        
        // Only rebuild when path actually changes (new hover or different destination)
        if (pathKey !== sceneRef.current.prevPathKey) {
          // Dispose previous path meshes
          while (pg.children.length > 0) {
            const child = pg.children[0];
            pg.remove(child);
            if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
              child.geometry.dispose();
              (child.material as THREE.Material).dispose();
            }
          }
          sceneRef.current.prevPathKey = pathKey;
          
          if (path && pathKey) {
            // Draw glowing animated line along the path
            const linePoints: THREE.Vector3[] = [];
            for (let i = 0; i < path.length; i++) {
              const pos = path[i];
              const worldPos = cellToWorld(pos, _c2w1);
              const cell = gameMap.cells[pos.z]?.[pos.x];
              const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
              linePoints.push(new THREE.Vector3(worldPos.x, terrainHeight + 0.08, worldPos.z));
            }
            
            // Main glowing line (green for move)
            const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
            const lineMat = new THREE.LineBasicMaterial({
              color: 0x4caf50,
              transparent: true,
              opacity: 0.7,
              linewidth: 2,
            });
            const line = new THREE.Line(lineGeo, lineMat);
            pg.add(line);
            
            // Glow effect line (wider, more transparent)
            const glowGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
            const glowMat = new THREE.LineBasicMaterial({
              color: 0x81c784,
              transparent: true,
              opacity: 0.3,
              linewidth: 1,
            });
            const glowLine = new THREE.Line(glowGeo, glowMat);
            pg.add(glowLine);
            
            // Arrow indicators along the path showing direction
            for (let i = 0; i < path.length - 1; i++) {
              const from = path[i];
              const to = path[i + 1];
              const fromWorld = cellToWorld(from, _c2w1);
              const toWorld = cellToWorld(to, _c2w2);
              const fromCell = gameMap.cells[from.z]?.[from.x];
              const toCell = gameMap.cells[to.z]?.[to.x];
              const fromH = fromCell ? TERRAIN_CONFIGS[fromCell.terrain].stats.height * CELL_SIZE : 0;
              const toH = toCell ? TERRAIN_CONFIGS[toCell.terrain].stats.height * CELL_SIZE : 0;
              
              const midX = (fromWorld.x + toWorld.x) / 2;
              const midZ = (fromWorld.z + toWorld.z) / 2;
              const midH = (fromH + toH) / 2 + 0.08;
              
              // Direction
              const dx = to.x - from.x;
              const dz = to.z - from.z;
              const angle = Math.atan2(dx, dz);
              
              // Small arrow cone
              const arrowGeo = new THREE.ConeGeometry(0.06, 0.12, 4);
              const arrowMat = new THREE.MeshBasicMaterial({
                color: 0x66bb6a,
                transparent: true,
                opacity: 0.7 + Math.sin(elapsed * 3 + i) * 0.2,
              });
              const arrow = new THREE.Mesh(arrowGeo, arrowMat);
              arrow.position.set(midX, midH, midZ);
              arrow.rotation.x = Math.PI / 2;
              arrow.rotation.z = -angle;
              pg.add(arrow);
            }
            
            // Path endpoint markers (green for move, orange for attack direction)
            for (let i = 1; i < path.length; i++) {
              const pos = path[i];
              const worldPos = cellToWorld(pos, _c2w1);
              const cell = gameMap.cells[pos.z]?.[pos.x];
              const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
              
              // v59.0: Check if endpoint is within effective attack range of an enemy
              const pathEffRange = liveSelectedUnit.stats.attackRange + (liveSelectedUnit.abilities?.find(a => a.effect?.attackRangeBonus)?.effect?.attackRangeBonus ?? 0);
              const isNearEnemy = i === path.length - 1 && liveAttackablePositions.some(ap =>
                Math.abs(ap.x - pos.x) + Math.abs(ap.z - pos.z) <= pathEffRange
              );
              const dotColor = isNearEnemy ? 0xff9800 : 0x4caf50;
              
              const dotGeo = new THREE.SphereGeometry(0.05, 6, 4);
              const dotMat = new THREE.MeshBasicMaterial({ 
                color: dotColor, 
                transparent: true, 
                opacity: 0.6 + Math.sin(elapsed * 3 + i * 0.5) * 0.3
              });
              const dot = new THREE.Mesh(dotGeo, dotMat);
              dot.position.set(worldPos.x, terrainHeight + 0.08, worldPos.z);
              pg.add(dot);
            }
          }
        }
        // else: path hasn't changed — skip rebuild, but still animate pulse
        // v84.0: Per-frame path line opacity pulse (was static — only rebuilt on pathKey change)
        if (pg.children.length >= 2) {
          const pathLineMat = (pg.children[0] as THREE.Line).material as THREE.LineBasicMaterial;
          const pathGlowMat = (pg.children[1] as THREE.Line).material as THREE.LineBasicMaterial;
          pathLineMat.opacity = 0.5 + Math.sin(performance.now() * 0.003) * 0.3;
          pathGlowMat.opacity = 0.2 + Math.sin(performance.now() * 0.003) * 0.15;
        }
      } else if (sceneRef.current && sceneRef.current.pathGroup) {
        // Clear path when not in move phase
        const { pathGroup: pg } = sceneRef.current;
        while (pg.children.length > 0) {
          const child = pg.children[0];
          pg.remove(child);
          if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        }
        sceneRef.current.prevPathKey = null;
      }

      // ===== Attack Range Indicator + Damage Estimate =====
      if (sceneRef.current && liveSelectedUnit && livePhase === 'attackUnit') {
        const { rangeGroup: rg } = sceneRef.current;
        const unitId = liveSelectedUnit.id;
        
        // v55.0: Rebuild range meshes only when selected unit changes
        if (sceneRef.current.rangeSelectedUnitId !== unitId) {
          // Dispose previous meshes if any
          if (sceneRef.current.rangeMeshes) {
            rg.remove(sceneRef.current.rangeMeshes.outerRing);
            rg.remove(sceneRef.current.rangeMeshes.innerRing);
            if (sceneRef.current.rangeOuterGeo) sceneRef.current.rangeOuterGeo.dispose();
            if (sceneRef.current.rangeInnerGeo) sceneRef.current.rangeInnerGeo.dispose();
            (sceneRef.current.rangeMeshes.outerRing.material as THREE.Material).dispose();
            (sceneRef.current.rangeMeshes.innerRing.material as THREE.Material).dispose();
          }
          
          // v59.0: Use effective attack range (includes hero extended_range_passive)
          const effectiveRangeBonus = liveSelectedUnit.abilities?.find(a => a.effect?.attackRangeBonus)?.effect?.attackRangeBonus ?? 0;
          const rangeRadius = (liveSelectedUnit.stats.attackRange + effectiveRangeBonus) * CELL_TOTAL;
          const outerGeo = new THREE.RingGeometry(
            Math.max(0.01, rangeRadius - 0.05), 
            rangeRadius, 
            48
          );
          const outerMat = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
          });
          const outerRing = new THREE.Mesh(outerGeo, outerMat);
          outerRing.rotation.x = -Math.PI / 2;
          
          const innerGeo = new THREE.RingGeometry(
            Math.max(0.01, CELL_TOTAL - 0.05),
            CELL_TOTAL,
            48
          );
          const innerMat = new THREE.MeshBasicMaterial({
            color: 0xff8888,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
          });
          const innerRing = new THREE.Mesh(innerGeo, innerMat);
          innerRing.rotation.x = -Math.PI / 2;
          
          // [DISABLED] rg.add(outerRing); // Removed red outer ring per user request
          rg.add(innerRing);
          
          sceneRef.current.rangeMeshes = { outerRing, innerRing };
          sceneRef.current.rangeSelectedUnitId = unitId;
          sceneRef.current.rangeOuterGeo = outerGeo;
          sceneRef.current.rangeInnerGeo = innerGeo;
        }
        
        // v55.0: Per-frame: only update opacity (pulse) and position
        const { rangeMeshes } = sceneRef.current;
        const worldPos = cellToWorld(liveSelectedUnit.position, _c2w1);
        const cell = gameMap.cells[liveSelectedUnit.position.z]?.[liveSelectedUnit.position.x];
        const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
        
        // [DISABLED] outerRing opacity/position update - red outer ring removed per user request
        // (rangeMeshes!.outerRing.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(elapsed * 2) * 0.05;
        // rangeMeshes!.outerRing.position.set(worldPos.x, terrainHeight + 0.03, worldPos.z);
        rangeMeshes!.innerRing.position.set(worldPos.x, terrainHeight + 0.03, worldPos.z);

        // Check if hovering over an enemy unit in attack range
        if (!isPanning) {
          raycaster.setFromCamera(mouse, camera);
          const allCellMeshes = sceneRef.current.flatCellMeshes;
          const cellIntersects = raycaster.intersectObjects(allCellMeshes);
          
          if (cellIntersects.length > 0) {
            const hoveredPos = cellIntersects[0].object.userData.cellPos as Position;
            if (hoveredPos && liveAttackablePositions.some(p => p.x === hoveredPos.x && p.z === hoveredPos.z)) {
              // v90.0: Use liveUnitMap with post-lookup filters instead of .find() fallback
              let enemy = liveUnitMap.get(`${hoveredPos.x},${hoveredPos.z}`);
              if (!enemy || !enemy.isAlive || (liveSelectedUnit && enemy.faction === liveSelectedUnit.faction)) enemy = undefined;
              if (enemy && liveSelectedUnit) {
                const enemyCell = gameMap.cells[enemy.position.z]?.[enemy.position.x];
                const est = estimateDamage(liveSelectedUnit, enemy, enemyCell, !liveSelectedUnit.canMove, liveState.currentWeather, liveUnits);
                
                // Calculate counterattack damage estimate
                let counterMin: number | undefined;
                let counterMax: number | undefined;
                let counterReduction: number | undefined;
                const counterDist = Math.abs(enemy.position.x - liveSelectedUnit.position.x) + Math.abs(enemy.position.z - liveSelectedUnit.position.z);
                // v59.0: Use effective attack range (includes hero extended_range_passive)
                const enemyRangeBonus = enemy.abilities?.find(a => a.effect?.attackRangeBonus)?.effect?.attackRangeBonus ?? 0;
                const enemyEffectiveRange = enemy.stats.attackRange + enemyRangeBonus;
                if (counterDist <= enemyEffectiveRange) {
                  const attackerCell = gameMap.cells[liveSelectedUnit.position.z]?.[liveSelectedUnit.position.x];
                  const counterEst = estimateDamage(enemy, liveSelectedUnit, attackerCell, false, liveCurrentWeather, liveUnits);
                  // Counterattack is at 60% power
                  counterMin = Math.max(1, Math.round(counterEst.min * 0.6));
                  counterMax = Math.max(1, Math.round(counterEst.max * 0.6));
                  counterReduction = counterEst.reduction;
                }
                
                // Project to screen coordinates
                const enemyWorldPos = cellToWorld(enemy.position, _c2w1);
                const enemyTerrainHeight = enemyCell ? TERRAIN_CONFIGS[enemyCell.terrain].stats.height * CELL_SIZE : 0;
                _tv1.set(enemyWorldPos.x, enemyTerrainHeight + 0.8, enemyWorldPos.z);
                _tv1.project(camera);

                const rect = getCachedRect();
                const dmgScreenX = (_tv1.x * 0.5 + 0.5) * rect.width + rect.left;
                const dmgScreenY = (-_tv1.y * 0.5 + 0.5) * rect.height + rect.top;

                const damageKey = `${est.min},${est.max},${counterMin},${counterMax},${Math.round(dmgScreenX)},${Math.round(dmgScreenY)}`;
                if (damageKey !== prevDamageEstRef.current) {
                  prevDamageEstRef.current = damageKey;
                  setDamageEstimate({ min: est.min, max: est.max, counterMin, counterMax, x: dmgScreenX, y: dmgScreenY, reduction: est.reduction, isFlanking: est.isFlanking, counterReduction });
                }
              } else {
                if (prevDamageEstRef.current !== null) { prevDamageEstRef.current = null; setDamageEstimate(null); }
              }
            } else {
              if (prevDamageEstRef.current !== null) { prevDamageEstRef.current = null; setDamageEstimate(null); }
            }
          } else {
            if (prevDamageEstRef.current !== null) { prevDamageEstRef.current = null; setDamageEstimate(null); }
          }
        }
      } else if (sceneRef.current && sceneRef.current.rangeGroup) {
        // v55.0: Clear range when not in attack phase (remove + dispose cached meshes)
        const { rangeGroup: rg } = sceneRef.current;
        if (sceneRef.current.rangeMeshes) {
          rg.remove(sceneRef.current.rangeMeshes.outerRing);
          rg.remove(sceneRef.current.rangeMeshes.innerRing);
          if (sceneRef.current.rangeOuterGeo) sceneRef.current.rangeOuterGeo.dispose();
          if (sceneRef.current.rangeInnerGeo) sceneRef.current.rangeInnerGeo.dispose();
          (sceneRef.current.rangeMeshes.outerRing.material as THREE.Material).dispose();
          (sceneRef.current.rangeMeshes.innerRing.material as THREE.Material).dispose();
          sceneRef.current.rangeMeshes = null;
          sceneRef.current.rangeSelectedUnitId = null;
        }
        if (prevDamageEstRef.current !== null) { prevDamageEstRef.current = null; setDamageEstimate(null); }
      }

      // ===== Counter-Attack Danger Zone Overlay =====
      // Shows where the hovered enemy can counter-attack from (orange translucent overlay)
      // v55.0: Only rebuilds when hoveredCell actually changes (was rebuilding every frame)
      if (sceneRef.current && liveSelectedUnit && livePhase === 'attackUnit') {
        const { dangerZoneGroup: dzg } = sceneRef.current;

        const hoveredCell = sceneRef.current.hoveredCell;
        // Compute cache key from hovered cell + selected unit position
        const dangerKey = hoveredCell
          ? `${hoveredCell.x},${hoveredCell.z}|${liveSelectedUnit.position.x},${liveSelectedUnit.position.z}`
          : '__none__';

        if (dangerKey !== sceneRef.current.prevDangerHoverKey) {
          // v55.0: Hovered cell changed — dispose old meshes and rebuild
          sceneRef.current.prevDangerHoverKey = dangerKey;

          // v59.0: Dispose previous danger zone meshes (geometry + material)
          // v75.0: Dispose shared geo/mat from previous rebuild (stored on sceneRef)
          const prevDzGeo = (dzg as any)._sharedDzGeo as THREE.BufferGeometry | undefined;
          const prevDzMat = (dzg as any)._sharedDzMat as THREE.Material | undefined;
          if (prevDzGeo) prevDzGeo.dispose();
          if (prevDzMat) prevDzMat.dispose();
          while (dzg.children.length > 0) {
            const child = dzg.children[0];
            dzg.remove(child);
            // v75.0: Don't dispose per-child — shared resources handled above
            // Attacker alert material (non-shared) still needs disposal
            if (child instanceof THREE.Mesh && child.material !== prevDzMat) {
              (child.material as THREE.Material).dispose();
            }
          }

          // Use liveAttackablePositions from outer scope (no shadowing)
          if (hoveredCell && liveAttackablePositions.some(p => p.x === hoveredCell.x && p.z === hoveredCell.z)) {
            // Find the enemy unit at the hovered cell
            // v90.0: Use liveUnitMap with post-lookup filters instead of .find() fallback
            let enemy = liveUnitMap.get(`${hoveredCell.x},${hoveredCell.z}`);
            if (!enemy || !enemy.isAlive || enemy.faction === liveSelectedUnit.faction) enemy = undefined;

            if (enemy) {
              const enemyRange = getEnemyAttackRange(enemy);
              const enemyPos = enemy.position;

              dzg.visible = true;

              // Shared geometry for all danger zone cells
              const dzCellGeo = new THREE.PlaneGeometry(0.88, 0.88);
              const dzCellMat = new THREE.MeshBasicMaterial({
                color: 0xf97316,
                transparent: true,
                opacity: 0.12,
                depthWrite: false,
                side: THREE.DoubleSide,
              });

              // Highlight the attacker's current position more brightly
              const attackerDist = Math.abs(liveSelectedUnit.position.x - enemyPos.x) + Math.abs(liveSelectedUnit.position.z - enemyPos.z);

              for (let dz = -enemyRange; dz <= enemyRange; dz++) {
                for (let dx = -enemyRange; dx <= enemyRange; dx++) {
                  const manhattan = Math.abs(dx) + Math.abs(dz);
                  if (manhattan > enemyRange || manhattan === 0) continue;

                  const cx = enemyPos.x + dx;
                  const cz = enemyPos.z + dz;

                  // Bounds check
                  if (cx < 0 || cx >= MAP_WIDTH || cz < 0 || cz >= MAP_HEIGHT) continue;

                  const worldPos = cellToWorld({ x: cx, z: cz }, _c2w1);
                  const cell = gameMap.cells[cz]?.[cx];
                  const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

                  // Check if this is the attacker's position (highlight more)
                  const isAttackerCell = (cx === liveSelectedUnit.position.x && cz === liveSelectedUnit.position.z);

                  // Create individual material for attacker position highlight
                  let mesh: THREE.Mesh;
                  if (isAttackerCell && attackerDist <= enemyRange) {
                    const alertMat = new THREE.MeshBasicMaterial({
                      color: 0xff4444,
                      transparent: true,
                      opacity: 0.22,
                      depthWrite: false,
                      side: THREE.DoubleSide,
                    });
                    mesh = new THREE.Mesh(dzCellGeo, alertMat);
                  } else {
                    mesh = new THREE.Mesh(dzCellGeo, dzCellMat);
                  }

                  mesh.rotation.x = -Math.PI / 2;
                  mesh.position.set(worldPos.x, terrainHeight + 0.015, worldPos.z);
                  dzg.add(mesh);
                }
              }

              // v59.0: Don't dispose shared geo/mat — meshes are still in scene using them.
              // v75.0: Store shared refs for proper cleanup on next rebuild
              (dzg as any)._sharedDzGeo = dzCellGeo;
              (dzg as any)._sharedDzMat = dzCellMat;
              // dzCellMat.dispose();
            } else {
              dzg.visible = false;
            }
          } else {
            dzg.visible = false;
          }
        }
        // v55.0: If dangerKey unchanged, the existing meshes are still valid — do nothing
      } else if (sceneRef.current && sceneRef.current.dangerZoneGroup) {
        // Clear danger zone when not in attack phase
        const { dangerZoneGroup: dzg } = sceneRef.current;
        while (dzg.children.length > 0) {
          const child = dzg.children[0];
          dzg.remove(child);
          if (child instanceof THREE.Mesh) {
            (child.material as THREE.Material).dispose();
            child.geometry.dispose();
          }
        }
        dzg.visible = false;
        sceneRef.current.prevDangerHoverKey = null;
      }

      // ===== Particle Update =====
      particleManager.update(dt);

      // ===== Panicked unit shaking animation =====
      // v40.0: Use stored original position to avoid accumulating drift
      if (sceneRef.current) {
        const { unitGroup } = sceneRef.current;
        unitGroup.children.forEach(child => {
          if (child.userData.isPanicked) {
            const origX = child.userData.panicOrigX ?? child.position.x;
            const origZ = child.userData.panicOrigZ ?? child.position.z;
            if (child.userData.panicOrigX === undefined) {
              child.userData.panicOrigX = child.position.x;
              child.userData.panicOrigZ = child.position.z;
            }
            const offset = child.userData.panicOffset + elapsed * 20;
            child.position.x = origX + Math.sin(offset) * 0.003;
            child.position.z = origZ + Math.cos(offset * 1.3) * 0.003;
          }
        });
      }

      // ===== Weather Particle Update & Lighting Transitions =====
      if (sceneRef.current) {
        const wp = sceneRef.current.weatherPoints;
        const posArr = sceneRef.current.weatherParticlePositions;
        const velArr = sceneRef.current.weatherParticleVelocities;
        const offArr = sceneRef.current.weatherParticleOffsets;
        const yVelArr = sceneRef.current.weatherParticleYVelocities;
        const fogPlane = sceneRef.current.weatherFogPlane;
        const sandFogPlane = sceneRef.current.weatherSandFogPlane;
        const rainLines = sceneRef.current.weatherRainLines;
        const driftFogPlanes = sceneRef.current.weatherDriftFogPlanes;
        const { ambientLight, directionalLight, hemisphereLight } = sceneRef.current;

        // --- Smooth lighting transition ---
        const lt = sceneRef.current.weatherLightTransition;
        if (lt) {
          const progress = Math.min(1, (Date.now() - lt.startTime) / lt.duration);
          const t = easeOutCubic(progress);

          ambientLight.intensity = lt.fromAmbientIntensity + (lt.toAmbientIntensity - lt.fromAmbientIntensity) * t;
          ambientLight.color.lerpColors(lt.fromAmbientColor, lt.toAmbientColor, t);
          directionalLight.intensity = lt.fromDirIntensity + (lt.toDirIntensity - lt.fromDirIntensity) * t;
          directionalLight.color.lerpColors(lt.fromDirColor, lt.toDirColor, t);
          hemisphereLight.intensity = lt.fromHemiIntensity + (lt.toHemiIntensity - lt.fromHemiIntensity) * t;

          // Scene fog transition
          if (lt.toSceneFog && !scene.fog) {
            scene.fog = new THREE.Fog(0x000000, 15, 40);
          } else if (!lt.toSceneFog && scene.fog) {
            const fog = scene.fog as THREE.Fog;
            fog.near = fog.near + (40 - fog.near) * t;
            fog.far = fog.far + (80 - fog.far) * t;
            if (progress >= 1) scene.fog = null;
          }
          if (scene.fog && lt.toSceneFog) {
            const fog = scene.fog as THREE.Fog;
            fog.near = 15 + (lt.toFogNear - 15) * t;
            fog.far = 40 + (lt.toFogFar - 40) * t;
          }

          if (progress >= 1) sceneRef.current.weatherLightTransition = null;
        }

        // --- Weather fade-in (opacity ramp for particles) ---
        const fadeIn = sceneRef.current.weatherFadeIn;
        let weatherOpacityMultiplier = 1;
        if (fadeIn) {
          const progress = Math.min(1, (Date.now() - fadeIn.startTime) / fadeIn.duration);
          weatherOpacityMultiplier = easeOutCubic(progress);
          if (progress >= 1) sceneRef.current.weatherFadeIn = null;
        }

        // --- Point-based particle update ---
        if (wp && posArr && velArr) {
          const posAttr = wp.geometry.getAttribute('position') as THREE.BufferAttribute;
          const count = posArr.length / 3;

          // Apply fade-in to particle material opacity
          const wpMat = wp.material as THREE.PointsMaterial;
          wpMat.opacity = wpMat.userData?.baseOpacity
            ? wpMat.userData.baseOpacity * weatherOpacityMultiplier
            : weatherOpacityMultiplier;

          const activeWeather = useGameStore.getState().currentWeather;

          if (activeWeather === 'rain') {
            // v91.0: Rain splash ring spawning (throttled to ~3 per frame max)
            let splashCount = 0;
            const maxSplashesPerFrame = 3;
            for (let i = 0; i < count; i++) {
              const i3 = i * 3;
              posArr[i3] -= 0.8 * dt;
              posArr[i3 + 1] -= velArr[i] * dt;
              if (posArr[i3 + 1] < 0) {
                // v91.0: Spawn splash ring at ground hit point (before reset)
                if (splashCount < maxSplashesPerFrame && sceneRef.current?.rainSplashRings) {
                  const sx = posArr[i3];
                  const sz = posArr[i3 + 2];
                  // Only spawn within map bounds
                  if (Math.abs(sx) < 11 && Math.abs(sz) < 9) {
                    // v92.0: Reuse pooled material instead of allocating new one each splash
                    const splashMat = sceneRef.current.rainSplashMaterialPool[sceneRef.current.rainSplashMaterialIdx];
                    sceneRef.current.rainSplashMaterialIdx = (sceneRef.current.rainSplashMaterialIdx + 1) % sceneRef.current.rainSplashMaterialPool.length;
                    const splashMesh = new THREE.Mesh(sceneRef.current.rainSplashGeo, splashMat);
                    splashMesh.rotation.x = -Math.PI / 2;
                    splashMesh.position.set(sx, 0.005, sz);
                    sceneRef.current.weatherGroup.add(splashMesh);
                    sceneRef.current.rainSplashRings.push({ mesh: splashMesh, startTime: Date.now() });
                    splashCount++;
                  }
                }
                posArr[i3] = (Math.random() - 0.5) * 22;
                posArr[i3 + 1] = 6 + Math.random() * 4;
                posArr[i3 + 2] = (Math.random() - 0.5) * 18;
              }
            }
            posAttr.needsUpdate = true;
          } else if (activeWeather === 'snow') {
            for (let i = 0; i < count; i++) {
              const i3 = i * 3;
              const drift = offArr ? Math.sin(elapsed * 1.2 + offArr[i]) * 0.3 : 0;
              posArr[i3] += drift * dt;
              posArr[i3 + 1] -= velArr[i] * dt;
              if (posArr[i3 + 1] < 0) {
                posArr[i3] = (Math.random() - 0.5) * 22;
                posArr[i3 + 1] = 6 + Math.random() * 4;
                posArr[i3 + 2] = (Math.random() - 0.5) * 18;
              }
            }
            posAttr.needsUpdate = true;
          } else if (activeWeather === 'sandstorm') {
            for (let i = 0; i < count; i++) {
              const i3 = i * 3;
              const yJitter = yVelArr ? Math.sin(elapsed * 3 + (offArr ? offArr[i] : 0)) * 0.5 : 0;
              posArr[i3] += velArr[i] * dt;
              posArr[i3 + 1] += yJitter * dt;
              if (posArr[i3] > 12) {
                posArr[i3] = -12;
                posArr[i3 + 1] = Math.random() * 4;
                posArr[i3 + 2] = (Math.random() - 0.5) * 18;
              }
            }
            posAttr.needsUpdate = true;
          }
        }

        // --- Rain line segments update ---
        if (rainLines) {
          const lineMat = rainLines.userData.material as THREE.LineBasicMaterial;
          if (lineMat) {
            lineMat.opacity = (rainLines.userData.baseOpacity ?? 0.4) * weatherOpacityMultiplier;
          }
          // Move the whole rain lines group to create falling effect
          rainLines.position.y -= 12 * dt;
          if (rainLines.position.y < -1) {
            rainLines.position.y = 1;
          }
        }

        // v91.0: Rain splash ring animation — expand + fade over 300ms, then remove
        if (sceneRef.current.rainSplashRings.length > 0) {
          const now = Date.now();
          const splashes = sceneRef.current.rainSplashRings;
          let writeIdx = 0;
          for (let s = 0; s < splashes.length; s++) {
            const splash = splashes[s];
            const age = now - splash.startTime;
            if (age > 300) {
              // Expired — remove mesh from scene (v92.0: don't dispose pooled material)
              sceneRef.current.weatherGroup.remove(splash.mesh);
            } else {
              // Animate: expand from 1x to 4x scale, fade opacity from 0.5 to 0
              const t = age / 300;
              const scale = 1 + t * 3;
              splash.mesh.scale.set(scale, scale, 1);
              (splash.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
              splashes[writeIdx++] = splash;
            }
          }
          splashes.length = writeIdx;
        }

        // --- Fog plane pulsing opacity ---
        if (fogPlane) {
          const mat = fogPlane.material as THREE.MeshBasicMaterial;
          mat.opacity = (0.25 + Math.sin(elapsed * 0.5) * 0.1) * weatherOpacityMultiplier;
        }

        // --- Drifting fog planes (fog weather) ---
        for (const driftPlane of driftFogPlanes) {
          if (!driftPlane.userData.driftSpeed) continue;
          const speed = driftPlane.userData.driftSpeed as number;
          const amplitude = driftPlane.userData.driftAmplitude as number;
          const baseX = driftPlane.userData.baseX as number;
          const baseZ = driftPlane.userData.baseZ as number;
          driftPlane.position.x = baseX + Math.sin(elapsed * speed + (driftPlane.userData.phase as number)) * amplitude;
          driftPlane.position.z = baseZ + Math.cos(elapsed * speed * 0.7 + (driftPlane.userData.phase as number)) * amplitude * 0.6;
          const mat = driftPlane.material as THREE.MeshBasicMaterial;
          mat.opacity = (driftPlane.userData.baseOpacity as number) * weatherOpacityMultiplier;
        }

        // --- Sandstorm fog overlay pulsing ---
        if (sandFogPlane) {
          const mat = sandFogPlane.material as THREE.MeshBasicMaterial;
          mat.opacity = (0.15 + Math.sin(elapsed * 0.8) * 0.08) * weatherOpacityMultiplier;
        }

        // v92.0: Lightning flashes during rain/sandstorm weather
        const activeWeather = useGameStore.getState().currentWeather;
        const isStormWeather = activeWeather === 'rain' || activeWeather === 'sandstorm';
        const lightningFlashEnd = sceneRef.current.lightningFlashEnd;
        const nextLightningTime = sceneRef.current.nextLightningTime;
        const nowMs = Date.now();

        if (lightningFlashEnd > 0) {
          if (nowMs > lightningFlashEnd) {
            ambientLight.intensity = 0.6; // reset to normal storm ambient
            sceneRef.current.lightningFlashEnd = 0;
            sceneRef.current.nextLightningTime = nowMs + 5000 + Math.random() * 10000;
          }
        } else if (nowMs > nextLightningTime && isStormWeather) {
          ambientLight.intensity = 3.0;
          sceneRef.current.lightningFlashEnd = nowMs + 100;
        }
      }
      // ===== Apply Camera Shake Offset =====
      const cs = sceneRef.current?.cameraShake;
      if (cs) {
        const shakeProgress = Math.min(1, (Date.now() - cs.startTime) / cs.duration);
        const decay = 1 - shakeProgress;
        const shakeX = (Math.random() - 0.5) * cs.intensity * decay;
        const shakeZ = (Math.random() - 0.5) * cs.intensity * decay;
        camera.position.set(cameraTarget.x + shakeX, 20, cameraTarget.z + 0.01 + shakeZ);
        camera.lookAt(cameraTarget.x + shakeX, 0, cameraTarget.z + shakeZ);
      }

      // ===== Veterancy Badge Floating Animation =====
      if (sceneRef.current) {
        // v91.0: Removed shadowed 'const elapsed' — uses outer elapsed from line ~2867
        for (const unitMesh of sceneRef.current.unitMeshes.values()) {
          unitMesh.traverse((child) => {
            if (child instanceof THREE.Sprite && child.name === 'veteranBadge') {
              const floatOffset = child.userData.floatOffset ?? 0;
              const vetTitle = child.userData.veterancyTitle;
              // Gentle sine wave bob: amplitude 0.05, speed varies by title
              const speed = vetTitle === '传奇' ? 2.5 : vetTitle === '精英' ? 2.0 : 1.5;
              const amplitude = vetTitle === '传奇' ? 0.06 : 0.04;
              child.position.y = 1.1 + Math.sin(elapsed * speed + floatOffset) * amplitude;
              // Subtle scale pulse for legendary
              if (vetTitle === '传奇') {
                const pulse = 1 + Math.sin(elapsed * 3 + floatOffset) * 0.05;
                const baseScale = 0.38;
                child.scale.set(baseScale * pulse, baseScale * pulse, 1);
              }
            }
          });
        }
      }

      // v89.0: Health ring color update & selection pulse animation
      if (sceneRef.current) {
        const elapsedHr = (performance.now() - sceneRef.current.startTime) / 1000;
        const liveSelId = liveSelectedUnit?.id ?? null;
        // v90.0: Reuse existing liveUnitMap instead of creating a redundant one per frame
        for (const unitMesh of sceneRef.current.unitMeshes.values()) {
          unitMesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.name === 'healthRing') {
              const unitId = unitMesh.userData.unitId;
              const liveUnit = liveUnitMap.get(unitId);
              if (!liveUnit) return;
              // Update color based on current HP ratio
              const newRatio = Math.max(0, Math.min(1, liveUnit.stats.hp / liveUnit.stats.maxHp));
              const newColor = newRatio > 0.7 ? 0x4caf50 : newRatio > 0.3 ? 0xffc107 : 0xf44336;
              const ringMat = child.material as THREE.MeshBasicMaterial;
              if (child.userData.hpRatio !== newRatio) {
                child.userData.hpRatio = newRatio;
                ringMat.color.setHex(newColor);
              }
              // Pulse when selected
              // v91.0: Emissive glow boost for selected unit health ring
              if (unitId === liveSelId) {
                const pulse = 1.0 + Math.sin(elapsedHr * 4) * 0.12;
                child.scale.set(pulse, pulse, 1);
                ringMat.opacity = 0.6 + Math.sin(elapsedHr * 4) * 0.2;
              } else {
                child.scale.set(1, 1, 1);
                ringMat.opacity = 0.5;
              }
            }
          });
        }
      }

      // [REMOVED] Smooth HP Bar Animation per user request

      // v77.0: Animate capture point flags — gentle wave motion
      if (sceneRef.current) {
        const mg = sceneRef.current.mapGroup;
        // v91.0: Removed shadowed 'const elapsed' — uses outer elapsed from line ~2867
        for (let i = 0; i < mg.children.length; i++) {
          const child = mg.children[i];
          if (child.userData?.isCaptureFlag) {
            const wave = Math.sin(elapsed * 3 + i * 1.5) * 0.02;
            child.position.y = (child.userData.flagBaseY ?? 0.55) + wave;
            child.rotation.y = Math.sin(elapsed * 2 + i) * 0.15;
          }
        }
      }

      // v81.0: Capture Point 3D Progress Arcs (live updated each frame)
      {
        const cpStoreState = useGameStore.getState();
        const capturePoints = cpStoreState.capturePoints || [];
        const activeCpIds = new Set<string>();

        for (const cp of capturePoints) {
          const redProg = cp.captureProgress.red;
          const blueProg = cp.captureProgress.blue;
          const threshold = cp.captureThreshold || 100;

          // Skip capture points with no progress at all
          if (redProg <= 0 && blueProg <= 0) continue;
          activeCpIds.add(cp.id);

          // Find or create arc entry (v92.0: O(1) Map lookup instead of array .find)
          let arcEntry = captureProgressArcMapRef.current.get(cp.id);

          const cpWorldPos = cellToWorld(cp.position, _c2w1);
          const cpCell = gameMap.cells[cp.position.z]?.[cp.position.x];
          const cpHeight = cpCell ? TERRAIN_CONFIGS[cpCell.terrain].stats.height * CELL_SIZE : 0;
          const arcRadius = cp.captureRadius * CELL_TOTAL * 0.3;
          const arcTube = 0.04;

          if (!arcEntry) {
            // Create initial arcs (tiny thetaLength, will be updated below)
            const redArcGeo = new THREE.RingGeometry(arcRadius - arcTube, arcRadius + arcTube, 48, 1, -Math.PI / 2, 0.01);
            const redArcMat = new THREE.MeshBasicMaterial({
              color: 0xef4444,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.4,
              depthWrite: false,
            });
            const redArc = new THREE.Mesh(redArcGeo, redArcMat);
            redArc.rotation.x = -Math.PI / 2;
            redArc.position.set(cpWorldPos.x, cpHeight + 0.06, cpWorldPos.z);
            effectsGroup.add(redArc);

            const blueArcGeo = new THREE.RingGeometry(arcRadius - arcTube, arcRadius + arcTube, 48, 1, -Math.PI / 2, 0.01);
            const blueArcMat = new THREE.MeshBasicMaterial({
              color: 0x3b82f6,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.4,
              depthWrite: false,
            });
            const blueArc = new THREE.Mesh(blueArcGeo, blueArcMat);
            blueArc.rotation.x = -Math.PI / 2;
            blueArc.position.set(cpWorldPos.x, cpHeight + 0.06, cpWorldPos.z);
            effectsGroup.add(blueArc);

            arcEntry = { cpId: cp.id, redArc, blueArc, lastHeight: cpHeight, lastRedRatio: -1, lastBlueRatio: -1 };
            captureProgressArcsRef.current.push(arcEntry);
            // v92.0: Also add to O(1) lookup Map
            captureProgressArcMapRef.current.set(cp.id, arcEntry);
          } else {
            // Update height if terrain changed
            if (arcEntry.lastHeight !== cpHeight) {
              arcEntry.redArc.position.y = cpHeight + 0.06;
              arcEntry.blueArc.position.y = cpHeight + 0.06;
              arcEntry.lastHeight = cpHeight;
            }
          }

          // Update red arc geometry based on progress
          const redRatio = Math.min(1, redProg / threshold);
          if (redRatio > 0 && redRatio !== arcEntry.lastRedRatio) {
            arcEntry.redArc.visible = true;
            const redTheta = redRatio * Math.PI * 2;
            arcEntry.redArc.geometry.dispose();
            arcEntry.redArc.geometry = new THREE.RingGeometry(
              arcRadius - arcTube, arcRadius + arcTube, 48, 1,
              -Math.PI / 2, redTheta
            );
            arcEntry.lastRedRatio = redRatio;
          } else if (redRatio <= 0) {
            arcEntry.redArc.visible = false;
            arcEntry.lastRedRatio = 0;
          }

          // Update blue arc geometry based on progress
          const blueRatio = Math.min(1, blueProg / threshold);
          if (blueRatio > 0 && blueRatio !== arcEntry.lastBlueRatio) {
            arcEntry.blueArc.visible = true;
            const blueTheta = blueRatio * Math.PI * 2;
            const redTheta = Math.min(1, redProg / threshold) * Math.PI * 2;
            const blueStart = -Math.PI / 2 + redTheta;
            arcEntry.blueArc.geometry.dispose();
            arcEntry.blueArc.geometry = new THREE.RingGeometry(
              arcRadius - arcTube, arcRadius + arcTube, 48, 1,
              blueStart, blueTheta
            );
            arcEntry.lastBlueRatio = blueRatio;
          } else if (blueRatio <= 0) {
            arcEntry.blueArc.visible = false;
            arcEntry.lastBlueRatio = 0;
          }
        }

        // Remove arcs for capture points that are no longer active or no longer exist
        for (let i = captureProgressArcsRef.current.length - 1; i >= 0; i--) {
          const entry = captureProgressArcsRef.current[i];
          if (!activeCpIds.has(entry.cpId)) {
            effectsGroup.remove(entry.redArc);
            entry.redArc.geometry.dispose();
            (entry.redArc.material as THREE.Material).dispose();
            effectsGroup.remove(entry.blueArc);
            entry.blueArc.geometry.dispose();
            (entry.blueArc.material as THREE.Material).dispose();
            // v90.0: swap-with-last instead of splice(i,1) for O(1) removal
            captureProgressArcsRef.current[i] = captureProgressArcsRef.current[captureProgressArcsRef.current.length - 1];
            captureProgressArcsRef.current.pop();
            // v92.0: Also remove from O(1) lookup Map
            captureProgressArcMapRef.current.delete(entry.cpId);
          }
        }
      }

      // v84.0: Update ambient weather particles (merged from separate RAF loop)
      if (sceneRef.current) {
      const _ap = sceneRef.current.ambientWeatherParticles;
      const _aPos = sceneRef.current.ambientWeatherPositions;
      const _pData = weatherParticleDataRef.current;
      if (_ap && _aPos && _pData) {
        const activeWeather = liveState.currentWeather;
        const posAttr = _ap.geometry.getAttribute('position') as THREE.BufferAttribute;
        const count = _aPos.length / 3;
        const nowSec = now / 1000;
        let needsUpdate = false;
        for (let i = 0; i < count; i++) {
          const i3 = i * 3;
          const speed = _pData.velocities[i];
          const phase = _pData.offsets[i];
          switch (activeWeather) {
            case 'rain':
              _aPos[i3] -= 0.1 * speed * 0.016;
              _aPos[i3 + 1] -= 0.5 * speed * 0.016;
              if (_aPos[i3 + 1] < 0) { _aPos[i3] = (Math.random() - 0.5) * 22; _aPos[i3 + 1] = 8 + Math.random() * 2; _aPos[i3 + 2] = (Math.random() - 0.5) * 18; }
              needsUpdate = true;
              break;
            case 'snow':
              _aPos[i3] += Math.sin(nowSec * 1.5 + phase) * 0.3 * 0.016;
              _aPos[i3 + 1] -= 0.05 * speed * 0.016;
              if (_aPos[i3 + 1] < 0) { _aPos[i3] = (Math.random() - 0.5) * 22; _aPos[i3 + 1] = 8 + Math.random() * 2; _aPos[i3 + 2] = (Math.random() - 0.5) * 18; }
              needsUpdate = true;
              break;
            case 'sandstorm':
              _aPos[i3] += 0.3 * speed * 0.016;
              _aPos[i3 + 1] += Math.sin(nowSec * 2 + phase) * 0.15 * 0.016;
              if (_aPos[i3] > 12) { _aPos[i3] = -12; _aPos[i3 + 1] = Math.random() * 5; _aPos[i3 + 2] = (Math.random() - 0.5) * 18; }
              needsUpdate = true;
              break;
          }
        }
        if (needsUpdate) posAttr.needsUpdate = true;
      }
      }

      // Main render
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      // Clear module-level unit direction cache to prevent stale entries across games
      _unitDirMap.clear();
      // v65.0: Clear screen flash timeout on unmount
      if (screenFlashTimeoutRef.current) {
        clearTimeout(screenFlashTimeoutRef.current);
        screenFlashTimeoutRef.current = null;
      }
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
      }
      particleManager.dispose();
      // Cleanup reinforcement effects
      for (const re of reinforcementEffectsRef.current) {
        for (const obj of re.objects) {
          if (sceneRef.current) sceneRef.current.effectsGroup.remove(obj);
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          }
        }
      }
      reinforcementEffectsRef.current = [];
      // v77.0: Cleanup death animation meshes (was missing — caused GPU leak on unmount)
      if (sceneRef.current) {
        const eg = sceneRef.current.effectsGroup;
        for (const da of deathAnimationsRef.current) {
          eg.remove(da.mesh);
          da.mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (child.material instanceof THREE.Material) child.material.dispose();
            }
            if (child instanceof THREE.Sprite) {
              if ((child.material as THREE.SpriteMaterial).map) (child.material as THREE.SpriteMaterial).map!.dispose();
              child.material.dispose();
            }
          });
        }
      }
      deathAnimationsRef.current = [];
      // v81.0: Cleanup capture progress arc meshes
      if (sceneRef.current) {
        const cpEg = sceneRef.current.effectsGroup;
        for (const arcEntry of captureProgressArcsRef.current) {
          cpEg.remove(arcEntry.redArc);
          arcEntry.redArc.geometry.dispose();
          (arcEntry.redArc.material as THREE.Material).dispose();
          cpEg.remove(arcEntry.blueArc);
          arcEntry.blueArc.geometry.dispose();
          (arcEntry.blueArc.material as THREE.Material).dispose();
        }
      }
      captureProgressArcsRef.current = [];
      // v92.0: Clear O(1) lookup Map
      captureProgressArcMapRef.current.clear();
      // Cleanup level up effects
      for (const lu of levelUpEffectsRef.current) {
        for (const obj of lu.objects) {
          if (sceneRef.current) sceneRef.current.effectsGroup.remove(obj);
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          } else if (obj instanceof THREE.Sprite) {
            (obj.material as THREE.Material).dispose();
            if ((obj.material as THREE.SpriteMaterial).map) {
              (obj.material as THREE.SpriteMaterial).map!.dispose();
            }
          }
        }
      }
      levelUpEffectsRef.current = [];
      // Cleanup capture pulse effects
      for (const cpe of capturePulseEffectsRef.current) {
        for (const obj of cpe.objects) {
          if (sceneRef.current) sceneRef.current.effectsGroup.remove(obj);
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          }
        }
      }
      capturePulseEffectsRef.current = [];
      // v93.0: Cleanup floating 3D damage number sprites
      if (sceneRef.current) {
        for (const fds of floatingDamageSpritesRef.current) {
          for (const obj of fds.objects) {
            sceneRef.current.effectsGroup.remove(obj);
            if (obj instanceof THREE.Sprite) {
              const mat = obj.material as THREE.SpriteMaterial;
              mat.dispose();
              if (mat.map) mat.map.dispose();
            }
          }
        }
      }
      floatingDamageSpritesRef.current = [];
      // v79.0: Cleanup pathGroup (movement path meshes leak on unmount)
      if (sceneRef.current && sceneRef.current.pathGroup) {
        const pg = sceneRef.current.pathGroup;
        while (pg.children.length > 0) {
          const child = pg.children[0];
          pg.remove(child);
          if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        }
      }
      // Cleanup weather effects
      if (sceneRef.current) {
        if (sceneRef.current.weatherPoints) {
          sceneRef.current.weatherPoints.geometry.dispose();
          (sceneRef.current.weatherPoints.material as THREE.Material).dispose();
        }
        if (sceneRef.current.weatherFogPlane) {
          sceneRef.current.weatherFogPlane.geometry.dispose();
          (sceneRef.current.weatherFogPlane.material as THREE.Material).dispose();
        }
        if (sceneRef.current.weatherSandFogPlane) {
          sceneRef.current.weatherSandFogPlane.geometry.dispose();
          (sceneRef.current.weatherSandFogPlane.material as THREE.Material).dispose();
        }
        if (sceneRef.current.weatherRainLines) {
          const rl = sceneRef.current.weatherRainLines;
          rl.traverse(child => {
            if (child instanceof THREE.LineSegments) {
              child.geometry.dispose();
              (child.material as THREE.Material).dispose();
            }
          });
        }
        for (const dp of sceneRef.current.weatherDriftFogPlanes) {
          dp.geometry.dispose();
          (dp.material as THREE.Material).dispose();
        }
      }
      // v76.0: Clear all pending timeouts to prevent post-unmount callbacks
      if (sceneRef.current) {
        for (const tid of sceneRef.current.pendingTimeouts) clearTimeout(tid);
        sceneRef.current.pendingTimeouts = [];
      }
      // v82: Full scene traversal disposal — prevents massive GPU memory leak on unmount
      // Previously only effects/weather were cleaned up; map, units, fog, highlights, etc. leaked
      if (sceneRef.current) {
        const scene = sceneRef.current.scene;
        scene.traverse((obj) => {
          if ((obj as any).geometry) (obj as any).geometry.dispose();
          if ((obj as any).material) {
            const mat = (obj as any).material;
            if (Array.isArray(mat)) mat.forEach((m: THREE.Material) => m.dispose());
            else mat.dispose();
          }
        });
        sceneRef.current = null;
      }
      renderer.dispose();
      // v91.0: Clear stale unit direction entries on unmount
      _unitDirMap.clear();
      container.removeChild(renderer.domElement);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // ===== Update Map Rendering =====
  useEffect(() => {
    if (!sceneRef.current) return;
    const { mapGroup, cellMeshes, waterMeshes } = sceneRef.current;

    // Dispose old map children geometry/material to prevent GPU memory leak
    function disposeMesh(obj: THREE.Object3D) {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
      obj.children.forEach(child => disposeMesh(child));
    }
    while (mapGroup.children.length > 0) {
      const child = mapGroup.children[0];
      mapGroup.remove(child);
      disposeMesh(child);
    }
    cellMeshes.length = 0;
    waterMeshes.length = 0;

    // Create new map
    for (let z = 0; z < MAP_HEIGHT; z++) {
      cellMeshes[z] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        const cell = gameMap.cells[z]?.[x];
        if (!cell) continue;

        const mesh = createTerrainCell(cell.terrain, cell.position, mapGroup);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mapGroup.add(mesh);
        cellMeshes[z][x] = mesh;

        // Track water meshes for animation
        if (cell.terrain === 'water') {
          mesh.userData.baseY = mesh.position.y;
          mesh.userData.cellPos = cell.position;
          waterMeshes.push(mesh);
        }

        // Fortification marker
        if (cell.fortified) {
          const config = TERRAIN_CONFIGS[cell.terrain];
          const height = config.stats.height * CELL_SIZE;
          const worldPos = cellToWorld(cell.position);

          // Sandbag-like fortification markers around cell edges
          const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x8d6e3f, roughness: 0.9 });
          const sandbagPositions = [
            { x: 0, z: 0.4, rot: 0 },
            { x: 0, z: -0.4, rot: 0 },
            { x: 0.4, z: 0, rot: Math.PI / 2 },
            { x: -0.4, z: 0, rot: Math.PI / 2 },
          ];
          for (const sp of sandbagPositions) {
            const bagGeo = new THREE.BoxGeometry(0.35, 0.06, 0.08);
            const bag = new THREE.Mesh(bagGeo, sandbagMat);
            bag.position.set(worldPos.x + sp.x, height + 0.03, worldPos.z + sp.z);
            bag.rotation.y = sp.rot;
            mapGroup.add(bag);
          }

          // Small flag/barricade in corner
          const flagGeo = new THREE.BoxGeometry(0.02, 0.15, 0.02);
          const flagMat = new THREE.MeshStandardMaterial({ color: 0xffa000 });
          const flag = new THREE.Mesh(flagGeo, flagMat);
          flag.position.set(worldPos.x + 0.35, height + 0.08, worldPos.z + 0.35);
          mapGroup.add(flag);

          // Fortification indicator (small amber plane on cell)
          const fortGeo = new THREE.PlaneGeometry(CELL_SIZE * 0.5, CELL_SIZE * 0.5);
          const fortMat = new THREE.MeshBasicMaterial({
            color: 0xffa000,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
          });
          const fortPlane = new THREE.Mesh(fortGeo, fortMat);
          fortPlane.rotation.x = -Math.PI / 2;
          fortPlane.position.set(worldPos.x, height + 0.015, worldPos.z);
          mapGroup.add(fortPlane);
        }

        // Minefield marker
        if (cell.hasMinefield) {
          // Check visibility: own mines always visible, enemy mines visible if scout/engineer in detection range
          const mineOwner = cell.minefieldOwner;
          const isOwnMine = mineOwner === currentFaction;
          let mineDetected = false;
          if (!isOwnMine) {
            // v28.0: Both scouts and engineers can detect enemy mines within MINE_DETECTION_RANGE
            const friendlyDetectors = units.filter(u => u.faction === currentFaction && (u.type === 'scout' || u.type === 'engineer') && u.isAlive);
            for (const detector of friendlyDetectors) {
              const dist = Math.abs(detector.position.x - cell.position.x) + Math.abs(detector.position.z - cell.position.z);
              if (dist <= MINE_DETECTION_RANGE) {
                mineDetected = true;
                break;
              }
            }
          }
          if (isOwnMine || mineDetected) {
            const config = TERRAIN_CONFIGS[cell.terrain];
            const height = config.stats.height * CELL_SIZE;
            const worldPos = cellToWorld(cell.position);
            const mineColor = mineOwner === 'red' ? 0xff4444 : 0x4488ff;

            // Diamond shape for mine indicator
            const diamondGeo = new THREE.OctahedronGeometry(0.08, 0);
            const diamondMat = new THREE.MeshStandardMaterial({
              color: mineColor,
              emissive: mineColor,
              emissiveIntensity: 0.5,
              roughness: 0.3,
              metalness: 0.6,
            });
            const diamond = new THREE.Mesh(diamondGeo, diamondMat);
            diamond.position.set(worldPos.x, height + 0.1, worldPos.z);
            diamond.scale.set(1, 0.5, 1);
            diamond.rotation.y = Math.PI / 4;
            mapGroup.add(diamond);
          }
        }

        // Deployment zone overlay (brighter green highlight for x:0-3)
        if (phase === 'deployment' && x >= 0 && x <= 3) {
          const config = TERRAIN_CONFIGS[cell.terrain];
          const height = config.stats.height * CELL_SIZE;
          const worldPos = cellToWorld(cell.position);

          const isOccupied = !!cell.unit;
          const deployGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
          const deployMat = new THREE.MeshBasicMaterial({
            color: 0x22c55e,
            transparent: true,
            opacity: isOccupied ? 0.08 : 0.35,
            side: THREE.DoubleSide,
          });
          const deployPlane = new THREE.Mesh(deployGeo, deployMat);
          deployPlane.rotation.x = -Math.PI / 2;
          deployPlane.position.set(worldPos.x, height + 0.02, worldPos.z);
          deployPlane.userData.isDeploymentOverlay = true;
          mapGroup.add(deployPlane);

          // Green border on each deployable cell edge
          const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL_SIZE * 0.95, 0.01, CELL_SIZE * 0.95));
          const edgeMat = new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.5 });
          const edgeLine = new THREE.LineSegments(edgeGeo, edgeMat);
          edgeLine.position.set(worldPos.x, height + 0.025, worldPos.z);
          mapGroup.add(edgeLine);

          // Green arrow indicator pointing down on empty deployable cells
          if (!isOccupied && config.stats.isPassable) {
            const arrowGeo = new THREE.ConeGeometry(0.06, 0.1, 4);
            const arrowMat = new THREE.MeshBasicMaterial({
              color: 0x4caf50,
              transparent: true,
              opacity: 0.7,
            });
            const arrow = new THREE.Mesh(arrowGeo, arrowMat);
            arrow.position.set(worldPos.x, height + 0.15, worldPos.z);
            arrow.rotation.x = Math.PI; // Point downward
            mapGroup.add(arrow);
          }

          // Thick animated dashed border at x=3 boundary
          if (x === 3) {
            const lineGeo = new THREE.PlaneGeometry(0.06, MAP_HEIGHT * CELL_TOTAL);
            const lineMat = new THREE.MeshBasicMaterial({
              color: 0x4caf50,
              transparent: true,
              opacity: 0.8,
              side: THREE.DoubleSide,
            });
            const line = new THREE.Mesh(lineGeo, lineMat);
            line.rotation.x = -Math.PI / 2;
            line.position.set(worldPos.x + CELL_TOTAL / 2, 0.04, 0);
            mapGroup.add(line);

            // Dashed effect: add small rectangular segments along the border
            for (let dz = 0; dz < MAP_HEIGHT; dz++) {
              const dashY = MAP_OFFSET_Z + dz * CELL_TOTAL + CELL_TOTAL / 2;
              const dashGeo = new THREE.PlaneGeometry(0.1, CELL_SIZE * 0.5);
              const dashMat = new THREE.MeshBasicMaterial({
                color: 0x81c784,
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide,
              });
              const dash = new THREE.Mesh(dashGeo, dashMat);
              dash.rotation.x = -Math.PI / 2;
              dash.position.set(worldPos.x + CELL_TOTAL / 2, 0.045, dashY);
              mapGroup.add(dash);
            }
          }
        }
      }
    }

    // v51.0: Re-build pre-flattened cell meshes after map rebuild
    sceneRef.current.flatCellMeshes = cellMeshes.flat();

    // v87.0: Map border glow lines — visual boundary indicator
    const borderThick = 0.06;
    const borderOpacity = 0.4;
    const borderColor = 0x4488aa;
    // North border
    const nBorderGeo = new THREE.PlaneGeometry(MAP_WIDTH * CELL_TOTAL + borderThick, borderThick);
    const nBorderMat = new THREE.MeshBasicMaterial({ color: borderColor, transparent: true, opacity: borderOpacity, side: THREE.DoubleSide });
    const nBorder = new THREE.Mesh(nBorderGeo, nBorderMat);
    nBorder.rotation.x = -Math.PI / 2;
    nBorder.position.set(0, 0.03, -(MAP_HEIGHT * CELL_TOTAL) / 2 - borderThick / 2);
    mapGroup.add(nBorder);
    // South border
    const sBorder = new THREE.Mesh(nBorderGeo, nBorderMat);
    sBorder.rotation.x = -Math.PI / 2;
    sBorder.position.set(0, 0.03, (MAP_HEIGHT * CELL_TOTAL) / 2 + borderThick / 2);
    mapGroup.add(sBorder);
    // West border
    const wBorderGeo = new THREE.PlaneGeometry(borderThick, MAP_HEIGHT * CELL_TOTAL + borderThick);
    const wBorder = new THREE.Mesh(wBorderGeo, nBorderMat);
    wBorder.rotation.x = -Math.PI / 2;
    wBorder.position.set(-(MAP_WIDTH * CELL_TOTAL) / 2 - borderThick / 2, 0.03, 0);
    mapGroup.add(wBorder);
    // East border
    const eBorder = new THREE.Mesh(wBorderGeo, nBorderMat);
    eBorder.rotation.x = -Math.PI / 2;
    eBorder.position.set((MAP_WIDTH * CELL_TOTAL) / 2 + borderThick / 2, 0.03, 0);
    mapGroup.add(eBorder);

    // ===== Capture Point Visuals =====
    for (const cp of (capturePoints || [])) {
      const worldPos = cellToWorld(cp.position);
      const cell = gameMap.cells[cp.position.z]?.[cp.position.x];
      const config = cell ? TERRAIN_CONFIGS[cell.terrain] : TERRAIN_CONFIGS.plains;
      const height = config.stats.height * CELL_SIZE;

      // Flag pole
      const poleGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.6 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(worldPos.x + 0.3, height + 0.3, worldPos.z - 0.3);
      mapGroup.add(pole);

      // Flag on top - color based on owner
      const flagColor = cp.owner === 'red' ? 0xef4444 : cp.owner === 'blue' ? 0x3b82f6 : 0x9ca3af;
      const flagGeo = new THREE.PlaneGeometry(0.2, 0.12);
      const flagMat = new THREE.MeshBasicMaterial({
        color: flagColor,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      });
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(worldPos.x + 0.4, height + 0.55, worldPos.z - 0.3);
      // v77.0: Mark flag for wave animation in animate loop
      flag.userData.isCaptureFlag = true;
      flag.userData.flagBaseY = height + 0.55;
      flag.userData.flagBaseX = worldPos.x + 0.4;
      flag.userData.flagBaseZ = worldPos.z - 0.3;
      mapGroup.add(flag);

      // [REMOVED] Capture radius ring, pulse ring, and threshold indicator per user request
      const ringRadius = cp.captureRadius * CELL_TOTAL;

      // Dual-color progress ring for contested capture points
      if (cp.captureProgress.red > 0 || cp.captureProgress.blue > 0) {
        const ringRedProgress = Math.min(1, cp.captureProgress.red / cp.captureThreshold);
        const ringBlueProgress = Math.min(1, cp.captureProgress.blue / cp.captureThreshold);
        const progressRingRadius = ringRadius * 0.7;
        const progressRingTube = 0.04;
        const segments = 48;

        // Red arc
        if (ringRedProgress > 0) {
          const redArcGeo = new THREE.RingGeometry(
            progressRingRadius - progressRingTube,
            progressRingRadius + progressRingTube,
            segments,
            1,
            0,
            Math.PI * 2 * ringRedProgress
          );
          const redArcMat = new THREE.MeshBasicMaterial({
            color: 0xef4444,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
          });
          const redArc = new THREE.Mesh(redArcGeo, redArcMat);
          redArc.rotation.x = -Math.PI / 2;
          redArc.position.set(worldPos.x, height + 0.022, worldPos.z);
          mapGroup.add(redArc);
        }

        // Blue arc (offset by red progress)
        if (ringBlueProgress > 0) {
          const blueArcGeo = new THREE.RingGeometry(
            progressRingRadius - progressRingTube,
            progressRingRadius + progressRingTube,
            segments,
            1,
            Math.PI,
            Math.PI * 2 * ringBlueProgress
          );
          const blueArcMat = new THREE.MeshBasicMaterial({
            color: 0x3b82f6,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5,
          });
          const blueArc = new THREE.Mesh(blueArcGeo, blueArcMat);
          blueArc.rotation.x = -Math.PI / 2;
          blueArc.position.set(worldPos.x, height + 0.022, worldPos.z);
          mapGroup.add(blueArc);
        }
      }

      // v32.0: Capture progress label sprite (floating above flag)
      if (cp.captureProgress.red > 0 || cp.captureProgress.blue > 0) {
        const redPct = Math.min(100, Math.round(cp.captureProgress.red / cp.captureThreshold * 100));
        const bluePct = Math.min(100, Math.round(cp.captureProgress.blue / cp.captureThreshold * 100));
        if (redPct > 0 || bluePct > 0) {
          const progCanvas = document.createElement('canvas');
          progCanvas.width = 96;
          progCanvas.height = 28;
          const pCtx = progCanvas.getContext('2d')!;
          // Background
          pCtx.fillStyle = 'rgba(0,0,0,0.65)';
          pCtx.beginPath();
          pCtx.roundRect(2, 0, 92, 24, 4);
          pCtx.fill();
          // Border
          pCtx.strokeStyle = 'rgba(255,255,255,0.2)';
          pCtx.lineWidth = 1;
          pCtx.beginPath();
          pCtx.roundRect(2, 0, 92, 24, 4);
          pCtx.stroke();
          // Red progress bar
          const barX = 8;
          const barY = 4;
          const barW = 80;
          const barH = 6;
          pCtx.fillStyle = 'rgba(255,255,255,0.15)';
          pCtx.beginPath();
          pCtx.roundRect(barX, barY, barW, barH, 2);
          pCtx.fill();
          // Red fill
          if (redPct > 0) {
            pCtx.fillStyle = '#ef4444';
            pCtx.beginPath();
            pCtx.roundRect(barX, barY, barW * redPct / 100, barH, 2);
            pCtx.fill();
          }
          // Blue fill (overlay from right)
          if (bluePct > 0) {
            pCtx.fillStyle = 'rgba(59,130,246,0.7)';
            pCtx.beginPath();
            pCtx.roundRect(barX + barW - barW * bluePct / 100, barY, barW * bluePct / 100, barH, 2);
            pCtx.fill();
          }
          // Text
          pCtx.font = 'bold 10px sans-serif';
          pCtx.fillStyle = '#ffffff';
          pCtx.textAlign = 'center';
          pCtx.textBaseline = 'bottom';
          const dominant = redPct >= bluePct ? `${redPct}%` : `${bluePct}%`;
          pCtx.fillText(dominant, 48, 22);
          // Create sprite
          const progTexture = new THREE.CanvasTexture(progCanvas);
          progTexture.minFilter = THREE.LinearFilter;
          const progSpriteMat = new THREE.SpriteMaterial({
            map: progTexture,
            transparent: true,
            depthTest: false,
          });
          const progSprite = new THREE.Sprite(progSpriteMat);
          progSprite.scale.set(0.5, 0.5 / (96 / 28), 1);
          progSprite.position.set(worldPos.x + 0.3, height + 0.75, worldPos.z - 0.3);
          progSprite.userData.isCaptureProgress = true;
          mapGroup.add(progSprite);
        }
      }

      // Vision range indicator for owned capture points that provide vision
      if (cp.providesVision > 0 && cp.owner) {
        const visionRadius = cp.providesVision * CELL_TOTAL;
        const visionRingGeo = new THREE.RingGeometry(visionRadius - 0.03, visionRadius, 48);
        const visionColor = cp.owner === 'red' ? 0xef4444 : 0x3b82f6;
        const visionRingMat = new THREE.MeshBasicMaterial({
          color: visionColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.1,
        });
        const visionRing = new THREE.Mesh(visionRingGeo, visionRingMat);
        visionRing.rotation.x = -Math.PI / 2;
        visionRing.position.set(worldPos.x, height + 0.012, worldPos.z);
        mapGroup.add(visionRing);

        // Vision range fill - subtle circle
        const visionFillGeo = new THREE.CircleGeometry(visionRadius, 48);
        const visionFillMat = new THREE.MeshBasicMaterial({
          color: visionColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.04,
        });
        const visionFill = new THREE.Mesh(visionFillGeo, visionFillMat);
        visionFill.rotation.x = -Math.PI / 2;
        visionFill.position.set(worldPos.x, height + 0.011, worldPos.z);
        mapGroup.add(visionFill);
      }

      // Capture point type icon - small 3D marker
      const markerColor = cp.owner === 'red' ? 0xff5252 : cp.owner === 'blue' ? 0x448aff : 0xffa000;
      const markerGeo = new THREE.OctahedronGeometry(0.08, 0);
      const markerMat = new THREE.MeshStandardMaterial({
        color: markerColor,
        emissive: markerColor,
        emissiveIntensity: 0.4,
        metalness: 0.5,
      });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(worldPos.x, height + 0.6, worldPos.z);
      mapGroup.add(marker);

      // Progress bars (red and blue) floating above
      const barWidth = 0.4;
      const barHeight = 0.03;
      const redProgress = Math.min(1, cp.captureProgress.red / cp.captureThreshold);
      const blueProgress = Math.min(1, cp.captureProgress.blue / cp.captureThreshold);

      // Red progress bar background
      const redBarBgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
      const redBarBgMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
      const redBarBg = new THREE.Mesh(redBarBgGeo, redBarBgMat);
      redBarBg.rotation.x = -Math.PI / 4;
      redBarBg.position.set(worldPos.x, height + 0.7, worldPos.z - 0.05);
      mapGroup.add(redBarBg);

      // Red progress bar fill
      if (redProgress > 0) {
        const redBarGeo = new THREE.PlaneGeometry(barWidth * redProgress, barHeight * 0.8);
        const redBarMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide });
        const redBar = new THREE.Mesh(redBarGeo, redBarMat);
        redBar.rotation.x = -Math.PI / 4;
        redBar.position.set(worldPos.x - barWidth * (1 - redProgress) / 2, height + 0.7, worldPos.z - 0.05);
        mapGroup.add(redBar);
      }

      // Blue progress bar background
      const blueBarBgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
      const blueBarBgMat = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
      const blueBarBg = new THREE.Mesh(blueBarBgGeo, blueBarBgMat);
      blueBarBg.rotation.x = -Math.PI / 4;
      blueBarBg.position.set(worldPos.x, height + 0.75, worldPos.z - 0.05);
      mapGroup.add(blueBarBg);

      // Blue progress bar fill
      if (blueProgress > 0) {
        const blueBarGeo = new THREE.PlaneGeometry(barWidth * blueProgress, barHeight * 0.8);
        const blueBarMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide });
        const blueBar = new THREE.Mesh(blueBarGeo, blueBarMat);
        blueBar.rotation.x = -Math.PI / 4;
        blueBar.position.set(worldPos.x - barWidth * (1 - blueProgress) / 2, height + 0.75, worldPos.z - 0.05);
        mapGroup.add(blueBar);
      }
    }
  }, [gameMap, createTerrainCell, phase, capturePoints]);

  // ===== Update Unit Rendering =====
  // v77.0: Compute a structural hash of units (only rebuild meshes when positions/alive/faction change,
  // NOT when stats like HP/ammo change — those are handled by the smooth HP bar animation in animate())
  const unitStructureKey = useMemo(() => {
    return units.map(u => `${u.id}:${u.isAlive}:${u.position.x},${u.position.z}:${u.faction}:${u.isStealthed}`).join('|');
  }, [units]);

  useEffect(() => {
    if (!sceneRef.current) return;
    const { unitGroup, unitMeshes } = sceneRef.current;

    // Track which units were alive before
    const prevAlive = sceneRef.current.prevUnitAliveMap;

    // Check if we have an active movement animation (read from store directly to avoid re-render loop)
    const currentAnim = useGameStore.getState().movementAnimation;
    const animatingUnitId = currentAnim?.unitId || null;

    // Clear old units — v34.0: Dispose geometries/materials to prevent GPU memory leak
    // v61.0: Save previous mesh IDs BEFORE clearing (was: clear first → isNewUnit always true)
    const prevMeshIds = new Set(unitMeshes.keys());
    while (unitGroup.children.length > 0) {
      const child = unitGroup.children[0];
      unitGroup.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else if (obj.material) obj.material.dispose();
        }
        if (obj instanceof THREE.Sprite) {
          if ((obj.material as THREE.SpriteMaterial).map) (obj.material as THREE.SpriteMaterial).map!.dispose();
          obj.material.dispose();
        }
      });
    }
    unitMeshes.clear();
    // v81.0: Clean up direction map entries for units that are gone
    const aliveIds = new Set(units.filter(u => u.isAlive).map(u => u.id));
    for (const uid of _unitDirMap.keys()) {
      if (!aliveIds.has(uid)) _unitDirMap.delete(uid);
    }

    // Create new units
    const currentState = useGameStore.getState();
    for (const unit of units) {
      if (!unit.isAlive) {
        // ===== 5. Destroyed Unit - Spawn Death Animation =====
        const wasAlive = prevAlive.get(unit.id);
        if (wasAlive) {
          const worldPos = cellToWorld(unit.position);
          const cell = gameMap.cells[unit.position.z]?.[unit.position.x];
          const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
          const pos = new THREE.Vector3(worldPos.x, terrainHeight + 0.2, worldPos.z);
          sceneRef.current.particleManager?.spawnExplosion(pos, 25);
          sceneRef.current.particleManager?.spawnSmoke(pos, 15);
          // v76.0: Lingering death smoke column
          sceneRef.current.particleManager?.spawnDeathSmokeColumn(pos, unit.faction as 'red' | 'blue');
          // v27.0: Create fading ghost mesh for death animation
          try {
            const deathMesh = createUnitMesh(unit);
            deathMesh.position.set(worldPos.x, terrainHeight, worldPos.z);
            if (unit.faction === 'blue') deathMesh.rotation.y = Math.PI;
            // Make it semi-transparent
            deathMesh.traverse((child) => {
              if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
                child.material = child.material.clone();
                child.material.transparent = true;
              }
            });
            sceneRef.current.effectsGroup.add(deathMesh);
            deathAnimationsRef.current.push({
              id: ++deathAnimIdCounter,
              mesh: deathMesh,
              startTime: Date.now(),
              duration: 800,
              startPos: new THREE.Vector3(worldPos.x, terrainHeight, worldPos.z),
              faction: unit.faction as 'red' | 'blue',
            });
          } catch { /* ignore mesh creation errors */ }
        }
        continue;
      }

      // Skip rendering stealthed enemy units that are not detected
      if (unit.isStealthed && unit.faction !== currentFaction) {
        if (!isUnitDetected(currentState, unit, currentFaction)) {
          continue;
        }
      }

      const mesh = createUnitMesh(unit);
      const worldPos = cellToWorld(unit.position);
      const cell = gameMap.cells[unit.position.z]?.[unit.position.x];
      const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

      // v47.0: Unit spawn materialize animation — detect NEW units only
      // v61.0: Use prevMeshIds (captured before clear) instead of unitMeshes.has()
      const isNewUnit = !prevAlive.has(unit.id) && !prevMeshIds.has(unit.id);
      if (isNewUnit) {
        mesh.scale.setScalar(0.01);
        mesh.userData.spawnTime = Date.now();
      }

      // If this unit is being animated, set position to animation start point instead of final
      if (animatingUnitId && unit.id === animatingUnitId && currentAnim && currentAnim.path.length > 0) {
        const animStartPos = currentAnim.path[currentAnim.currentStep];
        const animWorldPos = cellToWorld(animStartPos);
        const animCell = gameMap.cells[animStartPos.z]?.[animStartPos.x];
        const animTerrainHeight = animCell ? TERRAIN_CONFIGS[animCell.terrain].stats.height * CELL_SIZE : 0;
        mesh.position.set(animWorldPos.x, animTerrainHeight, animWorldPos.z);
      } else {
        mesh.position.set(worldPos.x, terrainHeight, worldPos.z);
      }

      if (unit.faction === 'blue') {
        mesh.rotation.y = Math.PI;
      }

      // Stealth visual effect - make unit semi-transparent with purple glow
      // v61.0: Dispose original material before cloning to prevent GPU leak
      if (unit.isStealthed && unit.faction === 'red') {
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            const orig = child.material;
            child.material = orig.clone();
            orig.dispose();
            child.material.transparent = true;
            child.material.opacity = 0.35;
            if (child.material.emissive) {
              child.material.emissive.set(0x9333ea);
              child.material.emissiveIntensity = 0.3;
            }
          }
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
            const orig = child.material;
            child.material = orig.clone();
            orig.dispose();
            child.material.transparent = true;
            child.material.opacity = Math.min(child.material.opacity, 0.35);
          }
        });
        // [REMOVED] Stealth indicator ring per user request
        // const stealthRingGeo = new THREE.RingGeometry(0.25, 0.3, 16);
        // const stealthRingMat = new THREE.MeshBasicMaterial({
        //   color: 0x9333ea,
        //   side: THREE.DoubleSide,
        //   transparent: true,
        //   opacity: 0.5,
        // });
        // const stealthRing = new THREE.Mesh(stealthRingGeo, stealthRingMat);
        // stealthRing.rotation.x = -Math.PI / 2;
        // stealthRing.position.y = 0.02;
        // mesh.add(stealthRing);
      }

      // === Hero visual effects ===
      if (unit.isHero) {
        mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            const orig = child.material;
            child.material = orig.clone();
            orig.dispose();
            child.material.emissive.set(0xffa500);
            child.material.emissiveIntensity = 0.15;
          }
        });
        mesh.scale.set(1.08, 1.08, 1.08);
        // [REMOVED] Hero ring indicator per user request
        // const heroRingGeo = new THREE.RingGeometry(0.32, 0.38, 24);
        // const heroRingMat = new THREE.MeshBasicMaterial({ color: 0xffd700, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
        // const heroRing = new THREE.Mesh(heroRingGeo, heroRingMat);
        // heroRing.rotation.x = -Math.PI / 2;
        // heroRing.position.y = 0.02;
        // heroRing.userData.isHeroRing = true;
        // mesh.add(heroRing);
      }

      // === Morale visual effects ===
      if (unit.stats.morale !== undefined && unit.stats.morale !== null) {
        const morale = unit.stats.morale;
        if (morale < 40) {
          // Low morale: red tint
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
              const orig = child.material;
              child.material = orig.clone();
              orig.dispose();
              child.material.emissive.set(0xff0000);
              child.material.emissiveIntensity = 0.15;
            }
          });
        }
        if (morale > 80) {
          // High morale: golden glow
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
              const orig = child.material;
              child.material = orig.clone();
              orig.dispose();
              child.material.emissive.set(0xffd700);
              child.material.emissiveIntensity = 0.12;
            }
          });
        }
        if (morale < 20) {
          // Panicked: add shaking animation via userData
          mesh.userData.isPanicked = true;
          mesh.userData.panicOffset = Math.random() * Math.PI * 2;
        }
      }

      // v62.0: Unit level badge sprite (level 2+)
      // v67.0: Enhanced with veterancy title
      if (unit.level > 1) {
        const vetTitle = getVeterancyTitle(unit);
        const badgeText = vetTitle ? `Lv${unit.level} ${vetTitle}` : `Lv${unit.level}`;
        const badgeWidth = vetTitle ? 96 : 64;
        const lvlCanvas = document.createElement('canvas');
        lvlCanvas.width = badgeWidth;
        lvlCanvas.height = 32;
        const lvlCtx = lvlCanvas.getContext('2d')!;
        lvlCtx.clearRect(0, 0, badgeWidth, 32);

        // Background pill — gradient for legendary
        const lvlColor = unit.level >= 4 ? '#fbbf24' : unit.level >= 3 ? '#a78bfa' : '#60a5fa';
        if (unit.killCount >= 5) {
          const gradient = lvlCtx.createLinearGradient(4, 0, badgeWidth - 4, 0);
          gradient.addColorStop(0, '#fbbf24');
          gradient.addColorStop(1, '#f87171');
          lvlCtx.fillStyle = gradient;
        } else {
          lvlCtx.fillStyle = lvlColor;
        }
        lvlCtx.beginPath();
        lvlCtx.roundRect(4, 4, badgeWidth - 8, 24, 8);
        lvlCtx.fill();

        // Level text
        lvlCtx.font = 'bold 14px sans-serif';
        lvlCtx.textAlign = 'center';
        lvlCtx.textBaseline = 'middle';
        lvlCtx.fillStyle = '#000000';
        lvlCtx.fillText(badgeText, badgeWidth / 2, 16);

        const lvlTexture = new THREE.CanvasTexture(lvlCanvas);
        lvlTexture.minFilter = THREE.LinearFilter;
        const lvlMat = new THREE.SpriteMaterial({
          map: lvlTexture,
          transparent: true,
          depthTest: false,
        });
        const lvlSprite = new THREE.Sprite(lvlMat);
        lvlSprite.scale.set(vetTitle ? 0.75 : 0.5, 0.25, 1);
        lvlSprite.position.y = 0.7;
        mesh.add(lvlSprite);
      }

      // === Veterancy 3D floating badge ===
      if (unit.isAlive) {
        const vetTitle = getVeterancyTitle(unit);
        if (vetTitle) {
          const badgeCanvas = createVeterancyBadgeCanvas(vetTitle);
          const badgeTexture = new THREE.CanvasTexture(badgeCanvas);
          badgeTexture.minFilter = THREE.LinearFilter;
          const badgeMat = new THREE.SpriteMaterial({
            map: badgeTexture,
            transparent: true,
            depthTest: false,
          });
          const badgeSprite = new THREE.Sprite(badgeMat);
          const badgeScale = vetTitle === '传奇' ? 0.38 : vetTitle === '精英' ? 0.35 : 0.3;
          badgeSprite.scale.set(badgeScale, badgeScale, 1);
          badgeSprite.position.y = 1.1;
          badgeSprite.name = 'veteranBadge';
          badgeSprite.userData.veterancyTitle = vetTitle;
          badgeSprite.userData.floatOffset = Math.random() * Math.PI * 2;
          mesh.add(badgeSprite);
        }
      }

      unitGroup.add(mesh);
      unitMeshes.set(unit.id, mesh);
    }

    // v62.0: Bump mesh version so cached _unitGroupArray is rebuilt
    sceneRef.current._unitGroupArrayVersion = (sceneRef.current._unitGroupArrayVersion || 0) + 1;

    // Update prev alive map
    const newAliveMap = new Map<string, boolean>();
    for (const unit of units) {
      newAliveMap.set(unit.id, unit.isAlive);
    }
    sceneRef.current.prevUnitAliveMap = newAliveMap;
  // v77.0: Depend on unitStructureKey instead of units — avoids full rebuild on stat-only changes
  }, [unitStructureKey, gameMap, createUnitMesh, cellToWorld, isAnimating]);

  // ===== Update Highlights =====
  useEffect(() => {
    if (!sceneRef.current) return;
    const { highlightGroup } = sceneRef.current;

    // Clear old highlights — v34.0: Dispose geometries/materials to prevent GPU memory leak
    // v62.0: Also dispose Sprite textures
    while (highlightGroup.children.length > 0) {
      const child = highlightGroup.children[0];
      highlightGroup.remove(child);
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else if (obj.material) obj.material.dispose();
        }
        if (obj instanceof THREE.Sprite) {
          if (obj.material instanceof THREE.SpriteMaterial && obj.material.map) {
            obj.material.map.dispose();
          }
          obj.material?.dispose();
        }
      });
    }

    // Movable positions - enhanced with distance-based opacity gradient (v23.0)
    for (const pos of movablePositions) {
      const worldPos = cellToWorld(pos);
      const cell = gameMap.cells[pos.z]?.[pos.x];
      const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
      if (!selectedUnit) continue;
      const dist = Math.abs(pos.x - selectedUnit.position.x) + Math.abs(pos.z - selectedUnit.position.z);
      // v40.0: Fixed wrong property path (was moveRange, should be stats.moveRange)
      const maxDist = selectedUnit.stats.moveRange || 3;
      const distRatio = dist / maxDist;
      // Distance-based opacity: closer = more opaque, further = more transparent
      const baseOpacity = 0.6 - distRatio * 0.25;

      // Glow backing plane (larger, softer glow)
      const glowGeo = new THREE.PlaneGeometry(CELL_SIZE * 1.15, CELL_SIZE * 1.15);
      const glowMat = new THREE.MeshBasicMaterial({
        color: distRatio > 0.7 ? 0xffe082 : 0x81c784, // Yellow tint for far cells
        transparent: true,
        opacity: baseOpacity * 0.3,
        side: THREE.DoubleSide
      });
      const glowPlane = new THREE.Mesh(glowGeo, glowMat);
      glowPlane.rotation.x = -Math.PI / 2;
      glowPlane.position.set(worldPos.x, terrainHeight + 0.015, worldPos.z);
      highlightGroup.add(glowPlane);

      // Main highlight plane (brighter)
      const geo = new THREE.PlaneGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9);
      const mat = new THREE.MeshBasicMaterial({
        color: distRatio > 0.7 ? 0x8bc34a : 0x4caf50,
        transparent: true,
        opacity: baseOpacity,
        side: THREE.DoubleSide
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(worldPos.x, terrainHeight + 0.02, worldPos.z);
      highlightGroup.add(plane);

      // Bright edges
      const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL_SIZE * 0.9, 0.01, CELL_SIZE * 0.9));
      const edgesMat = new THREE.LineBasicMaterial({ color: 0x66bb6a, linewidth: 2 });
      const edges = new THREE.LineSegments(edgesGeo, edgesMat);
      edges.position.set(worldPos.x, terrainHeight + 0.02, worldPos.z);
      highlightGroup.add(edges);

      // Footprint / movement arrow indicator (small cone pointing down)
      const arrowGeo = new THREE.ConeGeometry(0.08, 0.12, 4);
      const arrowMat = new THREE.MeshBasicMaterial({
        color: 0xa5d6a7,
        transparent: true,
        opacity: 0.7,
      });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.set(worldPos.x, terrainHeight + 0.12, worldPos.z);
      arrow.rotation.x = Math.PI; // Point downward
      highlightGroup.add(arrow);
    }

    // Attackable positions - enhanced with brighter glow and crosshair indicators (only show for cells with alive enemy units)
    for (const pos of attackablePositions) {
      const allUnits = useGameStore.getState().units;
      const target = allUnits.find(u =>
        u.isAlive && u.position.x === pos.x && u.position.z === pos.z &&
        u.faction !== selectedUnit?.faction
      );
      if (!target) continue;

      if (target.isStealthed && !isUnitDetected(useGameStore.getState(), target, selectedUnit?.faction || ('red' as Faction))) continue;

      const worldPos = cellToWorld(pos);
      const cell = gameMap.cells[pos.z]?.[pos.x];
      const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

      // Red glow backing plane (larger, pulsing feel)
      const glowGeo = new THREE.PlaneGeometry(CELL_SIZE * 1.15, CELL_SIZE * 1.15);
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xef9a9a,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
      });
      const glowPlane = new THREE.Mesh(glowGeo, glowMat);
      glowPlane.rotation.x = -Math.PI / 2;
      glowPlane.position.set(worldPos.x, terrainHeight + 0.015, worldPos.z);
      highlightGroup.add(glowPlane);

      // Main highlight plane (brighter)
      const geo = new THREE.PlaneGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xf44336,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(worldPos.x, terrainHeight + 0.02, worldPos.z);
      highlightGroup.add(plane);

      // Bright red edges
      const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(CELL_SIZE * 0.9, 0.01, CELL_SIZE * 0.9));
      const edgesMat = new THREE.LineBasicMaterial({ color: 0xef5350, linewidth: 2 });
      const edges = new THREE.LineSegments(edgesGeo, edgesMat);
      edges.position.set(worldPos.x, terrainHeight + 0.02, worldPos.z);
      highlightGroup.add(edges);

      // Crosshair indicator (cross shape on the cell)
      const crossMat = new THREE.MeshBasicMaterial({
        color: 0xff8a80,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      // Horizontal bar of crosshair
      const crossHGeo = new THREE.PlaneGeometry(CELL_SIZE * 0.55, 0.04);
      const crossH = new THREE.Mesh(crossHGeo, crossMat);
      crossH.rotation.x = -Math.PI / 2;
      crossH.position.set(worldPos.x, terrainHeight + 0.025, worldPos.z);
      highlightGroup.add(crossH);
      // Vertical bar of crosshair
      const crossVGeo = new THREE.PlaneGeometry(0.04, CELL_SIZE * 0.55);
      const crossV = new THREE.Mesh(crossVGeo, crossMat.clone());
      crossV.rotation.x = -Math.PI / 2;
      crossV.position.set(worldPos.x, terrainHeight + 0.025, worldPos.z);
      highlightGroup.add(crossV);

      // Small ring around the crosshair center
      const ringGeo = new THREE.RingGeometry(0.12, 0.16, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xff5252,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(worldPos.x, terrainHeight + 0.026, worldPos.z);
      highlightGroup.add(ring);
    }

    // v62.0: Damage prediction sprites on attackable cells
    if (selectedUnit) {
      const allUnits = useGameStore.getState().units;
      for (const pos of attackablePositions) {
        const target = allUnits.find(u =>
          u.isAlive && u.position.x === pos.x && u.position.z === pos.z &&
          u.faction !== selectedUnit.faction
        );
        if (!target) continue;

        // Check stealth detection
        if (target.isStealthed && !isUnitDetected(useGameStore.getState(), target, selectedUnit.faction)) continue;

        // v63.0: Pass the correct defender cell (not gameMap) to estimateDamage
        const targetCell = gameMap.cells[pos.z]?.[pos.x];
        if (!targetCell) continue;
        const estimate = engineEstimateDamage(selectedUnit, target, targetCell);
        // v63.0: estimateDamage returns { min, max } — use max for display
        const avgDmg = (estimate.min + estimate.max) / 2;
        if (avgDmg <= 0) continue;

        const worldPos = cellToWorld(pos);
        const cell = gameMap.cells[pos.z]?.[pos.x];
        const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

        // v88.0: Draw on shared canvas, then CLONE before creating texture (avoids shared buffer race)
        const canvas = _sharedLabelCanvas || document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const ctx = _sharedLabelCtx || canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 128, 64);

        // Damage number
        const dmgText = Math.round(avgDmg).toString();
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Kill indicator: show in bright yellow if likely kill
        const isKill = estimate.min >= target.stats.hp;
        if (isKill) {
          ctx.fillStyle = '#fbbf24';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.strokeText(dmgText, 64, 28);
          ctx.fillText(dmgText, 64, 28);
        } else {
          ctx.fillStyle = '#ff6b6b';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3;
          ctx.strokeText(dmgText, 64, 28);
          ctx.fillText(dmgText, 64, 28);
        }

        // v64.0: Use calculateKillProbability for accurate kill %
        const killResult = calculateKillProbability(selectedUnit, target, targetCell, false, currentWeather, undefined, allUnits);
        const killPct = killResult.killProbability;
        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = isKill ? '#fbbf24' : 'rgba(255,255,255,0.7)';
        ctx.fillText(`${killPct}%`, 64, 52);

        // v88.0: Clone canvas to avoid shared buffer — each sprite gets its own texture data
        const texture = new THREE.CanvasTexture(_cloneCanvas(canvas, 128, 64));
        texture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(0.8, 0.4, 1);
        sprite.position.set(worldPos.x, terrainHeight + 0.55, worldPos.z);
        highlightGroup.add(sprite);
      }
    }

    // Supply truck healing radius indicator
    if (selectedUnit && selectedUnit.type === 'supply') {
      // v55.0: Use getHeroSupplyBonus for accurate range (angel_heal_passive +1 range)
      const heroBonus = getHeroSupplyBonus(selectedUnit);
      const healRange = (UNIT_CONFIGS.supply.healRange ?? 1) + heroBonus.rangeBonus;
      for (let dz = -healRange; dz <= healRange; dz++) {
        for (let dx = -healRange; dx <= healRange; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = selectedUnit.position.x + dx;
          const nz = selectedUnit.position.z + dz;
          if (nx < 0 || nx >= MAP_WIDTH || nz < 0 || nz >= MAP_HEIGHT) continue;
          const dist = Math.abs(dx) + Math.abs(dz);
          if (dist > healRange) continue;
          // Don't overlap with movable/attackable highlights
          if (movablePositions.some(p => p.x === nx && p.z === nz)) continue;
          if (attackablePositions.some(p => p.x === nx && p.z === nz)) continue;
          
          const worldPos = cellToWorld({ x: nx, z: nz });
          const cell = gameMap.cells[nz]?.[nx];
          const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

          // v28.0: Subtle green heal aura highlight
          const geo = new THREE.PlaneGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9);
          const mat = new THREE.MeshBasicMaterial({
            color: 0x22c55e,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
          });
          const plane = new THREE.Mesh(geo, mat);
          plane.rotation.x = -Math.PI / 2;
          plane.position.set(worldPos.x, terrainHeight + 0.015, worldPos.z);
          highlightGroup.add(plane);

          // Green cross marker
          const crossH = new THREE.PlaneGeometry(CELL_SIZE * 0.4, CELL_SIZE * 0.08);
          const crossMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
          const cross1 = new THREE.Mesh(crossH, crossMat);
          cross1.rotation.x = -Math.PI / 2;
          cross1.position.set(worldPos.x, terrainHeight + 0.025, worldPos.z);
          highlightGroup.add(cross1);
          
          const crossV = new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE * 0.08, CELL_SIZE * 0.4), crossMat.clone());
          crossV.rotation.x = -Math.PI / 2;
          crossV.position.set(worldPos.x, terrainHeight + 0.025, worldPos.z);
          highlightGroup.add(crossV);
        }
      }
    }

    // SAM anti-air interception range indicator
    if (selectedUnit && selectedUnit.type === 'sam') {
      const samConfig = UNIT_CONFIGS.sam as typeof UNIT_CONFIGS.sam & { antiAirRange?: number };
      const aaRange = samConfig.antiAirRange ?? 2;
      for (let dz = -aaRange; dz <= aaRange; dz++) {
        for (let dx = -aaRange; dx <= aaRange; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = selectedUnit.position.x + dx;
          const nz = selectedUnit.position.z + dz;
          if (nx < 0 || nx >= MAP_WIDTH || nz < 0 || nz >= MAP_HEIGHT) continue;
          const dist = Math.abs(dx) + Math.abs(dz);
          if (dist > aaRange) continue;
          // Don't overlap with movable/attackable highlights
          if (movablePositions.some(p => p.x === nx && p.z === nz)) continue;
          if (attackablePositions.some(p => p.x === nx && p.z === nz)) continue;
          
          const worldPos = cellToWorld({ x: nx, z: nz });
          const cell = gameMap.cells[nz]?.[nx];
          const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

          const geo = new THREE.PlaneGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9);
          const mat = new THREE.MeshBasicMaterial({
            color: 0x42a5f5,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide
          });
          const plane = new THREE.Mesh(geo, mat);
          plane.rotation.x = -Math.PI / 2;
          plane.position.set(worldPos.x, terrainHeight + 0.012, worldPos.z);
          highlightGroup.add(plane);
        }
      }
    }

    // Engineer fortification build indicator
    if (selectedUnit && selectedUnit.type === 'engineer' && selectedUnit.canMove && selectedUnit.canAttack) {
      const cell = gameMap.cells[selectedUnit.position.z]?.[selectedUnit.position.x];
      if (cell && !cell.fortified) {
        const worldPos = cellToWorld(selectedUnit.position);
        const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
        
        // Pulsing orange construction indicator
        const fortIndicatorGeo = new THREE.RingGeometry(0.3, 0.45, 6);
        const fortIndicatorMat = new THREE.MeshBasicMaterial({
          color: 0xffa000,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        const fortIndicator = new THREE.Mesh(fortIndicatorGeo, fortIndicatorMat);
        fortIndicator.rotation.x = -Math.PI / 2;
        fortIndicator.position.set(worldPos.x, terrainHeight + 0.025, worldPos.z);
        highlightGroup.add(fortIndicator);

        // Small construction icon (crossed tools shape)
        const toolGeo1 = new THREE.BoxGeometry(0.2, 0.015, 0.03);
        const toolMat = new THREE.MeshBasicMaterial({ color: 0xffa000, transparent: true, opacity: 0.8 });
        const tool1 = new THREE.Mesh(toolGeo1, toolMat);
        tool1.rotation.x = -Math.PI / 2;
        tool1.rotation.z = Math.PI / 4;
        tool1.position.set(worldPos.x, terrainHeight + 0.03, worldPos.z);
        highlightGroup.add(tool1);
        
        const toolGeo2 = new THREE.BoxGeometry(0.2, 0.015, 0.03);
        const tool2 = new THREE.Mesh(toolGeo2, toolMat.clone());
        tool2.rotation.x = -Math.PI / 2;
        tool2.rotation.z = -Math.PI / 4;
        tool2.position.set(worldPos.x, terrainHeight + 0.03, worldPos.z);
        highlightGroup.add(tool2);
      }
    }

    // [REMOVED] Vision range circle indicator (v23.0)

    // [REMOVED] Attack range ring indicator for selected unit

    // Selected unit highlight
    if (selectedUnit) {
      const worldPos = cellToWorld(selectedUnit.position);
      const cell = gameMap.cells[selectedUnit.position.z]?.[selectedUnit.position.x];
      const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

      const geo = new THREE.PlaneGeometry(CELL_SIZE * 0.95, CELL_SIZE * 0.95);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffeb3b,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
      });
      const plane = new THREE.Mesh(geo, mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(worldPos.x, terrainHeight + 0.015, worldPos.z);
      highlightGroup.add(plane);
    }

    // ===== Terrain Defense Bonus Overlay =====
    // Show colored overlays on cells with positive defense bonuses when toggle is on
    if (showDefenseOverlay && selectedUnit) {
      for (let z = 0; z < MAP_HEIGHT; z++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const cell = gameMap.cells[z]?.[x];
          if (!cell) continue;

          let defenseBonus = TERRAIN_CONFIGS[cell.terrain]?.stats.defenseBonus ?? 0;
          // Add fortify bonus if cell is fortified
          if (cell.fortified) {
            defenseBonus += FORTIFY_DEFENSE_BONUS;
          }
          if (defenseBonus <= 0) continue;

          const worldPos = cellToWorld({ x, z });
          const terrainCfg = TERRAIN_CONFIGS[cell.terrain];
          const terrainHeight = terrainCfg ? terrainCfg.stats.height * CELL_SIZE : 0;

          // Color coding based on defense bonus ranges
          let overlayColor: number;
          if (defenseBonus >= 35) {
            overlayColor = 0xffd700; // Gold — fortress (35) or fortified cells (35+)
          } else if (defenseBonus >= 20) {
            overlayColor = 0x42a5f5; // Blue — mountain (25), city (20)
          } else if (defenseBonus >= 10) {
            overlayColor = 0x66bb6a; // Green — forest (15)
          } else {
            overlayColor = 0x81c784; // Light green — low bonus (10)
          }

          // Glow backing
          const glowGeo = new THREE.PlaneGeometry(CELL_SIZE * 1.1, CELL_SIZE * 1.1);
          const glowMat = new THREE.MeshBasicMaterial({
            color: overlayColor,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
          });
          const glowPlane = new THREE.Mesh(glowGeo, glowMat);
          glowPlane.rotation.x = -Math.PI / 2;
          glowPlane.position.set(worldPos.x, terrainHeight + 0.005, worldPos.z);
          highlightGroup.add(glowPlane);

          // Main overlay plane
          const geo = new THREE.PlaneGeometry(CELL_SIZE * 0.92, CELL_SIZE * 0.92);
          const mat = new THREE.MeshBasicMaterial({
            color: overlayColor,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
          });
          const plane = new THREE.Mesh(geo, mat);
          plane.rotation.x = -Math.PI / 2;
          plane.position.set(worldPos.x, terrainHeight + 0.01, worldPos.z);
          highlightGroup.add(plane);

          // Small defense value label — v88.0: use shared canvas + clone for texture
          const defCanvas = _sharedLabelCanvas || document.createElement('canvas');
          defCanvas.width = 64;
          defCanvas.height = 32;
          const defCtx = _sharedLabelCtx || defCanvas.getContext('2d')!;
          defCtx.clearRect(0, 0, 64, 32);
          defCtx.font = 'bold 18px sans-serif';
          defCtx.textAlign = 'center';
          defCtx.textBaseline = 'middle';
          defCtx.fillStyle = '#ffffff';
          defCtx.shadowColor = 'rgba(0,0,0,0.8)';
          defCtx.shadowBlur = 2;
          defCtx.fillText(`+${defenseBonus}`, 32, 16);
          defCtx.shadowBlur = 0;

          // v88.0: Clone canvas to avoid shared buffer race
          const texture = new THREE.CanvasTexture(_cloneCanvas(defCanvas, 64, 32));
          texture.minFilter = THREE.LinearFilter;
          const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 0.7,
            depthTest: false,
          });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.scale.set(0.5, 0.25, 1);
          sprite.position.set(worldPos.x, terrainHeight + 0.35, worldPos.z);
          highlightGroup.add(sprite);
        }
      }
    }
  }, [movablePositions, attackablePositions, selectedUnit, gameMap, cellToWorld, showDefenseOverlay]);

  // ===== 2 & 5. Attack Detection - Flash + Muzzle Flash Particles =====
  useEffect(() => {
    if (!sceneRef.current) return;

    const prevPositions = sceneRef.current.lastAttackablePositions;
    const currPositions = attackablePositions;

    // When attackable positions appear, add flash effect on those cells
    if (currPositions.length > 0 && prevPositions.length === 0) {
      for (const pos of currPositions) {
        const worldPos = cellToWorld(pos);
        const cell = gameMap.cells[pos.z]?.[pos.x];
        const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;

        const flashGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
        const flashMat = new THREE.MeshBasicMaterial({
          color: 0xff4444,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
        });
        const flashMesh = new THREE.Mesh(flashGeo, flashMat);
        flashMesh.rotation.x = -Math.PI / 2;
        flashMesh.position.set(worldPos.x, terrainHeight + 0.03, worldPos.z);
        sceneRef.current.scene.add(flashMesh);
        sceneRef.current.attackFlashes.push({
          mesh: flashMesh,
          startTime: Date.now(),
        });
      }
    }

    // When attackable positions disappear (attack was executed) - spawn muzzle flash
    if (prevPositions.length > 0 && currPositions.length === 0 && selectedUnit) {
      const attackerWorldPos = cellToWorld(selectedUnit.position);
      const attackerCell = gameMap.cells[selectedUnit.position.z]?.[selectedUnit.position.x];
      const attackerTerrainHeight = attackerCell ? TERRAIN_CONFIGS[attackerCell.terrain].stats.height * CELL_SIZE : 0;

      const muzzlePos = new THREE.Vector3(attackerWorldPos.x, attackerTerrainHeight + 0.3, attackerWorldPos.z);
      // Find the first previously attackable position as the target direction
      if (prevPositions.length > 0) {
        const target = prevPositions[0];
        const attackDir = new THREE.Vector3(
          target.x - selectedUnit.position.x,
          0,
          target.z - selectedUnit.position.z
        );
        sceneRef.current.particleManager?.spawnMuzzleFlash(muzzlePos, attackDir);
      }
    }

    sceneRef.current.lastAttackablePositions = [...currPositions];
  }, [attackablePositions, selectedUnit, gameMap, cellToWorld]);

  // ===== 7. Fog of War =====
  useEffect(() => {
    if (!sceneRef.current) return;
    const { fogGroup } = sceneRef.current;

    // Clear old fog
    while (fogGroup.children.length > 0) {
      const child = fogGroup.children[0];
      fogGroup.remove(child);
      // v74.0: Don't dispose geometry/material per-child (shared resources — disposed below)
    }
    // v74.0: Dispose shared fog resources from previous render
    const prevGeo = (fogGroup as any)._sharedFogGeo as THREE.BufferGeometry | undefined;
    const prevMat = (fogGroup as any)._sharedFogMat as THREE.Material | undefined;
    if (prevGeo) prevGeo.dispose();
    if (prevMat) prevMat.dispose();
    // v93.0: Dispose shared fog edge resources from previous render
    const prevEdgeGeo = (fogGroup as any)._sharedFogEdgeGeo as THREE.BufferGeometry | undefined;
    const prevEdgeMat = (fogGroup as any)._sharedFogEdgeMat as THREE.Material | undefined;
    const prevEdgeTex = (fogGroup as any)._sharedFogEdgeTex as THREE.Texture | undefined;
    if (prevEdgeGeo) prevEdgeGeo.dispose();
    if (prevEdgeMat) prevEdgeMat.dispose();
    if (prevEdgeTex) prevEdgeTex.dispose();

    // Compute visible cells for current player
    const playerUnits = units.filter(u => u.faction === currentFaction);
    const visibleCells = computeVisibleCells(playerUnits, gameMap.cells as { terrain: string }[][], currentWeather);

    // v74.0: Shared geometry/material for fog meshes (avoids per-cell allocation)
    const fogGeo = new THREE.PlaneGeometry(CELL_TOTAL, CELL_TOTAL);
    const fogMat = new THREE.MeshBasicMaterial({
      color: 0x0a0f18,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });

    // Create fog overlay for non-visible cells
    for (let z = 0; z < MAP_HEIGHT; z++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const key = `${x},${z}`;
        if (!visibleCells.has(key)) {
          const cell = gameMap.cells[z]?.[x];
          const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
          const worldPos = cellToWorld({ x, z });

          const fogMesh = new THREE.Mesh(fogGeo, fogMat);
          fogMesh.rotation.x = -Math.PI / 2;
          fogMesh.position.set(worldPos.x, terrainHeight + 0.08, worldPos.z);
          fogGroup.add(fogMesh);
        }
      }
    }
    // Store shared refs for cleanup
    (fogGroup as any)._sharedFogGeo = fogGeo;
    (fogGroup as any)._sharedFogMat = fogMat;

    // v93.0: Fog of War edge softening — gradient transition at fog/visible boundaries
    const EDGE_DEPTH = 0.5 * CELL_TOTAL;
    const edgeTexSize = 64;
    const edgeCanvas = document.createElement('canvas');
    edgeCanvas.width = edgeTexSize;
    edgeCanvas.height = edgeTexSize;
    const edgeCtx = edgeCanvas.getContext('2d')!;
    // Linear gradient: white (opaque) → black (transparent) used as alphaMap
    const edgeGrad = edgeCtx.createLinearGradient(0, 0, edgeTexSize, 0);
    edgeGrad.addColorStop(0, '#ffffff');
    edgeGrad.addColorStop(1, '#000000');
    edgeCtx.fillStyle = edgeGrad;
    edgeCtx.fillRect(0, 0, edgeTexSize, edgeTexSize);
    const edgeAlphaTex = new THREE.CanvasTexture(edgeCanvas);
    edgeAlphaTex.minFilter = THREE.LinearFilter;
    edgeAlphaTex.magFilter = THREE.LinearFilter;

    // Shared geometry & material for all edge gradient meshes
    const edgeGeo = new THREE.PlaneGeometry(EDGE_DEPTH, CELL_TOTAL);
    const edgeMat = new THREE.MeshBasicMaterial({
      color: 0x0a0a1a,
      transparent: true,
      opacity: 0.7,
      alphaMap: edgeAlphaTex,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Cardinal neighbor offsets
    const fogEdgeDirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let z = 0; z < MAP_HEIGHT; z++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const key = `${x},${z}`;
        if (visibleCells.has(key)) continue; // only process fogged cells

        const cell = gameMap.cells[z]?.[x];
        const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
        const worldPos = cellToWorld({ x, z });

        for (const [dx, dz] of fogEdgeDirs) {
          const nx = x + dx;
          const nz = z + dz;
          if (nx < 0 || nx >= MAP_WIDTH || nz < 0 || nz >= MAP_HEIGHT) continue;
          const nKey = `${nx},${nz}`;
          if (!visibleCells.has(nKey)) continue; // skip if neighbor is also fogged

          // v93.0: Neighbor is visible — add softening gradient mesh at boundary
          const nCell = gameMap.cells[nz]?.[nx];
          const nTerrainHeight = nCell ? TERRAIN_CONFIGS[nCell.terrain].stats.height * CELL_SIZE : 0;
          // Use max height so edge mesh isn't buried under taller terrain
          const edgeHeight = Math.max(terrainHeight, nTerrainHeight);

          const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
          edgeMesh.rotation.x = -Math.PI / 2;
          // Rotate around Y so gradient UV points from fog boundary into visible area
          // atan2(-dz, dx) maps local +X to the direction (dx, dz) in world XZ
          edgeMesh.rotation.y = Math.atan2(-dz, dx);

          // Position: offset from fog cell center toward the visible neighbor
          edgeMesh.position.x = worldPos.x + dx * (CELL_TOTAL / 2 + EDGE_DEPTH / 2);
          edgeMesh.position.z = worldPos.z + dz * (CELL_TOTAL / 2 + EDGE_DEPTH / 2);
          edgeMesh.position.y = edgeHeight + 0.08;

          fogGroup.add(edgeMesh);
        }
      }
    }

    // Store edge shared refs for cleanup
    (fogGroup as any)._sharedFogEdgeGeo = edgeGeo;
    (fogGroup as any)._sharedFogEdgeMat = edgeMat;
    (fogGroup as any)._sharedFogEdgeTex = edgeAlphaTex;
  // v93.0: Depend on unitStructureKey instead of units — fog only depends on position/alive/faction,
  // not on stat changes like HP/ammo. Eliminates ~300 mesh rebuilds per stat change.
  }, [unitStructureKey, currentFaction, gameMap, cellToWorld, currentWeather]);

  // ===== 8. Weather Visual Effects =====
  useEffect(() => {
    if (!sceneRef.current) return;
    const { weatherGroup, scene, ambientLight, directionalLight, hemisphereLight } = sceneRef.current;

    // Cleanup function for weather objects
    const cleanupWeather = () => {
      // Dispose and remove weather points
      if (sceneRef.current?.weatherPoints) {
        weatherGroup.remove(sceneRef.current.weatherPoints);
        sceneRef.current.weatherPoints.geometry.dispose();
        (sceneRef.current.weatherPoints.material as THREE.Material).dispose();
        sceneRef.current.weatherPoints = null;
      }
      // Dispose and remove fog plane
      if (sceneRef.current?.weatherFogPlane) {
        weatherGroup.remove(sceneRef.current.weatherFogPlane);
        sceneRef.current.weatherFogPlane.geometry.dispose();
        (sceneRef.current.weatherFogPlane.material as THREE.Material).dispose();
        sceneRef.current.weatherFogPlane = null;
      }
      // Dispose and remove sandstorm fog overlay
      if (sceneRef.current?.weatherSandFogPlane) {
        weatherGroup.remove(sceneRef.current.weatherSandFogPlane);
        sceneRef.current.weatherSandFogPlane.geometry.dispose();
        (sceneRef.current.weatherSandFogPlane.material as THREE.Material).dispose();
        sceneRef.current.weatherSandFogPlane = null;
      }
      // Dispose and remove rain line segments
      if (sceneRef.current?.weatherRainLines) {
        const rl = sceneRef.current.weatherRainLines;
        weatherGroup.remove(rl);
        rl.traverse(child => {
          if (child instanceof THREE.LineSegments) {
            child.geometry.dispose();
            (child.material as THREE.Material).dispose();
          }
        });
        sceneRef.current.weatherRainLines = null;
      }
      // Dispose and remove drifting fog planes
      if (sceneRef.current) {
        for (const dp of sceneRef.current.weatherDriftFogPlanes) {
          weatherGroup.remove(dp);
          dp.geometry.dispose();
          (dp.material as THREE.Material).dispose();
        }
        sceneRef.current.weatherDriftFogPlanes = [];
        // Clear data arrays
        sceneRef.current.weatherParticlePositions = null;
        sceneRef.current.weatherParticleVelocities = null;
        sceneRef.current.weatherParticleOffsets = null;
        sceneRef.current.weatherParticleYVelocities = null;
        // v91.0: Cleanup rain splash rings
        for (const splash of sceneRef.current.rainSplashRings) {
          weatherGroup.remove(splash.mesh);
          // v92.0: Don't dispose pooled materials — they're reused
        }
        sceneRef.current.rainSplashRings = [];
        // v92.0: Dispose pooled materials (only on full cleanup)
        for (const mat of sceneRef.current.rainSplashMaterialPool) {
          mat.dispose();
        }
      }
    };

    // ===== Weather lighting configs =====
    const WEATHER_LIGHT_CONFIGS: Record<WeatherType, {
      ambientIntensity: number;
      ambientColor: THREE.Color;
      dirIntensity: number;
      dirColor: THREE.Color;
      hemiIntensity: number;
      useSceneFog: boolean;
      fogNear: number;
      fogFar: number;
    }> = {
      clear: {
        ambientIntensity: 0.5,
        ambientColor: new THREE.Color(0xffffff),
        dirIntensity: 1.0,
        dirColor: new THREE.Color(0xffffff),
        hemiIntensity: 0.3,
        useSceneFog: false,
        fogNear: 40,
        fogFar: 80,
      },
      rain: {
        ambientIntensity: 0.3,
        ambientColor: new THREE.Color(0x8899bb),
        dirIntensity: 0.5,
        dirColor: new THREE.Color(0x99aacc),
        hemiIntensity: 0.15,
        useSceneFog: false,
        fogNear: 40,
        fogFar: 80,
      },
      snow: {
        ambientIntensity: 0.55,
        ambientColor: new THREE.Color(0xd0dde8),
        dirIntensity: 0.7,
        dirColor: new THREE.Color(0xe0e8f0),
        hemiIntensity: 0.25,
        useSceneFog: false,
        fogNear: 40,
        fogFar: 80,
      },
      fog: {
        ambientIntensity: 0.35,
        ambientColor: new THREE.Color(0xb0b8c0),
        dirIntensity: 0.3,
        dirColor: new THREE.Color(0xc0c8d0),
        hemiIntensity: 0.15,
        useSceneFog: true,
        fogNear: 8,
        fogFar: 22,
      },
      sandstorm: {
        ambientIntensity: 0.45,
        ambientColor: new THREE.Color(0xd4a843),
        dirIntensity: 0.6,
        dirColor: new THREE.Color(0xe0c060),
        hemiIntensity: 0.2,
        useSceneFog: true,
        fogNear: 6,
        fogFar: 18,
      },
    };

    // ===== Start smooth lighting transition =====
    const config = WEATHER_LIGHT_CONFIGS[currentWeather];
    sceneRef.current.weatherLightTransition = {
      startTime: Date.now(),
      duration: 2000, // 2 second smooth transition
      fromAmbientIntensity: ambientLight.intensity,
      fromAmbientColor: ambientLight.color.clone(),
      fromDirIntensity: directionalLight.intensity,
      fromDirColor: directionalLight.color.clone(),
      fromHemiIntensity: hemisphereLight.intensity,
      toAmbientIntensity: config.ambientIntensity,
      toAmbientColor: config.ambientColor.clone(),
      toDirIntensity: config.dirIntensity,
      toDirColor: config.dirColor.clone(),
      toHemiIntensity: config.hemiIntensity,
      toFogNear: config.fogNear,
      toFogFar: config.fogFar,
      toSceneFog: config.useSceneFog,
    };

    // Fade-in for particle effects
    sceneRef.current.weatherFadeIn = {
      startTime: Date.now() + 500, // start fading in after 500ms
      duration: 1500,
    };

    // Clear previous weather effects
    cleanupWeather();

    if (currentWeather === 'clear') return;

    if (currentWeather === 'rain') {
      // ===== Rain: 1000 particles for point splash effect + line segment streaks =====
      const count = 1000;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 22;
        positions[i * 3 + 1] = Math.random() * 10;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 18;
        velocities[i] = 8 + Math.random() * 4;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        color: 0xaaccff,
        size: 0.04,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        sizeAttenuation: true,
      });
      material.userData = { baseOpacity: 0.5 };

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      weatherGroup.add(points);

      sceneRef.current.weatherPoints = points;
      sceneRef.current.weatherParticlePositions = positions;
      sceneRef.current.weatherParticleVelocities = velocities;

      // ===== Rain streak line segments (vertical blue streaks) =====
      const rainLineGroup = new THREE.Group();
      const lineCount = 200;
      const linePositions: number[] = [];
      const streakLength = 0.4;
      const windAngle = 0.06; // slight wind tilt

      for (let i = 0; i < lineCount; i++) {
        const x = (Math.random() - 0.5) * 22;
        const y = Math.random() * 8;
        const z = (Math.random() - 0.5) * 18;
        // Line from top to bottom of streak
        linePositions.push(x, y, z);
        linePositions.push(x - windAngle * streakLength, y - streakLength, z);
      }

      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));

      const lineMat = new THREE.LineBasicMaterial({
        color: 0x88aaee,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      });

      const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
      lineSegments.frustumCulled = false;
      rainLineGroup.add(lineSegments);
      rainLineGroup.userData = { material: lineMat, baseOpacity: 0.4 };
      weatherGroup.add(rainLineGroup);

      sceneRef.current.weatherRainLines = rainLineGroup;

    } else if (currentWeather === 'snow') {
      // ===== Snow: 500 particles, slow falling with sinusoidal wobble =====
      const count = 500;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count);
      const offsets = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 22;
        positions[i * 3 + 1] = Math.random() * 10;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 18;
        velocities[i] = 0.8 + Math.random() * 1.5;
        offsets[i] = Math.random() * Math.PI * 2;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.08,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        sizeAttenuation: true,
      });
      material.userData = { baseOpacity: 0.85 };

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      weatherGroup.add(points);

      sceneRef.current.weatherPoints = points;
      sceneRef.current.weatherParticlePositions = positions;
      sceneRef.current.weatherParticleVelocities = velocities;
      sceneRef.current.weatherParticleOffsets = offsets;

    } else if (currentWeather === 'fog') {
      // ===== Fog: multiple drifting fog planes at different heights + scene fog =====
      const mapW = MAP_WIDTH * CELL_TOTAL + 4;
      const mapH = MAP_HEIGHT * CELL_TOTAL + 4;

      // Ground-level fog plane
      const fogGeo = new THREE.PlaneGeometry(mapW, mapH);
      const fogMat = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fogPlane = new THREE.Mesh(fogGeo, fogMat);
      fogPlane.rotation.x = -Math.PI / 2;
      fogPlane.position.y = 0.15;
      fogPlane.frustumCulled = false;
      weatherGroup.add(fogPlane);

      sceneRef.current.weatherFogPlane = fogPlane;

      // Drifting fog planes at different heights for volumetric effect
      const driftPlanes: THREE.Mesh[] = [];
      const fogPlaneConfigs = [
        { y: 0.4, opacity: 0.12, size: 18, speed: 0.15, amplitude: 2.0 },
        { y: 0.8, opacity: 0.08, size: 22, speed: 0.1, amplitude: 2.5 },
        { y: 1.2, opacity: 0.06, size: 26, speed: 0.08, amplitude: 3.0 },
        { y: 0.2, opacity: 0.15, size: 20, speed: 0.2, amplitude: 1.5 },
        { y: 0.6, opacity: 0.10, size: 24, speed: 0.12, amplitude: 2.2 },
      ];

      for (const cfg of fogPlaneConfigs) {
        const dGeo = new THREE.PlaneGeometry(cfg.size, cfg.size);
        const dMat = new THREE.MeshBasicMaterial({
          color: 0xd8d8d8,
          transparent: true,
          opacity: cfg.opacity,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const dPlane = new THREE.Mesh(dGeo, dMat);
        dPlane.rotation.x = -Math.PI / 2;
        const baseX = (Math.random() - 0.5) * 4;
        const baseZ = (Math.random() - 0.5) * 4;
        dPlane.position.set(baseX, cfg.y, baseZ);
        dPlane.frustumCulled = false;
        dPlane.userData = {
          driftSpeed: cfg.speed,
          driftAmplitude: cfg.amplitude,
          baseX,
          baseZ,
          baseOpacity: cfg.opacity,
          phase: Math.random() * Math.PI * 2,
        };
        weatherGroup.add(dPlane);
        driftPlanes.push(dPlane);
      }

      sceneRef.current.weatherDriftFogPlanes = driftPlanes;

    } else if (currentWeather === 'sandstorm') {
      // ===== Sandstorm: 800 fast horizontal particles + fog overlay =====
      const count = 800;
      const positions = new Float32Array(count * 3);
      const velocities = new Float32Array(count);
      const yVelocities = new Float32Array(count);
      const offsets = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 24;
        positions[i * 3 + 1] = Math.random() * 5;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 18;
        velocities[i] = 5 + Math.random() * 8;
        yVelocities[i] = (Math.random() - 0.5) * 2;
        offsets[i] = Math.random() * Math.PI * 2;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const material = new THREE.PointsMaterial({
        color: 0xd4a843,
        size: 0.06,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        sizeAttenuation: true,
      });
      material.userData = { baseOpacity: 0.7 };

      const points = new THREE.Points(geometry, material);
      points.frustumCulled = false;
      weatherGroup.add(points);

      sceneRef.current.weatherPoints = points;
      sceneRef.current.weatherParticlePositions = positions;
      sceneRef.current.weatherParticleVelocities = velocities;
      sceneRef.current.weatherParticleOffsets = offsets;
      sceneRef.current.weatherParticleYVelocities = yVelocities;

      // Sandstorm fog overlay
      const mapW = MAP_WIDTH * CELL_TOTAL + 2;
      const mapH = MAP_HEIGHT * CELL_TOTAL + 2;
      const sandFogGeo = new THREE.PlaneGeometry(mapW, mapH);
      const sandFogMat = new THREE.MeshBasicMaterial({
        color: 0xc4a54a,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const sandFogPlane = new THREE.Mesh(sandFogGeo, sandFogMat);
      sandFogPlane.rotation.x = -Math.PI / 2;
      sandFogPlane.position.y = 0.15;
      sandFogPlane.frustumCulled = false;
      weatherGroup.add(sandFogPlane);

      sceneRef.current.weatherSandFogPlane = sandFogPlane;
    }

    return cleanupWeather;
  }, [currentWeather]);

  // ===== v84.0: Ambient Weather Particle Layer =====
  // Secondary subtle particle system that provides atmospheric depth alongside the main weather effects.
  // Uses 300 lightweight particles with different behavior per weather type.
  const weatherParticlesRef = useRef<THREE.Points | null>(null);
  const weatherParticleDataRef = useRef<{
    positions: Float32Array;
    velocities: Float32Array; // per-particle speed multiplier
    offsets: Float32Array;    // per-particle random phase offset
  } | null>(null);

  useEffect(() => {
    if (!sceneRef.current) return;
    const { weatherGroup } = sceneRef.current;

    // Cleanup previous ambient particles
    if (weatherParticlesRef.current) {
      weatherGroup.remove(weatherParticlesRef.current);
      weatherParticlesRef.current.geometry.dispose();
      (weatherParticlesRef.current.material as THREE.Material).dispose();
      weatherParticlesRef.current = null;
      weatherParticleDataRef.current = null;
    }

    if (currentWeather === 'clear' || currentWeather === 'fog') {
      // No ambient particles for clear/fog (fog uses drifting planes instead)
      return;
    }

    // Create 300 ambient particles
    const count = 300;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    const offsets = new Float32Array(count);

    const spreadX = 22;
    const spreadY = 10;
    const spreadZ = 18;

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * spreadX;
      positions[i * 3 + 1] = Math.random() * spreadY;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spreadZ;
      velocities[i] = 0.5 + Math.random() * 1.0; // speed multiplier
      offsets[i] = Math.random() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Color and size per weather type
    let color: number;
    let size: number;
    let opacity: number;

    switch (currentWeather) {
      case 'rain':
        color = 0xb0d4ff; // blue-white
        size = 0.03;
        opacity = 0.3;
        break;
      case 'snow':
        color = 0xffffff; // white
        size = 0.04;
        opacity = 0.4;
        break;
      case 'sandstorm':
        color = 0xe8b840; // orange
        size = 0.035;
        opacity = 0.35;
        break;
      default:
        color = 0xffffff;
        size = 0.03;
        opacity = 0.3;
    }

    const material = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity,
      depthWrite: false,
      sizeAttenuation: true,
    });
    material.userData = { baseOpacity: opacity };

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    weatherGroup.add(points);

    weatherParticlesRef.current = points;
    weatherParticleDataRef.current = { positions, velocities, offsets };

    return () => {
      if (weatherParticlesRef.current && sceneRef.current) {
        sceneRef.current.weatherGroup.remove(weatherParticlesRef.current);
        weatherParticlesRef.current.geometry.dispose();
        (weatherParticlesRef.current.material as THREE.Material).dispose();
        weatherParticlesRef.current = null;
        weatherParticleDataRef.current = null;
      }
    };
  }, [currentWeather]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ cursor: 'crosshair' }}
      />

      {/* Screen Edge Flash Effect (Vignette) */}
      {screenFlash && (
        <div 
          className="absolute inset-0 pointer-events-none z-[5] transition-opacity duration-300"
          style={{
            boxShadow: `inset 0 0 80px 20px ${screenFlash.color}${screenFlash.opacity})`,
          }}
        />
      )}

      {/* ===== 3. Unit Hover Tooltip ===== */}
      {hoveredUnitInfo && (
        <div
          className="absolute pointer-events-none z-10 px-2 py-1 rounded text-xs font-bold text-white whitespace-nowrap"
          style={{
            left: hoveredUnitInfo.x,
            top: hoveredUnitInfo.y - 28,
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)',
            border: '1px solid rgba(255,255,255,0.3)',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          }}
        >
          {hoveredUnitInfo.name}
        </div>
      )}

      {/* [REMOVED] Terrain Detailed Info Tooltip — use TerrainEffectsPanel in GameUI.tsx instead */}

      {/* Floating Damage/Heal Numbers from Store */}
      {showDamageNums && damagePopups && damagePopups.map(popup => {
        const worldPos = cellToWorld({ x: popup.x, z: popup.z });
        const cell = gameMap.cells[popup.z]?.[popup.x];
        const terrainHeight = cell ? TERRAIN_CONFIGS[cell.terrain].stats.height * CELL_SIZE : 0;
        // v73.0: Use camera position from sceneRef for proper screen tracking
        let screenX: number, screenY: number;
        const scn = sceneRef.current;
        if (scn) {
          const cam = scn.camera;
          const camW = cam.right - cam.left;
          const camH = cam.top - cam.bottom;
          // Project world position to normalized device coordinates, then to percentage
          screenX = ((worldPos.x - cam.position.x + camW / 2) / camW) * 100;
          screenY = ((cam.position.z + camH / 2 - worldPos.z) / camH) * 100;
          // Add a slight upward offset for unit height
          screenY -= 3;
        } else {
          screenX = ((worldPos.x - MAP_OFFSET_X) / (MAP_WIDTH * CELL_TOTAL)) * 100;
          screenY = ((worldPos.z - MAP_OFFSET_Z) / (MAP_HEIGHT * CELL_TOTAL)) * 100;
        }
        const age = Date.now() - popup.timestamp;
        if (age > 1500) return null;
        const progress = age / 1500;
        const opacity = 1 - progress;
        const yOffset = -progress * 40;
        
        const isHeal = popup.type === 'heal';
        const isCounter = popup.type === 'counter';
        const isXp = popup.type === 'xp';
        const isLevelUp = popup.type === 'levelup';
        const isAmmo = popup.type === 'ammo'; // v78.0: Properly detect ammo resupply
        const isMorale = popup.type === 'morale'; // v78.0: Properly detect morale boost
        const isResupply = popup.type === 'resupply';
        const isKill = popup.type === 'kill'; // v82.0: Distinct kill popup
        // v71.0: Damage severity color coding
        const absVal = Math.abs(popup.value);
        const damageColor = absVal >= 50 ? '#ff1744' : absVal >= 25 ? '#ff6d00' : absVal >= 10 ? '#ffab00' : '#ff5252';
        const damageSize = absVal >= 50 ? '22px' : absVal >= 25 ? '20px' : '18px';
        // Kill popup: longer duration, bounce animation, larger size
        const isKillEffect = isKill;
        const killAge = isKillEffect ? age / 2000 : progress; // kills last 2s
        if (isKillEffect && age > 2000) return null;
        const killOpacity = isKillEffect ? (1 - killAge) : opacity;
        const killBounce = isKillEffect ? Math.sin(killAge * Math.PI * 3) * 8 * (1 - killAge) : 0;
        const killYOffset = isKillEffect ? -killAge * 50 : yOffset;
        
        return (
          <div
            key={popup.id}
            className="absolute pointer-events-none z-20 font-bold whitespace-nowrap"
            style={{
              left: `${screenX}%`,
              top: `${screenY}%`,
              transform: `translate(-50%, ${killYOffset + killBounce}px)`,
              color: isKill ? '#ff1744' : isHeal ? '#4caf50' : isCounter ? '#fbbf24' : isXp ? '#facc15' : isLevelUp ? '#fbbf24' : isAmmo ? '#42a5f5' : isMorale ? '#ab47bc' : isResupply ? '#42a5f5' : damageColor,
              opacity: killOpacity,
              fontSize: isKill ? '28px' : isHeal ? '16px' : isLevelUp ? '20px' : (isAmmo || isMorale || isResupply) ? '14px' : damageSize,
              // v82.0: Kill popup gets extra glow effect
              animation: isKill ? 'killPopBounce 0.4s ease-out' : 'none',
              // v79.0: Enhanced text readability with strong shadow + slight stroke
              textShadow: isKill
                ? '0 0 10px rgba(255,23,68,0.8), 0 2px 4px rgba(0,0,0,1), 0 0 20px rgba(255,23,68,0.4)'
                : isHeal
                ? '0 0 6px rgba(0,0,0,0.9), 0 0 10px rgba(76,175,80,0.3)'
                : isCounter
                ? '0 0 6px rgba(0,0,0,0.9), 0 0 10px rgba(255,191,36,0.3)'
                : isLevelUp
                ? '0 2px 8px rgba(0,0,0,0.9), 0 0 20px rgba(255,191,36,0.5)'
                : isXp
                ? '0 0 6px rgba(0,0,0,0.9), 0 0 10px rgba(250,204,21,0.3)'
                : (isAmmo || isMorale || isResupply)
                ? '0 0 6px rgba(0,0,0,0.9), 0 0 10px rgba(66,165,245,0.3)'
                : `0 1px 2px rgba(0,0,0,1), 0 2px 6px rgba(0,0,0,0.9)`,
              transition: 'none',
              WebkitTextStroke: '0.5px rgba(0,0,0,0.4)',
            }}
          >
            {isKill ? `💀 -${popup.value}` :
             isLevelUp ? `⬆ LEVEL UP! Lv.${popup.value}` :
             isXp ? `+${popup.value} XP` :
             isAmmo ? `+${popup.value} AMMO` :
             isMorale ? `+${popup.value} MORALE` :
             isResupply ? '+AMMO' :
             isHeal ? '+' : '-'}{isLevelUp || isXp || isAmmo || isMorale || isResupply || isKill ? '' : popup.value}
            {!isLevelUp && !isXp && !isAmmo && !isMorale && !isResupply && !isKill && isCounter && <span className="text-xs ml-0.5">反击</span>}
            {!isLevelUp && !isXp && !isAmmo && !isMorale && !isResupply && !isKill && isHeal && <span className="text-xs ml-0.5">治疗</span>}
          </div>
        );
      })}

      <style jsx>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-40px); }
        }
        @keyframes killPopBounce {
          0% { transform: translate(-50%, 0) scale(0.5); opacity: 0; }
          50% { transform: translate(-50%, -10px) scale(1.3); opacity: 1; }
          100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
        }
        .animate-float-up {
          animation: floatUp 1.5s ease-out forwards;
        }
        @keyframes minimap-pulse {
          0%, 100% { 
            border-color: rgba(255,255,255,0.3);
            box-shadow: 0 0 8px rgba(255,255,255,0.15), inset 0 0 8px rgba(255,255,255,0.05);
          }
          50% { 
            border-color: rgba(255,255,255,0.5);
            box-shadow: 0 0 16px rgba(255,255,255,0.3), inset 0 0 12px rgba(255,255,255,0.1);
          }
        }
      `}</style>

      {/* v72.0: Duplicate minimap overlay removed — Minimap.tsx in GameUI handles all minimap rendering */}

      {/* Damage Estimate Tooltip */}
      {damageEstimate && (
        <div
          className="absolute pointer-events-none z-20 px-2 py-1.5 rounded text-xs font-bold whitespace-nowrap"
          style={{
            left: damageEstimate.x,
            top: damageEstimate.y - 65,
            transform: 'translateX(-50%)',
            background: 'rgba(200, 30, 30, 0.9)',
            border: '1px solid rgba(255, 100, 100, 0.5)',
            color: 'white',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          }}
        >
          <div>⚔️ 预计伤害: {damageEstimate.min} ~ {damageEstimate.max}</div>
          {damageEstimate.reduction !== undefined && damageEstimate.reduction > 0 && (
            <div className="text-amber-300 text-[10px]">🛡️ 装甲减免: -{damageEstimate.reduction}%{damageEstimate.isFlanking ? ' (侧翼!)' : ''}</div>
          )}
          {damageEstimate.counterMin !== undefined && damageEstimate.counterMax !== undefined && (
            <div className="text-yellow-300 text-[10px]">⚡ 反击伤害: {damageEstimate.counterMin} ~ {damageEstimate.counterMax}
              {damageEstimate.counterReduction !== undefined && damageEstimate.counterReduction > 0 && (
                <span className="text-amber-300"> (装甲-{damageEstimate.counterReduction}%)</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
