export interface CounterpartyProfile {
  id: string;
  name: string;
  mainContactName: string;
  mainContactTitle: string;
  mainContactEmail: string;
  mainContactPhone: string;
  address: string;
  createdAt: string;
}

export interface CreateCounterpartyInput {
  name: string;
  mainContactName: string;
  mainContactTitle?: string;
  mainContactEmail: string;
  mainContactPhone?: string;
  address: string;
}

type LegacyCounterpartyProfile = CounterpartyProfile & {
  mainContact?: string;
};

function normalizeCounterparty(
  profile: LegacyCounterpartyProfile,
): CounterpartyProfile {
  if (profile.mainContactName) {
    return {
      ...profile,
      mainContactTitle: profile.mainContactTitle ?? "",
      mainContactPhone: profile.mainContactPhone ?? "",
    };
  }

  const legacyContact = profile.mainContact ?? "";
  const [namePart, ...rest] = legacyContact.split(",").map((part) => part.trim());
  const emailPart = rest.join(", ").trim();

  return {
    ...profile,
    mainContactName: namePart,
    mainContactTitle: "",
    mainContactEmail: emailPart.includes("@")
      ? emailPart
      : profile.mainContactEmail ?? "",
    mainContactPhone: profile.mainContactPhone ?? "",
  };
}

const seedCounterparties: CounterpartyProfile[] = [
  {
    id: "cp-acme",
    name: "Acme Corp",
    mainContactName: "Jane Smith",
    mainContactTitle: "Director of Procurement",
    mainContactEmail: "jane@acme.com",
    mainContactPhone: "+1 (415) 555-0142",
    address: "500 Market Street, San Francisco, CA",
    createdAt: "2026-01-15T00:00:00.000Z",
  },
  {
    id: "cp-brightline",
    name: "Brightline Analytics",
    mainContactName: "Alex Kim",
    mainContactTitle: "Head of Partnerships",
    mainContactEmail: "alex@brightline.com",
    mainContactPhone: "+1 (206) 555-0198",
    address: "1200 Pine Street, Seattle, WA",
    createdAt: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "cp-cloudhost",
    name: "CloudHost Pro",
    mainContactName: "Chris Lee",
    mainContactTitle: "Account Executive",
    mainContactEmail: "chris@cloudhost.com",
    mainContactPhone: "",
    address: "44 Cloud Way, Austin, TX",
    createdAt: "2026-02-10T00:00:00.000Z",
  },
  {
    id: "cp-northwind",
    name: "Northwind Labs",
    mainContactName: "Taylor Reed",
    mainContactTitle: "General Counsel",
    mainContactEmail: "taylor@northwind.com",
    mainContactPhone: "+1 (617) 555-0133",
    address: "88 Harbor Road, Boston, MA",
    createdAt: "2026-03-05T00:00:00.000Z",
  },
  {
    id: "cp-atlas",
    name: "Atlas Systems",
    mainContactName: "Morgan Lee",
    mainContactTitle: "VP, Commercial Operations",
    mainContactEmail: "morgan@atlas.com",
    mainContactPhone: "+1 (312) 555-0177",
    address: "300 State Street, Chicago, IL",
    createdAt: "2026-03-20T00:00:00.000Z",
  },
];

const globalStore = globalThis as typeof globalThis & {
  __counterpartyProfiles?: CounterpartyProfile[];
};

function getStore(): CounterpartyProfile[] {
  if (!globalStore.__counterpartyProfiles) {
    globalStore.__counterpartyProfiles = [...seedCounterparties];
  }

  return globalStore.__counterpartyProfiles;
}

export function getCounterparties(): CounterpartyProfile[] {
  return getStore()
    .map(normalizeCounterparty)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCounterpartyById(id: string): CounterpartyProfile | undefined {
  const profile = getStore().find((entry) => entry.id === id);

  return profile ? normalizeCounterparty(profile) : undefined;
}

import { safeTrim } from "@/lib/string-utils";

export function createCounterparty(
  input: CreateCounterpartyInput,
): CounterpartyProfile {
  const profile: CounterpartyProfile = {
    id: `cp-${Date.now()}`,
    name: safeTrim(input.name),
    mainContactName: safeTrim(input.mainContactName),
    mainContactTitle: safeTrim(input.mainContactTitle),
    mainContactEmail: safeTrim(input.mainContactEmail),
    mainContactPhone: safeTrim(input.mainContactPhone),
    address: safeTrim(input.address),
    createdAt: new Date().toISOString(),
  };

  getStore().unshift(profile);
  return profile;
}
