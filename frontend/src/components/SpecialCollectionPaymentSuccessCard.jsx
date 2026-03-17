import { useCallback, useMemo } from 'react'
import PropTypes from 'prop-types'
import { Box, Button, Card, CardContent, Divider, Grid, Stack, Typography } from '@mui/material'
import { Check, Download } from 'lucide-react'

const BASE_LOCALE = 'en-IN'
const DEFAULT_CURRENCY = 'INR'

// Cache per-currency formatters to avoid repeatedly instantiating Intl.NumberFormat.
const formatterCache = new Map()

const getCurrencyFormatter = (currency = DEFAULT_CURRENCY) => {
  const key = currency.toUpperCase()
  if (formatterCache.has(key)) {
    return formatterCache.get(key)
  }

  const formatter = new Intl.NumberFormat(BASE_LOCALE, {
    style: 'currency',
    currency: key,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  formatterCache.set(key, formatter)
  return formatter
}

function formatCurrency(amount, currency = 'LKR') {
  const value = Number(amount)
  if (!Number.isFinite(value)) {
    return getCurrencyFormatter(DEFAULT_CURRENCY).format(0)
  }
  try {
    return getCurrencyFormatter(currency).format(value)
  } catch (error) {
    console.warn('Failed to format amount', error)
    return getCurrencyFormatter(DEFAULT_CURRENCY).format(value)
  }
}

function formatWeight(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return `${num.toFixed(1)} kg`
}

// Displays the payment confirmation summary for a special collection booking.
export default function SpecialCollectionPaymentSuccessCard({
  request,
  payment = {},
  downloadPending = false,
  onDownloadReceipt,
  stripeReceiptUrl,
  actions = [],
  illustrationSrc,
  illustrationAlt = 'Confirmation Illustration',
}) {
  // Normalise payment values so the UI works even when the API omits optional fields.
  const { totalPaid, subtotal, extraCharge, taxCharge, currency } = useMemo(() => {
    const derivedTotal = payment.total ?? request?.paymentAmount ?? 0
    return {
      totalPaid: derivedTotal,
      subtotal: payment.subtotal ?? request?.paymentSubtotal ?? derivedTotal,
      extraCharge: payment.extraCharge ?? request?.paymentWeightCharge ?? 0,
      taxCharge: payment.tax ?? request?.paymentTaxCharge ?? 0,
      currency: request?.currency || request?.paymentCurrency || payment.currency || DEFAULT_CURRENCY,
    }
  }, [payment, request])

  // Cache the parsed slot start date so repeated formatting calls stay cheap.
  const slotStart = useMemo(() => (request?.slot?.start ? new Date(request.slot.start) : null), [request?.slot?.start])

  const scheduledDate = useMemo(() => (
    slotStart
      ? slotStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : '—'
  ), [slotStart])

  const scheduledTime = useMemo(() => (
    slotStart
      ? slotStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : '—'
  ), [slotStart])

  const approxWeightDisplay = useMemo(
    () => (request?.approxWeightKg ? `${formatWeight(request.approxWeightKg)} per item` : null),
    [request?.approxWeightKg],
  )

  const totalWeightDisplay = useMemo(
    () => (request?.totalWeightKg ? formatWeight(request.totalWeightKg) : null),
    [request?.totalWeightKg],
  )

  // Use a friendlier label when Stripe already generated the PDF receipt.
  const downloadLabel = useMemo(() => (stripeReceiptUrl ? 'Download PDF' : 'Download'), [stripeReceiptUrl])

  // Stripe URLs are opened in a new tab so the current confirmation state is preserved.
  const handleStripeReceipt = useCallback(() => {
    if (!stripeReceiptUrl) return
    window.open(stripeReceiptUrl, '_blank', 'noopener,noreferrer')
  }, [stripeReceiptUrl])

  return (
    <Card className="rounded-3xl border border-slate-200/70 shadow-lg" sx={{ overflow: 'hidden', width: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 } }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            mb: 2,
          }}
        >
          <Box
            sx={{
              width: { xs: 40, sm: 52 },
              height: { xs: 40, sm: 52 },
              borderRadius: '50%',
              border: '6px solid',
              borderColor: 'success.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'success.50',
            }}
          >
            <Check size={22} color="#097969" strokeWidth={3} />
          </Box>
          <Typography
            variant="h4"
            fontWeight={700}
            color="success.main"
            sx={{
              letterSpacing: '-0.5px',
              fontSize: { xs: '1.4rem', sm: '1.9rem', md: '2.125rem' },
              textAlign: 'center',
            }}
          >
            Payment Successful
          </Typography>
        </Box>

        <Grid container spacing={{ xs: 2, md: 3 }} alignItems="stretch">
          <Grid item xs={12} lg={7} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box
              sx={{
                bgcolor: 'grey.50',
                borderRadius: 2,
                p: 2,
                border: '1px solid',
                borderColor: 'grey.200',
              }}
            >
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography
                    variant="subtitle2"
                    color="text.secondary"
                    sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}
                  >
                    Address
                  </Typography>
                  <Typography variant="h6" fontWeight={600} sx={{ lineHeight: 1.4 }}>
                    {request?.address || '—'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    District
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{request?.district || '—'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Item Type
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{request?.itemLabel || request?.itemType || '—'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Phone
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{request?.contactPhone || '—'}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Email
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{request?.contactEmail || '—'}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Weight
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{totalWeightDisplay || approxWeightDisplay || '—'}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Quantity
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{request?.quantity || '—'}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Time
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{scheduledTime}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Date
                  </Typography>
                  <Typography variant="h6" fontWeight={600}>{scheduledDate}</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 0.5 }}>
                    Receipt
                  </Typography>
                  <Stack direction="row" spacing={1} alignItems="center">
                    {onDownloadReceipt ? (
                      <Button
                        size="small"
                        variant="text"
                        onClick={onDownloadReceipt}
                        disabled={downloadPending}
                        startIcon={<Download size={16} />}
                        sx={{
                          textDecoration: 'underline',
                          px: 0,
                          justifyContent: 'flex-start',
                          fontWeight: 600,
                          color: 'success.main',
                          '&:hover': {
                            color: 'success.dark',
                            bgcolor: 'transparent',
                          },
                        }}
                      >
                        {downloadPending ? 'Preparing…' : downloadLabel}
                      </Button>
                    ) : null}
                    {stripeReceiptUrl ? (
                      <Button
                        size="small"
                        variant="text"
                        onClick={handleStripeReceipt}
                        sx={{
                          textDecoration: 'underline',
                          px: 0,
                          justifyContent: 'flex-start',
                          fontWeight: 600,
                          color: 'success.main',
                          '&:hover': {
                            color: 'success.dark',
                            bgcolor: 'transparent',
                          },
                        }}
                      >
                        View Stripe receipt
                      </Button>
                    ) : null}
                  </Stack>
                </Grid>
              </Grid>
            </Box>

            <Box
              sx={{
                bgcolor: 'success.50',
                borderRadius: 2,
                p: 2,
                border: '2px solid',
                borderColor: 'success.main',
              }}
            >
              <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="h5" fontWeight={700} color="text.secondary">
                  Total:
                </Typography>
                <Typography variant="h4" fontWeight={800} color="success.main">
                  {formatCurrency(totalPaid, currency)}
                </Typography>
              </Stack>
              <Divider sx={{ mb: 1.5, borderColor: 'success.200' }} />
              <Stack spacing={0.75}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight={600} color="text.secondary">
                    Subtotal
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>{formatCurrency(subtotal, currency)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight={600} color="text.secondary">
                    Extra charges
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="success.main">
                    +{formatCurrency(extraCharge, currency)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="body2" fontWeight={600} color="text.secondary">
                    Tax
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="success.main">
                    +{formatCurrency(taxCharge, currency)}
                  </Typography>
                </Stack>
              </Stack>
            </Box>

            {actions?.length ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
                {actions.map(action => (
                  <Button
                    key={action.label}
                    variant={action.variant || 'contained'}
                    size={action.size || 'large'}
                    onClick={action.onClick}
                    fullWidth
                    sx={{
                      borderRadius: 2,
                      textTransform: 'none',
                      px: 4,
                      py: 1.5,
                      bgcolor:
                        action.variant === 'outlined'
                          ? 'transparent'
                          : action.color
                          ? undefined
                          : 'success.main',
                      color:
                        action.variant === 'outlined'
                          ? 'success.main'
                          : undefined,
                      borderColor:
                        action.variant === 'outlined'
                          ? 'success.main'
                          : undefined,
                      '&:hover': {
                        bgcolor:
                          action.variant === 'outlined'
                            ? 'success.50'
                            : action.color
                            ? undefined
                            : 'success.dark',
                        borderColor:
                          action.variant === 'outlined'
                            ? 'success.dark'
                            : undefined,
                      },
                    }}
                    color={action.color || (action.variant === 'outlined' ? 'success' : undefined)}
                  >
                    {action.label}
                  </Button>
                ))}
              </Stack>
            ) : null}
          </Grid>

          <Grid item xs={12} lg={5} sx={{ display: 'flex' }}>
            <Box
              sx={{
                flex: 1,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'grey.50',
                p: 2,
                minHeight: { xs: 300, lg: 'auto' },
              }}
            >
              <img
                src={illustrationSrc}
                alt={illustrationAlt}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.08))',
                }}
              />
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  )
}

SpecialCollectionPaymentSuccessCard.propTypes = {
  request: PropTypes.shape({
    address: PropTypes.string,
    district: PropTypes.string,
    contactPhone: PropTypes.string,
    contactEmail: PropTypes.string,
    itemLabel: PropTypes.string,
    itemType: PropTypes.string,
    quantity: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    slot: PropTypes.shape({
      start: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.instanceOf(Date)]),
      end: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.instanceOf(Date)]),
    }),
    approxWeightKg: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    totalWeightKg: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    paymentAmount: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    paymentSubtotal: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    paymentWeightCharge: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    paymentTaxCharge: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    paymentCurrency: PropTypes.string,
    currency: PropTypes.string,
  }).isRequired,
  payment: PropTypes.shape({
    total: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    subtotal: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    extraCharge: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    tax: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    currency: PropTypes.string,
  }),
  downloadPending: PropTypes.bool,
  onDownloadReceipt: PropTypes.func,
  stripeReceiptUrl: PropTypes.string,
  actions: PropTypes.arrayOf(PropTypes.shape({
    label: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
    variant: PropTypes.oneOf(['contained', 'outlined', 'text']),
    size: PropTypes.oneOf(['small', 'medium', 'large']),
    color: PropTypes.string,
  })),
  illustrationSrc: PropTypes.string,
  illustrationAlt: PropTypes.string,
}

SpecialCollectionPaymentSuccessCard.defaultProps = {
  payment: {},
  downloadPending: false,
  onDownloadReceipt: undefined,
  stripeReceiptUrl: undefined,
  actions: [],
  illustrationSrc: undefined,
  illustrationAlt: 'Confirmation Illustration',
}
