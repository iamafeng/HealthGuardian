#!/bin/bash

# --- 1. 路径定位 ---
SH_DIR=$(cd "$(dirname "$0")"; pwd)
BASE_DIR=$(cd "$SH_DIR/.."; pwd)

# --- 2. 配置区 ---
APP_NAME="health-guardian-0.0.1-SNAPSHOT.jar"
JAR_PATH="$BASE_DIR/$APP_NAME"
DEPLOY_DIR="$BASE_DIR/deploy"      # 新增：待部署目录
NEW_JAR="$DEPLOY_DIR/$APP_NAME"    # 新增：新上传的包路径
BAK_DIR="$BASE_DIR/bak"
LOG_FILE="$BASE_DIR/app.log"

# --- 3. 检查是否有新包需要部署 ---
if [ -f "$NEW_JAR" ]; then
    echo "📦 检测到新版本，准备执行更新流程..."

    # 3.1 备份当前正在运行的旧版本 (如果存在)
    if [ -f "$JAR_PATH" ]; then
        echo "🗄️  正在备份当前旧版本..."
        mkdir -p $BAK_DIR
        BAK_NAME="$APP_NAME.$(date +%Y%m%d_%H%M%S).bak"
        cp "$JAR_PATH" "$BAK_DIR/$BAK_NAME"
        echo "✅ 旧版本已备份至: bak/$BAK_NAME"
    fi

    # 3.2 停止旧程序
    PID=$(pgrep -f $APP_NAME)
    if [ -n "$PID" ]; then
        echo "⚠️  程序正在运行 (PID: $PID)，正在停止以替换新包..."
        sh $SH_DIR/stop.sh
        sleep 2
    fi

    # 3.3 替换新包 (从 deploy 移动到主目录)
    echo "🚚 正在部署新包到根目录..."
    mv "$NEW_JAR" "$JAR_PATH"

else
    echo "ℹ️  未检测到新包 ($NEW_JAR)，将直接检查并启动当前版本。"
fi

# --- 4. 检查 JAR 包是否存在 (根目录) ---
if [ ! -f "$JAR_PATH" ]; then
    echo "❌ [错误] 根目录下找不到 $APP_NAME，且 deploy/ 目录下也没有新包！"
    exit 1
fi

# --- 5. 清理旧备份 (保留 3 个) ---
OLD_BAKS=$(ls -t $BAK_DIR/*.bak 2>/dev/null | tail -n +4)
if [ -n "$OLD_BAKS" ]; then
    echo "🧹 正在清理过期备份..."
    rm -f $OLD_BAKS
fi

# --- 6. 启动 ---
# 再次检查 PID，防止手动启动导致的重复加载
PID=$(pgrep -f $APP_NAME)
if [ -z "$PID" ]; then
    echo "🚀 正在启动服务..."
    cd $BASE_DIR
    nohup java -jar $JAR_PATH > $LOG_FILE 2>&1 &
    sleep 2
else
    echo "⚠️  程序已在运行中 (PID: $PID)，跳过启动。"
fi

# --- 7. 结果验证 ---
NEW_PID=$(pgrep -f $APP_NAME)
if [ -n "$NEW_PID" ]; then
    echo "✨ [成功] $APP_NAME 运行中！(PID: $NEW_PID)"
else
    echo "❌ [失败] 启动失败，请检查 app.log"
fi
