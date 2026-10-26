---
name: contextcraft
description: Audit and improve how an LLM app or agent selects, prioritizes, and trims what gets sent to a model as context -- whether that context is conversation history, retrieved documents, logs, or anything else. Use this whenever a developer asks to review, audit, or fix their context pipeline, prompt assembly, conversation-history handling, token-budget logic, or what gets included in a prompt after retrieval. Also trigger when they describe the symptom rather than naming it: an agent "forgetting" earlier decisions, context getting too expensive, hitting context-window limits, naive truncation of chat history, a RAG/document-assistant pipeline where the right document is retrieved but the answer is still wrong or missing (the bug is usually in what happens to that document *after* retrieval, which this skill covers even though it doesn't do retrieval itself), or wanting to compare context strategies before picking one. Trigger even if they don't say "ContextCraft," "context engineering," or name this skill directly.
---

# ContextCraft

You're looking at someone's context pipeline: the code that decides what text
actually gets sent to an LLM, out of everything that's potentially available
(chat history, retrieved docs, logs, prior decisions). Most of these pipelines
were written as "concatenate until it's too long, then cut it off." That's the
failure mode this skill helps diagnose and fix -- with a deterministic,
testable engine, not more prompting advice.

This skill bundles a small, zero-cost, fully-tested TypeScript engine (in this
same repo's `src/`) that does token-budgeted, importance-weighted context
selection and history compression. Use its scripts to actually run the user's
real data through it, rather than only reasoning about their code in the
abstract.

## What you can be asked for

If the user invokes you with no specific request (e.g. an empty `/contextcraft:audit`),
don't guess -- state what you are and this menu, then stop and wait:

1. **Audit** -- diagnose code (or this very conversation) against the four
   failure patterns below, with file/line references.
2. **Measure** -- Steps 2 and 5: a zero-cost comparison (and, optionally,
   a real-model one) of naive truncation vs. this engine.
3. **Pin** -- see "Pinning durable facts" below: protect this session's own
   important facts from Claude Code's `/compact`.
4. **Implement** -- Step 3: apply a fix to the user's actual code, with their
   approval first.

## Workflow

The full loop is **diagnose → measure → recommend/implement → verify → report**,
but only run the steps the request actually calls for -- a purely conceptual
question doesn't need a script run, and a request that only asks for a
diagnosis doesn't need you to rewrite anything. Use judgment per request:

| User says | Do this |
| --- | --- |
| "My agent forgets earlier decisions." | Diagnose history truncation/compression (Step 1), then measure retention (Step 2). |
| "My API prompts are too expensive." | Diagnose repeated/oversized context, measure actual token usage, identify concrete savings -- don't just suggest caching generically. |
| "My RAG pipeline retrieves the right docs but answers poorly." | Diagnose how retrieved docs are selected, ordered, and fitted into the budget *after* retrieval -- not the retrieval step itself. |
| "I'm hitting the context-window limit." | Calculate the real budget, find what's oversized, measure, then recommend a selection strategy. |
| "Build me a context pipeline from scratch." | Skip straight to implement: generate it using this engine, with tests. |
| "Explain what context engineering is." | Just explain it concisely. Don't run scripts for a question that isn't about their code. |
| "Benchmark this using a real LLM." | Explain the cost and required credentials, then get explicit approval before any billable request (Step 5). |

## Rules

1. Never claim a token or cost saving you haven't actually measured (Step 2).
2. Never silently drop a required fact because the budget is insufficient --
   report it as infeasible, with the token math, not as a quiet omission.
3. A model correctly declining to answer ("I don't know based on the given
   context") when the context is genuinely incomplete is safe behavior, not a
   failure of either strategy -- don't grade it as one.
4. Don't rewrite the user's code just because this skill fired. Diagnose and
   measure first; only touch their files if they ask you to implement the fix.
5. Real-model benchmarking (Step 5) is optional and costs the user's own API
   budget -- always get explicit approval before making a billable request.

## Step 1: Find the pipeline and diagnose it

Read the code that builds the prompt or request sent to the model. Look
specifically for these patterns -- each one is a concrete, fixable problem,
not a vague code-smell:

- **Order-based truncation**: history or documents get concatenated in
  whatever order they arrive, then cut off once a length/token limit is hit.
  The problem: whatever is cut off is whatever happened to be last (or
  first) in the array, regardless of whether it matters. An old critical
  decision gets dropped just as easily as yesterday's small talk.
- **No importance signal**: every item is treated as equally worth keeping.
  If the code has no concept of "this fact matters more than that one,"
  nothing can protect important information from being trimmed.
- **Unbounded growth**: conversation history or retrieved context is just
  appended to a list/string with no budget check at all until it blows the
  context window or the bill.
- **No visibility into what got dropped**: when context is trimmed, the code
  doesn't record what was excluded or why, so no one can verify important
  information survived.

Name which of these apply in the user's code, with file/line references. This
is the diagnosis -- don't skip straight to "install this engine" without
showing what's actually wrong.

## Step 2: Prove it mechanically on their real data

Don't just assert the diagnosis -- run it. Take a real (or representative)
slice of the user's context items and required facts, shape it into the
format below, and run the engine's scripts directly:

**`scripts/assemble.ts`** -- token-budgeted, importance-weighted selection.
Input is a JSON file:
```json
{
  "items": [
    { "id": "a", "content": "...", "sourceType": "chat", "importance": 0.1, "relevanceScore": 0.1 },
    { "id": "b", "content": "...", "sourceType": "decision", "importance": 0.95, "relevanceScore": 0.9 }
  ],
  "inputBudget": 1000,
  "reservedTokens": 150
}
```
Run with: `npx tsx .claude/skills/contextcraft/scripts/assemble.ts <input.json>`
(run from the repo root this skill is installed in). It prints `selected`,
`excluded` (with a reason per item: `duplicate` or `over_budget`),
`estimatedTokens`, and `availableTokens`. `importance` scores at or above
0.8 are pinned ahead of the greedy pass, so a critical fact isn't dropped
just because it's old or appears early in the array -- that's the fix for
"order-based truncation" from Step 1.

**`scripts/compress.ts`** -- deterministic history compression. No LLM call:
recent items are kept verbatim, older items above an importance threshold are
preserved verbatim (not paraphrased), everything else is dropped with an
explicit reason. Input shape:
```json
{
  "items": [ /* ContextItem[], oldest first */ ],
  "enabled": true,
  "recentKeepCount": 10,
  "importancePreserveThreshold": 0.8
}
```
Run with: `npx tsx .claude/skills/contextcraft/scripts/compress.ts <input.json>`.
Use this when the diagnosis is "unbounded growth" in long conversation
history specifically.

**`scripts/compare.ts`** -- the real payoff: a side-by-side, zero-cost
benchmark of the user's current (naive) approach against the engine, on
their own scenarios. Input is an array of rows:
```json
[
  {
    "id": "scenario-1",
    "query": "What did we decide about X?",
    "inputBudget": 150,
    "reservedTokens": 20,
    "requiredFactIds": ["the-id-of-the-item-that-must-survive"],
    "contextPool": [ /* ContextItem[], in the user's real/original order */ ]
  }
]
```
Run with: `npx tsx .claude/skills/contextcraft/scripts/compare.ts <dataset.json>`.
It reports, per strategy: fact-retention rate, and a **retention range across
50 random re-orderings** of each row's context pool. That second number is
the important one -- it's how you prove the naive approach's behavior
depends on item order (a wide range) while the engine's doesn't (a tight
range near 100%), instead of just asserting it. Build this dataset from a
handful of the user's real prompts/questions where you know which fact had
to be present for a correct answer -- 5-10 honest scenarios beat a large
pile of arbitrary ones.

Mark a scenario's required facts' combined token count against its budget
before claiming a result: if the required facts alone exceed the available
budget, no strategy can retain all of them, and that's not a bug -- report
it as infeasible rather than a failure of either strategy (`compare.ts`
already does this split automatically).

## Step 3: Recommend, or implement if asked

After Steps 1-2 you have a grounded diagnosis and mechanical evidence. Give the
user a concrete, scoped recommendation (per Rule 4, don't go further
uninvited): usually, adopt importance-weighted selection for their context
assembly step, and keep compression disabled or conservative until they've
tested it on their own critical facts.

If Step 1 turns up a real issue even outside the four core patterns -- or one
that's small and not urgent yet, like an unbounded value that's currently
tiny -- don't just file it away as "something to revisit later." *Offer* a
concrete fix for it now (a capped/paginated version, a size check, whatever's
proportionate), even if you still wait for the user's go-ahead before
touching their files (per Rule 4). "I noticed X and can patch it in two lines
right now, want me to?" is more useful to a developer than a note that
nothing will ever come back to.

If the user asks you to actually implement the fix: use the engine's real API
(`assembleContext`, `compressHistory` -- see `src/budget.ts` and
`src/compression.ts` in this repo for the signatures) as the basis, scope the
change to what Step 1 diagnosed, and call out any consequential change (e.g.
changing what gets sent to the model in production) before making it, so the
user can weigh in first.

## Step 4: Verify

If you changed anything in Step 3, don't just assert it helped -- rerun the
relevant check from Step 2 (and Step 5, if you ran it) against the same data
and compare before/after. Report plainly what improved, what regressed (if
anything), and what's still unproven (e.g. "token usage dropped, but we
haven't tested this against your production traffic shape").

## Step 5: Optional -- real model comparison

Steps 1-2 are mechanical: they prove what gets *selected*, not whether a
model's *answer* actually improves. If the user has LLM API budget, extend
the comparison by sending each strategy's selected context to a real model
and grading the answer against expected keywords/facts. See
`../../../../benchmark/runLLMEval.ts` and `../../../../benchmark/grade.ts`
in this repo for a working template (built against Gemini, but the pattern
-- build prompt, call provider, keyword-match the answer against expected
facts -- transfers to any provider). Keep this step genuinely optional:
never spend the user's API budget without asking first, and watch for
free-tier rate limits (daily caps can be much lower than advertised --
handle 429s by recording the error per call rather than crashing the whole
run, as `runLLMEval.ts` does).

One real finding worth knowing before you claim victory here: a model can
correctly *decline* to answer ("I don't know based on the given context")
when the selected context is incomplete relative to what the question asks
-- that's correct, safe behavior, not a failure of either strategy. Don't
let a benchmark's grading logic count an honest abstention as equivalent to
a wrong answer.

## Step 6: Report findings

Summarize for the user:
1. What's wrong with their current pipeline (from Step 1), with file/line
   references.
2. The mechanical evidence (from Step 2): retention rates, and the
   order-randomization range that shows naive truncation's result isn't
   reliable.
3. If you ran Step 5: whether real model answers actually changed.
4. The recommendation or implementation from Step 3, and the before/after
   from Step 4 if you implemented anything -- treat token savings and
   answer-quality as separate claims (one does not imply the other).

Don't recommend a dashboard, a vector database, or multi-provider support
unless the user already has those needs -- this skill is about proving
context selection works before anything gets built on top of it.

## Pinning durable facts (when the "pipeline" is this conversation itself)

A user can point you at your own Claude Code session instead of a codebase --
"this chat keeps forgetting things." You can't change how `/compact` itself
works (that's Claude Code's own internals, not the user's code), so the fix
here is a workaround, not an implementation: a small facts file.

When asked to **pin**, or when Step 1's diagnosis is about this conversation:

1. List the durable facts worth protecting -- decisions made, constraints,
   branch/version/file identifiers, root-cause findings. Not the whole
   transcript; just what would actually hurt to lose.
2. Write them to a short file (e.g. `SESSION_FACTS.md` in the project root)
   as a compact bullet list, and tell the user to `/context add` it (or add
   it to their agent config) so it rides along every turn, immune to
   `/compact`'s recency-based eviction.
3. Be clear this is a workaround, not a demonstration of the engine -- it
   doesn't need Step 2's measurement to be worth doing. Offer the
   measurement separately, as evidence for *why* recency-based retention is
   risky in general, not as a precondition for pinning.

This plugin also ships a `PreCompact` hook (`hooks/hooks.json`, manual
`/compact` only -- never auto-compact, since blocking that can either do
nothing visible or surface a real API error) that reminds the user to pin
before compacting if no `SESSION_FACTS.md` exists yet for the project, once
per project. You don't need to do anything for this to work; it's automatic.
