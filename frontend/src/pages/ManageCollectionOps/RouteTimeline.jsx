import PropTypes from 'prop-types'
import { memo } from 'react'
import { CheckCircle2, Clock, MapPin } from 'lucide-react'

/**
 * RouteTimeline
 * Vertical numbered stop list shown below the route map.
 * Estimates an arrival time for each stop by dividing total route
 * duration evenly across all stops starting from now.
 *
 * props:
 *   waypoints      — array of stop objects from plan.stops
 *   durationMinutes — total route duration from directions (optional)
 */
function RouteTimeline({ waypoints, durationMinutes }) {
  if (!waypoints || waypoints.length === 0) return null

  const now = new Date()
  const minutesPerStop = durationMinutes && waypoints.length > 0
    ? durationMinutes / waypoints.length
    : null

  const getEta = (index) => {
    if (!minutesPerStop) return null
    const eta = new Date(now.getTime() + minutesPerStop * index * 60000)
    return eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const completedCount = waypoints.filter(s => s.visited).length
  const allDone = completedCount === waypoints.length

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stop sequence</p>
        <span className="text-xs text-slate-500">
          {completedCount}/{waypoints.length} completed
        </span>
      </div>

      {/* Stop list */}
      <div className="max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        <ul className="relative px-4 py-3">
          {/* Vertical connector line */}
          <div className="absolute left-[2.15rem] top-5 bottom-5 w-px bg-slate-200" />

          {waypoints.map((stop, index) => {
            const visited = Boolean(stop.visited)
            const eta = getEta(index)
            const isNext = !visited && waypoints.slice(0, index).every(s => s.visited)

            return (
              <li key={stop.binId} className="relative mb-3 flex items-start gap-3 last:mb-0">
                {/* Step indicator */}
                <div className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors
                  ${visited
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : isNext
                      ? 'border-brand-500 bg-white text-brand-600 ring-2 ring-brand-200'
                      : 'border-slate-200 bg-white text-slate-400'
                  }`}>
                  {visited
                    ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : index + 1
                  }
                </div>

                {/* Stop details */}
                <div className={`flex flex-1 items-start justify-between rounded-xl border px-3 py-2.5 transition-colors
                  ${visited
                    ? 'border-slate-100 bg-slate-50'
                    : isNext
                      ? 'border-brand-200 bg-brand-50/50'
                      : 'border-slate-100 bg-white'
                  }`}>
                  <div className="flex flex-col gap-0.5">
                    <span className={`text-sm font-semibold ${visited ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                      {stop.binId}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <MapPin className="h-3 w-3" />
                      {stop.lat?.toFixed?.(4)}, {stop.lon?.toFixed?.(4)}
                    </span>
                    {stop.estKg && (
                      <span className="text-xs text-slate-400">
                        Est. {stop.estKg} kg
                      </span>
                    )}
                  </div>

                  <div className="ml-3 flex flex-col items-end gap-1 shrink-0">
                    {eta && (
                      <span className={`flex items-center gap-1 text-xs font-medium
                        ${visited ? 'text-slate-400' : isNext ? 'text-brand-600' : 'text-slate-500'}`}>
                        <Clock className="h-3 w-3" />
                        {eta}
                      </span>
                    )}
                    {visited && (
                      <span className="text-xs font-semibold text-emerald-600">Done</span>
                    )}
                    {isNext && !visited && (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">
                        Next
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}

          {/* Return to depot */}
          <li className="relative flex items-start gap-3">
            <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-slate-800 bg-slate-800 text-white">
              <MapPin className="h-3.5 w-3.5" />
            </div>
            <div className={`flex flex-1 items-center rounded-xl border px-3 py-2.5
              ${allDone ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}>
              <span className={`text-sm font-semibold ${allDone ? 'text-emerald-700' : 'text-slate-500'}`}>
                Return to depot
              </span>
              {durationMinutes && (
                <span className="ml-auto flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  {getEta(waypoints.length)}
                </span>
              )}
            </div>
          </li>
        </ul>
      </div>
    </div>
  )
}

RouteTimeline.propTypes = {
  waypoints: PropTypes.arrayOf(PropTypes.shape({
    binId: PropTypes.string.isRequired,
    lat: PropTypes.number,
    lon: PropTypes.number,
    estKg: PropTypes.number,
    visited: PropTypes.bool,
  })).isRequired,
  durationMinutes: PropTypes.number,
}

RouteTimeline.defaultProps = {
  durationMinutes: null,
}

export default memo(RouteTimeline)