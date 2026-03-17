/**
 * Test Utilities for Analytics Module
 * Provides reusable helper functions and mock data generators
 */

// This file contains utility functions for testing
// No actual tests are defined here

/**
 * Generates mock waste collection records
 * @param {number} count - Number of records to generate
 * @param {object} options - Customization options
 * @returns {Array} Array of mock records
 */
function generateMockRecords(count = 10, options = {}) {
  const {
    startDate = new Date('2024-01-01'),
    regions = ['Colombo', 'Kandy', 'Galle'],
    wasteTypes = ['household', 'recyclable', 'organic'],
    billingModels = ['weight-based', 'flat-fee', 'subscription'],
    weightRange = { min: 5, max: 50 },
  } = options;

  return Array.from({ length: count }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + (i % 30));
    
    const weightKg = weightRange.min + Math.random() * (weightRange.max - weightRange.min);
    const recyclableRatio = 0.3 + Math.random() * 0.4; // 30-70% recyclable
    
    return {
      collectionDate: date,
      region: regions[i % regions.length],
      zone: `Zone ${i % 5}`,
      householdId: `HH${String(i % 10).padStart(3, '0')}`,
      customerType: i % 10 === 0 ? 'business' : 'household',
      wasteType: wasteTypes[i % wasteTypes.length],
      billingModel: billingModels[i % billingModels.length],
      weightKg: Number(weightKg.toFixed(2)),
      recyclableKg: Number((weightKg * recyclableRatio).toFixed(2)),
      nonRecyclableKg: Number((weightKg * (1 - recyclableRatio)).toFixed(2)),
      recyclableRatio: Number(recyclableRatio.toFixed(2)),
    };
  });
}

/**
 * Generates mock user data
 * @param {string} role - User role (admin, user, collector)
 * @returns {object} Mock user object
 */
function generateMockUser(role = 'admin') {
  return {
    _id: '507f1f77bcf86cd799439011',
    email: `${role}@test.com`,
    name: `Test ${role}`,
    role: role,
    createdAt: new Date('2024-01-01'),
  };
}

/**
 * Generates valid report criteria
 * @param {object} overrides - Override default values
 * @returns {object} Valid criteria object
 */
function generateValidCriteria(overrides = {}) {
  return {
    dateRange: {
      from: '2024-01-01',
      to: '2024-01-31',
    },
    regions: [],
    wasteTypes: [],
    billingModels: [],
    ...overrides,
  };
}

/**
 * Creates a mock Express request object
 * @param {object} data - Request data
 * @returns {object} Mock request
 */
function createMockRequest(data = {}) {
  return {
    body: data.body || {},
    params: data.params || {},
    query: data.query || {},
    headers: data.headers || {},
  };
}

/**
 * Creates a mock Express response object
 * @returns {object} Mock response with jest functions
 */
function createMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Creates a mock Express next function
 * @returns {Function} Mock next function
 */
function createMockNext() {
  return jest.fn();
}

/**
 * Validates report structure
 * @param {object} report - Report data to validate
 * @returns {boolean} True if valid
 */
function validateReportStructure(report) {
  if (!report) return false;
  
  const hasRequiredKeys = 
    report.criteria &&
    report.totals &&
    report.charts &&
    report.tables;
  
  if (!hasRequiredKeys) return false;
  
  const hasChartKeys = 
    report.charts.regionSummary &&
    report.charts.wasteSummary &&
    report.charts.recyclingSplit &&
    report.charts.timeSeries;
  
  if (!hasChartKeys) return false;
  
  const hasTableKeys = 
    report.tables.households &&
    report.tables.regions &&
    report.tables.wasteTypes;
  
  return hasTableKeys;
}

/**
 * Validates numeric precision in report
 * @param {number} value - Value to check
 * @param {number} maxDecimals - Maximum decimal places
 * @returns {boolean} True if precision is correct
 */
function validateNumericPrecision(value, maxDecimals = 2) {
  if (typeof value !== 'number') return false;
  const decimals = (value.toString().split('.')[1] || '').length;
  return decimals <= maxDecimals;
}

/**
 * Calculates expected totals from mock records
 * @param {Array} records - Array of records
 * @returns {object} Calculated totals
 */
function calculateExpectedTotals(records) {
  return {
    records: records.length,
    totalWeightKg: Number(records.reduce((sum, r) => sum + r.weightKg, 0).toFixed(2)),
    recyclableWeightKg: Number(records.reduce((sum, r) => sum + r.recyclableKg, 0).toFixed(2)),
    nonRecyclableWeightKg: Number(records.reduce((sum, r) => sum + r.nonRecyclableKg, 0).toFixed(2)),
  };
}

/**
 * Groups records by a key function
 * @param {Array} records - Records to group
 * @param {Function} keyFn - Function to extract key
 * @returns {Map} Grouped records
 */
function groupRecords(records, keyFn) {
  return records.reduce((acc, record) => {
    const key = keyFn(record);
    if (!acc.has(key)) {
      acc.set(key, []);
    }
    acc.get(key).push(record);
    return acc;
  }, new Map());
}

/**
 * Generates test cases for validation errors
 * @returns {Array} Array of test cases
 */
function getValidationErrorTestCases() {
  return [
    {
      name: 'missing userId',
      payload: {
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      },
      expectedError: 'User id is required',
    },
    {
      name: 'empty userId',
      payload: {
        userId: '',
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      },
      expectedError: 'User id is required',
    },
    {
      name: 'missing dateRange',
      payload: {
        userId: '507f1f77bcf86cd799439011',
        criteria: {},
      },
      expectedError: 'Start date is required',
    },
    {
      name: 'invalid date order',
      payload: {
        userId: '507f1f77bcf86cd799439011',
        criteria: {
          dateRange: { from: '2024-12-31', to: '2024-01-01' },
        },
      },
      expectedError: 'End date must be on or after the start date',
    },
    {
      name: 'missing start date',
      payload: {
        userId: '507f1f77bcf86cd799439011',
        criteria: {
          dateRange: { to: '2024-01-31' },
        },
      },
      expectedError: 'Start date is required',
    },
    {
      name: 'missing end date',
      payload: {
        userId: '507f1f77bcf86cd799439011',
        criteria: {
          dateRange: { from: '2024-01-01' },
        },
      },
      expectedError: 'End date is required',
    },
  ];
}

/**
 * Waits for async operations with timeout
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after timeout
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Mocks Mongoose model methods for testing
 * @param {object} model - Mongoose model to mock
 * @param {object} methods - Methods to mock
 */
function mockMongooseModel(model, methods = {}) {
  Object.keys(methods).forEach(method => {
    model[method] = jest.fn(methods[method]);
  });
}

module.exports = {
  generateMockRecords,
  generateMockUser,
  generateValidCriteria,
  createMockRequest,
  createMockResponse,
  createMockNext,
  validateReportStructure,
  validateNumericPrecision,
  calculateExpectedTotals,
  groupRecords,
  getValidationErrorTestCases,
  wait,
  mockMongooseModel,
};
