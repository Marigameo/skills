// The cheap checks every diagram gets, on the server and in the browser:
// size, chart types and unsupported types. No parser, no DOM, no Node APIs.
export const MAX_LINES = 80;
export const MAX_CHARS = 5000;

// Numbers belong to real chart tools. Name yours in the hint.
export const CHART_TYPES = {
  pie: 'your pie chart tool',
  xychart: 'your bar or line chart tool',
  sankey: 'a table or bar chart',
  radar: 'a bar chart',
  treemap: 'a pie chart or table',
};

// Types that pull plugins or icon packs, or haven't passed a light and dark
// check with the theme. Allowing one is a one-line removal, after that check.
export const UNSUPPORTED = new Set([
  'architecture', 'zenuml', 'block', 'packet', 'kanban',
  'classdiagram', 'requirementdiagram', 'gitgraph',
  'c4context', 'c4container', 'c4component', 'c4dynamic', 'c4deployment',
]);

/** The diagram type keyword: the first line that isn't blank, a comment or frontmatter. */
export function diagramKeyword(source) {
  const body = source.replace(/^\s*---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
  const header = body.split('\n').map((line) => line.trim()).find((line) => line && !line.startsWith('%%')) ?? '';
  return header.split(/[\s:]/)[0].replace(/-beta$/, '').replace(/-v2$/, '').toLowerCase();
}

/** A rejection `{ ok: false, reason, error, hint }`, or null when the source may go on to the parser. */
export function precheck(source) {
  const text = typeof source === 'string' ? source.trim() : '';
  if (!text) return reject('empty', 'The diagram source is empty.', 'Write the source, starting with the diagram type, e.g. `flowchart TD`.');
  if (text.length > MAX_CHARS || text.split('\n').length > MAX_LINES) {
    return reject('too_large', `The diagram is over ${MAX_LINES} lines or ${MAX_CHARS} characters.`,
      'Keep only the steps that carry the explanation (aim for 5 to 15 nodes), or offer a zoomed-in follow-up.');
  }
  const keyword = diagramKeyword(text);
  if (CHART_TYPES[keyword]) {
    return reject('data_chart', `\`${keyword}\` plots numbers, which diagrams don't draw.`, `Use ${CHART_TYPES[keyword]} for this data instead.`);
  }
  if (UNSUPPORTED.has(keyword)) {
    return reject('unsupported_type', `\`${keyword}\` diagrams aren't supported here.`, 'Redraw it as a flowchart (use subgraphs for grouping) or another supported type.');
  }
  return null;
}

function reject(reason, error, hint) {
  return { ok: false, reason, error, hint };
}
