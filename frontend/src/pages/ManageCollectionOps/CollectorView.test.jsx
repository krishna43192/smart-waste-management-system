import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectorView from './CollectorView.jsx'

const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('CollectorView', () => {
  let fetchMock
  let consoleErrorSpy
  let routeStatus
  let routePayload
  let collectionStatus

  const defaultStops = [
    { binId: 'BIN-101', visited: false, estKg: 210, lat: 6.915, lon: 79.875 },
    { binId: 'BIN-102', visited: false, estKg: 195, lat: 6.918, lon: 79.879 },
    { binId: 'BIN-103', visited: true, estKg: 180, lat: 6.921, lon: 79.882 },
  ]

  beforeEach(() => {
    routeStatus = 200
    routePayload = { stops: defaultStops }
    collectionStatus = 200

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    fetchMock = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url
      const method = init.method ?? 'GET'

      if (url.includes('/api/ops/routes/TRUCK-01/today') && method === 'GET') {
        if (routeStatus !== 200) {
          return new Response('', { status: routeStatus })
        }
        return jsonResponse(routePayload)
      }

      if (url.includes('/api/ops/collections') && method === 'POST') {
        return new Response('', { status: collectionStatus })
      }

      return new Response('', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    consoleErrorSpy.mockRestore()
  })

  it('renders stops and progress after a successful fetch', async () => {
    render(<CollectorView />)

    expect(await screen.findByText('BIN-101')).toBeInTheDocument()
    expect(screen.getByText('3 stops')).toBeInTheDocument()
    expect(screen.getByText(/2 remaining/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Mark collected/i })).toHaveLength(2)
  })

  it('shows an error banner when the route request fails', async () => {
    routeStatus = 500

    render(<CollectorView />)

    expect(await screen.findByText(/Unable to load today’s route/i)).toBeInTheDocument()
  })

  it('marks a stop as collected and shows a success message', async () => {
    render(<CollectorView />)

    const [firstAction] = await screen.findAllByRole('button', { name: /Mark collected/i })
    const firstItem = firstAction.closest('li')
    expect(firstItem).toBeTruthy()

    await userEvent.click(firstAction)

    await waitFor(() => {
      expect(screen.getByText(/BIN-101 recorded as collected\./i)).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(within(firstItem).queryByRole('button', { name: /Mark collected/i })).toBeNull()
    })
  })

  it('surfaces an error message when marking collected fails', async () => {
    collectionStatus = 500

    render(<CollectorView />)

    const [firstAction] = await screen.findAllByRole('button', { name: /Mark collected/i })
    await userEvent.click(firstAction)

    await waitFor(() => {
      expect(screen.getByText(/Could not mark as collected/i)).toBeInTheDocument()
    })
  })
})
