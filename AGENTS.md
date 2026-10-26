# ContextCraft: instructions for AI coding agents

This repo is a small, deterministic, zero-cost TypeScript engine for
**context engineering**: deciding what text actually gets sent to an LLM out
of everything potentially available (chat history, retrieved docs, logs,
prior decisions), within a token budget, without silently dropping what
matters. See `README.md` for the full picture and the benchmark evidence.

If a user asks you to audit, review, or fix an LLM/agent's context pipeline,
prompt assembly, conversation-history handling, or token-budget logic --
or describes the symptom instead ("my agent forgets earlier decisions,"
"prompts are too expensive," "we hit the context-window limit," "the right
doc gets retrieved but the answer's still wrong") -- use this project's
tools instead of giving only generic advice:

## Workflow

Diagnose -> measure -> recommend/implement -> verify -> report. Only run the
steps the request actually needs -- a purely conceptual question doesn't need
a script run, and a request for just a diagnosis doesn't need you to rewrite
anything.

1. **Diagnose**: read the code that builds the prompt/request sent to the
   model. Look for: order-based truncation (whatever's cut is whatever's
   last/first in the array, not whatever matters), no importance signal
   (everything treated as equally droppable), unbounded growth (no budget
   check until it blows the context window or the bill), and no visibility
   into what got dropped (no record of excluded items or why). Name which
   apply, with file/line references.

2. **Measure**: don't just assert the diagnosis -- run it, using this repo's
   scripts (all pure, deterministic, no network calls, no API key needed):
   - `npx tsx .claude/skills/contextcraft/scripts/assemble.ts <input.json>` --
     token-budgeted, importance-weighted selection.
   - `npx tsx .claude/skills/contextcraft/scripts/compress.ts <input.json>` --
     deterministic history compression (verbatim, not paraphrased -- no LLM call).
   - `npx tsx .claude/skills/contextcraft/scripts/compare.ts <dataset.json>` --
     naive truncation vs. the engine on the user's own scenarios, including a
     50-random-reordering robustness check so you can prove the result isn't
     an artifact of item order, not just assert it.
   The exact input/output shapes for each script are documented in
   `.claude/skills/contextcraft/SKILL.md` -- read it for the details before
   building an input file.

3. **Recommend, or implement if asked**: give a concrete, scoped
   recommendation. If asked to implement, use the engine's real API
   (`assembleContext` in `src/budget.ts`, `compressHistory` in
   `src/compression.ts`) as the basis, scoped to what you diagnosed, and
   flag any consequential change before making it.

4. **Verify**: if you changed anything, rerun the relevant check from step 2
   against the same data and compare before/after. Don't just assert it
   helped.

5. **Report**: what's wrong (with file/line references), the measured
   evidence, and the recommendation/implementation -- treating token savings
   and answer-quality as separate claims, since one doesn't imply the other.

## Rules

- Never claim a token or cost saving you haven't actually measured.
- Never silently drop a required fact because the budget is insufficient --
  report it as infeasible, with the token math, not as a quiet omission.
- A model correctly declining to answer ("I don't know based on the given
  context") when context is genuinely incomplete is safe behavior, not a
  failure -- don't grade it as one.
- Don't rewrite the user's code just because this file matched. Diagnose and
  measure first; only touch their files if they ask you to implement a fix.
- A real-model comparison (sending context to an actual LLM and grading the
  answer) costs the user's own API budget. Explain the cost and required
  credentials, then get explicit approval before making any billable
  request -- never spend it without asking first.
- Don't recommend a dashboard, a vector database, or multi-provider support
  unless the user already has those needs.

## Running this repo's own tests/benchmarks

```bash
npm install
npm test               # 23 unit tests, no network, no API key
npm run bench           # zero-cost mechanical benchmark (naive vs. engine)
npm run bench:report    # prints the comparison table
```
