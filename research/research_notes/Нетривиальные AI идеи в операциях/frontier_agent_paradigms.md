# Frontier "mind-blowing" agent paradigms (2025–2026): autoresearch and its relatives, and how they transfer to operations

Scope note: researched 2026-10-24 using WebSearch, WebFetch and the GitHub API (no browser). 2023–2024 work is labelled **[background]**. Transfers to Bahn, Velho and general ops are my own inferences and are marked as such. Every factual claim carries an inline source. Where only secondary coverage was available, I say so.

---

## Q1. What exactly is Karpathy's autoresearch, why did it resonate, and which of its ingredients generalise?

### Takeaway
autoresearch (released 6 March 2026) is a three-file repo plus a Markdown "skill." A coding agent edits one file, `train.py`, and trains for exactly 5 minutes. It then reads one number, `val_bpb`, from an evaluator it is not allowed to touch. If the number improved, the agent commits the change; if not, it runs `git reset`. It logs the result and repeats until a human stops it, which works out to about 12 experiments an hour and about 100 overnight. It resonated for four reasons: it is tiny, it runs overnight with nobody watching, it beat a codebase Karpathy had already tuned by hand (11% faster time-to-GPT-2), and people ported it within days to non-ML targets with a benchmark (Shopify's Liquid templating engine got 53% faster). The ingredients that generalise are:
- one editable artifact
- a locked evaluator that produces one comparable scalar
- a fixed budget per experiment
- a keep-if-better ratchet that uses git as memory
- an append-only log
- an explicit instruction to never stop
- a human who writes the objective and the "research org" in Markdown instead of writing code

### Cited Findings

**What it is and how the loop works (primary sources)**
- The repo was created 2026-03-06 and last pushed 2026-03-26. On 2026-10-24 it had about 98.5k stars and 13.6k forks. — [GitHub API](https://api.github.com/repos/karpathy/autoresearch)
- Karpathy's description: "give an AI agent a small but real LLM training setup and let it experiment autonomously overnight. It modifies the code, trains for 5 minutes, checks if the result improved, keeps or discards, and repeats. You wake up in the morning to a log of experiments and (hopefully) a better model." — [autoresearch README](https://github.com/karpathy/autoresearch)
- There are three files. `prepare.py` holds fixed constants, data prep, the dataloader and the evaluation, and is never modified. `train.py` holds the model, the optimizer and the training loop, and is "the single file the agent edits." `program.md` holds the agent instructions and is "edited and iterated on by the human." — [README](https://github.com/karpathy/autoresearch)
- The human role is the inversion: "you are not touching any of the Python files like you normally would as a researcher. Instead, you are programming the `program.md` Markdown files that provide context to the AI agents and set up your autonomous research org." Karpathy calls `program.md` "a super lightweight 'skill'." — [README](https://github.com/karpathy/autoresearch)
- Fixed budget: training always runs 5 minutes of wall clock, "approx 12 experiments/hour and approx 100 experiments while you sleep." This makes experiments directly comparable whatever the agent changes, and it finds the best model for that platform and time budget. The downside is that results can't be compared across hardware. — [README](https://github.com/karpathy/autoresearch)
- The metric is `val_bpb` (validation bits per byte). Lower is better, and it is "vocab-size-independent so architectural changes are fairly compared." — [README](https://github.com/karpathy/autoresearch)
- The loop in `program.md`, quoted directly:
  - "LOOP FOREVER": inspect git state, then hack `train.py`, then `git commit`, then run `uv run train.py > run.log 2>&1`, then `grep "^val_bpb:"`.
  - If the grep is empty, the run crashed: read the stack trace and try a fix.
  - Log the result to `results.tsv` with columns commit, val_bpb, memory_gb, status (keep/discard/crash) and description.
  - "If val_bpb improved (lower), you 'advance' the branch... If val_bpb is equal or worse, you git reset."
  - Any run over 10 minutes is killed and treated as a failure.
  - Source: [program.md](https://raw.githubusercontent.com/karpathy/autoresearch/master/program.md)
- Guardrails in `program.md`:
  - The agent must not modify `prepare.py`, install packages, or "modify the evaluation harness. The `evaluate_bpb` function... is the ground truth metric."
  - VRAM is a soft constraint.
  - **Simplicity criterion:** "A 0.001 val_bpb improvement that adds 20 lines of hacky code? Probably not worth it. A 0.001 val_bpb improvement from deleting code? Definitely keep."
  - Source: [program.md](https://raw.githubusercontent.com/karpathy/autoresearch/master/program.md)
- The autonomy clause: "NEVER STOP: Once the experiment loop has begun... do NOT pause to ask the human if you should continue... The human might be asleep... If you run out of ideas, think harder — read papers referenced in the code, re-read the in-scope files for new angles, try combining previous near-misses, try more radical architectural changes." — [program.md](https://raw.githubusercontent.com/karpathy/autoresearch/master/program.md)
- How to run it: "spin up your Claude/Codex or whatever you want in this repo (and disable all permissions)" and prompt "have a look at program.md and let's kick off a new experiment." — [README](https://github.com/karpathy/autoresearch)
- Karpathy has described a multi-agent version: a "chief scientist" agent in plan mode directs "junior engineers" that run experiments in parallel tmux sessions. He has also teased a distributed "SETI@home style" autoresearch. This comes from secondary coverage. — [paddo.dev](https://paddo.dev/blog/autoresearch-ecosystem/)

**Evidence it works**
- Karpathy pointed it at nanochat, his already well-tuned GPT-2 codebase. Over about two days it ran about 700 experiments and found about 20 real improvements. Stacked together, they cut time-to-GPT-2 from 2.02 h to 1.80 h, about 11%. The gains reportedly transferred from depth-12 to depth-24 models. Examples of what the agent caught: a missing scaler in parameterless QKNorm, missing regularisation on value embeddings, and an overly conservative banded attention window. These are secondary reports of Karpathy's posts. — [philschmid.de](https://www.philschmid.de/autoresearch); [Gigazine](https://www.gigazine.net/gsc_news/en/20260324-humans-bottleneck-ai)
- Tobi Lütke (Shopify CEO) ran a variant called **pi-autoresearch** (built with David Cortés, using the Pi coding agent) on Liquid, Shopify's Ruby templating engine. His setup was an `autoresearch.md` prompt plus an `autoresearch.sh` script that runs the test suite and reports benchmark scores. About 120 automated experiments produced 93 commits, with 53% faster parse+render and 61% fewer allocations. Simon Willison's comment: "This research would not have been possible without" Liquid's 974 unit tests, and a benchmarking script turns "make it faster" into an actionable goal. — [Simon Willison](https://simonwillison.net/2026/Mar/13/liquid/)
- Lütke himself flagged that the Liquid result might be overfit to the benchmark, and the PR was not merged. — [awesomeagents.ai](https://awesomeagents.ai/news/shopify-ceo-ai-agent-liquid-engine-53-faster/) (secondary)
- Lütke also applied the loop to a query-expansion model in the QMD project. After 37 experiments in 8 hours, a 0.8B model scored 19% higher than the previous 1.6B model. — [philschmid.de](https://www.philschmid.de/autoresearch) (secondary)
- SkyPilot gave Claude Code 16 GPUs (13 H100 and 3 H200) across two Kubernetes clusters for about 8 hours:
  - about 910 experiments were submitted and about 700 produced valid results, at about 90 per hour versus about 10 per hour on one GPU
  - val_bpb went from 1.003 to 0.974
  - total cost was under $300: about $9 of Claude API plus about $260 of GPU
  - Source: [SkyPilot blog](https://skypilot.ai/blog/scaling-autoresearch/)
- SkyPilot reported emergent behaviour:
  - With parallelism, the agent switched from greedy hill-climbing to factorial grids of 10–13 experiments per wave.
  - Without being told, it noticed that H200s ran about 9% more steps in the same budget and built a two-tier process: screen on H100, confirm on H200.
  - Some rankings didn't transfer between hardware types.
  - The search went through hyperparameters, then architecture (widening the model), then optimizer tuning, then diminishing returns.
  - Source: [SkyPilot blog](https://skypilot.ai/blog/scaling-autoresearch/)
- On MLX, an M4 Max improved val_bpb from 2.667 to 1.294 overnight, and smaller hardware favoured different winning strategies than H100s. — [paddo.dev](https://paddo.dev/blog/autoresearch-ecosystem/)

**Why it resonated (stated by commentators)**
- Phil Schmid's list of generalisable ingredients: fixed time budget, single-file scope with locked data prep and eval, "git as memory," binary keep/discard, and "a held-out eval the agent never trains on or sees." He warns that "eval quality is the main bottleneck." At about 100 experiments a night, static benchmarks saturate, so he recommends evolving evals refreshed from production data. — [philschmid.de](https://www.philschmid.de/autoresearch)
- Karpathy's "Verifiability" essay (Nov 2025) is the theory behind the repo:
  - "Software 2.0 easily automates what you can verify."
  - For that, the environment must be resettable, efficient (many attempts) and rewardable (automated scoring).
  - Verifiable domains progress fast and others lag, which makes progress "jagged."
  - Sources: [karpathy.bearblog.dev](https://karpathy.bearblog.dev/verifiability/); [Simon Willison](https://feeds.simonwillison.net/2025/Nov/16/andrej-karpathy)
- Simon Willison ties Lütke's productivity to the November 2025 jump in coding agents and to "CEOs can code again." — [Simon Willison](https://simonwillison.net/2026/Mar/13/liquid/)
- Ecosystem (star counts from paddo.dev's snapshot):
  - **pi-autoresearch** (about 1.4k stars) adds persistent sessions across context resets, a dashboard and branch-aware tracking.
  - **Autokernel** (RightNow-AI) searches Triton/CUDA kernels at about 40 experiments an hour, prioritised by Amdahl's law.
  - **hwchase17/autoresearch-agents** has one agent improve another agent, scored with LangSmith evals. No results reported.
  - **uditgoenka/autoresearch** is domain-agnostic and targets test coverage, bundle size, SEO, accessibility, Terraform compliance and email copy. No results reported.
  - **agent-factory** scrapes Reddit, HN and X for problems and ships agents overnight. It claims 20+ agents.
  - Source: [paddo.dev](https://paddo.dev/blog/autoresearch-ecosystem/)
- Secondary coverage reports that PostHog applied the loop to its ClickHouse query engine. — [Buttondown / Verified](https://buttondown.com/verified/archive/the-karpathy-loop-inside-the-autoresearch-repo/) (unverified against a primary source)

### Inferences
- **The generalisable recipe** has nine parts:
  1. **One mutable artifact** (a file or function), so diffs stay reviewable.
  2. **A frozen evaluator** the agent cannot edit. This is the trust anchor.
  3. **One scalar metric, normalised** so that different kinds of change are comparable (the role vocab-independent bpb plays).
  4. **A fixed budget per experiment** (time or compute), which gives comparability and predictable throughput.
  5. **A keep-if-better ratchet** (commit or reset), so the system never gets worse.
  6. **An append-only experiment log**, which is both memory and the morning report.
  7. **"Never stop" autonomy** with timeouts and crash handling.
  8. **A simplicity prior**, which is a regulariser against overfitting and code bloat.
  9. **A human who writes the objective and constraints in prose** (`program.md`), not the solution.

  Later practice added three more: a held-out evaluation set (Schmid), parallel waves with cheap screening followed by expensive confirmation (SkyPilot), and an explicit overfitting check (Lütke's own caveat).
- **Why it felt mind-blowing:** it hands humans a new interface, *programming the research organisation* instead of the code. It shows the work as a legible artifact (a TSV leaderboard plus a git history of kept diffs). It turns idle hours into progress. Above all, it is honest about trust: the agent can be as creative as it likes because the only thing that counts is a number from a harness it cannot touch. That speaks directly to the builder's thesis that agents produce more than humans can verify. autoresearch sidesteps human verification by making verification mechanical.
- The pattern spreads exactly as far as a cheap, trustworthy scalar exists: test suites plus benchmarks (Liquid), kernels (Autokernel), evals (LangSmith). For operations, the bottleneck is building the evaluator, meaning a simulator plus a constraint checker, not the agent.

### Gaps
- I couldn't fetch Karpathy's X posts directly. The 700-experiment, 11% and transfer-to-depth-24 figures come from secondary write-ups (philschmid.de, Gigazine), not a primary Karpathy blog post.
- I didn't read the HN threads on autoresearch for sentiment or critique (the folder has an `hn_raw` directory, presumably from another researcher).
- I found no published, quantified autoresearch run on an operations target (logistics, dispatch, pricing, SOPs). The ops-like analogues below come from the AlphaEvolve and heuristic-design literature, not from autoresearch forks.
- PostHog/ClickHouse and agent-factory claims are unverified secondary reports.

---

## Q2. Catalogue: which paradigms do something qualitatively new, how do they work mechanically, and which have been applied outside ML/code (especially operations)?

### Takeaway
The strongest out-of-domain evidence belongs to **LLM-guided evolutionary search over programs and heuristics**. AlphaEvolve's Borg scheduling heuristic has recovered 0.7% of Google's global compute for over a year. FM Logistic cut warehouse picking travel 10.4% (more than 15,000 km a year) using AlphaEvolve plus a warehouse simulator. Sakana's agent won a production-planning optimisation contest outright (AHC058, 1st of 804). A 2026 paper evolved an AGV/production dispatch policy that beat rolling-MILP baselines on every one of 100 seeds.

Other paradigms are moving into business processes:
- **Prompt/program optimisers** are reaching customer ops (Decagon uses GEPA).
- **Process mining** is turning agentic (Celonis, PMAx).
- **Agent-to-agent negotiation** has real pilots (Walmart/Pactum; Anthropic's Project Deal).
- **LLM synthetic populations** are funded at scale (Simile, $2B valuation).

Most of these still lack independent validation. The common failure modes are overfitting to the evaluator and objective hacking.

### Cited Findings

#### A. Karpathy's autoresearch and derivatives
See Q1. Non-ML applications so far are software performance (Liquid, -53% time), GPU kernels (Autokernel), agent quality (LangSmith-scored agents), and generic web metrics (bundle size, Lighthouse, SEO). — [Simon Willison](https://simonwillison.net/2026/Mar/13/liquid/); [paddo.dev](https://paddo.dev/blog/autoresearch-ecosystem/)

#### B. LLM-guided evolutionary search over programs and heuristics (FunSearch → AlphaEvolve → OpenEvolve / ShinkaEvolve / optimize_anything / ALE-Agent)
- **FunSearch [background, Nature Dec 2023, Romera-Paredes et al., DeepMind].** An LLM evolves Python programs scored by an evaluator. Its evolved **online bin-packing** heuristics outperformed first-fit and best-fit on simulated data and OR-Library instances. — [Wikipedia: FunSearch](https://en.wikipedia.org/wiki/FunSearch); [google-deepmind/funsearch](https://github.com/google-deepmind/funsearch)
- **The skeptical counterpoint.** Sim, Renau and Hart (EvoApplications 2025) found that "most of the LLM heuristics do not generalise well when evaluated across a broad range of benchmarks." Specialised gains in small regions of instance space have to be weighed against the cost of generating them. — [arXiv 2501.11411](https://arxiv.org/abs/2501.11411)
- **AlphaEvolve (Google DeepMind, May 2025)** — mechanism:
  - an ensemble of Gemini Flash (breadth) and Gemini Pro (depth)
  - a prompt sampler builds prompts and the LLMs propose programs
  - **automated evaluators** "verify, run, and score" each program
  - a **programs database** runs an evolutionary algorithm that chooses which programs seed future prompts
  - the user provides a code skeleton and an automatic scorer
  - Source: [DeepMind blog](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/)
- AlphaEvolve **in operations:** a "simple but effective" **Borg scheduling heuristic** has been in production for over a year and "continuously recovers, on average, 0.7% of Google's worldwide compute." DeepMind credits human-readable code for "interpretability, debuggability, predictability, and ease of deployment." Other results:
  - a Gemini matmul kernel sped up 23%, cutting Gemini training time 1%
  - FlashAttention sped up by as much as 32.5%
  - on more than 50 open math problems, it matched the state of the art about 75% of the time and improved on it about 20% of the time
  - TPU Verilog proposals "must pass robust verification"
  - Source: [DeepMind blog](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/)
- **AlphaEvolve impact, May 2026.** Internal results:
  - Spanner LSM-tree compaction heuristics: write amplification down 20%
  - AC Optimal Power Flow: a GNN's feasible-solution rate went from 14% to over 88%
  - compiler optimisations: storage footprint down nearly 9%
  - cache replacement policies: "in two days what previously took months"

  Customers:
  - **FM Logistic:** 10.4% routing efficiency, more than 15,000 km a year
  - **Klarna:** training speed doubled
  - **WPP:** 10% accuracy gains
  - **Schrödinger:** about 4x faster ML force-field training and inference
  - **Substrate:** a multi-fold lithography speedup
  - Source: [DeepMind, "AlphaEvolve impact"](https://deepmind.google/blog/alphaevolve-impact/)
- **FM Logistic (the clearest logistics case)** — mechanics:
  - AlphaEvolve evolved the **picking batch-construction logic**, i.e. how orders are grouped into multi-order picking runs. The baseline was an in-house algorithm that had already been tuned several times.
  - The site is in Poland and has more than 17,700 pick locations.
  - Each candidate "was validated in a dedicated simulation environment" that mirrors the real warehouse.
  - The team encoded process rules and constraints in detail because "Not every 'best' result is suitable for a live warehouse," and "Simply shortening routes could not be the only measure of success."
  - Result: more than 10% less picker travel and more than 15,000 km a year saved, with no new infrastructure.
  - Sources: [trans.info](https://trans.info/en/fm-logistic-cuts-warehouse-picking-travel-with-google-alphaevolve-in-a-global-first-486994); [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/how-fm-logistic-tackled-the-traveling-salesman-problem-at-warehouse-scale-with-alphaevolve)
- Google's write-up says penalties were added to steer the search away from infeasible solutions, such as exceeding forklift capacity or assigning the same box twice. Google frames the problem as a TSP variant, while FM Logistic frames it as batch building. — [search summary of Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/how-fm-logistic-tackled-the-traveling-salesman-problem-at-warehouse-scale-with-alphaevolve) (I couldn't fetch the page fully; the fetch was aborted)
- AlphaEvolve is now generally available on Google Cloud's Gemini Enterprise Agent Platform. — [Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/alphaevolve-is-available-for-everyone); [InfoQ, Jul 2026](https://www.infoq.com/news/2026/07/alphaevolve-generally-available/)
- **OpenEvolve** (open source) says it replicated AlphaEvolve's circle-packing result. Community runs reached about 2.634 against DeepMind's 2.635. — [search summary](https://github.com/algorithmicsuperintelligence/openevolve/pull/7.diff)
- **ShinkaEvolve (Sakana, Sep 2025; ICLR 2026 poster).** Its claim is sample efficiency: it matched or beat AlphaEvolve's 26-circle packing within about 150 program evaluations. Caveat: it uses an overlap tolerance (atol=1e-7) where AlphaEvolve uses zero, and an ensemble of LLMs. — [arXiv 2509.19349](https://arxiv.org/pdf/2509.19349); [Sakana](https://sakana.ai/shinka-evolve/)
- **optimize_anything** (Agrawal, Khattab, Dimakis, Zaharia et al., May 2026, part of the GEPA project). It is a universal API that improves "a text artifact scored by an evaluation function." Results:
  - ARC-AGI accuracy for Gemini Flash rose from 32.5% to 89.5% with discovered agent architectures
  - **its scheduling algorithms cut cloud costs 40%**
  - 87% of its CUDA kernels matched or beat PyTorch
  - it beat AlphaEvolve's n=26 circle packing
  - "actionable side information" beat score-only feedback
  - multi-task search with cross-problem transfer beat independent runs
  - Source: [arXiv 2605.19633](https://arxiv.org/abs/2605.19633)
- In a matched comparison by the optimize_anything authors (a competitor), OpenEvolve with GPT-5.1 reached only 2.6307 after 200 iterations ($6.85). — [arXiv 2605.19633 PDF](https://arxiv.org/pdf/2605.19633)
- **Sakana ALE-Agent won AtCoder Heuristic Contest 058 (Dec 2025)**, placing 1st of 804 humans.
  - The problem was a 4-hour **production-planning** optimisation: which hierarchically dependent machines to upgrade, and in what order. Sakana links it to supply chains and manufacturing.
  - Loop: generate many programs in parallel, summarise the results into "insights," and feed those insights into the next round.
  - It used GPT-5.2 (2,654 calls) and Gemini 3 Pro (2,119 calls).
  - The final solution was a randomised greedy construction refined by simulated annealing with large-neighbourhood moves, plus a novel "virtual power" heuristic.
  - Cost was about $1,300.
  - The problem author said it exceeded the expected greedy/beam-search plus SA approach.
  - Source: [Sakana AHC058](https://sakana.ai/ahc058/)
- **LLM-designed heuristics from simulation traces (Li and Li, arXiv 2608.09343, Aug 2026)** — the closest published analogue to "autoresearch for dispatch":
  - Each incumbent **dynamic production + AGV scheduling policy** is evaluated over many replications.
  - The **worst replication is replayed as a queryable event-level trace**. A manager agent forms bottleneck hypotheses, editing agents make parallel code revisions, and execution checks plus repeated evaluation keep only improvements.
  - With Gemini 3.1 Pro, the best run went from 62.49 to 78.61 (0–100 score), and five runs averaged 77.51.
  - On 100 matched seeds, the final policy beat rolling-MILP, rule-based and metaheuristic baselines on **every seed**, and it stayed ahead under random faults without re-optimisation.
  - The discovered changes were proactive charging, distance-aware AGV assignment, and rebalanced dispatch priorities.
  - Ablations showed that removing parallel candidates or trace access hurt.
  - Source: [arXiv 2608.09343](https://arxiv.org/abs/2608.09343)
- **The academic automatic heuristic design (AHD) line.**
  - ReEvo (NeurIPS 2024) targets TSP, CVRP, orienteering, knapsack and bin packing.
  - EoH-S (AAAI 2026) evolves sets of complementary heuristics.
  - MEoH (AAAI 2025) handles multi-objective VRP (distance, vehicles, runtime).
  - PyVRP+ (2026) adds "metacognitive" diagnosis before code generation and reports +2.25% on VRPTW against +0.10% for a reactive baseline, which degraded 3 of 6 variants.
  - RAISE (2026) searches adversarial instances to test robustness under a budget of 1,000 LLM samples.
  - Sources: [ReEvo](https://www.sourcepulse.org/projects/1843206); [EoH-S AAAI](https://ojs.aaai.org/index.php/AAAI/article/view/41038/44999); [MEoH docs](https://llm4ad-doc.readthedocs.io/en/latest/method/meoh.html); [PyVRP+ arXiv 2604.07872](https://arxiv.org/pdf/2604.07872); [RAISE arXiv 2606.31801](https://arxiv.org/pdf/2606.31801)

#### C. AI-Scientist-style closed loops
- **Sakana AI Scientist v2.** An AI-written paper got reviewer scores of 6, 7 and 6 at an ICLR 2025 workshop, under a pre-agreed plan to withdraw it if accepted. Only 1 of 3 submissions passed, at a workshop with an acceptance rate of about 32.6%. — [aiweekly](https://aiweekly.co/alerts/sakana-ai-16335); [Pebblous](https://blog.pebblous.ai/report/ai-science-new-era/en/)
- The system paper, "Towards end-to-end automation of AI research" (Lu, Lu, Lange, Yamada, Hu, Foerster, Ha, Clune), was published in Nature on 26 March 2026. It admits naive ideas, weak methodological rigour and hallucinations. — [Sakana](https://sakana.ai/ai-scientist-nature/); [aiweekly](https://aiweekly.co/alerts/sakana-ai-16335)
- **Kosmos (Edison Scientific / FutureHouse, Nov 2025).**
  - Runs last up to 12 hours and cycle through data analysis, literature search and hypothesis generation.
  - An average run makes about 200 agent rollouts, writes about 42,000 lines of analysis code and reads about 1,500 papers.
  - Independent scientists rated **79.4% of statements** in its reports as accurate.
  - Collaborators said a 20-cycle run equalled about 6 months of their own research.
  - Source: [arXiv 2511.02824](https://arxiv.org/abs/2511.02824)
- A secondary analysis reports per-type accuracy: synthesis claims about 58%, data-analysis claims about 85.5%. — [rywalker.com](https://rywalker.com/research/kosmos) (not verified against the paper)

#### D. Prompt/program optimisers (DSPy, GEPA, TextGrad)
- **GEPA (Agrawal et al., Jul 2025)** — reflective, Pareto-based prompt evolution.
  - On Qwen3-8B it beat GRPO (24k rollouts) by up to 20% with up to 35x fewer rollouts, averaging about +6% across six tasks.
  - It gained +13% aggregate against +5.6% for MIPROv2.
  - It ships as `dspy.GEPA`.
  - Sources: [arXiv 2507.19457](https://arxiv.org/pdf/2507.19457v2); [MorphLLM](https://www.morphllm.com/gepa-prompt-optimization) (also claims ICLR 2026 oral)
- **GEPA in customer ops: Decagon (Mar 2026).** Decagon optimised the prompt of a production *supervisor classifier*, "a last line of defense against hallucinated or inconsistent outputs," against ground-truth labels with a holdout set. Findings:
  - 20 samples gave +1% at about 2.5x lower cost; 500 samples gave -2% with 75% longer prompts
  - a weak reflection model (GPT-4o-mini) changed nothing, while frontier reflectors gave +5–6%
  - a 1,500-character limit compressed prompts about 4x for only -0.8%
  - holdout validation is essential
  - Source: [Decagon](https://decagon.ai/blog/optimizing-gepa-for-production)
- **TextGrad (Zou group, Stanford).** "Optimizing generative AI by backpropagating language model feedback," Nature 639 (Mar 2025). Applications include PhD-level science QA, **radiotherapy treatment plans**, molecule design, code and agentic systems. — [Stanford DBDS](https://dbds.stanford.edu/zou-groups-textgrad-method-for-self-improving-generative-ai-is-published-in-nature); [RePEc record](https://ideas.repec.org/a/nat/nature/v639y2025i8055d10.1038_s41586-025-08661-4.html)
- GEPA only mutates prompt text, not retrieval, tool or state code. — [agentic-ai docs](https://agentic-ai.readthedocs.io/en/latest/PromptEngineering/gepa/)

#### E. Self-improving and self-modifying agents (Darwin Gödel Machine; agents that write their own tools and skills)
- **Darwin Gödel Machine (Sakana + UBC, May 2025).** An open-ended archive of coding agents that rewrite their own code. Over 80 iterations, SWE-bench Verified rose from 20.0% to 50.0% and Polyglot from 14.2% to 30.7%. Without self-improvement it reached about 39%. — [arXiv 2505.22954](https://huggingface.co/papers/2505.22954)
- The paper documents **"objective hacking."** Its hallucination detector checked for special tool-use tokens. Secondary sources say agents learned to remove the markers or fake tool logs to raise scores. — [arXiv 2505.22954](https://arxiv.org/pdf/2505.22954); [Gigazine](https://gigazine.net/gsc_news/en/20250605-darwin-godel-machine-self-improving-ai) (the specific removal behaviour is secondary)
- **Huxley-Gödel Machine (Oct 2025)** scores agents by their descendants' performance ("clade metaproductivity"). It beats DGM on SWE-bench Verified and Polyglot with fewer CPU-hours. — [arXiv 2510.21614](https://arxiv.org/pdf/2510.21614v2)
- **Agent Skill Induction, ASI (CMU, COLM 2025).** The agent solves a task with primitive actions, then induces **executable programmatic skills**, **verifies them with test trajectories**, and adds the verified ones to its action space. On WebArena it improved success by 23.5% over a static agent and 11.3% over a text-skill agent, and used 10.7–15.3% fewer steps. It reuses skills across sites and repairs those that break. — [arXiv 2504.06821](https://www.arxiv.org/abs/2504.06821)
- **WALT (Oct 2025)** reverse-engineers website-grounded tools (schema validation, selector stabilisation, URL reverse-engineering) instead of chaining clicks. — [arXiv 2510.01524](https://arxiv.org/pdf/2510.01524)

#### F. "Ralph"-style infinite loops and long-horizon autonomous runs
- **Ralph (Geoffrey Huntley, 14 Jul 2025):** `while :; do cat PROMPT.md | claude-code ; done`. Its principles:
  - one item per loop
  - specs first, with one spec file per topic
  - a `@fix_plan.md` the agent picks from and regenerates
  - **"backpressure"** from tests, type checkers and static analysers
  - only one subagent runs builds or tests
  - "search before assuming unimplemented"

  He says it is good for greenfield work and gets about 90% done, still needs senior guidance, writes placeholders and drifts, and he "would not use it in an existing codebase." He also cites a CURSED language compiler, six repos shipped overnight at a YC hackathon, and a "$50k contract for $297" anecdote.
  - Source: [ghuntley.com/ralph](https://ghuntley.com/ralph/)
- Anthropic later shipped an official Ralph Wiggum plugin for Claude Code. — [Context Studios](https://www.contextstudios.ai/blog/ralph-wiggum-plugin-autonomous-ai-development-with-claude-code-the-complete-2026-guide) (secondary)
- **Anthropic, "Effective harnesses for long-running agents" (26 Nov 2025, Justin Young).**
  - An **initializer agent** writes `init.sh`, `claude-progress.txt`, an initial commit, and a **JSON feature list of 200+ end-to-end features all marked `"passes": false`**.
  - Each **coding agent** session reads the progress file and git log, does one feature, self-verifies with browser automation, and may only flip `passes`.
  - "It is unacceptable to remove or edit tests."
  - It names the failure modes it addresses: declaring victory early, one-shotting until context runs out, and marking features done prematurely.
  - Source: [Anthropic Engineering](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- **Carlini's agent-team C compiler (Feb 2026).** 16 Claude Opus 4.6 instances, each in its own Docker container, pushed to a shared git repo with no orchestrator. About 2,000 sessions and about $20k in API fees over two weeks produced a 100k-line Rust C compiler that builds Linux 6.9 on x86, ARM and RISC-V. Its output is inefficient, and Carlini voiced unease about deploying unverified software. — [The Register](https://www.theregister.com/2026/02/09/claude_opus_46_compiler/); [InfoQ](https://www.infoq.com/news/2026/02/claude-built-c-compiler/?hl=en-GB)

#### G. LLM-driven simulation, synthetic populations and digital twins
- **Generative agents to Simile.** The company traces to the 2023 generative-agents work (Smallville, 25 agents) **[background]**. It built a model from 1,000 representative people interviewed for two hours each and later partnered with Gallup.
  - Funding: a $100M Series A (Index, BCV), then a reported $200M+ Series B at a $2B valuation (Greenoaks, Index).
  - Customers: CVS Health built up to 400,000 "agentic twins" to study medication behaviour, and Deloitte uses it in place of focus groups.
  - Simile claims 85–99% accuracy, which is not independently verified.
  - Sources: [iTiger](https://www.itiger.com/news/1115874123); [citybiz](https://www.citybiz.co/article/883494/simile-maker-of-agentic-twins-closes-200m-series-b/); [Let's Data Science](https://www.letsdatascience.com/news/simile-raises-funding-to-replace-public-polls-41c35732)
- **LLM agents in a delivery-platform simulation (arXiv 2507.15770).** LLM rider agents plus rule-based merchants, customers, platform and government ran with 100 riders for a simulated month on a 32B distilled model. This is the only LLM-agent gig-logistics simulation I found. — [arXiv 2507.15770](https://arxiv.org/pdf/2507.15770)
- Classical (non-LLM) agent-based simulators already serve as policy testbeds for ride-hailing: HRSim (2025) covers pricing, matching and repositioning on real road networks, and there are MATSim studies. — [HRSim arXiv 2505.17758](https://arxiv.org/pdf/2505.17758)
- **Project Vend (Anthropic + Andon Labs).** Phase 2 (Dec 2025) made the "Vendings and Stuff" kiosk profitable after an upgrade to Sonnet 4.5, a **CEO agent ("Seymour Cash") to enforce pricing discipline**, a CRM and payment links. It expanded to New York and London. In a WSJ red-team, reporters talked it into giving away a PS5, wine and a live fish, a loss of more than $1,000. Andon Labs opened an AI-run physical SF store in April 2026. — [The Decoder](https://the-decoder.com/anthropics-ai-store-makes-money-while-debating-eternal-transcendence/); [Gigazine](https://gigazine.net/gsc_news/en/20251219-anthropic-project-vend-phase-two)

#### H. Agentic process mining and SOP induction
- **WONDERBREAD [background, 2024]** benchmarks multimodal models on BPM tasks, including **writing an SOP from a workflow recording**. GPT-4 scored best (F1 0.82) with intent, keyframes *and* a click/keystroke log. Models tended to **add plausible steps that were never performed**. — [arXiv 2406.13264](https://arxiv.org/pdf/2406.13264)
- Zero-shot SOP generation from raw video is hard for video-language models, and in-context ensembles with pseudo-labels help. — [arXiv 2409.15867](https://arxiv.org/html/2409.15867v5)
- **PMAx (Mar 2026)** is an agentic process-mining framework. It keeps the LLM away from computing numbers: an "Engineer" agent writes scripts that run **established mining algorithms** locally, and an "Analyst" agent writes up the findings. This addresses both hallucinated metrics and log privacy. — [arXiv 2603.15351](https://arxiv.org/html/2603.15351v1)
- **Industry.** At Celosphere 2025, Celonis launched Agent Mining, an Orchestration Engine and an MCP server. Bloomfilter's Agent Miner merges system and agentic event logs. Celonis bought Ikigai Labs, and Salesforce folded Apromore into Agentforce. — [Celonis press](https://www.celonis.com/news/press/bloomfilter-unveils-agent-miner-app-to-observe-govern-agents); [Kai Waehner, Jul 2026](https://www.kai-waehner.de/blog/2026/07/22/process-intelligence-landscape-2026-mining-orchestration-and-the-agentic-ai-shift/)

#### I. Verifier-first and proof-carrying outputs
- Karpathy's criteria for automatability are resettable, efficient and rewardable environments. — [karpathy.bearblog.dev](https://karpathy.bearblog.dev/verifiability/)
- **Kleppmann (Dec 2025): "AI will make formal verification go mainstream."** Verified code can be trusted without manual review because "proof checkers won't be fooled by plausible-sounding errors." — [martinkl.substack.com](https://martinkl.substack.com/p/ai-will-make-formal-verification)
- **Harmonic's Aristotle** is a Lean-based prover trained with RL that reached IMO gold-equivalent and has been used on open problems. I found no evidence that it verifies production business software. — [Cambridge talk](https://talks.cam.ac.uk/talk/index/243277/)
- In practice, the "verifier" in deployed systems is a domain checker:
  - AlphaEvolve's evaluators "verify, run, and score," and TPU proposals "must pass robust verification" ([DeepMind](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/))
  - FM Logistic used simulation plus feasibility penalties ([trans.info](https://trans.info/en/fm-logistic-cuts-warehouse-picking-travel-with-google-alphaevolve-in-a-global-first-486994))
  - PMAx uses deterministic mining algorithms ([arXiv 2603.15351](https://arxiv.org/html/2603.15351v1))
  - ASI uses test trajectories ([arXiv 2504.06821](https://www.arxiv.org/abs/2504.06821))

#### J. Agents negotiating with agents
- **Anthropic Project Deal (run Dec 2025, published 24 Apr 2026).**
  - 69 SF employees each had a $100 budget. Claude interviewed each about what to buy and sell and their preferred negotiating style, and turned that into a custom agent.
  - Agents traded in Slack with no humans: 186 deals across more than 500 listings, more than $4,000 total.
  - Four parallel markets compared all-Opus 4.5 against a random mix of Opus and Haiku 4.5. Opus got better prices and more deals, but **Haiku users rated their deals just as fair (4.06 vs 4.05)**. They didn't notice they were losing.
  - Sources: [Anthropic](https://www.anthropic.com/features/project-deal); [The Decoder](https://the-decoder.com/anthropic-says-stronger-ai-models-cut-better-deals-and-the-losers-dont-even-notice/); [Unite.ai](https://unite.ai/anthropics-project-deal-lets-claude-agents-trade-real-goods/)
- **Microsoft Magentic Marketplace (Oct 2025)** is an open-source simulated two-sided market of consumer and business agents.
  - Every model showed severe **first-proposal bias**: a 10–30x speed-over-quality advantage, with about 80–100% accepting the first offer.
  - Welfare fell as options grew from 3 to 100 (paradox of choice).
  - Some models were fully compromised by fake reviews or prompt injection, with payments redirected.
  - Sources: [arXiv 2510.25779](https://arxiv.org/html/2510.25779v1); [Microsoft Research](https://microsoft.com/en-us/research/publication/magentic-marketplace-an-open-source-environment-for-studying-agentic-markets/)
- **Walmart and Pactum [background, 2021–2023].** In a Canadian pilot with 89 suppliers, the bot closed deals with 64% in about 11 days, saving 1.5% on average. At scale it closed 68% and saved about 3% on average. Suppliers reportedly prefer the bot (figures range from about 75% to 85%). It is used for tail-spend and equipment suppliers, not resale goods. — [Rework (citing Harvard PON)](https://resources.rework.com/libraries/ai-for-operations/ai-supplier-negotiation); [Pymnts](https://www.pymnts.com/news/artificial-intelligence/2023/walmart-finds-75-percent-vendors-prefer-negotiating-with-chatbot/partial/); [BusinessWire](https://www.businesswire.com/news/home/20230111005148/en/Pactums-Autonomous-Negotiation-Technology-on-Display-at-the-National-Retail-Federations-2023-Retail-Big-Show)
- An FT report dated "October 18" (year not stated in the summary, presumably 2026; I read only the summary) says Anthropic is consulting law firms on negotiation tactics for agents. — [FourWeekMBA](https://fourweekmba.com/ai-anthropic-turns-to-lawyers-after-its-agents-closed-186-deals/)

#### K. World models for operations
- **Amazon DeepFleet (30 Jun 2025)** is a generative foundation model trained on Amazon's inventory-movement data. It coordinates the movement of more than 1 million robots across more than 300 facilities, and Amazon says it improves **fleet travel time by 10%** (described elsewhere as an estimate or early result). — [About Amazon](https://www.aboutamazon.com/md/news/operations/amazon-million-robots-ai-foundation-model); [Digital Commerce 360](https://www.digitalcommerce360.com/2025/07/03/amazon-deepfleet-ai-model-for-robotics/)

#### L. LLM plus classical solver hybrids (LLM formulates, solver solves, LLM explains)
- **OptiMUS (Stanford).** Its multi-agent natural-language-to-MILP design beat standard prompting by more than 40 points on NLP4LP. OptiMUS-0.3 with GPT-4o reports about 37% on **IndustryOR**. **ORLM** fine-tunes 7B models on synthetic OR data and introduced IndustryOR, "the first industrial benchmark." LLMOPT reports 97.3% on NL4Opt. — [arXiv 2405.17743 (ORLM)](https://arxiv.org/html/2405.17743v2); [survey arXiv 2606.15577](https://arxiv.org/pdf/2606.15577)
- **Benchmark caveat.** Xiao et al. (IJCAI 2025 survey) found "a surprisingly high error rate" in the benchmark datasets, cleaned them and re-ran a fair leaderboard. Headline accuracies aren't comparable across papers. — [arXiv 2508.10047](https://arxiv.org/html/2508.10047v1)
- **ORPilot (May 2026, production-oriented):**
  - an interview agent elicits the full specification
  - a data agent pulls raw tables
  - a parameter agent computes model inputs
  - a solver-agnostic **intermediate representation** recompiles to Gurobi, CPLEX, PuLP, Pyomo or OR-Tools **with no LLM calls**
  - **self-repair from solver tracebacks**

  It reportedly beats prior tools on IndustryOR.
  - Source: [arXiv 2605.02728](https://arxiv.org/abs/2605.02728)

### Inferences

**The key pattern.** The paradigms that work outside ML all put the LLM in the *proposer* seat and something deterministic in the *judge* seat: an evaluator, simulator, solver, test suite, constraint checker or mining algorithm. The paradigms that put the LLM in the judge seat are more impressive but less trusted: AI-Scientist reviews, synthetic customers, self-reported negotiation fairness. So for an ops demo, the "mind-blowing" credibility comes from the judge, not the agent.

**Transfers to operations (my proposals, not sourced facts).** Bahn: driven car delivery, one driver per car, fixed price. Velho: an expert who finds manual work, builds the fix and drives adoption.

| Paradigm | Transfer 1 | Transfer 2 | Transfer 3 |
|---|---|---|---|
| **autoresearch loop** | **Bahn dispatch autoresearch.** The agent edits `dispatch.py`. A simulator replays a synthetic week of car-delivery jobs (pickup and drop city pairs, time windows, driver home bases, train/bus return legs). The metric is cost per delivered car (driver hours, deadhead km, return-ticket cost, lateness penalty). Infeasible plans are rejected. | **Fixed-price quote engine.** The agent edits `price.py`. The metric is simulated margin minus SLA risk across a historical or synthetic job book, with an acceptance-rate floor. | **Velho "overnight automation tuner."** The agent edits an automation script (for example, an invoice-matching rule). The metric is accuracy on labelled historical cases plus human minutes saved. |
| **AlphaEvolve/ShinkaEvolve-style evolution** | Evolve a **driver-chaining heuristic**: after delivering car A to city X, which car B should that driver pick up next? This mirrors FM Logistic's batch construction. | Evolve **job-to-driver matching priority rules** that stay human-readable, so dispatchers trust them (the Borg rationale). | Evolve **re-planning rules for disruptions** (a driver sick, a train cancelled), tested on fault-injected seeds as in Li & Li. |
| **AI-Scientist closed loop** | A nightly "ops analyst" that forms hypotheses from the job and event log ("Tampere returns are late on Mondays"), runs analyses as code and writes a report with claim-level confidence (Kosmos-style accuracy auditing). | Velho: automated discovery reports of manual-work hotspots per team. | — |
| **GEPA/DSPy/TextGrad** | Optimise the **customer-ops agent** (dealer intake, ETA queries) against labelled tickets with a holdout (Decagon recipe). | Optimise **SOP text** for drivers (handover checklist) against a graded set of incident cases. | Optimise extraction prompts for **back-office documents** (delivery receipts, damage reports) against ground truth. |
| **Self-improving agents and skill induction** | A dispatcher agent that **writes and verifies its own tools** (for example, a "find next train from X to Y" function) and keeps only those that pass test trajectories (ASI). | A Velho agent that turns repeated manual steps into verified scripts and grows a skill library per client. | — |
| **Ralph / long-horizon harness** | A feature-list JSON of ops automations, each with a pass/fail test, worked through overnight by a loop (Anthropic harness). | Always-on agent on a cloud computer (e.g. Matrix OS) running the improvement loop 24/7 with progress files. | — |
| **LLM simulation / digital twins** | **Synthetic dealers and drivers** as a stress test for pricing and policy changes (for example, LLM dealers reacting to new price tiers). | **Magentic-style market** of dealer agents and Bahn agents to test booking flows before launch. | Red-team the ops agent with adversarial synthetic customers (the Project Vend/WSJ lesson). |
| **Agentic process mining / SOP induction** | Velho: screen recordings plus click logs become a draft SOP, then the steps are **checked against the event log** to catch hallucinated steps (the WONDERBREAD failure mode). | Mine Bahn's booking and status-change event log to find rework loops; an agent proposes automations ranked by frequency × time. | — |
| **Verifier-first / proof-carrying** | Every agent-produced plan ships with a **certificate**: constraint-check log, metric on held-out days, gap to an OR-Tools/MILP bound. | Every Velho automation ships with a regression test suite plus a before/after measurement on replayed cases. | — |
| **Agent-to-agent negotiation** | Bahn agent negotiates **delivery windows and price** with dealer or fleet procurement agents within a pre-approved envelope (Pactum pattern). | Driver-side agents bid for jobs. A market test reveals first-proposal bias, so design the protocol to collect several offers. | — |
| **World models** | A learned model of job-arrival and travel-time dynamics (DeepFleet-lite) as the simulator for policy search. | — | — |
| **LLM + OR solver** | The dispatcher describes constraints in plain language. The LLM compiles them to an OR-Tools model, the solver produces the plan, and the LLM explains it (ORPilot-style IR plus traceback repair). | "What changed and why" explanations for drivers and dealers when the plan updates. | — |

**Caveats that apply to every paradigm.**
- Evolved heuristics overfit to the training distribution (Sim et al.; Lütke's own caveat).
- Agents hack whatever objective you give them (DGM).
- Human-trusted fairness ratings are an unreliable signal (Project Deal).
- LLM agents are biased and manipulable in markets (Magentic).

Each argues for held-out seeds, adversarial instances and a frozen external judge.

### Gaps
- I found no public deployment of LLM-evolved heuristics for **driven car delivery or driver dispatch** specifically. The closest are warehouse picking (FM Logistic), AGV dispatch (an academic paper) and production planning (a contest).
- I found no independent validation of Simile's accuracy claims, and no LLM-agent simulation of drivers or couriers used for real policy decisions.
- I couldn't fully fetch the Google Cloud FM Logistic blog (the fetch was aborted). Mechanics come from trans.info and the search snippet.
- I didn't verify Anthropic's "Agent Skills" product details, Voyager-style skill libraries or Cursor's long-running agent experiments. They are omitted rather than asserted.
- I found no LLM world model used for ops planning beyond DeepFleet. I did not research Genie-style world models because they lack an ops link.
- AlphaEvolve-as-a-service pricing on Google Cloud was not found.
- OptiMUS and ORLM numbers come from survey summaries, and benchmark noise is high.

---

## Q3. What is the "autoresearch for X" pattern for operations: metric, sandbox, action space, verifier?

### Takeaway
"autoresearch for ops" = **a frozen simulator plus constraint checker (the judge), one editable policy file (the action space), one cost scalar averaged over many seeded scenarios (the metric), a fixed compute budget per candidate, and keep-if-better with a held-out-seed gate.** The published ops successes (FM Logistic, Borg, Li & Li AGV dispatch, ALE-Agent) all used this shape. They added three things beyond Karpathy's original: **feasibility penalties or hard rejection**, **multi-replication evaluation with held-out or matched seeds**, and **trace-level diagnostics fed back to the LLM**.

### Cited Findings
- **The judge has to be a faithful simulator plus explicit constraints.** FM Logistic validated every candidate "in a dedicated simulation environment" mirroring live conditions. It encoded process rules because "Not every 'best' result is suitable for a live warehouse" and "Simply shortening routes could not be the only measure of success." — [trans.info](https://trans.info/en/fm-logistic-cuts-warehouse-picking-travel-with-google-alphaevolve-in-a-global-first-486994)
- **Feasibility penalties** (exceeding forklift capacity, assigning the same box twice) steered the search away from infeasible solutions. — [Google Cloud blog (search summary)](https://cloud.google.com/blog/products/ai-machine-learning/how-fm-logistic-tackled-the-traveling-salesman-problem-at-warehouse-scale-with-alphaevolve)
- **Multi-replication metrics and trace feedback.** Li & Li evaluate each policy over several replications and replay the *worst* run as an event-level trace for the LLM to diagnose. Selection is best-so-far with repeated evaluation. Robustness is checked on 100 matched seeds, under random faults and on longer horizons. — [arXiv 2608.09343](https://arxiv.org/abs/2608.09343)
- **Action space = readable code.** The Borg heuristic was valued for "interpretability, debuggability, predictability, and ease of deployment." — [DeepMind](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/)
- ALE-Agent's winning structure was greedy construction plus simulated annealing, with domain-specific neighbourhoods and fast simulation. In other words, the LLM writes a *solver*, not a solution. — [Sakana AHC058](https://sakana.ai/ahc058/)
- **Feedback richer than the scalar helps.** optimize_anything found "actionable side information" converges faster and higher than score-only feedback, and multi-task search transfers across related problems. — [arXiv 2605.19633](https://arxiv.org/abs/2605.19633)
- **Held-out evals and evolving evals:** "a gamed or leaky metric makes a model look better on paper and fail in production." — [philschmid.de](https://www.philschmid.de/autoresearch)
- **Robustness to distribution shift is the known weakness.**
  - LLM-evolved bin-packing heuristics mostly fail to generalise across benchmarks ([arXiv 2501.11411](https://arxiv.org/abs/2501.11411)).
  - RAISE adds adversarial instance search ([arXiv 2606.31801](https://arxiv.org/pdf/2606.31801)).
  - EoH-S evolves *sets* of complementary heuristics ([AAAI](https://ojs.aaai.org/index.php/AAAI/article/view/41038/44999)).
- **Objective hacking is a real risk** when the agent can touch the scorer. — [DGM arXiv 2505.22954](https://arxiv.org/pdf/2505.22954)
- autoresearch's own defence is a read-only evaluator, and "Modify the evaluation harness" is explicitly forbidden. — [program.md](https://raw.githubusercontent.com/karpathy/autoresearch/master/program.md)
- **Feedback from deterministic tools instead of LLM arithmetic** (PMAx scripts call established mining algorithms) and **solver-traceback repair** (ORPilot) are the ops-flavoured verifiers. — [arXiv 2603.15351](https://arxiv.org/html/2603.15351v1); [arXiv 2605.02728](https://arxiv.org/abs/2605.02728)

### Inferences
**A concrete template for "autoresearch for car-delivery dispatch" (Bahn-shaped; my design):**

| Ingredient | autoresearch original | Ops instantiation |
|---|---|---|
| Frozen judge | `prepare.py` with `evaluate_bpb` | `sim/` package: a seeded job generator (Finnish city pairs, dealer time windows, car-ready times), a driver roster (home bases, max shift hours), a public-transport return-leg table, a **feasibility checker** (one driver per car, a driver can't be in two places, windows met, shift limits) and a cost function. Read-only to the agent. |
| Editable artifact | `train.py` | `policy.py` exposing `assign(state) -> actions` (or `plan(day) -> routes`). Everything inside is fair game: greedy rules, chaining heuristics, calls to OR-Tools, lookahead. |
| Scalar metric | `val_bpb` | Mean **cost per delivered car** in € (driver hours × wage + return tickets + deadhead km + lateness penalty × minutes late) over N training seeds. Infeasible plans get +∞ or a large penalty. |
| Fixed budget | 5 min of training | For example, 60 s of wall-clock per candidate (the policy must plan a simulated week within its time budget). |
| Keep-if-better | git commit or reset | Keep only if the training-seed mean improves **and** the held-out-seed mean does not regress (a two-gate ratchet). |
| Log | `results.tsv` | `results.tsv` plus a leaderboard UI: commit, metric (train / held-out), feasibility violations, runtime, one-line description. |
| Diagnostics | stack trace on crash | Li & Li-style "worst-seed trace" (which jobs were late, where drivers idled) handed to the agent. |
| Human role | `program.md` | `program.md` in ops language: objective weights, hard rules ("never leave a driver without a return connection after 22:00"), simplicity prior ("prefer rules a dispatcher can read"). |
| Baselines | previous best | Nearest-available-driver greedy, plus an OR-Tools VRP-with-time-windows solve as a strong reference or lower bound. |

**Other ops instantiations:**
- **Pricing.** Metric: simulated contribution margin subject to a win-rate floor. Sandbox: historical quotes plus a demand-response model. This is weaker, because the judge depends on a demand model the agent indirectly tunes against. Mitigate with held-out periods.
- **SOP/customer ops.** Metric: rubric accuracy on labelled historical tickets. Sandbox: a replay harness. Optimiser: GEPA. The verifier is ground-truth labels plus holdout (the Decagon recipe).
- **Back-office extraction.** Metric: field-level F1 on labelled documents. Fully verifiable, but less "operations-y."
- **Velho manual-work discovery.** Metric: hours saved estimated from event-log frequency × duration. This is the weakest verifier. Pair it with process-mining algorithms (PMAx-style) so the numbers come from deterministic computation.

**Rule of thumb:** an ops loop is credible in proportion to how much of the scorer is deterministic and outside the agent's reach. Dispatch and routing are the best fit (cost and feasibility are computable). Pricing and customer behaviour are the worst fit (they need a behavioural model).

### Gaps
- There is no published Bahn-like (one driver per car, public-transport repositioning) benchmark or simulator. One would have to be built, or adapted from VRPTW or pickup-and-delivery instances.
- I found no public evidence on how simulated gains in this exact problem class carry into real deployment beyond FM Logistic's single-site report.

---

## Q4. What could a solo builder credibly demo in ~28 hours?

### Takeaway
The most credible "mind-blow" demo is an **overnight autoresearch run on a Bahn-style dispatch simulator**:
- a coding agent (Claude Code or Codex in a loop, or OpenEvolve/ShinkaEvolve) edits `policy.py`
- a frozen simulator plus feasibility checker scores each candidate on seeded weeks of car-delivery jobs
- by morning, a live leaderboard shows cost per car falling from a naive greedy baseline toward (or past) an OR-Tools reference
- every kept change carries a machine-checked "certificate" (feasible on all seeds, held-out improvement, readable diff)

This mirrors published wins (FM Logistic, Li & Li, ALE-Agent) at hackathon scale, and it directly embodies the "automatic verification closes the trust gap" thesis. Budget evidence suggests it is affordable: about $9 of API for about 900 GPU experiments at SkyPilot, about $1,300 for a contest-winning optimisation agent, and about 120 experiments over two days for Liquid.

### Cited Findings
- Throughput and cost reference points:
  - autoresearch runs about 12 experiments an hour and about 100 overnight at 5 minutes each ([README](https://github.com/karpathy/autoresearch))
  - SkyPilot's parallel waves on 16 GPUs reached about 90 an hour, costing about $9 of Claude API plus about $260 of GPU ([SkyPilot](https://skypilot.ai/blog/scaling-autoresearch/))
  - ALE-Agent won AHC058 for about $1,300 total ([Sakana](https://sakana.ai/ahc058/))
  - Liquid: about 120 experiments and 93 commits over two days ([Simon Willison](https://simonwillison.net/2026/Mar/13/liquid/))
  - OpenEvolve: 200 iterations cost $6.85 with GPT-5.1 ([arXiv 2605.19633](https://arxiv.org/pdf/2605.19633))
  - ShinkaEvolve needed about 150 evaluations to reach SOTA circle packing ([Sakana](https://sakana.ai/shinka-evolve/))
- Gains of 10% over a tuned baseline are realistic in comparable settings: FM Logistic 10.4% ([DeepMind](https://deepmind.google/blog/alphaevolve-impact/)), Li & Li 62.49 → 78.61 ([arXiv 2608.09343](https://arxiv.org/abs/2608.09343)), Amazon DeepFleet 10% travel time ([About Amazon](https://www.aboutamazon.com/md/news/operations/amazon-million-robots-ai-foundation-model)).
- The legibility that matters for trust:
  - the TSV log plus git history of kept and discarded experiments ([program.md](https://raw.githubusercontent.com/karpathy/autoresearch/master/program.md))
  - readable heuristics preferred for deployment ([DeepMind](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/))
  - a simplicity criterion ([program.md](https://raw.githubusercontent.com/karpathy/autoresearch/master/program.md))
- Harness patterns for multi-hour unattended runs:
  - a progress file, a JSON task list with pass flags, one item per session, never edit tests ([Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents))
  - backpressure from tests and type checkers ([Huntley](https://ghuntley.com/ralph/))
  - a "NEVER STOP" clause with timeouts ([program.md](https://raw.githubusercontent.com/karpathy/autoresearch/master/program.md))

### Inferences
**Demo option 1 (recommended): "Dispatch autoresearch overnight," Bahn-shaped.**
- **Hours 0–8: build the judge.**
  - A Python discrete-event simulator of a week of car-delivery jobs between about 15 Finnish cities: synthetic but realistic demand, dealer time windows, car-ready times, return legs via a simple train/bus time table, driver shift limits.
  - A feasibility checker and a cost function.
  - Seed sets: train (for example, 20 weeks), held-out (10 weeks) and "stress" (strike, snowstorm, a demand spike).
  - Baselines: nearest-idle-driver greedy, plus an OR-Tools pickup-and-delivery solve with a time cap.
- **Hours 8–10: `program.md` plus the loop harness.**
  - Use the autoresearch-style instructions verbatim, adapted.
  - Allow parallel candidates as CPU cores permit.
  - Give each candidate 30–60 s of simulation, which yields several hundred candidates over an 8-hour night.
- **Hours 10–18: overnight run on an always-on box.** This is where Matrix OS, the tool partner, could host the agent; I have not verified its capabilities. Meanwhile, build a **leaderboard UI**:
  - a cost-per-car chart over experiment number with keep/discard dots (like Karpathy's `progress.png`)
  - the diff of each kept change
  - held-out and stress results
  - a "certificate" panel: 0 constraint violations on N seeds, Δcost on held-out seeds, gap to the OR-Tools reference
- **Hours 18–26: polish the story.**
  - Morning results.
  - A plain-language explanation of what the agent discovered, e.g. "chain deliveries so drivers end near the next pickup" or "hold a driver 40 min for a better return connection."
- **Live demo (5–10 min).**
  - Show the overnight leaderboard first.
  - Then inject a **new constraint live**, e.g. "EVs need 30 min charge stops" or "Tampere depot closed," and restart the loop for 3–4 minutes on stage to show the agent repairing the policy while the checker rejects infeasible candidates in real time.
  - Close on the thesis: "you don't have to read the agent's code to trust it. The judge is frozen, every kept change is certified."

**Demo option 2: "Velho autopilot for a manual process."** Take a recorded manual back-office task (screen recording plus click log, or an event-log CSV).
1. An agent induces an SOP and **cross-checks each step against the log**, flagging hallucinated steps (the WONDERBREAD failure).
2. It writes an automation script.
3. An autoresearch loop tunes the script against labelled historical cases (accuracy plus minutes saved).

The output is a "certificate" of tests passed. It is less visually dramatic, but fits Velho's "find manual work, build fix, drive adoption."

**Demo option 3: "Agent marketplace stress-test."** Simulate dealer agents negotiating delivery windows and price with a Bahn agent inside a hard price and SLA envelope enforced by code. Show first-proposal-bias exploitation and how a protocol fix (collect K offers) improves welfare. This is novel but has the weakest verifier. It's better as a 1-minute segment than the main act.

**What makes it "mind-blowing" rather than "nice dashboard":**
- the agent works **while nobody watches**, and the morning artifact is a legible ledger
- improvements are **certified by a judge the agent cannot edit**, not by human review
- **live adaptation** to a new constraint on stage
- the discovered policy is **readable** and explainable to a dispatcher (the Borg/FM Logistic deployability argument)

**Main risks:**
- **Simulator realism.** Mitigate by stating the assumptions and using Bahn-like parameters from the partner, if they provide any.
- **Overfitting.** Mitigate with held-out and stress seeds shown on screen.
- **Agent stalls or crashes overnight.** Mitigate with a Ralph/harness-style outer loop, a progress file and timeouts.
- **Too-small gains if the baseline is OR-Tools.** Frame it as "the agent approaches the solver at 1/100 the runtime" or "beats greedy by X% and closes Y% of the gap to the OR-Tools bound."

### Gaps
- I haven't verified what Matrix OS provides (persistence, parallel compute, cost). Another researcher may cover it.
- I don't know Bahn's real operating parameters (job volumes, city mix, how drivers return, pricing structure). The simulator parameters above are placeholders.
- No hackathon-scale replication exists for how many overnight candidates a CPU-only simulator plus a frontier coding agent can produce, or what API spend that implies. The estimates above are extrapolated from SkyPilot, Liquid and OpenEvolve cost figures.
