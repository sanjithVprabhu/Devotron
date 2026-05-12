import { notFound } from 'next/navigation';
import { isEnabled } from '@/lib/features';
import { PaymentForm } from './PaymentForm';

export default function PaymentPage() {
  if (!isEnabled('phase_1_payments')) notFound();
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">Payments</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Connect your payment provider so the agent can generate real payment links
        for customers. Today: Razorpay (live). Coming: Stripe. UPI handle for
        manual fallback works without any provider.
      </p>
      <PaymentForm />
    </div>
  );
}
