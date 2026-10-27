/** End of one tag pair, keeping quoted brackets and escaped quotes literal. */
export function pgnTagEnd(text: string, open: number): number | null {
  let cursor = open + 1
  let quoted = false
  while (cursor < text.length) {
    const character = text[cursor++]
    if (quoted && character === '\\') cursor++
    else if (character === '"') quoted = !quoted
    else if (character === ']' && !quoted) return cursor
  }
  return null
}

const TAG_PAIR = /^\[\s*([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\s*\]$/

/** Read the leading tags independently of line breaks; never read movetext. */
export function readPgnHeaderSection(text: string): { headers: Record<string, string>; end: number } {
  const headers: Record<string, string> = {}
  const whitespace = /\s*/y
  let cursor = 0
  let end = 0
  while (cursor < text.length) {
    whitespace.lastIndex = cursor
    whitespace.exec(text)
    cursor = whitespace.lastIndex
    if (text[cursor] !== '[') break
    const tagEnd = pgnTagEnd(text, cursor)
    if (tagEnd === null) break
    const tag = TAG_PAIR.exec(text.slice(cursor, tagEnd))
    if (!tag) break
    headers[tag[1]] = tag[2].replace(/\\(["\\])/g, '$1')
    end = cursor = tagEnd
  }
  return { headers, end }
}
