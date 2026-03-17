# Analytics Module Tests

Comprehensive test suite for the Analytics module with >80% code coverage.

## 📊 Test Coverage

The test suite achieves **>80% coverage** across:
- **Lines**: 80%+
- **Branches**: 80%+
- **Functions**: 80%+
- **Statements**: 80%+

## 🧪 Test Files

### 1. `controller.test.js` (Unit Tests)
Tests for the analytics controller functions with focus on business logic.

**Coverage:**
- ✅ `getConfig()` - Config retrieval with all filters
- ✅ `generateReport()` - Report generation with various scenarios
- ✅ Data grouping and aggregation
- ✅ Validation logic
- ✅ Error handling

**Test Categories:**
- **Positive Cases**: Valid inputs, successful operations
- **Negative Cases**: Invalid inputs, authentication failures
- **Edge Cases**: Empty data, boundary values
- **Error Cases**: Database errors, validation errors

### 2. `routes.test.js` (Route Tests)
Tests for HTTP endpoints and route configuration.

**Coverage:**
- ✅ GET `/analytics/config` endpoint
- ✅ POST `/analytics/report` endpoint
- ✅ HTTP method validation
- ✅ Request/response handling
- ✅ Error middleware integration

### 3. `integration.test.js` (Integration Tests)
End-to-end workflow tests simulating real usage patterns.

**Coverage:**
- ✅ Complete config → report flow
- ✅ Authentication & authorization flow
- ✅ Large dataset handling
- ✅ Data integrity validation
- ✅ Performance benchmarks

### 4. `edge-cases.test.js` (Edge Case Tests)
Specialized tests for boundary conditions and unusual scenarios.

**Coverage:**
- ✅ Extreme values (very large/small numbers)
- ✅ Missing/null data handling
- ✅ Special characters in strings
- ✅ Concurrent requests
- ✅ Single vs. multiple records
- ✅ Date boundary conditions

### 5. `utils.js` (Test Utilities)
Reusable helpers for test data generation and validation.

**Features:**
- Mock data generators
- Validation helpers
- Mock object factories
- Expected value calculators

## 🚀 Running Tests

### Run All Tests
```bash
npm test
```

### Run Analytics Tests Only
```bash
npm run test:analytics
```

### Watch Mode (Development)
```bash
npm run test:watch
```

### Generate Coverage Report
```bash
npm run test:coverage
```

### Verbose Output
```bash
npm run test:verbose
```

## 📋 Test Scenarios

### Positive Test Cases
- ✅ Valid report generation with all filters
- ✅ Config retrieval with available data
- ✅ Successful authentication and authorization
- ✅ Correct calculations and aggregations
- ✅ Proper data sorting and grouping

### Negative Test Cases
- ✅ Missing required fields (userId, dateRange)
- ✅ Empty userId or invalid format
- ✅ Invalid date ranges (end before start)
- ✅ Non-existent user
- ✅ Unauthorized user (non-admin)
- ✅ Invalid date formats

### Edge Cases
- ✅ No records matching criteria
- ✅ Single record
- ✅ Large datasets (1000+ records)
- ✅ Same-day collections
- ✅ Multiple years span
- ✅ All records from one household
- ✅ Very large weight values
- ✅ Decimal precision (0.01 kg)
- ✅ Null/undefined fields
- ✅ Special characters in strings
- ✅ Empty filter arrays

### Error Cases
- ✅ Database connection failures
- ✅ Query execution errors
- ✅ Validation schema errors
- ✅ Zod validation failures
- ✅ Unhandled exceptions

## 🎯 Test Assertions

### Data Integrity
- Total weights sum correctly
- Recyclable + non-recyclable = total weight
- Regional summaries match overall totals
- Household averages calculated correctly
- Time series data sorted chronologically

### Numeric Precision
- All weights rounded to 2 decimal places
- No floating-point errors
- Consistent precision across report

### Data Structure
- Report contains all required sections
- Arrays properly populated
- Objects have expected keys
- Nested structures valid

### Error Responses
- Proper HTTP status codes (400, 401, 403, 500)
- Error messages present
- Validation issues included
- `ok: false` in response

## 📈 Coverage Report

After running `npm run test:coverage`, view the detailed report:

```bash
# Open in browser
open coverage/lcov-report/index.html

# Or view summary in terminal
cat coverage/coverage-summary.json
```

## 🔧 Mocking Strategy

### Mongoose Models
- `WasteCollectionRecord`: Mocked for all queries
- `User`: Mocked for authentication

### Mock Implementations
- `.find()`, `.findById()`, `.distinct()`, `.findOne()`
- Chainable methods: `.lean()`, `.sort()`
- Both successful and error scenarios

### No Real Database
Tests run without MongoDB connection for:
- ⚡ Speed
- 🔒 Isolation
- 🎯 Predictability

## 📝 Best Practices

### Test Structure
```javascript
describe('Feature', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  it('should do something specific', async () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### Meaningful Assertions
- Use specific matchers (`toBe`, `toEqual`, `toContain`)
- Check multiple properties
- Validate data structures
- Test error messages

### Descriptive Test Names
- Start with "should"
- Be specific about scenario
- Include context (positive/negative/edge)

## 🐛 Debugging Tests

### Run Single Test File
```bash
npx jest controller.test.js
```

### Run Specific Test
```bash
npx jest -t "should generate a complete report"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## 📚 Dependencies

### Testing Libraries
- **Jest**: Test runner and assertion library
- **Supertest**: HTTP assertion library
- **Mongoose**: (mocked) MongoDB ODM

### Development
- All tests use mocked dependencies
- No external services required
- Fast execution (<5 seconds)

## ✅ Checklist for New Tests

When adding new tests:

- [ ] Add positive test cases
- [ ] Add negative test cases
- [ ] Add edge cases
- [ ] Add error scenarios
- [ ] Mock all external dependencies
- [ ] Use meaningful assertions
- [ ] Write descriptive test names
- [ ] Update this README if needed
- [ ] Verify coverage remains >80%

## 🎓 Test Examples

### Unit Test Example
```javascript
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
```

### Integration Test Example
```javascript
it('should fetch config, then generate report successfully', async () => {
  // Step 1: Get config
  const configResponse = await request(app)
    .get('/analytics/config')
    .expect(200);

  // Step 2: Use config in report
  const reportResponse = await request(app)
    .post('/analytics/report')
    .send({
      userId: mockUser._id,
      criteria: {
        dateRange: {
          from: configResponse.body.filters.defaultDateRange.from,
          to: configResponse.body.filters.defaultDateRange.to,
        },
      },
    })
    .expect(200);

  expect(reportResponse.body.ok).toBe(true);
});
```

## 🔗 Related Documentation

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Testing Best Practices](https://testingjavascript.com/)

---

**Last Updated**: October 16, 2025  
**Maintained By**: Development Team  
**Test Coverage Target**: >80%
