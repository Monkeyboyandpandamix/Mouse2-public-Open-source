import path from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export interface AuthUserRecord {
  id: string;
  username: string;
  fullName: string;
  role: string;
  enabled: boolean;
  createdAt: string;
  lastLogin: string | null;
  passwordHash: string;
  passwordSalt: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  enabled: boolean;
}

export interface AuthUserAdminView extends AuthenticatedUser {
  createdAt: string;
  lastLogin: string | null;
}

const DATA_DIR = path.resolve(process.cwd(), "data");
const AUTH_USERS_FILE = path.join(DATA_DIR, "auth_users.json");

const BOOTSTRAP_ROLE_VALUES = new Set(["admin", "operator", "viewer"]);

function buildDefaultBootstrapUsers() {
  const generated: string[] = [];
  const resolvePassword = (envKey: string, username: string) => {
    const fromEnv = String(process.env[envKey] || "").trim();
    if (fromEnv.length >= 8) return fromEnv;
    const random = randomBytes(12).toString("hex");
    generated.push(`${username}:${random}`);
    return random;
  };

  const users = [
    {
      id: "1",
      username: "admin",
      fullName: "System Administrator",
      role: "admin",
      password: resolvePassword("DEFAULT_ADMIN_PASSWORD", "admin"),
    },
    {
      id: "2",
      username: "operator",
      fullName: "Flight Operator",
      role: "operator",
      password: resolvePassword("DEFAULT_OPERATOR_PASSWORD", "operator"),
    },
    {
      id: "3",
      username: "viewer",
      fullName: "Mission Observer",
      role: "viewer",
      password: resolvePassword("DEFAULT_VIEWER_PASSWORD", "viewer"),
    },
  ] as const;

  return { users, generated };
}

function readBootstrapUsersFromEnv() {
  const fromJson = String(process.env.AUTH_BOOTSTRAP_USERS_JSON || "").trim();
  if (fromJson) {
    try {
      const parsed = JSON.parse(fromJson);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry: any, idx: number) => ({
            id: String(entry.id || `${Date.now()}-${idx + 1}`),
            username: sanitizeUsername(entry.username),
            fullName: String(entry.fullName || entry.username || "").trim(),
            role: BOOTSTRAP_ROLE_VALUES.has(String(entry.role || "").toLowerCase())
              ? String(entry.role || "").toLowerCase()
              : "viewer",
            password: String(entry.password || ""),
          }))
          .filter((entry) => entry.username && entry.password.length >= 8);
      }
    } catch {
      return [];
    }
  }

  const username = sanitizeUsername(process.env.AUTH_BOOTSTRAP_USERNAME || "");
  const password = String(process.env.AUTH_BOOTSTRAP_PASSWORD || "");
  if (!username || password.length < 8) return [];
  const fullName = String(process.env.AUTH_BOOTSTRAP_FULL_NAME || username).trim();
  const roleRaw = String(process.env.AUTH_BOOTSTRAP_ROLE || "admin").toLowerCase();
  const role = BOOTSTRAP_ROLE_VALUES.has(roleRaw) ? roleRaw : "admin";
  return [{ id: "1", username, fullName, role, password }];
}

const normalizeRole = (role: unknown) => {
  const value = String(role || "viewer").toLowerCase();
  return value === "admin" || value === "operator" || value === "viewer" ? value : "viewer";
};

function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? Buffer.from(saltHex, "hex") : randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return {
    passwordHash: hash.toString("hex"),
    passwordSalt: salt.toString("hex"),
  };
}

function safeCompareHex(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function ensureAuthUserFile() {
  if (existsSync(AUTH_USERS_FILE)) return;

  mkdirSync(DATA_DIR, { recursive: true });
  const now = new Date().toISOString();
  const explicitBootstrapUsers = readBootstrapUsersFromEnv();
  const { users: defaultBootstrapUsers, generated } = buildDefaultBootstrapUsers();
  const bootstrapUsers = explicitBootstrapUsers.length > 0 ? explicitBootstrapUsers : defaultBootstrapUsers;
  if (generated.length > 0 && explicitBootstrapUsers.length === 0) {
    console.warn("[auth] Default bootstrap accounts generated with random passwords:");
    generated.forEach((entry) => {
      console.warn(`[auth] ${entry}`);
    });
    console.warn(
      "[auth] Set DEFAULT_ADMIN_PASSWORD / DEFAULT_OPERATOR_PASSWORD / DEFAULT_VIEWER_PASSWORD to control bootstrap passwords.",
    );
  }
  const users: AuthUserRecord[] = bootstrapUsers.map((user) => {
    const hashed = hashPassword(user.password);
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: normalizeRole(user.role),
      enabled: true,
      createdAt: now,
      lastLogin: null,
      ...hashed,
    };
  });
  writeFileSync(AUTH_USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

function readAuthUsers(): AuthUserRecord[] {
  ensureAuthUserFile();
  try {
    const raw = readFileSync(AUTH_USERS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const users = parsed.map((entry: any) => ({
      id: String(entry.id || ""),
      username: String(entry.username || "").trim(),
      fullName: String(entry.fullName || entry.username || "").trim(),
      role: normalizeRole(entry.role),
      enabled: entry.enabled !== false,
      createdAt: String(entry.createdAt || new Date().toISOString()),
      lastLogin: entry.lastLogin ? String(entry.lastLogin) : null,
      passwordHash: String(entry.passwordHash || ""),
      passwordSalt: String(entry.passwordSalt || ""),
    }));
    const normalized = migrateLegacyBootstrapUsernames(users);
    if (normalized.changed) {
      writeAuthUsers(normalized.users);
    }
    return normalized.users;
  } catch {
    return [];
  }
}

function writeAuthUsers(users: AuthUserRecord[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(AUTH_USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

function sanitizeUsername(username: string) {
  return String(username || "").trim().toLowerCase();
}

function migrateLegacyBootstrapUsernames(users: AuthUserRecord[]) {
  let changed = false;
  const normalizedUsers = [...users];

  const hasOperator = normalizedUsers.some((entry) => sanitizeUsername(entry.username) === "operator");
  const hasViewer = normalizedUsers.some((entry) => sanitizeUsername(entry.username) === "viewer");

  const legacyOperatorIdx = normalizedUsers.findIndex(
    (entry) => entry.id === "2" && sanitizeUsername(entry.username) === "operator1",
  );
  if (legacyOperatorIdx >= 0 && !hasOperator) {
    normalizedUsers[legacyOperatorIdx] = {
      ...normalizedUsers[legacyOperatorIdx],
      username: "operator",
    };
    changed = true;
  }

  const legacyViewerIdx = normalizedUsers.findIndex(
    (entry) => entry.id === "3" && sanitizeUsername(entry.username) === "viewer1",
  );
  if (legacyViewerIdx >= 0 && !hasViewer) {
    normalizedUsers[legacyViewerIdx] = {
      ...normalizedUsers[legacyViewerIdx],
      username: "viewer",
    };
    changed = true;
  }

  return { users: normalizedUsers, changed };
}

function toAuthenticatedUser(record: AuthUserRecord): AuthenticatedUser {
  return {
    id: record.id,
    username: record.username,
    fullName: record.fullName,
    role: normalizeRole(record.role),
    enabled: record.enabled !== false,
  };
}

function toAdminView(record: AuthUserRecord): AuthUserAdminView {
  return {
    id: record.id,
    username: record.username,
    fullName: record.fullName,
    role: normalizeRole(record.role),
    enabled: record.enabled !== false,
    createdAt: record.createdAt,
    lastLogin: record.lastLogin,
  };
}

export function authenticateWithPassword(username: string, password: string): AuthenticatedUser | null {
  const normalizedUsername = sanitizeUsername(username);
  const pass = String(password || "");
  if (!normalizedUsername || !pass) return null;

  const users = readAuthUsers();
  const user = users.find((entry) => sanitizeUsername(entry.username) === normalizedUsername);
  if (!user || user.enabled === false || !user.passwordHash || !user.passwordSalt) {
    return null;
  }

  const computed = hashPassword(pass, user.passwordSalt);
  const valid = safeCompareHex(computed.passwordHash, user.passwordHash);
  if (!valid) return null;

  user.lastLogin = new Date().toISOString();
  writeAuthUsers(users);
  return toAuthenticatedUser(user);
}

export function getAuthenticatedUserById(userId: string): AuthenticatedUser | null {
  const users = readAuthUsers();
  const user = users.find((entry) => entry.id === String(userId || ""));
  if (!user || user.enabled === false) return null;
  return toAuthenticatedUser(user);
}

export function listAuthUsers(): AuthUserAdminView[] {
  const users = readAuthUsers();
  return users
    .map((user) => toAdminView(user))
    .sort((a, b) => a.username.localeCompare(b.username));
}

export function createAuthUser(input: {
  username: string;
  fullName?: string;
  password: string;
  role: string;
  enabled?: boolean;
}): AuthUserAdminView {
  const users = readAuthUsers();
  const username = sanitizeUsername(input.username);
  if (!username || username.length < 3) {
    throw new Error("username must be at least 3 characters");
  }
  if (String(input.password || "").length < 8) {
    throw new Error("password must be at least 8 characters");
  }
  if (users.some((entry) => sanitizeUsername(entry.username) === username)) {
    throw new Error("username already exists");
  }

  const now = new Date().toISOString();
  const hashed = hashPassword(String(input.password || ""));
  const nextUser: AuthUserRecord = {
    id: `${Date.now()}-${randomBytes(4).toString("hex")}`,
    username,
    fullName: String(input.fullName || username).trim() || username,
    role: normalizeRole(input.role),
    enabled: input.enabled !== false,
    createdAt: now,
    lastLogin: null,
    passwordHash: hashed.passwordHash,
    passwordSalt: hashed.passwordSalt,
  };
  users.push(nextUser);
  writeAuthUsers(users);
  return toAdminView(nextUser);
}

export function updateAuthUser(
  userId: string,
  updates: Partial<{ username: string; fullName: string; role: string; enabled: boolean }>,
): AuthUserAdminView {
  const users = readAuthUsers();
  const idx = users.findIndex((entry) => entry.id === String(userId || ""));
  if (idx < 0) {
    throw new Error("user not found");
  }
  const user = users[idx];
  const nextUsername =
    updates.username != null ? sanitizeUsername(String(updates.username || "")) : sanitizeUsername(user.username);
  if (!nextUsername || nextUsername.length < 3) {
    throw new Error("username must be at least 3 characters");
  }
  if (
    users.some(
      (entry, entryIdx) => entryIdx !== idx && sanitizeUsername(entry.username) === nextUsername,
    )
  ) {
    throw new Error("username already exists");
  }

  // Last-admin invariant: at least one enabled admin must remain (check before applying updates)
  const wasEnabledAdmin = normalizeRole(user.role) === "admin" && user.enabled !== false;
  const wouldDemoteOrDisable =
    (updates.role != null && normalizeRole(updates.role) !== "admin") ||
    (updates.enabled === false) ||
    (updates.enabled != null && !updates.enabled);
  if (wasEnabledAdmin && wouldDemoteOrDisable) {
    const otherEnabledAdmins = users.filter(
      (e, i) => i !== idx && normalizeRole(e.role) === "admin" && e.enabled !== false,
    );
    if (otherEnabledAdmins.length === 0) {
      throw new Error("cannot demote or disable the last admin user");
    }
  }

  user.username = nextUsername;
  if (updates.fullName != null) {
    user.fullName = String(updates.fullName || "").trim() || nextUsername;
  }
  if (updates.role != null) {
    user.role = normalizeRole(updates.role);
  }
  if (updates.enabled != null) {
    user.enabled = Boolean(updates.enabled);
  }
  users[idx] = user;
  writeAuthUsers(users);
  return toAdminView(user);
}

export function resetAuthUserPassword(userId: string, password: string): AuthUserAdminView {
  if (String(password || "").length < 8) {
    throw new Error("password must be at least 8 characters");
  }
  const users = readAuthUsers();
  const idx = users.findIndex((entry) => entry.id === String(userId || ""));
  if (idx < 0) {
    throw new Error("user not found");
  }
  const hashed = hashPassword(password);
  users[idx].passwordHash = hashed.passwordHash;
  users[idx].passwordSalt = hashed.passwordSalt;
  writeAuthUsers(users);
  return toAdminView(users[idx]);
}

export function deleteAuthUser(userId: string) {
  const users = readAuthUsers();
  const idx = users.findIndex((entry) => entry.id === String(userId || ""));
  if (idx < 0) {
    throw new Error("user not found");
  }
  const user = users[idx];
  const remainingAdmins = users.filter((entry) => entry.id !== user.id && normalizeRole(entry.role) === "admin");
  if (normalizeRole(user.role) === "admin" && remainingAdmins.length === 0) {
    throw new Error("cannot delete the last admin user");
  }
  users.splice(idx, 1);
  writeAuthUsers(users);
}
