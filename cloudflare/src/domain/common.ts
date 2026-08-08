import { HttpError, parseJson } from "../runtime";

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  try { return await request.json() as Record<string, unknown>; }
  catch { throw new HttpError(400, "INVALID_JSON", "Invalid JSON body"); }
}

export const asText = (value: unknown): string | null => {
  const text = String(value ?? "").trim();
  return text || null;
};

export const boolInt = (value: unknown, fallback = true): number =>
  value == null ? (fallback ? 1 : 0) : (value === true || value === 1 || String(value).toLowerCase() === "true" ? 1 : 0);

export function limitFrom(request: Request): number {
  const value = Number(new URL(request.url).searchParams.get("limit") ?? 100);
  return Math.min(500, Math.max(1, Number.isFinite(value) ? value : 100));
}

export function clientDto(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, document: row.document, phone: row.phone, email: row.email, address: row.address, neighborhood: row.neighborhood, city: row.city, notes: row.notes, active: row.active === 1, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function petDto(row: Record<string, unknown>) {
  return { id: row.id, clientId: row.client_id, name: row.name, species: row.species, breed: row.breed, birthDate: row.birth_date, weightKg: row.weight_grams == null ? null : Number(row.weight_grams) / 1000, color: row.color, notes: row.notes, active: row.active === 1 };
}

export function productDto(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, barcode: row.barcode, category: row.category, description: row.description, price: Number(row.price_cents ?? 0) / 100, costPrice: Number(row.cost_cents ?? 0) / 100, minStock: Number(row.min_quantity_milli ?? 0) / 1000, stockQuantity: Number(row.quantity_milli ?? 0) / 1000, speciesTarget: row.species_target, imageUrl: row.image_url, active: row.active === 1, metadata: parseJson(row.metadata_json, {}) };
}

export function serviceDto(row: Record<string, unknown>) {
  return { id: row.id, code: row.code, name: row.name, group: row.service_group, description: row.description, price: Number(row.price_cents ?? 0) / 100, durationMinutes: row.duration_minutes, speciesRule: row.species_rule, commissionPercent: row.commission_basis_points == null ? null : Number(row.commission_basis_points) / 100, active: row.active === 1, metadata: parseJson(row.metadata_json, {}) };
}
