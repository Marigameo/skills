# craft-component

Build a UI component the careful way. Agree what it is before any code, build it in reviewable milestones with tests that are proven to bite, try it in a plain playground and a story demo until you freeze it, then audit, review, simplify and ship on a go.

Use it for a card, a widget or any self-contained piece of UI. For a whole app or page, it's the wrong skill.

## Install

```bash
npx skills@latest add marigameo/skills
```

Then ask your coding agent to build or craft a component. It starts at [SKILL.md](SKILL.md).

## Pairs with

The audit step leans on [Emil Kowalski's skills](https://github.com/emilkowalski/skills) and [Jakub Krehel's](https://github.com/jakubkrehel/skills), by name and link. Install those too.

## Story mode

Off by default. When it's on, every round of the build is logged in a `JOURNAL.md` and snapshotted into `process/`, so the build can later be written up as a story.

## The story

- [agent-clarifier](https://mariappan.netlify.app/work/agent-clarifier/): the component this process was proven on, built with Claude Code as a pair.
- [All my skills](https://mariappan.netlify.app/skills/), with when to reach for each.
