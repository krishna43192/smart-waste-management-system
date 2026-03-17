import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { Alert, Box, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material'
import { XCircle } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import ConfirmationIllustration from '../../assets/Confirmation.png'
import SpecialCollectionPaymentSuccessCard from '../../components/SpecialCollectionPaymentSuccessCard.jsx'

// Finalises special collection payments and surfaces follow-up actions.
export default function SpecialCollectionCheckoutResult({ session = null }) {
    const location = useLocation()
    const navigate = useNavigate()
    const search = useMemo(() => new URLSearchParams(location.search), [location.search])
    const redirectStatus = search.get('status') || undefined
    const sessionId = search.get('session_id')

    const [state, setState] = useState({
        loading: true,
        error: null,
        request: null,
        paymentStatus: redirectStatus || 'pending',
    })
    const [downloadPending, setDownloadPending] = useState(false)

    // Refetch the payment session details using the redirect parameters provided by Stripe.
    useEffect(() => {
        if (!sessionId) {
            setState({
                loading: false,
                error: 'Missing checkout session. Please try scheduling again.',
                request: null,
                paymentStatus: 'failed',
            })
            return undefined
        }

        let ignore = false

        async function syncCheckout() {
            try {
                const statusQuery = redirectStatus ? `?status=${redirectStatus}` : ''
                const response = await fetch(`/api/schedules/special/payment/checkout/${sessionId}${statusQuery}`)
                let payload = null
                try {
                    payload = await response.json()
                } catch (parseError) {
                    console.warn('Failed to parse checkout details', parseError)
                }

                if (ignore) return

                if (!response.ok) {
                    setState({
                        loading: false,
                        error: payload?.message || 'Payment was not completed. Please start again.',
                        request: null,
                        paymentStatus: 'failed',
                    })
                    return
                }

                setState({
                    loading: false,
                    error: null,
                    request: payload?.request || null,
                    paymentStatus: payload?.status || 'success',
                })
            } catch (error) {
                if (ignore) return
                setState({
                    loading: false,
                    error: error.message || 'We could not verify the payment outcome. Please try again.',
                    request: null,
                    paymentStatus: 'failed',
                })
            }
        }

        syncCheckout()

        return () => {
            ignore = true
        }
        }, [redirectStatus, sessionId])

    const goToSchedule = useCallback(() => {
        navigate('/schedule', { replace: true })
    }, [navigate])

    const goToDashboard = useCallback(() => {
        const target = session?.role === 'admin' ? '/adminDashboard' : '/userDashboard'
        navigate(target, { replace: true })
    }, [navigate, session?.role])

    const { loading, error, request, paymentStatus } = state
    const isSuccess = paymentStatus === 'success' && request

    // Attempt to download the municipal receipt; fall back to alerts on failure.
    const handleDownloadReceipt = useCallback(async () => {
        if (!request) return

        const requestId = request._id || request.id
        const userId = session?.id || session?._id || request.userId

        if (!requestId || !userId) {
            window.alert('We could not verify your session. Please sign in again to download the receipt.')
            return
        }

        try {
            setDownloadPending(true)
            const response = await fetch(`/api/schedules/special/requests/${requestId}/receipt?userId=${encodeURIComponent(userId)}`, {
                headers: {
                    Accept: 'application/pdf',
                },
            })

            if (!response.ok) {
                let message = 'Could not download the receipt. Please try again.'
                try {
                    const payload = await response.json()
                    if (payload?.message) {
                        message = payload.message
                    }
                } catch (parseError) {
                    console.warn('Failed to parse receipt error payload', parseError)
                }
                throw new Error(message)
            }

            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = `special-collection-receipt-${requestId}.pdf`
            document.body.appendChild(anchor)
            anchor.click()
            document.body.removeChild(anchor)
            URL.revokeObjectURL(url)
        } catch (downloadError) {
            console.error('Receipt download failed', downloadError)
            window.alert(downloadError.message || 'Could not download the receipt. Please try again later.')
        } finally {
            setDownloadPending(false)
        }
    }, [request, session?.id, session?._id])

    return (
        <div className="mx-auto flex flex-col gap-4 px-4 py-6 md:px-6 md:py-10" style={{ maxWidth: '1100px' }}>
            {!isSuccess && (
                <Stack spacing={2.5}>
                    <Typography variant="h4" fontWeight={600}>
                        Special pickup payment
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        We use the payment outcome to confirm or release your reserved slot. You can return to the schedule page at any time to pick a different window.
                    </Typography>
                </Stack>
            )}

            {loading ? (
                <Box display="flex" justifyContent="center" py={8}>
                    <CircularProgress />
                </Box>
            ) : (
                <Stack spacing={4}>
                    {error && (
                        <Alert severity="error">{error}</Alert>
                    )}

                    {isSuccess ? (
                        <SpecialCollectionPaymentSuccessCard
                            request={request}
                            onDownloadReceipt={handleDownloadReceipt}
                            downloadPending={downloadPending}
                            illustrationSrc={ConfirmationIllustration}
                            illustrationAlt="Confirmation Illustration"
                            stripeReceiptUrl={request?.stripeReceiptUrl}
                            actions={[
                                { label: 'Go to Dashboard', variant: 'contained', onClick: goToDashboard },
                                { label: 'Schedule Another Pickup', variant: 'outlined', onClick: goToSchedule },
                            ]}
                        />
                    ) : null}

                    {!loading && !isSuccess && !error ? (
                        <Alert severity="info">
                            We have recorded your visit. If you completed payment, refresh this page in a few seconds.
                        </Alert>
                    ) : null}

                    {paymentStatus === 'failed' && !loading && (
                        <Card className="rounded-4xl border border-slate-200/70 shadow-sm">
                            <CardContent>
                                <Stack spacing={2}>
                                    <Stack direction="row" alignItems="center" spacing={2}>
                                        <XCircle className="h-5 w-5 text-red-500" />
                                        <Typography variant="subtitle1" fontWeight={600}>
                                            Payment not completed
                                        </Typography>
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary">
                                        No charges were applied and your slot was released. You can try again with a different time window.
                                    </Typography>
                                </Stack>
                            </CardContent>
                        </Card>
                    )}
                </Stack>
            )}
        </div>
    )
}

SpecialCollectionCheckoutResult.propTypes = {
    session: PropTypes.shape({
        id: PropTypes.string,
        _id: PropTypes.string,
        role: PropTypes.string,
    }),
}
