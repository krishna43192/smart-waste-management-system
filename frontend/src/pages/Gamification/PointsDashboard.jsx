import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Box, Card, CardContent, CardHeader, Chip,
  CircularProgress, Divider, Grid, Stack, Typography, Button, LinearProgress,
} from '@mui/material'
import { Trophy, Star, Gift, Clock, TrendingUp, Award, Zap, CheckCircle } from 'lucide-react'
import PropTypes from 'prop-types'

const ACCENT = '#10b981'
const ACCENT_LIGHT = 'rgba(16,185,129,0.12)'

const ACTION_META = {
  bill_paid:              { label: 'Bill paid on time',        icon: '💳' },
  early_payment:          { label: 'Early bill payment',       icon: '⚡' },
  pickup_requested:       { label: 'Special pickup requested', icon: '🚛' },
  pickup_confirmed:       { label: 'Pickup confirmed',         icon: '✅' },
  bin_collected:          { label: 'Bin collected',            icon: '🗑️' },
  route_completed:        { label: 'Full route completed',     icon: '🏁' },
  route_completed_early:  { label: 'Route finished early',     icon: '🚀' },
  redeemed_bill_discount: { label: 'Redeemed bill discount',   icon: '🎁' },
  redeemed_free_pickup:   { label: 'Redeemed free pickup',     icon: '🎁' },
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <Box sx={{ borderRadius: 4, border: '1px solid', borderColor: 'rgba(15,23,42,0.08)', bgcolor: 'white', px: 3, py: 2.5, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <Stack direction="row" alignItems="center" spacing={1.5} mb={1}>
        <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: accent ?? ACCENT_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </Box>
        <Typography variant="caption" fontWeight={600} color="text.secondary" textTransform="uppercase" letterSpacing={0.5}>{label}</Typography>
      </Stack>
      <Typography variant="h5" fontWeight={800}>{value ?? '—'}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Box>
  )
}

function RewardCard({ reward, currentPoints, onRedeem, redeeming }) {
  const canAfford = currentPoints >= reward.pointsRequired
  const progress = Math.min(100, Math.round((currentPoints / reward.pointsRequired) * 100))
  return (
    <Box sx={{ borderRadius: 4, border: '1px solid', borderColor: canAfford ? 'rgba(16,185,129,0.4)' : 'rgba(15,23,42,0.08)', bgcolor: canAfford ? 'rgba(16,185,129,0.04)' : 'white', p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
        <Box>
          <Typography variant="body1" fontWeight={700}>{reward.icon} {reward.title}</Typography>
          <Typography variant="body2" color="text.secondary">{reward.description}</Typography>
        </Box>
        <Chip label={`${reward.pointsRequired.toLocaleString()} pts`} size="small"
          sx={{ fontWeight: 700, bgcolor: canAfford ? ACCENT : 'rgba(15,23,42,0.06)', color: canAfford ? 'white' : 'text.secondary', borderRadius: '999px' }} />
      </Stack>
      {!canAfford && (
        <Box mb={1.5}>
          <Stack direction="row" justifyContent="space-between" mb={0.5}>
            <Typography variant="caption" color="text.secondary">{currentPoints} / {reward.pointsRequired} pts</Typography>
            <Typography variant="caption" color="text.secondary">{progress}%</Typography>
          </Stack>
          <LinearProgress variant="determinate" value={progress}
            sx={{ height: 6, borderRadius: '999px', bgcolor: 'rgba(15,23,42,0.06)', '& .MuiLinearProgress-bar': { bgcolor: ACCENT } }} />
          <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
            {(reward.pointsRequired - currentPoints).toLocaleString()} more pts needed
          </Typography>
        </Box>
      )}
      <Button variant={canAfford ? 'contained' : 'outlined'} size="small"
        disabled={!canAfford || redeeming} onClick={() => onRedeem(reward.id)}
        startIcon={redeeming ? <CircularProgress size={12} color="inherit" /> : <Gift size={14} />}
        sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600, bgcolor: canAfford ? ACCENT : 'transparent' }}>
        {redeeming ? 'Redeeming…' : canAfford ? 'Redeem now' : 'Not enough points'}
      </Button>
    </Box>
  )
}

function TransactionRow({ tx }) {
  const meta = ACTION_META[tx.action] || { label: tx.description, icon: '⭐' }
  const earned = tx.points > 0
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center"
      sx={{ px: 2, py: 1.5, borderRadius: 3, bgcolor: 'rgba(15,23,42,0.02)', border: '1px solid rgba(15,23,42,0.05)' }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ fontSize: 20 }}>{meta.icon}</Box>
        <Box>
          <Typography variant="body2" fontWeight={600}>{meta.label}</Typography>
          <Typography variant="caption" color="text.secondary">{formatDate(tx.date)}</Typography>
        </Box>
      </Stack>
      <Typography variant="body2" fontWeight={800} sx={{ color: earned ? ACCENT : '#ef4444' }}>
        {earned ? '+' : ''}{tx.points} pts
      </Typography>
    </Stack>
  )
}

export default function PointsDashboard({ session }) {
  const [data, setData] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [redeeming, setRedeeming] = useState(null)
  const [redeemMsg, setRedeemMsg] = useState(null)

  const userId = session?.id ?? session?._id ?? null

  const fetchData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const [pointsRes, historyRes] = await Promise.all([
        fetch(`/api/gamification/my-points?userId=${userId}`),
        fetch(`/api/gamification/history?userId=${userId}&limit=10`),
      ])
      const pointsJson = await pointsRes.json()
      const historyJson = await historyRes.json()
      if (!pointsJson.ok) throw new Error(pointsJson.message)
      setData(pointsJson.data)
      setHistory(historyJson.data?.transactions ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { fetchData() }, [fetchData])

  const handleRedeem = useCallback(async (rewardId) => {
    if (!userId) return
    setRedeeming(rewardId)
    setRedeemMsg(null)
    try {
      const res = await fetch('/api/gamification/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, rewardId }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.message)
      setRedeemMsg({ type: 'success', text: json.data.message })
      await fetchData()
    } catch (err) {
      setRedeemMsg({ type: 'error', text: err.message })
    } finally {
      setRedeeming(null)
    }
  }, [userId, fetchData])

  if (!userId) return (
    <Box className="glass-panel mx-auto mt-4 max-w-4xl rounded-4xl border border-slate-200/70 bg-white/90 p-8 shadow-xl">
      <Alert severity="warning">You must be signed in to view your points.</Alert>
    </Box>
  )

  if (loading) return (
    <Box className="glass-panel mx-auto mt-4 max-w-4xl rounded-4xl border border-slate-200/70 bg-white/90 p-8 shadow-xl">
      <Stack alignItems="center" py={6} spacing={2}>
        <CircularProgress sx={{ color: ACCENT }} />
        <Typography color="text.secondary">Loading your points…</Typography>
      </Stack>
    </Box>
  )

  const totalPoints = data?.points?.total ?? 0
  const thisMonth   = data?.points?.thisMonth ?? 0
  const rank        = data?.points?.rank ?? null
  const rewards     = data?.allRewards ?? []

  return (
    <div className="glass-panel mx-auto mt-4 max-w-4xl rounded-4xl border border-slate-200/70 bg-white/90 p-8 shadow-xl">
      <Stack spacing={5}>
        <Box>
          <Chip icon={<Trophy size={14} />} label="My rewards" color="primary" variant="outlined"
            sx={{ fontWeight: 600, borderRadius: '999px', mb: 2 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
            <Box>
              <Typography variant="h4" fontWeight={800}>Points & Rewards</Typography>
              <Typography variant="body1" color="text.secondary" mt={0.5}>Earn points by paying bills and scheduling pickups</Typography>
            </Box>
            <Stack direction="row" alignItems="center" spacing={1.5}
              sx={{ px: 3, py: 2, borderRadius: 4, bgcolor: ACCENT_LIGHT, border: '1px solid rgba(16,185,129,0.25)' }}>
              <Star size={22} color={ACCENT} fill={ACCENT} />
              <Box>
                <Typography variant="h5" fontWeight={900} color={ACCENT} lineHeight={1}>{totalPoints.toLocaleString()}</Typography>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>total points</Typography>
              </Box>
            </Stack>
          </Stack>
        </Box>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
        {redeemMsg && <Alert severity={redeemMsg.type} onClose={() => setRedeemMsg(null)}>{redeemMsg.text}</Alert>}

        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <StatCard icon={<TrendingUp size={18} color={ACCENT} />} label="This month" value={`+${thisMonth.toLocaleString()} pts`} sub="Points earned this month" accent={ACCENT_LIGHT} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <StatCard icon={<Award size={18} color="#f59e0b" />} label="Your rank" value={rank ? `#${rank}` : 'Unranked'} sub="Among users in your role" accent="rgba(245,158,11,0.1)" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <StatCard icon={<Zap size={18} color="#3b82f6" />} label="Rewards ready" value={rewards.filter(r => totalPoints >= r.pointsRequired).length} sub="Available to redeem now" accent="rgba(59,130,246,0.1)" />
          </Grid>
        </Grid>

        <Card sx={{ borderRadius: 4, border: '1px solid rgba(15,23,42,0.07)', boxShadow: 'none' }}>
          <CardHeader avatar={<CheckCircle size={18} color={ACCENT} />}
            title={<Typography fontWeight={700}>How to earn points</Typography>}
            subheader="Complete these actions to accumulate points" />
          <CardContent>
            <Grid container spacing={1.5}>
              {[
                { icon: '💳', action: 'Pay bill on time',          pts: '+50 pts' },
                { icon: '⚡', action: 'Pay bill before due date',  pts: '+100 pts' },
                { icon: '🚛', action: 'Request special pickup',    pts: '+30 pts' },
                { icon: '✅', action: 'Confirm pickup appointment', pts: '+50 pts' },
              ].map(item => (
                <Grid item xs={12} sm={6} key={item.action}>
                  <Stack direction="row" spacing={1.5} alignItems="center"
                    sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(15,23,42,0.02)', border: '1px solid rgba(15,23,42,0.05)' }}>
                    <Box sx={{ fontSize: 18 }}>{item.icon}</Box>
                    <Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={600}>{item.action}</Typography></Box>
                    <Chip label={item.pts} size="small"
                      sx={{ fontWeight: 700, bgcolor: ACCENT_LIGHT, color: ACCENT, borderRadius: '999px' }} />
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>

        <Box>
          <Typography variant="h6" fontWeight={700} mb={2}>🎁 Redeem your points</Typography>
          <Grid container spacing={2}>
            {rewards.map(reward => (
              <Grid item xs={12} sm={6} key={reward.id}>
                <RewardCard reward={reward} currentPoints={totalPoints} onRedeem={handleRedeem} redeeming={redeeming === reward.id} />
              </Grid>
            ))}
          </Grid>
        </Box>

        <Divider />

        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight={700}>
              <Clock size={18} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
              Recent activity
            </Typography>
            <Button size="small" variant="outlined" onClick={fetchData}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}>
              Refresh
            </Button>
          </Stack>
          {history.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">No activity yet. Pay a bill or request a pickup to earn your first points!</Typography>
            </Box>
          ) : (
            <Stack spacing={1}>{history.map(tx => <TransactionRow key={tx._id} tx={tx} />)}</Stack>
          )}
        </Box>
      </Stack>
    </div>
  )
}

PointsDashboard.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
}
PointsDashboard.defaultProps = { session: null }