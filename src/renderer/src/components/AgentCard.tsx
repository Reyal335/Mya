import type { AgentSummary } from '../../../shared/ipc'
import { agentPin } from '../../../shared/providers'
import { CLASS_NAMES, classFor, type AgentProgress } from '../../../shared/progression'
import AgentIcon from './AgentIcon'
import ClassBadge from './ClassBadge'
import ProviderTag from './ProviderTag'
import XpBar from './XpBar'
import './AgentCard.css'

type AgentCardProps = {
  agent: AgentSummary
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  // CALL: opens CHAT with this agent called. callBlocked is the reason it cannot be.
  onCall: () => void
  callBlocked: string | null
  // Class and level, once main has said. STATUS opens the status sheet.
  progress: AgentProgress | undefined
  onStatus: () => void
}

function toolSummary(tools: string[] | null): string {
  if (tools === null) return 'All tools'
  return tools.length === 0 ? 'No tools' : tools.join(' · ')
}

// One agent in the list, as in designs/3-agent-manager.html. An agent whose file
// cannot be read shows the problem and can only be deleted.
function AgentCard({
  agent,
  selected,
  onSelect,
  onDelete,
  onCall,
  callBlocked,
  progress,
  onStatus
}: AgentCardProps): React.JSX.Element {
  if (agent.problem) {
    return (
      <div className="agent-card agent-card--problem">
        <AgentIcon src={null} size={48} label={`${agent.name} icon`} />
        <div className="agent-card__text">
          <span className="agent-card__name">{agent.name}</span>
          <span className="agent-card__problem">{agent.problem}</span>
          <span className="agent-card__path">{agent.filePath}</span>
          <button
            type="button"
            className="button button--danger button--small agent-card__delete"
            onClick={onDelete}
          >
            DELETE
          </button>
        </div>
      </div>
    )
  }

  // The class comes from the tools line as it is now; the level from main.
  const agentClass = classFor(agent.tools)
  const level = progress?.level ?? 1
  // An agent pinned to a model shows its provider. One with none follows the chat: no tag.
  const pin = agentPin(agent.model)

  // The select button keeps the whole card; CALL and STATUS sit beside it at the right
  // edge, so no click ever does another's job.
  return (
    <div className="agent-card-wrap">
      <button
        type="button"
        className={`agent-card agent-card--callable${selected ? ' agent-card--selected' : ''}`}
        aria-pressed={selected}
        aria-description={`${CLASS_NAMES[agentClass.id]}, level ${level}`}
        onClick={onSelect}
      >
        <AgentIcon src={agent.icon} size={48} label={`${agent.name} icon`} />
        <span className="agent-card__text">
          {agent.role && <span className="agent-card__role">{agent.role}</span>}
          <span className="agent-card__top">
            <span className="agent-card__name">{agent.name}</span>
            <span className="agent-card__model">
              {pin && <ProviderTag provider={pin} />}
              {agent.model ?? 'default'}
            </span>
          </span>
          <span className="agent-card__progress">
            <ClassBadge classId={agentClass.id} reason={agentClass.reason} />
            <span className="agent-card__level">LV {level}</span>
            <XpBar intoLevel={progress?.intoLevel ?? 0} toNext={progress?.toNext ?? 1} />
          </span>
          <span className="agent-card__description">{agent.description}</span>
          <span className="agent-card__tools">
            {toolSummary(agent.tools)}
            {!agent.icon && <span className="agent-card__muted"> · no icon yet</span>}
          </span>
        </span>
      </button>
      <button
        type="button"
        className="button button--small agent-card__call"
        aria-label={`Call ${agent.name} for your next message`}
        aria-disabled={callBlocked ? true : undefined}
        title={callBlocked ?? `Call ${agent.name} for your next message`}
        onClick={() => {
          if (!callBlocked) onCall()
        }}
      >
        CALL
      </button>
      <button
        type="button"
        className="button button--small button--secondary agent-card__status"
        aria-label={`Status of ${agent.name}`}
        aria-haspopup="dialog"
        onClick={onStatus}
      >
        STATUS
      </button>
    </div>
  )
}

export default AgentCard
