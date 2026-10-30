# Sample report

What the skill hands you: [`duo-report.html`](duo-report.html), for two pages of Margin, the made-up site in [`test/`](../test). [`broken.html`](../test/broken.html) has every problem the audit looks for, and [`edge.html`](../test/edge.html) holds the judgement calls. Open the HTML file in a browser; it needs nothing else.

[![The sample report: the plan, the level tiles, the five poses and the first card](preview.jpg)](duo-report.html)

- `duo-report.html`: the report you read. A card per item, with an annotated screenshot where there's something to see, sorted into Needs you, My pick, Safe fix and Leave.
- `duo-triage.json`: the agent's triage, a level and a fix for each item. It's what turns the audit's findings into the plan at the top.
- `duo-report.md` and `duo-report.json`: the same findings for agents, with the item keys.
- `shots/`: the pictures.

To make it again, from the skill's folder:

```bash
python3 -m http.server 4173 --directory test &
node duo-audit.mjs http://localhost:4173/broken.html http://localhost:4173/edge.html --out sample-report
node duo-report.mjs sample-report     # after the triage is written
```

The audit rewrites the findings and the pictures; `duo-triage.json` is left as it is.
