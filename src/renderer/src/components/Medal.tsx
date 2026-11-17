import type { AchievementId } from '../../../shared/achievements'
import './Medal.css'

// A 40px pixel medal: a 10x10 grid at 4px a pixel. The ribbon is the accent, the
// medal --waiting, and each achievement has its own 4x4 mark in the middle. Locked
// medals are grey; a hidden one shows a question mark.

type MedalProps = {
  id: AchievementId
  look: 'unlocked' | 'locked' | 'hidden'
}

const RIBBON = ['..##..##..', '...####...', '...####...', '....##....']
const MEDAL = ['...####...', '..######..', '..######..', '..######..', '..######..', '...####...']

const MARKS: Record<AchievementId | 'hidden', string[]> = {
  'first-quest': ['..#.', '.##.', '..#.', '.###'],
  'party-of-5': ['####', '###.', '...#', '###.'],
  'night-owl': ['.##.', '#...', '#...', '.##.'],
  flawless: ['...#', '..#.', '#.#.', '.#..'],
  'full-party': ['###.', '####', '#...', '#...'],
  hoarder: ['####', '#..#', '####', '####'],
  'boss-slayer': ['...#', '..#.', '##..', '.#..'],
  speedrun: ['..##', '.##.', '##..', '#...'],
  'second-wind': ['.##.', '####', '.##.', '.##.'],
  hidden: ['.##.', '...#', '..#.', '..#.']
}

function cells(rows: string[], top: number, left: number): { x: number; y: number }[] {
  return rows.flatMap((row, y) =>
    [...row].flatMap((pixel, x) => (pixel === '#' ? [{ x: left + x, y: top + y }] : []))
  )
}

function Medal({ id, look }: MedalProps): React.JSX.Element {
  const mark = MARKS[look === 'hidden' ? 'hidden' : id]
  return (
    <svg
      className={`medal medal--${look}`}
      width="40"
      height="40"
      viewBox="0 0 10 10"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {cells(RIBBON, 0, 0).map(({ x, y }) => (
        <rect key={`r${x}-${y}`} className="medal__ribbon" x={x} y={y} width="1" height="1" />
      ))}
      {cells(MEDAL, 4, 0).map(({ x, y }) => (
        <rect key={`m${x}-${y}`} className="medal__body" x={x} y={y} width="1" height="1" />
      ))}
      {cells(mark, 5, 3).map(({ x, y }) => (
        <rect key={`k${x}-${y}`} className="medal__mark" x={x} y={y} width="1" height="1" />
      ))}
    </svg>
  )
}

export default Medal
