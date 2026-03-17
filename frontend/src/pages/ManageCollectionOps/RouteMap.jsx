// RouteMap.jsx
import { useEffect, useMemo } from 'react'
import PropTypes from 'prop-types'
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'

// Render a numbered badge-style marker without relying on Tailwind runtime classes.
function numberIcon(n, color = '#10b981') {
  return L.divIcon({
    className: 'numbered-marker',
    html: `
      <div style="
        width:28px;height:28px;border-radius:9999px;
        display:grid;place-items:center;
        background:${color};border:1px solid ${color};color:#ffffff;
        box-shadow:0 6px 12px rgba(15,23,42,0.2);
        font:600 12px/1 Inter,system-ui,sans-serif;">
        ${n}
      </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function depotIcon() {
  return L.divIcon({
    className: 'depot-marker',
    html: `
      <div style="
        padding:6px 10px;border-radius:9999px;background:#111827;color:#fff;
        border:1px solid #94a3b8">
        DEPOT
      </div>`,
    iconSize: [50, 24],
    iconAnchor: [25, 12],
  });
}

// Auto adjust the Leaflet viewport whenever the route footprint changes.
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points?.length) return
    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, { padding: [30, 30] })
  }, [points, map])
  return null
}

FitBounds.propTypes = {
  points: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
}

/**
 * props:
 *  - plan: { stops:[{lat,lon,binId,estKg,visited}], ... }
 *  - depot: { lat, lon }
 */
const DEFAULT_DEPOT = Object.freeze({ lat: 6.927, lon: 79.861 })

// Visualises the optimized depot-to-stops loop for collection crews.
export default function RouteMap({ plan, depot }) {
  const baseDepot = depot || plan?.depot || DEFAULT_DEPOT
  const stops = plan?.stops ?? []
  const poly = useMemo(() => {
    if (!stops.length) {
      return [[baseDepot.lat, baseDepot.lon]]
    }
    // Close the polyline by mirroring the depot at the start and end of the route.
    const pts = [[baseDepot.lat, baseDepot.lon], ...stops.map(s => [s.lat, s.lon]), [baseDepot.lat, baseDepot.lon]]
    return pts
  }, [stops, baseDepot])

  // center (fallback to depot)
  const center = [baseDepot.lat, baseDepot.lon]

  const hasStops = stops.length >= 1

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-2xl ring-1 ring-slate-200">
      <MapContainer center={center} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Path depot → stops → depot */}
        {hasStops && (
          <Polyline positions={poly} pathOptions={{ color: '#10b981', weight: 5, opacity: 0.8 }} />
        )}

        {/* Depot */}
        <Marker position={[baseDepot.lat, baseDepot.lon]} icon={depotIcon()}>
          <Popup>Depot<br/>Start/End</Popup>
        </Marker>

        {/* Numbered stop markers */}
              {stops.map((s, i) => (
          <Marker
            key={s.binId}
            position={[s.lat, s.lon]}
                    icon={numberIcon(i + 1, s.visited ? '#22c55e' : '#ef4444')}
          >
            <Popup>
              <div style={{ fontWeight: 600 }}>{s.binId}</div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                {typeof s.lat === 'number' && typeof s.lon === 'number'
                  ? `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`
                  : 'Location pending'}<br/>
                {s.estKg} kg {s.visited ? '• visited' : ''}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Fit map to all points */}
        <FitBounds points={poly} />
      </MapContainer>
    </div>
  )
}

RouteMap.propTypes = {
  plan: PropTypes.shape({
    depot: PropTypes.shape({
      lat: PropTypes.number,
      lon: PropTypes.number,
    }),
    stops: PropTypes.arrayOf(PropTypes.shape({
      binId: PropTypes.string.isRequired,
      lat: PropTypes.number,
      lon: PropTypes.number,
      estKg: PropTypes.number,
      visited: PropTypes.bool,
    })),
  }),
  depot: PropTypes.shape({
    lat: PropTypes.number,
    lon: PropTypes.number,
  }),
}

RouteMap.defaultProps = {
  plan: null,
  depot: null,
}
