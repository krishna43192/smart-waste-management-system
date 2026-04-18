const crypto = require('crypto');
const { z } = require('zod');
const Razorpay = require('razorpay');
const Bill = require('../../models/Bill');
const PaymentTransaction = require('../../models/PaymentTransaction');
const SpecialCollectionRequest = require('../../models/SpecialCollectionRequest');
const User = require('../../models/User');
const { sendPaymentReceipt } = require('../../services/mailer');
const Points = require('../../models/Points');
const { POINT_ACTIONS } = require('../../models/Points');

// ---------------------------------------------------------------------------
// Razorpay client — only initialised when both keys are present.
// ---------------------------------------------------------------------------
const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const respondWithError = (res, status, message, extra = {}) =>
  res.status(status).json({ ok: false, message, ...extra });

const parseOrRespond = (schema, payload, res) => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    respondWithError(res, 400, result.error.issues?.[0]?.message || 'Invalid request', {
      issues: result.error.issues,
    });
    return null;
  }
  return result.data;
};

const ensureRazorpayConfigured = res => {
  if (!razorpay) {
    respondWithError(res, 503, 'Payment gateway is not configured');
    return false;
  }
  return true;
};

// Verify a Razorpay payment signature.
// For checkout callback:  HMAC-SHA256( orderId + "|" + paymentId , keySecret )
// For webhook body:       HMAC-SHA256( rawBody , webhookSecret )
function verifySignature(data, secret, receivedSignature) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
  return expected === receivedSignature;
}

// ---------------------------------------------------------------------------
// Shared fulfillment — marks bill paid and fires downstream effects.
// Called by both verifyPayment (frontend callback) and handleRazorpayWebhook.
// ---------------------------------------------------------------------------
async function _fulfillBill({ bill, transaction, razorpayPaymentId, paymentMethod }) {
  // Guard against double-processing.
  if (bill.status === 'paid') return;

  bill.status = 'paid';
  bill.paidAt = new Date();
  bill.paymentMethod = paymentMethod || 'razorpay';
  bill.stripePaymentIntentId = razorpayPaymentId; // reusing field for payment reference
  await bill.save();

  transaction.status = 'success';
  transaction.razorpayPaymentId = razorpayPaymentId;
  transaction.paymentMethod = paymentMethod || 'razorpay';
  transaction.rawGatewayResponse = {
    ...transaction.rawGatewayResponse,
    razorpayPaymentId,
    fulfilledAt: new Date().toISOString(),
  };
  await transaction.save();

  // Gamification points
  try {
    const now = new Date();
    const isEarlyPayment = bill.dueDate && now < new Date(bill.dueDate);
    await Points.award({
      userId: bill.userId,
      role: 'resident',
      action: isEarlyPayment ? POINT_ACTIONS.EARLY_PAYMENT : POINT_ACTIONS.BILL_PAID,
      referenceId: bill._id.toString(),
      referenceType: 'bill',
    });
  } catch (e) {
    console.warn('⚠️ Points award failed:', e);
  }

  // Receipt email
  try {
    const resident = await User.findById(bill.userId).lean();
    if (resident) await sendPaymentReceipt({ resident, bill, transaction });
  } catch (e) {
    console.warn('⚠️ Receipt email failed:', e);
  }

  // Update linked special collection request if any
  if (bill.specialCollectionRequestId) {
    try {
      await SpecialCollectionRequest.updateOne(
        { _id: bill.specialCollectionRequestId },
        { $set: { paymentStatus: 'success', status: 'scheduled' } },
      );
    } catch (e) {
      console.warn('⚠️ Special collection update failed:', e);
    }
  }
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const listBillsSchema = z.object({
  userId: z.string({ required_error: 'userId is required' }).min(1),
});

const createOrderSchema = z.object({
  userId: z.string({ required_error: 'userId is required' }).min(1),
  billId: z.string({ required_error: 'billId is required' }).min(1),
});

const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  billId: z.string().min(1),
  userId: z.string().min(1),
});

const receiptParamsSchema = z.object({ transactionId: z.string().min(1) });
const receiptQuerySchema = z.object({ userId: z.string().min(1) });

// ---------------------------------------------------------------------------
// listBills — unchanged
// ---------------------------------------------------------------------------
async function listBills(req, res, next) {
  const parsedQuery = parseOrRespond(listBillsSchema, req.query, res);
  if (!parsedQuery) return undefined;

  try {
    const { userId } = parsedQuery;
    const bills = await Bill.find({ userId }).sort({ dueDate: 1 }).lean();
    const billIds = bills.map(b => b._id);

    const transactions = await PaymentTransaction.find({ billId: { $in: billIds } })
      .sort({ createdAt: -1 })
      .lean();

    const latestTransactionByBill = new Map();
    for (const tx of transactions) {
      const key = tx.billId.toString();
      if (!latestTransactionByBill.has(key)) latestTransactionByBill.set(key, tx);
    }

    const outstanding = [];
    const paid = [];
    let outstandingTotal = 0;
    let nextDueDate = null;

    for (const bill of bills) {
      const latestTransaction = latestTransactionByBill.get(bill._id.toString());
      if (latestTransaction) bill.latestTransaction = latestTransaction;

      if (bill.status === 'unpaid') {
        outstanding.push(bill);
        outstandingTotal += bill.amount || 0;
        if (!nextDueDate || (bill.dueDate && bill.dueDate < nextDueDate)) {
          nextDueDate = bill.dueDate;
        }
      } else if (bill.status === 'paid') {
        paid.push(bill);
      }
    }

    return res.json({
      ok: true,
      bills: { outstanding, paid },
      summary: {
        outstandingTotal,
        nextDueDate,
        outstandingCount: outstanding.length,
        paidCount: paid.length,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ---------------------------------------------------------------------------
// ✅ createOrder — creates a Razorpay order and returns orderId + keyId to frontend.
// The frontend uses these to open the Razorpay checkout modal.
// ---------------------------------------------------------------------------
async function createOrder(req, res, next) {
  if (!ensureRazorpayConfigured(res)) return undefined;

  const payload = parseOrRespond(createOrderSchema, req.body, res);
  if (!payload) return undefined;

  try {
    const user = await User.findById(payload.userId).lean();
    if (!user) return respondWithError(res, 404, 'Resident not found');

    const bill = await Bill.findOne({ _id: payload.billId, userId: payload.userId });
    if (!bill) return respondWithError(res, 404, 'Bill not found');
    if (bill.status !== 'unpaid') return respondWithError(res, 400, 'This bill has already been processed');

    // Cancel any stale pending transactions.
    await PaymentTransaction.updateMany(
      { billId: bill._id, status: 'pending' },
      { $set: { status: 'cancelled', failureReason: 'Superseded by a new payment attempt' } },
    );

    // Create a Razorpay order (amount is in paise — multiply rupees by 100).
    const order = await razorpay.orders.create({
      amount: Math.round((bill.amount || 0) * 100),
      currency: (bill.currency || 'INR').toUpperCase(),
      receipt: bill.invoiceNumber,
      notes: {
        billId: bill._id.toString(),
        userId: user._id.toString(),
        invoiceNumber: bill.invoiceNumber,
      },
    });

    // Persist a pending transaction so we can reconcile via webhook.
    await PaymentTransaction.create({
      billId: bill._id,
      userId: bill.userId,
      amount: bill.amount,
      currency: bill.currency || 'INR',
      status: 'pending',
      razorpayOrderId: order.id,
      rawGatewayResponse: { orderId: order.id, orderStatus: order.status },
    });

    return res.json({
      ok: true,
      orderId: order.id,
      amount: order.amount,   // in paise
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,  // safe to expose — it's the public key
      prefill: {
        name: user.name || '',
        email: user.email || '',
      },
      description: bill.description || `Invoice ${bill.invoiceNumber}`,
    });
  } catch (error) {
    return next(error);
  }
}

// ---------------------------------------------------------------------------
// ✅ verifyPayment — called by the frontend immediately after Razorpay modal
// succeeds with { razorpay_payment_id, razorpay_order_id, razorpay_signature }.
// We re-verify the signature server-side so the client cannot fake a success.
// ---------------------------------------------------------------------------
async function verifyPayment(req, res, next) {
  const payload = parseOrRespond(verifyPaymentSchema, req.body, res);
  if (!payload) return undefined;

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, billId, userId } = payload;

    // Signature verification: HMAC-SHA256 of "orderId|paymentId" with the key secret.
    const isValid = verifySignature(
      `${razorpay_order_id}|${razorpay_payment_id}`,
      process.env.RAZORPAY_KEY_SECRET,
      razorpay_signature,
    );

    if (!isValid) {
      return respondWithError(res, 400, 'Payment verification failed — invalid signature');
    }

    const bill = await Bill.findOne({ _id: billId, userId });
    if (!bill) return respondWithError(res, 404, 'Bill not found');

    if (bill.status === 'paid') {
      // Already fulfilled (webhook may have arrived first) — just return success.
      return res.json({ ok: true, message: 'Payment already confirmed.' });
    }

    const transaction = await PaymentTransaction.findOne({
      razorpayOrderId: razorpay_order_id,
      billId: bill._id,
    });

    if (!transaction) return respondWithError(res, 404, 'Transaction record not found');

    // Get payment method label from Razorpay (optional — don't block on failure).
    let paymentMethod = 'razorpay';
    try {
      const rzpPayment = await razorpay.payments.fetch(razorpay_payment_id);
      paymentMethod = rzpPayment.method || 'razorpay'; // 'upi', 'card', 'netbanking', etc.
    } catch (e) {
      console.warn('Could not fetch Razorpay payment details:', e.message);
    }

    await _fulfillBill({ bill, transaction, razorpayPaymentId: razorpay_payment_id, paymentMethod });

    return res.json({
      ok: true,
      message: 'Payment verified and bill marked as paid.',
      bill: {
        id: bill._id,
        invoiceNumber: bill.invoiceNumber,
        status: 'paid',
        paidAt: bill.paidAt,
      },
    });
  } catch (error) {
    return next(error);
  }
}

// ---------------------------------------------------------------------------
// ✅ handleRazorpayWebhook — Razorpay calls this server-to-server when a payment
// is captured. Acts as a safety net: if the user closes the tab before the
// frontend verify call completes, the bill is still marked paid here.
// ---------------------------------------------------------------------------
async function handleRazorpayWebhook(req, res) {
  const sig = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[webhook] RAZORPAY_WEBHOOK_SECRET is not set');
    return res.status(500).json({ ok: false, message: 'Webhook secret not configured' });
  }

  // req.body is a raw Buffer (express.raw in app.js).
  const isValid = verifySignature(req.body, webhookSecret, sig);
  if (!isValid) {
    console.error('⚠️ [billing webhook] Invalid Razorpay signature');
    return res.status(400).json({ ok: false, message: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch (e) {
    return res.status(400).json({ ok: false, message: 'Invalid JSON body' });
  }

  console.log(`[billing webhook] Event: ${event.event}`);

  try {
    if (event.event === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      if (!payment) return res.json({ received: true });

      const orderId = payment.order_id;
      const paymentId = payment.id;
      const paymentMethod = payment.method || 'razorpay';

      const transaction = await PaymentTransaction.findOne({ razorpayOrderId: orderId });
      if (!transaction) {
        // Not a billing transaction — may belong to special collection.
        return res.json({ received: true });
      }

      const bill = await Bill.findById(transaction.billId);
      if (bill && bill.status !== 'paid') {
        await _fulfillBill({ bill, transaction, razorpayPaymentId: paymentId, paymentMethod });
        console.log(`✅ [billing webhook] Bill ${bill._id} marked paid via webhook`);
      }
    }

    if (event.event === 'payment.failed') {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id) {
        await PaymentTransaction.updateOne(
          { razorpayOrderId: payment.order_id, status: 'pending' },
          {
            $set: {
              status: 'failed',
              failureReason: payment.error_description || 'Payment failed',
              rawGatewayResponse: { webhookEvent: 'payment.failed', razorpayPaymentId: payment.id },
            },
          },
        );
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('[billing webhook] Handler error:', err);
    return res.status(500).json({ ok: false, message: 'Webhook handler failed' });
  }
}

// ---------------------------------------------------------------------------
// getReceipt — unchanged
// ---------------------------------------------------------------------------
async function getReceipt(req, res, next) {
  const params = parseOrRespond(receiptParamsSchema, req.params, res);
  const query = params ? parseOrRespond(receiptQuerySchema, req.query, res) : null;
  if (!params || !query) return undefined;

  try {
    const transaction = await PaymentTransaction.findOne({
      _id: params.transactionId,
      userId: query.userId,
    }).populate('billId').lean();

    if (!transaction) return respondWithError(res, 404, 'Receipt not found');

    const bill = transaction.billId;

    const receipt = {
      transactionId: transaction._id.toString(),
      billId: bill?._id?.toString() || transaction.billId.toString(),
      invoiceNumber: bill?.invoiceNumber,
      amount: transaction.amount,
      currency: transaction.currency || bill?.currency || 'INR',
      status: transaction.status,
      paidAt: transaction.updatedAt,
      paymentMethod: transaction.paymentMethod,
      reference: transaction.razorpayPaymentId || transaction.razorpayOrderId,
    };

    return res.json({ ok: true, receipt });
  } catch (error) {
    return next(error);
  }
}

// ---------------------------------------------------------------------------
// simulatePayment — for testing/demo only
// ---------------------------------------------------------------------------
async function simulatePayment(req, res, next) {
  try {
    const { userId, billId } = req.body;
    if (!userId || !billId) return respondWithError(res, 400, 'userId and billId are required');

    const bill = await Bill.findOne({ _id: billId, userId });
    if (!bill) return respondWithError(res, 404, 'Bill not found');
    if (bill.status !== 'unpaid') return respondWithError(res, 400, 'Bill already paid');

    bill.status = 'paid';
    bill.paidAt = new Date();
    bill.paymentMethod = 'simulated';
    await bill.save();

    const now = new Date();
    const isEarlyPayment = bill.dueDate && now < new Date(bill.dueDate);

    await Points.award({
      userId: bill.userId,
      role: 'resident',
      action: isEarlyPayment ? POINT_ACTIONS.EARLY_PAYMENT : POINT_ACTIONS.BILL_PAID,
      referenceId: bill._id.toString(),
      referenceType: 'bill',
    });

    return res.json({
      ok: true,
      message: `Bill marked as paid. ${isEarlyPayment ? 100 : 50} points awarded!`,
      pointsAwarded: isEarlyPayment ? 100 : 50,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listBills,
  createOrder,
  verifyPayment,
  handleRazorpayWebhook,
  getReceipt,
  simulatePayment,
};