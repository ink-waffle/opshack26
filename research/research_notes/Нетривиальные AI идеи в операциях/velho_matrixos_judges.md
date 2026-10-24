# Velho, Matrix OS and Prompt hackathon judges: dossier for the Operations Hackathon (24–25 Oct 2026)

Researched 2026-10-24 (night before opening). Sources: velho.io (all 8 sitemap pages), Finnish PRH/YTJ open-data API, matrix-os.com (home, team, technical, docs, skills.md, Symphony, Hermes, integrations, blog), the HamedMP/matrix-os GitHub README, prompthack.aaltoes.com (event, results, project and info pages), the `prompthack` hub MCP (`list_challenges` / `list_partners` for all past events, which returns the full past briefs **and judges' notes**), prompt.aaltoes.com, and essays from a16z, Foundation Capital, General Catalyst and TechCrunch. No browser tools were used.

**Correction to the brief.** The archive does not show "Mergero Origination Desk" or "Prenew Scout" as winners. Of the three projects the brief named, only "Content creation machine" won an award (an honourable mention). The real winners are in Q4.

---

## Q1. Who is Velho, and what client problems and industries have they publicly described?

### Takeaway
Velho Applied Intelligence Oy is a two-founder Helsinki automation and practical-AI consultancy. It was registered on 15–16 July 2026, so it is about 3 months old. It sells a rolling monthly retainer in which "a named expert" runs a Find → Prioritise → Ship → Adopt cycle. It has published exactly one client case: Kreia, outbound sales automation, 10× weekly outreach. Everything else on the site is generic use cases (quotes and orders, field reporting, scheduling and dispatch, management reporting, customer follow-up, physical automation) or products the founders built before Velho. There is no published pricing, no blog, and no named Finnish client list. I found no Velho–Bahn link.

### Cited Findings
**Company facts**
- Legal entity: Velho Applied Intelligence Oy, Business ID 3639709-7, Helsinki. Business ID registered 2026-07-15; trade register entry and name 2026-07-16; industry code TOL 62100 "Computer programming activities"; another register entry 2026-08-01 — [PRH/YTJ open data API](https://avoindata.prh.fi/opendata-ytj-api/v3/companies?businessId=3639709-7)
- Tagline: "Automation & practical AI partner. Less manual work. More room to grow." Claims: "100+ projects shipped by the team" and "50,000+ people use products our founders built". "You talk directly with Oskar or Patrik, co-founders" — [velho.io](https://velho.io)
- The site's content is "AI-generated or AI-assisted by default" (site-wide disclosure). Analytics: GA4 via Google Tag Manager. Privacy policy last updated 8 Sep 2026 — [velho.io/privacy](https://velho.io/privacy)
- Velho runs its own internal app, "Velho Ops", at ops.velho.io. It is a Next.js app with Auth.js sign-in, hosted on Railway behind Cloudflare (seen in HTTP headers), and serves the booking page `ops.velho.io/book/patrik/intro` — [ops.velho.io booking page](https://ops.velho.io/book/patrik/intro) (observed via curl headers)
- LinkedIn company page id 144723965 (linked from the site). Its posts are behind the login wall and were not accessible — [velho.io](https://velho.io)

**Founders**
- **Oskar Kallio**, co-founder.
  - Focus: "Operations, commerce and finance automation, and consumer apps."
  - Before Velho: "Automated orders, invoicing and reporting across three European legal entities in an earlier operations role". Built "operations software for construction firms, with AI parsing of purchase invoices". "Built industrial supplier partnerships at Droppe."
  - Built Luotsi, a marine chart, weather and vessel app (web, iOS, Android). GitHub: oskeposke (no public repos).
  - Source: [velho.io/team](https://velho.io/team), [velho.io/team/oskar-kallio](https://velho.io/team/oskar-kallio)
- Svenska Yle (19 Aug 2026): Kallio, from Ekenäs, built the chart app for his own use; it is "now used by tens of thousands of Finns" — [Yle](https://yle.fi/a/7-10103793)
- HBL: more than a thousand downloads on the first evening — [HBL](https://www.hbl.fi/finland/oskar-kallio-utvecklade-app-for-eget-bruk-over-tusen-nedladdningar-forsta-kvallen/)
- HS Visio (26 Aug 2026) describes him as a 28-year-old "AI enthusiast" who has built apps for boating, gym training and language learning "because something annoyed him" — [HS Visio](https://www.hs.fi/visio/art-2000012153739.html)
  - Velho credits Opeton (the language app) to Patrik. HS's mention of a language-learning app may mean Oskar co-built it; this is unresolved.
- **Patrik Holopainen**, co-founder.
  - Focus: "AI products, sales automation and startup growth."
  - Founded Opeton, "voice AI in production before it became mainstream". Previously led the Kiuas startup accelerator. Led the Kreia project.
  - Links: LinkedIn /in/holosome, GitHub PatrikHolopainen.
  - Source: [velho.io/team/patrik-holopainen](https://velho.io/team/patrik-holopainen)
- Patrik's recent public repos include `local-diarization` ("Local transcription and speaker diarization with Whisper.cpp and sherpa-onnx", pushed Sep 2026) and `sale-radar` (2025) — [GitHub API](https://api.github.com/users/PatrikHolopainen/repos)
- Opeton: "Become fluent by talking with Opeton, your AI language tutor" — [opeton.co](https://www.opeton.co/)
- Delivery capacity beyond the founders: "Our network includes dozens of AI professionals, contracted case by case… A named Velho lead stays responsible for delivery" — [velho.io](https://velho.io)

**The model (their own words)**
- "A named Velho expert works with your team every month. We find the manual work that slows you down, build the fix and help people actually use it." — [velho.io](https://velho.io)
- Problem framing: "Temporary fixes have become permanent work… A temporary spreadsheet, repeated check or manual handoff becomes part of the role… In offices, people carry information between tools. On site, they step away from the real task to feed a system… The bottlenecks nobody questions anymore, or the ones dismissed as too big to solve, are often where the most growth is hiding." — [velho.io](https://velho.io)
- The cycle, "repeated every month":
  1. **Find**: "We speak with the people doing the work and trace the real process across roles and systems, including the workarounds nobody wrote down." Output: a list of bottlenecks and opportunities.
  2. **Prioritise**: rank by business value, effort ("How much does it take to build, *and to keep running*?") and time to benefit. Output: "A ranked improvement backlog that you own."
  3. **Ship**: "the smallest useful version… an automation, an internal tool or a specialist-led change." Output: "A working change in daily use, not a report."
  4. **Adopt**: "help teams change the routine around the new solution, then follow what improves and what still gets in the way." Output: "A changed routine, and what we learned becomes the start of the next cycle."
  - Source: [velho.io/approach](https://velho.io/approach)
- Example backlog shown on the approach page ("month 4"):
  1. Draft quotes from email enquiries: Value ●●●, Effort ●○○, Shipped
  2. Field reports from photos and checks: ●●○ / ●●○, Shipped
  3. Connect order data across systems: ●●● / ●●●, In progress
  4. Retire the scheduling spreadsheet: ●●○ / ●●○, Next
  - Source: [velho.io/approach](https://velho.io/approach)
- What they build:
  - Automations: "remove manual handoffs, so information moves without someone carrying it between tools".
  - Internal tools: "when general-purpose software asks too much of the people using it".
  - Practical AI: "Drafting, sorting and extracting with AI, with a person reviewing the result".
  - Specialist work: robotics, sensors, machine vision.
  - "Sometimes the best fix is a change in how work is organised rather than new software."
  - Source: [velho.io/approach](https://velho.io/approach)
- FAQ:
  - "Do we need to know what to automate first? No. Finding the opportunities is the first step."
  - "Do we have to replace our systems? Usually not."
  - "Can we stop? Yes. The partnership rolls monthly, and its level can change with one month's notice."
  - Source: [velho.io/approach](https://velho.io/approach)
- "First year" roadmap:
  - Opportunity mapping in months 1–3 ("Work reviews, interviews and a ranked improvement backlog"), then running all year.
  - Quick improvements: remove a handoff (M1), pre-fill a check (M3), connect systems (M5), draft follow-ups (M7), route requests (M9), build a dashboard (M11).
  - Focused projects: simplify the quoting flow (M2–4), automate recurring reports (M7–8).
  - Larger changes: connect operational data (M5–8), replace a brittle internal tool (M9–12).
  - Specialist work: domain-specific technology (M4–7), physical automation (M9–12).
  - Source: [velho.io](https://velho.io)

**Published use cases (before → after, systems)**
- Customer follow-up: "Follow-ups written from memory, or missed" → "A ready draft with full context, waiting for review". Systems: CRM, email, meeting notes. Mock example: "To: Anna Virtanen, Nordkap Oy – Prepared from account history" — [velho.io](https://velho.io)
- Quotes and order intake: "Every enquiry re-keyed into a quote by hand" → "Standard quotes drafted automatically, exceptions routed". Systems: email, ERP, price lists. Mock: "EUR 14,200" — [velho.io](https://velho.io)
- Field reporting: "Reports typed up after the shift" → "The record is ready when the job ends". Inputs: mobile, photos, checklists — [velho.io](https://velho.io)
- Scheduling and dispatch: "Phone calls and a shared spreadsheet" → "Routine jobs scheduled, people only handle conflicts". Inputs: calendars, maps, job system — [velho.io](https://velho.io)
- Management reporting: "Figures copied from several systems each month" → "One current view that flags what changed". Sources: accounting, ERP, spreadsheets — [velho.io](https://velho.io)
- Robotics and physical automation: "Stoppages found by walking the floor" → "Sensors and cameras flag issues as they happen". Mock: "Where did line 3 stop? Sensor history checked" — [velho.io](https://velho.io)
- Contact-form categories: Quotes & orders, Reporting, Field work, Scheduling, Customer follow-up, Something else — [velho.io](https://velho.io)

**The only client case: Kreia**
- Kreia "handles content strategy, creative production and publishing for businesses' social media and paid campaigns" ([kreia.io](https://www.kreia.io/): "Social media, fully managed").
- Challenge: "As outreach grew, research, campaign preparation and monitoring had to keep pace."
- Built: automated prospecting, AI buyer signals, lead enrichment, email campaigns and monitoring "in one repeatable flow".
- Result: "10× average weekly outreach volume compared with Kreia's previous efforts". Led by Patrik.
- Source: [velho.io/work/kreia](https://velho.io/work/kreia)

**Founders' project list ("32 projects", labelled as earlier career work, not Velho engagements)**
- Sales (4): lead sourcing and outreach ("emails that are checked before sending"); multilingual product enquiry assistant for high-value products; customer-aware email drafts; personalised email marketing to thousands.
- Operations & finance (7): operations platform (leads → invoicing); document signing with audit trail; business directory publishing; multi-country commerce and reporting across three EU legal entities with a shared data warehouse; order and shipment automation (CRM updates, duplicate-order detection, address validation, multilingual notifications); supplier and finance automation (invoices across three entities, bulk payments); construction operations software with AI parsing of purchase invoices.
- Research (4): company research at scale; "Investment research experiments: a multi-agent platform that generates candidate strategies and evaluates them separately against withheld historical data"; deal-flow intelligence (Nordic company data); federated web search.
- Content (4) and physical automation (2):
  - "Camera-based equipment monitoring: reads an equipment LED through a camera and turns its state into machine-readable data"
  - AI-assisted CAD → printable models.
- "Lab: personal AI & agents" (11):
  - local speech-to-text; natural-language browser automation; remote coding-agent interface
  - personal assistant platform ("provisions a separate AI-assistant environment for each user, with memory, messaging integrations and billing")
  - "Agent-configurable environment… changes tested before activation and rollback on failure"
  - "Isolated agent execution… raw secrets behind a separate credential proxy"
  - "Remote development agent… persistent cloud workspace"
  - "Multi-agent development… explicit review before work is merged"
  - "Structured agent communication… separates control fields from untrusted text"
- Source: [velho.io/work](https://velho.io/work)

**Bahn (the other challenge partner), for cross-reference**
- Bahn Express is a Helsinki car-transport platform. Co-founders: Matias Blomberg (CEO) and Leevi Jäkälä. Office facts:
  - About 30 employees, offices in Copenhagen and Berlin
  - 500+ independent drivers, 15,000+ deliveries a year, 100+ dealerships
  - Partners: Kamux, Autohuset Vestergaard, Aampere
  - Transit in 2–5 days versus 10–30 days for traditional carriers
  - €100k insurance per delivery
  - €5M round (Dec 2025) led by node.vc with Trind VC and Innovestor
  - Source: [Cision press release](https://news.cision.com/san-francisco-oy/r/bahn-express-raises--5m-to-rapidly-scale-its-automotive-logistics-platform-across-europe,c4282838)
- Conflict: Dealroom-derived listings say it was founded in late 2023 by Blomberg and Atte Vesala. The press release says founded 2024, with Jäkälä as co-founder — [Dealroom](https://app.dealroom.co/companies/bahn_express)
- Hub blurb: "Europe's fastest car transport for dealers and fleets: a fixed price, one driver per car, delivered in days" — `prompthack` MCP `list_partners` (hackathon-04)

### Inferences
- **Velho is an early-stage, founder-led consultancy, not a product company.** It is 3 months old, has one published case and a team of two plus a contractor network. Its scarcest resource is founder hours across clients. Its brief will probably be something it wants to productise or scale in its own delivery model (Find, Prioritise, Ship or Adopt) or a representative SME client problem. It is unlikely to be a narrow engineering task.
- **Likely target industries:** Finnish SMEs with physical operations (construction and field service, wholesale and industrial supply, manufacturing lines, logistics and dispatch) plus B2B sales teams. The use-case set (quotes from email, field reports from photos, dispatch without phone calls, a monthly reporting diff, camera monitoring) points to traditional Finnish "Oy" businesses, not SaaS companies.
- **Their taste shows in their own projects.** These include evaluation against withheld historical data, rollback-on-failure environments, credential proxies, separating control from untrusted text, and review before merge. They will appreciate evaluation rigour and safety engineering, not just a slick UI. The investment-research project ("generates candidate strategies and evaluates them separately against withheld historical data") is an autoresearch-style loop, so an autoresearch framing should land with them.
- **"Effort… to keep running"** appears in their prioritisation rubric. They are explicitly conscious of maintenance cost and automation rot.
- **Possible overlap with Bahn:** "Scheduling and dispatch" is a Velho use case and Bahn's core operation (500+ drivers, one driver per car). Bahn could plausibly serve as a "client" for Velho's brief, or one dispatch-related build could target both challenges. This is speculation; no relationship was found.

### Gaps
- No Velho pricing anywhere: the site sells only a 30-minute intro call. Retainer size is unknown.
- No Velho blog, no FI or SV language version (`/fi` returns the English homepage), and LinkedIn posts are inaccessible without login. Web search returns nothing on "Velho Applied Intelligence" (too new to be indexed).
- No named Finnish clients other than Kreia. No data on how many retainer clients they have.
- The tools and stack they deliver on (n8n, Make, custom code, which LLMs) are not stated. Signals are limited to the Railway/Next.js/Auth.js internal app, the "AI with a person reviewing" stance, and Patrik's local Whisper diarization repo.
- No Velho–Bahn connection found in any source checked.

---

## Q2. How does Velho find manual work today? What would 10× better discovery look like, and what are the known failure modes of the forward-deployed / services-as-software model?

### Takeaway
Velho's discovery is entirely human and interview-led: talk to people, trace the process, do work reviews, then score each opportunity on value, effort and time to benefit. Adoption is coached, not measured by instrumentation. The literature names this model's failure modes clearly:
- discovery and bespoke delivery are expensive, so mid-market gains "rarely justify months of on-site engineering";
- deployments become unmaintainable "snowflakes" (the services trap);
- integrations are fragile (30–50% of first RPA implementations are said to fail; UI changes break bots);
- pilots stall on a workflow "learning gap" (MIT NANDA: about 95% of GenAI pilots show no measurable return);
- AI output creates hidden verification work ("workslop": 40% of 1,150 workers affected, about 2 hours per instance).

A 10× discovery mechanism would turn the Find step from interviews into continuous, evidence-backed mining of the company's digital exhaust. Each opportunity would come pre-sized, and the same instrumentation would measure adoption and ROI afterwards.

### Cited Findings
**Velho's current discovery and adoption method**
- Find: "We speak with the people doing the work and trace the real process across roles and systems, including the workarounds nobody wrote down" — [velho.io/approach](https://velho.io/approach)
- Opportunity mapping in months 1–3 uses "Work reviews, interviews and a ranked improvement backlog" — [velho.io](https://velho.io)
- The intro call promises to "map what happens, who is involved, where information gets stuck and what a useful first improvement could be". Three questions: "Where does manual work pile up today? Which improvement would pay back fastest? Is Velho the right fit, or should you do it yourselves?" — [velho.io](https://velho.io)
- Adoption: "help teams change the routine around the new solution, then follow what improves and what still gets in the way"; the backlog is "Reviewed with your team every month" — [velho.io/approach](https://velho.io/approach)

**Forward-deployed engineering (FDE) and services-as-software theses**
- **a16z, Joe Schmidt, 4 June 2025, "Trading Margin for Moat"** — [a16z.com/services-led-growth](https://a16z.com/services-led-growth/)
  - FDEs are rebranded professional services that "act like managers for AI agents".
  - "Enterprises buying AI are like your grandma getting an iPhone: they want to use it, but they need you to set it up."
  - IPO gross margins: ServiceNow 63.2% and Workday 54.1%, versus the ~80% software ideal. Salesforce burned more than $52M to earn $22M before building its partner ecosystem.
  - 22 of OpenAI's 311 open roles were FDE or solutions roles.
  - Advice includes "Automate: use tools for process mining, data pipelines, integrations, and API documentation to speed delivery and lower minimum ACVs", "Leave a trail" (document everything) and "Design systems thoughtfully" (common libraries).
  - "Software is no longer aiding the worker — software *is* the worker."
- **a16z, Marc Andrusko, 16 Jan 2026, "The Palantirization of everything"** — [a16z.com](https://a16z.com/the-palantirization-of-everything/)
  - FDE postings are "up 800–1000% this year" depending on source.
  - "The services trap is real": copying only embedded engineers yields "thousands of bespoke deployments" that are hard to maintain or upgrade, ending as "Accenture for X" with a nicer front end.
  - Failure modes:
    - "Mid-market efficiency gains rarely justify months of on-site engineering"
    - fragmented customers make every deployment a snowflake
    - customers become your R&D lab
    - talent dilution
    - "pretending you're SaaS when you're really services with a platform"
  - Palantir works because of shared primitives: the Ontology ("the dynamic, actionable digital model of an organization's real-world entities"), access controls and workflow engines.
  - Recommendations: time-box deployments (e.g. a 90-day sprint), "convert bespoke code into reusable templates each quarter", favour configuration over code, keep FDEs in product.
  - Pressure-test questions: "Does forward-deployed effort decline over time? What breaks at 50 customers? How do you decide not to customize?"
- **Foundation Capital** (Joanne Chen and Jaya Gupta, April 2024; older but foundational): "service as software" means the vendor owns the outcome, not the tool. Sized at $4.6T (about $2.3T in salaries plus $2.3T in outsourced services, per Gartner), versus a much smaller SaaS market — [Foundation Capital](https://foundationcapital.com/ai-service-as-software/)
- **General Catalyst "Creation" strategy**: $1.5B to incubate AI-native companies that acquire services firms. A screen of 70 service categories found 10 where AI can automate 30–70% of work. Aim: lift EBITDA from 5–10% to 30–40%. Portfolio includes Eudia (legal), Titan (IT/MSP) and Long Lake (HOA) — [Capital & Clarity](https://capitalandclarity.substack.com/p/the-general-catalyst-behind-15-billion), [Cognitive Revolution podcast](https://www.cognitiverevolution.ai/the-revolution-in-services-general-catalysts-ai-rollup-strategy-with-marc-bhargava/)
- **TechCrunch, 28 Sep 2025, "The AI services transformation may be harder than VCs think"** — [TechCrunch](https://techcrunch.com/2025/09/28/the-ai-services-transformation-may-be-harder-than-vcs-think/)
  - Workslop: a Stanford Social Media Lab / BetterUp study of 1,150 employees (published in HBR) found 40% had received AI output "that looks polished but lacks substance". Each instance cost nearly 2 hours, about $186 per person per month, or more than $9M a year for a 10,000-person organisation.
  - Margin paradox: cut staff and there are fewer people to catch AI errors; keep staff and the margin gains never arrive.
  - Titan automated 38% of MSP tasks in pilots.
  - Bhargava: "it's really hard to transform a company with AI"; scarce applied-AI engineers are the main hurdle.
- **MIT NANDA, "The GenAI Divide: State of AI in Business 2025"** (as reported, Aug 2025) — [Fortune](https://fortune.com/2025/08/18/mit-report-95-percent-generative-ai-pilots-at-companies-failing-cfo), [Computing](https://computing.co.uk/news/2025/ai/mit-report-95pc-corporate-generative-ai-pilots-fail)
  - About 95% of GenAI pilots deliver no measurable P&L impact; about 5% reach rapid revenue acceleration.
  - Cause: a "learning gap": enterprise tools don't adapt to workflows.
  - More than half of budgets go to sales and marketing, but the best ROI is in back-office automation.
  - Method: 150 interviews, 350 surveys, 300 deployments.
  - Caveat: secondary coverage; the primary report was not read.
- **RPA rot**: EY is widely cited as estimating that 30–50% of initial RPA implementations fail. I found no primary EY document. UI fragility ("a button moves, an identifier changes, and the bot either stops or returns bad data") is the most consistent failure cause in practitioner write-ups — [Flobotics](https://flobotics.io/blog/rpa-failures), [Tinyfish "RPA's scar tissue"](https://current.tinyfish.ai/issue/29/echoes/article/16246/rpas-scar-tissue)
- **Existing automated discovery (task mining)**: Mimica records employee interactions across desktop apps, has AI "categorize actions, identify inefficiencies", and outputs process maps. It produces "automation-ready processes, prioritized based on ROI", process definition documents (PDDs) and BPMN maps importable into UiPath, and recommends RPA, GenAI or agentic AI per task — [UiPath Marketplace listing](https://marketplace.uipath.com/listings/mimica-task-mining-and-process-intelligence), [Mimica blog](https://www.mimica.ai/blog/how-task-mining-powers-intelligent-automation)
  - Gartner defines task mining as inferring information "from low-level event data available in UI logs" (screen recordings, keystrokes, clicks, data entries) — [Gartner market page](https://www.gartner.com/reviews/market/task-mining-tools)
- **Matrix OS's own metrics for company agent workflows**: "time from trigger to reviewed outcome, percentage of runs requiring correction, missing-source and stale-source detections, policy denials and prevented duplicate actions, time spent waiting for people or systems… manual coordination removed from recurring workflows". Also: "The goal is not to maximize autonomy. It is to make useful work more continuous, shared, inspectable, and safe." — [Matrix blog: company OS series](https://matrix-os.com/blog/company-os-ai-agents-series)

### Inferences
- **Velho's unit-economics problem.** A two-founder team doing interview-led discovery for SME clients sits squarely inside Andrusko's warning: mid-market gains rarely justify heavy on-site engineering. Every hour of discovery and every bespoke automation that needs babysitting eats margin. Anything that (a) shrinks discovery from weeks to hours, (b) makes shipped automations self-maintaining or self-reporting, or (c) turns bespoke fixes into reusable templates solves Velho's own business problem. It is the most "on-brief" angle even if the brief is phrased as a client problem.
- **Where today's discovery falls short and 10× improves on it:**
  - Interviews capture what people *say*. Velho itself stresses "the workarounds nobody wrote down".
  - Task-mining products such as Mimica are enterprise, desktop-agent, BPMN/RPA-oriented tools.
  - A 10× version for SMEs is LLM-native and works from already-existing exhaust, with no installed recorder: email and calendar metadata, shared-drive revision history, ERP/CRM audit logs, chat, and phone or voice notes.
  - It reconstructs "human middleware" patterns: the same-shaped email sent weekly, numbers re-keyed between systems, a spreadsheet edited every Monday by three roles.
  - Every claimed opportunity cites evidence (message IDs, file revisions) and an hours estimate, then feeds Velho's own scoring (value, effort including keep-running cost, time to benefit).
- **Adoption measurement uses the same pipe.** If discovery mines exhaust, Adopt can be verified with it too: is the old spreadsheet still being edited, are manual emails still being sent? That closes the loop Velho currently runs by conversation.
- **Workslop matches the builder's thesis.** The TechCrunch/HBR numbers are quantitative backing for "agents produce more output than humans can absorb or verify". It is a strong slide-one hook for judges.

### Gaps
- No primary EY RPA report or primary MIT NANDA PDF was read; figures are as reported by secondary outlets.
- No data on Velho's actual hours per discovery engagement or adoption success rate.
- No Sequoia primary essay was read. A search snippet attributes "for every $1 spent on software, up to $6 are spent on services" to Sequoia's Julien Bek, but this is unverified.

---

## Q3. What is Matrix OS technically, what can it do that a laptop or VPS cannot, and what might "best use of Matrix OS" reward?

### Takeaway
Matrix OS (company handle FinnaAI, Europe-based) gives each user an always-on personal VPS ("cloud computer") with a browser desktop, persistent zellij terminal sessions, files and Postgres, generated apps, OAuth integrations and multiple agents. Supported agents: Claude Code, Codex, Cursor, OpenCode, Pi, Gemini CLI, plus Matrix-native Hermes and OpenClaw-style assistants. All of it is reachable from web, desktop, CLI, an MCP server and messaging channels. The kernel is the Claude Agent SDK.

Its differentiators over a plain VPS:
- work continues after the laptop closes, and humans and agents can attach to the *same* terminal session;
- several agents run in parallel on shared files, context and memory (Symphony);
- scheduled resident agents (Hermes) act on connected tools;
- apps are generated into the OS itself;
- self-healing and evolving sub-agents (Healer, Evolver).

The founders' public roadmap ("company OS", "trust layer") is about accountable, reviewable company workflows: trigger → context → agent → policy → human review → action → shared record. That overlaps almost exactly with the builder's "humans can't verify agent output" thesis.

### Cited Findings
**What it is**
- "An always-on cloud computer for you and your AI agents: run any model, connect your tools and give agents shared context." Tool-challenge prize: "3 months of Matrix + $300 in AI credits for each member of the winning team. The challenge brief drops at the opening ceremony." — [prompthack hackathon-04 tools page](https://prompthack.aaltoes.com/hackathon-04/tools)
- Schedule: "Matrix OS: founder story & workshop", Sat 14:00–15:00: "The Matrix OS founder on how they built it, then a hands-on workshop." — [hackathon-04 schedule](https://prompthack.aaltoes.com/hackathon-04/schedule)
- Positioning: "The self-expanding OS for you and your agents. Describe an app you need and AI builds it on your own private cloud computer." The AI is the kernel; "It is not a chat box beside your software." — [matrix-os.com](https://matrix-os.com), [GitHub README](https://github.com/HamedMP/matrix-os)

**Founders**
- Hamed Mohammadpour, CEO and co-founder: "product and machine-learning instincts from PostHog and Newly, with a Machine Learning Engineering background from KTH" — [matrix-os.com/team](https://matrix-os.com/team)
- Nima Naderi, CTO and co-founder: "Olympiad gold-medal problem solving, two years as part of the IOI Scientific Committee… DEF CON finalist" — [matrix-os.com/team](https://matrix-os.com/team)
- Mission: "give everyone a personal computer in the cloud where their AI agents live, keep context, and work 24/7" — [matrix-os.com/team](https://matrix-os.com/team)

**Origin and traction**
- Built for Anthropic's "Built with Opus 4.6" hackathon (Feb 2026), where it placed in the top 20; shown at the Claude Code Birthday Party at Anthropic HQ. Demo video: youtu.be/CSFIYUeOvlc — [README](https://github.com/HamedMP/matrix-os)
- Repo `HamedMP/matrix-os`: created 2026-02-13, last pushed 2026-10-23, 84 stars, 25 forks, 513 open issues, TypeScript, AGPL-3.0. Badge: "3,032 tests passing". Tagline: "The operating system that builds itself" — [GitHub API](https://api.github.com/repos/HamedMP/matrix-os)
- Ran a demo and workshop at Claude Founder House Paris on 22 July 2026 — [matrix-os.com/claude-paris](https://matrix-os.com/claude-paris)
- Listed on Product Hunt ("persistent computer in the cloud… run Claude Code, Codex… start on desktop, check from phone") — [Product Hunt](https://www.producthunt.com/products/matrix-os)
- Hamed is a serial hackathon builder. Public repos include `secretbroker` (Rust: "Keep secrets out of agent context while giving local commands scoped access"), `gurl` ("The HTTP client for AI agents"), `beatbeat` (DeepMind x Lovable hackathon), `native-zellij-bakeoff`, and forks of `openclaw` and `automaton` — [GitHub API](https://api.github.com/users/HamedMP/repos)

**Architecture** — [README](https://github.com/HamedMP/matrix-os), [matrix-os.com/technical](https://matrix-os.com/technical)
- Surfaces: Web shell, CLI, Telegram, WhatsApp, Discord, Slack, Matrix protocol, voice.
- These go through a Hono gateway and WebSocket bus (REST, terminal, files, messages, apps, cron, metrics), then a dispatcher, then the AI kernel (Claude Agent SDK V1 `query()` with `resume`).
- Under the kernel sit "Builder / Researcher / Deployer / Healer / Evolver agents", working over owner-controlled files, Postgres, generated apps and integrations.
- OS metaphor: CPU = frontier model routing (currently Claude Opus 4.6); processes = sub-agents with isolated context; disk = home files plus Postgres; system calls = MCP and gateway IPC; drivers = channels, integrations, browser, terminal, voice.
- Stack: Node 24, Next.js 16, React 19, Hono, PostgreSQL via Kysely, Zod 4, node-pty and xterm.js, integrations via **Pipedream Connect**, Prometheus, Vitest.
- One "VPS-native runtime per active user". Production updates replace application code but preserve the home directory.
- README capabilities include "Automate on schedule: Cron jobs, heartbeat workflows, proactive tasks, and scheduled agent runs" and "Heal and expand: Specialized agents can diagnose failures, repair files, add skills, and grow new capabilities."
- Self-host: `curl -fsSL https://matrix-os.com/install-server.sh | sudo bash` (Postgres, gateway, web shell, code-server, nginx under systemd).

**Agents and products**
- Bring your own agent: Claude Code, Codex, Cursor, OpenCode, Pi, Gemini CLI. "Matrix also hosts Matrix-native agents like Hermes and OpenClaw-style assistants." AI subscriptions are billed separately; agents log in inside the VPS with their own device flows. "Matrix AI Gateway" is coming soon (waitlist) — [matrix-os.com](https://matrix-os.com)
- **Symphony**: "Assign tasks, run agents in parallel, review only what survives… Track what each agent is reading, editing, testing, previewing, and waiting on before you review… Merge what survives review." Example task: "Turn Discord feedback into Linear tasks" — [matrix-os.com/symphony](https://matrix-os.com/symphony)
- **Hermes**: "the resident agent for everything around the code: tool connections, scheduled workflows, notifications, approvals, memory, and everyday actions." Works across GitHub, Linear, Slack, Discord, Gmail, Calendar, Drive, Sentry, Datadog, billing and Matrix apps. Examples: "Create a weekly operating dashboard from GitHub, Linear, Slack, and calendar activity." Background schedules need Builder or Max — [matrix-os.com/hermes](https://matrix-os.com/hermes)
- **Integrations**: "Gmail, Calendar, Drive, GitHub, Slack, Discord, Granola and X", "Eight documented services · bounded actions". "Connections do not turn every app into a complete synchronized database." — [matrix-os.com/features/integrations](https://matrix-os.com/features/integrations)
- **Interfaces**:
  - web app, desktop app (macOS, Windows, Linux) and CLI (`npm i -g @finnaai/matrix` / `brew install finnaai/tap/matrix`);
  - mobile in early access;
  - `matrix run -it --session X -- claude` attaches to a zellij session on the VPS;
  - "a shared surface where a human can jump into the same shell session an agent is using";
  - `matrix sync` mirrors a local folder to the Matrix home;
  - Source: [matrix-os.com/skills.md](https://matrix-os.com/skills.md)
- **MCP server** (stdio via the CLI; hosted Streamable HTTP "not yet enabled"). Tools: list computers, run a captured command, list or create persistent zellij sessions and tabs, send terminal input, read/upload/download bounded files (256 KiB text, 1 MiB binary), list/search/read Matrix chats — [matrix-os.com/docs](https://matrix-os.com/docs)
- **Matrix apps**: real files with a `matrix.json` manifest, Vite + React + TypeScript, `dist/` output, opened in the shell. Skills pack: `matrix-onboarding`, `matrix-cloud-run`, `matrix-github-project` — [skills.md](https://matrix-os.com/skills.md)
- **Recipes**: "Reusable task briefs with the inputs, instructions, expected result, and review boundaries for a job" — [matrix-os.com](https://matrix-os.com)
- **Region**: "Built in Europe… German locations for the computer itself" — [matrix-os.com/what-is-matrix](https://matrix-os.com/what-is-matrix)

**Pricing** — [matrix-os.com#pricing](https://matrix-os.com)

| Plan | Price | What you get |
|---|---|---|
| Starter | $20/mo | One agent or task at a time, always-on, limited storage and snapshots |
| Builder | $100/mo | "Always running", three parallel agents, scheduled/background tasks, region selection, 7-day snapshots |
| Max | $200/mo | Six to eight parallel agents, multiple workspaces, 30-day snapshots, static IP and custom images |
| Enterprise | Custom | — |

- All plans: 3-day trial, card required.
- The prize ("3 months of Matrix") does not specify which plan.

**Founders' stated direction (roadmap, explicitly "not a claim that every… control exists today")**
- Company OS: "Trigger → gather context → agent work → policy check → human review → action → shared record". "Company work should belong to a durable project workspace rather than one employee's private assistant session." — [Matrix blog: company OS series](https://matrix-os.com/blog/company-os-ai-agents-series)
- Trust layer — [Matrix blog: trust layer](https://matrix-os.com/blog/trust-layer-company-ai-agents)
  - "Companies will not trust agents because the model sounds careful. They will trust a system when its authority is bounded, its actions are reviewable, and its failures are recoverable."
  - Approvals bind to exact actions and go stale if the draft, recipient or source changes.
  - "The agent proposes. Policy authorizes. The executor acts."
  - "Evaluations belong to workflow versions… compare a new prompt, template, model… against the accepted baseline before promoting it."
- Their blog has operations-relevant posts:
  - "Building an agent-native deal workspace"
  - "lightweight agent-native CRM"
  - "AI-assisted KYC workflows with human review"
  - "Automating professional-services documents"
  - "marketing ops agent clean data reporting"
  - "sales pipeline updates itself (human control)"
  - Source: [matrix-os.com/blog](https://matrix-os.com/blog)

### Inferences
**What a laptop or plain VPS cannot do here:**
1. Agents keep working overnight while the team sleeps or the laptop is closed, which is real for a 28-hour hackathon.
2. Several heterogeneous agents (Claude Code plus Codex plus Hermes) work on the *same* files, Postgres and context in parallel, and a human can attach to exactly the terminal an agent is driving.
3. Scheduled, connected resident agents hold OAuth to Gmail, Drive, Slack and Calendar via Pipedream.
4. Generated apps become part of the workspace UI.
5. Snapshots provide history and rollback.

A plain VPS could be hand-assembled to do much of this, but not in a weekend.

**What "best use of Matrix OS" probably rewards** (prediction, unverified until the opening). Judging is likely by Hamed and Nima, who come from the Claude Agent SDK and hackathon scene. Expect them to value:
- (a) visibly using always-on and background execution, e.g. "this ran for 14 hours overnight; here is the log";
- (b) multiple agents coordinating on shared context in one Matrix computer;
- (c) a Matrix app or recipe others could reuse;
- (d) integrations and Hermes schedules;
- (e) their trust-layer ideas made concrete: approvals, audit, evaluation per workflow version, human attaching to the agent's session.

A project that builds a tiny version of their "company OS" roadmap would flatter their vision, for example evaluation-gated promotion of an automation, or action-bound approvals.

**Demo ideas that exploit the platform:**
- An "overnight ops lab" (autoresearch for business processes): agents run experiments against historical cases all night on Matrix and present a morning log.
- A live split screen where the human attaches to the same zellij session the agent is in, to approve the one exception it escalated.
- Parallel agents (one discovering, one building, one testing) shown in Symphony.

**Practical risks:** The platform is young: 513 open issues, a "zellij_failed" fallback is documented, and hosted MCP is not enabled. Budget setup time early (Saturday 14:00 workshop). Keep a local fallback for the live demo.

### Gaps
- The exact Matrix tool-challenge criteria are unknown until the opening ceremony.
- No HN discussion or Product Hunt launch stats were retrieved.
- Whether hackathon participants get Builder (parallel agents and schedules) or Starter is not stated.
- "Run any model" in the hub blurb versus "AI usage billed separately / BYO" on the site: there is no evidence that Matrix supplies model credits itself, beyond the $300 prize credits.

---

## Q4. What did past Prompt hackathons reward, and what do the judging notes emphasise?

### Takeaway
Prompt (an Aaltoes initiative, "operated by agents") has run Finance (May), Sales (June) and Marketing (September) flagships in 2026 at Startup Sauna. Published winners exist only for Marketing (hackathon-03).

The single most important signal is Mergero's winner citation: the team won "because they had the most innovative business model for scaling sales, rather than just an application that allows existing sales processes to be done faster." Rubrics consistently weight innovation, scalability, feasibility and concreteness, and judges want a live, working demo on real data. The best featured projects share these traits:
- evidence-grounding (every claim traced to source);
- human approval gates;
- validation against ground truth (e.g. "found 7 of Prenew's 51 partners");
- a measured baseline;
- a concrete pilot plan with a success metric.

### Cited Findings
**Format and rules for this event (hackathon-04, Operations)** — [hackathon-04/info](https://prompthack.aaltoes.com/hackathon-04/info)
- Demos run Sunday 15:10–17:15, "A short demo with each partner. Slots are usually 5–10 minutes."
  - Structure: Pitch ("The problem and your idea, in a minute or two"), Demo ("Show it working — the part that matters most"), Questions.
  - Separate demo rooms for Bahn and Velho. Winners are announced at 17:30.
- Bring: demo already open, a backup recording, "One person talking, one driving".
- Submission is the write-up, strictly by Sunday 15:00. "Include everything judges need to review or run it on their own computers."
- "If you demo on your own laptop and win, organisers check the code wasn't changed after the deadline. If it was, the team is disqualified."
- "Diagrams, flowcharts or a short video are strongly encouraged — the live demo decides."
- Pre-existing code: "Yes, but say so… Judges weight what you built this weekend; pre-existing infra is fine if it isn't the demo."
- Code of conduct: "no undisclosed AI-generated submissions."
- Teams of 1–5 can pick multiple challenges.
- Hub numbers on the eve: 19 builders, 14 teams, "€3k prizes". Next event: Strategy, Nov 28–29 — [prompthack.aaltoes.com](https://prompthack.aaltoes.com)
- The opening ceremony 10:00–11:00 covers "partner challenges revealed, judging criteria" — [hackathon-04 schedule](https://prompthack.aaltoes.com/hackathon-04/schedule)

**Marketing hackathon (hackathon-03, 26–27 Sep 2026): results**
- Mergero challenge, "Scale Mergero's M&A mandate origination", €2,000 — [hackathon-03/results](https://prompthack.aaltoes.com/hackathon-03/results)
  - **Winner: "Mergero-Connect" by La noche.** Judge quote: "This team won because they had the most innovative business model for scaling sales, rather than just an application that allows existing sales processes to be done faster."
  - Honourable mentions: "VideoOutreachOS" (bob the builder) and "Content creation machine" (Meri Team).
- Prenew challenge, "Automating influencer collaborations at scale", €1,000 — [hackathon-03/results](https://prompthack.aaltoes.com/hackathon-03/results)
  - **Winner: "Scout" by team "click here for free cursor credits"** — "Most comprehensive solution covering TikTok and Youtube".
  - Honourable mentions: "V & A – Niche Creator Finder for Prenew" (V & A) and "Treffer" (Treffer).
- By the numbers: 107 builders, 34 teams submitted, 46/48 live demos (the page shows both figures), €3,000 prize pool. The homepage says "61 teams", probably teams formed versus teams submitted — [hackathon-03/results](https://prompthack.aaltoes.com/hackathon-03/results), [prompthack.aaltoes.com](https://prompthack.aaltoes.com)
- Tool partners: Cursor, Biscuit — `prompthack` MCP `list_partners` (hackathon-03)

**Mergero judges' notes** — `prompthack` MCP `list_challenges` (hackathon-03), also at [hackathon-03/challenges/mergero](https://prompthack.aaltoes.com/hackathon-03/challenges/mergero)
- "The greatest weight is on the combination of innovation, scalability and feasibility. The best solution isn't necessarily the most technically advanced — it's the one that could realistically change how Mergero wins mandates, and that they can take into practice."
- Criteria: Innovation ("something Mergero doesn't already do, or hasn't thought of"), Scalability ("thousands or tens of thousands… several countries"), Feasibility ("can Mergero genuinely pilot it"), Impact, Concreteness.
- The brief added: "A solution that credibly cracks one side is worth as much as one that touches everything lightly." "No fixed technology… The best idea may be one they've never considered."

**Prenew judges' notes** — `prompthack` MCP (hackathon-03)
- "Cuts manual effort", "Finds the small ones", "Works in any market", "Fits a real workflow", "Shows real results — ideally demonstrated on a real example".

**Featured project write-ups (not winners, except where marked)**
- **"Content creation machine" (honourable mention, Meri Team)** — [project page](https://prompthack.aaltoes.com/hackathon-03/projects/23e981b6-16e2-49ca-9b11-da6866c58239)
  - Baseline: "We asked 40 real owner and buyer questions… Mergero was named in 0 of 40 answers."
  - Built:
    - a voice AI interviewer (ElevenLabs) that turns advisors' spoken expertise into AI-citable content;
    - a review step where "every sentence is traced to the advisor's words or a data row. Anything the AI added is flagged and blocks publishing until a human accepts or removes it";
    - six languages;
    - "Confidentiality rules run as code before an LLM pass";
    - a seller-readiness shortlist from Finnish public registry data (16,868 IT companies → 772).
  - Next steps: re-run the 40-question baseline as a measurement loop; an 8–12 week pilot.
  - Stack: Next.js, Postgres (Drizzle), Claude, ElevenLabs.
- **"Mergero Origination Desk" (aBARofchocolate: Hai Dang, Amir, Son Nguyen; featured, no award shown)** — [project page](https://prompthack.aaltoes.com/hackathon-03/projects/3b178c44-45ba-4f42-80f7-ca0f42e85c45)
  - Pulled owner-led companies from the open registers of Norway, Finland and Denmark: "Norway alone has 35,113 limited companies with 10–250 staff… its roles register gives each CEO's real age."
  - Extraction rule: "A model extracts the facts and keeps one only if its quote appears on the page it cites."
  - "A rule-based linter blocks templated or AI-sounding text and requires two sourced facts; a humanizer agent rewrites whatever fails."
  - Advisor approves every email within a daily cap. "Also runs as an MCP server."
  - Self-hosted Mistral Small 3 on a Verda GPU in Finland "so no company or owner data goes to an outside AI provider".
  - Pilot plan: six weeks, two advisors, up to 75 emails a day each, success = first calls booked versus current outbound.
- **"Prenew Scout" (aBARofchocolate; featured, no award shown)** — [project page](https://prompthack.aaltoes.com/hackathon-03/projects/4f3a1611-989d-4884-abd0-b4389eca40c7)
  - Plain-words brief → ranked YouTube, TikTok and Twitch creators with evidence-backed scores, contacts, first messages and an Excel export.
  - "Its own searches found 7 of Prenew's 51 partners, four in its top 7 of 237."
  - "Learns from 'Not a fit' reasons."
  - Uses an open-weight model on its own GPU.
- Archive total: 7 shared projects (also Prenew Creator Scout, Prenew Radar, Prometheus "Operating system for all dealflows", Mergero self assessment) — [hackathon-03/projects](https://prompthack.aaltoes.com/hackathon-03/projects)

**Sales hackathon (sales-2026, 13–14 Jun 2026)** — `prompthack` MCP `list_challenges` (sales-2026)
- HMD, "Build HMD's AI-native CRM", €1,000. Judges' notes: "All P0 features must be working… A new user with no training should walk the core scenario end-to-end without getting stuck… Use realistic seed data — an empty database doesn't show the product at its best."
- Immersive, "Build a virtual startup", €1,000 cash plus credits. Winner = "biggest first-day audience".
- Results page still shows "Results coming soon"; 55 builders, 15 teams submitted, €2,000 pool; project archive empty — [sales-2026/results](https://prompthack.aaltoes.com/sales-2026/results), [sales-2026/projects](https://prompthack.aaltoes.com/sales-2026/projects)

**Finance hackathon (finance-2026, 23–24 May 2026)** — `prompthack` MCP `list_challenges` and `list_partners` (finance-2026)
- Sortter: real anonymised messaging and conversion dataset; "Dockerised solution + a short doc"; €2,000 / €500 / €500.
- Taxxa.ai: "Agentic GraphRAG for accounting regulatory research"; planner, extractor, verifier and clarifier agents over a typed graph; €2,000.
- Aiven: an 18-month, ~4M cost-line dataset; "No prescribed problem… show Aiven something they hadn't already seen. Live demo only — no video, no slides-only"; €2,000 "winner takes all · most-surprising team".
- Tool partners: Lovable ("best use of Lovable wins an honorable mention") and Featherless.ai ($300 / $150 / $75 credits to challenge winners).
- Results page "Results coming soon"; 58 builders, €7,000 pool; homepage says 26 teams and 3 challenges; archive empty — [finance-2026/results](https://prompthack.aaltoes.com/finance-2026/results)

**Organiser culture**
- Prompt describes itself as "a movement of builders, founders and experts, operated by agents". Its site shows an "Agent Org" with Operations, Videos, Marketing, Education and Quality agents, e.g. "Quality: Sent a Luma description back. Wrong date."
- Totals: 214 builders and 105 teams across the 2026 flagships; 95 free FI/EN lessons (Prompt Learn).
- Source: [prompt.aaltoes.com](https://prompt.aaltoes.com)
- Organiser contacts listed for hackathon-04: @oliviaronnemaa and @meriheikkinen123 — [hackathon-04/info](https://prompthack.aaltoes.com/hackathon-04/info)

### Inferences
- **Reframing beats acceleration.** The clearest judging signal is Mergero's: the winner changed the *mechanism or business model*; it did not make the existing process faster. Applied to Velho, "a faster way to do Velho's interviews" loses to "a new way Velho finds, proves and maintains automation, so one expert can serve 10× the clients, or so clients pay for proven outcomes".
- **Recurring traits of top projects:**
  - real public data (Nordic registries; the PRH API works anonymously);
  - a quantified baseline ("0 of 40");
  - validation against the partner's own ground truth ("7 of 51");
  - provenance rules enforced in code ("quote must appear on the cited page");
  - human approval gates with caps;
  - privacy (self-hosted model, confidentiality rules before the LLM);
  - an MCP server for the partner's existing workflow;
  - a dated pilot plan with one success metric.
- **Live-demo reliability matters.** HMD's "new user… without getting stuck" and Aiven's "live demo only" notes, plus the info page's "the live demo decides", reward a working end-to-end path with seeded realistic data over breadth.
- **"Most surprising" was an explicit criterion once (Aiven).** Non-obvious insight from the partner's own data is valued; this fits the builder's appetite for "mind-blowing".
- **Prize structure.** Velho's €1,000 against a €3k event pool suggests Bahn offers about €2,000. That would mirror Marketing, where the bigger-prize partner was the more strategic brief. This is unverified.
- **Agent-native ops will land with organisers.** The organisers themselves run an agent org, so they will be receptive to agent-run-operations demos. Judges are the partners, though, not organisers.

### Gaps
- Write-ups for the actual Marketing winners (Mergero-Connect, Scout, VideoOutreachOS, V & A, Treffer) are not in the public archive, so why "Mergero-Connect" was a better "business model" is unknown beyond the one-line quote.
- "Scout" (winner, team "click here for free cursor credits") and "Prenew Scout" (aBARofchocolate, archive) seem to be different teams, but this cannot be confirmed; team display names may differ between pages.
- Finance and Sales winners were never published on the hub (both results pages say "coming soon"; archives empty).
- The judges' notes for Velho and Bahn are unknown until 10:00 Saturday. Once revealed, query `mcp__prompthack__list_challenges` (hackathon-04); it returns `judgesNotes`.

---

## Q5. Hypotheses for Velho's brief, each with a non-trivial solution angle, plus Matrix tool-challenge fit

### Takeaway
Velho's brief will most likely target one stage of its own monthly cycle (Find, Prioritise, Ship or Adopt) or one of its six published use cases. The winning pattern from past judging is to change the mechanism, not speed it up. The strongest angles combine:
- evidence-backed automatic discovery;
- automations that evaluate, maintain and price themselves (autoresearch-style keep/discard loops against held-out historical cases);
- a verification-budget layer that routes only the uncertain few percent to humans.

Matrix OS supplies the always-on, multi-agent substrate that makes overnight loops demoable.

### Cited Findings (anchors used by the hypotheses)
- Karpathy's autoresearch (March 2026): "give an AI agent a small but real LLM training setup and let it experiment autonomously overnight. It modifies the code, trains for 5 minutes, checks if the result improved, keeps or discards, and repeats… you are programming the `program.md` Markdown files that provide context to the AI agents and set up your autonomous research org." Fixed 5-minute budget, single metric (val_bpb). Repo created 2026-03-06, about 98k stars — [github.com/karpathy/autoresearch](https://github.com/karpathy/autoresearch)
- Velho's founders previously built a platform that "generates candidate strategies and evaluates them separately against withheld historical data" — [velho.io/work](https://velho.io/work)
- Velho's quoting use case: "Standard quotes drafted automatically, exceptions routed" — [velho.io](https://velho.io)
- Velho's prioritisation includes effort "to build, and to keep running" — [velho.io/approach](https://velho.io/approach)
- Matrix's architecture already names Healer and Evolver agents, plus cron/heartbeat workflows — [README](https://github.com/HamedMP/matrix-os)
- Matrix roadmap: "Evaluations belong to workflow versions… compare… against the accepted baseline before promoting it"; approvals "go stale" when inputs change — [Matrix trust-layer post](https://matrix-os.com/blog/trust-layer-company-ai-agents)
- Workslop costs about 2 hours per instance; 40% of workers are affected — [TechCrunch](https://techcrunch.com/2025/09/28/the-ai-services-transformation-may-be-harder-than-vcs-think/)
- Mimica-style task mining shows that discovery from UI logs is a known category (desktop recorder, BPMN, RPA) — [UiPath listing](https://marketplace.uipath.com/listings/mimica-task-mining-and-process-intelligence)

### Inferences (hypotheses: likely brief → non-trivial angle)

1. **"Automate the Find step: discover the manual work in a company automatically."**
   - Angle: a *human-middleware detector* over existing digital exhaust (mailbox export, calendar, Drive/Sheets revision history, ERP/CRM audit log, Slack). No installed recorder. Embed and cluster recurring artefacts to find:
     - same-shaped emails;
     - numbers that appear in system A and minutes later in system B (re-keying);
     - spreadsheets edited by several roles on a cadence;
     - "can you send me…" request loops.
   - Output: a ranked backlog in Velho's exact format (value, effort to build and to keep running, time to benefit). Each item carries clickable evidence and an hours-per-month estimate.
   - Demo on a synthetic but realistic Finnish SME dataset (seeded from the PRH API plus generated mail and ERP logs). Show "found 11 opportunities in 3 minutes; 3 matched what the interview found, 8 nobody mentioned."

2. **"Make discovery interviews scale" (they rely on interviews today).**
   - Angle: a voice-agent interviewer (Patrik's Opeton and voice-AI background; the Marketing honourable mention used an ElevenLabs interviewer). It interviews every employee for 10 minutes, then *triangulates contradictions* across people and against the logs from H1: "Anna says the report is automatic; the logs show Mikko re-types it every Monday."
   - Output: a process map with disagreement hotspots, which is where "workarounds nobody wrote down" live.

3. **"Prove the ROI of what we ship" (needed to retain monthly-rolling clients).**
   - Angle: *automation that proves its own ROI*. Every automation ships with shadow mode: it runs in parallel with humans for N days, and the system diffs outputs to get accuracy and time saved before cut-over.
   - After launch it logs counterfactual time, exceptions and human overrides, then auto-writes the monthly value statement ("this month: 41 h saved, 3 errors caught, €X").
   - Non-trivial part: causal attribution with a holdout (a random 10% of cases still go manual).

4. **"Adoption fails: people drift back to the old way."**
   - Angle: an *adoption radar* using the H1 pipe. It detects regression signatures: the retired scheduling spreadsheet is still being edited, quotes are still typed by hand.
   - For each regression an agent finds the *reason*, e.g. the fix doesn't handle case X, then auto-generates the "fix for the fix" into next month's backlog. This literally closes Velho's "what we learned becomes the start of the next cycle".

5. **"Automations rot and nobody maintains them."**
   - Angle: an *automation immune system*. It monitors each automation's input distribution and schema (new ERP export column, new email template, changed portal UI) and replays a frozen regression set of historical cases on every change.
   - On drift, a coding agent on Matrix proposes a patch, re-runs the evals, and opens a reviewable PR that Velho's named expert approves. This uses Matrix's own Healer and "evaluations per workflow version" ideas.
   - Demo: break an input format live and watch it self-repair with a green eval diff.

6. **"Autoresearch for operations" (the Karpathy analogue).**
   - Angle: take one process with history, e.g. 500 past email enquiries and the final human-approved quotes. An agent swarm on an always-on Matrix computer iterates overnight on the automation (prompt, rules, code, retrieval) under a fixed budget per trial. It scores against *held-out* historical cases (exact-match price, correct exception routing), keeps or discards, and logs everything.
   - The human edits only `program.md`, the "ops-org code".
   - Morning demo: accuracy curve from 61% to 93% across 140 experiments, plus the surviving diff. This matches Velho's own "evaluate against withheld history" taste and Matrix's always-on pitch.

7. **"Agents produce more than people can review" (the builder's thesis).**
   - Angle: a *verification-budget router*. Every agent output gets a calibrated confidence score; humans review only the bottom k% (Velho's "send only the unusual cases to the right person").
   - The system *earns autonomy* per case type as approvals accumulate. It shows a calibration plot and spot-audits the auto-approved tail to prove the error rate.
   - Demo: 300 drafted quotes or follow-ups; the human reviews 12; the audit shows 0–1 misses.
   - Pitch line: "we sell trust, not output."

8. **"Quotes and order intake" (Velho's flagship use case).**
   - Angle: don't hand-write pricing rules; *induce* them from historical quotes (rule mining plus an LLM explanation of each rule with provenance). Flag contradictory past quotes as policy questions for the owner. Every drafted quote cites the rules and price-list rows it used. Unusual enquiries route to the right person with a pre-written question.

9. **"Scheduling and dispatch without phone calls"** (also Bahn-adjacent: 500+ drivers, one driver per car).
   - Angle: LLM intake plus a constraint solver (OR-Tools) plus agent outreach to drivers and customers. Humans see only conflicts.
   - Non-trivial part: the agent explains *why* a schedule is optimal and simulates "what if driver X cancels". A single build could be pitched to both Velho and Bahn if briefs allow (the hub permits multiple challenge picks).

10. **"Field reporting: the record is ready when the job ends."**
    - Angle: photos plus a voice note produce a structured report. A *completeness verifier* checks it against the job's checklist and requests the missing photo before the worker leaves the site; vision checks evidence quality. Output goes straight into the job system.

11. **"Management reporting that flags what changed."**
    - Angle: a monthly report computed from source systems, with an *anomaly-first narrative*. Every number links to its query; an explainer agent proposes causes and checks them against transactions before stating them, using the evidence-grounding pattern from past winners.

12. **"Scale the named expert" (Velho's business-model problem).**
    - Angle: a per-client "digital twin of operations": a lightweight Palantir-style ontology of entities, processes, systems, automations, owners and health, kept current by H1 and H5.
    - One Velho expert supervises 10+ clients from a single console (backlog, automation health, adoption, ROI). Bespoke fixes are templatised into reusable recipes, Andrusko's "convert bespoke code into reusable templates each quarter".
    - This is the Mergero-style "new business model, not faster process" answer.

13. **"Find clients who need Velho" (sales, Patrik's domain; mirrors the Mergero brief).**
    - Angle: outside-in opportunity sizing from public signals only: PRH registry, job ads that mention Excel or manual tasks, review complaints about slow quotes, tech-stack fingerprints. The output is a pre-call hypothesis memo ("you likely re-key ~X enquiries a week") to open the 30-minute intro call. Validate on known SMEs.

14. **"Turn a recorded demonstration into a robust automation."**
    - Angle: record a person doing the task once (screen plus narration). An agent compiles the automation *and* actively asks for counterexamples it synthesises ("what if the customer has no VAT ID?") to harden it. This combines with H5 to avoid RPA-style UI brittleness.

**Matrix tool-challenge fit across hypotheses**
- H1, H5, H6 and H12 are native to Matrix: always-on loops, Healer-style repair, parallel agents (Symphony), shared Postgres and files, Hermes schedules, and integrations via Pipedream.
- Demo devices:
  - the overnight experiment log;
  - a human attaching to the agent's live session to approve one exception;
  - a generated Matrix app as the client console;
  - action-bound approvals that visibly go stale when an input changes, realising Matrix's own roadmap.

**Pitch hygiene from past judging**
- Open with a quantified baseline.
- Validate against ground truth.
- Enforce provenance in code.
- Gate actions behind human approval.
- Use real Finnish data.
- End with a 6-week pilot and one success metric.
- Disclose any pre-built code.

### Gaps
- All hypotheses are speculative until the 10:00 opening. Velho may instead pose a narrow client-specific problem (e.g. a real SME's quoting or dispatch data). In that case H8, H9, H10 or H11 become primary, with H3, H5, H6 and H7 as the "non-trivial layer".
- It is unknown whether Velho will supply real client data or expect synthetic data.
- It is unknown whether the Matrix challenge requires building *on* Matrix (hosted VPS) or merely *with* it.
