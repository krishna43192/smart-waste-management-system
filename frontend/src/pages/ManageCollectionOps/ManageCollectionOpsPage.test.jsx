import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ManageCollectionOpsPage from './ManageCollectionOpsPage.jsx'
import * as reporting from './reporting.js'

vi.mock('../RouteOptimization/ZoneSelector.jsx', () => ({
  default: ({ actionLabel, onGenerate }) => (
    <div>
      <button data-testid="generate-route" onClick={onGenerate}>{actionLabel}</button>
    </div>
  ),
}))

vi.mock('../RouteOptimization/MiniZoneMap.jsx', () => ({
  default: () => <div data-testid="mini-zone-map" />,
}))

vi.mock('../RouteOptimization/KpiCard.jsx', () => ({
  default: ({ label, value, helper }) => (
    <div data-testid={`kpi-${label}`}>
      <span>{label}</span>
      <span>{value}</span>
      <span>{helper}</span>
    </div>
  ),
}))

vi.mock('../RouteOptimization/SummaryCard.jsx', () => ({
  default: ({ summary }) => (
    <div data-testid="summary-card">Summary {summary ? 'ready' : 'pending'}</div>
  ),
}))

vi.mock('../RouteOptimization/ProgressSteps.jsx', () => ({
  default: ({ steps }) => (
    <div data-testid="progress-steps">{steps.map(step => step.status).join(',')}</div>
  ),
}))

vi.mock('./RouteMap.jsx', () => ({
  default: ({ plan }) => (
    <div data-testid="route-map">{plan ? 'map-ready' : 'map-empty'}</div>
  ),
}))

const ensureBlobUrlApis = () => {
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:placeholder')
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = vi.fn()
  }
}

describe('ManageCollectionOpsPage', () => {
  const citiesPayload = [
    {
      name: 'Colombo',
      depot: { lat: 6.9147, lon: 79.8733 },
      areaSqKm: 9.4,
      population: 118000,
      lastCollectionAt: '2025-04-10T04:00:00.000Z',
    },
  ]

  const summaryPayload = {
    activeZones: 6,
    totalZones: 8,
    availableTrucks: 9,
    fleetSize: 12,
    engagedTrucks: 7,
    totalBins: 1400,
  }

  const binsPayload = [
    { binId: 'BIN-001', city: 'Colombo', area: 'Borella' },
    { binId: 'BIN-002', city: 'Colombo', area: 'Homagama' },
    { binId: 'BIN-003', city: 'Colombo', area: 'Borella' },
  ]

  const planPayload = {
    truckId: 'TRUCK-99',
    loadKg: 1800,
    distanceKm: 26.4,
    summary: {
      threshold: 0.58,
      consideredBins: 48,
      highPriorityBins: 4,
      baselineDistanceKm: 40,
    },
    stops: [
      { binId: 'BIN-001', visited: true, estKg: 210, lat: 6.92, lon: 79.87 },
      { binId: 'BIN-002', visited: false, estKg: 260, lat: 6.925, lon: 79.876 },
      { binId: 'BIN-003', visited: false, estKg: 280, lat: 6.93, lon: 79.88 },
    ],
    updatedAt: '2025-04-10T06:30:00.000Z',
    depot: { lat: 6.9147, lon: 79.8733 },
  }

  const directionsPayload = {
    distanceKm: 26.4,
    durationMin: 135,
    line: [
      [79.87, 6.92],
      [79.876, 6.925],
      [79.88, 6.93],
    ],
  }

  let fetchMock
  let optimizeShouldFail

  const jsonResponse = data => Promise.resolve(new Response(
    JSON.stringify(data),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ))

  const statusResponse = status => Promise.resolve(new Response('', { status }))

  beforeEach(() => {
    optimizeShouldFail = false

    fetchMock = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url

      if (url.endsWith('/api/ops/cities')) {
        return jsonResponse(citiesPayload)
      }
      if (url.endsWith('/api/ops/summary')) {
        return jsonResponse(summaryPayload)
      }
      if (url.includes('/api/ops/bins')) {
        return jsonResponse(binsPayload)
      }
      if (url.endsWith('/api/ops/routes/optimize')) {
        if (optimizeShouldFail) {
          return statusResponse(500)
        }
        return jsonResponse(planPayload)
      }
      if (url.startsWith('/api/ops/routes/by-city')) {
        if (optimizeShouldFail) {
          return statusResponse(404)
        }
        return jsonResponse(planPayload)
      }
      if (url.includes('/api/ops/routes/TRUCK-99/directions')) {
        return jsonResponse(directionsPayload)
      }
      return statusResponse(404)
    })

    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('optimizes a route and allows exporting the report', async () => {
    ensureBlobUrlApis()
    const buildSpy = vi.spyOn(reporting, 'buildCollectionOpsReport')
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report')
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const appendSpy = vi.spyOn(document.body, 'appendChild')
    const removeSpy = vi.spyOn(document.body, 'removeChild')
  const anchorClickSpy = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<ManageCollectionOpsPage />)

    let exportButton = await screen.findByRole('button', { name: /Export report/i })
    expect(exportButton).toBeDisabled()

    const [generateButton] = await screen.findAllByTestId('generate-route')
    await userEvent.click(generateButton)

    await screen.findByText('Truck default: TRUCK-99')
    await screen.findByText(/Approx\. 490 kg/) // high waste area aggregate rounding

    exportButton = await screen.findByRole('button', { name: /Export report/i })
    await waitFor(() => {
      expect(exportButton).not.toBeDisabled()
    })

    await userEvent.click(exportButton)

    await waitFor(() => {
      expect(buildSpy).toHaveBeenCalled()
      expect(createObjectURLSpy).toHaveBeenCalled()
      expect(appendSpy).toHaveBeenCalled()
      expect(removeSpy).toHaveBeenCalled()
    })

    const buildArgs = buildSpy.mock.calls.at(-1)?.[0] ?? {}
    expect(buildArgs).toMatchObject({
      city: 'Colombo',
      plan: expect.objectContaining({ truckId: 'TRUCK-99' }),
      completedStops: 1,
      remainingStops: 2,
      liveSync: true,
    })

    createObjectURLSpy.mockRestore()
    revokeSpy.mockRestore()
    appendSpy.mockRestore()
    removeSpy.mockRestore()
    anchorClickSpy.mockRestore()
    buildSpy.mockRestore()
  })

  it('surfaces a user-friendly error when optimization fails', async () => {
    optimizeShouldFail = true

    render(<ManageCollectionOpsPage />)

  const [generateButton] = await screen.findAllByTestId('generate-route')
    await userEvent.click(generateButton)

    await waitFor(() => {
      expect(screen.getByText(/Could not optimize right now/i)).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/ops/routes/optimize', expect.objectContaining({ method: 'POST' }))
  })
})
