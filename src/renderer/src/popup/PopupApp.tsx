import { useEffect, useState } from 'react'
import type { Equipped } from '../../../shared/achievements'
import type { PopupView } from '../../../shared/ipc'
import { useActiveMascot } from '../mascots/useActiveMascot'
import { accessoryById } from '../progression/accessories'
import PopupCard from './PopupCard'

// What main says to show, or nothing. The card is keyed by the popup's id, so a
// new popup starts with its buttons enabled.
function PopupApp(): React.JSX.Element | null {
  const api = window.myaPopup
  const [view, setView] = useState<PopupView | null>(null)
  const mascot = useActiveMascot(api.mascot)
  // The equipped accessory, drawn over the popup's mascot too.
  const [equipped, setEquipped] = useState<Equipped>({ title: null, accessory: null })

  useEffect(() => {
    const load = (): void => {
      api.equipped
        .get()
        .then(setEquipped)
        .catch((err: unknown) => console.error('Could not read the equipped accessory:', err))
    }
    load()
    return api.equipped.onChanged(load)
  }, [api])

  useEffect(() => {
    let disposed = false
    const unsubscribe = api.onState((next) => setView(next))
    api
      .getState()
      .then((next) => {
        if (!disposed) setView((current) => current ?? next)
      })
      .catch((err: unknown) => console.error('Could not read the popup:', err))
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [api])

  if (!view) return null
  return (
    <PopupCard
      key={view.id}
      view={view}
      mascot={mascot}
      api={api}
      accessory={accessoryById(equipped.accessory)}
    />
  )
}

export default PopupApp
