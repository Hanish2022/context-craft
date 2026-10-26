# context-craft

**ContextCraft** audits and fixes how your LLM app or agent selects,
prioritizes, and trims context before it reaches a model — the usual culprit
behind "my agent forgets earlier decisions," "prompts are too expensive," or
"the right doc gets retrieved but the answer's still wrong." Backed by a
small, zero-cost, fully-tested context-selection engine (naive truncation:
0% fact retention in testing; this engine: 100%, order-independent — see
`src/` and `benchmark/` for the code and numbers).

## Install & use

### Claude Code
```
/plugin install contextcraft --marketplace Hanish2022/context-craft
```
Then just describe your problem naturally — no need to name the skill. Or
invoke it explicitly: `/contextcraft:audit <what to look at>`.

### Kiro CLI
```bash
curl -o ~/.kiro/agents/contextcraft.json \
  https://raw.githubusercontent.com/Hanish2022/context-craft/main/.kiro/agents/contextcraft.json
```
Then: `kiro-cli chat --agent contextcraft "my agent keeps forgetting earlier decisions"`

### Any other AI coding agent (Codex, Cursor, Copilot, etc.)
```bash
git clone git@github.com:Hanish2022/context-craft.git
```
`AGENTS.md` at the repo root carries the same instructions, via the open
[AGENTS.md](https://agents.md/) standard those tools read natively.

## Already have a chat open?

No need to restart — switch to ContextCraft mid-session:

**Claude Code**: just describe the problem in the same chat, or type
`/contextcraft:audit <what to look at>`. It auto-triggers on relevant requests too.

**Kiro CLI**: type `/agent swap contextcraft` in the chat, then ask your
question normally. Switch back anytime with `/agent swap kiro_default`.

## Example

Say your chat handler trims history like this:
```js
const trimmed = transcript.length > 4000 ? transcript.slice(-4000) : transcript
```
You ask: *"My support bot forgets the customer's subscription tier in long
conversations — here's src/chatHandler.js, what's wrong?"*

ContextCraft points at that exact line: `.slice(-4000)` keeps only the most
recent text, so once the conversation grows past ~4000 characters, the tier
mentioned at the start is the first thing silently dropped. It recommends
pinning that fact outside the sliding window instead of trimming it away by
recency — and, if you ask it to, runs `scripts/compare.ts` on your real data
to show the fix actually keeps the fact vs. the naive version losing it.

### Working on the engine itself
```bash
git clone git@github.com:Hanish2022/context-craft.git
cd context-craft && npm install
npm test               # 23 unit tests, no network, no API key
npm run bench && npm run bench:report   # zero-cost benchmark vs. naive truncation
```
