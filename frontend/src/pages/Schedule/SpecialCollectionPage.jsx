import { CalendarClock, CheckCircle2, Clock3, Info, MailCheck, RefreshCcw, Truck, Check } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, FormControl, Grid, IconButton, InputLabel, MenuItem, Select, Stack, TextField, Typography, Stepper, Step, StepLabel, Tooltip, } from '@mui/material'
import dayjs from 'dayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import { DigitalClock } from '@mui/x-date-pickers/DigitalClock'

import { useNavigate } from 'react-router-dom'
import ConfirmationIllustration from '../../assets/Confirmation.png'
import { QRCodeSVG } from 'qrcode.react'

const initialFormState = {
  residentName: '',
  ownerName: '',
  address: '',
  district: '',
  email: '',
  phone: '',
  itemType: '',
  preferredDate: '',
  preferredTime: '',
  approxWeight: '',
  quantity: 1,
  specialNotes: '',
}

const REQUEST_STATUSES = {
  scheduled: { label: 'Scheduled', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'default' },
  'pending-payment': { label: 'Pending payment', color: 'warning' },
  'payment-failed': { label: 'Payment failed', color: 'error' },
}

const PAYMENT_STATUSES = {
  success: { label: 'Payment success', color: 'success' },
  pending: { label: 'Payment pending', color: 'warning' },
  failed: { label: 'Payment failed', color: 'error' },
  'not-required': { label: 'No payment required', color: 'default' },
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const TAX_RATE_PERCENT = 18

function formatCurrency(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return currencyFormatter.format(0)
  return currencyFormatter.format(value)
}

function toLocalDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function combineDateAndTime(date, time) {
  if (!date || !time) return ''
  return `${date}T${time}`
}

function serializeDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}

function formatRequestTimestamp(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatSlotRange(slot) {
  if (!slot?.start) return 'Awaiting assignment'
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    const start = formatter.format(new Date(slot.start))
    const end = slot.end ? formatter.format(new Date(slot.end)) : null
    return end ? `${start} → ${end}` : start
  } catch {
    return 'Awaiting assignment'
  }
}

function getSessionId(session) {
  return session?.id || session?._id || ''
}

async function safeJson(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    console.warn('Failed to parse JSON payload', error)
    return null
  }
}

function useSpecialCollectionConfig() {
  const [state, setState] = useState({ loading: true, error: null, items: [], slotConfig: null })

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      try {
        const response = await fetch('/api/schedules/special/config')
        const payload = await safeJson(response)
        if (cancelled) return

        if (!response.ok || payload?.ok === false) {
          throw new Error(payload?.message || 'Unable to load scheduling configuration')
        }

        setState({
          loading: false,
          error: null,
          items: payload?.items ?? [],
          slotConfig: payload?.slotConfig ?? null,
        })
      } catch (error) {
        if (!cancelled) {
          setState({ loading: false, error: error.message, items: [], slotConfig: null })
        }
      }
    }

    loadConfig()
    return () => { cancelled = true }
  }, [])

  return state
}

function useResidentRequests(sessionId, onSessionInvalid) {
  const [state, setState] = useState({ loading: false, error: null, requests: [] })

  const load = useCallback(async () => {
    if (!sessionId) {
      setState({ loading: false, error: null, requests: [] })
      return
    }

    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const response = await fetch(`/api/schedules/special/my?userId=${encodeURIComponent(sessionId)}`)
      const payload = await safeJson(response)

      if (!response.ok || payload?.ok === false) {
        const message = payload?.message || 'Unable to load your scheduled pickups'
        if (response.status === 403 || response.status === 404) {
          onSessionInvalid?.(message)
          return
        }
        throw new Error(message)
      }

      setState({ loading: false, error: null, requests: payload?.requests ?? [] })
    } catch (error) {
      setState(prev => ({ ...prev, loading: false, error: error.message, requests: [] }))
    }
  }, [sessionId, onSessionInvalid])

  useEffect(() => { load() }, [load])

  return { ...state, refresh: load }
}

function RequestForm({
  form, allowedItems, selectedPolicy, onChange, onSubmit, availabilityLoading,
  isAuthenticated, onRequireAuth, errors, touched, onBlur, onReset, isFormValid, slotConfig,
}) {
  const dateValue = useMemo(() => (form.preferredDate ? dayjs(form.preferredDate) : null), [form.preferredDate])
  const timeValue = useMemo(() => (form.preferredTime ? dayjs(`1970-01-01T${form.preferredTime}`) : null), [form.preferredTime])

  const handleDateChange = useCallback((newValue) => {
    const formatted = newValue && newValue.isValid() ? newValue.format('YYYY-MM-DD') : ''
    onChange({ target: { name: 'preferredDate', value: formatted } })
  }, [onChange])

  const handleTimeChange = useCallback((newValue) => {
    const formatted = newValue && newValue.isValid() ? newValue.format('HH:mm') : ''
    onChange({ target: { name: 'preferredTime', value: formatted } })
  }, [onChange])

  const pickerBoxSx = { border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1, minHeight: 340, display: 'flex', alignItems: 'center', justifyContent: 'center' }

  const maxDaysAhead = slotConfig?.daysAhead ?? 30
  const disableWeekends = Boolean(slotConfig?.disableWeekends)
  const hoursStart = slotConfig?.hours?.start ?? '08:00'
  const hoursEnd = slotConfig?.hours?.end ?? '18:00'
  const minDate = dayjs().startOf('day')
  const maxDate = dayjs().add(maxDaysAhead, 'day')
  const minTime = dayjs(`1970-01-01T${hoursStart}`)
  const maxTime = dayjs(`1970-01-01T${hoursEnd}`)

  const setQuickDate = useCallback((when) => {
    let d = dayjs().startOf('day')
    if (when === 'tomorrow') d = d.add(1, 'day')
    if (when === 'nextMon') {
      const daysUntilMon = (8 - d.day()) % 7 || 7
      d = d.add(daysUntilMon, 'day')
    }
    onChange({ target: { name: 'preferredDate', value: d.format('YYYY-MM-DD') } })
  }, [onChange])

  const setQuickTime = useCallback((hhmm) => {
    onChange({ target: { name: 'preferredTime', value: hhmm } })
  }, [onChange])

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
        <Stack component="form" spacing={4} onSubmit={onSubmit}>
          <Typography variant="h6" fontWeight={600}>Request details</Typography>
          <Box sx={{ px: { xs: 1.5, md: 1.5 } }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField label="Resident name" name="residentName" value={form.residentName} onChange={onChange} onBlur={onBlur} required fullWidth error={Boolean(touched.residentName && errors.residentName)} helperText={touched.residentName && errors.residentName} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Owner's name" name="ownerName" value={form.ownerName} onChange={onChange} onBlur={onBlur} required fullWidth error={Boolean(touched.ownerName && errors.ownerName)} helperText={touched.ownerName && errors.ownerName} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Email" name="email" type="email" value={form.email} onChange={onChange} onBlur={onBlur} required fullWidth error={Boolean(touched.email && errors.email)} helperText={touched.email && errors.email} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="Phone" name="phone" value={form.phone} onChange={onChange} onBlur={onBlur} required fullWidth type="tel" inputProps={{ pattern: "[0-9+\\-()\\s]{10,}" }} error={Boolean(touched.phone && errors.phone)} helperText={touched.phone && errors.phone} />
              </Grid>
              <Grid item xs={12}>
                <TextField label="Address" name="address" value={form.address} onChange={onChange} onBlur={onBlur} required fullWidth multiline minRows={2} error={Boolean(touched.address && errors.address)} helperText={touched.address && errors.address} />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField label="District" name="district" value={form.district} onChange={onChange} onBlur={onBlur} required fullWidth error={Boolean(touched.district && errors.district)} helperText={touched.district && errors.district} />
              </Grid>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth required>
                  <InputLabel id="itemType-label">Item type</InputLabel>
                  <Select labelId="itemType-label" name="itemType" label="Item type" value={form.itemType} onChange={onChange} disabled={!allowedItems.length}>
                    {allowedItems.map(item => (
                      <MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField label="Approx. weight (kg per item)" name="approxWeight" type="number" value={form.approxWeight} onChange={onChange} onBlur={onBlur} inputProps={{ min: 0, step: 0.1 }} required fullWidth error={Boolean(touched.approxWeight && errors.approxWeight)} helperText={touched.approxWeight && errors.approxWeight} />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField label="Quantity" name="quantity" type="number" value={form.quantity} onChange={onChange} onBlur={onBlur} inputProps={{ min: 1 }} required fullWidth error={Boolean(touched.quantity && errors.quantity)} helperText={touched.quantity && errors.quantity} />
              </Grid>
              <Grid item xs={12} md={6}>
                <Stack spacing={1.25} sx={{ height: '100%' }}>
                  <Typography variant="subtitle2" sx={{ color: 'success.main', fontWeight: 700 }}>Set Date:</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip size="small" label="Today" onClick={() => setQuickDate('today')} variant="outlined" />
                    <Chip size="small" label="Tomorrow" onClick={() => setQuickDate('tomorrow')} variant="outlined" />
                    <Chip size="small" label="Next Mon" onClick={() => setQuickDate('nextMon')} variant="outlined" />
                  </Stack>
                  <Box sx={{ ...pickerBoxSx, flexGrow: 1 }}>
                    <DateCalendar value={dateValue} onChange={handleDateChange} disablePast minDate={minDate} maxDate={maxDate} shouldDisableDate={disableWeekends ? (d) => [0,6].includes(d.day()) : undefined} />
                  </Box>
                  {touched.preferredDate && errors.preferredDate ? (<Typography variant="caption" color="error.main">{errors.preferredDate}</Typography>) : null}
                </Stack>
              </Grid>
              <Grid item xs={12} md={6}>
                <Stack spacing={1.25} sx={{ height: '100%' }}>
                  <Typography variant="subtitle2" sx={{ color: 'success.main', fontWeight: 700 }}>Set Time:</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Chip size="small" label="9:00 AM" onClick={() => setQuickTime('09:00')} variant="outlined" />
                    <Chip size="small" label="10:00 AM" onClick={() => setQuickTime('10:00')} variant="outlined" />
                    <Chip size="small" label="1:00 PM" onClick={() => setQuickTime('13:00')} variant="outlined" />
                    <Chip size="small" label="3:00 PM" onClick={() => setQuickTime('15:00')} variant="outlined" />
                  </Stack>
                  <Box sx={{ ...pickerBoxSx, flexGrow: 1 }}>
                    <DigitalClock value={timeValue} onChange={handleTimeChange} ampm minutesStep={15} minTime={minTime} maxTime={maxTime} skipDisabled timeStep={30} />
                  </Box>
                  {touched.preferredTime && errors.preferredTime ? (<Typography variant="caption" color="error.main">{errors.preferredTime}</Typography>) : null}
                </Stack>
              </Grid>
              <Grid item xs={12}>
                <TextField label="Special handling notes" name="specialNotes" value={form.specialNotes} onChange={onChange} onBlur={onBlur} multiline minRows={3} fullWidth />
              </Grid>
            </Grid>
          </Box>

          {selectedPolicy?.description ? (
            <Alert severity="info" icon={<Info size={18} />}>{selectedPolicy.description}</Alert>
          ) : null}

          <Box sx={{ flexGrow: 1 }} />

          <Stack direction="row" flexWrap="wrap" spacing={2} alignItems="center">
            <Tooltip title={!isAuthenticated ? 'Please sign in to continue' : (!isFormValid ? 'Please complete required fields' : '')}>
              <span>
                <Button type="submit" variant="contained" disabled={!isAuthenticated || availabilityLoading || !isFormValid}>
                  {availabilityLoading ? 'Checking…' : 'Check availability'}
                </Button>
              </span>
            </Tooltip>
            {!isAuthenticated && (
              <Button variant="outlined" onClick={onRequireAuth}>Sign in to continue</Button>
            )}
            <Button variant="text" color="inherit" onClick={onReset} disabled={availabilityLoading}>Reset form</Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

function AvailabilitySection({ availability, loading, onConfirmSlot, bookingInFlight }) {
  const slots = availability?.slots ?? []
  const payment = availability?.payment
  const totalWeightKg = Number(payment?.totalWeightKg ?? 0)
  const weightChargeAmount = Number(payment?.weightCharge ?? 0)
  const taxAmount = Number(payment?.taxCharge ?? 0)

  if (!availability) return null

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <CalendarClock className="h-5 w-5 text-brand-600" />
            <Typography variant="h6" fontWeight={600}>Available slots</Typography>
          </Stack>
          {loading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : slots.length === 0 ? (
            <Alert severity="warning">No slots are available in the requested window. Please try a different time or date.</Alert>
          ) : (
            <Grid container spacing={3}>
              {slots.map(slot => (
                <Grid item xs={12} md={6} key={slot.slotId}>
                  <Card className="hover-lift rounded-3xl border border-slate-200/70 shadow-sm">
                    <CardContent>
                      <Stack spacing={2}>
                        <div className="flex items-center gap-2 text-slate-600">
                          <Clock3 className="h-4 w-4 text-brand-600" />
                          <Typography variant="subtitle2" fontWeight={600}>{formatSlotRange(slot)}</Typography>
                        </div>
                        <Typography variant="body2" color="text.secondary">Capacity remaining: {slot.capacityLeft}</Typography>
                        {payment?.required ? (
                          <Alert severity="info" icon={<Info size={18} />}>
                            Payment required: {formatCurrency(payment.amount)}.
                            {totalWeightKg > 0 ? <> Estimated total weight: {totalWeightKg.toFixed(1)} kg.</> : null}
                            {weightChargeAmount > 0 ? <> Weight surcharge: {formatCurrency(weightChargeAmount)}.</> : null}
                            {taxAmount > 0 ? <> Taxes applied: {formatCurrency(taxAmount)}.</> : null}
                            {' '}Pay now via UPI or choose to pay later from My Bills.
                          </Alert>
                        ) : (
                          <Alert severity="success" icon={<CheckCircle2 size={18} />}>
                            No payment required for this request.
                            {totalWeightKg > 0 ? <> Estimated total weight: {totalWeightKg.toFixed(1)} kg.</> : null}
                          </Alert>
                        )}
                        <Button variant="contained" onClick={() => onConfirmSlot(slot)} disabled={bookingInFlight}>
                          {bookingInFlight ? 'Processing…' : 'Confirm this slot'}
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

function SummaryRow({ label, amount, helper, prefix = '' }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="body2" fontWeight={600}>{label}</Typography>
        {helper ? <Typography variant="caption" color="text.secondary">{helper}</Typography> : null}
      </Stack>
      <Typography variant="body2" fontWeight={600} color="text.primary">
        {prefix}{formatCurrency(amount)}
      </Typography>
    </Stack>
  )
}

function PaymentSummary({ payment, showBreakdown = false }) {
  const subtotal = Number(payment?.baseCharge ?? 0)
  const extraCharges = Number(payment?.weightCharge ?? 0)
  const taxCharge = Number(payment?.taxCharge ?? 0)
  const total = Number(payment?.amount ?? 0)

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, flexGrow: 1 }}>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={600}>Payment details</Typography>
          {payment ? (
            <Stack spacing={2}>
              <SummaryRow label="Subtotal" amount={subtotal} />
              <SummaryRow label="Extra charges" amount={extraCharges} prefix="+ " helper={showBreakdown ? 'Extra charges are based on Approx. Weight' : undefined} />
              <SummaryRow label="Tax" amount={taxCharge} prefix="+ " helper={`GST (${TAX_RATE_PERCENT}%)`} />
              <Divider flexItem sx={{ my: 1 }} />
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1" fontWeight={700}>Total</Typography>
                <Typography variant="subtitle1" fontWeight={700} color="primary.main">{formatCurrency(total)}</Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary">(Subtotal + Extra charges + Tax)</Typography>
              {!payment.required || total <= 0 ? (
                <Alert severity="success" icon={<CheckCircle2 size={18} />}>No payment required for this request.</Alert>
              ) : null}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Enter your request details and check availability to see the estimated charges for your pickup.
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

function ScheduledRequests({ requests, loading, error, allowedItems, onRefresh }) {
  const decorated = useMemo(
    () => requests.map(request => {
      const totalWeight = Number(request.totalWeightKg)
      return {
        id: request._id || request.id,
        itemLabel: allowedItems.find(item => item.id === request.itemType)?.label || request.itemType,
        quantity: request.quantity,
        totalWeightKg: Number.isFinite(totalWeight) ? totalWeight : null,
        createdAt: request.createdAt,
        slot: request.slot,
        status: REQUEST_STATUSES[request.status] || REQUEST_STATUSES.scheduled,
        paymentStatus: PAYMENT_STATUSES[request.paymentStatus] || PAYMENT_STATUSES['not-required'],
      }
    }),
    [requests, allowedItems],
  )

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
      <CardContent>
        <Stack spacing={3}>
          <Stack direction="row" alignItems="center" spacing={2} justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={2}>
              <MailCheck className="h-5 w-5 text-brand-600" />
              <Typography variant="h6" fontWeight={600}>Your scheduled pickups</Typography>
            </Stack>
            <IconButton aria-label="Refresh scheduled pickups" onClick={onRefresh} disabled={loading} size="small">
              <RefreshCcw className="h-4 w-4" />
            </IconButton>
          </Stack>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {loading && !decorated.length ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : decorated.length ? (
            <Stack spacing={2}>
              {decorated.map(request => (
                <Box key={request.id} className="rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-3">
                  <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
                    <div>
                      <Typography variant="subtitle1" fontWeight={600}>{request.itemLabel}</Typography>
                      <Typography variant="body2" color="text.secondary">Quantity: {request.quantity}</Typography>
                      {request.totalWeightKg && request.totalWeightKg > 0 ? (
                        <Typography variant="body2" color="text.secondary">Estimated total weight: {request.totalWeightKg.toFixed(1)} kg</Typography>
                      ) : null}
                      <Typography variant="body2" color="text.secondary">Requested on {formatRequestTimestamp(request.createdAt)}</Typography>
                    </div>
                    <Stack spacing={1} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
                      <Typography variant="body2" color="text.secondary">{formatSlotRange(request.slot)}</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Chip label={request.status.label} color={request.status.color} size="small" variant={request.status.color === 'success' ? 'filled' : 'outlined'} />
                        <Chip label={request.paymentStatus.label} color={request.paymentStatus.color} size="small" variant="outlined" />
                      </Stack>
                    </Stack>
                  </Stack>
                </Box>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">You have not scheduled any special pickups yet.</Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

function ConfirmationPanel({ details, onBack, onEdit, allowedItems }) {
  if (!details) return null

  const itemLabel = useMemo(() => {
    return allowedItems.find(i => i.id === details.request.itemType)?.label || details.request.itemType
  }, [allowedItems, details.request.itemType])

  const scheduledDate = details.scheduled?.date ? dayjs(details.scheduled.date).format('DD/MM/YYYY') : '—'
  const scheduledTime = details.scheduled?.time ? dayjs(`1970-01-01T${details.scheduled.time}`).format('hh:mm A') : '—'

  const qty = Number(details.request.quantity || 0)
  const perItem = Number(details.request.approxWeight || 0)
  const totalApproxWeight = Number.isFinite(qty * perItem) ? qty * perItem : null

  const subtotal = Number(details.payment?.baseCharge ?? 0)
  const extra = Number(details.payment?.weightCharge ?? 0)
  const tax = Number(details.payment?.taxCharge ?? 0)
  const total = Number(details.payment?.amount ?? 0)

  const paymentStatus = details.request.paymentStatus || (total > 0 ? 'success' : 'not-required')
  const isPaymentPending = paymentStatus === 'pending'
  const isPaymentSuccessful = paymentStatus === 'success'
  const isPaymentNotRequired = paymentStatus === 'not-required'
  const statusColor = isPaymentPending ? 'warning.main' : 'success.main'
  const statusBgColor = isPaymentPending ? 'warning.light' : 'success.light'
  const headingText = isPaymentPending ? 'Payment Pending' : isPaymentNotRequired ? 'Request Confirmed' : 'Payment Successful'
  const headingIcon = isPaymentPending ? <Clock3 size={32} color="#ea580c" /> : <CheckCircle2 size={32} color="#097969" />
  const paymentDueMessage = details.request.paymentDueAt
    ? dayjs(details.request.paymentDueAt).format('DD MMM YYYY, hh:mm A')
    : details.scheduled?.slotStart ? dayjs(details.scheduled.slotStart).format('DD MMM YYYY, hh:mm A') : null

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
      <CardContent>
        <Grid container spacing={3} alignItems="stretch">
          <Grid item xs={12} md={7} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: { xs: 1.5, sm: 2 }, mb: 1, flexDirection: { xs: 'column', sm: 'row' }, textAlign: 'center' }}>
              <Box sx={{ width: { xs: 48, sm: 64 }, height: { xs: 48, sm: 64 }, borderRadius: '50%', border: '8px solid', borderColor: statusColor, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: statusBgColor }}>
                {headingIcon}
              </Box>
              <Typography variant="h4" fontWeight={700} sx={{ color: statusColor, letterSpacing: '-0.5px', fontSize: { xs: '1.5rem', sm: '2rem', md: '2.25rem' } }}>
                {headingText}
              </Typography>
            </Box>

            {isPaymentPending ? (
              <Alert severity="warning" icon={<Clock3 size={18} />}>
                This booking is reserved, but payment is still outstanding.{' '}
                {paymentDueMessage ? `Please settle the bill before ${paymentDueMessage} to avoid automatic cancellation.` : 'Please complete your payment before the scheduled slot to avoid automatic cancellation.'}
              </Alert>
            ) : null}
            {isPaymentSuccessful ? (
              <Typography variant="body2" color="text.secondary">Your payment has been received. A confirmation email and receipt will be sent shortly.</Typography>
            ) : null}
            {isPaymentNotRequired ? (
              <Typography variant="body2" color="text.secondary">No payment was required for this pickup. Your booking is confirmed.</Typography>
            ) : null}

            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}><Typography variant="subtitle2" color="text.secondary">Address:</Typography><Typography variant="h6" fontWeight={600}>{details.request.address || '—'}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">District:</Typography><Typography variant="h6" fontWeight={600}>{details.request.district || '—'}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Item type:</Typography><Typography variant="h6" fontWeight={600}>{itemLabel}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Phone:</Typography><Typography variant="h6" fontWeight={600}>{details.request.phone || '—'}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Email</Typography><Typography variant="h6" fontWeight={600}>{details.request.email || '—'}</Typography></Grid>
              <Grid item xs={4}><Typography variant="subtitle2" color="text.secondary">Approx. weight:</Typography><Typography variant="h6" fontWeight={600}>{totalApproxWeight ? `${totalApproxWeight.toFixed(0)}kg` : (perItem ? `${perItem}kg` : '—')}</Typography></Grid>
              <Grid item xs={4}><Typography variant="subtitle2" color="text.secondary">Quantity:</Typography><Typography variant="h6" fontWeight={600}>{qty || '—'}</Typography></Grid>
              <Grid item xs={4}><Typography variant="subtitle2" color="text.secondary">Scheduled Time:</Typography><Typography variant="h6" fontWeight={600}>{scheduledTime}</Typography></Grid>
              <Grid item xs={6}><Typography variant="subtitle2" color="text.secondary">Scheduled Date:</Typography><Typography variant="h6" fontWeight={600}>{scheduledDate}</Typography></Grid>
              <Grid item xs={6}>
                {details.payment?.required ? (
                  <><Typography variant="subtitle2" color="text.secondary">Receipt:</Typography><Button size="small" variant="text" onClick={() => window.print()} sx={{ textDecoration: 'underline', px: 0 }}>Download</Button></>
                ) : null}
              </Grid>
            </Grid>

            <Box sx={{ mt: 2 }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h5" fontWeight={700}>Total</Typography>
                <Typography variant="h4" fontWeight={700}>{formatCurrency(total)}</Typography>
              </Stack>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                <Stack direction="row" justifyContent="space-between"><Typography fontWeight={600}>Subtotal:</Typography><Typography color="text.secondary">{formatCurrency(subtotal)}</Typography></Stack>
                <Stack direction="row" justifyContent="space-between"><Typography fontWeight={600}>Extra charges:</Typography><Typography color="text.secondary">+{formatCurrency(extra)}</Typography></Stack>
                <Stack direction="row" justifyContent="space-between"><Typography fontWeight={600}>Tax:</Typography><Typography color="text.secondary">+{formatCurrency(tax)}</Typography></Stack>
              </Stack>
            </Box>
          </Grid>
          <Grid item xs={12} md={5} sx={{ display: 'flex' }}>
            <Box sx={{ flex: 1, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'grey.50', p: 2, minHeight: { xs: 300, md: 'auto' } }}>
              <img src={ConfirmationIllustration} alt="Confirmation Illustration" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

export default function SpecialCollectionPage({ session, onSessionInvalid }) {
  const navigate = useNavigate()
  const sessionId = getSessionId(session)
  const isAuthenticated = Boolean(sessionId || session?.email)

  // ✅ UPI config — change UPI_ID to your real UPI ID
  const UPI_ID = '6309892648@axl'
  const UPI_NAME = 'Smart Waste Hyderabad'

  const sessionDefaults = useMemo(() => ({
    residentName: session?.name ?? '',
    ownerName: session?.householdOwnerName ?? session?.name ?? '',
    address: session?.address ?? '',
    district: session?.district ?? '',
    email: session?.email ?? '',
    phone: session?.phone ?? session?.contactNumber ?? '',
  }), [session?.name, session?.householdOwnerName, session?.address, session?.district, session?.email, session?.phone, session?.contactNumber])

  const { loading: configLoading, error: configError, items, slotConfig } = useSpecialCollectionConfig()
  const allowedItems = useMemo(() => items.filter(item => item.allow), [items])

  const [form, setForm] = useState(() => ({ ...initialFormState, ...sessionDefaults }))

  useEffect(() => {
    setForm(prev => {
      let updated = false
      const next = { ...prev }
      Object.entries(sessionDefaults).forEach(([key, value]) => {
        if (!value) return
        if (!prev[key]) { next[key] = value; updated = true }
      })
      return updated ? next : prev
    })
  }, [sessionDefaults])

  useEffect(() => {
    if (!allowedItems.length) return
    setForm(prev => {
      if (prev.itemType) return prev
      return { ...prev, itemType: allowedItems[0].id }
    })
  }, [allowedItems])

  const handleSessionInvalid = useCallback(message => {
    onSessionInvalid?.(message)
    navigate('/login', { replace: true, state: { notice: message } })
  }, [navigate, onSessionInvalid])

  const { requests, loading: requestsLoading, error: requestsError, refresh: refreshRequests } = useResidentRequests(sessionId, handleSessionInvalid)

  const [availability, setAvailability] = useState(null)
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [bookingInFlight, setBookingInFlight] = useState(false)
  const [paymentChoiceOpen, setPaymentChoiceOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const [formError, setFormError] = useState(null)
  const [touched, setTouched] = useState({})

  // ✅ UPI state
  const [upiDialogOpen, setUpiDialogOpen] = useState(false)
  const [upiSlot, setUpiSlot] = useState(null)
  const [utrNumber, setUtrNumber] = useState('')
  const [utrError, setUtrError] = useState('')
  const [upiConfirming, setUpiConfirming] = useState(false)

  const formErrors = useMemo(() => {
    const errs = {}
    const emailRegex = /.+@.+\..+/
    const qty = Number(form.quantity)
    const weight = Number(form.approxWeight)
    if (!form.residentName?.trim()) errs.residentName = 'Resident name is required'
    if (!form.ownerName?.trim()) errs.ownerName = "Owner's name is required"
    if (!form.email?.trim()) errs.email = 'Email is required'
    else if (!emailRegex.test(form.email)) errs.email = 'Enter a valid email address'
    if (!form.phone?.trim()) errs.phone = 'Phone number is required'
    if (!form.address?.trim()) errs.address = 'Address is required'
    if (!form.district?.trim()) errs.district = 'District is required'
    if (!form.itemType) errs.itemType = 'Item type is required'
    if (!form.preferredDate) errs.preferredDate = 'Date is required'
    if (!form.preferredTime) errs.preferredTime = 'Time is required'
    if (!Number.isFinite(qty) || qty < 1) errs.quantity = 'Quantity must be at least 1'
    if (!Number.isFinite(weight) || weight <= 0) errs.approxWeight = 'Weight must be greater than 0'
    return errs
  }, [form])
  const isFormValid = useMemo(() => Object.keys(formErrors).length === 0, [formErrors])

  const selectedPolicy = useMemo(() => allowedItems.find(item => item.id === form.itemType), [allowedItems, form.itemType])

  const handleFormChange = useCallback(event => {
    const { name, value } = event.target
    setForm(prev => {
      let nextValue = value
      if (name === 'quantity') nextValue = value === '' ? '' : Number(value)
      else if (name === 'approxWeight') nextValue = value === '' ? '' : Number(value)
      return { ...prev, [name]: nextValue }
    })
    setAvailability(null)
    setFormError(null)
  }, [])

  const handleFormBlur = useCallback(event => {
    const { name } = event.target
    setTouched(prev => ({ ...prev, [name]: true }))
  }, [])

  const handleResetForm = useCallback(() => {
    setForm({ ...initialFormState, ...sessionDefaults })
    setTouched({})
    setAvailability(null)
    setFormError(null)
  }, [sessionDefaults])

  const ensureAuthenticated = useCallback(() => { navigate('/login') }, [navigate])

  const checkAvailability = useCallback(async () => {
    if (!isAuthenticated) { ensureAuthenticated(); return }

    const requiredChecks = [
      { field: 'residentName', label: 'resident name', validate: value => Boolean(value?.trim()) },
      { field: 'ownerName', label: "owner's name", validate: value => Boolean(value?.trim()) },
      { field: 'address', label: 'address', validate: value => Boolean(value?.trim()) },
      { field: 'district', label: 'district', validate: value => Boolean(value?.trim()) },
      { field: 'email', label: 'email', validate: value => Boolean(value?.trim()) },
      { field: 'phone', label: 'phone number', validate: value => Boolean(value?.trim()) },
      { field: 'itemType', label: 'item type', validate: value => Boolean(value) },
      { field: 'preferredDate', label: 'date', validate: value => Boolean(value) },
      { field: 'preferredTime', label: 'time', validate: value => Boolean(value) },
      { field: 'quantity', label: 'quantity', validate: value => Number(value) >= 1 },
      { field: 'approxWeight', label: 'approximate weight (kg per item)', validate: value => Number(value) > 0 },
    ]

    const failedCheck = requiredChecks.find(check => !check.validate(form[check.field]))
    if (failedCheck) {
      setTouched(prev => ({ ...prev, [failedCheck.field]: true }))
      setFormError(`Please provide a valid ${failedCheck.label}.`)
      return
    }

    const combinedDateTime = combineDateAndTime(form.preferredDate, form.preferredTime)
    const preferredDateTime = serializeDateTime(combinedDateTime)
    if (!preferredDateTime) {
      setFormError('Please choose both a date and time in the future before checking availability.')
      return
    }

    setAvailability(null)
    setFeedback(null)
    setFormError(null)
    setAvailabilityLoading(true)

    try {
      const response = await fetch('/api/schedules/special/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: sessionId,
          itemType: form.itemType,
          quantity: Number(form.quantity),
          preferredDateTime,
          residentName: form.residentName,
          ownerName: form.ownerName,
          address: form.address,
          district: form.district,
          email: form.email,
          phone: form.phone,
          approxWeight: form.approxWeight === '' ? null : Number(form.approxWeight),
          specialNotes: form.specialNotes,
        }),
      })

      const payload = await safeJson(response)
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || 'Unable to load availability for the selected day.')
      }
      setAvailability(payload)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setAvailabilityLoading(false)
    }
  }, [form, isAuthenticated, ensureAuthenticated, sessionId])

  const submitBooking = useCallback(async (slot, options = {}) => {
    const { paymentStatus, paymentReference, deferPayment } = options
    setBookingInFlight(true)
    try {
      const combinedDateTime = combineDateAndTime(form.preferredDate, form.preferredTime)
      const preferredDateTime = serializeDateTime(combinedDateTime)
      const payload = {
        userId: sessionId,
        itemType: form.itemType,
        quantity: Number(form.quantity),
        preferredDateTime,
        slotId: slot.slotId,
        residentName: form.residentName,
        ownerName: form.ownerName,
        address: form.address,
        district: form.district,
        email: form.email,
        phone: form.phone,
        approxWeight: form.approxWeight === '' ? null : Number(form.approxWeight),
        specialNotes: form.specialNotes,
      }

      if (paymentStatus) payload.paymentStatus = paymentStatus
      if (paymentReference) payload.paymentReference = paymentReference
      if (deferPayment) payload.deferPayment = true

      const response = await fetch('/api/schedules/special/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await safeJson(response)
      if (!response.ok || result?.ok === false) {
        throw new Error(result?.message || 'Unable to schedule the selected slot.')
      }

      const requestDoc = result?.request || {}

      setConfirmation({
        request: {
          residentName: form.residentName,
          ownerName: form.ownerName,
          address: form.address,
          district: form.district,
          email: form.email,
          phone: form.phone,
          itemType: form.itemType,
          quantity: form.quantity,
          approxWeight: form.approxWeight,
          specialNotes: form.specialNotes,
          status: requestDoc.status,
          paymentStatus: requestDoc.paymentStatus,
          paymentReference: requestDoc.paymentReference,
          paymentDueAt: requestDoc.paymentDueAt,
          paymentRequired: requestDoc.paymentRequired,
          billingId: requestDoc.billingId,
        },
        scheduled: {
          date: form.preferredDate,
          time: form.preferredTime,
          slotId: slot.slotId,
          slotStart: requestDoc.slot?.start || slot.start,
          slotEnd: requestDoc.slot?.end || slot.end,
        },
        payment: availability?.payment || null,
      })
      setFeedback({ type: 'success', message: result.message })
      setAvailability(null)
      setForm(prev => ({
        ...prev,
        preferredDate: initialFormState.preferredDate,
        preferredTime: initialFormState.preferredTime,
        approxWeight: initialFormState.approxWeight,
        quantity: initialFormState.quantity,
        specialNotes: initialFormState.specialNotes,
      }))
      refreshRequests()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setBookingInFlight(false)
    }
  }, [availability, form, refreshRequests, sessionId])

  // ✅ UPI payment — replaces Stripe
  const startCheckout = useCallback(async slot => {
    setUpiSlot(slot)
    setUtrNumber('')
    setUtrError('')
    setUpiDialogOpen(true)
  }, [])

  const handleUpiConfirm = useCallback(async () => {
    if (!utrNumber.trim() || utrNumber.trim().length < 6) {
      setUtrError('Please enter a valid UTR / transaction ID (min 6 characters)')
      return
    }
    if (!upiSlot) return
    setUpiConfirming(true)
    setUpiDialogOpen(false)
    await submitBooking(upiSlot, {
      paymentStatus: 'success',
      paymentReference: `UPI-${utrNumber.trim().toUpperCase()}`,
    })
    setUpiConfirming(false)
    setUpiSlot(null)
    setUtrNumber('')
  }, [utrNumber, upiSlot, submitBooking])

  const closePaymentChoice = useCallback(() => {
    setPaymentChoiceOpen(false)
    setSelectedSlot(null)
  }, [])

  const handleProceedWithPayment = useCallback(() => {
    if (!selectedSlot) return
    const slot = selectedSlot
    closePaymentChoice()
    startCheckout(slot)
  }, [selectedSlot, closePaymentChoice, startCheckout])

  const handleDeferPayment = useCallback(() => {
    if (!selectedSlot) return
    const slot = selectedSlot
    closePaymentChoice()
    submitBooking(slot, { deferPayment: true })
  }, [selectedSlot, closePaymentChoice, submitBooking])

  const handleConfirmSlot = useCallback(slot => {
    if (!availability || bookingInFlight) return
    if (availability.payment?.required) {
      setSelectedSlot(slot)
      setPaymentChoiceOpen(true)
    } else {
      setSelectedSlot(null)
      submitBooking(slot)
    }
  }, [availability, bookingInFlight, submitBooking])

  const handleFormSubmit = useCallback(event => {
    event.preventDefault()
    checkAvailability()
  }, [checkAvailability])

  const activeStep = feedback?.type === 'success' ? 2 : availability ? 1 : 0
  const slotWindowLabel = selectedSlot ? formatSlotRange(selectedSlot) : null
  const slotDueLabel = useMemo(() => {
    if (!selectedSlot?.start) return null
    try {
      return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selectedSlot.start))
    } catch (error) {
      return null
    }
  }, [selectedSlot])
  const paymentAmountLabel = availability?.payment?.amount != null ? formatCurrency(availability.payment.amount) : null

  // Build UPI payment URL for QR
  const upiPaymentUrl = useMemo(() => {
    const amount = availability?.payment?.amount ?? 0
    return `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${amount}&cu=INR&tn=${encodeURIComponent('GHMC Special Collection')}`
  }, [availability?.payment?.amount, UPI_ID, UPI_NAME])

  return (
    <div className="glass-panel mx-auto max-w-6xl rounded-4xl border border-slate-200/60 bg-white/90 p-8 shadow-md">
      <Stack spacing={5}>
        <Box>
          <Chip icon={<Truck size={16} />} label="Special pickup scheduling" color="primary" variant="outlined" sx={{ fontWeight: 600, borderRadius: '999px' }} />
          <Typography variant="h4" fontWeight={600} mt={2}>Schedule a bulky or speciality pickup</Typography>
          <Typography variant="body1" color="text.secondary" mt={1.5}>
            Reserve a dedicated collection slot for furniture, e-waste, or other speciality items. Slots are limited each day to ensure crews have sufficient capacity.
          </Typography>
        </Box>

        <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
          <CardContent>
            <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
              <Stepper activeStep={activeStep} alternativeLabel>
                {['Details', 'Availability', 'Confirm'].map(label => (
                  <Step key={label}><StepLabel>{label}</StepLabel></Step>
                ))}
              </Stepper>
            </Box>
          </CardContent>
        </Card>

        {feedback ? <Alert severity={feedback.type} onClose={() => setFeedback(null)}>{feedback.message}</Alert> : null}
        {configError ? <Alert severity="error">{configError}</Alert> : null}
        {formError ? <Alert severity="error" onClose={() => setFormError(null)}>{formError}</Alert> : null}

        {feedback?.type === 'success' && confirmation ? (
          <Box sx={{ maxWidth: 1100, mx: 'auto', width: '100%' }}>
            <ConfirmationPanel details={confirmation} allowedItems={allowedItems} onBack={() => navigate(-1)} onEdit={() => setFeedback(null)} />
          </Box>
        ) : (
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Box sx={{ maxWidth: 1100, mx: 'auto', width: '100%' }}>
              <Grid container spacing={3} alignItems="stretch">
                <Grid item xs={12} md={7} sx={{ display: 'flex' }}>
                  <RequestForm form={form} allowedItems={allowedItems} selectedPolicy={selectedPolicy} onChange={handleFormChange} onSubmit={handleFormSubmit} availabilityLoading={availabilityLoading || configLoading} isAuthenticated={isAuthenticated} onRequireAuth={ensureAuthenticated} errors={formErrors} touched={touched} onBlur={handleFormBlur} onReset={handleResetForm} isFormValid={isFormValid} slotConfig={slotConfig} />
                </Grid>
                <Grid item xs={12} md={5} sx={{ display: 'flex' }}>
                  <PaymentSummary payment={availability?.payment} showBreakdown={form.approxWeight !== '' && Number(form.quantity) > 0} />
                </Grid>
              </Grid>
            </Box>
          </LocalizationProvider>
        )}

        {feedback?.type === 'success' ? null : (
          <AvailabilitySection availability={availability} loading={availabilityLoading} onConfirmSlot={handleConfirmSlot} bookingInFlight={bookingInFlight} />
        )}

        <ScheduledRequests requests={requests} loading={requestsLoading} error={requestsError} allowedItems={allowedItems} onRefresh={refreshRequests} />

        {/* Pay now / Pay later choice dialog */}
        <Dialog open={paymentChoiceOpen} onClose={bookingInFlight ? undefined : closePaymentChoice} maxWidth="sm" fullWidth>
          <DialogTitle>Select how you would like to pay</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
              Paying now via UPI will confirm this pickup immediately.
              {paymentAmountLabel ? ` The total payable amount is ${paymentAmountLabel}.` : ''}
            </DialogContentText>
            <Stack spacing={1.5}>
              {slotWindowLabel ? <Typography variant="body2" color="text.secondary">Slot reserved: {slotWindowLabel}</Typography> : null}
              {slotDueLabel ? (
                <Alert severity="warning" icon={<Clock3 size={18} />}>
                  If payment is not completed before {slotDueLabel}, this reservation will be cancelled automatically.
                </Alert>
              ) : (
                <Alert severity="warning" icon={<Clock3 size={18} />}>
                  This reservation will be cancelled automatically if payment is not completed before the scheduled slot.
                </Alert>
              )}
              <Alert severity="info" icon={<Info size={18} />}>
                Choosing "Pay later" will generate an outstanding bill that you can settle from the My Bills section.
              </Alert>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={closePaymentChoice} disabled={bookingInFlight}>Back</Button>
            <Button onClick={handleDeferPayment} disabled={bookingInFlight} variant="outlined">Pay later</Button>
            <Button onClick={handleProceedWithPayment} disabled={bookingInFlight} variant="contained">Pay now via UPI</Button>
          </DialogActions>
        </Dialog>

        {/* ✅ UPI Payment Dialog */}
        <Dialog open={upiDialogOpen} onClose={upiConfirming ? undefined : () => setUpiDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ fontWeight: 700, textAlign: 'center', pt: 3 }}>
            Pay via UPI
          </DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} alignItems="center">
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Scan the QR code using GPay, PhonePe, Paytm or any UPI app
              </Typography>

              {/* Auto-generated QR code */}
             <Box sx={{ border: '2px solid', borderColor: 'divider', borderRadius: 2, p: 1 }}>
  <QRCodeSVG value={upiPaymentUrl} size={200} />
</Box>

              <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, width: '100%', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary">UPI ID</Typography>
                <Typography variant="subtitle1" fontWeight={700} sx={{ letterSpacing: 0.5 }}>
                  {UPI_ID}
                </Typography>
                <Typography variant="h5" fontWeight={700} color="primary.main" sx={{ mt: 1 }}>
                  {formatCurrency(availability?.payment?.amount ?? 0)}
                </Typography>
              </Box>

              <Alert severity="info" sx={{ width: '100%' }}>
                After paying, enter the UTR / Transaction ID shown in your UPI app to confirm your booking.
              </Alert>

              <TextField
                label="UTR / Transaction ID"
                value={utrNumber}
                onChange={e => { setUtrNumber(e.target.value); setUtrError('') }}
                error={Boolean(utrError)}
                helperText={utrError || 'e.g. 405813XXXXXX (from your UPI app)'}
                fullWidth
                inputProps={{ style: { textTransform: 'uppercase', letterSpacing: 1 } }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => setUpiDialogOpen(false)} disabled={upiConfirming}>Cancel</Button>
            <Button onClick={handleUpiConfirm} variant="contained" disabled={upiConfirming || !utrNumber.trim()}>
              {upiConfirming ? 'Confirming…' : 'Confirm Payment'}
            </Button>
          </DialogActions>
        </Dialog>

      </Stack>
    </div>
  )
}