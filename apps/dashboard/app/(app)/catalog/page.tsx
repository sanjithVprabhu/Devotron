import { CatalogTable } from './CatalogTable';

export default function CatalogPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Catalog</h1>
      <CatalogTable />
    </div>
  );
}
