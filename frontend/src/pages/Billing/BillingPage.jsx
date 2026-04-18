import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, Grid, IconButton, Stack, Tooltip, Typography,
} from '@mui/material'
import { Banknote, CreditCard, Download, ExternalLink, Receipt, RefreshCcw, Wallet } from 'lucide-react'

// ─── Razorpay helpers ─────────────────────────────────────────────────────────

// Loads checkout.js once and resolves when window.Razorpay is available.
function loadRazorpayScript() {
  return new Promise(resolve => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

// ─── Currency formatting ──────────────────────────────────────────────────────

const CURRENCY_FORMATTERS = new Map()
const MS_PER_DAY = 86_400_000

function getCurrencyFormatter(currency) {
  const key = currency?.toUpperCase() || 'INR'
  if (!CURRENCY_FORMATTERS.has(key)) {
    CURRENCY_FORMATTERS.set(
      key,
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: key, minimumFractionDigits: 2 }),
    )
  }
  return CURRENCY_FORMATTERS.get(key)
}

function formatCurrency(amount, currency = 'INR') {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return '--'
  try { return getCurrencyFormatter(currency).format(amount) }
  catch { return `₹${amount.toFixed(2)}` }
}

function computeDueInDays(dueDate) {
  if (!dueDate) return null
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return null
  const today = new Date()
  const diff = (due.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / MS_PER_DAY
  return Math.round(diff)
}

// ─── BillCard ─────────────────────────────────────────────────────────────────

function BillCard({ bill, onPay, processing }) {
  const dueInDays = computeDueInDays(bill.dueDate)
  const overdue = typeof dueInDays === 'number' && dueInDays < 0

  return (
    <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
      <CardContent>
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="h6" fontWeight={600}>{bill.invoiceNumber}</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                {bill.description || 'Municipal waste services'}
              </Typography>
            </Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Chip
                color={overdue ? 'error' : 'warning'}
                label={overdue ? `Overdue by ${Math.abs(dueInDays)} day(s)` : `Due in ${dueInDays ?? '—'} day(s)`}
                size="small"
              />
              <Chip
                color="info" variant="outlined" size="small"
                label={new Date(bill.dueDate).toLocaleDateString('en-GB')}
              />
            </Stack>
          </Stack>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            spacing={3}
          >
            <Box>
              <Typography variant="subtitle2" color="text.secondary">Amount due</Typography>
              <Typography variant="h5" fontWeight={600}>
                {formatCurrency(bill.amount, bill.currency)}
              </Typography>
            </Box>
            <Button
              variant="contained"
              onClick={() => onPay(bill)}
              disabled={processing}
              startIcon={processing ? <CircularProgress size={18} color="inherit" /> : <CreditCard size={18} />}
            >
              {processing ? 'Processing…' : 'Pay now'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

BillCard.propTypes = {
  bill: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    invoiceNumber: PropTypes.string.isRequired,
    description: PropTypes.string,
    dueDate: PropTypes.string,
    amount: PropTypes.number.isRequired,
    currency: PropTypes.string,
  }).isRequired,
  onPay: PropTypes.func.isRequired,
  processing: PropTypes.bool.isRequired,
}

// ─── PaidBillRow ──────────────────────────────────────────────────────────────

function PaidBillRow({ bill, onDownloadReceipt }) {
  const transaction = bill.latestTransaction
  const receiptAvailable = Boolean(transaction?.receiptUrl)

  return (
    <Card className="rounded-2xl border border-slate-200/70 shadow-sm">
      <CardContent>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ md: 'center' }}
          justifyContent="space-between"
          spacing={3}
        >
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>{bill.invoiceNumber}</Typography>
            <Typography variant="body2" color="text.secondary">
              Paid on {bill.paidAt ? new Date(bill.paidAt).toLocaleString('en-GB') : 'N/A'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <Chip
              size="small" color="success"
              label={`Paid · ${transaction?.paymentMethod?.toUpperCase() || 'RAZORPAY'}`}
            />
            <Typography variant="subtitle1" fontWeight={600}>
              {formatCurrency(bill.amount, bill.currency)}
            </Typography>
            {receiptAvailable ? (
              <Button
                variant="outlined"
                component="a"
                href={transaction.receiptUrl}
                target="_blank"
                rel="noopener"
                startIcon={<ExternalLink size={16} />}
              >
                View receipt
              </Button>
            ) : (
              <Tooltip title="Download receipt">
                <span>
                  <Button
                    variant="outlined"
                    startIcon={<Download size={16} />}
                    onClick={() => onDownloadReceipt(transaction?._id)}
                    disabled={!transaction?._id}
                  >
                    Download receipt
                  </Button>
                </span>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

PaidBillRow.propTypes = {
  bill: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    invoiceNumber: PropTypes.string.isRequired,
    paidAt: PropTypes.string,
    amount: PropTypes.number.isRequired,
    currency: PropTypes.string,
    latestTransaction: PropTypes.shape({
      _id: PropTypes.string,
      receiptUrl: PropTypes.string,
      paymentMethod: PropTypes.string,
    }),
  }).isRequired,
  onDownloadReceipt: PropTypes.func.isRequired,
}

// ─── Main BillingPage ─────────────────────────────────────────────────────────

export default function BillingPage({ session = null, variant = 'page' }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [processingBillId, setProcessingBillId] = useState(null)
  const [receiptFeedback, setReceiptFeedback] = useState(null)

  const userId = useMemo(() => session?.id || session?._id || null, [session])

  const loadBills = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/billing/bills?userId=${userId}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Unable to load billing data')
      setData(payload)
      setProcessingBillId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { loadBills() }, [loadBills])

  const outstandingBills = useMemo(() => data?.bills?.outstanding ?? [], [data])
  const paidBills = useMemo(() => data?.bills?.paid ?? [], [data])
  const summary = useMemo(() => data?.summary ?? null, [data])

  // ✅ RAZORPAY: open Razorpay checkout modal when user clicks "Pay now"
  const handlePay = useCallback(async (bill) => {
    if (!userId) return
    setProcessingBillId(bill._id)
    setError(null)

    try {
      // 1. Load Razorpay checkout script
      const loaded = await loadRazorpayScript()
      if (!loaded) throw new Error('Failed to load payment gateway. Please try again.')

      // 2. Create a Razorpay order on the backend
      const orderRes = await fetch('/api/billing/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, billId: bill._id }),
      })
      const orderData = await orderRes.json()
      if (!orderRes.ok) throw new Error(orderData.message || 'Could not initiate payment')

      // 3. Open Razorpay modal
      await new Promise((resolve, reject) => {
        const options = {
          key: orderData.keyId,
          amount: orderData.amount,         // in paise
          currency: orderData.currency,
          name: 'GHMC Smart Waste',
          description: orderData.description || `Invoice ${bill.invoiceNumber}`,
          order_id: orderData.orderId,
          prefill: orderData.prefill || {},
          theme: { color: '#2563eb' },
          // ✅ Show UPI as the first block, then all other methods below
          config: {
            display: {
              blocks: {
                upi_block: { name: 'Pay via UPI', instruments: [{ method: 'upi' }] },
              },
              sequence: ['block.upi_block'],
              preferences: { show_default_blocks: true },
            },
          },
          modal: {
            ondismiss: () => {
              // User closed the modal without paying
              setProcessingBillId(null)
              resolve()
            },
          },
          handler: async (response) => {
            try {
              // 4. Verify payment on the backend
              const verifyRes = await fetch('/api/billing/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  billId: bill._id,
                  userId,
                }),
              })
              const verifyData = await verifyRes.json()
              if (!verifyRes.ok) throw new Error(verifyData.message || 'Payment verification failed')
              // 5. Refresh bills to show paid status
              await loadBills()
              resolve()
            } catch (err) {
              reject(err)
            }
          },
        }

        const rzp = new window.Razorpay(options)
        rzp.on('payment.failed', (response) => {
          reject(new Error(response.error?.description || 'Payment failed'))
        })
        rzp.open()
      })
    } catch (err) {
      setError(err.message)
      setProcessingBillId(null)
    }
  }, [userId, loadBills])

  const handleDownloadReceipt = useCallback(async transactionId => {
    if (!transactionId) return
    setReceiptFeedback(null)
    try {
      const response = await fetch(`/api/billing/transactions/${transactionId}/receipt?userId=${userId}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Unable to fetch receipt')

      const blob = new Blob([JSON.stringify(payload.receipt, null, 2)], { type: 'application/json' })
      const blobUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `receipt-${payload.receipt.invoiceNumber || transactionId}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(blobUrl)
      setReceiptFeedback({ type: 'success', message: 'Receipt downloaded.' })
    } catch (err) {
      setReceiptFeedback({ type: 'error', message: err.message })
    }
  }, [userId])

  const emptyState = !loading && outstandingBills.length === 0
  const wrapperClass = variant === 'page' ? 'mx-auto max-w-6xl px-6' : ''
  const panelClass = variant === 'page'
    ? 'glass-panel my-8 rounded-4xl border border-slate-200/70 bg-white/90 p-8 shadow-md'
    : 'glass-panel rounded-4xl border border-slate-200/70 bg-white/95 p-6 shadow-md'

  return (
    <div className={wrapperClass}>
      <Stack spacing={5} className={panelClass}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3}>
          <Box>
            <Chip
              icon={<Wallet size={16} />}
              label="Resident billing centre"
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 600, borderRadius: '999px' }}
            />
            <Typography variant="h4" fontWeight={600} mt={2}>
              Manage your municipal waste bills
            </Typography>
            <Typography variant="body1" color="text.secondary" mt={1.5}>
              Review outstanding invoices, pay securely via Razorpay (UPI, Rupay, cards, net banking),
              and download payment receipts once settled.
            </Typography>
          </Box>
          <Tooltip title="Refresh billing data">
            <span>
              <IconButton
                onClick={loadBills}
                disabled={loading}
                color="primary"
                size="medium"
                aria-label="Refresh billing data"
              >
                {loading ? <CircularProgress size={20} /> : <RefreshCcw size={18} />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {receiptFeedback && (
          <Alert severity={receiptFeedback.type} onClose={() => setReceiptFeedback(null)}>
            {receiptFeedback.message}
          </Alert>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
        ) : (
          <Stack spacing={5}>
            <Card className="rounded-3xl border border-slate-200/80 bg-slate-50/70">
              <CardContent>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={3}
                  alignItems={{ md: 'center' }}
                  justifyContent="space-between"
                >
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Banknote className="h-8 w-8 text-brand-600" />
                    <div>
                      <Typography variant="subtitle1" fontWeight={600}>Outstanding balance</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {summary?.outstandingCount || 0} invoice(s) pending payment
                      </Typography>
                    </div>
                  </Stack>
                  <Typography variant="h4" fontWeight={600}>
                    {formatCurrency(summary?.outstandingTotal || 0)}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>

            {emptyState ? (
              <Card className="rounded-3xl border border-slate-200/70 shadow-sm">
                <CardContent>
                  <Stack spacing={2} alignItems="center" textAlign="center">
                    <CreditCard className="h-8 w-8 text-brand-600" />
                    <Typography variant="h6" fontWeight={600}>You are all caught up!</Typography>
                    <Typography variant="body2" color="text.secondary">
                      There are no outstanding invoices. When new bills are generated, they will appear here.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ) : (
              <Stack spacing={3}>
                <Typography variant="subtitle1" fontWeight={600}>Outstanding bills</Typography>
                <Grid container spacing={3}>
                  {outstandingBills.map(bill => (
                    <Grid item xs={12} key={bill._id}>
                      <BillCard
                        bill={bill}
                        onPay={handlePay}
                        processing={processingBillId === bill._id}
                      />
                    </Grid>
                  ))}
                </Grid>
              </Stack>
            )}

            <Divider />

            <Stack spacing={3}>
              <Stack direction="row" alignItems="center" spacing={2}>
                <Receipt className="h-5 w-5 text-brand-600" />
                <Typography variant="subtitle1" fontWeight={600}>Payment history</Typography>
              </Stack>
              {paidBills.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No payments recorded yet. Complete a payment to see your receipt history.
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {paidBills.map(bill => (
                    <PaidBillRow key={bill._id} bill={bill} onDownloadReceipt={handleDownloadReceipt} />
                  ))}
                </Stack>
              )}
            </Stack>
          </Stack>
        )}
      </Stack>
    </div>
  )
}

BillingPage.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.string,
    _id: PropTypes.string,
    role: PropTypes.string,
  }),
  variant: PropTypes.oneOf(['page', 'embedded']),
}