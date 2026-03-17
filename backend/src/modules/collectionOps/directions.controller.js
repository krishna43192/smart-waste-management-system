const { z } = require('zod');
const RoutePlan = require('../../models/RoutePlan');

let cachedFetch = null;
// Delay loading node-fetch until needed to keep cold starts fast.
const getFetch = async () => {
  if (!cachedFetch) {
    cachedFetch = (await import('node-fetch')).default;
  }
  return cachedFetch;
};

const respondWithError = (res, status, message) => res.status(status).json({ error: message });

const toOSRMCoords = coords => coords.map(([lat, lon]) => `${lon},${lat}`).join(';');

const paramsSchema = z.object({ truckId: z.string().min(1) });

// Uses the public OSRM API to translate a plan into a drivable polyline.
exports.getPlanDirections = async (req, res) => {
  const parsedParams = paramsSchema.safeParse(req.params);
  if (!parsedParams.success) {
    return respondWithError(res, 400, parsedParams.error.errors[0].message);
  }

  try {
    const { truckId } = parsedParams.data;
    const plan = await RoutePlan.findOne({ truckId }).sort({ updatedAt: -1 }).lean();
    if (!plan?.stops?.length) {
      return res.json({ line: null, distanceKm: 0, durationMin: 0 });
    }

    const depot = plan.depot || { lat: 6.927, lon: 79.861 };
    const coordinates = [
      [depot.lat, depot.lon],
      ...plan.stops
        .map(stop => [stop.lat, stop.lon])
        .filter(isValidCoord),
      [depot.lat, depot.lon],
    ];

    const url = `https://router.project-osrm.org/route/v1/driving/${toOSRMCoords(coordinates)}?overview=full&geometries=geojson&steps=false&roundtrip=false`;
    const fetchFn = await getFetch();
    const response = await fetchFn(url);
    if (!response.ok) {
      return respondWithError(res, 502, 'OSRM service unavailable');
    }
    const data = await response.json();
    const route = data.routes && data.routes[0];
    if (!route) {
      return res.json({ line: null, distanceKm: 0, durationMin: 0 });
    }

    return res.json({
      line: route.geometry,
      distanceKm: Number((route.distance / 1000).toFixed(2)),
      durationMin: Math.round(route.duration / 60),
    });
  } catch (error) {
    console.error('getPlanDirections error', error);
    return respondWithError(res, 500, 'Unable to fetch directions');
  }
};
