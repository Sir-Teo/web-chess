/**
 * What this app writes when a game has no names of its own. They round-trip
 * through every save -- the autosave, the library, an export read back in --
 * and on the way back they are this app's placeholders, not a game's players.
 */
export const APP_PLACEHOLDER_HEADERS = {
  Event: 'Web Chess Game',
  White: 'Player 1',
  Black: 'Player 2',
} as const

/** A header value, or undefined when it is this app's own placeholder for it. */
export function withoutAppPlaceholder(
  field: keyof typeof APP_PLACEHOLDER_HEADERS,
  value: string | undefined,
): string | undefined {
  return value === APP_PLACEHOLDER_HEADERS[field] ? undefined : value
}
