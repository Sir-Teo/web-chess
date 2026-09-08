import type { AutoSaveWriteResult } from '../engine/autoSave'
import './AutoSaveStatus.css'

export function AutoSaveStatus({ result, onDownload, onRetry }: {
  result: AutoSaveWriteResult | null
  onDownload: () => void
  onRetry: () => void
}) {
  const failed = result === 'failed' || result === 'too-large'
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {failed && (
        <div className="autosave-warning">
          <p><strong>Latest changes are not saved for recovery.</strong>{' '}
            {result === 'too-large'
              ? 'This game exceeds the 2 MB recovery limit.'
              : 'Browser storage could not save this game.'}{' '}
            Download a PGN before closing this tab.
          </p>
          <button type="button" onClick={onDownload}>Download recovery PGN</button>
          <button type="button" onClick={onRetry}>Retry autosave</button>
        </div>
      )}
    </div>
  )
}
