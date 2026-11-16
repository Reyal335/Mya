import { useEffect, useRef, useState } from 'react'
import { rewardText, type UnlockNotice } from '../../../shared/achievements'
import { loopFor, type Mascot as MascotData } from '../mascots/types'
import type { Accessory } from '../progression/accessories'
import Mascot from './Mascot'
import '../popup/PopupCard.css'
import './AchievementToast.css'

export const TOAST_MS = 8_000

type AchievementToastProps = {
  mascot: MascotData
  accessory: Accessory | null
  onEquip: (notice: UnlockNotice) => void
}

// An unlock while the app is in front: the popup's achievement card as a toast in the
// window's bottom-right corner, 8 seconds each, paused while hovered, one at a time.
// It never takes focus.
function AchievementToast({
  mascot,
  accessory,
  onEquip
}: AchievementToastProps): React.JSX.Element | null {
  const [queue, setQueue] = useState<UnlockNotice[]>([])
  const [hover, setHover] = useState(false)
  // Time left on the one showing, and when it last started counting.
  const left = useRef(TOAST_MS)
  const since = useRef<number | null>(null)
  const shown = queue[0] ?? null

  useEffect(
    () =>
      window.mya.progression.onUnlocked((notice) => setQueue((current) => [...current, notice])),
    []
  )

  // A new toast gets its full time.
  useEffect(() => {
    left.current = TOAST_MS
  }, [shown])

  useEffect(() => {
    if (!shown || hover) return
    since.current = Date.now()
    const timer = setTimeout(() => setQueue((current) => current.slice(1)), left.current)
    return () => {
      clearTimeout(timer)
      if (since.current !== null) left.current -= Date.now() - since.current
      since.current = null
    }
  }, [shown, hover])

  if (!shown) return null
  const close = (): void => {
    setHover(false)
    setQueue((current) => current.slice(1))
  }
  const loop = loopFor(mascot, 'talking')

  return (
    <div
      className="popup-card popup-card--achievement achievement-toast"
      role="status"
      aria-label={`Achievement unlocked: ${shown.name}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="popup-card__top">
        <span className="popup-card__mascot">
          <Mascot
            src={loop.src}
            frames={loop.frames}
            fps={loop.fps}
            reverse={loop.reverse}
            scale={2}
            label={`${mascot.name}, talking`}
            accessory={accessory}
          />
        </span>
        <div className="popup-card__bubble">
          <span className="popup-card__unlocked">ACHIEVEMENT UNLOCKED</span>
          <span className="popup-card__achievement">{shown.name}</span>
          <span className="popup-card__reward">Reward: {rewardText(shown.reward)}</span>
        </div>
      </div>
      <div className="popup-card__actions" role="group" aria-label="Achievement">
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            onEquip(shown)
            close()
          }}
        >
          EQUIP
        </button>
        <button type="button" className="button button--secondary" onClick={close}>
          LATER
        </button>
      </div>
    </div>
  )
}

export default AchievementToast
