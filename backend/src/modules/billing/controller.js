const { z } = require('zod');
const Stripe = require('stripe');
const Bill = require('../../models/Bill');
const PaymentTransaction = require('../../models/PaymentTransaction');
const SpecialCollectionRequest = require('../../models/SpecialCollectionRequest');
const User = require('../../models/User');
const { sendPaymentReceipt } = require('../../services/mailer');

// ✅ ADDED: Import Points model for gamification
const Points = require('../../models/Points');
const { POINT_ACTIONS } = require('../../models/Points');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const configuredPaymentMethods = process.env.STRIPE_PAYMENT_METHODS
  ? process.env.STRIPE_PAYMENT_METHODS.split(',').map(method => method.trim()).filter(Boolean)
  : null;

const DEFAULT_PAYMENT_METHODS = ['card', 'link'];
const SUPPORTED_PAYMENT_METHODS = new Set((configuredPaymentMethods && configuredPaymentMethods.length
  ? configuredPaymentMethods
  : DEFAULT_PAYMENT_METHODS));

if (SUPPORTED_PAYMENT_METHODS.size === 0) {
  SUPPORTED_PAYMENT_METHODS.add('card');
}

const respondWithError = (res, status, message, extra = {}) => (
  res.status(status).json({ ok: false, message, ...extra })
);

const respondWithValidationError = (res, error) => respondWithError(
  res,
  400,
  error.issues?.[0]?.message || 'Invalid request',
  { issues: error.issues },
);

const parseOrRespond = (schema, payload, res) => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    respondWithValidationError(res, result.error);
    return null;
  }
  return result.data;
};

const ensureStripeConfigured = res => {
  if (!stripe) {
    respondWithError(res, 500, 'Stripe is not configured');
    return false;
  }
  return true;
};

const listBillsSchema = z.object({
  userId: z.string({ required_error: 'userId is required' }).min(1),
});

const checkoutSchema = z.object({
  userId: z.string({ required_error: 'userId is required' }).min(1),
  billId: z.string({ required_error: 'billId is required' }).min(1),
  successUrl: z.string({ required_error: 'successUrl is required' }).url('Invalid success URL'),
  cancelUrl: z.string({ required_error: 'cancelUrl is required' }).url('Invalid cancel URL'),
  paymentMethods: z.array(z.string()).optional(),
});

const syncParamsSchema = z.object({ sessionId: z.string().min(1) });
const receiptParamsSchema = z.object({ transactionId: z.string().min(1) });
const receiptQuerySchema = z.object({ userId: z.string().min(1) });

async function listBills(req, res, next) {
  const parsedQuery = parseOrRespond(listBillsSchema, req.query, res);
  if (!parsedQuery) {
    return undefined;
  }

  try {
    const { userId } = parsedQuery;
    const bills = await Bill.find({ userId }).sort({ dueDate: 1 }).lean();
    const billIds = bills.map(bill => bill._id);

    const transactions = await PaymentTransaction.find({ billId: { $in: billIds } })
      .sort({ createdAt: -1 })
      .lean();

    const latestTransactionByBill = new Map();
    for (const tx of transactions) {
      const key = tx.billId.toString();
      if (!latestTransactionByBill.has(key)) {
        latestTransactionByBill.set(key, tx);
      }
    }

    const outstanding = [];
    const paid = [];
    let outstandingTotal = 0;
    let nextDueDate = null;

    for (const bill of bills) {
      const latestTransaction = latestTransactionByBill.get(bill._id.toString());
      if (latestTransaction) {
        bill.latestTransaction = latestTransaction;
      }

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
      supportedPaymentMethods: Array.from(SUPPORTED_PAYMENT_METHODS),
    });
  } catch (error) {
    return next(error);
  }
}

async function createCheckoutSession(req, res, next) {
  if (!ensureStripeConfigured(res)) {
    return undefined;
  }

  const payload = parseOrRespond(checkoutSchema, req.body, res);
  if (!payload) {
    return undefined;
  }

  try {
    const user = await User.findById(payload.userId).lean();
    if (!user) {
      return respondWithError(res, 404, 'Resident not found');
    }

    const bill = await Bill.findOne({ _id: payload.billId, userId: payload.userId });
    if (!bill) {
      return respondWithError(res, 404, 'Bill not found');
    }
    if (bill.status !== 'unpaid') {
      return respondWithError(res, 400, 'This bill has already been processed');
    }

    const lineItemDescription = bill.description || `Waste collection bill ${bill.invoiceNumber}`;

    const requestedMethods = Array.isArray(payload.paymentMethods) ? payload.paymentMethods : [];
    const unsupportedMethods = requestedMethods.filter(method => !SUPPORTED_PAYMENT_METHODS.has(method));
    if (unsupportedMethods.length) {
      return respondWithError(res, 400, `Unsupported payment method(s): ${unsupportedMethods.join(', ')}`, {
        supportedMethods: Array.from(SUPPORTED_PAYMENT_METHODS),
      });
    }

    const paymentMethodTypes = requestedMethods.length
      ? requestedMethods
      : (SUPPORTED_PAYMENT_METHODS.has('card') ? ['card'] : Array.from(SUPPORTED_PAYMENT_METHODS));

    await PaymentTransaction.updateMany({ billId: bill._id, status: 'pending' }, {
      $set: {
        status: 'cancelled',
        failureReason: 'Superseded by a new checkout session',
      },
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      payment_method_types: paymentMethodTypes,
      success_url: payload.successUrl,
      cancel_url: payload.cancelUrl,
      line_items: [
        {
          price_data: {
            currency: (bill.currency || 'INR').toLowerCase(),
            product_data: { name: lineItemDescription },
            unit_amount: Math.round((bill.amount || 0) * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        billId: bill.id,
        userId: user._id.toString(),
      },
    });

    bill.stripeSessionId = session.id;
    await bill.save();

    await PaymentTransaction.create({
      billId: bill._id,
      userId: bill.userId,
      amount: bill.amount,
      currency: bill.currency || 'INR',
      status: 'pending',
      stripeSessionId: session.id,
      paymentMethod: paymentMethodTypes[0],
      rawGatewayResponse: { requestedMethods: paymentMethodTypes },
    });

    return res.json({
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    if (error.type === 'StripeInvalidRequestError') {
      return respondWithError(res, 400, error.message);
    }
    return next(error);
  }
}

async function syncCheckoutSession(req, res, next) {
  if (!ensureStripeConfigured(res)) {
    return undefined;
  }

  const params = parseOrRespond(syncParamsSchema, req.params, res);
  if (!params) {
    return undefined;
  }

  try {
    const { sessionId } = params;
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'payment_intent.payment_method', 'payment_intent.charges.data'],
    });

    const transaction = await PaymentTransaction.findOne({ stripeSessionId: sessionId });
    const bill = transaction
      ? await Bill.findById(transaction.billId)
      : await Bill.findOne({ stripeSessionId: sessionId });

    if (!session) {
      return respondWithError(res, 404, 'Checkout session not found');
    }

    if (!transaction || !bill) {
      return res.json({ ok: true, data: session, message: 'Session synced but no matching bill was found' });
    }

    const paymentIntent = session.payment_intent;
    const paymentIntentId = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id;
    const paymentMethodType = typeof paymentIntent === 'object'
      ? paymentIntent?.payment_method_types?.[0]
      : transaction.paymentMethod;

    const charges = typeof paymentIntent === 'object' ? paymentIntent?.charges?.data || [] : [];
    const primaryCharge = charges[0];
    const stripeReceiptUrl = primaryCharge?.receipt_url;
    const chargeStatus = primaryCharge?.status;

    let status = 'pending';
    if (session.status === 'canceled') {
      status = 'cancelled';
    } else if (session.payment_status === 'paid' || session.payment_status === 'no_payment_required') {
      status = 'success';
    } else if (session.payment_status === 'unpaid' && session.status === 'open') {
      status = 'pending';
    } else if (chargeStatus === 'failed') {
      status = 'failed';
    } else {
      status = 'failed';
    }

    transaction.status = status;
    transaction.stripePaymentIntentId = paymentIntentId;
    transaction.paymentMethod = paymentMethodType || transaction.paymentMethod;
    transaction.receiptUrl = stripeReceiptUrl || transaction.receiptUrl;
    transaction.rawGatewayResponse = {
      paymentStatus: session.payment_status,
      sessionStatus: session.status,
      lastChargeStatus: chargeStatus,
    };

    if (status === 'failed') {
      transaction.failureReason = primaryCharge?.failure_message || 'Payment unsuccessful';
    }
    if (status === 'cancelled') {
      transaction.failureReason = 'Checkout session cancelled by resident';
    }

    await transaction.save();

    if (status === 'success' && bill.status !== 'paid') {
      bill.status = 'paid';
      bill.paidAt = new Date();
      bill.paymentMethod = transaction.paymentMethod;
      bill.stripePaymentIntentId = transaction.stripePaymentIntentId;
      await bill.save();

      // ✅ GAMIFICATION: Award points to resident when bill is paid
      try {
        const now = new Date();
        const dueDate = bill.dueDate ? new Date(bill.dueDate) : null;

        // Check if paid early (before due date)
        const isEarlyPayment = dueDate && now < dueDate;

        await Points.award({
          userId: bill.userId,
          role: 'resident',
          action: isEarlyPayment
            ? POINT_ACTIONS.EARLY_PAYMENT
            : POINT_ACTIONS.BILL_PAID,
          referenceId: bill._id.toString(),
          referenceType: 'bill',
        });

        console.log(`✅ Points awarded to resident ${bill.userId} for ${isEarlyPayment ? 'early payment' : 'on-time payment'}`);
      } catch (pointsError) {
        // Never block payment flow if points fail
        console.warn('⚠️ Failed to award points for bill payment', pointsError);
      }
      // ✅ END GAMIFICATION

      try {
        const resident = await User.findById(bill.userId).lean();
        if (resident) {
          await sendPaymentReceipt({ resident, bill, transaction });
        }
      } catch (emailError) {
        console.warn('⚠️ Failed to send payment receipt email', emailError);
      }
    }

    let requestDetails = null;
    if (bill.specialCollectionRequestId) {
      const requestDoc = await SpecialCollectionRequest.findById(bill.specialCollectionRequestId);
      if (requestDoc) {
        if (bill.invoiceNumber) {
          requestDoc.paymentReference = bill.invoiceNumber;
        }

        if (status === 'success') {
          requestDoc.paymentStatus = 'success';
          if (['pending-payment', 'payment-failed'].includes(requestDoc.status)) {
            requestDoc.status = 'scheduled';
            requestDoc.cancellationReason = undefined;
          }
        } else if (status === 'failed') {
          requestDoc.paymentStatus = 'failed';
          if (requestDoc.status === 'pending-payment') {
            requestDoc.status = 'payment-failed';
          }
        }

        await requestDoc.save();

        const linkedRequest = requestDoc.toObject();
        requestDetails = {
          id: requestDoc._id.toString(),
          residentName: linkedRequest.residentName,
          ownerName: linkedRequest.ownerName,
          address: linkedRequest.address,
          district: linkedRequest.district,
          contactEmail: linkedRequest.contactEmail,
          contactPhone: linkedRequest.contactPhone,
          approxWeightKg: linkedRequest.approxWeightKg,
          totalWeightKg: linkedRequest.totalWeightKg,
          itemType: linkedRequest.itemType,
          itemLabel: linkedRequest.itemLabel,
          quantity: linkedRequest.quantity,
          slot: linkedRequest.slot,
          status: linkedRequest.status,
          paymentStatus: linkedRequest.paymentStatus,
          paymentAmount: linkedRequest.paymentAmount,
          paymentSubtotal: linkedRequest.paymentSubtotal,
          paymentWeightCharge: linkedRequest.paymentWeightCharge,
          paymentTaxCharge: linkedRequest.paymentTaxCharge,
        };
      }
    }

    return res.json({
      ok: true,
      data: {
        paymentStatus: status,
        amountTotal: session.amount_total,
        currency: session.currency,
        billId: bill.id,
        transactionId: transaction.id,
        receiptUrl: transaction.receiptUrl,
        bill: {
          id: bill.id,
          invoiceNumber: bill.invoiceNumber,
          description: bill.description,
          amount: bill.amount,
          currency: bill.currency,
          dueDate: bill.dueDate,
          paidAt: bill.paidAt,
          status: bill.status,
          category: bill.category,
        },
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          paidAt: transaction.updatedAt,
          paymentMethod: transaction.paymentMethod,
          receiptUrl: transaction.receiptUrl,
          paymentIntentId: transaction.stripePaymentIntentId,
        },
        request: requestDetails,
      },
    });
  } catch (error) {
    if (error.type === 'StripeInvalidRequestError') {
      return respondWithError(res, 400, error.message);
    }
    return next(error);
  }
}

async function getReceipt(req, res, next) {
  const params = parseOrRespond(receiptParamsSchema, req.params, res);
  const query = params ? parseOrRespond(receiptQuerySchema, req.query, res) : null;
  if (!params || !query) {
    return undefined;
  }

  try {
    const transaction = await PaymentTransaction.findOne({
      _id: params.transactionId,
      userId: query.userId,
    }).populate('billId').lean();

    if (!transaction) {
      return respondWithError(res, 404, 'Receipt not found');
    }

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
      receiptUrl: transaction.receiptUrl,
      reference: transaction.stripePaymentIntentId || transaction.stripeSessionId,
    };

    return res.json({ ok: true, receipt });
  } catch (error) {
    return next(error);
  }
}

// UPI payment confirmation — marks bill as paid with UTR reference
async function payUpi(req, res, next) {
  try {
    const { userId, billId, paymentReference, paymentMethod } = req.body
    if (!userId || !billId || !paymentReference) {
      return respondWithError(res, 400, 'userId, billId and paymentReference are required')
    }

    const bill = await Bill.findOne({ _id: billId, userId })
    if (!bill) return respondWithError(res, 404, 'Bill not found')
    if (bill.status !== 'unpaid') return respondWithError(res, 400, 'Bill has already been paid')

    // Mark bill as paid
    bill.status = 'paid'
    bill.paidAt = new Date()
    bill.paymentMethod = paymentMethod || 'upi'
    await bill.save()

    // Create transaction record
    const transaction = await PaymentTransaction.create({
      billId: bill._id,
      userId: bill.userId,
      amount: bill.amount,
      currency: bill.currency || 'INR',
      status: 'success',
      paymentMethod: 'upi',
      reference: paymentReference,
      rawGatewayResponse: { utrNumber: paymentReference },
    })

    // Update linked special collection request if any
    if (bill.specialCollectionRequestId) {
      await SpecialCollectionRequest.updateOne(
        { _id: bill.specialCollectionRequestId },
        { $set: { paymentStatus: 'success', status: 'scheduled', paymentReference } }
      )
    }

    // Award gamification points
    try {
      const now = new Date()
      const dueDate = bill.dueDate ? new Date(bill.dueDate) : null
      const isEarlyPayment = dueDate && now < dueDate
      await Points.award({
        userId: bill.userId,
        role: 'resident',
        action: isEarlyPayment ? POINT_ACTIONS.EARLY_PAYMENT : POINT_ACTIONS.BILL_PAID,
        referenceId: bill._id.toString(),
        referenceType: 'bill',
      })
    } catch (pointsError) {
      console.warn('Failed to award points for UPI payment', pointsError)
    }

    // Send receipt email
    try {
      const resident = await User.findById(userId).lean()
      if (resident) await sendPaymentReceipt({ resident, bill, transaction })
    } catch (emailError) {
      console.warn('Failed to send receipt email', emailError)
    }

    return res.json({
      ok: true,
      message: 'Payment confirmed successfully.',
      bill: { id: bill._id, invoiceNumber: bill.invoiceNumber, status: bill.status, paidAt: bill.paidAt },
      transaction: { id: transaction._id, reference: paymentReference },
    })
  } catch (error) {
    return next(error)
  }
}

// DEMO: Simulate a payment without Stripe (for testing points)
async function simulatePayment(req, res, next) {
  try {
    const { userId, billId } = req.body
    if (!userId || !billId) {
      return respondWithError(res, 400, 'userId and billId are required')
    }

    const bill = await Bill.findOne({ _id: billId, userId })
    if (!bill) return respondWithError(res, 404, 'Bill not found')
    if (bill.status !== 'unpaid') {
      return respondWithError(res, 400, 'Bill already paid')
    }

    // Mark bill as paid
    bill.status = 'paid'
    bill.paidAt = new Date()
    bill.paymentMethod = 'simulated'
    await bill.save()

    // Award points
    const now = new Date()
    const dueDate = bill.dueDate ? new Date(bill.dueDate) : null
    const isEarlyPayment = dueDate && now < dueDate

    await Points.award({
      userId: bill.userId,
      role: 'resident',
      action: isEarlyPayment
        ? POINT_ACTIONS.EARLY_PAYMENT
        : POINT_ACTIONS.BILL_PAID,
      referenceId: bill._id.toString(),
      referenceType: 'bill',
    })

    return res.json({
      ok: true,
      message: `Bill marked as paid. ${isEarlyPayment ? 100 : 50} points awarded!`,
      pointsAwarded: isEarlyPayment ? 100 : 50,
    })
  } catch (error) {
    return next(error)
  }
}

module.exports = {
  listBills,
  createCheckoutSession,
  syncCheckoutSession,
  getReceipt,
  simulatePayment,
  payUpi,   // ← ADD THIS
};