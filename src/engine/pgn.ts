import { Chess } from 'chess.js'
import { parse as parsePgn } from 'chess.js/src/pgn.js'
import type { Node as ParsedPgnNode } from 'chess.js/src/node'
import type { GameNode, GameTreeImportEntry } from '../hooks/useGameTree'
import type { EvalSnapshot } from './analysis'
import { hasLegalKingPlacement } from './fen'

const INITIAL_FEN = new Chess().fen()
const PGN_TAG_NAME_PATTERN = /^[A-Za-z0-9_]+$/
const PGN_EVENT_TAG_LINE_PATTERN = /^\s*\[Event\s+"(?:[^"\\]|\\.)*"\]\s*$/gim
const PGN_RESULT_TAG_LINE_PATTERN = /^\s*\[Result\s+"(?:[^"\\]|\\.)*"\]\s*$/gim
const PGN_HEADER_LINE_PATTERN = /^\s*\[[A-Za-z0-9_]+\s+"(?:[^"\\]|\\.)*"\]\s*$/gm
const PGN_BLOCK_COMMENT_PATTERN = /\{[^]*?\}/g
const PGN_SEMICOLON_COMMENT_PATTERN = /;[^\r\n]*/g
const PGN_MOVETEXT_RESULT_PATTERN = /(?:^|\s)(?:1-0|0-1|1\/2-1\/2|\*)(?=\s|$)/g
const VALID_PGN_RESULTS = new Set(['1-0', '0-1', '1/2-1/2', '*'])
const PGN_EVAL_COMMENT_PATTERN = /\[%eval\s+[^\]]+\]/gi
export const PGN_EMPTY_IMPORT_ERROR = 'Paste a PGN game or choose a .pgn file before importing.'
export const PGN_MULTIPLE_GAMES_ERROR = 'PGN import supports one game at a time. Paste a single game, or split a database file before importing.'
export const PGN_NO_MOVES_IMPORT_ERROR = 'PGN import needs at least one legal move.'
const PGN_IMPORT_USER_ERRORS = new Set([PGN_EMPTY_IMPORT_ERROR, PGN_MULTIPLE_GAMES_ERROR, PGN_NO_MOVES_IMPORT_ERROR])
const QUALITY_EXPORT_LABELS: Record<NonNullable<GameNode['quality']>, string> = {
    best: 'Best',
    good: 'Good',
    inaccuracy: 'Inaccuracy',
    mistake: 'Mistake',
    blunder: 'Blunder',
    pending: 'Pending',
}

export type PgnExportOptions = {
    includeVariations?: boolean
    includeComments?: boolean
    includeEngineAnnotations?: boolean
    includeGlyphs?: boolean
}

const DEFAULT_PGN_EXPORT_OPTIONS: Required<PgnExportOptions> = {
    includeVariations: true,
    includeComments: true,
    includeEngineAnnotations: true,
    includeGlyphs: true,
}

function sanitizePgnHeaderValue(value: string): string {
    return value
        .replace(/[\r\n]+/g, ' ')
        .replace(/"/g, "'")
}

export function hasMultiplePgnGames(pgnText: string): boolean {
    const eventTags = pgnText.match(PGN_EVENT_TAG_LINE_PATTERN)
    if ((eventTags?.length ?? 0) > 1) return true

    const resultTags = pgnText.match(PGN_RESULT_TAG_LINE_PATTERN)
    if ((resultTags?.length ?? 0) > 1) return true

    const movetextOnly = pgnText
        .replace(PGN_HEADER_LINE_PATTERN, '\n')
        .replace(PGN_BLOCK_COMMENT_PATTERN, ' ')
        .replace(PGN_SEMICOLON_COMMENT_PATTERN, ' ')
    const terminationMarkers = movetextOnly.match(PGN_MOVETEXT_RESULT_PATTERN)
    return (terminationMarkers?.length ?? 0) > 1
}

export function pgnImportContentError(pgnText: string): string | null {
    if (!pgnText.trim()) return PGN_EMPTY_IMPORT_ERROR
    return hasMultiplePgnGames(pgnText) ? PGN_MULTIPLE_GAMES_ERROR : null
}

export function pgnImportUserErrorMessage(error: unknown): string | null {
    if (!(error instanceof Error)) return null
    return PGN_IMPORT_USER_ERRORS.has(error.message) ? error.message : null
}

function normalizePgnResult(result: string | undefined): string {
    const normalized = result?.trim()
    return normalized && VALID_PGN_RESULTS.has(normalized) ? normalized : '*'
}

export function formatPgnDate(date = new Date()): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}.${month}.${day}`
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

function sideToMoveScoreFromWhitePov(
    fen: string,
    score: { cp?: number; mate?: number },
): EvalSnapshot {
    const turn = fen.split(' ')[1]

    if (isFiniteNumber(score.mate)) {
        const mate = turn === 'w' ? score.mate : -score.mate
        return {
            cp: mate > 0 ? 10000 : -10000,
            mate,
            purpose: 'import-load',
            mode: 'review',
            searchedAt: Date.now(),
        }
    }

    const whitePovCp = score.cp ?? 0
    return {
        cp: turn === 'w' ? whitePovCp : -whitePovCp,
        purpose: 'import-load',
        mode: 'review',
        searchedAt: Date.now(),
    }
}

function evaluationFromComment(fen: string, comment: string | undefined): EvalSnapshot | null {
    if (!comment) return null

    const match = comment.match(/\[%eval\s+([^\]\s]+)\s*\]/i)
    const rawScore = match?.[1]?.trim()
    if (!rawScore) return null

    if (rawScore.startsWith('#')) {
        const mate = Number(rawScore.slice(1))
        if (!Number.isFinite(mate)) return null
        return sideToMoveScoreFromWhitePov(fen, { mate })
    }

    const pawnScore = Number(rawScore)
    if (!Number.isFinite(pawnScore)) return null
    return sideToMoveScoreFromWhitePov(fen, { cp: Math.round(pawnScore * 100) })
}

function sanitizePgnCommentText(value: string | undefined): string | undefined {
    const sanitized = value
        ?.replace(/[\r\n]+/g, ' ')
        .replace(/{/g, '[')
        .replace(/}/g, ']')
        .replace(/\s+/g, ' ')
        .replace(/\s*;\s*/g, '; ')
        .replace(/^(?:;\s*)+|(?:;\s*)+$/g, '')
        .trim()

    return sanitized || undefined
}

function humanCommentFromPgnComment(comment: string | undefined): string | undefined {
    if (!comment) return undefined
    return sanitizePgnCommentText(
        comment
            .replace(PGN_EVAL_COMMENT_PATTERN, '')
            .replace(/\s*;\s*/g, '; '),
    )
}

function normalizePgnSuffix(suffix: unknown): string | undefined {
    const value = Array.isArray(suffix) ? suffix.join('') : typeof suffix === 'string' ? suffix : ''
    return /^[!?]{1,2}$/.test(value) ? value : undefined
}

function normalizePgnNags(nags: unknown): string[] | undefined {
    const values = Array.isArray(nags) ? nags : typeof nags === 'string' ? [nags] : []
    const normalized = values
        .map(value => String(value).trim().replace(/^\$/, ''))
        .filter(value => /^\d+$/.test(value))

    return normalized.length ? normalized : undefined
}

function moveTextForNode(
    node: GameNode,
    parentFen: string,
    options: Required<PgnExportOptions>,
): string {
    const suffix = options.includeGlyphs ? normalizePgnSuffix(node.suffix) ?? '' : ''
    const nags = options.includeGlyphs ? normalizePgnNags(node.nags)?.map(nag => `$${nag}`) ?? [] : []
    return [
        `${movePrefixFromFen(parentFen)} ${node.san}${suffix}`,
        ...nags,
    ].join(' ')
}

function bestMoveSanFromFen(fen: string, bestMove: string): string {
    if (bestMove.length < 4) return bestMove

    try {
        const replay = new Chess(fen)
        const move = replay.move({
            from: bestMove.slice(0, 2),
            to: bestMove.slice(2, 4),
            promotion: bestMove[4],
        })
        return move?.san ?? bestMove
    } catch {
        return bestMove
    }
}

function movePrefixFromFen(fen: string): string {
    const position = new Chess(fen)
    const moveNumber = position.moveNumber()
    return position.turn() === 'w' ? `${moveNumber}.` : `${moveNumber}...`
}

function commentForNode(
    node: GameNode,
    parentFen: string,
    evaluationsByFen: Map<string, EvalSnapshot>,
    options: Required<PgnExportOptions>,
): string | null {
    const commentParts: string[] = []
    const evaluation = evaluationsByFen.get(node.fen)
    const preservedComment = sanitizePgnCommentText(node.comment)

    if (options.includeEngineAnnotations && evaluation) {
        const turn = node.fen.split(' ')[1]
        const cpPov = isFiniteNumber(evaluation.cp)
            ? turn === 'w' ? evaluation.cp : -evaluation.cp
            : undefined

        let evalStr: string | null = null
        if (isFiniteNumber(evaluation.mate)) {
            const matePov = turn === 'w' ? evaluation.mate : -evaluation.mate
            evalStr = `#${matePov}`
        } else if (typeof cpPov === 'number' && Math.abs(cpPov) >= 10000) {
            evalStr = cpPov > 0 ? '#1' : '#-1'
        } else if (typeof cpPov === 'number') {
            const cpVal = cpPov / 100
            evalStr = cpVal.toFixed(2)
        }

        if (evalStr) commentParts.push(`[%eval ${evalStr}]`)
    }

    if (options.includeComments && preservedComment) {
        commentParts.push(preservedComment)
    }

    const beforeEvaluation = evaluationsByFen.get(parentFen)
    if (options.includeEngineAnnotations && beforeEvaluation?.bestMove && beforeEvaluation.bestMove !== node.uci) {
        commentParts.push(`Best ${bestMoveSanFromFen(parentFen, beforeEvaluation.bestMove)}`)
    }

    if (options.includeEngineAnnotations && node.quality && node.quality !== 'pending') {
        commentParts.push(QUALITY_EXPORT_LABELS[node.quality])
    }

    return commentParts.length ? `{ ${commentParts.join('; ')} }` : null
}

function wrapMovetext(tokens: string[], result: string): string {
    const outputTokens = [...tokens, result]
    const lines: string[] = []
    let currentLine = ''

    for (const token of outputTokens) {
        if (!currentLine) {
            currentLine = token
            continue
        }

        if (currentLine.length + token.length + 1 > 70) {
            lines.push(currentLine)
            currentLine = token
            continue
        }

        currentLine += ` ${token}`
    }

    if (currentLine) lines.push(currentLine)
    return lines.join('\n')
}

export function rootFenFromPgnHeaders(headers: Record<string, string>): string {
    const fenHeader = headers.FEN?.trim()
    if (!fenHeader) return INITIAL_FEN

    const fen = new Chess(fenHeader).fen()
    if (!hasLegalKingPlacement(fen)) throw new Error('Invalid FEN king placement.')
    return fen
}

type FirstMoveNode = {
    node: ParsedPgnNode
    leadingComment?: string
}

function joinPgnComments(parts: Array<string | undefined>): string | undefined {
    return sanitizePgnCommentText(parts.filter(Boolean).join('; '))
}

function firstMoveNode(node: ParsedPgnNode, leadingComment?: string): FirstMoveNode | null {
    const nextLeadingComment = !node.move
        ? joinPgnComments([leadingComment, humanCommentFromPgnComment(node.comment)])
        : leadingComment

    if (node.move) {
        return {
            node,
            leadingComment: nextLeadingComment,
        }
    }

    for (const variation of node.variations) {
        const child = firstMoveNode(variation, nextLeadingComment)
        if (child) return child
    }
    return null
}

function buildImportEntry(
    node: ParsedPgnNode,
    position: Chess,
    evaluations: Map<string, EvalSnapshot>,
    leadingComment?: string,
): GameTreeImportEntry | null {
    const first = firstMoveNode(node, leadingComment)
    const moveSan = first?.node.move
    if (!moveSan) return null
    const moveNode = first.node

    const nextPosition = new Chess(position.fen())
    const move = nextPosition.move(moveSan)
    if (!move) throw new Error(`Invalid move in PGN: ${moveSan}`)

    const importedEvaluation = evaluationFromComment(nextPosition.fen(), moveNode.comment)
    if (importedEvaluation) {
        evaluations.set(nextPosition.fen(), importedEvaluation)
    }

    return {
        move,
        fen: nextPosition.fen(),
        comment: joinPgnComments([first.leadingComment, humanCommentFromPgnComment(moveNode.comment)]),
        suffix: normalizePgnSuffix(moveNode.suffix),
        nags: normalizePgnNags(moveNode.nag),
        children: buildImportEntries(moveNode.variations, nextPosition, evaluations),
    }
}

function buildImportEntries(
    nodes: ParsedPgnNode[],
    position: Chess,
    evaluations: Map<string, EvalSnapshot>,
    leadingComment?: string,
): GameTreeImportEntry[] {
    const entries: GameTreeImportEntry[] = []

    for (const node of nodes) {
        try {
            const entry = buildImportEntry(
                node,
                position,
                evaluations,
                entries.length === 0 ? leadingComment : undefined,
            )
            if (entry) entries.push(entry)
            continue
        } catch (error) {
            const previous = entries[entries.length - 1]
            if (!previous) throw error

            const fallback = buildImportEntry(node, new Chess(previous.fen), evaluations)
            if (!fallback) throw error
            previous.children = [...(previous.children ?? []), fallback]
        }
    }

    return entries
}

export function parsePgnMoveTree(pgnText: string): {
    headers: Record<string, string>
    rootFen: string
    moves: GameTreeImportEntry[]
    evaluations: Map<string, EvalSnapshot>
    result?: string
} {
    const importError = pgnImportContentError(pgnText)
    if (importError) throw new Error(importError)

    const parsed = parsePgn(pgnText)
    const headers = { ...parsed.headers }
    if (parsed.result && !headers.Result) headers.Result = parsed.result
    const rootFen = rootFenFromPgnHeaders(parsed.headers)
    const rootPosition = new Chess(rootFen)
    const evaluations = new Map<string, EvalSnapshot>()
    const moves = buildImportEntries(
        parsed.root.variations,
        rootPosition,
        evaluations,
        humanCommentFromPgnComment(parsed.root.comment),
    )
    if (!moves.length) throw new Error(PGN_NO_MOVES_IMPORT_ERROR)

    return {
        headers,
        rootFen,
        moves,
        evaluations,
        result: parsed.result,
    }
}

export function flattenPgnMainLine(entries: GameTreeImportEntry[]): Array<{ move: GameTreeImportEntry['move']; fen: string }> {
    const line: Array<{ move: GameTreeImportEntry['move']; fen: string }> = []
    let current: GameTreeImportEntry | undefined = entries[0]

    while (current) {
        line.push({ move: current.move, fen: current.fen })
        current = current.children?.[0]
    }

    return line
}

export function exportAnnotatedPgn(
    mainLine: GameNode[],
    evaluationsByFen: Map<string, EvalSnapshot>,
    header: Record<string, string> = {},
    allNodes?: Map<string, GameNode>,
    exportOptions: PgnExportOptions = {},
): string {
    let pgn = ''
    const rootFen = mainLine[0]?.fen ? new Chess(mainLine[0].fen).fen() : INITIAL_FEN
    const options = { ...DEFAULT_PGN_EXPORT_OPTIONS, ...exportOptions }

    // Set headers (Event, Site, Date, Round, White, Black, Result)
    const defaultHeaders: Record<string, string> = {
        Event: 'Web Chess Game',
        Site: 'Web Chess',
        Date: formatPgnDate(),
        Round: '1',
        White: 'Player 1',
        Black: 'Player 2',
        Result: '*',
    }

    if (rootFen !== INITIAL_FEN) {
        defaultHeaders.SetUp = '1'
        defaultHeaders.FEN = rootFen
    }

    const headers = { ...defaultHeaders, ...header }
    const result = normalizePgnResult(headers.Result)
    headers.Result = result

    for (const [key, value] of Object.entries(headers)) {
        if (!PGN_TAG_NAME_PATTERN.test(key)) continue
        pgn += `[${key} "${sanitizePgnHeaderValue(value)}"]\n`
    }
    pgn += '\n'

    const nodeLookup = allNodes ?? new Map(mainLine.map(node => [node.id, node]))
    const tokens: string[] = []
    const visited = new Set<string>()

    const renderLine = (startId: string): string[] => {
        const lineTokens: string[] = []
        let node = nodeLookup.get(startId)

        while (node?.move && !visited.has(node.id)) {
            visited.add(node.id)
            const parent = node.parent ? nodeLookup.get(node.parent) : undefined
            const parentFen = parent?.fen ?? rootFen
            lineTokens.push(moveTextForNode(node, parentFen, options))

            const comment = commentForNode(node, parentFen, evaluationsByFen, options)
            if (comment) lineTokens.push(comment)

            if (options.includeVariations && parent?.children[0] === node.id) {
                for (const variationId of parent.children.slice(1)) {
                    const variationTokens = renderLine(variationId)
                    if (variationTokens.length) {
                        lineTokens.push(`(${variationTokens.join(' ')})`)
                    }
                }
            }

            const nextId = node.children[0]
            node = nextId ? nodeLookup.get(nextId) : undefined
        }

        return lineTokens
    }

    const firstMove = mainLine[1]
    if (firstMove?.id) {
        tokens.push(...renderLine(firstMove.id))
    }

    pgn += wrapMovetext(tokens, result)

    return pgn.trim() + '\n'
}
