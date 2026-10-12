import { pgTable, text, uuid, integer, boolean, timestamp, primaryKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const licensesTable = pgTable("social_najhin_licenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyHash: text("key_hash").notNull().unique(),
  maxDevices: integer("max_devices").notNull(),
  supportPlan: text("support_plan").notNull(),
  supportUntil: timestamp("support_until", { withTimezone: true }),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check("license_device_limit", sql`${table.maxDevices} between 1 and 10000`),
  check("license_support_plan", sql`${table.supportPlan} in ('none','monthly','yearly')`),
  check("license_support_period", sql`(${table.supportPlan} = 'none' and ${table.supportUntil} is null) or (${table.supportPlan} <> 'none' and ${table.supportUntil} is not null)`),
]);
export const activationsTable = pgTable("social_najhin_activations", {
  licenseId: uuid("license_id").notNull().references(() => licensesTable.id),
  machineId: text("machine_id").notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.licenseId, table.machineId] }),
  check("license_machine_format", sql`${table.machineId} ~ '^[a-f0-9]{64}$'`),
]);
export const insertLicenseSchema = createInsertSchema(licensesTable).omit({ id: true, createdAt: true });
export type InsertLicense = z.infer<typeof insertLicenseSchema>;
export type License = typeof licensesTable.$inferSelect;
