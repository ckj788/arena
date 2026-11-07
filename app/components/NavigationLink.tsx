"use client";

import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import { useContext, useEffect, useState, type ComponentProps } from "react";
import { SubmissionAccessContext } from "./SubmissionAccess";
import { isSubmissionPath } from "@/lib/browserOAuth";

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
  const access = useContext(SubmissionAccessContext);
  return <Link {...props} onClick={event => {
    props.onClick?.(event);
    if (!event.defaultPrevented && access && typeof props.href === "string" && isSubmissionPath(props.href)
      && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && props.target !== "_blank") {
      event.preventDefault();
      void access.requestSubmission(props.href);
    }
  }}>{children}<NavigationFeedback href={props.href} /></Link>;
}
