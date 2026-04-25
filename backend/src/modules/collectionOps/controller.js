const { z } = require('zod');
const City = require('../../models/City');
const WasteBin = require('../../models/WasteBin');
const RoutePlan = require('../../models/RoutePlan');
const CollectionEvent = require('../../models/CollectionEvent');
const lk = require('../../config/region.hyd.json');
const { estimateKg, optimize } = require('./service.routing');

// ADDED: Import Points model for gamification
const Points = require('../../models/Points');
const { POINT_ACTIONS } = require('../../models/Points');

const DEFAULT_TRUCK_ID = 'TRUCK-01';

const respondWithError = (res, status, message, extra = {}) => (
  res.status(status).json({ error: message, ...extra })
);

const parseOrRespond = (schema, payload, res) => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    respondWithError(res, 400, result.error.errors[0].message);
    return null;
  }
  return result.data;
};

const startOfDay = date => { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; };
const endOfDay = date => { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; };

const computeThreshold = adjustments => {
  const base = Number(lk.operations.route_threshold ?? 0.2);
  let threshold = base;
  if (adjustments?.skipBelow30) threshold = Math.max(threshold, 0.3);
  if (adjustments?.emergencyOnly) threshold = Math.max(threshold, 0.6);
  if (adjustments?.prioritizeCommercial) threshold = Math.max(0.1, threshold - 0.05);
  return Math.min(0.9, threshold);
};

const listBinsQuerySchema = z.object({ city: z.string().min(1).optional() });
const optimizeRouteSchema = z.object({
  city: z.string().min(1).optional(), ward: z.string().min(1).optional(),
  area: z.string().min(1).optional(), date: z.union([z.string(), z.date()]).optional(),
  truckId: z.string().min(1).optional(),
  constraints: z.object({
    truckCapacityKg: z.union([z.number(), z.string()]).optional(),
    trucks: z.union([z.number(), z.string()]).optional(),
    maxTimeHrs: z.union([z.number(), z.string()]).optional(),
    maxTime: z.union([z.number(), z.string()]).optional(),
  }).optional(),
  adjustments: z.object({
    skipBelow30: z.boolean().optional(), emergencyOnly: z.boolean().optional(),
    prioritizeCommercial: z.boolean().optional(), avoidPeak: z.boolean().optional(),
  }).optional(),
}).passthrough();

const todayRouteParamsSchema = z.object({ truckId: z.string().min(1) });

// UPDATED: Added optional collectorId so points can be awarded to the right user
const recordCollectionSchema = z.object({
  binId: z.string().min(1),
  truckId: z.string().min(1).optional(),
  collectorId: z.string().min(1).optional(),
  notes: z.string().max(500).optional(),
}); 

exports.listCities = async (_req, res) => {
  const cities = await City.find().select('name code depot bbox areaSqKm population lastCollectionAt -_id').lean();
  return res.json(cities);
};

exports.listBinsByCity = async (req, res) => {
  const parsedQuery = parseOrRespond(listBinsQuerySchema, req.query || {}, res);
  if (!parsedQuery) return undefined;
  const query = parsedQuery.city ? { city: parsedQuery.city } : {};
  const bins = await WasteBin.find(query).select('binId city area location capacityKg lastPickupAt estRateKgPerDay -_id').lean();
  return res.json(bins);
};

exports.optimizeRoute = async (req, res) => {
  const payload = parseOrRespond(optimizeRouteSchema, req.body || {}, res);
  if (!payload) return undefined;
  try {
    const { city, ward, area, date, truckId, constraints = {}, adjustments = {} } = payload;
    const serviceArea = city || ward;
    if (!serviceArea) return respondWithError(res, 400, 'city (or ward) is required');
    const cityDoc = await City.findOne({ name: serviceArea }).lean();
    const depot = cityDoc?.depot || (lk.operations.city_depots && lk.operations.city_depots[serviceArea]) || lk.operations.default_depot;
    const bins = await WasteBin.find(area ? { city: serviceArea, area } : { city: serviceArea }).lean();
    const threshold = computeThreshold(adjustments);
    const truckCapacityKg = Number(constraints.truckCapacityKg || lk.operations.truck_capacity_kg || 3000);
    const trucks = Math.max(1, Number(constraints.trucks || 1));
    const maxTimeHrs = Number(constraints.maxTimeHrs || constraints.maxTime || 0);
    const avgSpeedKph = adjustments?.avoidPeak ? 18 : 25;
    const totalBins = bins.length;
    const enriched = bins.map(bin => {
      const capacity = Number(bin.capacityKg) || 240;
      const estKg = estimateKg(bin);
      const ratio = capacity > 0 ? estKg / capacity : 0;
      return { ...bin, estKg, ratio };
    });
    const consideredBins = enriched.filter(b => b.ratio >= threshold);
    const highPriorityBins = enriched.filter(b => b.ratio >= 0.6);
    const plans = optimize({ bins, params: { depot, threshold, truckCapacityKg, trucks, maxTimeHrs, avgSpeedKph } });
    const planList = Array.isArray(plans) ? plans : [plans];
    const planDate = date ? new Date(date) : new Date();
    const planDayStart = startOfDay(planDate);
    const planDayEnd = endOfDay(planDate);
    const savedPlans = [];
    planList.forEach((plan, index) => {
      const assignedTruck = index === 0 && truckId ? truckId : 'TRUCK-' + String(index + 1).padStart(2, '0');
      savedPlans.push({ assignedTruck, plan });
    });
    const persisted = [];
    for (const entry of savedPlans) {
      const existingPlan = await RoutePlan.findOne({ city: serviceArea, area: area || null, truckId: entry.assignedTruck, date: { $gte: planDayStart, $lte: planDayEnd } }).lean();
      
      let visitedStops = [];
      const visitedBinIds = new Set();
      
      if (existingPlan && existingPlan.stops) {
        visitedStops = existingPlan.stops.filter(s => s.visited);
        visitedStops.forEach(s => visitedBinIds.add(s.binId));
      }

      const newUnvisitedStops = (entry.plan.stops || [])
        .filter(stop => !visitedBinIds.has(stop.binId))
        .map(stop => ({ ...stop, visited: false }));

      const orderedStops = [...visitedStops, ...newUnvisitedStops];

      const payloadDoc = { 
        ward: serviceArea, city: serviceArea, area: area || null, truckId: entry.assignedTruck, date: planDayStart, depot,
        stops: orderedStops,
        loadKg: entry.plan.loadKg || 0, distanceKm: entry.plan.distanceKm || 0 
      };
      
      const doc = await RoutePlan.findOneAndUpdate(
        { city: serviceArea, area: area || null, truckId: entry.assignedTruck, date: { $gte: planDayStart, $lte: planDayEnd } },
        { $set: payloadDoc }, { upsert: true, new: true, setDefaultsOnInsert: true });
      persisted.push(doc ? doc.toObject() : payloadDoc);
    }
    const primaryPlan = persisted[0] || { city: serviceArea, area: area || null, truckId: truckId || DEFAULT_TRUCK_ID, stops: [], loadKg: 0, distanceKm: 0, depot };
    return res.json({ ...primaryPlan, summary: { totalBins, consideredBins: consideredBins.length, highPriorityBins: highPriorityBins.length, truckCapacityKg, trucks, threshold } });
  } catch (error) {
    console.error('optimizeRoute error', error);
    return respondWithError(res, 500, 'Unable to optimize route');
  }
};

exports.getTodayRoute = async (req, res) => {
  const params = parseOrRespond(todayRouteParamsSchema, req.params || {}, res);
  if (!params) return undefined;
  try {
    const today = new Date();
    const plan = await RoutePlan.findOne({ truckId: params.truckId, date: { $gte: startOfDay(today), $lte: endOfDay(today) } }).sort({ updatedAt: -1 }).lean();
    if (!plan) return res.json({ stops: [] });
    if (!plan.depot) plan.depot = (lk.operations.city_depots && lk.operations.city_depots[plan.ward]) || lk.operations.default_depot;
    return res.json(plan);
  } catch (error) {
    console.error('getTodayRoute error', error);
    return respondWithError(res, 500, 'Unable to load route');
  }
};

const EARTH_RADIUS_KM = 6371;
const toRadians = degrees => (degrees * Math.PI) / 180;
const haversineKm = (from, to) => {
  if (!from || !to) return 0;
  const dLat = toRadians((to.lat ?? 0) - (from.lat ?? 0));
  const dLon = toRadians((to.lon ?? 0) - (from.lon ?? 0));
  const lat1 = toRadians(from.lat ?? 0);
  const lat2 = toRadians(to.lat ?? 0);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.asin(Math.sqrt(a));
  return EARTH_RADIUS_KM * c;
};

exports.recordCollection = async (req, res) => {
  const payload = parseOrRespond(recordCollectionSchema, req.body || {}, res);
  if (!payload) return undefined;
  try {
    const assignedTruck = payload.truckId || DEFAULT_TRUCK_ID;
    const now = new Date();
    await CollectionEvent.create({ binId: payload.binId, truckId: assignedTruck, notes: payload.notes, ts: now });
    const filter = { 
      truckId: assignedTruck, 
      date: { $gte: startOfDay(now), $lte: endOfDay(now) },
      'stops.binId': payload.binId 
    };

    const todayPlan = await RoutePlan.findOne(filter);
    if (todayPlan && todayPlan.stops) {
      const targetStop = todayPlan.stops.find(s => s.binId === payload.binId);
      if (targetStop) {
        targetStop.visited = true;

        // DYNAMIC RE-ROUTING: Re-order unvisited stops based on nearest neighbor from this stop
        const visitedStops = todayPlan.stops.filter(s => s.visited);
        const unvisitedStops = todayPlan.stops.filter(s => !s.visited);

        if (unvisitedStops.length > 0) {
          let currentLocation = { lat: targetStop.lat, lon: targetStop.lon };
          const reorderedUnvisited = [];

          while (unvisitedStops.length > 0) {
            let bestDistance = Infinity;
            let bestIndex = 0;
            for (let i = 0; i < unvisitedStops.length; i++) {
              const distance = haversineKm(currentLocation, unvisitedStops[i]);
              if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = i;
              }
            }
            const nextStop = unvisitedStops[bestIndex];
            reorderedUnvisited.push(nextStop);
            currentLocation = { lat: nextStop.lat, lon: nextStop.lon };
            unvisitedStops.splice(bestIndex, 1);
          }

          todayPlan.stops = [...visitedStops, ...reorderedUnvisited];
        }

        // Recalculate total distance based on the new exact sequence!
        if (todayPlan.depot && todayPlan.depot.lat && todayPlan.depot.lon) {
          let newTotalDistance = 0;
          let prevLoc = todayPlan.depot;
          for (const stop of todayPlan.stops) {
            newTotalDistance += haversineKm(prevLoc, stop);
            prevLoc = stop;
          }
          newTotalDistance += haversineKm(prevLoc, todayPlan.depot);
          todayPlan.distanceKm = Number(newTotalDistance.toFixed(2));
        }
        
        todayPlan.markModified('stops');
        await todayPlan.save();
      }
    }

    await WasteBin.updateOne({ binId: payload.binId }, { $set: { lastPickupAt: now } }).exec();
    // GAMIFICATION: Award points to collector for collecting a bin
    if (payload.collectorId) {
      try {
        await Points.award({ userId: payload.collectorId, role: 'collector', action: POINT_ACTIONS.BIN_COLLECTED, referenceId: payload.binId, referenceType: 'bin' });
        console.log('Points +10 awarded to collector ' + payload.collectorId);
        const todayPlan = await RoutePlan.findOne({ truckId: assignedTruck, date: { $gte: startOfDay(now), $lte: endOfDay(now) } }).lean();
        if (todayPlan && todayPlan.stops && todayPlan.stops.length > 0) {
          const allVisited = todayPlan.stops.every(stop => stop.visited === true);
          if (allVisited) {
            await Points.award({ userId: payload.collectorId, role: 'collector', action: POINT_ACTIONS.ROUTE_COMPLETED, referenceId: todayPlan._id.toString(), referenceType: 'route' });
            console.log('Bonus +100 awarded to collector ' + payload.collectorId + ' - full route done!');
          }
        }
      } catch (pointsError) {
        console.warn('Failed to award points for bin collection', pointsError);
      }
    }
    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('recordCollection error', error);
    return respondWithError(res, 500, 'Unable to record collection');
  }
};

exports.getPlanByCity = async (req, res) => {
  try {
    const { city } = req.query;
    if (!city) return respondWithError(res, 400, 'city query parameter is required');
    const today = new Date();
    const plans = await RoutePlan.find({ city, date: { $gte: startOfDay(today), $lte: endOfDay(today) } }).lean();
    return res.json(plans);
  } catch (error) {
    console.error('getPlanByCity error', error);
    return respondWithError(res, 500, 'Unable to fetch plans by city');
  }
};

exports.getOpsSummary = async (_req, res) => {
  try {
    const today = new Date();
    const dayStart = startOfDay(today);
    const dayEnd = endOfDay(today);

    const [totalBins, collectionsToday, activePlans, totalZones, activeZonesList] = await Promise.all([
      WasteBin.countDocuments(),
      CollectionEvent.countDocuments({ ts: { $gte: dayStart, $lte: dayEnd } }),
      RoutePlan.countDocuments({ date: { $gte: dayStart, $lte: dayEnd } }),
      City.countDocuments(),
      RoutePlan.distinct('city', { date: { $gte: dayStart, $lte: dayEnd } }),
    ]);

    const activeZones = activeZonesList.length;
    const engagedTrucks = activePlans;
    const fleetSize = Math.max(totalZones * 2, 6);
    const availableTrucks = Math.max(0, fleetSize - engagedTrucks);

    // Determine service level based on collection coverage
    let serviceLevel = 'normal';
    if (totalZones > 0 && activeZones < Math.ceil(totalZones * 0.3)) {
      serviceLevel = 'critical';
    } else if (totalZones > 0 && activeZones < Math.ceil(totalZones * 0.6)) {
      serviceLevel = 'warning';
    }

    return res.json({
      totalBins,
      collectionsToday,
      activePlans,
      activeZones,
      totalZones,
      availableTrucks,
      fleetSize,
      engagedTrucks,
      serviceLevel,
    });
  } catch (error) {
    console.error('getOpsSummary error', error);
    return respondWithError(res, 500, 'Unable to fetch operations summary');
  }
};