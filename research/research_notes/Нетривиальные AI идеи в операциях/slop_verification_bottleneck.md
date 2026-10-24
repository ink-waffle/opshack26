# The Inverted Bottleneck: AI Workslop, Verification Debt, and the Verification/Attention Layer for Agent-Heavy Operations (2025–2026)

Scope note: researched 2026-10-24 with WebSearch/WebFetch only. Many 2025–2026 figures come from vendor surveys (Sonar, CodeRabbit, Faros, Cleanlab, Smartsheet), and each is flagged. Where only secondary coverage was reachable, this is stated.

---

## Q1. What hard numbers exist on how much time humans spend reviewing/correcting AI output, and on error rates of unreviewed agent work?

### Takeaway
The evidence agrees across independent sources (academic RCT, large surveys, telemetry). AI shifts effort from producing work to checking it, and the checking is not keeping up. About 40% of US desk workers got "workslop" in a given month, at about 2 hours per incident. 96% of developers don't fully trust AI code, yet only 48% always check it. Teams with heavy AI use merge ~98% more PRs while review time rises ~91%. Agents working alone on realistic business tasks still fail most multi-turn work (~35% success). Perceived speedups are consistently larger than measured ones.

### Cited Findings

**Workslop (knowledge work generally)**
- Definition: "AI generated work content that masquerades as good work, but lacks the substance to meaningfully advance a given task." Authors: Niederhoffer, Kellerman, Lee, Liebscher, Rapuano, Hancock (BetterUp Labs + Stanford Social Media Lab). HBR, 22 Sep 2025 (updated 25 Sep). — [HBR](https://hbr.org/2025/09/ai-generated-workslop-is-destroying-productivity)
- Survey: 1,150 full-time US desk workers, September 2025. 40% received workslop "last month". Each incident took ~2 hours to resolve (1h56m in secondary reports). Cost is $186 per employee per month, or $9M/yr for a 10,000-person company. — [BetterUp workslop page](https://www.betterup.com/workslop); [thesolocreators summary](https://thesolocreators.com/learn/ai-workslop-costing-your-clients/)
- About 15.4% of all the work recipients receive meets the workslop criteria. — [Fast Company](https://www.fastcompany.com/91410108/ai-si-creating-workslop)
- Social cost: about half of recipients saw the sender as less creative, capable and reliable. 42% saw them as less trustworthy, more than a third as less intelligent, and 32% are less likely to want to work with them again. — [Fast Company](https://www.fastcompany.com/91410108/ai-si-creating-workslop); [BetterUp blog](https://www.betterup.com/blog/hidden-costs-workslop?hl=en-GB)
- HBR's framing quotes MIT Media Lab: 95% of organizations see no measurable return on AI investments. Gallup: workplace AI use has doubled since 2023. — [HBR](https://hbr.org/2025/09/ai-generated-workslop-is-destroying-productivity)
- Smartsheet: 80% of AI-generated content is edited before it is finalized. Enterprise "automation intensity" rose 55% YoY and overall activity 46%. That means more output to handle, not less. — [Stack Overflow blog, May 2026](https://stackoverflow.blog/2026/05/21/coding-agents-are-giving-everyone-decision-fatigue/)
- BetterUp links a January 2026 HBR follow-up on why people create workslop. It also runs an open "largest study on workslop" survey, with no published results found. — [BetterUp workslop page](https://www.betterup.com/workslop)

**Software engineering (the best-measured domain)**
- METR RCT (July 2025): 16 experienced OSS developers, 246 real issues randomized to AI-allowed or AI-disallowed. AI-allowed tasks took **19% longer** (CI +2% to +39%). Developers forecast a 24% speedup beforehand and still believed in a 20% speedup afterwards. — [METR 2025](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/); CI from [METR Feb 2026 update](https://metr.org/blog/2026-02-24-uplift-update/)
- METR follow-up (24 Feb 2026): the slowdown finding is "now outdated". For returning developers the new estimate is −18% time (a speedup), CI −38% to +9%. For new recruits it is −4%, CI −15% to +9%. METR calls the results unreliable because **30–50% of developers declined to submit some tasks because they did not want to do them without AI**. That is selection bias, and it is itself evidence of dependence. A separate survey of 349 technical workers (Feb–Apr 2026) found a median self-reported speedup of 3×. METR's transcript analysis suggests one-issue-at-a-time designs understate gains from running several agents in parallel. — [METR Feb 2026](https://metr.org/blog/2026-02-24-uplift-update/); [METR transcript note](https://metr.org/notes/2026-02-17-exploratory-transcript-analysis-for-estimating-time-savings-from-coding-agents/); [METR on X](https://x.com/METR_Evals/status/2026355544668385373)
- Faros AI "AI Productivity Paradox" telemetry (>10,000 devs, ~1,200–1,255 teams; team count differs by source). High-AI teams completed 21% more tasks and merged 98% more PRs. **PR review time rose 91%**, PR size 154%, bugs per developer 9%. Org-level throughput did not clearly improve. Only secondary sources were reachable. A claimed 2026 follow-up ("Acceleration Whiplash", 22,000 devs) reportedly found bugs/dev +54% and production incidents ×3; I could not verify it. — [Augment Code summary](https://www.augmentcode.com/guides/ai-productivity-paradox-engineering-delivery); [getunblocked](https://getunblocked.com/blog/ai-productivity-paradox/index.md)
- Sonar State of Code 2026 (8 Jan 2026, >1,100 devs; vendor). **96% do not fully trust AI code to be functionally correct, but only 48% always check it before committing.** 38% say reviewing AI code takes more effort than reviewing colleagues' code. AI is 42% of committed code, expected to reach 65% by 2027. Sonar describes the burden moving "from creation to verification and debugging". — [Sonar press release](https://www.sonarsource.com/company/press-releases/sonar-data-reveals-critical-verification-gap-in-ai-coding/); [The Register](https://www.theregister.com/2026/01/09/devs_ai_code/)
- CodeRabbit (17 Dec 2025; vendor; 470 PRs: 320 AI-co-authored, 150 human). Issues per PR were 10.83 for AI vs 6.45 for human, about 1.7× overall. Critical issues 1.4×, major issues 1.7×, logic/correctness 1.75×, security ~1.57× (press release says 1.5–2×), readability >3×. — [CodeRabbit report](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report); [The Register](https://www.theregister.com/2025/12/17/ai_code_bugs/)
- Stack Overflow 2025 survey (49k+ devs). 84% use or plan to use AI, but only 60% view it favorably (down from 72% in 2024 and 77% in 2023). 46% distrust AI accuracy vs 33% who trust it, and only **3% "highly trust"**. The top frustration, at **66%, is "AI solutions that are almost right, but not quite"**. 45% say debugging AI code takes more time. — [TechRepublic](https://www.techrepublic.com/article/news-developer-trust-in-ai-declines/); [ShiftMag](https://shiftmag.dev/stack-overflow-survey-2025-ai-5653/)
- DORA 2025 (~5,000 respondents). AI use is near-universal (~90%). Only 24% trust AI output "a lot/a great deal", 30% trust it "a little/not at all", 49% "somewhat". Core thesis: AI is an **amplifier** of existing strengths and dysfunctions. — [TechRepublic](https://www.techrepublic.com/article/news-dora-ai-report-2025/); [InfoQ](https://www.infoq.com/news/2025/09/dora-state-of-ai-in-dev-2025)
- PR-lifecycle preprint (arXiv 2605.08017; 29,585 PRs across Codex, Copilot, Devin, Cursor, Claude Code). Agents initiate ≥96% of work in collaborator-driven repos, but the upper bound on genuinely autonomous merges is **0.07%**. Reported via a vendor blog; not checked against the preprint. — [Tomosu](https://tomosu.ai/blogs/verification-debt.html)

**How often humans actually check: approval fatigue**
- Anthropic (25 Mar 2026): Claude Code users **accept 93% of manual permission prompts**. That is "approval fatigue, where people stop paying close attention to what they're approving". Later coverage reports 97% when auto mode became the default (14 Aug 2026); that figure is secondary. — [Anthropic engineering](https://anthropic.com/engineering/claude-code-auto-mode); [TechWyse](https://www.techwyse.com/news/platform-updates/anthropic-claude-code-auto-mode-default)
- Anthropic "Measuring AI agent autonomy in practice" (18 Feb 2026). Full auto-approve rises from ~20% of sessions for new users (<50 sessions) to >40% by ~750 sessions. Interrupts also rise, from ~5% to ~9% of turns: experienced users stop approving each step and start monitoring and intervening. The 99.9th-percentile turn length grew from <25 min (Oct 2025) to >45 min (Jan 2026); the median stays ~45 s. Internally, human interventions per session fell from 5.4 to 3.3 while success on the hardest tasks doubled (Aug→Dec). In ~1M public-API tool calls, 73% appear to have a human in the loop (an upper bound), 80% come from agents with ≥1 safeguard, and **0.8% look irreversible**. — [Anthropic research](https://www.anthropic.com/research/measuring-agent-autonomy)
- Why Claude stops itself: presenting a choice of approaches (35%), gathering diagnostics (21%), clarifying vague requests (13%), missing credentials (12%), seeking approval (11%). On complex tasks Claude asks for clarification more than twice as often as on simple ones. — [Anthropic research](https://www.anthropic.com/research/measuring-agent-autonomy)

**Error rates of unreviewed or autonomous agent work**
- CRMArena-Pro (Salesforce, 4,280 tasks across 19 business activities). Leading agents reach ~58% single-turn success and **~35% multi-turn**. Workflow execution is easier (>83% single-turn). Nearly half of the analysed multi-turn failures came from the agent not asking for crucial information. — [arXiv 2505.18878](https://arxiv.org/pdf/2505.18878); [the-decoder](https://the-decoder.com/?p=24579)
- TheAgentCompany (CMU). Best agents complete roughly a quarter to a third of simulated office tasks (Claude 3.7 Sonnet 26.3%, GPT-4o 8.6%). Neubig: going from 24% to 34% took months. Secondary only. — [Eastgate Software](https://eastgate-software.com/ai-agent-adoption-stumbles-benchmarks-reveal-only-30-task-success-rate-in-office-use)
- Even the guard has misses. Anthropic's auto-mode classifier has a **17% false-negative rate on real "overeager" actions** (n=52) and 5.7% on synthetic exfiltration, with a 0.4% false-positive rate on real traffic. Anthropic calls the 17% "the honest number". — [Anthropic engineering](https://anthropic.com/engineering/claude-code-auto-mode)
- Real-world slop incidents. Deloitte Australia partially refunded an A$440k government report containing a fabricated court quote and nonexistent references; a researcher found up to 20 errors. — [CTV/AP](https://www.ctvnews.ca/business/article/deloitte-to-partially-refund-australian-government-for-report-with-apparent-ai-generated-errors/). Charlotin's AI-hallucination court-case database: 712 decisions (Dec 2025), then ~1,633 by late June 2026 (~700 in Jan 2026), about 1,116 of them US. — [freeCodeCamp](https://www.freecodecamp.org/news/that-s-embarrassing-why-frontier-ai-still-makes-things-up-and-what-to-do-about-it/); [Bloomberg Law](https://news.bgov.com/us-law-week/ai-faked-cases-become-core-issue-irritating-overworked-judges)
- Gartner (25 Jun 2025): **>40% of agentic AI projects will be canceled by end of 2027** due to cost, unclear value or inadequate risk controls. "Agent washing": only ~130 of thousands of "agentic" vendors are real. — [Gartner](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027.)

### Inferences
- The two anchor numbers for a pitch are the 93% approval rate (humans rubber-stamp) and the 17% classifier miss rate (machine guards leak). Together they make the case that neither per-action human approval nor a single automated gate is enough. Something has to choose which ~1–5% of actions deserve human attention.
- The METR arc (−19% → probably faster, but devs refuse to work without AI) and the persistent perception gap (felt +20% vs measured −19%) show that self-reported productivity is not reliable. A hackathon product should **measure** human minutes per verified unit of work rather than ask.
- The workslop cost figures reconcile if the $186/month applies only to the ~40–41% of employees who receive slop: 10,000 × 0.41 × $186 × 12 ≈ $9.15M. One summarizer misread this as a discrepancy. My arithmetic, not stated on the page.
- The pattern holds across domains: production gets ~2× cheaper or faster, review load rises ~2× (Faros +91% review time, CodeRabbit 1.7× issues), and organisational throughput stays flat. That is the "inverted bottleneck" stated with numbers.

### Gaps
- No primary access to the Faros report or its 2026 follow-up. Use their numbers as "reported".
- No good non-software data on minutes per day spent checking agent output in ops roles such as dispatch, logistics or finance ops. The workslop survey is the closest.
- KPMG/Melbourne 2025 (48,340 people, 47 countries) is reported to show two-thirds relying on AI output without evaluating accuracy. — [Unleash.ai](https://www.unleash.ai/artificial-intelligence/news/66-of-individuals-may-be-using-ai-but-79-are-wary-of-possible-risks-finds-kpmg). Commonly repeated companion stats (~56% made work mistakes due to AI, ~57% hide AI use) were not verified in this session.
- PagerDuty's "only ~3% of alerts need immediate action" figure traces only to secondary sources.

---

## Q2. What does the evidence say about adoption polarisation (blind delegation vs. total distrust) and automation bias?

### Takeaway
Polarisation shows up in the data as people using AI more while trusting it less, and verifying it less than they say they should. Trust in the tool predicts less critical thinking. Experienced users don't stop overseeing; they switch from approving each step to monitoring and intervening. The lesson from the automation-bias literature is that trust has to be **calibrated per task**, not set globally.

### Cited Findings
- Microsoft Research/CMU, CHI 2025 (319 knowledge workers, 936 examples). **Higher confidence in GenAI is associated with less critical thinking; higher self-confidence with more.** Critical thinking moves toward "information verification, response integration, and task stewardship". People apply more scrutiny on high-stakes tasks and less on routine tasks under time pressure. — [Lee et al. via The Register](https://www.theregister.com/2025/02/11/microsoft_study_ai_critical_thinking/); [Microsoft Research](https://www.microsoft.com/en-us/research/?p=1135061)
- The "use more, trust less" gap: 84% use AI and only 3% highly trust it (Stack Overflow 2025). 96% don't fully trust AI code and 48% always verify it (Sonar 2026). — [TechRepublic](https://www.techrepublic.com/article/news-developer-trust-in-ai-declines/); [Sonar](https://www.sonarsource.com/company/press-releases/sonar-data-reveals-critical-verification-gap-in-ai-coding/)
- Dependence: 30–50% of METR study developers withheld tasks rather than do them without AI. — [METR Feb 2026](https://metr.org/blog/2026-02-24-uplift-update/)
- Trust shifts with experience: auto-approve goes from 20% to >40% of sessions, and interruptions from 5% to 9%. Anthropic reads this as a change of oversight strategy, not less oversight. — [Anthropic](https://www.anthropic.com/research/measuring-agent-autonomy)
- Executive/worker split. In a June 2026 survey of 7,675 US adults, 40.1% would let an AI agent act for them. Executives' agentic use is 17.5% vs 6.6% for employees. Top concerns: AI needs human oversight (40.4%) and AI gives wrong information (40.3%). PR-agency source, not neutral. — [Channel V Media](https://channelvmedia.com/blog/state-of-ai-adoption-2026/). WRITER (vendor): 60% of C-suite plan to lay off people who won't adopt AI. — [WRITER](https://writer.com/blog/enterprise-ai-adoption-2026/)
- Automation-bias research. A 2025 review finds explanations sometimes mitigate bias and sometimes worsen it. — [ResearchGate review](https://www.researchgate.net/publication/392771285_Exploring_automation_bias_in_human-AI_collaboration_a_review_and_implications_for_explainable_AI). Interventions-for-reliance work on LLMs: [arXiv 2412.15584](https://arxiv.org/pdf/2412.15584). A registered trial on automation bias in LLM-assisted diagnosis among AI-trained physicians: [medRxiv](https://www.medrxiv.org/content/10.1101/2025.08.23.25334280.full.pdf). Cognitive forcing functions reduce over-reliance where explanations don't, at a cost to satisfaction (Buçinca et al. 2021, via secondary). — [Koji guide](https://www.koji.so/docs/ai-overreliance-automation-bias-research)
- Ability.ai cites a Wharton result: participants followed incorrect AI suggestions ~80% of the time. Not verified at the primary source. — [Ability.ai](https://www.ability.ai/blog/verification-debt-ai-risks)
- "Ironies of Generative AI" (arXiv 2402.11364) applies Bainbridge (1983) to GenAI: automation makes easy tasks easier and hard tasks harder, and turns producers into evaluators. — [arXiv](https://arxiv.org/pdf/2402.11364); practitioner revisits: [Friedrichsen pt.1](https://ufried.com/blog/ironies_of_ai_1/), [Reinbold "Ironies of Agentic AI"](https://matthewreinbold.com/2025/03/13/IroniesOfAgenticAI)

### Inferences
- The builder's thesis that people "swing between outsourcing everything and not trusting agents at all" fits the data well. Global trust/distrust is the wrong control variable. The fix is **per-task-class trust that is measured and shown on screen**, so users can delegate fully on classes with a proven track record and stay strict elsewhere.
- Anthropic's finding that experienced users approve less and interrupt more points to the UI pattern to build: monitoring plus a cheap interrupt, not a modal approval on every step.

### Gaps
- I found no rigorous survey that segments workers into "blind delegators" vs "refusers" with prevalence numbers. The polarisation framing is a reasonable inference from the trust-vs-use gap.
- Classic automation-trust canon (Parasuraman & Riley 1997 "use, misuse, disuse, abuse"; Lee & See 2004 on trust calibration; Sheridan–Verplank levels of automation) was not fetched this session. It is background the writer may know.

---

## Q3. What conceptual vocabulary are people using?

### Takeaway
A shared vocabulary formed in 2025–2026. Generation is cheap and verification is the bottleneck (Karpathy's generation–verification loop and autonomy slider). Unchecked output builds up as **verification debt** (Vogels) and **cognitive debt** (Storey/Willison). Per-step approval decays into **approval fatigue**. Autonomy is a **design dial separate from capability** (L1–L5 levels, "autonomy certificates"). For ops, the old ideas of **management by exception** and alarm rationalisation are coming back.

### Cited Findings
- **Generation–verification loop / autonomy slider** (Karpathy, "Software 3.0", YC AI Startup School, June 2025). AI generates and humans verify; the speed of that loop is what matters. Products should offer an autonomy slider from autocomplete to whole-task autonomy, set only as high as you can verify. Better verification UIs (diffs, previews, tests, logs) help. "Keep AI on a leash": small tasks, narrow scope, incremental changes. — [Latent Space](https://www.latent.space/p/s3); [travis.media summary](https://travis.media/blog/software-3-0-ai-changing-programming-karpathy)
- **"Code is cheap to produce but expensive to review"**: human judgment is the new SDLC bottleneck, which causes decision fatigue and burnout. — [Stack Overflow blog](https://stackoverflow.blog/2026/05/21/coding-agents-are-giving-everyone-decision-fatigue/)
- **Verification debt** is attributed to AWS CTO Werner Vogels (re:Invent 2025, his final keynote): the gap that opens when AI generates code faster than humans can understand it. Sonar adopted the term. — [Implicator](https://www.implicator.ai/werner-vogels-hands-out-newspapers-at-his-likely-final-re-invent-the-man-who-built-the-cloud-isnt-done-teaching/); [Sonar](https://www.sonarsource.com/company/press-releases/sonar-data-reveals-critical-verification-gap-in-ai-coding/). Variant definitions: the gap between default agent quality and production quality ([Ability.ai](https://www.ability.ai/blog/verification-debt-ai-risks)); "invisible until an incident makes it visible" ([Tomosu](https://tomosu.ai/blogs/verification-debt.html)).
- **Cognitive debt** (Margaret-Anne Storey, Feb 2026): a silent loss of shared theory of the system that doesn't show up in failing builds; "a people problem". Willison calls it the best explanation he's seen and reports losing his own mental model of code built with too much unreviewed AI output. Storey's paper proposes a **Triple Debt Model**: technical debt (code), cognitive debt (people), intent debt (externalised knowledge). — [Storey](https://margaretstorey.com/blog/2026/02/09/cognitive-debt/); [Storey revisited](https://margaretstorey.com/blog/2026/02/18/cognitive-debt-revisited/); [Willison](https://simonwillison.net/2026/Feb/15/cognitive-debt); [paper arXiv 2603.22106](https://www.alphaxiv.org/abs/2603.22106)
- **"Your job is to deliver code you have proven to work"** (Willison, Dec 2025): anyone can ship a 1,000-line LLM PR; the professional duty is evidence that it works. Conformance test suites are a "huge unlock" for agents. — [Willison Dec 2025 digest](https://simonwillison.net/newsletters/monthly-2025-12-december/)
- **Approval fatigue** (Anthropic): people stop paying attention to what they approve, so prompts offer "less protection than they appear". — [Anthropic](https://anthropic.com/engineering/claude-code-auto-mode). Related: "the human-in-the-loop illusion". — [Resilient Cyber](https://resilientcyber.beehiiv.com/p/the-human-in-the-loop-illusion)
- **Levels of autonomy as a design choice** (Feng, McDonald, Zhang, UW, June 2025). L1 Operator, L2 Collaborator, L3 Consultant, L4 **Approver** (user engaged only in risky or pre-specified cases), L5 **Observer** (full autonomy, user monitors). A capable agent can still run at low autonomy. The authors propose **"autonomy certificates"** for governance. — [arXiv 2506.12469](https://arxiv.org/html/2506.12469v1); [Knight Institute](https://knightcolumbia.org/content/levels-of-autonomy-for-ai-agents-1). The CSA framework v2.0 (Mar 2026) also uses a 1–5 scale and reports agents deployed at L3–5 without adequate controls (secondary). — [Taskade wiki](https://www.taskade.com/wiki/ai-agents/agent-autonomy-levels)
- **Human-in-the-loop → human-on-the-loop**: Anthropic recommends designing for "trustworthy visibility into agent actions and simple intervention mechanisms" and warns it is "too early to mandate specific interaction patterns". — [Anthropic](https://www.anthropic.com/research/measuring-agent-autonomy)
- **AI as amplifier** (DORA 2025): AI magnifies the strengths of high performers and the dysfunctions of struggling organisations. — [TechRepublic](https://www.techrepublic.com/article/news-dora-ai-report-2025/)
- **"Almost right"** (Stack Overflow 2025): the top developer frustration (66%). — [ShiftMag](https://shiftmag.dev/stack-overflow-survey-2025-ai-5653/)
- **Task stewardship** (Microsoft CHI 2025): critical thinking becomes verification, integration and stewardship. — [The Register](https://www.theregister.com/2025/02/11/microsoft_study_ai_critical_thinking/)
- **Management by exception / control tower**: human oversight "reserved for exceptions rather than required for every routine decision". — [Locus](https://locus.sh/blogs/logistics-orchestration-2026-ai-advisory-to-operational-control/)
- **Shift judgment to the edges**: define requirements, guardrails and allowed dependencies up front, define success and failure modes at the end, and validate outcomes end to end rather than spot-checking prompts. — [Stack Overflow blog](https://stackoverflow.blog/2026/05/21/coding-agents-are-giving-everyone-decision-fatigue/)

### Inferences
- A sharp pitch line built from this vocabulary: **"Attention is the scarce resource; every agent output must pay for the human attention it consumes with evidence."** It combines the gen-verify loop, verification debt and alarm rationalisation (Q6).
- "Autonomy certificates" (Feng et al.) plus Karpathy's slider map directly onto a product: a per-task-class autonomy level that is **earned from measured accuracy** and revocable.

### Gaps
- I found no primary-source attribution for the exact aphorism "generation is cheap, verification is expensive". It is a widely used paraphrase. Cite Karpathy's gen-verify loop and the SO blog instead.
- I didn't locate specific 2025–26 posts by Geoffrey Litt, Kent Beck, Steve Yegge, Hamel Husain or Ethan Mollick on this exact theme within the tool budget.

---

## Q4. What concrete design patterns and mechanisms let teams safely increase agent autonomy over time, and compress or certify agent output instead of adding more?

### Takeaway
Mature patterns have converged. **Shadow mode → canary → per-action-class promotion with automatic demotion**. **Risk-tiered gating**: allowlist, then deterministic rules, then a classifier, with humans only for the residual. **Evidence-carrying outputs**: logs, tests and citations shipped with the claim. **Calibrated confidence and abstention**: trust scores, selective evaluation with provable guarantees. **Statistical spot-checks**: prediction-powered inference gives valid error-rate confidence intervals from a few human labels. Under all of them is a **decision record** of who decided what on which evidence.

### Cited Findings

**Graduated autonomy, shadow mode, canarying**
- Shadow mode means agents run on live inputs with side effects suppressed, and candidate outputs are diffed against what humans actually did. Its blind spot: anything that depends on human reaction can't be measured. — [urandom.io](https://urandom.io/blog/2026-03-02-shadow-mode-for-agentic-ai); [tianpan.co](https://tianpan.co/blog/2026-04-20-shadow-to-autopilot-ai-feature-autonomy)
- Canary: progressive traffic from 10% to 100%, gated at each step on latency, cost, error/refusal rate and feedback. — [TrueFoundry](https://truefoundry.com/blog/agent-gateway-series-part-7-of-7-agent-devops-ci-cd-evals-and-canary-deployments)
- Per-task-class authority: "an agent earns authority one action type at a time", and each step leaves a reviewable record. Routine classes get downgraded to fully automated once consistently handled. **Demotion should be automatic, like a circuit breaker**, on eval drops or rising override rates. **Any change to the agent resets the evidence**, as a canary treats a new version as unproven. Warning: approval oversight decays when reviewers see long runs of correct proposals. Fixes: audit a sample of approved actions and rotate reviewers. A cautionary fintech case: offline evals passed, then segment-level bias appeared three weeks into co-pilot mode, so check segments before each promotion. Practitioner blogs, no standard thresholds. — [tianpan.co](https://tianpan.co/blog/2026-04-20-shadow-to-autopilot-ai-feature-autonomy); [Decagon glossary](https://decagon.ai/glossary/what-is-graduated-autonomy)
- Finance ops variant: run AI reconciliation in parallel with the existing process for 1–2 cycles before switching. Track auto-match rate, exception rate and time to resolve. — [ChatFin](https://chatfin.ai/blog/ai-reconciliation-automation-complete-guide-for-finance-teams)

**Risk-tiered autonomy and deterministic guardrails**
- Claude Code auto mode (Mar 2026), three tiers: (1) a read-only allowlist plus user rules, with broad arbitrary-exec rules dropped; (2) in-project edits with no classifier; (3) everything else goes to a Sonnet 4.6 transcript classifier, a fast yes/no filter with chain-of-thought only on flagged actions. Block rules cover destroying or exfiltrating data, weakening security, crossing trust boundaries and bypassing review. A denial goes back to the agent as a tool result. **After 3 consecutive or 20 total denials the session escalates to a human.** A prompt-injection probe scans tool outputs. — [Anthropic](https://anthropic.com/engineering/claude-code-auto-mode)
- Tool-layer approval gates: HumanLayer's `@require_approval()` decorator on high-stakes functions such as `send_email`. Approvals route to specific people or teams with escalation and timeouts over Slack or email, and denial feedback returns to the agent's context. `human_as_tool` lets agents ask for input, not just approval. — [HumanLayer PyPI](https://pypi.org/project/humanlayer); [humanlayer.dev](https://humanlayer.dev)
- Anthropic's data: only 0.8% of agent actions look irreversible. — [Anthropic](https://www.anthropic.com/research/measuring-agent-autonomy)

**Evidence-carrying / proof-carrying outputs**
- OpenAI Codex is "trained to provide verifiable evidence of its actions through citations of terminal logs and [test outputs/files], allowing the user to validate the model's work". Tasks run in sandboxes. — [OpenAI o3/o4-mini Codex system card addendum](https://openai.com/index/o3-o4-mini-codex-system-card-addendum)
- Reconciliation agents should attach supporting documents, calculations and **reason codes** to every action. — [ChatFin](https://chatfin.ai/blog/ai-reconciliation-and-close-2026-blackline-alternatives-with-agents)
- Willison: test suites as an oracle let agents produce changes that are proven to work. A JustHTML port passes ~9,200 html5lib tests. — [Willison Dec 2025](https://simonwillison.net/newsletters/monthly-2025-12-december/)
- Karpathy **autoresearch** (7 Mar 2026), an extreme example of verification-by-metric. The agent edits only `train.py`, runs a fixed 5-minute experiment, and parses `val_bpb`. It commits on improvement and `git checkout`s on regression, logs every run to results.tsv, and repeats (~12/hour, ~100 overnight). The eval harness and data prep are off-limits to the agent. — [DataCamp guide](https://www.datacamp.com/tutorial/guide-to-autoresearch); [techntrek](https://techntrek.is-a.dev/posts/2026-03-20-karpathy-autoresearch)

**Self-verification, cross-checking, verifier models, calibrated confidence and abstention**
- **Trust or Escalate** (Jung, Brahman, Choi; ICLR 2025 oral). A judge estimates its own confidence and only issues verdicts when confident. **Cascaded selective evaluation**: cheap judges go first and escalate to stronger models, then to humans. This gives a **provable guarantee of human agreement at a user-specified level**. A Mistral-7B-first cascade guarantees >80% human agreement at ~80% coverage, a level GPT-4 alone almost never reaches. — [arXiv 2407.18370](https://arxiv.org/pdf/2407.18370); [ICLR](https://iclr.cc/virtual/2025/oral/31838)
- Cleanlab TLM (vendor) gives a real-time 0–1 trust score per agent response, computed over prompt, response, tool outputs and internal calls. Low scores trigger suppression, escalation to a human or a fallback such as "I'm not sure". On the BOLAA benchmark it cut incorrect responses by 10–56% depending on agent architecture (Act 56.2%, ReAct zero-shot 55.8%, PlanAct 24.5%, PlanReAct 10.0%). — [Cleanlab benchmark](https://cleanlab.ai/blog/agent-tlm-hallucination-benchmarking/)
- Anthropic recommends training models to recognise their own uncertainty and raise issues proactively. Agent-initiated stops already rise faster with task complexity than human-initiated ones. — [Anthropic](https://www.anthropic.com/research/measuring-agent-autonomy)
- CRMArena-Pro: nearly half of multi-turn failures came from not asking for crucial info, so clarification and abstention behaviour matters directly. — [the-decoder](https://the-decoder.com/?p=24579)

**Spot-check sampling with statistical guarantees**
- **Prediction-powered inference (PPI)** combines a small human-labelled sample with large volumes of LLM-judge labels. The result is valid, tighter confidence intervals, "provably unbiased regardless of the LLM judge's error profile" (authors' claim; check the i.i.d. sampling assumptions). Stratified PPI handles heterogeneous segments. In one case, 30 human labels plus Claude 3 Sonnet judgments cut the standard error of Precision@4 by 21%. Power analysis: the required human sample shrinks by about R²×100%. — [arXiv 2606.05308](https://arxiv.org/pdf/2606.05308); [StratPPI arXiv 2406.04291](https://arxiv.org/pdf/2406.04291); [few-label regression arXiv 2411.12665](https://arxiv.org/html/2411.12665v2)

**Provenance trails and decision records**
- CI/CD logs record who executed a merge, not who decided or what they reviewed. Proposed fix: capture the human decision as a structured, attributable event. Tomosu's merge gate scores each PR with a "Production Reliability Index" (change scope, service criticality, AI-origin signal, incident history, compliance exposure) and logs reviewer, timestamp and accepted residual risk. Vendor claim. — [Tomosu](https://tomosu.ai/blogs/verification-debt.html)
- Sonar AC/DC loop: Guide → Generate → Verify → Solve. — [Tomosu summary of Sonar](https://tomosu.ai/blogs/verification-debt.html)

**Ops-specific exception queues and decision briefs**
- project44's Exception Management Agent contacts carriers about rolled containers and updates ETAs, surfacing only the cases needing humans (e.g. "six cases needed your team"). Vendor. — [project44](https://www.project44.com/es/?p=80631)
- Agents escalate only when an exception falls outside their **approved decision scope**. — [Ampcome](https://www.ampcome.com/post/ai-agents-in-logistics-and-supply-chain)

### Inferences
- The most defensible architecture for a hackathon combines four parts. (1) A per-task-class trust state machine (shadow → suggest → auto-with-audit → auto) with promotion from a statistical lower bound on measured agreement and circuit-breaker demotion. (2) An evidence bundle per action. (3) A cascaded verifier that abstains rather than guesses. (4) PPI-style sampling audits that turn ~30 human labels per day into a certified error-rate interval for thousands of actions.
- "Diffs of reality" and replay previews have no single canonical product. The closest relatives are shadow-mode diffing, Codex's sandbox evidence and Karpathy's keep/discard log. This is open space for a demo.

### Gaps
- No published standard for numeric promotion thresholds (e.g. "98% agreement over N≥200 at 95% confidence"). Teams pick them ad hoc.
- I found no peer-reviewed evaluation of shadow-mode-to-autonomy programmes for LLM agents in ops. The evidence is practitioner blogs.

---

## Q5. Which startups/products (2025–2026) are explicitly building the "verification layer" or "attention layer" for agents, and what is their pitch?

### Takeaway
Money is flowing into four adjacent layers. (1) **Observability/evals**: Braintrust, Galileo, LangSmith, Arize, Langfuse, Patronus. (2) **Real-time trust scoring and verifiers**: Cleanlab TLM, cascaded LLM judges, Anthropic's auto-mode classifier. (3) **Code-review verification**: Sonar, CodeRabbit, merge-gate governance such as Tomosu. (4) **Agent identity/governance/permissions**: Baselayer, AIR, Zenity, Oak, HumanLayer. Almost nobody sells an "attention layer" that budgets human review time across all agent output in an operations team. That gap fits a hackathon.

### Cited Findings
- **Braintrust**: $80M Series B (Feb 2026, Iconiq lead; a16z, Greylock, Elad Gil) at an $800M valuation. Pitch: an observability layer for AI. Multistep agent traces can be "hundreds of megabytes per interaction", beyond what traditional monitoring handles. Tracing, LLM-as-judge evals, drift and hallucination monitoring. — [SiliconANGLE](https://siliconangle.com/2026/02/17/braintrust-breaks-80m-series-b-funding-round-become-observability-layer-ai/)
- AI observability market: ~$1.1B raised across 36 startups. "Eval-first overtakes monitor-first". CoreWeave bought Weights & Biases for ~$1.7B. Aggregator figures, unverified. — [neuronfeed](https://neuronfeed.com/category/ai-observability)
- Patronus AI, LangSmith, Arize AX/Phoenix and Langfuse are listed as Braintrust alternatives. Patronus focuses on agent-failure detection. — [Atlan](https://atlan.com/know/ai-agent/ai-agent-evals/braintrust-alternatives.md)
- **Cleanlab**: a "control layer for agents" where every response and tool call is scored for trustworthiness and compliance in real time. — [Cleanlab](https://cleanlab.ai/blog/agent-tlm-hallucination-benchmarking/)
- **Sonar**: positions around "verification debt" and the AC/DC verify loop. — [Sonar](https://www.sonarsource.com/company/press-releases/sonar-data-reveals-critical-verification-gap-in-ai-coding/). **CodeRabbit**: AI code review, publishes data on AI PR defect rates. — [CodeRabbit](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report)
- **Tomosu**: merge-gate governance with a risk score and attributable human-decision records. — [Tomosu](https://tomosu.ai/blogs/verification-debt.html)
- **HumanLayer**: human approval and `human_as_tool` at the tools layer, with routing, escalation and timeouts. — [humanlayer.dev](https://humanlayer.dev)
- **Baselayer**: $35M Series A (Sep 2026, M13). "Trust layer" and agentic fraud consortium. Institutions cryptographically confirm which agent they face, whom it represents, and whether it can safely transact. — [Crunchbase News](https://news.crunchbase.com/ai/verifying-ai-agents-baselayer-35m-raise/); [PR Newswire](https://www.prnewswire.com/news-releases/baselayer-raises-35m-series-a-led-by-m13-launches-identity-infrastructure-for-ai-agents-302885670.html)
- **AIR**: $50M (Sep 2026) to vet the skills, plugins and add-ons agents use. An enforcement layer intercepts and analyses agent actions. — [TechCrunch](https://techcrunch.com/2026/09/01/air-raises-50m-to-help-companies-vet-the-skills-and-add-ons-ai-agents-use/)
- **Zenity**: $125M (Aug 2026, Norwest), governs what agents may do inside enterprise systems. **Oak**: out of stealth Jul 2026 with $60M, agent identity layer. Tracker-sourced. — [gravity.fast tracker](https://gravity.fast/blog/ai-agent-funding-tracker-q3-2026/)
- **Anthropic (platform-level)**: auto mode replaces most human approvals with a classifier, an explicit bet that "automation beats manual review" for routine actions. — [DevOps.com](https://devops.com/anthropic-makes-claude-codes-auto-mode-the-default-betting-automation-beats-manual-review/); [Anthropic](https://anthropic.com/engineering/claude-code-auto-mode)
- **Ops/logistics exception agents**: project44 Autopilot / Exception Management Agent ([project44](https://www.project44.com/es/?p=80631)); Locus orchestration, "advisory → operational control" ([Locus](https://locus.sh/blogs/logistics-orchestration-2026-ai-advisory-to-operational-control/)). **Finance recon**: HighRadius claims 95% auto-match and targets 90% reconciliation automation by 2027; Trintech claims >90% auto-match with AI rule creation. Vendor claims. — [HighRadius](https://www.highradius.com/product/reconciliation-software/); [Trintech](https://www.trintech.com/vista-webinar-ai-financial-close-how-to-increase-match-rates-reduce-exceptions-and-close-faster/)

### Inferences
- The funded players are developer-facing (traces, evals, code review) or security-facing (identity, permissions). An **operator-facing attention layer** is missing: one that decides which agent outputs a dispatcher, finance clerk or fleet manager must look at today, ships each with an evidence bundle, and earns autonomy per task class. That is a credible white space and the hackathon pitch.
- Braintrust's "traces are hundreds of MB per interaction" quote neatly states the problem. Observability *adds* data; the opportunity is *compression*.

### Gaps
- Raindrop, Galileo, Judgment Labs, Haize Labs, Atla and Invariant Labs pitches and 2026 funding were not verified within budget.
- No independent benchmark of the "trust layer" vendors' accuracy.

---

## Q6. What lessons from alarm management (ISA-18.2/EEMUA 191), aviation automation, SRE alert hygiene, healthcare alarms, finance reconciliation and logistics control towers map onto agent-heavy operations?

### Takeaway
High-reliability domains settled on a common answer. **Budget human attention numerically**: ~1 alarm per 10 minutes per operator, floods defined as >10 per 10 minutes. **Rationalise every alert** to one consequence and one required action, with page / ticket / log tiers and symptoms over causes. **Manage by exception** against high auto-match rates. **Keep human skills alive**, because automation reliance erodes manual competence. **Audit the auditors.** Each maps directly onto agent output streams.

### Cited Findings

**Process-industry alarm management (ISA-18.2 / IEC 62682 / EEMUA 191)**
- Target average alarm rate ≈ 1 per 10 minutes per operator (~6/hour), "very likely acceptable". Emerson/DeltaV: <12/hour target, action limit >18/hour. ~12/hour or 300/day is the maximum manageable. — [Emerson](https://d1-live.emerson.com/documents/automation/article-alarm-management-by-numbers-deltav-en-38292.pdf); [open-exam-prep ISA-18.2](https://open-exam-prep.com/study-guides/isa-cap/system-design-hmi-alarms-enterprise/alarm-management-isa182)
- Flood = ≥10 alarms in 10 minutes per operator. Time in flood should be <1% (action limit >5%). Priority mix ~80% low / 15% medium / 5% high. Stale alarms (>24h) <5. Chattering alarms 0. The ISA-18.2 lifecycle includes rationalisation (every alarm justified by consequence and operator action) and performance monitoring. Mostly vendor-sourced; check the standards for authoritative wording. — [Emerson](https://d1-live.emerson.com/documents/automation/article-alarm-management-by-numbers-deltav-en-38292.pdf); [iFactory](https://ifactoryapp.com/article/ai-cement-plant-alarm-rationalization-eemua)

**Healthcare alarm fatigue**
- Joint Commission Sentinel Event Alert: **85–99% of alarm signals do not require clinical intervention**. 98 alarm-related sentinel events (Jan 2009–Jun 2012), 80 of them deaths. This led to a 2013 National Patient Safety Goal on alarm management. The widely quoted "72–99% false" figure is secondary and unsourced. — [Joint Commission](https://digitalassets.jointcommission.org/api/public/content/f65e5c9df2b94000a99445e0a7877007); [nurse.org](https://nurse.org/articles/alarm-fatigue-statistics-patient-safety)

**Aviation automation**
- An FAA study (Kathy Abbott, ~2013, updating a 1996 report) found automation reliance eroding pilot skills, a factor in ~60% of accidents reviewed. Pilots "abdicate too much responsibility" and hesitate to take over in emergencies. The FAA issued a Safety Alert for Operators urging manual-flying practice months before Asiana 214. — [NBC Bay Area](https://www.nbcbayarea.com/news/local/faa-report-pilots-addicted-to-automation/2044684/); [AvWeb](https://www.avweb.com/news/report-automation-erodes-pilot-skills/)
- DOT OIG (Jan 2016): the FAA lacks a process to assess pilots' ability to **monitor** automation and keep manual skills. 2 of 9 airlines discouraged manual flying. The OIG recommended pilot-monitoring metrics. ALPA (2006): basic flying proficiency falls as automation proficiency rises. — [PBS](https://www.pbs.org/newshour/politics/report-government-not-ensuring-airline-pilots-skills-are-sharp); [ETSC](https://etsc.eu/us-government-report-highlights-risks-of-increasing-use-of-automation-in-aviation-sector/)
- Bainbridge's "Ironies of Automation" (1983), applied to agents: automation shifts and amplifies human dependencies rather than removing them. The monitor is left with the hardest, rarest cases and the least practice. — [Reinbold](https://matthewreinbold.com/2025/03/13/IroniesOfAgenticAI); [ferd.ca notes](https://ferd.ca/notes/paper-ironies-of-automation.html)

**SRE / on-call alert hygiene**
- Google SRE book ch. 6 sets guidelines for "which issues should interrupt a human, and which should not". Pages must be immediately actionable with high signal-to-noise. Alert on **symptoms** (user-facing) rather than causes; cause signals go to dashboards or non-paging alerts. There are three tiers: page, ticket, log/dashboard. One person's symptom is another's cause, so symptom paging avoids paging several teams for one fault. — [Google SRE ch. 6](https://sre.google/sre-book/monitoring-distributed-systems/); [Rootly guide](https://rootly.com/alert-management.md)
- Commonly cited, secondary only: >2,000 alerts/week with only ~3% needing immediate action (attributed to PagerDuty). AIOps vendors claim up to 95% noise reduction (self-reported). — [incident.io](https://incident.io/blog/alert-fatigue-solutions-for-dev-ops-teams-in-2025)
- "Alert noise rate" metric: the share of alerts that never became incidents. — [Metabase](https://www.metabase.com/metrics/alert-noise-rate)

**Finance ops reconciliation**
- The standard model is auto-match plus an exception queue. Vendors report 90–95% auto-match. KPIs: automation rate, exception rate trending down, time to resolve exceptions. Parallel-run 1–2 cycles before switching. Every agent action carries supporting documents, calculations and reason codes, with SOC 2 controls and role-based access. — [ChatFin](https://chatfin.ai/blog/ai-reconciliation-automation-complete-guide-for-finance-teams); [ChatFin BlackLine alternatives](https://chatfin.ai/blog/ai-reconciliation-and-close-2026-blackline-alternatives-with-agents); [HighRadius](https://www.highradius.com/product/reconciliation-software/)

**Logistics control towers**
- Shift from "alerting people" to agents resolving exceptions themselves, with human oversight reserved for exceptions. Agents escalate only outside their approved decision scope. "Management by exception 2.0" means preventing exceptions rather than reacting to them. Vendor sources. — [Locus](https://locus.sh/blogs/logistics-orchestration-2026-ai-advisory-to-operational-control/); [Ampcome](https://www.ampcome.com/post/ai-agents-in-logistics-and-supply-chain); [IntelliTrans](https://www.intellitrans.com/resources/white-paper-ai-and-the-future-of-transportation-management)

### Inferences (what transfers to agents)
1. **Numeric attention budget**: give each human reviewer an ISA-style "agent-interrupt rate" target, e.g. ≤6 surfaced items per hour, with flood detection (>10 per 10 min) and time-in-flood as a KPI. Agent output that exceeds the budget isn't a reason to hire reviewers; it is a signal to rationalise.
2. **Rationalisation**: every item routed to a human must name its consequence if ignored and the specific decision required. Otherwise it is a "log", not a "page". This is the direct antidote to workslop.
3. **Symptoms over causes**: surface outcome deviations (late delivery, unreconciled €, SLA risk), not agent internals (traces, reasoning). This is the "diff of reality" principle.
4. **Priority distribution discipline (80/15/5)**: if more than 5% of agent escalations are "high", the classifier is miscalibrated.
5. **Chattering and stale alarm hygiene**: detect agents that escalate the same issue repeatedly and items left unanswered for more than 24h. Either auto-close them or demote the agent.
6. **Skill retention, from the aviation lesson**: make humans periodically do the task manually or answer a forced-choice "what would you do?" before seeing the agent's answer. This fights cognitive debt and keeps humans able to take over (Bainbridge irony).
7. **Monitor the monitor**: the DOT OIG wanted metrics for pilot monitoring. For agents, measure reviewer vigilance directly, e.g. reviewer dwell time and the catch rate on seeded known-bad items.
8. **Exception-based recon as the default ops UX**: auto-match/auto-act on the high-confidence bulk, show only exceptions with reason codes, and parallel-run before cutover.

### Gaps
- Primary texts of ISA-18.2/EEMUA 191 are paywalled. Figures here come from vendor and training summaries.
- The PagerDuty 3% figure is unverified at the primary source.
- No source found for formal "four-eyes / maker-checker" adaptations for AI agents in banking ops, though this is a natural analog.

---

## Q7. What are 10+ non-trivial product/demo ideas for the Prompt Operations Hackathon that attack the inverted bottleneck head-on?

### Takeaway
The strongest ideas share three properties. They **measure** trust instead of asserting it (the autoresearch spirit: a metric decides keep/discard). They **shrink** what a human must read: exceptions, evidence-carrying diffs, single "crux" questions. They **move autonomy in both directions automatically**: earned promotion, circuit-breaker demotion. The partners fit naturally. Bahn has high-volume, consequence-heavy logistics decisions. Velho finds manual workflows and drives adoption, so trust-building is its whole job. Matrix OS's always-on cloud computer suits shadow-mode agents that run for days and accumulate track records.

### Cited Findings (grounding facts each idea builds on)
- Humans approve 93% of prompts, so per-action approval is theatre. — [Anthropic](https://anthropic.com/engineering/claude-code-auto-mode)
- Auto-approve doubles with experience, and trust is earned over hundreds of sessions. — [Anthropic](https://www.anthropic.com/research/measuring-agent-autonomy)
- Per-action-class promotion, circuit-breaker demotion, evidence reset on agent change, and sampled audits of approved actions. — [tianpan.co](https://tianpan.co/blog/2026-04-20-shadow-to-autopilot-ai-feature-autonomy)
- Selective judges with provable human-agreement guarantees and cascades. — [Trust or Escalate](https://arxiv.org/pdf/2407.18370)
- PPI gives certified error-rate intervals from a few human labels. — [StratPPI](https://arxiv.org/pdf/2406.04291)
- ISA-18.2 attention budgets (~6/hour, flood >10/10 min). — [Emerson](https://d1-live.emerson.com/documents/automation/article-alarm-management-by-numbers-deltav-en-38292.pdf)
- Autoresearch keep/discard loop on a fixed metric with a protected eval harness. — [DataCamp](https://www.datacamp.com/tutorial/guide-to-autoresearch)
- Evidence-carrying outputs (Codex logs and tests; reason codes in recon). — [OpenAI](https://openai.com/index/o3-o4-mini-codex-system-card-addendum); [ChatFin](https://chatfin.ai/blog/ai-reconciliation-and-close-2026-blackline-alternatives-with-agents)
- Workslop: 15.4% of received work, ~2h per incident. — [Fast Company](https://www.fastcompany.com/91410108/ai-si-creating-workslop)
- Cognitive debt: humans lose their model of the system. — [Storey](https://margaretstorey.com/blog/2026/02/09/cognitive-debt/)
- Partner descriptions (Bahn: driven car delivery for dealers and fleets; Velho: a monthly expert who finds a team's manual work, builds the fix and drives adoption; Matrix OS: always-on cloud computer for agents) come from the assignment brief, not independently verified.

### Inferences: product/demo ideas

1. **Earned Autonomy Engine (the "trust ledger")**
   - Every agent capability is a *task class*, e.g. for Bahn: "quote ETA to dealer", "assign driver to job", "triage damage photos", "book return train". Each class has its own autonomy level, L1 Operator to L5 Observer (Feng et al.).
   - In shadow mode, every human decision becomes a label. Promotion happens only when a **Wilson/Clopper-Pearson lower bound** on agreement clears a per-class threshold scaled by error cost. An irreversible class needs, say, ≥99% at 95% confidence over n≥200.
   - Demotion is an automatic circuit breaker on drift, override spikes or segment-level gaps. Changing the prompt or model resets evidence to zero.
   - Demo: a live ledger where classes climb levels as data flows. Then inject a regime change (a new dealer CSV format or a strike day) and watch the affected classes auto-demote while the rest stay autonomous.
   - KPI: human minutes per 100 agent actions vs escaped-error rate.

2. **Attention Budget Router ("ISA-18.2 for agents")**
   - Each operator has a hard interrupt budget, e.g. 6/hour. The router scores every agent output by *expected value of human review*: P(error) × cost(error) − review cost. Only the top-k within budget are surfaced; the rest auto-execute with sampled audit.
   - The dashboard shows EEMUA-style KPIs: alarm rate, time in flood, priority mix vs 80/15/5, chattering agents, stale items.
   - Demo: run 500 synthetic Bahn events through it. Without the router the operator gets 120 pings; with it, 9. Show that the 9 contained all seeded critical errors.

3. **Proof-Carrying Ops Actions + Verifier**
   - Agents can't emit a bare claim. Every action ships an evidence bundle: source records quoted with pointers, deterministic checks run (GPS vs promised ETA, invoice total vs rate card), and a stated "what would prove me wrong" check.
   - A separate cheap verifier checks the *bundle*, not the task, and abstains when unsure (Trust-or-Escalate cascade). Humans see one line: claim + ✓/✗ checks + one-click drill-down.
   - Demo: seed hallucinated items. The verifier rejects any claim whose evidence pointer doesn't resolve, so hallucinations die structurally rather than by human vigilance.

4. **Reality Diff ("what changed in the world, and why it matters")**
   - Instead of agent logs or reports, the morning brief is a *diff of world state* since the human last looked: deliveries now at risk, € exposure changed, drivers over hours. Each line is ranked by consequence and linked to evidence.
   - Autoresearch twist: the summariser is optimised overnight against a metric. A simulated or real reviewer must detect planted errors and answer comprehension questions within N seconds. Shorter briefs that keep 100% critical-item recall are kept; others are discarded.
   - The optimisation target is literally "shortest verifiable summary".

5. **Autoresearch-for-Process (the Velho engine)**
   - An always-on agent on Matrix OS watches a team's manual workflows (inbox, spreadsheets, ticket logs). It hypothesises automations and runs each as a *shadow experiment* against historical replay plus live shadow.
   - It keeps or discards by a fixed metric: agreement with human decisions × minutes saved, minus exceptions created. The eval harness, meaning historical ground truth, is protected from the agent, as in Karpathy's protected `prepare.py`.
   - Output: a ranked leaderboard of candidate automations, each with a measured track record, so Velho's expert brings evidence to the adoption conversation rather than a demo.

6. **Certified Batch: statistical spot-checks with guarantees**
   - For every batch of N agent actions, sample ~30 for human labelling, have an LLM judge label all N, and use (stratified) PPI to output: "Error rate on today's 1,842 dispatch decisions is ≤2.1% (95% CI)".
   - Sample allocation is stratified toward high-risk segments. The required sample shrinks as the judge's R² improves.
   - This turns "do I trust the agent?" into "do I accept a certified error bound?" Show the interval tightening live as labels come in.

7. **Seeded-Error Vigilance Monitor ("audit the auditor")**
   - The system slips known-bad synthetic items into reviewers' queues at a low rate and measures per-reviewer catch rate, dwell time and approve streaks.
   - When vigilance drops, as with Anthropic's 93% approval pattern, it cuts that reviewer's queue, rotates them, or raises sampling elsewhere.
   - This answers the DOT-OIG question for agents: is the human monitor actually monitoring? The "human-on-the-loop" claim becomes a number.

8. **Crux Tribunal: cross-examining agents that compress disagreement to one question**
   - Two or three agents with different context or prompting (one red-team) produce answers independently. Where they agree and a verifier passes, the action executes. Where they disagree, a mediator distils the disagreement into **one yes/no crux question** for the human, e.g. "Is dealer X's 'urgent' flag contractual or a habit?".
   - The human answers in 5 seconds instead of reviewing three reports. The answer becomes a durable rule that prevents the same disagreement next time, and the rule set grows as a byproduct.

9. **Time-Machine Preview: replay/sandbox before commit**
   - Before an agent applies a batch (re-plan 40 Bahn deliveries, bulk-email dealers, change pricing), Matrix OS forks state, simulates the batch, and presents only the **outcome diff**: late deliveries −3, driver overtime +2h, dealer X now gets two drivers on Tuesday.
   - Humans approve outcomes, not actions. Rollback is one click because the fork is the change.

10. **Agent Credit Score / calibration market**
    - Every agent (or agent+prompt+model version) must attach a probability to each claim. A Brier/log-score track record per task class becomes its "credit score", which sets routing, autonomy level and audit rate.
    - Badly calibrated agents (overconfident) are demoted even if accurate on average. Agents that abstain honestly get rewarded.
    - The demo compares two agents: one confident and sloppy, one humble and accurate. The market routes work to the second automatically.

11. **Workslop Firewall / effort-weighted inbox**
    - It scores incoming AI-generated documents and messages for substance: verifiable claims per 100 words, novelty vs what the reader already knows, unresolved pointers, and whether a concrete decision or ask is present.
    - Low-substance items get bounced to the sender's agent with "compress to the decision you need and the evidence" before reaching a human. Sender-side, it shows "this will cost the reader ~X minutes".
    - Target: the 15.4% of received work that is slop and its ~2h per instance.

12. **Bahn Exception Control Tower with decision briefs**
    - Agents run routine deliveries end to end. Exceptions (no-show driver, damage on pickup, dealer reschedule, train strike) enter a single queue ranked by consequence and SLA. Each comes with a pre-drafted **decision brief**: situation in 2 lines, 2–3 options with cost/time impact, a recommendation with confidence, and the evidence links.
    - One-tap decisions feed the trust ledger (idea 1), so the queue shrinks each week as classes earn autonomy.
    - Demo KPI: exception rate trending down, like auto-match rate in finance recon.

13. **Cognitive-Debt Meter / comprehension gate**
    - Before an agent's change to an SOP, routing rule or pricing table goes live, the system generates two or three questions the owner must answer about the change's effects, e.g. "Which dealers now get next-day instead of same-day?". It tracks team comprehension over time.
    - When comprehension drops, the agent must produce smaller changes or an explanation. This puts Storey's cognitive debt and the aviation manual-skills lesson into a product.

14. **Rubber-Stamp Detector + adaptive prompts**
    - It instruments approval UIs: time to approve, scroll depth, approve streaks. Where approvals are reflexive (>90% acceptance at <2 s dwell), it removes the prompt and replaces it with sampled audit plus classifier.
    - Where approvals are thoughtful and change outcomes, it keeps them. Net effect: fewer prompts, and the ones left are ones people actually read. This applies Anthropic's auto-mode logic to any ops tool.

**Demo-design notes for a 5–10 min pitch** (inference)
- Open with the paradox numbers: 93% approvals, a 17% guard miss rate, +91% review time, a 15.4% slop share.
- Show one before/after metric pair: *human minutes per 100 agent actions* and *escaped critical errors*.
- Include a live "regime change" moment where autonomy auto-demotes. It shows the system is honest, not just permissive.
- Use autoresearch framing: the system improves its own routing and summarisation overnight against a protected metric.

### Gaps
- No direct data on Bahn's or Velho's actual exception volumes or workflows. The demo needs synthetic but realistic event streams, or partner data obtained on site.
- Thresholds for promotion and attention budgets for non-industrial knowledge work are unvalidated. ISA-18.2 numbers are for control-room operators and should be presented as an analogy and starting point.
- Whether Matrix OS supports state forking or snapshots for the Time-Machine Preview (idea 9) was not verified.
