"use client";

import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import type { ComponentProps } from "react";

function NavigationFeedback() {
  const { pending } = useLinkStatus();
  if (!pending || typeof document === "undefined") return null;
  return createPortal(
    <div role="status" className="navigation-feedback" aria-live="polite">
      <div className="navigation-progress" aria-hidden="true" />
      <span className="navigation-label">Opening page…</span>
    </div>,
    document.body,
  );
}

/** Keep native link semantics and let Next own prefetching and navigation. */
export default function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<NavigationFeedback /></Link>;
}
