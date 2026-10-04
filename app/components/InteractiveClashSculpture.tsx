"use client";

import { useCallback, useId, useRef, type ReactNode } from "react";
import { createClashSculptureRenderer } from "../../lib/clash-sculpture-renderer";

const fullTurn = Math.PI * 2;
const nearestTurn = (angle: number) => ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;

export default function InteractiveClashSculpture({ children }: { children: ReactNode }) {
  const resetRef = useRef<() => void>(() => {});
  const helpId = useId();

  // Bind the renderer to the actual mounted surface, including node replacements.
  const attachSurface = useCallback((mountedSurface: HTMLDivElement | null) => {
    if (!mountedSurface) return;
    const surface = mountedSurface;
    const canvas = surface.querySelector("canvas")!;
    let renderer = createClashSculptureRenderer(canvas);
    if (!renderer) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = surface.clientWidth;
    let ratio = Math.min(window.devicePixelRatio, 2);
    canvas.width = canvas.height = Math.round(width * ratio);
    let frame = 0;
    let lastTime = 0;
    let elapsed = 0;
    let visible = false;
    let dragging = false;
    let pointerId: number | null = null;
    let pointerX = 0;
    let pointerY = 0;
    let pointerTime = 0;
    let pitch = -.04;
    let yaw = -.18;
    let targetPitch = -.04;
    let targetYaw = -.18;
    let hoverX = 0;
    let hoverY = 0;
    let velocityX = 0;
    let velocityY = 0;
    let returning = false;
    let contextAvailable = true;

    function draw(time: number) {
      frame = 0;
      if (!contextAvailable) return;
      const dt = lastTime ? Math.min((time - lastTime) / 1000, .04) : 1 / 60;
      lastTime = time;
      if (!motion.matches && !dragging) elapsed += dt;
      if (!dragging && !returning) {
        targetYaw += (velocityX + (motion.matches ? 0 : .24)) * dt;
        targetPitch += velocityY * dt;
        const friction = Math.exp(-5 * dt);
        velocityX *= friction;
        velocityY *= friction;
      }
      const smoothing = motion.matches ? 1 : 1 - Math.exp(-12 * dt);
      pitch += (targetPitch + hoverY - pitch) * smoothing;
      yaw += (targetYaw + hoverX - yaw) * smoothing;
      const settled = Math.abs(targetPitch + hoverY - pitch) + Math.abs(targetYaw + hoverX - yaw) < .001;
      if (returning && settled) returning = false;
      const breath = motion.matches || dragging ? 0 : Math.sin(elapsed * .65) * .028;
      renderer!.draw(pitch + breath, yaw, breath * .35, -19 + Math.sin(elapsed * 1.2) * 7);
      surface.dataset.ready = "true";
      if (visible && !document.hidden && (!motion.matches || dragging || !settled)) frame = requestAnimationFrame(draw);
    }

    function wake() {
      if (!frame && contextAvailable && visible && !document.hidden) { lastTime = 0; frame = requestAnimationFrame(draw); }
    }
    function stop() { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
    function reset() {
      yaw = nearestTurn(yaw);
      pitch = nearestTurn(pitch);
      targetYaw = -.18;
      targetPitch = -.04;
      hoverX = hoverY = velocityX = velocityY = 0;
      returning = true;
      wake();
    }
    resetRef.current = reset;
    function down(event: PointerEvent) {
      if (!event.isPrimary || event.button !== 0) return;
      dragging = true;
      returning = false;
      pointerId = event.pointerId;
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerTime = event.timeStamp;
      velocityX = velocityY = hoverX = hoverY = 0;
      surface.dataset.dragging = "true";
      surface.setPointerCapture(event.pointerId);
      wake();
    }
    function move(event: PointerEvent) {
      if (dragging && event.pointerId === pointerId) {
        const dx = (event.clientX - pointerX) * fullTurn / width;
        const dy = -(event.clientY - pointerY) * fullTurn / width;
        const dt = Math.max((event.timeStamp - pointerTime) / 1000, .008);
        targetYaw += dx;
        targetPitch += dy;
        velocityX = Math.max(-3, Math.min(3, dx / dt));
        velocityY = Math.max(-2, Math.min(2, dy / dt));
        pointerX = event.clientX;
        pointerY = event.clientY;
        pointerTime = event.timeStamp;
      } else if (!dragging && event.pointerType === "mouse") {
        const rect = surface.getBoundingClientRect();
        hoverX = ((event.clientX - rect.left) / rect.width - .5) * .3;
        hoverY = -((event.clientY - rect.top) / rect.height - .5) * .2;
      }
      wake();
    }
    function release(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
      surface.dataset.dragging = "false";
      if (event.type === "pointercancel" || event.timeStamp - pointerTime > 90 || motion.matches) velocityX = velocityY = 0;
      wake();
    }
    function leave() { hoverX = hoverY = 0; wake(); }
    function key(event: KeyboardEvent) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "Escape"].includes(event.key)) {
        event.preventDefault();
        velocityX = velocityY = 0;
        if (event.key === "Home" || event.key === "Escape") reset();
        else {
          returning = false;
          if (event.key === "ArrowLeft") targetYaw -= .3;
          if (event.key === "ArrowRight") targetYaw += .3;
          if (event.key === "ArrowUp") targetPitch += .3;
          if (event.key === "ArrowDown") targetPitch -= .3;
          wake();
        }
      }
    }
    function visibility() { if (document.hidden) stop(); else wake(); }
    function contextLost(event: Event) {
      event.preventDefault();
      contextAvailable = false;
      stop();
      delete surface.dataset.ready;
    }
    function contextRestored() {
      // Rebind GPU resources after the browser restores this canvas context.
      renderer!.dispose();
      const restored = createClashSculptureRenderer(canvas);
      if (restored) { renderer = restored; contextAvailable = true; draw(performance.now()); wake(); }
    }
    const resize = new ResizeObserver(entries => {
      const nextWidth = entries[0].contentRect.width;
      const nextRatio = Math.min(window.devicePixelRatio, 2);
      if (width === nextWidth && ratio === nextRatio) return;
      width = nextWidth;
      ratio = nextRatio;
      canvas.width = canvas.height = Math.round(width * ratio);
      // Resizing clears the bitmap. Render it again before presenting the new size.
      stop();
      draw(performance.now());
      wake();
    });
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake(); else stop();
    });
    resize.observe(surface);
    intersection.observe(surface);
    surface.addEventListener("pointerdown", down);
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerup", release);
    surface.addEventListener("pointercancel", release);
    surface.addEventListener("lostpointercapture", release);
    surface.addEventListener("pointerleave", leave);
    surface.addEventListener("dblclick", reset);
    surface.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", wake);
    canvas.addEventListener("webglcontextlost", contextLost);
    canvas.addEventListener("webglcontextrestored", contextRestored);
    draw(performance.now());
    return () => {
      stop();
      resize.disconnect();
      intersection.disconnect();
      surface.removeEventListener("pointerdown", down);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", release);
      surface.removeEventListener("pointercancel", release);
      surface.removeEventListener("lostpointercapture", release);
      surface.removeEventListener("pointerleave", leave);
      surface.removeEventListener("dblclick", reset);
      surface.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", wake);
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      renderer!.dispose();
      delete surface.dataset.ready;
    };
  }, []);

  return <>
    <div ref={attachSurface} className="sculpture-interaction" tabIndex={0} role="img" aria-label="Interactive Indie Clash sculpture" aria-describedby={helpId}>
      <div key="preview" className="sculpture-preview">{children}</div>
      <canvas key="renderer" aria-hidden="true" />
    </div>
    <div className="sculpture-caption sculpture-controls">
      <span id={helpId}>DRAG TO ROTATE <span aria-hidden="true">↔</span><span className="sr-only">. Use arrow keys to rotate. Press Home to reset. Double-click to reset.</span></span>
      <button type="button" onClick={() => resetRef.current()} aria-label="Reset sculpture rotation">Reset <span aria-hidden="true">↗</span></button>
    </div>
  </>;
}
