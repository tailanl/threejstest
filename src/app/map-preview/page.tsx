'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { generateProceduralMap, generateHierarchicalMap, getAvailableTemplates, generateFusedMap, saveFusedMap, listSavedMaps, generateEastAsiaStyleMap, generateEuropeStyleMap, saveRegionDetail, generateMegaMap, saveMegaMapChunk } from '@/game/procedural-map';
import type { MegaMapResult } from '@/game/procedural-map';
import { generateStrategicMap } from '@/game/strategic-map';
import type { StrategicMap } from '@/game/strategic-types';
import { TERRAIN_CONFIGS } from '@/game/config';
import type { MapCell } from '@/game/types';

const MAP_SIZE_OPTIONS = [
  { label: '战术(16×12)', width: 16, height: 12 },
  { label: '战略小(32×24)', width: 32, height: 24 },
  { label: '战略中(48×36)', width: 48, height: 36 },
  { label: '大地图(64×48)', width: 64, height: 48 },
  { label: '超大(96×72)', width: 96, height: 72 },
  { label: '巨型(128×96)', width: 128, height: 96 },
  { label: '史诗(192×144)', width: 192, height: 144 },
] as const;

function randomSeed(): number {
  return Math.floor(Math.random() * 1000000);
}

interface MapPreviewData {
  seed: number;
  windDirection: number;
  windStrength: number;
  numRivers: number;
  numCities: number;
  mapWidth: number;
  mapHeight: number;
  generated: ReturnType<typeof generateProceduralMap> | null;
}

interface HierarchicalPreviewData {
  seed: number;
  macroWidth: number;
  macroHeight: number;
  generated: ReturnType<typeof generateHierarchicalMap> | null;
}

interface FusedPreviewData {
  seed: number;
  baseWidth: number;
  baseHeight: number;
  regionCountMin: number;
  regionCountMax: number;
  cityDensity: number;
  strongholdCount: number;
  roadDensity: 'sparse' | 'normal' | 'dense';
  detailLevel: 'low' | 'medium' | 'high';
  stylePreset: 'default' | 'east_asia' | 'europe';
  detailGridSize: number;
  generated: ReturnType<typeof generateFusedMap> | null;
}

export default function MapPreviewPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [preview, setPreview] = useState<MapPreviewData>(() => ({
    seed: randomSeed(),
    windDirection: 45,
    windStrength: 0.6,
    numRivers: 2,
    numCities: 3,
    mapWidth: 16,
    mapHeight: 12,
    generated: null,
  }));

  const [gallerySeeds] = useState(() =>
    Array.from({ length: 4 }, () => randomSeed())
  );

  const [hoveredCell, setHoveredCell] = useState<{ x: number; z: number; terrain: string } | null>(null);

  const [genMode, setGenMode] = useState<'procedural' | 'hierarchical' | 'fused' | 'mega' | 'strategic'>('procedural');
  const [hierPreview, setHierPreview] = useState<HierarchicalPreviewData>(() => ({
    seed: randomSeed(),
    macroWidth: 4,
    macroHeight: 3,
    generated: null,
  }));

  const [fusedPreview, setFusedPreview] = useState<FusedPreviewData>(() => ({
    seed: randomSeed(),
    baseWidth: 64,
    baseHeight: 48,
    regionCountMin: 6,
    regionCountMax: 12,
    cityDensity: 1.5,
    strongholdCount: 4,
    roadDensity: 'normal',
    detailLevel: 'medium',
    stylePreset: 'default',
    detailGridSize: 13,
    generated: null,
  }));

  const [megaMapData, setMegaMapData] = useState<MegaMapResult | null>(null);
  const [selectedMegaChunk, setSelectedMegaChunk] = useState<number | null>(null);
  const [isGeneratingMega, setIsGeneratingMega] = useState(false);
  const [megaConfig, setMegaConfig] = useState({ totalSize: 4096, gridDivisions: 32 });

  const [stratMapData, setStratMapData] = useState<StrategicMap | null>(null);
  const [isGeneratingStrat, setIsGeneratingStrat] = useState(false);
  const [stratConfig, setStratConfig] = useState({ seed: 20260606, width: 64, height: 48, worldShape: 'peninsula' as const });
  const [stratHovered, setStratHovered] = useState<{ x: number; y: number } | null>(null);
  const [stratDebugLayer, setStratDebugLayer] = useState<'terrain' | 'elevation' | 'slope' | 'moisture' | 'cityScore' | 'roadCost' | 'chokepoint' | 'defense' | 'supply'>('terrain');

  const galleryThumbs = useMemo(() => {
    return gallerySeeds.map(seed => {
      if (genMode === 'procedural') {
        const thumbMap = generateProceduralMap({
          seed,
          width: preview.mapWidth,
          height: preview.mapHeight,
          windDirection: (seed * 1.7) % (Math.PI * 2),
          windStrength: 0.4 + ((seed * 3) % 50) / 100,
          numRivers: seed % 5,
          numCities: 1 + (seed % 5),
        });
        const thumbSize = Math.max(4, Math.floor(160 / preview.mapWidth));
        const thumbCounts = thumbMap.metadata.biomeCounts;
        return { seed, mode: 'procedural' as const, thumbMap, thumbSize, thumbCounts, w: preview.mapWidth, h: preview.mapHeight };
      } else if (genMode === 'hierarchical') {
        const thumbMap = generateHierarchicalMap({
          seed,
          macroWidth: hierPreview.macroWidth,
          macroHeight: hierPreview.macroHeight,
        });
        const thumbW = thumbMap.cells[0]?.length || 1;
        const thumbH = thumbMap.cells.length || 1;
        const thumbSize = Math.max(3, Math.floor(160 / thumbW));
        const thumbCounts = thumbMap.metadata.biomeCounts;
        return { seed, mode: 'hierarchical' as const, thumbMap, thumbSize, thumbCounts, w: thumbW, h: thumbH };
      } else {
        const thumbMap = generateFusedMap({ seed, baseWidth: fusedPreview.baseWidth, baseHeight: fusedPreview.baseHeight });
        const thumbMacro = thumbMap.macroOverlay;
        const thumbW = thumbMacro[0]?.length || 1;
        const thumbH = thumbMacro.length || 1;
        const thumbSize = Math.max(2, Math.floor(140 / thumbW));
        return { seed, mode: 'fused' as const, thumbMap, thumbMacro, thumbSize, w: thumbW, h: thumbH };
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallerySeeds, genMode]);

  const [selectedMacroCell, setSelectedMacroCell] = useState<{ mx: number; mz: number } | null>(null);
  const [hoveredMacroCell, setHoveredMacroCell] = useState<{ mx: number; mz: number } | null>(null);
  const [showFullTerrain, setShowFullTerrain] = useState(false);

  const [selectedRegion, setSelectedRegion] = useState<number | null>(null);
  const [selectedPixel, setSelectedPixel] = useState<{ x: number; z: number } | null>(null);
  const [savedMaps, setSavedMaps] = useState<Array<{ key: string; savedAt: string; cityCount: number }>>([]);
  useEffect(() => { if (mounted) { setSavedMaps(listSavedMaps()); } }, [mounted]);

  const generate = useCallback((seed: number, windDir: number, windStr: number, rivers: number, cities: number, w: number, h: number) => {
    const result = generateProceduralMap({
      seed,
      width: w,
      height: h,
      windDirection: (windDir * Math.PI) / 180,
      windStrength: windStr,
      numRivers: rivers,
      numCities: cities,
    });
    setPreview(prev => ({ ...prev, seed, windDirection: windDir, windStrength: windStr, numRivers: rivers, numCities: cities, mapWidth: w, mapHeight: h, generated: result }));
  }, []);

  const generateHier = useCallback((seed: number, mw: number, mh: number) => {
    const result = generateHierarchicalMap({ seed, macroWidth: mw, macroHeight: mh });
    setHierPreview(prev => ({ ...prev, seed, macroWidth: mw, macroHeight: mh, generated: result }));
  }, []);

  const handleGenerateFused = useCallback(() => {
    let result;
    if (fusedPreview.stylePreset === 'east_asia') {
      result = generateEastAsiaStyleMap(fusedPreview.seed);
    } else if (fusedPreview.stylePreset === 'europe') {
      result = generateEuropeStyleMap(fusedPreview.seed);
    } else {
      result = generateFusedMap({
        seed: fusedPreview.seed,
        baseWidth: fusedPreview.baseWidth,
        baseHeight: Math.round(fusedPreview.baseWidth * (fusedPreview.baseHeight / fusedPreview.baseWidth)),
        regionCount: { min: fusedPreview.regionCountMin, max: fusedPreview.regionCountMax },
        cityDensity: fusedPreview.cityDensity,
        strongholdCount: fusedPreview.strongholdCount,
        roadNetworkDensity: fusedPreview.roadDensity,
        microDetailLevel: fusedPreview.detailLevel,
        detailGridSize: fusedPreview.detailGridSize,
      });
    }
    setFusedPreview(prev => ({ ...prev, generated: result }));
    setSelectedPixel(null);
  }, [fusedPreview]);

  const handleSaveFused = useCallback(() => {
    if (!fusedPreview.generated) return;
    saveFusedMap(fusedPreview.generated);
    setSavedMaps(listSavedMaps());
  }, [fusedPreview.generated]);

  const handleGenerateMega = useCallback(() => {
    setIsGeneratingMega(true);
    setSelectedMegaChunk(null);
    setTimeout(() => {
      try {
        const result = generateMegaMap({
          seed: fusedPreview.seed,
          totalSize: megaConfig.totalSize,
          gridDivisions: megaConfig.gridDivisions,
          cityDensity: fusedPreview.cityDensity,
          roadDensity: fusedPreview.roadDensity,
        });
        setMegaMapData(result);
      } catch (e) {
        console.error('[MegaMap] 生成失败:', e);
        setMegaMapData(null);
      } finally {
        setIsGeneratingMega(false);
      }
    }, 50);
  }, [fusedPreview.seed, fusedPreview.cityDensity, fusedPreview.roadDensity, megaConfig.totalSize, megaConfig.gridDivisions]);

  const handleGenerate = useCallback(() => {
    if (genMode === 'procedural') {
      generate(randomSeed(), preview.windDirection, preview.windStrength, preview.numRivers, preview.numCities, preview.mapWidth, preview.mapHeight);
    } else if (genMode === 'hierarchical') {
      generateHier(randomSeed(), hierPreview.macroWidth, hierPreview.macroHeight);
    } else {
      handleGenerateFused();
    }
  }, [generate, generateHier, genMode, preview, hierPreview, handleGenerateFused]);

  const handlePlay = useCallback(() => {
    if (genMode === 'procedural') {
      sessionStorage.setItem('proceduralMapConfig', JSON.stringify({
        type: 'procedural',
        seed: preview.seed,
        windDirection: (preview.windDirection * Math.PI) / 180,
        windStrength: preview.windStrength,
        numRivers: preview.numRivers,
        numCities: preview.numCities,
      }));
    } else if (genMode === 'hierarchical') {
      sessionStorage.setItem('proceduralMapConfig', JSON.stringify({
        type: 'hierarchical',
        seed: hierPreview.seed,
        macroWidth: hierPreview.macroWidth,
        macroHeight: hierPreview.macroHeight,
      }));
    } else {
      sessionStorage.setItem('proceduralMapConfig', JSON.stringify({
        type: 'fused',
        seed: fusedPreview.seed,
        baseWidth: fusedPreview.baseWidth,
        baseHeight: fusedPreview.baseHeight,
        stylePreset: fusedPreview.stylePreset,
      }));
    }
    window.location.href = '/';
  }, [preview, hierPreview, fusedPreview, genMode]);

  const activeGenerated = genMode === 'procedural' ? preview.generated : genMode === 'hierarchical' ? hierPreview.generated : (fusedPreview.generated ? { cells: fusedPreview.generated.macroOverlay || [], metadata: { seaLevel: 0, windDir: 0, cities: fusedPreview.generated.cities || [], rivers: [], biomeCounts: {} } } as any : null);
  const activeMapWidth = genMode === 'procedural' ? preview.mapWidth : (genMode === 'hierarchical' ? (hierPreview.generated?.width || hierPreview.macroWidth * 8) : (fusedPreview.generated?.baseCells[0]?.length || fusedPreview.baseWidth));
  const activeMapHeight = genMode === 'procedural' ? preview.mapHeight : (genMode === 'hierarchical' ? (hierPreview.generated?.height || hierPreview.macroHeight * 8) : (fusedPreview.generated?.baseCells?.length || fusedPreview.baseHeight));

  const cellSize = useMemo(() => {
    const w = activeMapWidth;
    if (w <= 16) return 28;
    if (w <= 32) return 20;
    if (w <= 48) return 14;
    if (w <= 64) return 10;
    if (w <= 96) return 7;
    if (w <= 128) return 5;
    return 3;
  }, [activeMapWidth]);

  const usedTerrains = useMemo(() => {
    if (!activeGenerated) return new Set<string>();
    const set = new Set<string>();
    for (let z = 0; z < activeGenerated.cells.length; z++) {
      for (let x = 0; x < activeGenerated.cells[z].length; x++) {
        set.add(activeGenerated.cells[z][x].terrain);
      }
    }
    return set;
  }, [activeGenerated]);

  const totalCells = useMemo(() => {
    if (!activeGenerated?.metadata.biomeCounts) return 0;
    return (Object.values(activeGenerated.metadata.biomeCounts) as number[]).reduce((a, b) => a + b, 0);
  }, [activeGenerated]);

  const TEMPLATE_COLORS: Record<string, string> = {
    city_block: '#e74c3c', forest_road: '#27ae60', forest_rail: '#1e8449',
    industrial_zone: '#95a5a6', farmland: '#f39c12', dense_forest: '#196f3d',
    mountain_range: '#7f8c8d', river_delta: '#3498db', coastal_city: '#e67e22',
    desert_oasis: '#f1c40f', plains_village: '#d5dbdb', swamp_wetland: '#6c3483',
    fortress_hill: '#c0392b', crossroads: '#bdc3c7', open_plans: '#82e0aa',
    highway_intersection: '#9b59b6', military_base: '#2c3e50', port_dock: '#16a085',
    mining_town: '#d35400', orchard: '#a93226', ancient_ruins: '#8e44ad',
    airfield: '#34495e', power_plant: '#e74c3c', suburban: '#f5b041',
    lake_shore: '#5dade2', canyon: '#78281f', railway_junction: '#7d6608',
  };

  function getTemplateColor(type: string): string {
    return TEMPLATE_COLORS[type] || '#555';
  }

  function getTemplateShortName(type: string): string {
    const names: Record<string, string> = {
      city_block: '城市', forest_road: '林路', forest_rail: '林铁',
      industrial_zone: '工业', farmland: '农田', dense_forest: '密林',
      mountain_range: '山脉', river_delta: '河口', coastal_city: '沿海',
      desert_oasis: '绿洲', plains_village: '村庄', swamp_wetland: '沼泽',
      fortress_hill: '要塞', crossroads: '路口', open_plains: '平原',
      highway_intersection: '立交', military_base: '军基', port_dock: '港口',
      mining_town: '矿镇', orchard: '果园', ancient_ruins: '遗迹',
      airfield: '机场', power_plant: '电厂', suburban: '郊区',
      lake_shore: '湖岸', canyon: '峡谷', railway_junction: '枢纽',
    };
    return names[type] || type;
  }

  function getTemplateName(type: string): string {
    const names: Record<string, string> = {
      city_block: '城市街区', forest_road: '森林公路', forest_rail: '森林铁路',
      industrial_zone: '工业区', farmland: '农田', dense_forest: '密林',
      mountain_range: '山脉', river_delta: '河口三角洲', coastal_city: '沿海城市',
      desert_oasis: '沙漠绿洲', plains_village: '平原村庄', swamp_wetland: '沼泽湿地',
      fortress_hill: '要塞山丘', crossroads: '十字路口', open_plains: '开阔平原',
      highway_intersection: '高速公路互通', military_base: '军事基地', port_dock: '港口码头',
      mining_town: '矿业小镇', orchard: '果园农场', ancient_ruins: '古代遗迹',
      airfield: '机场跑道', power_plant: '发电站', suburban: '郊区住宅',
      lake_shore: '湖岸度假区', canyon: '峡谷地带', railway_junction: '铁路枢纽',
    };
    return names[type] || type;
  }

  const templateSizeMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of getAvailableTemplates()) {
      map[t] = 8;
    }
    return map;
  }, []);

  const macroBounds = useMemo(() => {
    if (!hierPreview.generated?.macroGrid) return [];
    const grid = hierPreview.generated.macroGrid;
    const bounds: Array<{ x: number; z: number; width: number; height: number; type: string }> = [];
    for (let mz = 0; mz < grid.length; mz++) {
      for (let mx = 0; mx < grid[mz].length; mx++) {
        const type = grid[mz][mx];
        const ts = templateSizeMap[type] || 8;
        bounds.push({ x: mx, z: mz, width: ts, height: ts, type });
      }
    }
    return bounds;
  }, [hierPreview.generated?.macroGrid, templateSizeMap]);

  const extractedCells = useMemo(() => {
    if (!selectedMacroCell || !hierPreview.generated) return null;
    const bound = macroBounds.find(b => b.x === selectedMacroCell.mx && b.z === selectedMacroCell.mz);
    if (!bound) return null;
    const cells = hierPreview.generated.cells;
    const templateSize = templateSizeMap[bound.type] || 8;
    const offsetX = selectedMacroCell.mx * 8;
    const offsetZ = selectedMacroCell.mz * 8;
    const result: MapCell[][] = [];
    for (let lz = 0; lz < templateSize; lz++) {
      const row: MapCell[] = [];
      for (let lx = 0; lx < templateSize; lx++) {
        const gx = offsetX + lx;
        const gz = offsetZ + lz;
        row.push(cells[gz]?.[gx] || { position: { x: gx, z: gz }, terrain: 'plains', unit: null, fortified: false, capturePointId: null });
      }
      result.push(row);
    }
    return result;
  }, [selectedMacroCell, hierPreview.generated, macroBounds, templateSizeMap]);

  const detailBiomeCounts = useMemo(() => {
    if (!extractedCells) return {};
    const counts: Record<string, number> = {};
    for (const row of extractedCells) {
      for (const cell of row) {
        counts[cell.terrain] = (counts[cell.terrain] || 0) + 1;
      }
    }
    return counts;
  }, [extractedCells]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-xl animate-pulse">加载中...</div>
      </div>
    );
  }

  const activeData = activeGenerated;
  const cells = activeData?.cells ?? [];
  const metadata = activeData?.metadata;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">🌍 风蚀地形生成器 - 地图预览</h1>
          <p className="text-white/50 text-sm">基于风蚀模拟的程序化地形生成系统</p>
        </div>

        {/* Generation Mode Toggle */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm text-white/50">生成模式:</span>
          <button
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              genMode === 'procedural'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            onClick={() => setGenMode('procedural')}
          >
            🌬️ 风蚀地形
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              genMode === 'hierarchical'
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            onClick={() => setGenMode('hierarchical')}
          >
            🧩 分层模板
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              genMode === 'fused'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            onClick={() => setGenMode('fused')}
          >
            🌏 融合战略
          </button>
          <button
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              genMode === 'mega'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            onClick={() => setGenMode('mega')}
          >
            🌍 超大地图
          </button>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              genMode === 'strategic'
                ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            onClick={() => setGenMode('strategic')}
          >
            ⚔️ 战略地图
          </button>
        </div>

        {/* Controls Bar */}
        <div className="bg-gray-900/60 border border-white/10 rounded-xl p-4 md:p-6 space-y-4">
          {genMode === 'procedural' ? (
            <div>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  onClick={handleGenerate}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-semibold transition-colors shadow-lg shadow-emerald-600/20"
                >
                  🔄 生成新地图
                </button>

                <div className="flex items-center gap-2">
                  <label className="text-white/60 text-sm whitespace-nowrap">种子:</label>
                  <input
                    type="number"
                    value={preview.seed}
                    onChange={e => {
                      const v = parseInt(e.target.value) || 0;
                      setPreview(p => ({ ...p, seed: v }));
                    }}
                    className="w-24 px-3 py-1.5 bg-gray-800 border border-white/10 rounded-md text-white text-sm focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[280px]">
                  <label className="text-white/60 text-sm whitespace-nowrap">风向:</label>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={preview.windDirection}
                    onChange={e => setPreview(p => ({ ...p, windDirection: parseInt(e.target.value) }))}
                    className="flex-1 accent-cyan-500"
                  />
                  <span className="text-white/80 text-xs w-10">{preview.windDirection}°</span>
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[260px]">
                  <label className="text-white/60 text-sm whitespace-nowrap">风力:</label>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={Math.round(preview.windStrength * 100)}
                    onChange={e => setPreview(p => ({ ...p, windStrength: parseInt(e.target.value) / 100 }))}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="text-white/80 text-xs w-10">{preview.windStrength.toFixed(1)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-white/60 text-sm whitespace-nowrap">河流:</label>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    value={preview.numRivers}
                    onChange={e => setPreview(p => ({ ...p, numRivers: parseInt(e.target.value) }))}
                    className="w-20 accent-blue-500"
                  />
                  <span className="text-white/80 text-xs w-3">{preview.numRivers}</span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-white/60 text-sm whitespace-nowrap">城市:</label>
                  <input
                    type="range"
                    min={1}
                    max={6}
                    value={preview.numCities}
                    onChange={e => setPreview(p => ({ ...p, numCities: parseInt(e.target.value) }))}
                    className="w-20 accent-orange-500"
                  />
                  <span className="text-white/80 text-xs w-3">{preview.numCities}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-white/50 text-sm self-center">尺寸:</span>
                {MAP_SIZE_OPTIONS.map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => {
                      setPreview(p => ({ ...p, mapWidth: opt.width, mapHeight: opt.height }));
                    }}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      preview.mapWidth === opt.width && preview.mapHeight === opt.height
                        ? 'bg-emerald-600 text-white'
                        : 'bg-gray-800 text-white/70 hover:bg-gray-700 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : genMode === 'hierarchical' ? (
            <div>
              <div className="flex flex-wrap gap-3 items-center">
                <button
                  onClick={handleGenerate}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-lg font-semibold transition-colors shadow-lg shadow-amber-600/20"
                >
                  🔄 生成新地图
                </button>

                <div className="flex items-center gap-2">
                  <label className="text-white/60 text-sm whitespace-nowrap">种子:</label>
                  <input
                    type="number"
                    value={hierPreview.seed}
                    onChange={e => {
                      const v = parseInt(e.target.value) || 0;
                      setHierPreview(p => ({ ...p, seed: v }));
                    }}
                    className="w-24 px-3 py-1.5 bg-gray-800 border border-white/10 rounded-md text-white text-sm focus:outline-none focus:border-amber-500/50"
                  />
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[280px]">
                  <label className="text-white/60 text-sm whitespace-nowrap">宏观宽度:</label>
                  <input
                    type="range"
                    min={2}
                    max={20}
                    value={hierPreview.macroWidth}
                    onChange={e => setHierPreview(p => ({ ...p, macroWidth: parseInt(e.target.value) }))}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="text-white/80 text-xs w-8">{hierPreview.macroWidth}</span>
                </div>

                <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[260px]">
                  <label className="text-white/60 text-sm whitespace-nowrap">宏观高度:</label>
                  <input
                    type="range"
                    min={2}
                    max={15}
                    value={hierPreview.macroHeight}
                    onChange={e => setHierPreview(p => ({ ...p, macroHeight: parseInt(e.target.value) }))}
                    className="flex-1 accent-amber-500"
                  />
                  <span className="text-white/80 text-xs w-8">{hierPreview.macroHeight}</span>
                </div>

                <button
                  onClick={() => {
                    const seed = randomSeed();
                    setHierPreview(p => ({ ...p, seed, macroWidth: 12, macroHeight: 9 }));
                  }}
                  className="px-4 py-2 bg-purple-600/80 hover:bg-purple-500 rounded-lg text-sm font-medium transition-colors"
                >
                  🎲 随机大地图参数
                </button>
              </div>
            </div>
          ) : genMode === 'fused' ? (
            <div className="space-y-3">
              <div className="flex gap-3 items-center">
                <label className="text-white/50 text-xs w-16">种子</label>
                <input type="number" value={fusedPreview.seed} onChange={e => setFusedPreview(p => ({...p, seed: Number(e.target.value)}))} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm w-24" />

                <label className="text-white/50 text-xs w-20">风格预设</label>
                <div className="flex gap-1">
                  {(['default', 'east_asia', 'europe'] as const).map(p => (
                    <button key={p} onClick={() => { setFusedPreview(prev => ({ ...prev, stylePreset: p })); }}
                      className={`px-2 py-1 rounded text-xs cursor-pointer ${fusedPreview.stylePreset === p ? 'bg-emerald-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                      {p === 'default' ? '默认' : p === 'east_asia' ? '东亚' : '欧洲'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 items-center">
                <label className="text-white/50 text-xs w-16">基础尺寸</label>
                <input type="range" min="32" max="128" step="8" value={fusedPreview.baseWidth}
                  onChange={e => setFusedPreview(p => ({...p, baseWidth: Number(e.target.value)}))}
                  className="flex-1 accent-emerald-500 max-w-[200px]" />
                <span className="text-white/70 text-xs w-16">{fusedPreview.baseWidth}×{fusedPreview.baseHeight}</span>
              </div>

              <div className="flex gap-3 items-center">
                <label className="text-white/50 text-xs w-16">区域数</label>
                <span className="text-white/70 text-xs">{fusedPreview.regionCountMin}-{fusedPreview.regionCountMax}</span>
                <input type="range" min="4" max="20" value={fusedPreview.regionCountMax}
                  onChange={e => setFusedPreview(p => ({...p, regionCountMin: Math.max(2, Number(e.target.value) - 4), regionCountMax: Number(e.target.value)}))}
                  className="flex-1 accent-emerald-500 max-w-[120px]" />

                <label className="text-white/50 text-xs w-12 ml-3">城市密度</label>
                <input type="range" min="0.5" max="3" step="0.25" value={fusedPreview.cityDensity}
                  onChange={e => setFusedPreview(p => ({...p, cityDensity: Number(e.target.value)}))}
                  className="accent-emerald-500 w-20" />
                <span className="text-white/70 text-xs w-6">{fusedPreview.cityDensity.toFixed(1)}</span>
              </div>

              <div className="flex gap-3 items-center">
                <label className="text-white/50 text-xs w-16">据点数</label>
                <input type="number" min="1" max="15" value={fusedPreview.strongholdCount}
                  onChange={e => setFusedPreview(p => ({...p, strongholdCount: Number(e.target.value)}))}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm w-16" />

                <label className="text-white/50 text-xs w-12 ml-3">道路网</label>
                {(['sparse','normal','dense'] as const).map(d => (
                  <button key={d} onClick={() => setFusedPreview(p => ({...p, roadDensity: d}))}
                    className={`px-2 py-1 rounded text-xs cursor-pointer ${fusedPreview.roadDensity === d ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                    {d === 'sparse' ? '稀疏' : d === 'normal' ? '正常' : '密集'}
                  </button>
                ))}
              </div>

              <div className="flex gap-3 items-center">
                <label className="text-white/50 text-xs w-16">细节度</label>
                {(['low','medium','high'] as const).map(d => (
                  <button key={d} onClick={() => setFusedPreview(p => ({...p, detailLevel: d}))}
                    className={`px-2 py-1 rounded text-xs cursor-pointer ${fusedPreview.detailLevel === d ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                    {d === 'low' ? '低' : d === 'medium' ? '中' : '高'}
                  </button>
                ))}

                <label className="text-white/50 text-xs w-20 ml-3">局部尺寸</label>
                <input type="range" min={7} max={25} step={2} value={fusedPreview.detailGridSize}
                  onChange={e => setFusedPreview(p => ({...p, detailGridSize: Number(e.target.value)}))}
                  className="accent-purple-500 w-24" />
                <span className="text-white/70 text-xs w-10">{fusedPreview.detailGridSize}×{fusedPreview.detailGridSize}</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => handleGenerateFused()} className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-500 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-400 transition-all cursor-pointer">
                  🌏 生成融合地图
                </button>
                {fusedPreview.generated && (
                  <>
                    <button onClick={() => handleSaveFused()} className="bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors cursor-pointer">
                      💾 保存
                    </button>
                    <button onClick={() => {
                      const { exportJson } = saveFusedMap(fusedPreview.generated!);
                      const blob = new Blob([exportJson], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = `fused_map_${fusedPreview.seed}.json`; a.click();
                      URL.revokeObjectURL(url);
                    }} className="bg-gray-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-500 transition-colors cursor-pointer">
                      📥 导出JSON
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : genMode === 'mega' ? (
            <div className="space-y-3">
              <div className="flex gap-3 items-center flex-wrap">
                <label className="text-white/50 text-xs w-16">种子</label>
                <input type="number" value={fusedPreview.seed} onChange={e => setFusedPreview(p => ({...p, seed: Number(e.target.value)}))} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm w-24" />

                <label className="text-purple-300/70 text-xs w-16 ml-2">总大小</label>
                <select value={megaConfig.totalSize} onChange={e => setMegaConfig(p => ({...p, totalSize: Number(e.target.value)}))} className="bg-gray-800 text-white rounded px-2 py-1 border border-purple-500/30 text-xs cursor-pointer">
                  {[2048, 4096, 6144, 8192].map(v => <option key={v} value={v}>{v}×{v}</option>)}
                </select>

                <label className="text-purple-300/70 text-xs w-16">分块数</label>
                <select value={megaConfig.gridDivisions} onChange={e => setMegaConfig(p => ({...p, gridDivisions: Number(e.target.value)}))} className="bg-gray-800 text-white rounded px-2 py-1 border border-purple-500/30 text-xs cursor-pointer">
                  {[16, 24, 32, 48, 64].map(v => <option key={v} value={v}>{v}×{v}</option>)}
                </select>

                <span className="text-emerald-400 text-xs font-medium bg-black/20 px-2 py-1 rounded">每块 {Math.floor(megaConfig.totalSize / megaConfig.gridDivisions)}×{Math.floor(megaConfig.totalSize / megaConfig.gridDivisions)}</span>
              </div>

              <div className="flex gap-3 items-center flex-wrap">
                <label className="text-white/50 text-xs w-16">城市密度</label>
                <input type="range" min="0.5" max="4" step="0.25" value={fusedPreview.cityDensity}
                  onChange={e => setFusedPreview(p => ({...p, cityDensity: Number(e.target.value)}))}
                  className="accent-purple-500 w-28 max-w-[140px]" />
                <span className="text-white/70 text-xs w-8">{fusedPreview.cityDensity.toFixed(2)}</span>

                <label className="text-white/50 text-xs w-12 ml-2">道路网</label>
                {(['sparse','normal','dense'] as const).map(d => (
                  <button key={d} onClick={() => setFusedPreview(p => ({...p, roadDensity: d}))}
                    className={`px-2 py-1 rounded text-xs cursor-pointer ${fusedPreview.roadDensity === d ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                    {d === 'sparse' ? '稀疏' : d === 'normal' ? '正常' : '密集'}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={handleGenerateMega} disabled={isGeneratingMega} className={`flex-1 bg-gradient-to-r text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-all cursor-pointer ${isGeneratingMega ? 'from-gray-600 to-gray-500 cursor-wait' : 'from-purple-700 to-indigo-600 hover:from-purple-600 hover:to-indigo-500 shadow-purple-500/30'}`}>
                  {isGeneratingMega ? '⏳ 生成中...' : `🌍 生成超大地图 (${megaConfig.totalSize}×${megaConfig.totalSize})`}
                </button>
                {megaMapData && (
                  <>
                    <button onClick={() => { setMegaMapData(null); setSelectedMegaChunk(null); }} className="px-4 py-2.5 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors cursor-pointer">
                      🗑️ 清除
                    </button>
                    <button onClick={() => {
                      const chunkMeta = megaMapData.chunks.map((c, i) => ({ chunkX: c.chunkX, chunkZ: c.chunkZ, offsetX: c.offsetX, offsetZ: c.offsetZ, width: c.width, height: c.height }));
                      const blob = new Blob([JSON.stringify({
                        meta: { totalWidth: megaMapData.totalWidth, totalHeight: megaMapData.totalHeight, chunkSize: megaMapData.chunkSize, gridX: megaMapData.gridChunksX, gridZ: megaMapData.gridChunksZ, cities: megaMapData.cities.length, roads: megaMapData.roads.length, seed: megaMapData.seed },
                        chunks: chunkMeta,
                      }, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = `megamap_${megaConfig.totalSize}_${megaConfig.gridDivisions}.json`; a.click(); URL.revokeObjectURL(url);
                    }} className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors cursor-pointer">
                      📥 导出全部
                    </button>
                  </>
                )}
              </div>

              {megaMapData && (
                <div className="text-xs text-purple-300/60 bg-purple-900/15 rounded px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
                  <span>📐 {megaMapData.totalWidth}×{megaMapData.totalHeight}</span>
                  <span>🔲 {megaMapData.gridChunksX}×{megaMapData.gridChunksZ} 分块</span>
                  <span>📦 每块 {megaMapData.chunkSize}×{megaMapData.chunkSize}</span>
                  <span>🏙️ {megaMapData.cities.length} 座城市</span>
                  <span>🛣️ {megaMapData.roads.length} 条道路</span>
                </div>
              )}
            </div>
          ) : genMode === 'strategic' ? (
            <div className="space-y-3">
              <div className="flex gap-3 items-center flex-wrap">
                <label className="text-red-300/70 text-xs w-12">种子</label>
                <input type="number" value={stratConfig.seed} onChange={e => setStratConfig(p => ({...p, seed: Number(e.target.value)}))} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm w-24" />

                <label className="text-red-300/70 text-xs w-12 ml-2">大小</label>
                <select value={`${stratConfig.width}x${stratConfig.height}`} onChange={e => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  setStratConfig(p => ({...p, width: w, height: h}));
                }} className="bg-gray-800 text-white rounded px-2 py-1 border border-red-500/30 text-xs cursor-pointer">
                  <option value="32x24">32×24</option>
                  <option value="48x36">48×36</option>
                  <option value="64x48">64×48</option>
                  <option value="96x72">96×72</option>
                  <option value="128x96">128×96</option>
                </select>

                <label className="text-red-300/70 text-xs w-12 ml-2">形状</label>
                <select value={stratConfig.worldShape} onChange={e => setStratConfig(p => ({...p, worldShape: e.target.value as any}))} className="bg-gray-800 text-white rounded px-2 py-1 border border-red-500/30 text-xs cursor-pointer">
                  <option value="peninsula">半岛</option>
                  <option value="continent">大陆</option>
                  <option value="island">岛屿</option>
                  <option value="inland">内陆</option>
                  <option value="river_basin">流域</option>
                </select>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => {
                  setIsGeneratingStrat(true);
                  setTimeout(() => {
                    try {
                      const map = generateStrategicMap({ seed: stratConfig.seed, width: stratConfig.width, height: stratConfig.height, worldShape: stratConfig.worldShape });
                      setStratMapData(map);
                    } catch (err) { console.error(err); }
                    setIsGeneratingStrat(false);
                  }, 50);
                }} disabled={isGeneratingStrat} className={`flex-1 bg-gradient-to-r text-white px-4 py-2.5 rounded-lg text-sm font-bold shadow-lg transition-all cursor-pointer ${isGeneratingStrat ? 'from-gray-600 to-gray-500 cursor-wait' : 'from-red-700 to-orange-600 hover:from-red-600 hover:to-orange-500 shadow-red-500/30'}`}>
                  {isGeneratingStrat ? '⏳ 生成中...' : `⚔️ 生成战略地图 (${stratConfig.width}×${stratConfig.height})`}
                </button>
                {stratMapData && (
                  <button onClick={() => setStratMapData(null)} className="px-4 py-2.5 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors cursor-pointer">
                    🗑️ 清除
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Main Map Display */}
        {!activeGenerated && (
          <div className="bg-gray-900/40 border border-white/10 rounded-xl p-12 text-center">
            <div className="text-4xl mb-4">🗺️</div>
            <div className="text-xl text-gray-400 mb-2">调整参数后点击"生成地图"按钮开始</div>
            <div className="text-sm text-gray-500">
              当前模式: {genMode === 'procedural' ? '🌬️ 程序化地形' : genMode === 'hierarchical' ? '🧩 分层模板' : genMode === 'fused' ? '🌏 融合战略' : genMode === 'mega' ? '🌍 超大地图' : '⚔️ 战略地图'}
            </div>
          </div>
        )}

        {activeGenerated && genMode === 'hierarchical' && hierPreview.generated && (
          <div className="space-y-4">
            {/* Macro Grid Overview */}
            <div className="bg-gray-900/60 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-white/90">🗺️ 宏观布局总览</h2>
                <span className="text-sm text-white/50">{hierPreview.generated?.macroGrid.length || 0} × {(hierPreview.generated?.macroGrid[0]?.length || 0)} 模板格子</span>
              </div>

              <div className="flex justify-center">
                <div
                  className="gap-[2px] rounded-lg overflow-hidden cursor-crosshair"
                  style={{ display: 'grid', gridTemplateColumns: `repeat(${hierPreview.macroWidth}, 36px)` }}
                >
                  {macroBounds.map((bound, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedMacroCell({ mx: bound.x, mz: bound.z })}
                      onMouseEnter={() => setHoveredMacroCell({ mx: bound.x, mz: bound.z })}
                      onMouseLeave={() => setHoveredMacroCell(null)}
                      className={`transition-all duration-150 ${
                        selectedMacroCell?.mx === bound.x && selectedMacroCell?.mz === bound.z
                          ? 'ring-2 ring-yellow-400 scale-105 z-10 relative'
                          : hoveredMacroCell?.mx === bound.x && hoveredMacroCell?.mz === bound.z
                            ? 'ring-2 ring-white/50 scale-102'
                            : 'hover:ring-1 hover:ring-white/30'
                      }`}
                      style={{
                        width: `${bound.width * 4}px`,
                        height: `${bound.height * 4}px`,
                        backgroundColor: getTemplateColor(bound.type),
                      }}
                      title={`${getTemplateName(bound.type)} (${bound.x},${bound.z}) — ${bound.width}×${bound.height}`}
                    >
                      {bound.width * 4 > 40 && (
                        <span className="text-[8px] text-white/80 flex items-center justify-center h-full font-medium drop-shadow">
                          {getTemplateShortName(bound.type)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2 mt-3">
                {[...new Set(hierPreview.generated?.macroGrid.flat() || [])].map(t => (
                  <div key={t} className="flex items-center gap-1 text-xs text-white/60">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getTemplateColor(t) }} />
                    {getTemplateShortName(t)}
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Template Detail Panel */}
            {selectedMacroCell && hierPreview.generated && (
              <div className="bg-gray-900/60 border border-amber-500/30 rounded-xl p-4 ring-1 ring-amber-500/20">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-amber-300">
                    🔍 模板详情: {getTemplateName(macroBounds.find(b => b.x === selectedMacroCell.mx && b.z === selectedMacroCell.mz)?.type || '')} ({selectedMacroCell.mx}, {selectedMacroCell.mz})
                  </h2>
                  <button
                    onClick={() => setSelectedMacroCell(null)}
                    className="text-xs text-white/50 hover:text-white px-2 py-1 rounded bg-white/5"
                  >
                    ✕ 关闭
                  </button>
                </div>

                {extractedCells && (
                  <div className="flex justify-center">
                    {(() => {
                      const detailWidth = extractedCells[0]?.length || 0;
                      const detailHeight = extractedCells.length;
                      const detailCellSize = Math.max(8, Math.min(20, Math.floor(320 / Math.max(detailWidth, detailHeight))));
                      return (
                        <div
                          className="grid gap-[1px] rounded-lg overflow-hidden shadow-xl shadow-black/30"
                          style={{
                            gridTemplateColumns: `repeat(${detailWidth}, ${detailCellSize}px)`,
                          }}
                        >
                          {extractedCells.map((row, z) =>
                            row.map((cell, x) => (
                              <div
                                key={`${z}-${x}`}
                                style={{
                                  width: `${detailCellSize}px`,
                                  height: `${detailCellSize}px`,
                                  backgroundColor: TERRAIN_CONFIGS[cell.terrain]?.stats.color || '#333',
                                }}
                                title={`${TERRAIN_CONFIGS[cell.terrain]?.name || cell.terrain} (${x},${z})`}
                              />
                            ))
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/70">
                  <div>尺寸: {extractedCells?.[0]?.length || 0}×{extractedCells?.length || 0}</div>
                  <div>类型: {getTemplateName(macroBounds.find(b => b.x === selectedMacroCell.mx && b.z === selectedMacroCell.mz)?.type || '')}</div>
                  <div className="col-span-2">
                    {Object.entries(detailBiomeCounts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([t, c]) => (
                      <div key={t} className="flex items-center gap-1 text-xs">
                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: TERRAIN_CONFIGS[t]?.stats.color }} />
                        {TERRAIN_CONFIGS[t]?.name || t}: {c}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Full terrain grid (collapsible) */}
            <div className="bg-gray-900/40 border border-white/10 rounded-xl p-4 md:p-6 overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white/50">完整地形图</h3>
                <button
                  onClick={() => setShowFullTerrain(!showFullTerrain)}
                  className="text-xs text-white/50 hover:text-white px-3 py-1 rounded bg-white/5"
                >
                  {showFullTerrain ? `隐藏完整地形图` : `显示完整地形图 (${activeMapWidth}×${activeMapHeight})`}
                </button>
              </div>
              {showFullTerrain && (
                <div className="flex justify-center">
                  <div
                    className="grid gap-[1px] rounded-lg overflow-hidden shadow-2xl shadow-black/50"
                    style={{
                      gridTemplateColumns: `repeat(${activeMapWidth}, ${cellSize}px)`,
                      maxWidth: `${Math.min(activeMapWidth * cellSize, 960)}px`,
                    }}
                  >
                    {cells.map((row, z) =>
                      row.map((cell, x) => {
                        const terrainConfig = TERRAIN_CONFIGS[cell.terrain];
                        const color = terrainConfig?.stats.color || '#333';
                        const isHovered = hoveredCell?.x === x && hoveredCell?.z === z;
                        return (
                          <div
                            key={`${x}-${z}`}
                            className="transition-transform duration-75 cursor-crosshair relative"
                            style={{
                              width: `${cellSize}px`,
                              height: `${cellSize}px`,
                              backgroundColor: color,
                              transform: isHovered ? 'scale(1.5)' : undefined,
                              zIndex: isHovered ? 10 : undefined,
                            }}
                            title={`${TERRAIN_CONFIGS[cell.terrain]?.name || cell.terrain} (${x},${z})`}
                            onMouseEnter={() => setHoveredCell({ x, z, terrain: cell.terrain })}
                            onMouseLeave={() => setHoveredCell(null)}
                          />
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeGenerated && genMode === 'procedural' && (
        <div className="bg-gray-900/40 border border-white/10 rounded-xl p-4 md:p-6 overflow-auto">
          <div className="flex justify-center">
            <div
              className="grid gap-[1px] rounded-lg overflow-hidden shadow-2xl shadow-black/50"
              style={{
                gridTemplateColumns: `repeat(${activeMapWidth}, ${cellSize}px)`,
                maxWidth: `${Math.min(activeMapWidth * cellSize, 960)}px`,
              }}
            >
              {cells.map((row, z) =>
                row.map((cell, x) => {
                  const terrainConfig = TERRAIN_CONFIGS[cell.terrain];
                  const color = terrainConfig?.stats.color || '#333';
                  const isHovered = hoveredCell?.x === x && hoveredCell?.z === z;
                  return (
                    <div
                      key={`${x}-${z}`}
                      className="transition-transform duration-75 cursor-crosshair relative"
                      style={{
                        width: `${cellSize}px`,
                        height: `${cellSize}px`,
                        backgroundColor: color,
                        transform: isHovered ? 'scale(1.5)' : undefined,
                        zIndex: isHovered ? 10 : undefined,
                      }}
                      title={`${TERRAIN_CONFIGS[cell.terrain]?.name || cell.terrain} (${x},${z})`}
                      onMouseEnter={() => setHoveredCell({ x, z, terrain: cell.terrain })}
                      onMouseLeave={() => setHoveredCell(null)}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
        )}

        {activeGenerated && genMode === 'fused' && fusedPreview.generated && (
          <div className="space-y-4">
            <div className="bg-gray-900/60 border border-emerald-500/20 rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
                <span className="text-sm font-semibold text-emerald-400">🌏 融合战略地图</span>
                <span>{fusedPreview.generated.baseCells[0]?.length || fusedPreview.baseWidth}×{fusedPreview.generated.baseCells?.length || fusedPreview.baseHeight} 基础</span>
                <span>🏙️ {fusedPreview.generated.metadata.totalCities}座城市</span>
                <span>🛣️ {fusedPreview.generated.metadata.totalRoads}条道路</span>
                <span>🏰 {fusedPreview.generated.metadata.totalStrongholds}个据点</span>
                <span>🗺️ {fusedPreview.generated.metadata.totalRegions}个区域</span>
                <span>⏱️ {fusedPreview.generated.metadata.generationTimeMs}ms</span>
              </div>
            </div>

            <div className="bg-gray-900/40 border border-white/10 rounded-xl p-4 overflow-auto max-h-[500px]">
              <div className="flex justify-center relative">
                {(() => {
                  const macro = fusedPreview.generated!.macroOverlay;
                  const mw = macro[0]?.length || 0;
                  const mh = macro.length || 0;
                  const fusedCellSize = Math.max(3, Math.min(8, Math.floor(Math.min(700, window.innerWidth - 80) / mw)));
                  const cityPositions = new Set(fusedPreview.generated!.cities.map(c => `${c.position.x},${c.position.z}`));
                  const strongholdPositions = new Set(fusedPreview.generated!.strongholds.map(s => `${s.position.x},${s.position.z}`));
                  return (
                    <div className="relative inline-block">
                      {/* 地形网格 */}
                      <div
                        className="grid gap-[1px] rounded-lg overflow-hidden shadow-2xl shadow-black/50"
                        style={{ gridTemplateColumns: `repeat(${mw}, ${fusedCellSize}px)` }}
                      >
                        {macro.map((row, z) =>
                          row.map((cell, x) => {
                            const keyPos = `${x},${z}`;
                            const isCity = cityPositions.has(keyPos);
                            const isStronghold = strongholdPositions.has(keyPos);
                            const baseColor = TERRAIN_CONFIGS[cell.terrain]?.stats.color || '#333';
                            let color = baseColor;
                            let extraStyle: React.CSSProperties = {};
                            if (isCity) {
                              color = '#f59e0b';
                              extraStyle = { boxShadow: '0 0 3px #f59e0b', zIndex: 2 };
                            } else if (isStronghold) {
                              color = '#ef4444';
                              extraStyle = { boxShadow: '0 0 3px #ef4444', zIndex: 2 };
                            }
                            return (
                              <div
                                key={`${x}-${z}`}
                                onClick={() => setSelectedPixel({ x, z })}
                                style={{
                                  width: `${fusedCellSize}px`,
                                  height: `${fusedCellSize}px`,
                                  backgroundColor: color,
                                  cursor: 'pointer',
                                  ...extraStyle,
                                }}
                                className={`hover:ring-1 hover:ring-white/50 transition-all ${selectedPixel?.x === x && selectedPixel?.z === z ? 'ring-2 ring-yellow-400' : ''}`}
                                title={`${TERRAIN_CONFIGS[cell.terrain]?.name || cell.terrain} (${x},${z})${isCity ? ' 🏙️城市' : ''}${isStronghold ? ' 🏰据点' : ''}\n点击查看局部详情`}
                              />
                            );
                          })
                        )}
                      </div>

                      {/* 道路SVG覆盖层 - 用线条显示道路走向 */}
                      <svg
                        className="absolute top-0 left-0 pointer-events-none"
                        width={mw * fusedCellSize + (mw - 1)}
                        height={mh * fusedCellSize + (mh - 1)}
                        style={{ zIndex: 10 }}
                      >
                        {fusedPreview.generated!.roads.map((road, roadIdx) => {
                          if (road.path.length < 2) return null;

                          // 将路径坐标转换为像素坐标
                          const points = road.path.map(p => ({
                            x: p.x * (fusedCellSize + 1) + fusedCellSize / 2,
                            y: p.z * (fusedCellSize + 1) + fusedCellSize / 2
                          }));

                          // 创建平滑的路径字符串
                          const pathD = points.reduce((acc, point, idx) => {
                            if (idx === 0) return `M ${point.x} ${point.y}`;
                            return acc + ` L ${point.x} ${point.y}`;
                          }, '');

                          // 根据道路类型选择颜色和样式
                          const roadStyle = {
                            highway: { stroke: '#fbbf24', strokeWidth: Math.max(2, fusedCellSize * 0.4), opacity: 0.9 },
                            main_road: { stroke: '#f59e0b', strokeWidth: Math.max(1.5, fusedCellSize * 0.3), opacity: 0.8 },
                            rural: { stroke: '#d97706', strokeWidth: Math.max(1, fusedCellSize * 0.2), opacity: 0.7 },
                            trail: { stroke: '#92400e', strokeWidth: Math.max(0.8, fusedCellSize * 0.15), opacity: 0.6 }
                          };

                          const style = roadStyle[road.roadType as keyof typeof roadStyle] || roadStyle.rural;

                          return (
                            <g key={roadIdx}>
                              <path
                                d={pathD}
                                fill="none"
                                stroke={style.stroke}
                                strokeWidth={style.strokeWidth}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                opacity={style.opacity}
                              />
                              {/* 道路端点标记 */}
                              {points.length > 0 && (
                                <>
                                  <circle cx={points[0].x} cy={points[0].y} r={Math.max(1, fusedCellSize * 0.2)} fill={style.stroke} opacity={style.opacity} />
                                  <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={Math.max(1, fusedCellSize * 0.2)} fill={style.stroke} opacity={style.opacity} />
                                </>
                              )}
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  );
                })()}
              </div>
              <p className="text-[10px] text-white/30 mt-2 text-center">💡 点击任意格子查看该位置的局部细节图</p>
            </div>

            <div className="bg-gray-900/40 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-medium text-white/70 mb-3">区域列表 (点击查看详情)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {fusedPreview.generated.regions.map((region, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedRegion(idx)}
                    className={`p-2 rounded-lg border cursor-pointer transition-all ${
                      selectedRegion === idx
                        ? 'border-yellow-400 bg-yellow-400/10 ring-1 ring-yellow-400/30'
                        : 'border-white/10 bg-white/5 hover:border-white/30'
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getTemplateColor(region.assignedTemplate || 'open_plains') }} />
                      <span className="text-[10px] text-white/80 truncate">{getTemplateShortName(region.assignedTemplate || 'open_plains')}</span>
                    </div>
                    <div className="text-[9px] text-white/40">{region.name}</div>
                    <div className="text-[9px] text-white/30">{region.bounds.width}×{region.bounds.height}</div>
                    {region.centerCity && (
                      <div className="text-[9px] text-amber-400/60">🏙️ {region.centerCity}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {savedMaps.length > 0 && (
              <div className="mt-4 p-3 bg-gray-900/60 border border-white/10 rounded-xl">
                <h3 className="text-sm font-semibold text-white/80 mb-2">💾 已保存的地图</h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {savedMaps.map(m => (
                    <div key={m.key} className="flex items-center justify-between text-xs text-white/50 px-2 py-1 rounded hover:bg-white/5 cursor-pointer">
                      <span>{new Date(m.savedAt).toLocaleString('zh-CN')}</span>
                      <span>{m.cityCount} 座城市</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {selectedPixel !== null && fusedPreview.generated && (() => {
          const allDetails = fusedPreview.generated.pixelDetails;
          const pixelDetail = allDetails.find(p => p.x === selectedPixel.x && p.z === selectedPixel.z);

          return (
            <div className="bg-gray-900/95 border border-cyan-500/40 rounded-xl p-5 ring-2 ring-cyan-500/20 mt-4 shadow-xl shadow-cyan-900/30">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-cyan-300">
                    🔍 局部详细地图 ({selectedPixel.x}, {selectedPixel.z})
                  </h2>
                  <div className="text-[10px] text-cyan-400/50 mt-0.5">
                    共 {allDetails.length} 条像素数据 | 当前: {pixelDetail ? `尺寸${pixelDetail.detailSize}×${pixelDetail.detailSize}` : '未找到'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (fusedPreview.generated && pixelDetail) {
                        const saveData = {
                          version: '2.0',
                          savedAt: new Date().toISOString(),
                          type: 'pixel_detail',
                          position: { x: pixelDetail.x, z: pixelDetail.z },
                          context: pixelDetail.context,
                          localType: pixelDetail.localType,
                          detailGrid: pixelDetail.detailGrid.map(row =>
                            row.map(cell => cell.terrain)
                          ),
                          detailSize: pixelDetail.detailSize,
                        };
                        const exportJson = JSON.stringify(saveData, null, 2);
                        const blob = new Blob([exportJson], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `pixel_${pixelDetail.x}_${pixelDetail.z}_detail.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }
                    }}
                    className="text-xs text-white/70 hover:text-white px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 cursor-pointer transition-colors font-medium"
                  >
                    📥 导出JSON
                  </button>
                  <button
                    onClick={() => setSelectedPixel(null)}
                    className="text-xs text-white/50 hover:text-white px-3 py-1.5 rounded bg-white/10 cursor-pointer"
                  >
                    ✕ 关闭
                  </button>
                </div>
              </div>

              {!pixelDetail ? (
                <div className="text-center py-8 text-red-400">
                  <p className="text-lg">⚠️ 像素数据不存在</p>
                  <p className="text-sm mt-2 opacity-60">坐标 ({selectedPixel.x}, {selectedPixel.z}) 在 pixelDetails 中未找到</p>
                  <p className="text-xs mt-1 opacity-40">pixelDetails 总数: {allDetails.length}，坐标范围: X[0-{fusedPreview.generated.baseCells[0]?.length || '?'}], Z[0-{fusedPreview.generated.baseCells?.length || '?'}]</p>
                </div>
              ) : (
                <>
                  {/* 局部类型标签 */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/80 mb-4 pb-3 border-b border-white/10">
                    <span className="text-base font-bold text-yellow-300">
                      {{ city_center: '🏙️ 市中心', suburb: '🏘️ 郊区', town: '🏘️ 村镇', village: '🛖️ 村庄', outpost: '⛺ 哨站', wilderness: '🌲 荒野', road_junction: '🚦 道路节点', crossroads: '✚ 十字路口' }[pixelDetail.localType] || pixelDetail.localType}
                    </span>
                    <span>城市密度: {(pixelDetail.context.cityDensity * 100).toFixed(0)}%</span>
                    <span>道路连通性: {(pixelDetail.context.roadConnectivity * 100).toFixed(0)}%</span>
                    <span>{pixelDetail.context.dominantNeighborType === 'urban' ? '🏙️城区' : pixelDetail.context.dominantNeighborType === 'suburban' ? '🏘️郊区' : pixelDetail.context.dominantNeighborType === 'rural' ? '🌾乡村' : '🌲荒野'}</span>
                  </div>

                  {/* ===== 核心内容：详细地形网格图 ===== */}
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-emerald-300 mb-2 flex items-center gap-1">
                      🗺️ 详细地形图 ({pixelDetail.detailSize}×{pixelDetail.detailSize}) — 点击中心位置放大查看
                    </h3>
                    <div className="flex justify-center overflow-auto py-2 bg-black/20 rounded-lg">
                      {(() => {
                        const dGrid = pixelDetail.detailGrid;
                        const dSize = dGrid[0]?.length || 0;
                        const centerIdx = Math.floor(dSize / 2);
                        const cellSize = Math.max(10, Math.min(22, Math.floor(Math.min(600, window.innerWidth - 80) / dSize)));

                        return (
                          <div className="relative inline-block">
                            <div
                              className="grid gap-[1px] rounded-lg overflow-hidden border-2 border-white/20"
                              style={{ gridTemplateColumns: `repeat(${dSize}, ${cellSize}px)` }}
                            >
                              {dGrid.map((row, dz) =>
                                row.map((cell, dx) => {
                                  const isCenter = dx === centerIdx && dz === centerIdx;
                                  const isRoad = cell.isRoad;
                                  const roadTypeLabel = cell.roadType === 'highway' ? '🛣️' : cell.roadType === 'main_road' ? '🛤️' : cell.roadType === 'rail' ? '🚂' : cell.roadType === 'dirt_road' ? '🚜' : '';
                                  return (
                                    <div
                                      key={`${dz}-${dx}`}
                                      style={{
                                        width: `${cellSize}px`,
                                        height: `${cellSize}px`,
                                        backgroundColor: TERRAIN_CONFIGS[cell.terrain]?.stats.color || '#333',
                                        position: 'relative',
                                        ...(isRoad ? {
                                          boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.85), 0 0 4px rgba(0,0,0,0.5)',
                                        } : {}),
                                      }}
                                      title={`${TERRAIN_CONFIGS[cell.terrain]?.name || cell.terrain} (${dx},${dz})${isRoad ? ` [${cell.roadType || '道路'}]` : ''}`}
                                    >
                                      {isCenter && (
                                        <div className="absolute inset-0 border-2 border-yellow-400 rounded-sm pointer-events-none" style={{ boxShadow: 'inset 0 0 4px rgba(250,204,21,0.5)' }} />
                                      )}
                                      {isRoad && (
                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                          <div className={`
                                            text-[8px] leading-none font-bold select-none
                                            ${cellSize >= 14 ? 'text-[10px]' : 'text-[7px]'}
                                            ${cell.roadType === 'highway' ? 'text-amber-200' : cell.roadType === 'main_road' ? 'text-orange-200' : 'text-gray-200'}
                                            drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]
                                          `}>
                                            {cellSize >= 12 ? roadTypeLabel : '═'}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                            {/* 中心标记 */}
                            <div className="absolute pointer-events-none" style={{
                              left: `${centerIdx * (cellSize + 1) + cellSize / 2}px`,
                              top: `${centerIdx * (cellSize + 1) + cellSize / 2}px`,
                              transform: 'translate(-50%, -50%)',
                            }}>
                              <div className="w-5 h-5 rounded-full bg-yellow-400/80 border-2 border-yellow-200 flex items-center justify-center text-[8px] font-bold text-black shadow-lg">
                                ●
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 地形统计条形图 */}
                  <div className="mb-3">
                    <h3 className="text-xs font-medium text-white/50 mb-2">📊 地形构成</h3>
                    <div className="overflow-auto max-h-[180px]">
                      {(() => {
                        const dGrid = pixelDetail.detailGrid;
                        const terrainStats: Array<{ terrain: string; name: string; color: string; count: number; pct: number }> = [];
                        let totalCells = 0;
                        for (const row of dGrid) for (const cell of row) totalCells++;
                        const rawStats: Record<string, number> = {};
                        for (const row of dGrid) for (const cell of row) rawStats[cell.terrain] = (rawStats[cell.terrain] || 0) + 1;
                        for (const [terrain, count] of Object.entries(rawStats)) {
                          const cfg = TERRAIN_CONFIGS[terrain as keyof typeof TERRAIN_CONFIGS];
                          terrainStats.push({ terrain, name: cfg?.name || terrain, color: cfg?.stats.color || '#666', count, pct: totalCells > 0 ? (count / totalCells) * 100 : 0 });
                        }
                        terrainStats.sort((a, b) => b.count - a.count);

                        return (
                          <div className="space-y-1 pr-2">
                            {terrainStats.map(({ name, color, count, pct }) => (
                              <div key={name} className="flex items-center gap-2 group">
                                <div className="w-2.5 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                                <span className="text-[11px] text-white/60 w-14 flex-shrink-0 truncate">{name}</span>
                                <div className="flex-1 h-4 bg-gray-800/80 rounded-full overflow-hidden min-w-0">
                                  <div className="h-full rounded-full transition-all group-hover:brightness-125" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color, boxShadow: `0 0 4px ${color}30` }} />
                                </div>
                                <span className="text-[10px] text-white/40 w-12 text-right tabular-nums">{count}格 {pct.toFixed(0)}%</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 附近城市和道路 */}
                  {(pixelDetail.context.nearbyCities.length > 0 || pixelDetail.context.nearbyRoads.length > 0) && (
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/10">
                      {pixelDetail.context.nearbyCities.length > 0 && (
                        <div>
                          <div className="text-xs text-amber-400/70 font-medium mb-1">🏙️ 附近城市 ({pixelDetail.context.nearbyCities.length})</div>
                          <div className="space-y-0.5 max-h-24 overflow-y-auto">
                            {pixelDetail.context.nearbyCities.map((city, i) => (
                              <div key={i} className="text-[11px] text-amber-300/80 bg-amber-900/20 px-2 py-0.5 rounded">🏙️ {city.name} · 距离{city.distance}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      {pixelDetail.context.nearbyRoads.length > 0 && (
                        <div>
                          <div className="text-xs text-yellow-400/70 font-medium mb-1">🛣️ 经过道路 ({pixelDetail.context.nearbyRoads.length})</div>
                          <div className="space-y-0.5 max-h-24 overflow-y-auto">
                            {pixelDetail.context.nearbyRoads.map((road, i) => (
                              <div key={i} className="text-[11px] text-yellow-300/80 bg-yellow-900/15 px-2 py-0.5 rounded truncate">{road.from.slice(0, 10)} → {road.to.slice(0, 10)}</div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* Metadata & Legend */}
        {activeGenerated && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Stats */}
          <div className="bg-gray-900/60 border border-white/10 rounded-xl p-4 md:p-5 space-y-3">
            <h2 className="text-lg font-semibold text-white/90 border-b border-white/10 pb-2">📊 地图元数据</h2>
            {genMode === 'procedural' ? (
              <div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/50">种子</span>
                    <span className="text-cyan-400 font-mono">{preview.seed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">尺寸</span>
                    <span className="text-white">{preview.mapWidth}×{preview.mapHeight}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">海平面</span>
                    <span className="text-blue-400">{metadata.seaLevel.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">风向</span>
                    <span className="text-amber-400">{((metadata.windDir * 180) / Math.PI).toFixed(1)}°</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">城市数</span>
                    <span className="text-orange-400">{metadata.cities.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">河流数</span>
                    <span className="text-blue-300">{metadata.rivers.length}</span>
                  </div>
                </div>
              </div>
              ) : genMode === 'hierarchical' ? (
                <div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/50">种子</span>
                      <span className="text-cyan-400 font-mono">{hierPreview.seed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">宏观网格</span>
                      <span className="text-white">{hierPreview.macroWidth}×{hierPreview.macroHeight}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">总尺寸</span>
                      <span className="text-white">{activeMapWidth}×{activeMapHeight}</span>
                    </div>
                  </div>

                  {(metadata as any).templateCounts && (
                    <div className="pt-1 border-t border-white/10">
                      <h3 className="text-sm font-medium text-white/60 mb-2">模板类型分布</h3>
                      <div className="space-y-1.5">
                        {(Object.entries((metadata as any).templateCounts) as [string, number][])
                          .filter(([, count]) => count > 0)
                          .sort((a, b) => b[1] - a[1])
                          .map(([type, count]) => {
                            const totalMacro = hierPreview.macroWidth * hierPreview.macroHeight;
                            const pct = ((count / totalMacro) * 100).toFixed(1);
                            const color = getTemplateColor(type);
                            return (
                              <div key={type} className="flex items-center gap-2 text-xs">
                                <div className="w-3 h-3 rounded-sm flex-shrink-0 border border-white/20" style={{ backgroundColor: color }} />
                                <span className="text-white/70 w-16">{getTemplateShortName(type)}</span>
                                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
                                </div>
                                <span className="text-white/50 w-16 text-right tabular-nums">{count}格 ({pct}%)</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/50">种子</span>
                      <span className="text-emerald-400 font-mono">{fusedPreview.seed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">基础尺寸</span>
                      <span className="text-white">{fusedPreview.baseWidth}×{fusedPreview.baseHeight}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">风格预设</span>
                      <span className="text-white">{fusedPreview.stylePreset === 'default' ? '默认' : fusedPreview.stylePreset === 'east_asia' ? '东亚' : '欧洲'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">城市数</span>
                      <span className="text-orange-400">{fusedPreview.generated?.metadata.totalCities ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">道路数</span>
                      <span className="text-blue-300">{fusedPreview.generated?.metadata.totalRoads ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">据点数</span>
                      <span className="text-red-400">{fusedPreview.generated?.metadata.totalStrongholds ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">区域数</span>
                      <span className="text-purple-400">{fusedPreview.generated?.metadata.totalRegions ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/50">生成耗时</span>
                      <span className="text-green-400">{fusedPreview.generated?.metadata.generationTimeMs ?? 0}ms</span>
                    </div>
                  </div>

                  {fusedPreview.generated?.metadata.regionTemplateDistribution && (
                    <div className="pt-1 border-t border-white/10">
                      <h3 className="text-sm font-medium text-white/60 mb-2">区域模板分布</h3>
                      <div className="space-y-1.5">
                        {Object.entries(fusedPreview.generated.metadata.regionTemplateDistribution)
                          .filter(([, count]) => count > 0)
                          .sort((a, b) => b[1] - a[1])
                          .map(([type, count]) => {
                            const totalRegions = fusedPreview.generated!.regions.length;
                            const pct = ((count / totalRegions) * 100).toFixed(1);
                            const color = getTemplateColor(type);
                            return (
                              <div key={type} className="flex items-center gap-2 text-xs">
                                <div className="w-3 h-3 rounded-sm flex-shrink-0 border border-white/20" style={{ backgroundColor: color }} />
                                <span className="text-white/70 w-16">{getTemplateShortName(type)}</span>
                                <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
                                </div>
                                <span className="text-white/50 w-16 text-right tabular-nums">{count}区 ({pct}%)</span>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

            <div className="pt-2 border-t border-white/10">
              <h3 className="text-sm font-medium text-white/60 mb-2">生物群落分布</h3>
              <div className="space-y-1.5">
                {(Object.entries(metadata.biomeCounts) as [string, number][])
                  .filter(([, count]) => count > 0)
                  .sort((a, b) => b[1] - a[1])
                  .map(([terrain, count]) => {
                    const cfg = TERRAIN_CONFIGS[terrain as keyof typeof TERRAIN_CONFIGS];
                    const pct = ((count / totalCells) * 100).toFixed(1);
                    return (
                      <div key={terrain} className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0 border border-white/20" style={{ backgroundColor: cfg?.stats.color || '#666' }} />
                        <span className="text-white/70 w-14">{cfg?.name || terrain}</span>
                        <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: cfg?.stats.color || '#666' }} />
                        </div>
                        <span className="text-white/50 w-16 text-right tabular-nums">{count}格 ({pct}%)</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="bg-gray-900/60 border border-white/10 rounded-xl p-4 md:p-5 space-y-3">
            <h2 className="text-lg font-semibold text-white/90 border-b border-white/10 pb-2">🗺️ 地形图例</h2>
            <div className="grid grid-cols-2 gap-2">
              {Array.from(usedTerrains)
                .sort()
                .map(terrain => {
                  const cfg = TERRAIN_CONFIGS[terrain];
                  if (!cfg) return null;
                  return (
                    <div key={terrain} className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 transition-colors">
                      <div className="w-6 h-6 rounded-md border border-white/20 shadow-inner flex-shrink-0" style={{ backgroundColor: cfg.stats.color }} />
                      <div>
                        <div className="text-sm font-medium text-white/90">{cfg.name}</div>
                        <div className="text-[11px] text-white/40">{cfg.nameEn}</div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="pt-2 border-t border-white/10">
              <button
                onClick={handlePlay}
                className="w-full py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-lg font-bold text-base transition-all shadow-lg shadow-orange-600/25 active:scale-[0.98]"
              >
                ⚔️ 使用此地图开始游戏
              </button>
            </div>
          </div>
        </div>
        )}

        {/* ===== 超大地图(4096×4096) 显示区域 ===== */}
        {megaMapData && (
          <div className="bg-gray-900/95 border border-purple-500/40 rounded-xl p-5 ring-2 ring-purple-500/20 shadow-xl shadow-purple-900/30 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-bold text-purple-300 flex items-center gap-2">
                🌍 超大战略地图 ({megaMapData.totalWidth}×{megaMapData.totalHeight})
              </h2>
              <div className="flex gap-3 items-center text-xs text-white/50 flex-wrap">
                <span className="bg-purple-900/30 px-2 py-1 rounded text-purple-300">
                  {megaMapData.gridChunksX}×{megaMapData.gridChunksZ} 分块 · 每块 {megaMapData.chunkSize}×{megaMapData.chunkSize}
                </span>
                <span>🏙️ {megaMapData.cities.length} 座城市</span>
                <span>🛣️ {megaMapData.roads.length} 条道路</span>
                <button onClick={() => { setMegaMapData(null); setSelectedMegaChunk(null); }} className="ml-2 px-2 py-1 bg-white/10 rounded hover:bg-white/20 cursor-pointer">✕ 关闭</button>
              </div>
            </div>

            {/* 参数调整区 */}
            <div className="flex items-center gap-4 bg-black/20 rounded-lg px-3 py-2 text-xs flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-purple-300/70">总大小:</label>
                <select value={megaConfig.totalSize} onChange={e => { const v = Number(e.target.value); setMegaConfig(p => ({...p, totalSize: v})); }} className="bg-gray-800 text-white rounded px-2 py-1 border border-purple-500/30 cursor-pointer">
                  {[2048, 4096, 8192].map(v => <option key={v} value={v}>{v}×{v}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-purple-300/70">分块数:</label>
                <select value={megaConfig.gridDivisions} onChange={e => { const v = Number(e.target.value); setMegaConfig(p => ({...p, gridDivisions: v})); }} className="bg-gray-800 text-white rounded px-2 py-1 border border-purple-500/30 cursor-pointer">
                  {[16, 24, 32, 48, 64].map(v => <option key={v} value={v}>{v}×{v}</option>)}
                </select>
              </div>
              <span className="text-white/40">→ 每块: <strong className="text-emerald-400">{Math.floor(megaConfig.totalSize / megaConfig.gridDivisions)}×{Math.floor(megaConfig.totalSize / megaConfig.gridDivisions)}</strong></span>
            </div>

            {/* 缩略图矩阵 - 每块用细节缩略图表示 */}
            <div className="relative bg-black/30 rounded-lg p-2 overflow-auto max-h-[600px]">
              <div
                className="grid gap-[1px] rounded overflow-hidden border border-white/10 mx-auto"
                style={{
                  gridTemplateColumns: `repeat(${megaMapData.gridChunksX}, ${Math.max(16, Math.min(36, Math.floor(Math.min(700, window.innerWidth - 80) / megaMapData.gridChunksX)))}px)`,
                  width: 'fit-content',
                }}
              >
                {megaMapData.chunks.map((chunk, idx) => {
                  const isSelected = selectedMegaChunk === idx;
                  const thumbSize = Math.max(16, Math.min(36, Math.floor(Math.min(700, window.innerWidth - 80) / megaMapData.gridChunksX)));
                  return (
                    <canvas
                      key={`thumb-${idx}`}
                      width={thumbSize}
                      height={thumbSize}
                      title={`分块 [${chunk.chunkX}, ${chunk.chunkZ}] · 世界坐标 (${chunk.offsetX}, ${chunk.offsetZ}) · 点击查看详情`}
                      className={`cursor-pointer transition-all duration-150 ${isSelected ? 'ring-2 ring-purple-400 brightness-125 scale-105 z-10 relative' : 'hover:brightness-110'}`}
                      style={{ width: `${thumbSize}px`, height: `${thumbSize}px` }}
                      onClick={() => setSelectedMegaChunk(isSelected ? null : idx)}
                      ref={(el) => {
                        if (!el) return;
                        const ctx = el.getContext('2d');
                        if (!ctx) return;
                        const cw = chunk.width;
                        const ch = chunk.height;
                        const cells = chunk.cells;
                        for (let ty = 0; ty < thumbSize; ty++) {
                          for (let tx = 0; tx < thumbSize; tx++) {
                            const sx = Math.min(Math.floor((tx / thumbSize) * cw), cw - 1);
                            const sy = Math.min(ch - 1 - Math.floor((ty / thumbSize) * ch), ch - 1);
                            const cell = cells[sy]?.[sx];
                            if (cell) {
                              ctx.fillStyle = TERRAIN_CONFIGS[cell.terrain]?.stats.color || '#333';
                              ctx.fillRect(tx, ty, 1, 1);
                              if (cell.isRoad) {
                                ctx.fillStyle = cell.roadType === 'highway' ? '#fbbf24' : cell.roadType === 'main_road' ? '#fb923c' : '#d97706';
                                ctx.fillRect(tx, ty, 1, 1);
                              }
                            }
                          }
                        }
                      }}
                    />
                  );
                })}
              </div>

              {/* 道路和城市覆盖层 (SVG overlay) */}
              <svg viewBox={`0 0 ${megaMapData.gridChunksX} ${megaMapData.gridChunksZ}`} className="absolute inset-0 pointer-events-none" style={{ margin: '8px', width: `calc(100% - 16px)`, height: `calc(100% - 16px)` }}>
                {megaMapData.roads.map((road, ri) => {
                  if (!road.path || road.path.length < 2) return null;
                  const scaledPath = road.path.map(pt => ({
                    x: (pt.x / megaMapData.chunkSize),
                    z: (pt.z / megaMapData.chunkSize),
                  }));
                  const pathD = scaledPath.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.z}`).join(' ');
                  const rStyle = { highway: { stroke: '#fbbf24', strokeWidth: 0.3, opacity: 0.85 }, main_road: { stroke: '#fb923c', strokeWidth: 0.22, opacity: 0.75 }, dirt_road: { stroke: '#d97706', strokeWidth: 0.12, opacity: 0.55 }, rail: { stroke: '#94a3b8', strokeWidth: 0.15, opacity: 0.65 } };
                  const style = rStyle[road.roadType] || rStyle.dirt_road;
                  return (
                    <path key={`mr-${ri}`} d={pathD} fill="none" stroke={style.stroke} strokeWidth={style.strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={style.opacity} />
                  );
                })}
                {megaMapData.cities.map((city, ci) => {
                  const cx = city.position.x / megaMapData.chunkSize;
                  const cz = city.position.z / megaMapData.chunkSize;
                  const size = city.size === 'metropolis' ? 0.55 : city.size === 'city' ? 0.38 : city.size === 'town' ? 0.28 : 0.2;
                  return (
                    <circle key={`mc-${ci}`} cx={cx} cy={cz} r={size * 0.5} fill="#f59e0b" stroke="#fbbf24" strokeWidth={0.06} opacity={0.92} />
                  );
                })}
              </svg>
            </div>

            {/* 选中的分块详情 */}
            {selectedMegaChunk !== null && (() => {
              const chunk = megaMapData.chunks[selectedMegaChunk];
              if (!chunk) return <div className="text-red-400 text-sm p-4">分块数据不存在</div>;

              const roadsInChunk = megaMapData.roads.filter(r =>
                r.path.some(pt => pt.x >= chunk.offsetX && pt.x < chunk.offsetX + chunk.width && pt.z >= chunk.offsetZ && pt.z < chunk.offsetZ + chunk.height)
              );
              const citiesInChunk = megaMapData.cities.filter(c =>
                c.position.x >= chunk.offsetX && c.position.x < chunk.offsetX + chunk.width && c.position.z >= chunk.offsetZ && c.position.z < chunk.offsetZ + chunk.height
              );

              let roadCellCount = 0;
              for (const row of chunk.cells) for (const cell of row) if (cell.isRoad) roadCellCount++;

              return (
                <div className="bg-gray-800/80 border border-purple-500/30 rounded-xl p-4 ring-1 ring-purple-500/10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-bold text-purple-300">
                      📍 分块详情 [{chunk.chunkX}, {chunk.chunkZ}] — 世界坐标 ({chunk.offsetX}, {chunk.offsetZ})
                    </h3>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        const { exportJson } = saveMegaMapChunk(megaMapData, selectedMegaChunk);
                        const blob = new Blob([exportJson], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `mega_chunk_${chunk.chunkX}_${chunk.chunkZ}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }} className="text-xs text-white/70 hover:text-white px-2 py-1 rounded bg-indigo-600/80 hover:bg-indigo-500 cursor-pointer transition-colors">
                        📥 导出分块
                      </button>
                      <button onClick={() => setSelectedMegaChunk(null)} className="text-xs text-white/50 hover:text-white px-2 py-1 rounded bg-white/5 cursor-pointer">✕ 关闭</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-xs text-white/60 mb-3 pb-2 border-b border-white/10">
                    <div>尺寸: <strong className="text-white/90">{chunk.width}×{chunk.height}</strong></div>
                    <div>道路格: <strong className="text-amber-300">{roadCellCount}</strong></div>
                    <div>经过道路: <strong className="text-yellow-300">{roadsInChunk.length}</strong> 条</div>
                    <div>包含城市: <strong className="text-orange-300">{citiesInChunk.length}</strong> 座</div>
                  </div>

                  {/* 地形统计 & 道路详情 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    {/* 左: 地形统计 */}
                    <div className="bg-black/20 rounded-lg p-3">
                      <h4 className="text-xs font-medium text-emerald-300/70 mb-2">📊 地形分布 ({chunk.width}×{chunk.height})</h4>
                      {(() => {
                        const counts: Record<string, number> = {};
                        for (const row of chunk.cells) for (const cell of row) {
                          const key = cell.isRoad ? `🛣️ ${cell.roadType || 'road'}` : (TERRAIN_CONFIGS[cell.terrain]?.name || cell.terrain);
                          counts[key] = (counts[key] || 0) + 1;
                        }
                        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                        const total = chunk.width * chunk.height;
                        return (
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {sorted.map(([name, count]) => (
                              <div key={name} className="flex items-center gap-2 text-[11px]">
                                <span className="text-white/70 w-20 truncate">{name}</span>
                                <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-400" style={{ width: `${(count / total * 100)}%` }} />
                                </div>
                                <span className="text-white/50 w-16 text-right tabular-nums">{count}格 ({(count/total*100).toFixed(1)}%)</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* 右: 道路详情 */}
                    <div className="bg-black/20 rounded-lg p-3">
                      <h4 className="text-xs font-medium text-yellow-300/70 mb-2">🛣️ 道路详情 ({roadsInChunk.length}条经过此块)</h4>
                      {roadsInChunk.length === 0 ? (
                        <div className="text-[11px] text-white/30 text-center py-4">无道路经过</div>
                      ) : (
                        <div className="space-y-2 max-h-44 overflow-y-auto">
                          {roadsInChunk.map((r, i) => {
                            const ptsInChunk = r.path.filter(pt =>
                              pt.x >= chunk.offsetX && pt.x < chunk.offsetX + chunk.width &&
                              pt.z >= chunk.offsetZ && pt.z < chunk.offsetZ + chunk.height
                            );
                            const rIcon = r.roadType === 'highway' ? '🛣️' : r.roadType === 'main_road' ? '🛤️' : r.roadType === 'rail' ? '🚂' : '🚜';
                            const rColor = r.roadType === 'highway' ? 'text-amber-300' : r.roadType === 'main_road' ? 'text-orange-300' : 'text-yellow-200/70';
                            return (
                              <div key={i} className="bg-yellow-900/10 border border-yellow-700/15 rounded-lg p-2 space-y-1">
                                <div className={`text-[11px] font-medium ${rColor} flex items-center justify-between`}>
                                  <span>{rIcon} {r.roadType.toUpperCase()} — {r.from?.slice(0, 10)} → {r.to?.slice(0, 10)}</span>
                                  <span className="text-white/30 font-normal">{ptsInChunk.length}格</span>
                                </div>
                                <div className="text-[10px] text-white/35 font-mono leading-relaxed max-h-14 overflow-y-auto">
                                  路径: [{ptsInChunk.slice(0, 60).map(p => `(${p.x},${p.z})`).join(' → ')}{ptsInChunk.length > 60 ? ` ... (${ptsInChunk.length - 60} more)` : ''}]
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 彩色地形图 */}
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-blue-300/70 mb-1.5">🗺️ 地形图 ({chunk.width}×{chunk.height})</h4>
                    <div className="overflow-auto flex justify-center py-2 bg-black/30 rounded-lg">
                      {(() => {
                        const dGrid = chunk.cells;
                        const dW = dGrid[0]?.length || 0;
                        const dH = dGrid.length || 0;
                        const cellSz = Math.max(3, Math.min(10, Math.floor(Math.min(600, window.innerWidth - 120) / dW)));
                        return (
                          <div className="relative inline-block rounded overflow-hidden border border-white/10 shadow-lg">
                            <div className="grid gap-[0px]" style={{ gridTemplateColumns: `repeat(${dW}, ${cellSz}px)` }}>
                              {dGrid.slice(0, dH).map((row, rz) =>
                                row.slice(0, dW).map((cell, rx) => {
                                  const isR = cell.isRoad;
                                  return (
                                    <div key={`${rz}-${rx}`}
                                      title={`(${rx},${rz}) · ${TERRAIN_CONFIGS[cell.terrain]?.name || cell.terrain}${isR ? ` [${cell.roadType}]` : ''}`}
                                      style={{
                                        width: `${cellSz}px`,
                                        height: `${cellSz}px`,
                                        backgroundColor: TERRAIN_CONFIGS[cell.terrain]?.stats.color || '#333',
                                        position: 'relative',
                                        ...(isR ? { boxShadow: 'inset 0 0 0 1px rgba(255,220,100,0.9)' } : {}),
                                      }}
                                    />
                                  );
                                })
                              )}
                            </div>
                            {citiesInChunk.map((city, i) => {
                              const lx = city.position.x - chunk.offsetX;
                              const lz = city.position.z - chunk.offsetZ;
                              if (lx < 0 || lx >= dW || lz < 0 || lz >= dH) return null;
                              return (
                                <div key={`cm-${i}`} className="absolute pointer-events-none" style={{
                                  left: `${lx * cellSz}px`,
                                  top: `${lz * cellSz}px`,
                                  transform: 'translate(-50%, -50%)',
                                }}>
                                  <div className="w-3 h-3 rounded-full bg-amber-400 border-2 border-yellow-200 shadow-lg flex items-center justify-center text-[7px] font-bold text-black">C</div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 坐标地形表 */}
                  <div className="mb-3">
                    <h4 className="text-xs font-medium text-cyan-300/70 mb-1.5">📐 坐标地形表 — 道路行高亮显示</h4>
                    <div className="overflow-auto max-h-48 bg-black/20 rounded-lg border border-white/5">
                      <table className="w-full text-[10px]">
                        <thead className="sticky top-0 bg-gray-800 z-10">
                          <tr className="text-white/40">
                            <th className="px-2 py-1 text-left font-medium w-8">Z\X</th>
                            {Array.from({ length: Math.min(chunk.width, 40) }, (_, x) => (
                              <th key={x} className="px-0 py-1 text-center font-mono font-normal text-white/25 w-5">{x}</th>
                            ))}
                            {chunk.width > 40 && <th className="px-1 text-center text-white/20">..</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {chunk.cells.slice(0, Math.min(chunk.height, 40)).map((row, rz) => {
                            const hasRoad = row.some(c => c.isRoad);
                            return (
                              <tr key={rz} className={`${hasRoad ? 'bg-yellow-900/10' : ''} hover:bg-white/5`}>
                                <td className="px-2 py-0 text-right font-mono text-white/30 sticky left-0 bg-inherit">{rz}</td>
                                {row.slice(0, 40).map((cell, rx) => {
                                  const isR = cell.isRoad;
                                  const terrainChar: Record<string, string> = { plains:'平', forest:'林', mountain:'山', water:'水', city:'城', road:'路', swamp:'沼', desert:'沙', bridge:'桥', fortress:'堡' };
                                  const tName = terrainChar[cell.terrain] || '?';
                                  return (
                                    <td key={rx}
                                      title={`(${rx},${rz}) · ${TERRAIN_CONFIGS[cell.terrain]?.name || cell.terrain}${isR ? ` [${cell.roadType}]` : ''}`}
                                      className={`px-0 py-0 text-center cursor-default font-mono ${
                                        isR ? 'bg-amber-500/25 text-amber-300 font-bold' :
                                        cell.terrain === 'water' ? 'text-blue-400/60' :
                                        cell.terrain === 'mountain' ? 'text-stone-400/60' :
                                        cell.terrain === 'forest' ? 'text-green-400/60' :
                                        cell.terrain === 'city' ? 'text-orange-400/60' :
                                        'text-white/40'
                                      }`}
                                    >
                                      {isR ? '═' : tName}
                                    </td>
                                  );
                                })}
                                {chunk.width > 40 && <td className="text-white/10 text-center">·</td>}
                              </tr>
                            );
                          })}
                          {chunk.height > 40 && (
                            <tr><td colSpan={Math.min(chunk.width, 41) + 2} className="text-center text-white/15 py-1">... 还有 {chunk.height - 40} 行</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              );
            })()}
          </div>
        )}

        {/* Strategic Map Display */}
        {stratMapData && genMode === 'strategic' && (
          <div className="space-y-4">
            <div className="bg-gray-900/60 border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-lg font-semibold text-white/90">⚔️ 战略地图 ({stratMapData.width}×{stratMapData.height})</h2>
                <div className="flex gap-2 text-xs text-white/50">
                  <span>🏙️ {stratMapData.sectors.flat().filter(s => s.features?.includes('city') || s.features?.includes('capital')).length} 城市</span>
                  <span>🌉 {stratMapData.sectors.flat().filter(s => s.features?.includes('bridge')).length} 桥梁</span>
                  <span>🏰 {stratMapData.sectors.flat().filter(s => s.features?.includes('fortress')).length} 要塞</span>
                  <span>✈️ {stratMapData.sectors.flat().filter(s => s.features?.includes('airfield')).length} 机场</span>
                  <span>⚓ {stratMapData.sectors.flat().filter(s => s.features?.includes('port')).length} 港口</span>
                </div>
              </div>

              {/* Debug layer selector */}
              <div className="flex gap-1.5 mb-3 flex-wrap">
                {(['terrain','elevation','slope','moisture','cityScore','roadCost','chokepoint','defense','supply'] as const).map(layer => (
                  <button key={layer} onClick={() => setStratDebugLayer(layer)}
                    className={`px-2 py-1 rounded text-xs cursor-pointer ${stratDebugLayer === layer ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
                    {layer === 'terrain' ? '地形' : layer === 'elevation' ? '高度' : layer === 'slope' ? '坡度' : layer === 'moisture' ? '湿度' : layer === 'cityScore' ? '城市分' : layer === 'roadCost' ? '道路费' : layer === 'chokepoint' ? '咽喉' : layer === 'defense' ? '防御' : '补给'}
                  </button>
                ))}
              </div>

              {/* Map grid */}
              <div className="overflow-auto flex justify-center py-2 bg-black/20 rounded-lg">
                <div className="relative inline-block">
                  <div className="grid gap-[0px]" style={{
                    gridTemplateColumns: `repeat(${stratMapData.width}, ${Math.max(6, Math.min(14, Math.floor((window?.innerWidth ?? 800) * 0.7 / stratMapData.width)))}px)`
                  }}>
                    {stratMapData.sectors.flat().map((sector, idx) => {
                      const cellSize = Math.max(6, Math.min(14, Math.floor((window?.innerWidth ?? 800) * 0.7 / stratMapData.width)));
                      let bgColor = '#333';
                      const gen = sector.gen;

                      if (stratDebugLayer === 'terrain') {
                        const terrainColors: Record<string, string> = {
                          plains: '#7cb342', forest: '#2e7d32', mountain: '#78909c', water: '#1565c0',
                          desert: '#fdd835', marshland: '#5d4037', highland: '#546e7a', city: '#8d6e63',
                        };
                        bgColor = terrainColors[sector.baseTerrain || sector.terrain] || '#333';
                        // River: semi-transparent blue overlay on top of terrain color
                        if (sector.features?.includes('river') && sector.baseTerrain !== 'water') {
                          // Blend with blue
                          const r = parseInt(bgColor.slice(1,3), 16);
                          const g = parseInt(bgColor.slice(3,5), 16);
                          const b = parseInt(bgColor.slice(5,7), 16);
                          bgColor = `rgb(${Math.floor(r*0.4+33*0.6)},${Math.floor(g*0.4+150*0.6)},${Math.floor(b*0.4+243*0.6)})`;
                        }
                      } else if (gen) {
                        const val = stratDebugLayer === 'elevation' ? gen.elevation :
                          stratDebugLayer === 'slope' ? gen.slope :
                          stratDebugLayer === 'moisture' ? gen.moisture :
                          stratDebugLayer === 'cityScore' ? Math.max(0, gen.cityScore / 100) :
                          stratDebugLayer === 'roadCost' ? Math.min(1, gen.roadCost / 20) :
                          stratDebugLayer === 'chokepoint' ? gen.chokepointValue :
                          stratDebugLayer === 'defense' ? gen.defensiveValue :
                          gen.supplyValue / 100;
                        const clamped = Math.max(0, Math.min(1, val));
                        const r = Math.floor(clamped * 255);
                        const b = Math.floor((1 - clamped) * 255);
                        bgColor = `rgb(${r},${Math.floor(clamped * 80)},${b})`;
                      }

                      const isCity = sector.features?.includes('city') || sector.features?.includes('capital');
                      const isRoad = sector.features?.includes('main_road') || sector.features?.includes('secondary_road');
                      const isBridge = sector.features?.includes('bridge');
                      const isFortress = sector.features?.includes('fortress');
                      const isPort = sector.features?.includes('port');
                      const isAirfield = sector.features?.includes('airfield');

                      return (
                        <div key={idx}
                          onMouseEnter={() => setStratHovered({ x: sector.position.x, y: sector.position.y })}
                          onMouseLeave={() => setStratHovered(null)}
                          title={`(${sector.position.x},${sector.position.y}) ${sector.baseTerrain || sector.terrain}${sector.features?.length ? ' [' + sector.features.join(',') + ']' : ''}${gen ? ` h=${gen.elevation.toFixed(2)} s=${gen.slope.toFixed(2)} m=${gen.moisture.toFixed(2)}` : ''}`}
                          style={{
                            width: `${cellSize}px`,
                            height: `${cellSize}px`,
                            backgroundColor: bgColor,
                            position: 'relative',
                            ...(isRoad && stratDebugLayer === 'terrain' ? { boxShadow: 'inset 0 0 0 1px rgba(255,220,100,0.8)' } : {}),
                          }}
                        >
                          {isCity && stratDebugLayer === 'terrain' && (
                            <div className="absolute inset-0 flex items-center justify-center text-[6px] font-bold text-yellow-300 leading-none">
                              {sector.features?.includes('capital') ? '★' : '●'}
                            </div>
                          )}
                          {isFortress && stratDebugLayer === 'terrain' && (
                            <div className="absolute inset-0 flex items-center justify-center text-[6px] text-red-300 leading-none">◆</div>
                          )}
                          {isPort && stratDebugLayer === 'terrain' && (
                            <div className="absolute inset-0 flex items-center justify-center text-[6px] text-cyan-300 leading-none">⚓</div>
                          )}
                          {isAirfield && stratDebugLayer === 'terrain' && (
                            <div className="absolute inset-0 flex items-center justify-center text-[6px] text-white leading-none">✈</div>
                          )}
                          {isBridge && stratDebugLayer === 'terrain' && (
                            <div className="absolute inset-0 flex items-center justify-center text-[6px] text-amber-200 leading-none">≋</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Hover info */}
              {stratHovered && (() => {
                const s = stratMapData.sectors[stratHovered.y]?.[stratHovered.x];
                if (!s) return null;
                return (
                  <div className="mt-3 bg-black/30 rounded-lg p-3 text-xs text-white/70 grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>📍 ({s.position.x},{s.position.y}) <span className="text-white/90">{s.name}</span></div>
                    <div>🏔️ {s.baseTerrain || s.terrain} {s.features?.length ? `[${s.features.join(',')}]` : ''}</div>
                    {s.gen && <>
                      <div>📏 h={s.gen.elevation.toFixed(3)} s={s.gen.slope.toFixed(3)} m={s.gen.moisture.toFixed(3)} t={s.gen.temperature.toFixed(2)}</div>
                      <div>🎯 city={s.gen.cityScore.toFixed(0)} road={s.gen.roadCost.toFixed(1)} choke={s.gen.chokepointValue.toFixed(2)} def={s.gen.defensiveValue.toFixed(2)} sup={s.gen.supplyValue.toFixed(0)}</div>
                    </>}
                  </div>
                );
              })()}

              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
                {stratDebugLayer === 'terrain' && <>
                  {Object.entries({ plains:'平原', forest:'森林', mountain:'山地', water:'水域', desert:'沙漠', marshland:'沼泽', highland:'高地', city:'城市' }).map(([k,v]) => {
                    const colors: Record<string,string> = { plains:'#7cb342', forest:'#2e7d32', mountain:'#78909c', water:'#1565c0', desert:'#fdd835', marshland:'#5d4037', highland:'#546e7a', city:'#8d6e63' };
                    return <span key={k} className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{backgroundColor:colors[k]}}></span>{v}</span>;
                  })}
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-[#2196f3]"></span>河流</span>
                  <span className="flex items-center gap-1"><span className="text-yellow-300">●</span>城市 <span className="text-yellow-300">★</span>首都</span>
                  <span className="flex items-center gap-1"><span className="text-red-300">◆</span>要塞 <span className="text-cyan-300">⚓</span>港口 <span className="text-white">✈</span>机场</span>
                </>}
              </div>
            </div>
          </div>
        )}

        {/* Gallery */}
        <div className="bg-gray-900/60 border border-white/10 rounded-xl p-4 md:p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white/90">🎨 地图画廊 — 点击加载</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {galleryThumbs.map(t => {
              if (t.mode === 'procedural') {
                const tm = t.thumbMap as ReturnType<typeof generateProceduralMap>;
                return (
                  <button
                    key={t.seed}
                    onClick={() => {
                      setGenMode('procedural');
                      generate(
                        t.seed,
                        (tm.metadata.windDir * 180) / Math.PI,
                        0.6,
                        tm.metadata.rivers.length,
                        tm.metadata.cities.length,
                        t.w,
                        t.h
                      );
                    }}
                    className="group bg-gray-800/60 border border-white/10 rounded-lg p-3 hover:border-emerald-500/50 hover:bg-gray-800 transition-all cursor-pointer text-left"
                  >
                    <div className="flex justify-center mb-2 overflow-hidden rounded">
                      <div
                        className="gap-[0.5px]"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${t.w}, ${t.thumbSize}px)`,
                        }}
                      >
                        {tm.cells.slice(0, t.h).map((row, z) =>
                          row.slice(0, t.w).map((cell, x) => (
                            <div
                              key={`${t.seed}-${x}-${z}`}
                              style={{
                                width: `${t.thumbSize}px`,
                                height: `${t.thumbSize}px`,
                                backgroundColor: TERRAIN_CONFIGS[cell.terrain]?.stats.color || '#444',
                              }}
                            />
                          ))
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-emerald-400 group-hover:text-emerald-300">Seed #{t.seed}</div>
                      <div className="flex gap-2 text-[10px] text-white/40">
                        <span>🏙️{tm.metadata.cities.length}</span>
                        <span>🌊{tm.metadata.rivers.length}</span>
                        <span>{Object.entries(t.thumbCounts).filter(([, c]) => c > 0).length}种地形</span>
                      </div>
                    </div>
                  </button>
                );
              } else if (t.mode === 'hierarchical') {
                const tm = t.thumbMap as ReturnType<typeof generateHierarchicalMap>;
                return (
                  <button
                    key={t.seed}
                    onClick={() => {
                      setGenMode('hierarchical');
                      setHierPreview(prev => ({ ...prev, seed: t.seed, generated: tm }));
                    }}
                    className="group bg-gray-800/60 border border-white/10 rounded-lg p-3 hover:border-amber-500/50 hover:bg-gray-800 transition-all cursor-pointer text-left"
                  >
                    <div className="flex justify-center mb-2 overflow-hidden rounded">
                      <div
                        className="gap-[0.5px]"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${t.w}, ${t.thumbSize}px)`,
                        }}
                      >
                        {tm.cells.slice(0, t.h).map((row, z) =>
                          row.slice(0, t.w).map((cell, x) => (
                            <div
                              key={`${t.seed}-${x}-${z}`}
                              style={{
                                width: `${t.thumbSize}px`,
                                height: `${t.thumbSize}px`,
                                backgroundColor: TERRAIN_CONFIGS[cell.terrain]?.stats.color || '#444',
                              }}
                            />
                          ))
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-amber-400 group-hover:text-amber-300">Seed #{t.seed}</div>
                      <div className="flex gap-2 text-[10px] text-white/40">
                        <span>{t.w}×{t.h}</span>
                        <span>{Object.entries(t.thumbCounts).filter(([, c]) => c > 0).length}种地形</span>
                      </div>
                    </div>
                  </button>
                );
              } else {
                const tm = t.thumbMap as ReturnType<typeof generateFusedMap>;
                return (
                  <button
                    key={t.seed}
                    onClick={() => {
                      setGenMode('fused');
                      setFusedPreview(prev => ({ ...prev, seed: t.seed, generated: tm }));
                      setSelectedRegion(0);
                    }}
                    className="group bg-gray-800/60 border border-white/10 rounded-lg p-3 hover:border-emerald-500/50 hover:bg-gray-800 transition-all cursor-pointer text-left"
                  >
                    <div className="flex justify-center mb-2 overflow-hidden rounded">
                      <div
                        className="gap-[0.5px]"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${t.w}, ${t.thumbSize}px)`,
                        }}
                      >
                        {t.thumbMacro!.slice(0, t.h).map((row, z) =>
                          row.slice(0, t.w).map((cell, x) => (
                            <div
                              key={`${t.seed}-${x}-${z}`}
                              style={{
                                width: `${t.thumbSize}px`,
                                height: `${t.thumbSize}px`,
                                backgroundColor: TERRAIN_CONFIGS[cell.terrain]?.stats.color || '#444',
                              }}
                            />
                          ))
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-emerald-400 group-hover:text-emerald-300">Seed #{t.seed}</div>
                      <div className="flex gap-2 text-[10px] text-white/40">
                        <span>🏙️{tm.metadata.totalCities}</span>
                        <span>🗺️{tm.metadata.totalRegions}区</span>
                      </div>
                    </div>
                  </button>
                );
              }
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
