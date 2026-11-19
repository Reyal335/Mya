// The Codex CLI reads a CA bundle from CODEX_CA_CERTIFICATE, or from SSL_CERT_FILE, and fails to
// sign in ("Failed to read CA certificate file ... selected by SSL_CERT_FILE") when the variable
// names a file that is not there. Conda sets SSL_CERT_FILE when an environment is activated, and
// an install that moved leaves it pointing at nothing. Mya starts the CLIs, so it leaves such a
// variable out of what it gives them: the CLI then uses the system's own roots, which is what its
// message says to do. A variable that names a file that exists is kept as it is.
//
// Pure: `exists` says whether a path is a file. Nothing is written, and the person's own
// environment is never changed.

export const CA_FILE_VARS = ['SSL_CERT_FILE', 'CODEX_CA_CERTIFICATE'] as const

export function withoutDeadCaFiles(
  env: NodeJS.ProcessEnv,
  exists: (path: string) => boolean
): { env: NodeJS.ProcessEnv; dropped: string[] } {
  const next: NodeJS.ProcessEnv = { ...env }
  const dropped: string[] = []
  for (const name of CA_FILE_VARS) {
    const value = next[name]
    // An empty value names nothing, so there is nothing to read and nothing to fail on.
    if (typeof value !== 'string' || value.trim() === '') continue
    if (!exists(value)) {
      delete next[name]
      dropped.push(name)
    }
  }
  return { env: next, dropped }
}
