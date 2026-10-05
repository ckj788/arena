"use client";

import { useCallback, useId, type ReactNode } from "react";
import { createClashSculptureRenderer } from "../../lib/clash-sculpture-renderer";

const fullTurn = Math.PI * 2;
const nearestTurn = (angle: number) => ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;

export default function InteractiveClashSculpture({ children }: { children: ReactNode }) {
  const helpId = useId();

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
    let pitchOffset = 0;
    let yawOffset = 0;
    let targetPitchOffset = 0;
    let targetYawOffset = 0;
    let contextAvailable = true;

    function draw(time: number) {
      frame = 0;
      if (!contextAvailable) return;
      const dt = lastTime ? Math.min((time - lastTime) / 1000, .04) : 1 / 60;
      lastTime = time;
      // The natural orbit keeps its own phase, including while someone drags.
      if (!motion.matches) elapsed += dt;
      const follow = 1 - Math.exp(-(dragging ? 16 : 2.75) * dt);
      pitchOffset += (targetPitchOffset - pitchOffset) * follow;
      yawOffset += (targetYawOffset - yawOffset) * follow;
      const settled = Math.abs(pitchOffset - targetPitchOffset) + Math.abs(yawOffset - targetYawOffset) < .0001;
      if (settled) { pitchOffset = targetPitchOffset; yawOffset = targetYawOffset; }
      const breath = motion.matches ? 0 : Math.sin(elapsed * .72);
      renderer!.draw(
        -.04 + breath * .016 + pitchOffset,
        -.18 + elapsed * .18 + yawOffset,
        breath * .008,
        elapsed,
        motion.matches ? 0 : 1,
      );
      surface.dataset.ready = "true";
      if (visible && !document.hidden && (!motion.matches || dragging || !settled)) frame = requestAnimationFrame(draw);
    }

    function wake() {
      if (!frame && contextAvailable && visible && !document.hidden) { lastTime = 0; frame = requestAnimationFrame(draw); }
    }
    function stop() { cancelAnimationFrame(frame); frame = 0; lastTime = 0; }
    function returnToOrbit() {
      // Remove whole turns first, so any drag direction returns along the shortest path.
      pitchOffset = nearestTurn(pitchOffset);
      yawOffset = nearestTurn(yawOffset);
      targetPitchOffset = targetYawOffset = 0;
      wake();
    }
    function down(event: PointerEvent) {
      if (!event.isPrimary || event.button !== 0) return;
      dragging = true;
      pointerId = event.pointerId;
      pointerX = event.clientX;
      pointerY = event.clientY;
      targetPitchOffset = pitchOffset;
      targetYawOffset = yawOffset;
      surface.dataset.dragging = "true";
      surface.setPointerCapture(event.pointerId);
      wake();
    }
    function move(event: PointerEvent) {
      if (!dragging || event.pointerId !== pointerId) return;
      targetYawOffset += (event.clientX - pointerX) * fullTurn / width;
      targetPitchOffset -= (event.clientY - pointerY) * fullTurn / width;
      pointerX = event.clientX;
      pointerY = event.clientY;
      wake();
    }
    function release(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      dragging = false;
      pointerId = null;
      surface.dataset.dragging = "false";
      returnToOrbit();
    }
    function key(event: KeyboardEvent) {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "ArrowLeft") yawOffset -= .3;
      if (event.key === "ArrowRight") yawOffset += .3;
      if (event.key === "ArrowUp") pitchOffset += .3;
      if (event.key === "ArrowDown") pitchOffset -= .3;
      returnToOrbit();
    }
    function visibility() { if (document.hidden) stop(); else wake(); }
    function contextLost(event: Event) {
      event.preventDefault();
      contextAvailable = false;
      stop();
      delete surface.dataset.ready;
    }
    function contextRestored() {
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
    <span id={helpId} className="sr-only">Drag or use the arrow keys to rotate. Release to return to the natural rotation.</span>
  </>;
}
