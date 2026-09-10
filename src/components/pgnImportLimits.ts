import { MAX_LIBRARY_PGN_LENGTH } from '../engine/gameLibrary'

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

/**
 * Past this a file is described rather than shown.
 *
 * A textarea lays out every character it holds, visible or not, and a database
 * is megabytes of text a reader cannot read, edit or scroll to any purpose --
 * 1.6s of layout for 4.9 MB on a phone's processor, spent on twelve visible
 * lines of a 15,000-game export. The bound is the largest single game the
 * library will take, so anything the box is still useful for is still shown.
 */
export const MAX_SHOWN_IMPORT_CHARS = MAX_LIBRARY_PGN_LENGTH

export function pgnImportLengthError(text: string): string | null {
    return text.length > MAX_PGN_IMPORT_CHARS ? PGN_IMPORT_LIMIT_MESSAGE : null
}

/**
 * Only what came from a file. A paste has already been laid out by the browser
 * before React hears about it, so replacing it with a summary would take the
 * reader's own text off the screen and save nothing.
 */
export function importTextIsTooBigToShow(text: string, fromFile: boolean): boolean {
    return fromFile && text.length > MAX_SHOWN_IMPORT_CHARS
}

/** The size of loaded text, in the units a file manager would show it in. */
export function describeImportSize(chars: number): string {
    return chars < 1024 * 1024
        ? `${Math.round(chars / 1024)} KB`
        : `${(chars / (1024 * 1024)).toFixed(1)} MB`
}
