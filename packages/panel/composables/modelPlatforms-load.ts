export async function refreshModelPlatformsSafely(refresh: () => Promise<unknown>) {
  try {
    await refresh()
    return true
  }
  catch {
    return false
  }
}
