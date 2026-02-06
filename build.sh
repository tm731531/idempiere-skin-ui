#!/bin/bash
#
# 建構 OSGi Bundle JAR
#
# 使用方式：
#   ./build.sh
#
# 輸出：
#   org.idempiere.ui.clinic_1.0.0.jar
#

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBAPP_DIR="$SCRIPT_DIR/webapp"
BUNDLE_DIR="$SCRIPT_DIR/osgi-bundle"
OUTPUT_JAR="$SCRIPT_DIR/org.idempiere.ui.clinic_1.0.0.jar"

echo "=========================================="
echo "  iDempiere Clinic UI - Build Script"
echo "=========================================="
echo ""

# Step 1: 編譯 Vue 專案
echo "[1/3] 編譯 Vue 專案..."
cd "$WEBAPP_DIR"
npm run build
echo "✅ Vue 編譯完成"
echo ""

# Step 2: 建立 JAR
echo "[2/3] 建立 OSGi JAR..."
cd "$BUNDLE_DIR"
jar cfm "$OUTPUT_JAR" META-INF/MANIFEST.MF plugin.xml web
echo "✅ JAR 建立完成"
echo ""

# Step 3: 顯示結果
echo "[3/3] 建構完成！"
echo ""
echo "輸出檔案: $OUTPUT_JAR"
echo "檔案大小: $(ls -lh "$OUTPUT_JAR" | awk '{print $5}')"
echo ""
echo "=========================================="
echo "  部署說明"
echo "=========================================="
echo ""
echo "1. 將 JAR 複製到 iDempiere plugins 目錄："
echo "   cp $OUTPUT_JAR /path/to/idempiere/plugins/"
echo ""
echo "2. 重啟 iDempiere"
echo ""
echo "3. 訪問: http://your-server:8080/ui/"
echo ""
