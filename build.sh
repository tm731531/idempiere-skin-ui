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
OUTPUT_JAR="$SCRIPT_DIR/org.idempiere.ui.clinic_1.0.0.jar"
IDEMPIERE_HOME="${IDEMPIERE_HOME:-/opt/idempiere-server/x86_64}"

echo "=========================================="
echo "  iDempiere Clinic UI - Build Script"
echo "=========================================="
echo ""

# Step 1: Build Vue frontend
echo "[1/3] Building Vue frontend..."
cd "$WEBAPP_DIR"
npm run build
echo "Vue build complete"
echo ""

# Step 2: Build JAR
# Key: use -C web . to place static files at JAR root (not under web/)
echo "[2/3] Building OSGi JAR..."
cd "$BUNDLE_DIR"
jar cfm "$OUTPUT_JAR" META-INF/MANIFEST.MF \
    -C . WEB-INF \
    -C . plugin.xml \
    -C web .
echo "JAR built: $OUTPUT_JAR"
echo "Size: $(ls -lh "$OUTPUT_JAR" | awk '{print $5}')"
echo ""

# Step 3: Deploy (optional)
if [ "$1" = "--deploy" ]; then
    DEPLOY_JAR="$IDEMPIERE_HOME/plugins/$(basename "$OUTPUT_JAR")"
    echo "[3/3] Deploying to $DEPLOY_JAR ..."
    cp "$OUTPUT_JAR" "$DEPLOY_JAR"
    echo "Deployed successfully."
    echo ""
    echo "To activate, restart iDempiere or use OSGi console:"
    echo "  telnet localhost 12612"
    echo "  update <bundle-id>"
else
    echo "[3/3] Skipping deploy (use --deploy flag)"
    echo ""
    echo "To deploy manually:"
    echo "  cp $OUTPUT_JAR $IDEMPIERE_HOME/plugins/"
fi

echo ""
echo "URL: https://<host>:8443/ui/#/"
echo "=========================================="
