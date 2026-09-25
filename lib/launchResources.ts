export const RESOURCE_REVIEWED_AT = "2026-09-24";
export const RESOURCE_PATH = "/resources/startup-launch-directories";

export type LaunchResource = {
  name: string;
  kind: "Launch platform" | "Startup directory" | "Software directory" | "Community";
  cost: "Free" | "Paid" | "Check plans";
  fit: string;
  timing: string;
  listing: string;
  links: string;
  note: string;
  url: string;
  sources: { label: string; url: string }[];
};

// Editorial data, not user submissions. Recheck official sources before updating
// the review date. Unknown policies stay explicit rather than inferred from DR.
export const LAUNCH_RESOURCES: LaunchResource[] = [
  {
    name: "AlternativeTo", kind: "Software directory", cost: "Free",
    fit: "Released software with a clear use case and meaningful alternatives to existing apps.",
    timing: "Normal review can take months. Optional $5 priority review usually takes 1–2 business days, sometimes longer.",
    listing: "Software profile and relevant alternative relationships, if approved.",
    links: "Official website field; link attributes not verified.",
    note: "Verify your email and prepare platforms, licensing, tags and a factual description. Closed betas and coming-soon pages are not accepted. Many thin AI wrappers and simple utilities are also excluded. Priority review does not buy approval.",
    url: "https://alternativeto.net/faq/#add-a-new-application",
    sources: [{ label: "Submission and review FAQ", url: "https://alternativeto.net/faq/" }],
  },
  {
    name: "BetaList", kind: "Startup directory", cost: "Paid",
    fit: "Pre-launch and recently launched internet startups with their own domain.",
    timing: "Editorial review; featuring timeline depends on the selected plan.",
    listing: "Startup listing if accepted.",
    links: "Dofollow advertised in the official FAQ; not independently audited.",
    note: "Budget for a submission: BetaList no longer offers a free option. Its FAQ states that rejected submissions are refunded. Check the price in the submission flow before paying.",
    url: "https://betalist.com/submit",
    sources: [{ label: "Submission FAQ", url: "https://betalist.com/support" }],
  },
  {
    name: "Fazier", kind: "Launch platform", cost: "Free",
    fit: "Makers willing to add a reciprocal badge, or pay for a scheduled launch.",
    timing: "Free submissions are reviewed and listed within 30 days according to the submission page.",
    listing: "Product listing; free homepage featuring is selective.",
    links: "Paid tiers advertise backlink benefits; free link attributes not verified.",
    note: "Free is conditional: a homepage or footer backlink is required. Paid plans remove that requirement and offer scheduling. Check current checkout pricing rather than assuming free means instant.",
    url: "https://fazier.com/submit",
    sources: [{ label: "Submission plans and conditions", url: "https://fazier.com/submit" }],
  },
  {
    name: "Indie Clash", kind: "Launch platform", cost: "Free",
    fit: "Independent makers who want a public profile, ongoing discovery and optional peer feedback.",
    timing: "A successful submission creates a profile. Optional Arena entry has a separate queue.",
    listing: "Permanent product profile, subject to moderation.",
    links: "Followed official-site links for unrestricted products under our current policy.",
    note: "This is our platform. Fair discovery prioritizes products with fewer recorded views; it cannot guarantee a visitor count. Arena votes require feedback on both products.",
    url: "/?submit=1",
    sources: [{ label: "How Indie Clash works", url: "/champions#how-it-works-section" }, { label: "Browse profiles", url: "/products" }],
  },
  {
    name: "Launching Next", kind: "Startup directory", cost: "Free",
    fit: "Early-stage startups seeking an editorial listing beyond a single launch-day community.",
    timing: "Free review queue; optional $99 upgrade for consideration within one business day.",
    listing: "Startup profile if accepted.",
    links: "A website link is advertised; attributes not verified.",
    note: "Faster consideration is not the same as guaranteed acceptance or customers. Prepare a clear description and working website; check the express FAQ before paying.",
    url: "https://www.launchingnext.com/submit/",
    sources: [{ label: "Submission rules", url: "https://www.launchingnext.com/submit/" }, { label: "Express FAQ", url: "https://www.launchingnext.com/express-faq/" }],
  },
  {
    name: "Microlaunch", kind: "Launch platform", cost: "Check plans",
    fit: "Working technology products seeking maker feedback, reviews and monthly discovery.",
    timing: "Monthly discovery and rankings; Pro Launch advertises queue skipping.",
    listing: "Product page with feedback and reviews; paid distribution options are separate.",
    links: "Pro Launch advertises dofollow links; standard-tier link terms not verified.",
    note: "The official premium page describes a paid launch package. Confirm the standard submission cost and queue inside the current launch flow. Prepare a usable demo and a concrete question for reviewers; monthly rankings do not guarantee sustained traffic.",
    url: "https://microlaunch.net/",
    sources: [{ label: "Platform and monthly rankings", url: "https://microlaunch.net/" }, { label: "Pro Launch terms", url: "https://microlaunch.net/premium" }],
  },
  {
    name: "Peerlist Launchpad", kind: "Launch platform", cost: "Check plans",
    fit: "Developers and designers sharing projects with a professional builder community.",
    timing: "Weekly launches; the official Launchpad article describes Monday as launch day.",
    listing: "Project showcase on Launchpad.",
    links: "Link attributes not verified.",
    note: "Useful when you want conversations with other builders. Confirm current submission eligibility and any charges in the live launch flow; the cited article is from February 2025.",
    url: "https://peerlist.io/launch",
    sources: [{ label: "Official Launchpad overview", url: "https://peerlist.io/blog/commentary/peerlist-launchpad-the-path-forward" }],
  },
  {
    name: "PitchWall", kind: "Launch platform", cost: "Free",
    fit: "AI tools, SaaS and technology products, including alpha or beta products with a real product presence.",
    timing: "Free launch has a minimum 30-day wait. Paid options offer shorter waits or a chosen date.",
    listing: "Reviewed product listing with plan-specific homepage exposure.",
    links: "The submission page advertises dofollow links on free and paid plans; not independently audited.",
    note: "Previously known as BetaPage. Prepare a working demo or clear product presence: agencies and empty landing pages are excluded. Free newsletter placement is not guaranteed; confirm paid terms before booking a launch date.",
    url: "https://pitchwall.co/submit",
    sources: [{ label: "Launch plans", url: "https://pitchwall.co/submit" }, { label: "Eligibility FAQ", url: "https://pitchwall.co/pages/faqs" }],
  },
  {
    name: "Product Hunt", kind: "Launch platform", cost: "Free",
    fit: "Ready-to-try technology products with a clear demo and a maker available for launch-day discussion.",
    timing: "Prepare a draft and schedule a launch; scheduling is available up to a month ahead.",
    listing: "Product and launch pages; homepage featuring is not guaranteed.",
    links: "Link attributes not verified.",
    note: "Prepare screenshots and explain the use case before launch day. A listing and a homepage feature are different outcomes; do not pay someone to hunt your product.",
    url: "https://www.producthunt.com/launch",
    sources: [{ label: "Launch guide", url: "https://www.producthunt.com/launch" }, { label: "Preparing for launch", url: "https://www.producthunt.com/launch/preparing-for-launch" }],
  },
  {
    name: "SaaSHub", kind: "Software directory", cost: "Check plans",
    fit: "Released SaaS and software products that buyers can compare with named competitors.",
    timing: "Approval required; relevant competitors and domain verification help prioritize review.",
    listing: "Software profile and alternatives discovery; paid featured promotion is separate.",
    links: "Product website URL is collected; published link attributes not verified.",
    note: "Prepare categories, competing products and an email on your domain. Unreleased products, waitlist-only pages, agencies and free-subdomain sites are excluded. The public submission page does not state a listing price; confirm costs before proceeding.",
    url: "https://www.saashub.com/services/submit",
    sources: [{ label: "Submission requirements", url: "https://www.saashub.com/services/submit" }, { label: "Promotion and featuring FAQ", url: "https://www.saashub.com/faq" }],
  },
  {
    name: "Show HN", kind: "Community", cost: "Free",
    fit: "A working project you personally built and can discuss in technical detail.",
    timing: "Community submission, not a scheduled directory slot. Account restrictions can apply.",
    listing: "Discussion thread rather than a product profile.",
    links: "Link attributes not verified.",
    note: "Let people try the project with minimal friction. A signup-only landing page does not qualify. HN currently warns of restrictions for users unfamiliar with the community; read both notices before posting.",
    url: "https://news.ycombinator.com/submit",
    sources: [{ label: "Show HN rules", url: "https://news.ycombinator.com/showhn.html" }, { label: "Current submission notice", url: "https://news.ycombinator.com/showlim" }],
  },
  {
    name: "Uneed", kind: "Launch platform", cost: "Free",
    fit: "Technology products seeking a dedicated listing and launch community.",
    timing: "Free assigned launch date up to five months out; paid scheduling and fast-track options.",
    listing: "Dedicated tool listing.",
    links: "Free tier advertises a dofollow link at an upvote score of 20; paid conditions differ.",
    note: "The pricing page says free listings need an upvote score of 10 to stay published. Paid options currently include $14.99 fast-track and $29.99 date selection. These are platform claims, not independently tested outcomes.",
    url: "https://www.uneed.best/submit-a-tool",
    sources: [{ label: "Submission flow", url: "https://www.uneed.best/submit-a-tool" }, { label: "Current pricing", url: "https://www.uneed.best/pricing" }],
  },
];

// Editorial recommendations for choosing an audience, not platform eligibility guarantees.
export const LAUNCH_SCENARIOS: Record<string, readonly string[] | null> = {
  "All launches": null,
  "Pre-launch": ["BetaList", "PitchWall"],
  "Builder feedback": ["Indie Clash", "Peerlist Launchpad", "Show HN", "Microlaunch"],
  "SaaS & software": ["AlternativeTo", "SaaSHub", "Product Hunt", "Indie Clash", "PitchWall", "Uneed"],
};
