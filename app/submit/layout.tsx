"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { useSubmissionAccess } from "@/app/components/SubmissionAccess";
import Link from "@/app/components/NavigationLink";
import SubmissionLoading from "./SubmissionLoading";

function SubmissionGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const query = useSearchParams();
  const { status, requestSubmission } = useSubmissionAccess();
  // Receipts have their own private-order authentication screen.
  if (path === "/submit" || path === "/submit/result" || status === "signed-in") return children;
  if (status === "checking") return <SubmissionLoading />;
  return <main className="arena-app launch-page flex min-h-screen items-center justify-center px-5">
    <div className="payment-result w-full text-center" role="status">
      <h1>Sign in to start your launch.</h1>
      <p>Choose a plan and tell us about your product after signing in.</p>
        <button type="button" className="exhibition-button mt-6" onClick={() => void requestSubmission(`${path}${query.size ? `?${query}` : ""}`)}>Sign in to continue →</button>
        <p><Link href="/" className="submission-back-link">Back to Discover</Link></p>
    </div>
  </main>;
}

export default function SubmissionLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SubmissionLoading />}><SubmissionGate>{children}</SubmissionGate></Suspense>;
}
