import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Indie Clash collects, uses, stores, and protects account and arena data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#fafafa] px-5 py-16 text-zinc-600 antialiased">
      <article className="mx-auto max-w-3xl space-y-8 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs sm:p-10">
        <header className="space-y-3 border-b border-zinc-200/80 pb-6">
          <Link href="/" className="text-xs font-mono font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
            ← Back to Indie Clash
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-950">Privacy Policy</h1>
          <p className="text-sm text-zinc-500">Effective September 3, 2026</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-zinc-950">Information we collect</h2>
          <p>When you sign in with Google or GitHub, we receive your account identifier, email address, public profile name, avatar URL, and authentication provider. We store your account identifier privately to enforce ownership and one-vote rules.</p>
          <p>Product submissions, maker names and handles, votes, and critique text are community content and are displayed publicly. We also receive standard technical data such as request timestamps and service logs from our hosting and database providers.</p>
          <p>To distribute discovery fairly, we count a product impression only after its card has been substantially visible for a short period. A salted one-way hash derived from limited request information is retained with the product and UTC date to prevent repeated views from being counted more than once per day. We do not store the raw IP address in the exposure table.</p>
          <p>When an authenticated maker submits a valid two-sided Arena critique, products owned by that account may receive a temporary seven-day discovery weighting. This affects only Needs More Eyes selection; it never changes Arena queue order or match results.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-zinc-950">How we use data</h2>
          <p>We use data to authenticate members, operate tournament brackets, prevent duplicate or abusive activity, attribute public feedback, maintain security, and improve the service. We do not sell personal information.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-zinc-950">Storage and service providers</h2>
          <p>Authentication, database records, and uploaded product logos are processed by Supabase. The application and operational analytics are hosted by Vercel. Google or GitHub processes the OAuth sign-in you choose under its own privacy terms.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-zinc-950">Retention and your choices</h2>
          <p>We retain public tournament history and critiques so match pages remain useful. Daily exposure deduplication records are deleted after approximately 31 days; aggregate impression counts remain so fair discovery can continue. Security counters are retained only as needed to limit abuse. You may ask for account data access or deletion; public content may be anonymized or retained where needed to preserve tournament integrity or comply with law.</p>
          <p>Do not include secrets, private personal data, or confidential material in a product submission or critique.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-zinc-950">Contact and updates</h2>
          <p>Privacy requests can be sent to <a className="font-medium text-zinc-950 underline hover:text-amber-600" href="mailto:support@maber.xyz">support@maber.xyz</a>. We may update this policy as the service changes and will revise the effective date above.</p>
        </section>
      </article>
    </main>
  );
}
