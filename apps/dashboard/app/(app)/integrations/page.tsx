import { AisensyForm } from './AisensyForm';

export default function IntegrationsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Connect VEDA to WhatsApp via your AiSensy project. We&apos;ll create the project
          for you on AiSensy; once it&apos;s live, paste the project ID and the API
          password from the AiSensy dashboard below.
        </p>
      </div>
      <AisensyForm />
    </div>
  );
}
