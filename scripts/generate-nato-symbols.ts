// ===== NATO APP-6 军事符号预生成脚本 =====
// 生成所有单位类型 × 阵营 × 状态 的PNG图片到 public/nato-symbols/

import { createCanvas } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

// ===== 类型定义 =====
type UnitType = 'tank' | 'ifv' | 'artillery' | 'scout' | 'infantry' | 'sam' | 'engineer' | 'supply' | 'helicopter' | 'mlrs' | 'atgm' | 'uav' | 'command' | 'ew';
type Faction = 'red' | 'blue';

interface NatoSymbolConfig {
  name: string;
  category: string;
  frame: 'rect' | 'oval';
  accentColor: string;
}

const UNIT_TYPES: UnitType[] = [
  'tank', 'ifv', 'artillery', 'scout', 'infantry',
  'sam', 'engineer', 'supply', 'helicopter', 'mlrs',
  'atgm', 'uav', 'command', 'ew'
];

const FACTIONS: Faction[] = ['red', 'blue'];

const NATO_SYMBOL_CONFIGS: Record<UnitType, NatoSymbolConfig> = {
  tank:        { name: '装甲',       category: 'armor',          frame: 'rect', accentColor: '#ff6b6b' },
  ifv:         { name: '步战',       category: 'mech_inf',       frame: 'rect', accentColor: '#ffa94d' },
  artillery:   { name: '火炮',       category: 'artillery',      frame: 'rect', accentColor: '#ffd43b' },
  scout:       { name: '侦察',       category: 'recon',          frame: 'rect', accentColor: '#69db7c' },
  infantry:    { name: '步兵',       category: 'infantry',       frame: 'rect', accentColor: '#da77f2' },
  sam:         { name: '防空',       category: 'air_defense',    frame: 'rect', accentColor: '#74c0fc' },
  engineer:    { name: '工兵',       category: 'combat_support', frame: 'rect', accentColor: '#e599f7' },
  supply:      { name: '补给',       category: 'logistics',      frame: 'rect', accentColor: '#99e9f9' },
  helicopter:  { name: '直升机',     category: 'aviation',       frame: 'oval', accentColor: '#b197fc' },
  mlrs:        { name: '火箭炮',     category: 'rocket',         frame: 'rect', accentColor: '#ff8787' },
  atgm:        { name: '反坦克导弹', category: 'anti_tank',      frame: 'rect', accentColor: '#ff8787' },
  uav:         { name: '无人机',     category: 'aviation',       frame: 'oval', accentColor: '#a9e34b' },
  command:     { name: '指挥车',     category: 'command',        frame: 'rect', accentColor: '#ffd43b' },
  ew:          { name: '电子战',     category: 'electronic_warfare', frame: 'rect', accentColor: '#20c997' },
};

const FACTION_COLORS: Record<Faction, { base: string; dark: string; light: string; stroke: string }> = {
  red:  { base: '#c62828', dark: '#8e0000', light: '#ff5252', stroke: '#ffcdd2' },
  blue: { base: '#1565c0', dark: '#0d47a1', light: '#448aff', stroke: '#bbdefb' },
};

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'nato-symbols');
const IMAGE_SIZE = 256;

// ===== 绘图辅助函数 =====
function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function roundRectPath(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawStar(ctx: any, cx: number, cy: number, points: number, outerR: number, innerR: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// ===== 核心绘制函数 =====
function drawNatoSymbol(unitType: UnitType, faction: Faction, size: number, isHero?: boolean): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const s = size * 0.38;
  const fc = FACTION_COLORS[faction];
  const symCfg = NATO_SYMBOL_CONFIGS[unitType];

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const frameW = s * 2.0;
  const frameH = s * 1.6;
  const frameX = c - frameW / 2;
  const frameY = c - frameH / 2;

  // 绘制外框（阵营底色）
  if (symCfg.frame === 'oval') {
    ctx.beginPath();
    ctx.ellipse(c, c, frameW / 2, frameH / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = fc.base;
    ctx.fill();
    ctx.strokeStyle = fc.stroke;
    ctx.lineWidth = size * 0.025;
    ctx.stroke();
  } else {
    roundRect(ctx, frameX, frameY, frameW, frameH, size * 0.04);
    ctx.fillStyle = fc.base;
    ctx.fill();
    ctx.strokeStyle = fc.stroke;
    ctx.lineWidth = size * 0.025;
    ctx.stroke();
  }

  // 裁剪区域
  ctx.save();
  ctx.beginPath();
  if (symCfg.frame === 'oval') {
    ctx.ellipse(c, c, frameW / 2 - size * 0.025, frameH / 2 - size * 0.025, 0, 0, Math.PI * 2);
  } else {
    roundRectPath(ctx, frameX + size * 0.015, frameY + size * 0.015, frameW - size * 0.03, frameH - size * 0.03, size * 0.03);
  }
  ctx.clip();

  const iconS = s * 0.55;

  switch (unitType) {
    case 'tank': {
      ctx.beginPath();
      ctx.ellipse(c, c, iconS * 0.65, iconS * 0.42, 0, 0, Math.PI * 2);
      ctx.fillStyle = symCfg.accentColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.025;
      ctx.stroke();
      const gunLen = iconS * 0.5;
      ctx.beginPath();
      ctx.moveTo(c + iconS * 0.2, c);
      ctx.lineTo(c + iconS * 0.2 + gunLen, c);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.035;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c, c, iconS * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }
    case 'ifv': {
      const bw = iconS * 0.9, bh = iconS * 0.55;
      roundRect(ctx, c - bw / 2, c - bh / 2, bw, bh, size * 0.02);
      ctx.fillStyle = symCfg.accentColor;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = size * 0.025;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c - bw * 0.3, c - bh * 0.3); ctx.lineTo(c + bw * 0.3, c + bh * 0.3);
      ctx.moveTo(c + bw * 0.3, c - bh * 0.3); ctx.lineTo(c - bw * 0.3, c + bh * 0.3);
      ctx.strokeStyle = fc.base;
      ctx.lineWidth = size * 0.03;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(c + bw * 0.2, c, iconS * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      break;
    }
    case 'artillery': {
      ctx.beginPath(); ctx.arc(c, c, iconS * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = symCfg.accentColor; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.03; ctx.stroke();
      ctx.beginPath(); ctx.arc(c, c, iconS * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = fc.base; ctx.fill();
      const barrelL = iconS * 0.6;
      ctx.beginPath(); ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(-Math.PI / 4) * barrelL, c + Math.sin(-Math.PI / 4) * barrelL);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.04; ctx.stroke();
      break;
    }
    case 'scout': {
      ctx.beginPath();
      ctx.ellipse(c, c - iconS * 0.05, iconS * 0.35, iconS * 0.22, 0, 0, Math.PI * 2);
      ctx.fillStyle = symCfg.accentColor; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.025; ctx.stroke();
      ctx.beginPath(); ctx.arc(c, c - iconS * 0.05, iconS * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(c - iconS * 0.5, c + iconS * 0.25);
      ctx.quadraticCurveTo(c, c + iconS * 0.55, c + iconS * 0.5, c + iconS * 0.25);
      ctx.strokeStyle = symCfg.accentColor; ctx.lineWidth = size * 0.03;
      ctx.setLineDash([size * 0.03, size * 0.02]); ctx.stroke(); ctx.setLineDash([]);
      break;
    }
    case 'infantry': {
      ctx.beginPath();
      ctx.moveTo(c - iconS * 0.35, c - iconS * 0.35); ctx.lineTo(c + iconS * 0.35, c + iconS * 0.35);
      ctx.moveTo(c + iconS * 0.35, c - iconS * 0.35); ctx.lineTo(c - iconS * 0.35, c + iconS * 0.35);
      ctx.strokeStyle = symCfg.accentColor; ctx.lineWidth = size * 0.05; ctx.stroke();
      ctx.beginPath(); ctx.arc(c, c, iconS * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = symCfg.accentColor; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.02; ctx.stroke();
      break;
    }
    case 'sam': {
      ctx.beginPath();
      ctx.moveTo(c, c - iconS * 0.5); ctx.lineTo(c + iconS * 0.12, c - iconS * 0.1);
      ctx.lineTo(c + iconS * 0.06, c + iconS * 0.4); ctx.lineTo(c - iconS * 0.06, c + iconS * 0.4);
      ctx.lineTo(c - iconS * 0.12, c - iconS * 0.1); ctx.closePath();
      ctx.fillStyle = symCfg.accentColor; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.025; ctx.stroke();
      // 左导弹
      ctx.beginPath();
      ctx.moveTo(c - iconS * 0.25, c + iconS * 0.15); ctx.lineTo(c - iconS * 0.08, c - iconS * 0.35);
      ctx.lineTo(c - iconS * 0.08, c - iconS * 0.15); ctx.lineTo(c - iconS * 0.2, c - iconS * 0.15);
      ctx.closePath(); ctx.lineTo(c - iconS * 0.2, c + iconS * 0.35);
      ctx.fillStyle = fc.dark; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.015; ctx.stroke();
      // 右导弹
      ctx.beginPath();
      ctx.moveTo(c + iconS * 0.08, c - iconS * 0.15); ctx.lineTo(c + iconS * 0.2, c - iconS * 0.15);
      ctx.lineTo(c + iconS * 0.2, c + iconS * 0.35); ctx.lineTo(c + iconS * 0.08, c + iconS * 0.35);
      ctx.closePath(); ctx.fillStyle = fc.dark; ctx.fill(); ctx.stroke();
      break;
    }
    case 'engineer': {
      ctx.font = `bold ${Math.round(iconS * 1.1)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = symCfg.accentColor; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.02;
      ctx.strokeText('E', c, c); ctx.fillText('E', c, c);
      ctx.beginPath(); ctx.rect(c - iconS * 0.45, c - iconS * 0.3, iconS * 0.9, iconS * 0.6);
      ctx.strokeStyle = symCfg.accentColor; ctx.lineWidth = size * 0.025; ctx.stroke();
      break;
    }
    case 'supply': {
      ctx.beginPath();
      ctx.moveTo(c, c - iconS * 0.4); ctx.lineTo(c + iconS * 0.25, c + iconS * 0.35);
      ctx.lineTo(c - iconS * 0.25, c + iconS * 0.35); ctx.closePath();
      ctx.fillStyle = symCfg.accentColor; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.025; ctx.stroke();
      ctx.lineWidth = size * 0.035;
      ctx.beginPath();
      ctx.moveTo(c - iconS * 0.15, c - iconS * 0.1); ctx.lineTo(c + iconS * 0.15, c + iconS * 0.2);
      ctx.moveTo(c + iconS * 0.15, c - iconS * 0.1); ctx.lineTo(c - iconS * 0.15, c + iconS * 0.2);
      ctx.strokeStyle = '#ffffff'; ctx.stroke();
      break;
    }
    case 'helicopter': {
      ctx.beginPath();
      ctx.ellipse(c, c, iconS * 0.7, iconS * 0.38, 0, 0, Math.PI * 2);
      ctx.fillStyle = symCfg.accentColor; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.025; ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(c, c - iconS * 0.15, iconS * 0.18, iconS * 0.08, 0, 0, Math.PI * 2);
      ctx.fillStyle = fc.light; ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(c - iconS * 0.85, c - iconS * 0.25); ctx.lineTo(c + iconS * 0.85, c - iconS * 0.25);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.035; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c + iconS * 0.5, c); ctx.lineTo(c + iconS * 0.75, c + iconS * 0.2);
      ctx.lineTo(c + iconS * 0.72, c + iconS * 0.32); ctx.lineTo(c + iconS * 0.47, c + iconS * 0.12);
      ctx.closePath(); ctx.fillStyle = fc.dark; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.015; ctx.stroke();
      break;
    }
    case 'mlrs': {
      const podW = iconS * 0.7, podH = iconS * 0.45;
      roundRect(ctx, c - podW / 2, c - podH / 2, podW, podH, size * 0.02);
      ctx.fillStyle = symCfg.accentColor; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.025; ctx.stroke();
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          const tx = c - podW * 0.28 + i * podW * 0.28;
          const ty = c - podH * 0.22 + j * podH * 0.44;
          ctx.beginPath(); ctx.arc(tx, ty, iconS * 0.06, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.5 + (i + j) * 0.15; ctx.fill(); ctx.globalAlpha = 1;
        }
      }
      ctx.beginPath();
      ctx.moveTo(c - podW * 0.35, c + podH * 0.35); ctx.lineTo(c - podW * 0.15, c + podH * 0.35);
      ctx.moveTo(c + podW * 0.15, c + podH * 0.35); ctx.lineTo(c + podW * 0.35, c + podH * 0.35);
      ctx.strokeStyle = fc.dark; ctx.lineWidth = size * 0.03; ctx.stroke();
      break;
    }
    case 'atgm': {
      ctx.beginPath();
      ctx.moveTo(c - iconS * 0.08, c + iconS * 0.4);
      ctx.lineTo(c + iconS * 0.08, c + iconS * 0.4);
      ctx.lineTo(c + iconS * 0.05, c - iconS * 0.1);
      ctx.lineTo(c - iconS * 0.05, c - iconS * 0.1);
      ctx.closePath();
      ctx.fillStyle = fc.dark; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.02; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c - iconS * 0.06, c - iconS * 0.1);
      ctx.lineTo(c + iconS * 0.45, c - iconS * 0.55);
      ctx.strokeStyle = symCfg.accentColor; ctx.lineWidth = size * 0.04; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c + iconS * 0.45, c - iconS * 0.55);
      ctx.lineTo(c + iconS * 0.55, c - iconS * 0.50);
      ctx.lineTo(c + iconS * 0.40, c - iconS * 0.48);
      ctx.closePath();
      ctx.fillStyle = symCfg.accentColor; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.015; ctx.stroke();
      break;
    }
    case 'uav': {
      ctx.beginPath();
      ctx.ellipse(c, c, iconS * 0.5, iconS * 0.18, 0, 0, Math.PI * 2);
      ctx.fillStyle = symCfg.accentColor; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.02; ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(c, c - iconS * 0.08, iconS * 0.22, iconS * 0.65, iconS * 0.08, 0, 0, Math.PI * 2);
      ctx.strokeStyle = symCfg.accentColor; ctx.lineWidth = size * 0.025; ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(c, c, iconS * 0.72, iconS * 0.32, 0, 0, Math.PI * 2);
      ctx.strokeStyle = fc.light; ctx.globalAlpha = 0.3;
      ctx.setLineDash([size * 0.02, size * 0.02]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(c, c - iconS * 0.02, iconS * 0.04, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      break;
    }
    case 'command': {
      const poleX = c - iconS * 0.1;
      ctx.beginPath();
      ctx.moveTo(poleX, c + iconS * 0.45);
      ctx.lineTo(poleX, c - iconS * 0.35);
      ctx.strokeStyle = fc.dark; ctx.lineWidth = size * 0.03; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(poleX - iconS * 0.25, c - iconS * 0.30);
      ctx.quadraticCurveTo(poleX, c - iconS * 0.42, poleX + iconS * 0.25, c - iconS * 0.30);
      ctx.closePath();
      ctx.fillStyle = fc.base; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.02; ctx.stroke();
      ctx.beginPath(); ctx.arc(c + iconS * 0.2, c - iconS * 0.08, iconS * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd700'; ctx.fill();
      ctx.strokeStyle = fc.dark; ctx.lineWidth = size * 0.015; ctx.stroke();
      break;
    }
    case 'ew': {
      ctx.beginPath();
      ctx.moveTo(c, c - iconS * 0.1);
      ctx.quadraticCurveTo(c + iconS * 0.35, c - iconS * 0.35, c + iconS * 0.35, c - iconS * 0.1);
      ctx.quadraticCurveTo(c + iconS * 0.35, c + iconS * 0.15, c, c + iconS * 0.1);
      ctx.quadraticCurveTo(c - iconS * 0.35, c + iconS * 0.15, c - iconS * 0.35, c - iconS * 0.1);
      ctx.quadraticCurveTo(c - iconS * 0.35, c - iconS * 0.35, c, c - iconS * 0.1);
      ctx.closePath();
      ctx.fillStyle = symCfg.accentColor; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = size * 0.02; ctx.stroke();
      ctx.beginPath(); ctx.arc(c, c - iconS * 0.05, iconS * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = fc.light; ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1;
      for (let i = 0; i < 3; i++) {
        const angle = -Math.PI / 2 + (i - 1) * 0.4;
        const arcR = iconS * (0.25 + i * 0.12);
        ctx.beginPath(); ctx.arc(c, c - iconS * 0.05, arcR, angle - 0.3, angle + 0.3);
        ctx.strokeStyle = symCfg.accentColor; ctx.globalAlpha = 0.7 - i * 0.2;
        ctx.lineWidth = size * 0.02; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
  }

  ctx.restore();

  // 英雄装饰
  if (isHero) {
    ctx.save();
    ctx.beginPath();
    if (symCfg.frame === 'oval') {
      ctx.ellipse(c, c, frameW / 2 + size * 0.03, frameH / 2 + size * 0.03, 0, 0, Math.PI * 2);
    } else {
      roundRectPath(ctx, frameX - size * 0.015, frameY - size * 0.015, frameW + size * 0.03, frameH + size * 0.03, size * 0.04);
    }
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = size * 0.035;
    ctx.setLineDash([size * 0.04, size * 0.02]);
    ctx.stroke();
    ctx.setLineDash([]);
    const starR = size * 0.08;
    drawStar(ctx, c, frameY - size * 0.04, 5, starR, starR * 0.4);
    ctx.fillStyle = '#ffd700';
    ctx.fill();
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

// ===== 主程序 =====
function main() {
  console.log('🎨 开始生成 NATO APP-6 军事符号...\n');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  let count = 0;

  for (const unitType of UNIT_TYPES) {
    for (const faction of FACTIONS) {
      for (const isHero of [false, true]) {
        const heroSuffix = isHero ? '_hero' : '';
        const filename = `${unitType}_${faction}${heroSuffix}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);

        const buffer = drawNatoSymbol(unitType, faction, IMAGE_SIZE, isHero || undefined);
        fs.writeFileSync(filepath, buffer);

        const symName = NATO_SYMBOL_CONFIGS[unitType].name;
        const heroTag = isHero ? ' [英雄]' : '';
        console.log(`  ✅ ${filename} — ${symName} (${faction})${heroTag}`);
        count++;
      }
    }
  }

  console.log(`\n✨ 完成！共生成 ${count} 张图片 → ${path.relative(process.cwd(), OUTPUT_DIR)}`);
}

main();
