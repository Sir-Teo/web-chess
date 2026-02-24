export type HistoricalSampleFormat = 'classical' | 'rapid-blitz'

export type HistoricalSampleGame = {
  id: string
  lichessGameId: string
  white: string
  black: string
  result: '1-0' | '0-1' | '1/2-1/2'
  year: number
  event: string
  eco: string
  opening: string
  format: HistoricalSampleFormat
}

export const historicalSampleGames: HistoricalSampleGame[] = [
  {
    id: 'aronian-carlsen-olympiad-2014',
    lichessGameId: 'A2cM3wqU',
    white: 'Aronian, L.',
    black: 'Carlsen, M.',
    result: '1/2-1/2',
    year: 2014,
    event: '41st Olympiad Open 2014',
    eco: 'D16',
    opening: 'Slav Defense: Smyslov Variation',
    format: 'classical',
  },
  {
    id: 'carlsen-nakamura-norway-2015',
    lichessGameId: 'RxhRsNmg',
    white: 'Carlsen, M.',
    black: 'Nakamura, Hi.',
    result: '1/2-1/2',
    year: 2015,
    event: '3rd Norway Chess 2015',
    eco: 'D56',
    opening: "Queen's Gambit Declined: Lasker Defense",
    format: 'classical',
  },
  {
    id: 'carlsen-topalov-norway-2015',
    lichessGameId: 'IyXf8bOi',
    white: 'Carlsen, M.',
    black: 'Topalov, V.',
    result: '0-1',
    year: 2015,
    event: '3rd Norway Chess 2015',
    eco: 'D43',
    opening: 'Semi-Slav Defense',
    format: 'classical',
  },
  {
    id: 'so-carlsen-speed-2017',
    lichessGameId: 'hVPOX7F4',
    white: 'So, W.',
    black: 'Carlsen, M.',
    result: '1/2-1/2',
    year: 2017,
    event: 'chess.com Speed 3m+2spm 2017',
    eco: 'C10',
    opening: 'French Defense: Rubinstein Variation, Fort Knox',
    format: 'rapid-blitz',
  },
  {
    id: 'carlsen-grischuk-norway-blitz-2019',
    lichessGameId: '5C7mGGJp',
    white: 'Carlsen, M.',
    black: 'Grischuk, A.',
    result: '1-0',
    year: 2019,
    event: '7th Norway Blitz 2019',
    eco: 'C00',
    opening: 'French Defense: La Bourdonnais Variation',
    format: 'rapid-blitz',
  },
  {
    id: 'caruana-carlsen-rapid-2019',
    lichessGameId: 'boLujJkB',
    white: 'Caruana, F.',
    black: 'Carlsen, M.',
    result: '1-0',
    year: 2019,
    event: 'Saint Louis Rapid 2019',
    eco: 'B30',
    opening: 'Sicilian Defense: Nyezhmetdinov-Rossolimo',
    format: 'rapid-blitz',
  },
  {
    id: 'caruana-carlsen-blitz-2019',
    lichessGameId: 'Sxov6E94',
    white: 'Caruana, F.',
    black: 'Carlsen, M.',
    result: '1-0',
    year: 2019,
    event: 'Saint Louis Blitz 2019',
    eco: 'C63',
    opening: 'Ruy Lopez: Schliemann Defense',
    format: 'rapid-blitz',
  },
  {
    id: 'carlsen-caruana-sinquefield-2019',
    lichessGameId: 'QR5UbqUY',
    white: 'Carlsen, M.',
    black: 'Caruana, F.',
    result: '1/2-1/2',
    year: 2019,
    event: '7th Sinquefield Cup 2019',
    eco: 'D24',
    opening: "Queen's Gambit Accepted",
    format: 'classical',
  },
  {
    id: 'carlsen-caruana-clutch-2020',
    lichessGameId: 'hhaSI6SI',
    white: 'Carlsen, M.',
    black: 'Caruana, F.',
    result: '1-0',
    year: 2020,
    event: 'Clutch-ch June',
    eco: 'A22',
    opening: 'English Opening: Two Knights, Smyslov System',
    format: 'rapid-blitz',
  },
  {
    id: 'aronian-carlsen-goldmoney-2021',
    lichessGameId: 'ZCJF7nUs',
    white: 'Aronian, L.',
    black: 'Carlsen, M.',
    result: '1-0',
    year: 2021,
    event: 'Goldmoney Asian Rapid KO',
    eco: 'C01',
    opening: 'French Defense: Exchange Variation',
    format: 'rapid-blitz',
  },
]

