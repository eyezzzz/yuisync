import type { DomainMigration } from "./types";
import { boolInt, jsonObject, mappedFingerprint, normalizeSpecies, nullable, stableJson, tagged, text, unit, type TaggedRow } from "./common";

export const clientsPets: DomainMigration = {
  domain: "clients_pets",
  dependencies: [],
  async extract(context) {
    // The legacy dashboard stores one pet-shaped record per `clients` row and
    // keeps tutor grouping + pet fields in `details`. This is the authoritative
    // source because the legacy `pets` table is only a compatibility projection.
    return await tagged(context, "clients");
  },
  async normalize(raw, context) {
    const row = raw as TaggedRow;
    const details = jsonObject(row.details);
    const tenantId = context.scope.tenantId;
    const moduleId = context.scope.moduleId;
    const legacyRowId = text(row.id);
    if (!legacyRowId) return [];

    const clientId = text(details.tutor_group_id) || legacyRowId;
    const clientFingerprint = {
      id: clientId,
      tenant_id: tenantId,
      module_id: moduleId,
      name: text(row.name, "Cliente"),
      document: nullable(row.document),
      phone: nullable(row.phone),
      email: nullable(row.email),
      address: nullable(row.address),
      neighborhood: nullable(row.neighborhood),
      city: nullable(row.city),
      notes: nullable(row.notes),
      active: boolInt(row.active),
    };

    const petId = legacyRowId;
    const weightKg = details.weight_kg;
    const petFingerprint = {
      id: petId,
      tenant_id: tenantId,
      module_id: moduleId,
      client_id: clientId,
      name: text(details.pet_name, text(row.name, "Pet")),
      species: normalizeSpecies(details.species),
      breed: nullable(details.breed),
      birth_date: nullable(details.birth_date),
      weight_grams: weightKg == null || text(weightKg) === "" ? null : Math.round(Number(weightKg) * 1000),
      color: nullable(details.color),
      notes: nullable(details.pet_notes ?? row.notes),
      active: boolInt(row.active),
    };

    return [
      unit(
        context,
        row,
        "clients",
        clientId,
        context.env.DB.prepare(`
          INSERT INTO clients(id,tenant_id,module_id,name,document,phone,email,address,neighborhood,city,notes,active,source_id,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name,document=excluded.document,phone=excluded.phone,email=excluded.email,address=excluded.address,
            neighborhood=excluded.neighborhood,city=excluded.city,notes=excluded.notes,active=excluded.active,updated_at=CURRENT_TIMESTAMP
        `).bind(
          clientId,tenantId,moduleId,clientFingerprint.name,clientFingerprint.document,clientFingerprint.phone,clientFingerprint.email,
          clientFingerprint.address,clientFingerprint.neighborhood,clientFingerprint.city,clientFingerprint.notes,clientFingerprint.active,
          legacyRowId,nullable(row.created_at),
        ),
        clientFingerprint,
      ),
      unit(
        context,
        row,
        "pets",
        petId,
        context.env.DB.prepare(`
          INSERT INTO pets(id,tenant_id,module_id,client_id,name,species,breed,birth_date,weight_grams,color,notes,active,source_id,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            client_id=excluded.client_id,name=excluded.name,species=excluded.species,breed=excluded.breed,birth_date=excluded.birth_date,
            weight_grams=excluded.weight_grams,color=excluded.color,notes=excluded.notes,active=excluded.active,updated_at=CURRENT_TIMESTAMP
        `).bind(
          petId,tenantId,moduleId,clientId,petFingerprint.name,petFingerprint.species,petFingerprint.breed,petFingerprint.birth_date,
          petFingerprint.weight_grams,petFingerprint.color,petFingerprint.notes,petFingerprint.active,legacyRowId,nullable(row.created_at),
        ),
        petFingerprint,
      ),
    ];
  },
  targetFingerprint: (context) => mappedFingerprint(context, "clients_pets"),
};
