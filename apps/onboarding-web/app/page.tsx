// Web-based onboarding alternative to WhatsApp-only. Mirrors Veda's intake tree.
// V1: phone-OTP entry → choose role → either redirect to WhatsApp with prefill, or
// run the same intake question tree as a web form. Parity with Veda is enforced by
// reusing the intake tree exposed by the orchestrator over HTTP.

export default function OnboardingHome() {
  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-3xl font-semibold">Get your business on WhatsApp</h1>
      <p className="mt-3 text-zinc-600">
        Enter your phone number — we&apos;ll text you to confirm and start the setup.
      </p>
      <form className="mt-8 space-y-4" action="/api/start" method="POST">
        <input
          name="phone"
          inputMode="tel"
          placeholder="+91 90000 00000"
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        <button className="w-full rounded-md bg-zinc-900 text-white px-3 py-2 text-sm font-medium">
          Send OTP
        </button>
      </form>
      <p className="mt-6 text-xs text-zinc-500">
        Prefer chat? <a className="underline" href={`https://wa.me/${process.env.NEXT_PUBLIC_VEDA_PHONE ?? '910000000000'}`}>Talk to Veda directly</a>.
      </p>
    </main>
  );
}
