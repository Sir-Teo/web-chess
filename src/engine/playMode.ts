export type PlayGameMode = 'human-vs-human' | 'human-vs-ai' | 'ai-vs-ai'
export type PlayColor = 'white' | 'black'
export type PlayOrientation = 'white' | 'black'

export function defaultOrientationForGameMode(
  mode: PlayGameMode,
  playerColor: PlayColor,
): PlayOrientation {
  return mode === 'human-vs-ai' ? playerColor : 'white'
}
