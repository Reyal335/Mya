import type { TaskAgent } from '../../../shared/ipc'
import AgentIcon from './AgentIcon'
import './AgentChip.css'

type AgentChipProps = {
  agent: Pick<TaskAgent, 'name' | 'icon'>
  // Shown in the input box's toolbar with a remove button; in the history without one.
  onRemove?: () => void
}

// The agent I called for a message: its icon and name, as in
// designs/8-chat-party.html (on my message) and 8b (in the input box).
function AgentChip({ agent, onRemove }: AgentChipProps): React.JSX.Element {
  if (!onRemove) {
    return (
      <span className="agent-chip">
        <AgentIcon src={agent.icon} size={16} label="" />
        {agent.name}
      </span>
    )
  }
  return (
    // The name can be hidden in a narrow input box, so the group carries it whole.
    <div
      className="agent-chip agent-chip--input"
      role="group"
      aria-label={`Agent: ${agent.name}`}
      title={agent.name}
    >
      <AgentIcon src={agent.icon} size={16} label="" />
      <span className="agent-chip__name">{agent.name}</span>
      <button
        type="button"
        className="agent-chip__remove"
        aria-label={`Stop calling ${agent.name}`}
        onClick={onRemove}
      >
        <span aria-hidden="true">X</span>
      </button>
    </div>
  )
}

export default AgentChip
