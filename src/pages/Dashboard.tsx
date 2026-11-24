import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIntl } from 'react-intl'
import AttestationConfirmModal from '../components/AttestationConfirmModal'
import UsageMeter from '../components/UsageMeter'
import StaleDataChip from '../components/StaleDataChip'
import { useViewportObserver } from '../hooks/useViewportObserver'
import { useToast } from '../components/ToastContext'
import { useAttestations } from '../state/attestations'
import { DEFAULT_TRIGGER_DETAILS } from '../state/attestationMocks'

// Demo usage data — swap for real API values in production
const USAGE_DATA = [
  {
    labelId: 'dashboard.usage.attestations',
    used: 9,
    limit: 10,
    unit: 'attestations',
    period: 'July 2026',
  },
  {
    labelId: 'dashboard.usage.apiCalls',
    used: 7_520,
    limit: 10_000,
    unit: 'calls',
    period: 'July 2026',
  },
]

export const STALE_DATA_THRESHOLD_MS = 5 * 60 * 1000

export function isAttestationDataStale(lastUpdated: string, now = Date.now()) {
  const updatedAt = Date.parse(lastUpdated)
  return Number.isFinite(updatedAt) && now - updatedAt >= STALE_DATA_THRESHOLD_MS
}

export default function Dashboard() {
  const intl = useIntl()
  const [modalOpen, setModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [attestError, setAttestError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const { trigger, lastUpdated, refresh } = useAttestations()
  const { addToast } = useToast()

  const METRICS = [
    { label: intl.formatMessage({ id: 'dashboard.metrics.totalRevenue' }), value: '$84,320', sub: intl.formatMessage({ id: 'dashboard.metrics.ytd' }) },
    { label: intl.formatMessage({ id: 'dashboard.metrics.attestations' }), value: '12', sub: intl.formatMessage({ id: 'dashboard.metrics.thisMonth' }) },
    { label: intl.formatMessage({ id: 'dashboard.metrics.revenueSources' }), value: '3', sub: intl.formatMessage({ id: 'dashboard.metrics.connected' }) },
  ]

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30 * 1000)
    return () => window.clearInterval(interval)
  }, [])

  const isStale = isAttestationDataStale(lastUpdated, now)

  function handleRefresh() {
    refresh()
    setNow(Date.now())
  }

  // Entrance animation observers — one per metric card
  const { ref: revenueRef, isVisible: revenueVisible } = useViewportObserver<HTMLDivElement>()
  const { ref: attestationsRef, isVisible: attestationsVisible } = useViewportObserver<HTMLDivElement>()
  const { ref: sourcesRef, isVisible: sourcesVisible } = useViewportObserver<HTMLDivElement>()
  const { ref: usageSectionRef, isVisible: usageVisible } = useViewportObserver<HTMLDivElement>({ threshold: 0.05 })
  const { ref: actionsRef, isVisible: actionsVisible } = useViewportObserver<HTMLDivElement>()

  async function handleConfirm() {
    setIsLoading(true)
    setAttestError(null)
    try {
      await trigger(DEFAULT_TRIGGER_DETAILS)
      addToast(intl.formatMessage({ id: 'dashboard.toast.attestationSubmitted' }), 'success')
      setModalOpen(false)
    } catch (err) {
      setAttestError(err instanceof Error ? err.message : intl.formatMessage({ id: 'dashboard.toast.attestationFailed' }))
    } finally {
      setIsLoading(false)
    }
  }

  function handleClose() {
    setModalOpen(false)
    setAttestError(null)
  }

  return (
    <div className="dashboard-page">
      <h1 style={{ marginTop: 0 }}>{intl.formatMessage({ id: 'dashboard.title' })}</h1>
      <p style={{ color: 'var(--muted)' }}>
        {intl.formatMessage({ id: 'dashboard.subtitle' })} {intl.formatMessage({ id: 'dashboard.demoNote' })}
      </p>
      <div className="dashboard-data-status" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        {isStale && <StaleDataChip fetchedAt={lastUpdated} />}
        <button type="button" className="dashboard-action-btn" onClick={handleRefresh}>
          {intl.formatMessage({ id: 'dashboard.refreshData' })}
        </button>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-section">
          <h2>{intl.formatMessage({ id: 'dashboard.metrics.title' })}</h2>
          <div className="dashboard-metrics-grid">
            {METRICS.map((m, i) => {
              const refs = [revenueRef, attestationsRef, sourcesRef]
              const visibles = [revenueVisible, attestationsVisible, sourcesVisible]
              const metricRef = refs[i] ?? refs[0]
              const isVisible = visibles[i] ?? false
              return (
                <div
                  key={m.label}
                  ref={metricRef}
                  className={`dashboard-metric-card chart-entrance chart-entrance-bar-grow${isVisible ? ' chart-entrance-animate' : ''}`}
                  style={{
                    transitionDelay: `${i * 60}ms`,
                    animationDelay: `${i * 60}ms`,
                    willChange: isVisible ? undefined : 'opacity, transform',
                  }}
                >
                  <span className="dashboard-metric-label">{m.label}</span>
                  <span className="dashboard-metric-value">{m.value}</span>
                  <span className="dashboard-metric-sub">{m.sub}</span>
                </div>
              )
            })}
          </div>
        </section>

        <section
          className={`dashboard-section${actionsVisible ? ' chart-entrance chart-entrance-animate' : ' chart-entrance'}`}
          ref={actionsRef}
        >
          <h2>{intl.formatMessage({ id: 'dashboard.quickActions.title' })}</h2>
          <ul className="dashboard-actions-list">
            <li>
              <Link to="/connect-source/provider" aria-label={intl.formatMessage({ id: 'dashboard.quickActions.connectSourceAriaLabel' })}>
                {intl.formatMessage({ id: 'dashboard.quickActions.connectSource' })}
              </Link>
            </li>
            <li>
              <button
                type="button"
                className="dashboard-action-btn"
                onClick={() => setModalOpen(true)}
              >
                {intl.formatMessage({ id: 'dashboard.quickActions.report' })}
              </button>
            </li>
            <li><Link to="/attestations">{intl.formatMessage({ id: 'dashboard.quickActions.attestationHistory' })}</Link></li>
          </ul>
        </section>

        <section
          className={`dashboard-section chart-entrance chart-entrance-line-draw${usageVisible ? ' chart-entrance-animate' : ''}`}
          ref={usageSectionRef}
          aria-labelledby="usage-heading"
        >
          <h2 id="usage-heading">{intl.formatMessage({ id: 'dashboard.usageThisMonth' })}</h2>
          <div style={{ display: 'grid', gap: '1rem' }}>
            {USAGE_DATA.map((u) => (
              <UsageMeter
                key={u.labelId}
                label={intl.formatMessage({ id: u.labelId })}
                used={u.used}
                limit={u.limit}
                unit={u.unit}
                period={u.period}
              />
            ))}
          </div>
        </section>
      </div>

      <AttestationConfirmModal
        open={modalOpen}
        onClose={handleClose}
        onConfirm={handleConfirm}
        isLoading={isLoading}
        error={attestError}
        details={DEFAULT_TRIGGER_DETAILS}
      />
    </div>
  )
}
