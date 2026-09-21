"use client";

import React, { useEffect, useRef } from "react";

interface TrailPoint {
  x: number;
  y: number;
  time: number;
}

function InteractiveGrid() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const inlays = Array.from(root.querySelectorAll<SVGElement>(".ambient-inlay"));
    let scrollFrame: number | null = null;
    const updateDepth = () => {
      scrollFrame = null;
      const scroll = motion.matches ? 0 : window.scrollY;
      const span = window.innerHeight + 600;
      root.style.setProperty("--lattice-y", `${-scroll * 0.075}px`);
      inlays.forEach((inlay, index) => {
        const start = window.innerHeight * [0.1, 0.76, 0.43, 1.08][index];
        const offset = start - scroll * (index % 2 ? 0.23 : 0.16);
        // Wrap only beyond the viewport, keeping detail present on long pages.
        const y = ((offset + 340) % span + span) % span - 340;
        inlay.style.setProperty("--inlay-y", `${y}px`);
      });
    };
    const scheduleDepth = () => {
      if (scrollFrame === null) scrollFrame = requestAnimationFrame(updateDepth);
    };
    window.addEventListener("scroll", scheduleDepth, { passive: true });
    window.addEventListener("resize", scheduleDepth, { passive: true });
    motion.addEventListener("change", scheduleDepth);
    updateDepth();

    const HEX = 50;
    const REVEAL = 280;
    const ORANGE_RADIUS = 115;
    const TRAIL_LIFE = 720;

    let width = 0;
    let height = 0;
    let dpr = 1;

    let targetX = -9999;
    let targetY = -9999;

    let mouseX = -9999;
    let mouseY = -9999;

    let active = false;
    let animationFrame: number | null = null;
    let lastTrailTime = 0;
    let previousFrame = 0;
    const trail: TrailPoint[] = [];

    /* =========================
       Canvas resize
    ========================= */
    function resizeCanvas() {
      if (!root || !canvas || !ctx) return;
      const rect = root.getBoundingClientRect();

      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* =========================
       Smooth interpolation
    ========================= */
    function smooth(t: number) {
      t = Math.max(0, Math.min(1, t));
      return t * t * (3 - 2 * t);
    }

    /* =========================
       Draw hexagon
    ========================= */
    function drawHexagon(x: number, y: number, radius: number) {
      if (!ctx) return;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
    }

    /* =========================
       Calculate influence
    ========================= */
    function getFieldStrength(x: number, y: number, now: number) {
      let grayStrength = 0;
      let orangeStrength = 0;

      /* 当前鼠标位置 */
      if (active) {
        const distance = Math.hypot(x - mouseX, y - mouseY);
        grayStrength = smooth(1 - distance / REVEAL);
        orangeStrength = smooth(1 - distance / ORANGE_RADIUS);
      }

      /* 鼠标轨迹残影 */
      for (const point of trail) {
        const age = now - point.time;
        if (age >= TRAIL_LIFE) continue;

        const fade = 1 - age / TRAIL_LIFE;
        const distance = Math.hypot(x - point.x, y - point.y);
        const trailStrength = smooth(1 - distance / (REVEAL * 0.78)) * fade * 0.48;

        grayStrength = Math.max(grayStrength, trailStrength);
      }

      return {
        gray: Math.min(1, grayStrength),
        orange: Math.min(1, orangeStrength)
      };
    }

    /* =========================
       Draw entire grid
    ========================= */
    function draw(now: number = performance.now()) {
      if (!ctx) return;
      animationFrame = null;
      if (document.hidden || motion.matches || !pointer.matches) return;
      const elapsed = previousFrame ? Math.min(now - previousFrame, 48) : 16.7;
      previousFrame = now;
      ctx.clearRect(0, 0, width, height);

      /* 鼠标延迟跟随: 越小越“粘”, 0.18 比较自然 */
      if (active) {
        const follow = 1 - Math.exp(-elapsed / 90);
        mouseX += (targetX - mouseX) * follow;
        mouseY += (targetY - mouseY) * follow;
      }

      /* 删除过期轨迹 */
      while (trail.length && now - trail[0].time > TRAIL_LIFE) {
        trail.shift();
      }

      /* 六边形网格间距 */
      const stepX = HEX * 1.5;
      const stepY = Math.sqrt(3) * HEX;
      let column = 0;

      for (let x = -HEX; x < width + HEX; x += stepX, column++) {
        const offset = ((column % 2) * stepY) / 2;

        for (let y = -stepY; y < height + stepY; y += stepY) {
          const hexY = y + offset;
          const field = getFieldStrength(x, hexY, now);

          /* 太远的六边形完全不绘制 */
          if (field.gray < 0.012 && field.orange < 0.012) {
            continue;
          }

          drawHexagon(x, hexY, HEX - 1.2);

          /* 鼠标中心附近：使用 IndieClash 橙色 */
          if (field.orange > 0.025) {
            ctx.fillStyle = `rgba(255, 125, 48, ${field.orange * 0.035})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(224, 112, 48, ${field.orange * 0.48 + field.gray * 0.06})`;
            ctx.lineWidth = 0.8 + field.orange * 0.45;
            ctx.shadowColor = `rgba(255, 105, 32, ${field.orange * 0.16})`;
            ctx.shadowBlur = 8 * field.orange;
          } else {
            /* 外围灰色蜂巢 */
            ctx.strokeStyle = `rgba(104, 96, 85, ${field.gray * 0.17})`;
            ctx.lineWidth = 0.7 + field.gray * 0.25;
            ctx.shadowBlur = 0;
          }

          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      /* 需要动画时继续运行 */
      if (
        trail.length ||
        (active && (Math.abs(targetX - mouseX) > 0.2 ||
        Math.abs(targetY - mouseY) > 0.2))
      ) {
        animationFrame = requestAnimationFrame(draw);
      } else {
        animationFrame = null;
        if (!active) ctx.clearRect(0, 0, width, height);
      }
    }

    /* =========================
       Mouse interaction
    ========================= */
    const handlePointerMove = (event: PointerEvent) => {
      /* 手机不触发 hover */
      if (event.pointerType === "touch" || motion.matches || !pointer.matches || document.hidden) return;
      if (!root) return;

      const rect = root.getBoundingClientRect();
      targetX = event.clientX - rect.left;
      targetY = event.clientY - rect.top;

      /* 第一次进入时，防止从屏幕外飞进来 */
      if (!active) {
        mouseX = targetX;
        mouseY = targetY;
      }

      active = true;

      /* 每 40ms 记录一次轨迹 */
      const now = performance.now();
      if (now - lastTrailTime > 40) {
        trail.push({
          x: targetX,
          y: targetY,
          time: now
        });

        /* 控制性能 */
        if (trail.length > 16) {
          trail.shift();
        }

        lastTrailTime = now;
      }

      if (!animationFrame) {
        animationFrame = requestAnimationFrame(draw);
      }
    };

    /* =========================
       Mouse leave
    ========================= */
    const handlePointerLeave = () => {
      if (active) trail.push({ x: mouseX, y: mouseY, time: performance.now() });
      active = false;
      /* 离开以后，继续播放残影消失动画 */
      if (!animationFrame) {
        animationFrame = requestAnimationFrame(draw);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("blur", handlePointerLeave);
    const stop = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      active = false;
      previousFrame = 0;
      trail.length = 0;
      ctx.clearRect(0, 0, width, height);
    };
    document.addEventListener("visibilitychange", stop);
    motion.addEventListener("change", stop);
    pointer.addEventListener("change", stop);

    /* =========================
       Responsive
    ========================= */
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
      if (!animationFrame) {
        animationFrame = requestAnimationFrame(draw);
      }
    });

    resizeObserver.observe(root);
    resizeCanvas();

    return () => {
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", scheduleDepth);
      window.removeEventListener("resize", scheduleDepth);
      motion.removeEventListener("change", scheduleDepth);
      if (animationFrame) cancelAnimationFrame(animationFrame);
      window.removeEventListener("pointermove", handlePointerMove);
      document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("blur", handlePointerLeave);
      document.removeEventListener("visibilitychange", stop);
      motion.removeEventListener("change", stop);
      pointer.removeEventListener("change", stop);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="hero-background fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-0"
    >
      {/* 两个非常淡的环境色块 */}
      <div className="ambient-bg" />

      {/* 很轻的光影层，让纯白不那么平 */}
      <div className="ambient-light" />
      <div className="ambient-lattice" />
      {/* Static amber inlays keep their shape before hydration and on touch screens. */}
      {["upper", "upper-deep"].map(position => <svg key={position} className={`ambient-inlay ambient-inlay-${position}`} viewBox="0 0 300 260" fill="none" focusable="false" aria-hidden="true">
        <path className="ambient-cell ambient-cell-wash" d="M75 43.3H125L150 86.6L125 129.9H75L50 86.6Z" />
        <path className="ambient-cell" d="M150 86.6H200L225 129.9L200 173.2H150L125 129.9Z" />
        <path className="ambient-cell ambient-cell-faint" d="M150 0H200L225 43.3L200 86.6H150L125 43.3Z" />
        <path className="ambient-cell" d="M225 43.3H275L300 86.6L275 129.9H225L200 86.6Z" />
        <path className="ambient-cell ambient-cell-wash" d="M225 129.9H275L300 173.2L275 216.5H225L200 173.2Z" />
        <path className="ambient-cell ambient-cell-faint" d="M75 129.9H125L150 173.2L125 216.5H75L50 173.2Z" />
        <path className="ambient-edge" d="M75 43.3H125L150 86.6" />
        <g className="ambient-node ambient-node-breathe"><circle cx="125" cy="43.3" r="8" className="ambient-node-halo" /><circle cx="125" cy="43.3" r="2.1" /></g>
        <g className="ambient-node"><circle cx="225" cy="129.9" r="6" className="ambient-node-halo" /><circle cx="225" cy="129.9" r="1.6" /></g>
        <circle className="ambient-node ambient-node-muted" cx="75" cy="129.9" r="1.4" />
        <circle className="ambient-node ambient-node-muted" cx="200" cy="0" r="1.3" />
      </svg>)}
      {["lower", "lower-deep"].map(position => <svg key={position} className={`ambient-inlay ambient-inlay-${position}`} viewBox="0 0 300 260" fill="none" focusable="false" aria-hidden="true">
        <path className="ambient-cell" d="M75 43.3H125L150 86.6L125 129.9H75L50 86.6Z" />
        <path className="ambient-cell ambient-cell-wash" d="M75 129.9H125L150 173.2L125 216.5H75L50 173.2Z" />
        <path className="ambient-cell ambient-cell-faint" d="M0 86.6H50L75 129.9L50 173.2H0L-25 129.9Z" />
        <path className="ambient-cell ambient-cell-wash" d="M0 0H50L75 43.3L50 86.6H0L-25 43.3Z" />
        <path className="ambient-cell" d="M150 86.6H200L225 129.9L200 173.2H150L125 129.9Z" />
        <path className="ambient-cell ambient-cell-faint" d="M150 0H200L225 43.3L200 86.6H150L125 43.3Z" />
        <path className="ambient-edge" d="M50 173.2L75 216.5H125" />
        <g className="ambient-node ambient-node-breathe"><circle cx="75" cy="216.5" r="8" className="ambient-node-halo" /><circle cx="75" cy="216.5" r="1.9" /></g>
        <circle className="ambient-node" cx="150" cy="86.6" r="1.6" />
        <circle className="ambient-node ambient-node-muted" cx="50" cy="86.6" r="1.3" />
        <circle className="ambient-node ambient-node-muted" cx="125" cy="129.9" r="1.4" />
      </svg>)}
      <div className="ambient-grain" />

      {/* 蜂巢 Canvas */}
      <canvas
        ref={canvasRef}
        id="honeycomb-canvas"
        aria-hidden="true"
      />
    </div>
  );
}

export default React.memo(InteractiveGrid);
