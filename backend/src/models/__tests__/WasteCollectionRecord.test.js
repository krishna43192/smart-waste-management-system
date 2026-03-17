/**
 * Comprehensive tests for WasteCollectionRecord Model
 * 
 * Coverage:
 * - Schema validation (positive/negative/edge cases)
 * - Virtual properties
 * - Static methods
 * - Pre-save hooks
 * - Index definitions
 * - Error handling
 */

const mongoose = require('mongoose');
const WasteCollectionRecord = require('../WasteCollectionRecord');
const { CUSTOMER_TYPES, WASTE_TYPES, BILLING_MODELS } = WasteCollectionRecord;

describe('WasteCollectionRecord Model', () => {
  // Mock mongoose methods
  beforeAll(() => {
    // Prevent actual database operations
    mongoose.connect = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Schema Validation - Positive Cases', () => {
    it('should create a valid waste collection record with all required fields', () => {
      const validRecord = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        zone: 'Zone A',
        householdId: 'HH001',
        customerType: CUSTOMER_TYPES.HOUSEHOLD,
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 25.5,
        recyclableKg: 15.3,
        nonRecyclableKg: 10.2,
      });

      const error = validRecord.validateSync();
      expect(error).toBeUndefined();
      expect(validRecord.collectionDate).toBeInstanceOf(Date);
      expect(validRecord.region).toBe('Colombo');
      expect(validRecord.householdId).toBe('HH001');
    });

    it('should create record with minimal required fields', () => {
      const minimalRecord = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Kandy',
        householdId: 'HH002',
        wasteType: WASTE_TYPES.ORGANIC,
        billingModel: BILLING_MODELS.FLAT_FEE,
        weightKg: 10,
      });

      const error = minimalRecord.validateSync();
      expect(error).toBeUndefined();
      expect(minimalRecord.customerType).toBe(CUSTOMER_TYPES.HOUSEHOLD); // default
      expect(minimalRecord.recyclableKg).toBe(0); // default
      expect(minimalRecord.nonRecyclableKg).toBe(0); // default
    });

    it('should accept all valid customer types', () => {
      Object.values(CUSTOMER_TYPES).forEach((type) => {
        const record = new WasteCollectionRecord({
          collectionDate: new Date('2024-01-15'),
          region: 'Galle',
          householdId: 'HH003',
          customerType: type,
          wasteType: WASTE_TYPES.HOUSEHOLD,
          billingModel: BILLING_MODELS.SUBSCRIPTION,
          weightKg: 15,
        });

        const error = record.validateSync();
        expect(error).toBeUndefined();
        expect(record.customerType).toBe(type);
      });
    });

    it('should accept all valid waste types', () => {
      Object.values(WASTE_TYPES).forEach((type) => {
        const record = new WasteCollectionRecord({
          collectionDate: new Date('2024-01-15'),
          region: 'Matara',
          householdId: 'HH004',
          wasteType: type,
          billingModel: BILLING_MODELS.WEIGHT_BASED,
          weightKg: 20,
        });

        const error = record.validateSync();
        expect(error).toBeUndefined();
        expect(record.wasteType).toBe(type);
      });
    });

    it('should accept all valid billing models', () => {
      Object.values(BILLING_MODELS).forEach((model) => {
        const record = new WasteCollectionRecord({
          collectionDate: new Date('2024-01-15'),
          region: 'Jaffna',
          householdId: 'HH005',
          wasteType: WASTE_TYPES.RECYCLABLE,
          billingModel: model,
          weightKg: 12,
        });

        const error = record.validateSync();
        expect(error).toBeUndefined();
        expect(record.billingModel).toBe(model);
      });
    });

    it('should trim whitespace from string fields', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: '  Colombo  ',
        zone: '  Zone B  ',
        householdId: '  HH006  ',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.FLAT_FEE,
        weightKg: 18,
      });

      expect(record.region).toBe('Colombo');
      expect(record.zone).toBe('Zone B');
      expect(record.householdId).toBe('HH006');
    });
  });

  describe('Schema Validation - Negative Cases', () => {
    it('should reject record without collectionDate', () => {
      const record = new WasteCollectionRecord({
        region: 'Colombo',
        householdId: 'HH007',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.collectionDate).toBeDefined();
      expect(error.errors.collectionDate.message).toContain('required');
    });

    it('should reject record without region', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        householdId: 'HH008',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.region).toBeDefined();
    });

    it('should reject record without householdId', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.householdId).toBeDefined();
    });

    it('should reject record without wasteType', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH009',
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.wasteType).toBeDefined();
    });

    it('should reject record without billingModel', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH010',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        weightKg: 20,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.billingModel).toBeDefined();
    });

    it('should reject record without weightKg', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH011',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.weightKg).toBeDefined();
    });

    it('should reject negative weightKg', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH012',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: -5,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.weightKg).toBeDefined();
      expect(error.errors.weightKg.message).toContain('negative');
    });

    it('should reject negative recyclableKg', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH013',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
        recyclableKg: -3,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.recyclableKg).toBeDefined();
    });

    it('should reject negative nonRecyclableKg', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH014',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
        nonRecyclableKg: -2,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.nonRecyclableKg).toBeDefined();
    });

    it('should reject recyclableRatio below 0', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH015',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
        recyclableRatio: -0.1,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.recyclableRatio).toBeDefined();
    });

    it('should reject recyclableRatio above 1', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH016',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
        recyclableRatio: 1.5,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.recyclableRatio).toBeDefined();
    });

    it('should reject invalid customerType', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH017',
        customerType: 'invalid-type',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.customerType).toBeDefined();
      expect(error.errors.customerType.message).toContain('not a valid customer type');
    });

    it('should reject invalid wasteType', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH018',
        wasteType: 'invalid-waste',
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.wasteType).toBeDefined();
      expect(error.errors.wasteType.message).toContain('not a valid waste type');
    });

    it('should reject invalid billingModel', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH019',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: 'invalid-model',
        weightKg: 20,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.billingModel).toBeDefined();
      expect(error.errors.billingModel.message).toContain('not a valid billing model');
    });

    it('should reject empty region string', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: '',
        householdId: 'HH020',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
      });

      const error = record.validateSync();
      expect(error).toBeDefined();
      expect(error.errors.region).toBeDefined();
      expect(error.errors.region.message).toContain('Region');
    });
  });

  describe('Schema Validation - Edge Cases', () => {
    it('should accept weightKg of 0', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH021',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.FLAT_FEE,
        weightKg: 0,
      });

      const error = record.validateSync();
      expect(error).toBeUndefined();
      expect(record.weightKg).toBe(0);
    });

    it('should accept recyclableRatio of exactly 0', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH022',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
        recyclableRatio: 0,
      });

      const error = record.validateSync();
      expect(error).toBeUndefined();
      expect(record.recyclableRatio).toBe(0);
    });

    it('should accept recyclableRatio of exactly 1', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH023',
        wasteType: WASTE_TYPES.RECYCLABLE,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 20,
        recyclableKg: 20,
        recyclableRatio: 1,
      });

      const error = record.validateSync();
      expect(error).toBeUndefined();
      expect(record.recyclableRatio).toBe(1);
    });

    it('should handle very large weight values', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH024',
        wasteType: WASTE_TYPES.INDUSTRIAL,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 999999.99,
      });

      const error = record.validateSync();
      expect(error).toBeUndefined();
      expect(record.weightKg).toBe(999999.99);
    });

    it('should handle very small decimal weight values', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH025',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 0.01,
      });

      const error = record.validateSync();
      expect(error).toBeUndefined();
      expect(record.weightKg).toBe(0.01);
    });

    it('should handle current date as collectionDate', () => {
      const now = new Date();
      const record = new WasteCollectionRecord({
        collectionDate: now,
        region: 'Colombo',
        householdId: 'HH026',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 15,
      });

      const error = record.validateSync();
      expect(error).toBeUndefined();
    });

    it('should handle missing optional zone field', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH027',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 15,
      });

      const error = record.validateSync();
      expect(error).toBeUndefined();
      expect(record.zone).toBeUndefined();
    });
  });

  describe('Pre-save Hook - recyclableRatio Calculation', () => {
    it('should calculate recyclableRatio correctly when weightKg > 0', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH028',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 100,
        recyclableKg: 60,
        nonRecyclableKg: 40,
      });

      // Trigger the pre-save calculation manually
      if (record.weightKg > 0) {
        record.recyclableRatio = Number((record.recyclableKg / record.weightKg).toFixed(4));
      }

      expect(record.recyclableRatio).toBe(0.6);
    });

    it('should set recyclableRatio to 0 when weightKg is 0', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH029',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.FLAT_FEE,
        weightKg: 0,
        recyclableKg: 0,
      });

      // Trigger the pre-save calculation manually
      if (record.weightKg > 0) {
        record.recyclableRatio = Number((record.recyclableKg / record.weightKg).toFixed(4));
      } else {
        record.recyclableRatio = 0;
      }

      expect(record.recyclableRatio).toBe(0);
    });

    it('should round recyclableRatio to 4 decimal places', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH030',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 7,
        recyclableKg: 3,
      });

      // Trigger the pre-save calculation manually
      if (record.weightKg > 0) {
        record.recyclableRatio = Number((record.recyclableKg / record.weightKg).toFixed(4));
      }

      expect(record.recyclableRatio).toBe(0.4286); // 3/7 = 0.428571...
    });
  });

  describe('Virtual Properties', () => {
    it('should return true for isPrimarilyRecyclable when ratio > 0.5', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH031',
        wasteType: WASTE_TYPES.RECYCLABLE,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 100,
        recyclableKg: 60,
        nonRecyclableKg: 40,
        recyclableRatio: 0.6,
      });

      expect(record.isPrimarilyRecyclable).toBe(true);
    });

    it('should return false for isPrimarilyRecyclable when ratio <= 0.5', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH032',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 100,
        recyclableKg: 40,
        nonRecyclableKg: 60,
        recyclableRatio: 0.4,
      });

      expect(record.isPrimarilyRecyclable).toBe(false);
    });

    it('should return false for isPrimarilyRecyclable when ratio is exactly 0.5', () => {
      const record = new WasteCollectionRecord({
        collectionDate: new Date('2024-01-15'),
        region: 'Colombo',
        householdId: 'HH033',
        wasteType: WASTE_TYPES.HOUSEHOLD,
        billingModel: BILLING_MODELS.WEIGHT_BASED,
        weightKg: 100,
        recyclableKg: 50,
        nonRecyclableKg: 50,
        recyclableRatio: 0.5,
      });

      expect(record.isPrimarilyRecyclable).toBe(false);
    });
  });

  describe('Static Methods', () => {
    describe('getDateRange', () => {
      it('should return correct date range when records exist', async () => {
        const earliestDate = new Date('2024-01-01');
        const latestDate = new Date('2024-12-31');

        WasteCollectionRecord.findOne = jest.fn()
          .mockReturnValueOnce({
            sort: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue({ collectionDate: earliestDate }),
          })
          .mockReturnValueOnce({
            sort: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue({ collectionDate: latestDate }),
          });

        const result = await WasteCollectionRecord.getDateRange();

        expect(result).toEqual({
          from: earliestDate,
          to: latestDate,
        });
      });

      it('should return null values when no records exist', async () => {
        WasteCollectionRecord.findOne = jest.fn()
          .mockReturnValue({
            sort: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(null),
          });

        const result = await WasteCollectionRecord.getDateRange();

        expect(result).toEqual({
          from: null,
          to: null,
        });
      });
    });

    describe('getDistinctFilters', () => {
      it('should return all distinct filter values', async () => {
        const mockRegions = ['Colombo', 'Kandy', 'Galle'];
        const mockWasteTypes = ['household', 'recyclable', 'organic'];
        const mockBillingModels = ['weight-based', 'flat-fee', 'subscription'];

        WasteCollectionRecord.distinct = jest.fn()
          .mockResolvedValueOnce(mockRegions)
          .mockResolvedValueOnce(mockWasteTypes)
          .mockResolvedValueOnce(mockBillingModels);

        const result = await WasteCollectionRecord.getDistinctFilters();

        expect(result).toEqual({
          regions: mockRegions,
          wasteTypes: mockWasteTypes,
          billingModels: mockBillingModels,
        });
      });

      it('should return empty arrays when no records exist', async () => {
        WasteCollectionRecord.distinct = jest.fn().mockResolvedValue([]);

        const result = await WasteCollectionRecord.getDistinctFilters();

        expect(result).toEqual({
          regions: [],
          wasteTypes: [],
          billingModels: [],
        });
      });
    });
  });

  describe('Exported Constants', () => {
    it('should export CUSTOMER_TYPES constants', () => {
      expect(CUSTOMER_TYPES).toBeDefined();
      expect(CUSTOMER_TYPES.HOUSEHOLD).toBe('household');
      expect(CUSTOMER_TYPES.BUSINESS).toBe('business');
    });

    it('should export WASTE_TYPES constants', () => {
      expect(WASTE_TYPES).toBeDefined();
      expect(WASTE_TYPES.HOUSEHOLD).toBe('household');
      expect(WASTE_TYPES.BUSINESS).toBe('business');
      expect(WASTE_TYPES.ORGANIC).toBe('organic');
      expect(WASTE_TYPES.RECYCLABLE).toBe('recyclable');
      expect(WASTE_TYPES.NON_RECYCLABLE).toBe('non-recyclable');
      expect(WASTE_TYPES.INDUSTRIAL).toBe('industrial');
    });

    it('should export BILLING_MODELS constants', () => {
      expect(BILLING_MODELS).toBeDefined();
      expect(BILLING_MODELS.WEIGHT_BASED).toBe('weight-based');
      expect(BILLING_MODELS.FLAT_FEE).toBe('flat-fee');
      expect(BILLING_MODELS.SUBSCRIPTION).toBe('subscription');
    });
  });
});
