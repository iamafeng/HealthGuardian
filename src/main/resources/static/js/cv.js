const CV = {
    detector: null,
    video: null,
    canvas: null,
    ctx: null,
    isDetecting: false,
    frameId: null,
    
    baseline: null,
    badPostureFrames: 0,
    lastWarningTime: 0,

    // 👁️ 眼部疲劳追踪
    gazeStartTime: null,
    eyeFatigueAlertSent: false,
    blinkEvents: [],       // 记录眨眼时间戳
    lastEyeScore: 1.0,    // 上一帧眼睛置信度
    eyeScoreHistory: [],   // 平滑缓冲
    lastGazeUpdateTime: 0,

    async init() {
        this.video = document.getElementById('cv-video');
        this.canvas = document.getElementById('cv-canvas');
        if(this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }

        // ── 检查环境安全 ──────────────────────────────────────
        const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        
        if (!isSecure) {
            console.warn("CV Module disabled: Insecure context. Camera requires HTTPS or localhost.");
            const cvContainer = document.querySelector('.cv-container');
            if (cvContainer) cvContainer.style.display = 'none';
            return;
        }

        if (!hasMedia) {
             const overlay = document.getElementById('cv-overlay-text');
             if (overlay) overlay.innerText = "浏览器不支持摄像头 ⚠️";
             const startBtn = document.getElementById('cv-start');
             if (startBtn) startBtn.disabled = true;
        }
    },

    async start() {
        if (!this.video || !this.canvas) return;
        
        // ── 前置检查：再次确认环境 ──────────────────────────────────────
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            UI.toast('🚫 浏览器环境不支持摄像头访问', 'error');
            return;
        }

        // ── 前置检查：强制重置状态 ──────────────────────────────────────
        if (this.isDetecting) this.stop();

        // ── 前置检查：确认 AI 库已成功加载 ──────────────────────────────────
        if (typeof tf === 'undefined') {
            document.getElementById('cv-overlay-text').innerText = "TensorFlow 库未加载";
            document.getElementById('cv-start').disabled = false;
            UI.toast('🌐 TF.js 未加载，请检查网络连接后刷新页面（如使用广告拦截插件，请将本站加入白名单）', 'error');
            return;
        }
        if (typeof poseDetection === 'undefined') {
            document.getElementById('cv-overlay-text').innerText = "姿态检测库未加载";
            document.getElementById('cv-start').disabled = false;
            UI.toast('🌐 姿态检测库未加载，请检查网络连接后刷新页面', 'error');
            return;
        }

        document.getElementById('cv-overlay-text').innerText = "加载神经常规网络...";
        document.getElementById('cv-start').disabled = true;
        
        try {
            if (!this.detector) {
                // 加载 MoveNet 模型（需能访问 storage.googleapis.com）
                document.getElementById('cv-overlay-text').innerText = "下载视觉权重 (6MB)...";
                await tf.ready(); // 确保 tf 已准备好
                await tf.setBackend('webgl');
                this.detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
                    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
                    enableSmoothing: true
                });
            }

            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 320, height: 240, facingMode: 'user' } 
            });
            this.video.srcObject = stream;
            
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    resolve();
                };
            });

            this.isDetecting = true;
            document.getElementById('cv-stop').disabled = false;
            document.getElementById('cv-overlay-text').style.display = 'none';
            UI.toast('已接管机体视觉阵列', 'success');
            
            // 开始标定基准线 (3秒后)
            setTimeout(() => {
                if(this.isDetecting) {
                   this.calibrateBaseline();
                }
            }, 3000);

            this.detectFrame();
            
        } catch (e) {
            console.error("CV Engine Error:", e);
            // 根据错误类型给出有针对性的提示
            let errMsg = '核心视觉引擎启动失败';
            if (e && (e.name === 'NotAllowedError' || (e.message && e.message.includes('Permission')))) {
                errMsg = '摄像头权限被拒绝 🔒，请在浏览器地址栏点击锁图标允许摄像头访问后重试';
            } else if (e && e.name === 'NotFoundError') {
                errMsg = '未检测到摄像头设备，请确认摄像头已连接';
            } else if (e && (e.name === 'NotReadableError' || e.name === 'TrackStartError')) {
                errMsg = '摄像头被其他程序占用，请关闭其他使用摄像头的应用后重试';
            } else if (e && e.message && (e.message.includes('webgl') || e.message.includes('WebGL'))) {
                errMsg = 'WebGL 不可用，请使用支持 WebGL 的现代浏览器（Chrome / Edge 推荐）';
            } else if (e && e.message && (e.message.includes('fetch') || e.message.includes('network') || e.message.includes('load'))) {
                errMsg = '🌐 AI 模型下载失败（需访问 Google 服务）。如在大陆，请配置代理后重试，或使用桌面端（已内置本地模型）';
            } else {
                errMsg = `启动失败: ${e ? (e.message || e.toString()).slice(0, 60) : '未知错误'}`;
            }
            document.getElementById('cv-overlay-text').innerText = "传感器链路异常 ⚠️";
            document.getElementById('cv-start').disabled = false;
            UI.toast(errMsg, 'error');
        }
    },

    stop() {
        this.isDetecting = false;
        if (this.frameId) cancelAnimationFrame(this.frameId);
        if (this.video && this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(t => t.stop());
        }
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        const overlay = document.getElementById('cv-overlay-text');
        if (overlay) {
            overlay.style.display = 'block';
            overlay.innerText = "传感器待命中";
        }
        document.getElementById('cv-start').disabled = false;
        document.getElementById('cv-stop').disabled = true;
        this.baseline = null;
        localStorage.setItem('hg_posture_bad', '0'); // 重置灵动岛坐姿状态
        // 重置疲劳追踪
        this.gazeStartTime = null;
        this.eyeFatigueAlertSent = false;
        this.blinkEvents = [];
        this.lastEyeScore = 1.0;
        const eyeDisplay = document.getElementById('eye-fatigue-display');
        if (eyeDisplay) eyeDisplay.style.display = 'none';
        // 重置心流音频指示器至中性状态
        if (typeof AmbientSound !== 'undefined' && AmbientSound._flowMode) {
            AmbientSound.updateFocusState(1.0);
            const bar = document.getElementById('flow-score-bar');
            if (bar) bar.style.width = '60%';
            const lvl = document.getElementById('flow-level-text');
            if (lvl) { lvl.textContent = '等待 CV 感知...'; lvl.style.color = 'var(--primary)'; }
        }
    },

    calibrateBaseline() {
       // 会在下一帧记录 baseline
       this.baseline = 'pending';
    },

    async detectFrame() {
        if (!this.isDetecting) return;
        
        try {
            const poses = await this.detector.estimatePoses(this.video);
            
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            
            let isBadPosture = false;

            if (poses && poses.length > 0) {
                const pose = poses[0];
                const keypoints = pose.keypoints;
                
                // 找到眼睛：0 鼻子, 1 左眼, 2 右眼, 3 左耳, 4 右耳, 5 左肩, 6 右肩
                const leftEye = keypoints[1];
                const rightEye = keypoints[2];
                
                if (leftEye.score > 0.3 && rightEye.score > 0.3) {
                    // 计算双眼距离，作为面部大小的基准
                    const eyeDist = Math.sqrt(Math.pow(leftEye.x - rightEye.x, 2) + Math.pow(leftEye.y - rightEye.y, 2));
                    
                    if (this.baseline === 'pending') {
                        this.baseline = eyeDist;
                        UI.toast('面部拓扑基准已锚定', 'success');
                    } else if (this.baseline !== null) {
                        if (eyeDist > this.baseline * 1.4) {
                            isBadPosture = true;
                        } 
                    }

                    // ─── 👁️ 注视时长 & 眨眼率追踪 ───
                    const now = Date.now();
                    if (!this.gazeStartTime) this.gazeStartTime = now;
                    const gazeMinutes = Math.floor((now - this.gazeStartTime) / 60000);

                    // 眨眼检测：置信度从高→低→高视为一次眨眼
                    const avgScore = (leftEye.score + rightEye.score) / 2;
                    this.eyeScoreHistory.push(avgScore);
                    if (this.eyeScoreHistory.length > 5) this.eyeScoreHistory.shift();
                    const smoothed = this.eyeScoreHistory.reduce((a,b)=>a+b,0)/this.eyeScoreHistory.length;
                    if (this.lastEyeScore > 0.55 && smoothed < 0.35) {
                        this.blinkEvents.push(now);
                    }
                    this.lastEyeScore = smoothed;
                    // 只保留最近 60 秒的眨眼事件
                    this.blinkEvents = this.blinkEvents.filter(t => now - t < 60000);
                    const blinkRate = this.blinkEvents.length;

                    // ─── 🧠 心流动态音频：专注度得分 ─────────────────────────────
                    if (typeof AmbientSound !== 'undefined' && AmbientSound._flowMode) {
                        // 正常眨眼率 4–18 次/分钟；过高或过低均表示疲劳/分散
                        const blinkOk = blinkRate >= 4 && blinkRate <= 18;
                        const focusScore = (isBadPosture ? 0.15 : 0.6) + (blinkOk ? 0.4 : 0.0);
                        AmbientSound.updateFocusState(focusScore);
                        const bar = document.getElementById('flow-score-bar');
                        if (bar) bar.style.width = (focusScore * 100) + '%';
                        const lvl = document.getElementById('flow-level-text');
                        if (lvl) {
                            lvl.textContent = focusScore >= 0.7 ? '深度心流 🌊'
                                : focusScore >= 0.4 ? '轻度专注 💡'
                                : '注意力分散 ⚠️';
                            lvl.style.color = focusScore >= 0.7 ? 'var(--success)'
                                : focusScore >= 0.4 ? 'var(--primary)'
                                : 'var(--accent)';
                        }
                    }

                    // 更新 UI（每秒一次，避免抖动）
                    if (now - this.lastGazeUpdateTime > 1000) {
                        this.lastGazeUpdateTime = now;
                        const eyeDisplay = document.getElementById('eye-fatigue-display');
                        if (eyeDisplay) {
                            eyeDisplay.style.display = 'flex';
                            document.getElementById('gaze-duration').innerText = gazeMinutes;
                            const blinkEl = document.getElementById('blink-rate');
                            if (blinkEl) blinkEl.innerText = blinkRate;
                            // 预警着色
                            const gazeEl = document.getElementById('gaze-duration');
                            if (gazeMinutes >= 15) gazeEl.style.color = 'var(--warning)';
                            else if (gazeMinutes >= 20) gazeEl.style.color = 'var(--accent)';
                            else gazeEl.style.color = 'var(--primary)';
                        }
                    }
                    // 超过 20 分钟连续注视 → 触发护眼提醒
                    if (gazeMinutes >= 20 && !this.eyeFatigueAlertSent) {
                        this.eyeFatigueAlertSent = true;
                        this.triggerEyeFatigueAlert();
                    }
                } else {
                    // 面部消失（用户低头/离开屏幕）→ 重置注视计时
                    if (this.gazeStartTime) {
                        this.gazeStartTime = null;
                        this.eyeFatigueAlertSent = false;
                        const eyeDisplay = document.getElementById('eye-fatigue-display');
                        if (eyeDisplay) eyeDisplay.style.display = 'none';
                    }
                    // 心流：面部不可见时专注度归零
                    if (typeof AmbientSound !== 'undefined' && AmbientSound._flowMode) {
                        AmbientSound.updateFocusState(0);
                        const bar = document.getElementById('flow-score-bar');
                        if (bar) bar.style.width = '0%';
                        const lvl = document.getElementById('flow-level-text');
                        if (lvl) { lvl.textContent = '未检测到面部 👀'; lvl.style.color = 'var(--text-dim)'; }
                    }
                }
                
                // 绘制赛博风格骨架描点
                this.ctx.fillStyle = isBadPosture ? '#ff4757' : '#00f2fe';
                this.ctx.strokeStyle = isBadPosture ? 'rgba(255, 71, 87, 0.5)' : 'rgba(0, 242, 254, 0.5)';
                this.ctx.lineWidth = 2;

                const connectedPartPairs = [
                    [1,3], [2,4], [1,0], [2,0], [5,7], [6,8], [5,6]
                ];

                connectedPartPairs.forEach(pair => {
                    const p1 = keypoints[pair[0]];
                    const p2 = keypoints[pair[1]];
                    if(p1 && p2 && p1.score > 0.3 && p2.score > 0.3) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(p1.x, p1.y);
                        this.ctx.lineTo(p2.x, p2.y);
                        this.ctx.stroke();
                    }
                });

                keypoints.forEach(k => {
                    if (k.score > 0.3) {
                        this.ctx.beginPath();
                        this.ctx.arc(k.x, k.y, 3, 0, 2 * Math.PI);
                        this.ctx.fill();
                    }
                });
            }
            
            if (isBadPosture) {
                this.badPostureFrames++;
                if (this.badPostureFrames > 45) { // 大约连续 1-2 秒探颈
                    const now = Date.now();
                    if (now - this.lastWarningTime > 15000) { // 每15秒最多警告一次
                       this.triggerWarning();
                       this.lastWarningTime = now;
                    }
                    this.badPostureFrames = 0;
                }
                // 同步宠物状态 + 灵动岛 localStorage 桥接
                if (typeof Pet !== 'undefined') Pet.setBadPosture(true);
                localStorage.setItem('hg_posture_bad', '1');
            } else {
                this.badPostureFrames = Math.max(0, this.badPostureFrames - 2);
                // 恢复正常时清除宠物病态
                if (this.badPostureFrames === 0) {
                    if (typeof Pet !== 'undefined') Pet.setBadPosture(false);
                    localStorage.setItem('hg_posture_bad', '0');
                }
            }
        } catch(e) {
            // Ignore frame errors
        }

        this.frameId = requestAnimationFrame(() => this.detectFrame());
    },

    triggerWarning() {
        UI.toast('⚠️ 生命警告：检测到严重「探颈」体态！', 'error');
        document.body.style.boxShadow = "inset 0 0 80px rgba(255, 71, 87, 0.6)";
        setTimeout(() => document.body.style.boxShadow = "none", 800);
        if (typeof Workout !== 'undefined') {
            setTimeout(() => Workout.start('eye'), 1200);
        }
        if (App.state && App.state.secretKey && App.state.isRegistered) {
            API.post('/api/notify/webhook', {
                secretKey: App.state.secretKey,
                message: `【机体告警】AI 行为模型侦测到违规坐姿（探颈/僵死前倾）。颈椎承载超限 150%，强烈建议您立刻后仰并执行调息协议！`
            });
        }
    },

    triggerEyeFatigueAlert() {
        UI.toast('👁️ 注视时长已达 20 分钟，眼部疲劳预警！建议远眺 20 秒', 'warning');
        document.body.style.boxShadow = "inset 0 0 60px rgba(251, 191, 36, 0.4)";
        setTimeout(() => document.body.style.boxShadow = "none", 1200);
        // 自动触发眼部放松序列
        if (typeof Workout !== 'undefined') {
            setTimeout(() => Workout.start('eye'), 1500);
        }
        if (App.state && App.state.secretKey && App.state.isRegistered) {
            API.post('/api/notify/webhook', {
                secretKey: App.state.secretKey,
                message: `【护眼预警】连续注视屏幕已超过 20 分钟。请立即远眺窗外或执行眼部放松协议！`
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', () => CV.init());
