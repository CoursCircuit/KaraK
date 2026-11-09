const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { alignAudio } = require('./alignment');

let alignment;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 820,
    minHeight: 560,
    backgroundColor: '#0b0f14',
    title: 'KaraK',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      message: 'Quitter sans enregistrer les modifications ?',
      buttons: ['Annuler', 'Quitter sans enregistrer'],
      defaultId: 0,
      cancelId: 0
    });
    if (choice === 1) event.preventDefault();
  });

  mainWindow.on('closed', () => {
    alignment?.abort();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
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

function ensureJsonExtension(filePath) {
  if (!filePath) return filePath;
  return filePath.toLowerCase().endsWith('.json') ? filePath : `${filePath}.json`;
}

ipcMain.handle('audio:open', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choisir un fichier audio',
    properties: ['openFile'],
    filters: [
      { name: 'Audio', extensions: ['mp3', 'm4a', 'wav', 'aac'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('text:open', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Importer un texte de paroles',
    properties: ['openFile'],
    filters: [
      { name: 'Textes', extensions: ['txt'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const text = (await fs.readFile(filePath, 'utf-8')).replace(/^\uFEFF/, '');
  return { path: filePath, text };
});

ipcMain.handle('project:open', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Ouvrir un projet KaraK',
    properties: ['openFile'],
    filters: [
      { name: 'Projet KaraK', extensions: ['json'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const raw = (await fs.readFile(filePath, 'utf-8')).replace(/^\uFEFF/, '');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error('Le fichier projet est illisible ou corrompu.');
  }
  if (typeof data?.audioRelativePath === 'string' && data.audioRelativePath) {
    const candidate = path.resolve(path.dirname(filePath), data.audioRelativePath);
    try {
      if ((await fs.stat(candidate)).isFile()) data.audioPath = candidate;
    } catch {
      // Older projects and moved projects can still use the original absolute path.
    }
  }
  return { path: filePath, data };
});

ipcMain.handle('project:save', async (_event, payload) => {
  const data = payload?.data;
  let targetPath = payload?.path;
  if (!data) throw new Error('Aucune donnée à enregistrer.');

  if (!targetPath) {
    const result = await dialog.showSaveDialog({
      title: 'Enregistrer le projet',
      defaultPath: 'karaok.json',
      filters: [{ name: 'Projet KaraK', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return null;
    targetPath = result.filePath;
  }
  targetPath = ensureJsonExtension(targetPath);
  await writeProject(targetPath, data);
  return targetPath;
});

ipcMain.handle('project:saveAs', async (_event, payload) => {
  const data = payload?.data;
  if (!data) throw new Error('Aucune donnée à enregistrer.');
  const result = await dialog.showSaveDialog({
    title: 'Enregistrer le projet sous',
    defaultPath: 'karaok.json',
    filters: [{ name: 'Projet KaraK', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return null;
  const targetPath = ensureJsonExtension(result.filePath);
  await writeProject(targetPath, data);
  return targetPath;
});

ipcMain.handle('app:setFullscreen', (event, flag) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  win.setFullScreen(!!flag);
  return win.isFullScreen();
});

ipcMain.handle('app:toggleFullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});

async function writeProject(targetPath, data) {
  const audioRelativePath = typeof data.audioPath === 'string' && data.audioPath
    ? path.relative(path.dirname(targetPath), data.audioPath)
    : '';
  const temporary = path.join(path.dirname(targetPath), `.karak-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, JSON.stringify({ ...data, audioRelativePath }, null, 2), { flag: 'wx' });
    await fs.rename(temporary, targetPath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

ipcMain.handle('audio:url', (_event, filePath) => pathToFileURL(filePath).href);

ipcMain.handle('alignment:start', async (_event, { audioPath, lines, language, anchors, duration }) => {
  if (alignment) return { error: 'Une analyse est déjà en cours.' };
  const controller = new AbortController();
  alignment = controller;
  const resources = app.isPackaged
    ? path.join(process.resourcesPath, 'alignment')
    : path.join(__dirname, 'assets', 'alignment');
  try {
    const times = await alignAudio({ audioPath, lines, language, anchors, duration, resources, signal: controller.signal });
    return { times };
  } catch (error) {
    return controller.signal.aborted ? { canceled: true } : { error: error.message };
  } finally {
    alignment = null;
  }
});

ipcMain.handle('alignment:cancel', () => alignment?.abort());
