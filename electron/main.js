const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;
let backendUrl = 'http://localhost:8080';
let usedPort = '8080';
let pollTimeout = null;

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
      contextIsolation: false
    }
  });

  checkBackendStatusAndLoad();

  mainWindow.on('close', (event) => {
    if(!app.isQuiting){
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// ─── 向渲染进程注入 Electron 环境标识 ─────────────────────────────────────
function injectElectronFlag(win) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript('window.isElectronApp = true;').catch(() => {});
}

// 检查后端是否启动
function checkBackendStatusAndLoad() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const request = net.request(backendUrl);
  request.on('response', (response) => {
    // 后端已连通
    if (pollTimeout) clearTimeout(pollTimeout);
    mainWindow.loadURL(backendUrl);
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
    // 注入 Electron 标识，页面加载完成后触发
    mainWindow.webContents.on('did-finish-load', () => {
      injectElectronFlag(mainWindow);
    });
  });
  
  request.on('error', (error) => {
    // 后端未连通，加载错误页面
    mainWindow.loadFile(path.join(__dirname, 'error.html'), { query: { url: backendUrl } });
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });
    // 同时也开始轮询，一旦启动自动刷新
    if (pollTimeout) clearTimeout(pollTimeout);
    pollTimeout = setTimeout(checkBackendStatusAndLoad, 5000);
  });
  
  request.end();
}

function createTray() {
  // 生产环境中如果不想要图标报错，可以捕获或者放一个默认透明或真实存在的 icon
  try {
    const iconPath = path.join(__dirname, '../src/main/resources/static/favicon.ico');
    if (fs.existsSync(iconPath)) {
      tray = new Tray(iconPath);
    } else {
      // 如果找不到 favicon，就使用 Electron 内置的一个空白 Tray（不推荐但在开发阶段防报错）
      // 这里暂时不创建原生 tray 以防崩溃，或者也可以用 nativeImage 创建一个简单的图标
    }

    if (tray) {
      const contextMenu = Menu.buildFromTemplate([
        { label: '显示控制板', click: () => { mainWindow.show(); mainWindow.focus(); } },
        { label: '👤 账号同步（跨端登录）', click: () => {
              mainWindow.show(); mainWindow.focus();
              // 触发前端打开身份同步弹窗
              mainWindow.webContents.executeJavaScript("UI && UI.modal && UI.modal.showAuth();").catch(() => {});
            }
        },
        { label: '修改服务器地址', click: () => {
             mainWindow.loadFile(path.join(__dirname, 'error.html'), { query: { url: backendUrl } });
             mainWindow.show();
             mainWindow.focus();
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
      tray.on('double-click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      });
    }
  } catch(e) {
    console.log("Tray 初始化异常, 可忽略", e);
  }
}

app.whenReady().then(() => {
  loadConfig();
  createWindow();
  createTray();

  // 注册全局快捷键 (例如: Shift+Ctrl+H 呼出)
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
