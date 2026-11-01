// „So funktioniert’s“: kurzes Erklärvideo zum Kamera-Coaching in einem Overlay.
import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export function ErklaervideoLink({ klein = false }: { klein?: boolean }) {
  const [offen, setOffen] = useState(false)
  return (
    <>
      <button type="button" className={`erklaer-link${klein ? ' klein' : ''}`} onClick={() => setOffen(true)}>
        <span className="erklaer-play" aria-hidden="true"><Icon name="weiter" groesse={16} staerke={2.4} /></span>
        So funktioniert’s <span className="leise">· Video, 37 s</span>
      </button>
      {offen && <Erklaervideo schliessen={() => setOffen(false)} />}
    </>
  )
}

function Erklaervideo({ schliessen }: { schliessen: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dialog.current
    d?.showModal()
    return () => d?.close()
  }, [])
  return (
    <dialog ref={dialog} className="video-dialog" onClose={schliessen} onClick={(e) => { if (e.target === e.currentTarget) schliessen() }} aria-label="Erklärvideo Kamera-Coaching">
      <div className="video-rahmen">
        <video src="/videos/kamera-trainer.mp4" poster="/videos/kamera-trainer.jpg" controls autoPlay muted playsInline preload="metadata" />
        <button type="button" className="video-zu" onClick={schliessen} aria-label="Video schließen">×</button>
      </div>
    </dialog>
  )
}
