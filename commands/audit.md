---
description: Audit and improve this project's LLM context pipeline using the ContextCraft skill
argument-hint: [what to look at or fix]
---

Follow the `contextcraft` skill's workflow (diagnose, measure, recommend or
implement if asked, verify, report -- only the steps this request actually
needs) to address the following request:

$ARGUMENTS

If no request was given above, don't guess what to do -- show this menu
instead and stop:

---
**ContextCraft**: audits and fixes how an LLM app, agent, or this very Claude
Code session decides what context reaches the model -- replacing "keep
recent, drop old" with importance-weighted selection that doesn't lose
critical facts to ordering.

What you can ask it to do:
1. **Audit** -- point it at code that builds a prompt/context (or this
   session itself) and get a diagnosis with file/line references.
2. **Measure** -- a zero-cost, no-API-key comparison of naive truncation vs.
   importance-weighted selection on real or representative data, including
   an order-randomization robustness check.
3. **Pin** -- create a small facts file with this session's durable facts
   (decisions, branch/version, root-cause findings) so they survive
   `/compact` instead of depending on recency.
4. **Implement** -- apply an importance-weighted fix to your actual
   context-assembly code, with your approval first.

Say which one (or describe your problem naturally and I'll pick).
---
