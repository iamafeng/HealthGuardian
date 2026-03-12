#!/bin/bash

# --- 1. 路径定位 ---
SH_DIR=$(cd "$(dirname "$0")"; pwd)
BASE_DIR=$(cd "$SH_DIR/.."; pwd)

# --- 2. 配置区 ---
APP_NAME="health-guardian-0.0.1-SNAPSHOT.jar"
BAK_DIR="$BASE_DIR/bak"

# --- 3. 检查是否有备份文件 ---
if [ ! -d "$BAK_DIR" ] || [ -z "$(ls -A $BAK_DIR)" ]; then
    echo "❌ [错误] 找不到任何备份文件，无法回滚！"
    exit 1
fi

# --- 4. 列出备份清单 ---
echo "📂 发现以下历史版本 (按时间倒序):"
echo "------------------------------------------------"
# 使用数组存储备份文件名
index=1
# ls -t 按时间排序，最新的在前
files=($(ls -t $BAK_DIR/*.bak))

for file in "${files[@]}"; do
    # 只显示文件名，不显示路径
    filename=$(basename "$file")
    echo "[$index] $filename"
    let index++
done
echo "------------------------------------------------"

# --- 5. 获取用户输入 ---
read -p "🎯 请输入要回滚的序号 (输入 q 退出): " choice

if [ "$choice" == "q" ]; then
    echo "已取消回滚。"
    exit 0
fi

# 检查输入是否为数字，且在有效范围内
if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt ${#files[@]} ]; then
    echo "❌ [错误] 无效的序号！"
    exit 1
fi

# 获取选中的文件路径
SELECTED_FILE=${files[$((choice-1))]}
SELECTED_NAME=$(basename "$SELECTED_FILE")

echo "⚠️  警告：系统将停止当前程序，并回滚至版本 [$SELECTED_NAME]"
read -p "确认继续执行吗？(y/n): " confirm
if [ "$confirm" != "y" ]; then
    echo "回滚已终止。"
    exit 0
fi

# --- 6. 执行回滚逻辑 ---
echo "🛑 正在停止当前服务..."
sh $SH_DIR/stop.sh

echo "🔄 正在替换 JAR 包..."
cp $SELECTED_FILE $BASE_DIR/$APP_NAME

echo "🚀 正在重新启动服务..."
sh $SH_DIR/start.sh

echo "✨ [大功告成] 系统已成功恢复到历史版本：$SELECTED_NAME"
