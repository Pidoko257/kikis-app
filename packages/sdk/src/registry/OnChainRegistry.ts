import { Connection, PublicKey } from '@solana/web3.js'

export interface OnChainProviderInfo {
  account: string
  endpoint: string
  tags: string[]
}

function tryDecodeBase64(value: string): string {
  try {
    return Buffer.from(value, 'base64').toString('utf-8')
  } catch {
    return value
  }
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const tags: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (trimmed.length > 0) tags.push(trimmed)
  }
  return tags
}

export class OnChainRegistry {
  private connection: Connection

  constructor(connection: Connection) {
    this.connection = connection
  }

  async getProviders(): Promise<OnChainProviderInfo[]> {
    const results: OnChainProviderInfo[] = []
    const accounts = await this.connection.getProgramAccounts(new PublicKey(''))

    for (const { account, pubkey } of accounts) {
      const accountId = pubkey.toBase58()
      const dataEntries: Record<string, string> = {}

      try {
        const decoded = JSON.parse(account.data.toString('utf-8'))
        if (decoded && typeof decoded === 'object') {
          for (const [key, value] of Object.entries(decoded)) {
            if (typeof value === 'string') dataEntries[key] = value
          }
        }
      } catch {
        continue
      }

      const endpoint = dataEntries['kikis-app_endpoint']
      if (!endpoint) continue

      let tags: string[] = []
      const rawTags = dataEntries['kikis-app_tags']
      if (rawTags) {
        const decoded = tryDecodeBase64(rawTags)
        try {
          const parsed = JSON.parse(decoded)
          if (Array.isArray(parsed)) tags = normalizeTags(parsed)
        } catch {
          tags = decoded
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        }
      }

      results.push({ account: accountId, endpoint, tags })
    }

    return results
  }
}
