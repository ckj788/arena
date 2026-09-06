"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { gsap } from "gsap";

/** Visible HTML is the fallback; only animate a module when it enters view. */
export default function useHomeMotion(enabled: boolean, root: RefObject<HTMLElement | null>) {
  const completed = useRef(new Set<string>());

  useLayoutEffect(() => {
    if (!enabled || !root.current) return;
    const media = gsap.matchMedia(root);
    media.add("(prefers-reduced-motion: no-preference)", (context) => {
      const host = root.current!;
      const compact = window.matchMedia("(max-width: 767px)").matches;
      const distance = compact ? 22 : 52;
      const running = new Map<HTMLElement, gsap.core.Timeline>();
      // Interaction takes precedence over the decorative entrance.
      const finishOnInteraction = (event: Event) => {
        if (!(event.target instanceof Node)) return;
        for (const [element, animation] of running) {
          if (element.contains(event.target)) animation.progress(1);
        }
      };
      host.addEventListener("pointerdown", finishOnInteraction, true);
      host.addEventListener("focusin", finishOnInteraction, true);
      if (!completed.current.has("hero")) {
        if (window.scrollY > 100 || window.location.hash) {
          completed.current.add("hero");
        } else {
          gsap.fromTo(host.querySelectorAll(".hero-badge, .hero-title, .hero-desc, .hero-stats"),
            { opacity: 0, y: compact ? 24 : 40 },
            {
              opacity: 1, y: 0, duration: 1.15, stagger: 0.14, ease: "power2.out",
              clearProps: "opacity,transform",
              // Strict Mode can clean up an unfinished entrance: let it restart.
              onComplete: () => { completed.current.add("hero"); },
            });
        }
      }

      const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          const key = element.dataset.homeReveal!;
          observer?.unobserve(element);
          if (completed.current.has(key)) continue;
          // Do not hide content above an anchor / restored scroll position.
          if (entry.boundingClientRect.top < 0) {
            completed.current.add(key);
            continue;
          }
          // Observer callbacks run later; register their tweens for cleanup too.
          context.add(() => {
            const animation = gsap.timeline({
              defaults: { duration: 1.05, ease: "power2.out", clearProps: "opacity,transform" },
              onComplete: () => { completed.current.add(key); running.delete(element); },
            });
            running.set(element, animation);
            if (key === "discovery") {
              // Leave the deck wrapper alone: its independent Next animation
              // must not compete with these card entrances.
              animation.fromTo(element.firstElementChild, { opacity: 0, x: -distance }, { opacity: 1, x: 0 }, 0);
              animation.fromTo(element.querySelectorAll("[data-discovery-card]"), {
                opacity: 0,
                x: (index: number) => (index % 2 === 0 ? -1 : 1) * (compact ? 16 : 30),
                y: 18,
                scale: 0.985,
              }, { opacity: 1, x: 0, y: 0, scale: 1, stagger: 0.09 }, 0.12);
            } else if (key === "how-steps") {
              animation.fromTo(element.children, { opacity: 0, x: distance, y: 16 },
                { opacity: 1, x: 0, y: 0, stagger: 0.12 });
            } else {
              const heading = key.endsWith("heading");
              animation.fromTo(element, { opacity: 0, x: heading ? -distance : distance, y: heading ? 0 : 14 },
                { opacity: 1, x: 0, y: 0 });
            }
          });
        }
      }, { threshold: 0, rootMargin: "0px 0px -48px 0px" });
      host.querySelectorAll<HTMLElement>("[data-home-reveal]").forEach((element) => {
        if (!completed.current.has(element.dataset.homeReveal!)) observer?.observe(element);
      });
      return () => {
        observer?.disconnect();
        host.removeEventListener("pointerdown", finishOnInteraction, true);
        host.removeEventListener("focusin", finishOnInteraction, true);
        running.clear();
      };
    });
    return () => media.revert();
  }, [enabled, root]);
}
