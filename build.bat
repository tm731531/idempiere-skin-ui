@echo off
REM
REM 建構 OSGi Bundle JAR (Windows)
REM
REM 使用方式：
REM   build.bat
REM
REM 輸出：
REM   org.idempiere.ui.clinic_1.0.0.jar
REM

setlocal

set SCRIPT_DIR=%~dp0
set WEBAPP_DIR=%SCRIPT_DIR%webapp
set BUNDLE_DIR=%SCRIPT_DIR%osgi-bundle
set OUTPUT_JAR=%SCRIPT_DIR%org.idempiere.ui.clinic_1.0.0.jar

echo ==========================================
echo   iDempiere Clinic UI - Build Script
echo ==========================================
echo.

REM Step 1: 編譯 Vue 專案
echo [1/3] 編譯 Vue 專案...
cd /d "%WEBAPP_DIR%"
call npm run build
if errorlevel 1 (
    echo ❌ Vue 編譯失敗
    exit /b 1
)
echo ✅ Vue 編譯完成
echo.

REM Step 2: 建立 JAR
echo [2/3] 建立 OSGi JAR...
cd /d "%BUNDLE_DIR%"
jar cfm "%OUTPUT_JAR%" META-INF\MANIFEST.MF plugin.xml web
if errorlevel 1 (
    echo ❌ JAR 建立失敗
    exit /b 1
)
echo ✅ JAR 建立完成
echo.

REM Step 3: 顯示結果
echo [3/3] 建構完成！
echo.
echo 輸出檔案: %OUTPUT_JAR%
echo.
echo ==========================================
echo   部署說明
echo ==========================================
echo.
echo 1. 將 JAR 複製到 iDempiere plugins 目錄
echo.
echo 2. 重啟 iDempiere
echo.
echo 3. 訪問: http://your-server:8080/ui/
echo.

endlocal
