import { useId, useState } from 'react'
import type { AutoSaveWriteResult } from '../engine/autoSave'
import './AutoSaveStatus.css'

type Props = {
  result: AutoSaveWriteResult | null
  onDownload: () => boolean
  onRetry: () => void
  onOpenPgn: () => void
}

function AutoSaveWarning({ result, onDownload, onRetry, onOpenPgn }: Props) {
  const [downloadFailed, setDownloadFailed] = useState(false)
  const downloadErrorId = useId()
  return (
    <div className="autosave-warning">
      <p><strong>Latest changes are not saved for recovery.</strong>{' '}
        {result === 'too-large'
          ? 'This game exceeds the 2 MB recovery limit.'
          : 'Browser storage could not save this game.'}{' '}
        Download a PGN before closing this tab.
      </p>
      <button type="button" aria-describedby={downloadFailed ? downloadErrorId : undefined}
        onClick={() => setDownloadFailed(!onDownload())}>Download recovery PGN</button>
      <button type="button" onClick={() => { setDownloadFailed(false); onRetry() }}>Retry autosave</button>
      {downloadFailed && <>
        <p id={downloadErrorId} className="error-copy" role="alert">
          The browser could not start the recovery download. Try again, or open PGN and FEN and choose Export to copy your game manually.
        </p>
        <button type="button" onClick={onOpenPgn}>Open PGN and FEN</button>
      </>}
    </div>
  )
}

export function AutoSaveStatus(props: Props) {
  const { result } = props
  const failed = result === 'failed' || result === 'too-large'
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {failed && <AutoSaveWarning {...props} />}
    </div>
  )
}
