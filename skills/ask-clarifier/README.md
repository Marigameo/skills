# ask-clarifier

Wire [agent-clarifier](https://github.com/Marigameo/agent-clarifier) into your chat, so your agent asks a few short questions before it acts, and only when it matters.

agent-clarifier is a zero-dependency web component, like Claude's question card. This skill covers setup, placement at the composer, which question type to use, writing good questions, the tool that tells your model when to ask, theming and the usual fixes.

## Install

```bash
npx skills@latest add marigameo/skills
npm install @marigameo/agent-clarifier
```

Then ask your coding agent to add clarifying questions to your chat. It starts at [SKILL.md](SKILL.md).

## What's inside

| File | What it covers |
|---|---|
| [SKILL.md](SKILL.md) | Setup, placement, question types, the `ask_user` tool, theming, troubleshooting |
| [API.md](API.md) | Exact attributes, events, tokens and the result shape |

## Links

- [agent-clarifier on npm](https://www.npmjs.com/package/@marigameo/agent-clarifier)
- [The story](https://mariappan.netlify.app/work/agent-clarifier/): how the component was designed and built.
- Pairs with [show-co-presence](../show-co-presence/): co-presence says "Needs you", the clarifier asks it.
