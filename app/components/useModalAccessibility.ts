"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import useSurfaceMotion from "./useSurfaceMotion";

const scrollLocks = new Set<HTMLElement>();
let originalOverflow = "";

/** Lock background scrolling, contain keyboard focus, and restore the trigger. */
export default function useModalAccessibility(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useSurfaceMotion(open, dialogRef);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!scrollLocks.size) originalOverflow = document.body.style.overflow;
    scrollLocks.add(dialog);
    document.body.style.overflow = "hidden";
    dialog.focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
      )).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", handleKey, true);
    return () => {
      document.removeEventListener("keydown", handleKey, true);
      scrollLocks.delete(dialog);
      if (!scrollLocks.size) document.body.style.overflow = originalOverflow;
      const remaining = Array.from(scrollLocks).at(-1);
      if (remaining?.isConnected && !remaining.contains(trigger)) remaining.focus({ preventScroll: true });
      else if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open, dialogRef]);
}
