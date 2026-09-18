"use client";

import { useLayoutEffect, type RefObject } from "react";
import { gsap } from "gsap";

export default function useSurfaceMotion(open: boolean, ref: RefObject<HTMLElement | null>, items?: string) {
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const targets = items ? ref.current!.querySelectorAll(items) : ref.current;
      gsap.fromTo(targets, { y: items ? 14 : 18, opacity: 0, willChange: "transform,opacity", ...(items ? {} : { scale: 0.985 }) }, {
        y: 0, opacity: 1, scale: 1, duration: items ? 0.55 : 0.42, stagger: items ? 0.045 : 0,
        ease: "power3.out", clearProps: "transform,opacity,willChange", overwrite: "auto",
      });
    });
    return () => media.revert();
  }, [open, ref, items]);
}
