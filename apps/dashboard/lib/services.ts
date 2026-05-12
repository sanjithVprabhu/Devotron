// Service URL resolution + lightweight HTTP wrappers used by route handlers.

const URLS = {
  identity: process.env.IDENTITY_SERVICE_URL ?? 'http://localhost:8083',
  blueprint: process.env.BLUEPRINT_SERVICE_URL ?? 'http://localhost:8084',
  catalog: process.env.CATALOG_SERVICE_URL ?? 'http://localhost:8085',
  order: process.env.ORDER_SERVICE_URL ?? 'http://localhost:8086',
  team: process.env.TEAM_SERVICE_URL ?? 'http://localhost:8087',
  template: process.env.TEMPLATE_SERVICE_URL ?? 'http://localhost:8088',
  integration: process.env.INTEGRATION_HUB_URL ?? 'http://localhost:8089',
  daemon: process.env.DAEMON_URL ?? 'http://localhost:8182',
  edge: process.env.EDGE_URL ?? 'http://localhost:8080',
} as const;

export type ServiceName = keyof typeof URLS;

export async function callService<T = unknown>(
  service: ServiceName,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${URLS[service]}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${service} ${path} → ${res.status}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
