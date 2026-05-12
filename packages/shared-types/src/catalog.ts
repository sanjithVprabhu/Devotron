import { z } from 'zod';
import { VerticalSchema } from './verticals.js';

export const CatalogItemStatusSchema = z.enum(['active', 'inactive', 'out_of_stock', 'draft']);
export type CatalogItemStatus = z.infer<typeof CatalogItemStatusSchema>;

// Vehicle compatibility row (auto_parts vertical).
export const VehicleCompatibilitySchema = z.object({
  make: z.string(),
  model: z.string(),
  year_from: z.number().int(),
  year_to: z.number().int(),
  variant: z.string().optional().default('all'),
  fuel: z.enum(['petrol', 'diesel', 'cng', 'electric', 'hybrid', 'any']).optional().default('any'),
});
export type VehicleCompatibility = z.infer<typeof VehicleCompatibilitySchema>;

// Auto parts vertical extension.
export const AutoPartsItemDataSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  part_type: z.string().optional(),
  sub_type: z.string().optional(),
  oem_numbers: z.array(z.string()).default([]),
  compatible_vehicles: z.array(VehicleCompatibilitySchema).default([]),
  price_inr: z.number().nonnegative(),
  mrp_inr: z.number().nonnegative().optional(),
  gst_rate: z.number().nonnegative().optional(),
  stock_qty: z.number().int().nonnegative().default(0),
  location: z.string().optional(),
  weight_kg: z.number().nonnegative().optional(),
  warranty_months: z.number().int().nonnegative().optional(),
  images: z.array(z.string().url()).default([]),
});
export type AutoPartsItemData = z.infer<typeof AutoPartsItemDataSchema>;

// Services vertical extension.
export const ServiceItemDataSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price_inr: z.number().nonnegative(),
  duration_minutes: z.number().int().positive().optional(),
  availability: z.record(z.unknown()).optional(),
  images: z.array(z.string().url()).default([]),
});
export type ServiceItemData = z.infer<typeof ServiceItemDataSchema>;

// Jobs vertical: a Job is the catalog item.
export const JobItemDataSchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  company_logo_url: z.string().url().optional(),
  jd: z.string().optional(),
  jd_summary: z.string().optional(),
  ctc_min: z.number().nonnegative().optional(),
  ctc_max: z.number().nonnegative().optional(),
  location: z.string(),
  is_remote: z.boolean().default(false),
  work_mode: z.enum(['remote', 'hybrid', 'on-site']).default('on-site'),
  experience_min: z.number().int().nonnegative().default(0),
  experience_max: z.number().int().nonnegative().optional(),
  skills: z.array(z.string()).default([]),
  apply_url: z.string().url().optional(),
  posted_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
  external_job_id: z.string().optional(),
});
export type JobItemData = z.infer<typeof JobItemDataSchema>;

// Generic shape — Mongo enforces no schema; the catalog-service enforces vertical schemas at the boundary.
export const CatalogItemSchema = z.object({
  tenant_id: z.string().uuid(),
  item_id: z.string(),
  vertical: VerticalSchema,
  status: CatalogItemStatusSchema.default('active'),
  data: z.record(z.unknown()),
  search_text: z.string().default(''),
  embedding_id: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const CatalogSearchInputSchema = z.object({
  tenant_id: z.string().uuid(),
  query: z.string().default(''),
  filters: z
    .object({
      price_max: z.number().optional(),
      price_min: z.number().optional(),
      brand: z.string().optional(),
      vehicle_make: z.string().optional(),
      vehicle_model: z.string().optional(),
      vehicle_year: z.number().int().optional(),
      location: z.string().optional(),
      remote: z.boolean().optional(),
      status: CatalogItemStatusSchema.optional(),
    })
    .partial()
    .default({}),
  limit: z.number().int().positive().max(50).default(5),
});
export type CatalogSearchInput = z.infer<typeof CatalogSearchInputSchema>;

export const CatalogSearchOutputSchema = z.object({
  items: z.array(CatalogItemSchema),
  total: z.number().int().nonnegative(),
});
export type CatalogSearchOutput = z.infer<typeof CatalogSearchOutputSchema>;
