#!/bin/bash

# --- 1. 路径定位 ---
SH_DIR=$(cd "$(dirname "$0")"; pwd)
BASE_DIR=$(cd "$SH_DIR/.."; pwd)

# --- 2. 配置区 ---
APP_NAME="health-guardian-0.0.1-SNAPSHOT.jar"
LOG_FILE="$BASE_DIR/app.log"

# --- 3. 获取进程状态 ---
PID=$(pgrep -f $APP_NAME)

echo "------------------------------------------------"
if [ -n "$PID" ]; then
    echo "✅ [状态] $APP_NAME 正在运行中。"
    echo "📊 进程 ID (PID): $PID"
    echo "📁 项目根目录: $BASE_DIR"
    echo "🕐 已经运行时间: $(ps -o etime= -p $PID)"
    echo "💾 内存占用: $(ps -o %mem= -p $PID)%"
else
    echo "❌ [状态] $APP_NAME 处于停止状态。"
fi
echo "------------------------------------------------"

# --- 4. 打印最近日志 (核心新增) ---
if [ -f "$LOG_FILE" ]; then
    echo "📝 最近 10 行运行日志 ($LOG_FILE):"
    echo ">>>"
    tail -n 10 "$LOG_FILE"
    echo ">>>"
else
    echo "⚠️  未发现日志文件，程序可能尚未启动或未生成日志。"
fi
echo "------------------------------------------------"
