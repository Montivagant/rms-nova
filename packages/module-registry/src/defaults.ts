export type RegistrationModuleDefault = {
  key: string;
  name: string;
  enabled: boolean;
  category?: string;
};

export const registrationModuleDefaults: RegistrationModuleDefault[] = [
  { key: "pos", name: "Point of Sale", enabled: true, category: "Operations" },
  { key: "inventory", name: "Inventory", enabled: true, category: "Operations" },
  { key: "menu", name: "Menu Manager", enabled: false, category: "Operations" },
  { key: "reports", name: "Reporting & Insights", enabled: false, category: "Insights" }
];
