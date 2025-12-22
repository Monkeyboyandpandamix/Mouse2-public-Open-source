// Google Drive integration for M.O.U.S.E. GCS
// Handles video footage uploads and file management

import { google, drive_v3 } from 'googleapis';
import { getAccessToken as getAuthToken } from './googleAuth.js';

async function getAccessToken(): Promise<string> {
  return getAuthToken('google-drive');
}

// Get a fresh Google Drive client (never cache - tokens expire)
async function getGoogleDriveClient(): Promise<drive_v3.Drive> {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

// Folder ID cache
let mouseFolderId: string | null = null;

// Get or create M.O.U.S.E. footage folder
async function getOrCreateMouseFolder(): Promise<string> {
  if (mouseFolderId) return mouseFolderId;
  
  const drive = await getGoogleDriveClient();
  
  // Search for existing folder
  const searchRes = await drive.files.list({
    q: "name='MOUSE_GCS_Footage' and mimeType='application/vnd.google-apps.folder' and trashed=false",
    spaces: 'drive',
    fields: 'files(id, name)'
  });

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    mouseFolderId = searchRes.data.files[0].id!;
    return mouseFolderId;
  }

  // Create folder
  const createRes = await drive.files.create({
    requestBody: {
      name: 'MOUSE_GCS_Footage',
      mimeType: 'application/vnd.google-apps.folder'
    },
    fields: 'id'
  });

  mouseFolderId = createRes.data.id!;
  return mouseFolderId;
}

// Get or create a session subfolder
async function getOrCreateSessionFolder(sessionId: string, sessionName: string): Promise<string> {
  const drive = await getGoogleDriveClient();
  const parentFolderId = await getOrCreateMouseFolder();
  
  const folderName = `Session_${sessionId}_${sessionName}`;
  
  // Search for existing session folder
  const searchRes = await drive.files.list({
    q: `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    spaces: 'drive',
    fields: 'files(id, name)'
  });

  if (searchRes.data.files && searchRes.data.files.length > 0) {
    return searchRes.data.files[0].id!;
  }

  // Create session folder
  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    },
    fields: 'id'
  });

  return createRes.data.id!;
}

export interface UploadResult {
  success: boolean;
  fileId?: string;
  webViewLink?: string;
  error?: string;
}

// Upload a file to Google Drive
export async function uploadFileToDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  sessionId?: string,
  sessionName?: string
): Promise<UploadResult> {
  try {
    const drive = await getGoogleDriveClient();
    
    let parentFolderId: string;
    if (sessionId && sessionName) {
      parentFolderId = await getOrCreateSessionFolder(sessionId, sessionName);
    } else {
      parentFolderId = await getOrCreateMouseFolder();
    }

    const { Readable } = await import('stream');
    const stream = Readable.from(fileBuffer);

    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentFolderId]
      },
      media: {
        mimeType: mimeType,
        body: stream
      },
      fields: 'id, webViewLink'
    });

    return {
      success: true,
      fileId: res.data.id!,
      webViewLink: res.data.webViewLink || undefined
    };
  } catch (error: any) {
    console.error('Google Drive upload error:', error);
    return {
      success: false,
      error: error.message || 'Upload failed'
    };
  }
}

// List files in the M.O.U.S.E. folder
export async function listDriveFiles(sessionId?: string, sessionName?: string): Promise<{
  success: boolean;
  files?: { id: string; name: string; webViewLink: string; size: string; modifiedTime: string }[];
  error?: string;
}> {
  try {
    const drive = await getGoogleDriveClient();
    
    let folderId: string;
    if (sessionId && sessionName) {
      folderId = await getOrCreateSessionFolder(sessionId, sessionName);
    } else {
      folderId = await getOrCreateMouseFolder();
    }

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      spaces: 'drive',
      fields: 'files(id, name, webViewLink, size, modifiedTime)',
      orderBy: 'modifiedTime desc'
    });

    return {
      success: true,
      files: (res.data.files || []).map(f => ({
        id: f.id!,
        name: f.name!,
        webViewLink: f.webViewLink || '',
        size: f.size || '0',
        modifiedTime: f.modifiedTime || ''
      }))
    };
  } catch (error: any) {
    console.error('Google Drive list error:', error);
    return {
      success: false,
      error: error.message || 'Failed to list files'
    };
  }
}

// Check connection status
export async function checkDriveConnection(): Promise<{ connected: boolean; email?: string; error?: string }> {
  try {
    const drive = await getGoogleDriveClient();
    const res = await drive.about.get({ fields: 'user' });
    return {
      connected: true,
      email: res.data.user?.emailAddress || undefined
    };
  } catch (error: any) {
    return {
      connected: false,
      error: error.message || 'Not connected'
    };
  }
}

// Delete a file from Google Drive
export async function deleteFileFromDrive(fileId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const drive = await getGoogleDriveClient();
    await drive.files.delete({ fileId });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Delete failed' };
  }
}
