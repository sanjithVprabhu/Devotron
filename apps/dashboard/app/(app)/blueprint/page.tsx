import { BlueprintEditor } from './BlueprintEditor';

export default function BlueprintPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Blueprint</h1>
      <p className="text-sm text-zinc-500 max-w-2xl">
        Your business is described by a versioned blueprint. Edit JSON to mutate; every save creates
        a new version with full diff history. Veda also mutates this through WhatsApp commands.
      </p>
      <BlueprintEditor />
    </div>
  );
}
