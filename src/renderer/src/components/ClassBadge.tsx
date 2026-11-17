import { CLASS_NAMES, type ClassId } from '../../../shared/progression'
import './ClassBadge.css'

type ClassBadgeProps = {
  classId: ClassId
  // 7px in rows and cards, 10px on the status sheet.
  size?: 'row' | 'sheet'
  // The one-line reason, shown as the tooltip.
  reason?: string
}

// The class word in the pixel font, dark text on the class color.
function ClassBadge({ classId, size = 'row', reason }: ClassBadgeProps): React.JSX.Element {
  return (
    <span className={`class-badge class-badge--${classId} class-badge--${size}`} title={reason}>
      {CLASS_NAMES[classId]}
    </span>
  )
}

export default ClassBadge
