import { MapContainer, TileLayer, Rectangle, Popup, useMap } from 'react-leaflet'
import { memo, useEffect, useMemo } from 'react'
import PropTypes from 'prop-types'
import L from 'leaflet'

// Keep the mini-map viewport aligned to the currently highlighted zone.
function Fit({ bbox }) {
  const map = useMap()
  useEffect(() => {
    if (!bbox) return
    const bounds = L.latLngBounds(bbox)
    map.fitBounds(bounds, { padding: [20, 20] })
  }, [bbox, map])
  return null
}

Fit.propTypes = {
  bbox: PropTypes.array,
}

const DEFAULT_CENTER = Object.freeze([6.927, 79.861])

// Quick map overview for toggling between municipal zones.
function MiniZoneMap({ cities, selectedCity, onSelectCity }) {
  const active = useMemo(() => cities.find(city => city.name === selectedCity), [cities, selectedCity])
  const defaultBBox = active?.bbox || cities[0]?.bbox

  return (
    <div className="h-64 overflow-hidden rounded-2xl border border-slate-200">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {cities.map(city => (
          <Rectangle
            key={city.name}
            bounds={city.bbox || [[city.depot.lat - 0.01, city.depot.lon - 0.01], [city.depot.lat + 0.01, city.depot.lon + 0.01]]}
            eventHandlers={{
              click: () => onSelectCity(city.name),
            }}
            pathOptions={{
              color: city.name === selectedCity ? '#10b981' : '#64748b',
              weight: 2,
              fillOpacity: 0.1,
            }}
          >
            <Popup>{city.name}</Popup>
          </Rectangle>
        ))}
        <Fit bbox={defaultBBox} />
      </MapContainer>
    </div>
  )
}

MiniZoneMap.propTypes = {
  cities: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string.isRequired,
    bbox: PropTypes.array,
    depot: PropTypes.shape({
      lat: PropTypes.number.isRequired,
      lon: PropTypes.number.isRequired,
    }).isRequired,
  })).isRequired,
  selectedCity: PropTypes.string,
  onSelectCity: PropTypes.func.isRequired,
}

MiniZoneMap.defaultProps = {
  selectedCity: '',
}

export default memo(MiniZoneMap)
