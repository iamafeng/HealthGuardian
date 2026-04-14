const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, net, shell, session, dialog, Notification: ElectronNotification } = require('electron');
const path = require('path');
const fs = require('fs');

// 开发模式下强制使用正确的应用名，避免数据写入通用 Electron 目录
app.setName('HealthGuardian');
if (process.env.NODE_ENV !== 'production') {
  app.setPath('userData', require('path').join(app.getPath('appData'), 'HealthGuardian'));
}

// ─── 单例锁：防止多开，避免多进程导致重复提醒通知 ──────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // 已有实例在运行，直接退出新实例
  app.quit();
}

// 当第二个实例尝试启动时，聚焦已有主窗口而非新建窗口
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

let mainWindow;
let widgetWindow = null;
let tray = null;
let backendUrl = 'http://localhost:8080';
let usedPort = '8080';
let pollTimeout = null;
let _trayBalloonShown = false; // 仅在第一次最小化到托盘时气泡提示

// 加载用户配置
function loadConfig() {
  try {
    const userConfigPath = path.join(app.getPath('userData'), 'hg-config.json');
    if (fs.existsSync(userConfigPath)) {
      const config = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
      if (config.backendUrl && config.backendUrl.trim() !== "") {
        backendUrl = config.backendUrl.trim();
        return;
      }
    }

    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.backendUrl && config.backendUrl.trim() !== "") {
        backendUrl = config.backendUrl.trim();
        return;
      }
    }

    const propsPath = path.join(__dirname, '../src/main/resources/application.properties');
    if (fs.existsSync(propsPath)) {
      const props = fs.readFileSync(propsPath, 'utf8');
      const portMatch = props.match(/^server\.port\s*=\s*(\d+)/m);
      if (portMatch) {
        usedPort = portMatch[1];
        backendUrl = `http://localhost:${usedPort}`;
      }
    }
  } catch (e) {
    console.log('读取配置失败，使用默认地址', backendUrl);
  }
}

ipcMain.on('update-backend-url', (event, newUrl) => {
  backendUrl = newUrl;
  try {
    const userConfigPath = path.join(app.getPath('userData'), 'hg-config.json');
    fs.writeFileSync(userConfigPath, JSON.stringify({ backendUrl }, null, 2), 'utf8');
  } catch (e) {
    console.error('保存配置失败:', e);
  }
  if (pollTimeout) clearTimeout(pollTimeout);
  console.log('后端地址已更新，尝试重连:', backendUrl);
  checkBackendStatusAndLoad();
});

// 禁用硬件加速，兼容性更好
app.disableHardwareAcceleration();

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'HealthGuardian',
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 700,
    show: false, // 等待加载完再显示，避免白屏
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  checkBackendStatusAndLoad();

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      // 弹出对话框让用户选择
      dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['最小化到托盘', '彻底退出'],
        defaultId: 0,
        cancelId: 0,
        title: 'HealthGuardian',
        message: '关闭窗口后如何处理？',
        detail: '最小化到托盘：程序继续在后台运行，可通过托盘图标重新打开。\n彻底退出：完全关闭程序。',
      }).then(({ response }) => {
        if (response === 1) {
          // 彻底退出
          app.isQuiting = true;
          app.quit();
        } else {
          // 最小化到托盘
          mainWindow.hide();
          if (!_trayBalloonShown && tray) {
            _trayBalloonShown = true;
            try {
              tray.displayBalloon({
                iconType: 'info',
                title: 'HealthGuardian 仍在运行',
                content: '程序已最小化到系统托盘，双击托盘图标可重新打开。\n如需彻底退出，请右键托盘图标 → 彻底退出。',
              });
            } catch (_) {}
          }
        }
      });
    }
  });
}

// ─── 向渲染进程注入 GuardianDesktop 环境标识 ─────────────────────────────────────
function injectElectronFlag(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript('window.isGuardianDesktopApp = true;').catch(() => {});
}

// ─── 🏝️ 健康灵动岛悬浮窗 ──────────────────────────────────────────────────
function createWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.show();
    widgetWindow.focus();
    return;
  }
  widgetWindow = new BrowserWindow({
    width: 140,
    height: 140,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  widgetWindow.setAlwaysOnTop(true, 'floating');
  widgetWindow.loadURL(backendUrl + '/widget.html');
  // 右下角初始位置（留出展开空间）
  const { screen } = require('electron');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  widgetWindow.setPosition(width - 260, height - 330);

  widgetWindow.on('closed', () => { widgetWindow = null; });
}

function toggleWidget() {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    createWidget();
  } else if (widgetWindow.isVisible()) {
    widgetWindow.hide();
  } else {
    widgetWindow.show();
  }
}

// IPC：灵动岛关闭 / 最小化 / 呼出主窗口
ipcMain.on('widget-close',     () => { if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.hide(); });
ipcMain.on('widget-minimize',  () => { if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.minimize(); });
ipcMain.on('widget-open-main', () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); } });

// IPC：宠物精灵悬浮窗展开/收起（保持左上角位置不变，向下展开）
ipcMain.on('widget-expand', (event, { width, height }) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    const pos = widgetWindow.getPosition();
    widgetWindow.setBounds({ x: pos[0], y: pos[1], width, height });
  }
});

// IPC：宠物精灵窗口拖拽
let _widgetDragOrigin = null;
ipcMain.on('widget-drag-start', () => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    _widgetDragOrigin = widgetWindow.getPosition();
  }
});
ipcMain.on('widget-move', (event, { dx, dy }) => {
  if (widgetWindow && !widgetWindow.isDestroyed() && _widgetDragOrigin) {
    widgetWindow.setPosition(_widgetDragOrigin[0] + dx, _widgetDragOrigin[1] + dy);
  }
});

// IPC：原生系统通知（无需 Web 权限弹窗）
ipcMain.on('show-notification', (event, { title, body }) => {
  try {
    const n = new ElectronNotification({ title, body, silent: false });
    n.show();
  } catch (e) {
    console.log('原生通知发送失败:', e);
  }
});

// 检查后端是否启动
function checkBackendStatusAndLoad() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const request = net.request(backendUrl);
  request.on('response', () => {
    // 后端已连通
    if (pollTimeout) clearTimeout(pollTimeout);
    mainWindow.loadURL(backendUrl);
    mainWindow.once('ready-to-show', () => { mainWindow.show(); });
    // 注入 Electron 标识，页面加载完成后触发
    mainWindow.webContents.on('did-finish-load', () => { injectElectronFlag(mainWindow); });

  // 外部链接（target="_blank"）用系统浏览器打开，不在 Electron 内置窗口中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(backendUrl)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
  });
  request.on('error', () => {
    // 后端未连通，加载错误页面
    mainWindow.loadFile(path.join(__dirname, 'error.html'), { query: { url: backendUrl } });
    mainWindow.once('ready-to-show', () => { mainWindow.show(); });
    // 同时也开始轮询，一旦启动自动刷新
    if (pollTimeout) clearTimeout(pollTimeout);
    pollTimeout = setTimeout(checkBackendStatusAndLoad, 5000);
  });
  request.end();
}

function createTray() {
  try {
    const { nativeImage } = require('electron');
    // 优先用打包进 asar 的 icon.ico，开发模式下 fallback 到 static/favicon.ico
    const iconInElectron = path.join(__dirname, 'icon.ico');
    const iconInStatic   = path.join(__dirname, '../src/main/resources/static/favicon.ico');
    const icon = fs.existsSync(iconInElectron) ? iconInElectron
               : fs.existsSync(iconInStatic)   ? iconInStatic
               : nativeImage.createEmpty();
    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
        { label: '显示控制板', click: () => { mainWindow.show(); mainWindow.focus(); } },
        { label: '🐾 切换宠物精灵', click: () => toggleWidget() },
        { label: '👤 账号同步（跨端登录）', click: () => {
            mainWindow.show(); mainWindow.focus();
            mainWindow.webContents.executeJavaScript("UI && UI.modal && UI.modal.showAuth();").catch(() => {});
          }
        },
        { label: '修改服务器地址', click: () => {
            mainWindow.loadFile(path.join(__dirname, 'error.html'), { query: { url: backendUrl } });
            mainWindow.show(); mainWindow.focus();
          }
        },
        { type: 'separator' },
        { label: '⭐ GitHub 开源地址', click: () => shell.openExternal('https://github.com/iamafeng/HealthGuardian') },
        { label: '☕ 赏作者一杯咖啡', click: () => {
            mainWindow.show(); mainWindow.focus();
            mainWindow.webContents.executeJavaScript("UI && UI.modal && UI.modal.show('donate-modal');").catch(() => {});
          }
        },
        { type: 'separator' },
        { label: '彻底退出', click: () => { app.isQuiting = true; app.quit(); } }
      ]);
      tray.setToolTip('HealthGuardian · 健康守护者');
      tray.setContextMenu(contextMenu);
      tray.on('double-click', () => { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); });
  } catch(e) { console.log("Tray 初始化异常, 可忽略", e); }
}

app.whenReady().then(() => {
  loadConfig();

  // 自动授予通知权限 — 桌面端无需弹框询问用户
  const ALLOWED_PERMS = new Set(['notifications', 'media', 'geolocation']);
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(ALLOWED_PERMS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ALLOWED_PERMS.has(permission);
  });

  createWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
    }
  });
  // Ctrl+Shift+W 切换灵动岛
  globalShortcut.register('CommandOrControl+Shift+W', () => toggleWidget());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
