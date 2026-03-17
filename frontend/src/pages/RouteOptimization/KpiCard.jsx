import PropTypes from 'prop-types'
import { memo } from 'react'

// Lightweight metric tile used across the optimization dashboard.
function KpiCard({ icon: Icon, label, value, helper }) {
  // Keep the layout minimal so the tile fits inside dense KPI grids.
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
        </div>
        {Icon && (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </div>
  )
}

KpiCard.propTypes = {
  icon: PropTypes.elementType,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  helper: PropTypes.string,
}

KpiCard.defaultProps = {
  icon: undefined,
  helper: undefined,
}

export default memo(KpiCard)
