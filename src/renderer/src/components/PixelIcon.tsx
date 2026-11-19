// The sidebar's 16px pixel icons, each drawn on its own small grid with crisp edges. One fill:
// the text color of where it sits. A cut-out (the chat's dots, the cloud's eyes) is a hole in the
// shape, so it shows whatever is behind the icon.

export type PixelIconName =
  'chat' | 'inbox' | 'agents' | 'mascots' | 'achievements' | 'gear' | 'search' | 'plus' | 'list' | 'image'

type Shape = { width: number; height: number; path: string; holes?: boolean }

const SHAPES: Record<PixelIconName, Shape> = {
  chat: {
    width: 10,
    height: 10,
    path: 'M1 1h8v5H1zM3 3h1v1H3zM5 3h1v1H5zM7 3h1v1H7zM2 6h2v1H2zM2 7h1v1H2z',
    holes: true
  },
  inbox: {
    width: 10,
    height: 10,
    path: 'M1 1h8v1H1zM1 2h1v7H1zM8 2h1v7H8zM1 8h8v1H1zM2 5h2v1H2zM6 5h2v1H6zM4 6h2v1H4z'
  },
  agents: {
    width: 10,
    height: 10,
    path: 'M1 1h2v2H1zM0 4h4v4H0zM7 1h2v2H7zM6 4h4v4H6z'
  },
  mascots: {
    width: 10,
    height: 7,
    path: 'M3 0h3v1H3zM2 1h6v1H2zM1 2h8v4H1zM0 3h1v2H0zM9 3h1v2H9zM3 3h1v1H3zM6 3h1v1H6z',
    holes: true
  },
  achievements: {
    width: 10,
    height: 9,
    path: 'M2 0h6v4H2zM0 1h2v1H0zM8 1h2v1H8zM0 2h1v1H0zM9 2h1v1H9zM3 4h4v1H3zM4 5h2v2H4zM2 7h6v2H2z'
  },
  gear: {
    width: 10,
    height: 10,
    path: 'M4 0h2v2H4zM4 8h2v2H4zM0 4h2v2H0zM8 4h2v2H8zM2 2h6v6H2zM1 1h1v1H1zM8 1h1v1H8zM1 8h1v1H1zM8 8h1v1H8zM4 4h2v2H4z',
    holes: true
  },
  search: {
    width: 10,
    height: 10,
    path: 'M2 0h4v1H2zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v3H0zM7 2h1v3H7zM1 5h1v1H1zM6 5h1v1H6zM2 6h4v1H2zM7 7h1v1H7zM8 8h1v1H8z'
  },
  plus: { width: 10, height: 10, path: 'M4 1h2v8H4zM1 4h8v2H1z' },
  image: {
    width: 10,
    height: 8,
    path: 'M0 0h10v1H0zM0 1h1v6H0zM9 1h1v6H9zM0 7h10v1H0zM2 2h2v2H2zM3 6h2v-1h1v-1h1v1h1v1h1v1H3z'
  },
  list: {
    width: 10,
    height: 10,
    path: 'M1 1h1v1H1zM3 1h6v1H3zM1 4h1v1H1zM3 4h6v1H3zM1 7h1v1H1zM3 7h6v1H3z'
  }
}

type PixelIconProps = {
  name: PixelIconName
  // Pixels wide. 16 in the sidebar, 12 on the small buttons, 20 in the rail.
  size?: number
  className?: string
}

function PixelIcon({ name, size = 16, className }: PixelIconProps): React.JSX.Element {
  const shape = SHAPES[name]
  return (
    <svg
      className={className}
      width={size}
      height={Math.round((size * shape.height) / shape.width)}
      viewBox={`0 0 ${shape.width} ${shape.height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none' }}
    >
      <path fill="currentColor" fillRule={shape.holes ? 'evenodd' : 'nonzero'} d={shape.path} />
    </svg>
  )
}

export default PixelIcon
