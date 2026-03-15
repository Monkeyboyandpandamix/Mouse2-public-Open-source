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

const DATA_DIR = path.resolve(process.cwd(), "data");
const AUTH_USERS_FILE = path.join(DATA_DIR, "auth_users.json");

const DEFAULT_USERS = [
  { id: "1", username: "admin", fullName: "System Administrator", role: "admin", password: "admin123" },
  { id: "2", username: "operator1", fullName: "Flight Operator", role: "operator", password: "operator123" },
  { id: "3", username: "viewer1", fullName: "Mission Observer", role: "viewer", password: "viewer123" },
] as const;

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
  const users: AuthUserRecord[] = DEFAULT_USERS.map((user) => {
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
    return parsed.map((entry: any) => ({
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

function toAuthenticatedUser(record: AuthUserRecord): AuthenticatedUser {
  return {
    id: record.id,
    username: record.username,
    fullName: record.fullName,
    role: normalizeRole(record.role),
    enabled: record.enabled !== false,
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
