// scripts/seedHYD.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { connectDB } = require('../backend/src/db/mongoose');
const City = require('../backend/src/models/City');
const WasteBin = require('../backend/src/models/WasteBin');
const User = require('../backend/src/models/User');
const WasteCollectionRecord = require('../backend/src/models/WasteCollectionRecord');
const Bill = require('../backend/src/models/Bill');
const PaymentTransaction = require('../backend/src/models/PaymentTransaction');

// ─── Hyderabad GHMC Zone Data ─────────────────────────────────────────────────

const CITIES = [
  {
    name: 'Secunderabad',
    code: 'SCB',
    depot: { lat: 17.4399, lon: 78.4983 },
    bbox: [[17.4100, 78.4700], [17.4700, 78.5300]],
    areaSqKm: 25.4,
    population: 520000,
    lastCollectionAt: new Date(Date.now() - 2 * 86_400_000),
    binCount: 20,
  },
  {
    name: 'Kukatpally',
    code: 'KKP',
    depot: { lat: 17.4849, lon: 78.4138 },
    bbox: [[17.4550, 78.3800], [17.5150, 78.4500]],
    areaSqKm: 32.1,
    population: 680000,
    lastCollectionAt: new Date(Date.now() - 1 * 86_400_000),
    binCount: 20,
  },
  {
    name: 'LB Nagar',
    code: 'LBN',
    depot: { lat: 17.3464, lon: 78.5524 },
    bbox: [[17.3150, 78.5200], [17.3800, 78.5850]],
    areaSqKm: 28.7,
    population: 610000,
    lastCollectionAt: new Date(Date.now() - 3 * 86_400_000),
    binCount: 20,
  },
  {
    name: 'Charminar',
    code: 'CHM',
    depot: { lat: 17.3616, lon: 78.4747 },
    bbox: [[17.3300, 78.4450], [17.3950, 78.5050]],
    areaSqKm: 19.3,
    population: 490000,
    lastCollectionAt: new Date(Date.now() - 2 * 86_400_000),
    binCount: 20,
  },
  {
    name: 'Serilingampally',
    code: 'SLP',
    depot: { lat: 17.4933, lon: 78.3260 },
    bbox: [[17.4600, 78.2900], [17.5250, 78.3600]],
    areaSqKm: 41.2,
    population: 590000,
    lastCollectionAt: new Date(Date.now() - 1 * 86_400_000),
    binCount: 20,
  },
  {
    name: 'Khairatabad',
    code: 'KHB',
    depot: { lat: 17.4126, lon: 78.4571 },
    bbox: [[17.3850, 78.4300], [17.4450, 78.4850]],
    areaSqKm: 22.8,
    population: 450000,
    lastCollectionAt: new Date(Date.now() - 1 * 86_400_000),
    binCount: 20,
  },
];

const WARD_NAMES = {
  SCB: ['Marredpally', 'Trimulgherry', 'Malkajgiri', 'Alwal', 'Kapra'],
  KKP: ['KPHB Colony', 'Balanagar', 'Moosapet', 'Nizampet', 'Bachupally'],
  LBN: ['Saroornagar', 'Vanasthalipuram', 'Hayathnagar', 'Boduppal', 'Nagole'],
  CHM: ['Falaknuma', 'Chandrayangutta', 'Santoshnagar', 'Rajendranagar', 'Golconda'],
  SLP: ['Madhapur', 'Gachibowli', 'Kondapur', 'Miyapur', 'Chandanagar'],
  KHB: ['Banjara Hills', 'Jubilee Hills', 'Panjagutta', 'Ameerpet', 'Begumpet'],
};

// ─── Bin Records ──────────────────────────────────────────────────────────────

const makeBinRecords = () => {
  let idx = 1;
  const records = [];
  for (const city of CITIES) {
    const [southWest, northEast] = city.bbox;
    const latSpan = Math.abs((northEast?.[0] ?? city.depot.lat) - (southWest?.[0] ?? city.depot.lat));
    const lonSpan = Math.abs((northEast?.[1] ?? city.depot.lon) - (southWest?.[1] ?? city.depot.lon));
    const wards = WARD_NAMES[city.code];

    for (let i = 0; i < (city.binCount || 20); i += 1) {
      const latBase = southWest?.[0] ?? city.depot.lat;
      const lonBase = southWest?.[1] ?? city.depot.lon;
      const lat = latBase + Math.random() * (latSpan || 0.02);
      const lon = lonBase + Math.random() * (lonSpan || 0.02);
      const ward = wards[i % wards.length];

      records.push({
        binId: `HYD-${city.code}-${String(idx).padStart(3, '0')}`,
        ward: city.name,
        city: city.name,
        area: ward,
        location: { lat, lon },
        capacityKg: 240 + Math.round(Math.random() * 80),
        lastPickupAt: new Date(Date.now() - (1 + Math.random() * 6) * 86_400_000),
        estRateKgPerDay: 6 + Math.random() * 6,
      });
      idx += 1;
    }
  }
  return records;
};

// ─── Collection Records ───────────────────────────────────────────────────────

const WASTE_TYPES = ['household', 'business', 'organic', 'recyclable'];
const BILLING_MODELS = ['weight-based', 'flat-fee', 'subscription'];

const makeCollectionRecords = () => {
  const today = new Date();
  const lookbackDays = 45;
  const records = [];

  for (const city of CITIES) {
    for (let dayOffset = 0; dayOffset < lookbackDays; dayOffset += 1) {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - dayOffset);

      const dailyHouseholds = Math.floor(8 + Math.random() * 6);
      for (let householdIndex = 0; householdIndex < dailyHouseholds; householdIndex += 1) {
        const wasteType = WASTE_TYPES[Math.floor(Math.random() * WASTE_TYPES.length)];
        const billingModel = BILLING_MODELS[Math.floor(Math.random() * BILLING_MODELS.length)];

        const baseWeight = wasteType === 'business'
          ? 120 + Math.random() * 60
          : 30 + Math.random() * 40;

        const recyclableRatio = wasteType === 'recyclable'
          ? 0.85
          : wasteType === 'organic'
            ? 0.35 + Math.random() * 0.15
            : 0.2 + Math.random() * 0.2;

        const recyclableKg = Number((baseWeight * recyclableRatio).toFixed(2));
        const nonRecyclableKg = Number((baseWeight - recyclableKg).toFixed(2));

        records.push({
          collectionDate: date,
          region: city.name,
          zone: `${city.name}-Zone-${1 + (householdIndex % 3)}`,
          householdId: `${city.code}-${String(householdIndex + 1).padStart(3, '0')}`,
          customerType: wasteType === 'business' ? 'business' : 'household',
          wasteType,
          billingModel,
          weightKg: Number(baseWeight.toFixed(2)),
          recyclableKg,
          nonRecyclableKg,
          recyclableRatio: Number((recyclableKg / Math.max(baseWeight, 1)).toFixed(2)),
        });
      }
    }
  }

  return records;
};

// ─── Main Seed ────────────────────────────────────────────────────────────────

(async () => {
  try {
    await connectDB();

    // Clear existing data
    await Promise.all([
      City.deleteMany({}),
      WasteBin.deleteMany({}),
      WasteCollectionRecord.deleteMany({}),
      Bill.deleteMany({}),
      PaymentTransaction.deleteMany({}),
    ]);

    // ── Users ──
    const ensureSeedUser = async ({ name, email, password, role }) => {
      const existing = await User.findOne({ email });
      if (existing) {
        let dirty = false;
        if (name && existing.name !== name) { existing.name = name; dirty = true; }
        if (role && existing.role !== role) { existing.role = role; dirty = true; }
        if (dirty) await existing.save();
        return existing;
      }
      const passwordHash = await User.hashPassword(password);
      return User.create({ name, email, passwordHash, role });
    };

    // ── ✅ YOUR PERSONAL EMAILS ──
    const [adminUser, collectorUser, residentUser] = await Promise.all([
      ensureSeedUser({
        name: 'Krishna',
        email: 'vamshikrishnamudi@gmail.com',        // Admin
        password: 'Pass@123',
        role: 'admin',
      }),
      ensureSeedUser({
        name: 'kez',
        email: 'kezevilie23@gmail.com',  // Collector
        password: 'Pass@123',
        role: 'regular',
      }),
      ensureSeedUser({
        name: 'Krishna',
        email: 'mudikrishnavamishi@gmail.com', // Resident
        password: 'Pass@123',
        role: 'regular',
      }),
    ]);
    console.log('✅ Ensured admin, collector, and resident users');

    // ── Cities / Zones ──
    await City.insertMany(CITIES.map(city => ({
      name: city.name,
      code: city.code,
      depot: city.depot,
      bbox: city.bbox,
      areaSqKm: city.areaSqKm,
      population: city.population,
      lastCollectionAt: city.lastCollectionAt,
    })));
    console.log(`✅ Seeded ${CITIES.length} GHMC zones`);

    // ── Bins ──
    const binDocs = makeBinRecords();
    await WasteBin.insertMany(binDocs);
    console.log(`✅ Seeded ${binDocs.length} bins across ${CITIES.length} zones`);

    // ── Collection Records ──
    const collectionDocs = makeCollectionRecords();
    await WasteCollectionRecord.insertMany(collectionDocs);
    console.log(`✅ Seeded ${collectionDocs.length} waste collection records`);

    // ── Bills (INR) ──
    const now = new Date();
    const toDate = days => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      return d;
    };

    const billingDocs = [
      {
        userId: residentUser._id,
        invoiceNumber: 'GHMC-2026-000',
        description: 'GHMC waste collection charge - January 2026',
        amount: 150,
        currency: 'INR',
        billingPeriodStart: toDate(-90),
        billingPeriodEnd: toDate(-60),
        generatedAt: toDate(-58),
        dueDate: toDate(-30),
        status: 'paid',
        paidAt: toDate(-28),
        paymentMethod: 'upi',
      },
      {
        userId: residentUser._id,
        invoiceNumber: 'GHMC-2026-001',
        description: 'GHMC waste collection charge - February 2026',
        amount: 150,
        currency: 'INR',
        billingPeriodStart: toDate(-60),
        billingPeriodEnd: toDate(-30),
        generatedAt: toDate(-28),
        dueDate: toDate(-5),
        status: 'unpaid',
      },
      {
        userId: residentUser._id,
        invoiceNumber: 'GHMC-2026-002',
        description: 'GHMC waste collection charge - March 2026',
        amount: 150,
        currency: 'INR',
        billingPeriodStart: toDate(-30),
        billingPeriodEnd: toDate(0),
        generatedAt: toDate(-2),
        dueDate: toDate(14),
        status: 'unpaid',
      },
      {
        userId: residentUser._id,
        invoiceNumber: 'GHMC-2026-SC-001',
        description: 'GHMC special collection - Bulk item pickup',
        amount: 850,
        currency: 'INR',
        billingPeriodStart: toDate(-5),
        billingPeriodEnd: toDate(0),
        generatedAt: toDate(-3),
        dueDate: toDate(10),
        status: 'unpaid',
      },
    ];

    const insertedBills = await Bill.insertMany(billingDocs);
    console.log(`✅ Seeded ${billingDocs.length} billing records (INR)`);

    // ── Payment Transaction ──
    const paidBill = insertedBills.find(doc => doc.status === 'paid');
    if (paidBill) {
      await PaymentTransaction.create({
        billId: paidBill._id,
        userId: paidBill.userId,
        amount: paidBill.amount,
        currency: paidBill.currency,
        status: 'success',
        paymentMethod: paidBill.paymentMethod || 'upi',
        stripeSessionId: 'seed-session',
        stripePaymentIntentId: 'seed-intent',
        receiptUrl: 'https://example.com/demo-receipt.pdf',
      });
      console.log('✅ Seeded payment transaction for paid invoice');
    }

    console.log('\n========================================');
    console.log('  Smart Waste Hyderabad seed complete!');
    console.log('========================================');
    console.log('\nYour login credentials:');
    console.log('  Admin     : vamshikrishnamudi@gmail.com   / Pass@123');
    console.log('  Collector : kezevilie23@gmail.com  / Pass@123');
    console.log('  Resident  : mudikrishnavamishi@gmail.com / Pass@123');
    console.log('\nData seeded:');
    console.log(`  Zones     : ${CITIES.length}`);
    console.log(`  Bins      : ${binDocs.length}`);
    console.log(`  Records   : ${collectionDocs.length}`);
    console.log(`  Bills     : ${billingDocs.length}`);
    console.log('========================================\n');

  } catch (e) {
    console.error('Seed failed:', e.message);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
})();