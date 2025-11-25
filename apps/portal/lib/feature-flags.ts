import type { PortalContext } from "./data-sources";

export const hasFeatureFlag = (
  context: PortalContext,
  moduleId: string,
  featureKey: string
) =>
  context.featureFlags.some(
    (flag) =>
      flag.moduleId === moduleId &&
      flag.featureKey === featureKey &&
      flag.enabled === true
  );
