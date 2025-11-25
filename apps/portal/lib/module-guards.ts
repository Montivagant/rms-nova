import { redirect } from "next/navigation";
import type { PortalContext } from "./data-sources";

export const isModuleEnabled = (context: PortalContext, moduleId: string) =>
  context.modules.some((entry) => entry.moduleId === moduleId && entry.enabled);

export const ensureModuleEnabled = (context: PortalContext, moduleId: string) => {
  if (isModuleEnabled(context, moduleId)) {
    return;
  }
  redirect(`/?module=${encodeURIComponent(moduleId)}`);
};
