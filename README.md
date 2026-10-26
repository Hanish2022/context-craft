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
4. Recommends a fix, or implements it if asked — then verifies the change by
   re-running the same check from step 2/3, not just asserting it helped.
5. Optionally extends to a real-model comparison — but **never spends the
   user's API budget without asking first**.

It triggers automatically on relevant requests (no need to name it), or you
can invoke it explicitly with `/contextcraft <what you want looked at>`.

**Using a different AI coding agent (Codex, Cursor, etc.)?** `AGENTS.md` at the
repo root has the same workflow and rules, written against the
[open AGENTS.md standard](https://agents.md/) that those tools read natively.
It's simpler than the Claude Skill above (always-loaded project context, not
a conditionally-triggered skill), but points at the same scripts. I haven't
been able to verify tool-specific skill directories like `.cursor/skills/` or
`.codex/skills/` first-hand (sources disagree on the exact conventions), so
I'm not claiming those work — `AGENTS.md` is the one I could actually confirm
is a real, governed standard those tools read.

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
.claude-plugin/                plugin.json + marketplace.json, so the skill installs as a plugin
commands/contextcraft.md       explicit /contextcraft slash-command entry point
```

## Installing the ContextCraft skill

ContextCraft is a Claude Code **plugin** (`.claude-plugin/plugin.json` +
`.claude-plugin/marketplace.json`), so it installs with Claude Code's own
built-in plugin system — no `git clone`, no `npm install`, no third-party
installer:

```
/plugin install contextcraft --marketplace Hanish2022/context-craft
```

(Claude Code 2.1.275+. On an older version, run the two steps separately:
`/plugin marketplace add Hanish2022/context-craft` then
`/plugin install contextcraft@context-craft`.) This also works from your
shell: `claude plugin marketplace add Hanish2022/context-craft` then
`claude plugin install contextcraft@context-craft`.

This clones the repo into Claude Code's own plugin cache for you and installs
it for your account (`scope: user`), so it's available in every project from
then on — verified by installing it from a completely unrelated directory and
confirming it triggers correctly with no reference to this repo at all. Once
installed, just describe your problem naturally ("my agent keeps forgetting
earlier decisions," "our prompts are too expensive," "the right doc gets
retrieved but the answer's still wrong") — no need to name the skill.

**Working on this repo directly instead** (to modify the engine itself):
```bash
git clone git@github.com:Hanish2022/context-craft.git
cd context-craft
npm install
```
Claude Code also auto-discovers `.claude/skills/contextcraft/` as a
project-local skill when you're working inside a clone, independent of the
plugin install above.

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
