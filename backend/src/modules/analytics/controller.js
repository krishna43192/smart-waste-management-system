/**
 * Analytics Controller
 *
 * Handles HTTP requests for analytics endpoints.
 * Follows the Controller pattern from MVC architecture.
 * Delegates business logic to the service layer (Single Responsibility Principle).
 */

const { z } = require('zod');
const { AnalyticsService } = require('./reportService');
const WasteCollectionRecord = require('../../models/WasteCollectionRecord');
const User = require('../../models/User');

// ─── Constants ────────────────────────────────────────────────────────────────

const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

const MESSAGES = {
  NO_RECORDS: 'No records found for the given criteria',
  REPORT_GENERATED: 'Report generated successfully',
  INVALID_CRITERIA: 'Invalid report criteria',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Admin access required',
};

// ─── Validation Schemas ───────────────────────────────────────────────────────

const criteriaSchema = z.object({
  userId: z.string({ required_error: 'User id is required' }).min(1, 'User id is required'),
  criteria: z.object({
    dateRange: z
      .object({
        from: z.coerce.date({ required_error: 'Start date is required' }),
        to: z.coerce.date({ required_error: 'End date is required' }),
      })
      .refine(
        ({ from, to }) => from <= to,
        {
          message: 'End date must be on or after the start date',
          path: ['to'],
        }
      ),
    regions: z.array(z.string().min(1)).optional().default([]),
    wasteTypes: z.array(z.string().min(1)).optional().default([]),
    billingModels: z.array(z.string().min(1)).optional().default([]),
  }),
}).strict();

const reportCriteriaSchema = criteriaSchema;

// ─── Response Handler ─────────────────────────────────────────────────────────

class ResponseHandler {
  static success(res, data, message = 'Success') {
    const response = { ok: true, message };
    if (data !== null && data !== undefined) {
      response.data = data;
    }
    return res.status(HTTP_STATUS.OK).json(response);
  }

  static error(res, statusCode, message, additionalData = null) {
    const response = { ok: false, message };
    if (additionalData) {
      Object.assign(response, additionalData);
    }
    return res.status(statusCode).json(response);
  }
}

// ─── Authorization Service ────────────────────────────────────────────────────

class AuthorizationService {
  static async validateUserAccess(userId) {
    try {
      const user = await User.findById(userId).lean();

      if (!user) {
        return {
          authorized: false,
          statusCode: HTTP_STATUS.UNAUTHORIZED,
          message: MESSAGES.UNAUTHORIZED,
        };
      }

      if (user.role !== 'admin') {
        return {
          authorized: false,
          statusCode: HTTP_STATUS.FORBIDDEN,
          message: MESSAGES.FORBIDDEN,
        };
      }

      return { authorized: true };
    } catch (err) {
      return {
        authorized: false,
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        message: 'Authorization check failed',
      };
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupBy(array, keyGetter) {
  return array.reduce((acc, item) => {
    const key = keyGetter(item);
    if (!acc.has(key)) {
      acc.set(key, []);
    }
    acc.get(key).push(item);
    return acc;
  }, new Map());
}

function buildMatch({ criteria }) {
  const { dateRange, regions = [], wasteTypes = [], billingModels = [] } = criteria;
  const match = {
    collectionDate: {
      $gte: new Date(dateRange.from),
      $lte: new Date(dateRange.to),
    },
  };
  if (regions.length) match.region = { $in: regions };
  if (wasteTypes.length) match.wasteType = { $in: wasteTypes };
  if (billingModels.length) match.billingModel = { $in: billingModels };
  return match;
}

function makeReportPayload(records, { criteria }) {
  const normalizedCriteria = {
    ...criteria,
    dateRange: { from: criteria.dateRange.from, to: criteria.dateRange.to },
    regions: criteria.regions ?? [],
    wasteTypes: criteria.wasteTypes ?? [],
    billingModels: criteria.billingModels ?? [],
  };

  const totalWeight = records.reduce((sum, r) => sum + (r.weightKg || 0), 0);
  const recyclableWeight = records.reduce((sum, r) => sum + (r.recyclableKg || 0), 0);
  const nonRecyclableWeight = records.reduce((sum, r) => sum + (r.nonRecyclableKg || 0), 0);

  const householdGroups = groupBy(records, r => r.householdId);
  const households = Array.from(householdGroups.entries()).map(([householdId, items]) => {
    const householdTotal = items.reduce((sum, item) => sum + (item.weightKg || 0), 0);
    return {
      householdId,
      totalKg: Number(householdTotal.toFixed(2)),
      averagePickupKg: Number((householdTotal / items.length).toFixed(2)),
      pickups: items.length,
      region: items[0]?.region ?? '—',
      billingModel: items[0]?.billingModel ?? '—',
    };
  });
  households.sort((a, b) => b.totalKg - a.totalKg);

  const regionGroups = groupBy(records, r => r.region || 'Unknown');
  const regionSummary = Array.from(regionGroups.entries()).map(([region, items]) => {
    const sum = items.reduce((acc, item) => acc + (item.weightKg || 0), 0);
    return {
      region,
      totalKg: Number(sum.toFixed(2)),
      collectionCount: items.length,
      averageKg: Number((sum / Math.max(items.length, 1)).toFixed(2)),
    };
  }).sort((a, b) => b.totalKg - a.totalKg);

  const wasteTypeGroups = groupBy(records, r => r.wasteType || 'Unknown');
  const wasteSummary = Array.from(wasteTypeGroups.entries()).map(([wasteType, items]) => {
    const recyclable = items.reduce((acc, item) => acc + (item.recyclableKg || 0), 0);
    const nonRecyclable = items.reduce((acc, item) => acc + (item.nonRecyclableKg || 0), 0);
    return {
      wasteType,
      totalKg: Number((recyclable + nonRecyclable).toFixed(2)),
      recyclableKg: Number(recyclable.toFixed(2)),
      nonRecyclableKg: Number(nonRecyclable.toFixed(2)),
    };
  });

  const timeSeriesGroups = groupBy(records, r => new Date(r.collectionDate).toISOString().slice(0, 10));
  const timeSeries = Array.from(timeSeriesGroups.entries())
    .map(([day, items]) => {
      const dayWeight = items.reduce((acc, item) => acc + (item.weightKg || 0), 0);
      return { day, totalKg: Number(dayWeight.toFixed(2)), pickups: items.length };
    })
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  return {
    criteria: normalizedCriteria,
    totals: {
      records: records.length,
      totalWeightKg: Number(totalWeight.toFixed(2)),
      recyclableWeightKg: Number(recyclableWeight.toFixed(2)),
      nonRecyclableWeightKg: Number(nonRecyclableWeight.toFixed(2)),
    },
    charts: {
      regionSummary,
      wasteSummary,
      recyclingSplit: {
        recyclableWeightKg: Number(recyclableWeight.toFixed(2)),
        nonRecyclableWeightKg: Number(nonRecyclableWeight.toFixed(2)),
      },
      timeSeries,
    },
    tables: { households, regions: regionSummary, wasteTypes: wasteSummary },
  };
}

// ─── Route Handlers ───────────────────────────────────────────────────────────

// Surfaces filter metadata so the frontend can pre-populate selectors.
async function getConfig(_req, res, next) {
  try {
    const [regions, wasteTypes, billingModels, firstRecord, lastRecord] = await Promise.all([
      WasteCollectionRecord.distinct('region'),
      WasteCollectionRecord.distinct('wasteType'),
      WasteCollectionRecord.distinct('billingModel'),
      WasteCollectionRecord.findOne().sort({ collectionDate: 1 }).lean(),
      WasteCollectionRecord.findOne().sort({ collectionDate: -1 }).lean(),
    ]);

    return res.json({
      ok: true,
      filters: {
        regions,
        wasteTypes,
        billingModels,
        defaultDateRange: {
          from: firstRecord?.collectionDate ?? null,
          to: lastRecord?.collectionDate ?? null,
        },
      },
    });
  } catch (error) {
    return next(error);
  }
}

// Generates the report payload if the caller is an authorised admin.
async function generateReport(req, res, next) {
  try {
    const payload = reportCriteriaSchema.parse(req.body);

    const authResult = await AuthorizationService.validateUserAccess(payload.userId);
    if (!authResult.authorized) {
      return ResponseHandler.error(res, authResult.statusCode, authResult.message);
    }

    const reportData = await AnalyticsService.generateReport(payload.criteria);

    if (!reportData) {
      return ResponseHandler.success(res, null, MESSAGES.NO_RECORDS);
    }

    return ResponseHandler.success(res, reportData, MESSAGES.REPORT_GENERATED);

  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues?.[0];
      return ResponseHandler.error(
        res,
        HTTP_STATUS.BAD_REQUEST,
        firstIssue?.message || MESSAGES.INVALID_CRITERIA,
        { issues: error.issues }
      );
    }
    return next(error);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getConfig,
  generateReport,
  AuthorizationService,
  ResponseHandler,
};