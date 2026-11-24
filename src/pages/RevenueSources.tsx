import { useState, useCallback, useMemo, useRef, useEffect, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useIntl, type IntlShape } from 'react-intl'
import { useDragReorder } from '../hooks/useDragReorder'
import { useMutation } from '../hooks/useMutation'
import { useToast } from '../components/ToastContext'
import { EmptyStateIllustration } from '../components/EmptyStateIllustrations'
import { useSources, sourcesStore, type Source, type HealthStatus } from '../store/sourcesStore'

// Types and seed data are imported from the store

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_META: Record<HealthStatus, { messageId: string; bg: string; color: string }> = {
  healthy: { messageId: 'revenueSources.status.healthy', bg: 'var(--success-soft)', color: 'var(--success)' },
  warning: { messageId: 'revenueSources.status.warning', bg: 'var(--warning-soft)', color: 'var(--warning)' },
  error: { messageId: 'revenueSources.status.error', bg: 'var(--danger-soft)', color: 'var(--danger)' },
}

function formatSync(iso: string | null, neverLabel: string) {
  if (!iso) return neverLabel
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Returns a translated relative time string for how long ago a date was.
 */
function formatRelativeTime(iso: string, intl: IntlShape): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays < 1) return intl.formatMessage({ id: 'revenueSources.relativeTime.today' })
  if (diffDays === 1) return intl.formatMessage({ id: 'revenueSources.relativeTime.oneDayAgo' })
  if (diffDays < 30) return intl.formatMessage({ id: 'revenueSources.relativeTime.daysAgo' }, { days: diffDays })
  const diffMonths = Math.round(diffDays / 30)
  if (diffMonths === 1) return intl.formatMessage({ id: 'revenueSources.relativeTime.aboutOneMonthAgo' })
  return intl.formatMessage({ id: 'revenueSources.relativeTime.aboutMonthsAgo' }, { months: diffMonths })
}

// ---------------------------------------------------------------------------
// Mock impact data — replace with real API
// ---------------------------------------------------------------------------

interface ImpactPipeline {
  id: string
  name: string
  nextRun: string
}

function getMockImpact(provider: string): ImpactPipeline[] {
  const base = new Date()
  base.setDate(base.getDate() + 1)
  return [
    { id: 'pipe-001', name: `${provider} Revenue Verification`, nextRun: base.toISOString() },
    { id: 'pipe-002', name: 'Monthly Attestation Batch', nextRun: new Date(base.getTime() + 86400000 * 2).toISOString() },
    { id: 'pipe-003', name: 'Compliance Report Sync', nextRun: new Date(base.getTime() + 86400000 * 7).toISOString() },
  ]
}

function formatNextRun(iso: string, intl: IntlShape): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  if (diff < 0) return intl.formatMessage({ id: 'revenueSources.relativeTime.overdue' })
  if (diff < 86400000) return intl.formatMessage({ id: 'revenueSources.relativeTime.tomorrow' })
  if (diff < 86400000 * 2) return intl.formatMessage({ id: 'revenueSources.relativeTime.inDays' }, { count: 2 })
  if (diff < 86400000 * 7) return intl.formatMessage({ id: 'revenueSources.relativeTime.inDays' }, { count: Math.round(diff / 86400000) })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// ExpiredTokenBanner — #222
// ---------------------------------------------------------------------------

interface ExpiredTokenBannerProps {
  sources: Source[]
  onReconnect: (id: string) => void
  dismissedIds: Set<string>
  onDismiss: (id: string) => void
}

function ExpiredTokenBanner({ sources, onReconnect, dismissedIds, onDismiss }: ExpiredTokenBannerProps) {
  const intl = useIntl()
  const expiredSources = sources.filter(
    (s) => s.tokenExpiredAt !== undefined && !dismissedIds.has(s.id),
  )

  if (expiredSources.length === 0) return null

  return (
    <section
      aria-label={intl.formatMessage({ id: 'revenueSources.expiredToken.title' }, { count: expiredSources.length, name: expiredSources[0]?.provider ?? '' })}
      style={{
        display: 'grid',
        gap: '0.625rem',
        padding: '1rem 1.1rem',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid rgba(251,191,36,0.35)',
        background:
          'linear-gradient(135deg,rgba(251,191,36,0.08),rgba(251,113,133,0.05)),var(--surface)',
        marginBottom: '1.25rem',
      }}
    >
      {/* Banner header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Warning icon */}
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '1.75rem',
              height: '1.75rem',
              borderRadius: '50%',
              background: 'var(--warning-soft)',
              color: 'var(--warning)',
              fontSize: '0.9rem',
              flexShrink: 0,
            }}
          >
            ⚠
          </span>
          <strong style={{ fontSize: '0.95rem', color: 'var(--text)' }}>
            {intl.formatMessage({ id: 'revenueSources.expiredToken.title' }, { count: expiredSources.length, name: expiredSources[0]?.provider ?? '' })}
          </strong>
        </div>
      </div>

      {/* Per-source rows */}
      <ul
        style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}
        aria-label={intl.formatMessage({ id: 'revenueSources.expiredIntegrations' })}
      >
        {expiredSources.map((source) => (
          <li
            key={source.id}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.625rem 0.875rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'rgba(15,23,42,0.5)',
            }}
          >
            {/* Provider + account */}
            <div style={{ flex: '1 1 10rem', minWidth: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{source.provider}</span>
              <span style={{ color: 'var(--muted)', fontSize: '0.82rem', marginLeft: '0.5rem' }}>
                {source.accountLabel}
              </span>
            </div>

            <span
              aria-label={intl.formatMessage({ id: 'revenueSources.expiredToken.expiredLabel' }, { relativeTime: formatRelativeTime(source.tokenExpiredAt!, intl) })}
              style={{
                fontSize: '0.78rem',
                color: 'var(--warning)',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {intl.formatMessage({ id: 'revenueSources.expired' })} {formatRelativeTime(source.tokenExpiredAt!, intl)}
            </span>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
              <button
                type="button"
                aria-label={intl.formatMessage({ id: 'revenueSources.reconnectAriaLabel' }, { name: source.provider })}
                onClick={() => onReconnect(source.id)}
                style={{
                  ...accentBtn,
                  fontSize: '0.82rem',
                  padding: '0.35rem 0.875rem',
                }}
              >
                {intl.formatMessage({ id: 'revenueSources.expiredToken.reconnect' })}
              </button>
              <button
                type="button"
                aria-label={intl.formatMessage({ id: 'revenueSources.dismissAriaLabel' }, { name: source.provider })}
                onClick={() => onDismiss(source.id)}
                style={{
                  ...secondaryBtn,
                  fontSize: '0.82rem',
                  padding: '0.35rem 0.625rem',
                  minWidth: 'auto',
                }}
              >
                {intl.formatMessage({ id: 'revenueSources.expiredToken.dismiss' })}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Footer note */}
      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.55 }}>
        {intl.formatMessage({ id: 'revenueSources.banner.footer' })}
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ConfirmDialogProps {
  source: Source
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ source, onConfirm, onCancel }: ConfirmDialogProps) {
  const intl = useIntl()
  const [typedName, setTypedName] = useState('')
  const expectedName = source.provider
  const isConfirmed = typedName === expectedName

  const impactPipelines = useMemo(() => getMockImpact(source.provider), [source.provider])
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement
    inputRef.current?.focus()
    return () => {
      triggerRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(2,6,23,0.72)',
        padding: '1rem',
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 100%)',
          background: 'var(--surface-strong, #0f1b30)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '1.75rem',
          display: 'grid',
          gap: '1.25rem',
        }}
      >
        {/* Header */}
        <div>
          <h2 id="confirm-title" style={{ margin: 0, fontSize: '1.1rem', color: 'var(--danger)' }}>
            {intl.formatMessage({ id: 'revenueSources.dialog.title' }, { name: source.provider })}
          </h2>
          <p id="confirm-desc" style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
            {intl.formatMessage({ id: 'revenueSources.dialog.description' }, { name: <strong style={{ color: 'var(--text)' }}>{source.accountLabel}</strong> })}
          </p>
        </div>

        {/* Impact preview */}
        <div
          style={{
            padding: '0.9rem 1rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(251,113,133,0.25)',
            background: 'rgba(251,113,133,0.06)',
            display: 'grid',
            gap: '0.65rem',
          }}
        >
          <div style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--danger)' }}>
            {intl.formatMessage({ id: 'revenueSources.dialog.affectedPipelines' })}
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
            {impactPipelines.map((p) => (
              <li
                key={p.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                  fontSize: '0.85rem',
                  padding: '0.4rem 0.5rem',
                  borderRadius: 6,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
                <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                  {intl.formatMessage({ id: 'revenueSources.dialog.nextRun' }, { date: formatNextRun(p.nextRun, intl) })}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
            {intl.formatMessage({ id: 'revenueSources.dialog.impact' })}
          </p>
        </div>

        {/* Typed confirmation */}
        <div style={{ display: 'grid', gap: '0.35rem' }}>
          <label
            htmlFor="disconnect-confirm-input"
            style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}
          >
            {intl.formatMessage({ id: 'revenueSources.dialog.typeToConfirm' }, { name: <strong style={{ color: 'var(--danger)' }}>{expectedName}</strong> })}
          </label>
          <input
            ref={inputRef}
            id="disconnect-confirm-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={intl.formatMessage({ id: 'revenueSources.dialog.placeholder' }, { name: expectedName })}
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            aria-describedby="confirm-desc"
            style={{
              padding: '0.6rem 0.8rem',
              borderRadius: 8,
              border: `1px solid ${typedName && !isConfirmed ? 'rgba(251,113,133,0.5)' : 'var(--border)'}`,
              background: 'var(--surface-strong)',
              color: 'var(--text)',
              fontSize: '0.95rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              outline: 'none',
            }}
          />
          {typedName && !isConfirmed && (
            <p role="alert" style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--danger)' }}>
              {intl.formatMessage({ id: 'revenueSources.dialog.mismatch' }, { name: expectedName })}
            </p>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={secondaryBtn}>{intl.formatMessage({ id: 'common.cancel' })}</button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!isConfirmed}
            style={{
              ...dangerBtn,
              opacity: isConfirmed ? 1 : 0.4,
              cursor: isConfirmed ? 'pointer' : 'not-allowed',
            }}
          >
            {intl.formatMessage({ id: 'revenueSources.dialog.confirmDisconnect' }, { name: source.provider })}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared button styles
// ---------------------------------------------------------------------------

const baseBtn: CSSProperties = {
  padding: '0.45rem 1rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid transparent',
  fontSize: '0.85rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 160ms',
}

const secondaryBtn: CSSProperties = {
  ...baseBtn,
  background: 'rgba(148,163,184,0.08)',
  borderColor: 'var(--border)',
  color: 'var(--text)',
}

const dangerBtn: CSSProperties = {
  ...baseBtn,
  background: 'var(--danger-soft)',
  borderColor: 'rgba(251,113,133,0.35)',
  color: 'var(--danger)',
}

const accentBtn: CSSProperties = {
  ...baseBtn,
  background: 'rgba(94,234,212,0.08)',
  borderColor: 'rgba(94,234,212,0.3)',
  color: 'var(--accent)',
}

const moveBtn: CSSProperties = {
  ...baseBtn,
  padding: '0',
  width: '1.5rem',
  height: '1.25rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.6rem',
  lineHeight: 1,
  background: 'rgba(148,163,184,0.06)',
  borderColor: 'var(--border)',
  color: 'var(--muted)',
  cursor: 'pointer',
  borderRadius: '0.25rem',
}

// Drag handle — six-dot grip icon rendered via box-shadow dots
const HANDLE_SIZE = 20

// ---------------------------------------------------------------------------
// DragHandle
// ---------------------------------------------------------------------------

interface DragHandleProps {
  label: string
  isGrabbed: boolean
  onPointerDown: (e: { preventDefault(): void }) => void
  onKeyDown: (e: { key: string; preventDefault(): void }) => void
  onClick: () => void
}

function DragHandle({ label, isGrabbed, onPointerDown, onKeyDown, onClick }: DragHandleProps) {
  const intl = useIntl()
  return (
    <button
      type="button"
      aria-label={isGrabbed ? intl.formatMessage({ id: 'revenueSources.releaseAriaLabel' }, { name: label }) : intl.formatMessage({ id: 'revenueSources.reorderAriaLabel' }, { name: label })}
      aria-pressed={isGrabbed}
      data-testid="drag-handle"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        if (e.detail === 0) onClick()
      }}
      style={{
        flexShrink: 0,
        width: HANDLE_SIZE + 16,
        height: HANDLE_SIZE + 16,
        padding: '0.5rem',
        background: isGrabbed ? 'rgba(94,234,212,0.15)' : 'transparent',
        border: isGrabbed ? '1px solid rgba(94,234,212,0.45)' : '1px solid transparent',
        borderRadius: '0.4rem',
        cursor: isGrabbed ? 'grabbing' : 'grab',
        color: 'var(--muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
        transition: 'background 120ms, border-color 120ms, color 120ms',
      }}
    >
      {/* Six-dot grip icon (2×3 grid) */}
      <svg
        aria-hidden="true"
        width={HANDLE_SIZE}
        height={HANDLE_SIZE}
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <circle cx="7" cy="5" r="1.5" />
        <circle cx="13" cy="5" r="1.5" />
        <circle cx="7" cy="10" r="1.5" />
        <circle cx="13" cy="10" r="1.5" />
        <circle cx="7" cy="15" r="1.5" />
        <circle cx="13" cy="15" r="1.5" />
      </svg>
    </button>
  )
}

// ---------------------------------------------------------------------------
// SourceRow
// ---------------------------------------------------------------------------

interface SourceRowProps {
  source: Source
  index: number
  totalCount: number
  isGrabbed: boolean
  isDropTarget: boolean
  onReconnect: (id: string) => void
  onDisconnect: (source: Source) => void
  onPointerDown: (e: { preventDefault(): void }) => void
  onPointerEnter: () => void
  onKeyDown: (e: { key: string; preventDefault(): void }) => void
  onHandleClick: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function SourceRow({
  source,
  index,
  totalCount,
  isGrabbed,
  isDropTarget,
  onReconnect,
  onDisconnect,
  onPointerDown,
  onPointerEnter,
  onKeyDown,
  onHandleClick,
  onMoveUp,
  onMoveDown,
}: SourceRowProps) {
  const intl = useIntl()
  const s = STATUS_META[source.status]

  const rowStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '1rem',
    padding: '1rem 1.25rem',
    background: isGrabbed
      ? 'rgba(94,234,212,0.06)'
      : isDropTarget
        ? 'rgba(94,234,212,0.03)'
        : 'var(--surface)',
    border: isGrabbed
      ? '1px solid rgba(94,234,212,0.45)'
      : isDropTarget
        ? '2px dashed rgba(94,234,212,0.6)'
        : '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    opacity: isGrabbed ? 0.85 : 1,
    outline: 'none',
    transition: 'background 120ms, border-color 120ms, opacity 120ms',
  }

  return (
    <li
      role="listitem"
      aria-label={intl.formatMessage({ id: 'revenueSources.rowAriaLabel' }, { name: source.provider, position: index + 1, total: totalCount })}
      aria-grabbed={isGrabbed || undefined}
      onPointerEnter={onPointerEnter}
      style={rowStyle}
    >
      <DragHandle
        label={source.provider}
        isGrabbed={isGrabbed}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onClick={onHandleClick}
      />

      {/* Per-row move up/down controls */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        <button
          type="button"
          aria-label={intl.formatMessage({ id: 'revenueSources.moveUp' }, { name: source.provider })}
          disabled={index === 0}
          data-testid={`move-up-${index}`}
          onClick={onMoveUp}
          style={{
            ...moveBtn,
            visibility: index === 0 ? 'hidden' : 'visible',
          }}
        >
          ▲
        </button>
        <button
          type="button"
          aria-label={intl.formatMessage({ id: 'revenueSources.moveDown' }, { name: source.provider })}
          disabled={index === totalCount - 1}
          data-testid={`move-down-${index}`}
          onClick={onMoveDown}
          style={{
            ...moveBtn,
            visibility: index === totalCount - 1 ? 'hidden' : 'visible',
          }}
        >
          ▼
        </button>
      </div>

      {/* Provider + account */}
      <div style={{ flex: '1 1 10rem', minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{source.provider}</div>
        <div style={{ color: 'var(--muted)', fontSize: '0.82rem', marginTop: '0.15rem' }}>
          {source.accountLabel}
        </div>
      </div>

      {/* Status badge */}
      <span
        aria-label={intl.formatMessage({ id: 'revenueSources.healthStatusAria' }, { status: intl.formatMessage({ id: s.messageId }) })}
        style={{
          padding: '0.2rem 0.7rem',
          borderRadius: '999px',
          fontSize: '0.78rem',
          fontWeight: 700,
          background: s.bg,
          color: s.color,
          flexShrink: 0,
        }}
      >
        {intl.formatMessage({ id: s.messageId })}
      </span>

      {/* Last sync */}
      <div style={{ color: 'var(--muted)', fontSize: '0.82rem', flexShrink: 0, minWidth: '9rem' }}>
        <span style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.1rem' }}>
          {intl.formatMessage({ id: 'revenueSources.lastSync' })}
        </span>
        <time dateTime={source.lastSync ?? ''} style={{ color: 'var(--text)' }}>
          {formatSync(source.lastSync, intl.formatMessage({ id: 'revenueSources.lastSync.never' }))}
        </time>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        {source.status !== 'healthy' && (
          <button
            type="button"
            aria-label={intl.formatMessage({ id: 'revenueSources.reconnectAriaLabel2' }, { name: source.provider })}
            onClick={() => onReconnect(source.id)}
            style={accentBtn}
          >
            {intl.formatMessage({ id: 'revenueSources.reconnect' })}
          </button>
        )}
        <button
          type="button"
          aria-label={intl.formatMessage({ id: 'revenueSources.disconnectAriaLabel' }, { name: source.provider })}
          onClick={() => onDisconnect(source)}
          style={dangerBtn}
        >
          {intl.formatMessage({ id: 'revenueSources.disconnect' })}
        </button>
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// RevenueSources
// ---------------------------------------------------------------------------
//
// Keyboard interaction model (WCAG 2.1 AA):
//
// 1. Drag handle (six-dot grip)
//    - Keyboard activation → Enter keyboard-reorder mode (grab)
//    - Pointer drag      → Drag-and-drop reorder
//    - When grabbed: Arrow Up/Down to move, Enter/Space to drop, Escape to cancel
//
// 2. Per-row move-up/move-down buttons (▲ / ▼)
//    - Single click moves the item one position up or down
//    - Buttons are hidden at list boundaries (first item cannot move up, etc.)
//    - aria-live region announces each move: "Stripe moved up to position 2 of 3"
//
// 3. aria-live="polite" region
//    - Announces all reorder actions to screen readers
//    - Visually hidden but present in the DOM for assistive technology
// ---------------------------------------------------------------------------

export default function RevenueSources() {
  const intl = useIntl()
  const { addToast } = useToast()
  const sources = useSources()
  const reorderMutation = useMutation<Source[], Source[]>({
    mutationKey: 'revenue-sources-reorder',
    mutationFn: async (nextSources) => {
      const response = await fetch('/v1/revenue-sources/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: nextSources.map((source) => source.id) }),
      })
      if (!response.ok) {
        throw new Error(intl.formatMessage({ id: 'revenueSources.error.reorderFailed' }, { status: response.status }))
      }
    },
    onMutate: (nextSources) => {
      const previousSources = sourcesStore.getAll()
      sourcesStore.setAll(nextSources)
      return previousSources
    },
    onError: (error, _nextSources, previousSources) => {
      sourcesStore.setAll(previousSources)
      addToast(error.message, 'error')
    },
  })
  const [pendingDisconnect, setPendingDisconnect] = useState<Source | null>(null)
  const [dismissedBannerIds, setDismissedBannerIds] = useState<Set<string>>(new Set())
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const getLabel = useCallback((s: Source) => s.provider, [])

  const {
    grabbedIndex,
    dropTargetIndex,
    announcement,
    handlePointerDown,
    handlePointerEnter,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleKeyboardGrab,
    handleKeyDown,
    moveUp,
    moveDown,
  } = useDragReorder(sources, (nextSources) => {
    void reorderMutation.mutate(nextSources)
  }, getLabel)

  function handleReconnect(id: string) {
    sourcesStore.update(id, { status: 'healthy', lastSync: new Date().toISOString(), tokenExpiredAt: undefined })
    const timer = dismissTimers.current.get(id)
    if (timer) { clearTimeout(timer); dismissTimers.current.delete(id) }
  }

  function handleBannerDismiss(id: string) {
    setDismissedBannerIds((prev) => new Set(prev).add(id))
    const timer = setTimeout(() => {
      setDismissedBannerIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      dismissTimers.current.delete(id)
    }, 30_000)
    dismissTimers.current.set(id, timer)
  }

  function handleDisconnectRequest(source: Source) {
    setPendingDisconnect(source)
  }

  function handleDisconnectConfirm() {
    if (!pendingDisconnect) return
    const source = pendingDisconnect
    const removeIndex = sources.findIndex((s) => s.id === source.id)
    setPendingDisconnect(null)
    sourcesStore.remove(source.id)
    addToast(
      intl.formatMessage({ id: 'revenueSources.toast.disconnected' }, { name: source.provider }),
      'info',
      8000,
      () => {
        sourcesStore.restore(source, removeIndex !== -1 ? removeIndex : undefined)
        addToast(intl.formatMessage({ id: 'revenueSources.toast.reconnected' }, { name: source.provider }), 'success')
      },
      intl.formatMessage({ id: 'common.undo' }),
    )
  }

  return (
    <div style={{ maxWidth: '52rem' }}>
      <h1 style={{ marginTop: 0 }}>{intl.formatMessage({ id: 'revenueSources.title' })}</h1>
      <p style={{ color: 'var(--muted)' }}>
        {intl.formatMessage({ id: 'revenueSources.subtitle' })}
      </p>

      {/* aria-live region for drag/keyboard announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="dnd-announcement"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
      >
        {announcement}
      </div>

      {/* ── Expired-token reconnect banner (#222) ── */}
      <ExpiredTokenBanner
        sources={sources}
        onReconnect={handleReconnect}
        dismissedIds={dismissedBannerIds}
        onDismiss={handleBannerDismiss}
      />

      {sources.length === 0 ? (
        <section
          aria-label={intl.formatMessage({ id: 'revenueSources.aria.emptyState' })}
          style={{
            marginTop: '2rem',
            padding: '1.5rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <EmptyStateIllustration type="revenue-sources" />
          <p style={{ margin: '0.5rem 0 1rem', color: 'var(--muted)' }}>
            {intl.formatMessage({ id: 'revenueSources.empty.message' })}
          </p>
          <Link
            to="/connect-source/provider"
            className="app-button app-button-primary"
            style={{ display: 'inline-flex', textDecoration: 'none' }}
          >
            {intl.formatMessage({ id: 'revenueSources.empty.connectSource' })}
          </Link>
        </section>
      ) : (
        <ul
          aria-label={intl.formatMessage({ id: 'revenueSources.aria.list' })}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerMove={handlePointerMove}
          style={{ listStyle: 'none', margin: '2rem 0 0', padding: 0, display: 'grid', gap: '0.75rem' }}
        >
          {sources.map((source, index) => (
            <SourceRow
              key={source.id}
              source={source}
              index={index}
              totalCount={sources.length}
              isGrabbed={grabbedIndex === index}
              isDropTarget={dropTargetIndex === index && grabbedIndex !== null && grabbedIndex !== index}
              onReconnect={handleReconnect}
              onDisconnect={handleDisconnectRequest}
              onPointerDown={handlePointerDown(index)}
              onPointerEnter={handlePointerEnter(index)}
              onKeyDown={handleKeyDown}
              onHandleClick={() => handleKeyboardGrab(index)}
              onMoveUp={() => moveUp(index)}
              onMoveDown={() => moveDown(index)}
            />
          ))}
        </ul>
      )}

      {pendingDisconnect && (
        <ConfirmDialog
          source={pendingDisconnect}
          onConfirm={handleDisconnectConfirm}
          onCancel={() => setPendingDisconnect(null)}
        />
      )}
    </div>
  )
}
