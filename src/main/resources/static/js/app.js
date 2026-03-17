/**
 * HealthGuardian V3.5 - 核心逻辑控制器 (全能增强版)
 */

// ─── 主题预设 ─────────────────────────────────────────────────────────────────
const Themes = {
    cyber: {
        '--primary': '#00f2fe', '--secondary': '#4facfe', '--success': '#10b981',
        '--warning': '#f59e0b', '--accent': '#f43f5e', '--gold': '#fbbf24',
        '--glass': 'rgba(255, 255, 255, 0.03)', '--glass-hover': 'rgba(255, 255, 255, 0.06)',
        '--border': 'rgba(255, 255, 255, 0.12)', '--text-main': '#f8fafc', '--text-dim': '#94a3b8',
        '--bg-gradient': 'radial-gradient(circle at 0% 0%, #0f172a 0%, #1e293b 100%)',
        '--modal-bg': '#1e293b',
    },
    forest: {
        '--primary': '#10b981', '--secondary': '#34d399', '--success': '#22c55e',
        '--warning': '#eab308', '--accent': '#ef4444', '--gold': '#f59e0b',
        '--glass': 'rgba(255, 255, 255, 0.04)', '--glass-hover': 'rgba(255, 255, 255, 0.07)',
        '--border': 'rgba(16, 185, 129, 0.15)', '--text-main': '#ecfdf5', '--text-dim': '#6ee7b7',
        '--bg-gradient': 'radial-gradient(circle at 0% 0%, #052e16 0%, #14532d 100%)',
        '--modal-bg': '#0d2818',
    },
    ocean: {
        '--primary': '#f472b6', '--secondary': '#a78bfa', '--success': '#10b981',
        '--warning': '#f59e0b', '--accent': '#fb923c', '--gold': '#fbbf24',
        '--glass': 'rgba(255, 255, 255, 0.04)', '--glass-hover': 'rgba(255, 255, 255, 0.07)',
        '--border': 'rgba(167, 139, 250, 0.15)', '--text-main': '#fdf2f8', '--text-dim': '#c4b5fd',
        '--bg-gradient': 'radial-gradient(circle at 0% 0%, #0c0a1a 0%, #1e1b4b 100%)',
        '--modal-bg': '#110f2a',
    },
    light: {
        '--primary': '#2563eb', '--secondary': '#3b82f6', '--success': '#16a34a',
        '--warning': '#d97706', '--accent': '#dc2626', '--gold': '#ca8a04',
        '--glass': 'rgba(255, 255, 255, 0.7)', '--glass-hover': 'rgba(255, 255, 255, 0.85)',
        '--border': 'rgba(0, 0, 0, 0.08)', '--text-main': '#1e293b', '--text-dim': '#64748b',
        '--bg-gradient': 'radial-gradient(circle at 0% 0%, #f8fafc 0%, #e2e8f0 100%)',
        '--modal-bg': '#ffffff', '--font-main': "'Inter', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    }
};

// ─── 提醒文风预设 ─────────────────────────────────────────────────────────────
const TextStyles = {
    mecha: {
        drinkTitle: "💧 补给时间到！",
        drinkBody: n => `亲爱的 ${n}，您的机体需要补充水分了，请喝一杯水维持运转！`,
        restTitle: "🧘 调息时间到！",
        restBody: n => `尊敬的 ${n}，检测到您的肌肉僵直时间过长，请跟我一起做一段微运动吧。`,
    },
    gentle: {
        drinkTitle: "💧 喝杯水吧~",
        drinkBody: n => `${n}，你已经好一会儿没喝水啦～起来倒杯温水，对自己好一点哦 💕`,
        restTitle: "🌸 休息一下吧~",
        restBody: n => `${n}，你坐了好久了呢，站起来伸展一下吧，身体会感谢你的～ 🌷`,
    },
    silly: {
        drinkTitle: "💧 水！水！水！",
        drinkBody: n => `${n}！你是骆驼吗？这么久不喝水！快去灌水，否则我要报警了！🚨🐫`,
        restTitle: "🧘 你的屁股要长在椅子上了！",
        restBody: n => `天哪 ${n}，你已经坐了一个世纪了吧？站起来抖抖你那生了锈的膝盖！🦵💥`,
    },
    strict: {
        drinkTitle: "⚠️ 补水警告",
        drinkBody: n => `${n}，你的饮水任务已严重超时。立即执行补水动作，不许拖延。`,
        restTitle: "⚠️ 久坐警告",
        restBody: n => `${n}，持续久坐正在摧毁你的腰椎。马上站起来活动，这不是建议，是命令。`,
    },
};

const App = {
    state: {
        secretKey: localStorage.getItem('health_guardian_key'),
        username: '匿名用户',
        isRegistered: false,
        pomo: { interval: null, timeLeft: 25 * 60, isRunning: false },
        workout: { interval: null, timeLeft: 30 },
        charts: { weekly: null, hourly: null },
        theme: localStorage.getItem('hg_theme') || 'cyber',
        textStyle: localStorage.getItem('hg_text_style') || 'mecha',
        meta: {
            medalMap: {
                'EARLY_BIRD': '🐦', 'NIGHT_OWL': '🦉', 'WATER_BUFFALO': '💧',
                'PERSISTENCE': '♾️', 'FOCUS_MASTER': '🧠', 'PRODUCTIVITY_BEAST': '🐯',
                'STRETCH_EXPERT': '🤸', 'COMMUNITY_STAR': '🎖️',
                'MIDNIGHT_GHOST': '👻', 'HYDRO_CHAMPION': '🏆', 'DAWN_WARRIOR': '🌅', 'PET_LOVER': '🐾'
            }
        },
        reminders: [],
        achievementsData: [],
        pet: { drinkToday: 0, restToday: 0 },
        meetingEndAt: null,  // 📅 会议结束时间 (Date or null)
        // 🌙 夜间免打扰（从 localStorage 读取默认值，loadData 后从服务器同步）
        quietHours: {
            enabled: localStorage.getItem('hg_quiet_enabled') !== 'false',
            start:   localStorage.getItem('hg_quiet_start') || '21:00',
            end:     localStorage.getItem('hg_quiet_end')   || '07:00',
        },
    },

    async init() {
        this.applyTheme(this.state.theme);
        this.setupPWA();
        // 📅 恢复保存的会议提醒
        const savedMeeting = localStorage.getItem('hg_meeting_end');
        if (savedMeeting) {
            const t = new Date(savedMeeting);
            if (t > new Date()) { this.state.meetingEndAt = t; this._updateMeetingBar(); }
            else { localStorage.removeItem('hg_meeting_end'); localStorage.removeItem('hg_meeting_title'); }
        }
        // 检测 Electron 桌面端环境
        this._isElectron = !!(typeof window !== 'undefined' &&
            ((typeof process !== 'undefined' && process.versions && process.versions.electron) ||
             window.isElectronApp));
        // 延迟检测（因为 isElectronApp 是页面加载后注入的）
        setTimeout(() => {
            this._isElectron = this._isElectron || !!window.isElectronApp;
            this._updateElectronBadge();
        }, 1200);
        if (!this.state.secretKey) {
            UI.modal.show('welcome-modal');
        } else {
            await this.loadData();
            this.startGlobalBackgroundTimer();
            this.checkDailyBrief();
        }
        // P5 环境感知 — 始终初始化（访客和登录用户均可用）
        Weather.init();
    },

    // 更新 Electron 桌面端同步提示
    _updateElectronBadge() {
        const badge = document.getElementById('electron-sync-bar');
        if (!badge) return;
        if (this._isElectron) {
            badge.style.display = 'block';
            if (this.state.isRegistered) {
                badge.innerHTML = `<span style="color:var(--success)">✅ 桌面版 · 账号已同步</span><br><span style="font-size:0.6rem;opacity:0.6">网页端用相同账号登录即可同步数据</span>`;
            } else {
                badge.innerHTML = `<span style="color:var(--warning)">🖥️ 桌面版 · 当前为匿名模式</span><br><span style="font-size:0.6rem;opacity:0.7">点击 <strong>👤 身份同步</strong> 创建账号，即可在网页端同步所有数据</span>`;
            }
        } else {
            badge.style.display = 'none';
        }
    },

    setupPWA() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
        }
        // 桌面端：权限由 Electron session 自动授予，无需弹框；浏览器端才需要主动请求
        if (!window.isElectronApp && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    },

    // --- 🌙 夜间免打扰判断 ---
    isInQuietHours() {
        const q = this.state.quietHours;
        if (!q || !q.enabled) return false;
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = (q.start || '21:00').split(':').map(Number);
        const [eh, em] = (q.end   || '07:00').split(':').map(Number);
        const start = sh * 60 + sm;
        const end   = eh * 60 + em;
        // 跨午夜区间（如 21:00 → 07:00）
        if (start > end) return cur >= start || cur < end;
        return cur >= start && cur < end;
    },

    // --- 核心：全局后台巡检定时器 ---
    startGlobalBackgroundTimer() {
        setInterval(() => {
            const now = new Date().getTime();
            this.state.reminders.forEach(r => {
                const intervalMs = r.interval_minutes * 60 * 1000;
                if (now - r.lastNotified >= intervalMs) {
                    if (this.isInQuietHours()) {
                        r.lastNotified = now;
                    } else {
                        this.triggerAlarm(r);
                        r.lastNotified = now;
                    }
                }
            });
            // 📅 会议结束检查
            this._checkMeetingEnd();
            this._updateMeetingBar();
        }, 60000);
    },

    // 触发双端告警（使用选中的文风）
    triggerAlarm(reminder) {
        const style = TextStyles[this.state.textStyle] || TextStyles.mecha;
        const isDrink = reminder.remind_type === 'DRINK';
        const title = isDrink ? style.drinkTitle : style.restTitle;
        const isGuest = this.state.username.startsWith('访客_') || this.state.username === '匿名用户';
        const nickname = isGuest ? "神秘特工" : this.state.username;
        const body = isDrink ? style.drinkBody(nickname) : style.restBody(nickname);

        // 1. 桌面通知
        const desktopEnabled = localStorage.getItem('desktop_notify_enabled') !== 'false';
        if (desktopEnabled) {
            if (window.isElectronApp) {
                // Electron 桌面端：通过 IPC 调用主进程原生通知，无需任何权限弹窗
                try {
                    const { ipcRenderer } = window.require('electron');
                    ipcRenderer.send('show-notification', { title, body });
                } catch (_) { /* 降级到 Web API */ }
            } else if (Notification.permission === 'granted') {
                // 普通浏览器端
                new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/3105/3105807.png' });
            }
        }
        // 2. Webhook 推送（仅注册用户）
        if (this.state.isRegistered) {
            API.post('/api/notify/webhook', {
                secretKey: this.state.secretKey,
                message: `【提醒】${title} ${body}`
            });
        }
        UI.toast(title, 'warning');
    },

    async loadData() {
        const prevKey = this.state.secretKey;
        try {
            const res = await API.get('/api/configs', { secretKey: this.state.secretKey });
            if (res.secretKey) {
                const keyExpired = prevKey && res.secretKey !== prevKey;
                this.state.secretKey = res.secretKey;
                this.state.username = res.username || '匿名用户';
                this.state.isRegistered = res.isRegistered === true;
                localStorage.setItem('health_guardian_key', res.secretKey);
                localStorage.setItem('hg_cached_configs', JSON.stringify(res.configs));
                localStorage.setItem('hg_cached_username', this.state.username);

                // 同步 UI 状态
                const localDesktopNotify = localStorage.getItem('desktop_notify_enabled');
                const webhookInput = document.getElementById('auth-webhook');
                if (webhookInput) {
                    webhookInput.value = res.webhookUrl || '';
                    document.getElementById('webhook-enable-cb').checked = res.isWebhookEnabled !== false && res.isWebhookEnabled !== 0;
                    document.getElementById('desktop-notify-cb').checked = localDesktopNotify !== 'false';
                }
                // 🌙 同步夜间免打扰设置（服务端优先，降级到 localStorage）
                const qEnabled = res.quietEnabled !== undefined ? (res.quietEnabled == 1) : this.state.quietHours.enabled;
                const qStart   = res.quietStart || this.state.quietHours.start;
                const qEnd     = res.quietEnd   || this.state.quietHours.end;
                this.state.quietHours = { enabled: qEnabled, start: qStart, end: qEnd };
                localStorage.setItem('hg_quiet_enabled', qEnabled);
                localStorage.setItem('hg_quiet_start',   qStart);
                localStorage.setItem('hg_quiet_end',     qEnd);
                this.state.reminders = res.configs.map(c => ({
                    ...c, lastNotified: new Date().getTime()
                }));
                UI.renderUser(res);
                UI.renderReminders(res.configs);
                this.refreshDashboard();
                this._updateElectronBadge();

                if (keyExpired) {
                    setTimeout(() => UI.toast('⚠️ 上次会话已失效，已建立新身份。如需恢复账号数据，请点击「身份同步」登录', 'warning'), 800);
                } else if (res.isRegistered === false && prevKey) {
                    // 已有 key 但未注册，可能是老用户或访客
                    // 检查缓存中是否有用户名，如果有且不是访客，说明本地认为是登录状态但服务器没查到
                    const cachedUser = localStorage.getItem('hg_cached_username');
                    if (cachedUser && !cachedUser.startsWith('访客_') && cachedUser !== '匿名用户') {
                        setTimeout(() => UI.toast('👤 检测到本地登录凭证，但云端未同步。请重新「身份同步」以激活', 'warning'), 1500);
                    } else {
                        setTimeout(() => UI.toast('💡 当前为匿名模式，建议点击「身份同步」绑定账号', 'warning'), 1500);
                    }
                }
            }
        } catch (e) {
            const cachedStr = localStorage.getItem('hg_cached_configs');
            if (cachedStr) {
                try {
                    const configs = JSON.parse(cachedStr);
                    this.state.reminders = configs.map(c => ({ ...c, lastNotified: new Date().getTime() }));
                    UI.renderReminders(configs);
                    const cachedUsername = localStorage.getItem('hg_cached_username') || '匿名用户';
                    this.state.username = cachedUsername;
                    UI.renderUser({ username: cachedUsername });
                    UI.toast('⚠️ 服务器链路异常，已加载本地缓存配置（离线模式）', 'warning');
                } catch (_) { UI.toast('⚠️ 服务器链路异常且无本地缓存', 'error'); }
            } else { UI.toast('⚠️ 传感器链路异常', 'error'); }
        }
    },

    async refreshDashboard() {
        try {
            const [stats, leaderboard, achievements, streak, heatmap] = await Promise.all([
                API.get('/api/stats', { secretKey: this.state.secretKey }),
                API.get('/api/leaderboard'),
                API.get('/api/user/achievements', { secretKey: this.state.secretKey }),
                API.get('/api/streak', { secretKey: this.state.secretKey }),
                API.get('/api/stats/heatmap', { secretKey: this.state.secretKey }),
            ]);
            UI.renderStats(stats);
            UI.renderLeaderboard(leaderboard);
            UI.renderAchievements(achievements);
            UI.renderStreak(streak);
            UI.renderHeatmap(heatmap);
            this.state.achievementsData = achievements;
            // 同步宠物状态
            const drinkCount = stats.today.find(i => i.remind_type === 'DRINK')?.count || 0;
            const restCount = stats.today.find(i => i.remind_type === 'SEDENTARY')?.count || 0;
            this.state.pet.drinkToday = Number(drinkCount);
            this.state.pet.restToday = Number(restCount);
            Pet.update(this.state.pet.drinkToday, this.state.pet.restToday);
        } catch (e) { }
    },

    async completeTask(type, btnElement, fromPet = false) {
        await API.post('/api/complete', { type, secretKey: this.state.secretKey });
        const r = this.state.reminders.find(it => it.remind_type === type);
        if (r) r.lastNotified = new Date().getTime();
        UI.toast('记录已同步至云端', 'success');

        // 更新宠物状态
        if (type === 'DRINK') { this.state.pet.drinkToday++; if (fromPet) API.post('/api/pet/feed', { secretKey: this.state.secretKey }); }
        if (type === 'SEDENTARY') this.state.pet.restToday++;
        Pet.update(this.state.pet.drinkToday, this.state.pet.restToday);

        const isGuest = this.state.username.startsWith('访客_') || this.state.username === '匿名用户';
        const nickname = isGuest ? "神秘特工" : this.state.username;
        const action = type === 'DRINK' ? "完成了一次「水分补给」💧" : "完成了一组「身体拉伸」🧘";
        const praises = [
            "干得漂亮！机能正在恢复。", "太棒了，请继续保持这个节奏！",
            "您的健康生命值得到了显著提升！", "高度自律即是自由，这就是您强大的证明！",
            "状态绝佳，每一次打卡都是迈向巅峰的脚步。"
        ];
        if (this.state.isRegistered) {
            API.post('/api/notify/webhook', {
                secretKey: this.state.secretKey,
                message: `【激励】${nickname} 刚刚${action}。\n> ${praises[Math.floor(Math.random() * praises.length)]}`
            });
        }
        this.refreshDashboard();
    },

    tryComplete(type, btn) {
        if (type === 'SEDENTARY') Workout.start();
        else this.completeTask(type, btn);
    },

    confirmWorkout() { Workout.next(); },

    // --- 专注逻辑 ---
    startPomo() {
        this.state.pomo.isRunning = true;
        // 同步番茄钟状态到灵动岛 widget
        localStorage.setItem('hg_pomo_state', JSON.stringify({
            running: true,
            endAt: Date.now() + this.state.pomo.timeLeft * 1000,
            duration: 25 * 60
        }));
        UI.updatePomoState(true);
        this.state.pomo.interval = setInterval(() => {
            this.state.pomo.timeLeft--;
            UI.updatePomoTimer(this.state.pomo.timeLeft);
            if (this.state.pomo.timeLeft <= 0) this.finishPomo();
        }, 1000);
    },

    stopPomo() {
        clearInterval(this.state.pomo.interval);
        this.state.pomo.timeLeft = 25 * 60;
        this.state.pomo.isRunning = false;
        localStorage.removeItem('hg_pomo_state'); // 清除灵动岛倒计时
        UI.updatePomoTimer(this.state.pomo.timeLeft);
        UI.updatePomoState(false);
    },

    async finishPomo() {
        clearInterval(this.state.pomo.interval);
        localStorage.removeItem('hg_pomo_state'); // 清除灵动岛倒计时
        UI.toast('专注目标达成', 'success');
        await API.post('/api/pomodoro/complete', { secretKey: this.state.secretKey });
        const isGuest = this.state.username.startsWith('访客_') || this.state.username === '匿名用户';
        const nickname = isGuest ? "神秘特工" : this.state.username;
        if (this.state.isRegistered) {
            API.post('/api/notify/webhook', {
                secretKey: this.state.secretKey,
                message: `【专注激励】${nickname} 完美完成了一个番茄钟（25分钟）的深度工作。🧠`
            });
        }
        this.stopPomo();
        this.refreshDashboard();
    },

    // --- 统一身份认证（自动识别 新建 / 登录召回）---
    async handleAuth(username, password) {
        if (!username || !password) return UI.toast('请输入完整凭证', 'warning');
        const res = await API.post('/api/user/auth', {
            username, password, currentKey: this.state.secretKey
        });
        if (res.success) {
            if (res.secretKey) localStorage.setItem('health_guardian_key', res.secretKey);
            UI.toast(res.msg || '同步成功', 'success');
            setTimeout(() => location.reload(), 1000);
        } else {
            UI.toast(res.msg || '操作失败', 'error');
        }
    },

    async requestBrowserNotify() {
        // 桌面端：原生通知无需授权，直接测试
        if (window.isElectronApp) {
            try {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.send('show-notification', { title: 'HealthGuardian', body: '✅ 系统通知测试成功！提醒功能已正常工作。' });
                UI.toast('✅ 系统通知测试已发送，请查看右下角弹窗', 'success');
            } catch (_) { UI.toast('通知发送失败，请重启应用', 'error'); }
            UI.updateNotifyPermBtn(); return;
        }
        if (!('Notification' in window)) { UI.toast('当前环境不支持浏览器通知', 'warning'); return; }
        if (Notification.permission === 'denied') {
            UI.toast('通知权限已被拒绝，请在浏览器地址栏的锁图标处手动开启', 'warning');
            UI.updateNotifyPermBtn(); return;
        }
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
            UI.toast('✅ 浏览器通知已成功开启！', 'success');
            new Notification('HealthGuardian', { body: '浏览器推送通知已成功激活！' });
        } else { UI.toast('通知权限未获授权', 'warning'); }
        UI.updateNotifyPermBtn();
    },

    async saveWebhook(url, webhookEnabled, desktopEnabled, quietEnabled = true, quietStart = '21:00', quietEnd = '07:00') {
        localStorage.setItem('desktop_notify_enabled', desktopEnabled);
        // 🌙 保存夜间免打扰到内存 + localStorage
        this.state.quietHours = { enabled: !!quietEnabled, start: quietStart || '21:00', end: quietEnd || '07:00' };
        localStorage.setItem('hg_quiet_enabled', !!quietEnabled);
        localStorage.setItem('hg_quiet_start',   quietStart || '21:00');
        localStorage.setItem('hg_quiet_end',     quietEnd   || '07:00');

        // 访客模式：仅保存本地偏好，不调用 Webhook API
        if (!this.state.isRegistered) {
            UI.toast('本地通知设置已保存（Webhook 推送需绑定账号后可用）', 'success');
            UI.modal.hide('webhook-modal');
            return;
        }
        await API.post('/api/user/webhook', {
            secretKey: this.state.secretKey,
            webhookUrl: url,
            enabled:      webhookEnabled ? 1 : 0,
            quietEnabled: quietEnabled    ? 1 : 0,
            quietStart:   quietStart || '21:00',
            quietEnd:     quietEnd   || '07:00',
        });
        UI.toast('推送链路与免打扰设置已更新 🌙', 'success');
        UI.modal.hide('webhook-modal');
        this.loadData();
    },

    async saveConfig(type, minutes) {
        await API.post('/api/configs/update', { secretKey: this.state.secretKey, type, minutes });
        UI.toast('协议频率已校准', 'success');
        UI.modal.hide('config-modal');
        this.loadData();
    },

    async startFresh() {
        UI.modal.hide('welcome-modal');
        await this.loadData();
        this.startGlobalBackgroundTimer();
    },
    applyTheme(name) {
        const vars = Themes[name] || Themes.cyber;
        const root = document.documentElement;
        Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
        // 设置 body data-theme 属性，供 CSS 亮色主题覆盖规则使用
        document.body.dataset.theme = name;
        document.querySelectorAll('.theme-btn[data-theme]').forEach(b => {
            b.classList.toggle('active', b.dataset.theme === name);
        });
    },

    setTheme(name) {
        this.state.theme = name;
        localStorage.setItem('hg_theme', name);
        this.applyTheme(name);
    },

    // --- 文风切换 ---
    setTextStyle(name) {
        this.state.textStyle = name;
        localStorage.setItem('hg_text_style', name);
        document.querySelectorAll('.theme-btn[data-style]').forEach(b => {
            b.classList.toggle('active', b.dataset.style === name);
        });
        UI.toast(`提醒文风已切换`, 'success');
    },

    // --- 健康周报生成 ---
    async generateWeeklyReport() {
        try {
            const data = await API.get('/api/stats/weekly-report', { secretKey: this.state.secretKey });
            const getCount = (arr, type) => (arr || []).find(i => i.remind_type === type)?.count || 0;
            const twDrink = getCount(data.thisWeek, 'DRINK'), lwDrink = getCount(data.lastWeek, 'DRINK');
            const twRest = getCount(data.thisWeek, 'SEDENTARY'), lwRest = getCount(data.lastWeek, 'SEDENTARY');
            const twFocus = data.focusThisWeek || 0, lwFocus = data.focusLastWeek || 0;
            const trend = (cur, prev) => cur > prev ? `📈 +${cur - prev}` : cur < prev ? `📉 ${cur - prev}` : '➡️ 持平';
            const name = this.state.username.startsWith('访客_') ? '神秘特工' : this.state.username;
            const dailyBars = (data.thisWeekDaily || []).map(d =>
                `<div style="text-align:center"><div style="background:linear-gradient(to top,#00f2fe,#4facfe);width:28px;height:${Math.max(4, d.count * 12)}px;border-radius:4px;margin:0 auto 4px"></div><span style="font-size:11px;color:#94a3b8">${d.date}</span></div>`
            ).join('');

            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>HealthGuardian 周报</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI','Microsoft YaHei',sans-serif;background:#0f172a;color:#f8fafc;padding:40px;display:flex;justify-content:center}
.card{max-width:600px;width:100%;background:#1e293b;border:1px solid rgba(0,242,254,.3);border-radius:24px;padding:40px;box-shadow:0 0 60px rgba(0,242,254,.1)}
h1{font-size:1.5rem;background:linear-gradient(to right,#00f2fe,#4facfe);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px}
.subtitle{color:#94a3b8;font-size:.85rem;margin-bottom:30px}.row{display:flex;gap:16px;margin-bottom:20px}.metric{flex:1;background:rgba(0,0,0,.25);border-radius:14px;padding:16px;text-align:center}
.metric .val{font-size:1.8rem;font-weight:800;font-family:monospace;color:#00f2fe}.metric .label{font-size:.7rem;color:#94a3b8;margin-top:4px}.metric .trend{font-size:.75rem;margin-top:6px}
.section{margin-top:25px;padding-top:20px;border-top:1px solid rgba(255,255,255,.08)}.section h2{font-size:.9rem;color:#4facfe;margin-bottom:14px}
.bars{display:flex;align-items:flex-end;gap:8px;min-height:80px}.footer{text-align:center;color:rgba(148,163,184,.4);font-size:.7rem;margin-top:30px}</style></head>
<body><div class="card">
<h1>🛰️ HealthGuardian 健康周报</h1>
<div class="subtitle">${name} · ${new Date().toLocaleDateString('zh-CN')} · 近 7 天数据摘要</div>
<div class="row">
  <div class="metric"><div class="val">${twDrink}</div><div class="label">💧 补给次数</div><div class="trend">${trend(twDrink, lwDrink)} vs 上周 ${lwDrink}</div></div>
  <div class="metric"><div class="val">${twRest}</div><div class="label">🧘 调息次数</div><div class="trend">${trend(twRest, lwRest)} vs 上周 ${lwRest}</div></div>
  <div class="metric"><div class="val">${twFocus}m</div><div class="label">🧠 专注时长</div><div class="trend">${trend(twFocus, lwFocus)} vs 上周 ${lwFocus}m</div></div>
</div>
<div class="section"><h2>📊 每日打卡分布</h2><div class="bars">${dailyBars || '<span style="color:#64748b">本周暂无数据</span>'}</div></div>
<div class="section"><h2>💡 本周洞察</h2><p style="color:#94a3b8;font-size:.85rem;line-height:1.7">${
    twDrink + twRest > lwDrink + lwRest
        ? `本周总打卡 ${twDrink + twRest} 次，较上周提升 ${twDrink + twRest - lwDrink - lwRest} 次，状态正在持续进化！保持这个节奏，你就是最稳定的健康输出者。💪`
        : twDrink + twRest === lwDrink + lwRest
        ? `本周表现与上周持平，稳定即是实力。下周可以尝试突破一下自己的打卡记录！🎯`
        : `本周打卡略有下降，别担心，波动是正常的。下周多关注提醒，重回巅峰状态！🔥`
}</p></div>
<div class="footer">HealthGuardian · 不仅仅是一个软件，更是您通往数字巅峰的健康底座</div>
</div></body></html>`;
            const win = window.open('', '_blank');
            if (win) { win.document.write(html); win.document.close(); }
            else UI.toast('弹窗被拦截，请允许弹窗后重试', 'warning');
        } catch (e) { UI.toast('周报生成失败', 'error'); }
    },

    // --- 🤖 AI 健康日报 ---
    async checkDailyBrief() {
        const today = new Date().toLocaleDateString('zh-CN');
        if (localStorage.getItem('hg_last_brief') === today) return;
        try {
            const data = await API.get('/api/daily-brief', { secretKey: this.state.secretKey });
            if (data.totalDays > 0) {
                UI.renderDailyBrief(data, this.state.username);
                UI.modal.show('daily-brief-modal');
            }
            localStorage.setItem('hg_last_brief', today);
        } catch (e) {}
    },

    // --- 👫 健康搭子 ---
    async openPartnerModal() {
        if (!this.state.isRegistered) {
            UI.toast('搭子功能需要先绑定账号哦 👤', 'warning');
            return;
        }
        try {
            const [data, partnerStats] = await Promise.all([
                API.get('/api/partner/my-code', { secretKey: this.state.secretKey }),
                API.get('/api/partner/stats', { myKey: this.state.secretKey })
            ]);
            UI.renderPartnerModal(data, Array.isArray(partnerStats) ? partnerStats : []);
            UI.modal.show('partner-modal');
        } catch (e) { UI.toast('加载失败，请重试', 'error'); }
    },

    async bindPartner() {
        const code = document.getElementById('partner-input').value.trim();
        if (!code) return UI.toast('请输入搭子的用户名', 'warning');
        const res = await API.post('/api/partner/bind', { myKey: this.state.secretKey, inviteCode: code });
        UI.toast(res.msg, res.success ? 'success' : 'error');
        if (res.success) {
            document.getElementById('partner-input').value = '';
            this.openPartnerModal();
        }
    },

    async unbindPartner(partnerKey) {
        await API.post('/api/partner/unbind', { myKey: this.state.secretKey, partnerKey });
        UI.toast('已解除搭子关系', 'success');
        this.openPartnerModal();
    },

    async nudgePartner(partnerKey) {
        UI.toast('⚡ 正在发送电击提醒...', 'info');
        const res = await API.post('/api/partner/nudge', { myKey: this.state.secretKey, partnerKey });
        UI.toast(res.msg || '提醒已发出', res.success ? 'success' : 'warning');
    },

    // --- ⚡ 智能提醒自适应 ---
    async loadAdaptiveSchedule() {
        const el = document.getElementById('adaptive-result');
        if (el) el.innerHTML = '<div style="color:var(--text-dim);font-size:0.8rem;text-align:center;padding:10px">📡 正在分析行为模式...</div>';
        try {
            const data = await API.get('/api/adaptive-schedule', { secretKey: this.state.secretKey });
            UI.renderAdaptiveSchedule(data);
        } catch (e) {
            if (el) el.innerHTML = '<div style="color:var(--accent);font-size:0.8rem">分析失败，请稍后重试</div>';
        }
    },

    async applyAdaptiveSchedule(drinkMin, restMin) {
        if (drinkMin) await API.post('/api/configs/update', { secretKey: this.state.secretKey, type: 'DRINK', minutes: drinkMin });
        if (restMin) await API.post('/api/configs/update', { secretKey: this.state.secretKey, type: 'SEDENTARY', minutes: restMin });
        UI.toast('⚡ 智能间隔已应用，系统将按您的规律提醒', 'success');
        this.loadData();
    },

    // --- 📅 日程结束提醒 ---
    openMeetingModal() {
        const timeInput = document.getElementById('meeting-end-time');
        const titleInput = document.getElementById('meeting-title');
        if (timeInput && this.state.meetingEndAt) {
            const h = String(this.state.meetingEndAt.getHours()).padStart(2, '0');
            const m = String(this.state.meetingEndAt.getMinutes()).padStart(2, '0');
            timeInput.value = `${h}:${m}`;
        }
        if (titleInput && this.state.meetingEndAt) {
            titleInput.value = localStorage.getItem('hg_meeting_title') || '';
        }
        UI.modal.show('meeting-modal');
    },

    scheduleMeeting(timeStr, title) {
        if (!timeStr) { UI.toast('请选择会议结束时间', 'warning'); return; }
        const [h, m] = timeStr.split(':').map(Number);
        const endAt = new Date();
        endAt.setHours(h, m, 0, 0);
        if (endAt <= new Date()) endAt.setDate(endAt.getDate() + 1); // next day if past
        this.state.meetingEndAt = endAt;
        localStorage.setItem('hg_meeting_end', endAt.toISOString());
        localStorage.setItem('hg_meeting_title', title || '会议');
        this._updateMeetingBar();
        UI.modal.hide('meeting-modal');
        UI.toast(`📅 ${title || '会议'}结束提醒已设置，到 ${timeStr} 自动弹出拉伸`, 'success');
    },

    cancelMeeting() {
        this.state.meetingEndAt = null;
        localStorage.removeItem('hg_meeting_end');
        localStorage.removeItem('hg_meeting_title');
        this._updateMeetingBar();
        UI.toast('📅 会议提醒已取消', 'info');
    },

    _checkMeetingEnd() {
        if (!this.state.meetingEndAt) return;
        if (new Date() >= this.state.meetingEndAt) {
            const title = localStorage.getItem('hg_meeting_title') || '会议';
            this.state.meetingEndAt = null;
            localStorage.removeItem('hg_meeting_end');
            localStorage.removeItem('hg_meeting_title');
            UI.toast(`📅 「${title}」已结束！起来拉伸一下吧 🧘`, 'warning');
            setTimeout(() => Workout.start('desk'), 1000);
            if (this.state.isRegistered) {
                API.post('/api/notify/webhook', {
                    secretKey: this.state.secretKey,
                    message: `[Health]【日程提醒】「${title}」已结束，请立即起身活动，执行调息协议，避免久坐损伤！🧘`
                });
            }
        }
    },

    _updateMeetingBar() {
        const bar = document.getElementById('meeting-bar');
        const leftEl = document.getElementById('meeting-time-left');
        if (!bar || !leftEl) return;
        if (!this.state.meetingEndAt) { bar.style.display = 'none'; return; }
        const diffMs = this.state.meetingEndAt - new Date();
        if (diffMs <= 0) { bar.style.display = 'none'; return; }
        const mins = Math.ceil(diffMs / 60000);
        leftEl.textContent = mins < 60 ? `${mins} 分钟` : `${Math.floor(mins/60)} 小时 ${mins%60} 分`;
        bar.style.display = 'flex';
    },

    // --- 成就分享卡片 ---
    async shareCard() {
        const canvas = document.createElement('canvas');
        const W = 640, H = 420;
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        // 背景
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e293b');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

        // 边框发光
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(10, 10, W - 20, H - 20, 20);
        ctx.stroke();

        // 标题
        ctx.fillStyle = '#00f2fe';
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillText('🛰️ HealthGuardian', 30, 50);

        // 用户名
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 18px Inter, sans-serif';
        const displayName = this.state.username.startsWith('访客_') ? '神秘特工' : this.state.username;
        ctx.fillText(`${displayName} 的健康档案`, 30, 85);

        // 连续打卡
        const streakEl = document.getElementById('streak-count');
        const streakVal = streakEl ? streakEl.innerText : '0';
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 48px monospace';
        ctx.fillText(`🔥 ${streakVal}`, 30, 150);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.fillText('天连续打卡', 155, 150);

        // 今日数据
        const drink = document.getElementById('stat-drink')?.innerText || '0';
        const rest = document.getElementById('stat-rest')?.innerText || '0';
        const focus = document.getElementById('stat-focus')?.innerText || '0m';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '13px sans-serif';
        ctx.fillText(`今日补给: ${drink}  |  今日调息: ${rest}  |  专注时长: ${focus}`, 30, 190);

        // 分割线
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath(); ctx.moveTo(30, 210); ctx.lineTo(W - 30, 210); ctx.stroke();

        // 成就勋章
        ctx.fillStyle = '#4facfe';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('已解锁勋章', 30, 240);

        const achieved = (this.state.achievementsData || []).filter(a => a.is_achieved);
        if (achieved.length === 0) {
            ctx.fillStyle = '#64748b';
            ctx.font = '13px sans-serif';
            ctx.fillText('尚未解锁任何勋章，继续加油！', 30, 270);
        } else {
            let x = 30, y = 260;
            ctx.font = '32px sans-serif';
            achieved.forEach(a => {
                const emoji = this.state.meta.medalMap[a.code] || '🏅';
                ctx.fillText(emoji, x, y + 30);
                x += 50;
                if (x > W - 60) { x = 30; y += 50; }
            });
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px sans-serif';
            const names = achieved.map(a => a.name).join(' · ');
            ctx.fillText(names.length > 80 ? names.substring(0, 80) + '...' : names, 30, y + 60);
        }

        // 底部水印
        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.font = '11px sans-serif';
        ctx.fillText(`HealthGuardian · ${new Date().toLocaleDateString('zh-CN')}`, 30, H - 25);
        ctx.fillText('不仅仅是一个软件，更是您通往数字巅峰的健康底座', W - 340, H - 25);

        // 下载
        const link = document.createElement('a');
        link.download = `HealthGuardian_${displayName}_${new Date().toISOString().slice(0,10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        UI.toast('📸 分享卡片已生成并下载', 'success');
    }
};

const UI = {
    editingType: null,

    toast(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = 'toast';
        el.innerHTML = `<span>${type === 'success' ? '✅' : '🔔'}</span><span>${msg}</span>`;
        container.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    },

    renderUser(data) {
        const el = document.getElementById('user-display');
        el.innerHTML = (data.username && !data.username.startsWith('访客_'))
            ? `已授权: <span style="color:var(--primary)">${data.username}</span>`
            : '当前状态: 匿名接入';
    },

    renderStreak(data) {
        const container = document.getElementById('streak-container');
        const countEl = document.getElementById('streak-count');
        const fireEl = document.getElementById('streak-fire');
        if (!container) return;
        if (data.streak > 0) {
            container.style.display = 'flex';
            countEl.innerText = data.streak;
            fireEl.className = 'streak-fire' + (data.todayDone ? ' active' : ' dim');
        } else {
            container.style.display = 'none';
        }
    },

    updateNotifyPermBtn() {
        const btn = document.getElementById('notify-perm-btn');
        const status = document.getElementById('notify-perm-status');
        if (!btn) return;
        // 桌面端使用原生通知，无需浏览器权限
        if (window.isElectronApp) {
            btn.innerText = '✅ 桌面端系统通知已开启（原生）'; btn.disabled = true;
            if (status) status.innerText = '提醒弹窗由操作系统直接推送，无需额外授权。';
            return;
        }
        if (!('Notification' in window)) return;
        const perm = Notification.permission;
        if (perm === 'granted') {
            btn.innerText = '✅ 浏览器通知权限已开启'; btn.disabled = true;
            if (status) status.innerText = '';
        } else if (perm === 'denied') {
            btn.innerText = '❌ 通知已被拒绝 (需浏览器手动开启)'; btn.disabled = true;
            if (status) status.innerText = '请点击浏览器地址栏的 🔒 图标，将"通知"权限改为"允许"后刷新页面。';
        } else {
            btn.innerText = '🔔 点击授权开启浏览器推送通知'; btn.disabled = false;
            if (status) status.innerText = '';
        }
    },

    renderReminders(configs) {
        const container = document.getElementById('remind-list');
        container.innerHTML = configs.map(c => `
            <div class="list-item">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                    <span style="font-weight:700; font-size:0.8rem">${c.remind_type === 'DRINK' ? '💧 补给提醒 (喝水)' : '🧘 调息提醒 (休息)'}</span>
                    <button class="btn-action" style="padding:6px 12px" onclick="App.tryComplete('${c.remind_type}', this)">执行</button>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.65rem; color:var(--text-dim)">
                    <span>周期: ${c.interval_minutes}m</span>
                    <span style="color:var(--primary); cursor:pointer" onclick="UI.modal.showConfig('${c.remind_type}', ${c.interval_minutes})">[修改]</span>
                </div>
            </div>`).join('');
    },

    renderStats(data) {
        document.getElementById('stat-drink').innerText = data.today.find(i => i.remind_type === 'DRINK')?.count || 0;
        document.getElementById('stat-rest').innerText = data.today.find(i => i.remind_type === 'SEDENTARY')?.count || 0;
        document.getElementById('stat-focus').innerText = data.totalFocusTime + 'm';
        const hp = data.hp || 100;
        const hpFill = document.getElementById('hp-fill');
        const hpVal = document.getElementById('hp-value');
        const hpCard = hpFill.closest('.glass-card');
        hpFill.style.width = hp + '%';
        hpVal.innerText = hp + '%';
        if (hp < 40) { hpFill.classList.add('danger'); hpCard.classList.add('hp-low'); }
        else { hpFill.classList.remove('danger'); hpCard.classList.remove('hp-low'); }
        document.getElementById('system-monitor-msg').innerText = data.systemMsg || '正在扫描生物体征...';
        this.renderCharts(data);
    },

    renderLeaderboard(data) {
        const container = document.getElementById('leaderboard');
        container.innerHTML = data.map((item, i) => `
            <div class="rank-row">
                <div class="rank-num ${i === 0 ? 'top-1' : ''}">${i + 1}</div>
                <div style="flex:1; font-size:0.8rem">${item.username}</div>
                <div style="font-weight:700; color:var(--primary)">${item.total_score}</div>
            </div>`).join('');
    },

    renderAchievements(data) {
        const container = document.getElementById('achievements-container');
        const prevAchieved = new Set((App.state.achievementsData || []).filter(a => a.is_achieved).map(a => a.code));
        container.innerHTML = data.map(a => {
            const isHidden = a.is_hidden == 1;
            const isAchieved = a.is_achieved == 1;
            const emoji = App.state.meta.medalMap[a.code] || '🏅';
            const displayEmoji = isHidden && !isAchieved ? '🔒' : emoji;
            const displayName = isHidden && !isAchieved ? '???' : a.name;
            const justUnlocked = isAchieved && !prevAchieved.has(a.code);
            return `
            <div class="ach-item ${isAchieved ? 'active' : ''} ${justUnlocked ? 'just-unlocked' : ''}" 
                 ${isHidden ? 'data-hidden="true"' : ''} 
                 data-tip="${isHidden && !isAchieved ? '🔒 隐藏成就，继续探索解锁' : a.name + ': ' + a.description}">
                <div class="ach-emoji" style="font-size:1.5rem; margin-bottom:5px">${displayEmoji}</div>
                <div style="font-size:0.6rem; font-weight:700">${displayName}</div>
            </div>`;
        }).join('');
    },

    renderDailyBrief(data, username) {
        const name = (username && !username.startsWith('访客_')) ? username : '特工';
        const streak = data.streak || 0;
        const totalDays = data.totalDays || 0;
        const getCount = (arr, type) => (arr || []).find(i => i.remind_type === type)?.count || 0;
        const ydDrink = getCount(data.yesterdayStats, 'DRINK');
        const ydRest = getCount(data.yesterdayStats, 'SEDENTARY');

        const hour = new Date().getHours();
        const greeting = hour < 9 ? '⛅ 早安' : hour < 12 ? '🌤️ 上午好' : hour < 18 ? '☀️ 下午好' : '🌙 晚上好';

        const streakMsg = streak >= 7 ? `🔥 已连续 ${streak} 天，你是最强特工！` :
            streak >= 3 ? `🔥 连续 ${streak} 天，势头很猛！` :
            streak > 0 ? `🔥 连续 ${streak} 天，保持下去！` : '今天开始你的第一天打卡吧！';

        const ydMsg = (ydDrink + ydRest) === 0 ? '昨天还没有打卡记录' :
            `昨日补给 ${ydDrink} 次，调息 ${ydRest} 次`;

        const bestH = data.bestHour != null ? `你的最活跃时段是 ${data.bestHour}:00 — ${parseInt(data.bestHour)+1}:00` : '';

        const el = document.getElementById('daily-brief-content');
        if (!el) return;
        el.innerHTML = `
            <div style="font-size:2rem; margin-bottom:8px">${greeting}，${name}！</div>
            <div class="brief-stat-row">
                <div class="brief-stat"><span class="brief-val" style="color:var(--gold)">${streak}</span><span class="brief-lbl">连续天数</span></div>
                <div class="brief-stat"><span class="brief-val" style="color:var(--primary)">${totalDays}</span><span class="brief-lbl">累计天数</span></div>
                <div class="brief-stat"><span class="brief-val" style="color:var(--secondary)">${ydDrink}</span><span class="brief-lbl">昨日补给</span></div>
                <div class="brief-stat"><span class="brief-val" style="color:var(--success)">${ydRest}</span><span class="brief-lbl">昨日调息</span></div>
            </div>
            <div class="brief-insight">${streakMsg}</div>
            <div class="brief-insight" style="opacity:0.7; font-size:0.8rem">${ydMsg}${bestH ? '。' + bestH : ''}。今天继续加油！💪</div>
        `;
    },

    renderPartnerModal(data, partnerStats) {
        const codeEl = document.getElementById('my-partner-code');
        const listEl = document.getElementById('partner-list');
        if (!codeEl || !listEl) return;
        if (!data.isRegistered) {
            codeEl.innerHTML = `<span style="color:var(--text-dim);font-size:0.8rem">请先绑定账号才能使用搭子功能</span>`;
        } else {
            codeEl.innerHTML = `
                <span style="font-size:0.75rem;color:var(--text-dim)">我的邀请码（用户名）：</span>
                <span class="partner-code-box" onclick="navigator.clipboard.writeText('${data.code}'); UI.toast('已复制！', 'success')">${data.code} 📋</span>`;
        }
        if (!partnerStats || !Array.isArray(partnerStats) || partnerStats.length === 0) {
            listEl.innerHTML = `<div style="color:var(--text-dim);font-size:0.8rem;text-align:center;padding:16px">还没有搭子，快去邀请好友吧！</div>`;
        } else {
            listEl.innerHTML = partnerStats.map(p => `
                <div class="partner-card">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <span style="font-weight:700;font-size:0.9rem">👤 ${p.username}</span>
                        <div style="display:flex;gap:6px">
                            <button onclick="App.nudgePartner('${p.partner_key}')" class="btn-outline" style="margin:0;padding:4px 10px;font-size:0.65rem;width:auto;color:var(--warning);border-color:var(--warning)">⚡ 提醒</button>
                            <button onclick="App.unbindPartner('${p.partner_key}')" class="btn-outline" style="margin:0;padding:4px 10px;font-size:0.65rem;width:auto;color:var(--accent);border-color:var(--accent)">解除</button>
                        </div>
                    </div>
                    <div style="display:flex;gap:16px;margin-top:10px;font-size:0.78rem">
                        <span>💧 今日补给: <strong style="color:var(--primary)">${p.drink_count}</strong></span>
                        <span>🧘 今日调息: <strong style="color:var(--secondary)">${p.rest_count}</strong></span>
                        <span>📅 本周活跃: <strong style="color:var(--gold)">${p.week_days}</strong> 天</span>
                    </div>
                </div>`).join('');
        }
    },

    renderAdaptiveSchedule(data) {
        const el = document.getElementById('adaptive-result');
        if (!el) return;
        if (!data.hasData) {
            el.innerHTML = `<div style="color:var(--text-dim);font-size:0.78rem;text-align:center;padding:10px">${data.msg}</div>`;
            return;
        }
        const drinkRec = data.drinkAvgGap ? Math.round(Number(data.drinkAvgGap) / 5) * 5 : null;
        const restRec = data.restAvgGap ? Math.round(Number(data.restAvgGap) / 5) * 5 : null;
        const activeHours = (data.activeHours || []).slice(0, 3).map(h => `${h.hour}:00`).join('、');
        el.innerHTML = `
            <div class="adaptive-row">
                <div>💧 你的平均喝水间隔 <strong style="color:var(--primary)">${data.drinkAvgGap || '--'} 分钟</strong></div>
                <div style="color:var(--text-dim);font-size:0.7rem">${drinkRec ? `建议设为 ${drinkRec} 分钟` : '暂无足够数据'}</div>
            </div>
            <div class="adaptive-row">
                <div>🧘 你的平均起身间隔 <strong style="color:var(--secondary)">${data.restAvgGap || '--'} 分钟</strong></div>
                <div style="color:var(--text-dim);font-size:0.7rem">${restRec ? `建议设为 ${restRec} 分钟` : '暂无足够数据'}</div>
            </div>
            ${activeHours ? `<div style="font-size:0.75rem;color:var(--text-dim);margin-top:8px">📈 最活跃时段：<strong style="color:var(--gold)">${activeHours}</strong>，这些时段你打卡最积极</div>` : ''}
            <div style="margin-top:12px;display:flex;gap:8px">
                ${(drinkRec || restRec) ? `<button class="btn-action" style="font-size:0.75rem;padding:8px 16px" onclick="App.applyAdaptiveSchedule(${drinkRec || 'null'}, ${restRec || 'null'})">⚡ 一键应用推荐</button>` : ''}
            </div>`;
    },

    renderHeatmap(data) {
        const container = document.getElementById('heatmap-container');
        if (!container) return;
        const countMap = {};
        (data || []).forEach(d => countMap[d.date] = d.count);
        const today = new Date();
        const cells = [];
        // 回溯 91 天（13 完整周）
        const startOffset = 90 + today.getDay(); // 从周日开始对齐
        for (let i = startOffset; i >= 0; i--) {
            const d = new Date(today); d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            cells.push({ date: key, count: countMap[key] || 0 });
        }
        const max = Math.max(...cells.map(c => c.count), 1);
        let html = '<div class="heatmap-grid">';
        cells.forEach(c => {
            const lvl = c.count === 0 ? 0 : Math.min(4, Math.ceil(c.count / max * 4));
            html += `<div class="heatmap-cell level-${lvl}" title="${c.date}: ${c.count} 次"></div>`;
        });
        html += '</div>';
        html += `<div class="heatmap-legend"><span>少</span>
            <div class="heatmap-cell level-0"></div><div class="heatmap-cell level-1"></div>
            <div class="heatmap-cell level-2"></div><div class="heatmap-cell level-3"></div>
            <div class="heatmap-cell level-4"></div><span>多</span></div>`;
        container.innerHTML = html;
    },

    renderCharts(data) {
        const opt = { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { display: false } } };
        const wCtx = document.getElementById('weeklyChart').getContext('2d');
        if (App.state.charts.weekly) App.state.charts.weekly.destroy();
        App.state.charts.weekly = new Chart(wCtx, { type: 'line', data: { labels: data.weekly.map(i => i.date), datasets: [{ data: data.weekly.map(i => i.count), borderColor: '#00f2fe', backgroundColor: 'rgba(0, 242, 254, 0.1)', fill: true, tension: 0.4 }] }, options: opt });
        const hCtx = document.getElementById('hourlyChart').getContext('2d');
        if (App.state.charts.hourly) App.state.charts.hourly.destroy();
        const hd = new Array(24).fill(0); data.hourly.forEach(i => hd[i.hour] = i.count);
        App.state.charts.hourly = new Chart(hCtx, { type: 'bar', data: { labels: Array.from({ length: 24 }, (_, i) => i), datasets: [{ data: hd, backgroundColor: '#4facfe', borderRadius: 4 }] }, options: opt });
    },

    updatePomoTimer(s) {
        const m = Math.floor(s / 60).toString().padStart(2, '0'), sec = (s % 60).toString().padStart(2, '0');
        document.getElementById('pomo-timer').innerText = `${m}:${sec}`;
    },

    updatePomoState(run) {
        document.getElementById('pomo-start').disabled = run;
        document.getElementById('pomo-stop').disabled = !run;
    },

    modal: {
        show(id) { document.getElementById(id).style.display = 'flex'; },
        hide(id) { document.getElementById(id).style.display = 'none'; },
        showAuth() {
            this.show('auth-modal');
            this.hide('welcome-modal');
        },
        showWebhook() {
            this.show('webhook-modal');
            UI.updateNotifyPermBtn();
            // 🌙 回填夜间免打扰状态
            const q = App.state.quietHours;
            const cb = document.getElementById('quiet-hours-cb');
            const row = document.getElementById('quiet-time-row');
            const qs = document.getElementById('quiet-start');
            const qe = document.getElementById('quiet-end');
            if (cb) { cb.checked = q.enabled; }
            if (row) { row.style.display = q.enabled ? 'flex' : 'none'; }
            if (qs)  { qs.value = q.start || '21:00'; }
            if (qe)  { qe.value = q.end   || '07:00'; }
        },
        showSettings() {
            document.querySelectorAll('.theme-btn[data-theme]').forEach(b => {
                b.classList.toggle('active', b.dataset.theme === App.state.theme);
            });
            document.querySelectorAll('.theme-btn[data-style]').forEach(b => {
                b.classList.toggle('active', b.dataset.style === App.state.textStyle);
            });
            this.show('settings-modal');
            // 每次打开自动加载智能分析
            App.loadAdaptiveSchedule();
        },
        showConfig(type, min) { UI.editingType = type; document.getElementById('config-minutes').value = min; this.show('config-modal'); },
        showWorkout() {
            document.getElementById('workout-img').src = `/workout/${['neck.svg', 'chest.svg', 'squat.svg'][Math.floor(Math.random() * 3)]}`;
            this.show('workout-modal');
            let t = 30; const btn = document.getElementById('workout-btn'); btn.disabled = true;
            if (App.state.workout.interval) clearInterval(App.state.workout.interval);
            App.state.workout.interval = setInterval(() => { t--; btn.innerText = `保持动作 (${t}s)`; if (t <= 0) { clearInterval(App.state.workout.interval); btn.disabled = false; btn.innerText = "完成打卡"; } }, 1000);
        }
    }
};

const API = {
    async get(u, p = {}) { const q = new URLSearchParams(p).toString(); return (await fetch(`${u}?${q}`)).json(); },
    async post(u, p = {}) { const q = new URLSearchParams(p).toString(); const r = await fetch(`${u}?${q}`, { method: 'POST' }); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } }
};

// ─── Workout 调息协议模块 ───────────────────────────────────────────────────
const Workout = {
    _interval: null,
    sequence: [],
    currentStep: 0,
    timeLeft: 0,

    exercises: {
        neck:     { name: '颈部拉伸', svg: 'neck.svg',     duration: 30, target: '颈椎 & 斜方肌',     desc: '缓慢左右转动颈部，充分感受侧颈拉伸',    breath: '吸气向左，呼气回中，再吸气向右' },
        chest:    { name: '扩胸开肩', svg: 'chest.svg',    duration: 30, target: '胸大肌 & 肩袖肌群',  desc: '双臂向后展开，挺胸抬头，打开胸腔',      breath: '吸气展肩，呼气内收，重复' },
        squat:    { name: '原地深蹲', svg: 'squat.svg',    duration: 30, target: '下肢 & 核心肌群',    desc: '双脚肩宽，缓慢蹲起，激活下肢血液循环',  breath: '下蹲吸气，起立呼气' },
        shoulder: { name: '肩部环绕', svg: 'shoulder.svg', duration: 25, target: '三角肌 & 冈上肌',   desc: '双肩同时向前画大圆，再反向画圆舒缓',    breath: '配合肩部节奏均匀呼吸' },
        wrist:    { name: '手腕舒展', svg: 'wrist.svg',    duration: 20, target: '腕屈肌 & 腕伸肌',   desc: '双手腕交替向内向外画圆，缓解键盘疲劳',  breath: '自然呼吸，保持手臂放松' },
        eyes:     { name: '眼部放松', svg: 'eyes.svg',     duration: 20, target: '眼部肌群 & 视神经',  desc: '闭眼缓慢画圆，再极目远眺窗外 10 秒',   breath: '深吸气闭眼，呼气睁眼远望' },
        back:     { name: '脊柱扭转', svg: 'back.svg',     duration: 30, target: '竖脊肌 & 腰方肌',   desc: '坐直后双臂平举，缓缓向两侧扭转上身',   breath: '呼气时加深扭转幅度，吸气回中' },
    },

    sequences: {
        standard: ['neck', 'chest', 'squat'],
        desk:     ['neck', 'shoulder', 'wrist'],
        eye:      ['eyes', 'neck', 'shoulder'],
        full:     ['squat', 'chest', 'back', 'neck'],
    },

    getAudioCtx() {
        if (!this._audioCtx) this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return this._audioCtx;
    },

    playTone(freq, type, duration) {
        try {
            const ctx = this.getAudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch(e) {}
    },

    start(sequenceName) {
        if (!sequenceName) {
            const h = new Date().getHours();
            sequenceName = h >= 8 && h < 12 ? 'full' : h >= 12 && h < 18 ? 'desk' : 'standard';
        }
        this.sequence = this.sequences[sequenceName] || this.sequences.standard;
        this.currentStep = 0;
        UI.modal.show('workout-modal');
        this._loadStep();
    },

    _loadStep() {
        const exKey = this.sequence[this.currentStep];
        const ex = this.exercises[exKey];
        const total = this.sequence.length;
        const step = this.currentStep;
        document.getElementById('workout-step-cur').innerText = step + 1;
        document.getElementById('workout-step-total').innerText = total;
        this._renderDots(step, total);
        document.getElementById('workout-img').src = `/workout/${ex.svg}`;
        document.getElementById('workout-name').innerText = ex.name;
        document.getElementById('workout-target').innerText = '🎯 ' + ex.target;
        document.getElementById('workout-desc').innerText = ex.desc;
        document.getElementById('workout-breath').innerText = '🫁 ' + ex.breath;
        const btn = document.getElementById('workout-btn');
        btn.disabled = true;
        btn.innerText = step < total - 1 ? '下一个 →' : '完成打卡 ✅';
        const ring = document.getElementById('workout-ring-progress');
        if (ring) {
            ring.style.transition = 'none'; ring.style.strokeDashoffset = '0';
            requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.transition = 'stroke-dashoffset 1s linear'; }));
        }
        this.timeLeft = ex.duration;
        this._tick(ex.duration);
    },

    _tick(total) {
        if (this._interval) clearInterval(this._interval);
        const circumference = 263.9;
        const update = () => {
            document.getElementById('workout-countdown').innerText = this.timeLeft;
            const ring = document.getElementById('workout-ring-progress');
            if (ring) ring.style.strokeDashoffset = circumference * (1 - this.timeLeft / total);
            
            // 倒计时最后3秒提示音
            if (this.timeLeft > 0 && this.timeLeft <= 3) {
                this.playTone(440, 'sine', 0.1);
            }

            if (this.timeLeft <= 0) {
                clearInterval(this._interval);
                document.getElementById('workout-btn').disabled = false;
                this.playTone(880, 'sine', 0.3); // 完成提示音
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            } else { this.timeLeft--; }
        };
        update();
        this._interval = setInterval(update, 1000);
    },

    skip() { if (this._interval) clearInterval(this._interval); this._advance(); },
    next() { if (this._interval) clearInterval(this._interval); this._advance(); },

    _advance() {
        this.currentStep++;
        if (this.currentStep >= this.sequence.length) {
            UI.modal.hide('workout-modal');
            App.completeTask('SEDENTARY');
        } else { this._showRest(); }
    },

    _showRest() {
        document.getElementById('workout-btn').disabled = true;
        document.getElementById('workout-name').innerText = '组间休息';
        document.getElementById('workout-target').innerText = '';
        document.getElementById('workout-desc').innerText = '放松，准备下一个动作...';
        document.getElementById('workout-breath').innerText = '🫁 深呼吸，放松全身';
        let rest = 3;
        const circumference = 263.9;
        const ring = document.getElementById('workout-ring-progress');
        if (ring) {
            ring.style.transition = 'none'; ring.style.strokeDashoffset = '0';
            requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.transition = 'stroke-dashoffset 1s linear'; }));
        }
        if (this._interval) clearInterval(this._interval);
        this._interval = setInterval(() => {
            document.getElementById('workout-countdown').innerText = rest;
            if (ring) ring.style.strokeDashoffset = circumference * (1 - rest / 3);
            rest--;
            if (rest < 0) { clearInterval(this._interval); this._loadStep(); }
        }, 1000);
    },

    _renderDots(current, total) {
        document.getElementById('workout-step-dots').innerHTML =
            Array.from({ length: total }, (_, i) =>
                `<div class="workout-dot ${i < current ? 'done' : i === current ? 'active' : ''}"></div>`
            ).join('');
    },

    stop() { if (this._interval) clearInterval(this._interval); UI.modal.hide('workout-modal'); }
};

// ─── 🌬️ Breathing 呼吸训练模块 ────────────────────────────────────────────
const Breathing = {
    _interval: null,
    _phase: 'idle',
    _round: 0,
    _maxRounds: 4,
    _timer: 0,

    start() {
        this._round = 0;
        document.getElementById('breath-start-btn').disabled = true;
        this._nextPhase('inhale');
    },

    _nextPhase(phase) {
        this._phase = phase;
        const circle = document.getElementById('breath-circle');
        const inst = document.getElementById('breath-instruction');
        const roundEl = document.getElementById('breath-round');

        if (phase === 'inhale') {
            this._round++;
            if (this._round > this._maxRounds) { this._complete(); return; }
            roundEl.innerText = `第 ${this._round} / ${this._maxRounds} 轮`;
            circle.className = 'breath-circle inhale';
            inst.innerText = '👃 鼻子吸气...'; inst.style.color = 'var(--primary)';
            this._timer = 4;
            this._tick(() => this._nextPhase('hold'));
        } else if (phase === 'hold') {
            circle.className = 'breath-circle hold';
            inst.innerText = '⏸️ 屏住呼吸...'; inst.style.color = 'var(--gold)';
            this._timer = 7;
            this._tick(() => this._nextPhase('exhale'));
        } else if (phase === 'exhale') {
            circle.className = 'breath-circle exhale';
            inst.innerText = '😮‍💨 嘴巴呼气...'; inst.style.color = 'var(--secondary)';
            this._timer = 8;
            this._tick(() => this._nextPhase('inhale'));
        }
    },

    _tick(onComplete) {
        if (this._interval) clearInterval(this._interval);
        const timerEl = document.getElementById('breath-timer');
        timerEl.innerText = this._timer;
        this._interval = setInterval(() => {
            this._timer--;
            timerEl.innerText = this._timer;
            if (this._timer <= 0) { clearInterval(this._interval); onComplete(); }
        }, 1000);
    },

    _complete() {
        document.getElementById('breath-circle').className = 'breath-circle';
        document.getElementById('breath-instruction').innerText = '✨ 呼吸训练完成，身心已重置';
        document.getElementById('breath-timer').innerText = '✓';
        document.getElementById('breath-start-btn').disabled = false;
        UI.toast('🌬️ 4 轮呼吸训练完成，神经系统已校准', 'success');
    },

    stop() {
        if (this._interval) clearInterval(this._interval);
        this._phase = 'idle';
        document.getElementById('breath-circle').className = 'breath-circle';
        document.getElementById('breath-instruction').innerText = '准备开始';
        document.getElementById('breath-timer').innerText = '4';
        document.getElementById('breath-start-btn').disabled = false;
        document.getElementById('breath-round').innerText = '第 1 / 4 轮';
        UI.modal.hide('breathing-modal');
    }
};

// ─── 🎵 AmbientSound 环境音效模块（真实音频版）──────────────────────────────
const AmbientSound = {
    _ctx: null, _gainNode: null, _type: null,
    _audioEl: null, _mediaSource: null,
    // 🧠 心流动态音频
    _flowMode: false, _alphaSources: null, _alphaGain: null, _focusScore: 1.0, _flowUpdateInterval: null,

    // 音频文件映射
    _files: {
        white: '/audio/liecio-calming-rain-257596.mp3',
        rain:  '/audio/eryliaa-rain-and-birds-singing-in-the-forest-422415.mp3',
        cafe:  '/audio/freesound_community-birds-in-the-morning-24147.mp3',
    },

    _getCtx() {
        if (!this._ctx) this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this._ctx.state === 'suspended') this._ctx.resume();
        return this._ctx;
    },

    play(type) {
        this.stop();
        const ctx = this._getCtx();

        // 创建 <audio> 元素，懒加载，点击时才开始加载
        const audio = new Audio();
        audio.src = this._files[type];
        audio.loop = true;
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        this._audioEl = audio;

        // 接入 Web Audio API，保持心流增益控制链路不变
        this._gainNode = ctx.createGain();
        this._gainNode.gain.value = 0.85;
        this._gainNode.connect(ctx.destination);

        // MediaElementSource 只能创建一次，复用同一个 audio 元素
        const src = ctx.createMediaElementSource(audio);
        src.connect(this._gainNode);
        this._mediaSource = src;

        audio.play().catch(() => UI.toast('音频加载中，请稍候...', 'info'));

        this._type = type;
        this._updateBtns();
        if (this._flowMode) { this._stopAlpha(); this._startAlpha(); }
        const labels = { white: '轻柔雨声 🌧️', rain: '森林雨鸣 🌿', cafe: '清晨鸟鸣 🐦' };
        UI.toast(`🎵 ${labels[type]} 已开启`, 'success');
    },

    stop() {
        if (this._audioEl) {
            this._audioEl.pause();
            this._audioEl.src = '';
            this._audioEl = null;
            this._mediaSource = null;
        }
        if (this._gainNode) { try { this._gainNode.disconnect(); } catch(e){} this._gainNode = null; }
        this._stopAlpha();
        this._type = null;
        this._updateBtns();
    },

    _updateBtns() {
        document.querySelectorAll('.ambient-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.sound === this._type);
        });
        const flowBtn = document.getElementById('flow-toggle-btn');
        if (flowBtn) flowBtn.classList.toggle('active', this._flowMode);
    },

    // ── 🧠 心流动态音频 ──────────────────────────────────────────────────────
    _baseGain() {
        return 0.85; // 真实音频统一基准音量
    },

    updateFocusState(score) {
        this._focusScore = Math.max(0, Math.min(1, score));
    },

    toggleFlow() {
        if (this._flowMode) this.disableFlow();
        else this.enableFlow();
    },

    enableFlow() {
        if (this._flowMode) return;
        this._flowMode = true;
        this._updateBtns();
        if (this._type) { this._stopAlpha(); this._startAlpha(); }
        if (this._flowUpdateInterval) clearInterval(this._flowUpdateInterval);
        this._flowUpdateInterval = setInterval(() => this._applyFlow(), 2000);
        const ind = document.getElementById('flow-indicator');
        if (ind) ind.style.display = 'block';
        UI.toast('🧠 心流动态音频已激活，建议同时开启 CV 坐姿感知', 'success');
    },

    disableFlow() {
        if (!this._flowMode) return;
        this._flowMode = false;
        this._updateBtns();
        clearInterval(this._flowUpdateInterval);
        this._stopAlpha();
        // Restore base gain smoothly
        if (this._gainNode) {
            try {
                this._gainNode.gain.setTargetAtTime(this._baseGain(), this._getCtx().currentTime, 0.8);
            } catch(e) {}
        }
        const ind = document.getElementById('flow-indicator');
        if (ind) ind.style.display = 'none';
        UI.toast('🧠 心流模式已关闭', 'info');
    },

    _startAlpha() {
        if (this._alphaGain) return;
        try {
            const ctx = this._getCtx();
            this._alphaGain = ctx.createGain();
            this._alphaGain.gain.value = 0; // Start silent — applyFlow will ramp it up
            this._alphaGain.connect(ctx.destination);
            this._alphaSources = [];
            // Binaural alpha beat: left 200Hz / right 210Hz → perceive 10Hz alpha rhythm
            const oscL = ctx.createOscillator();
            oscL.type = 'sine'; oscL.frequency.value = 200;
            const panL = ctx.createStereoPanner(); panL.pan.value = -1;
            const gL = ctx.createGain(); gL.gain.value = 0.5;
            oscL.connect(gL); gL.connect(panL); panL.connect(this._alphaGain);
            oscL.start(); this._alphaSources.push(oscL);

            const oscR = ctx.createOscillator();
            oscR.type = 'sine'; oscR.frequency.value = 210;
            const panR = ctx.createStereoPanner(); panR.pan.value = 1;
            const gR = ctx.createGain(); gR.gain.value = 0.5;
            oscR.connect(gR); gR.connect(panR); panR.connect(this._alphaGain);
            oscR.start(); this._alphaSources.push(oscR);
        } catch(e) { console.warn('Alpha init error:', e); }
    },

    _stopAlpha() {
        if (this._alphaSources) {
            this._alphaSources.forEach(n => { try { n.stop(); } catch(e) {} });
            this._alphaSources = null;
        }
        if (this._alphaGain) {
            try { this._alphaGain.disconnect(); } catch(e) {}
            this._alphaGain = null;
        }
    },

    _applyFlow() {
        if (!this._flowMode) return;
        const score = this._focusScore;
        try {
            const ctx = this._getCtx();
            const base = this._baseGain();
            if (this._gainNode) {
                const targetGain = score >= 0.7 ? base
                    : score >= 0.4 ? base * 0.85
                    : base * 0.5;
                this._gainNode.gain.setTargetAtTime(targetGain, ctx.currentTime, 1.5);
            }
            if (this._alphaGain) {
                // Alpha intensity: subtle at mid-focus, strongest at deep focus, off when distracted
                const alphaTarget = score >= 0.7 ? 0.022
                    : score >= 0.4 ? 0.008
                    : 0;
                this._alphaGain.gain.setTargetAtTime(alphaTarget, ctx.currentTime, 2.0);
            }
        } catch(e) {}
    }
};
// ─── 🐾 Pet 健康小怪兽模块 ────────────────────────────────────────────────────
const Pet = {
    _badPostureMode: false,

    // 根据今日打卡数更新宠物状态
    update(drinkToday, restToday) {
        const total = drinkToday + restToday;
        let emoji, mood, hp;

        if (this._badPostureMode) {
            emoji = '🤒'; mood = '主人坐姿不对，我不舒服...'; hp = Math.max(10, total * 6);
        } else if (total === 0) {
            emoji = '🥚'; mood = '还是个蛋，等主人打卡孵化我！'; hp = 5;
        } else if (total < 3) {
            emoji = '😴'; mood = `主人加油呀，今天才打卡 ${total} 次...`; hp = 20 + total * 8;
        } else if (total < 6) {
            emoji = '😐'; mood = `不错，今天已打卡 ${total} 次，继续保持！`; hp = 40 + total * 6;
        } else if (total < 10) {
            emoji = '😊'; mood = `棒棒的！${total} 次打卡，我很开心！`; hp = 65 + total * 3;
        } else {
            emoji = '🤩'; mood = `哇！${total} 次！主人今天太厉害了！🎉`; hp = 100;
        }

        const hpClamped = Math.min(100, hp);
        const emojiEl = document.getElementById('pet-emoji');
        const moodEl = document.getElementById('pet-mood');
        const hpBar = document.getElementById('pet-hp-bar');
        const modalEmoji = document.getElementById('pet-modal-emoji');
        const modalHp = document.getElementById('pet-modal-hp');
        const modalHpTxt = document.getElementById('pet-modal-hp-text');
        const modalMsg = document.getElementById('pet-modal-msg');
        const statDrink = document.getElementById('pet-stat-drink');
        const statRest = document.getElementById('pet-stat-rest');

        if (emojiEl) emojiEl.innerText = emoji;
        if (moodEl) moodEl.innerText = mood;
        if (hpBar) hpBar.style.width = hpClamped + '%';
        if (modalEmoji) modalEmoji.innerText = emoji;
        if (modalHp) modalHp.style.width = hpClamped + '%';
        if (modalHpTxt) modalHpTxt.innerText = `活力值 ${hpClamped}%`;
        if (modalMsg) modalMsg.innerText = mood;
        if (statDrink) statDrink.innerText = drinkToday;
        if (statRest) statRest.innerText = restToday;

        // HP 低时让宠物动画加速提示
        const widget = document.getElementById('health-pet-widget');
        if (widget) {
            widget.style.borderColor = hpClamped < 30 ? 'rgba(244,63,94,0.5)' : 'var(--border)';
        }
    },

    // CV 坐姿检测回调
    setBadPosture(isBad) {
        this._badPostureMode = isBad;
        this.update(App.state.pet.drinkToday, App.state.pet.restToday);
    }
};

// ─── 🌦️ Weather 环境感知模块 (P5) ───────────────────────────────────────────
const Weather = {
    _data: null,

    async init() {
        await this._fetch();
        setInterval(() => this._fetch(), 30 * 60 * 1000); // 每 30 分钟刷新
    },

    async _fetch() {
        if (!navigator.geolocation) return;
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    timeout: 10000,
                    maximumAge: 3600000 // 允许用缓存坐标（1小时）
                });
            });
            const { latitude, longitude } = pos.coords;
            const resp = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(2)}&longitude=${longitude.toFixed(2)}&current_weather=true&timezone=auto`
            );
            if (!resp.ok) return;
            const json = await resp.json();
            const cw = json.current_weather;
            const info = this._codeToInfo(cw.weathercode);
            this._data = {
                icon: info.icon,
                label: info.label,
                rainy: info.rainy,
                temp: Math.round(cw.temperature),
                code: cw.weathercode,
                windspeed: Math.round(cw.windspeed)
            };
            localStorage.setItem('hg_weather', JSON.stringify(this._data));
            this._render();
            this._autoSound();
        } catch (e) {
            // 定位被拒绝或网络错误 — 静默失败，不影响其余功能
        }
    },

    _codeToInfo(code) {
        if (code === 0)  return { icon: '☀️',  label: '晴天',   rainy: false };
        if (code <= 3)   return { icon: '⛅',  label: '多云',   rainy: false };
        if (code <= 48)  return { icon: '🌫️', label: '雾/霾',  rainy: false };
        if (code <= 57)  return { icon: '🌦️', label: '毛毛雨', rainy: true  };
        if (code <= 67)  return { icon: '🌧️', label: '下雨',   rainy: true  };
        if (code <= 77)  return { icon: '❄️',  label: '降雪',   rainy: false };
        if (code <= 82)  return { icon: '🌧️', label: '阵雨',   rainy: true  };
        if (code <= 86)  return { icon: '🌨️', label: '阵雪',   rainy: false };
        if (code <= 99)  return { icon: '⛈️', label: '雷暴',   rainy: true  };
        return { icon: '🌡️', label: '未知', rainy: false };
    },

    // 下雨时自动切换雨声氛围音
    _autoSound() {
        if (!this._data || !this._data.rainy) return;
        if (typeof AmbientSound !== 'undefined' && AmbientSound._type !== 'rain') {
            AmbientSound.play('rain');
            UI.toast(`🌧️ 检测到${this._data.label}，已自动切换雨声氛围`, 'info');
        }
    },

    _render() {
        if (!this._data) return;
        const bar = document.getElementById('weather-bar');
        const statusEl = document.getElementById('weather-status');
        const tipEl = document.getElementById('weather-tip');
        if (bar) bar.style.display = 'flex';
        if (statusEl) {
            statusEl.innerHTML = `${this._data.icon} <strong>${this._data.temp}°C</strong> · ${this._data.label}`;
        }
        if (tipEl) {
            const msg = this._data.rainy
                ? '☂️ 雨天已自动开启雨声氛围音 🌧️'
                : this._data.temp >= 32 ? '🔆 高温天气，记得多喝水！'
                : this._data.temp <= 5  ? '🧥 天气寒冷，注意保暖补水'
                : '💚 天气宜人，保持好状态';
            tipEl.textContent = msg;
        }
    }
};

// ────────────────────────────────────────────────────────────────────────────

App.init();
