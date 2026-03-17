import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { Banknote, CreditCard, Download, ExternalLink, Info, Receipt, RefreshCcw, Wallet } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
const UPI_ID = '6309892648@axl'
const UPI_NAME = 'Smart Waste Hyderabad'

const CURRENCY_FORMATTERS = new Map()
const MS_PER_DAY = 86_400_000

function getCurrencyFormatter(currency) {
  const key = currency?.toUpperCase() || 'INR'
  if (!CURRENCY_FORMATTERS.has(key)) {
    CURRENCY_FORMATTERS.set(
      key,
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: key,
        minimumFractionDigits: 2,
      }),
    )
  }
  return CURRENCY_FORMATTERS.get(key)
}

function formatCurrency(amount, currency = 'INR') {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return '--'
  try {
    return getCurrencyFormatter(currency).format(amount)
  } catch {
    return `₹${amount.toFixed(2)}`
  }
}

function computeDueInDays(dueDate) {
  if (!dueDate) return null
  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return null
  const today = new Date()
  const diff = (due.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / MS_PER_DAY
  return Math.round(diff)
}

// ✅ UPI Payment Dialog
function UpiPaymentDialog({ open, onClose, bill, onConfirm, confirming }) {
  const [utrNumber, setUtrNumber] = useState('')
  const [utrError, setUtrError] = useState('')

  const amount = bill?.amount ?? 0
  const currency = bill?.currency || 'INR'

  const upiUrl = useMemo(() => (
    `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_NAME)}&am=${amount}&cu=INR&tn=${encodeURIComponent(`Bill: ${bill?.invoiceNumber || ''}`)}`
  ), [amount, bill?.invoiceNumber])

  const handleConfirm = () => {
    if (!utrNumber.trim() || utrNumber.trim().length < 6) {
      setUtrError('Please enter a valid UTR / transaction ID (min 6 characters)')
      return
    }
    onConfirm(bill, `UPI-${utrNumber.trim().toUpperCase()}`)
  }

  const handleClose = () => {
    setUtrNumber('')
    setUtrError('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={confirming ? undefined : handleClose} maxWidth="xs" fullWidth>
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
  <QRCodeSVG value={upiUrl} size={200} />
</Box>

          <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, width: '100%', textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">UPI ID</Typography>
            <Typography variant="subtitle1" fontWeight={700} sx={{ letterSpacing: 0.5 }}>
              {UPI_ID}
            </Typography>
            <Typography variant="h5" fontWeight={700} color="primary.main" sx={{ mt: 1 }}>
              {formatCurrency(amount, currency)}
            </Typography>
            {bill?.invoiceNumber ? (
              <Typography variant="caption" color="text.secondary">
                Invoice: {bill.invoiceNumber}
              </Typography>
            ) : null}
          </Box>

          <Alert severity="info" icon={<Info size={18} />} sx={{ width: '100%' }}>
            After paying, enter the UTR / Transaction ID shown in your UPI app to confirm.
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
        <Button onClick={handleClose} disabled={confirming}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={confirming || !utrNumber.trim()}
          startIcon={confirming ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {confirming ? 'Confirming…' : 'Confirm Payment'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

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
                color="info"
                variant="outlined"
                size="small"
                label={new Date(bill.dueDate).toLocaleDateString('en-GB')}
              />
            </Stack>
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={3}>
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
              {processing ? 'Processing…' : 'Pay now via UPI'}
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

function PaidBillRow({ bill, onDownloadReceipt }) {
  const transaction = bill.latestTransaction
  const receiptAvailable = Boolean(transaction?.receiptUrl)

  return (
    <Card className="rounded-2xl border border-slate-200/70 shadow-sm">
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" spacing={3}>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>{bill.invoiceNumber}</Typography>
            <Typography variant="body2" color="text.secondary">
              Paid on {bill.paidAt ? new Date(bill.paidAt).toLocaleString('en-GB') : 'N/A'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} alignItems="center">
            <Chip
              size="small"
              color="success"
              label={`Paid · ${transaction?.paymentMethod?.toUpperCase() || 'UPI'}`}
            />
            <Typography variant="subtitle1" fontWeight={600}>
              {formatCurrency(bill.amount, bill.currency)}
            </Typography>
            {receiptAvailable ? (
              <Button variant="outlined" component="a" href={transaction.receiptUrl} target="_blank" rel="noopener" startIcon={<ExternalLink size={16} />}>
                View receipt
              </Button>
            ) : (
              <Tooltip title="Download receipt">
                <span>
                  <Button variant="outlined" startIcon={<Download size={16} />} onClick={() => onDownloadReceipt(transaction?._id)} disabled={!transaction?._id}>
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

export default function BillingPage({ session = null, variant = 'page' }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [processingBillId, setProcessingBillId] = useState(null)
  const [receiptFeedback, setReceiptFeedback] = useState(null)
  const [upiDialogOpen, setUpiDialogOpen] = useState(false)
  const [selectedBill, setSelectedBill] = useState(null)
  const [upiConfirming, setUpiConfirming] = useState(false)

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

  // ✅ Opens UPI dialog instead of Stripe
  const handlePay = useCallback((bill) => {
    setSelectedBill(bill)
    setUpiDialogOpen(true)
  }, [])

  // ✅ Confirms payment with UTR reference
  const handleUpiConfirm = useCallback(async (bill, paymentReference) => {
    if (!userId || !bill) return
    setUpiConfirming(true)
    setError(null)
    try {
      const response = await fetch('/api/billing/pay-upi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          billId: bill._id,
          paymentReference,
          paymentMethod: 'upi',
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Payment confirmation failed')
      setUpiDialogOpen(false)
      setSelectedBill(null)
      await loadBills()
    } catch (err) {
      setError(err.message)
      setUpiDialogOpen(false)
    } finally {
      setUpiConfirming(false)
    }
  }, [userId, loadBills])

  const handleDownloadReceipt = useCallback(async transactionId => {
    if (!transactionId) return
    setReceiptFeedback(null)
    try {
      const response = await fetch(`/api/billing/transactions/${transactionId}/receipt?userId=${userId}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.message || 'Unable to fetch receipt')

      const receiptBlob = new Blob([JSON.stringify(payload.receipt, null, 2)], { type: 'application/json' })
      const blobUrl = URL.createObjectURL(receiptBlob)
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
            <Chip icon={<Wallet size={16} />} label="Resident billing centre" color="primary" variant="outlined" sx={{ fontWeight: 600, borderRadius: '999px' }} />
            <Typography variant="h4" fontWeight={600} mt={2}>Manage your municipal waste bills</Typography>
            <Typography variant="body1" color="text.secondary" mt={1.5}>
              Review outstanding invoices, pay via UPI, and download payment receipts once settled.
            </Typography>
          </Box>
          <Tooltip title="Refresh billing data">
            <span>
              <IconButton onClick={loadBills} disabled={loading} color="primary" size="medium" aria-label="Refresh billing data">
                {loading ? <CircularProgress size={20} /> : <RefreshCcw size={18} />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {receiptFeedback && <Alert severity={receiptFeedback.type} onClose={() => setReceiptFeedback(null)}>{receiptFeedback.message}</Alert>}

        {loading ? (
          <Box display="flex" justifyContent="center" py={8}><CircularProgress /></Box>
        ) : (
          <Stack spacing={5}>
            <Card className="rounded-3xl border border-slate-200/80 bg-slate-50/70">
              <CardContent>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems={{ md: 'center' }} justifyContent="space-between">
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
                      There are no outstanding invoices. When new bills are generated, they will appear here for payment.
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

      {/* ✅ UPI Payment Dialog */}
      <UpiPaymentDialog
        open={upiDialogOpen}
        onClose={() => { setUpiDialogOpen(false); setSelectedBill(null) }}
        bill={selectedBill}
        onConfirm={handleUpiConfirm}
        confirming={upiConfirming}
      />
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