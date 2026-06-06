'use client';

import { useEffect, useRef, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  opacity: number;
  opacityDir: number;
  phase: number;
}

const PARTICLE_COUNT = 70;
const CONNECTION_DISTANCE = 100;
const RADAR_CONE_WIDTH = Math.PI / 6; // 30-degree cone

const AMBER_COLORS = [
  'rgba(245,158,11,',
  'rgba(251,191,36,',
  'rgba(217,119,6,',
  'rgba(180,83,9,',
];

const ACCENT_COLORS = [
  'rgba(239,68,68,',  // red
  'rgba(59,130,246,', // blue
];

function pickColor(): string {
  const rand = Math.random();
  if (rand < 0.7) {
    return AMBER_COLORS[Math.floor(Math.random() * AMBER_COLORS.length)];
  }
  return ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
}

function createParticle(canvasWidth: number, canvasHeight: number, yRandom: boolean): Particle {
  const isLarge = Math.random() < 0.25;
  const size = isLarge ? 3 + Math.random() * 1 : 1 + Math.random() * 1;
  const opacity = 0.1 + Math.random() * 0.4;
  const opacityDir = (Math.random() < 0.5 ? 1 : -1) * (0.001 + Math.random() * 0.003);

  return {
    x: Math.random() * canvasWidth,
    y: yRandom ? Math.random() * canvasHeight : canvasHeight + Math.random() * 40,
    vx: 0,
    vy: -(0.15 + Math.random() * 0.35),
    size,
    color: pickColor(),
    opacity,
    opacityDir,
    phase: Math.random() * Math.PI * 2,
  };
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const radarAngleRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  const initParticles = useCallback((width: number, height: number) => {
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(createParticle(width, height, true));
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = width;
      canvas.height = height;
      if (particlesRef.current.length === 0) {
        initParticles(width, height);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    // Precomputed sin/cos lookup for performance
    const TWO_PI = Math.PI * 2;

    const loop = () => {
      // Clear with dark background
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);

      const particles = particlesRef.current;
      const len = particles.length;

      // Update & draw particles
      for (let i = 0; i < len; i++) {
        const p = particles[i];

        // Sin-wave horizontal drift
        p.phase += 0.01;
        p.x += Math.sin(p.phase) * 0.3 + p.vx;
        p.y += p.vy;

        // Opacity fade in/out
        p.opacity += p.opacityDir;
        if (p.opacity >= 0.5) {
          p.opacity = 0.5;
          p.opacityDir = -Math.abs(p.opacityDir);
        } else if (p.opacity <= 0.1) {
          p.opacity = 0.1;
          p.opacityDir = Math.abs(p.opacityDir);
        }

        // Wrap around
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) {
          p.x = width + 10;
        } else if (p.x > width + 10) {
          p.x = -10;
        }

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TWO_PI);
        ctx.fillStyle = p.color + p.opacity + ')';
        ctx.fill();
      }

      // Connection lines between nearby particles
      ctx.lineWidth = 0.5;
      for (let i = 0; i < len; i++) {
        const a = particles[i];
        for (let j = i + 1; j < len; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy;
          const maxDistSq = CONNECTION_DISTANCE * CONNECTION_DISTANCE;

          if (distSq < maxDistSq) {
            const dist = Math.sqrt(distSq);
            const alpha = (1 - dist / CONNECTION_DISTANCE) * 0.1;
            ctx.strokeStyle = `rgba(245,158,11,${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Radar sweep from bottom-left corner
      radarAngleRef.current += 0.005;
      if (radarAngleRef.current > TWO_PI) {
        radarAngleRef.current -= TWO_PI;
      }
      const angle = radarAngleRef.current;
      const cornerX = 0;
      const cornerY = height;
      const sweepRadius = Math.sqrt(width * width + height * height);

      // Draw the cone gradient
      const halfCone = RADAR_CONE_WIDTH;
      const startAngle = angle - halfCone;
      const endAngle = angle + halfCone;

      // Create gradient along the sweep direction
      const gradX = cornerX + Math.cos(angle) * sweepRadius;
      const gradY = cornerY + Math.sin(angle) * sweepRadius;

      const gradient = ctx.createRadialGradient(
        cornerX, cornerY, 0,
        cornerX, cornerY, sweepRadius
      );
      gradient.addColorStop(0, 'rgba(245,158,11,0.03)');
      gradient.addColorStop(0.5, 'rgba(245,158,11,0.015)');
      gradient.addColorStop(1, 'rgba(245,158,11,0)');

      ctx.beginPath();
      ctx.moveTo(cornerX, cornerY);
      ctx.arc(cornerX, cornerY, sweepRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [initParticles]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  );
}
