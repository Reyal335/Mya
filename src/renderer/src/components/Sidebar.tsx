import NavItem from './NavItem'
import type { Screen } from '../screens/types'
import type { ProjectInfo } from '../../../shared/ipc'
import './Sidebar.css'

type SidebarProps = {
  screen: Screen
  onNavigate: (screen: Screen) => void
  project: ProjectInfo | null
  canOpenProject: boolean
  onOpenProject: () => void
  // Badges, hidden at zero: 1 while the main conversation itself waits for me,
  // and the number of tasks waiting for me.
  chatCount: number
  inboxCount: number
  // An unlock not yet seen: ACHIEVEMENTS shows a red dot.
  achievementsDot: boolean
  // The account meter under the project name. It opens ACCOUNT.
  meter: React.ReactNode
}

const NAV_ITEMS: { screen: Screen; label: string }[] = [
  { screen: 'chat', label: 'CHAT' },
  { screen: 'inbox', label: 'INBOX' },
  { screen: 'agents', label: 'AGENTS' },
  { screen: 'mascots', label: 'MASCOTS' },
  { screen: 'achievements', label: 'ACHIEVEMENTS' }
]

function Sidebar({
  screen,
  onNavigate,
  project,
  canOpenProject,
  onOpenProject,
  chatCount,
  inboxCount,
  achievementsDot,
  meter
}: SidebarProps): React.JSX.Element {
  return (
    <nav className="sidebar" aria-label="Main">
      {NAV_ITEMS.map((item) => (
        <NavItem
          key={item.screen}
          label={item.label}
          active={screen === item.screen}
          onClick={() => onNavigate(item.screen)}
          count={
            item.screen === 'inbox' ? inboxCount : item.screen === 'chat' ? chatCount : undefined
          }
          dot={item.screen === 'achievements' && achievementsDot}
          dotLabel="New achievement"
        />
      ))}
      <div className="sidebar__footer">
        Project
        <br />
        <span className="sidebar__project" title={project?.path}>
          {project ? project.name : 'No project open'}
        </span>
        <button
          type="button"
          className="button button--small sidebar__open"
          disabled={!canOpenProject}
          onClick={onOpenProject}
        >
          {project ? 'CHANGE' : 'OPEN'}
        </button>
      </div>
      {meter}
    </nav>
  )
}

export default Sidebar
