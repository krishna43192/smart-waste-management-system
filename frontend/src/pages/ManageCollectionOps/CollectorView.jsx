import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Chip, LinearProgress } from '@mui/material'
import { AlertTriangle, CheckCircle2, Clock8, Loader2, MapPin, ThermometerSun } from 'lucide-react'

// Hard-coded route context for the field collector mobile view.
const TRUCK_ID = 'TRUCK-01'
const ROUTE_ENDPOINT = `/api/ops/routes/${TRUCK_ID}/today`

// ✅ ADDED: Read logged-in collector's ID from localStorage (same way App.jsx stores it)
function getCollectorId() {
  try {
    const raw = window.localStorage.getItem('sw-user')
    if (!raw) return null
    const user = JSON.parse(raw)
    return user?.id ?? user?._id ?? null
  } catch {
    return null
  }
}

// Provides the on-shift collector with live route progress and completion tools.
export default function CollectorView() {
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingBin, setPendingBin] = useState('')
  const [banner, setBanner] = useState(null)

  // Load the current route once on mount and guard against stale state updates.
  useEffect(() => {
    let isMounted = true
    async function load() {
      try {
        setLoading(true)
        setBanner(null)
        const response = await fetch(ROUTE_ENDPOINT)
        if (!response.ok) {
          throw new Error(`Route fetch failed with status ${response.status}`)
        }
        const payload = await response.json()
        if (!isMounted) return
        setStops(payload?.stops || [])
      } catch (error) {
        console.error('loadCollectorRoute error', error)
        if (!isMounted) return
        setBanner({ tone: 'error', message: 'Unable to load today\'s route. Pull to refresh or try again shortly.' })
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    load()
    return () => { isMounted = false }
  }, [])

  // Persist the collection event and optimistically update the local checklist state.
  const markCollected = useCallback(async binId => {
    try {
      setPendingBin(binId)
      setBanner(null)

      // ✅ ADDED: Get collectorId from localStorage so points can be awarded
      const collectorId = getCollectorId()

      const res = await fetch('/api/ops/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          binId,
          truckId: TRUCK_ID,
          collectorId: collectorId || undefined, // ✅ ADDED: send collectorId for points
        }),
      })
      if (!res.ok) {
        setBanner({ tone: 'error', message: 'Could not mark as collected. Check connectivity and retry.' })
        return
      }
      // DYNAMIC RE-ROUTING: Fetch the updated, re-ordered route from the server
      const updatedRouteRes = await fetch(ROUTE_ENDPOINT)
      if (updatedRouteRes.ok) {
        const payload = await updatedRouteRes.json()
        setStops(payload?.stops || [])
      } else {
        // Fallback optimistic update if fetch fails
        setStops(prev => prev.map(s => s.binId === binId ? { ...s, visited: true } : s))
      }
      setBanner({ tone: 'success', message: `${binId} recorded as collected. +10 points earned!` })
    } catch (error) {
      console.error('markCollected error', error)
      setBanner({ tone: 'error', message: 'Unexpected error. Please retry.' })
    } finally {
      setPendingBin('')
    }
  }, [])

  const completed = useMemo(() => stops.filter(stop => stop.visited).length, [stops])
  const totalStops = stops.length
  const progress = totalStops === 0 ? 0 : Math.round((completed / totalStops) * 100)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="glass-panel rounded-4xl p-6 shadow-xl shadow-slate-200/60">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-slate-900">Today's Route</h3>
            <p className="mt-1 text-sm text-slate-600">Truck TRUCK-01 • Hyderabad GHMC zones</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              icon={<Clock8 className="h-4 w-4" />}
              label="Shift 05:30–13:30"
              size="small"
              variant="outlined"
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
            />
            <Chip
              icon={<ThermometerSun className="h-4 w-4" />}
              label="Clear skies"
              size="small"
              variant="outlined"
              color="info"
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
            />
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
            <span>{completed} completed</span>
            <span>{totalStops - completed} remaining</span>
          </div>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{ borderRadius: 999, height: 8, backgroundColor: 'rgba(148, 163, 184, 0.25)', '& .MuiLinearProgress-bar': { backgroundColor: '#10b981' } }}
          />
        </div>

        {banner && (
          <Alert
            severity={banner.tone === 'success' ? 'success' : 'error'}
            icon={banner.tone === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            variant="outlined"
            sx={{ borderRadius: '16px', mt: 3 }}
          >
            {banner.message}
          </Alert>
        )}
      </div>

      <section className="glass-panel rounded-4xl p-6 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-lg font-semibold text-slate-900">Stop checklist</h4>
          <Chip
            icon={<MapPin className="h-4 w-4" />}
            label={`${totalStops} stops`}
            size="small"
            variant="outlined"
            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
          />
        </div>

        {loading && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
            Loading route…
          </div>
        )}

        {!loading && stops.length === 0 && (
          <Alert
            severity="info"
            icon={<MapPin className="h-4 w-4" />}
            variant="outlined"
            sx={{ borderRadius: '16px', mt: 5 }}
          >
            No route planned yet. Check back once control centre confirms dispatch.
          </Alert>
        )}

        {!loading && stops.length > 0 && (
          <ul className="mt-4 space-y-4">
            {stops.map(stop => {
              const isVisited = Boolean(stop.visited)
              const isPendingAction = pendingBin === stop.binId
              return (
                <li key={stop.binId} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                  <div className="flex min-w-[12rem] flex-col">
                    <span className={`text-sm font-semibold ${isVisited ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{stop.binId}</span>
                    <span className={`flex items-center gap-1 text-xs ${isVisited ? 'text-slate-400 line-through' : 'text-slate-500'}`}>
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      Lat {stop.lat?.toFixed?.(4)} · Lon {stop.lon?.toFixed?.(4)}
                    </span>
                  </div>
                  <Chip
                    icon={isVisited ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    label={isVisited ? 'Done' : 'Pending'}
                    color={isVisited ? 'success' : 'warning'}
                    variant={isVisited ? 'filled' : 'outlined'}
                    size="small"
                    sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
                  />
                  <span className="flex items-center gap-1 text-xs text-slate-500">Est. load {stop.estKg} kg</span>
                  {!isVisited && (
                    <Button
                      onClick={() => markCollected(stop.binId)}
                      disabled={isPendingAction}
                      variant="contained"
                      color="success"
                      size="small"
                      startIcon={isPendingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600, ml: 'auto' }}
                    >
                      {isPendingAction ? 'Saving…' : 'Mark collected'}
                    </Button>
                  )}
                  {/* ✅ UPDATED: Show points earned message when synced */}
                  {isVisited && <span className="ml-auto text-xs font-semibold text-emerald-600">✓ synced +10pts</span>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <aside className="glass-panel rounded-4xl p-6 shadow-inner">
        <h4 className="text-lg font-semibold text-slate-900">Crew notes</h4>
        <ul className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          <li className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">Check bins BIN-003 and BIN-014 for contamination flags.</li>
          <li className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">Report blocked access immediately via radio channel 2.</li>
          <li className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">Capture photo evidence for spill incidents.</li>
          <li className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">Fuel top-up scheduled at 11:45 — do not exceed 70% load before stop #5.</li>
        </ul>
      </aside>
    </div>
  )
}
