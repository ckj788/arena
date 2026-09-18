"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { gsap } from "gsap";

/** First-paint hero motion belongs to CSS; GSAP only reveals unseen sections. */
export default function useHomeMotion(enabled: boolean, root: RefObject<HTMLElement | null>, page = "discover") {
  const completed = useRef(new Set<string>());

  useLayoutEffect(() => {
    if (!enabled || !root.current) return;
    const media = gsap.matchMedia(root);
    media.add("(prefers-reduced-motion: no-preference)", (context) => {
      if (typeof IntersectionObserver === "undefined") return;
      const host = root.current!;
      const compact = window.matchMedia("(max-width: 767px)").matches;
      const distance = compact ? 16 : 24;
      const running = new Map<HTMLElement, gsap.core.Timeline>();
      // Interaction takes precedence over the decorative entrance.
      const finishOnInteraction = (event: Event) => {
        if (!(event.target instanceof Node)) return;
        // First-paint CSS and later GSAP motion share the same interaction rule.
        if (event.target instanceof Element) {
          event.target.closest<HTMLElement>("[data-route-enter]")?.getAnimations().forEach(animation => animation.finish());
        }
        for (const [element, animation] of running) {
          if (element.contains(event.target)) animation.progress(1);
        }
      };
      host.addEventListener("pointerdown", finishOnInteraction, true);
      host.addEventListener("focusin", finishOnInteraction, true);
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          const key = element.dataset.homeReveal!;
          observer.unobserve(element);
          if (completed.current.has(key)) continue;
          // Observer callbacks run later; register their tweens for cleanup too.
          context.add(() => {
            const animation = gsap.timeline({
              defaults: { duration: 0.8, ease: "power3.out", clearProps: "opacity,transform,willChange" },
              onComplete: () => { completed.current.add(key); running.delete(element); },
            });
            running.set(element, animation);
            if (key === "discovery") {
              // Leave the deck wrapper alone: its independent Next animation
              // must not compete with these card entrances.
              animation.to(element.firstElementChild, { opacity: 1, x: 0 }, 0);
              animation.to(element.querySelectorAll("[data-discovery-card]"),
                { opacity: 1, x: 0, y: 0, stagger: 0.055 }, 0.05);
            } else if (key === "how-steps") {
              animation.to(element.children, { opacity: 1, x: 0, y: 0, stagger: 0.065 });
            } else {
              animation.to(element, { opacity: 1, x: 0, y: 0 }, key.startsWith("champion-") ? parseFloat(element.style.getPropertyValue("--route-delay")) / 1000 : 0);
            }
          });
        }
      }, { threshold: 0, rootMargin: "0px 0px 80px 0px" });
      host.querySelectorAll<HTMLElement>("[data-home-reveal]").forEach((element) => {
        const key = element.dataset.homeReveal!;
        if (completed.current.has(key)) return;
        // Never re-hide SSR content the user can already see, including restored scroll.
        if (element.getBoundingClientRect().top < window.innerHeight) {
          completed.current.add(key);
          return;
        }
        const start = { opacity: 0, willChange: "transform,opacity" };
        if (key === "discovery") {
          gsap.set(element.firstElementChild, { ...start, x: -distance });
          gsap.set(element.querySelectorAll("[data-discovery-card]"), {
            ...start, x: (index: number) => (index % 2 === 0 ? -1 : 1) * (compact ? 12 : 20), y: 12,
          });
        } else if (key === "how-steps") {
          gsap.set(element.children, { ...start, animation: "none", x: compact ? 12 : 20, y: 10 });
        } else {
          const direction = element.dataset.routeEnter;
          gsap.set(element, { ...start, ...(direction ? { animation: "none" } : {}),
            x: direction === "up" ? 0 : (direction === "left" || key.endsWith("heading") ? -1 : 1) * distance, y: 14 });
        }
        observer.observe(element);
      });
      return () => {
        observer?.disconnect();
        host.removeEventListener("pointerdown", finishOnInteraction, true);
        host.removeEventListener("focusin", finishOnInteraction, true);
        running.clear();
      };
    });
    return () => media.revert();
  }, [enabled, root, page]);
}
