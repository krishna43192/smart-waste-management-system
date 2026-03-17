import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, CardContent, Chip, Divider, LinearProgress } from '@mui/material'
import { Loader2, MapPinned, Share2, FileDown, ShieldCheck, Gauge, Timer, Route as RouteIcon, Truck, Flame, CheckCircle2, AlertTriangle, MapPin } from 'lucide-react'
import RouteMap from './RouteMap.jsx'
import ZoneSelector from '../RouteOptimization/ZoneSelector.jsx'
import MiniZoneMap from '../RouteOptimization/MiniZoneMap.jsx'
import KpiCard from '../RouteOptimization/KpiCard.jsx'
import SummaryCard from '../RouteOptimization/SummaryCard.jsx'
import ProgressSteps from '../RouteOptimization/ProgressSteps.jsx'

// Offline-friendly fallback cities used when the API catalogue is unavailable.
const FALLBACK_CITIES = [
  {
    name: 'Homagama',
    depot: { lat: 6.8442, lon: 80.0031 },
    bbox: [[6.8200, 79.9500], [6.9000, 80.0400]],
    areaSqKm: 13.6,
    population: 91000,
    lastCollectionAt: null,
  },
  {
    name: 'Borella',
    depot: { lat: 6.9147, lon: 79.8733 },
    bbox: [[6.9000, 79.8600], [6.9350, 79.9000]],
    areaSqKm: 9.4,
    population: 118000,
    lastCollectionAt: null,
  },
  {
    name: 'Rajagiriya',
    depot: { lat: 6.9105, lon: 79.8875 },
    bbox: [[6.8950, 79.8700], [6.9400, 79.9200]],
    areaSqKm: 7.8,
    population: 76000,
    lastCollectionAt: null,
  },
]

// Default progress steps mirrored in the progress widget.
const PROGRESS_TEMPLATE = [
  { label: 'Gathering bin telemetry', status: 'idle' },
  { label: 'Balancing truck loads', status: 'idle' },
  { label: 'Sequencing optimal route', status: 'idle' },
  { label: 'Finalizing dispatch plan', status: 'idle' },
]

const INITIAL_ZONE_DETAILS = Object.freeze({ totalBins: '—', areaSize: '—', population: '—', lastCollection: '—' })
const DEFAULT_CAPACITY = 3000
const FUEL_BURN_RATE_L_PER_KM = 0.35
const HIGH_PRIORITY_RATIO = 0.6
const OPTIMIZE_ENDPOINT = '/api/ops/routes/optimize'
const CITIES_ENDPOINT = '/api/ops/cities'
const BINS_ENDPOINT = '/api/ops/bins'
const DIRECTIONS_ENDPOINT = '/api/ops/routes'

const INITIAL_SUMMARY_METRICS = {
  activeZones: null,
  totalZones: null,
  availableTrucks: null,
  fleetSize: null,
  engagedTrucks: null,
  totalBins: null,
}

// Produce a progress step array with updated status values for the UI timeline.
const createProgressState = (activeIndex = -1, status = 'idle') => PROGRESS_TEMPLATE.map((step, index) => {
  if (status === 'done') {
    return { ...step, status: 'done' }
  }
  if (activeIndex === -1) {
    return { ...step, status: 'idle' }
  }
  return { ...step, status: index === activeIndex ? 'active' : index < activeIndex ? 'done' : 'idle' }
})

const formatDateLabel = value => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const formatMetric = value => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString()
  }
  return '—'
}

const formatDuration = minutes => {
  if (!minutes || typeof minutes !== 'number') return '—'
  const hrs = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  if (hrs === 0) return `${mins}m`
  return `${hrs}h ${mins}m`
}

const buildCollectionOpsReport = ({
  city, plan, summaryMetrics, completedStops, remainingStops,
  totalDistanceKm, durationMinutes, capacityLimit, loadProgress,
  routeEfficiencyGain, fuelSavedLiters, topWasteAreas, liveSync,
  highPriorityRatio, directionsSource,
}) => {
  const now = new Date()
  const filename = `collection-ops-report-${city?.toLowerCase().replace(/\s+/g, '-')}-${now.toISOString().slice(0, 10)}.txt`
  const content = [
    `Collection Operations Report`,
    `Generated: ${now.toLocaleString()}`,
    `City: ${city}`,
    `---`,
    `Stops Completed: ${completedStops} / Remaining: ${remainingStops}`,
    `Total Distance: ${totalDistanceKm?.toFixed?.(1) ?? '—'} km`,
    `Duration: ${durationMinutes ? formatDuration(durationMinutes) : '—'}`,
    `Capacity Used: ${loadProgress ?? '—'}% of ${capacityLimit} kg`,
    `Route Efficiency Gain: ${routeEfficiencyGain ?? '—'}%`,
    `Fuel Saved: ${fuelSavedLiters?.toFixed?.(1) ?? '—'} L`,
    `Live Sync: ${liveSync ? 'Enabled' : 'Disabled'}`,
    `Directions Source: ${directionsSource}`,
    `---`,
    `Top Waste Areas:`,
    ...(topWasteAreas?.map((a, i) => `  ${i + 1}. ${a.area} — ${Math.round(a.totalKg)} kg, ${a.stops} stops`) ?? []),
    `---`,
    `Summary Metrics:`,
    `  Active Zones: ${summaryMetrics?.activeZones ?? '—'}`,
    `  Available Trucks: ${summaryMetrics?.availableTrucks ?? '—'}`,
    `  Total Bins: ${summaryMetrics?.totalBins ?? '—'}`,
  ].join('\n')
  return { filename, content }
}

// Coordinates the end-to-end optimization workflow for operations managers.
export default function ManageCollectionOpsPage() {
  const [cities, setCities] = useState([])
  const [city, setCity] = useState('')
  const [plan, setPlan] = useState(null)
  const [directions, setDirections] = useState(null)
  const [bins, setBins] = useState([])
  const [zoneDetails, setZoneDetails] = useState(INITIAL_ZONE_DETAILS)
  const [progressSteps, setProgressSteps] = useState(createProgressState())
  const [loading, setLoading] = useState(false)
  const [planFetching, setPlanFetching] = useState(false)
  const [error, setError] = useState('')
  const [lastOptimizedAt, setLastOptimizedAt] = useState(null)
  const [liveSync, setLiveSync] = useState(false)
  const [pendingBin, setPendingBin] = useState('')
  const [collectorBanner, setCollectorBanner] = useState(null)
  const [summaryMetrics, setSummaryMetrics] = useState(INITIAL_SUMMARY_METRICS)

  const selectedCity = useMemo(() => cities.find(entry => entry.name === city), [cities, city])

  const loadSummary = useCallback(async ({ signal } = {}) => {
    try {
      const res = await fetch('/api/ops/summary', { signal })
      if (!res.ok) {
        throw new Error(`Failed to load summary (${res.status})`)
      }
      const data = await res.json()
      if (signal?.aborted) {
        return
      }
      setSummaryMetrics({
        activeZones: typeof data.activeZones === 'number' ? data.activeZones : null,
        totalZones: typeof data.totalZones === 'number' ? data.totalZones : null,
        availableTrucks: typeof data.availableTrucks === 'number' ? data.availableTrucks : null,
        fleetSize: typeof data.fleetSize === 'number' ? data.fleetSize : null,
        engagedTrucks: typeof data.engagedTrucks === 'number' ? data.engagedTrucks : null,
        totalBins: typeof data.totalBins === 'number' ? data.totalBins : null,
      })
    } catch (err) {
      if (signal?.aborted) {
        return
      }
      console.error('loadSummary error', err)
      setSummaryMetrics(metrics => ({ ...metrics }))
    }
  }, [])

  const fetchDirections = useCallback(async (truckId, { signal } = {}) => {
    if (!truckId) return null
    try {
      const dirRes = await fetch(`/api/ops/routes/${encodeURIComponent(truckId)}/directions`, { signal })
      if (!dirRes.ok) {
        throw new Error(`Directions failed (${dirRes.status})`)
      }
      const data = await dirRes.json()
      if (signal?.aborted) {
        return null
      }
      return data
    } catch (err) {
      if (signal?.aborted) {
        return null
      }
      console.error('directions error', err)
      return null
    }
  }, [])

  const loadPlan = useCallback(async ({ city: cityOverride, signal } = {}) => {
    const targetCity = cityOverride ?? city
    if (!targetCity) return

    setPlanFetching(true)

    try {
      const res = await fetch(`/api/ops/routes/by-city?city=${encodeURIComponent(targetCity)}`, { signal })
      if (signal?.aborted) {
        return
      }

      if (res.status === 404) {
        setPlan(null)
        setDirections(null)
        setLastOptimizedAt(null)
        return
      }

      if (!res.ok) {
        throw new Error(`Failed to load plan (${res.status})`)
      }

      const data = await res.json()
      if (signal?.aborted) {
        return
      }

      const normalized = {
        ...data,
        depot: data.depot || selectedCity?.depot || null,
        summary: data.summary || {},
      }

      const totalStops = Array.isArray(normalized.stops) ? normalized.stops.length : 0
      const completedCount = Array.isArray(normalized.stops) ? normalized.stops.filter(stop => stop.visited).length : 0
      normalized.summary = {
        ...normalized.summary,
        completedStops: completedCount,
        pendingStops: Math.max(totalStops - completedCount, 0),
      }

      setPlan(normalized)

      if (data.updatedAt) {
        const updated = new Date(data.updatedAt)
        if (!Number.isNaN(updated.getTime())) {
          setLastOptimizedAt(updated)
        }
      }

      if (data.truckId) {
        const directionData = await fetchDirections(data.truckId, { signal })
        if (signal?.aborted) {
          return
        }
        if (directionData) {
          setDirections({ ...directionData, truckId: data.truckId })
        } else {
          setDirections(null)
        }
      } else {
        setDirections(null)
      }
    } catch (err) {
      if (signal?.aborted) {
        return
      }
      console.error('loadPlan error', err)
    } finally {
      setPlanFetching(false)
    }
  }, [city, selectedCity, fetchDirections])

  // Load the managed city catalogue, falling back to static data when the API fails.
  useEffect(() => {
    let ignore = false
    async function loadCities() {
      try {
        const res = await fetch(CITIES_ENDPOINT)
        if (!res.ok) {
          throw new Error(`Failed to load cities (${res.status})`)
        }
        const data = await res.json()
        if (!ignore) {
          const list = Array.isArray(data) && data.length ? data : FALLBACK_CITIES
          setCities(list)
          setCity(list[0]?.name || '')
        }
      } catch (err) {
        console.error('loadCities error', err)
        if (!ignore) {
          setCities(FALLBACK_CITIES)
          setCity(FALLBACK_CITIES[0]?.name || '')
        }
      }
    }

    const summaryController = new AbortController()
    loadCities()
    loadSummary({ signal: summaryController.signal })
    return () => {
      ignore = true
      summaryController.abort()
    }
  }, [loadSummary])

  // Whenever the selected city changes, fetch bins scoped to that municipality.
  useEffect(() => {
    if (!city) return
    let ignore = false

    async function loadBins() {
      try {
        const res = await fetch(`${BINS_ENDPOINT}?city=${encodeURIComponent(city)}`)
        if (!res.ok) {
          throw new Error(`Failed to load bins (${res.status})`)
        }
        const data = await res.json()
        if (!ignore) {
          setBins(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        console.error('loadBins error', err)
        if (!ignore) {
          setBins([])
        }
      }
    }

    loadBins()
    return () => {
      ignore = true
    }
  }, [city])

  // Reset derived state whenever the active city changes.
  useEffect(() => {
    setPlan(null)
    setDirections(null)
    setError('')
    setLastOptimizedAt(null)
    setProgressSteps(createProgressState())
  }, [city])

  useEffect(() => {
    if (!city || !liveSync) return undefined

    const controller = new AbortController()
    loadPlan({ city, signal: controller.signal })

    const handleFocus = () => {
      loadPlan({ city })
    }

    const interval = setInterval(() => {
      loadPlan({ city })
    }, 10000)

    window.addEventListener('focus', handleFocus)

    return () => {
      controller.abort()
      window.removeEventListener('focus', handleFocus)
      clearInterval(interval)
    }
  }, [city, liveSync, loadPlan])

  const currentDepot = plan?.depot ?? selectedCity?.depot
  const depotLat = currentDepot?.lat ? currentDepot.lat.toFixed(3) : '—'
  const depotLon = currentDepot?.lon ? currentDepot.lon.toFixed(3) : '—'
  const capacityLimit = plan?.summary?.truckCapacityKg ?? DEFAULT_CAPACITY

  useEffect(() => {
    if (!selectedCity) {
      setZoneDetails({ totalBins: bins.length || '—', areaSize: '—', population: '—', lastCollection: '—' })
      return
    }
    const totalBins = bins.length > 0 ? bins.length : '—'
    const area = typeof selectedCity.areaSqKm === 'number'
      ? selectedCity.areaSqKm.toLocaleString(undefined, { maximumFractionDigits: 1 })
      : '—'
    const population = typeof selectedCity.population === 'number'
      ? selectedCity.population.toLocaleString()
      : '—'
    const lastCollection = formatDateLabel(selectedCity.lastCollectionAt)

    setZoneDetails({
      totalBins,
      areaSize: area,
      population,
      lastCollection,
    })
  }, [selectedCity, bins.length])

  // Request a fresh optimized route plan and update progress indicators as we go.
  const optimize = useCallback(async () => {
    if (!city) return
    setLoading(true)
    setError('')
    setProgressSteps(createProgressState(0))
    try {
      const res = await fetch(OPTIMIZE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city }),
      })

      if (!res.ok) {
        throw new Error(`Optimize failed with status ${res.status}`)
      }

      const data = await res.json()
      const normalized = {
        ...data,
        depot: data.depot || selectedCity?.depot || null,
        summary: data.summary || {},
      }
      const totalStops = Array.isArray(normalized.stops) ? normalized.stops.length : 0
      const completedCount = Array.isArray(normalized.stops) ? normalized.stops.filter(stop => stop.visited).length : 0
      normalized.summary = {
        ...normalized.summary,
        completedStops: completedCount,
        pendingStops: Math.max(totalStops - completedCount, 0),
      }
      setPlan(normalized)
      setLastOptimizedAt(new Date())
      setProgressSteps(createProgressState(-1, 'done'))

      if (normalized.truckId) {
        try {
          const dirRes = await fetch(`${DIRECTIONS_ENDPOINT}/${encodeURIComponent(normalized.truckId)}/directions`)
          if (!dirRes.ok) {
            throw new Error(`Directions failed (${dirRes.status})`)
          }
          const directionsData = await dirRes.json()
          setDirections(directionsData)
        } catch (directionErr) {
          console.error('directions error', directionErr)
          setDirections(null)
        }
      } else {
        setDirections(null)
      }

      await loadSummary()
      setLiveSync(true)
    } catch (err) {
      console.error('optimize error', err)
      setError('Could not optimize right now. Please try again in a moment.')
      setProgressSteps(createProgressState())
    } finally {
      setLoading(false)
    }
  }, [city, selectedCity, loadSummary])

  const markCollected = useCallback(async binId => {
    if (!binId) return
    if (!plan?.truckId) {
      setCollectorBanner({ tone: 'error', message: 'No truck assignment found. Generate a plan before recording collections.' })
      return
    }

    try {
      setPendingBin(binId)
      setCollectorBanner(null)
      const res = await fetch('/api/ops/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ binId, truckId: plan.truckId }),
      })
      if (!res.ok) {
        throw new Error(`collection failed ${res.status}`)
      }

      setCollectorBanner({ tone: 'success', message: `${binId} recorded as collected.` })
      setPlan(prev => {
        if (!prev) return prev
        const updatedStops = (prev.stops || []).map(stop => (stop.binId === binId ? { ...stop, visited: true } : stop))
        const completedCount = updatedStops.filter(stop => stop.visited).length
        return {
          ...prev,
          stops: updatedStops,
          summary: {
            ...prev.summary,
            completedStops: completedCount,
            pendingStops: Math.max(updatedStops.length - completedCount, 0),
          },
        }
      })

      await loadPlan({ city })
      await loadSummary()
    } catch (err) {
      console.error('markCollected error', err)
      setCollectorBanner({ tone: 'error', message: 'Could not mark as collected. Please try again.' })
    } finally {
      setPendingBin('')
    }
  }, [plan?.truckId, loadPlan, city, loadSummary])

  const loadProgress = plan && capacityLimit > 0
    ? Math.min(100, Math.round(((plan.loadKg ?? 0) / capacityLimit) * 100))
    : null

  const waypoints = useMemo(() => {
    if (!Array.isArray(plan?.stops)) {
      return []
    }
    return plan.stops
  }, [plan])

  const totalDistanceSource = directions?.distanceKm ?? plan?.distanceKm ?? 0
  const totalDistanceKm = typeof totalDistanceSource === 'number' ? totalDistanceSource : Number(totalDistanceSource) || 0
  const completedStops = useMemo(() => waypoints.filter(stop => stop.visited).length, [waypoints])
  const remainingStops = waypoints.length - completedStops
  const routeProgress = waypoints.length
    ? Math.round((completedStops / waypoints.length) * 100)
    : 0
  const baselineDistanceKm = useMemo(() => {
    if (!plan) return null
    const reported = plan.summary?.baselineDistanceKm
    if (typeof reported === 'number' && reported > 0) {
      return reported
    }
    if (!waypoints.length) return null
    const assumedLegKm = 2.2
    return Number((waypoints.length * assumedLegKm).toFixed(1))
  }, [plan, waypoints.length])

  const distanceSavedKm = baselineDistanceKm && typeof totalDistanceKm === 'number'
    ? Math.max(0, Number((baselineDistanceKm - totalDistanceKm).toFixed(1)))
    : 0
  const routeEfficiencyGain = baselineDistanceKm && typeof totalDistanceKm === 'number' && baselineDistanceKm > 0
    ? Math.max(0, Math.min(100, Math.round(((baselineDistanceKm - totalDistanceKm) / baselineDistanceKm) * 100)))
    : null
  const fuelSavedLiters = distanceSavedKm > 0
    ? Number((distanceSavedKm * FUEL_BURN_RATE_L_PER_KM).toFixed(1))
    : 0

  const areaLookup = useMemo(() => {
    const mapping = new Map()
    bins.forEach(bin => {
      if (!bin?.binId) return
      const areaLabel = bin.area || (bin.city ? `${bin.city} sector` : 'Unassigned sector')
      mapping.set(bin.binId, areaLabel)
    })
    return mapping
  }, [bins])

  const topWasteAreas = useMemo(() => {
    if (!plan?.stops?.length) return []
    const tallies = new Map()
    plan.stops.forEach(stop => {
      const areaName = areaLookup.get(stop.binId) || 'Unassigned sector'
      const current = tallies.get(areaName) || { area: areaName, totalKg: 0, stops: 0 }
      current.totalKg += Number(stop.estKg) || 0
      current.stops += 1
      tallies.set(areaName, current)
    })
    return Array.from(tallies.values())
      .sort((a, b) => b.totalKg - a.totalKg)
      .slice(0, 3)
  }, [plan?.stops, areaLookup])

  const handleExportReport = useCallback(() => {
    if (!plan) {
      setError('Generate a route before exporting a report.')
      return
    }

    setError('')

    const { filename, content } = buildCollectionOpsReport({
      city,
      plan,
      summaryMetrics,
      completedStops,
      remainingStops,
      totalDistanceKm,
      durationMinutes: directions?.durationMin,
      capacityLimit,
      loadProgress,
      routeEfficiencyGain,
      fuelSavedLiters,
      topWasteAreas,
      liveSync,
      highPriorityRatio: HIGH_PRIORITY_RATIO,
      directionsSource: directions?.line ? 'OSRM road geometry' : 'Fallback heuristic',
    })

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [plan, city, summaryMetrics, completedStops, remainingStops, totalDistanceKm, directions, capacityLimit, loadProgress, routeEfficiencyGain, fuelSavedLiters, topWasteAreas, liveSync])

  const summaryHighlights = useMemo(() => {
    const { activeZones, totalZones, availableTrucks, fleetSize, engagedTrucks, totalBins } = summaryMetrics

    const activeHelper = typeof totalZones === 'number'
      ? `${typeof activeZones === 'number' ? Math.min(activeZones, totalZones).toLocaleString() : '—'} of ${totalZones.toLocaleString()} zones serviced last 7 days`
      : 'Based on last 7 days of collections'

    const trucksHelper = typeof fleetSize === 'number'
      ? `${typeof engagedTrucks === 'number' ? engagedTrucks.toLocaleString() : '—'} deployed / ${fleetSize.toLocaleString()} total`
      : 'Fleet readiness'

    return [
      {
        label: 'Active zones',
        value: formatMetric(activeZones),
        helper: activeHelper,
      },
      {
        label: 'Available trucks',
        value: formatMetric(availableTrucks),
        helper: trucksHelper,
      },
      {
        label: 'Total bins',
        value: formatMetric(totalBins),
        helper: 'Across all active councils',
      },
    ]
  }, [summaryMetrics])

  const kpis = useMemo(() => {
    const stops = plan?.stops?.length ?? (loading ? '…' : '—')
    const distanceLabel = totalDistanceKm > 0 ? `${totalDistanceKm.toFixed(1)} km` : loading ? '…' : '—'
    const durationLabel = directions?.durationMin ? formatDuration(directions.durationMin) : loading ? '…' : '—'
    const loadLabel = plan ? `${plan.loadKg ?? 0} kg` : loading ? '…' : '—'
    const thresholdLabel = plan?.summary?.threshold
      ? `Threshold ≥ ${Math.round(plan.summary.threshold * 100)}%`
      : 'Current settings'

    return [
      {
        label: 'Stops scheduled',
        value: stops,
        helper: plan ? `${plan.summary?.consideredBins ?? stops} bins considered` : 'Awaiting latest plan',
        icon: MapPinned,
      },
      {
        label: 'Predicted distance',
        value: distanceLabel,
        helper: directions?.line ? 'OSRM estimated distance' : 'Based on plan metrics',
        icon: RouteIcon,
      },
      {
        label: 'Estimated duration',
        value: durationLabel,
        helper: directions?.line ? 'Live traffic heuristics' : 'Configure directions to enable ETA',
        icon: Timer,
      },
      {
        label: 'Load collected',
        value: loadLabel,
        helper: plan ? `Capacity ${capacityLimit} kg • ${thresholdLabel}` : thresholdLabel,
        icon: Gauge,
      },
    ]
  }, [plan, directions, loading, capacityLimit, totalDistanceKm])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6">
      <section className="glass-panel rounded-4xl p-8 shadow-xl shadow-brand-500/20">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full">
            <h2 className="text-3xl font-semibold text-slate-900">Manage Collection Operations</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-600">Generate and manage optimized routes for council zones</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {summaryHighlights.map(item => (
                <div key={item.label} className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.helper}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button
              onClick={handleExportReport}
              variant="contained"
              startIcon={<FileDown className="h-4 w-4" />}
              disabled={!plan}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600, paddingInline: '1.35rem' }}
            >
              Export report
            </Button>
            <Chip
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label="Service level normal"
              color="success"
              variant="outlined"
              sx={{ borderRadius: '999px', fontWeight: 600, textTransform: 'none' }}
            />
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-6">
            <ZoneSelector
              cities={cities}
              selectedCity={city}
              zoneDetails={zoneDetails}
              onSelectCity={setCity}
              onGenerate={optimize}
              loading={loading}
              actionLabel="Generate Optimized Route"
            />

            {error && (
              <Alert severity="error" variant="outlined">{error}</Alert>
            )}

            {loading && <ProgressSteps steps={progressSteps} />}

            {cities.length > 0 && (
              <MiniZoneMap cities={cities} selectedCity={city} onSelectCity={setCity} />
            )}

            <Card className="rounded-3xl border border-slate-200/70 bg-white/90">
              <CardContent className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <MapPinned className="h-3.5 w-3.5 text-emerald-500" />
                  Depot: {selectedCity?.name ?? '—'} ({depotLat} · {depotLon})
                </span>
                {lastOptimizedAt && <span>Last run: {lastOptimizedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                <span className="inline-flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-slate-500" />
                  Truck default: {plan?.truckId || 'TRUCK-01'}
                </span>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {kpis.map(kpi => (
                <KpiCard
                  key={kpi.label}
                  icon={kpi.icon}
                  label={kpi.label}
                  value={kpi.value}
                  helper={kpi.helper}
                />
              ))}
            </div>

            <SummaryCard plan={plan} summary={plan?.summary} directions={directions} />

            <Card className="glass-panel rounded-3xl border border-slate-200/70 bg-slate-950/95 text-slate-100 shadow-lg shadow-slate-900/40">
              <CardContent className="space-y-5 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm uppercase tracking-wide text-slate-400">High waste areas</h3>
                    <p className="mt-1 text-sm text-slate-300">Focus crews on sectors generating the heaviest loads from today&apos;s plan.</p>
                  </div>
                  <Chip
                    icon={<Flame className="h-3.5 w-3.5" />}
                    label={routeEfficiencyGain !== null ? `${routeEfficiencyGain}% gain` : 'Route active'}
                    color="warning"
                    size="small"
                    variant="outlined"
                    sx={{ borderRadius: '999px', fontWeight: 600, textTransform: 'none' }}
                  />
                </div>

                {topWasteAreas.length > 0 ? (
                  <ul className="space-y-3">
                    {topWasteAreas.map((entry, index) => (
                      <li key={entry.area} className="flex items-center gap-3 rounded-2xl bg-slate-900/70 px-4 py-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/20 text-sm font-semibold text-amber-300">#{index + 1}</span>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-white">{entry.area}</span>
                          <span className="text-xs text-slate-400">Approx. {Math.round(entry.totalKg)} kg • {entry.stops} stops</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-2xl bg-slate-900/70 px-4 py-3 text-xs text-slate-400">
                    Optimize a route to surface the most critical areas for today&apos;s shift.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="glass-panel rounded-3xl border border-slate-200/70">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Route timeline</h3>
              <span className="text-xs uppercase tracking-wide text-slate-500">{waypoints.length} stops</span>
            </div>

            <div className="mt-6 space-y-6">
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-inner">
                {plan ? (
                  <RouteMap plan={plan} depot={currentDepot} />
                ) : (
                  <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm text-slate-500">
                    Generate a route to preview today&apos;s timeline.
                  </div>
                )}
              </div>

              <div className="space-y-3 text-sm text-slate-500">
                {loading && (
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100/80 px-4 py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                    Calculating best route…
                  </div>
                )}
                {!loading && planFetching && liveSync && (
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                    Syncing live updates from Collector crews…
                  </div>
                )}
                {!loading && !plan && !planFetching && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center">
                    Run an optimization to generate a stop list for today&apos;s shift.
                  </div>
                )}
                {plan && !loading && !planFetching && (
                  <p className="text-xs text-slate-500">Crew updates sync automatically once collector progress is recorded.</p>
                )}
              </div>

              {plan && waypoints.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Route efficiency</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{routeEfficiencyGain !== null ? `${routeEfficiencyGain}%` : '—'}</p>
                    <p className="text-xs text-slate-500">Versus baseline distance of {baselineDistanceKm ? `${baselineDistanceKm.toFixed?.(1) ?? baselineDistanceKm} km` : '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Fuel saved</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{fuelSavedLiters.toFixed(1)} L</p>
                    <p className="text-xs text-slate-500">About {distanceSavedKm.toFixed(1)} km less driving today</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card id="collector-checklist" className="glass-panel rounded-3xl border border-slate-200/70 bg-white/95">
          <CardContent className="flex h-full flex-col gap-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Field collector</p>
                <h4 className="text-lg font-semibold text-slate-900">Stop checklist</h4>
                <p className="text-xs text-slate-500">{plan ? 'Record collections without leaving the control centre.' : 'Generate a plan to unlock the digital checklist.'}</p>
              </div>
              <div className="flex flex-col items-end gap-2 text-xs text-slate-500">
                <Chip
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  label={`${completedStops} collected`}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ borderRadius: '999px', fontWeight: 600, textTransform: 'none' }}
                />
                <span>{plan ? `${remainingStops} remaining • ${routeProgress}% complete` : 'No route active'}</span>
              </div>
            </div>

            <LinearProgress
              variant="determinate"
              value={plan ? routeProgress : 0}
              sx={{
                borderRadius: 999,
                height: 8,
                backgroundColor: 'rgba(148, 163, 184, 0.25)',
                '& .MuiLinearProgress-bar': { backgroundColor: '#10b981' },
              }}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-400">Capacity utilization</p>
                <LinearProgress
                  variant="determinate"
                  value={plan ? loadProgress ?? 0 : 0}
                  sx={{ borderRadius: 999, height: 6, backgroundColor: 'rgba(148, 163, 184, 0.25)', '& .MuiLinearProgress-bar': { backgroundColor: '#0ea5e9' } }}
                />
                <p className="mt-2 text-xs text-slate-500">{plan ? `${plan.loadKg ?? 0} kg / ${capacityLimit} kg` : 'Awaiting plan data'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-400">Stops completed</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{plan ? `${completedStops}/${waypoints.length}` : '—'}</p>
                <p className="text-xs text-slate-500">Live sync enabled after optimization</p>
              </div>
            </div>

            {collectorBanner && (
              <Alert
                severity={collectorBanner.tone === 'success' ? 'success' : 'error'}
                icon={collectorBanner.tone === 'success'
                  ? <CheckCircle2 className="h-4 w-4" />
                  : <AlertTriangle className="h-4 w-4" />}
                variant="outlined"
                sx={{ borderRadius: '16px' }}
              >
                {collectorBanner.message}
              </Alert>
            )}

            <div className="flex-1 overflow-hidden">
              {waypoints.length === 0 ? (
                <Alert
                  severity="info"
                  icon={<MapPin className="h-4 w-4" />}
                  variant="outlined"
                  sx={{ borderRadius: '16px' }}
                >
                  No stops scheduled yet. Run an optimization to populate today&apos;s checklist.
                </Alert>
              ) : (
                <div className="max-h-[360px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                  <ul className="space-y-3 pr-1">
                    {waypoints.map(stop => {
                      const visited = Boolean(stop.visited)
                      const isPending = pendingBin === stop.binId
                      return (
                        <li key={stop.binId} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                          <div className="flex min-w-[12rem] flex-col">
                            <span className={`text-sm font-semibold ${visited ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{stop.binId}</span>
                            <span className={`flex items-center gap-1 text-xs ${visited ? 'text-slate-400 line-through' : 'text-slate-500'}`}>
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              Lat {stop.lat?.toFixed?.(4)} · Lon {stop.lon?.toFixed?.(4)}
                            </span>
                          </div>
                          <Chip
                            icon={visited ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                            label={visited ? 'Done' : 'Pending'}
                            color={visited ? 'success' : 'warning'}
                            variant={visited ? 'filled' : 'outlined'}
                            size="small"
                            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
                          />
                          <span className="flex items-center gap-1 text-xs text-slate-500">Est. load {stop.estKg} kg</span>
                          {!visited && (
                            <Button
                              onClick={() => markCollected(stop.binId)}
                              disabled={isPending}
                              variant="contained"
                              color="success"
                              size="small"
                              startIcon={isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600, marginLeft: 'auto' }}
                            >
                              Mark collected
                            </Button>
                          )}
                          {visited && <span className="ml-auto text-xs font-semibold text-emerald-600">Synced</span>}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}