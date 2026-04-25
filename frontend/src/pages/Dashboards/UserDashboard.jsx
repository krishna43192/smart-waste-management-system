import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router-dom'
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider, Drawer, IconButton, Stack, Tooltip, Typography, useMediaQuery, useTheme, } from '@mui/material'
import { CalendarClock, ChevronLeft, ChevronRight, History, Menu, RefreshCcw, Wallet, X, } from 'lucide-react'
import BillingPage from '../Billing/BillingPage.jsx'

// Static navigation model for the end-user dashboard sections.
const dashboardSections = Object.freeze([
  { id: 'billing', label: 'Billing & payments', icon: Wallet, description: 'Manage invoices and receipts' },
  { id: 'schedule-upcoming', label: 'Upcoming pickups', icon: CalendarClock, description: 'Confirmed collection slots' },
  { id: 'schedule-history', label: 'Pickup history', icon: History, description: 'Completed and cancelled requests' },
])

// Map request statuses to colour tokens for MUI components.
const statusColorMap = {
  scheduled: 'success',
  cancelled: 'default',
  'pending-payment': 'warning',
  'payment-failed': 'error',
}

const paymentStatusColorMap = {
  success: 'success',
  pending: 'warning',
  failed: 'error',
  'not-required': 'default',
}

function titleCase(value = '') {
  return value
    .split(/\s|-/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

// Defensive helper to parse optional JSON bodies coming from the API.
async function readJson(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch (error) {
    console.warn('Failed to parse response JSON', error)
    return {}
  }
}

function formatItemLabel(itemType, labelMap) {
  if (!itemType) return 'Special pickup'
  return labelMap[itemType] || titleCase(itemType)
}

function formatSlotWindow(slot) {
  if (!slot?.start) return 'Awaiting slot assignment'
  const start = new Date(slot.start)
  const end = slot.end ? new Date(slot.end) : null
  const datePart = start.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const timeOptions = { hour: '2-digit', minute: '2-digit' }
  const startTime = start.toLocaleTimeString('en-GB', timeOptions)
  const endTime = end ? end.toLocaleTimeString('en-GB', timeOptions) : null
  return endTime ? `${datePart} • ${startTime} – ${endTime}` : `${datePart} • ${startTime}`
}

function formatDate(date) {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatStatusLabel(status) {
  if (!status) return 'Unknown'
  return titleCase(status.replace(/-/g, ' '))
}

// Cache per-currency Intl.NumberFormat instances for summary widgets.
const CURRENCY_FORMATTERS = new Map()

function getCurrencyFormatter(currency) {
  const code = currency?.toUpperCase() || 'INR'
  if (!CURRENCY_FORMATTERS.has(code)) {
    CURRENCY_FORMATTERS.set(
      code,
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 2,
      }),
    )
  }
  return CURRENCY_FORMATTERS.get(code)
}

function formatCurrency(amount, currency = 'INR') {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return null
  try {
    return getCurrencyFormatter(currency).format(amount)
  } catch (error) {
    console.warn('Failed to format amount', error)
    return `${currency} ${amount.toFixed(2)}`
  }
}

// Aggregate special collection scheduling data for the dashboard widgets.
function useSchedulingData(session) {
  const [requests, setRequests] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const userId = session?.id || session?._id
    if (!userId) {
      setRequests([])
      setConfig(null)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const [configResponse, requestsResponse] = await Promise.all([
        fetch('/api/schedules/special/config'),
        fetch(`/api/schedules/special/my?userId=${encodeURIComponent(userId)}`),
      ])

      const configPayload = await readJson(configResponse)
      if (!configResponse.ok || configPayload?.ok === false) {
        throw new Error(configPayload?.message || 'Unable to load scheduling configuration')
      }

      const requestsPayload = await readJson(requestsResponse)
      if (!requestsResponse.ok || requestsPayload?.ok === false) {
        throw new Error(requestsPayload?.message || 'Unable to load scheduling records')
      }

      setConfig(configPayload)
      setRequests(Array.isArray(requestsPayload.requests) ? requestsPayload.requests : [])
    } catch (err) {
      console.warn('Failed to load scheduling data', err)
      setError(err.message || 'Unable to fetch scheduling data')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [session?.id, session?._id])

  useEffect(() => {
    load()
  }, [load])

  const itemLabelMap = useMemo(() => {
    if (!config?.items) return {}
    return config.items.reduce((acc, item) => {
      acc[item.id] = item.label
      return acc
    }, {})
  }, [config])

  return {
    requests,
    itemLabelMap,
    loading,
    error,
    refresh: load,
  }
}

const NAV_WIDTH_EXPANDED = 280
const NAV_WIDTH_COLLAPSED = 96
const NAV_TOP_OFFSET = 104

// Renders the left-hand navigation rail and handles section switching.
function NavigationItems({ collapsed, activeSection, onNavigate, onClose, isDesktop }) {
  return (
    <Stack spacing={1}>
      {dashboardSections.map(section => {
        const Icon = section.icon
        const isActive = activeSection === section.id

        const item = (
          <button
            type="button"
            onClick={() => {
              onNavigate(section.id)
              onClose?.()
            }}
            className={`group flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
              collapsed ? 'justify-center px-2' : ''
            } ${
              isActive
                ? 'bg-brand-500/20 text-brand-700 shadow-sm'
                : 'text-slate-600 hover:bg-slate-100/70'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 text-brand-600" />
            {!collapsed && (
              <span className="flex flex-col">
                <span className="font-semibold">{section.label}</span>
                <span className="text-xs text-slate-500">{section.description}</span>
              </span>
            )}
          </button>
        )

        if (!isDesktop) {
          return (
            <Box key={section.id}>{item}</Box>
          )
        }

        return (
          <Tooltip
            key={section.id}
            title={section.label}
            placement="right"
            arrow
            disableHoverListener={!collapsed}
            disableFocusListener={!collapsed}
            disableTouchListener={!collapsed}
          >
            <span className="inline-flex w-full">{item}</span>
          </Tooltip>
        )
      })}
    </Stack>
  )
}

NavigationItems.propTypes = {
  collapsed: PropTypes.bool,
  activeSection: PropTypes.string.isRequired,
  onNavigate: PropTypes.func.isRequired,
  onClose: PropTypes.func,
  isDesktop: PropTypes.bool,
}

NavigationItems.defaultProps = {
  collapsed: false,
  onClose: undefined,
  isDesktop: false,
}

function DashboardSideNav({ collapsed, onToggle, activeSection, onNavigate }) {
  const width = collapsed ? NAV_WIDTH_COLLAPSED : NAV_WIDTH_EXPANDED

  return (
    <Box
      sx={{
        width,
        flexShrink: 0,
        transition: 'width 0.25s ease',
        alignSelf: 'flex-start',
      }}
    >
      <div className="glass-panel flex flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/95 p-4 shadow-md">
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          {!collapsed && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" fontWeight={600}>
                Dashboard sections
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Switch between your key views
              </Typography>
            </Stack>
          )}
          <IconButton
            onClick={onToggle}
            size="small"
            aria-label={collapsed ? 'Expand dashboard navigation' : 'Collapse dashboard navigation'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </IconButton>
        </Stack>

        <NavigationItems
          collapsed={collapsed}
          activeSection={activeSection}
          onNavigate={onNavigate}
          isDesktop
        />
      </div>
    </Box>
  )
}

DashboardSideNav.propTypes = {
  collapsed: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  activeSection: PropTypes.string.isRequired,
  onNavigate: PropTypes.func.isRequired,
}

function MobileNavigationDrawer({ open, onClose, activeSection, onNavigate }) {
  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: '85vw', sm: 360 },
          borderRadius: '0 24px 24px 0',
          borderRight: '1px solid rgba(148, 163, 184, 0.35)',
          bgcolor: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(14px)',
        },
      }}
    >
      <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3, height: '100%' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle1" fontWeight={600}>
            Dashboard sections
          </Typography>
          <IconButton onClick={onClose} size="small" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </IconButton>
        </Stack>

        <NavigationItems
          collapsed={false}
          activeSection={activeSection}
          onNavigate={onNavigate}
          onClose={onClose}
          isDesktop={false}
        />
      </Box>
    </Drawer>
  )
}

MobileNavigationDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  activeSection: PropTypes.string.isRequired,
  onNavigate: PropTypes.func.isRequired,
}

function RequestCard({ request, itemLabelMap, variant = 'default' }) {
  const itemLabel = formatItemLabel(request.itemType, itemLabelMap)
  const slotLabel = formatSlotWindow(request.slot)
  const statusLabel = formatStatusLabel(request.status)
  const statusColor = statusColorMap[request.status] || 'default'
  const paymentStatus = request.paymentStatus || (request.paymentRequired ? 'pending' : 'not-required')
  const paymentLabel = (() => {
    if (paymentStatus === 'pending') return 'Payment pending'
    if (paymentStatus === 'success') return 'Payment received'
    if (paymentStatus === 'failed') return 'Payment failed'
    if (paymentStatus === 'not-required') return 'No payment required'
    return formatStatusLabel(paymentStatus)
  })()
  const paymentColor = paymentStatusColorMap[paymentStatus] || 'default'
  const amountLabel = request.paymentAmount > 0
    ? formatCurrency(request.paymentAmount, request.currency || request.paymentCurrency || 'INR')
    : null

  const hideStatusChip = variant === 'billing' && request.status === 'pending-payment' && paymentStatus === 'pending'

  const cardClass = (() => {
    if (variant === 'upcoming') return 'border-brand-200/70 bg-emerald-50/40'
    if (variant === 'billing') return 'border-brand-200/60 bg-white'
    return 'border-slate-200/70 bg-white/95'
  })()

  return (
    <Box className={`rounded-2xl border px-4 py-3 transition ${cardClass}`}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
        <Stack spacing={0.75}>
          <Typography variant="subtitle1" fontWeight={600}>
            {itemLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quantity: {request.quantity}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Requested on {formatDate(request.createdAt)}
          </Typography>
        </Stack>
        <Stack spacing={1} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
          <Typography variant="body2" color="text.secondary">
            {slotLabel}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
            {!hideStatusChip && (
              <Chip label={statusLabel} color={statusColor} size="small" variant={statusColor === 'success' ? 'filled' : 'outlined'} />
            )}
            <Chip label={paymentLabel} color={paymentColor} size="small" variant="outlined" />
            {amountLabel && (
              <Chip label={amountLabel} color="info" size="small" variant="outlined" />
            )}
          </Stack>
        </Stack>
      </Stack>
    </Box>
  )
}

RequestCard.propTypes = {
  request: PropTypes.shape({
    _id: PropTypes.string,
    id: PropTypes.string,
    itemType: PropTypes.string,
    slot: PropTypes.shape({
      start: PropTypes.string,
      end: PropTypes.string,
    }),
    status: PropTypes.string,
    paymentStatus: PropTypes.string,
    paymentRequired: PropTypes.bool,
    paymentAmount: PropTypes.number,
    currency: PropTypes.string,
    paymentCurrency: PropTypes.string,
    quantity: PropTypes.number,
    createdAt: PropTypes.string,
  }).isRequired,
  itemLabelMap: PropTypes.objectOf(PropTypes.string).isRequired,
  variant: PropTypes.oneOf(['default', 'upcoming', 'billing']),
}

RequestCard.defaultProps = {
  variant: 'default',
}

function BillingSection({ session, requests, itemLabelMap, loading, error, onRefresh }) {
  const schedulePayments = useMemo(() => requests.filter(req => req.paymentAmount > 0), [requests])
  const outstandingPayments = useMemo(
    () => schedulePayments.filter(req => req.paymentStatus !== 'success'),
    [schedulePayments],
  )
  const settledPayments = useMemo(
    () => schedulePayments.filter(req => req.paymentStatus === 'success'),
    [schedulePayments],
  )

  const outstandingTotal = useMemo(
    () => outstandingPayments.reduce((sum, req) => sum + (req.paymentAmount || 0), 0),
    [outstandingPayments],
  )
  const settledTotal = useMemo(
    () => settledPayments.reduce((sum, req) => sum + (req.paymentAmount || 0), 0),
    [settledPayments],
  )

  const summaryItems = [
    {
      label: 'Outstanding schedule payments',
      value: outstandingTotal ? formatCurrency(outstandingTotal) : '—',
      helper: `${outstandingPayments.length} request${outstandingPayments.length === 1 ? '' : 's'}`,
      color: 'warning',
    },
    {
      label: 'Total paid via scheduling',
      value: settledTotal ? formatCurrency(settledTotal) : '—',
      helper: `${settledPayments.length} payment${settledPayments.length === 1 ? '' : 's'}`,
      color: 'success',
    },
  ]

  return (
    <section className="space-y-5">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Wallet className="h-5 w-5 text-emerald-300" />
            <Typography variant="h6" fontWeight={600} color="white">
              Billing & payments
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: 'rgba(209, 250, 229, 0.8)' }}>
            Track municipal invoices and payments tied to your special collection requests.
          </Typography>
        </Stack>
        <Tooltip title="Refresh scheduling data" placement="left">
          <span>
            <IconButton onClick={onRefresh} size="small" disabled={loading} sx={{ color: 'white' }}>
              <RefreshCcw className="h-4 w-4" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Card className="glass-panel rounded-4xl border border-slate-200/70 bg-white/95 shadow-md">
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} justifyContent="space-between">
            {summaryItems.map(item => (
              <Box key={item.label} className="rounded-3xl border border-slate-200/60 bg-slate-50/70 px-5 py-4">
                <Typography variant="subtitle2" color="text.secondary">
                  {item.label}
                </Typography>
                <Typography variant="h5" fontWeight={600} mt={0.75}>
                  {item.value}
                </Typography>
                <Typography variant="caption" color={item.color === 'success' ? 'success.main' : 'warning.main'}>
                  {item.helper}
                </Typography>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>

      {error && (
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={onRefresh}>
            Retry
          </Button>
        }>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={4}>
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={600}>
              Schedule payments awaiting collection
            </Typography>
            {outstandingPayments.length ? (
              <Stack spacing={2.5}>
                {outstandingPayments.map(request => {
                  const key = request._id || request.id
                  return <RequestCard key={key} request={request} itemLabelMap={itemLabelMap} variant="billing" />
                })}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No pending schedule payments right now. New requests that require payment will appear here.
              </Typography>
            )}
          </Stack>

          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={600}>
              Completed schedule payments
            </Typography>
            {settledPayments.length ? (
              <Stack spacing={2.5}>
                {settledPayments.map(request => {
                  const key = request._id || request.id
                  return <RequestCard key={key} request={request} itemLabelMap={itemLabelMap} variant="billing" />
                })}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No completed payments have been recorded yet.
              </Typography>
            )}
          </Stack>

          <Divider textAlign="left">Municipal invoices</Divider>

          <BillingPage session={session} variant="embedded" />
        </Stack>
      )}
    </section>
  )
}

BillingSection.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
  }),
  requests: PropTypes.arrayOf(PropTypes.object).isRequired,
  itemLabelMap: PropTypes.objectOf(PropTypes.string).isRequired,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  onRefresh: PropTypes.func.isRequired,
}

BillingSection.defaultProps = {
  session: null,
  error: null,
}

function UpcomingSection({ upcoming, itemLabelMap, loading, error, onRefresh }) {
  return (
    <section className="space-y-5">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={2} alignItems="center">
            <CalendarClock className="h-5 w-5 text-emerald-300" />
            <Typography variant="h6" fontWeight={600} color="white">
              Upcoming pickups
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: 'rgba(209, 250, 229, 0.8)' }}>
            Confirmed special collections that are scheduled for future slots.
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Refresh scheduling data" placement="left">
            <span>
              <IconButton onClick={onRefresh} size="small" disabled={loading} sx={{ color: 'white' }}>
                <RefreshCcw className="h-4 w-4" />
              </IconButton>
            </span>
          </Tooltip>
          <Button variant="contained" component={Link} to="/schedule">
            Schedule pickup
          </Button>
        </Stack>
      </Stack>

      <Card className="glass-panel rounded-4xl border border-slate-200/70 bg-white/95 shadow-md">
        <CardContent>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }} action={
              <Button color="inherit" size="small" onClick={onRefresh}>
                Retry
              </Button>
            }>
              {error}
            </Alert>
          )}

          {loading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : upcoming.length ? (
            <Stack spacing={2.5}>
              {upcoming.map(request => {
                const key = request._id || request.id
                return <RequestCard key={key} request={request} itemLabelMap={itemLabelMap} variant="upcoming" />
              })}
            </Stack>
          ) : (
            <Box className="rounded-3xl border border-dashed border-slate-200/80 bg-slate-50/60 px-6 py-8 text-center">
              <Typography variant="subtitle1" fontWeight={600}>
                No upcoming pickups
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={1.5}>
                When you schedule a special collection, it will appear here with its assigned slot and payment status.
              </Typography>
              <Button variant="contained" component={Link} to="/schedule" sx={{ mt: 3 }}>
                Book a special pickup
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

UpcomingSection.propTypes = {
  upcoming: PropTypes.arrayOf(PropTypes.object).isRequired,
  itemLabelMap: PropTypes.objectOf(PropTypes.string).isRequired,
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  onRefresh: PropTypes.func.isRequired,
}

UpcomingSection.defaultProps = {
  error: null,
}

function HistorySection({ history, itemLabelMap, loading, onRefresh }) {
  return (
    <section className="space-y-5">
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={2} alignItems="center">
            <History className="h-5 w-5 text-emerald-300" />
            <Typography variant="h6" fontWeight={600} color="white">
              Pickup history
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: 'rgba(209, 250, 229, 0.8)' }}>
            Completed, cancelled, and payment-pending requests from your account.
          </Typography>
        </Stack>
        <Tooltip title="Refresh scheduling data" placement="left">
          <span>
            <IconButton onClick={onRefresh} size="small" disabled={loading} sx={{ color: 'white' }}>
              <RefreshCcw className="h-4 w-4" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Card className="glass-panel rounded-4xl border border-slate-200/70 bg-white/95 shadow-md">
        <CardContent>
          {loading && history.length === 0 ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : history.length ? (
            <Stack spacing={2.5}>
              {history.map(request => {
                const key = request._id || request.id
                return <RequestCard key={key} request={request} itemLabelMap={itemLabelMap} />
              })}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No pickup history recorded yet. Schedule a collection to see it logged here for your records.
            </Typography>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

HistorySection.propTypes = {
  history: PropTypes.arrayOf(PropTypes.object).isRequired,
  itemLabelMap: PropTypes.objectOf(PropTypes.string).isRequired,
  loading: PropTypes.bool.isRequired,
  onRefresh: PropTypes.func.isRequired,
}

// Composes billing, scheduling, and navigation panes for citizen users.
export default function UserDashboard({ session = null }) {
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'))
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('billing')

  const { requests, itemLabelMap, loading, error, refresh } = useSchedulingData(session)

  const { upcoming, history } = useMemo(() => {
    const now = new Date()
    const upcomingRequests = []
    const historyRequests = []

    requests.forEach(request => {
      const slotStart = request.slot?.start ? new Date(request.slot.start) : null
      const isUpcoming = request.status === 'scheduled' && slotStart && slotStart >= now
      if (isUpcoming) {
        upcomingRequests.push(request)
      } else {
        historyRequests.push(request)
      }
    })

    upcomingRequests.sort((a, b) => new Date(a.slot.start) - new Date(b.slot.start))
    historyRequests.sort((a, b) => {
      const aTime = a.slot?.start ? new Date(a.slot.start).getTime() : new Date(a.createdAt).getTime()
      const bTime = b.slot?.start ? new Date(b.slot.start).getTime() : new Date(b.createdAt).getTime()
      return bTime - aTime
    })

    return { upcoming: upcomingRequests, history: historyRequests }
  }, [requests])

  useEffect(() => {
    if (isDesktop) {
      setMobileNavOpen(false)
    }
  }, [isDesktop])

  const handleToggleNav = useCallback(() => {
    setNavCollapsed(prev => !prev)
  }, [])

  const handleOpenMobileNav = useCallback(() => {
    setMobileNavOpen(true)
  }, [])

  const handleCloseMobileNav = useCallback(() => {
    setMobileNavOpen(false)
  }, [])

  const handleNavigate = useCallback(sectionId => {
    setActiveSection(sectionId)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [])

  const sectionProps = useMemo(() => ({
    billing: {
      session,
      requests,
      itemLabelMap,
      loading,
      error,
      onRefresh: refresh,
    },
    'schedule-upcoming': {
      upcoming,
      itemLabelMap,
      loading,
      error,
      onRefresh: refresh,
    },
    'schedule-history': {
      history,
      itemLabelMap,
      loading,
      onRefresh: refresh,
    },
  }), [session, requests, itemLabelMap, loading, error, refresh, upcoming, history])

  const ActiveSectionComponent = useMemo(() => {
    if (activeSection === 'schedule-upcoming') return UpcomingSection
    if (activeSection === 'schedule-history') return HistorySection
    return BillingSection
  }, [activeSection])

  return (
    <div className="min-h-screen -mt-6" style={{ background: '#f0f4f8' }}>
      {/* ── Hero header ─────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #047857 60%, #065f46 100%)',
          paddingBottom: 100,
        }}
        className="px-6 pt-12"
      >
        <div style={{ position: 'relative', maxWidth: 1240, margin: '0 auto' }}>
          <div style={{ position: 'absolute', top: -30, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -10, left: -50, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-200 backdrop-blur-sm mb-5">
            <Wallet className="h-3.5 w-3.5" />
            User dashboard
          </div>

          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">
            {session?.name ? `Welcome back, ${session.name}` : 'Welcome to your dashboard'}
          </h1>
          <p className="text-emerald-100/80 text-base mb-6 max-w-2xl">
            Use the navigation to move between billing, upcoming pickups, and your scheduling history.
          </p>
        </div>
      </div>

      <Box
        sx={{
          mx: 'auto',
          width: '100%',
          maxWidth: 1240,
          px: { xs: 2, sm: 3, md: 4 },
          mt: '-64px',
          pb: 8
        }}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={{ xs: 4, lg: 6 }}
          alignItems="flex-start"
        >
          {isDesktop && (
            <DashboardSideNav
              collapsed={navCollapsed}
              onToggle={handleToggleNav}
              activeSection={activeSection}
              onNavigate={handleNavigate}
            />
          )}

          <Box sx={{ flexGrow: 1, width: '100%' }}>
            {!isDesktop && (
              <Box
                className="glass-panel"
                sx={{
                  mb: 3,
                  borderRadius: '28px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  backgroundColor: 'rgba(255,255,255,0.94)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 3,
                  py: 2.5,
                  boxShadow: '0px 24px 48px -28px rgba(15,23,42,0.35)',
                }}
              >
                <Typography variant="subtitle2" fontWeight={600}>
                  Dashboard sections
                </Typography>
                <IconButton onClick={handleOpenMobileNav} size="small" aria-label="Open navigation menu">
                  <Menu className="h-5 w-5" />
                </IconButton>
              </Box>
            )}

            <Stack spacing={4}>
              <ActiveSectionComponent {...sectionProps[activeSection]} />
            </Stack>
          </Box>
        </Stack>
      </Box>

      <MobileNavigationDrawer
        open={mobileNavOpen}
        onClose={handleCloseMobileNav}
        activeSection={activeSection}
        onNavigate={handleNavigate}
      />
    </div>
  )
}

UserDashboard.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
    name: PropTypes.string,
    role: PropTypes.string,
  }),
}
