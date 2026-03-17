import PropTypes from 'prop-types'
import { memo, useMemo } from 'react'

// Presents the optimized route’s key performance metrics in a compact list.
function SummaryCard({ plan, summary, directions }) {
  const items = useMemo(() => ([
    { label: 'Total bins considered', value: summary?.consideredBins ?? '—' },
    { label: 'High priority bins', value: summary?.highPriorityBins ?? '—' },
    { label: 'Estimated distance', value: directions?.distanceKm ? `${directions.distanceKm} km` : `${plan?.distanceKm ?? 0} km` },
    { label: 'Estimated duration', value: directions?.durationMin ? `${directions.durationMin} min` : '—' },
    { label: 'Load collected', value: plan?.loadKg ? `${plan.loadKg} kg` : '—' },
    { label: 'Trucks used', value: summary?.trucks ?? 1 },
    { label: 'Capacity per truck', value: summary?.truckCapacityKg ? `${summary.truckCapacityKg} kg` : '—' },
  ]), [directions, plan, summary])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Route summary</h3>
      <dl className="mt-4 grid gap-3 text-sm text-slate-600">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between">
            <dt>{item.label}</dt>
            <dd className="font-semibold text-slate-900">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

SummaryCard.propTypes = {
  plan: PropTypes.shape({
    distanceKm: PropTypes.number,
    loadKg: PropTypes.number,
  }),
  summary: PropTypes.shape({
    consideredBins: PropTypes.number,
    highPriorityBins: PropTypes.number,
    trucks: PropTypes.number,
    truckCapacityKg: PropTypes.number,
  }),
  directions: PropTypes.shape({
    distanceKm: PropTypes.number,
    durationMin: PropTypes.number,
  }),
}

SummaryCard.defaultProps = {
  plan: null,
  summary: null,
  directions: null,
}

export default memo(SummaryCard)
