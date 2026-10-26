# context-craft

A small, zero-cost, fully-tested TypeScript engine for **context engineering**:
deciding what text actually gets sent to an LLM, out of everything that's
potentially available (chat history, retrieved docs, logs, prior decisions) —
within a token budget, without silently dropping the facts that matter.

Most LLM apps handle this by concatenating everything in whatever order it
arrives and cutting it off once a length limit is hit. Whatever falls off the
end gets dropped regardless of whether it was important. This project builds
and proves a better default: **importance-weighted, token-budgeted selection**,
plus deterministic history compression — and a benchmark that shows the
difference is real, not assumed.

## The core claim, and the evidence for it

> Does selecting context by importance actually preserve the facts needed for
> a correct answer, better than naive truncation does?

Yes, measured two ways:

**1. Mechanically** (`npm run bench`, zero cost, no API key) — naive
truncation vs. the engine, across 11 scenarios where a critical fact is
deliberately buried behind low-value filler, each strategy's selection
checked against 50 random re-orderings of the same input to rule out "it just
got lucky with this ordering":

```
strategy | avg tokens used | fact retention % | retention range across 50 shuffles
naive    | 41.4             | 0.0%              | 0% - 100%   (pure luck of ordering)
engine   | 45.7             | 100.0%            | 100% - 100% (order-independent)
```

**2. With a real model** (`npm run bench:llm`, optional, costs API credits) —
the same naive vs. engine selections sent to Gemini 2.5 Flash and graded on
whether the actual generated answer contained the required facts:

```
strategy | avg prompt tokens | avg latency | answer correctness %
naive    | 115.3              | 1061ms      | 0.0%
engine   | 120.6              | 1556ms      | 100.0%
```

One important, non-obvious finding from the real-model run: when the context
genuinely can't fit every required fact, the model correctly *declines* to
answer ("I don't know based on the given context") rather than guessing. That's
correct, safe behavior — not a bug in either strategy, and the benchmark's
grading treats it that way.

## How the engine works

```
src/
  types.ts        ContextItem, ScoringWeights, BudgetConfig, etc.
  tokenizer.ts     token estimation (cl100k_base via js-tiktoken)
  scoring.ts       scoreItem(): relevance + importance + recency - token cost
  budget.ts        assembleContext(): the main entry point
  compression.ts   compressHistory(): deterministic history compression
  index.ts         public exports
```

**`assembleContext(items, config)`** — given a list of `ContextItem`s and a
token budget:
1. Fills in missing token estimates.
2. Drops exact-content duplicates.
3. Scores every item (`scoreItem`): a weighted combination of caller-supplied
   relevance, explicit importance, recency, and token cost.
4. **Pins** anything with `importance >= 0.8` ahead of the rest, so a critical
   fact can't be bumped out just because it's old or appears early in the
   array — this is the fix for naive truncation's main failure mode.
5. Greedily fills the remaining budget with everything else, highest score
   first.
6. Returns `selected`, `excluded` (each with an explicit reason:
   `duplicate` or `over_budget`), and the token breakdown — so a caller can
   always see what got cut and why, never a silent drop.

**`compressHistory(items, config)`** — for long conversation history: the most
recent N items are kept verbatim; older items above an importance threshold
are also preserved **verbatim** (not paraphrased — no LLM call, so nothing can
be lost to summarization drift); everything else is dropped with an explicit
reason. Compression can be disabled entirely via config.

Both are pure, deterministic, and fully unit-tested (`npm test`) — no network
calls, no API key required for the core engine.

## The ContextCraft Claude Skill

`.claude/skills/contextcraft/` packages this engine as a [Claude
Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview):
when a developer asks Claude to audit their own context pipeline (or just
describes the symptom — "my agent forgets earlier decisions," "context is too
expensive," "the right doc gets retrieved but the answer's still wrong"),
Claude loads this skill and:

1. Diagnoses the user's actual code against four concrete anti-patterns
   (order-based truncation, no importance signal, unbounded growth, no
   visibility into what got dropped) — with file/line references, not generic
   advice.
2. Runs the user's real data through `scripts/assemble.ts` /
   `scripts/compress.ts` as a deterministic check.
3. Runs a generic version of this repo's own benchmark methodology
   (`scripts/compare.ts`) against the user's own scenarios.
4. Optionally extends to a real-model comparison — but **never spends the
   user's API budget without asking first**.

This has been evaluated end-to-end: verified to trigger correctly on
realistic indirect prompts, to correctly decline unrelated requests, to never
modify the user's code, to hold up from a clean install in a brand-new
directory, and to refuse an unapproved paid API call even when a user tries
to pre-authorize it in a single text prompt (a platform-level permission gate
backs up the skill's own instruction).

## Project layout

```
src/              the engine (see above)
test/             unit tests (vitest)
benchmark/        the zero-cost mechanical benchmark + the optional real-LLM eval
  dataset.json       11 hand-built scenarios, each with a deliberately buried fact
  run.ts             naive vs. engine, + 50x order-randomization robustness check
  report.ts          prints the comparison table
  runLLMEval.ts      optional: sends both strategies' context to Gemini, grades the answer
  reportLLM.ts       prints the real-model comparison table
.claude/skills/contextcraft/   the packaged Claude Skill (see above)
```

## Installing and using the ContextCraft skill elsewhere

There's no `npm install` for this — a Claude Skill isn't a package published to
a registry, it's just files that Claude Code reads from a `.claude/skills/`
directory. Here's what actually works today:

**Use it on this repo (simplest)**
```bash
git clone git@github.com:Hanish2022/context-craft.git
cd context-craft
npm install
```
Then, working inside this directory in Claude Code, just describe your
problem naturally ("my agent keeps forgetting earlier decisions," "our
prompts are too expensive," etc.) — Claude discovers `.claude/skills/
contextcraft/` automatically and can diagnose your code and run the engine's
scripts.

**Point it at a different project**
Clone this repo somewhere (e.g. `~/tools/context-craft`), `npm install` it
there, then run its scripts directly against a data file you build from your
own project's context items, in the input shapes documented in
`.claude/skills/contextcraft/SKILL.md`:
```bash
npx tsx ~/tools/context-craft/.claude/skills/contextcraft/scripts/assemble.ts path/to/your-input.json
npx tsx ~/tools/context-craft/.claude/skills/contextcraft/scripts/compare.ts  path/to/your-dataset.json
```
Or just ask Claude (pointed at your project, with this repo's path mentioned)
to use the skill against your code — it'll read `SKILL.md` and drive the
scripts itself.

**Known limitation:** the skill's scripts use relative imports into this
repo's own `src/` and `benchmark/`, so right now they only work from inside a
full clone of this repo — you can't yet copy just the `.claude/skills/
contextcraft/` folder into an unrelated project and have it work standalone.
Publishing the engine as a real installable package (so the scripts import
`context-craft` as a dependency instead of relative paths) would be the
natural next step if broader portability is ever needed.

## Running it

```bash
npm install
npm test               # 23 unit tests, no network, no API key
npm run bench           # zero-cost mechanical benchmark
npm run bench:report    # prints the comparison table

# optional, costs API credits -- needs GEMINI_API_KEY in a local .env
npm run bench:llm
npm run bench:llm:report
```

## Status

This is a personal project exploring whether context engineering is worth
building as more than ad hoc prompt truncation. Milestones 1-3 of the
original plan (deterministic selection, compression, real-model validation)
are done and evidenced above. Not yet built: a dashboard, multi-provider
support, or semantic/embedding-based retrieval — deliberately deferred until
there's a concrete need, per the project's own "prove it before building on
top of it" philosophy.
