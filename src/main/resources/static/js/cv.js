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

    async init() {
        this.video = document.getElementById('cv-video');
        this.canvas = document.getElementById('cv-canvas');
        if(this.canvas) {
            this.ctx = this.canvas.getContext('2d');
        }
    },

    async start() {
        if (!this.video || !this.canvas) return;
        document.getElementById('cv-overlay-text').innerText = "加载神经常规网络...";
        document.getElementById('cv-start').disabled = true;
        
        try {
            if (!this.detector) {
                // 加载 MoveNet 模型
                await tf.setBackend('webgl');
                this.detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
                    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
                });
            }

            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
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
            document.getElementById('cv-overlay-text').innerText = "传感器链路异常";
            document.getElementById('cv-start').disabled = false;
            UI.toast('核心视觉引擎无法获取摄像头或模型加载失败', 'error');
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
                        // 探颈检测的核心逻辑：如果双眼距离比基准大 1.4 倍，说明此时大幅靠近屏幕
                        if (eyeDist > this.baseline * 1.4) {
                            isBadPosture = true;
                        } 
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
            } else {
                this.badPostureFrames = Math.max(0, this.badPostureFrames - 2);
            }
        } catch(e) {
            // Ignore frame errors
        }

        this.frameId = requestAnimationFrame(() => this.detectFrame());
    },

    triggerWarning() {
        UI.toast('⚠️ 生命警告：检测到严重「探颈」体态！', 'error');
        // 可视化红色闪烁
        document.body.style.boxShadow = "inset 0 0 80px rgba(255, 71, 87, 0.6)";
        setTimeout(() => document.body.style.boxShadow = "none", 800);

        // 自动触发眼部+颈部调息序列
        if (typeof Workout !== 'undefined') {
            setTimeout(() => Workout.start('eye'), 1200);
        }

        // 发送 webhook 到手机
        if (App.state && App.state.secretKey) {
            API.post('/api/notify/webhook', {
                secretKey: App.state.secretKey,
                message: `【机体告警】AI 行为模型侦测到违规坐姿（探颈/僵死前倾）。颈椎承载超限 150%，强烈建议您立刻后仰并执行调息协议！`
            });
        }
    }
};

document.addEventListener('DOMContentLoaded', () => CV.init());
