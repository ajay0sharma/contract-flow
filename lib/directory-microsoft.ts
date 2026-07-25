import type { DirectoryUserData } from "@/lib/directory-types";

export interface MicrosoftCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export type { DirectoryUserData };

interface MicrosoftTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface MicrosoftGraphUser {
  id: string;
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  officeLocation?: string | null;
  businessPhones?: string[] | null;
  accountEnabled?: boolean | null;
}

interface MicrosoftGraphUsersResponse {
  value?: MicrosoftGraphUser[];
  "@odata.nextLink"?: string;
  "@odata.count"?: number;
}

interface MicrosoftGraphManager {
  mail?: string | null;
}

interface MicrosoftGraphManagerResponse {
  mail?: string | null;
}

interface MicrosoftBatchResponseItem {
  id: string;
  status: number;
  body?: MicrosoftGraphManagerResponse | { error?: { message?: string } };
}

interface MicrosoftBatchResponse {
  responses?: MicrosoftBatchResponseItem[];
}

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const MAX_USERS = 10_000;
const USER_PAGE_SIZE = 999;
const MANAGER_BATCH_SIZE = 20;
const TEST_USER_PAGE_SIZE = 5;

const USER_SELECT_FIELDS = [
  "id",
  "displayName",
  "givenName",
  "surname",
  "mail",
  "userPrincipalName",
  "jobTitle",
  "department",
  "officeLocation",
  "businessPhones",
  "accountEnabled",
].join(",");

export type MicrosoftScopeFilter = {
  departments?: string[];
  groups?: string[];
  domain?: string;
};

function normalizeCredential(value: string, label: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  return trimmed;
}

function parseMicrosoftAuthError(
  status: number,
  body: MicrosoftTokenResponse,
): string {
  const description = body.error_description ?? body.error ?? "";

  if (description.includes("AADSTS700016")) {
    return "Application not found in tenant. Check the Tenant ID.";
  }

  if (description.includes("AADSTS7000215")) {
    return "Invalid client secret. The secret may have expired.";
  }

  if (status === 401) {
    return "Invalid client credentials. Check the Client ID and Client Secret.";
  }

  if (description) {
    return description;
  }

  return `Microsoft authentication failed with status ${status}.`;
}

function buildUsersFilter(scopeFilter?: MicrosoftScopeFilter): string {
  const filters = ["accountEnabled eq true"];

  if (scopeFilter?.domain?.trim()) {
    const domain = scopeFilter.domain.trim().replace(/'/g, "''");
    filters.push(`endsWith(mail,'${domain}')`);
  }

  return filters.join(" and ");
}

function buildUsersUrl(options?: {
  top?: number;
  scopeFilter?: MicrosoftScopeFilter;
  count?: boolean;
}): string {
  const params = new URLSearchParams();
  params.set("$select", USER_SELECT_FIELDS);
  params.set("$filter", buildUsersFilter(options?.scopeFilter));
  params.set("$top", String(options?.top ?? USER_PAGE_SIZE));

  if (options?.count) {
    params.set("$count", "true");
  }

  return `${GRAPH_BASE_URL}/users?${params.toString()}`;
}

function mapMicrosoftUser(
  user: MicrosoftGraphUser,
  managerEmail: string | null,
): DirectoryUserData | null {
  const email = user.mail?.trim() || user.userPrincipalName?.trim() || "";

  if (!email) {
    return null;
  }

  return {
    externalId: user.id,
    email,
    displayName: user.displayName?.trim() || email,
    firstName: user.givenName?.trim() || null,
    lastName: user.surname?.trim() || null,
    jobTitle: user.jobTitle?.trim() || null,
    department: user.department?.trim() || null,
    officeLocation: user.officeLocation?.trim() || null,
    phone: user.businessPhones?.[0]?.trim() || null,
    managerEmail,
    isActive: user.accountEnabled ?? true,
  };
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

async function parseJsonResponse<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function graphRequest<T>(
  url: string,
  accessToken: string,
  init?: RequestInit,
  options?: { consistencyLevel?: boolean },
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Accept", "application/json");

  if (options?.consistencyLevel) {
    headers.set("ConsistencyLevel", "eventual");
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      typeof errorBody === "object" &&
      errorBody &&
      "error" in errorBody &&
      typeof (errorBody as { error?: { message?: string } }).error?.message ===
        "string"
        ? (errorBody as { error: { message: string } }).error.message
        : `Microsoft Graph request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return parseJsonResponse<T>(response);
}

export async function getMicrosoftAccessToken(
  credentials: MicrosoftCredentials,
): Promise<string> {
  const tenantId = normalizeCredential(credentials.tenantId, "Tenant ID");
  const clientId = normalizeCredential(credentials.clientId, "Client ID");
  const clientSecret = normalizeCredential(
    credentials.clientSecret,
    "Client Secret",
  );

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const tokenResponse = await parseJsonResponse<MicrosoftTokenResponse>(response);

  if (!response.ok || !tokenResponse.access_token) {
    throw new Error(parseMicrosoftAuthError(response.status, tokenResponse));
  }

  return tokenResponse.access_token;
}

async function fetchAllMicrosoftUsers(
  accessToken: string,
  scopeFilter?: MicrosoftScopeFilter,
): Promise<MicrosoftGraphUser[]> {
  const users: MicrosoftGraphUser[] = [];
  let nextUrl: string | null = buildUsersUrl({
    scopeFilter,
    top: USER_PAGE_SIZE,
  });
  const useConsistencyLevel = Boolean(scopeFilter?.domain?.trim());

  while (nextUrl && users.length < MAX_USERS) {
    const page: MicrosoftGraphUsersResponse =
      await graphRequest<MicrosoftGraphUsersResponse>(
      nextUrl,
      accessToken,
      undefined,
      { consistencyLevel: useConsistencyLevel },
    );

    const pageUsers = page.value ?? [];
    const remaining = MAX_USERS - users.length;
    users.push(...pageUsers.slice(0, remaining));

    if (users.length >= MAX_USERS) {
      break;
    }

    nextUrl = page["@odata.nextLink"] ?? null;
  }

  return users;
}

async function fetchManagerEmails(
  accessToken: string,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const managerEmails = new Map<string, string | null>();

  for (let index = 0; index < userIds.length; index += MANAGER_BATCH_SIZE) {
    const batchIds = userIds.slice(index, index + MANAGER_BATCH_SIZE);
    const batchBody = {
      requests: batchIds.map((userId, requestIndex) => ({
        id: String(requestIndex + 1),
        method: "GET",
        url: `/users/${userId}/manager?$select=mail`,
      })),
    };

    const batchResponse = await graphRequest<MicrosoftBatchResponse>(
      `${GRAPH_BASE_URL}/$batch`,
      accessToken,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batchBody),
      },
    );

    for (const [requestIndex, userId] of batchIds.entries()) {
      const responseItem = batchResponse.responses?.find(
        (item) => item.id === String(requestIndex + 1),
      );

      if (!responseItem || responseItem.status >= 400) {
        managerEmails.set(userId, null);
        continue;
      }

      const manager = responseItem.body as MicrosoftGraphManager | undefined;
      managerEmails.set(userId, manager?.mail?.trim() || null);
    }
  }

  return managerEmails;
}

export async function fetchMicrosoftUsers(
  credentials: MicrosoftCredentials,
  scopeFilter?: MicrosoftScopeFilter,
): Promise<DirectoryUserData[]> {
  const accessToken = await getMicrosoftAccessToken(credentials);
  const graphUsers = await fetchAllMicrosoftUsers(accessToken, scopeFilter);

  const filteredUsers = graphUsers.filter((user) =>
    matchesDepartmentFilter(
      user.department?.trim() || null,
      scopeFilter?.departments,
    ),
  );

  const managerEmails = await fetchManagerEmails(
    accessToken,
    filteredUsers.map((user) => user.id),
  );

  return filteredUsers
    .map((user) =>
      mapMicrosoftUser(user, managerEmails.get(user.id) ?? null),
    )
    .filter((user): user is DirectoryUserData => user !== null);
}

export async function testMicrosoftConnection(
  credentials: MicrosoftCredentials,
): Promise<{
  success: boolean;
  userCount: number;
  sampleUsers: DirectoryUserData[];
  error: string | null;
}> {
  try {
    const accessToken = await getMicrosoftAccessToken(credentials);
    const page = await graphRequest<MicrosoftGraphUsersResponse>(
      buildUsersUrl({ top: TEST_USER_PAGE_SIZE, count: true }),
      accessToken,
      undefined,
      { consistencyLevel: true },
    );

    const graphUsers = page.value ?? [];
    const managerEmails = await fetchManagerEmails(
      accessToken,
      graphUsers.map((user) => user.id),
    );

    const sampleUsers = graphUsers
      .map((user) =>
        mapMicrosoftUser(user, managerEmails.get(user.id) ?? null),
      )
      .filter((user): user is DirectoryUserData => user !== null)
      .slice(0, 3);

    const userCount =
      typeof page["@odata.count"] === "number"
        ? page["@odata.count"]
        : graphUsers.length;

    return {
      success: true,
      userCount,
      sampleUsers,
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
          : "Unable to connect to Microsoft directory.",
    };
  }
}
