import './XpBar.css'

type XpBarProps = {
  intoLevel: number
  toNext: number
  // The part earned just now, drawn after the old fill in --waiting. Card only.
  gained?: number
  // row: 6px in a party row or agent card. card: 14px on the QUEST CLEAR card.
  size?: 'row' | 'card'
  // On the called (accent-filled) party row the fill is dark.
  dark?: boolean
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 100
  return Math.max(0, Math.min(100, (part / whole) * 100))
}

// The XP toward the next level. Drawn for the eye only: the text beside it says the
// same in words.
function XpBar({
  intoLevel,
  toNext,
  gained = 0,
  size = 'row',
  dark = false
}: XpBarProps): React.JSX.Element {
  const old = percent(intoLevel, toNext)
  const added = Math.min(100 - old, percent(gained, toNext))
  return (
    <span className={`xp-bar xp-bar--${size}${dark ? ' xp-bar--dark' : ''}`} aria-hidden="true">
      <span className="xp-bar__fill" style={{ width: `${old}%` }} />
      {added > 0 && <span className="xp-bar__gained" style={{ width: `${added}%` }} />}
    </span>
  )
}

export default XpBar
