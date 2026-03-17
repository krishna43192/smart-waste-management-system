/**
 * Model-level tests with minimal instantiation (no DB connection)
 * These tests focus on schema defaults and basic validation constraints.
 */

const PaymentTransaction = require('../../../models/PaymentTransaction');
const Bill = require('../../../models/Bill');

describe('PaymentTransaction Model', () => {
  test('has default status pending and currency LKR', () => {
    const doc = new PaymentTransaction({ billId: '65f000000000000000000001', userId: '65f000000000000000000002', amount: 1000 });
    expect(doc.status).toBe('pending');
    expect(doc.currency).toBe('LKR');
  });

  test('rejects negative amount', () => {
    const doc = new PaymentTransaction({ billId: '65f000000000000000000001', userId: '65f000000000000000000002', amount: -5 });
    const err = doc.validateSync();
    expect(err).toBeTruthy();
    expect(err.errors.amount).toBeTruthy();
  });
});

describe('Bill Model', () => {
  test('requires invoiceNumber and userId', () => {
    const doc = new Bill({ amount: 100, dueDate: new Date() });
    const err = doc.validateSync();
    expect(err).toBeTruthy();
    expect(err.errors.invoiceNumber).toBeTruthy();
    expect(err.errors.userId).toBeTruthy();
  });

  test('default currency LKR and status unpaid', () => {
    const doc = new Bill({ userId: '65f000000000000000000002', invoiceNumber: 'INV-1', amount: 50, dueDate: new Date() });
    expect(doc.currency).toBe('LKR');
    expect(doc.status).toBe('unpaid');
  });
});
