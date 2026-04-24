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
    <div className="flex flex-col gap-0 min-h-screen bg-slate-50">
      {/* ── Premium Hero Section ───────────────────────────────────────────── */}
      <div className="relative pt-12 pb-44 overflow-hidden bg-gradient-to-br from-[#064e3b] via-[#065f46] to-[#047857]">
        {/* Decorative background elements */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5 mix-blend-overlay"></div>
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-white/5 blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-black/10 blur-2xl pointer-events-none"></div>

        <div className="relative mx-auto max-w-5xl px-6 sm:px-8 z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-200 backdrop-blur-sm mb-5">
              <Trophy className="h-3.5 w-3.5" />
              My Rewards
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight mb-3 drop-shadow-sm">
              Points & Rewards
            </h1>
            <p className="text-emerald-100/90 text-lg max-w-2xl font-medium">
              Earn points by paying bills and scheduling pickups
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-5 py-4 backdrop-blur-md shadow-lg">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-yellow-500 shadow-inner">
              <Star size={26} color="white" fill="white" />
            </div>
            <div>
              <Typography variant="h4" fontWeight={900} color="white" lineHeight={1}>
                {totalPoints.toLocaleString()}
              </Typography>
              <Typography variant="caption" color="rgba(255,255,255,0.8)" fontWeight={600} letterSpacing={0.5} textTransform="uppercase">
                total points
              </Typography>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content Container ─────────────────────────────────────────── */}
      <div className="px-6 sm:px-8 w-full max-w-5xl mx-auto -mt-28 relative z-20 pb-20">
        <div className="glass-panel rounded-4xl bg-white/95 p-6 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-white/40 backdrop-blur-md">
          <Stack spacing={5}>
            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
            {redeemMsg && <Alert severity={redeemMsg.type} onClose={() => setRedeemMsg(null)}>{redeemMsg.text}</Alert>}

            <Grid container spacing={3}>
              <Grid item xs={12} sm={4}>
                <StatCard icon={<TrendingUp size={20} color={ACCENT} />} label="This month" value={`+${thisMonth.toLocaleString()} pts`} sub="Points earned this month" accent={ACCENT_LIGHT} />
              </Grid>
              <Grid item xs={12} sm={4}>
                <StatCard icon={<Award size={20} color="#f59e0b" />} label="Your rank" value={rank ? `#${rank}` : 'Unranked'} sub="Among users in your role" accent="rgba(245,158,11,0.1)" />
              </Grid>
              <Grid item xs={12} sm={4}>
                <StatCard icon={<Zap size={20} color="#3b82f6" />} label="Rewards ready" value={rewards.filter(r => totalPoints >= r.pointsRequired).length} sub="Available to redeem now" accent="rgba(59,130,246,0.1)" />
              </Grid>
            </Grid>

            <Card sx={{ borderRadius: 4, border: '1px solid rgba(15,23,42,0.07)', boxShadow: 'none', bgcolor: 'rgba(248, 250, 252, 0.5)' }}>
              <CardHeader avatar={<CheckCircle size={20} color={ACCENT} />}
                title={<Typography fontWeight={800} fontSize="1.1rem">How to earn points</Typography>}
                subheader="Complete these actions to accumulate points" />
              <CardContent>
                <Grid container spacing={2}>
                  {[
                    { icon: '💳', action: 'Pay bill on time',          pts: '+50 pts' },
                    { icon: '⚡', action: 'Pay bill before due date',  pts: '+100 pts' },
                    { icon: '🚛', action: 'Request special pickup',    pts: '+30 pts' },
                    { icon: '✅', action: 'Confirm pickup appointment', pts: '+50 pts' },
                  ].map(item => (
                    <Grid item xs={12} sm={6} key={item.action}>
                      <Stack direction="row" spacing={2} alignItems="center"
                        sx={{ p: 2, borderRadius: 3, bgcolor: 'white', border: '1px solid rgba(15,23,42,0.06)', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' } }}>
                        <Box sx={{ fontSize: 22, bgcolor: 'rgba(241, 245, 249, 0.8)', p: 1, borderRadius: 2 }}>{item.icon}</Box>
                        <Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={700}>{item.action}</Typography></Box>
                        <Chip label={item.pts} size="small"
                          sx={{ fontWeight: 800, bgcolor: ACCENT_LIGHT, color: ACCENT, borderRadius: '999px', px: 0.5 }} />
                      </Stack>
                    </Grid>
                  ))}
                </Grid>
              </CardContent>
            </Card>

            <Box>
              <Typography variant="h5" fontWeight={800} mb={3} display="flex" alignItems="center" gap={1.5}>
                <span style={{ fontSize: '1.4rem' }}>🎁</span> Redeem your points
              </Typography>
              <Grid container spacing={3}>
                {rewards.map(reward => (
                  <Grid item xs={12} sm={6} key={reward.id}>
                    <RewardCard reward={reward} currentPoints={totalPoints} onRedeem={handleRedeem} redeeming={redeeming === reward.id} />
                  </Grid>
                ))}
              </Grid>
            </Box>

            <Divider sx={{ my: 2 }} />

            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h5" fontWeight={800} display="flex" alignItems="center" gap={1.5}>
                  <Clock size={22} color={ACCENT} />
                  Recent activity
                </Typography>
                <Button size="small" variant="outlined" onClick={fetchData}
                  sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}>
                  Refresh
                </Button>
              </Stack>
              {history.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 6, bgcolor: 'rgba(248, 250, 252, 0.5)', borderRadius: 4, border: '1px dashed rgba(148, 163, 184, 0.3)' }}>
                  <Typography color="text.secondary" fontWeight={500}>No activity yet. Pay a bill or request a pickup to earn your first points!</Typography>
                </Box>
              ) : (
                <Stack spacing={2}>{history.map(tx => <TransactionRow key={tx._id} tx={tx} />)}</Stack>
              )}
            </Box>
          </Stack>
        </div>
      </div>
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