const sectionClass = "mt-12 scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8";
const paragraphClass = "mt-3 text-sm leading-7 text-zinc-600";

export default function LaunchGuideSections() {
  return <>
    <section id="free-directories" className={sectionClass} aria-labelledby="free-heading">
      <h2 id="free-heading" className="text-2xl font-semibold">Free startup directories: what does free include?</h2>
      <p className={paragraphClass}>For a first launch with no budget, compare the cost of submission with the time and conditions attached. Product Hunt and Indie Clash offer free submission. Other free options may involve a review backlog, a reciprocal link or requirements to keep a listing published.</p>
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <div><h3 className="font-semibold">Plan for the queue</h3><p className={paragraphClass}>PitchWall lists a minimum 30-day wait for its free launch. AlternativeTo says ordinary review can take months. These can complement a launch plan, but are poor choices for a fixed deadline unless the platform confirms timing.</p></div>
        <div><h3 className="font-semibold">Check the conditions</h3><p className={paragraphClass}>Fazier requires a backlink for its free submission. Uneed ties continued publication and free-tier dofollow links to upvote scores. Confirm that these requirements suit your product before spending time preparing a listing.</p></div>
        <div><h3 className="font-semibold">Separate listing from promotion</h3><p className={paragraphClass}>A free product page does not necessarily include homepage featuring, newsletter coverage or a chosen launch date. Pay only when the specific placement or faster review is useful to you; the purchase alone does not establish audience fit.</p></div>
      </div>
      <p className="mt-5 text-xs leading-6 text-zinc-500">Current platform policies and official sources are linked in each comparison entry above.</p>
    </section>
    <section id="product-hunt-alternatives" className={sectionClass} aria-labelledby="alternatives-heading">
      <h2 id="alternatives-heading" className="text-2xl font-semibold">Product Hunt alternatives for indie makers</h2>
      <p className={paragraphClass}>Product Hunt suits a prepared, scheduled launch with a maker available to answer questions. Choose additional platforms by what you need after launch day. A software directory, a launch platform and a technical discussion community serve different purposes.</p>
      <dl className="mt-6 divide-y divide-zinc-100">
        {[
          ["Ongoing product discovery", "Indie Clash provides a public product profile, discovery and optional Arena feedback. Use it alongside a Product Hunt launch when you want visitors to keep exploring your product afterward."],
          ["Technical conversations", "Show HN fits a working project you built and can explain. Peerlist is another builder-focused option. Prepare a demo and a specific question; participating in replies is part of the work."],
          ["Software comparison", "AlternativeTo and SaaSHub suit released software with clear competing products. Explain what your app replaces and where it differs. Review their eligibility rules before preparing a submission."],
          ["Another launch audience", "Uneed, PitchWall and Microlaunch offer different discovery and promotion formats. Compare wait times and paid benefits with the time you can spend supporting another launch."],
        ].map(([heading, body]) => <div key={heading} className="grid gap-2 py-5 md:grid-cols-[220px_1fr]"><dt className="font-semibold">{heading}</dt><dd className="text-sm leading-7 text-zinc-600">{body}</dd></div>)}
      </dl>
    </section>
    <section id="launch-by-stage" className={sectionClass} aria-labelledby="stage-heading">
      <h2 id="stage-heading" className="text-2xl font-semibold">Where to launch a startup at each stage</h2>
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <div><h3 className="font-semibold">Before public release</h3><p className={paragraphClass}>Check BetaList for early-stage eligibility and PitchWall for alpha or beta products with a real product presence. A waitlist alone is not suitable for Show HN, SaaSHub or AlternativeTo. Have an honest description of what is usable today.</p></div>
        <div><h3 className="font-semibold">A working SaaS or developer tool</h3><p className={paragraphClass}>Prepare screenshots and a task a visitor can complete. Consider Product Hunt for a scheduled launch, Peerlist or Show HN for builder discussion, and software directories once you can explain the alternatives. Choose the audience that understands the problem.</p></div>
        <div><h3 className="font-semibold">An AI product with a clear use case</h3><p className={paragraphClass}>PitchWall explicitly welcomes AI products. Broader launch platforms may also fit, but show the workflow and result rather than relying on a model name. AlternativeTo excludes many thin AI wrappers, so an AI label alone does not establish eligibility.</p></div>
      </div>
    </section>
    <section id="launch-faq" className="mt-12 scroll-mt-24" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="text-2xl font-semibold">Startup submission questions</h2>
      <div className="mt-5 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white px-6">
        {[
          ["What should I prepare before submitting a startup?", "Prepare a working website, one-sentence value proposition, logo, genuine product screenshots, pricing, supported platforms and a maker contact. For software directories, also identify real competitors. Check image and text requirements in each submission form."],
          ["Should I launch on several platforms at once?", "You can use more than one platform, but stagger launches if you cannot answer questions everywhere. Start with an audience that fits, improve your explanation using feedback, then adapt the listing for the next community."],
          ["Are paid startup directory submissions worth it?", "Evaluate the actual deliverable: quicker review, a scheduled date, a newsletter placement or a defined advertising slot. Ask how your audience matches theirs and what evidence supports the offer. Paying for review is not the same as paying for acceptance."],
          ["Do startup directory backlinks guarantee SEO results?", "No. A listed URL, dofollow claim or third-party domain rating does not guarantee that Google will index or rank your page. Treat relevant referral visitors and useful feedback as practical benefits, and assess actual published links separately."],
          ["How should I choose between a directory and a launch community?", "Choose a directory when people need to compare your product with existing software. Choose a community when you want a conversation about a usable project. A launch platform can add a scheduled discovery moment. These channels can complement each other."],
        ].map(([question, answer]) => <details key={question} className="py-1"><summary className="cursor-pointer py-4 text-sm font-semibold">{question}</summary><p className="pb-5 text-sm leading-7 text-zinc-600">{answer}</p></details>)}
      </div>
    </section>
  </>;
}
