// Diagram theme for Mermaid 12 (tested on 12.2.0). See DESIGN.md for the why.
// Tailwind colours by role; swap any value for your app's own. Each value is a
// solid hex: Mermaid derives shades from them and can't read var() or oklch().
export const palettes = {
  light: {
    surface: '#ffffff',   // what the diagram sits on, and node fill
    group: '#fafafa',     // zinc-50: subgraph and alt-block fill
    text: '#18181b',      // zinc-900
    muted: '#71717a',     // zinc-500: edge labels, secondary text
    line: '#d4d4d8',      // zinc-300: node borders
    border: '#e4e4e7',    // zinc-200: hairlines, group borders
    edge: '#71717a',      // zinc-500: connectors, 4.8:1 on white (WCAG asks 3:1)
    accent: '#2563eb',    // blue-600, or your primary: main path + the step that matters
    accentSoft: '#eff6ff',// blue-50
    success: '#047857', successSoft: '#ecfdf5', // emerald-700 / 50
    warning: '#b45309', warningSoft: '#fffbeb', // amber-700 / 50
    danger: '#b91c1c', dangerSoft: '#fef2f2',   // red-700 / 50
    // Section fills for mindmap, timeline, journey: blue, violet, emerald, amber, rose, sky (100).
    sections: ['#dbeafe', '#ede9fe', '#d1fae5', '#fef3c7', '#ffe4e6', '#e0f2fe'],
    sectionEdges: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9'],
    shadow: 'drop-shadow(0 1px 1px rgb(0 0 0 / .06)) drop-shadow(0 1px 3px rgb(0 0 0 / .1))',
  },
  dark: {
    surface: '#18181b',   // zinc-900
    group: '#202024',     // between zinc-900 and zinc-800
    text: '#f4f4f5',      // zinc-100
    muted: '#a1a1aa',     // zinc-400
    line: '#52525b',      // zinc-600
    border: '#3f3f46',    // zinc-700
    edge: '#71717a',      // zinc-500, 3.7:1 on the surface
    accent: '#60a5fa',    // blue-400
    // Dark washes are the 500 shade at 20% over the surface: the 950s read too heavy.
    accentSoft: '#1f2d47',
    success: '#34d399', successSoft: '#16382f', // emerald-400
    warning: '#fbbf24', warningSoft: '#443318', // amber-400
    danger: '#f87171', dangerSoft: '#432123',   // red-400
    sections: ['#1f2d47', '#2f2647', '#16382f', '#443318', '#442028', '#163444'],
    sectionEdges: ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#fb7185', '#38bdf8'],
    shadow: 'none',
  },
};

/** Everything `mermaid.initialize` needs for one mode. */
export function diagramConfig(mode, { colors = {}, fontFamily = 'ui-sans-serif, system-ui, sans-serif' } = {}) {
  const c = { ...palettes[mode], ...colors };
  const scale = {};
  for (let i = 0; i < 12; i++) {
    scale[`cScale${i}`] = c.sections[i % c.sections.length];
    scale[`cScalePeer${i}`] = c.sectionEdges[i % c.sectionEdges.length];
    scale[`cScaleInv${i}`] = c.sectionEdges[i % c.sectionEdges.length];
    scale[`cScaleLabel${i}`] = c.text;
  }
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily,
    themeVariables: {
      darkMode: mode === 'dark',
      fontFamily,
      fontSize: '13px',
      dropShadow: c.shadow, // replaces Mermaid 12's own grey shadow, which glows on dark
      background: c.surface,
      primaryColor: c.surface, primaryTextColor: c.text, primaryBorderColor: c.line,
      secondaryColor: c.group, secondaryTextColor: c.text, secondaryBorderColor: c.line,
      tertiaryColor: c.surface, tertiaryTextColor: c.text, tertiaryBorderColor: c.border,
      mainBkg: c.surface, nodeBorder: c.line, nodeTextColor: c.text,
      textColor: c.text, titleColor: c.text, lineColor: c.edge,
      clusterBkg: c.group, clusterBorder: c.border, edgeLabelBackground: c.surface,
      actorBkg: c.surface, actorBorder: c.line, actorTextColor: c.text, actorLineColor: c.border,
      signalColor: c.edge, signalTextColor: c.text,
      labelBoxBkgColor: c.group, labelBoxBorderColor: c.line, labelTextColor: c.text, loopTextColor: c.text,
      noteBkgColor: c.accentSoft, noteBorderColor: c.accent, noteTextColor: c.text,
      activationBkgColor: c.group, activationBorderColor: c.line,
      labelColor: c.text, altBackground: c.group,
      quadrant1Fill: c.sections[0], quadrant2Fill: c.sections[1], quadrant3Fill: c.group, quadrant4Fill: c.sections[2],
      quadrant1TextFill: c.text, quadrant2TextFill: c.text, quadrant3TextFill: c.text, quadrant4TextFill: c.text,
      quadrantPointFill: c.accent, quadrantPointTextFill: c.text, quadrantTitleFill: c.text,
      quadrantXAxisTextFill: c.muted, quadrantYAxisTextFill: c.muted,
      quadrantInternalBorderStrokeFill: c.border, quadrantExternalBorderStrokeFill: c.line,
      taskBkgColor: c.sections[0], taskBorderColor: c.sectionEdges[0],
      taskTextColor: c.text, taskTextOutsideColor: c.text, taskTextLightColor: c.text, taskTextDarkColor: c.text,
      activeTaskBkgColor: c.accentSoft, activeTaskBorderColor: c.accent,
      doneTaskBkgColor: c.group, doneTaskBorderColor: c.line,
      critBkgColor: c.dangerSoft, critBorderColor: c.danger,
      gridColor: c.border, todayLineColor: c.accent,
      sectionBkgColor: c.group, sectionBkgColor2: c.surface, altSectionBkgColor: c.surface, excludeBkgColor: c.group,
      attributeBackgroundColorOdd: c.surface, attributeBackgroundColorEven: c.group,
      faceColor: c.surface,
      ...scale,
    },
    themeCSS: diagramCSS(c),
  };
}

/** The finish theme variables can't express, plus the meaning classes. */
function diagramCSS(c) {
  const shape = ':is(rect.label-container, polygon.label-container, .outer-path path, circle.label-container)';
  const meaning = (name, stroke, fill) => `
    .node.${name} ${shape} { fill: ${fill} !important; stroke: ${stroke} !important; stroke-width: 1.5px !important; }`;
  return `
    .node ${shape} { stroke-width: 1px; }
    .node rect.label-container { rx: 8px; ry: 8px; }
    .nodeLabel, .nodeLabel p { font-weight: 500; line-height: 1.35; color: ${c.text}; }
    .flowchart-link { stroke: ${c.edge}; stroke-width: 1.5px; }
    .flowchart-link.edge-thickness-thick { stroke: ${c.accent}; stroke-width: 2.25px; }
    .flowchart-link.edge-pattern-dotted { stroke-dasharray: 3 4; }
    marker path, .arrowMarkerPath { fill: ${c.edge}; stroke: ${c.edge}; }
    g.edgeLabel, .labelBkg, span.edgeLabel p { background: transparent !important; }
    span.edgeLabel {
      display: inline-block; padding: 1px 8px; border-radius: 9999px;
      background: ${c.surface} !important; border: 1px solid ${c.border};
      color: ${c.muted}; font-size: 11.5px; font-weight: 500;
    }
    span.edgeLabel:empty { display: none; }
    .cluster rect { rx: 12px; ry: 12px; fill: ${c.group}; stroke: ${c.border}; stroke-width: 1px; }
    .cluster-label .nodeLabel, .cluster-label .nodeLabel p {
      font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: ${c.muted};
    }
    ${meaning('accent', c.accent, c.accentSoft)}
    ${meaning('success', c.success, c.successSoft)}
    ${meaning('warning', c.warning, c.warningSoft)}
    ${meaning('danger', c.danger, c.dangerSoft)}
    .node.muted ${shape} { fill: ${c.group} !important; stroke: ${c.border} !important; stroke-dasharray: 4 3; }
    .node.muted .nodeLabel, .node.muted .nodeLabel p { color: ${c.muted}; }
    rect.actor { rx: 8px; ry: 8px; stroke-width: 1px; filter: ${c.shadow}; }
    text.actor, text.actor > tspan { font-weight: 600; }
    .actor-line { stroke: ${c.border}; stroke-dasharray: 3 4; }
    .messageText { font-weight: 500; }
    .messageLine0, .messageLine1 { stroke: ${c.edge}; stroke-width: 1.5px; }
    #arrowhead path, #crosshead path { fill: ${c.edge}; stroke: ${c.edge}; }
    rect.note { rx: 6px; ry: 6px; }
    .labelBox { rx: 4px; ry: 4px; }
    .loopLine { stroke: ${c.line}; stroke-dasharray: 3 3; }
    .labelText, .labelText > tspan, .loopText, .loopText > tspan { font-weight: 600; }
    .transition { stroke: ${c.edge}; stroke-width: 1.5px; }
    .mindmap-node .nodeLabel, .mindmap-node .nodeLabel p { font-weight: 500; }
    .section-root .nodeLabel, .section-root .nodeLabel p { font-weight: 600; }
    .section-root :is(circle, rect, path) { fill: ${c.surface} !important; stroke: ${c.line} !important; stroke-width: 1px; }
    line[stroke="black"] { stroke: ${c.edge}; }
    ${Array.from({ length: 8 }, (_, i) => `.journey-section.section-type-${i}, .task.task-type-${i} { fill: ${c.sections[i % c.sections.length]}; stroke: ${c.sectionEdges[i % c.sectionEdges.length]}; }`).join('\n    ')}
    .face { stroke: ${c.edge}; }
    .taskText, .taskTextOutsideRight, .taskTextOutsideLeft, .sectionTitle, .tick text { fill: ${c.text}; }
    .grid .tick line, .grid path { stroke: ${c.border}; }
  `;
}

// Journey actor colours are hard-wired in Mermaid and ignore theme settings.
const JOURNEY_ACTORS = ['#8FBC8F', '#7CFC00', '#00FFFF', '#20B2AA', '#B0E0E6', '#FFFFE0'];
export function recolorJourney(svg, colors) {
  return JOURNEY_ACTORS.reduce((out, from, i) =>
    out.replace(new RegExp(`fill="${from}"`, 'gi'), `fill="${colors[i % colors.length]}"`), svg);
}

// Any CSS colour (oklch, var(), color-mix) to the solid hex Mermaid needs.
// Browser only. Use it to map your app's tokens onto the palette roles.
export function toHex(cssColor) {
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d');
  const probe = document.createElement('i');
  probe.style.color = cssColor;
  document.body.append(probe);
  ctx.fillStyle = getComputedStyle(probe).color;
  probe.remove();
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}
