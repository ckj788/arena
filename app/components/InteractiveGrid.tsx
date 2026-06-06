import React, { useEffect, useRef } from "react";

interface Wave {
  phase: number;
  offsetY: number;
  amplitude: number;
  frequency: number;
  speed: number;
  color: string;
  lineWidth: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  speed: number;
}

export default function InteractiveGrid() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let sparks: Spark[] = [];
    let waves: Wave[] = [];

    const initCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const heightVal = rect.height;

      // Overlapping soft organic ribbons with beautiful breathing color hues
      waves = [
        {
          phase: 0,
          offsetY: heightVal * 0.32,
          amplitude: 85,
          frequency: 0.0018,
          speed: 0.003,
          color: "rgba(6, 182, 212, 0.11)", // elegant cyan silk
          lineWidth: 1.8
        },
        {
          phase: Math.PI * 0.45,
          offsetY: heightVal * 0.46,
          amplitude: 110,
          frequency: 0.0014,
          speed: -0.0025,
          color: "rgba(139, 92, 246, 0.09)", // elegant royal violet silk
          lineWidth: 2.2
        },
        {
          phase: Math.PI * 0.9,
          offsetY: heightVal * 0.58,
          amplitude: 80,
          frequency: 0.0022,
          speed: 0.004,
          color: "rgba(236, 72, 153, 0.07)", // vibrant pink/fuchsia satin
          lineWidth: 1.4
        },
        {
          phase: Math.PI * 1.35,
          offsetY: heightVal * 0.68,
          amplitude: 120,
          frequency: 0.0011,
          speed: -0.0018,
          color: "rgba(16, 185, 129, 0.08)", // emerald deep green satin
          lineWidth: 2.0
        }
      ];

      // Pure micro star bokeh particles drifting peacefully
      sparks = [];
      const colors = ["#22D3EE", "#A78BFA", "#F472B6", "#34D399"];
      const totalSparks = 28;
      for (let i = 0; i < totalSparks; i++) {
        sparks.push({
          x: Math.random() * rect.width,
          y: Math.random() * rect.height,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12,
          size: Math.random() * 1.8 + 0.6,
          alpha: Math.random() * 0.35 + 0.15,
          color: colors[Math.floor(Math.random() * colors.length)],
          speed: Math.random() * 0.015 + 0.005
        });
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      initCanvas();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }

    initCanvas();

    // Smooth linear interpolation variables to create perfect fluid tracking
    let currentMouseX = -1000;
    let currentMouseY = -1000;
    let globalTime = 0;

    const draw = () => {
      globalTime += 0.0025;
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Interpolate mouse movement to prevent any jittering
      if (mouseRef.current.active) {
        if (currentMouseX === -1000) {
          currentMouseX = mouseRef.current.x;
          currentMouseY = mouseRef.current.y;
        } else {
          currentMouseX += (mouseRef.current.x - currentMouseX) * 0.07;
          currentMouseY += (mouseRef.current.y - currentMouseY) * 0.07;
        }
      } else {
        // Slow fallback off-screen float when mouse leaves, avoiding sudden jumps
        currentMouseX += (-1000 - currentMouseX) * 0.03;
        currentMouseY += (-1000 - currentMouseY) * 0.03;
      }

      // 1. ADVANCED DYNAMIC FLUID ORGANIC BREATHING RIBBONS
      waves.forEach((wave, idx) => {
        // Move the phase of the ribbon
        wave.phase += wave.speed;

        // Slow, elegant mathematical breathing amplitude & offset oscillations (creates genuine organic float)
        const breathingOffsetY = Math.sin(globalTime * 1.8 + idx * 1.7) * 25;
        const breathingAmplitude = wave.amplitude + Math.cos(globalTime * 1.2 + idx * 2.1) * 20;

        ctx.beginPath();
        ctx.lineWidth = wave.lineWidth;
        ctx.strokeStyle = wave.color;

        const step = 8;
        for (let x = 0; x <= rect.width; x += step) {
          // Combination of base frequency and organic micro sub-harmonics
          let waveY = wave.offsetY + breathingOffsetY + Math.sin(x * wave.frequency + wave.phase) * breathingAmplitude;
          
          // Secondary slow wave ripple
          waveY += Math.cos(x * 0.008 + wave.phase * 1.3) * 18;

          if (x === 0) {
            ctx.moveTo(x, waveY);
          } else {
            ctx.lineTo(x, waveY);
          }
        }
        ctx.stroke();

        // Premium translucent ambient light valley gradient cascade
        ctx.save();
        ctx.lineTo(rect.width, rect.height);
        ctx.lineTo(0, rect.height);
        ctx.closePath();
        
        const gradientFill = ctx.createLinearGradient(0, wave.offsetY - 150, 0, rect.height);
        // Generates pristine ambient twilight depth without distracting colors
        gradientFill.addColorStop(0, wave.color.replace("0.11", "0.015").replace("0.09", "0.01").replace("0.07", "0.006").replace("0.08", "0.01"));
        gradientFill.addColorStop(1, "rgba(0, 0, 0, 0)");
        
        ctx.fillStyle = gradientFill;
        ctx.fill();
        ctx.restore();
      });

      // 2. STRENGTHENED LUXURIOUS MOUSE LIGHTING AURA (Pure ambient glow)
      if (mouseRef.current.active && currentMouseX !== -1000) {
        const hoverRadius = 380; // Larger, more glorious light field
        const auraGrad = ctx.createRadialGradient(
          currentMouseX, currentMouseY, 0,
          currentMouseX, currentMouseY, hoverRadius
        );
        // Vivid but masterfully soft premium twilight tones
        auraGrad.addColorStop(0, "rgba(99, 102, 241, 0.16)");      // Bright indigo glow center
        auraGrad.addColorStop(0.3, "rgba(6, 182, 212, 0.08)");     // Vivid cyan middle halo
        auraGrad.addColorStop(0.65, "rgba(236, 72, 153, 0.02)");   // Whispering pink margin
        auraGrad.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(currentMouseX, currentMouseY, hoverRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ambient static depth lighting peaks (Left-top cyan highlight, right-bottom lavender highlight)
      const peakGradL = ctx.createRadialGradient(
        rect.width * 0.2, rect.height * 0.15, 0,
        rect.width * 0.2, rect.height * 0.15, 600
      );
      peakGradL.addColorStop(0, "rgba(6, 182, 212, 0.045)");
      peakGradL.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = peakGradL;
      ctx.beginPath();
      ctx.arc(rect.width * 0.2, rect.height * 0.15, 600, 0, Math.PI * 2);
      ctx.fill();

      // 3. SOFTEST CELESTIAL BOKEH STARS
      sparks.forEach((s) => {
        s.x += s.vx;
        s.y += s.vy;

        // Loop boundaries gently
        if (s.x < 0) s.x = rect.width;
        if (s.x > rect.width) s.x = 0;
        if (s.y < 0) s.y = rect.height;
        if (s.y > rect.height) s.y = 0;

        // Twinkle factor using graceful slow sinusoids
        const twinkle = Math.sin(globalTime * 8 + s.x) * 0.25 + 0.75;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.globalAlpha = s.alpha * twinkle;
        ctx.fill();
      });

      ctx.globalAlpha = 1.0;
      animationId = requestAnimationFrame(draw);
    };

    draw();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
      mouseRef.current.active = true;
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-0" style={{ willChange: "transform" }}>
      <canvas
        ref={canvasRef}
        id="indieclash-bg-canvas"
        className="absolute inset-0 w-full h-full pointer-events-none mix-blend-screen opacity-[0.95]"
      />
    </div>
  );
}
