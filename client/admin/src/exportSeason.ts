export const EXPORT_PATH = '/api/admin/export'
export const EXPORT_FAILED = 'Exporting Job failed try again later'
export const EXPORT_FALLBACK_NAME = 'booklist-export.zip'
/** How long the object URL outlives the click, so the browser can start the download. */
export const REVOKE_DELAY_MS = 1000

export type ExportOutcome = 'downloaded' | 'failed' | 'signed-out'

export type ExportDeps = {
  fetch: (input: string, init: RequestInit) => Promise<Response>
  signOut: () => Promise<void>
  download: (blob: Blob, fileName: string) => void
}

/** The file name from `attachment; filename="…"`, or a safe fallback. */
export function attachmentName(disposition: string | null): string {
  const match = disposition?.match(/filename="([^"]+)"/)
  return match ? match[1] : EXPORT_FALLBACK_NAME
}

/** The error shown under Export: cleared when an attempt starts, set only when one fails. */
export function exportErrorFor(phase: 'start' | ExportOutcome): string {
  return phase === 'failed' ? EXPORT_FAILED : ''
}

/** One export attempt: fetch the zip, then download it, sign out on 401, or report failure. */
export async function exportSeason(deps: ExportDeps): Promise<ExportOutcome> {
  let response: Response
  let blob: Blob
  try {
    response = await deps.fetch(EXPORT_PATH, { credentials: 'include' })
    if (response.status === 401) {
      try {
        await deps.signOut()
      } catch {
        // Signing out locally failed too; the gate still asks to sign in again.
      }
      return 'signed-out'
    }
    if (!response.ok) return 'failed'
    // A 2xx that is not the zip (an HTML page from a proxy, say) is never saved as one.
    if (!(response.headers.get('Content-Type') ?? '').toLowerCase().includes('application/zip')) return 'failed'
    blob = await response.blob()
  } catch {
    return 'failed'
  }
  try {
    deps.download(blob, attachmentName(response.headers.get('Content-Disposition')))
  } catch {
    return 'failed'
  }
  return 'downloaded'
}

/** Save `blob` through a temporary `<a download>`; the URL is revoked after a short delay. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking right after click() can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
