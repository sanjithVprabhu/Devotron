import { OrdersTable } from './OrdersTable';

export default function OrdersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <OrdersTable />
    </div>
  );
}
