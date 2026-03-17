/**
 * Comprehensive tests for Analytics Report Service
 * 
 * Coverage:
 * - Query Builder (Builder pattern)
 * - Aggregation functions (Strategy pattern)
 * - Report Generator
 * - Utility functions
 * - Edge cases and error handling
 * 
 * Note: AnalyticsService tests are in controller.test.js since they require DB mocking
 */

const {
  WasteReportQueryBuilder,
  WasteReportGenerator,
  aggregateHouseholdStats,
  aggregateRegionStats,
  aggregateWasteTypeStats,
  aggregateTimeSeries,
} = require('../reportService');

describe('Analytics Report Service - Pure Functions', () => {

  describe('WasteReportQueryBuilder', () => {
    describe('Positive Cases', () => {
      it('should build query with date range only', () => {
        const builder = new WasteReportQueryBuilder();
        const query = builder
          .withDateRange('2024-01-01', '2024-01-31')
          .build();

        expect(query).toEqual({
          collectionDate: {
            $gte: new Date('2024-01-01'),
            $lte: new Date('2024-01-31'),
          },
        });
      });

      it('should build query with all filters', () => {
        const builder = new WasteReportQueryBuilder();
        const query = builder
          .withDateRange('2024-01-01', '2024-01-31')
          .withRegions(['Colombo', 'Kandy'])
          .withWasteTypes(['household', 'recyclable'])
          .withBillingModels(['weight-based'])
          .build();

        expect(query).toEqual({
          collectionDate: {
            $gte: new Date('2024-01-01'),
            $lte: new Date('2024-01-31'),
          },
          region: { $in: ['Colombo', 'Kandy'] },
          wasteType: { $in: ['household', 'recyclable'] },
          billingModel: { $in: ['weight-based'] },
        });
      });

      it('should support method chaining', () => {
        const builder = new WasteReportQueryBuilder();
        const result = builder.withDateRange('2024-01-01', '2024-01-31');
        
        expect(result).toBe(builder); // Returns same instance
        expect(typeof result.withRegions).toBe('function');
      });

      it('should handle single region filter', () => {
        const builder = new WasteReportQueryBuilder();
        const query = builder
          .withRegions(['Colombo'])
          .build();

        expect(query.region).toEqual({ $in: ['Colombo'] });
      });

      it('should handle multiple region filters', () => {
        const builder = new WasteReportQueryBuilder();
        const query = builder
          .withRegions(['Colombo', 'Kandy', 'Galle'])
          .build();

        expect(query.region).toEqual({ $in: ['Colombo', 'Kandy', 'Galle'] });
      });
    });

    describe('Edge Cases', () => {
      it('should ignore empty region array', () => {
        const builder = new WasteReportQueryBuilder();
        const query = builder
          .withRegions([])
          .build();

        expect(query.region).toBeUndefined();
      });

      it('should ignore null regions', () => {
        const builder = new WasteReportQueryBuilder();
        const query = builder
          .withRegions(null)
          .build();

        expect(query.region).toBeUndefined();
      });

      it('should ignore undefined regions', () => {
        const builder = new WasteReportQueryBuilder();
        const query = builder
          .withRegions(undefined)
          .build();

        expect(query.region).toBeUndefined();
      });

      it('should return empty object when no filters applied', () => {
        const builder = new WasteReportQueryBuilder();
        const query = builder.build();

        expect(query).toEqual({});
      });

      it('should handle same-day date range', () => {
        const builder = new WasteReportQueryBuilder();
        const query = builder
          .withDateRange('2024-01-15', '2024-01-15')
          .build();

        expect(query.collectionDate.$gte).toEqual(new Date('2024-01-15'));
        expect(query.collectionDate.$lte).toEqual(new Date('2024-01-15'));
      });
    });
  });

  describe('Aggregation Functions', () => {
    describe('aggregateHouseholdStats', () => {
      it('should aggregate data for single household', () => {
        const records = [
          {
            householdId: 'HH001',
            region: 'Colombo',
            billingModel: 'weight-based',
            weightKg: 20,
          },
          {
            householdId: 'HH001',
            region: 'Colombo',
            billingModel: 'weight-based',
            weightKg: 30,
          },
        ];

        const result = aggregateHouseholdStats(records);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          householdId: 'HH001',
          totalKg: 50,
          averagePickupKg: 25,
          pickups: 2,
          region: 'Colombo',
          billingModel: 'weight-based',
        });
      });

      it('should aggregate data for multiple households', () => {
        const records = [
          { householdId: 'HH001', region: 'Colombo', billingModel: 'weight-based', weightKg: 20 },
          { householdId: 'HH002', region: 'Kandy', billingModel: 'flat-fee', weightKg: 15 },
          { householdId: 'HH001', region: 'Colombo', billingModel: 'weight-based', weightKg: 30 },
        ];

        const result = aggregateHouseholdStats(records);

        expect(result).toHaveLength(2);
        expect(result.find(h => h.householdId === 'HH001').totalKg).toBe(50);
        expect(result.find(h => h.householdId === 'HH002').totalKg).toBe(15);
      });

      it('should sort households by total weight descending', () => {
        const records = [
          { householdId: 'HH001', region: 'Colombo', billingModel: 'weight-based', weightKg: 10 },
          { householdId: 'HH002', region: 'Kandy', billingModel: 'weight-based', weightKg: 30 },
          { householdId: 'HH003', region: 'Galle', billingModel: 'weight-based', weightKg: 20 },
        ];

        const result = aggregateHouseholdStats(records);

        expect(result[0].householdId).toBe('HH002'); // 30kg
        expect(result[1].householdId).toBe('HH003'); // 20kg
        expect(result[2].householdId).toBe('HH001'); // 10kg
      });

      it('should handle single pickup per household', () => {
        const records = [
          { householdId: 'HH001', region: 'Colombo', billingModel: 'weight-based', weightKg: 25 },
        ];

        const result = aggregateHouseholdStats(records);

        expect(result[0].pickups).toBe(1);
        expect(result[0].averagePickupKg).toBe(25);
      });

      it('should handle zero weights', () => {
        const records = [
          { householdId: 'HH001', region: 'Colombo', billingModel: 'flat-fee', weightKg: 0 },
          { householdId: 'HH001', region: 'Colombo', billingModel: 'flat-fee', weightKg: 0 },
        ];

        const result = aggregateHouseholdStats(records);

        expect(result[0].totalKg).toBe(0);
        expect(result[0].averagePickupKg).toBe(0);
      });

      it('should use default values for missing fields', () => {
        const records = [
          { householdId: 'HH001', region: null, billingModel: null, weightKg: 20 },
        ];

        const result = aggregateHouseholdStats(records);

        expect(result[0].region).toBe('—');
        expect(result[0].billingModel).toBe('—');
      });

      it('should return empty array for empty input', () => {
        const result = aggregateHouseholdStats([]);
        expect(result).toEqual([]);
      });
    });

    describe('aggregateRegionStats', () => {
      it('should aggregate data for single region', () => {
        const records = [
          { region: 'Colombo', weightKg: 20 },
          { region: 'Colombo', weightKg: 30 },
          { region: 'Colombo', weightKg: 25 },
        ];

        const result = aggregateRegionStats(records);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          region: 'Colombo',
          totalKg: 75,
          collectionCount: 3,
          averageKg: 25,
        });
      });

      it('should aggregate data for multiple regions', () => {
        const records = [
          { region: 'Colombo', weightKg: 20 },
          { region: 'Kandy', weightKg: 30 },
          { region: 'Colombo', weightKg: 10 },
        ];

        const result = aggregateRegionStats(records);

        expect(result).toHaveLength(2);
        expect(result.find(r => r.region === 'Colombo').totalKg).toBe(30);
        expect(result.find(r => r.region === 'Kandy').totalKg).toBe(30);
      });

      it('should sort regions by total weight descending', () => {
        const records = [
          { region: 'Colombo', weightKg: 50 },
          { region: 'Kandy', weightKg: 100 },
          { region: 'Galle', weightKg: 75 },
        ];

        const result = aggregateRegionStats(records);

        expect(result[0].region).toBe('Kandy');
        expect(result[1].region).toBe('Galle');
        expect(result[2].region).toBe('Colombo');
      });

      it('should handle missing region as "Unknown"', () => {
        const records = [
          { region: '', weightKg: 20 },
          { region: null, weightKg: 15 },
        ];

        const result = aggregateRegionStats(records);

        expect(result[0].region).toBe('Unknown');
        expect(result[0].totalKg).toBe(35);
      });

      it('should calculate correct average', () => {
        const records = [
          { region: 'Colombo', weightKg: 10 },
          { region: 'Colombo', weightKg: 20 },
          { region: 'Colombo', weightKg: 30 },
        ];

        const result = aggregateRegionStats(records);

        expect(result[0].averageKg).toBe(20); // (10+20+30)/3
      });

      it('should return empty array for empty input', () => {
        const result = aggregateRegionStats([]);
        expect(result).toEqual([]);
      });
    });

    describe('aggregateWasteTypeStats', () => {
      it('should aggregate data for single waste type', () => {
        const records = [
          { wasteType: 'household', recyclableKg: 10, nonRecyclableKg: 15 },
          { wasteType: 'household', recyclableKg: 20, nonRecyclableKg: 10 },
        ];

        const result = aggregateWasteTypeStats(records);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          wasteType: 'household',
          totalKg: 55,
          recyclableKg: 30,
          nonRecyclableKg: 25,
        });
      });

      it('should aggregate data for multiple waste types', () => {
        const records = [
          { wasteType: 'household', recyclableKg: 10, nonRecyclableKg: 15 },
          { wasteType: 'recyclable', recyclableKg: 25, nonRecyclableKg: 5 },
          { wasteType: 'household', recyclableKg: 20, nonRecyclableKg: 10 },
        ];

        const result = aggregateWasteTypeStats(records);

        expect(result).toHaveLength(2);
        const household = result.find(w => w.wasteType === 'household');
        const recyclable = result.find(w => w.wasteType === 'recyclable');
        
        expect(household.totalKg).toBe(55);
        expect(recyclable.totalKg).toBe(30);
      });

      it('should handle zero weights', () => {
        const records = [
          { wasteType: 'organic', recyclableKg: 0, nonRecyclableKg: 0 },
        ];

        const result = aggregateWasteTypeStats(records);

        expect(result[0].totalKg).toBe(0);
        expect(result[0].recyclableKg).toBe(0);
        expect(result[0].nonRecyclableKg).toBe(0);
      });

      it('should handle missing wasteType as "Unknown"', () => {
        const records = [
          { wasteType: '', recyclableKg: 10, nonRecyclableKg: 5 },
          { wasteType: null, recyclableKg: 15, nonRecyclableKg: 10 },
        ];

        const result = aggregateWasteTypeStats(records);

        expect(result[0].wasteType).toBe('Unknown');
        expect(result[0].totalKg).toBe(40);
      });

      it('should correctly sum recyclable and non-recyclable', () => {
        const records = [
          { wasteType: 'household', recyclableKg: 25.5, nonRecyclableKg: 14.5 },
        ];

        const result = aggregateWasteTypeStats(records);

        expect(result[0].totalKg).toBe(40);
      });

      it('should return empty array for empty input', () => {
        const result = aggregateWasteTypeStats([]);
        expect(result).toEqual([]);
      });
    });

    describe('aggregateTimeSeries', () => {
      it('should aggregate data by day', () => {
        const records = [
          { collectionDate: new Date('2024-01-15'), weightKg: 20 },
          { collectionDate: new Date('2024-01-15'), weightKg: 30 },
          { collectionDate: new Date('2024-01-16'), weightKg: 25 },
        ];

        const result = aggregateTimeSeries(records);

        expect(result).toHaveLength(2);
        expect(result.find(d => d.day === '2024-01-15').totalKg).toBe(50);
        expect(result.find(d => d.day === '2024-01-16').totalKg).toBe(25);
      });

      it('should sort days in ascending order', () => {
        const records = [
          { collectionDate: new Date('2024-01-20'), weightKg: 20 },
          { collectionDate: new Date('2024-01-15'), weightKg: 30 },
          { collectionDate: new Date('2024-01-18'), weightKg: 25 },
        ];

        const result = aggregateTimeSeries(records);

        expect(result[0].day).toBe('2024-01-15');
        expect(result[1].day).toBe('2024-01-18');
        expect(result[2].day).toBe('2024-01-20');
      });

      it('should count pickups per day', () => {
        const records = [
          { collectionDate: new Date('2024-01-15'), weightKg: 20 },
          { collectionDate: new Date('2024-01-15'), weightKg: 30 },
          { collectionDate: new Date('2024-01-15'), weightKg: 15 },
        ];

        const result = aggregateTimeSeries(records);

        expect(result[0].pickups).toBe(3);
        expect(result[0].totalKg).toBe(65);
      });

      it('should handle single day', () => {
        const records = [
          { collectionDate: new Date('2024-01-15'), weightKg: 50 },
        ];

        const result = aggregateTimeSeries(records);

        expect(result).toHaveLength(1);
        expect(result[0].day).toBe('2024-01-15');
        expect(result[0].totalKg).toBe(50);
        expect(result[0].pickups).toBe(1);
      });

      it('should return empty array for empty input', () => {
        const result = aggregateTimeSeries([]);
        expect(result).toEqual([]);
      });
    });
  });

  describe('WasteReportGenerator', () => {
    const mockRecords = [
      {
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH001',
        wasteType: 'household',
        billingModel: 'weight-based',
        weightKg: 50,
        recyclableKg: 30,
        nonRecyclableKg: 20,
      },
      {
        collectionDate: new Date('2024-01-16'),
        region: 'Kandy',
        householdId: 'HH002',
        wasteType: 'recyclable',
        billingModel: 'flat-fee',
        weightKg: 40,
        recyclableKg: 35,
        nonRecyclableKg: 5,
      },
    ];

    const mockCriteria = {
      dateRange: {
        from: '2024-01-01',
        to: '2024-01-31',
      },
      regions: ['Colombo'],
      wasteTypes: ['household'],
      billingModels: ['weight-based'],
    };

    describe('normalizeCriteria', () => {
      it('should normalize criteria with all fields', () => {
        const result = WasteReportGenerator.normalizeCriteria(mockCriteria);

        expect(result).toEqual({
          dateRange: {
            from: '2024-01-01',
            to: '2024-01-31',
          },
          regions: ['Colombo'],
          wasteTypes: ['household'],
          billingModels: ['weight-based'],
        });
      });

      it('should set empty arrays for missing optional fields', () => {
        const criteria = {
          dateRange: {
            from: '2024-01-01',
            to: '2024-01-31',
          },
        };

        const result = WasteReportGenerator.normalizeCriteria(criteria);

        expect(result.regions).toEqual([]);
        expect(result.wasteTypes).toEqual([]);
        expect(result.billingModels).toEqual([]);
      });
    });

    describe('calculateTotals', () => {
      it('should calculate totals correctly', () => {
        const result = WasteReportGenerator.calculateTotals(mockRecords);

        expect(result).toEqual({
          records: 2,
          totalWeightKg: 90,
          recyclableWeightKg: 65,
          nonRecyclableWeightKg: 25,
        });
      });

      it('should handle empty records', () => {
        const result = WasteReportGenerator.calculateTotals([]);

        expect(result).toEqual({
          records: 0,
          totalWeightKg: 0,
          recyclableWeightKg: 0,
          nonRecyclableWeightKg: 0,
        });
      });

      it('should round to 2 decimal places', () => {
        const records = [
          { weightKg: 10.123, recyclableKg: 5.678, nonRecyclableKg: 4.445 },
        ];

        const result = WasteReportGenerator.calculateTotals(records);

        expect(result.totalWeightKg).toBe(10.12);
        expect(result.recyclableWeightKg).toBe(5.68);
        expect(result.nonRecyclableWeightKg).toBe(4.45);
      });
    });

    describe('generate', () => {
      it('should generate complete report', () => {
        const result = WasteReportGenerator.generate(mockRecords, mockCriteria);

        expect(result).toHaveProperty('criteria');
        expect(result).toHaveProperty('totals');
        expect(result).toHaveProperty('charts');
        expect(result).toHaveProperty('tables');
        
        expect(result.charts).toHaveProperty('regionSummary');
        expect(result.charts).toHaveProperty('wasteSummary');
        expect(result.charts).toHaveProperty('recyclingSplit');
        expect(result.charts).toHaveProperty('timeSeries');
        
        expect(result.tables).toHaveProperty('households');
        expect(result.tables).toHaveProperty('regions');
        expect(result.tables).toHaveProperty('wasteTypes');
      });

      it('should include normalized criteria', () => {
        const result = WasteReportGenerator.generate(mockRecords, mockCriteria);

        expect(result.criteria.regions).toEqual(['Colombo']);
        expect(result.criteria.wasteTypes).toEqual(['household']);
      });

      it('should include correct totals', () => {
        const result = WasteReportGenerator.generate(mockRecords, mockCriteria);

        expect(result.totals.records).toBe(2);
        expect(result.totals.totalWeightKg).toBe(90);
      });

      it('should include recycling split', () => {
        const result = WasteReportGenerator.generate(mockRecords, mockCriteria);

        expect(result.charts.recyclingSplit.recyclableWeightKg).toBe(65);
        expect(result.charts.recyclingSplit.nonRecyclableWeightKg).toBe(25);
      });
    });
  });

  describe('AnalyticsService', () => {
    // Note: AnalyticsService requires database connection
    // These tests are covered in controller.test.js and integration.test.js
    // which properly mock the WasteCollectionRecord model
  });

  describe('Utility Functions', () => {
    it('should handle edge cases in aggregation functions', () => {
      // Test with empty arrays
      expect(aggregateHouseholdStats([])).toEqual([]);
      expect(aggregateRegionStats([])).toEqual([]);
      expect(aggregateWasteTypeStats([])).toEqual([]);
      expect(aggregateTimeSeries([])).toEqual([]);
    });
  });
});
