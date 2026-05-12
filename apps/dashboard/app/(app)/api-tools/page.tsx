// API tools — owner registers their backend's REST endpoints as agent tools.
//
// Two phases:
//   1. Connect the API: enter base URL + auth, test it, lock it.
//   2. Register endpoints one by one with a live sandbox.

import { ApiConfigPanel } from './ApiConfigPanel';
import { ApiToolsManager } from './ApiToolsManager';

export const metadata = {
  title: 'API tools — VEDA',
};

export default function ApiToolsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold mb-1">API tools</h1>
        <p className="text-sm text-zinc-500 max-w-2xl">
          Connect your backend and register endpoints. Each saved endpoint becomes a
          tool your agent can call during conversations — without writing code.
        </p>
      </header>

      <ApiConfigPanel />
      <ApiToolsManager />
    </div>
  );
}
