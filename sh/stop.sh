#!/bin/bash

# 获取当前脚本所在路径
SH_DIR=$(cd "$(dirname "$0")"; pwd)

# 只要你的 JAR 包名字里包含这个字符串
APP_NAME="health-guardian-0.0.1-SNAPSHOT.jar"

# 查找正在运行的 PID
PID=$(pgrep -f $APP_NAME)

if [ -z "$PID" ]; then
    echo "⚠️  [注意] $APP_NAME 并没有运行，无需停止。"
    exit 0
fi

echo "🛑 停止运行中 (PID: $PID) ..."
kill -15 $PID

# 给程序 5 秒钟释放资源
for i in {1..5}; do
    sleep 1
    if [ -z "$(pgrep -f $APP_NAME)" ]; then
        echo "✅ [成功] $APP_NAME 已经彻底停止。"
        exit 0
    fi
    echo "⌛️ 正在安全关闭 ($i/5)..."
done

# 强制杀死
echo "⚠️  程序未能在 5 秒内停止，执行强制杀死 (kill -9) ..."
kill -9 $PID
echo "✅ [成功] 已经强制杀死进程。"
