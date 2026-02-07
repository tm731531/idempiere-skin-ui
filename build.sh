#!/bin/bash
#
# iDempiere Clinic UI - Build & Deploy script
# Produces a WAB JAR (Web Application Bundle) for iDempiere OSGi/Jetty
#
# Usage:
#   ./build.sh           # Build only (outputs JAR)
#   ./build.sh --deploy  # Build + deploy JAR to iDempiere plugins/
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBAPP_DIR="$SCRIPT_DIR/webapp"
BUNDLE_DIR="$SCRIPT_DIR/osgi-bundle"
IDEMPIERE_HOME="${IDEMPIERE_HOME:-/opt/idempiere-server/x86_64}"

# Generate timestamp qualifier (OSGi alphanumeric: yyyyMMddHHmm)
BUILD_TIMESTAMP="$(date +%Y%m%d%H%M)"
JAR_NAME="org.idempiere.ui.clinic_1.0.0.${BUILD_TIMESTAMP}.jar"
OUTPUT_JAR="$SCRIPT_DIR/$JAR_NAME"

echo "=========================================="
echo "  iDempiere Clinic UI - Build Script"
echo "  Build: $BUILD_TIMESTAMP"
echo "=========================================="
echo ""

# Step 1: Build Vue frontend
echo "[1/4] Building Vue frontend..."
cd "$WEBAPP_DIR"
npm run build
echo "Vue build complete"
echo ""

# Step 2: Prepare MANIFEST with timestamp qualifier
echo "[2/4] Preparing MANIFEST (qualifier → $BUILD_TIMESTAMP)..."
cd "$BUNDLE_DIR"
cp META-INF/MANIFEST.MF META-INF/MANIFEST.MF.bak
sed -i "s/Bundle-Version: 1.0.0.qualifier/Bundle-Version: 1.0.0.${BUILD_TIMESTAMP}/" META-INF/MANIFEST.MF

# Step 3: Build JAR
# Key: use -C web . to place static files at JAR root (not under web/)
echo "[3/4] Building OSGi JAR..."
jar cfm "$OUTPUT_JAR" META-INF/MANIFEST.MF \
    -C . WEB-INF \
    -C . plugin.xml \
    -C web .

# Restore original MANIFEST.MF (keep 'qualifier' in source)
mv META-INF/MANIFEST.MF.bak META-INF/MANIFEST.MF

echo "JAR built: $JAR_NAME"
echo "Size: $(ls -lh "$OUTPUT_JAR" | awk '{print $5}')"
echo ""

# Step 4: Deploy (optional)
if [ "$1" = "--deploy" ]; then
    # Remove old JARs from plugins (both timestamped and non-timestamped)
    rm -f "$IDEMPIERE_HOME/plugins/org.idempiere.ui.clinic_1.0.0"*.jar 2>/dev/null || true
    DEPLOY_JAR="$IDEMPIERE_HOME/plugins/$JAR_NAME"
    echo "[4/4] Deploying to $DEPLOY_JAR ..."
    cp "$OUTPUT_JAR" "$DEPLOY_JAR"
    echo "Deployed successfully."
    echo ""
    echo "To activate, restart iDempiere or use OSGi console:"
    echo "  telnet localhost 12612"
    echo "  update <bundle-id>"
else
    echo "[4/4] Skipping deploy (use --deploy flag)"
    echo ""
    echo "To deploy manually:"
    echo "  cp $OUTPUT_JAR $IDEMPIERE_HOME/plugins/"
fi

echo ""
echo "URL: https://<host>:8443/ui/#/"
echo "=========================================="
