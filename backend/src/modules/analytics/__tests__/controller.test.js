const { z } = require('zod');
const controller = require('../controller');
const WasteCollectionRecord = require('../../../models/WasteCollectionRecord');
const User = require('../../../models/User');

// Mock the models
jest.mock('../../../models/WasteCollectionRecord');
jest.mock('../../../models/User');

describe('Analytics Controller', () => {
  let req, res, next;
  let consoleErrorSpy;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      query: {},
    };
    res = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    
    // Suppress console.error during tests to reduce noise
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (consoleErrorSpy) {
      consoleErrorSpy.mockRestore();
    }
  });

  describe('getConfig', () => {
    it('should return configuration with all filters and date ranges', async () => {
      const mockRegions = ['Colombo', 'Kandy', 'Galle'];
      const mockWasteTypes = ['household', 'recyclable', 'organic'];
      const mockBillingModels = ['weight-based', 'flat-fee', 'subscription'];
      const mockFirstRecord = { collectionDate: new Date('2024-01-01') };
      const mockLastRecord = { collectionDate: new Date('2024-12-31') };

      WasteCollectionRecord.distinct = jest.fn((field) => {
        const mockData = {
          region: mockRegions,
          wasteType: mockWasteTypes,
          billingModel: mockBillingModels,
        };
        return {
          lean: jest.fn().mockResolvedValue(mockData[field] || []),
        };
      });

      const findOneMock = jest.fn()
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(mockFirstRecord),
        })
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(mockLastRecord),
        });

      WasteCollectionRecord.findOne = findOneMock;

      await controller.getConfig(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        filters: {
          regions: mockRegions,
          wasteTypes: mockWasteTypes,
          billingModels: mockBillingModels,
          defaultDateRange: {
            from: mockFirstRecord.collectionDate,
            to: mockLastRecord.collectionDate,
          },
        },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return null dates when no records exist', async () => {
      WasteCollectionRecord.distinct = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([]),
      }));

      WasteCollectionRecord.findOne = jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      }));

      await controller.getConfig(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        filters: {
          regions: [],
          wasteTypes: [],
          billingModels: [],
          defaultDateRange: {
            from: null,
            to: null,
          },
        },
      });
    });

    it('should handle errors and call next with error', async () => {
      const mockError = new Error('Database error');
      
      WasteCollectionRecord.distinct = jest.fn(() => {
        throw mockError;
      });

      try {
        await controller.getConfig(req, res, next);
      } catch (err) {
        // Error handled by controller
      }

      expect(next).toHaveBeenCalledWith(mockError);
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe('generateReport', () => {
    const mockUser = {
      _id: '507f1f77bcf86cd799439011',
      role: 'admin',
      email: 'admin@test.com',
    };

    const createMockRecords = (count = 10) => {
      const records = [];
      for (let i = 0; i < count; i++) {
        records.push({
          collectionDate: new Date(`2024-01-0${(i % 9) + 1}`),
          region: i % 2 === 0 ? 'Colombo' : 'Kandy',
          zone: `Zone ${i % 3}`,
          householdId: `HH${String(i % 3).padStart(3, '0')}`,
          customerType: 'household',
          wasteType: i % 2 === 0 ? 'household' : 'recyclable',
          billingModel: i % 2 === 0 ? 'weight-based' : 'flat-fee',
          weightKg: 10 + i,
          recyclableKg: 5 + (i * 0.5),
          nonRecyclableKg: 5 + (i * 0.5),
          recyclableRatio: 0.5,
        });
      }
      return records;
    };

    beforeEach(() => {
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
    });

    it('should generate a complete report with all data', async () => {
      const mockRecords = createMockRecords(10);
      
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      expect(User.findById).toHaveBeenCalledWith(mockUser._id);
      expect(WasteCollectionRecord.find).toHaveBeenCalled();
      
      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.data.criteria).toBeDefined();
      expect(response.data.totals).toBeDefined();
      expect(response.data.totals.records).toBe(10);
      expect(response.data.totals.totalWeightKg).toBeGreaterThan(0);
      expect(response.data.charts).toBeDefined();
      expect(response.data.charts.regionSummary).toBeDefined();
      expect(response.data.charts.wasteSummary).toBeDefined();
      expect(response.data.charts.recyclingSplit).toBeDefined();
      expect(response.data.charts.timeSeries).toBeDefined();
      expect(response.data.tables).toBeDefined();
      expect(response.data.tables.households).toBeDefined();
    });

    it('should return 401 when user is not found', async () => {
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(null),
      }));

      await controller.generateReport(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        ok: false,
        message: 'User is not authenticated',
      });
    });

    it('should return 403 when user is not an admin', async () => {
      const regularUser = { ...mockUser, role: 'user' };
      
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(regularUser),
      }));

      await controller.generateReport(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        ok: false,
        message: 'You are not authorised to access analytics',
      });
    });

    it('should return null data when no records match criteria', async () => {
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([]),
      }));

      await controller.generateReport(req, res, next);

      expect(res.json).toHaveBeenCalledWith({
        ok: true,
        data: null,
        message: 'No Records Available',
      });
    });

    it('should handle missing optional filters', async () => {
      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: {
            from: '2024-01-01',
            to: '2024-01-31',
          },
        },
      };

      const mockRecords = createMockRecords(5);
      
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      expect(response.data.criteria.regions).toEqual([]);
      expect(response.data.criteria.wasteTypes).toEqual([]);
      expect(response.data.criteria.billingModels).toEqual([]);
    });

    it('should validate and reject invalid date range', async () => {
      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: {
            from: '2024-01-31',
            to: '2024-01-01', // End date before start date
          },
        },
      };

      await controller.generateReport(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(false);
      expect(response.message).toBeDefined();
      expect(response.issues).toBeDefined();
    });

    it('should return 400 for missing userId', async () => {
      req.body = {
        criteria: {
          dateRange: {
            from: '2024-01-01',
            to: '2024-01-31',
          },
        },
      };

      await controller.generateReport(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          message: expect.any(String),
        })
      );
    });

    it('should return 400 for missing dateRange', async () => {
      req.body = {
        userId: mockUser._id,
        criteria: {},
      };

      await controller.generateReport(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for invalid date format', async () => {
      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: {
            from: 'invalid-date',
            to: '2024-01-31',
          },
        },
      };

      await controller.generateReport(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should correctly group and calculate household data', async () => {
      const mockRecords = [
        {
          collectionDate: new Date('2024-01-01'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 20,
          recyclableKg: 10,
          nonRecyclableKg: 10,
        },
        {
          collectionDate: new Date('2024-01-02'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 30,
          recyclableKg: 15,
          nonRecyclableKg: 15,
        },
        {
          collectionDate: new Date('2024-01-01'),
          region: 'Kandy',
          householdId: 'HH002',
          wasteType: 'recyclable',
          billingModel: 'flat-fee',
          weightKg: 15,
          recyclableKg: 12,
          nonRecyclableKg: 3,
        },
      ];
      
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.data.tables.households).toHaveLength(2);
      
      const hh001 = response.data.tables.households.find(h => h.householdId === 'HH001');
      expect(hh001.totalKg).toBe(50);
      expect(hh001.pickups).toBe(2);
      expect(hh001.averagePickupKg).toBe(25);
      expect(hh001.region).toBe('Colombo');
      expect(hh001.billingModel).toBe('weight-based');
    });

    it('should correctly calculate regional summaries', async () => {
      const mockRecords = createMockRecords(10);
      
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.data.charts.regionSummary).toBeDefined();
      expect(response.data.charts.regionSummary.length).toBeGreaterThan(0);
      
      response.data.charts.regionSummary.forEach(region => {
        expect(region).toHaveProperty('region');
        expect(region).toHaveProperty('totalKg');
        expect(region).toHaveProperty('collectionCount');
        expect(region).toHaveProperty('averageKg');
        expect(region.totalKg).toBeGreaterThanOrEqual(0);
      });
    });

    it('should correctly calculate waste type summaries', async () => {
      const mockRecords = createMockRecords(10);
      
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.data.charts.wasteSummary).toBeDefined();
      
      response.data.charts.wasteSummary.forEach(waste => {
        expect(waste).toHaveProperty('wasteType');
        expect(waste).toHaveProperty('totalKg');
        expect(waste).toHaveProperty('recyclableKg');
        expect(waste).toHaveProperty('nonRecyclableKg');
        expect(waste.totalKg).toBe(waste.recyclableKg + waste.nonRecyclableKg);
      });
    });

    it('should generate time series data sorted by date', async () => {
      const mockRecords = createMockRecords(10);
      
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.data.charts.timeSeries).toBeDefined();
      expect(Array.isArray(response.data.charts.timeSeries)).toBe(true);
      
      // Check that dates are sorted
      for (let i = 1; i < response.data.charts.timeSeries.length; i++) {
        expect(response.data.charts.timeSeries[i].day >= response.data.charts.timeSeries[i - 1].day).toBe(true);
      }
    });

    it('should handle records with missing optional fields', async () => {
      const mockRecords = [
        {
          collectionDate: new Date('2024-01-01'),
          region: '',
          householdId: 'HH001',
          wasteType: '',
          billingModel: 'weight-based',
          weightKg: 20,
          recyclableKg: 0,
          nonRecyclableKg: 0,
        },
      ];
      
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.ok).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should handle database errors during record fetch', async () => {
      const dbError = new Error('Database connection failed');
      
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => {
        throw dbError;
      });

      try {
        await controller.generateReport(req, res, next);
      } catch (err) {
        // Error handled by controller
      }

      expect(next).toHaveBeenCalledWith(dbError);
    });

    it('should reject extra fields in request body (strict validation)', async () => {
      req.body = {
        userId: mockUser._id,
        criteria: {
          dateRange: {
            from: '2024-01-01',
            to: '2024-01-31',
          },
        },
        extraField: 'should not be here',
      };

      await controller.generateReport(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should sort households by total weight in descending order', async () => {
      const mockRecords = [
        {
          collectionDate: new Date('2024-01-01'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 10,
          recyclableKg: 5,
          nonRecyclableKg: 5,
        },
        {
          collectionDate: new Date('2024-01-01'),
          region: 'Colombo',
          householdId: 'HH002',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 30,
          recyclableKg: 15,
          nonRecyclableKg: 15,
        },
        {
          collectionDate: new Date('2024-01-01'),
          region: 'Colombo',
          householdId: 'HH003',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 20,
          recyclableKg: 10,
          nonRecyclableKg: 10,
        },
      ];
      
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      const households = response.data.tables.households;
      
      expect(households[0].householdId).toBe('HH002'); // 30kg
      expect(households[1].householdId).toBe('HH003'); // 20kg
      expect(households[2].householdId).toBe('HH001'); // 10kg
    });

    it('should correctly calculate recycling split totals', async () => {
      const mockRecords = [
        {
          collectionDate: new Date('2024-01-01'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 100,
          recyclableKg: 60,
          nonRecyclableKg: 40,
        },
        {
          collectionDate: new Date('2024-01-02'),
          region: 'Colombo',
          householdId: 'HH002',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 80,
          recyclableKg: 30,
          nonRecyclableKg: 50,
        },
      ];
      
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      await controller.generateReport(req, res, next);

      const response = res.json.mock.calls[0][0];
      expect(response.data.charts.recyclingSplit.recyclableWeightKg).toBe(90);
      expect(response.data.charts.recyclingSplit.nonRecyclableWeightKg).toBe(90);
      expect(response.data.totals.totalWeightKg).toBe(180);
    });
  });
});
