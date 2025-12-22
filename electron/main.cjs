const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

let mainWindow;
let serverProcess;
const isDev = !app.isPackaged;
let PORT = parseInt(process.env.PORT || '5000', 10);

function getDataPath() {
  const userDataPath = app.getPath('userData');
  const dataPath = path.join(userDataPath, 'data');
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  return dataPath;
}

function getAppRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app');
  }
  return path.join(__dirname, '..');
}

function findAvailablePort(startPort) {
  return new Promise((resolve) => {
    const server = require('net').createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

function waitForServer(port, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          reject(new Error('Server health check failed'));
        }
      }).on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, 500);
        } else {
          reject(new Error('Server not responding'));
        }
      });
    };
    setTimeout(check, 1000);
  });
}

async function startServer() {
  PORT = await findAvailablePort(PORT);
  console.log(`Using port: ${PORT}`);
  
  const appRoot = getAppRoot();
  const serverPath = path.join(appRoot, 'dist', 'index.cjs');
  const dataPath = getDataPath();
  
  if (!fs.existsSync(serverPath)) {
    throw new Error(`Server bundle not found at: ${serverPath}`);
  }
  
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: PORT.toString(),
    DATA_DIR: dataPath,
    ELECTRON_APP: 'true'
  };

  const nodePath = process.execPath.includes('electron') 
    ? 'node' 
    : process.execPath;

  serverProcess = spawn(nodePath, [serverPath], {
    env,
    cwd: appRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data.toString().trim()}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server Error: ${data.toString().trim()}`);
  });

  serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
    dialog.showErrorBox('Server Error', `Failed to start server: ${error.message}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
    if (code !== 0 && code !== null && mainWindow) {
      dialog.showErrorBox('Server Error', `Server exited unexpectedly with code ${code}`);
    }
  });

  await waitForServer(PORT);
  console.log('Server is ready');
}

function createWindow() {
  const preloadPath = app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'electron', 'preload.cjs')
    : path.join(__dirname, 'preload.cjs');
    
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'M.O.U.S.E. Ground Control Station',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath
    },
    autoHideMenuBar: true,
    backgroundColor: '#1a1a2e',
    show: false
  });

  const url = `http://127.0.0.1:${PORT}`;
  
  mainWindow.loadURL(url);
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  let loadAttempts = 0;
  const maxLoadAttempts = 5;
  
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    loadAttempts++;
    console.log(`Load failed (attempt ${loadAttempts}): ${errorDescription}`);
    if (loadAttempts < maxLoadAttempts) {
      setTimeout(() => {
        mainWindow.loadURL(url);
      }, 1000);
    } else {
      dialog.showErrorBox('Connection Error', 
        'Failed to connect to the application server. Please try restarting the application.');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: externalUrl }) => {
    if (externalUrl.startsWith('http') && !externalUrl.includes('127.0.0.1') && !externalUrl.includes('localhost')) {
      shell.openExternal(externalUrl);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

app.whenReady().then(async () => {
  console.log('Starting M.O.U.S.E. Ground Control Station...');
  console.log('Data directory:', getDataPath());
  
  try {
    await startServer();
    console.log('Server started successfully');
  } catch (error) {
    console.error('Failed to start server:', error);
  }
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

ipcMain.handle('get-data-path', () => {
  return getDataPath();
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  return dialog.showOpenDialog(mainWindow, options);
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  return dialog.showSaveDialog(mainWindow, options);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
