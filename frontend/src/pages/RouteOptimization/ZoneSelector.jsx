import PropTypes from 'prop-types'
import { memo } from 'react'
import { Button, MenuItem, Select } from '@mui/material'

// Selection panel for choosing the target city before running optimization.
function ZoneSelector({
  cities,
  selectedCity,
  zoneDetails,
  onSelectCity,
  onGenerate,
  loading,
  actionLabel,
}) {
  // Present the municipal context details alongside the trigger for optimization runs.
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">City / Zone</p>
          <Select
            fullWidth
            value={selectedCity || ''}
            onChange={event => onSelectCity(event.target.value)}
            size="small"
            sx={{ mt: 1, borderRadius: '999px' }}
          >
            {cities.map(city => (
              <MenuItem key={city.name} value={city.name}>{city.name}</MenuItem>
            ))}
          </Select>
        </div>

        <div className="grid gap-3 rounded-xl border border-slate-200/70 bg-slate-50/60 p-4 text-sm text-slate-600">
          <div className="flex items-center justify-between">
            <span>Total bins</span>
            <span className="font-semibold text-slate-900">{zoneDetails.totalBins ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Area size</span>
            <span className="font-semibold text-slate-900">{zoneDetails.areaSize ?? '—'} km²</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Population</span>
            <span className="font-semibold text-slate-900">{zoneDetails.population ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Last collection</span>
            <span className="font-semibold text-slate-900">{zoneDetails.lastCollection ?? '—'}</span>
          </div>
        </div>

        <Button
          variant="contained"
          color="success"
          onClick={onGenerate}
          disabled={loading || !selectedCity}
          sx={{ borderRadius: '999px', fontWeight: 600, textTransform: 'none', py: 1.2 }}
        >
          {loading ? 'Calculating…' : actionLabel}
        </Button>
      </div>
    </div>
  )
}

ZoneSelector.propTypes = {
  cities: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
  })).isRequired,
  selectedCity: PropTypes.string,
  zoneDetails: PropTypes.shape({
    totalBins: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    areaSize: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    population: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    lastCollection: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  onSelectCity: PropTypes.func.isRequired,
  onGenerate: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  actionLabel: PropTypes.string,
}

ZoneSelector.defaultProps = {
  selectedCity: '',
  loading: false,
  actionLabel: 'Generate Optimized Route',
}

export default memo(ZoneSelector)
