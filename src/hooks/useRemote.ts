import { useCallback, useEffect, useRef, useState } from 'react'
import { humanError } from '../lib/api'

export function useRemote<T>(loader: () => Promise<T>, dependencies: readonly unknown[] = []) {
  const loaderRef = useRef(loader)
  loaderRef.current = loader
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await loaderRef.current())
    } catch (reason) {
      setError(humanError(reason))
    } finally {
      setLoading(false)
    }
  }, dependencies) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void reload() }, [reload])
  return { data, loading, error, reload, setData }
}
