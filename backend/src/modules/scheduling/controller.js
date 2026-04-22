const crypto = require('crypto');
const { z } = require('zod');
const Razorpay = require('razorpay');
const User = require('../../models/User');
const SpecialCollectionRequest = require('../../models/SpecialCollectionRequest');
const SpecialCollectionPayment = require('../../models/SpecialCollectionPayment');
const Bill = require('../../models/Bill');
const {
  sendSpecialCollectionConfirmation,
  notifyAuthorityOfSpecialPickup,
  sanitizeMetadata,
} = require('../../services/mailer');
const { generateSpecialCollectionReceipt } = require('./receipt');
const Points = require('../../models/Points');
const { POINT_ACTIONS } = require('../../models/Points');

// ---------------------------------------------------------------------------
// Razorpay client
// ---------------------------------------------------------------------------
const razorpay =
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

function verifyRazorpaySignature(data, secret, receivedSignature) {
  const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return expected === receivedSignature;
}

const respondWithError = (res, status, message, extra = {}) =>
  res.status(status).json({ ok: false, message, ...extra });

const handleZodError = (res, error) =>
  respondWithError(res, 400, error.errors[0].message);

// ---------------------------------------------------------------------------
// Allowed item types and slot configuration
// ---------------------------------------------------------------------------
const allowedItems = [
  {
    id: 'furniture',
    label: 'Furniture & bulky items',
    description: 'Wardrobes, sofas, tables, mattresses and similar bulky household items.',
    allow: true,
    policy: { baseFee: 15, feePerExtraItem: 5, includedWeightKgPerItem: 25, ratePerKg: 0 },
  },
  {
    id: 'e-waste',
    label: 'Electronic waste',
    description: 'Televisions, refrigerators, computers, microwaves and other electrical items.',
    allow: true,
    policy: { baseFee: 12, feePerAdditionalItem: 5, includedWeightKgPerItem: 10, ratePerKg: 0 },
  },
  {
    id: 'yard',
    label: 'Garden trimmings',
    description: 'Branches, palm fronds, and bundled yard waste (max 25 kg per bundle).',
    allow: true,
    policy: { baseFee: 8, feePerExtraItem: 3, includedWeightKgPerItem: 15, ratePerKg: 0 },
  },
  {
    id: 'wet-waste',
    label: 'Wet / organic waste',
    description: 'Kitchen scraps, food leftovers, fruit peels and other biodegradable organic waste.',
    allow: true,
    policy: { baseFee: 5, feePerExtraItem: 2, includedWeightKgPerItem: 10, ratePerKg: 0 },
  },
  {
    id: 'dry-recyclable',
    label: 'Dry recyclables',
    description: 'Cardboard, paper, plastic bottles, glass jars and metal cans (clean and dry).',
    allow: true,
    policy: { baseFee: 5, feePerExtraItem: 2, includedWeightKgPerItem: 10, ratePerKg: 0 },
  },
  {
    id: 'hazardous-household',
    label: 'Hazardous household waste',
    description: 'Paint cans, batteries, cleaning chemicals, insecticides and other household hazardous materials.',
    allow: true,
    policy: { baseFee: 10, feePerExtraItem: 4, includedWeightKgPerItem: 5, ratePerKg: 0 },
  },
  {
    id: 'construction',
    label: 'Construction rubble',
    description:
      'Bricks, concrete, tiles and other construction debris must be handled via licensed private haulers (GHMC helpline: 040-21111111).',
    allow: false,
  },
  {
    id: 'medical',
    label: 'Medical / clinical waste',
    description:
      'Syringes, dressings and clinical waste must be disposed via authorised biomedical waste operators. Contact GHMC for referrals.',
    allow: false,
  },
];

const SLOT_CONFIG = {
  startHour: 8,
  endHour: 17,
  durationMinutes: 120,
  maxRequestsPerSlot: 3,
  lookAheadDays: 5,
  timezone: 'Asia/Kolkata',
};

const TAX_RATE = 0.18;

allowedItems.forEach(item => {
  if (item.policy) Object.freeze(item.policy);
  Object.freeze(item);
});
Object.freeze(allowedItems);
Object.freeze(SLOT_CONFIG);

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const approxWeightSchema = z.union([
  z.number().positive('Approximate weight must be greater than zero'),
  z.null(),
  z.undefined(),
]);

const residentDetailsSchema = {
  residentName: z.string().min(1, 'Resident name is required'),
  ownerName: z.string().min(1, "Owner's name is required"),
  address: z.string().min(1, 'Address is required'),
  district: z.string().min(1, 'District is required'),
  email: z.string().email('A valid email is required'),
  phone: z.string().min(10, 'A valid 10-digit Indian phone number is required'),
  approxWeight: approxWeightSchema,
  specialNotes: z.string().max(1000).optional(),
};

const availabilitySchema = z
  .object({
    userId: z.string().min(1, 'User id is required'),
    itemType: z.string().min(1, 'Item type is required'),
    quantity: z.number().int().min(1, 'Quantity must be at least 1'),
    preferredDateTime: z.string().datetime().or(z.date()),
  })
  .extend(residentDetailsSchema);

const bookingSchema = availabilitySchema.extend({
  slotId: z.string().min(1, 'Slot id is required'),
  paymentReference: z.string().optional(),
  paymentStatus: z.enum(['success', 'failed', 'pending']).optional(),
  deferPayment: z.boolean().optional(),
});

const listSchema = z.object({ userId: z.string().min(1, 'User id is required') });

const checkoutInitSchema = availabilitySchema.extend({
  slotId: z.string().min(1, 'Slot id is required'),
});

const verifyCheckoutSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  userId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------
function findItemPolicy(itemType) {
  return allowedItems.find(item => item.id === itemType);
}

function buildDisallowedResponse(policy) {
  return {
    ok: false,
    code: 'ITEM_NOT_ALLOWED',
    message: `${policy.label} cannot be collected via the GHMC special pickup programme. ${policy.description}`,
    disposalInfo: policy.description,
  };
}

function toDate(value) {
  if (value instanceof Date) return value;
  return new Date(value);
}

function normaliseDate(date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  return d;
}

function slotIdFor(date) {
  return normaliseDate(date).toISOString();
}

function generateCandidateSlots(preferred, { lookAheadDays, startHour, endHour, durationMinutes }) {
  const slots = [];
  const startDay = new Date(preferred);
  startDay.setHours(0, 0, 0, 0);

  for (let dayOffset = 0; dayOffset < lookAheadDays; dayOffset += 1) {
    const day = new Date(startDay);
    day.setDate(startDay.getDate() + dayOffset);

    for (let minutes = startHour * 60; minutes < endHour * 60; minutes += durationMinutes) {
      const slotStart = new Date(day);
      slotStart.setMinutes(minutes, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotStart.getMinutes() + durationMinutes);
      slots.push({ slotId: slotIdFor(slotStart), start: slotStart, end: slotEnd });
    }
  }
  return slots;
}

function filterCandidatesForPreferredDay(candidates, preferred, now = new Date()) {
  const preferredDayStart = new Date(preferred);
  preferredDayStart.setHours(0, 0, 0, 0);
  const preferredDayEnd = new Date(preferredDayStart);
  preferredDayEnd.setDate(preferredDayEnd.getDate() + 1);

  return candidates.filter(
    c => c.start >= preferredDayStart && c.start < preferredDayEnd && c.end > now,
  );
}

async function attachAvailability(slots) {
  const results = [];
  for (const slot of slots) {
    const count = await SpecialCollectionRequest.countDocuments({
      'slot.slotId': slot.slotId,
      status: { $in: ['scheduled', 'pending-payment'] },
    });
    const capacityLeft = Math.max(SLOT_CONFIG.maxRequestsPerSlot - count, 0);
    results.push({ ...slot, capacityLeft, isAvailable: capacityLeft > 0 });
  }
  return results.filter(s => s.isAvailable);
}

function toPositiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function calculatePayment(itemPolicy, quantity, approxWeightPerItemKg) {
  if (!itemPolicy?.policy) {
    return { required: false, amount: 0, totalWeightKg: 0, weightCharge: 0, baseCharge: 0 };
  }

  const {
    baseFee = 0,
    includedQuantity = 0,
    feePerExtraItem = 0,
    feePerAdditionalItem = 0,
    ratePerKg = 0,
    includedWeightKgPerItem = 0,
  } = itemPolicy.policy;

  const normalisedQuantity = Math.max(Number(quantity) || 0, 0);
  const weightPerItem = toPositiveNumber(approxWeightPerItemKg);
  const totalWeightKg = weightPerItem * normalisedQuantity;

  let amount = baseFee;

  if (includedQuantity && normalisedQuantity > includedQuantity) {
    amount += (normalisedQuantity - includedQuantity) * (feePerExtraItem || feePerAdditionalItem || 0);
  }
  if (!includedQuantity && feePerAdditionalItem && normalisedQuantity > 1) {
    amount += (normalisedQuantity - 1) * feePerAdditionalItem;
  }

  let weightCharge = 0;
  if (ratePerKg > 0 && totalWeightKg > 0) {
    const includedWeightTotal = toPositiveNumber(includedWeightKgPerItem) * normalisedQuantity;
    const billableWeight = Math.max(totalWeightKg - includedWeightTotal, 0);
    weightCharge = billableWeight * ratePerKg;
    amount += weightCharge;
  }

  const roundedWeightCharge = Math.round(weightCharge * 100) / 100;
  const roundedBaseCharge = Math.round(Math.max(amount - weightCharge, 0) * 100) / 100;
  const taxableBase = Math.max(roundedBaseCharge + roundedWeightCharge, 0);
  const roundedTaxCharge = Math.round(taxableBase * TAX_RATE * 100) / 100;
  const roundedTotalWeight = Math.round(totalWeightKg * 10) / 10;
  const roundedTotal = Math.round((taxableBase + roundedTaxCharge) * 100) / 100;

  return {
    required: roundedTotal > 0,
    amount: roundedTotal,
    totalWeightKg: roundedTotalWeight,
    weightCharge: roundedWeightCharge,
    baseCharge: roundedBaseCharge,
    taxCharge: roundedTaxCharge,
  };
}

async function expireOverduePendingRequests() {
  const now = new Date();
  const overdue = await SpecialCollectionRequest.find({
    status: 'pending-payment',
    'slot.start': { $lte: now },
  }).select({ _id: 1 });

  if (!overdue.length) return;

  const ids = overdue.map(doc => doc._id);
  await SpecialCollectionRequest.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        status: 'cancelled',
        paymentStatus: 'failed',
        cancellationReason: 'Payment was not received before the scheduled time.',
      },
    },
  );

  await Bill.updateMany(
    { specialCollectionRequestId: { $in: ids }, status: 'unpaid' },
    { $set: { status: 'cancelled' } },
  );
}

function generateSpecialCollectionInvoiceNumber(requestId) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = requestId.toString().slice(-6).toUpperCase();
  return `GHMC-SC-${datePart}-${suffix}`;
}

async function awardPickupPoints(userId, requestDocId) {
  try {
    await Points.award({
      userId,
      role: 'resident',
      action: POINT_ACTIONS.PICKUP_REQUESTED,
      referenceId: requestDocId.toString(),
      referenceType: 'schedule',
    });
  } catch (e) {
    console.warn('Failed to award points for pickup request', e);
  }
}

async function createDeferredBooking({ user, payload, slot, payment, itemPolicy }) {
  const requestDoc = await SpecialCollectionRequest.create({
    userId: user._id,
    userEmail: user.email,
    userName: user.name,
    residentName: payload.residentName?.trim() || user.name,
    ownerName: payload.ownerName?.trim() || payload.residentName?.trim() || user.name,
    address: payload.address?.trim(),
    district: payload.district?.trim(),
    contactEmail: payload.email?.trim() || user.email,
    contactPhone: payload.phone?.trim(),
    approxWeightKg:
      typeof payload.approxWeight === 'number' && Number.isFinite(payload.approxWeight)
        ? payload.approxWeight
        : undefined,
    totalWeightKg:
      typeof payment.totalWeightKg === 'number' && Number.isFinite(payment.totalWeightKg)
        ? payment.totalWeightKg
        : undefined,
    specialNotes: payload.specialNotes?.trim(),
    itemType: payload.itemType,
    itemLabel: itemPolicy?.label,
    quantity: payload.quantity,
    preferredDateTime: toDate(payload.preferredDateTime),
    slot,
    status: 'pending-payment',
    paymentRequired: true,
    paymentStatus: 'pending',
    paymentAmount: payment.amount,
    paymentSubtotal: payment.baseCharge,
    paymentWeightCharge: payment.weightCharge,
    paymentTaxCharge: payment.taxCharge,
    paymentDueAt: slot.start,
    notifications: {},
  });

  const invoiceNumber = generateSpecialCollectionInvoiceNumber(requestDoc._id);
  const dueDate = slot.start ? new Date(slot.start) : new Date(payload.preferredDateTime);

  const bill = await Bill.create({
    userId: user._id,
    invoiceNumber,
    description: `GHMC special collection pickup - ${itemPolicy?.label || payload.itemType}`,
    amount: payment.amount,
    currency: 'INR',
    billingPeriodStart: slot.start,
    billingPeriodEnd: slot.end,
    generatedAt: new Date(),
    dueDate,
    category: 'special-collection',
    specialCollectionRequestId: requestDoc._id,
  });

  requestDoc.paymentReference = invoiceNumber;
  requestDoc.billingId = bill._id;
  await requestDoc.save();
  await awardPickupPoints(user._id, requestDoc._id);

  return { requestDoc, bill };
}

async function dispatchBookingEmails({ user, requestDoc, slot, receiptBuffer, issuedAt }) {
  try {
    const [residentNotice, authorityNotice] = await Promise.all([
      sendSpecialCollectionConfirmation({
        resident: { email: user.email, name: user.name },
        slot,
        request: requestDoc,
        receipt: receiptBuffer
          ? {
              buffer: receiptBuffer,
              filename: `special-collection-receipt-${requestDoc._id}.pdf`,
              issuedAt,
            }
          : undefined,
      }).catch(e => { console.warn('Failed to email resident', e); return { sent: false }; }),
      notifyAuthorityOfSpecialPickup({ request: requestDoc, slot }).catch(e => {
        console.warn('Failed to email authority', e);
        return { sent: false };
      }),
    ]);

    const updates = {};
    if (residentNotice.sent) updates['notifications.residentSentAt'] = residentNotice.sentAt || new Date();
    if (authorityNotice.sent) updates['notifications.authoritySentAt'] = authorityNotice.sentAt || new Date();

    if (Object.keys(updates).length) {
      await SpecialCollectionRequest.updateOne({ _id: requestDoc._id }, { $set: updates });
    }
  } catch (e) {
    console.warn('Booking email dispatch error', e);
  }
}

// Background sweep — expire pending-payment requests past their slot time.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
if (process.env.SCHEDULING_SWEEP_DISABLED !== 'true') {
  const sweepTimer = setInterval(() => {
    expireOverduePendingRequests().catch(e =>
      console.warn('Failed to expire overdue pending-payment requests', e),
    );
  }, SWEEP_INTERVAL_MS);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
}

async function finaliseBooking({
  user,
  payload,
  slot,
  payment,
  paymentReference,
  paymentDoc,
  provider = 'internal',
  itemPolicy,
  deferPayment = false,
}) {
  await expireOverduePendingRequests();

  const existing = await SpecialCollectionRequest.countDocuments({
    'slot.slotId': slot.slotId,
    status: { $in: ['scheduled', 'pending-payment'] },
  });
  if (existing >= SLOT_CONFIG.maxRequestsPerSlot) {
    const error = new Error('This slot has just been booked. Please choose another slot.');
    error.code = 'SLOT_FULL';
    throw error;
  }

  if (deferPayment && payment.required) {
    const { requestDoc } = await createDeferredBooking({ user, payload, slot, payment, itemPolicy });
    await dispatchBookingEmails({ user, requestDoc, slot, receiptBuffer: null, issuedAt: new Date() });
    return requestDoc;
  }

  const requestDoc = await SpecialCollectionRequest.create({
    userId: user._id,
    userEmail: user.email,
    userName: user.name,
    residentName: payload.residentName?.trim() || user.name,
    ownerName: payload.ownerName?.trim() || payload.residentName?.trim() || user.name,
    address: payload.address?.trim(),
    district: payload.district?.trim(),
    contactEmail: payload.email?.trim() || user.email,
    contactPhone: payload.phone?.trim(),
    approxWeightKg:
      typeof payload.approxWeight === 'number' && Number.isFinite(payload.approxWeight)
        ? payload.approxWeight
        : undefined,
    totalWeightKg:
      typeof payment.totalWeightKg === 'number' && Number.isFinite(payment.totalWeightKg)
        ? payment.totalWeightKg
        : undefined,
    specialNotes: payload.specialNotes?.trim(),
    itemType: payload.itemType,
    itemLabel: itemPolicy?.label,
    quantity: payload.quantity,
    preferredDateTime: toDate(payload.preferredDateTime),
    slot,
    status: 'scheduled',
    paymentRequired: payment.required,
    paymentStatus: payment.required ? 'success' : 'not-required',
    paymentAmount: payment.amount,
    paymentSubtotal: payment.baseCharge,
    paymentWeightCharge: payment.weightCharge,
    paymentTaxCharge: payment.taxCharge,
    paymentReference,
    notifications: {},
  });

  const issuedAt = new Date();
  let receiptBuffer = null;

  if (payment.required) {
    try {
      receiptBuffer = await generateSpecialCollectionReceipt({
        request: requestDoc.toObject(),
        slot,
        issuedAt,
      });
    } catch (e) {
      console.warn('Failed to generate receipt PDF', e);
    }

    const paymentPayload = {
      requestId: requestDoc._id,
      userId: user._id,
      amount: payment.amount,
      currency: 'INR',
      status: 'success',
      provider,
      reference: paymentReference,
      razorpayOrderId: paymentDoc?.razorpayOrderId,
      razorpayPaymentId: paymentDoc?.razorpayPaymentId,
      slotId: slot.slotId,
      metadata: {
        ...(paymentDoc?.metadata || {}),
        itemType: payload.itemType,
        itemLabel: itemPolicy?.label,
        quantity: payload.quantity,
        preferredDateTime: payload.preferredDateTime,
        residentName: payload.residentName,
        ownerName: payload.ownerName,
        address: payload.address,
        district: payload.district,
        email: payload.email,
        phone: payload.phone,
        approxWeight: payload.approxWeight,
        specialNotes: payload.specialNotes,
        totalWeightKg: payment.totalWeightKg,
        weightCharge: payment.weightCharge,
        baseCharge: payment.baseCharge,
        taxCharge: payment.taxCharge,
      },
    };

    if (paymentDoc) {
      await SpecialCollectionPayment.updateOne({ _id: paymentDoc._id }, { $set: paymentPayload });
    } else {
      await SpecialCollectionPayment.create(paymentPayload);
    }
  }

  await dispatchBookingEmails({ user, requestDoc, slot, receiptBuffer, issuedAt });
  await awardPickupPoints(user._id, requestDoc._id);

  return requestDoc;
}

async function resolveUser(userId) {
  const user = await User.findById(userId).lean();
  if (!user) {
    const error = new Error('Resident account not found');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  if (!user.isActive) {
    const error = new Error('Resident account is inactive. Please contact support.');
    error.code = 'ACCOUNT_INACTIVE';
    throw error;
  }
  return user;
}

async function safeJson(response) {
  const text = await response.text?.() ?? '';
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function getConfig(_req, res) {
  return res.json({ ok: true, items: allowedItems, slotConfig: SLOT_CONFIG });
}

async function checkAvailability(req, res, next) {
  try {
    const payload = availabilitySchema.parse(req.body);
    const user = await resolveUser(payload.userId);

    const policy = findItemPolicy(payload.itemType);
    if (!policy) return respondWithError(res, 400, 'Unknown item type requested.');
    if (!policy.allow) return res.status(400).json(buildDisallowedResponse(policy));

    const preferred = toDate(payload.preferredDateTime);
    if (Number.isNaN(preferred.getTime()))
      return respondWithError(res, 400, 'Preferred date/time is invalid.');

    const candidates = generateCandidateSlots(preferred, SLOT_CONFIG);
    const availableSlots = await attachAvailability(
      filterCandidatesForPreferredDay(candidates, preferred),
    );
    const payment = calculatePayment(policy, payload.quantity, payload.approxWeight);

    return res.json({
      ok: true,
      user: { id: user._id, name: user.name, email: user.email },
      policy,
      payment,
      slots: availableSlots,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return handleZodError(res, error);
    if (error.code === 'USER_NOT_FOUND') return respondWithError(res, 404, error.message);
    if (error.code === 'ACCOUNT_INACTIVE') return respondWithError(res, 403, error.message);
    return next(error);
  }
}

async function confirmBooking(req, res, next) {
  try {
    const payload = bookingSchema.parse(req.body);
    const user = await resolveUser(payload.userId);
    const policy = findItemPolicy(payload.itemType);

    if (!policy) return respondWithError(res, 400, 'Unknown item type requested.');
    if (!policy.allow) return res.status(400).json(buildDisallowedResponse(policy));

    const preferred = toDate(payload.preferredDateTime);
    if (Number.isNaN(preferred.getTime()))
      return respondWithError(res, 400, 'Preferred date/time is invalid.');

    const payment = calculatePayment(policy, payload.quantity, payload.approxWeight);
    const deferPayment = Boolean(payload.deferPayment) && payment.required;

    if (payment.required && !deferPayment && payload.paymentStatus !== 'success') {
      return respondWithError(res, 402, 'Payment failed. The pickup was not scheduled.');
    }

    const slotCandidates = generateCandidateSlots(preferred, SLOT_CONFIG);
    const slot = filterCandidatesForPreferredDay(slotCandidates, preferred).find(
      c => c.slotId === payload.slotId,
    );
    if (!slot) return respondWithError(res, 400, 'Selected slot is no longer available.');

    const requestDoc = await finaliseBooking({
      user,
      payload: {
        itemType: payload.itemType,
        quantity: payload.quantity,
        preferredDateTime: payload.preferredDateTime,
        residentName: payload.residentName,
        ownerName: payload.ownerName,
        address: payload.address,
        district: payload.district,
        email: payload.email,
        phone: payload.phone,
        approxWeight: payload.approxWeight ?? undefined,
        specialNotes: payload.specialNotes,
      },
      slot,
      payment,
      paymentReference:
        payment.required && !deferPayment
          ? payload.paymentReference || `PAY-${Date.now()}`
          : undefined,
      paymentDoc: null,
      provider: 'internal-simulator',
      itemPolicy: policy,
      deferPayment,
    });

    return res.status(201).json({
      ok: true,
      message: deferPayment
        ? 'Special collection booking reserved. Payment is due before the scheduled time or the slot will be cancelled.'
        : 'Special collection scheduled successfully. You will receive a confirmation email shortly.',
      request: requestDoc,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return handleZodError(res, error);
    if (error.code === 'USER_NOT_FOUND') return respondWithError(res, 404, error.message);
    if (error.code === 'ACCOUNT_INACTIVE') return respondWithError(res, 403, error.message);
    if (error.code === 'SLOT_FULL') return respondWithError(res, 409, error.message);
    return next(error);
  }
}

// ✅ RAZORPAY: creates a Razorpay order and returns orderId + keyId to the frontend.
async function startCheckout(req, res, next) {
  try {
    if (!razorpay) return respondWithError(res, 503, 'Online payments are currently unavailable.');

    const payload = checkoutInitSchema.parse(req.body);
    const user = await resolveUser(payload.userId);
    const policy = findItemPolicy(payload.itemType);

    if (!policy) return respondWithError(res, 400, 'Unknown item type requested.');
    if (!policy.allow) return res.status(400).json(buildDisallowedResponse(policy));

    const preferred = toDate(payload.preferredDateTime);
    if (Number.isNaN(preferred.getTime()))
      return respondWithError(res, 400, 'Preferred date/time is invalid.');

    const payment = calculatePayment(policy, payload.quantity, payload.approxWeight);
    if (!payment.required) return res.json({ ok: true, paymentRequired: false });

    const slotCandidates = generateCandidateSlots(preferred, SLOT_CONFIG);
    const slot = filterCandidatesForPreferredDay(slotCandidates, preferred).find(
      c => c.slotId === payload.slotId,
    );
    if (!slot) return respondWithError(res, 400, 'Selected slot is no longer available.');

    const existing = await SpecialCollectionRequest.countDocuments({
      'slot.slotId': slot.slotId,
      status: { $in: ['scheduled', 'pending-payment'] },
    });
    const pendingPayments = await SpecialCollectionPayment.countDocuments({
      slotId: slot.slotId,
      status: 'pending',
    });
    if (existing + pendingPayments >= SLOT_CONFIG.maxRequestsPerSlot) {
      return respondWithError(res, 409, 'This slot has just been booked. Please choose another slot.');
    }

    // Store metadata so verifyCheckout can reconstruct the booking.
    const metadata = sanitizeMetadata({
      userId: user._id.toString(),
      itemType: payload.itemType,
      itemLabel: policy.label,
      quantity: String(payload.quantity),
      preferredDateTime: preferred.toISOString(),
      slotId: slot.slotId,
      residentName: payload.residentName,
      ownerName: payload.ownerName,
      address: payload.address,
      district: payload.district,
      email: payload.email,
      phone: payload.phone,
      approxWeight: payload.approxWeight != null ? String(payload.approxWeight) : undefined,
      totalWeightKg: payment.totalWeightKg != null ? String(payment.totalWeightKg) : undefined,
      weightCharge: payment.weightCharge != null ? String(payment.weightCharge) : undefined,
      baseCharge: payment.baseCharge != null ? String(payment.baseCharge) : undefined,
      taxCharge: payment.taxCharge != null ? String(payment.taxCharge) : undefined,
      specialNotes: payload.specialNotes,
    });

    // Create Razorpay order (amount in paise).
    const order = await razorpay.orders.create({
      amount: Math.round(payment.amount * 100),
      currency: 'INR',
      receipt: `SC-${Date.now()}`,
      notes: { userId: user._id.toString(), itemType: payload.itemType },
    });

    // Persist pending payment doc so verifyCheckout can find it by orderId.
    const paymentDoc = await SpecialCollectionPayment.create({
      userId: user._id,
      amount: payment.amount,
      currency: 'INR',
      status: 'pending',
      provider: 'razorpay',
      razorpayOrderId: order.id,
      slotId: slot.slotId,
      metadata,
    });

    return res.json({
      ok: true,
      orderId: order.id,
      amount: order.amount,     // paise
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      paymentId: paymentDoc._id,
      prefill: { name: user.name || '', email: user.email || '' },
      description: `GHMC special waste collection – ${policy.label}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ ok: false, message: error.errors[0].message });
    if (error.code === 'USER_NOT_FOUND') return res.status(404).json({ ok: false, message: error.message });
    if (error.code === 'ACCOUNT_INACTIVE') return res.status(403).json({ ok: false, message: error.message });
    return next(error);
  }
}

// ✅ RAZORPAY: frontend calls this after the Razorpay modal fires its success
// callback.  We verify the signature and then call finaliseBooking.
async function verifyCheckout(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } =
      verifyCheckoutSchema.parse(req.body);

    // Server-side signature verification.
    const isValid = verifyRazorpaySignature(
      `${razorpay_order_id}|${razorpay_payment_id}`,
      process.env.RAZORPAY_KEY_SECRET,
      razorpay_signature,
    );
    if (!isValid) {
      return respondWithError(res, 400, 'Payment verification failed — invalid signature');
    }

    const paymentDoc = await SpecialCollectionPayment.findOne({
      razorpayOrderId: razorpay_order_id,
    });
    if (!paymentDoc) {
      return res.status(404).json({ ok: false, message: 'Checkout session not found.' });
    }

    // Guard against double-processing.
    if (paymentDoc.status === 'success' && paymentDoc.requestId) {
      const existing = await SpecialCollectionRequest.findById(paymentDoc.requestId).lean();
      return res.json({ ok: true, status: 'success', request: existing });
    }

    const metadata = paymentDoc.metadata || {};
    const payload = {
      itemType: metadata.itemType,
      quantity: Number(metadata.quantity || 0),
      preferredDateTime: metadata.preferredDateTime,
      residentName: metadata.residentName,
      ownerName: metadata.ownerName,
      address: metadata.address,
      district: metadata.district,
      email: metadata.email,
      phone: metadata.phone,
      approxWeight: metadata.approxWeight ? Number(metadata.approxWeight) : undefined,
      specialNotes: metadata.specialNotes,
    };

    const policy = findItemPolicy(payload.itemType);
    if (!policy || !policy.allow) {
      await SpecialCollectionPayment.updateOne({ _id: paymentDoc._id }, { $set: { status: 'failed' } });
      return res.status(400).json({ ok: false, message: 'Item type is not eligible.' });
    }

    const preferred = toDate(payload.preferredDateTime);
    const slotCandidates = generateCandidateSlots(preferred, SLOT_CONFIG);
    const slot = slotCandidates.find(c => c.slotId === metadata.slotId);
    if (!slot) {
      await SpecialCollectionPayment.updateOne({ _id: paymentDoc._id }, { $set: { status: 'failed' } });
      return res.status(409).json({ ok: false, message: 'The chosen slot is no longer available.' });
    }

    const payment = calculatePayment(policy, payload.quantity, payload.approxWeight);
    const user = await resolveUser(userId);

    // Attach payment IDs so finaliseBooking can persist them.
    paymentDoc.razorpayPaymentId = razorpay_payment_id;

    const requestDoc = await finaliseBooking({
      user,
      payload,
      slot,
      payment,
      paymentReference: razorpay_payment_id,
      paymentDoc,
      provider: 'razorpay',
      itemPolicy: policy,
    });

    return res.json({ ok: true, status: 'success', request: requestDoc });
  } catch (error) {
    if (error instanceof z.ZodError) return handleZodError(res, error);
    if (error.code === 'USER_NOT_FOUND') return respondWithError(res, 404, error.message);
    if (error.code === 'ACCOUNT_INACTIVE') return respondWithError(res, 403, error.message);
    if (error.code === 'SLOT_FULL') return respondWithError(res, 409, error.message);
    return next(error);
  }
}

// ✅ RAZORPAY WEBHOOK: safety net in case the user closes the tab before
// verifyCheckout is called.
async function handleRazorpayWebhook(req, res) {
  const sig = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET_SCHEDULING;

  if (!webhookSecret) {
    console.error('[scheduling webhook] RAZORPAY_WEBHOOK_SECRET_SCHEDULING not set');
    return res.status(500).json({ ok: false, message: 'Webhook secret not configured' });
  }

  const isValid = verifyRazorpaySignature(req.body, webhookSecret, sig);
  if (!isValid) {
    return res.status(400).json({ ok: false, message: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ ok: false, message: 'Invalid JSON body' });
  }

  console.log(`[scheduling webhook] Event: ${event.event}`);

  try {
    if (event.event === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      if (!payment?.order_id) return res.json({ received: true });

      const paymentDoc = await SpecialCollectionPayment.findOne({
        razorpayOrderId: payment.order_id,
      });
      if (!paymentDoc || paymentDoc.status === 'success') return res.json({ received: true });

      const metadata = paymentDoc.metadata || {};
      const payload = {
        itemType: metadata.itemType,
        quantity: Number(metadata.quantity || 0),
        preferredDateTime: metadata.preferredDateTime,
        residentName: metadata.residentName,
        ownerName: metadata.ownerName,
        address: metadata.address,
        district: metadata.district,
        email: metadata.email,
        phone: metadata.phone,
        approxWeight: metadata.approxWeight ? Number(metadata.approxWeight) : undefined,
        specialNotes: metadata.specialNotes,
      };

      const policy = findItemPolicy(payload.itemType);
      if (!policy || !policy.allow) {
        await SpecialCollectionPayment.updateOne({ _id: paymentDoc._id }, { $set: { status: 'failed' } });
        return res.json({ received: true });
      }

      const preferred = toDate(payload.preferredDateTime);
      const slotCandidates = generateCandidateSlots(preferred, SLOT_CONFIG);
      const slot = slotCandidates.find(c => c.slotId === metadata.slotId);
      if (!slot) {
        await SpecialCollectionPayment.updateOne({ _id: paymentDoc._id }, { $set: { status: 'failed' } });
        return res.json({ received: true });
      }

      const paymentCalc = calculatePayment(policy, payload.quantity, payload.approxWeight);
      const user = await resolveUser(paymentDoc.userId.toString());

      paymentDoc.razorpayPaymentId = payment.id;

      await finaliseBooking({
        user,
        payload,
        slot,
        payment: paymentCalc,
        paymentReference: payment.id,
        paymentDoc,
        provider: 'razorpay',
        itemPolicy: policy,
      });

      console.log(`✅ [scheduling webhook] Booking finalised for order ${payment.order_id}`);
    }

    if (event.event === 'payment.failed') {
      const payment = event.payload?.payment?.entity;
      if (payment?.order_id) {
        await SpecialCollectionPayment.updateOne(
          { razorpayOrderId: payment.order_id },
          { $set: { status: 'failed' } },
        );
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('[scheduling webhook] Error:', err);
    return res.status(500).json({ ok: false, message: 'Webhook handler failed' });
  }
}

async function listUserRequests(req, res, next) {
  try {
    const { userId } = listSchema.parse(req.query);
    await resolveUser(userId);
    const requests = await SpecialCollectionRequest.find({ userId }).sort({ createdAt: -1 }).lean();
    return res.json({ ok: true, requests });
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ ok: false, message: error.errors[0].message });
    if (error.code === 'USER_NOT_FOUND')
      return res.status(404).json({ ok: false, message: error.message });
    if (error.code === 'ACCOUNT_INACTIVE')
      return res.status(403).json({ ok: false, message: error.message });
    return next(error);
  }
}

async function downloadReceipt(req, res, next) {
  try {
    const { requestId } = z.object({ requestId: z.string().min(1) }).parse(req.params);
    const { userId } = z.object({ userId: z.string().min(1) }).parse(req.query);

    await resolveUser(userId);

    const requestDoc = await SpecialCollectionRequest.findById(requestId).lean();
    if (!requestDoc)
      return res.status(404).json({ ok: false, message: 'Receipt not found.' });
    if (requestDoc.userId?.toString() !== userId)
      return res.status(403).json({ ok: false, message: 'Not authorised to download this receipt.' });

    const buffer = await generateSpecialCollectionReceipt({
      request: requestDoc,
      slot: requestDoc.slot,
      issuedAt: new Date(),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="special-collection-receipt-${requestId}.pdf"`,
    );
    return res.send(buffer);
  } catch (error) {
    if (error instanceof z.ZodError)
      return res.status(400).json({ ok: false, message: error.errors[0]?.message || 'Invalid request' });
    return next(error);
  }
}

module.exports = {
  getConfig,
  checkAvailability,
  confirmBooking,
  startCheckout,
  verifyCheckout,      // ✅ NEW
  handleRazorpayWebhook, // ✅ NEW
  listUserRequests,
  downloadReceipt,
};