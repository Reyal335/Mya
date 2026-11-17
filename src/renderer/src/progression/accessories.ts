import list from '../assets/accessories/accessories.json'
import backpack from '../assets/accessories/backpack.png'
import crown from '../assets/accessories/crown.png'
import nightcap from '../assets/accessories/nightcap.png'
import partyHat from '../assets/accessories/party-hat.png'

// The mascot accessories, bundled with the window (copied from designs/accessories/).
// Each is a 16x16 PNG drawn over the mascot with its top-left corner at the anchor, in
// 64px frame pixels.

export type Accessory = { id: string; name: string; src: string; x: number; y: number }

const FILES: Record<string, string> = {
  'backpack.png': backpack,
  'crown.png': crown,
  'nightcap.png': nightcap,
  'party-hat.png': partyHat
}

export const ACCESSORIES: Accessory[] = list.flatMap((entry) => {
  const src = FILES[entry.file]
  return src ? [{ id: entry.id, name: entry.name, src, x: entry.anchor.x, y: entry.anchor.y }] : []
})

export function accessoryById(id: string | null): Accessory | null {
  return id === null ? null : (ACCESSORIES.find((entry) => entry.id === id) ?? null)
}
