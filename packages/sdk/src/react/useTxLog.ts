import { useEffect, useState } from 'react'
import { useKikisAppContext } from './context.js'

export interface TxLogRow {
  id: string
  tx_hash: string
  mode: string
  amount: string
  channel_id: string | null
  created_at: string
  [key: string]: unknown
}

export interface UseTxLogFilter {
  channelId?: string
  mode?: 'x402' | 'mpp-charge' | 'mpp-session'
  limit?: number
}

/**
 * Subscribes to Supabase Realtime on the `tx_log` table. Returns a live array
 * of rows ordered newest-first. Requires <KikisAppProvider supabase={...}>.
 *
 * @example
 * const txLog = useTxLog({ channelId, limit: 50 })
 * return <ul>{txLog.map(r => <li key={r.id}>{r.tx_hash}</li>)}</ul>
 */
export function useTxLog(filter?: UseTxLogFilter): TxLogRow[] {
  const { supabase } = useKikisAppContext()
  const [rows, setRows] = useState<TxLogRow[]>([])

  useEffect(() => {
    // Rows belong to the current client + filter identity. Clear them as soon
    // as that identity changes so stale rows never render while the next
    // snapshot is pending (or if it fails / the client is removed).
    setRows([])
    if (!supabase) return
    let cancelled = false

    const fetchInitial = async () => {
      let query = supabase
        .from('tx_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filter?.limit ?? 100)
      if (filter?.channelId) query = query.eq('channel_id', filter.channelId)
      if (filter?.mode) query = query.eq('mode', filter.mode)
      const { data, error } = await query
      if (cancelled) return
      if (error) {
        // A failed read must not expose rows from the prior selection.
        setRows([])
        return
      }
      if (data) setRows(data as TxLogRow[])
    }
    fetchInitial()

    const channel = supabase
      .channel(`tx_log:${filter?.channelId ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tx_log' },
        (payload: { new: TxLogRow }) => {
          if (cancelled) return
          const row = payload.new
          if (filter?.channelId && row.channel_id !== filter.channelId) return
          if (filter?.mode && row.mode !== filter.mode) return
          setRows((prev) => [row, ...prev].slice(0, filter?.limit ?? 100))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [supabase, filter?.channelId, filter?.mode, filter?.limit])

  return rows
}
