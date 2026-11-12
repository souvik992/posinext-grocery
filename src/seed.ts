// Seeds: seedDemo is the test fixture (a small QSR menu kept from Tiffin POS: the tests rely on it); seedGrocery is the
// grocery demo shop for npm run seed. NOT for production (PINs are public).
import { createCtx } from './services/ctx.ts';
import type { Actor } from './services/ctx.ts';
import { setupFirstRun, createUser } from './services/auth.ts';
import { createCategory, createItem, createModifierGroup, createTaxGroup, setItemModifierGroups } from './services/catalog.ts';
import { createPrinter } from './services/printing/jobs.ts';
import { createStation } from './services/stations.ts';
import { all } from './store/db.ts';
import { pathToFileURL } from 'node:url';
import { makeEan13 } from './core/barcode.ts';
import { addScanCode } from './services/products.ts';
import { createSupplier } from './services/purchasing.ts';
import { addOpeningStock } from './services/inventory.ts';
import { saveCustomer } from './services/customers.ts';
import type { Ctx } from './services/ctx.ts';

export function seedDemo(ctx: Ctx) {
  let n = 0;
  const rid = () => `seed-${String(++n).padStart(5, '0')}`;
  const { ownerId } = setupFirstRun(ctx, rid(), {
    outlet: { name: 'Demo Burger Hub', gstin: '29ABCDE1234F1Z5', fssaiNo: '11223344556677', stateCode: '29', address: '12 MG Road, Bengaluru', phone: '9876543210' },
    device: { name: 'Counter 1', seriesPrefix: 'A1' },
    owner: { name: 'Owner', pin: '1234', mobile: '9000000001' },
  });
  const owner: Actor = { userId: ownerId, role: 'owner', name: 'Owner' };
  createUser(ctx, owner, rid(), { name: 'Manager', role: 'manager', pin: '2345', mobile: '9000000002' });
  createUser(ctx, owner, rid(), { name: 'Cashier', role: 'cashier', pin: '1111', mobile: '9000000003' });
  // the fixture's items use the pre-GST-2.0 12% slab; new shops start with 0/5/18/40
  if (!all(ctx.db, 'SELECT 1 FROM tax_group WHERE rate_bp = 1200').length) createTaxGroup(ctx, owner, rid(), { name: 'GST 12%', rateBp: 1200 });
  const tg = Object.fromEntries(all<{ id: string; rate_bp: number }>(ctx.db, 'SELECT id, rate_bp FROM tax_group').map((t) => [t.rate_bp, t.id]));
  const cats: Record<string, string> = {};
  const kitchen = createStation(ctx, owner, rid(), { name: 'Kitchen' }).id, bar = createStation(ctx, owner, rid(), { name: 'Bar' }).id;
  for (const [name, station] of [['Burgers', kitchen], ['Wraps', kitchen], ['Sides', kitchen], ['Beverages', bar], ['Desserts', bar]] as const) {
    cats[name] = createCategory(ctx, owner, rid(), { name, prepStationId: station }).id;
  }
  const items: Array<[string, string, number, number, string?]> = [
    ['Classic Veg Burger', 'Burgers', 9900, 500], ['Cheese Burger', 'Burgers', 12900, 500], ['Chicken Burger', 'Burgers', 14900, 500], ['Double Patty Burger', 'Burgers', 19900, 500],
    ['Paneer Wrap', 'Wraps', 12900, 500], ['Chicken Wrap', 'Wraps', 14900, 500], ['French Fries', 'Sides', 7900, 500], ['Peri Peri Fries', 'Sides', 9900, 500],
    ['Onion Rings', 'Sides', 8900, 500], ['Cola 300ml', 'Beverages', 4000, 1200, '8901234567890'], ['Cold Coffee', 'Beverages', 11900, 500], ['Masala Chai', 'Beverages', 4900, 500],
    ['Lemon Soda', 'Beverages', 5900, 500], ['Brownie', 'Desserts', 8900, 1800], ['Ice Cream Scoop', 'Desserts', 6900, 1800], ['Water Bottle 1L', 'Beverages', 2000, 0, '8909876543210'],
  ];
  const ids: Record<string, string> = {};
  for (const [name, cat, price, bp, barcode] of items) {
    ids[name] = createItem(ctx, owner, rid(), { name, categoryId: cats[cat]!, price, taxGroupId: tg[bp]!, barcode: barcode ?? null, unit: 'pcs', isVeg: !/Chicken/.test(name) }).id;
  }
  const extras = createModifierGroup(ctx, owner, rid(), { name: 'Add-ons', minSelect: 0, maxSelect: 3, modifiers: [{ name: 'Extra cheese', price: 2000 }, { name: 'Extra patty', price: 4000 }, { name: 'Jalapenos', price: 1000 }] });
  for (const n2 of ['Classic Veg Burger', 'Cheese Burger', 'Chicken Burger', 'Double Patty Burger']) setItemModifierGroups(ctx, owner, rid(), ids[n2]!, [extras.id]);
  createPrinter(ctx, owner, rid(), { name: 'Counter receipt (virtual)', transport: 'memory', widthMm: 80, isReceipt: true, drawer: true });
  createPrinter(ctx, owner, rid(), { name: 'Kitchen (virtual)', transport: 'memory', widthMm: 80, stations: [kitchen, bar] });
  return { owner };
}

/** The grocery demo shop: staples (loose by weight with scale PLUs, and packed), dairy and biscuits by batch with
 * expiry, personal care, a cold drink at 40%; opening stock, a supplier, a khata customer, a receipt and a label
 * printer. Tax rates follow GST 2.0 as understood for demo purposes only: check rates with your CA. */
export function seedGrocery(ctx: Ctx) {
  let n = 0;
  const rid = () => `grocery-seed-${String(++n).padStart(5, '0')}`;
  const { ownerId } = setupFirstRun(ctx, rid(), {
    outlet: { name: 'Sri Lakshmi Supermarket', gstin: null, fssaiNo: '21226010000123', stateCode: '29', address: '14 3rd Cross, Jayanagar, Bengaluru 560011', phone: '9845000123' },
    device: { name: 'Counter 1', seriesPrefix: 'S1' },
    owner: { name: 'Owner', pin: '1234', mobile: '9000000001' },
  });
  const owner: Actor = { userId: ownerId, role: 'owner', name: 'Owner' };
  createUser(ctx, owner, rid(), { name: 'Manager', role: 'manager', pin: '2345', mobile: '9000000002' });
  createUser(ctx, owner, rid(), { name: 'Cashier', role: 'cashier', pin: '1111', mobile: '9000000003' });
  const tg = Object.fromEntries(all<{ id: string; rate_bp: number }>(ctx.db, 'SELECT id, rate_bp FROM tax_group').map((t) => [t.rate_bp, t.id]));
  const cats: Record<string, string> = {};
  for (const name of ['Staples', 'Pulses', 'Oils & Ghee', 'Spices', 'Dairy', 'Snacks & Biscuits', 'Beverages', 'Personal Care', 'Household']) cats[name] = createCategory(ctx, owner, rid(), { name }).id;
  let code = 100;
  const ean = () => makeEan13(`8907001${String(code++).padStart(5, '0')}`);
  // name, category, price, mrp, gst bp, hsn, uqc, extra
  type Row = [string, string, number, number | null, number, string, string, Record<string, unknown>?];
  const rows: Row[] = [
    ['Sona Masoori Rice Loose', 'Staples', 6200, null, 0, '10063020', 'KGS', { isWeighed: true, plu: '101' }],
    ['Toor Dal Loose', 'Pulses', 14800, null, 0, '07136000', 'KGS', { isWeighed: true, plu: '102' }],
    ['Sugar Loose', 'Staples', 4600, null, 500, '17019990', 'KGS', { isWeighed: true, plu: '103' }],
    ['Basmati Rice 5kg', 'Staples', 59900, 64500, 500, '10063020', 'PCS'],
    ['Whole Wheat Atta 10kg', 'Staples', 46500, 49900, 500, '11010000', 'PCS'],
    ['Moong Dal 1kg', 'Pulses', 15900, 16800, 500, '07133100', 'PCS'],
    ['Sunflower Oil 1L', 'Oils & Ghee', 15500, 16500, 500, '15121110', 'LTR'],
    ['Cow Ghee 500ml', 'Oils & Ghee', 33500, 34500, 500, '04059020', 'PCS', { batchTracked: true }],
    ['Turmeric Powder 200g', 'Spices', 6900, 7500, 500, '09103030', 'PCS'],
    ['Garam Masala 100g', 'Spices', 8500, 9000, 500, '09109100', 'PCS'],
    ['Toned Milk 500ml', 'Dairy', 2800, 2800, 0, '04012000', 'PCS', { batchTracked: true }],
    ['Paneer 200g', 'Dairy', 9000, 9500, 0, '04061000', 'PCS', { batchTracked: true }],
    ['Curd 400g', 'Dairy', 4000, 4000, 500, '04039010', 'PCS', { batchTracked: true }],
    ['Marie Biscuit 250g', 'Snacks & Biscuits', 3000, 3000, 500, '19053100', 'PCS', { batchTracked: true }],
    ['Potato Chips 52g', 'Snacks & Biscuits', 2000, 2000, 500, '20052000', 'PCS'],
    ['Tea 250g', 'Beverages', 14000, 15000, 500, '09024020', 'PCS'],
    ['Cola 750ml', 'Beverages', 4000, 4000, 4000, '22021010', 'PCS'],
    ['Bath Soap 100g (pack of 4)', 'Personal Care', 15600, 16800, 500, '34011190', 'PCS'],
    ['Toothpaste 150g', 'Personal Care', 9900, 10500, 500, '33061020', 'PCS'],
    ['Dishwash Bar 200g', 'Household', 2000, 2000, 1800, '34022090', 'PCS'],
    ['Detergent Powder 1kg', 'Household', 12500, 13500, 1800, '34022090', 'PCS'],
  ];
  const ids: Record<string, string> = {};
  for (const [name, cat, price, mrp, bp, hsn, uqc, extra] of rows) {
    const weighed = extra?.isWeighed === true;
    ids[name] = createItem(ctx, owner, rid(), {
      name, categoryId: cats[cat]!, price, mrp, taxGroupId: tg[bp]!, hsnCode: hsn, uqc, unit: uqc === 'KGS' ? 'kg' : uqc === 'LTR' ? 'l' : 'pcs',
      barcode: weighed ? null : ean(), purchasePrice: Math.round(price * 0.86), reorderLevelMilli: 5000, ...(extra ?? {}),
    }).id;
  }
  // a case barcode: 12 litres of oil in one scan
  addScanCode(ctx, owner, rid(), ids['Sunflower Oil 1L']!, { code: ean(), packQtyMilli: 12000 });
  createSupplier(ctx, owner, rid(), { name: 'Jayanagar Wholesale Traders', stateCode: '29', mobile: '9845011122' });
  const plain = rows.filter((r) => r[7]?.batchTracked !== true).map((r) => ({ itemId: ids[r[0]]!, qtyMilli: r[6] === 'KGS' ? 50000 : 24000, unitCost: Math.round(r[2] * 0.86) }));
  const batched = [
    { itemId: ids['Cow Ghee 500ml']!, qtyMilli: 12000, batch: { batchNo: 'GH2610', expiryDate: '2027-04-30', mrp: 34500 } },
    { itemId: ids['Toned Milk 500ml']!, qtyMilli: 40000, batch: { batchNo: 'TM1112', expiryDate: '2026-11-14', mrp: 2800 } },
    { itemId: ids['Paneer 200g']!, qtyMilli: 10000, batch: { batchNo: 'PN1110', expiryDate: '2026-11-17', mrp: 9500 } },
    { itemId: ids['Curd 400g']!, qtyMilli: 15000, batch: { batchNo: 'CD1111', expiryDate: '2026-11-18', mrp: 4000 } },
    { itemId: ids['Marie Biscuit 250g']!, qtyMilli: 6000, batch: { batchNo: 'MB0826', expiryDate: '2027-02-28', mrp: 2800 } }, // older pack at a lower MRP
    { itemId: ids['Marie Biscuit 250g']!, qtyMilli: 30000, batch: { batchNo: 'MB1026', expiryDate: '2027-04-30', mrp: 3000 } },
  ];
  addOpeningStock(ctx, owner, rid(), [...plain, ...batched]);
  saveCustomer(ctx, owner, rid(), { mobile: '9886012345', name: 'Mrs Lakshmi Rao', creditLimit: 500000, creditDays: 30 });
  createPrinter(ctx, owner, rid(), { name: 'Counter receipt (virtual)', transport: 'memory', widthMm: 80, isReceipt: true, drawer: true });
  const label = createPrinter(ctx, owner, rid(), { name: 'Label printer (virtual)', transport: 'memory', widthMm: 80 }).id;
  ctx.db.prepare("UPDATE printer SET label_lang = 'tspl', label_w_mm = 50, label_h_mm = 25 WHERE id = ?").run(label);
  return { owner, items: ids };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ctx = createCtx({ dataDir: process.env.POS_DATA_DIR ?? './data', scryptCost: 4096 });
  seedGrocery(ctx);
  console.log('Seeded the grocery demo shop. Users: Owner/1234, Manager/2345, Cashier/1111 (development only).');
}
