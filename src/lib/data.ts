import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const DATA_DIR = path.join(process.cwd(), "data");

function readCsv<T>(file: string): T[] {
  const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf8");
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as T[];
}

export type Product = {
  product_id: string;
  category: string;
  product_name: string;
  description: string;
  unit: string;
  price_min: number;
  price_max: number;
  setup_fee: number;
  min_contract_months: number;
  city_tiers: number[];
  min_employees: number;
  min_sites: number;
  requires_gstin: boolean;
  requires_one_of: string[];
  install_days: number;
  target_segments: string[];
};

export type GstinRecord = {
  gstin: string;
  legal_name: string;
  trade_name: string;
  constitution: string;
  principal_place_of_business: string;
  state: string;
  registration_date: string;
  status: "Active" | "Cancelled" | "Suspended";
};

export type UdyamRecord = {
  udyam_number: string;
  enterprise_name: string;
  enterprise_type: string;
  major_activity: string;
  nic_description: string;
  state: string;
  city: string;
  date_of_registration: string;
};

export type Lead = Record<string, string>;

type Cache = {
  products: Product[];
  productById: Map<string, Product>;
  gstin: Map<string, GstinRecord>;
  udyam: Map<string, UdyamRecord>;
  leads: Lead[];
};

const g = globalThis as unknown as { __udyamData?: Cache };

function load(): Cache {
  if (g.__udyamData) return g.__udyamData;
  const products = readCsv<Record<string, string>>("product_catalogue.csv").map(
    (r): Product => ({
      product_id: r.product_id,
      category: r.category,
      product_name: r.product_name,
      description: r.description,
      unit: r.unit,
      price_min: Number(r.price_min_inr_per_month),
      price_max: Number(r.price_max_inr_per_month),
      setup_fee: Number(r.one_time_setup_inr),
      min_contract_months: Number(r.min_contract_months),
      city_tiers: r.available_city_tiers.split(";").map(Number),
      min_employees: Number(r.min_employees),
      min_sites: Number(r.min_sites),
      requires_gstin: r.requires_gstin === "Y",
      requires_one_of: r.requires_one_of ? r.requires_one_of.split("|") : [],
      install_days: Number(r.typical_install_days),
      target_segments: r.target_segments.split(";"),
    }),
  );
  const gstin = new Map(
    readCsv<GstinRecord>("mock_gstin_registry.csv").map((r) => [r.gstin, r]),
  );
  const udyam = new Map(
    readCsv<UdyamRecord>("mock_udyam_registry.csv").map((r) => [r.udyam_number, r]),
  );
  const leads = readCsv<Lead>("smb_leads.csv");
  g.__udyamData = {
    products,
    productById: new Map(products.map((p) => [p.product_id, p])),
    gstin,
    udyam,
    leads,
  };
  return g.__udyamData;
}

export const data = {
  get products() {
    return load().products;
  },
  product(id: string) {
    return load().productById.get(id);
  },
  gstin(id: string) {
    return load().gstin.get(id.toUpperCase());
  },
  gstinByName(name: string): GstinRecord[] {
    const n = name.toLowerCase();
    return [...load().gstin.values()].filter((r) => r.trade_name.toLowerCase() === n || r.legal_name.toLowerCase() === n);
  },
  udyam(id: string) {
    return load().udyam.get(id.toUpperCase());
  },
  get leads() {
    return load().leads;
  },
  /** City -> tier/state, derived from the leads dataset (tier 1 or 2). */
  cityInfo(name?: string): { city: string; tier: 1 | 2; state: string } | undefined {
    if (!name) return undefined;
    const n = name.trim().toLowerCase();
    const l = load().leads.find((x) => x.city.toLowerCase() === n);
    return l ? { city: l.city, tier: Number(l.city_tier) as 1 | 2, state: l.state } : undefined;
  },
  get cities(): string[] {
    return [...new Set(load().leads.map((l) => l.city))].sort();
  },
};
