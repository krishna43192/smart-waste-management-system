const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const analyticsRoutes = require('../routes');
const WasteCollectionRecord = require('../../../models/WasteCollectionRecord');
const User = require('../../../models/User');

// Mock the models for integration tests
jest.mock('../../../models/WasteCollectionRecord');
jest.mock('../../../models/User');

describe('Analytics Integration Tests', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/analytics', analyticsRoutes);
    
    // Global error handler
    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({
        ok: false,
        message: err.message || 'Internal server error',
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Analytics Workflow', () => {
    it('should fetch config, then generate report successfully', async () => {
      // Step 1: Get configuration
      const mockRegions = ['Colombo', 'Kandy', 'Galle'];
      const mockWasteTypes = ['household', 'recyclable'];
      const mockBillingModels = ['weight-based', 'flat-fee'];
      
      WasteCollectionRecord.distinct = jest.fn((field) => {
        const data = {
          region: mockRegions,
          wasteType: mockWasteTypes,
          billingModel: mockBillingModels,
        };
        return {
          lean: jest.fn().mockResolvedValue(data[field] || []),
        };
      });

      WasteCollectionRecord.findOne = jest.fn(() => ({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn()
          .mockResolvedValueOnce({ collectionDate: new Date('2024-01-01') })
          .mockResolvedValueOnce({ collectionDate: new Date('2024-12-31') }),
      }));

      const configResponse = await request(app)
        .get('/analytics/config')
        .expect(200);

      expect(configResponse.body.ok).toBe(true);
      expect(configResponse.body.filters.regions).toEqual(mockRegions);

      // Step 2: Generate report using the config
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        role: 'admin',
      };

      const mockRecords = [
        {
          collectionDate: new Date('2024-01-15'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 25,
          recyclableKg: 15,
          nonRecyclableKg: 10,
        },
      ];

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      const reportResponse = await request(app)
        .post('/analytics/report')
        .send({
          userId: mockUser._id,
          criteria: {
            dateRange: {
              from: configResponse.body.filters.defaultDateRange.from,
              to: configResponse.body.filters.defaultDateRange.to,
            },
            regions: [mockRegions[0]],
          },
        })
        .expect(200);

      expect(reportResponse.body.ok).toBe(true);
      expect(reportResponse.body.data).toBeDefined();
      expect(reportResponse.body.data.totals.records).toBe(1);
    });

    it('should handle end-to-end error scenarios', async () => {
      // Simulate database connection error during config fetch
      WasteCollectionRecord.distinct = jest.fn(() => {
        throw new Error('Connection timeout');
      });

      const response = await request(app)
        .get('/analytics/config');

      expect(response.status).toBe(500);
      expect(response.body.ok).toBe(false);
    });

    it('should validate complete request-response cycle with filters', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        role: 'admin',
      };

      const mockRecords = Array.from({ length: 50 }, (_, i) => ({
        collectionDate: new Date(`2024-01-${String(i % 28 + 1).padStart(2, '0')}`),
        region: i % 3 === 0 ? 'Colombo' : i % 3 === 1 ? 'Kandy' : 'Galle',
        householdId: `HH${String(i % 10).padStart(3, '0')}`,
        wasteType: i % 2 === 0 ? 'household' : 'recyclable',
        billingModel: i % 2 === 0 ? 'weight-based' : 'flat-fee',
        weightKg: 10 + i,
        recyclableKg: 5 + (i * 0.3),
        nonRecyclableKg: 5 + (i * 0.3),
      }));

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      const response = await request(app)
        .post('/analytics/report')
        .send({
          userId: mockUser._id,
          criteria: {
            dateRange: {
              from: '2024-01-01',
              to: '2024-01-31',
            },
            regions: ['Colombo', 'Kandy'],
            wasteTypes: ['household', 'recyclable'],
            billingModels: ['weight-based', 'flat-fee'],
          },
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.data.totals.records).toBe(50);
      expect(response.body.data.charts.regionSummary.length).toBeGreaterThan(0);
      expect(response.body.data.charts.wasteSummary.length).toBeGreaterThan(0);
      expect(response.body.data.charts.timeSeries.length).toBeGreaterThan(0);
      expect(response.body.data.tables.households.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle authentication flow correctly', async () => {
      // Test unauthenticated user
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(null),
      }));

      await request(app)
        .post('/analytics/report')
        .send({
          userId: 'nonexistent-user-id',
          criteria: {
            dateRange: {
              from: '2024-01-01',
              to: '2024-01-31',
            },
          },
        })
        .expect(401);

      // Test unauthorized user (non-admin)
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          role: 'user',
        }),
      }));

      await request(app)
        .post('/analytics/report')
        .send({
          userId: '507f1f77bcf86cd799439011',
          criteria: {
            dateRange: {
              from: '2024-01-01',
              to: '2024-01-31',
            },
          },
        })
        .expect(403);

      // Test authorized user (admin)
      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue({
          _id: '507f1f77bcf86cd799439011',
          role: 'admin',
        }),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue([]),
      }));

      await request(app)
        .post('/analytics/report')
        .send({
          userId: '507f1f77bcf86cd799439011',
          criteria: {
            dateRange: {
              from: '2024-01-01',
              to: '2024-01-31',
            },
          },
        })
        .expect(200);
    });

    it('should handle various validation error scenarios', async () => {
      const testCases = [
        {
          name: 'missing userId',
          payload: {
            criteria: {
              dateRange: {
                from: '2024-01-01',
                to: '2024-01-31',
              },
            },
          },
          expectedStatus: 400,
        },
        {
          name: 'empty userId',
          payload: {
            userId: '',
            criteria: {
              dateRange: {
                from: '2024-01-01',
                to: '2024-01-31',
              },
            },
          },
          expectedStatus: 400,
        },
        {
          name: 'missing dateRange',
          payload: {
            userId: '507f1f77bcf86cd799439011',
            criteria: {},
          },
          expectedStatus: 400,
        },
        {
          name: 'invalid date order',
          payload: {
            userId: '507f1f77bcf86cd799439011',
            criteria: {
              dateRange: {
                from: '2024-12-31',
                to: '2024-01-01',
              },
            },
          },
          expectedStatus: 400,
        },
        {
          name: 'invalid date format',
          payload: {
            userId: '507f1f77bcf86cd799439011',
            criteria: {
              dateRange: {
                from: 'not-a-date',
                to: '2024-01-31',
              },
            },
          },
          expectedStatus: 400,
        },
      ];

      for (const testCase of testCases) {
        const response = await request(app)
          .post('/analytics/report')
          .send(testCase.payload)
          .expect(testCase.expectedStatus);

        expect(response.body.ok).toBe(false);
      }
    });
  });

  describe('Data Integrity Tests', () => {
    it('should ensure all numeric values are properly formatted', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        role: 'admin',
      };

      const mockRecords = [
        {
          collectionDate: new Date('2024-01-15'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 25.12345,
          recyclableKg: 15.6789,
          nonRecyclableKg: 9.44455,
        },
      ];

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      const response = await request(app)
        .post('/analytics/report')
        .send({
          userId: mockUser._id,
          criteria: {
            dateRange: {
              from: '2024-01-01',
              to: '2024-01-31',
            },
          },
        })
        .expect(200);

      // Check that all numbers are properly rounded to 2 decimal places
      expect(response.body.data.totals.totalWeightKg).toBe(25.12);
      expect(response.body.data.totals.recyclableWeightKg).toBe(15.68);
      expect(response.body.data.totals.nonRecyclableWeightKg).toBe(9.44);
      
      // Check household data
      expect(response.body.data.tables.households[0].totalKg).toBe(25.12);
    });

    it('should handle zero values correctly', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        role: 'admin',
      };

      const mockRecords = [
        {
          collectionDate: new Date('2024-01-15'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 0,
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

      const response = await request(app)
        .post('/analytics/report')
        .send({
          userId: mockUser._id,
          criteria: {
            dateRange: {
              from: '2024-01-01',
              to: '2024-01-31',
            },
          },
        })
        .expect(200);

      expect(response.body.data.totals.totalWeightKg).toBe(0);
      expect(response.body.data.totals.recyclableWeightKg).toBe(0);
      expect(response.body.data.totals.nonRecyclableWeightKg).toBe(0);
    });

    it('should maintain data consistency across all report sections', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        role: 'admin',
      };

      const mockRecords = Array.from({ length: 20 }, (_, i) => ({
        collectionDate: new Date('2024-01-15'),
        region: i < 10 ? 'Colombo' : 'Kandy',
        householdId: `HH${String(i % 5).padStart(3, '0')}`,
        wasteType: 'household',
        billingModel: 'weight-based',
        weightKg: 10,
        recyclableKg: 6,
        nonRecyclableKg: 4,
      }));

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      const response = await request(app)
        .post('/analytics/report')
        .send({
          userId: mockUser._id,
          criteria: {
            dateRange: {
              from: '2024-01-01',
              to: '2024-01-31',
            },
          },
        })
        .expect(200);

      // Total from all records should match
      expect(response.body.data.totals.records).toBe(20);
      expect(response.body.data.totals.totalWeightKg).toBe(200);
      
      // Regional totals should sum to overall total
      const regionTotal = response.body.data.charts.regionSummary
        .reduce((sum, r) => sum + r.totalKg, 0);
      expect(regionTotal).toBe(200);
      
      // Recycling split should sum correctly
      const recyclingSplitTotal = 
        response.body.data.charts.recyclingSplit.recyclableWeightKg +
        response.body.data.charts.recyclingSplit.nonRecyclableWeightKg;
      expect(recyclingSplitTotal).toBe(200);
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large datasets efficiently', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        role: 'admin',
      };

      // Generate 1000 records
      const mockRecords = Array.from({ length: 1000 }, (_, i) => ({
        collectionDate: new Date(`2024-01-${String((i % 28) + 1).padStart(2, '0')}`),
        region: ['Colombo', 'Kandy', 'Galle'][i % 3],
        householdId: `HH${String(i % 100).padStart(3, '0')}`,
        wasteType: ['household', 'recyclable', 'organic'][i % 3],
        billingModel: ['weight-based', 'flat-fee', 'subscription'][i % 3],
        weightKg: 10 + (i % 50),
        recyclableKg: 5 + (i % 25),
        nonRecyclableKg: 5 + (i % 25),
      }));

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      const startTime = Date.now();
      
      const response = await request(app)
        .post('/analytics/report')
        .send({
          userId: mockUser._id,
          criteria: {
            dateRange: {
              from: '2024-01-01',
              to: '2024-01-31',
            },
          },
        })
        .expect(200);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(response.body.ok).toBe(true);
      expect(response.body.data.totals.records).toBe(1000);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle single record correctly', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        role: 'admin',
      };

      const mockRecords = [
        {
          collectionDate: new Date('2024-01-15'),
          region: 'Colombo',
          householdId: 'HH001',
          wasteType: 'household',
          billingModel: 'weight-based',
          weightKg: 25,
          recyclableKg: 15,
          nonRecyclableKg: 10,
        },
      ];

      User.findById = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockUser),
      }));

      WasteCollectionRecord.find = jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(mockRecords),
      }));

      const response = await request(app)
        .post('/analytics/report')
        .send({
          userId: mockUser._id,
          criteria: {
            dateRange: {
              from: '2024-01-01',
              to: '2024-01-31',
            },
          },
        })
        .expect(200);

      expect(response.body.data.totals.records).toBe(1);
      expect(response.body.data.tables.households).toHaveLength(1);
      expect(response.body.data.tables.households[0].averagePickupKg).toBe(25);
    });
  });
});
