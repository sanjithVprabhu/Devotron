import { z } from 'zod';

export const OrderStatusSchema = z.enum([
  'created',
  'confirmed',
  'paid',
  'fulfilled',
  'closed',
  'cancelled',
  'refunded',
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const PaymentMethodSchema = z.enum([
  'upi',
  'razorpay',
  'cash',
  'cod',
  'bank_transfer',
  'credit_30d',
]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const LineItemSchema = z.object({
  item_id: z.string(),
  name: z.string(),
  unit_price_paise: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  discount_paise: z.number().int().nonnegative().default(0),
  gst_rate: z.number().nonnegative().default(0),
  notes: z.string().optional(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const DeliveryAddressSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  address_line_1: z.string(),
  address_line_2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  landmark: z.string().optional(),
  geo: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
});
export type DeliveryAddress = z.infer<typeof DeliveryAddressSchema>;

export const OrderSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  principal_id: z.string().uuid(),
  thread_id: z.string().uuid().nullable().optional(),
  order_number: z.string(),
  status: OrderStatusSchema,
  line_items: z.array(LineItemSchema).default([]),
  subtotal_paise: z.number().int().nonnegative(),
  tax_paise: z.number().int().nonnegative(),
  delivery_paise: z.number().int().nonnegative(),
  discount_paise: z.number().int().nonnegative().default(0),
  total_paise: z.number().int().nonnegative(),
  currency: z.string().default('INR'),
  payment_method: PaymentMethodSchema.nullable().optional(),
  payment_ref: z.string().nullable().optional(),
  delivery_address: DeliveryAddressSchema.nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type Order = z.infer<typeof OrderSchema>;

export function computeOrderTotals(line_items: LineItem[], delivery_paise = 0) {
  const subtotal_paise = line_items.reduce(
    (sum, li) => sum + li.unit_price_paise * li.quantity - li.discount_paise,
    0,
  );
  const tax_paise = line_items.reduce((sum, li) => {
    const gross = li.unit_price_paise * li.quantity - li.discount_paise;
    return sum + Math.round((gross * (li.gst_rate ?? 0)) / 100);
  }, 0);
  const total_paise = subtotal_paise + tax_paise + delivery_paise;
  return { subtotal_paise, tax_paise, delivery_paise, total_paise };
}
