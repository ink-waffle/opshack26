# X and Reddit sweep (2025 to 2026): AI agents in operations, autoresearch-style loops, agent slop and verification, car transport and dispatch pains

Method: logged-in X search (Top and Latest, with `min_faves:` filters) and Reddit JSON search and comment threads, run in the user's dedicated browser on 2026-10-24. Everything was read-only. Engagement is shown as it appeared on 2026-10-24. Abbreviations: l = likes, rt = reposts, v = views, pts = Reddit score, c = comments.

Reliability caveat: much of X's "agents" discourse is engagement-farming. These accounts post "BREAKING", "holy sh*t" or "made $X while sleeping" style claims about Grok Bot, JEV, MiroFish trading profits, Graphify reposts and similar. I list those items only when the pattern itself matters, and I mark them as unverified. X status pages did not load reply threads in this session, so replies came only from `conversation_id:` searches. Reddit comments were read in full via JSON.

## Which high-signal people on X are talking about agents doing operations autonomously, and what are their most original claims or experiments?

### Takeaway
The most original operational claims on X come from builders who show the loop structure, not just a "the agent did it" result:
- Anthropic marketing ops: dispatcher skill, fresh-context audit agent, human approval, and a manager agent that rewrites skills.
- Vercel: six weeks of shadow mode before launch.
- Flexport's Ryan Petersen: logistics agents that learn new skills from a memory graph.
- Deel: an agent that "watched someone do the job once".
- Weco's Zhengyao Jiang: autoresearch on the autoresearch harness itself, plus a steerable mid-flight loop.

The "autonomous company" claims got the most attention, and the strongest backlash: Polsia ($30M raise), Paperclip, "AI COO" launches. Critics alleged hollow output and fake ARR.

### Cited Findings

**Builders and operators running agents on real ops work**
- Anthropic's marketing ops team runs a multi-agent setup:
  - Every event build, landing page and data import starts as one intake form.
  - A "Dispatcher skill" runs hourly, stamps the ticket "so nothing gets built twice" and only routes.
  - Specialist skills work end to end across CRM, marketing automation, event platform, email and landing pages.
  - An "Audit agent", a fresh Claude instance with zero prior context, submits a test registration, checks the confirmation email in Gmail and closes the Asana task.
  - A human checks every result before it goes live.
  - A "Manager agent" analyzes misfires and proposes changes to the skills.
  - The team built it because cloned event pages kept shipping bugs "like a confirmation email showing the wrong city".
  - The weekly metrics report went from 1 to 2 days to up to 2 hours. A proofreading skill checks every number against a verified source.
  - Quote: "Their main advice: build the proofreading skill first, and turn every correction you repeat into a skill."
  - This is a second-hand summary posted 2026-10-18 (68 l, 2k v). — [@doublenickk](https://x.com/doublenickk/status/2111836581929631794)
- Vercel's internal lead agent "does the work of a 10-person team":
  - They pick boring work by asking "what part of your job do you hate?" and shadowing whoever does it best.
  - The workflow is durable: research, then qualify, then write, then ask a human.
  - Tool calls are capped at 20 per lead.
  - A human approves every send via Slack buttons.
  - Quote: "Shadow mode before launch: Six weeks of their best SDR checking every output. When she stopped finding fixes, it went live."
  - Repo: vercel-labs/lead-agent. Posted 2026-10-18 (540 l, 46k v). — [@undefinedKi](https://x.com/undefinedKi/status/2111917044715204681)
- Flexport CEO Ryan Petersen, 2026-08-10 (1.8k l, 208k v): "We gave our AI agents for logistics an agentic search and memory retrieval graph so now they autonomously learn new skills and capabilities. A major step toward a fully autonomous global supply chain where all the repetitive, error prone work is carried out by super intelligence AI agent swarms." — [@typesfast](https://x.com/typesfast/status/2086837223148962283)
- Deel's internal "Akai" platform:
  - It reportedly removed 40+ hours of monthly reporting across NetSuite, Payhawk and other systems "because an agent watched someone do the job once" (2026-09-22, 530k v). — [@Diptish09](https://x.com/Diptish09/status/2102286403841531975)
  - A separate post claims $140M+ ARR added in 90 days without headcount growth, with "8,000+ AI agents doing the work of ~600 employees" across Finance, HR, AP and Compliance (2026-09-23). These are second-hand posts; I found no primary Deel post. — [@AIwithGhotai](https://x.com/AIwithGhotai/status/2102726439623852286)
- An LLM wiki holding "every employee's responsibilities, workflows, and operational context", run from a "digital twin workspace" (2026-07-07, 1.3k l, 160k v):
  - Commands decompose into per-function skills, and humans approve only security-permission operations.
  - Quote: "the human role is shifting from doing the work to managing, approving, and supervising the system". — [@arrakis_ai](https://x.com/arrakis_ai/status/2074304050880012736)
- Replit CEO Amjad Masad, 2026-07-06 (2.4k l, 598k v): "we closed the loop and the agent is self-improving." — [@amasad](https://x.com/amasad/status/2074257906594177279)
- Fred Jonsson uses Linear to manage agents. Company agents "have eaten through ~400 issues in the past month" (2026-07-19 article, 792 l). — [@enginoid](https://x.com/enginoid/status/2078850177926938666)
- Ben Holmes on a "closed-loop software factory" where agents know "what to fix, what costs to optimize, and... what features to actually build" (2026-10-15, 431 l). — [@BHolmesDev](https://x.com/BHolmesDev/status/2110793920930107817)

**Zhengyao Jiang (Weco, "automated hill climbing with LLMs") has the most original autoresearch claims on X**
- "The first experimental evidence of recursive self-improvement (RSI). Autoresearching the autoresearch agent for eight days. The result beats the harness we hand-tuned for two years, on held-out benchmarks" (2026-07-14, 9.6k l, 1.85M v). — [@zhengyaojiang](https://x.com/zhengyaojiang/status/2077079778793042425)
  - The system, AIDE², has an inner loop that optimizes code against an eval. An outer loop optimizes the inner agent's harness against its average score across benchmarks. — [thread 2/7](https://x.com/zhengyaojiang/status/2077079780575617364)
- Steerability beats full autonomy (2026-06-25, 182k v): "One of our autoresearch runs sat flat for 60 steps. One message got it moving again. Everyone is pushing research agents toward full autonomy, but what helps most is being able to step in when a run goes wrong, without breaking the loop." Each steer becomes its own subtree. — [@zhengyaojiang](https://x.com/zhengyaojiang/status/2070150438884724924)
- Reward hacking in production (2026-07-07): on a fraud-detection preprocessing task, "With a loose API the score looked great, and the code was leaking test data into the features in 13 different ways. We tightened the abstraction to a strict API and the reward-hacking rate dropped to zero." — [@zhengyaojiang](https://x.com/zhengyaojiang/status/2074588869371265031)
- "Production autoresearch is usually killed by reward hacking or side effects. But we still see a pattern that survives: the unit been evaled is functional or near-functional code" (2026-06-22). — [@zhengyaojiang](https://x.com/zhengyaojiang/status/2069116028932501933)
- "Agreed, eval infrastructure is the real bottleneck" (2026-03-21). — [@zhengyaojiang](https://x.com/zhengyaojiang/status/2035420370052735150)
- "the gap between achieving a goal and understanding how it was achieved will become a growing problem" (2026-09-12). — [@zhengyaojiang](https://x.com/zhengyaojiang/status/2098570324715430084)
- He frames the researcher's new role as three skills: creative primitives, "a good abstraction for the agent to search within", and "a good eval on what good is" (2026-07-16). — [@zhengyaojiang](https://x.com/zhengyaojiang/status/2077868497208791369)

**Karpathy (framing-setter)**
- Autoresearch is "just a recipe/idea - give it to your agent and apply to what you care about" (2026-03-09). — [@karpathy](https://x.com/karpathy/status/2031137476438548874)
- Next step, 2026-03-08 (7.5k l): "asynchronously massively collaborative for agents (think: SETI@home style). The goal is not to emulate a single PhD student, it's to emulate a research community of them." — [@karpathy](https://x.com/karpathy/status/2030705271627284816)
- Ops fragility, 2026-03-11 (6.9k l): "My autoresearch labs got wiped out in the oauth outage. Have to think through failovers. Intelligence brownouts will be interesting - the planet losing IQ points when frontier AI stutters." — [@karpathy](https://x.com/karpathy/status/2031792523187040643)
- "Idea file", 2026-04-04 (26.8k l): "in this era of LLM agents, there is less of a point/need of sharing the specific code/app, you just share the idea". — [@karpathy](https://x.com/karpathy/status/2040470801506541998)
- 2026-10-11 (43.7k l, 6.7M v): the gap in shared understanding of LLM capability is "*widening*... more a sharp funnel". — [@karpathy](https://x.com/karpathy/status/2109361546505966046)
- Unverified: several hype accounts say Karpathy "landed at Anthropic". One of them states it "can't verify" parts of its own claim. Do not treat this as fact. — [@AnnatarXBT](https://x.com/AnnatarXBT/status/2092972993186042191)

**Always-on and overnight agents**
- "How to stop your autoresearch loop from cheating" (Sarah Chieng with 0xSero, 2026-03-17, 677 l): "We let an AI agent run overnight. By morning, it had abandoned our experiment and started its own. Across 71 experiments on two very different problems..." — [@MilksandMatcha](https://x.com/MilksandMatcha/status/2033971089853059414)
- "How to Run a 24/7 AI Company with OpenClaw for $50/Month" (2026-02-17, 3.4k l, 1.76M v). — [@ziwenxu_](https://x.com/ziwenxu_/status/2023610499024171077)
- Moltbook, an agent social network (2026-01-31): "overnight, a couple thousand agents had joined their own social network and started building new features". — [@nlw](https://x.com/nlw/status/2017401337353245100)
- A summary of the OpenAI/METR reports (2026-08-28, 416 l): across ~1,200 agents on a shared board, METR "found 0(!) case where an agent actually pursued alerting" staff. This is relevant to always-on monitoring. — [@JustinMiller_NV](https://x.com/JustinMiller_NV/status/2093131301742354865)
- Matrix OS, the hackathon's tool partner, frames its pitch: "everyone has 12 agents and none of them know what the others are doing... give them one place to work same context same tools same files same apps always on" (2026-10-20). Engagement is low, in the tens to hundreds of views. — [@joinmatrixos](https://x.com/joinmatrixos/status/2112636814678729190)
  - Founder: "a computer for your AI agents so they don't die when you close your laptop", started at an Anthropic hackathon in February (2026-09-01). — [@thehamedmp](https://x.com/thehamedmp/status/2094718236340244620)

**"Autonomous company" claims and the backlash**
- Polsia (2026-05-22, 6.5k l, 5.9M v): "Polsia just raised $30M at a $250M valuation... One Founder + AI. Zero employees. Polsia runs companies autonomously. It also ran its own fundraising." — [@Bencera](https://x.com/Bencera/status/2057847644966547920)
  - A 2026-10-19 update claims ~$25M run rate. — [@Bencera](https://x.com/Bencera/status/2112196701083902017)
- Critics (allegations, not verified):
  - "Fake ARR (real ≈ $0) - Fake customers (94% dead) - A human-graded Claude wrapper, not autonomous - A god-mode kill-switch on every company you build" (1k l). — [@NotOnKetamine](https://x.com/NotOnKetamine/status/2058310362647371956)
  - One critic checked three Polsia-launched companies, including "FleetNova (trucking)". Each was "a nice-looking landing page with marketing copy". — [@panphora](https://x.com/panphora/status/2039792403788292156)
  - "How can I block all my domains from getting spammed by Polsia customers every day?" — [@marckohlbrugge](https://x.com/marckohlbrugge/status/2057861392665903491)
- Elizabeth Yin tried Paperclip, an open-source "autonomous company" with multiple agents where "you act as a board member setting vision" (2026-04-02, 1k l). — [@dunkhippo33](https://x.com/dunkhippo33/status/2039807908502704303)
- On "your AI COO" style launches: "massive launches with millions of views, and their 'ARR' grows temporarily but what ends up happening is..." (2026-10-02). — [@annieqyang](https://x.com/annieqyang/status/2105854721999446273)

**Forward-deployed engineering as the delivery model (relevant to Velho)**
- Marc Andreessen, 2026-04-29 (3.8k l): "Rebranding to 'forward deployed engineer' from 'consultant' one of the great all time recruiting whammies." — [@pmarca](https://x.com/pmarca/status/2049610057302831190)
- "Forward Deployed Engineering 101" (2026-05-20, 1.8k l, 741k v). — [@vasuman](https://x.com/vasuman/status/2057177266984226892)
  - The same author: "AI users aren't in the market for a tool to help get work done. They just want the work to be done" (2026-06-26). — [@vasuman](https://x.com/vasuman/status/2070629226664153173)
  - Also: AI shows up on the P&L only with a C-suite sponsor with budget plus "the involvement of the owners of the processes that you're going to be automating" (2026-10-19). — [@vasuman](https://x.com/vasuman/status/2112252709483008049)
- WebDevCody, 2026-09-13: "talk directly with your client, understand their requirements... throw everything into a knowledge base, then let claude code build your demo for tomorrow, rinse and repeat." — [@webdevcody](https://x.com/webdevcody/status/2099230551332794396)
- a16z speedrun, 2026-04-27 (520 l): "the agent is the wedge the network is the moat". — [@tkexpress11](https://x.com/tkexpress11/status/2048784707677294966)

**"Someone should build" and "biggest unsolved problem" posts (category b)**
- "Someone should make a website tracking all the marketing rebrands of the ralph loop/autoresearch/goal/loops technique" (2026-06-16). — [@DanielLockyer](https://x.com/DanielLockyer/status/2066891588647657826)
- Clem Delangue (Hugging Face): "Someone should build a truly multi-model agent that switches between hundreds of different specialized models" (2026-03-19). — [@ClementDelangue](https://x.com/ClementDelangue/status/2034624037616320669)
- Skills are untested: "There are millions of skills available, hardly any was ever tested, and most were vibe-written. The whole skills industry is subjective" (2026-10-19, 554 l). — [@sermakarevich](https://x.com/sermakarevich/status/2112198653469241856)
- "The money in agents right now is not in the frontier. It is in the boring floor. Support. Back office. The two hundred emails nobody actually reads. The refund that needs a number chased" (2026-09-06). — [@Sonofpeace0001](https://x.com/Sonofpeace0001/status/2096489744297341141)
- Logistics control towers: "Would you trust an AI agent to reroute a shipment automatically?" (2026-10-11, 263 l). — [@iliasconfidency](https://x.com/iliasconfidency/status/2109358372222886048)
- Greg Isenberg's "MOST obvious startup ideas" (2026-10-23, 1.2k l) include "Google Analytics for agents". — [@gregisenberg](https://x.com/gregisenberg/status/2113721373482987970)
- Recurring "biggest unsolved problem in agents" claims name trust, memory or context. These are mostly product promos; one example: [@OxideBrowser](https://x.com/OxideBrowser/status/1960718960539685371).

### Inferences
- The production-grade pattern repeats across Anthropic marketing ops, Vercel and Deel:
  1. Watch or shadow the best human.
  2. Make the agent's unit of work small and checkable.
  3. Add an independent verifier: a fresh-context auditor, a proofreading skill, or a test registration.
  4. Turn each human correction into a durable rule or skill.
- This is autoresearch's "keep or revert against a metric" moved onto ops work. The hard part is defining the metric and the verifier, not running the agent.
- "Autonomous company" claims spread fastest and collapse under scrutiny. A demo that shows verifiable outcomes, rather than volume of output, sets itself apart from that noise. FleetNova, a trucking shell business, is a cautionary example.

### Gaps
- I could not open full reply threads on X: status pages did not load conversations. Zhengyao Jiang's "successful attempts" thread (1/6) was recovered only via his curated GitHub list (see the next question).
- I found no first-party Deel, Anthropic or Vercel posts in this sweep. The details above come from second-hand X summaries, though the Vercel post cites a public repo.
- Polsia's real metrics are disputed; I verified neither side.

## What did people actually apply autoresearch-style loops to beyond ML training (pricing, marketing, ops, trading, prompts, SQL, infra)?

### Takeaway
Verified, trace-backed applications cluster where an automatic, cheap, hard-to-game metric exists: code performance, CUDA kernels, prompts scored by an eval set, forecasting models, scientific code and agent harnesses. Business uses (landing pages, cold email, pricing, AP/AR, procurement) are widely pitched on X. Weco's curated list of community-verified use cases contains no pricing, marketing, ops or SQL entries at all. Real-world practitioners report high revert rates and constant reward hacking, and find the value is "killing bad intuitions fast".

### Cited Findings

**The curated, trace-verified list (WecoAI/awesome-autoresearch)**
- [awesome-autoresearch](https://github.com/WecoAI/awesome-autoresearch) asks for use cases "ideally with traces so the community can verify" ([@zhengyaojiang, 2026-03-22](https://x.com/zhengyaojiang/status/2035776039528366203)). Non-ML entries:
  - Shopify Liquid template engine (Tobi Lütke): parse and render 53% faster, allocations down 61% over 93 automated commits.
  - Voice-agent prompt engineering: eval score 0.728 to 0.969.
  - CUDA kernels: 18 to 187 TFLOPS (RightNow AI).
  - TPU MFU and tokens per second.
  - Bitcoin price-formula discovery: 328 experiments, 50.5% lower RMSE, validated with walk-forward testing.
  - Driveline baseball pitch-speed model: R² 0.44 to 0.78.
  - Tennis XGBoost model, where the author documented reward hacking.
  - Earth-system fire correlation: 0.09 to 0.65.
  - Protein folding: 150+ hours of autonomous runs.
  - Vesuvius scroll ink detection with a 4-agent swarm.
  - AutoZyme bioinformatics: 16.7x median speedup, with output concordance verified.
  - Flappy Bird agent: 2.76 to 20.9 for about $12.
  - Weco's agent took 7 of 47 OpenAI Parameter Golf records over 1,243 experiments in 22 days.
  - Autoresearch-on-autoresearch: reward hacking on KernelBench fell from 63% to 34%.
  - FML-bench: "a simple greedy hill-climber nearly matches the best tree-search agent".
  - The list has no pricing, marketing, operations or SQL entries.
  - Forks include pi-autoresearch (test speed, bundle size, Lighthouse scores), CORAL (parallel Claude Code agents in git worktrees sharing notes), auto-agent (golden dataset) and agent-digivolve-harness (one bounded mutation per iteration).
- Tobi Lütke, the night after release (2026-03-08, 4.7k l, 800k v): "OK this thing is totally insane. Before going to bed I..." pointed his agent at a qmd query-expansion model. — [@tobi](https://x.com/tobi/status/2030771823151853938)

**Trading and markets**
- Chris Worsey, 2026-03-11 (3.9k l, 814k v): "25 AI agents debate macro, rates, commodities, sectors, and single stocks daily. Every recommendation scored against real outcomes. Worst agent by rolling Sharpe gets its prompt rewritten by the system. Keep or revert. Same loop, prompts are the weights, Sharpe is the loss function."
  - 378 iterations; 54 prompt modifications, of which 16 survived.
  - "The agents even figured out their own portfolio manager was the weakest link before we did!"
  - He claims +22% in 173 days and now runs it with his own capital. These are self-reported returns. — [@Chris_Worsey](https://x.com/Chris_Worsey/status/2031821234795659717)
- MiroFish, a simulation-first multi-agent engine that "simulates how thousands of people react to any event". A Chinese quant student built it in about 10 days; it reached 13k+ GitHub stars and a reported $4M in funding (2026-03-13, 3k l, 1.17M v). — [@slash1sol](https://x.com/slash1sol/status/2032564109791703167)
  - There is a fully local English fork. — [@nikmcfly69](https://x.com/nikmcfly69/status/2033147482331390328)
  - The surrounding "made $360k / copied the wallet" claims are unverified hype.

**Marketing, copy and business**
- Eric Siu, 2026-03-09 (1.6k l, 306k v): "Karpathy's autoresearch isn't just for AI research. You can use it for business... Landing pages - Creatives - AEO/SEO - Pricing - E-mails - Cold outreach - Warm outreach - AP/AR - Procurement". This is a pitch, not results. — [@ericosiu](https://x.com/ericosiu/status/2031046227333443609)
- Landing-page copy: "Ole Lehmann tested it on landing page copy, 56% → 92% pass rate overnight" (2026-03-24, 3.8k l, 1M v). The metric is a rubric pass rate, not conversions. — [@shannholmberg](https://x.com/shannholmberg/status/2036461256006357409)
- AutoReason, autoresearch for subjective domains: "instead of a metric, it uses a loop of agents arguing with each other" (2026-03-31, 1.4k l). — [@shannholmberg](https://x.com/shannholmberg/status/2038866414057161145)
- Pricing: Nebula "scraped pricing data, trained a model, and delivered a full report on how to optimize pricing tiers" (2026-04-02, 15 l). This is a low-signal vendor demo. — [@NebulaAI](https://x.com/NebulaAI/status/2039823937887174983)

**Prompts, skills, harnesses and agents**
- Autoharness: Claude Code explores harness changes (prompts, hyperparameters, runtime context, scoring), runs evals and keeps only improvements. It reports +40.7% on tau2-airline. A skeptic replied: "multiply token usage without creating value" (2026-05-09, 225 pts). — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1t8cn9y/claude_improved_my_agent_harness_by_407_overnight/)
- "We Used Autoresearch on Our AI Skill, It Taught Us to Write Better Tests" (2026-03-27, 337 l). — [@lotte_verheyden](https://x.com/lotte_verheyden/status/2037665098983190904)
- jevgrep: after 24 hours of autoresearch loops it reached parity with codex and Claude subagents at 30% less cost (2026-09-28, 493 l). — [@dzhng](https://x.com/dzhng/status/2104405629993676961)
- Nvidia's SoL-Pi: "a Pi-Extension based on AutoResearch loops to make the Harness more efficient" (2026-09-10, 323 pts). — [r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/comments/1wcujgg/pi_agent_users_nvidia_released_solpi_a/)
- AHA ("Agent Hacks Agent"): autoresearch for red-teaming production tool-using agents (July 2026 paper). — [@AlAssaf_H](https://x.com/AlAssaf_H/status/2091785000832073993)

**Real codebases and infra**
- "Autoresearch with Claude on a real codebase (not ML training): 60 experiments, 93% failure rate, and why that's the point" (2026-03-24). — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1s22f7d/autoresearch_with_claude_on_a_real_codebase_not/)
  - Target: a production hybrid search system (Django, pgvector, Cohere). 3 changes kept, 57 reverted, score +0.03.
  - What it learned: title matching is net negative; larger candidate pools have no effect ("Problem was ranking, not recall"); the hand-built adaptive weighting is validated.
  - A commenter: the value is "quickly killing bad intuitions... without you burning a week on it".
- Local inference speed: autoresearch on Qwen3.5-397B, 36 experiments to 20.34 tok/s on an M5 Max (2026-03-30, 164 pts). — [r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/comments/1s7g8ov/autoresearch_on_qwen35397b_36_experiments_to/)
- SkyPilot: 16 GPUs, 8 hours, 910 experiments, 9x faster to the same result. "the agent had access to both H100s and H200s. Without being told, it noticed H200s" were faster (2026-03-19, 1k l). — [@Michaelvll1](https://x.com/Michaelvll1/status/2034695039725838584)
- "Autoresearch for chips" (2026-10-13). — [@Willschips](https://x.com/Willschips/status/2110025335408644493)
- Golf forecasting: 49 hours, 108 experiments, no human (2026-04-14). — [@tinkerapi](https://x.com/tinkerapi/status/2044093067372965897)
- Sample efficiency under a fixed 10M-token budget: overnight +14% (2026-03-11, 428 l). — [@paraschopra](https://x.com/paraschopra/status/2031710434190098495)

**Science, research and embodied**
- autoarxiv: "Change 'arxiv' to 'autoarxiv' in any paper URL". An agent resolves setup, runs a minimal reproduction and estimates full replication cost (2026-06-18, 2.7k l, 488k v). — [@askalphaxiv](https://x.com/askalphaxiv/status/2067593673072877833)
- ENPIRE: "Autoresearch just left the sandbox and entered the embodied world... drops frontier coding agents onto a fleet of real robots and hands them the entire loop: reset the environment → search the literature → implement ideas" (2026-06-16, 498 l). — [@_wenlixiao](https://x.com/_wenlixiao/status/2066913044652015727)
- "Idea basins": "runs settle into different 'idea basins' and stay there". The proposed fix is fork-and-flush (2026-10-11, 646 l). — [@jackcai1206](https://x.com/jackcai1206/status/2109101112988950691)
- A swarm "crushed SoTA in 3 days" on Karpathy's NanoChat benchmark, using a graph-database harness that learns from mistakes, with ">15,000 entries" (2026-09-15, 1.3k l). — [@hyperparticle](https://x.com/hyperparticle/status/2099861544481731058)
- Counter-signal: "Frontier AIs (Claude Code, Codex, Autoresearch) are failing at AI R&D" (IntologyAI, via r/singularity, 2026-05-19). — [r/singularity](https://www.reddit.com/r/singularity/comments/1thx2kj/frontier_ais_claude_code_codex_autoresearch_are/)
- Buzzword fatigue: "Auto research and karpathy everywhere, it feels like openclaw buzzword all over again" (147 pts). — [r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/comments/1rxoa6n/auto_research_and_karpathy_everywhere_it_feels/)
- "Autoresearch hit 42,000 GitHub stars in a week [because] the architecture ports to anything with a score... train.py is the code the agent edits. val_bpb is the metric. program.md is the human's research direction." — [@aakashgupta](https://x.com/aakashgupta/status/2038132294817656978)

### Inferences
- The gap between what has been verified (code, kernels, forecasting, prompts with eval sets) and what has been pitched (pricing, outreach, ops) exists because ops lack a cheap, trustworthy, ungameable score.
- Building that missing piece for an ops domain is the non-trivial, autoresearch-spirited contribution: a scorer or simulator for, say, a car-delivery schedule, plus an anti-reward-hacking API boundary. Jiang's fraud example shows that how tight the API is decides whether the loop is useful or cheating.
- Practitioners report that most experiments get reverted: 93% in one real codebase, 16 of 54 prompt edits surviving in Worsey's loop. The deliverable that matters to humans is the distilled "what we learned and why", not the diff. That speaks directly to the absorption and verification problem.
- MiroFish-style simulation-first agents ("simulate how thousands of people react") are a live meme. "Simulate the ops day before committing" is a credible demo framing if the simulator itself is validated against history.

### Gaps
- I found no credible, trace-backed public example of autoresearch on pricing, SQL query optimization or logistics/dispatch scheduling in this sweep. Claims exist only as pitches. Other researchers may find papers or blogs.
- Business marketing results (for example 56% to 92%) use rubric or LLM-judge scores, not live conversion data; I could not verify downstream impact.

## What do operators on Reddit say is the real bottleneck now: doing the work, or checking/absorbing what AI produced?

### Takeaway
It depends on where you sit.
- Ops practitioners (supply chain, logistics, freight, small business) say the bottleneck is still the glue work: moving data between systems, chasing replies, tribal knowledge. Their AI complaint is unreliable automation that creates new noise, such as AI check calls, voice bots that hang up on carriers, and hallucinated decimals.
- Engineers and AI-heavy knowledge workers now clearly say the bottleneck is review, comprehension and trust. "Workslop", "comprehension debt", "approval fatigue" and "verification bottleneck" all became named concepts in 2025–26.
- The proposed fixes converge on agents producing evidence, independent fresh-context verifiers, risk-tiered approvals, shadow mode, and constraining the action space.

### Cited Findings

**Ops practitioners: the work itself is still glue, and info moves slower than freight**
- "How much of your supply chain job is basically being human middleware?" (r/supplychain, 2026-07-30, 144 pts, 68 c). The poster describes pulling from SAP or Oracle, cleaning in Excel, emailing for the missing piece, updating a tracker, sending a Teams message, and rebuilding the same report next week. It all "depends on one person knowing which spreadsheet to update, who to chase, and what needs to happen next."
  - A Sr Director replied "about 99% sadly. I'm the translator between the operational level and the executive level" [54].
  - Another replied: "'Random question' just so I can figure out how to make you lose your job to AI" [42]. — [r/supplychain](https://www.reddit.com/r/supplychain/comments/1vb41jd/how_much_of_your_supply_chain_job_is_basically/)
- "Half the delay is usually people waiting for updates from each other" (r/logistics, 2026-05-26, 76 pts, 43 c): "Feels like sometimes the freight moves faster than the information around it." Replies: "10 emails = 1 phone call" [16]; "Logistics is just communication. Bad communication is bad logistics" [10]. — [r/logistics](https://www.reddit.com/r/logistics/comments/1to2wii/half_the_delay_is_usually_people_waiting_for/)
- "Spent a fortune implementing netsuite, and we're still spending 40% of the week manually cleaning data in the sheets... PO updates, inventory recon, shipment tracking etc all feel like glue work." Micro tasks of 5 minutes, many times a day, add up to 5–10 hours a week of copy-paste (r/logistics, 2025-12-01). — [r/logistics](https://www.reddit.com/r/logistics/comments/1pb81k0/need_some_help/)
- "Operations people: what recurring part of your job wastes the most time but still cannot be fixed properly?" (r/supplychain, 2026-09-27). Answers: customs documents ("One wrong tariff code and the consignment sits at customs while everyone points fingers"), monthly physical counts, and freight damage and returns claims. — [r/supplychain](https://www.reddit.com/r/supplychain/comments/1wrkway/operations_people_what_recurring_part_of_your_job/)
- A logistics ops manager at a large company asked how people actually use AI under corporate constraints (r/supplychain, 2026-04-13, 77 pts). Real uses: trimming decks, softening emails, and Copilot-written code to ingest "several hundred excel spreadsheets with similar, but not exact formatting" [22]. — [r/supplychain](https://www.reddit.com/r/supplychain/comments/1skp6i0/people_at_large_companies_how_are_you_actually/)
- r/smallbusiness, 2026-09-17 (307 pts, 174 c): "trying to map 5,000 messy supplier SKUs into my inventory system... I need a basic OCR tool that can read a vendor's paper catalog and doesn't hallucinate a comma into a decimal point on a bulk hardware order."
  - Replies split: "$20 a month codex/claude subscription" can do it [191], versus "The prob is inserting data into his existing system" [21]. — [r/smallbusiness](https://www.reddit.com/r/smallbusiness/comments/1wigjwk/is_anyone_else_completely_fed_up_with_this_new_ai/)
- "Accidentally saved a client ~$30k a year just by watching how they actually worked" (r/automation, 2025-12-02, 718 pts). Half the clinic's "data entry" was copy-paste between forms, spreadsheets and email. Reply: "Watch the work, not the dashboards... Most wins aren't AI, they're removing friction and enforcing single source of truth" [32]. — [r/automation](https://www.reddit.com/r/automation/comments/1pbticx/accidentally_saved_a_client_30k_a_year_just_by/)
- "90% of small businesses can't use Make or n8n, and ChatGPT isn't automation" (r/automation, 2026-07-08, 152 pts, 158 c). Replies:
  - "The best automation is the one people can actually keep using without calling someone every week" [42].
  - "the missing layer is... 'operations ownership surface'. Small businesses usually do have someone who owns the outcome: the office manager, dispatcher, bookkeeper... What they don't have is a safe way to..." [11]. — [r/automation](https://www.reddit.com/r/automation/comments/1uqn3ex/unpopular_opinion_90_of_small_businesses_cant_use/)
- Selling automation is hard (r/n8n, 2026-01-28, 657 pts, 226 c): "Every single time I say the word 'automation'... they mentally check out."
  - A successful seller: "An ideal customer is a business doing $5M+ per year" [171].
  - Client point of view: "this snake oil salesman wants access to my internal business information" [29]. — [r/n8n](https://www.reddit.com/r/n8n/comments/1qpewps/fuck_everyone_saying_selling_n8n_automations_is/)

**Freight: AI automation that creates new noise and distrust**
- "AI enshittification" (r/FreightBrokers, 2026-06-06, 65 pts), from a carrier: "the robo calls, the stupid email chatbots... It trains you to hate it... Eventually you just learn which brokers are using it and you stop calling them."
  - A broker replied: a customer "turned their entire logistics over to AI- it's free money. No live person knows a thing about freight or rates" [18]. — [r/FreightBrokers](https://www.reddit.com/r/FreightBrokers/comments/1ty6ep1/ai_enshittification/)
- "AI is just causing rates to go up" (2026-05-19, 46 pts): the AI says "you cannot work with this brokerage", with no route to compliance, so carriers quote "ridiculous high rates for brokers who use ai".
  - "Everyone hates it except the execs... completely fucks up capacity in quick shifting tight markets" [25].
  - The screening rules are rigid: minimum CSA score, authority age, cargo coverage, ELD active in the past 2–3 weeks [3]. — [r/FreightBrokers](https://www.reddit.com/r/FreightBrokers/comments/1thoxwh/ai_is_just_causing_rates_to_go_up/)
- "AI check calls are out of control" (2026-10-13, 54 pts): 12 calls a day, "9 calls in a row". Replies: "If your tracking is working you should not be getting check calls" [23]; block the number and update the rate-con email thread [24]. — [r/FreightBrokers](https://www.reddit.com/r/FreightBrokers/comments/1x535ku/ai_check_calls_are_out_of_control/)
- On a FreightWaves AI auction with 96 carriers (2025-12-31, 85 c): "can it make judgment calls like smelling bs from a double broker". A broker running AI for inbound carrier calls says it "books them or transfers to a human when its questions it cant answer". — [r/FreightBrokers](https://www.reddit.com/r/FreightBrokers/comments/1q0lr3g/saw_this_freightwaves_video_of_an_ai_run_a_real/)
- A C.H. Robinson insider (2026-06-18, 55 pts, 64 c): $250M a year on tech and "going all-in on AI" while "our flagship product (Navisphere TMS) remains a WinForms application running over RDP, propped up by thousands of lines of SQL Server stored procedures". — [r/FreightBrokers](https://www.reddit.com/r/FreightBrokers/comments/1u8xh7g/ch_robinson_tech/)
- Community backlash against AI tool builders: "These guys are trying to make ai prospecting and ai back office tools. They don't know the slightest thing about the industry" (2026-10-23, 84 pts). — [r/FreightBrokers](https://www.reddit.com/r/FreightBrokers/comments/1xdg0q8/petition_to_ban_the_wanna_be_entrepreneur_posts/)

**Engineers: the bottleneck is review and comprehension**
- "An AI CEO finally said something honest" (r/ExperiencedDevs, 2026-02-16, 23,908 pts, 822 c), quoting Dax Raad: "your org rarely has good ideas. ideas being expensive to implement was actually helping"; workers are "using it to churn out their tasks with less energy spend". One commenter got 30 AI-made PRs and was told he "could use a curl script to approve them" [451]. — [r/ExperiencedDevs](https://www.reddit.com/r/ExperiencedDevs/comments/1r6olcv/an_ai_ceo_finally_said_something_honest/)
- "Today I announced that I won't be reviewing AI generated PRs" (2026-05-27, 1,921 pts, 437 c): "AI generated code looks good and plausible, so it will lead to bugs and security issues." Top reply: "No one should be raising PRs they don't understand" [1771]. — [r/ExperiencedDevs](https://www.reddit.com/r/ExperiencedDevs/comments/1towli9/today_i_announced_that_i_wont_be_reviewing_ai/)
- "The AI coding productivity data is in" (2026-03-07, 1,402 pts) cites an Anthropic RCT (17% lower comprehension, gains not significant). A reply cites devs who estimated they were 24% faster but were 19% slower. These are second-hand; the second matches the 2025 METR study. Commenters flagged the post itself as "AI slop" [179]. — [r/ExperiencedDevs](https://www.reddit.com/r/ExperiencedDevs/comments/1rnkv2t/the_ai_coding_productivity_data_is_in_and_its_not/)
- "Executives are blindly trusting ChatGPT outputs over their own staff" (r/ChatGPTPro, 2026-05-20, 313 pts): "They aren't even reviewing the output." A counter-reply: "ChatGPT gives better advice than 80% of staff" [15]. — [r/ChatGPTPro](https://www.reddit.com/r/ChatGPTPro/comments/1ti7b73/executives_are_blindly_trusting_chatgpt_outputs/)
- "We automated everything and now nobody trusts anything" (r/Entrepreneur, 2026-01-27, 329 pts, 224 c): "if you send 1000 emails and get 0 replies, you are not doing sales." Reply: "Automation works when trust already exist... scale just amplifies noise" [23]. Another notes a top comment is itself a ChatGPT bot. — [r/Entrepreneur](https://www.reddit.com/r/Entrepreneur/comments/1qof5yc/we_automated_everything_and_now_nobody_trusts/)
- Workable practice from a decade-experienced engineer who vibe-codes without reading code (r/ClaudeAI, 2026-05-20, 2,233 pts): "READ THE PLAN". A reply: "keeping the agent scope boringly small: one change, one expected test, one rollback point... prompt also says what it intentionally did not touch" [34]. — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1tj2i90/im_a_software_engineer_with_a_decade_of/)
- A peer-review gate across 13 agents (r/ClaudeAI, 2026-02-27, 460 pts): "the peer review gate is the real insight... catches hallucinated data and strategic drift before it reaches you" [48]. — [r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1rga7f5/how_i_built_a_13agent_claude_team_where_agents/)
- "Flying blind with AI: what we learned from 75 customer calls" (r/ycombinator, 2026-07-15): "Nobody has solved ROI, and everyone knows it." Reply: "when you quantify the illegible hard enough, you get a beautiful dashboard measuring the wrong war." — [r/ycombinator](https://www.reddit.com/r/ycombinator/comments/1uxdtvk/flying_blind_with_ai_what_we_learned_from_75/)

**The X discourse on workslop, verification and trust calibration (category c)**
- Workslop:
  - Alex Cohen's all-hands slide: "Tired of consuming workslop" (2026-07-14, 4.8k l, 836k v). — [@anothercohen](https://x.com/anothercohen/status/2076872013570814405)
  - Polymarket: "a flood of 'workslop' that takes longer to fix than do from scratch" (2026-04-15, 9k l, 1.27M v). — [@Polymarket](https://x.com/Polymarket/status/2044404118383366592)
  - Origin: Harvard Business Review / Stanford research (Sept 2025). — [@zerohedge](https://x.com/zerohedge/status/1971566719878525165)
- Verification bottleneck:
  - "The Economy's Next Bottleneck Is Verification: As AI agents automate execution, the core challenge to scaling the economy becomes automating verification" (2026-03-17). — [@spjoleh](https://x.com/spjoleh/status/2033915090936664253)
  - Christian Catalini: "The verification bottleneck, in one chart" (2026-08-14). — [@ccatalini](https://x.com/ccatalini/status/2088267414672990641)
  - Werner Vogels: "The verification bottleneck is more important than ever" (2026-06-15). — [@Werner](https://x.com/Werner/status/2066553499463418078)
- Comprehension debt:
  - Karpathy: "Love the word 'comprehension debt'... It's so very tempting to just move on when the LLM one-shotted something that seems to work ok" (2026-01-26, 1.4k l). — [@karpathy](https://x.com/karpathy/status/2015887919924617657)
  - Addy Osmani: "Cognitive surrender is when the AI's output quietly becomes 'your' output and there is nothing you feel is left to check" (2026-05-06, 954 l). — [@addyosmani](https://x.com/addyosmani/status/2052124873208799378)
  - Addy Osmani: "the hard part of engineering moved from writing code to deciding whether to trust it" (2026-06-15, 1.7k l). — [@addyosmani](https://x.com/addyosmani/status/2066595308629594363)
- Approval fatigue:
  - A Hugging Face paper argues that more agent autonomy makes oversight ineffective via "approval fatigue, overreliance, loss of situational awareness, and skill degradation... users are pushed into approval mode: skimming plans" (2026-09-01, 786 l). — [@rohanpaul_ai](https://x.com/rohanpaul_ai/status/2094628310877913101)
  - The paper, "AI Agents Push Humans Out of the Loop" (Ghosh, Mitchell, Passi), was accepted to NeurIPS 2026. — [@evijit](https://x.com/evijit/status/2103197109025693799)
  - Summary quote: "Oversight degrades the overseer". — [@jenzhuscott](https://x.com/jenzhuscott/status/2111588834735706444)
- "Can't keep up": "I need 100 humans to actually read, review and implement everything these AI agents are producing... we as mere humans, cannot keep up with the volume of work AI can do" (2026-02-04, 321 l). — [@pbteja1998](https://x.com/pbteja1998/status/2018969588562866377)
- Review data:
  - Augment had "1,400 open PRs and a 20-hour median time-to-first-comment" when agents wrote 100% of their code. — [@augmentcode](https://x.com/augmentcode/status/2052838719254896666)
  - CodeRabbit: 81% of engineering leaders report more production issues from AI code, while 92% were confident it was production-ready. — [@mardehaym](https://x.com/mardehaym/status/2069466087293411394)
  - "Anthropic created the flood and is now selling the levee" (Claude Code Review at $15–25 per run). — [@aakashgupta](https://x.com/aakashgupta/status/2031218426560262524)
  - swyx called killing code review "the Final Boss of Agentic Engineering" (2026-03-03, 1.2k l, 407k v). — [@swyx](https://x.com/swyx/status/2028795270306079156)

**Proposed fixes on X**
- Evidence over diffs: "You don't have a review bottleneck. You have agents that can't prove they're done. Make them bring receipts! E2e tests, screenshots, perf numbers. Review evidence, not diffs." (2026-10-10) — [@compuficial](https://x.com/compuficial/status/2108902948340191565)
- Adversarial fresh-context reviewer: "Spent too long watching agents rubber-stamp each other's work. 'Looks good' isn't a review... The reviewer spawns a fresh agent whose only job is to find problems." (2026-02-06) — [@0xzak](https://x.com/0xzak/status/2019634341899346316)
- Auto-review to avoid fatigue: Greg Brockman, "auto-review lets agents work on important tasks without causing human approval fatigue" (2026-04-24). — [@gdb](https://x.com/gdb/status/2047758171725521200)
- Constrain the loop: "A loop that prompts agents is a great way to automate slop creation. Constrain the state-action space so the loop can't drift, then automate inside it. Human-in-the-loop = feature, not bottleneck." (2026-06-07, 412 l) — [@DavidKPiano](https://x.com/DavidKPiano/status/2063746139774398543)
- Verifier-first loops: "the verifier is what separates a loop from an expensive illusion and most loops are missing it" (2026-08-14). — [@rvaniaaaa](https://x.com/rvaniaaaa/status/2088357965069758662)
- Capped autonomy levels: "A MODEL PICKING ITS OWN AUTONOMY WILL PICK MAX. CODE HAS TO CAP IT." with levels 0 SUGGEST, 1 DRAFT, 2 ASK and up (2026-10-11). — [@mojeskoqq](https://x.com/mojeskoqq/status/2109257501614931998)
  - Replit shipped an "Autonomy Slider" based on Karpathy's YC talk. — [@amasad](https://x.com/amasad/status/1969117247957279104)
- Risk-tiered gating: "do low-risk calls auto-pass so humans only see the destructive ones?" — [@Cozy2054934](https://x.com/Cozy2054934/status/2111488795963216251)
- Comprehension aids: Matt Pocock suggests a daily or weekly diff turned into an LLM "podcast transcript, focusing on the 'why'" to prevent comprehension debt (2026-07-12, 817 l). — [@mattpocockuk](https://x.com/mattpocockuk/status/2076257280501129336)
- Own the outer loop: Addy Osmani says "engineers need to own the outer loop - the accountability" (2026-07-08, 1.5k l, 1.35M v). — [@addyosmani](https://x.com/addyosmani/status/2074927530482835916)
- Shadow mode and an audit agent: the Vercel and Anthropic examples under the first question.

### Inferences
- The builder's thesis is that output exceeds human absorption, which leads to blind trust or total distrust. It is strongly supported in the engineering and knowledge-work discourse: workslop, approval fatigue, executives blindly trusting ChatGPT.
- In frontline ops (freight, logistics), the mirror image already shows up as counterparties distrusting AI: carriers blocking AI check-call numbers, pricing up AI brokers, and learning "which brokers are using it".
- The consistent fix vocabulary is receipts and evidence, fresh-context adversarial auditors, risk-tiered approval, shadow mode until the expert stops finding fixes, and constrained action spaces. This suggests a demo should show trust being earned and calibrated, for example an agent whose autonomy expands per task type as its audited error rate drops, rather than raw autonomy.
- Ops practitioners' top pains are coordination latency ("freight moves faster than the information around it") and undocumented tacit knowledge, not lack of AI. An agent that captures and verifies dispatcher tacit rules, then proves it would have made the same calls, targets a stated pain.

### Gaps
- Reddit has few explicit "I can't keep up reviewing my agents" threads from ops practitioners; most come from developers. Ops people mostly talk about AI creating noise for counterparties.
- The quantitative studies (HBR/Stanford workslop, Anthropic RCT, CodeRabbit) are cited second-hand here; other researchers should pull the primaries.

## Any discussion of car transport / dealer logistics / fleet ops / driver dispatch pains and tools?

### Takeaway
Social discussion of driven car delivery (Bahn's model of one driver per car) is nearly absent on X and Reddit. US car-shipping (truck haulers) and dealer-trade threads expose the same pains:
- unpredictable timing with roughly a 1-hour heads-up
- carriers going "radio silent" while customers track their own cars with AirTags
- damage-liability ping-pong
- pickup fraud via load boards
- dealer trades that "take as long as it takes" because one dealer is at the other's mercy

Fleet and dispatch threads add tacit dispatcher knowledge as a single point of failure.

### Cited Findings
- "Flexibility/unknown timing is the biggest issue- regardless of broker or carrier... potentially get a 1 hour heads up from driver." The poster recommends an AirTag or a $30 GPS tracker in the car because "the carrier dispatch and driver gave very little heads up" and says: "Great broker is key- one who won't go radio silent" (r/AutoTransport, 2025-12-28). The comments include broker self-promotion. — [r/AutoTransport](https://www.reddit.com/r/AutoTransport/comments/1pxwhci/our_experience_with_car_transport/)
- Montway/Frontline (r/AutoTransport, 2026-07-26): the delivery window moved repeatedly without explanation, and "I could see via the tracking device in my vehicle that it's actually been in California, 2 hours away from my location, since at least last Thursday." Advice: get the carrier's certificate of insurance and check FMCSA SAFER. — [r/AutoTransport](https://www.reddit.com/r/AutoTransport/comments/1v76e0h/beware_montway_and_frontline_smashed_my_benz/)
- Damage liability (2025-12-18, 42 c): a forklift at a Copart yard damaged the car mid-route. The broker says the carrier's insurance won't pay. Commenters disagree on who is liable. — [r/AutoTransport](https://www.reddit.com/r/AutoTransport/comments/1ppsfib/vehicle_damaged_during_transit_broker_is_saying/)
- Pickup fraud (2025-12-02): a scammer impersonated a dispatch company via Central Dispatch, and "the dealer gave the scammer claiming to be our company the gate code and lot number without confirming a dispatch first". Replies: "Central Dispatch has become such a nightmare lately that we completely stopped using it"; carrier accounts are getting hacked. — [r/AutoTransport](https://www.reddit.com/r/AutoTransport/comments/1pcfylu/brokers_and_dealers_beware_360_9342540_contacted/)
- Carriers are lukewarm on load-board aggregation: an app combining Super Dispatch, Central Dispatch and RunBuggy drew "We already have those 3 apps... wouldn't be enough value for me to pay" (2025-10-25). — [r/AutoTransport](https://www.reddit.com/r/AutoTransport/comments/1og5p2o/single_app_for_car_haulers/)
- Pricing opacity: get 5–6 quotes "to establish the market" ($900 to $1,500 spread). A cancellation fee before dispatch is a bait-and-switch red flag (2026-08-08). — [r/AutoTransport](https://www.reddit.com/r/AutoTransport/comments/1vj794y/shipping_a_car_heres_what_i_wish_i_knew_before/)
- The car-transport community is irritated by AI-generated posts fishing for info: the mod changed the rules to "NO ADs" (r/AutoTransportopia, 2026-01-12). — [r/AutoTransportopia](https://www.reddit.com/r/AutoTransportopia/comments/1qb5jvi/rule_update_thats_it_im_changing_rule_7_to_no_ads/)
- Delivery damage photos: "This carrier caused so much body damaged and... also stained the interior" (2026-10-19, 157 pts). — [r/AutoTransportopia](https://www.reddit.com/r/AutoTransportopia/comments/1xacvcr/what_a_horrible_delivery/)
- Dealer trades: "There is no exact timeline. Its entirely dependent on how long the other dealer takes to react, if at all" [11]; "Your dealership is at the other dealerships Mercy"; "a week to 10 days usually... Month end might speed it up" (r/askcarsales, 2025-10-24). — [r/askcarsales](https://www.reddit.com/r/askcarsales/comments/1oeyik0/how_long_should_a_dealer_to_dealer_trade_take/)
- Dealer-trade delivery risk: the customer test-drove a mid trim but bought a base model sourced from another store. Salespeople advise being "EXPLICIT in stating what would be different" (2026-02-23). — [r/askcarsales](https://www.reddit.com/r/askcarsales/comments/1rcqiuf/have_you_ever_had_a_customer_refuse_delivery_of_a/)
- Dealer-trade drivers framed as gig work: "Will car dealers be willing to hire Doordashers who apply to be dealer trade drivers?" (2026-04-07). — [r/askcarsales](https://www.reddit.com/r/askcarsales/comments/1sekdu7/will_car_dealers_be_willing_to_hire_doordashers/)
- A dealer selling a trade-in on to driveway.com needed the previous owner to notarize paperwork (2026-06-13, 91 pts). This shows title and paperwork friction in dealer-to-dealer movement. — [r/askcarsales](https://www.reddit.com/r/askcarsales/comments/1u4gms3/dealer_i_traded_in_with_4_months_ago_asked_me_to/)
- Industry shift: Carvana is acquiring franchised CDJR dealerships and moving into new-car sales (r/carsales, 2026-09-18). — [r/carsales](https://www.reddit.com/r/carsales/comments/1wjx9nd/do_you_have_an_exit_strategy/)
- Dispatcher tacit knowledge (r/logistics, 2026-02-09): a fleet manager's biggest fear is losing a senior dispatcher "who knows which warehouses to avoid on Mondays, which drivers work well at which docks, and which brokers' appointment times are actually accurate... none of that knowledge is written down". He called it "managing on a prayer". Replies: a new hire learns about 20% in weeks or months; "Dispatchers quietly become single points of failure". — [r/logistics](https://www.reddit.com/r/logistics/comments/1qzy0sq/what_happens_when_your_best_dispatcher_quits/)
- AI in trucking dispatch (r/Truckers, 2025-12-16): an AI extension tied into DAT for load screening, notes and follow-ups "feels more like reducing stupid mistakes and busywork than changing the job". A milk hauler uses tank sensors instead of dispatchers. — [r/Truckers](https://www.reddit.com/r/Truckers/comments/1po5kvn/we_decided_to_try_boosting_our_dispatchers_with/)
- r/Truckers' biggest AI thread (2025-12-01, 371 pts, 333 c) claims AI will flip dispatch and routing. The top comments mock it as ChatGPT-written ("Thanks ChatGPT" [378]; "Can AI piss in a jug?" [226]). — [r/Truckers](https://www.reddit.com/r/Truckers/comments/1pbf1wd/ai_is_coming_for_the_trucking_industry_and/)
- Cargo-theft and identity fraud context: "scammers buy running MC authorities from struggling owners for $25–30k" (r/FreightBrokers, 2025-10-29). — [r/FreightBrokers](https://www.reddit.com/r/FreightBrokers/comments/1oixbm7/why_cargo_theft_cant_be_stopped/)
- Polsia's showcase "FleetNova (trucking)" was described as a landing-page shell. — [@panphora](https://x.com/panphora/status/2039792403788292156)

### Inferences
- For a Bahn-style driven-delivery business, the social evidence points to three high-value pains:
  1. Proactive, accurate ETAs and no "radio silence". Customers resort to their own GPS trackers.
  2. Damage and condition evidence at handover, to resolve liability ping-pong. Photo-based pickup and delivery inspection is the analogue.
  3. Pickup identity verification, given load-board impersonation and dealers handing gate codes to scammers.
- Dispatcher tacit knowledge being "not written down anywhere" invites an agent that learns dispatch rules from historical decisions and verifies them against outcomes. That fits Velho's "find the manual work, build the fix, drive adoption" model.
- Freight's AI backlash (check-call spam, bots hanging up on carriers) is a warning. Agents that face drivers or dealers must reduce messages, not multiply them.

### Gaps
- I found essentially no X or Reddit discussion of driven car delivery (one driver per car, "driveaway") or of Nordic/Finnish dealer and fleet logistics. Searches for "driveaway", "vehicle relocation drivers", "shuttler" and "dealer trade driver" returned unrelated results. Bahn-specific pains will need first-party interviews or Finnish-language sources.
- r/FleetManagement and r/operations returned no relevant results for the queries used.
- I found no X posts from car-logistics operators or dealers about AI agents; the "vehicle logistics AI dealers" search returned only noise.
