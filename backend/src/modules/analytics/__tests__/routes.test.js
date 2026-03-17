const request = require('supertest');
const express = require('express');
const analyticsRoutes = require('../routes');
const controller = require('../controller');

// Mock the controller
jest.mock('../controller');

describe('Analytics Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/analytics', analyticsRoutes);
    
    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('GET /analytics/config', () => {
    it('should call getConfig controller and return 200', async () => {
      const mockResponse = {
        ok: true,
        filters: {
          regions: ['Colombo', 'Kandy'],
          wasteTypes: ['household', 'recyclable'],
          billingModels: ['weight-based', 'flat-fee'],
          defaultDateRange: {
            from: '2024-01-01T00:00:00.000Z',
            to: '2024-12-31T00:00:00.000Z',
          },
        },
      };

      controller.getConfig.mockImplementation((req, res) => {
        res.json(mockResponse);
      });

      const response = await request(app)
        .get('/analytics/config')
        .expect(200);

      expect(controller.getConfig).toHaveBeenCalledTimes(1);
      expect(response.body).toEqual(mockResponse);
    });

    it('should handle errors from getConfig controller', async () => {
      controller.getConfig.mockImplementation((req, res, next) => {
        next(new Error('Database error'));
      });

      // Add error handler middleware
      app.use((err, req, res, next) => {
        res.status(500).json({ ok: false, message: err.message });
      });

      const response = await request(app)
        .get('/analytics/config')
        .expect(500);

      expect(response.body).toEqual({
        ok: false,
        message: 'Database error',
      });
    });

    it('should accept GET request only', async () => {
      await request(app)
        .post('/analytics/config')
        .expect(404);

      await request(app)
        .put('/analytics/config')
        .expect(404);

      await request(app)
        .delete('/analytics/config')
        .expect(404);
    });
  });

  describe('POST /analytics/report', () => {
    it('should call generateReport controller with valid data', async () => {
      const requestBody = {
        userId: '507f1f77bcf86cd799439011',
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

      const mockResponse = {
        ok: true,
        data: {
          criteria: requestBody.criteria,
          totals: {
            records: 100,
            totalWeightKg: 1500,
            recyclableWeightKg: 750,
            nonRecyclableWeightKg: 750,
          },
          charts: {
            regionSummary: [],
            wasteSummary: [],
            recyclingSplit: {},
            timeSeries: [],
          },
          tables: {
            households: [],
            regions: [],
            wasteTypes: [],
          },
        },
      };

      controller.generateReport.mockImplementation((req, res) => {
        res.json(mockResponse);
      });

      const response = await request(app)
        .post('/analytics/report')
        .send(requestBody)
        .expect(200);

      expect(controller.generateReport).toHaveBeenCalledTimes(1);
      expect(response.body).toEqual(mockResponse);
    });

    it('should pass request body to controller', async () => {
      const requestBody = {
        userId: '507f1f77bcf86cd799439011',
        criteria: {
          dateRange: {
            from: '2024-01-01',
            to: '2024-12-31',
          },
        },
      };

      controller.generateReport.mockImplementation((req, res) => {
        res.json({ ok: true, data: null });
      });

      await request(app)
        .post('/analytics/report')
        .send(requestBody)
        .expect(200);

      expect(controller.generateReport).toHaveBeenCalledTimes(1);
      const req = controller.generateReport.mock.calls[0][0];
      expect(req.body).toEqual(requestBody);
    });

    it('should handle validation errors from controller', async () => {
      controller.generateReport.mockImplementation((req, res) => {
        res.status(400).json({
          ok: false,
          message: 'User id is required',
          issues: [
            {
              path: ['userId'],
              message: 'User id is required',
            },
          ],
        });
      });

      const response = await request(app)
        .post('/analytics/report')
        .send({
          criteria: {
            dateRange: {
              from: '2024-01-01',
              to: '2024-01-31',
            },
          },
        })
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(response.body.message).toBeDefined();
    });

    it('should handle authentication errors (401)', async () => {
      controller.generateReport.mockImplementation((req, res) => {
        res.status(401).json({
          ok: false,
          message: 'User is not authenticated',
        });
      });

      const response = await request(app)
        .post('/analytics/report')
        .send({
          userId: 'invalid-user-id',
          criteria: {
            dateRange: {
              from: '2024-01-01',
              to: '2024-01-31',
            },
          },
        })
        .expect(401);

      expect(response.body).toEqual({
        ok: false,
        message: 'User is not authenticated',
      });
    });

    it('should handle authorization errors (403)', async () => {
      controller.generateReport.mockImplementation((req, res) => {
        res.status(403).json({
          ok: false,
          message: 'You are not authorised to access analytics',
        });
      });

      const response = await request(app)
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

      expect(response.body).toEqual({
        ok: false,
        message: 'You are not authorised to access analytics',
      });
    });

    it('should handle empty request body', async () => {
      controller.generateReport.mockImplementation((req, res) => {
        res.status(400).json({
          ok: false,
          message: 'Invalid criteria',
        });
      });

      const response = await request(app)
        .post('/analytics/report')
        .send({})
        .expect(400);

      expect(response.body.ok).toBe(false);
    });

    it('should handle server errors from controller', async () => {
      controller.generateReport.mockImplementation((req, res, next) => {
        next(new Error('Internal server error'));
      });

      // Add error handler middleware
      app.use((err, req, res, next) => {
        res.status(500).json({ ok: false, message: err.message });
      });

      const response = await request(app)
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
        .expect(500);

      expect(response.body).toEqual({
        ok: false,
        message: 'Internal server error',
      });
    });

    it('should accept POST request only', async () => {
      await request(app)
        .get('/analytics/report')
        .expect(404);

      await request(app)
        .put('/analytics/report')
        .expect(404);

      await request(app)
        .delete('/analytics/report')
        .expect(404);
    });

    it('should handle JSON parsing errors', async () => {
      const response = await request(app)
        .post('/analytics/report')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toBeDefined();
    });

    it('should accept application/json content type', async () => {
      controller.generateReport.mockImplementation((req, res) => {
        res.json({ ok: true, data: null });
      });

      await request(app)
        .post('/analytics/report')
        .set('Content-Type', 'application/json')
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

      expect(controller.generateReport).toHaveBeenCalled();
    });

    it('should return no records message when data is null', async () => {
      controller.generateReport.mockImplementation((req, res) => {
        res.json({
          ok: true,
          data: null,
          message: 'No Records Available',
        });
      });

      const response = await request(app)
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

      expect(response.body.data).toBeNull();
      expect(response.body.message).toBe('No Records Available');
    });
  });

  describe('Route Registration', () => {
    it('should register both routes correctly', () => {
      const routes = analyticsRoutes.stack
        .filter(layer => layer.route)
        .map(layer => ({
          path: layer.route.path,
          methods: Object.keys(layer.route.methods),
        }));

      expect(routes).toContainEqual({
        path: '/config',
        methods: ['get'],
      });

      expect(routes).toContainEqual({
        path: '/report',
        methods: ['post'],
      });
    });

    it('should have exactly 2 routes', () => {
      const routeCount = analyticsRoutes.stack.filter(layer => layer.route).length;
      expect(routeCount).toBe(2);
    });
  });
});
