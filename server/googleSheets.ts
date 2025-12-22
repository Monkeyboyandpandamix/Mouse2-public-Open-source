// Google Sheets Integration for M.O.U.S.E GCS Data Backup
import { google } from 'googleapis';
import { getAccessToken as getAuthToken } from './googleAuth.js';

async function getAccessToken() {
  return getAuthToken('google-sheet');
}

export async function getGoogleSheetsClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

export async function getDriveClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

// Create or get the M.O.U.S.E backup spreadsheet
export async function getOrCreateBackupSpreadsheet(): Promise<string> {
  const drive = await getDriveClient();
  const sheets = await getGoogleSheetsClient();
  
  // Search for existing spreadsheet
  const searchResult = await drive.files.list({
    q: "name='M.O.U.S.E GCS Backup' and mimeType='application/vnd.google-apps.spreadsheet'",
    fields: 'files(id, name)',
  });

  if (searchResult.data.files && searchResult.data.files.length > 0) {
    return searchResult.data.files[0].id!;
  }

  // Create new spreadsheet with tabs for each data type
  const spreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'M.O.U.S.E GCS Backup',
      },
      sheets: [
        { properties: { title: 'Missions' } },
        { properties: { title: 'Waypoints' } },
        { properties: { title: 'FlightSessions' } },
        { properties: { title: 'FlightLogs' } },
        { properties: { title: 'FlightEvents' } },
        { properties: { title: 'Settings' } },
        { properties: { title: 'SyncLog' } },
      ],
    },
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId!;

  // Add headers to each sheet
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        {
          range: 'Missions!A1:H1',
          values: [['ID', 'Name', 'Description', 'Status', 'Home Lat', 'Home Lon', 'Home Alt', 'Created At']],
        },
        {
          range: 'Waypoints!A1:I1',
          values: [['ID', 'Mission ID', 'Order', 'Latitude', 'Longitude', 'Altitude', 'Speed', 'Action', 'Address']],
        },
        {
          range: 'FlightSessions!A1:K1',
          values: [['ID', 'Mission ID', 'Start Time', 'End Time', 'Status', 'Flight Time', 'Max Alt', 'Distance', 'Video Path', 'Log Path', '3D Model']],
        },
        {
          range: 'FlightLogs!A1:O1',
          values: [['ID', 'Mission ID', 'Timestamp', 'Lat', 'Lon', 'Alt', 'Heading', 'Speed', 'Battery V', 'Battery %', 'Flight Mode', 'Armed', 'Pitch', 'Roll', 'Yaw']],
        },
        {
          range: 'FlightEvents!A1:H1',
          values: [['ID', 'Session ID', 'Timestamp', 'Event Type', 'Event Data', 'Lat', 'Lon', 'Alt']],
        },
        {
          range: 'Settings!A1:D1',
          values: [['ID', 'Key', 'Value', 'Category']],
        },
        {
          range: 'SyncLog!A1:C1',
          values: [['Timestamp', 'Table', 'Rows Synced']],
        },
      ],
    },
  });

  return spreadsheetId;
}

// Sync data to Google Sheets
export async function syncDataToSheets(data: {
  missions?: any[];
  waypoints?: any[];
  flightSessions?: any[];
  flightLogs?: any[];
  flightEvents?: any[];
  settings?: any[];
}): Promise<{ success: boolean; spreadsheetId: string; syncedTables: string[] }> {
  const sheets = await getGoogleSheetsClient();
  const spreadsheetId = await getOrCreateBackupSpreadsheet();
  const syncedTables: string[] = [];
  const timestamp = new Date().toISOString();

  // Sync missions
  if (data.missions && data.missions.length > 0) {
    const values = data.missions.map(m => [
      m.id, m.name, m.description, m.status, m.homeLatitude, m.homeLongitude, m.homeAltitude, m.createdAt
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Missions!A2:H${values.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    syncedTables.push('Missions');
  }

  // Sync waypoints
  if (data.waypoints && data.waypoints.length > 0) {
    const values = data.waypoints.map(w => [
      w.id, w.missionId, w.order, w.latitude, w.longitude, w.altitude, w.speed, w.action, w.address
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Waypoints!A2:I${values.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    syncedTables.push('Waypoints');
  }

  // Sync flight sessions
  if (data.flightSessions && data.flightSessions.length > 0) {
    const values = data.flightSessions.map(s => [
      s.id, s.missionId, s.startTime, s.endTime, s.status, s.totalFlightTime, s.maxAltitude, s.totalDistance, s.videoFilePath, s.logFilePath, s.model3dFilePath
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `FlightSessions!A2:K${values.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    syncedTables.push('FlightSessions');
  }

  // Sync flight logs
  if (data.flightLogs && data.flightLogs.length > 0) {
    const values = data.flightLogs.map(l => [
      l.id, l.missionId, l.timestamp, l.latitude, l.longitude, l.altitude, l.heading, l.groundSpeed, l.batteryVoltage, l.batteryPercent, l.flightMode, l.armed, l.pitch, l.roll, l.yaw
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `FlightLogs!A2:O${values.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    syncedTables.push('FlightLogs');
  }

  // Sync settings
  if (data.settings && data.settings.length > 0) {
    const values = data.settings.map(s => [
      s.id, s.key, JSON.stringify(s.value), s.category
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Settings!A2:D${values.length + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    });
    syncedTables.push('Settings');
  }

  // Add sync log entry
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'SyncLog!A:C',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[timestamp, syncedTables.join(', '), syncedTables.length]],
    },
  });

  return { success: true, spreadsheetId, syncedTables };
}

// Get spreadsheet URL
export function getSpreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}
