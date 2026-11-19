import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ModelLists } from './models.ts'
import {
  PROVIDERS,
  agentModelGroups,
  agentPin,
  can,
  canCallAgent,
  defaultLevel,
  lockMessage,
  maskKey,
  pinnedNote,
  modelFitsChat,
  nearestLevel,
  providerModels,
  providerOfModel,
  resolveProviderChoice,
  savedDefault
} from './providers.ts'

const lists: ModelLists = {
  auto: { resolvedModel: null, name: null, effortLevels: null },
  models: [
    { value: 'sonnet', resolvedModel: null, name: 'Sonnet', description: '', effortLevels: null },
    {
      value: 'codex:gpt-5.5',
      resolvedModel: 'gpt-5.5',
      name: 'GPT-5.5',
      description: '',
      effortLevels: ['low', 'medium', 'high', 'xhigh']
    },
    {
      value: 'codex:mini',
      resolvedModel: 'mini',
      name: 'GPT Mini',
      description: '',
      effortLevels: ['low', 'medium', 'high']
    },
    {
      value: 'gemini:flash',
      resolvedModel: 'flash',
      name: 'Gemini Flash',
      description: '',
      effortLevels: []
    },
    {
      value: 'gemini:pro',
      resolvedModel: 'pro',
      name: 'Gemini Pro',
      description: '',
      effortLevels: ['medium', 'high']
    }
  ]
}

// --- the table -----------------------------------------------------------------------------

test('providers: the table says what each one can do', () => {
  assert.equal(can('claude', 'approvals'), true)
  assert.equal(can('claude', 'autoAgents'), true)
  assert.equal(PROVIDERS.claude.capabilities.autoAgents, 3)
  for (const provider of ['codex', 'gemini'] as const) {
    for (const capability of [
      'approvals',
      'autoAgents',
      'usage',
      'images',
      'voice',
      'restoreAfterRestart',
      'fork',
      'boss'
    ] as const) {
      assert.equal(can(provider, capability), false, `${provider} ${capability}`)
    }
  }
})

test('providers: labels', () => {
  assert.deepEqual(
    (['claude', 'codex', 'gemini'] as const).map((id) => PROVIDERS[id].label),
    ['CLAUDE', 'CODEX', 'GEMINI']
  )
})

// --- providerOfModel -------------------------------------------------------------------------

test('providerOfModel: AUTO and Claude models are Claude, the rest by prefix', () => {
  assert.equal(providerOfModel('auto'), 'claude')
  assert.equal(providerOfModel('sonnet'), 'claude')
  assert.equal(providerOfModel('claude-opus-5'), 'claude')
  assert.equal(providerOfModel('codex:o4-mini'), 'codex')
  assert.equal(providerOfModel('gemini:gemini-2.5-pro'), 'gemini')
})

// --- canCallAgent ----------------------------------------------------------------------------

test('agent pin: no model, a blank one, and inherit follow the chat', () => {
  assert.equal(agentPin(null), null)
  assert.equal(agentPin(undefined), null)
  assert.equal(agentPin('  '), null)
  assert.equal(agentPin('inherit'), null)
})

test('agent pin: an alias is Claude, a prefixed value is its provider', () => {
  assert.equal(agentPin('sonnet'), 'claude')
  assert.equal(agentPin('opus'), 'claude')
  assert.equal(agentPin('codex:gpt-5.4'), 'codex')
  assert.equal(agentPin('gemini:gemini-4-argon'), 'gemini')
})

test('canCallAgent: an agent that follows the chat can be called anywhere', () => {
  assert.deepEqual(canCallAgent({ model: null }, 'codex'), { ok: true })
  assert.deepEqual(canCallAgent({ model: 'inherit' }, 'gemini'), { ok: true })
})

test("canCallAgent: an agent pinned to the chat's provider can be called", () => {
  assert.deepEqual(canCallAgent({ model: 'codex:gpt-5.4' }, 'codex'), { ok: true })
  assert.deepEqual(canCallAgent({ model: 'sonnet' }, 'claude'), { ok: true })
})

test('canCallAgent: an agent pinned to another provider cannot, with the reason and the hint', () => {
  assert.deepEqual(canCallAgent({ model: 'opus' }, 'codex'), {
    ok: false,
    reason: 'Set to run on Claude',
    hint: 'Start a Claude chat to call it.'
  })
  assert.deepEqual(canCallAgent({ model: 'codex:o4-mini' }, 'claude'), {
    ok: false,
    reason: 'Set to run on Codex',
    hint: 'Start a Codex chat to call it.'
  })
  const gemini = canCallAgent({ model: 'gemini:flash' }, 'codex')
  assert.equal(gemini.ok, false)
  assert.equal(gemini.ok === false && gemini.reason, 'Set to run on Gemini')
})

// --- maskKey ---------------------------------------------------------------------------------

test('maskKey: the first 4 and last 4 characters', () => {
  assert.equal(maskKey('sk-abcdefgh1234567890wxyz9f2c'), 'sk-a...9f2c')
  assert.equal(maskKey('  AIzaSyD-example-key-1234  '), 'AIza...1234')
})

test('maskKey: a short key shows nothing of itself, and the middle never leaks', () => {
  assert.equal(maskKey('12345678'), '••••••••')
  assert.equal(maskKey(''), '••••••••')
  const secret = 'sk-proj-THE-SECRET-MIDDLE-PART-9f2c'
  assert.ok(!maskKey(secret).includes('SECRET'))
  assert.equal(maskKey(secret).length, 11)
})

// --- levels ----------------------------------------------------------------------------------

test('defaultLevel: MED when the model has it, else its first level, else none', () => {
  assert.equal(defaultLevel(['low', 'medium', 'high']), 'medium')
  assert.equal(defaultLevel(['high', 'xhigh']), 'high')
  assert.equal(defaultLevel([]), null)
})

test('nearestLevel: the nearest the model has, the lower one on a tie', () => {
  assert.equal(nearestLevel('xhigh', ['low', 'medium', 'high']), 'high')
  assert.equal(nearestLevel('max', ['low', 'medium', 'high']), 'high')
  assert.equal(nearestLevel('low', ['medium', 'high']), 'medium')
  assert.equal(nearestLevel('medium', ['low', 'high']), 'low')
  assert.equal(nearestLevel('high', []), null)
})

test('thinking-level fallback: a level the model does not take drops to the nearest', () => {
  const { choice, notices } = resolveProviderChoice(
    { model: 'codex:mini', effort: 'xhigh' },
    lists,
    'codex'
  )
  assert.deepEqual(choice, { model: 'codex:mini', effort: 'high' })
  assert.deepEqual(notices, ["XHIGH isn't available on GPT MINI. Using HIGH."])
})

test('thinking-level fallback: switching to a model without the level picks the nearest it has', () => {
  const up = resolveProviderChoice({ model: 'gemini:pro', effort: 'low' }, lists, 'gemini')
  assert.equal(up.choice.effort, 'medium')
})

test('thinking levels: Codex and Gemini have no AUTO, so a model with levels always has one', () => {
  assert.deepEqual(
    resolveProviderChoice({ model: 'codex:gpt-5.5', effort: 'auto' }, lists, 'codex').choice,
    { model: 'codex:gpt-5.5', effort: 'medium' }
  )
  assert.deepEqual(
    resolveProviderChoice({ model: 'gemini:pro', effort: 'auto' }, lists, 'gemini').choice,
    { model: 'gemini:pro', effort: 'medium' }
  )
})

test('thinking levels: a model with none keeps AUTO and shows no level', () => {
  const { choice, notices } = resolveProviderChoice(
    { model: 'gemini:flash', effort: 'high' },
    lists,
    'gemini'
  )
  assert.deepEqual(choice, { model: 'gemini:flash', effort: 'auto' })
  assert.deepEqual(notices, [])
})

test('provider choice: a model of another provider is replaced, with a line saying so', () => {
  const { choice, notices } = resolveProviderChoice(
    { model: 'sonnet', effort: 'high' },
    lists,
    'codex',
    'codex:mini'
  )
  assert.equal(choice.model, 'codex:mini')
  assert.equal(choice.effort, 'high')
  assert.equal(notices.length, 1)
  assert.match(notices[0], /^This chat runs on Codex\. Using /)
})

test('provider choice: a model that is gone falls back to the start model, else the first', () => {
  const start = resolveProviderChoice(
    { model: 'codex:old', effort: 'low' },
    lists,
    'codex',
    'codex:mini'
  )
  assert.equal(start.choice.model, 'codex:mini')
  assert.match(start.notices[0], /isn't available right now/)
  const first = resolveProviderChoice({ model: 'codex:old', effort: 'low' }, lists, 'codex')
  assert.equal(first.choice.model, 'codex:gpt-5.5')
})

test("provider choice: a Claude chat keeps AUTO and step 10 rules, and drops another provider's model", () => {
  assert.deepEqual(
    resolveProviderChoice({ model: 'auto', effort: 'auto' }, lists, 'claude').choice,
    {
      model: 'auto',
      effort: 'auto'
    }
  )
  const moved = resolveProviderChoice({ model: 'codex:mini', effort: 'low' }, lists, 'claude')
  assert.equal(moved.choice.model, 'auto')
  assert.equal(moved.notices[0], 'This chat runs on Claude. Using AUTO.')
})

test('provider choice: with no model list the built-in Codex and Gemini rows stand in', () => {
  const codex = resolveProviderChoice({ model: 'codex:o4-mini', effort: 'medium' }, null, 'codex')
  assert.deepEqual(codex.choice, { model: 'codex:o4-mini', effort: 'medium' })
  assert.deepEqual(codex.notices, [])
  assert.ok(providerModels(null, 'gemini').length > 0)
  assert.deepEqual(providerModels(null, 'claude'), [])
})

// --- where a new chat starts --------------------------------------------------------------

test('start: a default saved for the provider wins', () => {
  const settings = {
    providerDefaults: { codex: { model: 'codex:gpt-5.5', effort: 'high' } },
    defaultModel: 'codex:o4-mini',
    defaultEffort: 'low'
  }
  assert.deepEqual(savedDefault(settings, 'codex'), { model: 'codex:gpt-5.5', effort: 'high' })
})

test('start: the old single default counts for the provider its model belongs to', () => {
  const settings = { defaultModel: 'gemini:gemini-2.5-pro', defaultEffort: 'medium' }
  assert.deepEqual(savedDefault(settings, 'gemini'), {
    model: 'gemini:gemini-2.5-pro',
    effort: 'medium'
  })
  assert.equal(savedDefault(settings, 'codex'), null)
  assert.deepEqual(savedDefault(settings, 'claude'), { model: 'auto', effort: 'auto' })
})

test("start: an old single default on a Claude model is Claude's default", () => {
  assert.deepEqual(savedDefault({ defaultModel: 'opus', defaultEffort: 'high' }, 'claude'), {
    model: 'opus',
    effort: 'high'
  })
})

test('start: nothing saved is AUTO for Claude and nothing for the others', () => {
  assert.deepEqual(savedDefault({}, 'claude'), { model: 'auto', effort: 'auto' })
  assert.equal(savedDefault({}, 'codex'), null)
  assert.equal(savedDefault({}, 'gemini'), null)
})

test('start: a default of another provider, or not text, is ignored', () => {
  assert.equal(savedDefault({ providerDefaults: { codex: { model: 'sonnet' } } }, 'codex'), null)
  assert.equal(savedDefault({ providerDefaults: { codex: 'x' }, defaultModel: 5 }, 'codex'), null)
  assert.equal(savedDefault({ providerDefaults: null }, 'gemini'), null)
  assert.deepEqual(
    savedDefault({ providerDefaults: { codex: { model: 'codex:mini', effort: '' } } }, 'codex'),
    { model: 'codex:mini', effort: 'auto' }
  )
})

// --- the lock --------------------------------------------------------------------------------

test("the lock: a model fits only its own provider's chat", () => {
  assert.equal(modelFitsChat('codex:o4-mini', 'codex'), true)
  assert.equal(modelFitsChat('codex:o4-mini', 'claude'), false)
  assert.equal(modelFitsChat('auto', 'codex'), false)
  assert.equal(modelFitsChat('auto', 'claude'), true)
  assert.equal(
    lockMessage('codex', 'sonnet'),
    'This chat runs on Codex, so it cannot use Claude models.'
  )
})

// --- agent model groups ------------------------------------------------------------------------

test('agent model groups: one group per provider, in order, with no prefix and no inherit', () => {
  const groups = agentModelGroups(
    ['inherit', 'sonnet', 'opus', 'codex:gpt-5.4', 'gemini:gemini-2.5-pro'],
    ''
  )
  assert.deepEqual(
    groups.map((group) => group.provider),
    ['claude', 'codex', 'gemini']
  )
  assert.deepEqual(groups[0].models, [
    { value: 'sonnet', label: 'sonnet' },
    { value: 'opus', label: 'opus' }
  ])
  assert.deepEqual(groups[1].models, [{ value: 'codex:gpt-5.4', label: 'gpt-5.4' }])
})

test('agent model groups: a value the list does not know stays in its provider group', () => {
  const groups = agentModelGroups(['sonnet'], 'codex:gpt-9')
  assert.deepEqual(
    groups.map((group) => group.provider),
    ['claude', 'codex']
  )
  assert.deepEqual(groups[1].models, [{ value: 'codex:gpt-9', label: 'gpt-9' }])
  // inherit and blank add nothing.
  assert.equal(agentModelGroups(['sonnet'], 'inherit').length, 1)
  assert.equal(agentModelGroups(['sonnet'], '').length, 1)
})

test('the pinned note names the provider, and is null for an agent that follows the chat', () => {
  assert.equal(
    pinnedNote('codex:gpt-5.4'),
    'Pinned to Codex. It can only be called in Codex chats.'
  )
  assert.equal(pinnedNote('opus'), 'Pinned to Claude. It can only be called in Claude chats.')
  assert.equal(pinnedNote(null), null)
  assert.equal(pinnedNote('inherit'), null)
})
