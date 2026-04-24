import { useCallback, useEffect, useState } from 'react'
import { Alert, CircularProgress } from '@mui/material'
import { Trophy, Star, RefreshCw, Medal } from 'lucide-react'
import PropTypes from 'prop-types'

// ─── Rank helpers ─────────────────────────────────────────────────────────────

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' }

const RANK_RING = {
  1: 'ring-4 ring-amber-400/60 shadow-amber-200',
  2: 'ring-4 ring-slate-300/70 shadow-slate-100',
  3: 'ring-4 ring-orange-300/60 shadow-orange-100',
}

const RANK_AVATAR_BG = {
  1: 'bg-amber-500',
  2: 'bg-slate-500',
  3: 'bg-orange-500',
}

// ─── Components ───────────────────────────────────────────────────────────────

function Avatar({ name, email, rank, size = 56 }) {
  const initial = (name || email || '?')[0].toUpperCase()
  const bg = RANK_AVATAR_BG[rank] || 'bg-emerald-600'
  const ring = RANK_RING[rank] || ''
  return (
    <div
      className={`flex items-center justify-center rounded-full text-white font-bold shadow-lg ${bg} ${ring}`}
      style={{ width: size, height: size, fontSize: size * 0.38, flexShrink: 0 }}
    >
      {initial}
    </div>
  )
}

function PodiumBlock({ user }) {
  const { rank } = user
  const isFirst = rank === 1
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border p-5 transition-transform hover:-translate-y-1 ${
        isFirst
          ? 'border-amber-300/50 bg-gradient-to-b from-amber-50 to-white shadow-lg shadow-amber-100'
          : rank === 2
          ? 'border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-md'
          : 'border-orange-200/60 bg-gradient-to-b from-orange-50 to-white shadow-md'
      }`}
      style={{ minWidth: 130 }}
    >
      <Avatar name={user.name} email={user.email} rank={rank} size={isFirst ? 68 : 54} />
      <span className="text-2xl leading-none">{MEDALS[rank]}</span>
      <div className="text-center">
        <p className="max-w-[120px] truncate text-sm font-bold text-slate-800">{user.name || 'Anonymous'}</p>
        <p className="mt-0.5 text-xs text-slate-500 truncate max-w-[120px]">{user.email}</p>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
        <Star className="h-3 w-3" />
        {user.totalPoints?.toLocaleString()} pts
      </span>
    </div>
  )
}

function RankRow({ user, currentUserId }) {
  const isMe = user.userId?.toString() === currentUserId?.toString()
  const { rank } = user
  return (
    <div
      className={`flex items-center gap-4 rounded-2xl border px-4 py-3 transition-all hover:shadow-md ${
        isMe
          ? 'border-emerald-300/60 bg-emerald-50/80'
          : 'border-slate-100 bg-white hover:border-slate-200'
      }`}
    >
      {/* Rank */}
      <div className="w-8 shrink-0 text-center">
        {rank <= 3
          ? <span className="text-xl">{MEDALS[rank]}</span>
          : <span className="text-sm font-bold text-slate-400">#{rank}</span>}
      </div>

      {/* Avatar */}
      <Avatar name={user.name} email={user.email} rank={rank} size={40} />

      {/* Name */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold text-slate-800">{user.name || 'Anonymous'}</p>
          {isMe && (
            <span className="shrink-0 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
              You
            </span>
          )}
        </div>
        <p className="truncate text-xs text-slate-400">{user.email}</p>
      </div>

      {/* Points */}
      <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
        isMe ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}>
        <Star className="h-3 w-3" />
        {user.totalPoints?.toLocaleString()} pts
      </span>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Leaderboard({ session }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const userId = session?.id ?? session?._id ?? null

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/gamification/leaderboard?limit=10')
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

  const residents = data?.residents ?? []
  const podium    = residents.slice(0, 3)
  const rest      = residents.slice(3)

  // Re-order podium: 2nd | 1st | 3rd (only when we have 3)
  const orderedPodium = podium.length === 3
    ? [podium[1], podium[0], podium[2]]
    : podium

  return (
    <div className="min-h-screen -mt-6" style={{ background: '#f0f4f8' }}>

      {/* ── Hero header ─────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #047857 60%, #065f46 100%)',
          paddingBottom: 80,
        }}
        className="px-6 pt-12"
      >
        {/* Decorative blobs */}
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <div style={{ position: 'absolute', top: -30, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -10, left: -50, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-200 backdrop-blur-sm mb-5">
            <Trophy className="h-3.5 w-3.5" />
            Community rankings
          </div>

          {/* Title */}
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">
            Resident Leaderboard
          </h1>
          <p className="text-emerald-100/80 text-base mb-6 max-w-md">
            Every pickup scheduled and bill paid on time earns you points.
            Climb the board and show Hyderabad who cares!
          </p>

          {/* How to earn */}
          <div className="flex flex-wrap gap-3">
            {[
              { icon: <Medal className="h-3.5 w-3.5" />, text: '+50 pts — Schedule a pickup' },
              { icon: <Star className="h-3.5 w-3.5" />, text: '+30 pts — Pay bill on time' },
            ].map(item => (
              <div
                key={item.text}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-medium text-emerald-100 backdrop-blur-sm"
              >
                <span className="text-emerald-300">{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main card (overlaps hero by ~40px) ─────────── */}
      <div className="px-6" style={{ maxWidth: 720, margin: '-44px auto 3rem' }}>
        <div className="rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">

          {/* Card header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                <Trophy className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-800">Top Residents</p>
                <p className="text-xs text-slate-400">Ranked by total points earned</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!loading && (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-100">
                  {residents.length} ranked
                </span>
              )}
              <button
                onClick={fetchLeaderboard}
                disabled={loading}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                title="Refresh"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Card body */}
          <div className="p-6">
            {error && (
              <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            {loading ? (
              <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                <CircularProgress size={36} sx={{ color: '#10b981' }} />
                <p className="text-sm">Loading rankings…</p>
              </div>
            ) : residents.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Trophy className="h-12 w-12 text-slate-200" />
                <p className="font-semibold text-slate-600">No residents ranked yet</p>
                <p className="text-sm text-slate-400">Be the first! Schedule a pickup to start earning points.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Podium */}
                {podium.length > 0 && (
                  <div className={`flex gap-4 ${podium.length === 3 ? 'items-end' : 'items-start'} justify-center`}>
                    {orderedPodium.map(user => (
                      <PodiumBlock key={user.userId} user={user} />
                    ))}
                  </div>
                )}

                {/* Divider */}
                {rest.length > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-slate-100" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">More rankings</span>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>
                )}

                {/* Ranked rows */}
                {rest.length > 0 && (
                  <div className="space-y-2">
                    {rest.map(user => (
                      <RankRow key={user.userId} user={user} currentUserId={userId} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card footer */}
          <div className="border-t border-slate-100 px-6 py-4 text-center text-xs text-slate-400 bg-slate-50/50 rounded-b-3xl">
            Rankings update in real time · Schedule pickups and pay bills early to climb the board
          </div>
        </div>
      </div>

    </div>
  )
}

// ─── PropTypes ────────────────────────────────────────────────────────────────

Avatar.propTypes       = { name: PropTypes.string, email: PropTypes.string, rank: PropTypes.number, size: PropTypes.number }
PodiumBlock.propTypes  = { user: PropTypes.object.isRequired }
RankRow.propTypes      = { user: PropTypes.object.isRequired, currentUserId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]) }
Leaderboard.propTypes  = { session: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]) }) }
Leaderboard.defaultProps = { session: null }