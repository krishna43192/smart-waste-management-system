import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Box, Chip, CircularProgress, Grid,
  Stack, Tab, Tabs, Typography,
} from '@mui/material'
import { Trophy, Users, Truck } from 'lucide-react'
import PropTypes from 'prop-types'

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#10b981'

const RANK_STYLES = {
  1: { bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: 'rgba(245,158,11,0.4)', medal: '🥇', color: '#92400e' },
  2: { bg: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', border: 'rgba(100,116,139,0.3)', medal: '🥈', color: '#475569' },
  3: { bg: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)', border: 'rgba(234,88,12,0.3)', medal: '🥉', color: '#9a3412' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopThreeCard({ user, rank }) {
  const style = RANK_STYLES[rank]
  const sizes = { 1: { card: 180, avatar: 64, font: 'h5' }, 2: { card: 160, avatar: 52, font: 'h6' }, 3: { card: 150, avatar: 48, font: 'h6' } }
  const sz = sizes[rank]

  return (
    <Box sx={{
      background: style.bg,
      border: '1px solid', borderColor: style.border,
      borderRadius: 5, p: 3,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: sz.card, justifyContent: 'center',
      boxShadow: rank === 1 ? '0 8px 24px rgba(245,158,11,0.18)' : '0 2px 8px rgba(0,0,0,0.06)',
      transition: 'transform 0.2s',
      '&:hover': { transform: 'translateY(-3px)' },
    }}>
      {/* Avatar circle with initials */}
      <Box sx={{
        width: sz.avatar, height: sz.avatar, borderRadius: '50%',
        bgcolor: style.color, display: 'flex', alignItems: 'center',
        justifyContent: 'center', mb: 1.5,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <Typography variant={sz.font} fontWeight={800} color="white">
          {(user.name || user.email || '?')[0].toUpperCase()}
        </Typography>
      </Box>

      {/* Medal */}
      <Typography sx={{ fontSize: 24, lineHeight: 1, mb: 0.5 }}>{style.medal}</Typography>

      {/* Name */}
      <Typography variant="body2" fontWeight={700} color="text.primary" textAlign="center"
        sx={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {user.name || user.email}
      </Typography>

      {/* Points */}
      <Chip
        label={`${user.totalPoints?.toLocaleString()} pts`}
        size="small"
        sx={{
          mt: 1, fontWeight: 800, borderRadius: '999px',
          bgcolor: 'rgba(255,255,255,0.7)', color: style.color,
          border: `1px solid ${style.border}`,
        }}
      />
    </Box>
  )
}

function LeaderboardRow({ user, currentUserId }) {
  const isMe = user.userId?.toString() === currentUserId?.toString()
  const { rank } = user

  return (
    <Stack
      direction="row" alignItems="center" spacing={2}
      sx={{
        px: 3, py: 2, borderRadius: 3,
        bgcolor: isMe ? 'rgba(16,185,129,0.06)' : 'rgba(15,23,42,0.02)',
        border: '1px solid',
        borderColor: isMe ? 'rgba(16,185,129,0.3)' : 'rgba(15,23,42,0.06)',
        transition: 'background 0.15s',
      }}
    >
      {/* Rank number */}
      <Box sx={{ width: 32, textAlign: 'center' }}>
        {rank <= 3
          ? <Typography sx={{ fontSize: 20 }}>{RANK_STYLES[rank].medal}</Typography>
          : <Typography variant="body2" fontWeight={700} color="text.secondary">#{rank}</Typography>
        }
      </Box>

      {/* Avatar */}
      <Box sx={{
        width: 38, height: 38, borderRadius: '50%',
        bgcolor: isMe ? ACCENT : 'rgba(15,23,42,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Typography variant="body2" fontWeight={800} color={isMe ? 'white' : 'text.secondary'}>
          {(user.name || user.email || '?')[0].toUpperCase()}
        </Typography>
      </Box>

      {/* Name & email */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="body2" fontWeight={700}
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.name || 'Anonymous'}
          </Typography>
          {isMe && (
            <Chip label="You" size="small"
              sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: ACCENT, color: 'white', borderRadius: '999px' }} />
          )}
        </Stack>
        <Typography variant="caption" color="text.secondary"
          sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {user.email}
        </Typography>
      </Box>

      {/* Points */}
      <Chip
        label={`${user.totalPoints?.toLocaleString()} pts`}
        size="small"
        sx={{
          fontWeight: 700, borderRadius: '999px', flexShrink: 0,
          bgcolor: isMe ? 'rgba(16,185,129,0.12)' : 'rgba(15,23,42,0.06)',
          color: isMe ? ACCENT : 'text.secondary',
        }}
      />
    </Stack>
  )
}

function LeaderboardList({ users, currentUserId, emptyMsg }) {
  if (!users?.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">{emptyMsg}</Typography>
      </Box>
    )
  }

  const top3    = users.slice(0, 3)
  const theRest = users.slice(3)

  // Arrange top 3 as: 2nd | 1st | 3rd (podium style)
  const podium = top3.length === 3
    ? [top3[1], top3[0], top3[2]]
    : top3

  return (
    <Stack spacing={3}>
      {/* Podium for top 3 */}
      {top3.length > 0 && (
        <Grid container spacing={2} alignItems="flex-end" justifyContent="center">
          {podium.map(user => (
            <Grid item xs={4} key={user.userId}>
              <TopThreeCard user={user} rank={user.rank} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Rest of the list */}
      {theRest.length > 0 && (
        <Stack spacing={1}>
          {theRest.map(user => (
            <LeaderboardRow key={user.userId} user={user} currentUserId={currentUserId} />
          ))}
        </Stack>
      )}
    </Stack>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Leaderboard({ session }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState(0)   // 0 = residents, 1 = collectors

  const userId = session?.id ?? session?._id ?? null

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/gamification/leaderboard?limit=10')
      const json = await res.json()
      if (!json.ok) throw new Error(json.message)
      setData(json.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeaderboard() }, [fetchLeaderboard])

  const residents  = data?.residents  ?? []
  const collectors = data?.collectors ?? []
  const current    = tab === 0 ? residents : collectors

  return (
    <div className="glass-panel mx-auto mt-4 max-w-3xl rounded-4xl border border-slate-200/70 bg-white/90 p-8 shadow-xl">
      <Stack spacing={5}>

        {/* Header */}
        <Box>
          <Chip
            icon={<Trophy size={14} />}
            label="Community rankings"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600, borderRadius: '999px', mb: 2 }}
          />
          <Typography variant="h4" fontWeight={800} color="text.primary">
            Leaderboard
          </Typography>
          <Typography variant="body1" color="text.secondary" mt={0.5}>
            See who is leading the way in responsible waste management
          </Typography>
        </Box>

        {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{
            borderBottom: '1px solid rgba(15,23,42,0.08)',
            '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
            '& .Mui-selected': { color: ACCENT },
            '& .MuiTabs-indicator': { bgcolor: ACCENT },
          }}
        >
          <Tab
            icon={<Users size={16} />}
            iconPosition="start"
            label={`Residents (${residents.length})`}
          />
          <Tab
            icon={<Truck size={16} />}
            iconPosition="start"
            label={`Collectors (${collectors.length})`}
          />
        </Tabs>

        {/* Content */}
        {loading ? (
          <Stack alignItems="center" py={6} spacing={2}>
            <CircularProgress sx={{ color: ACCENT }} />
            <Typography color="text.secondary">Loading leaderboard…</Typography>
          </Stack>
        ) : (
          <LeaderboardList
            users={current}
            currentUserId={userId}
            emptyMsg={
              tab === 0
                ? 'No residents have earned points yet. Be the first!'
                : 'No collectors have earned points yet.'
            }
          />
        )}

        {/* Footer note */}
        <Box sx={{
          p: 2.5, borderRadius: 3,
          bgcolor: 'rgba(15,23,42,0.02)', border: '1px solid rgba(15,23,42,0.06)',
          textAlign: 'center',
        }}>
          <Typography variant="caption" color="text.secondary">
            Rankings update in real time as points are earned.
            Pay bills early and schedule pickups to climb the leaderboard!
          </Typography>
        </Box>

      </Stack>
    </div>
  )
}

// ─── PropTypes ────────────────────────────────────────────────────────────────

TopThreeCard.propTypes = {
  user: PropTypes.object.isRequired,
  rank: PropTypes.number.isRequired,
}

LeaderboardRow.propTypes = {
  user: PropTypes.object.isRequired,
  currentUserId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
}

LeaderboardList.propTypes = {
  users: PropTypes.array.isRequired,
  currentUserId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  emptyMsg: PropTypes.string,
}

Leaderboard.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
}
Leaderboard.defaultProps = { session: null }