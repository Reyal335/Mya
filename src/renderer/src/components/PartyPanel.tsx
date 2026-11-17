import { useRef, useState } from 'react'
import type { AgentSummary, PartyPanelMode, TaskAgent } from '../../../shared/ipc'
import { callBlock } from '../../../shared/agentGate'
import {
  CLASS_NAMES,
  classFor,
  type AgentClass,
  type AgentProgress
} from '../../../shared/progression'
import { agentKey, type PartyWork } from '../conversation/agentWork'
import type { CallTarget } from '../hooks/useConversation'
import AgentIcon from './AgentIcon'
import ClassBadge from './ClassBadge'
import XpBar from './XpBar'
import './PartyPanel.css'

type PartyPanelProps = {
  agents: AgentSummary[]
  loaded: boolean
  call: CallTarget | null
  onCall: (agent: AgentSummary | null) => void
  // Three agents are working: nobody else can be called until one finishes. A run
  // going is not enough: while it goes I can still call an agent.
  full: boolean
  // What each agent is doing in the current run, by agentKey.
  work: Map<string, PartyWork>
  mode: PartyPanelMode
  onToggle: () => void
  onOpenTask: (taskId: string) => void
  // Class and level per agent file, keyed by filePath.
  progress: Record<string, AgentProgress>
}

type RowState = 'idle' | 'calling' | 'working' | 'waiting' | 'off'

type Member = {
  key: string
  // null for a built-in agent Claude brought in, shown only while it works.
  agent: AgentSummary | null
  look: TaskAgent
  state: RowState
  // The smaller line under the name, or null for none.
  smaller: string | null
  // What a click does.
  action: { kind: 'call' } | { kind: 'open'; taskId: string } | null
}

// A member with a file has a class and a level. A built-in agent has neither.
type Rank = { agentClass: AgentClass; level: AgentProgress }

function rankOf(member: Member, progress: Record<string, AgentProgress>): Rank | null {
  if (!member.agent) return null
  const agentClass = classFor(member.agent.tools)
  return {
    agentClass,
    level: progress[member.agent.filePath] ?? {
      classId: agentClass.id,
      level: 1,
      intoLevel: 0,
      toNext: 1
    }
  }
}

// The smaller line on every row that cannot be called because three agents are working.
const FULL_REASON = 'Three agents are working'

function members(
  agents: AgentSummary[],
  call: CallTarget | null,
  work: Map<string, PartyWork>,
  full: boolean
): Member[] {
  const fileKeys = new Set<string>()
  const list: Member[] = agents.map((agent) => {
    const key = agentKey(agent)
    fileKeys.add(key)
    const look: TaskAgent = {
      name: agent.name,
      scope: agent.scope,
      filePath: agent.filePath,
      icon: agent.icon,
      role: agent.role
    }
    const busy = work.get(key)
    if (busy) {
      return {
        key,
        agent,
        look,
        state: busy.state,
        smaller:
          busy.state === 'waiting' ? 'Needs your approval' : (busy.activity ?? 'Starting...'),
        action: { kind: 'open', taskId: busy.taskId }
      }
    }
    const block = callBlock(agent, agents)
    if (block) return { key, agent, look, state: 'off', smaller: block.short, action: null }
    // Working and waiting rows above still open their task. Every other row waits.
    if (full) return { key, agent, look, state: 'off', smaller: FULL_REASON, action: null }
    const calling = call?.ref.filePath === agent.filePath
    return {
      key,
      agent,
      look,
      state: calling ? 'calling' : 'idle',
      smaller: agent.role,
      action: { kind: 'call' }
    }
  })
  // Built-in agents Claude brought in get a row at the end while they work.
  for (const [key, entry] of work) {
    if (fileKeys.has(key)) continue
    list.push({
      key,
      agent: null,
      look: entry.agent,
      state: entry.state,
      smaller:
        entry.state === 'waiting' ? 'Needs your approval' : (entry.activity ?? 'Starting...'),
      action: { kind: 'open', taskId: entry.taskId }
    })
  }
  return list
}

function toolsText(tools: string[] | null): string {
  if (tools === null) return 'All tools'
  return tools.length === 0 ? 'No tools' : tools.join(' · ')
}

function accessibleName(member: Member, rank: Rank | null): string {
  const name = member.look.role ? `${member.look.name}, ${member.look.role}` : member.look.name
  return rank ? `${name}. ${CLASS_NAMES[rank.agentClass.id]}, level ${rank.level.level}` : name
}

// The party panel from designs/8-chat-party.html, and the icon rail from
// 8c-party-rail.html. Every member state is in 8b-party-states.html.
function PartyPanel({
  agents,
  loaded,
  call,
  onCall,
  full,
  work,
  mode,
  onToggle,
  onOpenTask,
  progress
}: PartyPanelProps): React.JSX.Element {
  const [pointed, setPointed] = useState<string | null>(null)
  const [cardTop, setCardTop] = useState(0)
  const railRef = useRef<HTMLElement>(null)
  const list = members(agents, call, work, full)
  const pointedMember = list.find((member) => member.key === pointed) ?? null
  const pointedRank = pointedMember ? rankOf(pointedMember, progress) : null
  const calledMember = call
    ? (list.find((member) => member.agent?.filePath === call.ref.filePath) ?? null)
    : null

  function activate(member: Member): void {
    if (!member.action) return
    if (member.action.kind === 'open') {
      onOpenTask(member.action.taskId)
      return
    }
    if (!member.agent) return
    onCall(member.state === 'calling' ? null : member.agent)
  }

  // The hover card sits beside the pointed icon, measured against the rail.
  function point(member: Member, element: HTMLElement | null): void {
    setPointed(member.key)
    if (element && railRef.current) {
      setCardTop(element.getBoundingClientRect().top - railRef.current.getBoundingClientRect().top)
    }
  }

  const pointHandlers = (
    member: Member
  ): Pick<
    React.HTMLAttributes<HTMLElement>,
    'onMouseEnter' | 'onMouseLeave' | 'onFocus' | 'onBlur'
  > => ({
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => point(member, event.currentTarget),
    onMouseLeave: () => setPointed((current) => (current === member.key ? null : current)),
    onFocus: (event: React.FocusEvent<HTMLElement>) => point(member, event.currentTarget),
    onBlur: () => setPointed((current) => (current === member.key ? null : current))
  })

  const toggle = (
    <button
      type="button"
      className="party__toggle"
      aria-label={mode === 'open' ? 'Collapse the party panel' : 'Open the party panel'}
      aria-expanded={mode === 'open'}
      onClick={onToggle}
    >
      {mode === 'open' ? '>>' : '<<'}
    </button>
  )

  if (mode === 'rail') {
    return (
      <aside className="party party--rail" aria-label="Party" ref={railRef}>
        {toggle}
        <span className="party__rail-title">PARTY</span>
        <div className="party__rail-list" onScroll={() => setPointed(null)}>
          {list.map((member) => {
            const rank = rankOf(member, progress)
            const className = `party__icon party__icon--${member.state}`
            const icon = (
              <>
                <span className={member.state === 'working' ? 'party__hop' : undefined}>
                  <AgentIcon src={member.look.icon} size={32} label="" />
                </span>
                {rank && (
                  <span className="party__icon-level" aria-hidden="true">
                    {rank.level.level}
                  </span>
                )}
              </>
            )
            const marker = (member.state === 'working' || member.state === 'waiting') && (
              <span className="party__icon-marker" aria-hidden="true" />
            )
            if (!member.action) {
              return (
                <div
                  key={member.key}
                  className={className}
                  role="img"
                  aria-label={`${accessibleName(member, rank)}. ${member.smaller ?? ''}`}
                  tabIndex={0}
                  {...pointHandlers(member)}
                >
                  {icon}
                </div>
              )
            }
            return (
              <button
                key={member.key}
                type="button"
                className={className}
                aria-label={accessibleName(member, rank)}
                aria-pressed={
                  member.action.kind === 'call' ? member.state === 'calling' : undefined
                }
                onClick={() => activate(member)}
                {...pointHandlers(member)}
              >
                {icon}
                {marker}
              </button>
            )
          })}
        </div>
        {pointedMember && (
          <div className="party__card" style={{ top: cardTop }} role="tooltip">
            <div className="party__card-head">
              <span className="party__card-name">{pointedMember.look.name}</span>
              {pointedMember.look.role && (
                <span className="party__card-role">{pointedMember.look.role}</span>
              )}
              {pointedMember.agent?.model && (
                <span className="party__tag">{pointedMember.agent.model}</span>
              )}
            </div>
            {pointedRank && (
              <div className="party__card-rank">
                <ClassBadge classId={pointedRank.agentClass.id} />
                <span className="party__lv">LV {pointedRank.level.level}</span>
              </div>
            )}
            {pointedMember.agent && (
              <p className="party__card-description">{pointedMember.agent.description}</p>
            )}
            <p className="party__card-note">
              {pointedMember.state === 'idle' || pointedMember.state === 'calling'
                ? 'Click to call for your next message'
                : pointedMember.smaller}
            </p>
          </div>
        )}
      </aside>
    )
  }

  const detail = pointedMember ?? calledMember
  const detailClass = detail?.agent ? classFor(detail.agent.tools) : null
  return (
    <aside className="party" aria-label="Party">
      <div className="party__head">
        <h2 className="party__title">PARTY</h2>
        <span className="party__count">
          {agents.length} {agents.length === 1 ? 'agent' : 'agents'}
        </span>
        {toggle}
      </div>
      <p className="party__note">
        {call
          ? `Calling ${call.agent.name} for your next message.`
          : 'Click a member to call them for your next message.'}
      </p>

      <div className="party__list">
        {loaded && list.length === 0 && (
          <p className="party__empty">No agents yet. Make one on the AGENTS screen.</p>
        )}
        {list.map((member) => {
          const rank = rankOf(member, progress)
          const content = (
            <>
              <span className={member.state === 'working' ? 'party__hop' : undefined}>
                <AgentIcon src={member.look.icon} size={32} label="" />
              </span>
              <span className="party__names">
                <span className="party__name-line">
                  <span className="party__name">{member.look.name}</span>
                  {rank && <span className="party__lv">LV {rank.level.level}</span>}
                </span>
                {(rank || member.smaller) && (
                  <span className="party__sub">
                    {rank && (
                      <ClassBadge classId={rank.agentClass.id} reason={rank.agentClass.reason} />
                    )}
                    {member.smaller && <span className="party__smaller">{member.smaller}</span>}
                  </span>
                )}
                {rank && (
                  <XpBar
                    intoLevel={rank.level.intoLevel}
                    toNext={rank.level.toNext}
                    dark={member.state === 'calling'}
                  />
                )}
              </span>
              {(member.state === 'working' || member.state === 'waiting') && (
                <span className="party__marker" aria-hidden="true" />
              )}
            </>
          )
          const className = `party__row party__row--${member.state}`
          if (!member.action) {
            return (
              <div key={member.key} className={className} tabIndex={0} {...pointHandlers(member)}>
                {content}
              </div>
            )
          }
          return (
            <button
              key={member.key}
              type="button"
              className={className}
              aria-label={
                member.action.kind === 'open'
                  ? `${accessibleName(member, rank)}. ${member.smaller ?? ''}. Open its task in INBOX`
                  : accessibleName(member, rank)
              }
              aria-pressed={member.action.kind === 'call' ? member.state === 'calling' : undefined}
              onClick={() => activate(member)}
              {...pointHandlers(member)}
            >
              {content}
            </button>
          )
        })}
      </div>

      <div className="party__detail">
        {detail ? (
          <>
            <div className="party__detail-head">
              <span className="party__detail-name">{detail.look.name}</span>
              {detail.agent?.model && <span className="party__tag">{detail.agent.model}</span>}
            </div>
            {detail.agent ? (
              <>
                <p className="party__detail-description">{detail.agent.description}</p>
                <p className="party__detail-tools">{toolsText(detail.agent.tools)}</p>
                {detailClass && (
                  <p className="party__detail-tools">
                    {CLASS_NAMES[detailClass.id]} · {detailClass.reason}
                  </p>
                )}
              </>
            ) : (
              <p className="party__detail-description">A built-in agent Claude brought in.</p>
            )}
          </>
        ) : (
          <p className="party__detail-empty">Hover a member to see what they do.</p>
        )}
      </div>
    </aside>
  )
}

export default PartyPanel
