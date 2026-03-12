#!/bin/bash

# --- 1. 路径定位 ---
SH_DIR=$(cd "$(dirname "$0")"; pwd)
BASE_DIR=$(cd "$SH_DIR/.."; pwd)

# --- 2. 配置区 ---
APP_NAME="health-guardian-0.0.1-SNAPSHOT.jar"
JAR_PATH="$BASE_DIR/$APP_NAME"
BAK_DIR="$BASE_DIR/bak"
LOG_FILE="$BASE_DIR/app.log"

# --- 3. 检查 JAR 包是否存在 ---
if [ ! -f "$JAR_PATH" ]; then
    echo "❌ [错误] 根目录下找不到 $APP_NAME，请先上传 JAR 包！"
    exit 1
fi

# --- 4. 备份旧版本 (核心新增) ---
echo "📦 正在执行版本备份..."
mkdir -p $BAK_DIR
# 生成带时间戳的备份文件名
BAK_NAME="$APP_NAME.$(date +%Y%m%d_%H%M%S).bak"
cp $JAR_PATH $BAK_DIR/$BAK_NAME
echo "✅ 已备份至: bak/$BAK_NAME"

# --- 5. 清理旧备份 (只留最新的 3 个) ---
# ls -t: 按时间排序
# tail -n +4: 从第 4 个开始（即排除掉前 3 个最新的）
OLD_BAKS=$(ls -t $BAK_DIR/*.bak 2>/dev/null | tail -n +4)
if [ -n "$OLD_BAKS" ]; then
    echo "🧹 正在清理过期备份..."
    rm -f $OLD_BAKS
    echo "✅ 已清理旧备份，仅保留最近 3 个版本。"
fi

# --- 6. 检查是否在运行，并启动 ---
PID=$(pgrep -f $APP_NAME)
if [ -n "$PID" ]; then
    echo "⚠️  [注意] 程序正在运行 (PID: $PID)，正在尝试安全重启..."
    sh $SH_DIR/stop.sh
    sleep 2
fi

echo "🚀 启动新版本..."
cd $BASE_DIR
nohup java -jar $JAR_PATH > $LOG_FILE 2>&1 &

sleep 2
NEW_PID=$(pgrep -f $APP_NAME)
if [ -n "$NEW_PID" ]; then
    echo "✨ [成功] $APP_NAME 部署成功！(PID: $NEW_PID)"
else
    echo "❌ [失败] 启动失败，请检查 app.log"
fi
