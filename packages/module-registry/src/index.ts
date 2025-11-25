import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

const baseDir = dirname(fileURLToPath(import.meta.url));
const registryPath = resolve(baseDir, "..", "module-registry.json");

const actionSchema = z.string().min(1);
const featureSchema = z.object({
  id: z.string(),
  name: z.string(),
  actions: z.array(actionSchema)
});

const moduleSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  dependencies: z.array(z.string()).optional(),
  features: z.array(featureSchema)
});

const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  permissions: z.array(z.string()),
  system: z.boolean().optional(),
  superadmin_only: z.boolean().optional()
});

const registrySchema = z.object({
  version: z.string(),
  generated_at: z.string(),
  modules: z.array(moduleSchema),
  default_roles: z.array(roleSchema),
  dependencies: z.record(z.any()).optional(),
  feature_flags: z.record(z.any()).optional()
});

export type ModuleRegistry = z.infer<typeof registrySchema>;

let cachedRegistry: ModuleRegistry | null = null;

export const loadRegistry = (): ModuleRegistry => {
  if (cachedRegistry) return cachedRegistry;
  const file = readFileSync(registryPath, "utf8");
  const json = JSON.parse(file);
  cachedRegistry = registrySchema.parse(json);
  return cachedRegistry;
};

export const listPermissions = (): string[] => {
  const registry = loadRegistry();
  const permissions = new Set<string>();
  for (const mod of registry.modules) {
    for (const feature of mod.features) {
      for (const action of feature.actions) {
        permissions.add(`${mod.id}.${feature.id}.${action}`);
      }
    }
  }
  return Array.from(permissions).sort();
};

export { registrationModuleDefaults } from "./defaults";
export type { RegistrationModuleDefault } from "./defaults";



