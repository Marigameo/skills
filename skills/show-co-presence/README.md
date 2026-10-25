# show-co-presence

Put [co-presence](https://github.com/Marigameo/co-presence) in your product, so people see who's working on a shared goal, people and agents together, what each is doing right now, and anything waiting on them.

co-presence is a zero-dependency web component. This skill covers when it earns its place and when to leave it out, strip or card, feeding it a snapshot and backend events, mapping an agent loop onto it, the `set_activity` tool that lets your model say what it's doing, writing labels, theming and the usual fixes.

## Install

```bash
npx skills@latest add marigameo/skills
npm install @marigameo/co-presence
```

Then ask your coding agent to show who's on a task. It starts at [SKILL.md](SKILL.md).

## What's inside

| File | What it covers |
|---|---|
| [SKILL.md](SKILL.md) | When to use it, setup, strip or card, agent hooks, `set_activity`, theming, troubleshooting |
| [API.md](API.md) | The exact data shape, events, labels, tokens and warning codes |

## Links

- [co-presence on npm](https://www.npmjs.com/package/@marigameo/co-presence)
- [The story](https://mariappan.netlify.app/work/co-presence/): how the component was designed and built.
- Pairs with [ask-clarifier](../ask-clarifier/): co-presence says "Needs you", the clarifier asks it.
