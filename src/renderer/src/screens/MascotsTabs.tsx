import type { KeyboardEvent } from 'react'
import { mascotsPanelId, mascotsTabId, type MascotsTab } from './mascotsTabIds'
import './MascotsTabs.css'

const TABS: { id: MascotsTab; label: string }[] = [
  { id: 'mascots', label: 'MASCOTS' },
  { id: 'bosses', label: 'BOSSES' }
]

export const BOSSES_TAB_NOTE = 'A random boss from the pool appears the first time you run your tests.'

type MascotsTabsProps = {
  tab: MascotsTab
  onTab: (tab: MascotsTab) => void
}

// MASCOTS | BOSSES under the screen's header. Arrow keys (and Home and End) move between the
// tabs and select the one they land on. On BOSSES, one muted line says where the pool is used.
function MascotsTabs({ tab, onTab }: MascotsTabsProps): React.JSX.Element {
  function move(event: KeyboardEvent<HTMLDivElement>): void {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const at = TABS.findIndex((each) => each.id === tab)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? TABS.length - 1
          : (at + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length
    onTab(TABS[next].id)
    document.getElementById(mascotsTabId(TABS[next].id))?.focus()
  }

  return (
    <div className="mascots-tabs">
      <div
        className="mascots-tabs__list"
        role="tablist"
        aria-label="Mascots and bosses"
        onKeyDown={move}
      >
        {TABS.map((each) => (
          <button
            key={each.id}
            id={mascotsTabId(each.id)}
            type="button"
            role="tab"
            aria-selected={tab === each.id}
            aria-controls={mascotsPanelId(each.id)}
            tabIndex={tab === each.id ? 0 : -1}
            className={`mascots-tabs__tab mascots-tabs__tab--${each.id}${tab === each.id ? ' mascots-tabs__tab--selected' : ''}`}
            onClick={() => onTab(each.id)}
          >
            {each.label}
          </button>
        ))}
      </div>
      {tab === 'bosses' && <p className="mascots-tabs__note">{BOSSES_TAB_NOTE}</p>}
    </div>
  )
}

export default MascotsTabs
