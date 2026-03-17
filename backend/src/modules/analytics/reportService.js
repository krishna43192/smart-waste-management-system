/**
 * Report Service
 * 
 * This service follows the Single Responsibility Principle (SRP) by handling
 * only report generation logic, separated from HTTP request handling.
 * It also demonstrates the Strategy pattern for different aggregation strategies.
 */

const WasteCollectionRecord = require('../../models/WasteCollectionRecord');

/**
 * Utility function to group array elements by a key
 * Following DRY principle by creating a reusable grouping function
 * 
 * @param {Array} array - Array of items to group
 * @param {Function} keyGetter - Function that extracts the grouping key from each item
 * @returns {Map} Map with keys and their associated item arrays
 */
function groupBy(array, keyGetter) {
  return array.reduce((accumulator, item) => {
    const key = keyGetter(item);
    if (!accumulator.has(key)) {
      accumulator.set(key, []);
    }
    accumulator.get(key).push(item);
    return accumulator;
  }, new Map());
}

/**
 * Rounds a number to a specified number of decimal places
 * 
 * @param {Number} value - The number to round
 * @param {Number} decimals - Number of decimal places (default: 2)
 * @returns {Number} Rounded number
 */
function roundToDecimals(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}

/**
 * Calculates sum of a specific property across an array of records
 * 
 * @param {Array} records - Array of records to sum
 * @param {String} property - Property name to sum
 * @returns {Number} Total sum
 */
function sumProperty(records, property) {
  return records.reduce((sum, record) => sum + (record[property] || 0), 0);
}

/**
 * Query Builder Class
 * Implements the Builder pattern for constructing MongoDB queries
 * Following Open/Closed Principle - open for extension, closed for modification
 */
class WasteReportQueryBuilder {
  constructor() {
    this.matchCriteria = {};
  }

  /**
   * Sets the date range for the query
   * 
   * @param {Date} from - Start date
   * @param {Date} to - End date
   * @returns {WasteReportQueryBuilder} This instance for method chaining
   */
  withDateRange(from, to) {
    this.matchCriteria.collectionDate = {
      $gte: new Date(from),
      $lte: new Date(to),
    };
    return this;
  }

  /**
   * Filters by regions
   * 
   * @param {Array<String>} regions - Array of region names
   * @returns {WasteReportQueryBuilder} This instance for method chaining
   */
  withRegions(regions) {
    if (regions && regions.length > 0) {
      this.matchCriteria.region = { $in: regions };
    }
    return this;
  }

  /**
   * Filters by waste types
   * 
   * @param {Array<String>} wasteTypes - Array of waste type names
   * @returns {WasteReportQueryBuilder} This instance for method chaining
   */
  withWasteTypes(wasteTypes) {
    if (wasteTypes && wasteTypes.length > 0) {
      this.matchCriteria.wasteType = { $in: wasteTypes };
    }
    return this;
  }

  /**
   * Filters by billing models
   * 
   * @param {Array<String>} billingModels - Array of billing model names
   * @returns {WasteReportQueryBuilder} This instance for method chaining
   */
  withBillingModels(billingModels) {
    if (billingModels && billingModels.length > 0) {
      this.matchCriteria.billingModel = { $in: billingModels };
    }
    return this;
  }

  /**
   * Builds and returns the final match criteria
   * 
   * @returns {Object} MongoDB match criteria object
   */
  build() {
    return this.matchCriteria;
  }
}

/**
 * Data Aggregation Strategies
 * Implements Strategy pattern for different aggregation approaches
 */

/**
 * Aggregates household-level statistics
 * 
 * @param {Array} records - Collection records to aggregate
 * @returns {Array} Array of household statistics sorted by total weight descending
 */
function aggregateHouseholdStats(records) {
  const householdGroups = groupBy(records, (record) => record.householdId);
  
  const households = Array.from(householdGroups.entries()).map(([householdId, items]) => {
    const householdTotal = sumProperty(items, 'weightKg');
    const pickupCount = items.length;
    
    return {
      householdId,
      totalKg: roundToDecimals(householdTotal),
      averagePickupKg: roundToDecimals(householdTotal / pickupCount),
      pickups: pickupCount,
      region: items[0]?.region ?? '—',
      billingModel: items[0]?.billingModel ?? '—',
    };
  });

  // Sort by total weight in descending order
  return households.sort((a, b) => b.totalKg - a.totalKg);
}

/**
 * Aggregates region-level statistics
 * 
 * @param {Array} records - Collection records to aggregate
 * @returns {Array} Array of region statistics sorted by total weight descending
 */
function aggregateRegionStats(records) {
  const regionGroups = groupBy(records, (record) => record.region || 'Unknown');
  
  const regionSummary = Array.from(regionGroups.entries()).map(([region, items]) => {
    const totalWeight = sumProperty(items, 'weightKg');
    const collectionCount = items.length;
    
    return {
      region,
      totalKg: roundToDecimals(totalWeight),
      collectionCount,
      averageKg: roundToDecimals(totalWeight / Math.max(collectionCount, 1)),
    };
  });

  return regionSummary.sort((a, b) => b.totalKg - a.totalKg);
}

/**
 * Aggregates waste type statistics
 * 
 * @param {Array} records - Collection records to aggregate
 * @returns {Array} Array of waste type statistics
 */
function aggregateWasteTypeStats(records) {
  const wasteTypeGroups = groupBy(records, (record) => record.wasteType || 'Unknown');
  
  return Array.from(wasteTypeGroups.entries()).map(([wasteType, items]) => {
    const recyclable = sumProperty(items, 'recyclableKg');
    const nonRecyclable = sumProperty(items, 'nonRecyclableKg');
    
    return {
      wasteType,
      totalKg: roundToDecimals(recyclable + nonRecyclable),
      recyclableKg: roundToDecimals(recyclable),
      nonRecyclableKg: roundToDecimals(nonRecyclable),
    };
  });
}

/**
 * Aggregates time series data by day
 * 
 * @param {Array} records - Collection records to aggregate
 * @returns {Array} Array of daily statistics sorted chronologically
 */
function aggregateTimeSeries(records) {
  const timeSeriesGroups = groupBy(
    records, 
    (record) => new Date(record.collectionDate).toISOString().slice(0, 10)
  );
  
  const timeSeries = Array.from(timeSeriesGroups.entries()).map(([day, items]) => {
    const dayWeight = sumProperty(items, 'weightKg');
    
    return {
      day,
      totalKg: roundToDecimals(dayWeight),
      pickups: items.length,
    };
  });

  return timeSeries.sort((a, b) => (a.day < b.day ? -1 : 1));
}

/**
 * Report Generator Class
 * Encapsulates the logic for creating comprehensive waste reports
 * Follows Single Responsibility Principle
 */
class WasteReportGenerator {
  /**
   * Normalizes criteria for consistent structure
   * 
   * @param {Object} criteria - Raw criteria from request
   * @returns {Object} Normalized criteria object
   */
  static normalizeCriteria(criteria) {
    return {
      dateRange: {
        from: criteria.dateRange.from,
        to: criteria.dateRange.to,
      },
      regions: criteria.regions ?? [],
      wasteTypes: criteria.wasteTypes ?? [],
      billingModels: criteria.billingModels ?? [],
    };
  }

  /**
   * Calculates total statistics across all records
   * 
   * @param {Array} records - Collection records
   * @returns {Object} Total statistics object
   */
  static calculateTotals(records) {
    return {
      records: records.length,
      totalWeightKg: roundToDecimals(sumProperty(records, 'weightKg')),
      recyclableWeightKg: roundToDecimals(sumProperty(records, 'recyclableKg')),
      nonRecyclableWeightKg: roundToDecimals(sumProperty(records, 'nonRecyclableKg')),
    };
  }

  /**
   * Generates a complete report from records and criteria
   * Coordinates all aggregation strategies
   * 
   * @param {Array} records - Waste collection records
   * @param {Object} criteria - Report generation criteria
   * @returns {Object} Complete report with all sections
   */
  static generate(records, criteria) {
    const normalizedCriteria = this.normalizeCriteria(criteria);
    const totals = this.calculateTotals(records);
    
    // Generate all report sections using aggregation strategies
    const regionSummary = aggregateRegionStats(records);
    const wasteSummary = aggregateWasteTypeStats(records);
    const timeSeries = aggregateTimeSeries(records);
    const households = aggregateHouseholdStats(records);

    return {
      criteria: normalizedCriteria,
      totals,
      charts: {
        regionSummary,
        wasteSummary,
        recyclingSplit: {
          recyclableWeightKg: totals.recyclableWeightKg,
          nonRecyclableWeightKg: totals.nonRecyclableWeightKg,
        },
        timeSeries,
      },
      tables: {
        households,
        regions: regionSummary,
        wasteTypes: wasteSummary,
      },
    };
  }
}

/**
 * Service class for analytics operations
 * Provides high-level methods for report generation
 */
class AnalyticsService {
  /**
   * Retrieves configuration data for analytics filters
   * 
   * @returns {Promise<Object>} Configuration object with filter options and date range
   */
  static async getConfiguration() {
    const [filters, dateRange] = await Promise.all([
      WasteCollectionRecord.getDistinctFilters(),
      WasteCollectionRecord.getDateRange(),
    ]);

    return {
      ...filters,
      defaultDateRange: dateRange,
    };
  }

  /**
   * Builds query criteria from report parameters
   * 
   * @param {Object} criteria - Report criteria from request
   * @returns {Object} MongoDB query match criteria
   */
  static buildQuery(criteria) {
    const { dateRange, regions = [], wasteTypes = [], billingModels = [] } = criteria;
    
    return new WasteReportQueryBuilder()
      .withDateRange(dateRange.from, dateRange.to)
      .withRegions(regions)
      .withWasteTypes(wasteTypes)
      .withBillingModels(billingModels)
      .build();
  }

  /**
   * Generates a comprehensive waste analytics report
   * 
   * @param {Object} criteria - Report generation criteria
   * @returns {Promise<Object|null>} Generated report or null if no records found
   */
  static async generateReport(criteria) {
    const matchCriteria = this.buildQuery(criteria);
    const records = await WasteCollectionRecord.find(matchCriteria).lean();

    if (!records.length) {
      return null;
    }

    return WasteReportGenerator.generate(records, criteria);
  }
}

module.exports = {
  AnalyticsService,
  WasteReportQueryBuilder,
  WasteReportGenerator,
  // Export for testing purposes
  aggregateHouseholdStats,
  aggregateRegionStats,
  aggregateWasteTypeStats,
  aggregateTimeSeries,
};
