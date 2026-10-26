---
description: Audit and improve this project's LLM context pipeline using the ContextCraft skill
argument-hint: [what to look at or fix]
---

Follow the `contextcraft` skill's workflow (diagnose, measure, recommend or
implement if asked, verify, report -- only the steps this request actually
needs) to address the following request:

$ARGUMENTS

If no request was given above, audit the project's context-assembly and
conversation-history handling code for the failure patterns the skill looks
for (order-based truncation, no importance signal, unbounded growth, no
visibility into what got dropped), and report what you find.
