export interface PortalNavLink {
  label: string;
  href: string;
  description: string;
  moduleId?: string;
  featureFlag?: {
    moduleId: string;
    key: string;
  };
}

export const portalNavLinks: PortalNavLink[] = [
  {
    label: "Dashboard",
    href: "/",
    description: "Revenue, adoption, alerts"
  },
  {
    label: "Menu",
    href: "/menu",
    description: "Pricing, availability, recipes",
    moduleId: "menu"
  },
  {
    label: "Inventory",
    href: "/inventory",
    description: "On-hand, par levels, alerts",
    moduleId: "inventory"
  },
  {
    label: "POS",
    href: "/pos",
    description: "Tickets, tenders, payouts",
    moduleId: "pos"
  },
  {
    label: "Loyalty",
    href: "/loyalty",
    description: "Balances & rewards",
    moduleId: "loyalty"
  },
  {
    label: "Locations",
    href: "/locations",
    description: "Inventory & menu per location",
    moduleId: "inventory",
    featureFlag: { moduleId: "global", key: "multi_location" }
  },
  {
    label: "Payments",
    href: "/payments",
    description: "Tenders, totals, methods",
    moduleId: "pos"
  },
  {
    label: "Reporting",
    href: "/reporting",
    description: "Trends, adoption, categories",
    moduleId: "reports"
  },
  {
    label: "Account",
    href: "/account",
    description: "Profile, business, and media",
    moduleId: "dashboard"
  }
];
