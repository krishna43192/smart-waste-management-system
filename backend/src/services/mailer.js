const nodemailer = require('nodemailer');

// Optional verbose logging for troubleshooting SMTP behaviour.
const debugMail = (...args) => {
  if (process.env.SMTP_DEBUG === 'true') {
    console.info('[mailer]', ...args);
  }
};

let transporter;

const DEFAULT_TIMEZONE = 'Asia/Colombo';
const DEFAULT_FROM = 'Smart Waste LK <no-reply@smartwaste.lk>';

const currencyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Shared formatter keeps all outbound timestamps localised consistently.
const toLocale = (input, options) => {
  const value = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(value.getTime())) {
    return null;
  }
  const baseOptions = { timeZone: DEFAULT_TIMEZONE, ...options };
  return value.toLocaleString('en-GB', baseOptions);
};

const toDateString = value => toLocale(value, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const toTimeString = value => toLocale(value, {
  hour: '2-digit',
  minute: '2-digit',
});

// Trims metadata values so they meet Stripe limits without mutating callers.
const sanitizeMetadata = metadata => {
  if (!metadata) {
    return undefined;
  }
  const entries = Object.entries(metadata)
    .filter(([, val]) => val !== undefined && val !== null)
    .map(([key, val]) => [key, String(val).slice(0, 500)]);
  return entries.length ? Object.fromEntries(entries) : undefined;
};

function formatCurrency(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return 'LKR 0.00';
  }
  return currencyFormatter.format(value);
}

// Lazily initialises the SMTP transporter so application boot stays fast.
function getTransporter() {
  if (transporter) {
    debugMail('Reusing existing transporter');
    return transporter;
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_KEY } = process.env;
  if (!SMTP_HOST) {
    debugMail('SMTP_HOST missing; mail transport disabled');
    return null;
  }

  const smtpPassword = SMTP_PASS || SMTP_KEY;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
    auth: SMTP_USER && smtpPassword ? { user: SMTP_USER, pass: smtpPassword } : undefined,
  });

  transporter.verify((verifyErr, success) => {
    if (verifyErr) {
      console.warn('⚠️ Mailer verification failed', verifyErr);
    } else if (success) {
      debugMail('SMTP transporter ready', { host: SMTP_HOST, port: SMTP_PORT });
    }
  });

  return transporter;
}

// Low-level helper used by all outbound emails in this service.
async function sendMail(message) {
  const mailClient = getTransporter();
  if (!mailClient) {
    console.info('📨 Mailer skipped (SMTP not configured)', {
      subject: message.subject,
      to: message.to,
    });
    return { sent: false, reason: 'not-configured' };
  }

  const envelope = {
    from: process.env.SMTP_FROM || DEFAULT_FROM,
    ...message,
  };

  debugMail('Sending email', {
    to: envelope.to,
    subject: envelope.subject,
  });

  try {
    const info = await mailClient.sendMail(envelope);
    debugMail('Email dispatch result', { messageId: info.messageId, to: envelope.to });
    return { sent: true, sentAt: new Date(), messageId: info.messageId };
  } catch (sendError) {
    console.error('🚨 Email send failed', {
      to: envelope.to,
      subject: envelope.subject,
      error: sendError.message,
    });
    return { sent: false, reason: 'send-error', error: sendError };
  }
}

// Sends residents a confirmation email, optionally attaching a receipt PDF.
async function sendSpecialCollectionConfirmation({ resident, slot, request, receipt }) {
  if (!resident?.email) {
    return { sent: false, reason: 'missing-recipient' };
  }

  debugMail('Queueing resident confirmation email', {
    to: resident.email,
    requestId: request._id?.toString() || request.id,
  });

  const isPaymentPending = request.paymentStatus === 'pending' && request.paymentRequired !== false;
  const paymentDueAt = request.paymentDueAt || slot.start;
  const formattedDueAt = toLocale(paymentDueAt);

  const subject = isPaymentPending
    ? `Special collection pending payment: ${toLocale(slot.start)}`
    : `Special collection confirmed: ${toLocale(slot.start)}`;
  const slotWindow = `${toLocale(slot.start)} - ${toLocale(slot.end)}`;
  const scheduledDate = toDateString(slot.start);
  const scheduledTime = toTimeString(slot.start);

  const subtotal = formatCurrency(request.paymentSubtotal || request.paymentAmount || 0);
  const extraCharge = formatCurrency(request.paymentWeightCharge || 0);
  const taxCharge = formatCurrency(request.paymentTaxCharge || 0);
  const totalCharge = formatCurrency(request.paymentAmount || 0);

  const text = [
    `Hello ${resident.name},`,
    '',
    isPaymentPending
      ? 'Your special waste collection booking is reserved and awaiting payment.'
      : 'Your special waste collection has been scheduled successfully.',
    receipt?.issuedAt
      ? `Receipt issued: ${toLocale(receipt.issuedAt)}`
      : null,
    isPaymentPending && formattedDueAt
      ? `Payment due by: ${formattedDueAt}`
      : null,
    '',
    'Pickup details:',
    `  Address: ${request.address}`,
    `  District: ${request.district}`,
    `  Phone: ${request.contactPhone}`,
    `  Email: ${request.contactEmail}`,
    `  Item type: ${request.itemLabel || request.itemType}`,
    `  Quantity: ${request.quantity}`,
    request.approxWeightKg ? `  Approx. weight per item: ${request.approxWeightKg} kg` : null,
    request.totalWeightKg ? `  Estimated total weight: ${request.totalWeightKg} kg` : null,
    `  Scheduled date: ${scheduledDate}`,
    `  Scheduled time: ${scheduledTime}`,
    '',
    isPaymentPending ? 'Payment due:' : 'Payment receipt:',
    `  Subtotal: ${subtotal}`,
    `  Extra charges: ${extraCharge}`,
    `  Tax: ${taxCharge}`,
    `${isPaymentPending ? '  Total due' : '  Total paid'}: ${totalCharge}`,
    isPaymentPending ? '  Status: awaiting payment' : null,
    '',
    isPaymentPending
      ? 'Please complete the payment before the scheduled slot. Bookings without payment will be cancelled automatically.'
      : 'If you need to make changes, contact the municipal hotline at 1919.',
    '',
    'Smart Waste LK operations team',
  ].filter(line => line !== null && line !== undefined).join('\n');

  const receiptIssuedHtml = receipt?.issuedAt
    ? `<p style="color:#475569;font-size:12px;">Receipt issued: ${toLocale(receipt.issuedAt)}</p>`
    : '';
  const paymentDueHtml = isPaymentPending && formattedDueAt
    ? `<p style="color:#dc2626;font-size:13px;"><strong>Payment due by:</strong> ${formattedDueAt}</p>`
    : '';

  const html = `<p>Hello ${resident.name},</p>
  <p>${isPaymentPending
    ? 'Your special waste collection booking is reserved and awaiting payment.'
    : 'Your special waste collection has been scheduled successfully.'}</p>
  ${receiptIssuedHtml}
  ${paymentDueHtml}
  <h3>Pickup details</h3>
  <ul>
    <li><strong>Address:</strong> ${request.address}</li>
    <li><strong>District:</strong> ${request.district}</li>
    <li><strong>Phone:</strong> ${request.contactPhone}</li>
    <li><strong>Email:</strong> ${request.contactEmail}</li>
    <li><strong>Item type:</strong> ${request.itemLabel || request.itemType}</li>
    <li><strong>Quantity:</strong> ${request.quantity}</li>
    ${request.approxWeightKg ? `<li><strong>Approx. weight per item:</strong> ${request.approxWeightKg} kg</li>` : ''}
    ${request.totalWeightKg ? `<li><strong>Estimated total weight:</strong> ${request.totalWeightKg} kg</li>` : ''}
    <li><strong>Scheduled date:</strong> ${scheduledDate} (${slotWindow})</li>
  </ul>
  <h3>${isPaymentPending ? 'Payment due' : 'Payment receipt'}</h3>
  <table style="border-collapse: collapse;">
    <tbody>
      <tr>
        <td style="padding: 4px 12px 4px 0;">Subtotal</td>
        <td style="padding: 4px 0; font-weight: 600;">${subtotal}</td>
      </tr>
      <tr>
        <td style="padding: 4px 12px 4px 0;">Extra charges</td>
        <td style="padding: 4px 0; font-weight: 600;">${extraCharge}</td>
      </tr>
      <tr>
        <td style="padding: 4px 12px 4px 0;">Tax</td>
        <td style="padding: 4px 0; font-weight: 600;">${taxCharge}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px 4px 0; font-weight: 700;">${isPaymentPending ? 'Total due' : 'Total paid'}</td>
        <td style="padding: 8px 0; font-weight: 700;">${totalCharge}</td>
      </tr>
      ${isPaymentPending ? '<tr><td style="padding:4px 12px 4px 0;">Status</td><td style="padding:4px 0; font-weight:600; color:#dc2626;">Awaiting payment</td></tr>' : ''}
    </tbody>
  </table>
  <p>${isPaymentPending
    ? 'Please complete the payment before the scheduled slot. Bookings without payment will be cancelled automatically.'
    : 'If you need to make changes, contact the municipal hotline at 1919.'}</p>
  <p>Smart Waste LK operations team</p>`;

  const attachments = receipt?.buffer
    ? [
        {
          filename: receipt.filename || `special-collection-receipt-${request._id || request.id || 'booking'}.pdf`,
          content: receipt.buffer,
          contentType: 'application/pdf',
        },
      ]
    : undefined;

  return sendMail({ to: resident.email, subject, text, html, attachments });
}

// Notifies municipal operations when a new special collection is scheduled.
async function notifyAuthorityOfSpecialPickup({ request, slot }) {
  const authorityEmail = process.env.COLLECTION_AUTHORITY_EMAIL;
  if (!authorityEmail) {
    console.info('📨 Authority notification skipped (COLLECTION_AUTHORITY_EMAIL not set)', {
      requestId: request._id?.toString(),
    });
    return { sent: false, reason: 'not-configured' };
  }

  debugMail('Queueing authority notification', { to: authorityEmail, requestId: request._id?.toString() });

  const subject = `New special pickup scheduled (${request.itemType}, ${request.quantity})`;
  const slotWindow = `${toLocale(slot.start)} - ${toLocale(slot.end)}`;

  const text = [
    'Special pickup confirmed:',
    `Resident: ${request.userName} (${request.userEmail})`,
    `Item type: ${request.itemType} (qty ${request.quantity})`,
    `Window: ${slotWindow}`,
    `Payment: ${request.paymentRequired ? `Collected LKR ${request.paymentAmount}` : 'Not required'}`,
  ].join('\n');

  const html = `<p>Special pickup confirmed:</p>
  <ul>
    <li><strong>Resident:</strong> ${request.userName} (${request.userEmail})</li>
    <li><strong>Item type:</strong> ${request.itemType} (qty ${request.quantity})</li>
    <li><strong>Window:</strong> ${slotWindow}</li>
    <li><strong>Payment:</strong> ${request.paymentRequired ? `Collected LKR ${request.paymentAmount}` : 'Not required'}</li>
  </ul>`;

  return sendMail({ to: authorityEmail, subject, text, html });
}

// Issues a billing confirmation once Stripe marks a payment as successful.
async function sendPaymentReceipt({ resident, bill, transaction }) {
  if (!resident?.email) {
    return { sent: false, reason: 'missing-recipient' };
  }

  debugMail('Queueing payment receipt email', {
    to: resident.email,
    billId: bill._id?.toString() || bill.id,
    transactionId: transaction._id?.toString() || transaction.id,
  });

  const subject = `Payment received for ${bill.invoiceNumber}`;
  const amount = transaction.amount?.toLocaleString('en-LK', { style: 'currency', currency: bill.currency || 'LKR' });
  const paidAt = transaction.updatedAt || new Date();
  const paidAtFormatted = toLocale(paidAt);

  const receiptLink = transaction.receiptUrl ? `You can download the payment receipt here: ${transaction.receiptUrl}` : 'A receipt is available in the Smart Waste LK portal.';

  const text = [
    `Hello ${resident.name},`,
    '',
    `We received your payment of ${amount} for invoice ${bill.invoiceNumber}.`,
    `Payment reference: ${transaction.stripePaymentIntentId || transaction.stripeSessionId}`,
    `Paid on: ${paidAtFormatted}`,
    '',
    receiptLink,
    '',
    'Thank you for keeping your waste services up to date.',
    '',
    'Smart Waste LK billing office',
  ].join('\n');

  const html = `<p>Hello ${resident.name},</p>
  <p>We received your payment of <strong>${amount}</strong> for invoice <strong>${bill.invoiceNumber}</strong>.</p>
  <ul>
    <li><strong>Payment reference:</strong> ${transaction.stripePaymentIntentId || transaction.stripeSessionId}</li>
    <li><strong>Paid on:</strong> ${paidAtFormatted}</li>
  </ul>
  <p>${transaction.receiptUrl ? `<a href="${transaction.receiptUrl}">Download your receipt</a>` : 'A receipt is available in the Smart Waste LK portal.'}</p>
  <p>Thank you for keeping your waste services up to date.</p>
  <p>Smart Waste LK billing office</p>`;

  return sendMail({ to: resident.email, subject, text, html });
}

module.exports = {
  sendMail,
  sendSpecialCollectionConfirmation,
  notifyAuthorityOfSpecialPickup,
  sendPaymentReceipt,
  sanitizeMetadata,
};
