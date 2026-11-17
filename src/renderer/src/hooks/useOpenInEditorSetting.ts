import { useCallback, useEffect, useState } from 'react'

// The OPEN IN EDITOR setting from settings.json: launch VS Code on OPEN/CHANGE.
export function useOpenInEditorSetting(): { on: boolean; loaded: boolean; toggle: () => void } {
  const [on, setOn] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let disposed = false
    window.mya.ui
      .getOpenInEditor()
      .then((value) => {
        if (disposed) return
        setOn(value)
        setLoaded(true)
      })
      .catch((err: unknown) => console.error('Could not read the open in editor setting:', err))
    return () => {
      disposed = true
    }
  }, [])

  const toggle = useCallback((): void => {
    const next = !on
    setOn(next)
    window.mya.ui
      .setOpenInEditor(next)
      .catch((err: unknown) => console.error('Could not save the open in editor setting:', err))
  }, [on])

  return { on, loaded, toggle }
}
