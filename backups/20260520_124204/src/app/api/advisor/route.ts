// ===== AI 战术顾问 API =====
// 使用 LLM 分析当前游戏局势并提供战术建议

import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

// 游戏状态摘要类型
interface GameStateSummary {
  turn: number;
  currentFaction: string;
  phase: string;
  weather: string;
  redUnits: { type: string; hp: number; maxHp: number; x: number; z: number; canMove: boolean; canAttack: boolean; isHero: boolean }[];
  blueUnits: { type: string; hp: number; maxHp: number; x: number; z: number }[];
  mapSize: { width: number; height: number };
  terrainCounts: Record<string, number>;
  capturePoints: { x: number; z: number; owner: string | null; progress: number }[];
  objectives: { description: string; type: string; progress: string }[];
}

const UNIT_TYPE_NAMES: Record<string, string> = {
  tank: '坦克', ifv: '步战车', artillery: '自行火炮', scout: '侦察车', infantry: '步兵',
  sam: '防空导弹', engineer: '工程车', supply: '补给车', helicopter: '武装直升机', mlrs: '火箭炮',
};

const WEATHER_NAMES: Record<string, string> = {
  clear: '晴天', rain: '雨天', fog: '雾天', snow: '雪天', sandstorm: '沙尘暴',
};

function summarizeState(rawState: Record<string, unknown>): GameStateSummary {
  const units = (rawState.units || []) as Record<string, unknown>[];
  const map = rawState.map as Record<string, unknown> | undefined;
  const cells = ((map?.cells || []) as unknown[][]).flat();
  
  // 统计地形
  const terrainCounts: Record<string, number> = {};
  cells.forEach(cell => {
    const c = cell as Record<string, unknown>;
    const t = (c.terrain as string) || 'plains';
    terrainCounts[t] = (terrainCounts[t] || 0) + 1;
  });

  const redUnits = units
    .filter(u => u.faction === 'red' && (u.hp as number) > 0)
    .map(u => ({
      type: UNIT_TYPE_NAMES[(u.type as string)] || (u.type as string),
      hp: u.hp as number,
      maxHp: u.maxHp as number,
      x: (u.position as { x: number; z: number } | undefined)?.x ?? 0,
      z: (u.position as { x: number; z: number } | undefined)?.z ?? 0,
      canMove: (u.canMove as boolean) || false,
      canAttack: (u.canAttack as boolean) || false,
      isHero: (u.isHero as boolean) || false,
    }));

  const blueUnits = units
    .filter(u => u.faction === 'blue' && (u.hp as number) > 0)
    .map(u => ({
      type: UNIT_TYPE_NAMES[(u.type as string)] || (u.type as string),
      hp: u.hp as number,
      maxHp: u.maxHp as number,
      x: (u.position as { x: number; z: number } | undefined)?.x ?? 0,
      z: (u.position as { x: number; z: number } | undefined)?.z ?? 0,
    }));

  const capturePoints = ((rawState.capturePoints || []) as Record<string, unknown>[]).map(cp => ({
    x: (cp.position as { x: number; z: number } | undefined)?.x ?? 0,
    z: (cp.position as { x: number; z: number } | undefined)?.z ?? 0,
    owner: (cp.owner as string) || null,
    progress: (cp.captureProgress as number) || 0,
  }));

  return {
    turn: (rawState.turn as number) || 1,
    currentFaction: (rawState.currentFaction as string) || 'red',
    phase: (rawState.phase as string) || 'selectUnit',
    weather: WEATHER_NAMES[(rawState.weather as string)] || '晴天',
    redUnits,
    blueUnits,
    mapSize: { width: 16, height: 12 },
    terrainCounts,
    capturePoints,
    objectives: [],
  };
}

function buildPrompt(summary: GameStateSummary, question?: string): string {
  const stateDesc = `
当前回合: ${summary.turn}
天气: ${summary.weather}
阶段: ${summary.phase}

我方单位 (红方, ${summary.redUnits.length}个):
${summary.redUnits.map((u, i) => `  ${i + 1}. ${u.type}${u.isHero ? ' [英雄]' : ''} - HP: ${u.hp}/${u.maxHp} 位置:(${u.x},${u.z}) ${u.canMove ? '✓可移动' : '✗已移动'} ${u.canAttack ? '✓可攻击' : '✗已攻击'}`).join('\n')}

敌方单位 (蓝方, ${summary.blueUnits.length}个):
${summary.blueUnits.map((u, i) => `  ${i + 1}. ${u.type} - HP: ${u.hp}/${u.maxHp} 位置:(${u.x},${u.z})`).join('\n')}

${summary.capturePoints.length > 0 ? `据点: ${summary.capturePoints.map(cp => `(${cp.x},${cp.z}) ${cp.owner === 'red' ? '红方' : cp.owner === 'blue' ? '蓝方' : '中立'} ${cp.progress}%`).join(', ')}` : ''}
`.trim();

  if (question) {
    return `你是铁甲战棋游戏的战术顾问。请用中文回答玩家的具体问题。

${stateDesc}

玩家的问题: ${question}

请给出简洁实用的战术建议（2-4句话），包含具体的单位行动建议。不要重复描述局势。`;
  }

  return `你是铁甲战棋游戏的AI战术顾问。请分析当前局势并给出建议。

${stateDesc}

请用中文给出以下建议（简洁实用，每项1-2句话）：
1. 🎯 优先行动建议（最应该先用哪个单位做什么）
2. ⚔️ 攻击建议（最佳的攻击目标和方式）
3. 🛡️ 防御建议（需要注意的威胁和防守要点）
4. 💡 综合策略（当前局势的整体判断和建议）

注意：只给出建议，不要重复描述局势数据。保持简洁，总共不超过200字。`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameState, question } = body as { gameState: Record<string, unknown>; question?: string };

    if (!gameState) {
      return NextResponse.json({ error: '缺少游戏状态数据' }, { status: 400 });
    }

    // 只在红方回合提供建议
    if (gameState.currentFaction !== 'red') {
      return NextResponse.json({ 
        advice: '现在是蓝方回合，请等待对手行动完毕。',
        isWaiting: true 
      });
    }

    // 如果游戏已结束
    if (gameState.phase === 'gameOver') {
      return NextResponse.json({ 
        advice: '游戏已经结束。点击"再来一局"继续新的战斗！',
        isGameOver: true 
      });
    }

    const summary = summarizeState(gameState);
    const prompt = buildPrompt(summary, question);

    let zai;
    try {
      zai = await ZAI.create();
    } catch {
      // SDK 不可用时提供基于规则的建议
      return NextResponse.json({ 
        advice: generateRuleBasedAdvice(summary),
        isFallback: true 
      });
    }

    try {
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: '你是铁甲战棋的AI战术顾问。你的建议要简洁、实用、有针对性。使用中文回答，适当使用emoji。每次回答不超过200字。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      });

      const advice = completion.choices[0]?.message?.content || '无法生成建议，请稍后重试。';
      return NextResponse.json({ advice });
    } catch {
      // LLM 调用失败时使用规则建议
      return NextResponse.json({ 
        advice: generateRuleBasedAdvice(summary),
        isFallback: true 
      });
    }
  } catch {
    return NextResponse.json({ error: '分析失败，请重试' }, { status: 500 });
  }
}

// 基于规则的简单建议（当 LLM 不可用时使用）
function generateRuleBasedAdvice(summary: GameStateSummary): string {
  const lines: string[] = [];
  
  // 分析双方力量对比
  const redTotalHp = summary.redUnits.reduce((s, u) => s + u.hp, 0);
  const blueTotalHp = summary.blueUnits.reduce((s, u) => s + u.hp, 0);
  const hpRatio = redTotalHp / Math.max(1, blueTotalHp);
  
  if (hpRatio > 1.3) {
    lines.push('🎯 我方兵力占优，积极进攻！优先消灭敌方低血量单位。');
  } else if (hpRatio < 0.7) {
    lines.push('🛡️ 我方兵力劣势，注意防守！善用地形优势和补给车治疗。');
  } else {
    lines.push('⚔️ 双方势均力敌，注意效率！优先攻击高价值目标。');
  }

  // 找出可行动的单位
  const movableUnits = summary.redUnits.filter(u => u.canMove || u.canAttack);
  if (movableUnits.length === 0) {
    lines.push('💡 所有单位已行动完毕，建议结束回合。');
  } else {
    const heroUnit = movableUnits.find(u => u.isHero);
    if (heroUnit) {
      lines.push(`⭐ 建议先使用英雄单位【${heroUnit.type}】行动，发挥英雄技能优势。`);
    }
    
    // 检查低血量可攻击单位
    const lowHpEnemies = summary.blueUnits.filter(u => u.hp / u.maxHp < 0.3);
    if (lowHpEnemies.length > 0) {
      lines.push(`🎯 敌方有${lowHpEnemies.length}个残血单位，优先击杀！`);
    }
    
    // 检查补给车
    const hasSupply = summary.redUnits.some(u => u.type === '补给车');
    if (hasSupply) {
      lines.push('💊 记得利用补给车治疗受伤单位。');
    }
  }

  // 天气建议
  if (summary.weather === '雨天') {
    lines.push('🌧️ 雨天移动消耗增加，规划行动时预留额外移动力。');
  } else if (summary.weather === '雾天') {
    lines.push('🌫️ 雾天视野降低，注意侦察车和山地瞭望。');
  }

  return lines.join('\n');
}
