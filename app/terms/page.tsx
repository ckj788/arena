import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms governing product submissions, voting, critiques, and use of Indie Clash.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#08080a] px-5 py-16 text-zinc-300">
      <article className="mx-auto max-w-3xl space-y-8 rounded-xl border border-white/10 bg-white/[0.02] p-6 sm:p-10">
        <header className="space-y-3 border-b border-white/10 pb-6">
          <Link href="/" className="text-xs font-mono uppercase tracking-widest text-zinc-500 hover:text-white">
            ← Back to Indie Clash
          </Link>
          <h1 className="text-3xl font-semibold text-white">Terms of Use</h1>
          <p className="text-sm text-zinc-500">Effective August 22, 2026</p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Using the service</h2>
          <p>By using Indie Clash, you agree to these terms. You must be legally able to enter this agreement and provide accurate account and submission information. Google or GitHub sign-in may be required for submissions, queue actions, and votes.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Submissions and community content</h2>
          <p>You keep ownership of content you submit. You grant Indie Clash a worldwide, non-exclusive, royalty-free license to host, reproduce, format, and display that content for operating and promoting the service. You confirm that you have the rights needed to submit it.</p>
          <p>Critiques are public. Keep them constructive and focused on the product. Do not submit unlawful, deceptive, infringing, hateful, harassing, malicious, confidential, or personally sensitive content.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Fair participation</h2>
          <p>Do not manipulate votes, create duplicate identities, automate abusive traffic, bypass limits, probe other users&apos; data, or interfere with tournament operation. We may reject, remove, anonymize, or suspend content and accounts to protect users and tournament integrity.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Availability and results</h2>
          <p>The service is provided on an “as is” and “as available” basis. Tournament rankings and community feedback are informational and do not guarantee product quality, commercial success, or uninterrupted availability. To the extent permitted by law, Indie Clash disclaims implied warranties and liability for indirect or consequential loss.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Changes</h2>
          <p>We may change the service or these terms as it evolves. Continued use after an updated effective date means you accept the revised terms. Questions can be sent to <a className="text-white underline" href="mailto:support@maber.xyz">support@maber.xyz</a>.</p>
        </section>
      </article>
    </main>
  );
}
