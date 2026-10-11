export type GuideLink = { label: string; href: string };
export type GuideSection = {
  id: string;
  title: string;
  paragraphs: string[];
  checklist?: string[];
  example?: { title: string; text: string };
  links?: GuideLink[];
};
export type ResourceGuide = {
  slug: string;
  title: string;
  description: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  sections: GuideSection[];
  sources: GuideLink[];
};

// These are editorial guides, not generated product reviews. Dates change only
// with a substantive edit, and source links do not imply a hands-on tool test.
export const RESOURCE_GUIDES: ResourceGuide[] = [
  {
    slug: "how-to-launch-a-product",
    title: "How to Launch a Product: An Indie Maker’s Checklist",
    description: "Plan a product launch from first user to follow-up: define the audience, prepare a demo, choose startup listing sites and learn from real product feedback.",
    category: "Launch preparation",
    publishedAt: "2026-10-11",
    updatedAt: "2026-10-11",
    sections: [
      {
        id: "define-the-launch",
        title: "1. Decide what this product launch should teach you",
        paragraphs: [
          "A product launch is an invitation for a particular audience to try something useful. It is not just an announcement, a leaderboard position or a batch of directory submissions. Before choosing a date, write down who should respond, which task they should complete and what you want to learn from their response.",
          "For a new SaaS product, that might be whether a freelancer can finish an invoice without help. For a developer tool, it might be whether a developer can connect a sample project. Choose an outcome you can observe. A visitor who completes the task and returns provides different evidence from a person who likes the announcement.",
          "You can launch a startup in small stages. An invitation-only beta tests a workflow; a public release tests your explanation and onboarding with a wider audience. This guide covers releasing a usable software product, not incorporation, fundraising or a complete guide to starting a company.",
        ],
        example: { title: "Write a launch hypothesis", text: "For freelance designers who send weekly client updates, our product should make it possible to record and share one clear update in a single session. We want to learn where first-time users get stuck and whether they use it again on their next project." },
      },
      {
        id: "ready-to-release",
        title: "2. Make one workflow ready for a first-time user",
        paragraphs: [
          "A launch does not require every planned feature. It does require a truthful description of what works today. Test the path from your public page to the promised result in a fresh browser session. If there is a waitlist, say so; if access is limited, explain the limit before someone registers.",
          "Check your mobile layout, sign-in, loading and error states, and any purchase or cancellation flow that is part of the release. Use a test account and sample data. Do not ask early users to share sensitive documents merely to demonstrate that the product works.",
        ],
        checklist: [
          "A visitor can understand the intended user and the problem being solved.",
          "The main call to action matches the actual availability: try, join beta or join waitlist.",
          "Your advertised workflow works without private setup instructions from the maker.",
          "Pricing, usage limits and the support contact are visible and accurate.",
          "You have a way to collect problems and explain what happens to submitted data.",
        ],
      },
      {
        id: "launch-assets",
        title: "3. Prepare your product page, screenshots and demo",
        paragraphs: [
          "Explain the product in the language of the task, not only its technology. Lead with what someone can do, then show the input and result. A good product page answers who it is for, what is usable now, how to get access and what it costs. Keep the description consistent with the product itself.",
          "Record one short demonstration of the main workflow using product demo software or a simple screen recorder. Show the result early, then the steps needed to produce it. Use genuine screenshots, readable text and a clean test account. A polished animation should not imply that an unfinished feature is available.",
          "Keep a small launch kit: product name, one-sentence explanation, working URL, logo, screenshots, demo link, current pricing and a maker contact. Adapt the introduction to each community instead of pasting the same promotional message everywhere.",
        ],
        example: { title: "A clearer introduction", text: "Instead of ‘the next-generation AI-powered productivity platform’, try ‘Turn a recorded customer call into a draft follow-up email that you review before sending.’ Use this structure only if it describes a real workflow in your product." },
        links: [{ label: "Choose tools for recording a demo and preparing launch assets", href: "/resources/tools-for-solopreneurs" }],
      },
      {
        id: "choose-channels",
        title: "4. Choose where to launch a product",
        paragraphs: [
          "Different channels answer different needs. Startup directories and startup listing sites provide a discoverable profile. Product launch platforms can create a publishing moment. A community conversation can explain a working project and surface objections. None of those automatically gives you qualified customers.",
          "Start with a small number of relevant channels that you can support. Read the official submission rules, check eligibility and review waiting times. A pre-release beta and a finished SaaS product may qualify for different platforms. Choose Product Hunt or an alternative because of audience fit and format, not because a high domain rating guarantees useful traffic.",
          "Indie Clash combines public product discovery with optional Arena participation. You can publish a product profile without claiming that the product has already won a battle or received user testing. Browse recent product launches to see how other makers explain their work, then prepare your own accurate profile.",
        ],
        links: [
          { label: "Compare free and paid startup directories", href: "/resources/startup-launch-directories" },
          { label: "Explore new indie products and recent launches", href: "/products" },
        ],
      },
      {
        id: "launch-day",
        title: "5. Be present on launch day",
        paragraphs: [
          "Before posting, open every public link and check that the description still matches the released version. Be available to answer questions in the channel where you launched. If a user reports a problem, ask for the task and the step that failed rather than dismissing it as user error.",
          "Make a specific feedback request. Ask whether the first step is understandable or where someone expected a different result. Do not ask for positive reviews or coordinated votes as a substitute for learning. Follow the rules of each platform and disclose when you are the maker.",
          "For a serious incident, fix the problem or pause affected access before sending more people into the broken workflow. Share an honest update. A smaller launch with working onboarding is more useful than a large burst of visitors who cannot use the product.",
        ],
      },
      {
        id: "after-launch",
        title: "6. Turn feedback into the next release",
        paragraphs: [
          "Separate attention from activation. Profile views, website visits, signups, completed tasks, repeat use and purchases are different events. If you cannot measure a step yet, mark it as unknown rather than filling the gap with assumptions. Directory impressions and upvotes are not the same as paying customers.",
          "Keep a simple record of the source, user task, obstacle, evidence and next action. Repeated confusion in the same step is a stronger reason to change onboarding than an isolated request for a feature outside your target audience. Tell participants what you changed when they have agreed to follow-up.",
          "After launch day, update your public profile when availability or pricing changes, improve the demo where questions recur and try the next relevant channel. Do not create a new listing for the same product merely to simulate a new launch. Release useful changes and explain them clearly.",
        ],
        links: [{ label: "Recruit beta testers and ask better feedback questions", href: "/resources/find-beta-testers" }],
      },
    ],
    sources: [{ label: "Product Hunt’s official launch guide", href: "https://www.producthunt.com/launch" }],
  },
  {
    slug: "find-beta-testers",
    title: "How to Find Beta Testers and Get Useful Product Feedback",
    description: "Recruit relevant beta testers, plan a focused beta test and turn startup feedback into decisions. Includes an invitation template and a practical feedback log.",
    category: "Validation & feedback",
    publishedAt: "2026-10-11",
    updatedAt: "2026-10-11",
    sections: [
      {
        id: "choose-the-question",
        title: "1. Match the feedback method to the question",
        paragraphs: [
          "Product feedback is useful when it comes from someone who faces the problem you are trying to solve. Before looking for beta testers, decide whether you need to test the idea, the explanation or the working product. Those are different questions, and one positive comment cannot answer all of them.",
          "To test your idea, talk about how people handle the problem today and what makes the current approach difficult. To test the explanation, ask someone to describe what they think the product does after seeing the page. Beta testing goes further: participants use a pre-release product under agreed conditions and report what happens.",
          "A startup review, a vote or a comparison between product pitches can surface first impressions. It does not establish that the reviewer completed your workflow, that the software is reliable or that anyone will pay. Keep each type of evidence labeled when making decisions.",
        ],
      },
      {
        id: "recruit-testers",
        title: "2. Find beta testers who actually fit the product",
        paragraphs: [
          "Describe the tester in terms of a task and a constraint. ‘Anyone interested in AI’ is less useful than ‘freelance editors who turn recorded interviews into client drafts’. Ask candidates how they solve the problem now and when they last needed to do it. A recent, concrete example is more informative than general enthusiasm.",
          "Start with existing users, people who asked about the workflow and relevant communities where you already participate. Check whether recruitment posts are allowed. Contact people individually when you have a legitimate reason to think the task fits; do not scrape lists or send repeated unwanted invitations.",
          "Use startup directories to make the product discoverable, but explain that access is a beta when applicable. For builder communities, share a working example and ask a focused question. Friends and fellow makers can help you spot confusing copy, but they are not automatically representative customers.",
        ],
        checklist: [
          "The participant has a relevant task, not just an interest in helping you.",
          "They know what works today and which features are still unfinished.",
          "The expected time, access requirements and any compensation are stated upfront.",
          "They understand what information you will record and can decline or stop.",
        ],
        links: [{ label: "Choose a suitable startup directory or launch community", href: "/resources/startup-launch-directories" }],
      },
      {
        id: "invite-template",
        title: "3. Send a clear beta tester invitation",
        paragraphs: [
          "A useful invitation names the task, explains the commitment and gives the recipient a real choice. Ask for honest observations, not a favorable review. If you offer compensation, make it independent of whether the feedback is positive. Do not imply that a place on a mailing list creates consent to join a research session.",
          "For early sessions, use sample data and temporary accounts where possible. Explain whether a call or screen recording is optional, and ask permission before recording. Do not ask for passwords, private customer information or unnecessary personal details in the recruitment form.",
        ],
        example: { title: "Adapt this invitation to your real test", text: "Hi [name], you mentioned [specific task]. I’m building [product] to help with [outcome]. Would you try [one task] with sample data and tell me where it becomes confusing? It should take about [honest estimate]. This is a beta, so [known limitation]. There’s no obligation to buy or leave a review. [Explain recording, data handling and any compensation.]" },
      },
      {
        id: "run-the-test",
        title: "4. Give each tester one realistic task",
        paragraphs: [
          "Write a task in terms of the result, not instructions for clicking each button. ‘Send a project update to a client’ reveals more about onboarding than ‘click the purple button, choose this template and press send’. Let the participant attempt the task before explaining the interface.",
          "If you are observing a session, note the first point of hesitation, incorrect assumptions, errors and whether the person reaches the intended result. Intervene when needed for safety, but distinguish an assisted completion from an unassisted one. For an asynchronous beta test, give participants a short reporting format and a contact for blocking problems.",
          "Ask what they expected at the point where reality differed. Avoid leading questions such as ‘Wasn’t that easy?’ Ask whether they would use the product for their next real task and why. Treat stated future intent as a hypothesis until you can observe actual use.",
        ],
        checklist: [
          "What task did you try, and what were you using before?",
          "Where did you first become unsure what to do?",
          "What result did you expect, and what actually happened?",
          "Could you finish without assistance? If not, what blocked you?",
          "What would make this useful enough for your next real task?",
        ],
      },
      {
        id: "feedback-log",
        title: "5. Turn startup feedback into a decision log",
        paragraphs: [
          "Record the user type, task, observation and impact before writing a proposed solution. ‘The tester could not find the export’ is evidence; ‘we need a full redesign’ is an interpretation. Group repeated observations about the same workflow and separate bugs from unclear explanations or requests outside the intended use case.",
          "Prioritize blockers to the core task, then recurring friction. A request for another integration may matter later, but not if new users cannot finish the workflow you already advertise. Keep unanswered questions visible and arrange another relevant test rather than treating silence as satisfaction.",
          "Choose a follow-up action for each meaningful issue: fix, investigate, clarify, defer or decline with a reason. Re-test the changed step. A small log with evidence and decisions is more useful than a long feature wishlist with no indication of who requested it or why.",
        ],
        example: { title: "Example feedback record", text: "User: freelance editor. Task: export a reviewed draft. Observation: looked in the document menu and missed the toolbar action. Outcome: completed only after a hint. Next action: improve the label and placement, then test the same task again without instructions. This is an illustrative example, not an Indie Clash user study." },
      },
      {
        id: "arena-feedback",
        title: "6. Use Indie Clash feedback for the right job",
        paragraphs: [
          "Indie Clash provides product discovery and optional Arena comparisons with community critique. This can help you understand how a product is presented and which differences attract attention. It is not a managed beta tester recruitment service, a QA certification or a guarantee of customers.",
          "Use community comments to choose what to investigate with real users. If someone questions your value proposition, improve the explanation and ask a relevant participant to attempt the task. If two products are compared in an Arena battle, the result reflects that comparison; it does not prove that the winner is better for every user.",
          "Publish an accurate profile, make the usable workflow easy to find and keep availability current. For a public launch, combine your feedback log with a practical release plan rather than waiting for votes alone to validate the startup.",
        ],
        links: [
          { label: "See how Arena comparisons work", href: "/arena" },
          { label: "Prepare your product launch", href: "/resources/how-to-launch-a-product" },
        ],
      },
    ],
    sources: [{ label: "Indie Clash Arena — the community feature described here", href: "/arena" }],
  },
  {
    slug: "tools-for-solopreneurs",
    title: "Tools for Solopreneurs: A Practical Product Launch Stack",
    description: "Choose startup tools by task: open-source SEO checks, product demo software, launch images and lead capture. Real examples, limitations and official sources.",
    category: "Tools & workflows",
    publishedAt: "2026-10-11",
    updatedAt: "2026-10-11",
    sections: [
      {
        id: "choose-by-task",
        title: "1. Choose startup tools by the job they need to do",
        paragraphs: [
          "A solo founder does not need a large stack before launching. Start with the workflow that is blocked: a page that cannot be found, a demo that is hard to understand or an interested visitor with no way to contact you. Add a tool when it solves that problem with less effort than your current approach.",
          "The examples below are a task-based shortlist, not an exhaustive ranking of the best tools. We checked linked official descriptions, not every paid plan or a hands-on benchmark. Check current terms, platform support and pricing before adopting a tool. There are no affiliate links in this guide.",
          "Distinguish a free plan from open-source software. A free hosted service can impose limits or change its plans. An open-source tool may require installation, maintenance and hosting. Neither label tells you whether the product fits your workflow or handles your data appropriately.",
        ],
      },
      {
        id: "open-source-seo-tools",
        title: "2. Open-source SEO tools for technical checks",
        paragraphs: [
          "Lighthouse is an open-source auditing tool from the Chrome ecosystem. It checks aspects of performance, accessibility, SEO and other page quality signals. Use it on an important landing page, read the individual findings and fix issues that affect the visitor’s task. A high score is not a guarantee of indexing or search rankings.",
          "Unlighthouse extends the Lighthouse workflow to a site-wide audit. Its official project describes URL discovery and reports across pages. It is useful when you need to compare technical issues across a product directory rather than manually checking every profile. Review the setup instructions and scope the crawl to your own site.",
          "These are technical checks, not replacements for keyword research, a backlink database or first-party search performance data. Google Search Console helps you inspect Google’s recorded indexing and search activity; it is a separate hosted service, not an open-source SEO tool. Use each source for the question it can actually answer.",
          "If you are looking for the best free SEO tools, first specify the job: checking a page, inspecting an indexed URL or researching demand. Do not buy or install a tool simply because it appears on a long list. Fix a meaningful issue, then repeat the same check so you can compare like with like.",
        ],
        links: [
          { label: "Lighthouse official documentation", href: "https://developer.chrome.com/docs/lighthouse/overview/" },
          { label: "Unlighthouse official project", href: "https://unlighthouse.dev/" },
          { label: "Google Search Console URL Inspection documentation", href: "https://support.google.com/webmasters/answer/9012289" },
        ],
      },
      {
        id: "product-demo-software",
        title: "3. Product demo software: recording or interactive tour?",
        paragraphs: [
          "For a first launch, a clear recording may be enough. OBS Studio is free, open-source software for recording and streaming. It can capture a working product, but you still need to plan the story and prepare the account. Check the output before publishing so private information and unrelated notifications are not visible.",
          "Tella describes recording, editing and sharing screen videos for uses including demos. Consider a hosted recorder when convenience and editing workflow matter more than running everything locally. Check the current plan for export, hosting and other limits. We are not assuming that every feature is free.",
          "An interactive product demo platform is a different choice: a visitor explores a guided flow rather than watching a video. Before paying for one, test how easily you can update the tour after an interface change, how it works on mobile and whether the demonstration makes unfinished features look available.",
          "Demonstrate one task from input to useful output. Use sample data, narrate the decisions and include an accessible explanation alongside the video. A demo helps someone understand a SaaS product; it does not replace access to the actual product or a transparent description of its limitations.",
        ],
        links: [
          { label: "OBS Studio official website", href: "https://obsproject.com/" },
          { label: "Tella official website", href: "https://www.tella.com/" },
        ],
      },
      {
        id: "launch-images",
        title: "4. Photo editing software for honest launch assets",
        paragraphs: [
          "Use image editing to make a real screenshot readable, not to invent a product result. Crop irrelevant browser chrome, remove private information and annotate the important step. Keep a copy of the unedited source so you can update the image when the interface changes.",
          "GIMP is a free, open-source image editor. It can help prepare screenshots and graphic assets without a hosted editing subscription. Review its documentation for the specific editing task rather than learning every feature before launch.",
          "A good launch image needs context: what the user entered, what the product produced and why the result matters. Do not rely on a screenshot alone to explain your workflow. Add a readable description, avoid tiny text and label mockups when they are not screenshots of a released feature.",
        ],
        links: [{ label: "GIMP official website and documentation", href: "https://www.gimp.org/" }],
      },
      {
        id: "lead-generation-tools",
        title: "5. Lead generation tools: capture interest before scaling outreach",
        paragraphs: [
          "Lead generation can mean collecting an inquiry, finding potential prospects or managing follow-up. Those jobs require different tools. For a first product launch, a clear contact or beta signup form may be enough. Ask only for the information needed to respond and explain what the person is signing up for.",
          "Tally provides a form-building workflow that can support a signup or inquiry form. Check its current terms and limits before choosing it. A form collects submitted interest; it is not a prospect database, an outbound campaign or evidence that a visitor will become a customer.",
          "If you later evaluate a lead generation platform, check where its data comes from, what consent and opt-out processes are available, how duplicates are handled and whether you can export your own records. Do not treat the size of a contact list as permission to send unwanted messages.",
          "Keep a simple follow-up record: source, task, stated interest, permission to contact and next action. Distinguish beta signup from newsletter signup. If you do not have conversion tracking yet, record what you actually know rather than attributing every inquiry to a directory submission.",
        ],
        links: [{ label: "Tally’s official form creation guide", href: "https://tally.so/help/create-a-form" }],
      },
      {
        id: "minimal-launch-stack",
        title: "6. Put the smallest useful launch stack to work",
        paragraphs: [
          "Start with your working product and public page, one technical check, one clear demo and one way for relevant people to reply. Keep notes in a document or spreadsheet until coordination becomes the bottleneck. More startup company tools will not compensate for an unclear audience or a workflow that fails.",
          "Before adding another service, check the ongoing cost, account access, data export and what happens when the free tier ends. Remove overlapping tools you no longer need. Choose software you can maintain while also responding to users and improving the product.",
          "Use Indie Clash to discover independent products and examine how makers present their use cases. A public listing is not our endorsement, and an Arena result is not a substitute for evaluating your own requirements. Combine discovery with official documentation and a trial using non-sensitive data.",
        ],
        checklist: [
          "Check the main public page and its technical issues.",
          "Record a real workflow with sample data and an understandable result.",
          "Prepare readable screenshots and an accurate product explanation.",
          "Provide a clear, permission-based way to ask questions or join the beta.",
          "Choose a relevant launch channel and review what users actually do next.",
        ],
        links: [
          { label: "Discover independent software products", href: "/products" },
          { label: "Use the product launch checklist", href: "/resources/how-to-launch-a-product" },
          { label: "Plan beta testing and collect product feedback", href: "/resources/find-beta-testers" },
        ],
      },
    ],
    sources: [
      { label: "Lighthouse", href: "https://developer.chrome.com/docs/lighthouse/overview/" },
      { label: "Unlighthouse", href: "https://unlighthouse.dev/" },
      { label: "OBS Studio", href: "https://obsproject.com/" },
      { label: "Tella", href: "https://www.tella.com/" },
      { label: "GIMP", href: "https://www.gimp.org/" },
      { label: "Tally", href: "https://tally.so/help/create-a-form" },
    ],
  },
];
