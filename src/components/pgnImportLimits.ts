export const MAX_PGN_IMPORT_BYTES = 5 * 1024 * 1024
/**
 * The same ceiling, for text that arrived without a file to measure -- a paste,
 * or a fetch from an archive. It has to be the same number as the byte limit
 * and not a rounder one beside it: at 5,000,000 a 4.86 MB export was read in
 * full, refused, and told "up to 5 MB", which is a size it was under. UTF-8
 * spends at least one byte a character, so text this gate lets through was
 * never over the byte limit either.
 */
export const MAX_PGN_IMPORT_CHARS = MAX_PGN_IMPORT_BYTES
export const PGN_IMPORT_LIMIT_MESSAGE = 'PGN import supports one game up to 5 MB. Choose a smaller file or paste a single game.'

export function pgnImportLengthError(text: string): string | null {
    return text.length > MAX_PGN_IMPORT_CHARS ? PGN_IMPORT_LIMIT_MESSAGE : null
}
