#!/bin/bash
#
# iDempiere 資料備份腳本
# 用途：備份 GardenWorld 的關鍵資料，以便測試後還原
#
# 使用方式：
#   ./backup.sh                    # 備份到預設目錄
#   ./backup.sh /path/to/backup    # 備份到指定目錄
#

set -e

# 載入設定
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/config.env"

# 備份目錄（可從參數指定）
BACKUP_DIR="${1:-$SCRIPT_DIR/backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"

echo "========================================"
echo "  iDempiere 資料備份"
echo "  時間: $(date)"
echo "  目標: $BACKUP_PATH"
echo "========================================"

# 建立備份目錄
mkdir -p "$BACKUP_PATH"

# 登入取得 Token
echo ""
echo "[1/3] 登入 API..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/auth/tokens" \
  -H "Content-Type: application/json" \
  -d "{\"userName\":\"$API_USER\",\"password\":\"$API_PASS\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登入失敗"
  echo "$LOGIN_RESPONSE"
  exit 1
fi
echo "✅ 登入成功"

# 設定 Context
echo ""
echo "[2/3] 設定 Context..."
CONTEXT_RESPONSE=$(curl -s -X PUT "$API_URL/api/v1/auth/tokens" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":$CLIENT_ID,\"roleId\":$ROLE_ID,\"organizationId\":$ORG_ID,\"warehouseId\":$WAREHOUSE_ID}")

TOKEN2=$(echo "$CONTEXT_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN2" ]; then
  echo "❌ 設定 Context 失敗"
  echo "$CONTEXT_RESPONSE"
  exit 1
fi
echo "✅ Context 設定成功"

# 備份函式
backup_table() {
  local TABLE=$1
  local FILTER=$2
  local FILENAME="$BACKUP_PATH/${TABLE}.json"

  echo -n "   備份 $TABLE..."

  if [ -n "$FILTER" ]; then
    URL="$API_URL/api/v1/models/$TABLE?\$filter=$FILTER"
  else
    URL="$API_URL/api/v1/models/$TABLE"
  fi

  RESPONSE=$(curl -s -X GET "$URL" \
    -H "Authorization: Bearer $TOKEN2")

  # 檢查是否成功
  if echo "$RESPONSE" | grep -q '"records"'; then
    echo "$RESPONSE" > "$FILENAME"
    COUNT=$(echo "$RESPONSE" | grep -o '"row-count":[0-9]*' | cut -d':' -f2)
    echo " ✅ ($COUNT 筆)"
  else
    echo " ⚠️ 無資料或失敗"
    echo "{\"records\":[], \"error\": \"No data or failed\"}" > "$FILENAME"
  fi
}

# 執行備份
echo ""
echo "[3/3] 備份資料..."

# 主檔資料
echo "   === 主檔 ==="
backup_table "M_Product"
backup_table "M_Product_Category"
backup_table "C_BPartner"
backup_table "C_BPartner_Location"
backup_table "M_Warehouse"
backup_table "M_Locator"
backup_table "C_UOM"
backup_table "M_PriceList"

# 庫存資料
echo "   === 庫存 ==="
backup_table "M_StorageOnHand"

# 交易資料（只備份最近的）
echo "   === 交易 ==="
backup_table "C_Order"
backup_table "C_OrderLine"
backup_table "M_InOut"
backup_table "M_InOutLine"

# 儲存備份資訊
echo ""
echo "   儲存備份資訊..."
cat > "$BACKUP_PATH/backup_info.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "date": "$(date -Iseconds)",
  "api_url": "$API_URL",
  "client_id": $CLIENT_ID,
  "client_name": "GardenWorld",
  "tables": [
    "M_Product",
    "M_Product_Category",
    "C_BPartner",
    "C_BPartner_Location",
    "M_Warehouse",
    "M_Locator",
    "C_UOM",
    "M_PriceList",
    "M_StorageOnHand",
    "C_Order",
    "C_OrderLine",
    "M_InOut",
    "M_InOutLine"
  ]
}
EOF

echo ""
echo "========================================"
echo "  備份完成！"
echo "  位置: $BACKUP_PATH"
echo "  檔案:"
ls -la "$BACKUP_PATH"
echo "========================================"
