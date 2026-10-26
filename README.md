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
invoke it explicitly: `/contextcraft <what to look at>`.

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

### Working on the engine itself
```bash
git clone git@github.com:Hanish2022/context-craft.git
cd context-craft && npm install
npm test               # 23 unit tests, no network, no API key
npm run bench && npm run bench:report   # zero-cost benchmark vs. naive truncation
```
