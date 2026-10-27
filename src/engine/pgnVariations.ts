type Part = {
    kind: 'text' | 'space' | 'comment' | 'nag' | 'variation'
    text: string
    lineComment?: boolean
    child?: number
}

/** Put annotations after a RAV back on its owning move for chess.js's grammar. */
export function reorderPostVariationAnnotations(text: string): string {
    if (!/\)\s*[{$;]/.test(text)) return text
    const frames: Part[][] = [[]]
    const stack = [0]
    const spaces = /\s+/y, nag = /\$\d+/y, plain = /[^\s(){;$]+/y, lineEnd = /[\r\n]/g
    let cursor = 0
    while (cursor < text.length) {
        const parts = frames[stack[stack.length - 1]]
        const character = text[cursor]
        if (character === '(') {
            const child = frames.push([]) - 1
            parts.push({ kind: 'variation', text: '', child })
            stack.push(child)
            cursor++
        } else if (character === ')') {
            if (stack.length === 1) return text
            stack.pop()
            cursor++
        } else if (character === '{') {
            const close = text.indexOf('}', cursor + 1)
            if (close < 0) return text
            parts.push({ kind: 'comment', text: text.slice(cursor, close + 1) })
            cursor = close + 1
        } else if (character === ';') {
            lineEnd.lastIndex = cursor + 1
            const end = lineEnd.exec(text)?.index ?? text.length
            parts.push({ kind: 'comment', text: text.slice(cursor, end), lineComment: true })
            cursor = end
        } else {
            spaces.lastIndex = nag.lastIndex = plain.lastIndex = cursor
            const space = spaces.exec(text), glyph = space ? null : nag.exec(text)
            const word = space || glyph || plain.exec(text)
            const value = word?.[0] ?? character
            parts.push({ kind: space ? 'space' : glyph ? 'nag' : 'text', text: value })
            cursor += value.length
        }
    }
    // Keep malformed tails available for the parser to reject.
    if (stack.length !== 1) return text

    // Child frames come first: no recursive JS calls even for nested studies.
    const rendered: string[] = []
    for (let frame = frames.length - 1; frame >= 0; frame--) {
        const parts = frames[frame]
        const value = (part: Part) => part.kind === 'variation' ? `(${rendered[part.child!]})` : part.text
        let output = ''
        for (let index = 0; index < parts.length;) {
            if (parts[index].kind === 'text') { output += parts[index++].text; continue }
            const start = index
            let sawVariation = false, needsReorder = false
            while (index < parts.length && parts[index].kind !== 'text') {
                const kind = parts[index++].kind
                if (kind === 'variation') sawVariation = true
                else if (sawVariation && (kind === 'comment' || kind === 'nag')) needsReorder = true
            }
            const group = parts.slice(start, index)
            if (!needsReorder) { output += group.map(value).join(''); continue }
            const comments = group.filter(part => part.kind === 'comment')
            const notes = comments.map(part => (part.lineComment ? part.text.slice(1) : part.text.slice(1, -1))
                .replace(/[\r\n]+/g, ' ').trim()).join(' ')
            // A semicolon can quote literal braces; keep the merged note in
            // that form and terminate its line before putting variations back.
            const comment = comments.length
                ? comments.some(part => part.lineComment) ? `;${notes}\n` : `{${notes}}`
                : ''
            const prefix = group[0].kind === 'space' ? group[0].text : output ? ' ' : ''
            const last = group[group.length - 1]
            const suffix = last.kind === 'space' ? last.text : ' '
            output += prefix + [group.filter(part => part.kind === 'nag').map(value).join(' '), comment,
                group.filter(part => part.kind === 'variation').map(value).join(' ')].filter(Boolean).join(' ') + suffix
        }
        rendered[frame] = output
    }
    return rendered[0]
}
