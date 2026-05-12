export default function HomePage() {
  return (
    <main className="min-h-dvh bg-zinc-50 text-zinc-900">
      <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 text-center">
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight">
          Bring your business to life on WhatsApp.
        </h1>
        <p className="mt-6 text-xl text-zinc-600 max-w-2xl mx-auto">
          Talk to Veda. Your business goes live by the end of the conversation.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <a
            className="rounded-full bg-zinc-900 text-white px-6 py-3 text-sm font-medium hover:bg-zinc-800"
            href={`https://wa.me/${process.env.NEXT_PUBLIC_VEDA_PHONE ?? '910000000000'}?text=Hi%20Veda`}
            target="_blank"
            rel="noopener"
          >
            Start on WhatsApp
          </a>
          <a className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium" href="/pricing">
            See pricing
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Feature title="Configuration through conversation" body="No flow builder. Talk to Veda; she builds your agent from what you tell her." />
          <Feature title="Voice-note native" body="Indian SMB customers send voice notes. We transcribe and respond — across Hindi, Kannada, Tamil, Telugu, English." />
          <Feature title="Owner manages on WhatsApp" body="Update prices, add stock, send broadcasts — all by texting your own agent. The dashboard is optional." />
        </div>
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-zinc-600">{body}</p>
    </div>
  );
}
