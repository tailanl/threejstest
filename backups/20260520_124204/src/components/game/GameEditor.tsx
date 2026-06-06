'use client';

import { useState, useCallback, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Map as MapIcon,
  Swords,
  Shield,
  Target,
  Eye,
  Footprints,
  Radar,
  Wrench,
  Package,
  Plane,
  Rocket,
  Play,
  RotateCcw,
  Trash2,
  Plus,
  Save,
  Download,
  ChevronUp,
  ChevronDown,
  Loader2,
  Trophy,
  BarChart3,
  Crosshair,
  Globe,
  Eraser,
  Palette,
  X,
} from 'lucide-react';
import { UNIT_CONFIGS, TERRAIN_CONFIGS, MAP_WIDTH, MAP_HEIGHT, RED_DEPLOYMENT, BLUE_DEPLOYMENT } from '@/game/config';
import { generateMap } from '@/game/map';
import { FORCE_TEMPLATES } from '@/game/strategic-engine';
import { STRATEGIC_TERRAIN_CONFIGS } from '@/game/strategic-types';
import type { AIDifficulty, TerrainType, MapType, UnitType } from '@/game/types';
import type { ForceTemplate, StrategicUnit, StrategicTerrainType } from '@/game/strategic-types';

// ===== Types =====

interface GameResult {
  winner: 'red' | 'blue' | 'draw';
  turns: number;
}

interface AITestSummary {
  redWins: number;
  blueWins: number;
  draws: number;
  avgTurns: number;
  redWinRate: number;
}

interface UnitStatEdit {
  type: UnitType;
  name: string;
  baseHp: number;
  attack: number;
  defense: number;
  armor: number;
  armorPenetration: number;
  moveRange: number;
  attackRange: number;
  vision: number;
}

interface ForceTemplateEdit {
  key: string;
  name: string;
  units: StrategicUnit[];
  moveRange: number;
  vision: number;
  cost: number;
}

// ===== Terrain palette data =====

const TACTICAL_TERRAIN_PALETTE: { type: TerrainType; name: string; color: string }[] = [
  { type: 'plains', name: '平原', color: '#7cb342' },
  { type: 'forest', name: '森林', color: '#2e7d32' },
  { type: 'mountain', name: '山地', color: '#78909c' },
  { type: 'water', name: '水域', color: '#1565c0' },
  { type: 'city', name: '城市', color: '#8d6e63' },
  { type: 'road', name: '公路', color: '#9e9e9e' },
  { type: 'swamp', name: '沼泽', color: '#5d4037' },
  { type: 'bridge', name: '桥梁', color: '#d7ccc8' },
  { type: 'desert', name: '沙漠', color: '#fdd835' },
  { type: 'fortress', name: '要塞', color: '#455a64' },
];

const STRATEGIC_TERRAIN_PALETTE: { type: StrategicTerrainType; name: string; color: string }[] = [
  { type: 'plains', name: '平原', color: '#7cb342' },
  { type: 'forest', name: '森林', color: '#2e7d32' },
  { type: 'mountain', name: '山地', color: '#78909c' },
  { type: 'water', name: '水域', color: '#1565c0' },
  { type: 'city', name: '城市', color: '#8d6e63' },
  { type: 'desert', name: '沙漠', color: '#fdd835' },
  { type: 'marshland', name: '沼泽', color: '#5d4037' },
  { type: 'highland', name: '高原', color: '#546e7a' },
];

const UNIT_ICONS: Record<string, React.ReactNode> = {
  tank: <Shield className="w-3.5 h-3.5" />,
  ifv: <Footprints className="w-3.5 h-3.5" />,
  artillery: <Target className="w-3.5 h-3.5" />,
  scout: <Eye className="w-3.5 h-3.5" />,
  infantry: <Swords className="w-3.5 h-3.5" />,
  sam: <Radar className="w-3.5 h-3.5" />,
  engineer: <Wrench className="w-3.5 h-3.5" />,
  supply: <Package className="w-3.5 h-3.5" />,
  helicopter: <Plane className="w-3.5 h-3.5" />,
  mlrs: <Rocket className="w-3.5 h-3.5" />,
};

// ===== Main Component =====

export default function GameEditor() {
  const [activeTab, setActiveTab] = useState('map');

  return (
    <div className="bg-gray-900 text-white rounded-xl border border-white/10 overflow-hidden">
      <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-4 pt-3 pb-1">
          <TabsList className="bg-black/40 border border-white/10 w-full grid grid-cols-4 h-9">
            <TabsTrigger value="map" className="text-xs gap-1 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
              <MapIcon className="w-3.5 h-3.5" /> 地形编辑
            </TabsTrigger>
            <TabsTrigger value="units" className="text-xs gap-1 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
              <Swords className="w-3.5 h-3.5" /> 兵种调整
            </TabsTrigger>
            <TabsTrigger value="forces" className="text-xs gap-1 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
              <Shield className="w-3.5 h-3.5" /> 部队编制
            </TabsTrigger>
            <TabsTrigger value="aitest" className="text-xs gap-1 data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
              <BarChart3 className="w-3.5 h-3.5" /> AI测试
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="map" className="px-4 pb-4">
          <MapEditorTab />
        </TabsContent>
        <TabsContent value="units" className="px-4 pb-4">
          <UnitStatsTab />
        </TabsContent>
        <TabsContent value="forces" className="px-4 pb-4">
          <ForceEditorTab />
        </TabsContent>
        <TabsContent value="aitest" className="px-4 pb-4">
          <AITestTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ===== Tab 1: Map Editor =====

function MapEditorTab() {
  const [mapMode, setMapMode] = useState<'tactical' | 'strategic'>('tactical');
  const [mapType, setMapType] = useState<MapType>('random');
  const [tacticalMap, setTacticalMap] = useState<TerrainType[][]>(() => {
    const map = generateMap('random');
    return map.cells.map(row => row.map(cell => cell.terrain));
  });
  const [strategicMap, setStrategicMap] = useState<StrategicTerrainType[][]>(() => {
    // Default strategic map layout
    return [
      ['plains', 'forest', 'highland', 'highland', 'mountain', 'highland', 'mountain', 'highland', 'forest', 'forest'],
      ['plains', 'plains', 'forest', 'mountain', 'mountain', 'mountain', 'mountain', 'forest', 'highland', 'forest'],
      ['plains', 'plains', 'forest', 'mountain', 'forest', 'mountain', 'mountain', 'forest', 'forest', 'forest'],
      ['plains', 'plains', 'plains', 'city', 'water', 'water', 'forest', 'plains', 'plains', 'city'],
      ['plains', 'city', 'plains', 'city', 'plains', 'forest', 'city', 'forest', 'forest', 'city'],
      ['city', 'plains', 'plains', 'city', 'plains', 'plains', 'city', 'forest', 'mountain', 'forest'],
      ['plains', 'city', 'plains', 'city', 'plains', 'forest', 'plains', 'mountain', 'forest', 'plains'],
      ['marshland', 'plains', 'city', 'city', 'plains', 'plains', 'plains', 'forest', 'plains', 'city'],
    ];
  });
  const [selectedTerrain, setSelectedTerrain] = useState<string>('plains');
  const [isPainting, setIsPainting] = useState(false);

  const currentPalette = mapMode === 'tactical' ? TACTICAL_TERRAIN_PALETTE : STRATEGIC_TERRAIN_PALETTE;

  const handleRegenerate = useCallback(() => {
    if (mapMode === 'tactical') {
      const map = generateMap(mapType);
      setTacticalMap(map.cells.map(row => row.map(cell => cell.terrain)));
    }
  }, [mapMode, mapType]);

  const handleClear = useCallback(() => {
    if (mapMode === 'tactical') {
      setTacticalMap(Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill('plains')));
    } else {
      setStrategicMap(Array.from({ length: 8 }, () => Array(10).fill('plains')));
    }
  }, [mapMode]);

  const handleCellClick = useCallback((row: number, col: number) => {
    if (mapMode === 'tactical') {
      setTacticalMap(prev => {
        const next = prev.map(r => [...r]);
        next[row][col] = selectedTerrain as TerrainType;
        return next;
      });
    } else {
      setStrategicMap(prev => {
        const next = prev.map(r => [...r]);
        next[row][col] = selectedTerrain as StrategicTerrainType;
        return next;
      });
    }
  }, [mapMode, selectedTerrain]);

  const handleCellDrag = useCallback((row: number, col: number) => {
    if (!isPainting) return;
    handleCellClick(row, col);
  }, [isPainting, handleCellClick]);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={mapMode} onValueChange={(v: 'tactical' | 'strategic') => setMapMode(v)}>
          <SelectTrigger className="w-28 h-8 text-xs bg-black/40 border-white/10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-white/10">
            <SelectItem value="tactical" className="text-xs">
              <Crosshair className="w-3 h-3 mr-1" /> 战术 16×12
            </SelectItem>
            <SelectItem value="strategic" className="text-xs">
              <Globe className="w-3 h-3 mr-1" /> 战略 10×8
            </SelectItem>
          </SelectContent>
        </Select>

        {mapMode === 'tactical' && (
          <Select value={mapType} onValueChange={(v: MapType) => setMapType(v)}>
            <SelectTrigger className="w-28 h-8 text-xs bg-black/40 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-white/10">
              <SelectItem value="random" className="text-xs">随机地图</SelectItem>
              <SelectItem value="mountain-pass" className="text-xs">山地隘口</SelectItem>
              <SelectItem value="river-valley" className="text-xs">河谷突破</SelectItem>
              <SelectItem value="urban-warfare" className="text-xs">城市攻防</SelectItem>
              <SelectItem value="desert-storm" className="text-xs">沙漠风暴</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Button size="sm" variant="outline" onClick={handleRegenerate} className="h-8 text-xs border-white/10 hover:bg-amber-500/20 hover:text-amber-400">
          <RotateCcw className="w-3 h-3 mr-1" /> 重新生成
        </Button>
        <Button size="sm" variant="outline" onClick={handleClear} className="h-8 text-xs border-white/10 hover:bg-red-500/20 hover:text-red-400">
          <Eraser className="w-3 h-3 mr-1" /> 清空
        </Button>
      </div>

      <div className="flex gap-3">
        {/* Terrain palette */}
        <div className="flex flex-col gap-1 shrink-0">
          <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1">
            <Palette className="w-3 h-3" /> 地形笔刷
          </div>
          {currentPalette.map(t => (
            <button
              key={t.type}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] transition-all cursor-pointer ${
                selectedTerrain === t.type
                  ? 'bg-amber-500/20 border border-amber-400/50 text-amber-300'
                  : 'bg-white/5 border border-white/5 text-gray-300 hover:bg-white/10'
              }`}
              onClick={() => setSelectedTerrain(t.type)}
            >
              <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: t.color }} />
              {t.name}
            </button>
          ))}
        </div>

        {/* Map grid */}
        <div className="flex-1 overflow-auto">
          <div
            className="inline-grid gap-px select-none"
            style={{
              gridTemplateColumns: `repeat(${mapMode === 'tactical' ? MAP_WIDTH : 10}, minmax(0, 1fr))`,
              maxWidth: '100%',
            }}
            onMouseDown={() => setIsPainting(true)}
            onMouseUp={() => setIsPainting(false)}
            onMouseLeave={() => setIsPainting(false)}
          >
            {(mapMode === 'tactical' ? tacticalMap : strategicMap).map((row, z) =>
              row.map((terrain, x) => {
                const config = mapMode === 'tactical'
                  ? TERRAIN_CONFIGS[terrain]
                  : STRATEGIC_TERRAIN_CONFIGS[terrain as StrategicTerrainType];
                const color = config ? (mapMode === 'tactical' ? (config as typeof TERRAIN_CONFIGS[string]).stats.color : (config as typeof STRATEGIC_TERRAIN_CONFIGS[StrategicTerrainType]).color) : '#333';
                return (
                  <div
                    key={`${z}-${x}`}
                    className="aspect-square rounded-sm cursor-pointer hover:ring-1 hover:ring-amber-400/50 transition-all"
                    style={{
                      backgroundColor: color,
                      minWidth: mapMode === 'tactical' ? '12px' : '24px',
                    }}
                    onClick={() => handleCellClick(z, x)}
                    onMouseEnter={() => handleCellDrag(z, x)}
                    title={`(${x},${z}) ${terrain}`}
                  />
                );
              }),
            )}
          </div>
        </div>
      </div>

      {/* Map legend */}
      <div className="flex flex-wrap gap-2 text-[10px] text-gray-400">
        {currentPalette.map(t => (
          <div key={t.type} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: t.color }} />
            {t.name}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Tab 2: Unit Stats Editor =====

function UnitStatsTab() {
  const unitTypes: UnitType[] = ['tank', 'ifv', 'artillery', 'scout', 'infantry', 'sam', 'engineer', 'supply', 'helicopter', 'mlrs'];

  const [edits, setEdits] = useState<UnitStatEdit[]>(() =>
    unitTypes.map(type => {
      const config = UNIT_CONFIGS[type];
      return {
        type,
        name: config.name,
        baseHp: config.baseHp,
        attack: config.stats.attack,
        defense: config.stats.defense,
        armor: config.stats.armor,
        armorPenetration: config.stats.armorPenetration,
        moveRange: config.stats.moveRange,
        attackRange: config.stats.attackRange,
        vision: config.stats.vision,
      };
    }),
  );

  const [hasChanges, setHasChanges] = useState(false);

  const handleStatChange = useCallback((type: UnitType, stat: keyof UnitStatEdit, value: string) => {
    const numVal = parseInt(value) || 0;
    setEdits(prev => {
      const next = prev.map(e => e.type === type ? { ...e, [stat]: numVal } : e);
      return next;
    });
    setHasChanges(true);
  }, []);

  const handleReset = useCallback(() => {
    setEdits(unitTypes.map(type => {
      const config = UNIT_CONFIGS[type];
      return {
        type,
        name: config.name,
        baseHp: config.baseHp,
        attack: config.stats.attack,
        defense: config.stats.defense,
        armor: config.stats.armor,
        armorPenetration: config.stats.armorPenetration,
        moveRange: config.stats.moveRange,
        attackRange: config.stats.attackRange,
        vision: config.stats.vision,
      };
    }));
    setHasChanges(false);
  }, []);

  const handleSave = useCallback(() => {
    // Update UNIT_CONFIGS at runtime
    for (const edit of edits) {
      const config = UNIT_CONFIGS[edit.type];
      if (config) {
        config.baseHp = edit.baseHp;
        config.stats.attack = edit.attack;
        config.stats.defense = edit.defense;
        config.stats.armor = edit.armor;
        config.stats.armorPenetration = edit.armorPenetration;
        config.stats.moveRange = edit.moveRange;
        config.stats.attackRange = edit.attackRange;
        config.stats.vision = edit.vision;
      }
    }
    setHasChanges(false);
  }, [edits]);

  const statColumns: { key: keyof UnitStatEdit; label: string; max: number }[] = [
    { key: 'baseHp', label: 'HP', max: 200 },
    { key: 'attack', label: '攻击', max: 100 },
    { key: 'defense', label: '防御', max: 50 },
    { key: 'armor', label: '装甲', max: 50 },
    { key: 'armorPenetration', label: '穿甲', max: 50 },
    { key: 'moveRange', label: '移动', max: 10 },
    { key: 'attackRange', label: '射程', max: 10 },
    { key: 'vision', label: '视野', max: 10 },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-gray-400">编辑单位属性数值，点击保存后生效于当前游戏</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleReset} className="h-7 text-xs border-white/10 hover:bg-white/10">
            <RotateCcw className="w-3 h-3 mr-1" /> 重置默认
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges}
            className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
          >
            <Save className="w-3 h-3 mr-1" /> 保存修改
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="text-gray-400 border-b border-white/10">
              <th className="text-left py-2 px-1.5 w-28 sticky left-0 bg-gray-900 z-10">单位</th>
              {statColumns.map(col => (
                <th key={col.key} className="text-center py-2 px-1 min-w-[60px]">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {edits.map(edit => (
              <tr key={edit.type} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td className="py-1.5 px-1.5 sticky left-0 bg-gray-900 z-10">
                  <div className="flex items-center gap-1.5">
                    {UNIT_ICONS[edit.type]}
                    <span className="font-medium text-white">{edit.name}</span>
                  </div>
                </td>
                {statColumns.map(col => (
                  <td key={col.key} className="py-1.5 px-1 text-center">
                    <Input
                      type="number"
                      value={edit[col.key] as number}
                      onChange={e => handleStatChange(edit.type, col.key, e.target.value)}
                      className="h-7 w-14 mx-auto text-center text-xs bg-black/40 border-white/10 focus:border-amber-400/50"
                      min={0}
                      max={col.max}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasChanges && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
          <Save className="w-3.5 h-3.5" />
          有未保存的修改，点击"保存修改"按钮应用
        </div>
      )}
    </div>
  );
}

// ===== Tab 3: Force Editor =====

function ForceEditorTab() {
  const [forces, setForces] = useState<ForceTemplateEdit[]>(() =>
    Object.entries(FORCE_TEMPLATES).map(([key, tmpl]) => ({
      key,
      name: tmpl.name,
      units: tmpl.units.map(u => ({ ...u })),
      moveRange: tmpl.moveRange,
      vision: tmpl.vision,
      cost: tmpl.cost,
    })),
  );

  const [selectedForceKey, setSelectedForceKey] = useState<string>(forces[0]?.key || '');
  const [hasForceChanges, setHasForceChanges] = useState(false);

  const selectedForce = forces.find(f => f.key === selectedForceKey);

  const handleAddUnit = useCallback(() => {
    if (!selectedForce) return;
    setForces(prev => prev.map(f =>
      f.key === selectedForceKey
        ? { ...f, units: [...f.units, { type: 'infantry' as UnitType, count: 1 }] }
        : f,
    ));
    setHasForceChanges(true);
  }, [selectedForce, selectedForceKey]);

  const handleRemoveUnit = useCallback((index: number) => {
    if (!selectedForce) return;
    setForces(prev => prev.map(f =>
      f.key === selectedForceKey
        ? { ...f, units: f.units.filter((_, i) => i !== index) }
        : f,
    ));
    setHasForceChanges(true);
  }, [selectedForce, selectedForceKey]);

  const handleUnitTypeChange = useCallback((index: number, newType: UnitType) => {
    setForces(prev => prev.map(f =>
      f.key === selectedForceKey
        ? { ...f, units: f.units.map((u, i) => i === index ? { ...u, type: newType } : u) }
        : f,
    ));
    setHasForceChanges(true);
  }, [selectedForceKey]);

  const handleUnitCountChange = useCallback((index: number, count: number) => {
    setForces(prev => prev.map(f =>
      f.key === selectedForceKey
        ? { ...f, units: f.units.map((u, i) => i === index ? { ...u, count: Math.max(0, count) } : u) }
        : f,
    ));
    setHasForceChanges(true);
  }, [selectedForceKey]);

  const handleForcePropChange = useCallback((prop: 'name' | 'moveRange' | 'vision', value: string | number) => {
    setForces(prev => prev.map(f =>
      f.key === selectedForceKey ? { ...f, [prop]: value } : f,
    ));
    setHasForceChanges(true);
  }, [selectedForceKey]);

  const handleAddTemplate = useCallback(() => {
    const newKey = `custom_${Date.now()}`;
    const newForce: ForceTemplateEdit = {
      key: newKey,
      name: '新编制',
      units: [{ type: 'infantry', count: 3 }],
      moveRange: 2,
      vision: 2,
      cost: 10,
    };
    setForces(prev => [...prev, newForce]);
    setSelectedForceKey(newKey);
    setHasForceChanges(true);
  }, []);

  const handleDeleteTemplate = useCallback((key: string) => {
    setForces(prev => prev.filter(f => f.key !== key));
    if (selectedForceKey === key) {
      setSelectedForceKey(forces[0]?.key || '');
    }
    setHasForceChanges(true);
  }, [selectedForceKey, forces]);

  const handleResetForces = useCallback(() => {
    setForces(Object.entries(FORCE_TEMPLATES).map(([key, tmpl]) => ({
      key,
      name: tmpl.name,
      units: tmpl.units.map(u => ({ ...u })),
      moveRange: tmpl.moveRange,
      vision: tmpl.vision,
      cost: tmpl.cost,
    })));
    setHasForceChanges(false);
  }, []);

  const handleSaveForces = useCallback(() => {
    // Update FORCE_TEMPLATES at runtime
    for (const force of forces) {
      const existing = FORCE_TEMPLATES[force.key];
      if (existing) {
        existing.name = force.name;
        existing.units = force.units.filter(u => u.count > 0).map(u => ({ ...u }));
        existing.moveRange = force.moveRange;
        existing.vision = force.vision;
      } else {
        // Add new template
        (FORCE_TEMPLATES as Record<string, ForceTemplate>)[force.key] = {
          name: force.name,
          units: force.units.filter(u => u.count > 0).map(u => ({ ...u })),
          moveRange: force.moveRange,
          vision: force.vision,
          cost: force.cost,
        };
      }
    }
    setHasForceChanges(false);
  }, [forces]);

  const unitTypeOptions: UnitType[] = ['tank', 'ifv', 'artillery', 'scout', 'infantry', 'sam', 'engineer', 'supply', 'helicopter', 'mlrs'];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-gray-400">编辑部队编制模板，添加或删除单位组成</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleResetForces} className="h-7 text-xs border-white/10 hover:bg-white/10">
            <RotateCcw className="w-3 h-3 mr-1" /> 重置
          </Button>
          <Button
            size="sm"
            onClick={handleSaveForces}
            disabled={!hasForceChanges}
            className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
          >
            <Save className="w-3 h-3 mr-1" /> 保存
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Force list */}
        <div className="w-40 shrink-0 space-y-1">
          <div className="text-[10px] text-gray-400 mb-1">编制列表</div>
          {forces.map(f => (
            <div
              key={f.key}
              className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition-all ${
                selectedForceKey === f.key
                  ? 'bg-amber-500/20 border border-amber-400/40 text-amber-300'
                  : 'bg-white/5 border border-white/5 text-gray-300 hover:bg-white/10'
              }`}
              onClick={() => setSelectedForceKey(f.key)}
            >
              <span className="truncate">{f.name}</span>
              {!Object.keys(FORCE_TEMPLATES).includes(f.key) && (
                <button
                  className="text-red-400 hover:text-red-300 shrink-0 ml-1"
                  onClick={e => { e.stopPropagation(); handleDeleteTemplate(f.key); }}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={handleAddTemplate} className="w-full h-7 text-xs border-dashed border-white/20 hover:bg-amber-500/10 hover:text-amber-400">
            <Plus className="w-3 h-3 mr-1" /> 新增编制
          </Button>
        </div>

        {/* Force detail */}
        {selectedForce && (
          <div className="flex-1 space-y-3">
            <Card className="bg-black/30 border-white/10">
              <CardContent className="p-3 space-y-3">
                {/* Force name */}
                <div className="flex items-center gap-2">
                  <label className="text-[10px] text-gray-400 w-12 shrink-0">名称</label>
                  <Input
                    value={selectedForce.name}
                    onChange={e => handleForcePropChange('name', e.target.value)}
                    className="h-7 text-xs bg-black/40 border-white/10 focus:border-amber-400/50"
                  />
                </div>

                {/* Move range and vision */}
                <div className="flex gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <label className="text-[10px] text-gray-400 w-12 shrink-0">移动</label>
                    <Input
                      type="number"
                      value={selectedForce.moveRange}
                      onChange={e => handleForcePropChange('moveRange', parseInt(e.target.value) || 0)}
                      className="h-7 w-16 text-xs text-center bg-black/40 border-white/10"
                      min={0}
                      max={5}
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <label className="text-[10px] text-gray-400 w-12 shrink-0">视野</label>
                    <Input
                      type="number"
                      value={selectedForce.vision}
                      onChange={e => handleForcePropChange('vision', parseInt(e.target.value) || 0)}
                      className="h-7 w-16 text-xs text-center bg-black/40 border-white/10"
                      min={0}
                      max={6}
                    />
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* Unit composition */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">单位组成</span>
                    <Button size="sm" variant="outline" onClick={handleAddUnit} className="h-6 text-[10px] border-white/10 hover:bg-amber-500/10 hover:text-amber-400">
                      <Plus className="w-2.5 h-2.5 mr-0.5" /> 添加单位
                    </Button>
                  </div>

                  {selectedForce.units.length === 0 && (
                    <div className="text-[10px] text-gray-500 py-2 text-center">暂无单位，点击上方按钮添加</div>
                  )}

                  {selectedForce.units.map((unit, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Select
                        value={unit.type}
                        onValueChange={(v: UnitType) => handleUnitTypeChange(i, v)}
                      >
                        <SelectTrigger className="h-7 text-xs bg-black/40 border-white/10 w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-800 border-white/10">
                          {unitTypeOptions.map(ut => (
                            <SelectItem key={ut} value={ut} className="text-xs">
                              <div className="flex items-center gap-1">
                                {UNIT_ICONS[ut]}
                                {UNIT_CONFIGS[ut].name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleUnitCountChange(i, unit.count - 1)} className="h-7 w-7 p-0 border-white/10 text-xs">
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                        <Input
                          type="number"
                          value={unit.count}
                          onChange={e => handleUnitCountChange(i, parseInt(e.target.value) || 0)}
                          className="h-7 w-12 text-center text-xs bg-black/40 border-white/10"
                          min={0}
                          max={20}
                        />
                        <Button size="sm" variant="outline" onClick={() => handleUnitCountChange(i, unit.count + 1)} className="h-7 w-7 p-0 border-white/10 text-xs">
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleRemoveUnit(i)} className="h-7 w-7 p-0 border-white/10 hover:bg-red-500/20 hover:text-red-400">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="flex gap-2 text-[10px]">
                  <Badge variant="outline" className="border-white/10 text-gray-400 text-[10px]">
                    总单位: {selectedForce.units.reduce((s, u) => s + u.count, 0)}
                  </Badge>
                  <Badge variant="outline" className="border-white/10 text-gray-400 text-[10px]">
                    攻击力: {selectedForce.units.reduce((s, u) => s + (UNIT_CONFIGS[u.type]?.stats.attack || 0) * u.count, 0)}
                  </Badge>
                  <Badge variant="outline" className="border-white/10 text-gray-400 text-[10px]">
                    防御力: {selectedForce.units.reduce((s, u) => s + (UNIT_CONFIGS[u.type]?.stats.defense || 0) * u.count, 0)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Tab 4: AI Test =====

function AITestTab() {
  const [mode, setMode] = useState<'tactical' | 'strategic'>('tactical');
  const [difficulty, setDifficulty] = useState<AIDifficulty>('normal');
  const [gameCount, setGameCount] = useState([10]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<GameResult[]>([]);
  const [summary, setSummary] = useState<AITestSummary | null>(null);

  const handleStartTest = useCallback(async () => {
    setIsRunning(true);
    setProgress(0);
    setResults([]);
    setSummary(null);

    try {
      const response = await fetch('/api/ai-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameCount: gameCount[0],
          difficulty,
          mode,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('AI test failed:', error);
        setIsRunning(false);
        return;
      }

      const data = await response.json();
      setResults(data.results);
      setSummary(data.summary);
    } catch (err) {
      console.error('AI test error:', err);
    } finally {
      setProgress(100);
      setIsRunning(false);
    }
  }, [gameCount, difficulty, mode]);

  // Pie chart data for win rate visualization
  const pieData = useMemo(() => {
    if (!summary) return null;
    const total = summary.redWins + summary.blueWins + summary.draws;
    if (total === 0) return null;
    return {
      red: (summary.redWins / total) * 360,
      blue: (summary.blueWins / total) * 360,
      draw: (summary.draws / total) * 360,
    };
  }, [summary]);

  return (
    <div className="space-y-4">
      {/* Test configuration */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-[10px] text-gray-400">测试模式</label>
          <Select value={mode} onValueChange={(v: 'tactical' | 'strategic') => setMode(v)}>
            <SelectTrigger className="h-8 text-xs bg-black/40 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-white/10">
              <SelectItem value="tactical" className="text-xs">
                <Crosshair className="w-3 h-3 mr-1 inline" /> 战术模式
              </SelectItem>
              <SelectItem value="strategic" className="text-xs">
                <Globe className="w-3 h-3 mr-1 inline" /> 战略模式
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-gray-400">AI 难度</label>
          <Select value={difficulty} onValueChange={(v: AIDifficulty) => setDifficulty(v)}>
            <SelectTrigger className="h-8 text-xs bg-black/40 border-white/10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-white/10">
              <SelectItem value="easy" className="text-xs">🟢 简单</SelectItem>
              <SelectItem value="normal" className="text-xs">🟡 普通</SelectItem>
              <SelectItem value="hard" className="text-xs">🔴 困难</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] text-gray-400">游戏局数: {gameCount[0]}</label>
          <Slider
            value={gameCount}
            onValueChange={setGameCount}
            min={1}
            max={100}
            step={1}
            className="py-2"
          />
        </div>
      </div>

      {/* Start button */}
      <Button
        onClick={handleStartTest}
        disabled={isRunning}
        className="w-full h-9 text-sm bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
      >
        {isRunning ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 测试中...
          </>
        ) : (
          <>
            <Play className="w-4 h-4 mr-2" /> 开始测试 ({gameCount[0]}局)
          </>
        )}
      </Button>

      {/* Progress bar */}
      {isRunning && (
        <Progress value={progress} className="h-1.5" />
      )}

      {/* Results */}
      {summary && pieData && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <Card className="bg-black/30 border-white/10">
              <CardContent className="p-2.5 text-center">
                <div className="text-[10px] text-gray-400">红方胜率</div>
                <div className="text-lg font-bold text-red-400">{summary.redWinRate}%</div>
              </CardContent>
            </Card>
            <Card className="bg-black/30 border-white/10">
              <CardContent className="p-2.5 text-center">
                <div className="text-[10px] text-gray-400">红方胜场</div>
                <div className="text-lg font-bold text-red-400">{summary.redWins}</div>
              </CardContent>
            </Card>
            <Card className="bg-black/30 border-white/10">
              <CardContent className="p-2.5 text-center">
                <div className="text-[10px] text-gray-400">蓝方胜场</div>
                <div className="text-lg font-bold text-blue-400">{summary.blueWins}</div>
              </CardContent>
            </Card>
            <Card className="bg-black/30 border-white/10">
              <CardContent className="p-2.5 text-center">
                <div className="text-[10px] text-gray-400">平局</div>
                <div className="text-lg font-bold text-gray-400">{summary.draws}</div>
              </CardContent>
            </Card>
            <Card className="bg-black/30 border-white/10">
              <CardContent className="p-2.5 text-center">
                <div className="text-[10px] text-gray-400">平均回合</div>
                <div className="text-lg font-bold text-amber-400">{summary.avgTurns}</div>
              </CardContent>
            </Card>
          </div>

          {/* Pie chart */}
          <div className="flex items-center gap-4 justify-center">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                {/* Red */}
                <circle
                  cx="18" cy="18" r="15.9"
                  fill="transparent"
                  stroke="#ef4444"
                  strokeWidth="3.8"
                  strokeDasharray={`${pieData.red} ${360 - pieData.red}`}
                  strokeDashoffset="0"
                />
                {/* Blue */}
                <circle
                  cx="18" cy="18" r="15.9"
                  fill="transparent"
                  stroke="#3b82f6"
                  strokeWidth="3.8"
                  strokeDasharray={`${pieData.blue} ${360 - pieData.blue}`}
                  strokeDashoffset={`${-pieData.red}`}
                />
                {/* Draw */}
                <circle
                  cx="18" cy="18" r="15.9"
                  fill="transparent"
                  stroke="#6b7280"
                  strokeWidth="3.8"
                  strokeDasharray={`${pieData.draw} ${360 - pieData.draw}`}
                  strokeDashoffset={`${-(pieData.red + pieData.blue)}`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Trophy className="w-4 h-4 mx-auto text-amber-400 mb-0.5" />
                  <div className="text-[10px] font-bold text-white">{summary.redWinRate}%</div>
                </div>
              </div>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-red-500" /> 红方胜 {summary.redWins}局
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-blue-500" /> 蓝方胜 {summary.blueWins}局
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-gray-500" /> 平局 {summary.draws}局
              </div>
            </div>
          </div>

          {/* Game-by-game results table */}
          <div className="space-y-1.5">
            <div className="text-[10px] text-gray-400">逐局结果</div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-gray-400 border-b border-white/10 sticky top-0 bg-gray-900">
                    <th className="py-1 px-2 text-left">#</th>
                    <th className="py-1 px-2 text-left">胜方</th>
                    <th className="py-1 px-2 text-right">回合数</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-1 px-2 text-gray-400">{i + 1}</td>
                      <td className="py-1 px-2">
                        <Badge className={`text-[9px] px-1.5 ${
                          r.winner === 'red' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                          r.winner === 'blue' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                          'bg-gray-500/20 text-gray-400 border-gray-500/30'
                        }`}>
                          {r.winner === 'red' ? '红方' : r.winner === 'blue' ? '蓝方' : '平局'}
                        </Badge>
                      </td>
                      <td className="py-1 px-2 text-right text-gray-300">{r.turns}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* No results state */}
      {!summary && !isRunning && (
        <div className="text-center py-6 text-gray-500 text-xs">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
          选择测试参数后点击"开始测试"
        </div>
      )}
    </div>
  );
}
