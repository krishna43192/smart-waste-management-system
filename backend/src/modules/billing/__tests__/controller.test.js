/**
 * Payment/Billing controller unit tests
 * - Covers listBills, createCheckoutSession, syncCheckoutSession, getReceipt
 * - Mocks Stripe SDK, Mongoose models, and mailer service
 */

const path = require('path');

// Utility to create mock res/next
function createMockRes() {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  const next = jest.fn();
  return { res, next };
}

// Create fresh module instance with env and mocks isolated per test
function loadControllerWithEnv(env = {}) {
  // Preserve original env, then set per test
  const originalEnv = { ...process.env };
  process.env = { ...originalEnv, ...env };

  // Reset module registry and mocks
  jest.resetModules();

  // Mock external dependencies before requiring controller
  jest.mock('stripe', () => {
    const instance = {
      checkout: {
        sessions: {
          create: jest.fn(),
          retrieve: jest.fn(),
        },
      },
    };
    const MockStripe = jest.fn(() => instance);
    MockStripe.__instance = instance;
    return MockStripe;
  });

  const Bill = { find: jest.fn(), findOne: jest.fn(), findById: jest.fn() };
  const PaymentTransaction = { find: jest.fn(), findOne: jest.fn(), updateMany: jest.fn(), create: jest.fn() };
  const SpecialCollectionRequest = { findById: jest.fn() };
  const User = { findById: jest.fn() };

  jest.doMock(path.resolve(__dirname, '../../../models/Bill'), () => Bill);
  jest.doMock(path.resolve(__dirname, '../../../models/PaymentTransaction'), () => PaymentTransaction);
  jest.doMock(path.resolve(__dirname, '../../../models/SpecialCollectionRequest'), () => SpecialCollectionRequest);
  jest.doMock(path.resolve(__dirname, '../../../models/User'), () => User);

  const mailer = { sendPaymentReceipt: jest.fn().mockResolvedValue({ sent: true }) };
  jest.doMock(path.resolve(__dirname, '../../../services/mailer'), () => mailer);

  // Now require the controller with all mocks in place
  // eslint-disable-next-line global-require
  const controller = require('../controller');

  // Also return the constructed Stripe mock instance to adjust per test
  const Stripe = require('stripe');
  const stripeInstance = Stripe.__instance;

  // Restore env after controller load setup helper returns
  process.env = originalEnv;

  return {
    controller,
    mocks: { Bill, PaymentTransaction, SpecialCollectionRequest, User, mailer, stripeInstance },
  };
}

describe('Billing Controller - listBills', () => {
  test('returns outstanding and paid bills with summary and supported methods', async () => {
    const userId = '65f000000000000000000001';
    const bill1 = { _id: 'b1', amount: 1000, status: 'unpaid', dueDate: new Date('2025-01-10') };
    const bill2 = { _id: 'b2', amount: 500, status: 'paid', dueDate: new Date('2024-12-31') };
    const bill3 = { _id: 'b3', amount: 2500, status: 'unpaid', dueDate: new Date('2024-12-15') };

    const txB3 = { _id: 't3', billId: 'b3', status: 'pending' };
    const txB2 = { _id: 't2', billId: 'b2', status: 'success' };

    const { controller, mocks } = loadControllerWithEnv({ STRIPE_PAYMENT_METHODS: 'card,link', STRIPE_SECRET_KEY: 'sk_test_123' });
    mocks.Bill.find.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([bill1, bill2, bill3]) }) });
    mocks.PaymentTransaction.find.mockReturnValue({ sort: () => ({ lean: () => Promise.resolve([txB2, txB3]) }) });

    const req = { query: { userId } };
    const { res, next } = createMockRes();

    await controller.listBills(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.ok).toBe(true);
    expect(payload.bills.outstanding).toHaveLength(2);
    expect(payload.bills.paid).toHaveLength(1);
    expect(payload.summary.outstandingTotal).toBe(3500);
    expect(new Date(payload.summary.nextDueDate)).toEqual(new Date('2024-12-15'));
    expect(payload.supportedPaymentMethods).toEqual(['card', 'link']);
  });

  test('validates input and returns 400 when userId missing', async () => {
    const { controller } = loadControllerWithEnv({ STRIPE_SECRET_KEY: 'sk_test_123' });

    const req = { query: {} };
    const { res } = createMockRes();
    await controller.listBills(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });
});

describe('Billing Controller - createCheckoutSession', () => {
  test('returns 500 when Stripe is not configured', async () => {
    const { controller } = loadControllerWithEnv({ STRIPE_SECRET_KEY: '' });
    const req = { body: { userId: 'u1', billId: 'b1', successUrl: 'https://ok', cancelUrl: 'https://ko' } };
    const { res } = createMockRes();
    await controller.createCheckoutSession(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  test('creates a Stripe checkout session and persists transaction', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk_live_dummy', STRIPE_PAYMENT_METHODS: 'card,link' };
    const { controller, mocks } = loadControllerWithEnv(env);

    // Provide user and bill
  mocks.User.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'u1', email: 'a@b.com' }) });
  const billDoc = { _id: 'b1', userId: 'u1', amount: 1500, currency: 'LKR', description: 'Bill #X', status: 'unpaid', save: jest.fn(), id: 'b1' };
    mocks.Bill.findOne.mockResolvedValue(billDoc);

    // Mock Stripe session
    const Stripe = require('stripe');
  const stripe = Stripe.__instance;
  stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_123', url: 'https://stripe/checkout/cs_test_123' });

    // Mock transaction persistence
    mocks.PaymentTransaction.updateMany.mockResolvedValue({ acknowledged: true });
    mocks.PaymentTransaction.create.mockResolvedValue({ _id: 't1' });

    const req = {
      body: {
        userId: 'u1',
        billId: 'b1',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        paymentMethods: ['card'],
      },
    };
    const { res, next } = createMockRes();

    await controller.createCheckoutSession(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      payment_method_types: ['card'],
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
    }));
    expect(billDoc.save).toHaveBeenCalled();
    expect(mocks.PaymentTransaction.create).toHaveBeenCalledWith(expect.objectContaining({
      billId: 'b1',
      userId: 'u1',
      amount: 1500,
      status: 'pending',
      stripeSessionId: 'cs_test_123',
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, sessionId: 'cs_test_123' }));
  });

  test('rejects unsupported payment methods', async () => {
  const env = { STRIPE_SECRET_KEY: 'sk', STRIPE_PAYMENT_METHODS: 'card' };
  const { controller, mocks } = loadControllerWithEnv(env);

  mocks.User.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'u1', email: 'a@b.com' }) });
  mocks.Bill.findOne.mockResolvedValue({ _id: 'b1', userId: 'u1', amount: 100, status: 'unpaid', save: jest.fn() });

    const req = { body: { userId: 'u1', billId: 'b1', successUrl: 'https://ok', cancelUrl: 'https://ko', paymentMethods: ['link'] } };
    const { res } = createMockRes();
    await controller.createCheckoutSession(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, message: expect.stringContaining('Unsupported payment method') }));
  });

  test('returns 404 when user not found', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks } = loadControllerWithEnv(env);
    mocks.User.findById.mockReturnValue({ lean: () => Promise.resolve(null) });
    const req = { body: { userId: 'u1', billId: 'b1', successUrl: 'https://ok', cancelUrl: 'https://ko' } };
    const { res } = createMockRes();
    await controller.createCheckoutSession(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 404 when bill not found', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks } = loadControllerWithEnv(env);
    mocks.User.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'u1', email: 'a@b.com' }) });
    mocks.Bill.findOne.mockResolvedValue(null);
    const req = { body: { userId: 'u1', billId: 'b1', successUrl: 'https://ok', cancelUrl: 'https://ko' } };
    const { res } = createMockRes();
    await controller.createCheckoutSession(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 400 when bill already processed', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks } = loadControllerWithEnv(env);
    mocks.User.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'u1', email: 'a@b.com' }) });
    mocks.Bill.findOne.mockResolvedValue({ _id: 'b1', userId: 'u1', amount: 100, status: 'paid' });
    const req = { body: { userId: 'u1', billId: 'b1', successUrl: 'https://ok', cancelUrl: 'https://ko' } };
    const { res } = createMockRes();
    await controller.createCheckoutSession(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('handles StripeInvalidRequestError gracefully', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks, mocks: { stripeInstance } } = loadControllerWithEnv(env);
    mocks.User.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'u1', email: 'a@b.com' }) });
    mocks.Bill.findOne.mockResolvedValue({ _id: 'b1', userId: 'u1', amount: 100, status: 'unpaid', save: jest.fn(), id: 'b1' });

    stripeInstance.checkout.sessions.create.mockRejectedValue({ type: 'StripeInvalidRequestError', message: 'Invalid price' });

    const req = { body: { userId: 'u1', billId: 'b1', successUrl: 'https://ok', cancelUrl: 'https://ko' } };
    const { res } = createMockRes();
    await controller.createCheckoutSession(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false, message: 'Invalid price' }));
  });

  test('validates URLs and returns 400 on invalid input', async () => {
    const { controller } = loadControllerWithEnv({ STRIPE_SECRET_KEY: 'sk' });
    const req = { body: { userId: 'u1', billId: 'b1', successUrl: 'not-a-url', cancelUrl: 'also-bad' } };
    const { res } = createMockRes();
    await controller.createCheckoutSession(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('defaults to supported methods when card not available', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk', STRIPE_PAYMENT_METHODS: 'link' };
    const { controller, mocks } = loadControllerWithEnv(env);
    mocks.User.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'u1', email: 'a@b.com' }) });
    const billDoc = { _id: 'b1', userId: 'u1', amount: 1500, currency: 'LKR', description: 'Bill #X', status: 'unpaid', save: jest.fn(), id: 'b1' };
    mocks.Bill.findOne.mockResolvedValue(billDoc);
    const Stripe = require('stripe');
    const stripe = Stripe.__instance;
    stripe.checkout.sessions.create.mockResolvedValue({ id: 'cs_test_link', url: 'https://stripe/checkout/cs' });

    const req = { body: { userId: 'u1', billId: 'b1', successUrl: 'https://ok', cancelUrl: 'https://ko' } };
    const { res } = createMockRes();
    await controller.createCheckoutSession(req, res, jest.fn());
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ payment_method_types: ['link'] }));
  });
});

describe('Billing Controller - syncCheckoutSession', () => {
  test('returns 500 when Stripe not configured', async () => {
    const { controller } = loadControllerWithEnv({ STRIPE_SECRET_KEY: '' });
    const { res } = createMockRes();
    await controller.syncCheckoutSession({ params: { sessionId: 'cs_x' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('sync success path: updates transaction and bill, sends receipt', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks } = loadControllerWithEnv(env);

    // Stripe session with paid status
  const Stripe = require('stripe');
  const stripe = Stripe.__instance;
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_ok',
      payment_status: 'paid',
      status: 'complete',
      payment_intent: {
        id: 'pi_123',
        payment_method_types: ['card'],
        charges: { data: [{ status: 'succeeded', receipt_url: 'https://receipt' }] },
      },
      amount_total: 1500,
      currency: 'lkr',
    });

    const txDoc = {
      _id: 't1',
      billId: 'b1',
      status: 'pending',
      paymentMethod: undefined,
      save: jest.fn(),
      rawGatewayResponse: undefined,
    };
    mocks.PaymentTransaction.findOne.mockResolvedValue(txDoc);

    const billDoc = { _id: 'b1', id: 'b1', status: 'unpaid', save: jest.fn(), userId: 'u1' };
    mocks.Bill.findById.mockResolvedValue(billDoc);
  mocks.User.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'u1', name: 'Ada', email: 'ada@example.com' }) });

  const { res } = createMockRes();
  await controller.syncCheckoutSession({ params: { sessionId: 'cs_ok' } }, res, jest.fn());

    expect(txDoc.save).toHaveBeenCalled();
    expect(billDoc.save).toHaveBeenCalled();
  // Mailer called
  expect(mocks.mailer.sendPaymentReceipt).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, data: expect.objectContaining({ paymentStatus: 'success' }) }));
  });

  test('returns ok with message when no matching transaction/bill', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
  const { controller } = loadControllerWithEnv(env);
  const Stripe = require('stripe');
  const stripe = Stripe.__instance;
    stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_x', payment_status: 'unpaid', status: 'open' });

    // No transaction and bill via second branch as well
    const { res } = createMockRes();
    await controller.syncCheckoutSession({ params: { sessionId: 'cs_x' } }, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, message: expect.any(String) }));
  });

  test('handles cancelled session and sets failureReason', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks } = loadControllerWithEnv(env);
    const Stripe = require('stripe');
    const stripe = Stripe.__instance;
    stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_cancel', payment_status: 'unpaid', status: 'canceled', payment_intent: null });
    const txDoc = { _id: 't1', billId: 'b1', status: 'pending', save: jest.fn() };
    mocks.PaymentTransaction.findOne.mockResolvedValue(txDoc);
    mocks.Bill.findById.mockResolvedValue({ _id: 'b1', id: 'b1', status: 'unpaid', save: jest.fn(), userId: 'u1' });
    const { res } = createMockRes();
    await controller.syncCheckoutSession({ params: { sessionId: 'cs_cancel' } }, res, jest.fn());
    expect(txDoc.status).toBe('cancelled');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, data: expect.objectContaining({ paymentStatus: 'cancelled' }) }));
  });

  test('handles unpaid open session (pending)', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks } = loadControllerWithEnv(env);
    const Stripe = require('stripe');
    const stripe = Stripe.__instance;
    stripe.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_open', payment_status: 'unpaid', status: 'open', payment_intent: null });
    const txDoc = { _id: 't1', billId: 'b1', status: 'pending', save: jest.fn() };
    mocks.PaymentTransaction.findOne.mockResolvedValue(txDoc);
    mocks.Bill.findById.mockResolvedValue({ _id: 'b1', id: 'b1', status: 'unpaid', save: jest.fn(), userId: 'u1' });
    const { res } = createMockRes();
    await controller.syncCheckoutSession({ params: { sessionId: 'cs_open' } }, res, jest.fn());
    expect(txDoc.status).toBe('pending');
  });

  test('handles failed charge and sets failureReason', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks } = loadControllerWithEnv(env);
    const Stripe = require('stripe');
    const stripe = Stripe.__instance;
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_fail', payment_status: 'unpaid', status: 'complete',
      payment_intent: { id: 'pi', payment_method_types: ['card'], charges: { data: [{ status: 'failed', failure_message: 'Card declined' }] } },
    });
    const txDoc = { _id: 't1', billId: 'b1', status: 'pending', save: jest.fn() };
    mocks.PaymentTransaction.findOne.mockResolvedValue(txDoc);
    mocks.Bill.findById.mockResolvedValue({ _id: 'b1', id: 'b1', status: 'unpaid', save: jest.fn(), userId: 'u1' });
    const { res } = createMockRes();
    await controller.syncCheckoutSession({ params: { sessionId: 'cs_fail' } }, res, jest.fn());
    expect(txDoc.status).toBe('failed');
    expect(txDoc.failureReason).toBe('Card declined');
  });

  test('returns 404 when Stripe session not found', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller } = loadControllerWithEnv(env);
    const Stripe = require('stripe');
    const stripe = Stripe.__instance;
    stripe.checkout.sessions.retrieve.mockResolvedValue(null);
    const { res } = createMockRes();
    await controller.syncCheckoutSession({ params: { sessionId: 'cs_missing' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('treats no_payment_required as success and handles string payment_intent', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks } = loadControllerWithEnv(env);
    const Stripe = require('stripe');
    const stripe = Stripe.__instance;
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_free', payment_status: 'no_payment_required', status: 'complete', payment_intent: 'pi_string',
    });
    const txDoc = { _id: 't1', billId: 'b1', status: 'pending', save: jest.fn(), paymentMethod: undefined };
    mocks.PaymentTransaction.findOne.mockResolvedValue(txDoc);
    const billDoc = { _id: 'b1', id: 'b1', status: 'unpaid', save: jest.fn(), userId: 'u1' };
    mocks.Bill.findById.mockResolvedValue(billDoc);
    mocks.User.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'u1', email: 'x@y.com', name: 'X' }) });
    const { res } = createMockRes();
    await controller.syncCheckoutSession({ params: { sessionId: 'cs_free' } }, res, jest.fn());
    expect(txDoc.status).toBe('success');
    expect(txDoc.stripePaymentIntentId).toBe('pi_string');
    expect(billDoc.status).toBe('paid');
  });

  test('logs warning when sending receipt fails but does not break flow', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks } = loadControllerWithEnv(env);
    const Stripe = require('stripe');
    const stripe = Stripe.__instance;
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_ok', payment_status: 'paid', status: 'complete', payment_intent: { id: 'pi', payment_method_types: ['card'], charges: { data: [] } },
    });
    const txDoc = { _id: 't1', billId: 'b1', status: 'pending', save: jest.fn() };
    mocks.PaymentTransaction.findOne.mockResolvedValue(txDoc);
    const billDoc = { _id: 'b1', id: 'b1', status: 'unpaid', save: jest.fn(), userId: 'u1' };
    mocks.Bill.findById.mockResolvedValue(billDoc);
    mocks.User.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'u1', email: 'x@y.com', name: 'X' }) });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.mailer.sendPaymentReceipt.mockRejectedValue(new Error('SMTP down'));
    const { res } = createMockRes();
    await controller.syncCheckoutSession({ params: { sessionId: 'cs_ok' } }, res, jest.fn());
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('updates SpecialCollectionRequest on success', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks } = loadControllerWithEnv(env);
    const Stripe = require('stripe');
    const stripe = Stripe.__instance;
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_succ', payment_status: 'paid', status: 'complete',
      payment_intent: { id: 'pi', payment_method_types: ['card'], charges: { data: [{ status: 'succeeded', receipt_url: 'https://r' }] } },
    });
    const txDoc = { _id: 't1', billId: 'b1', status: 'pending', save: jest.fn() };
    mocks.PaymentTransaction.findOne.mockResolvedValue(txDoc);
    const reqDoc = { _id: 'req1', status: 'pending-payment', paymentStatus: 'pending', save: jest.fn(), toObject: () => ({ address: 'a' }) };
    const billDoc = { _id: 'b1', id: 'b1', status: 'unpaid', save: jest.fn(), userId: 'u1', invoiceNumber: 'INV-1', specialCollectionRequestId: 'req1' };
    mocks.Bill.findById.mockResolvedValue(billDoc);
    mocks.User.findById.mockReturnValue({ lean: () => Promise.resolve({ _id: 'u1', email: 'x@y.com', name: 'X' }) });
    mocks.SpecialCollectionRequest.findById.mockResolvedValue(reqDoc);
    const { res } = createMockRes();
    await controller.syncCheckoutSession({ params: { sessionId: 'cs_succ' } }, res, jest.fn());
    expect(reqDoc.paymentStatus).toBe('success');
    expect(reqDoc.status).toBe('scheduled');
    expect(reqDoc.save).toHaveBeenCalled();
  });

  test('updates SpecialCollectionRequest on failed', async () => {
    const env = { STRIPE_SECRET_KEY: 'sk' };
    const { controller, mocks } = loadControllerWithEnv(env);
    const Stripe = require('stripe');
    const stripe = Stripe.__instance;
    stripe.checkout.sessions.retrieve.mockResolvedValue({
      id: 'cs_fail2', payment_status: 'unpaid', status: 'complete',
      payment_intent: { id: 'pi', payment_method_types: ['card'], charges: { data: [{ status: 'failed', failure_message: 'insufficient_funds' }] } },
    });
    const txDoc = { _id: 't1', billId: 'b1', status: 'pending', save: jest.fn() };
    mocks.PaymentTransaction.findOne.mockResolvedValue(txDoc);
    const reqDoc = { _id: 'req1', status: 'pending-payment', paymentStatus: 'pending', save: jest.fn(), toObject: () => ({}) };
    const billDoc = { _id: 'b1', id: 'b1', status: 'unpaid', save: jest.fn(), userId: 'u1', specialCollectionRequestId: 'req1' };
    mocks.Bill.findById.mockResolvedValue(billDoc);
    mocks.SpecialCollectionRequest.findById.mockResolvedValue(reqDoc);
    const { res } = createMockRes();
    await controller.syncCheckoutSession({ params: { sessionId: 'cs_fail2' } }, res, jest.fn());
    expect(reqDoc.paymentStatus).toBe('failed');
    expect(reqDoc.status).toBe('payment-failed');
  });
});

describe('Billing Controller - getReceipt', () => {
  test('returns 404 when not found', async () => {
    const { controller, mocks } = loadControllerWithEnv();
    mocks.PaymentTransaction.findOne.mockReturnValue({ populate: () => ({ lean: () => Promise.resolve(null) }) });
    const req = { params: { transactionId: 't404' }, query: { userId: 'u1' } };
    const { res } = createMockRes();
    await controller.getReceipt(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns receipt payload when found', async () => {
    const { controller, mocks } = loadControllerWithEnv();
    const tx = {
      _id: 't1',
      billId: { _id: 'b1', invoiceNumber: 'INV-001', currency: 'LKR' },
      amount: 2500,
      currency: 'LKR',
      status: 'success',
      updatedAt: new Date('2025-01-01T10:00:00Z'),
      paymentMethod: 'card',
      receiptUrl: 'https://receipt',
      stripePaymentIntentId: 'pi_1',
      stripeSessionId: 'cs_1',
    };
    mocks.PaymentTransaction.findOne.mockReturnValue({ populate: () => ({ lean: () => Promise.resolve(tx) }) });

    const req = { params: { transactionId: 't1' }, query: { userId: 'u1' } };
    const { res } = createMockRes();
    await controller.getReceipt(req, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, receipt: expect.objectContaining({ transactionId: 't1', billId: 'b1' }) }));
  });
});
