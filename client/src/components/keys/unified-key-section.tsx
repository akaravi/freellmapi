import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ConfirmButton } from '@/components/confirm-button'
import { EmptyState } from '@/components/empty-state'
import { TableSkeleton } from '@/components/ui/skeleton'
import { Plus, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import type { UnifiedApiKey, UnifiedApiKeyDetail } from '../../../../shared/types'
import { useI18n } from '@/i18n'

const UNIFIED_KEYS_QUERY = ['unified-keys'] as const

export function UnifiedKeySection() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [showIds, setShowIds] = useState<Set<number>>(new Set())
  const [revealedKeys, setRevealedKeys] = useState<Record<number, string>>({})
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [newKeyDialog, setNewKeyDialog] = useState<UnifiedApiKeyDetail | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const baseUrl = import.meta.env.DEV
    ? `http://${window.location.hostname}:${__SERVER_PORT__}/v1`
    : `${window.location.origin}/v1`

  const { data: keys = [], isLoading, isError } = useQuery<UnifiedApiKey[]>({
    queryKey: [...UNIFIED_KEYS_QUERY],
    queryFn: () => apiFetch('/api/settings/api-keys'),
  })

  const createKey = useMutation({
    mutationFn: (label: string) =>
      apiFetch<UnifiedApiKeyDetail>('/api/settings/api-keys', {
        method: 'POST',
        body: JSON.stringify({ label }),
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: [...UNIFIED_KEYS_QUERY] })
      queryClient.invalidateQueries({ queryKey: ['unified-key'] })
      setNewKeyDialog(created)
      setRevealedKeys(prev => ({ ...prev, [created.id]: created.apiKey }))
      setShowIds(prev => new Set(prev).add(created.id))
    },
  })

  const updateKey = useMutation({
    mutationFn: ({ id, label }: { id: number; label: string }) =>
      apiFetch(`/api/settings/api-keys/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...UNIFIED_KEYS_QUERY] })
      setEditingId(null)
      setEditingLabel('')
    },
  })

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiFetch(`/api/settings/api-keys/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...UNIFIED_KEYS_QUERY] })
      queryClient.invalidateQueries({ queryKey: ['unified-key'] })
    },
  })

  const regenerateKey = useMutation({
    mutationFn: (id: number) =>
      apiFetch<UnifiedApiKeyDetail>(`/api/settings/api-keys/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ regenerate: true }),
      }),
    onSuccess: (detail) => {
      queryClient.invalidateQueries({ queryKey: [...UNIFIED_KEYS_QUERY] })
      queryClient.invalidateQueries({ queryKey: ['unified-key'] })
      setRevealedKeys(prev => ({ ...prev, [detail.id]: detail.apiKey }))
      setShowIds(prev => new Set(prev).add(detail.id))
    },
  })

  const deleteKey = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/settings/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...UNIFIED_KEYS_QUERY] })
      queryClient.invalidateQueries({ queryKey: ['unified-key'] })
    },
  })

  const revealKey = useMutation({
    mutationFn: (id: number) => apiFetch<UnifiedApiKeyDetail>(`/api/settings/api-keys/${id}`),
    onSuccess: (detail) => {
      setRevealedKeys(prev => ({ ...prev, [detail.id]: detail.apiKey }))
    },
  })

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editingId])

  function startEditing(key: UnifiedApiKey) {
    setEditingId(key.id)
    setEditingLabel(key.label)
  }

  function saveEditing(id: number) {
    updateKey.mutate({ id, label: editingLabel })
  }

  async function toggleShow(key: UnifiedApiKey) {
    if (showIds.has(key.id)) {
      setShowIds(prev => {
        const next = new Set(prev)
        next.delete(key.id)
        return next
      })
      return
    }
    if (!revealedKeys[key.id]) {
      await revealKey.mutateAsync(key.id)
    }
    setShowIds(prev => new Set(prev).add(key.id))
  }

  function copyKey(id: number, value: string) {
    navigator.clipboard.writeText(value)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  function displayValue(key: UnifiedApiKey): string {
    if (showIds.has(key.id) && revealedKeys[key.id]) return revealedKeys[key.id]
    return key.maskedKey
  }

  return (
    <section className="rounded-3xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium">{t('keys.unifiedKey')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('keys.unifiedKeyDescBefore')}<code className="font-mono">api_key</code>{t('keys.unifiedKeyDescAfter')}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => createKey.mutate('')}
          disabled={createKey.isPending || isError}
        >
          <Plus className="size-3.5" />
          {t('keys.addUnifiedKey')}
        </Button>
      </div>

      {isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {t('keys.serverUnreachableBefore')}<code className="font-mono">{baseUrl.replace('/v1', '')}</code>{t('keys.serverUnreachableAfter')}
        </div>
      ) : isLoading ? (
        <TableSkeleton rows={2} />
      ) : keys.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={t('keys.noUnifiedKeys')}
          description={t('keys.noUnifiedKeysDesc')}
          action={
            <Button size="sm" onClick={() => createKey.mutate('')} disabled={createKey.isPending}>
              {t('keys.addUnifiedKey')}
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {keys.map(key => (
            <li
              key={key.id}
              className={`rounded-xl border px-3 py-2.5 ${key.enabled ? '' : 'opacity-60'}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Switch
                  checked={key.enabled}
                  onCheckedChange={enabled => toggleEnabled.mutate({ id: key.id, enabled })}
                  aria-label={key.enabled ? t('keys.disableKey') : t('keys.enableKey')}
                />
                {editingId === key.id ? (
                  <Input
                    ref={editInputRef}
                    value={editingLabel}
                    onChange={e => setEditingLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEditing(key.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="h-8 max-w-[12rem] text-xs"
                    placeholder={t('keys.unifiedKeyLabelPlaceholder')}
                  />
                ) : (
                  <span className="text-xs font-medium min-w-[4rem]">
                    {key.label || t('keys.unifiedKeyDefaultLabel')}
                  </span>
                )}
                <code className="flex-1 min-w-[10rem] font-mono text-xs bg-muted px-2 py-1.5 rounded-lg truncate tabular-nums">
                  {displayValue(key)}
                </code>
                <div className="flex items-center gap-1 shrink-0">
                  {editingId === key.id ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => saveEditing(key.id)}>
                        {t('common.save')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        {t('common.cancel')}
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => startEditing(key)} aria-label={t('keys.editLabel')}>
                      <Pencil className="size-3.5" />
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => toggleShow(key)} disabled={revealKey.isPending}>
                    {showIds.has(key.id) ? t('keys.hideKey') : t('keys.showKey')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const value = revealedKeys[key.id]
                      if (value) copyKey(key.id, value)
                      else {
                        revealKey.mutate(key.id, {
                          onSuccess: d => copyKey(d.id, d.apiKey),
                        })
                      }
                    }}
                  >
                    {copiedId === key.id ? t('keys.copiedKey') : t('keys.copyKey')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => regenerateKey.mutate(key.id)}
                    disabled={regenerateKey.isPending}
                    aria-label={t('keys.regenerate')}
                  >
                    <RefreshCw className="size-3.5" />
                  </Button>
                  {keys.length > 1 && (
                    <ConfirmButton
                      variant="ghost"
                      size="sm"
                      onConfirm={() => deleteKey.mutate(key.id)}
                      confirmLabel={t('common.delete')}
                      aria-label={t('keys.deleteUnifiedKey')}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </ConfirmButton>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {newKeyDialog && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs space-y-2">
          <p className="font-medium">{t('keys.unifiedKeyCreated')}</p>
          <code className="block font-mono text-xs break-all select-all">{newKeyDialog.apiKey}</code>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => copyKey(newKeyDialog.id, newKeyDialog.apiKey)}>
              {t('keys.copyKey')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNewKeyDialog(null)}>
              {t('common.dismiss')}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs pt-2 border-t">
        <span className="text-muted-foreground">{t('keys.baseUrl')}</span>
        <code className="font-mono">{baseUrl}</code>
        <span className="text-muted-foreground">{t('keys.endpointChat')}</span>
        <code className="font-mono">/v1/chat/completions</code>
        <span className="text-muted-foreground">{t('keys.endpointResponses')}</span>
        <code className="font-mono">/v1/responses</code>
        <span className="text-muted-foreground">{t('keys.endpointMessages')}</span>
        <code className="font-mono">/v1/messages <span className="text-muted-foreground">({t('keys.endpointMessagesHint')})</span></code>
        <span className="text-muted-foreground">{t('keys.endpointEmbeddings')}</span>
        <code className="font-mono">/v1/embeddings <span className="text-muted-foreground">({t('keys.endpointEmbeddingsHint')})</span></code>
      </div>
    </section>
  )
}
