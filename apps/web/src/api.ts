import type {
  Activity,
  AppConfig,
  BalancesResponse,
  CreateGroupInput,
  Expense,
  ExpenseInput,
  GroupDetail,
  GroupSummary,
  Invite,
  InvitePreview,
  LoginInput,
  RegisterInput,
  SettlementInput,
  User,
} from "@split-ledger/shared";

/** A failed API call, carrying the server's message and per-field issues. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }

  /** The first message for a form field, if the server flagged it. */
  field(path: string): string | undefined {
    return this.issues.find((i) => i.path === path || i.path.startsWith(`${path}.`))?.message;
  }
}

/*
 * The public demo keeps its data in the memory of a serverless instance.
 * Sequential requests keep landing on the same warm instance, but a burst
 * of parallel ones can make the platform start a second instance that has
 * never seen this visitor's account. So until the server confirms it has a
 * real database, requests go out one at a time.
 */
let serial = true;
let queue: Promise<unknown> = Promise.resolve();

export function setSerialRequests(value: boolean) {
  serial = value;
}

function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!serial) return send<T>(method, path, body);
  const next = queue.then(() => send<T>(method, path, body));
  queue = next.catch(() => undefined);
  return next;
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data.issues);
  return data as T;
}

const enc = encodeURIComponent;

export const api = {
  config: () => request<AppConfig>("GET", "/config"),
  me: () => request<User>("GET", "/auth/me"),
  login: (input: LoginInput) => request<User>("POST", "/auth/login", input),
  register: (input: RegisterInput) => request<User>("POST", "/auth/register", input),
  demo: () => request<User>("POST", "/auth/demo", {}),
  logout: () => request<undefined>("POST", "/auth/logout", {}),

  groups: () => request<GroupSummary[]>("GET", "/groups"),
  createGroup: (input: CreateGroupInput) => request<{ id: string }>("POST", "/groups", input),
  group: (id: string) => request<GroupDetail>("GET", `/groups/${enc(id)}`),

  expenses: (groupId: string) => request<Expense[]>("GET", `/groups/${enc(groupId)}/expenses`),
  addExpense: (groupId: string, input: ExpenseInput) => request<{ id: string }>("POST", `/groups/${enc(groupId)}/expenses`, input),
  updateExpense: (groupId: string, id: string, input: ExpenseInput) =>
    request<{ id: string }>("PUT", `/groups/${enc(groupId)}/expenses/${enc(id)}`, input),
  deleteExpense: (groupId: string, id: string) => request<undefined>("DELETE", `/groups/${enc(groupId)}/expenses/${enc(id)}`),

  balances: (groupId: string) => request<BalancesResponse>("GET", `/groups/${enc(groupId)}/balances`),
  recordSettlement: (groupId: string, input: SettlementInput) =>
    request<{ id: string }>("POST", `/groups/${enc(groupId)}/settlements`, input),
  activity: (groupId: string) => request<Activity[]>("GET", `/groups/${enc(groupId)}/activity`),

  createInvite: (groupId: string) => request<Invite>("POST", `/groups/${enc(groupId)}/invites`, {}),
  invite: (token: string) => request<InvitePreview>("GET", `/invites/${enc(token)}`),
  acceptInvite: (token: string) => request<{ groupId: string }>("POST", `/invites/${enc(token)}/accept`, {}),

  exportUrl: (groupId: string) => `/api/groups/${enc(groupId)}/export.csv`,
};
