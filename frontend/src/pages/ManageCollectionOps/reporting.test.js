import { describe, it, expect } from 'vitest'
import { buildCollectionOpsReport, formatDuration } from './reporting.js'

describe('formatDuration', () => {
  it('formats sub-hour durations', () => {
    expect(formatDuration(45)).toBe('45 min')
  })

  it('formats exact hour durations', () => {
    expect(formatDuration(120)).toBe('2 hr')
  })

  it('formats mixed hour durations', () => {
    expect(formatDuration(125)).toBe('2 hr 5 min')
  })

  it('returns em dash for invalid inputs', () => {
    expect(formatDuration(0)).toBe('—')
    expect(formatDuration(-5)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
    expect(formatDuration(null)).toBe('—')
  })
})

describe('buildCollectionOpsReport', () => {
  it('builds a rich report payload with operational metrics', () => {
    const generatedAt = new Date('2025-01-15T08:00:00.000Z')
    generatedAt.toLocaleString = () => '2025-01-15 08:00'

    const { filename, content } = buildCollectionOpsReport({
      city: 'Colombo',
      plan: {
        truckId: 'TRUCK-05',
        loadKg: 2150,
        stops: [
          { binId: 'BIN-001', visited: true, estKg: 180, lat: 6.9, lon: 79.85 },
          { binId: 'BIN-002', visited: false, estKg: 240, lat: 6.91, lon: 79.86 },
        ],
        summary: {
          threshold: 0.65,
          consideredBins: 42,
          highPriorityBins: 3,
        },
      },
      summaryMetrics: {
        activeZones: 6,
        totalZones: 8,
        availableTrucks: 9,
        fleetSize: 12,
        totalBins: 1400,
      },
      completedStops: 1,
      remainingStops: 1,
      totalDistanceKm: 25.64,
      durationMinutes: 125,
      capacityLimit: 3000,
      loadProgress: 72,
      routeEfficiencyGain: 12,
      fuelSavedLiters: 5.48,
      topWasteAreas: [
        { area: 'Borella', totalKg: 820.4, stops: 5 },
        { area: 'Homagama', totalKg: 610.2, stops: 4 },
      ],
      liveSync: true,
      highPriorityRatio: 0.45,
      directionsSource: 'OSRM road geometry',
      generatedAt,
    })

    expect(filename).toBe('collection-ops-report-Colombo-2025-01-15T08-00-00-000Z.txt')

    const lines = content.split('\n')
    expect(lines[0]).toBe('Collection Ops Report — Colombo')
    expect(lines).toContain('Generated: 2025-01-15 08:00')
    expect(lines).toContain('Active zones (7d): 6 of 8')
    expect(lines).toContain('Available trucks: 9 (fleet size 12)')
    expect(lines).toContain('Total bins network-wide: 1400')
    expect(lines).toContain('City: Colombo')
    expect(lines).toContain('Assigned truck: TRUCK-05')
    expect(lines).toContain('Stops scheduled: 2')
    expect(lines).toContain('Stops collected: 1/2')
    expect(lines).toContain('Remaining stops: 1')
    expect(lines).toContain('Plan threshold: 65%')
    expect(lines).toContain('Considered bins: 42')
    expect(lines).toContain('High priority bins (>=45% full): 3')
    expect(lines).toContain('Estimated route distance: 25.6 km')
    expect(lines).toContain('Estimated duration: 2 hr 5 min')
    expect(lines).toContain('Load collected: 2150 kg of capacity 3000 kg')
    expect(lines).toContain('Capacity utilisation: 72%')
    expect(lines).toContain('Route efficiency gain: 12%')
    expect(lines).toContain('Projected fuel saved: 5.5 L')
    expect(lines).toContain('1. Borella — ~820 kg across 5 stops')
    expect(lines).toContain('2. Homagama — ~610 kg across 4 stops')
    expect(lines).toContain('1. BIN-001 • Collected • est. 180 kg • (6.9000, 79.8500)')
    expect(lines).toContain('2. BIN-002 • Pending • est. 240 kg • (6.9100, 79.8600)')
    expect(lines).toContain('Live sync: Enabled')
    expect(lines).toContain('Directions source: OSRM road geometry')
  })

  it('produces intelligible fallbacks when plan data is sparse', () => {
    const generatedAt = new Date('2025-03-21T05:30:00.000Z')
    generatedAt.toLocaleString = () => '2025-03-21 05:30'

    const { filename, content } = buildCollectionOpsReport({
      city: '',
      plan: {
        stops: [],
        summary: {
          highPriorityBins: 0,
        },
      },
      summaryMetrics: {
        activeZones: null,
        totalZones: undefined,
        availableTrucks: null,
        fleetSize: undefined,
        totalBins: undefined,
      },
      completedStops: 0,
      remainingStops: 0,
      totalDistanceKm: 0,
      durationMinutes: null,
      capacityLimit: 3000,
      loadProgress: null,
      routeEfficiencyGain: null,
      fuelSavedLiters: 0,
      topWasteAreas: [],
      liveSync: false,
      highPriorityRatio: undefined,
      directionsSource: 'Fallback heuristic',
      generatedAt,
    })

    expect(filename).toBe('collection-ops-report-unspecified-city-2025-03-21T05-30-00-000Z.txt')

    const lines = content.split('\n')
    expect(lines).toContain('Collection Ops Report — No city selected')
    expect(lines).toContain('City: —')
    expect(lines).toContain('Assigned truck: TRUCK-01')
    expect(lines).toContain('Stops scheduled: 0')
    expect(lines).toContain('Stops collected: 0/0')
    expect(lines).toContain('Remaining stops: 0')
    expect(lines).toContain('Plan threshold: —')
    expect(lines).toContain('High priority bins (>=40% full): 0')
    expect(lines).toContain('Estimated route distance: —')
    expect(lines).toContain('Estimated duration: —')
    expect(lines).toContain('Capacity utilisation: —')
    expect(lines).toContain('Route efficiency gain: —')
    expect(lines).toContain('Projected fuel saved: 0.0 L')
    expect(lines).toContain('No high waste areas identified for this plan.')
    expect(lines).toContain('No stops scheduled. Run optimisation to generate a checklist.')
    expect(lines).toContain('Live sync: Disabled')
    expect(lines).toContain('Directions source: Fallback heuristic')
  })
})
