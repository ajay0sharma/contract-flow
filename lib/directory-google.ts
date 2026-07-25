import jwt from "jsonwebtoken";
import type { DirectoryUserData } from "@/lib/directory-types";

export interface GoogleCredentials {
  serviceAccountJson: string;
  adminEmail: string;
  domain: string;
}

export type GoogleScopeFilter = {
  departments?: string[];
  domain?: string;
};

interface GoogleServiceAccountKey {
  client_email: string;
  private_key: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserName {
  fullName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
}

interface GoogleUserOrganization {
  title?: string | null;
  department?: string | null;
  primary?: boolean | null;
}

interface GoogleUserLocation {
  area?: string | null;
}

interface GoogleUserPhone {
  value?: string | null;
  primary?: boolean | null;
}

interface GoogleUserRelation {
  type?: string | null;
  value?: string | null;
}

interface GoogleDirectoryUser {
  id: string;
  primaryEmail?: string | null;
  name?: GoogleUserName | null;
  organizations?: GoogleUserOrganization[] | null;
  locations?: GoogleUserLocation[] | null;
  phones?: GoogleUserPhone[] | null;
  relations?: GoogleUserRelation[] | null;
  suspended?: boolean | null;
  archived?: boolean | null;
}

interface GoogleUsersListResponse {
  users?: GoogleDirectoryUser[];
  nextPageToken?: string;
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DIRECTORY_URL =
  "https://admin.googleapis.com/admin/directory/v1/users";
const GOOGLE_DIRECTORY_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.user.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
].join(" ");
const MAX_USERS = 10_000;
const DEFAULT_PAGE_SIZE = 500;

function normalizeCredential(value: string, label: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  return trimmed;
}

function parseServiceAccountJson(
  serviceAccountJson: string,
): GoogleServiceAccountKey {
  try {
    const parsed = JSON.parse(serviceAccountJson) as Partial<GoogleServiceAccountKey>;

    if (!parsed.client_email?.trim() || !parsed.private_key?.trim()) {
      throw new Error("Missing client_email or private_key.");
    }

    return {
      client_email: parsed.client_email.trim(),
      private_key: parsed.private_key,
    };
  } catch {
    throw new Error(
      "Invalid service account JSON. Paste the complete JSON key file.",
    );
  }
}

function parseGoogleAuthError(body: GoogleTokenResponse): string {
  const description = `${body.error ?? ""} ${body.error_description ?? ""}`.trim();

  if (
    description.includes("unauthorized_client") ||
    description.includes("delegation") ||
    description.includes("not authorized to access this resource")
  ) {
    return "Domain-wide delegation not enabled. Ask your Google Workspace admin to grant delegation to this service account.";
  }

  if (description) {
    return description;
  }

  return "Google authentication failed.";
}

function matchesDepartmentFilter(
  department: string | null,
  departments: string[] | undefined,
): boolean {
  if (!departments || departments.length === 0) {
    return true;
  }

  if (!department) {
    return false;
  }

  const normalizedDepartment = department.trim().toLowerCase();

  return departments.some(
    (value) => value.trim().toLowerCase() === normalizedDepartment,
  );
}

function getPrimaryOrganization(
  organizations: GoogleUserOrganization[] | null | undefined,
): GoogleUserOrganization | null {
  if (!organizations || organizations.length === 0) {
    return null;
  }

  return organizations.find((organization) => organization.primary) ?? organizations[0];
}

function getPrimaryPhone(
  phones: GoogleUserPhone[] | null | undefined,
): string | null {
  if (!phones || phones.length === 0) {
    return null;
  }

  const primaryPhone = phones.find((phone) => phone.primary) ?? phones[0];
  return primaryPhone?.value?.trim() || null;
}

function getManagerEmail(
  relations: GoogleUserRelation[] | null | undefined,
): string | null {
  if (!relations || relations.length === 0) {
    return null;
  }

  const manager = relations.find(
    (relation) => relation.type?.trim().toLowerCase() === "manager",
  );

  return manager?.value?.trim() || null;
}

function mapGoogleUser(user: GoogleDirectoryUser): DirectoryUserData | null {
  const email = user.primaryEmail?.trim() || "";

  if (!email) {
    return null;
  }

  const organization = getPrimaryOrganization(user.organizations);

  return {
    externalId: user.id,
    email,
    displayName: user.name?.fullName?.trim() || email,
    firstName: user.name?.givenName?.trim() || null,
    lastName: user.name?.familyName?.trim() || null,
    jobTitle: organization?.title?.trim() || null,
    department: organization?.department?.trim() || null,
    officeLocation: user.locations?.[0]?.area?.trim() || null,
    phone: getPrimaryPhone(user.phones),
    managerEmail: getManagerEmail(user.relations),
    isActive: !user.suspended && !user.archived,
  };
}

function buildUsersUrl(
  credentials: GoogleCredentials,
  options?: {
    maxResults?: number;
    pageToken?: string;
  },
): string {
  const params = new URLSearchParams();
  params.set("domain", credentials.domain);
  params.set("maxResults", String(options?.maxResults ?? DEFAULT_PAGE_SIZE));
  params.set("projection", "full");
  params.set("query", "isSuspended=false");

  if (options?.pageToken) {
    params.set("pageToken", options.pageToken);
  }

  return `${GOOGLE_DIRECTORY_URL}?${params.toString()}`;
}

async function listGoogleUsers(
  accessToken: string,
  credentials: GoogleCredentials,
  options?: {
    maxResults?: number;
    maxUsers?: number;
  },
): Promise<{ users: GoogleDirectoryUser[]; hasMore: boolean }> {
  const users: GoogleDirectoryUser[] = [];
  const pageSize = options?.maxResults ?? DEFAULT_PAGE_SIZE;
  const maxUsers = options?.maxUsers ?? MAX_USERS;
  let pageToken: string | undefined;

  do {
    const response = await fetch(
      buildUsersUrl(credentials, {
        maxResults: pageSize,
        pageToken,
      }),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );

    const body = (await response.json()) as GoogleUsersListResponse & {
      error?: { message?: string };
    };

    if (!response.ok) {
      const message =
        body.error?.message ??
        `Google Directory API request failed with status ${response.status}.`;

      if (message.toLowerCase().includes("not authorized")) {
        throw new Error(
          "Domain-wide delegation not enabled. Ask your Google Workspace admin to grant delegation to this service account.",
        );
      }

      throw new Error(message);
    }

    const pageUsers = body.users ?? [];
    const remaining = maxUsers - users.length;
    users.push(...pageUsers.slice(0, remaining));

    if (users.length >= maxUsers) {
      return { users, hasMore: Boolean(body.nextPageToken) };
    }

    pageToken = body.nextPageToken;
  } while (pageToken);

  return { users, hasMore: false };
}

export async function getGoogleAccessToken(
  credentials: GoogleCredentials,
): Promise<string> {
  const serviceAccount = parseServiceAccountJson(credentials.serviceAccountJson);
  const adminEmail = normalizeCredential(credentials.adminEmail, "Admin email");
  const now = Math.floor(Date.now() / 1000);

  const assertion = jwt.sign(
    {
      iss: serviceAccount.client_email,
      sub: adminEmail,
      scope: GOOGLE_DIRECTORY_SCOPES,
      aud: GOOGLE_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    },
    serviceAccount.private_key,
    {
      algorithm: "RS256",
      header: {
        alg: "RS256",
        typ: "JWT",
      },
    },
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const tokenResponse = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !tokenResponse.access_token) {
    throw new Error(parseGoogleAuthError(tokenResponse));
  }

  return tokenResponse.access_token;
}

export async function fetchGoogleUsers(
  credentials: GoogleCredentials,
  scopeFilter?: GoogleScopeFilter,
  options?: {
    maxResults?: number;
    maxUsers?: number;
  },
): Promise<DirectoryUserData[]> {
  const normalizedCredentials: GoogleCredentials = {
    serviceAccountJson: credentials.serviceAccountJson,
    adminEmail: normalizeCredential(credentials.adminEmail, "Admin email"),
    domain: normalizeCredential(credentials.domain, "Domain"),
  };

  const accessToken = await getGoogleAccessToken(normalizedCredentials);
  const { users } = await listGoogleUsers(
    accessToken,
    normalizedCredentials,
    options,
  );

  return users
    .filter((user) =>
      matchesDepartmentFilter(
        getPrimaryOrganization(user.organizations)?.department?.trim() || null,
        scopeFilter?.departments,
      ),
    )
    .map(mapGoogleUser)
    .filter((user): user is DirectoryUserData => user !== null);
}

export async function testGoogleConnection(
  credentials: GoogleCredentials,
): Promise<{
  success: boolean;
  userCount: number;
  sampleUsers: DirectoryUserData[];
  error: string | null;
}> {
  try {
    const normalizedCredentials: GoogleCredentials = {
      serviceAccountJson: credentials.serviceAccountJson,
      adminEmail: normalizeCredential(credentials.adminEmail, "Admin email"),
      domain: normalizeCredential(credentials.domain, "Domain"),
    };
    const accessToken = await getGoogleAccessToken(normalizedCredentials);
    const { users, hasMore } = await listGoogleUsers(
      accessToken,
      normalizedCredentials,
      {
        maxResults: 5,
        maxUsers: 5,
      },
    );
    const mappedUsers = users
      .map(mapGoogleUser)
      .filter((user): user is DirectoryUserData => user !== null);

    return {
      success: true,
      userCount: hasMore ? Math.max(mappedUsers.length, 5) : mappedUsers.length,
      sampleUsers: mappedUsers.slice(0, 3),
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      userCount: 0,
      sampleUsers: [],
      error:
        error instanceof Error
          ? error.message
          : "Unable to connect to Google Workspace directory.",
    };
  }
}
