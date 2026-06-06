'use client';

import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useGameStore } from '@/store/game-store';
import { TERRAIN_CONFIGS, WEATHER_CONFIGS, MAP_WIDTH, MAP_HEIGHT } from '@/game/config';
import { isUnitDetected } from '@/game/engine';
import type { Unit, UnitType, CapturePoint, Position, WeatherType } from '@/game/types';

// ===== Capture pulse tracking (v80) — moved to useRef for HMR safety (v84) =====

// ===== Minimap Configuration =====
const MINIMAP_W = 210;
const MINIMAP_H = 158; // ~16:12 ratio
const PADDING = 2;

// ===== World-space constants (must match GameScene.tsx) =====
const CELL_SIZE = 1.0;
const CELL_GAP = 0.05;
const CELL_TOTAL = CELL_SIZE + CELL_GAP;
const MAP_OFFSET_X = -(MAP_WIDTH * CELL_TOTAL) / 2;
const MAP_OFFSET_Z = -(MAP_HEIGHT * CELL_TOTAL) / 2;

// Typical default camera frustum size (matches GameScene cameraZoom = 14)
const DEFAULT_FRUSTUM = 14;

// ===== Weather emoji icons =====
const WEATHER_ICONS: Record<WeatherType, string> = {
  clear: '☀️',
  rain: '🌧️',
  fog: '🌫️',
  snow: '❄️',
  sandstorm: '💨',
};

// ===== Unit shape sizes on minimap =====
function getUnitSize(type: UnitType): number {
  switch (type) {
    case 'tank': return 5;
    case 'ifv': return 4.5;
    case 'artillery': case 'mlrs': return 4.5;
    case 'scout': return 3;
    case 'infantry': return 3;
    case 'sam': return 4;
    case 'engineer': return 4;
    case 'supply': return 4;
    case 'helicopter': return 3.5;
    default: return 4;
  }
}

// ===== Draw unit type specific shapes =====
function drawUnitShape(
  ctx: CanvasRenderingContext2D,
  type: UnitType,
  cx: number,
  cy: number,
  size: number,
  color: string,
  opacity: number
) {
  ctx.save();
  ctx.globalAlpha = opacity;

  switch (type) {
    case 'tank': {
      // Large square
      const s = size;
      ctx.fillStyle = color;
      ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
      // Barrel
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(cx - 0.5, cy - s - 2, 1, 2);
      break;
    }
    case 'ifv': {
      // Medium square with notch
      const s = size;
      ctx.fillStyle = color;
      ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(cx - s, cy - s, s * 2, s * 2);
      // Small cross
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(cx - 0.5, cy - s, 1, s * 2);
      break;
    }
    case 'artillery':
    case 'mlrs': {
      // Diamond shape
      const s = size;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s - 1);
      ctx.lineTo(cx + s + 1, cy);
      ctx.lineTo(cx, cy + s + 1);
      ctx.lineTo(cx - s - 1, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }
    case 'scout': {
      // Small triangle
      const s = size;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, cy - s - 1);
      ctx.lineTo(cx + s + 1, cy + s);
      ctx.lineTo(cx - s - 1, cy + s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }
    case 'infantry': {
      // Small circle
      const s = size;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }
    case 'sam': {
      // Cross/plus shape
      const s = size;
      ctx.fillStyle = color;
      ctx.fillRect(cx - s, cy - 1, s * 2, 2);
      ctx.fillRect(cx - 1, cy - s, 2, s * 2);
      break;
    }
    case 'engineer': {
      // Hexagon shape
      const s = size;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = cx + s * Math.cos(angle);
        const py = cy + s * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      break;
    }
    case 'supply': {
      // Plus/cross (slightly different from SAM - rounded feel)
      const s = size;
      ctx.fillStyle = color;
      ctx.fillRect(cx - s, cy - 0.75, s * 2, 1.5);
      ctx.fillRect(cx - 0.75, cy - s, 1.5, s * 2);
      break;
    }
    case 'helicopter': {
      // Small 'H' or rotor shape
      const s = size;
      ctx.fillStyle = color;
      // Main body
      ctx.fillRect(cx - s * 0.6, cy - s, s * 1.2, s * 2);
      // Rotor bar
      ctx.fillRect(cx - s - 1, cy - s - 1.5, (s + 1) * 2, 1.5);
      break;
    }
    default: {
      const s = size;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ===== Health-based opacity =====
function getHealthOpacity(hp: number, maxHp: number): number {
  const pct = hp / maxHp;
  if (pct > 0.75) return 1.0;
  if (pct > 0.5) return 0.8;
  if (pct > 0.25) return 0.6;
  return 0.4;
}

// ===== Coordinate conversion helpers =====

/** Convert grid cell (x, z) to world coordinates */
function cellToWorldPos(x: number, z: number): { wx: number; wz: number } {
  return {
    wx: MAP_OFFSET_X + x * CELL_TOTAL + CELL_SIZE / 2,
    wz: MAP_OFFSET_Z + z * CELL_TOTAL + CELL_SIZE / 2,
  };
}

/** Convert minimap pixel to world coordinates */
function minimapToWorld(px: number, py: number, cellW: number, cellH: number): { wx: number; wz: number } {
  const gridX = (px - PADDING) / cellW;
  const gridZ = (py - PADDING) / cellH;
  // v30.0: Add CELL_SIZE/2 offset to match cell center (matching cellToWorldPos)
  return {
    wx: MAP_OFFSET_X + gridX * CELL_TOTAL + CELL_SIZE / 2,
    wz: MAP_OFFSET_Z + gridZ * CELL_TOTAL + CELL_SIZE / 2,
  };
}

/** Convert world coordinates to minimap pixel */
function worldToMinimap(wx: number, wz: number, cellW: number, cellH: number): { px: number; py: number } {
  const mapWorldW = MAP_WIDTH * CELL_TOTAL;
  const mapWorldH = MAP_HEIGHT * CELL_TOTAL;
  return {
    px: PADDING + ((wx - MAP_OFFSET_X) / mapWorldW) * (MAP_WIDTH * cellW),
    py: PADDING + ((wz - MAP_OFFSET_Z) / mapWorldH) * (MAP_HEIGHT * cellH),
  };
}

// ===== Main Minimap Component =====
export default function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const dirtyRef = useRef<boolean>(true);
  // v84: HMR-safe refs (were module-level, leaked across hot reloads)
  const capturePulsesRef = useRef<{ x: number; z: number; faction: string; time: number }[]>([]);
  const prevCPOwnersRef = useRef<Record<string, string | null>>({});

  // Click indicator state (flash effect)
  const [clickIndicator, setClickIndicator] = useState<{ px: number; py: number; time: number } | null>(null);

  // Hover state for friendly unit detection
  const [hoveredFriendlyPos, setHoveredFriendlyPos] = useState<{ x: number; z: number } | null>(null);

  // Get game state
  const map = useGameStore(s => s.map);
  const units = useGameStore(s => s.units);
  const selectedUnit = useGameStore(s => s.selectedUnit);
  const movablePositions = useGameStore(s => s.movablePositions);
  const capturePoints = useGameStore(s => s.capturePoints);
  const currentWeather = useGameStore(s => s.currentWeather) ?? 'clear';
  const setPanCameraTarget = useGameStore(s => s.setPanCameraTarget);
  const phase = useGameStore(s => s.phase);
  const cameraPosition = useGameStore(s => s.cameraPosition);
  // v77.0: damagePopups read from getState() inside rAF draw loop (no subscription needed)
  // v31.0: Read actual camera zoom for accurate viewport rect
  const cameraZoom = useGameStore(s => s.cameraZoom) ?? 14;
  // v83: Read actual camera aspect ratio for accurate viewport rect
  const cameraAspect = useGameStore(s => s.cameraAspect) ?? 16 / 9;

  // Cell pixel sizes
  const cellW = (MINIMAP_W - PADDING * 2) / MAP_WIDTH;
  const cellH = (MINIMAP_H - PADDING * 2) / MAP_HEIGHT;

  // Precompute alive unit counts
  const { redAlive, blueAlive } = useMemo(() => {
    const red = units.filter(u => u.faction === 'red' && u.isAlive).length;
    const blue = units.filter(u => u.faction === 'blue' && u.isAlive).length;
    return { redAlive: red, blueAlive: blue };
  }, [units]);

  // Build a position set for movable positions (for fast lookup)
  const movableSet = useMemo(() => {
    const set = new Set<string>();
    for (const p of movablePositions) {
      set.add(`${p.x},${p.z}`);
    }
    return set;
  }, [movablePositions]);

  // Capture point position set
  const cpPositionMap = useMemo(() => {
    const cpMap = new Map<string, CapturePoint>();
    for (const cp of capturePoints) {
      cpMap.set(`${cp.position.x},${cp.position.z}`, cp);
    }
    return cpMap;
  }, [capturePoints]);

  // v77.0→v78.0: recentlyDamagedSet moved into rAF draw for time-accurate filtering
  // (useMemo doesn't re-evaluate based on time, only deps)

  // Dirty flag: mark when key game data changes (units, capturePoints, phase, selection)
  useEffect(() => { dirtyRef.current = true; }, [units]);
  // v92.0: Verified — capturePoints dirty trigger works because processCaptureProgress()
  // returns a new array ref on each progress change, so Zustand's reference-equality check
  // triggers a re-render and this useEffect fires, setting dirtyRef = true.
  useEffect(() => { dirtyRef.current = true; }, [capturePoints]);
  useEffect(() => { dirtyRef.current = true; }, [phase]);
  useEffect(() => { dirtyRef.current = true; }, [selectedUnit]);
  useEffect(() => { dirtyRef.current = true; }, [movablePositions]);
  useEffect(() => { dirtyRef.current = true; }, [cameraPosition]);
  useEffect(() => { dirtyRef.current = true; }, [cameraZoom]);
  useEffect(() => { dirtyRef.current = true; }, [currentWeather]);
  useEffect(() => { dirtyRef.current = true; }, [clickIndicator]);
  useEffect(() => { dirtyRef.current = true; }, [hoveredFriendlyPos]);

  // Clear click indicator after animation
  useEffect(() => {
    if (!clickIndicator) return;
    const timer = setTimeout(() => setClickIndicator(null), 500);
    return () => clearTimeout(timer);
  }, [clickIndicator]);

  // Click-to-pan and click-to-select handler
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // v87.0: Guard during AI turn and deployment phase
      const livePhase = useGameStore.getState().phase;
      if (livePhase === 'aiTurn' || livePhase === 'deployment') return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      // Convert minimap pixel to grid cell coordinates
      const gridX = Math.floor((mx - PADDING) / cellW);
      const gridZ = Math.floor((my - PADDING) / cellH);

      // Check if a friendly (red) unit is at the clicked cell → select it
      if (gridX >= 0 && gridX < MAP_WIDTH && gridZ >= 0 && gridZ < MAP_HEIGHT) {
        const store = useGameStore.getState();
        const clickedUnit = store.units.find(
          u => u.position.x === gridX && u.position.z === gridZ && u.faction === 'red' && u.isAlive
        );
        if (clickedUnit) {
          store.onCellClick({ x: gridX, z: gridZ });
          setClickIndicator({ px: mx, py: my, time: performance.now() });
          return;
        }
      }

      // Convert minimap pixel to world coordinates for camera pan
      const { wx, wz } = minimapToWorld(mx, my, cellW, cellH);

      // Clamp to map bounds in world space
      const boundX = (MAP_WIDTH * CELL_TOTAL) / 2;
      const boundZ = (MAP_HEIGHT * CELL_TOTAL) / 2;
      const clampedWX = Math.max(-boundX, Math.min(boundX, wx));
      const clampedWZ = Math.max(-boundZ, Math.min(boundZ, wz));

      setPanCameraTarget({ x: clampedWX, z: clampedWZ });

      // Show click indicator at the minimap pixel position
      setClickIndicator({ px: mx, py: my, time: performance.now() });
    },
    [cellW, cellH, setPanCameraTarget]
  );

  // Hover handler — detect friendly units under cursor for visual indicator
  // v87.0: Use ref to avoid unnecessary re-renders on every pixel movement
  const hoveredFriendlyPosRef = useRef<{ x: number; z: number } | null>(null);
  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;

      const gridX = Math.floor((mx - PADDING) / cellW);
      const gridZ = Math.floor((my - PADDING) / cellH);

      if (gridX >= 0 && gridX < MAP_WIDTH && gridZ >= 0 && gridZ < MAP_HEIGHT) {
        // v80.0: Read from getState() to avoid stale closure during fast AI turns
        const liveUnits = useGameStore.getState().units;
        const friendlyUnit = liveUnits.find(
          u => u.position.x === gridX && u.position.z === gridZ && u.faction === 'red' && u.isAlive
        );
        const newHovered = friendlyUnit ? { x: gridX, z: gridZ } : null;
        // v87.0: Only trigger React re-render if hover cell actually changed
        const prev = hoveredFriendlyPosRef.current;
        if ((prev === null) !== (newHovered === null) || (prev && newHovered && (prev.x !== newHovered.x || prev.z !== newHovered.z))) {
          hoveredFriendlyPosRef.current = newHovered;
          setHoveredFriendlyPos(newHovered);
        }
      } else {
        if (hoveredFriendlyPosRef.current !== null) {
          hoveredFriendlyPosRef.current = null;
          setHoveredFriendlyPos(null);
        }
      }
    },
    [cellW, cellH]
  );

  const handleCanvasMouseLeave = useCallback(() => {
    hoveredFriendlyPosRef.current = null;
    setHoveredFriendlyPos(null);
  }, []);

  // Main draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = (timestamp: number) => {
      timeRef.current = timestamp;
      // Dirty check: skip redraw if nothing changed and no time-dependent effects active
      if (!dirtyRef.current) {
        // Still schedule next frame for time-based animations (weather, pulses)
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }
      dirtyRef.current = false;
      ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

      // Draw terrain
      if (map && map.cells) {
        // v83.0: Compute front line x-position for territory shading
        const aliveForFront = units.filter(u => u.isAlive);
        let frontLineX = MAP_WIDTH / 2;
        const redRightmost = aliveForFront.filter(u => u.faction === 'red').reduce((mx, u) => Math.max(mx, u.position.x), -1);
        const blueLeftmost = aliveForFront.filter(u => u.faction === 'blue').reduce((mx, u) => Math.min(mx, u.position.x), MAP_WIDTH);
        if (redRightmost >= 0 && blueLeftmost < MAP_WIDTH) {
          frontLineX = (redRightmost + blueLeftmost + 1) / 2;
        }

        for (let z = 0; z < MAP_HEIGHT; z++) {
          for (let x = 0; x < MAP_WIDTH; x++) {
            const cell = map.cells[z]?.[x];
            if (!cell) continue;
            const tConfig = TERRAIN_CONFIGS[cell.terrain];
            if (!tConfig) continue;
            ctx.fillStyle = tConfig.stats.color;
            ctx.fillRect(
              PADDING + x * cellW,
              PADDING + z * cellH,
              Math.ceil(cellW),
              Math.ceil(cellH)
            );

            // v83.0: Faction territory tint overlay
            const distToFront = x - frontLineX;
            if (distToFront < -2) {
              // Red territory - left of front line
              const intensity = Math.min(0.12, Math.abs(distToFront) * 0.008);
              ctx.fillStyle = `rgba(239, 68, 68, ${intensity})`;
              ctx.fillRect(
                PADDING + x * cellW,
                PADDING + z * cellH,
                Math.ceil(cellW),
                Math.ceil(cellH)
              );
            } else if (distToFront > 2) {
              // Blue territory - right of front line
              const intensity = Math.min(0.12, Math.abs(distToFront) * 0.008);
              ctx.fillStyle = `rgba(59, 130, 246, ${intensity})`;
              ctx.fillRect(
                PADDING + x * cellW,
                PADDING + z * cellH,
                Math.ceil(cellW),
                Math.ceil(cellH)
              );
            }
          }
        }
      }

      // Draw movement range overlay (when unit selected and in moveUnit phase)
      if (movableSet.size > 0 && phase === 'moveUnit') {
        // v84: Pre-parse movable positions once instead of splitting strings every iteration
        const movablePositions = Array.from(movableSet, key => {
          const idx = key.indexOf(',');
          return { x: parseInt(key.substring(0, idx), 10), z: parseInt(key.substring(idx + 1), 10) };
        });
        ctx.fillStyle = 'rgba(100, 200, 255, 0.2)';
        for (const { x: sx, z: sz } of movablePositions) {
          ctx.fillRect(
            PADDING + sx * cellW,
            PADDING + sz * cellH,
            Math.ceil(cellW),
            Math.ceil(cellH)
          );
        }
        // Draw border around movable area
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.35)';
        ctx.lineWidth = 0.5;
        for (const { x: sx, z: sz } of movablePositions) {
          // Only draw border edges adjacent to non-movable cells
          if (!movableSet.has(`${sx},${sz - 1}`)) {
            ctx.beginPath();
            ctx.moveTo(PADDING + sx * cellW, PADDING + sz * cellH);
            ctx.lineTo(PADDING + (sx + 1) * cellW, PADDING + sz * cellH);
            ctx.stroke();
          }
          if (!movableSet.has(`${sx},${sz + 1}`)) {
            ctx.beginPath();
            ctx.moveTo(PADDING + sx * cellW, PADDING + (sz + 1) * cellH);
            ctx.lineTo(PADDING + (sx + 1) * cellW, PADDING + (sz + 1) * cellH);
            ctx.stroke();
          }
          if (!movableSet.has(`${sx - 1},${sz}`)) {
            ctx.beginPath();
            ctx.moveTo(PADDING + sx * cellW, PADDING + sz * cellH);
            ctx.lineTo(PADDING + sx * cellW, PADDING + (sz + 1) * cellH);
            ctx.stroke();
          }
          if (!movableSet.has(`${sx + 1},${sz}`)) {
            ctx.beginPath();
            ctx.moveTo(PADDING + (sx + 1) * cellW, PADDING + sz * cellH);
            ctx.lineTo(PADDING + (sx + 1) * cellW, PADDING + (sz + 1) * cellH);
            ctx.stroke();
          }
        }
      }

      // v80: Detect capture point ownership changes → trigger pulse
      for (const cp of capturePoints) {
        const prevOwner = prevCPOwnersRef.current[cp.id];
        if (prevOwner !== undefined && prevOwner !== cp.owner) {
          capturePulsesRef.current.push({ x: cp.position.x, z: cp.position.z, faction: (cp.owner || prevOwner)!, time: Date.now() });
        }
        prevCPOwnersRef.current[cp.id] = cp.owner;
      }

      // Draw capture point markers
      for (const cp of capturePoints) {
        const cpx = PADDING + (cp.position.x + 0.5) * cellW;
        const cpy = PADDING + (cp.position.z + 0.5) * cellH;
        const pulse = 0.7 + 0.3 * Math.sin(timestamp / 400);

        if (cp.owner === null) {
          // Neutral - grey diamond
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = '#9ca3af';
          ctx.beginPath();
          ctx.moveTo(cpx, cpy - 3.5);
          ctx.lineTo(cpx + 3.5, cpy);
          ctx.lineTo(cpx, cpy + 3.5);
          ctx.lineTo(cpx - 3.5, cpy);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          const isContested = (cp.captureProgress.red > 0 && cp.captureProgress.blue > 0);

          if (isContested) {
            // Flashing yellow diamond
            ctx.save();
            ctx.globalAlpha = pulse;
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.moveTo(cpx, cpy - 4);
            ctx.lineTo(cpx + 4, cpy);
            ctx.lineTo(cpx, cpy + 4);
            ctx.lineTo(cpx - 4, cpy);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          } else if (cp.owner === 'red') {
            // Red flag
            ctx.save();
            ctx.fillStyle = '#dc2626';
            // Pole
            ctx.fillRect(cpx - 0.5, cpy - 5, 1, 10);
            // Flag
            ctx.beginPath();
            ctx.moveTo(cpx, cpy - 5);
            ctx.lineTo(cpx + 5, cpy - 3);
            ctx.lineTo(cpx, cpy - 1);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          } else {
            // Blue flag
            ctx.save();
            ctx.fillStyle = '#2563eb';
            // Pole
            ctx.fillRect(cpx - 0.5, cpy - 5, 1, 10);
            // Flag
            ctx.beginPath();
            ctx.moveTo(cpx, cpy - 5);
            ctx.lineTo(cpx + 5, cpy - 3);
            ctx.lineTo(cpx, cpy - 1);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
        }
        // v91.0: Capture progress bar underneath marker
        if (cp.captureProgress) {
          const threshold = cp.captureThreshold || 100;
          const redRatio = cp.captureProgress.red / threshold;
          const blueRatio = cp.captureProgress.blue / threshold;
          if (redRatio > 0 || blueRatio > 0) {
            const barW = cellW * 0.9;
            const barH = 2;
            const barX = cpx - barW / 2;
            const barY = cpy + 5;
            // Background
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(barX, barY, barW, barH);
            // Red fill (left side)
            if (redRatio > 0) {
              ctx.fillStyle = '#ef4444';
              ctx.fillRect(barX, barY, barW * Math.min(redRatio, 1), barH);
            }
            // Blue fill (right side)
            if (blueRatio > 0) {
              ctx.fillStyle = '#3b82f6';
              const blueW = barW * Math.min(blueRatio, 1);
              ctx.fillRect(barX + barW - blueW, barY, blueW, barH);
            }
          }
        }
      }

      // v80: Capture point change pulse effect (v84: filter instead of splice-in-loop)
      const now = Date.now();
      capturePulsesRef.current = capturePulsesRef.current.filter(pulse => {
        const elapsed = (now - pulse.time) / 1000;
        if (elapsed > 1.5) return false;
        const progress = elapsed / 1.5;
        const radius = 3 + progress * 8;
        const alpha = (1 - progress) * 0.6;
        ctx.beginPath();
        ctx.arc(
          PADDING + (pulse.x + 0.5) * cellW,
          PADDING + (pulse.z + 0.5) * cellH,
          radius, 0, Math.PI * 2
        );
        ctx.strokeStyle = pulse.faction === 'red' 
          ? `rgba(239, 68, 68, ${alpha})`
          : `rgba(59, 130, 246, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        return true;
      });

      // Draw units
      const aliveUnits = units.filter(u => u.isAlive);
      // v78.0: Compute recently damaged set inside rAF for time-accurate filtering
      const drawNow = Date.now();
      const liveDmgSet = new Set<string>();
      for (const dp of (useGameStore.getState().damagePopups || [])) {
        if ((dp.type === 'damage' || dp.type === 'counter') && (drawNow - dp.timestamp) < 2000) {
          liveDmgSet.add(`${dp.x},${dp.z}`);
        }
      }
      // Get full game state for stealth detection
      const fullState = useGameStore.getState();
      for (const unit of aliveUnits) {
        // v31.0: Hide undetected stealthed enemy units (show detected ones)
        if (unit.faction !== 'red' && unit.isStealthed && !isUnitDetected(fullState, unit, 'red')) continue;
        const ux = PADDING + (unit.position.x + 0.5) * cellW;
        const uz = PADDING + (unit.position.z + 0.5) * cellH;
        const hpPct = unit.stats.hp / unit.stats.maxHp;
        const opacity = getHealthOpacity(unit.stats.hp, unit.stats.maxHp);
        const color = unit.faction === 'red' ? '#ef4444' : '#3b82f6';
        const size = getUnitSize(unit.type);

        // Low HP pulsing for <25%
        let drawOpacity = opacity;
        if (hpPct < 0.25) {
          drawOpacity = 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(timestamp / 300));
        }

        drawUnitShape(ctx, unit.type, ux, uz, size, color, drawOpacity);

        // v77.0/v78.0: Recently damaged unit blink highlight on minimap
        const dmgKey = `${unit.position.x},${unit.position.z}`;
        if (liveDmgSet.has(dmgKey)) {
          const blinkPulse = 0.5 + 0.5 * Math.sin(timestamp / 150);
          ctx.save();
          ctx.globalAlpha = 0.6 * blinkPulse;
          ctx.strokeStyle = '#ff4444';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ux, uz, size + 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Health bar below unit for HP < 50%
        if (hpPct < 0.5) {
          const barW = size * 2 + 2;
          const barH = 1.5;
          const barX = ux - barW / 2;
          const barY = uz + size + 1.5;
          // Background
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(barX, barY, barW, barH);
          // Health fill
          const hpColor = hpPct > 0.25 ? '#f59e0b' : '#ef4444';
          ctx.fillStyle = hpColor;
          ctx.fillRect(barX, barY, barW * hpPct, barH);
        }
      }

      // Selected unit pulsing ring
      if (selectedUnit && selectedUnit.isAlive) {
        const sx = PADDING + (selectedUnit.position.x + 0.5) * cellW;
        const sz = PADDING + (selectedUnit.position.z + 0.5) * cellH;
        const pulse = 0.5 + 0.5 * Math.sin(timestamp / 350);
        const ringSize = getUnitSize(selectedUnit.type) + 3;

        ctx.save();
        ctx.globalAlpha = 0.4 + 0.6 * pulse;
        ctx.strokeStyle = '#fbbf24'; // yellow
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sz, ringSize, 0, Math.PI * 2);
        ctx.stroke();

        // Outer glow ring
        ctx.globalAlpha = 0.15 + 0.2 * pulse;
        ctx.strokeStyle = '#fef3c7';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sx, sz, ringSize + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // ===== Viewport Rectangle =====
      // Show current camera view area on the minimap
      if (cameraPosition) {
        // v31.0: Use actual camera zoom instead of DEFAULT_FRUSTUM
        // v83: Use actual camera aspect ratio from GameScene
        const aspect = cameraAspect;
        const halfW = (cameraZoom * aspect) / 2;
        const halfH = cameraZoom / 2;

        // Camera frustum bounds in world space
        const vLeft = cameraPosition.x - halfW;
        const vRight = cameraPosition.x + halfW;
        const vTop = cameraPosition.z - halfH;
        const vBottom = cameraPosition.z + halfH;

        // Convert world bounds to minimap pixels
        const topLeft = worldToMinimap(vLeft, vTop, cellW, cellH);
        const bottomRight = worldToMinimap(vRight, vBottom, cellW, cellH);
        const rx = topLeft.px;
        const ry = topLeft.py;
        const rw = bottomRight.px - topLeft.px;
        const rh = bottomRight.py - topLeft.py;

        // Semi-transparent fill
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(rx, ry, rw, rh);

        // Viewport border rectangle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx, ry, rw, rh);

        // Corner marks
        const cornerLen = 6;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.5;
        // Top-left
        ctx.beginPath();
        ctx.moveTo(rx, ry + cornerLen); ctx.lineTo(rx, ry); ctx.lineTo(rx + cornerLen, ry);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(rx + rw - cornerLen, ry); ctx.lineTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + cornerLen);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(rx, ry + rh - cornerLen); ctx.lineTo(rx, ry + rh); ctx.lineTo(rx + cornerLen, ry + rh);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(rx + rw - cornerLen, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.lineTo(rx + rw, ry + rh - cornerLen);
        ctx.stroke();
      }

      // ===== Click Indicator (expanding ring that fades) =====
      if (clickIndicator) {
        const age = timestamp - clickIndicator.time;
        if (age < 500) {
          const progress = age / 500;
          const ringRadius = 3 + progress * 10;
          const alpha = 1 - progress;

          ctx.save();
          // Outer expanding ring
          ctx.globalAlpha = alpha * 0.7;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(clickIndicator.px, clickIndicator.py, ringRadius, 0, Math.PI * 2);
          ctx.stroke();

          // Inner dot
          ctx.globalAlpha = alpha;
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(clickIndicator.px, clickIndicator.py, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Border frame
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.strokeRect(PADDING, PADDING, MAP_WIDTH * cellW, MAP_HEIGHT * cellH);

      // ===== Hovered friendly unit highlight =====
      if (hoveredFriendlyPos) {
        const hx = PADDING + (hoveredFriendlyPos.x + 0.5) * cellW;
        const hy = PADDING + (hoveredFriendlyPos.z + 0.5) * cellH;
        const hoverPulse = 0.6 + 0.3 * Math.sin(timestamp / 200);

        ctx.save();
        ctx.globalAlpha = hoverPulse * 0.5;
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(hx, hy, cellW * 0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // ===== v78.0: Weather visual effects on minimap =====
      if (currentWeather === 'rain') {
        // Blue diagonal rain lines
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 0.5;
        const mapPxW = MAP_WIDTH * cellW;
        const mapPxH = MAP_HEIGHT * cellH;
        const rainOffset = (timestamp * 0.05) % 8;
        for (let i = 0; i < 30; i++) {
          const rx = PADDING + ((i * 17 + rainOffset) % mapPxW);
          const ry = PADDING + ((i * 13 + rainOffset * 2) % mapPxH);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 2, ry + 4);
          ctx.stroke();
        }
        ctx.restore();
      } else if (currentWeather === 'snow') {
        // White snow dots
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#ffffff';
        const mapPxW = MAP_WIDTH * cellW;
        const mapPxH = MAP_HEIGHT * cellH;
        const snowOffset = (timestamp * 0.02) % 6;
        for (let i = 0; i < 20; i++) {
          const sx = PADDING + ((i * 23 + snowOffset) % mapPxW);
          const sy = PADDING + ((i * 19 + snowOffset * 1.5) % mapPxH);
          ctx.beginPath();
          ctx.arc(sx, sy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      } else if (currentWeather === 'sandstorm') {
        // Orange-tinted overlay with animated noise
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(PADDING, PADDING, MAP_WIDTH * cellW, MAP_HEIGHT * cellH);
        ctx.restore();
      } else if (currentWeather === 'fog') {
        // Light gray overlay
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#9ca3af';
        ctx.fillRect(PADDING, PADDING, MAP_WIDTH * cellW, MAP_HEIGHT * cellH);
        ctx.restore();
      }

      // Keep dirty if there are active time-dependent effects that need continuous redraws
      if (currentWeather !== 'clear' || capturePulsesRef.current.length > 0 || clickIndicator || hoveredFriendlyPos) {
        dirtyRef.current = true;
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      // v82: Clear module-level state to prevent stale data across game instances
      capturePulsesRef.current.length = 0;
      for (const key of Object.keys(prevCPOwnersRef.current)) delete prevCPOwnersRef.current[key];
    };
  }, [map, selectedUnit, movableSet, capturePoints, phase, cellW, cellH, cameraPosition, cameraZoom, clickIndicator, hoveredFriendlyPos, currentWeather]);

  // Show nothing during deployment
  if (phase === 'deployment') return null;

  return (
    // v79.0: Frosted glass container with hover glow
    <div className="relative pointer-events-auto select-none">
      <div className="absolute -inset-px rounded-xl bg-gradient-to-b from-white/5 to-white/[0.02] border border-white/10 shadow-lg shadow-black/30 pointer-events-none" />
      {/* Minimap canvas */}
      <canvas
        ref={canvasRef}
        width={MINIMAP_W}
        height={MINIMAP_H}
        className="relative z-10 hover:brightness-110 transition-all duration-200"
        style={{
          width: MINIMAP_W * 0.95,
          height: MINIMAP_H * 0.95,
          imageRendering: 'pixelated',
          borderRadius: '0.5rem',
        }}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        onMouseLeave={handleCanvasMouseLeave}
        title="点击小地图移动视角 / 点击友军单位选中"
      />

      {/* v85: Red unit count badge - top left overlay */}
      <div
        className="absolute top-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
        style={{ background: 'rgba(220,38,38,0.35)', backdropFilter: 'blur(4px)', border: '1px solid rgba(220,38,38,0.4)' }}
        title={`红方存活: ${redAlive}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        <span className="text-red-300">{redAlive}</span>
      </div>

      {/* v85: Blue unit count badge - bottom right overlay */}
      <div
        className="absolute bottom-1 right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
        style={{ background: 'rgba(37,99,235,0.35)', backdropFilter: 'blur(4px)', border: '1px solid rgba(37,99,235,0.4)' }}
        title={`蓝方存活: ${blueAlive}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
        <span className="text-blue-300">{blueAlive}</span>
      </div>

      {/* Weather indicator - top right overlay */}
      <div
        className="absolute top-1 right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
        title={WEATHER_CONFIGS[currentWeather]?.name ?? ''}
      >
        <span className="text-[10px]">{WEATHER_ICONS[currentWeather]}</span>
      </div>
    </div>
  );
}
