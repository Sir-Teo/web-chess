export const MAX_PGN_IMPORT_BYTES = 5 * 1024 * 1024
export const MAX_PGN_IMPORT_CHARS = 5_000_000
export const PGN_IMPORT_LIMIT_MESSAGE = 'PGN import supports one game up to 5 MB. Choose a smaller file or paste a single game.'

export function pgnImportLengthError(text: string): string | null {
    return text.length > MAX_PGN_IMPORT_CHARS ? PGN_IMPORT_LIMIT_MESSAGE : null
}
