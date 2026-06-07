/**
 * RegionTile 缓存 - 按需生成，只缓存当前和周边 region
 */

import type { WorldAtlas } from './atlas-types';

export interface RegionCacheEntry {
  regionId: string;
  regionX: number;
  regionY: number;
  lastAccessed: number;
  sizeBytes: number;
}

const MAX_CACHED_REGIONS = 9; // current + 8 neighbors

export class RegionCache {
  private cache = new Map<string, unknown>();
  private accessOrder: string[] = [];

  get(regionId: string): unknown | undefined {
    const entry = this.cache.get(regionId);
    if (entry) {
      // Move to end (most recently used)
      this.accessOrder = this.accessOrder.filter(id => id !== regionId);
      this.accessOrder.push(regionId);
    }
    return entry;
  }

  set(regionId: string, data: unknown): void {
    if (this.cache.has(regionId)) {
      this.accessOrder = this.accessOrder.filter(id => id !== regionId);
    }

    this.cache.set(regionId, data);
    this.accessOrder.push(regionId);

    // Evict oldest if over limit
    while (this.cache.size > MAX_CACHED_REGIONS && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift()!;
      this.cache.delete(oldest);
    }
  }

  has(regionId: string): boolean {
    return this.cache.has(regionId);
  }

  evict(regionId: string): boolean {
    this.accessOrder = this.accessOrder.filter(id => id !== regionId);
    return this.cache.delete(regionId);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  get size(): number {
    return this.cache.size;
  }

  get cachedRegionIds(): string[] {
    return [...this.accessOrder];
  }
}

export function getNeighborRegionIds(regionX: number, regionY: number, gridWidth: number, gridHeight: number): string[] {
  const ids: string[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = regionX + dx;
      const ny = regionY + dy;
      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
      ids.push(`region_${nx}_${ny}`);
    }
  }
  return ids;
}
