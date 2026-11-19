import { useEffect, useState } from 'react'
import type { PartyPanelMode } from '../../../shared/ipc'

// Below this window width, with the party panel open, the sidebar folds to an icon rail so the
// chat keeps its room. With the party collapsed there is room for the full sidebar.
export const RAIL_BELOW = 1100

export type SidebarMode = 'full' | 'rail'

export function sidebarModeFor(width: number, party: PartyPanelMode): SidebarMode {
  return width < RAIL_BELOW && party === 'open' ? 'rail' : 'full'
}

export function useSidebarMode(party: PartyPanelMode): SidebarMode {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return sidebarModeFor(width, party)
}
