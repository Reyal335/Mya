import Mascot from './Mascot'
import { DEFAULT_MASCOT } from '../mascots/defaultMascot'
import './EmptyChats.css'

// A project with no chats yet: Mya's idle sprite at 64px, and where chats will land.
function EmptyChats(): React.JSX.Element {
  const idle = DEFAULT_MASCOT.loops.idle
  return (
    <div className="empty-chats">
      <Mascot src={idle.src} frames={idle.frames} fps={idle.fps} scale={1} label="Mya" />
      <span className="empty-chats__title">NO CHATS YET</span>
      <span className="empty-chats__text">Your chats in this project land here.</span>
    </div>
  )
}

export default EmptyChats
