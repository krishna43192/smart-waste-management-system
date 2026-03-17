const controller = require('../controller');
const WasteCollectionRecord = require('../../../models/WasteCollectionRecord');
const User = require('../../../models/User');
const {
  generateMockRecords,
  generateMockUser,
  createMockRequest,
  createMockResponse,
  createMockNext,
  validateReportStructure,
  validateNumericPrecision,
  calculateExpectedTotals,
} = require('./utils');

jest.mock('../../../models/WasteCollectionRecord');
jest.mock('../../../models/User');

describe('Analytics Edge Cases and Error Scenarios', () => {
  let req, res, next;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    next = createMockNext();
    jest.clearAllMocks();
  });

  describe('Extreme Data Scenarios', () => {
    it('should handle records with very large weight values', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = [
        {
          collectionDate: new Date('2024-01-15'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'industrial',
          billingModel: 'weight-based',
          weightKg: 999999.99,
          recyclableKg: 500000.50,
          nonRecyclableKg: 499999.49,
        },
      ];

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      expect(response.data.totals.totalWeightKg).toBe(999999.99);
    });

    it('should handle records with decimal precision edge cases', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = [
        {
          collectionDate: new Date('2024-01-15'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 0.01,
          recyclableKg: 0.005,
          nonRecyclableKg: 0.005,
        },
      ];

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      expect(validateNumericPrecision(response.data.totals.totalWeightKg)).toBe(true);
    });

    it('should handle many records from single household', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = Array.from({ length: 100 }, (_, i) => ({
        collectionDate: new Date(`2024-01-${String((i % 28) + 1).padStart(2, '0')}`),
        region: 'Colombo',
        householdId: 'HH001', // Same household
        wasteType: 'household',
        billingModel: 'weight-based',
        weightKg: 10,
        recyclableKg: 5,
        nonRecyclableKg: 5,
      }));

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.data.tables.households).toHaveLength(1);
      expect(response.data.tables.households[0].pickups).toBe(100);
      expect(response.data.tables.households[0].totalKg).toBe(1000);
      expect(response.data.tables.households[0].averagePickupKg).toBe(10);
    });

    it('should handle records spanning multiple years', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = [
        {
          collectionDate: new Date('2023-01-15'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 10,
          recyclableKg: 5,
          nonRecyclableKg: 5,
        },
        {
          collectionDate: new Date('2024-12-15'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 15,
          recyclableKg: 8,
          nonRecyclableKg: 7,
        },
      ];

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: { from: '2023-01-01', to: '2024-12-31' },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      expect(response.data.totals.records).toBe(2);
    });

    it('should handle all records on same day', async () => {
      const mockUser = generateMockUser('admin');
      const sameDate = new Date('2024-01-15');
      const mockRecords = Array.from({ length: 50 }, (_, i) => ({
        collectionDate: sameDate,
        region: ['Colombo', 'Kandy'][i % 2],
        householdId: `HH${String(i).padStart(3, '0')}`,
        wasteType: 'household',
        billingModel: 'weight-based',
        weightKg: 10 + i,
        recyclableKg: 5 + i * 0.5,
        nonRecyclableKg: 5 + i * 0.5,
      }));

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.data.charts.timeSeries).toHaveLength(1);
      expect(response.data.charts.timeSeries[0].day).toBe('2024-01-15');
      expect(response.data.charts.timeSeries[0].pickups).toBe(50);
    });
  });

  describe('Missing and Null Data Handling', () => {
    it('should handle records with undefined region', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = [
        {
          collectionDate: new Date('2024-01-15'),
          region: undefined,
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 10,
          recyclableKg: 5,
          nonRecyclableKg: 5,
        },
      ];

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      expect(response.data.tables.households[0].region).toBe('—');
    });

    it('should handle records with null wasteType', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = [
        {
          collectionDate: new Date('2024-01-15'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: null,
          billingModel: 'weight-based',
          weightKg: 10,
          recyclableKg: 5,
          nonRecyclableKg: 5,
        },
      ];

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      // Should handle as "Unknown"
      const unknownWaste = response.data.charts.wasteSummary.find(w => w.wasteType === 'Unknown');
      expect(unknownWaste).toBeDefined();
    });

    it('should handle undefined recyclable/non-recyclable weights', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = [
        {
          collectionDate: new Date('2024-01-15'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 20,
          recyclableKg: undefined,
          nonRecyclableKg: undefined,
        },
      ];

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      expect(response.data.totals.recyclableWeightKg).toBe(0);
      expect(response.data.totals.nonRecyclableWeightKg).toBe(0);
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle date range with single day', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = generateMockRecords(5);

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: {
            from: '2024-01-15',
            to: '2024-01-15', // Same day
          },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      expect(response.data.criteria.dateRange.from).toEqual(new Date('2024-01-15'));
      expect(response.data.criteria.dateRange.to).toEqual(new Date('2024-01-15'));
    });

    it('should handle empty array filters', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = generateMockRecords(10);

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: {
            from: '2024-01-01',
            to: '2024-01-31',
          },
          regions: [],
          wasteTypes: [],
          billingModels: [],
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      expect(response.data.criteria.regions).toEqual([]);
    });

    it('should handle single item filter arrays', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = generateMockRecords(10);

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: {
            from: '2024-01-01',
            to: '2024-01-31',
          },
          regions: ['Colombo'],
          wasteTypes: ['household'],
          billingModels: ['weight-based'],
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const matchCall = WasteCollectionRecord.find.mock.calls[0][0];
      expect(matchCall.region).toEqual({ $in: ['Colombo'] });
      expect(matchCall.wasteType).toEqual({ $in: ['household'] });
      expect(matchCall.billingModel).toEqual({ $in: ['weight-based'] });
    });
  });

  describe('Special Character and String Handling', () => {
    it('should handle regions with special characters', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = [
        {
          collectionDate: new Date('2024-01-15'),
          region: 'Colombo-North/East',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 10,
          recyclableKg: 5,
          nonRecyclableKg: 5,
        },
      ];

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      expect(response.data.charts.regionSummary[0].region).toBe('Colombo-North/East');
    });

    it('should handle household IDs with various formats', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = [
        {
          collectionDate: new Date('2024-01-15'),
          region: 'Colombo',
          householdId: 'HH-2024-001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 10,
          recyclableKg: 5,
          nonRecyclableKg: 5,
        },
        {
          collectionDate: new Date('2024-01-16'),
          region: 'Colombo',
          householdId: 'BUS_12345',
          wasteType: 'business',
          billingModel: 'flat-fee',
          weightKg: 25,
          recyclableKg: 15,
          nonRecyclableKg: 10,
        },
      ];

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.data.tables.households).toHaveLength(2);
      const householdIds = response.data.tables.households.map(h => h.householdId);
      expect(householdIds).toContain('HH-2024-001');
      expect(householdIds).toContain('BUS_12345');
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple simultaneous report requests', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = generateMockRecords(20);

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      const requests = Array.from({ length: 5 }, (_, i) => {
        const req = createMockRequest({
          body: {
            userId: mockUser._id,
            criteria: {
              dateRange: {
                from: `2024-0${i + 1}-01`,
                to: `2024-0${i + 1}-28`,
              },
            },
          },
        });
        const res = createMockResponse();
        const next = createMockNext();
        
        return controller.generateReport(req, res, next);
      });

      await Promise.all(requests);

      expect(User.findById).toHaveBeenCalledTimes(5);
      expect(WasteCollectionRecord.find).toHaveBeenCalledTimes(5);
    });
  });

  describe('Performance Edge Cases', () => {
    it('should handle grouping with many unique households', async () => {
      const mockUser = generateMockUser('admin');
      const mockRecords = Array.from({ length: 500 }, (_, i) => ({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: `HH${String(i).padStart(5, '0')}`, // 500 unique households
        wasteType: 'household',
        billingModel: 'weight-based',
        weightKg: 10,
        recyclableKg: 5,
        nonRecyclableKg: 5,
      }));

      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: { from: '2024-01-01', to: '2024-01-31' },
        },
      };

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.data.tables.households).toHaveLength(500);
    });
  });
});
