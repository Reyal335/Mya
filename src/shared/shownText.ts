// The plain text of a React element tree that Markdown drew, for the collapsed dialogue bar's
// line "the last line of the text typed so far". It reads the already-cut tree, so it counts the
// very characters the open box would show, and it parses nothing.
//
// The tree is read by its shape only (an element has `type` and `props`), so this file needs no
// React and the node test runner can reach it.

type Elementish = { type?: unknown; props?: { children?: unknown; node?: { tagName?: unknown } } }

// Elements that start a new line on both sides. A table cell is joined to its row with " · ".
const BLOCKS = new Set([
  'p',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'pre',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'hr',
  'div',
  'br'
])
const CELLS = new Set(['td', 'th'])

function tagOf(element: Elementish): string {
  if (typeof element.type === 'string') return element.type
  // A component that stands in for an element (the code box for `pre`) names it in `node`.
  const tag = element.props?.node?.tagName
  return typeof tag === 'string' ? tag : ''
}

function collect(node: unknown, out: string[]): void {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) collect(child, out)
    return
  }
  if (typeof node !== 'object') return
  const element = node as Elementish
  if (!element.props) return
  const tag = tagOf(element)
  const block = BLOCKS.has(tag)
  if (block) out.push('\n')
  if (CELLS.has(tag)) out.push(' · ')
  collect(element.props.children, out)
  if (block) out.push('\n')
}

// Every non-empty line of the tree, trimmed, with runs of spaces made one.
export function textLines(node: unknown): string[] {
  const out: string[] = []
  collect(node, out)
  return out
    .join('')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').replace(/^ · /, '').trim())
    .filter((line) => line !== '')
}

export function lastLine(node: unknown): string {
  const lines = textLines(node)
  return lines.length > 0 ? lines[lines.length - 1] : ''
}
