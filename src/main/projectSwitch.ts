import type { ProjectInfo } from '../shared/ipc'
import { openInEditor } from './editor'
import { prefetchModels } from './models'
import { getOpenInEditor, setProject } from './settings'

// OPEN PROJECT's switch, shared by the dialog and the `mya` command. The caller has already
// checked that no run is going.
export async function openProjectFolder(path: string): Promise<ProjectInfo> {
  const opened = await setProject(path)
  // The new folder's model list starts loading now.
  prefetchModels(opened.path)
  if (await getOpenInEditor()) openInEditor(opened.path)
  return opened
}
