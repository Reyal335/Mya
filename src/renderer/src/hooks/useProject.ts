import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProjectInfo } from '../../../shared/ipc'

export type ProjectState = {
  project: ProjectInfo | null
  // False until the saved project has been read, so the UI does not flash "no project".
  loaded: boolean
  // Resolves to the newly opened project, or null when cancelled.
  openProject: () => Promise<ProjectInfo | null>
  // Takes a project main has already switched to (the `mya` command opened a folder).
  adoptProject: (project: ProjectInfo) => void
}

export function useProject(): ProjectState {
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [loaded, setLoaded] = useState(false)
  // Set once a project was opened or adopted: the first read of the saved one must not undo it.
  const changedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    window.mya.project
      .get()
      .then((saved) => {
        if (!cancelled && !changedRef.current) setProject(saved)
      })
      .catch((err: unknown) => {
        console.error('Could not load the project:', err)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openProject = useCallback(async (): Promise<ProjectInfo | null> => {
    const opened = await window.mya.project.open()
    if (opened) {
      changedRef.current = true
      setProject(opened)
    }
    return opened
  }, [])

  const adoptProject = useCallback((adopted: ProjectInfo): void => {
    changedRef.current = true
    setProject(adopted)
    setLoaded(true)
  }, [])

  return { project, loaded, openProject, adoptProject }
}
