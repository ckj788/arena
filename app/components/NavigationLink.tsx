"use client";

import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useState, type ComponentProps } from "react";

function NavigationFeedback({ href }: { href: ComponentProps<typeof Link>["href"] }) {
  const { pending } = useLinkStatus();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(pending), pending ? 10_000 : 0);
    return () => clearTimeout(timer);
  }, [pending]);
  if (!pending || typeof document === "undefined") return null;
  return createPortal(
    <div role="status" className="navigation-feedback" aria-live="polite">
      <div className="navigation-progress" aria-hidden="true" />
      <span className="navigation-label">{slow ? <>Taking longer than expected. {typeof href === "string" && <a className="pointer-events-auto underline" href={href}>Open directly</a>}</> : "Opening page…"}</span>
    </div>,
    document.body,
  );
}

/** Keep native link semantics and let Next own prefetching and navigation. */
export default function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<NavigationFeedback href={props.href} /></Link>;
}
