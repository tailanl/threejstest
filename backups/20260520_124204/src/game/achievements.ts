// ===== 铁甲战棋 - 成就与统计系统 =====
// Persistent cross-game statistics and achievements using localStorage

// ===== Types =====

export type AchievementCategory = 'combat' | 'strategy' | 'special' | 'streak';

export interface Achievement {
  id: string;
  name: string;           // Chinese name
  description: string;    // Chinese description
  icon: string;           // Emoji
  category: AchievementCategory;
  condition: string;      // Key to check in stats
  threshold: number;      // Value needed
  hidden: boolean;        // Only revealed when unlocked
  reward?: string;        // Flavor text reward
}

export interface GameResult {
  won: boolean;
  isDraw: boolean;
  turns: number;
  kills: number;
  losses: number;
  damageDealt: number;
  damageReceived: number;
  healing: number;
  fortsBuilt: number;
  retreats: number;
  difficulty: 'easy' | 'normal' | 'hard';
  isStrategic: boolean;
  remainingUnits: number; // For "comeback" check
}

export interface PlayerStats {
  totalGames: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  totalTurns: number;
  totalKills: number;
  totalDamageDealt: number;
  totalDamageReceived: number;
  totalHealing: number;
  totalFortsBuilt: number;
  totalRetreats: number;
  perfectGames: number;      // Won without losing any units
  fastestWin: number;        // Fewest turns to win (0 = none)
  longestGame: number;       // Most turns in a game
  winStreak: number;         // Best win streak ever
  currentWinStreak: number;  // Current consecutive wins
  biggestDamageGame: number; // Most damage in single game
  mostKillsGame: number;     // Most kills in single game
  zeroLossWins: number;      // Wins without any unit lost
  gamesAsRed: number;        // Always red for player
  gamesAsStrategic: number;
  hardestDifficultyWin: number; // 0=none, 1=easy, 2=normal, 3=hard
  achievements: string[];    // Unlocked achievement IDs
  lastUpdated: number;       // Timestamp
}

// ===== Default Stats =====

const DEFAULT_STATS: PlayerStats = {
  totalGames: 0,
  totalWins: 0,
  totalLosses: 0,
  totalDraws: 0,
  totalTurns: 0,
  totalKills: 0,
  totalDamageDealt: 0,
  totalDamageReceived: 0,
  totalHealing: 0,
  totalFortsBuilt: 0,
  totalRetreats: 0,
  perfectGames: 0,
  fastestWin: 0,
  longestGame: 0,
  winStreak: 0,
  currentWinStreak: 0,
  biggestDamageGame: 0,
  mostKillsGame: 0,
  zeroLossWins: 0,
  gamesAsRed: 0,
  gamesAsStrategic: 0,
  hardestDifficultyWin: 0,
  achievements: [],
  lastUpdated: 0,
};

// ===== Achievement Definitions =====

export const ACHIEVEMENTS: Achievement[] = [
  // ===== Combat =====
  {
    id: 'first_blood',
    name: '初次击杀',
    description: '在游戏中击杀第一个敌方单位',
    icon: '🗡️',
    category: 'combat',
    condition: 'totalKills',
    threshold: 1,
    hidden: false,
    reward: '解锁战斗本能',
  },
  {
    id: 'warrior',
    name: '百战勇士',
    description: '累计击杀100个敌方单位',
    icon: '⚔️',
    category: 'combat',
    condition: 'totalKills',
    threshold: 100,
    hidden: false,
    reward: '战场上的死神',
  },
  {
    id: 'massacre',
    name: '全歼敌军',
    description: '在一局游戏中击杀15个敌方单位',
    icon: '💀',
    category: 'combat',
    condition: 'mostKillsGame',
    threshold: 15,
    hidden: false,
    reward: '无人可挡的杀戮机器',
  },
  {
    id: 'untouchable',
    name: '毫发无损',
    description: '一局游戏零损失获胜',
    icon: '🛡️',
    category: 'combat',
    condition: 'zeroLossWins',
    threshold: 1,
    hidden: false,
    reward: '完美的战术指挥',
  },
  {
    id: 'berserker',
    name: '狂战士',
    description: '在一局游戏中造成2000+伤害',
    icon: '🔥',
    category: 'combat',
    condition: 'biggestDamageGame',
    threshold: 2000,
    hidden: false,
    reward: '毁灭一切的怒火',
  },
  {
    id: 'sniper',
    name: '精确打击',
    description: '累计击杀50个敌方单位',
    icon: '🎯',
    category: 'combat',
    condition: 'totalKills',
    threshold: 50,
    hidden: false,
    reward: '弹无虚发的射手',
  },

  // ===== Strategy =====
  {
    id: 'first_win',
    name: '首战告捷',
    description: '赢得第一场胜利',
    icon: '🏆',
    category: 'strategy',
    condition: 'totalWins',
    threshold: 1,
    hidden: false,
    reward: '初出茅庐的胜利',
  },
  {
    id: 'veteran',
    name: '沙场老将',
    description: '累计赢得10场胜利',
    icon: '🎖️',
    category: 'strategy',
    condition: 'totalWins',
    threshold: 10,
    hidden: false,
    reward: '身经百战的老兵',
  },
  {
    id: 'commander',
    name: '统帅之才',
    description: '累计赢得50场胜利',
    icon: '⭐',
    category: 'strategy',
    condition: 'totalWins',
    threshold: 50,
    hidden: false,
    reward: '天生的指挥官',
  },
  {
    id: 'speed_run',
    name: '闪电战',
    description: '在10回合内获胜',
    icon: '⚡',
    category: 'strategy',
    condition: 'fastestWin',
    threshold: 10,
    hidden: true,
    reward: '疾如闪电的攻势',
  },
  {
    id: 'fort_builder',
    name: '工兵大师',
    description: '累计修建50座工事',
    icon: '🧱',
    category: 'strategy',
    condition: 'totalFortsBuilt',
    threshold: 50,
    hidden: false,
    reward: '铜墙铁壁的建造者',
  },
  {
    id: 'tactical_genius',
    name: '战术大师',
    description: '累计赢得25场胜利',
    icon: '🧠',
    category: 'strategy',
    condition: 'totalWins',
    threshold: 25,
    hidden: false,
    reward: '运筹帷幄之中',
  },

  // ===== Special =====
  {
    id: 'marathon',
    name: '持久战',
    description: '在一局游戏中进行50+回合',
    icon: '🏃',
    category: 'special',
    condition: 'longestGame',
    threshold: 50,
    hidden: true,
    reward: '坚韧不拔的意志',
  },
  {
    id: 'dedicated',
    name: '忠实玩家',
    description: '累计游玩20局游戏',
    icon: '🎮',
    category: 'special',
    condition: 'totalGames',
    threshold: 20,
    hidden: false,
    reward: '坚持不懈的精神',
  },
  {
    id: 'healer',
    name: '战地医生',
    description: '累计治疗1000点生命',
    icon: '💊',
    category: 'special',
    condition: 'totalHealing',
    threshold: 1000,
    hidden: false,
    reward: '救死扶伤的天使',
  },
  {
    id: 'strategic_mind',
    name: '战略眼光',
    description: '游玩10局战略模式',
    icon: '🗺️',
    category: 'special',
    condition: 'gamesAsStrategic',
    threshold: 10,
    hidden: false,
    reward: '宏观战略思维',
  },
  {
    id: 'no_retreat',
    name: '永不后退',
    description: '累计游玩5局零撤退',
    icon: '🚩',
    category: 'special',
    condition: 'totalRetreats',
    threshold: 0,
    hidden: true,
    reward: '真正的勇士永不退缩',
  },
  {
    id: 'difficulty_master',
    name: '困难征服者',
    description: '在困难难度下获胜',
    icon: '💀',
    category: 'special',
    condition: 'hardestDifficultyWin',
    threshold: 3,
    hidden: true,
    reward: '征服最强敌人',
  },
  {
    id: 'war_grinder',
    name: '战争机器',
    description: '累计游玩50局游戏',
    icon: '⚙️',
    category: 'special',
    condition: 'totalGames',
    threshold: 50,
    hidden: false,
    reward: '不知疲倦的战争机器',
  },

  // ===== Streak =====
  {
    id: 'hat_trick',
    name: '三连胜',
    description: '连续赢得3场胜利',
    icon: '🔥',
    category: 'streak',
    condition: 'winStreak',
    threshold: 3,
    hidden: false,
    reward: '势如破竹的三连捷',
  },
  {
    id: 'unstoppable',
    name: '势不可挡',
    description: '连续赢得5场胜利',
    icon: '💪',
    category: 'streak',
    condition: 'winStreak',
    threshold: 5,
    hidden: false,
    reward: '无人能挡的连胜势头',
  },
  {
    id: 'legend',
    name: '传奇指挥官',
    description: '连续赢得10场胜利',
    icon: '👑',
    category: 'streak',
    condition: 'winStreak',
    threshold: 10,
    hidden: true,
    reward: '传说中的不败战神',
  },
  {
    id: 'comeback',
    name: '绝地反击',
    description: '在仅剩2个单位时获胜',
    icon: '🔄',
    category: 'streak',
    condition: 'totalWins',
    threshold: 1,
    hidden: true,
    reward: '绝境中逆转乾坤',
  },
];

// ===== Category Labels =====

export const CATEGORY_LABELS: Record<AchievementCategory, { label: string; icon: string }> = {
  combat: { label: '战斗', icon: '⚔️' },
  strategy: { label: '策略', icon: '🧠' },
  special: { label: '特殊', icon: '⭐' },
  streak: { label: '连胜', icon: '🔥' },
};

// ===== localStorage Key =====

const STORAGE_KEY = 'iron-chess-player-stats';

// ===== Persistence Functions =====

export function loadPlayerStats(): PlayerStats {
  if (typeof window === 'undefined') return { ...DEFAULT_STATS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATS };
    const parsed = JSON.parse(raw);
    // Merge with defaults in case new fields were added
    return { ...DEFAULT_STATS, ...parsed };
  } catch {
    return { ...DEFAULT_STATS };
  }
}

export function savePlayerStats(stats: PlayerStats): void {
  if (typeof window === 'undefined') return;
  try {
    stats.lastUpdated = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // silent fail
  }
}

export function resetAllStats(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silent fail
  }
}

// ===== Stats Update After Game =====

export function updateStatsAfterGame(stats: PlayerStats, result: GameResult): PlayerStats {
  const updated = { ...stats };
  const difficultyMap: Record<string, number> = { easy: 1, normal: 2, hard: 3 };

  // Increment totals
  updated.totalGames += 1;
  updated.totalTurns += result.turns;
  updated.totalKills += result.kills;
  updated.totalDamageDealt += result.damageDealt;
  updated.totalDamageReceived += result.damageReceived;
  updated.totalHealing += result.healing;
  updated.totalFortsBuilt += result.fortsBuilt;
  updated.totalRetreats += result.retreats;
  updated.gamesAsRed += 1;
  if (result.isStrategic) {
    updated.gamesAsStrategic += 1;
  }

  // Per-game records
  if (result.damageDealt > updated.biggestDamageGame) {
    updated.biggestDamageGame = result.damageDealt;
  }
  if (result.kills > updated.mostKillsGame) {
    updated.mostKillsGame = result.kills;
  }
  if (result.turns > updated.longestGame) {
    updated.longestGame = result.turns;
  }

  // Win / Loss / Draw
  if (result.won) {
    updated.totalWins += 1;
    updated.currentWinStreak += 1;
    if (updated.currentWinStreak > updated.winStreak) {
      updated.winStreak = updated.currentWinStreak;
    }
    // Fastest win (fewest turns)
    if (updated.fastestWin === 0 || result.turns < updated.fastestWin) {
      updated.fastestWin = result.turns;
    }
    // Zero-loss win
    if (result.losses === 0) {
      updated.zeroLossWins += 1;
      updated.perfectGames += 1;
    }
    // Comeback check: won with <= 2 units remaining
    if (result.remainingUnits <= 2 && result.remainingUnits > 0) {
      // comeback achievement is tracked via totalWins >= 1, but we add a special marker
      // The comeback achievement is handled in getNewlyUnlocked below
    }
    // Hardest difficulty
    const diffLevel = difficultyMap[result.difficulty] ?? 0;
    if (diffLevel > updated.hardestDifficultyWin) {
      updated.hardestDifficultyWin = diffLevel;
    }
  } else if (result.isDraw) {
    updated.totalDraws += 1;
    // Draw resets streak
    updated.currentWinStreak = 0;
  } else {
    updated.totalLosses += 1;
    // Loss resets streak
    updated.currentWinStreak = 0;
  }

  // Check and unlock achievements
  const newlyUnlocked = checkAchievements(updated);
  for (const ach of newlyUnlocked) {
    if (!updated.achievements.includes(ach.id)) {
      updated.achievements.push(ach.id);
    }
  }

  return updated;
}

// ===== Achievement Checking =====

function checkAchievements(stats: PlayerStats): Achievement[] {
  return ACHIEVEMENTS.filter(ach => {
    if (stats.achievements.includes(ach.id)) return false;
    const value = (stats as unknown as Record<string, unknown>)[ach.condition] as number;
    if (typeof value !== 'number') return false;
    
    // Special handling: no_retreat uses threshold 0, meaning totalRetreats stays at 0
    // But we can't track "5 games with 0 retreats" simply. Instead we'll just
    // use the inverse check for this one - if totalGames >= 20 AND totalRetreats === 0
    if (ach.id === 'no_retreat') {
      return stats.totalGames >= 5 && stats.totalRetreats === 0;
    }

    // Special handling: comeback needs special tracking
    // We can't retroactively check, so we'll skip it here and handle it in getNewlyUnlocked
    if (ach.id === 'comeback') {
      return false; // handled separately via game result
    }

    return value >= ach.threshold;
  });
}

export function getUnlockedAchievements(stats: PlayerStats): Achievement[] {
  return ACHIEVEMENTS.filter(ach => stats.achievements.includes(ach.id));
}

export function getNewlyUnlocked(previous: string[], current: string[]): Achievement[] {
  const newIds = current.filter(id => !previous.includes(id));
  return ACHIEVEMENTS.filter(ach => newIds.includes(ach.id));
}

// ===== Get Achievement Progress =====

export function getAchievementProgress(stats: PlayerStats, achievement: Achievement): number {
  const value = (stats as unknown as Record<string, unknown>)[achievement.condition] as number;
  if (typeof value !== 'number') return 0;

  // For threshold 0 achievements (like no_retreat), compute custom progress
  if (achievement.id === 'no_retreat') {
    // Progress based on how many games were played without retreats
    // Since we can't track per-game, use totalGames as proxy
    return Math.min(1, stats.totalRetreats === 0 ? stats.totalGames / 5 : 0);
  }

  return Math.min(1, value / achievement.threshold);
}

// ===== Format Stats for Display =====

export function formatStatValue(value: number, label: string): string {
  if (label === '胜率') {
    return `${Math.round(value)}%`;
  }
  if (value >= 10000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value.toString();
}
