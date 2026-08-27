import type { Frame } from '../core/types.js'
import type { ParseOverrides } from '../core/csv/parse.js'
import { deserializeFrame } from '../core/frame/serialize.js'
import type { JobId, ParsePreview, WorkerRequest, WorkerResponse } from './protocol.js'

/** Omit över en union måste distribueras, annars faller varianternas fält bort. */
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never

export interface Progress {
  phase: string
  done: number
  total: number
}

interface Pending {
  resolve: (value: never) => void
  reject: (reason: Error) => void
  onProgress?: (p: Progress) => void
}

/**
 * Klient mot dataworkern.
 *
 * Filparsning är den enda operationen som verkligen kan frysa fliken, så den
 * ligger utanför huvudtråden. `File` klonas per referens till det som ligger
 * på disk, så att skicka in filen kostar ingenting — och kolumnernas kod- och
 * flaggarrayer kommer tillbaka som överförda buffertar utan kopiering.
 */
export class DataWorkerClient {
  private worker: Worker | null = null
  private pending = new Map<JobId, Pending>()
  private nextId: JobId = 1

  private ensure(): Worker {
    if (this.worker) return this.worker
    // new URL(..., import.meta.url) är det enda mönster Vite skriver om
    // korrekt. En hårdkodad sökväg ger 404 på GitHub Pages.
    const worker = new Worker(new URL('./data.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.receive(event.data)
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Bakgrundstråden kraschade.')
      for (const [, p] of this.pending) p.reject(error)
      this.pending.clear()
    }
    this.worker = worker
    return worker
  }

  private receive(message: WorkerResponse): void {
    const pending = this.pending.get(message.id)
    if (!pending) return
    switch (message.kind) {
      case 'progress':
        pending.onProgress?.({ phase: message.phase, done: message.done, total: message.total })
        return
      case 'error':
        this.pending.delete(message.id)
        pending.reject(new Error(message.message))
        return
      case 'parsed':
        this.pending.delete(message.id)
        ;(pending.resolve as (value: Frame) => void)(deserializeFrame(message.frame))
        return
      case 'preview':
        this.pending.delete(message.id)
        ;(pending.resolve as (value: ParsePreview) => void)(message.preview)
        return
    }
  }

  private send<T>(request: WithoutId<WorkerRequest>, onProgress?: (p: Progress) => void): Promise<T> {
    const id = this.nextId++
    const worker = this.ensure()
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (value: never) => void,
        reject,
        onProgress,
      })
      worker.postMessage({ ...request, id } as WorkerRequest)
    })
  }

  preview(file: File, overrides: ParseOverrides, rows = 8): Promise<ParsePreview> {
    return this.send<ParsePreview>({ kind: 'preview', file, overrides, rows })
  }

  parse(
    file: File,
    overrides: ParseOverrides,
    onProgress?: (p: Progress) => void,
  ): Promise<Frame> {
    return this.send<Frame>(
      { kind: 'parse', file, fileName: file.name, overrides },
      onProgress,
    )
  }
}

export const dataWorker = new DataWorkerClient()
