import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const { fitBoundsMock, latLngBoundsMock, divIconMock } = vi.hoisted(() => ({
  fitBoundsMock: vi.fn(),
  latLngBoundsMock: vi.fn(points => ({ points })),
  divIconMock: vi.fn(() => ({ type: 'div-icon' })),
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center, zoom }) => (
    <div data-testid="map" data-center={JSON.stringify(center)} data-zoom={zoom}>
      {children}
    </div>
  ),
  TileLayer: ({ url }) => <div data-testid="tile" data-url={url} />,
  Marker: ({ children, position }) => (
    <div data-testid="marker" data-position={JSON.stringify(position)}>
      {children}
    </div>
  ),
  Polyline: ({ positions }) => (
    <div data-testid="polyline" data-count={positions.length} />
  ),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ fitBounds: fitBoundsMock }),
}))

vi.mock('leaflet', () => ({
  __esModule: true,
  default: {
    divIcon: divIconMock,
    latLngBounds: latLngBoundsMock,
  },
}))

import RouteMap from './RouteMap.jsx'

describe('RouteMap', () => {
  beforeEach(() => {
    fitBoundsMock.mockClear()
    latLngBoundsMock.mockClear()
    divIconMock.mockClear()
  })

  afterEach(() => {
    cleanup()
  })

  it('plots depot and stop markers and fits bounds when stops are present', () => {
    const plan = {
      stops: [
        { binId: 'BIN-201', lat: 6.91, lon: 79.87, estKg: 220, visited: true },
        { binId: 'BIN-202', lat: 6.92, lon: 79.88, estKg: 240, visited: false },
      ],
      depot: { lat: 6.9, lon: 79.85 },
    }

    render(<RouteMap plan={plan} depot={plan.depot} />)

    const markers = screen.getAllByTestId('marker')
    expect(markers).toHaveLength(3) // depot + two stops

    const polyline = screen.getByTestId('polyline')
    expect(polyline.getAttribute('data-count')).toBe('4')

    expect(latLngBoundsMock).toHaveBeenCalledWith([
      [6.9, 79.85],
      [6.91, 79.87],
      [6.92, 79.88],
      [6.9, 79.85],
    ])
    expect(fitBoundsMock).toHaveBeenCalled()

    const visitedCall = divIconMock.mock.calls.find(call => call[0]?.html?.includes('#22c55e'))
    const pendingCall = divIconMock.mock.calls.find(call => call[0]?.html?.includes('#ef4444'))
    expect(visitedCall).toBeTruthy()
    expect(pendingCall).toBeTruthy()
  })

  it('falls back to depot-only view when no stops are scheduled', () => {
    const depot = { lat: 6.95, lon: 79.86 }

    render(<RouteMap plan={{ stops: [] }} depot={depot} />)

    expect(screen.getAllByTestId('marker')).toHaveLength(1)
    expect(screen.queryByTestId('polyline')).toBeNull()

    expect(screen.getByTestId('map').getAttribute('data-center')).toBe(JSON.stringify([depot.lat, depot.lon]))
    expect(latLngBoundsMock).toHaveBeenCalledWith([[depot.lat, depot.lon]])
  })
})
