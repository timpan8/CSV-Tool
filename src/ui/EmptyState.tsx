import { useRef, useState } from 'preact/hooks'

export function EmptyState(props: {
  onFiler: (files: File[]) => void
  onExempel: () => void
  onExempelpar: () => void
}) {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div class="tomt">
      <div
        class={`tomt__zon${over ? ' tomt__zon--over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const files = Array.from(e.dataTransfer?.files ?? [])
          if (files.length > 0) props.onFiler(files)
        }}
      >
        <p class="tomt__rubrik">Släpp dina filer här</p>
        <p class="tomt__underrubrik">CSV, TXT, tabbseparerad text eller Excel (.xlsx)</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.tsv,.xlsx,text/csv,text/plain"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from((e.currentTarget as HTMLInputElement).files ?? [])
            if (files.length > 0) props.onFiler(files)
            ;(e.currentTarget as HTMLInputElement).value = ''
          }}
        />
        <button class="knapp knapp--primar" onClick={() => inputRef.current?.click()}>
          Välj fil…
        </button>
        <p style={{ marginTop: 14, marginBottom: 0, color: 'var(--text-svag)', fontSize: 13 }}>
          …eller klistra in data direkt med Ctrl+V
        </p>
      </div>

      <p class="tomt__lokal">
        <strong aria-hidden="true">●</strong>
        <span>
          <strong>Inget laddas upp.</strong> Filen öppnas i din webbläsare och lämnar aldrig
          datorn. Verktyget kan inte skicka data någonstans — det är låst i sidans
          säkerhetspolicy och går att kontrollera i utvecklarverktygen.
        </span>
      </p>

      <div class="tomt__kort">
        <div>
          <h3>Prova utan egen fil</h3>
          <div class="tomt__lista">
            <button class="knapp" onClick={props.onExempel}>
              Öppna exempelfil
            </button>
            <button class="knapp" onClick={props.onExempelpar}>
              Öppna två filer att slå ihop
            </button>
          </div>
        </div>
        <div>
          <h3>Det här kan du göra</h3>
          <div class="tomt__lista" style={{ color: 'var(--text-svag)', fontSize: 13 }}>
            Öppna och städa CSV · sortera och filtrera · hitta dubbletter · slå ihop två filer ·
            exportera Excel-vänligt
          </div>
        </div>
      </div>
    </div>
  )
}
