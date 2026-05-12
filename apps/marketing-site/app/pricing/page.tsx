export default function PricingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-semibold">Pricing</h1>
      <p className="mt-3 text-zinc-600">Pay only for what your agent does. No markup on Meta's WhatsApp fees.</p>
      <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-4">
        <Tier name="Free" price="₹0" features={["Basic agent", "50 conversations/day", "Voice transcription"]} />
        <Tier name="Starter" price="₹2,500/mo" features={["All Free features", "1,500 conversations/day", "Razorpay"]} />
        <Tier name="Growth" price="₹7,999/mo" features={["All Starter features", "Daemon proposals", "Custom templates"]} />
        <Tier name="Pro" price="₹19,999/mo" features={["All Growth features", "API sandbox", "Priority support"]} />
      </div>
    </main>
  );
}

function Tier({ name, price, features }: { name: string; price: string; features: string[] }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <h3 className="text-lg font-semibold">{name}</h3>
      <div className="mt-2 text-2xl font-semibold">{price}</div>
      <ul className="mt-4 space-y-1 text-sm text-zinc-600">
        {features.map((f) => (
          <li key={f}>· {f}</li>
        ))}
      </ul>
    </div>
  );
}
