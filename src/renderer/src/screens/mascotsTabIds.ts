export type MascotsTab = 'mascots' | 'bosses'

// The ids a tab and its panel give each other, so a screen reader can tie them together.
export function mascotsTabId(tab: MascotsTab): string {
  return `mascots-tab-${tab}`
}

export function mascotsPanelId(tab: MascotsTab): string {
  return `mascots-panel-${tab}`
}
