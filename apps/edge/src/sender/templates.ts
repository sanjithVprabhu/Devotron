import { getSql } from '../pg.js';

export interface ApprovedTemplate {
  name: string;
  language: string;
  components: unknown;
}

export async function lookupApprovedTemplate(
  tenantId: string,
  preferredName: string | null,
): Promise<ApprovedTemplate | null> {
  const sql = getSql();
  if (preferredName) {
    const rows = await sql<
      ApprovedTemplate[]
    >`SELECT name, language, components FROM templates.whatsapp_templates
      WHERE tenant_id = ${tenantId} AND status = 'approved' AND name = ${preferredName}
      ORDER BY language ASC LIMIT 1`;
    if (rows.length > 0 && rows[0]) return rows[0];
  }
  // Fallback: any approved utility template.
  const rows = await sql<
    ApprovedTemplate[]
  >`SELECT name, language, components FROM templates.whatsapp_templates
    WHERE tenant_id = ${tenantId} AND status = 'approved' AND category = 'utility'
    ORDER BY created_at DESC LIMIT 1`;
  return rows[0] ?? null;
}
