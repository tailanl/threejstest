'use client';

import React from 'react';
import type { WorldAtlas } from '@/game/world-atlas/atlas-types';
import type { RegionTile } from '@/game/world-map/world-map-types';

interface WorldDebugPanelProps {
  atlas: WorldAtlas | null;
  currentRegion: RegionTile | null;
  cachedRegionIds: string[];
}

export default function WorldDebugPanel({ atlas, currentRegion, cachedRegionIds }: WorldDebugPanelProps) {
  if (!atlas) return <div className="bg-gray-900/80 border border-white/10 rounded-xl p-4 text-xs text-white/30">No atlas loaded</div>;

  const terrainCounts: Record<string, number> = {};
  if (currentRegion) {
    for (const row of currentRegion.cells) {
      for (const cell of row) {
        terrainCounts[cell.baseTerrain] = (terrainCounts[cell.baseTerrain] || 0) + 1;
      }
    }
  }

  return (
    <div className="bg-gray-900/80 border border-white/10 rounded-xl p-4 space-y-2">
      <h2 className="text-sm font-semibold text-white/90">🐛 World Debug</h2>

      <div className="grid grid-cols-2 gap-1 text-xs text-white/60">
        <div>Atlas: {atlas.virtualWidth}×{atlas.virtualHeight}</div>
        <div>Macro: {atlas.macroWidth}×{atlas.macroHeight}</div>
        <div>Regions: {atlas.regionGridWidth}×{atlas.regionGridHeight}</div>
        <div>Generated: {atlas.generatedRegionIds.length}</div>
        <div>Cached: {cachedRegionIds.length}</div>
        <div>Political: {atlas.politicalRegions.length}</div>
        <div>Economic: {atlas.economicZones.length}</div>
        <div>HumanGeo: {atlas.humanGeographyZones.length}</div>
      </div>

      {currentRegion && (
        <>
          <div className="text-xs text-white/50 font-semibold">Current Region ({currentRegion.regionX},{currentRegion.regionY})</div>
          <div className="grid grid-cols-2 gap-1 text-xs text-white/60">
            <div>Cities: {currentRegion.cities.length}</div>
            <div>Roads: {currentRegion.roads.length}</div>
            <div>Rivers: {currentRegion.rivers.length}</div>
            <div>Chunks: {currentRegion.strategicChunks.flat().length}</div>
          </div>
          <div className="space-y-0.5">
            {Object.entries(terrainCounts).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs text-white/50">
                <span>{k}</span>
                <span>{v} ({(v / (currentRegion.width * currentRegion.height) * 100).toFixed(1)}%)</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
