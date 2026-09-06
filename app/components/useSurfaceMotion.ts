"use client";

import { useLayoutEffect, type RefObject } from "react";
import { gsap } from "gsap";

export default function useSurfaceMotion(open: boolean, ref: RefObject<HTMLElement | null>, items?: string) {
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const targets = items ? ref.current!.querySelectorAll(items) : ref.current;
      gsap.fromTo(targets, { y: items ? 12 : 16, opacity: 0, ...(items ? {} : { scale: 0.975 }) }, {
        y: 0, opacity: 1, scale: 1, duration: 0.32, stagger: items ? 0.045 : 0,
        ease: "power3.out", clearProps: "transform,opacity", overwrite: "auto",
      });
    });
    return () => media.revert();
  }, [open, ref, items]);
}
