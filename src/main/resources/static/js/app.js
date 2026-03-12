/**
 * HealthGuardian V2.0 - 核心逻辑控制器 (增强提醒版)
 */

const App = {
    state: {
        secretKey: localStorage.getItem('health_guardian_key'),
        username: '匿名用户',
        pomo: { interval: null, timeLeft: 25 * 60, isRunning: false },
        workout: { interval: null, timeLeft: 30 },
        charts: { weekly: null, hourly: null },
        meta: {
            medalMap: {
                'EARLY_BIRD': '🐦', 'NIGHT_OWL': '🦉', 'WATER_BUFFALO': '💧',
                'PERSISTENCE': '♾️', 'FOCUS_MASTER': '🧠', 'PRODUCTIVITY_BEAST': '🐯',
                'STRETCH_EXPERT': '🤸', 'COMMUNITY_STAR': '🎖️'
            }
        },
        reminders: [] // 存储提醒配置及其上次提醒时间
    },

    async init() {
        this.setupPWA();
        if (!this.state.secretKey) {
            UI.modal.show('welcome-modal');
        } else {
            await this.loadData();
            this.startGlobalBackgroundTimer(); // 开启全局巡检
        }
    },

    setupPWA() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
        }
        if (Notification.permission === 'default') Notification.requestPermission();
    },

    // --- 核心：全局后台巡检定时器 ---
    // 每分钟检查一次，看看有没有哪个协议该执行了
    startGlobalBackgroundTimer() {
        setInterval(() => {
            const now = new Date().getTime();
            this.state.reminders.forEach(r => {
                const intervalMs = r.interval_minutes * 60 * 1000;
                if (now - r.lastNotified >= intervalMs) {
                    this.triggerAlarm(r);
                    r.lastNotified = now; // 更新本地记录的提醒时间
                }
            });
        }, 60000); // 1分钟巡检一次
    },

    // 触发双端告警
    triggerAlarm(reminder) {
        const title = reminder.remind_type === 'DRINK' ? "💧 补给时间到！" : "🧘 调息时间到！";
        const isGuest = this.state.username.startsWith('访客_') || this.state.username === '匿名用户';
        const nickname = isGuest ? "神秘特工" : this.state.username;

        let body = reminder.remind_type === 'DRINK'
            ? `亲爱的 ${nickname}，您的机体需要补充水分了，请喝一杯水维持运转！`
            : `尊敬的 ${nickname}，检测到您的肌肉僵直时间过长，请跟我一起做一段微运动吧。`;

        // 1. 桌面通知
        const desktopEnabled = localStorage.getItem('desktop_notify_enabled') !== 'false';
        if (desktopEnabled && Notification.permission === 'granted') {
            new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/3105/3105807.png' });
        }

        // 2. 手机 Webhook 推送
        API.post('/api/notify/webhook', {
            secretKey: this.state.secretKey,
            message: `【提醒】${title} ${body}`
        });

        UI.toast(title, 'warning');
    },

    async loadData() {
        const prevKey = this.state.secretKey; // 记录调用前的旧 key，用于检测 key 是否失效
        try {
            const res = await API.get('/api/configs', { secretKey: this.state.secretKey });
            if (res.secretKey) {
                // ── Q3：检测 key 是否已失效（服务端分配了全新 key）──
                const keyExpired = prevKey && res.secretKey !== prevKey;

                this.state.secretKey = res.secretKey;
                this.state.username = res.username || '匿名用户';
                localStorage.setItem('health_guardian_key', res.secretKey);

                // ── Q3：将配置缓存到本地，供服务器异常时离线恢复 ──
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

                this.state.reminders = res.configs.map(c => ({
                    ...c,
                    lastNotified: new Date().getTime()
                }));

                UI.renderUser(res);
                UI.renderReminders(res.configs);
                this.refreshDashboard();

                // ── Q3：key 失效提示 ──
                if (keyExpired) {
                    setTimeout(() => UI.toast('⚠️ 上次会话已失效，已建立新身份。如需恢复账号数据，请点击「身份同步」登录', 'warning'), 800);
                }
                // ── Q2：老访客（有旧 key 但未绑定账号）提示绑定 ──
                else if (res.isRegistered === false && prevKey) {
                    setTimeout(() => UI.toast('💡 当前为匿名模式，清除浏览器缓存后数据将丢失，建议点击「身份同步」绑定账号', 'warning'), 1500);
                }
            }
        } catch (e) {
            // ── Q3：服务器异常时，从本地缓存恢复配置（离线模式）──
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
                } catch (_) {
                    UI.toast('⚠️ 服务器链路异常且无本地缓存', 'error');
                }
            } else {
                UI.toast('⚠️ 传感器链路异常', 'error');
            }
        }
    },

    async refreshDashboard() {
        try {
            const [stats, leaderboard, achievements] = await Promise.all([
                API.get('/api/stats', { secretKey: this.state.secretKey }),
                API.get('/api/leaderboard'),
                API.get('/api/user/achievements', { secretKey: this.state.secretKey })
            ]);
            UI.renderStats(stats);
            UI.renderLeaderboard(leaderboard);
            UI.renderAchievements(achievements);
        } catch (e) { }
    },

    async completeTask(type, btnElement) {
        await API.post('/api/complete', { type, secretKey: this.state.secretKey });

        // 打卡后，重置该项的提醒计时器（既然刚做完，就重新开始倒计时）
        const r = this.state.reminders.find(it => it.remind_type === type);
        if (r) r.lastNotified = new Date().getTime();

        UI.toast('记录已同步至云端', 'success');

        const isGuest = this.state.username.startsWith('访客_') || this.state.username === '匿名用户';
        const nickname = isGuest ? "神秘特工" : this.state.username;
        const action = type === 'DRINK' ? "完成了一次「水分补给」💧" : "完成了一组「身体拉伸」🧘";
        const praises = [
            "干得漂亮！机能正在恢复。",
            "太棒了，请继续保持这个节奏！",
            "您的健康生命值得到了显著提升！",
            "高度自律即是自由，这就是您强大的证明！",
            "状态绝佳，每一次打卡都是迈向巅峰的脚步。"
        ];
        const randomPraise = praises[Math.floor(Math.random() * praises.length)];

        API.post('/api/notify/webhook', {
            secretKey: this.state.secretKey,
            message: `【激励】${nickname} 刚刚${action}。\n> ${randomPraise}`
        });

        this.refreshDashboard();
    },

    tryComplete(type, btn) {
        if (type === 'SEDENTARY') Workout.start();
        else this.completeTask(type, btn);
    },

    confirmWorkout() {
        // 已由 Workout 模块接管，保留此方法供向后兼容
        Workout.next();
    },

    // --- 专注逻辑 ---
    startPomo() {
        this.state.pomo.isRunning = true;
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
        UI.updatePomoTimer(this.state.pomo.timeLeft);
        UI.updatePomoState(false);
    },

    async finishPomo() {
        clearInterval(this.state.pomo.interval);
        UI.toast('专注目标达成', 'success');
        await API.post('/api/pomodoro/complete', { secretKey: this.state.secretKey });

        const isGuest = this.state.username.startsWith('访客_') || this.state.username === '匿名用户';
        const nickname = isGuest ? "神秘特工" : this.state.username;

        API.post('/api/notify/webhook', {
            secretKey: this.state.secretKey,
            message: `【专注激励】${nickname} 完美完成了一个番茄钟（25分钟）的深度工作。高效产出，所向披靡！🧠`
        });

        this.stopPomo();
        this.refreshDashboard();
    },

    // --- 账户与配置 ---
    async handleAuth(username, password) {
        if (!username || !password) return UI.toast('请输入完整凭证', 'warning');
        const endpoint = UI.isLoginMode ? '/api/user/login' : '/api/user/bind';
        const res = await (UI.isLoginMode
            ? API.get(endpoint, { username, password, currentTempKey: this.state.secretKey })
            : API.post(endpoint, { username, password, secretKey: this.state.secretKey }));

        if (res.success || (typeof res === 'string' && res.includes('成功'))) {
            if (res.secretKey) localStorage.setItem('health_guardian_key', res.secretKey);
            UI.toast('同步成功', 'success');
            setTimeout(() => location.reload(), 1000);
        } else {
            const errMsg = res.msg || (typeof res === 'string' ? res : '操作失败');
            UI.toast(errMsg, 'error');
            // 若绑定失败是因为账号已存在，提示切换到登录模式
            if (!UI.isLoginMode && typeof res === 'string' && res.includes('已存在')) {
                setTimeout(() => UI.toast('提示：该账号已存在，请切换为「登录」模式召回', 'warning'), 1500);
            }
        }
    },

    async requestBrowserNotify() {
        if (!('Notification' in window)) {
            UI.toast('当前环境不支持浏览器通知', 'warning');
            return;
        }
        if (Notification.permission === 'denied') {
            UI.toast('通知权限已被拒绝，请在浏览器地址栏的锁图标处手动开启', 'warning');
            UI.updateNotifyPermBtn();
            return;
        }
        const perm = await Notification.requestPermission();
        if (perm === 'granted') {
            UI.toast('✅ 浏览器通知已成功开启！', 'success');
            // 发一条测试通知
            new Notification('HealthGuardian', { body: '浏览器推送通知已成功激活！' });
        } else {
            UI.toast('通知权限未获授权', 'warning');
        }
        UI.updateNotifyPermBtn();
    },

    async saveWebhook(url, webhookEnabled, desktopEnabled) {
        localStorage.setItem('desktop_notify_enabled', desktopEnabled);
        const res = await API.post('/api/user/webhook', { secretKey: this.state.secretKey, webhookUrl: url, enabled: webhookEnabled ? 1 : 0 });
        UI.toast('推送链路与本地通知已更新', 'success');
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
    }
};

const UI = {
    isLoginMode: false,
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

    updateNotifyPermBtn() {
        const btn = document.getElementById('notify-perm-btn');
        const status = document.getElementById('notify-perm-status');
        if (!btn || !('Notification' in window)) return;
        const perm = Notification.permission;
        if (perm === 'granted') {
            btn.innerText = '✅ 浏览器通知权限已开启';
            btn.disabled = true;
            if (status) status.innerText = '';
        } else if (perm === 'denied') {
            btn.innerText = '❌ 通知已被拒绝 (需浏览器手动开启)';
            btn.disabled = true;
            if (status) status.innerText = '请点击浏览器地址栏的 🔒 图标，将"通知"权限改为"允许"后刷新页面。';
        } else {
            btn.innerText = '🔔 点击授权开启浏览器推送通知';
            btn.disabled = false;
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

        // V3.0 HP 渲染逻辑
        const hp = data.hp || 100;
        const hpFill = document.getElementById('hp-fill');
        const hpVal = document.getElementById('hp-value');
        const hpCard = hpFill.closest('.glass-card');

        hpFill.style.width = hp + '%';
        hpVal.innerText = hp + '%';

        if (hp < 40) {
            hpFill.classList.add('danger');
            hpCard.classList.add('hp-low');
        } else {
            hpFill.classList.remove('danger');
            hpCard.classList.remove('hp-low');
        }

        // 诊断信息渲染
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
        container.innerHTML = data.map(a => `
            <div class="ach-item ${a.is_achieved ? 'active' : ''}" data-tip="${a.name}: ${a.description}">
                <div style="font-size:1.5rem; margin-bottom:5px">${App.state.meta.medalMap[a.code] || '🏅'}</div>
                <div style="font-size:0.6rem; font-weight:700">${a.name}</div>
            </div>`).join('');
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
        showLogin() {
            UI.isLoginMode = true;
            document.getElementById('modal-title-auth').innerText = "召回旧身份（登录）";
            document.getElementById('auth-mode-hint').innerText = "没有账号？";
            document.getElementById('auth-mode-switch').innerText = "立即创建新身份";
            this.show('auth-modal');
            this.hide('welcome-modal');
        },
        showBind() {
            UI.isLoginMode = false;
            document.getElementById('modal-title-auth').innerText = "创建 / 绑定身份";
            document.getElementById('auth-mode-hint').innerText = "已有账号？";
            document.getElementById('auth-mode-switch').innerText = "点击登录召回";
            this.show('auth-modal');
        },
        toggleAuthMode() {
            if (UI.isLoginMode) {
                this.showBind();
            } else {
                this.showLogin();
            }
        },
        showWebhook() {
            this.show('webhook-modal');
            UI.updateNotifyPermBtn();
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

    // 动作数据库
    exercises: {
        neck:     { name: '颈部拉伸', svg: 'neck.svg',     duration: 30, target: '颈椎 & 斜方肌',     desc: '缓慢左右转动颈部，充分感受侧颈拉伸',    breath: '吸气向左，呼气回中，再吸气向右' },
        chest:    { name: '扩胸开肩', svg: 'chest.svg',    duration: 30, target: '胸大肌 & 肩袖肌群',  desc: '双臂向后展开，挺胸抬头，打开胸腔',      breath: '吸气展肩，呼气内收，重复' },
        squat:    { name: '原地深蹲', svg: 'squat.svg',    duration: 30, target: '下肢 & 核心肌群',    desc: '双脚肩宽，缓慢蹲起，激活下肢血液循环',  breath: '下蹲吸气，起立呼气' },
        shoulder: { name: '肩部环绕', svg: 'shoulder.svg', duration: 25, target: '三角肌 & 冈上肌',   desc: '双肩同时向前画大圆，再反向画圆舒缓',    breath: '配合肩部节奏均匀呼吸' },
        wrist:    { name: '手腕舒展', svg: 'wrist.svg',    duration: 20, target: '腕屈肌 & 腕伸肌',   desc: '双手腕交替向内向外画圆，缓解键盘疲劳',  breath: '自然呼吸，保持手臂放松' },
        eyes:     { name: '眼部放松', svg: 'eyes.svg',     duration: 20, target: '眼部肌群 & 视神经',  desc: '闭眼缓慢画圆，再极目远眺窗外 10 秒',   breath: '深吸气闭眼，呼气睁眼远望' },
        back:     { name: '脊柱扭转', svg: 'back.svg',     duration: 30, target: '竖脊肌 & 腰方肌',   desc: '坐直后双臂平举，缓缓向两侧扭转上身',   breath: '呼气时加深扭转幅度，吸气回中' },
    },

    // 预设序列
    sequences: {
        standard: ['neck', 'chest', 'squat'],        // 标准混合
        desk:     ['neck', 'shoulder', 'wrist'],      // 久坐办公
        eye:      ['eyes', 'neck', 'shoulder'],       // CV 探颈触发 / 眼睛疲劳
        full:     ['squat', 'chest', 'back', 'neck'], // 全身激活
    },

    /**
     * 启动调息序列
     * @param {string} [sequenceName] 指定序列名；不传则按时段自动选择
     */
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

        // 步骤指示
        document.getElementById('workout-step-cur').innerText = step + 1;
        document.getElementById('workout-step-total').innerText = total;
        this._renderDots(step, total);

        // 动作内容
        document.getElementById('workout-img').src = `/workout/${ex.svg}`;
        document.getElementById('workout-name').innerText = ex.name;
        document.getElementById('workout-target').innerText = '🎯 ' + ex.target;
        document.getElementById('workout-desc').innerText = ex.desc;
        document.getElementById('workout-breath').innerText = '🫁 ' + ex.breath;

        // 按钮文字
        const btn = document.getElementById('workout-btn');
        btn.disabled = true;
        btn.innerText = step < total - 1 ? '下一个 →' : '完成打卡 ✅';

        // 重置环形进度条（无动画跳回满格）
        const ring = document.getElementById('workout-ring-progress');
        if (ring) {
            ring.style.transition = 'none';
            ring.style.strokeDashoffset = '0';
            // 下一帧再恢复动画，避免首帧跳变
            requestAnimationFrame(() => requestAnimationFrame(() => {
                ring.style.transition = 'stroke-dashoffset 1s linear';
            }));
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

            if (this.timeLeft <= 0) {
                clearInterval(this._interval);
                document.getElementById('workout-btn').disabled = false;
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            } else {
                this.timeLeft--;
            }
        };

        update(); // 立即渲染第一帧
        this._interval = setInterval(update, 1000);
    },

    /** 跳过当前动作，直接进入下一步 */
    skip() {
        if (this._interval) clearInterval(this._interval);
        this._advance();
    },

    /** 当前动作完成，进入下一步（或结束） */
    next() {
        if (this._interval) clearInterval(this._interval);
        this._advance();
    },

    _advance() {
        this.currentStep++;
        if (this.currentStep >= this.sequence.length) {
            // 全部完成
            UI.modal.hide('workout-modal');
            App.completeTask('SEDENTARY');
        } else {
            // 组间休息 3 秒
            this._showRest();
        }
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
            ring.style.transition = 'none';
            ring.style.strokeDashoffset = '0';
            requestAnimationFrame(() => requestAnimationFrame(() => {
                ring.style.transition = 'stroke-dashoffset 1s linear';
            }));
        }

        if (this._interval) clearInterval(this._interval);
        this._interval = setInterval(() => {
            document.getElementById('workout-countdown').innerText = rest;
            if (ring) ring.style.strokeDashoffset = circumference * (1 - rest / 3);
            rest--;
            if (rest < 0) {
                clearInterval(this._interval);
                this._loadStep();
            }
        }, 1000);
    },

    _renderDots(current, total) {
        document.getElementById('workout-step-dots').innerHTML =
            Array.from({ length: total }, (_, i) =>
                `<div class="workout-dot ${i < current ? 'done' : i === current ? 'active' : ''}"></div>`
            ).join('');
    },

    stop() {
        if (this._interval) clearInterval(this._interval);
        UI.modal.hide('workout-modal');
    }
};
// ────────────────────────────────────────────────────────────────────────────

App.init();
