const PDFDocument = require('pdfkit');

const DEFAULT_TIMEZONE = 'Asia/Colombo';

// Keeps currency rendering consistent with the resident-facing emails and UI.
const currencyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Defensive date formatter used across receipt fields.
const toLocale = (value, options) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString('en-GB', { timeZone: DEFAULT_TIMEZONE, ...options });
};

function formatCurrency(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return currencyFormatter.format(0);
  }
  return currencyFormatter.format(value);
}

function toLocalDate(value) {
  return toLocale(value, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }) || '—';
}

function toLocalTime(value) {
  return toLocale(value, {
    hour: '2-digit',
    minute: '2-digit',
  }) || '—';
}

function toIssuedTimestamp(value) {
  return toLocale(value, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function writeKeyValue(doc, label, value, options = {}) {
  if (!value) {
    return;
  }
  const { bold = false } = options;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1f2937').text(label, { continued: true });
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#111827').text(` ${value}`);
}

// Produces a brand-aligned receipt PDF for special collections.
async function generateSpecialCollectionReceipt({ request, slot, issuedAt = new Date() }) {
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks = [];

  // Establishes consistent formatting helpers to keep the PDF output legible.
  const ensureNumber = input => (Number.isFinite(Number(input)) ? Number(input) : null);

  const reference = request._id?.toString?.() || request.id || 'N/A';
  const company = {
    name: 'Smart Waste LK',
    tagline: 'Municipal Special Collection Services',
    address: 'Municipal Council Complex, Colombo 07',
    hotline: 'Hotline: 1919',
    email: 'support@smartwaste.lk',
  };

  doc.on('data', chunk => chunks.push(chunk));

  const completePromise = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc
    .rect(doc.page.margins.left, doc.page.margins.top, doc.page.width - doc.page.margins.left - doc.page.margins.right, 80)
    .fill('#f8fafc');

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(22).text(company.name, doc.page.margins.left + 16, doc.page.margins.top + 20);
  doc.font('Helvetica').fontSize(11).fillColor('#1f2937').text(company.tagline);
  doc.moveDown(0.5);
  doc.fontSize(9).text(company.address);
  doc.text(company.hotline);
  doc.text(company.email);

  doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text('Special Collection Receipt');
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(10).fillColor('#1f2937').text(`Receipt reference: ${reference}`);
  doc.font('Helvetica').text(`Issued on: ${toIssuedTimestamp(issuedAt)}`);

  doc.moveDown(1.5);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Service details');
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(10).fillColor('#1f2937');
  doc.text(`Address: ${request.address || '—'}`);
  doc.text(`District: ${request.district || '—'}`);
  doc.text(`Phone: ${request.contactPhone || '—'}`);
  doc.text(`Email: ${request.contactEmail || '—'}`);
  doc.text(`Resident: ${request.residentName || request.userName || '—'}`);
  doc.text(`Owner: ${request.ownerName || '—'}`);
  doc.text(`Item type: ${request.itemLabel || request.itemType || '—'}`);
  doc.text(`Quantity: ${request.quantity ?? '—'}`);
  const approxWeight = ensureNumber(request.approxWeightKg);
  if (approxWeight !== null) {
    doc.text(`Approx. weight per item: ${approxWeight.toFixed(1)} kg`);
  }
  const totalWeight = ensureNumber(request.totalWeightKg);
  if (totalWeight !== null) {
    doc.text(`Estimated total weight: ${totalWeight.toFixed(1)} kg`);
  }
  doc.text(`Scheduled date: ${toLocalDate(slot?.start)}`);
  doc.text(`Scheduled time: ${toLocalTime(slot?.start)} - ${toLocalTime(slot?.end)}`);

  doc.moveDown(1.5);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Payment summary');
  doc.moveDown(0.5);

  const tableStart = doc.y;
  const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const rowHeight = 22;
  const rows = [
    { label: 'Subtotal', value: formatCurrency(request.paymentSubtotal ?? request.paymentAmount ?? 0) },
    { label: 'Extra charges', value: formatCurrency(request.paymentWeightCharge ?? 0) },
    { label: 'Tax', value: formatCurrency(request.paymentTaxCharge ?? 0) },
    { label: 'Total paid', value: formatCurrency(request.paymentAmount ?? 0), bold: true },
  ];

  doc.lineWidth(0.5).strokeColor('#cbd5f5').rect(doc.page.margins.left, tableStart, tableWidth, rowHeight * rows.length).stroke();

  rows.forEach((row, index) => {
    const y = tableStart + index * rowHeight + 6;
    if (index < rows.length - 1) {
      doc
        .moveTo(doc.page.margins.left, tableStart + (index + 1) * rowHeight)
        .lineTo(doc.page.margins.left + tableWidth, tableStart + (index + 1) * rowHeight)
        .stroke('#e2e8f0');
    }
    doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor('#1f2937').text(row.label, doc.page.margins.left + 8, y);
    doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').text(row.value, doc.page.margins.left + tableWidth - 160, y, { width: 150, align: 'right' });
  });

  doc.moveDown(3);
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#475569').text('Thank you for keeping our city clean. Please retain this receipt for your records.');

  doc.end();

  return completePromise;
}

module.exports = {
  generateSpecialCollectionReceipt,
};
