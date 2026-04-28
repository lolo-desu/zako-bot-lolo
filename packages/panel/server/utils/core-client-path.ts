function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`
}

export function resolveCoreApiUrl(path: string, coreApiUrl: string) {
  const base = new URL(ensureTrailingSlash(coreApiUrl))
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path

  return new URL(normalizedPath, base).toString()
}
