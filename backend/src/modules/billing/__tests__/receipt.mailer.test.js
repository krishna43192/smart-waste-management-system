// Unit tests for sendPaymentReceipt mailer formatting and safe behavior without SMTP
const { sendPaymentReceipt } = require('../../../services/mailer');

describe('Mailer: sendPaymentReceipt', () => {
	const resident = { name: 'Ada', email: 'ada@example.com' };
	const bill = { invoiceNumber: 'INV-001', currency: 'LKR' };
	const transaction = { amount: 2500, updatedAt: new Date('2025-01-01T10:00:00Z'), stripePaymentIntentId: 'pi_x' };

	test('returns not-configured when SMTP not set', async () => {
		const original = { ...process.env };
		delete process.env.SMTP_HOST;
		const result = await sendPaymentReceipt({ resident, bill, transaction });
		expect(result.sent).toBe(false);
		process.env = original;
	});
});
