// Google OAuth Manager for M.O.U.S.E. GCS
// Handles standalone OAuth 2.0 flow with multi-account support
// Falls back to Replit connectors when available

import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const DATA_DIR = './data';
const AUTH_FILE = path.join(DATA_DIR, 'google_auth.json');

// Encryption key derived from environment - REQUIRED for secure operation
// Falls back to REPL_ID for development in Replit environment
function getEncryptionKey(): Buffer {
  const keySource = process.env.GOOGLE_AUTH_ENCRYPTION_KEY ||
                    process.env.SESSION_SECRET ||
                    process.env.REPL_ID;

  if (!keySource) {
    // Only warn when Google OAuth is actually used (configured or has existing tokens)
    const hasOAuth = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
    const hasAuthFile = fs.existsSync(AUTH_FILE);
    if (hasOAuth || hasAuthFile) {
      const envHint = process.env.NODE_ENV === 'production' ? ' (required in production)' : '';
      console.warn('WARNING: No encryption key configured for Google OAuth tokens' + envHint + '.');
      console.warn('Set GOOGLE_AUTH_ENCRYPTION_KEY or SESSION_SECRET for secure token storage.');
    }
    // Use a machine-derived key for development only (tokens will not survive restart)
    return crypto.createHash('sha256').update(
      crypto.randomBytes(32).toString('hex') + Date.now().toString()
    ).digest();
  }

  return crypto.createHash('sha256').update(keySource).digest();
}

const ENCRYPTION_KEY = getEncryptionKey();

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  try {
    const [ivHex, encryptedHex] = text.split(':');
    if (!ivHex || !encryptedHex) return text; // Not encrypted (legacy)
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return text; // Return as-is if decryption fails (legacy data)
  }
}

interface GoogleAccount {
  id: string;
  email: string;
  name: string;
  picture?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  addedAt: string;
}

interface StoredGoogleAccount {
  id: string;
  email: string;
  name: string;
  picture?: string;
  encryptedAccessToken: string;
  encryptedRefreshToken?: string;
  expiresAt: number;
  addedAt: string;
}

interface AuthStore {
  activeAccountId: string | null;
  accounts: StoredGoogleAccount[];
}

// OAuth 2.0 client credentials (for installed/desktop app flow)
// Users can set these via environment variables for their own Google Cloud project
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/api/google/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Convert stored account (encrypted) to runtime account (decrypted)
function decryptAccount(stored: StoredGoogleAccount): GoogleAccount {
  return {
    id: stored.id,
    email: stored.email,
    name: stored.name,
    picture: stored.picture,
    accessToken: decrypt(stored.encryptedAccessToken),
    refreshToken: stored.encryptedRefreshToken ? decrypt(stored.encryptedRefreshToken) : undefined,
    expiresAt: stored.expiresAt,
    addedAt: stored.addedAt
  };
}

// Convert runtime account (decrypted) to stored account (encrypted)
function encryptAccount(account: GoogleAccount): StoredGoogleAccount {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    picture: account.picture,
    encryptedAccessToken: encrypt(account.accessToken),
    encryptedRefreshToken: account.refreshToken ? encrypt(account.refreshToken) : undefined,
    expiresAt: account.expiresAt,
    addedAt: account.addedAt
  };
}

function loadAuthStore(): { activeAccountId: string | null; accounts: GoogleAccount[] } {
  ensureDataDir();
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const stored: AuthStore = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
      return {
        activeAccountId: stored.activeAccountId,
        accounts: stored.accounts.map(a => decryptAccount(a))
      };
    } catch (e) {
      console.error('Failed to load auth store:', e);
    }
  }
  return { activeAccountId: null, accounts: [] };
}

function saveAuthStore(store: { activeAccountId: string | null; accounts: GoogleAccount[] }) {
  ensureDataDir();
  const encrypted: AuthStore = {
    activeAccountId: store.activeAccountId,
    accounts: store.accounts.map(a => encryptAccount(a))
  };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
}

// Check if running in Replit environment with connectors
function isReplitEnvironment(): boolean {
  return !!(process.env.REPLIT_CONNECTORS_HOSTNAME && 
           (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
}

// Get Replit connector token (for backward compatibility)
async function getReplitConnectorToken(connectorName: string): Promise<string | null> {
  if (!isReplitEnvironment()) return null;
  
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken) return null;

    const response = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${connectorName}`,
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );
    
    const data = await response.json();
    const connection = data.items?.[0];
    
    return connection?.settings?.access_token || 
           connection?.settings?.oauth?.credentials?.access_token || 
           null;
  } catch (e) {
    return null;
  }
}

// Create OAuth2 client
function createOAuth2Client() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

// Generate OAuth authorization URL
export function getAuthUrl(): { url: string; state: string } | { error: string } {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return { 
      error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.' 
    };
  }
  
  const oauth2Client = createOAuth2Client();
  const state = crypto.randomBytes(16).toString('hex');
  
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent' // Force consent to get refresh token
  });
  
  return { url, state };
}

// Exchange authorization code for tokens
export async function handleOAuthCallback(code: string): Promise<{ success: boolean; account?: GoogleAccount; error?: string }> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return { success: false, error: 'Google OAuth not configured' };
  }
  
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    
    oauth2Client.setCredentials(tokens);
    
    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    const account: GoogleAccount = {
      id: userInfo.data.id || crypto.randomUUID(),
      email: userInfo.data.email || 'unknown@email.com',
      name: userInfo.data.name || 'Unknown',
      picture: userInfo.data.picture || undefined,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token || undefined,
      expiresAt: tokens.expiry_date || Date.now() + 3600000,
      addedAt: new Date().toISOString()
    };
    
    // Save to store
    const store = loadAuthStore();
    const existingIndex = store.accounts.findIndex(a => a.email === account.email);
    
    if (existingIndex >= 0) {
      // Update existing account
      store.accounts[existingIndex] = {
        ...store.accounts[existingIndex],
        ...account,
        refreshToken: account.refreshToken || store.accounts[existingIndex].refreshToken
      };
    } else {
      store.accounts.push(account);
    }
    
    // Set as active if no active account
    if (!store.activeAccountId) {
      store.activeAccountId = account.id;
    }
    
    saveAuthStore(store);
    
    return { success: true, account };
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return { success: false, error: error.message || 'Failed to authenticate' };
  }
}

// Refresh access token
async function refreshAccessToken(account: GoogleAccount): Promise<GoogleAccount | null> {
  if (!account.refreshToken || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return null;
  }
  
  try {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: account.refreshToken });
    
    const { credentials } = await oauth2Client.refreshAccessToken();
    
    account.accessToken = credentials.access_token!;
    account.expiresAt = credentials.expiry_date || Date.now() + 3600000;
    
    // Save updated token
    const store = loadAuthStore();
    const index = store.accounts.findIndex(a => a.id === account.id);
    if (index >= 0) {
      store.accounts[index] = account;
      saveAuthStore(store);
    }
    
    return account;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

// Get access token for Google APIs
export async function getAccessToken(preferConnector: 'google-drive' | 'google-sheet' = 'google-drive'): Promise<string> {
  // First try Replit connectors (for development in Replit)
  const replitToken = await getReplitConnectorToken(preferConnector);
  if (replitToken) {
    return replitToken;
  }
  
  // Then try local accounts
  const store = loadAuthStore();
  let account = store.accounts.find(a => a.id === store.activeAccountId);
  
  if (!account && store.accounts.length > 0) {
    account = store.accounts[0];
    store.activeAccountId = account.id;
    saveAuthStore(store);
  }
  
  if (!account) {
    throw new Error('No Google account connected. Please sign in via Settings > Storage.');
  }
  
  // Check if token is expired (5 min buffer)
  if (account.expiresAt < Date.now() + 300000) {
    const refreshed = await refreshAccessToken(account);
    if (refreshed) {
      account = refreshed;
    } else {
      throw new Error('Session expired. Please sign in again.');
    }
  }
  
  return account.accessToken;
}

// Get active account info
export function getActiveAccount(): GoogleAccount | null {
  // Check Replit first
  if (isReplitEnvironment()) {
    return null; // Will use Replit connector
  }
  
  const store = loadAuthStore();
  return store.accounts.find(a => a.id === store.activeAccountId) || null;
}

// Get all accounts
export function getAllAccounts(): GoogleAccount[] {
  const store = loadAuthStore();
  return store.accounts.map(a => ({
    ...a,
    accessToken: '', // Don't expose tokens
    refreshToken: undefined
  }));
}

// Switch active account
export function switchAccount(accountId: string): boolean {
  const store = loadAuthStore();
  const account = store.accounts.find(a => a.id === accountId);
  
  if (!account) return false;
  
  store.activeAccountId = accountId;
  saveAuthStore(store);
  return true;
}

// Remove account
export function removeAccount(accountId: string): boolean {
  const store = loadAuthStore();
  const index = store.accounts.findIndex(a => a.id === accountId);
  
  if (index < 0) return false;
  
  store.accounts.splice(index, 1);
  
  if (store.activeAccountId === accountId) {
    store.activeAccountId = store.accounts[0]?.id || null;
  }
  
  saveAuthStore(store);
  return true;
}

// Check if OAuth is configured
export function isOAuthConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

// Check connection status
export async function checkConnectionStatus(): Promise<{
  mode: 'replit' | 'standalone' | 'unconfigured';
  connected: boolean;
  email?: string;
  accounts?: { id: string; email: string; name: string; picture?: string; active: boolean }[];
  error?: string;
}> {
  // Check Replit first
  if (isReplitEnvironment()) {
    try {
      const token = await getReplitConnectorToken('google-drive');
      if (token) {
        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: token });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        const about = await drive.about.get({ fields: 'user' });
        return {
          mode: 'replit',
          connected: true,
          email: about.data.user?.emailAddress || undefined
        };
      }
    } catch (e) {
      // Fall through to standalone
    }
  }
  
  // Check standalone OAuth
  if (!isOAuthConfigured()) {
    // Check if Replit environment without valid token
    if (isReplitEnvironment()) {
      return { mode: 'replit', connected: false, error: 'Replit Google integration not connected' };
    }
    return { mode: 'unconfigured', connected: false };
  }
  
  const store = loadAuthStore();
  const activeAccount = store.accounts.find(a => a.id === store.activeAccountId);
  
  // Connected if we have a valid access token (refresh token optional but recommended)
  const hasValidAccessToken = activeAccount && activeAccount.accessToken;
  const hasRefreshToken = activeAccount?.refreshToken;
  const isTokenExpired = activeAccount && activeAccount.expiresAt < Date.now();
  
  // Determine connection status and any warnings
  let connected = false;
  let error: string | undefined;
  
  if (hasValidAccessToken) {
    if (isTokenExpired && !hasRefreshToken) {
      connected = false;
      error = 'Session expired. Please sign in again.';
    } else {
      connected = true;
      if (!hasRefreshToken) {
        error = 'No refresh token. Session will expire and require re-authentication.';
      }
    }
  } else if (store.accounts.length > 0) {
    error = 'No active account selected.';
  }
  
  return {
    mode: 'standalone',
    connected,
    email: connected && activeAccount ? activeAccount.email : undefined,
    accounts: store.accounts.map(a => ({
      id: a.id,
      email: a.email,
      name: a.name,
      picture: a.picture,
      active: a.id === store.activeAccountId
    })),
    error
  };
}
