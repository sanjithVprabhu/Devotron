// Seed sample catalog items for Acme Auto Parts so the agent has stock to recommend.
// Idempotent: re-running this only inserts items whose item_id isn't already present.
//
// Reads MONGO_URL + MONGO_DB_PREFIX from the environment. Writes to
// `<prefix><tenant_id>.catalog_items` — one Mongo db per tenant.

import { MongoClient } from 'mongodb';

const TENANT_ID = '11111111-1111-1111-1111-111111111111'; // Acme — must match db/src/scripts/seed.ts

interface PartData {
  name: string;
  brand: string;
  part_type: string;
  sub_type: string;
  oem_numbers: string[];
  compatible_vehicles: Array<{
    make: string;
    model: string;
    year_from: number;
    year_to: number;
    fuel: string;
  }>;
  price_inr: number;
  mrp_inr: number;
  gst_rate: number;
  stock_qty: number;
  warranty_months: number;
}

interface SeedItem {
  item_id: string;
  data: PartData;
}

const ITEMS: SeedItem[] = [
  {
    item_id: 'SKU-BOSCH-FRT-DZIRE',
    data: {
      name: 'Bosch Front Brake Pad Set — Swift Dzire',
      brand: 'Bosch',
      part_type: 'brake_pad',
      sub_type: 'front',
      oem_numbers: ['55810-84E01', 'GDB3397'],
      compatible_vehicles: [
        { make: 'Maruti Suzuki', model: 'Swift Dzire', year_from: 2012, year_to: 2017, fuel: 'petrol' },
        { make: 'Maruti Suzuki', model: 'Swift Dzire', year_from: 2017, year_to: 2024, fuel: 'petrol' },
      ],
      price_inr: 1200,
      mrp_inr: 1450,
      gst_rate: 18,
      stock_qty: 14,
      warranty_months: 6,
    },
  },
  {
    item_id: 'SKU-BOSCH-RR-DZIRE',
    data: {
      name: 'Bosch Rear Brake Shoe — Swift Dzire',
      brand: 'Bosch',
      part_type: 'brake_shoe',
      sub_type: 'rear',
      oem_numbers: ['58305-1G300'],
      compatible_vehicles: [
        { make: 'Maruti Suzuki', model: 'Swift Dzire', year_from: 2012, year_to: 2024, fuel: 'petrol' },
      ],
      price_inr: 850,
      mrp_inr: 1000,
      gst_rate: 18,
      stock_qty: 9,
      warranty_months: 6,
    },
  },
  {
    item_id: 'SKU-BREMBO-FRT-DZIRE',
    data: {
      name: 'Brembo Front Brake Pad — Swift Dzire',
      brand: 'Brembo',
      part_type: 'brake_pad',
      sub_type: 'front',
      oem_numbers: ['P83085'],
      compatible_vehicles: [
        { make: 'Maruti Suzuki', model: 'Swift Dzire', year_from: 2012, year_to: 2024, fuel: 'petrol' },
      ],
      price_inr: 1900,
      mrp_inr: 2400,
      gst_rate: 18,
      stock_qty: 4,
      warranty_months: 12,
    },
  },
  {
    item_id: 'SKU-ROULUNDS-FRT-DZIRE',
    data: {
      name: 'Roulunds Front Brake Pad — Swift Dzire',
      brand: 'Roulunds',
      part_type: 'brake_pad',
      sub_type: 'front',
      oem_numbers: ['RBR-5104'],
      compatible_vehicles: [
        { make: 'Maruti Suzuki', model: 'Swift Dzire', year_from: 2012, year_to: 2022, fuel: 'petrol' },
      ],
      price_inr: 980,
      mrp_inr: 1200,
      gst_rate: 18,
      stock_qty: 0,
      warranty_months: 6,
    },
  },
  {
    item_id: 'SKU-BOSCH-ALT-DZIRE',
    data: {
      name: 'Bosch Alternator — Swift Dzire 1.2L Petrol',
      brand: 'Bosch',
      part_type: 'alternator',
      sub_type: 'standard',
      oem_numbers: ['0986AN0654'],
      compatible_vehicles: [
        { make: 'Maruti Suzuki', model: 'Swift Dzire', year_from: 2017, year_to: 2024, fuel: 'petrol' },
      ],
      price_inr: 7500,
      mrp_inr: 9200,
      gst_rate: 18,
      stock_qty: 3,
      warranty_months: 12,
    },
  },
  {
    item_id: 'SKU-MINDA-HORN-DZIRE',
    data: {
      name: 'Minda Twin-Tone Horn Set',
      brand: 'Minda',
      part_type: 'horn',
      sub_type: 'twin-tone',
      oem_numbers: ['MD-TT-12V'],
      compatible_vehicles: [
        { make: 'Maruti Suzuki', model: 'Swift Dzire', year_from: 2012, year_to: 2024, fuel: 'petrol' },
        { make: 'Hyundai', model: 'i20', year_from: 2014, year_to: 2024, fuel: 'petrol' },
      ],
      price_inr: 650,
      mrp_inr: 800,
      gst_rate: 18,
      stock_qty: 22,
      warranty_months: 6,
    },
  },
  {
    item_id: 'SKU-LUMAX-HEADLAMP-I20',
    data: {
      name: 'Lumax Headlamp Assembly — Hyundai i20 (LH)',
      brand: 'Lumax',
      part_type: 'headlamp',
      sub_type: 'left',
      oem_numbers: ['92101-C7000'],
      compatible_vehicles: [
        { make: 'Hyundai', model: 'i20', year_from: 2014, year_to: 2020, fuel: 'petrol' },
      ],
      price_inr: 4200,
      mrp_inr: 5500,
      gst_rate: 18,
      stock_qty: 2,
      warranty_months: 6,
    },
  },
  {
    item_id: 'SKU-BOSCH-AC-FILTER-DZIRE',
    data: {
      name: 'Bosch AC Cabin Filter — Swift Dzire',
      brand: 'Bosch',
      part_type: 'filter',
      sub_type: 'ac_cabin',
      oem_numbers: ['F026400172'],
      compatible_vehicles: [
        { make: 'Maruti Suzuki', model: 'Swift Dzire', year_from: 2012, year_to: 2024, fuel: 'petrol' },
      ],
      price_inr: 350,
      mrp_inr: 420,
      gst_rate: 18,
      stock_qty: 30,
      warranty_months: 0,
    },
  },
  {
    item_id: 'SKU-BOSCH-OIL-FILTER-DZIRE',
    data: {
      name: 'Bosch Oil Filter — Swift Dzire 1.2L',
      brand: 'Bosch',
      part_type: 'filter',
      sub_type: 'oil',
      oem_numbers: ['0451103316', '16510-84E10'],
      compatible_vehicles: [
        { make: 'Maruti Suzuki', model: 'Swift Dzire', year_from: 2012, year_to: 2024, fuel: 'petrol' },
        { make: 'Maruti Suzuki', model: 'Swift', year_from: 2012, year_to: 2024, fuel: 'petrol' },
        { make: 'Maruti Suzuki', model: 'Baleno', year_from: 2015, year_to: 2024, fuel: 'petrol' },
      ],
      price_inr: 280,
      mrp_inr: 350,
      gst_rate: 18,
      stock_qty: 45,
      warranty_months: 0,
    },
  },
  {
    item_id: 'SKU-BREMBO-FRT-CRETA',
    data: {
      name: 'Brembo Front Brake Pad — Hyundai Creta',
      brand: 'Brembo',
      part_type: 'brake_pad',
      sub_type: 'front',
      oem_numbers: ['P30087'],
      compatible_vehicles: [
        { make: 'Hyundai', model: 'Creta', year_from: 2015, year_to: 2024, fuel: 'petrol' },
        { make: 'Hyundai', model: 'Creta', year_from: 2015, year_to: 2024, fuel: 'diesel' },
      ],
      price_inr: 2200,
      mrp_inr: 2800,
      gst_rate: 18,
      stock_qty: 6,
      warranty_months: 12,
    },
  },
];

async function main() {
  const url = process.env.MONGO_URL;
  if (!url) {
    console.error('MONGO_URL is required (export it or source .env first)');
    process.exit(1);
  }
  const dbPrefix = process.env.MONGO_DB_PREFIX ?? 'veda_tenant_';
  const client = new MongoClient(url);
  try {
    await client.connect();
    const db = client.db(`${dbPrefix}${TENANT_ID}`);
    const col = db.collection('catalog_items');
    await col.createIndex({ item_id: 1 }, { unique: true }).catch(() => undefined);
    await col.createIndex({ status: 1 }).catch(() => undefined);
    await col.createIndex({ search_text: 'text' }).catch(() => undefined);

    let inserted = 0;
    let skipped = 0;
    const now = new Date();
    for (const it of ITEMS) {
      const search_text = [
        it.data.name,
        it.data.brand,
        it.data.part_type,
        it.data.sub_type,
        ...it.data.oem_numbers,
        ...it.data.compatible_vehicles.flatMap((v) => [v.make, v.model]),
      ]
        .join(' ')
        .toLowerCase();

      const result = await col.updateOne(
        { item_id: it.item_id },
        {
          $set: {
            tenant_id: TENANT_ID,
            item_id: it.item_id,
            vertical: 'auto_parts',
            status: it.data.stock_qty > 0 ? 'active' : 'out_of_stock',
            data: it.data,
            search_text,
            updated_at: now,
          },
          $setOnInsert: { created_at: now },
        },
        { upsert: true },
      );
      if (result.upsertedCount > 0) inserted++;
      else skipped++;
    }
    console.log(`catalog seed: inserted=${inserted} updated=${skipped} total=${ITEMS.length}`);
    console.log(`db: ${dbPrefix}${TENANT_ID}.catalog_items`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
