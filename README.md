# Skills for crafting components with coding agents

Two skills, for designers and engineers who build UI with coding agents and don't want slop.

I'm Mari, a design engineer. What's in here is what I picked up at work and from the design engineers who keep sharing their craft on X and the web, tested by building [agent-clarifier](https://github.com/marigameo/agent-clarifier), a clarifying-questions card for chat agents, with Claude Code as a pair: every decision planned first, built in reviewable pieces, judged on screen, stressed, audited, and logged. The process worked, so it's packaged here to reuse.

## Install

```bash
npx skills@latest add marigameo/skills
```

Or as a Claude Code plugin:

```
/plugin marketplace add marigameo/skills
/plugin install mari-skills@marigameo-skills
```

Or point your agent at a raw `SKILL.md` link. They're plain markdown.

## Why

Agents build first and decide never. They pick a `#999` grey, a 300ms `ease-in` and a 6px radius because those look familiar, and nobody can say why any of them is right. The result works and feels like nothing.

These skills put the decisions back in front of the code: what the thing is, which states it has, what each visual signal means, and a written reason for every default. The owner decides, the agent proposes, builds and verifies, and nothing is "done" until it has been looked at in light, dark and at phone width.

## Skills

- **[craft-component](./skills/craft-component/SKILL.md)**: build a UI component the careful way. Brief, plan, sketch, milestones with tests that are proven to bite, a plain playground and a story demo the owner tries and gives feedback on until they freeze them, a slop check before every hand-over, then audits of the frozen version with external skills, review, simplify, release on a go. Its taste section holds only what those skills don't cover, and it grows as I learn.
- **[ask-clarifier](./skills/ask-clarifier/SKILL.md)**: how to use agent-clarifier. Setup, placement, which question type for what, writing good questions, the tool definition that tells your model when to ask, theming, troubleshooting.

`craft-component` leans on [Emil Kowalski's skills](https://github.com/emilkowalski/skills) and [Jakub Krehel's](https://github.com/jakubkrehel/skills) for its audit step, by name and link. Install those too.

## Story mode

`craft-component` has an optional story mode, off by default. When it's on, the build keeps a `JOURNAL.md` with one entry per round, and every round is snapshotted into `process/NN-name/`: the plan as it was, the renders, the audit report before any fix. Snapshots are never edited.

I turn it on when a build is also going to be written up. The folder becomes the source for the story: how the problem was approached, what was tried and turned down, and what the effort actually was. A separate skill drafts the portfolio piece and the posts from it. For a component that only needs to exist, leave it off; the journal is enough.

## License

MIT
