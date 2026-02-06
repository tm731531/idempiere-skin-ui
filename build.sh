#!/bin/bash
#
# iDempiere Clinic UI - Build & Deploy script
# Produces a WAB (Web Application Bundle) directory for iDempiere OSGi/Jetty
#
# Usage:
#   ./build.sh           # Build only
#   ./build.sh --deploy  # Build + deploy to iDempiere plugins dir
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBAPP_DIR="$SCRIPT_DIR/webapp"
BUNDLE_DIR="$SCRIPT_DIR/osgi-bundle"
BUNDLE_NAME="org.idempiere.ui.clinic_1.0.0.qualifier"
IDEMPIERE_HOME="${IDEMPIERE_HOME:-/opt/idempiere-server/x86_64}"
OUTPUT_DIR="$SCRIPT_DIR/target/$BUNDLE_NAME"

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

# Step 2: Assemble WAB directory
echo "[2/3] Assembling WAB directory..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/META-INF"
mkdir -p "$OUTPUT_DIR/WEB-INF"

# Copy MANIFEST.MF
cp "$BUNDLE_DIR/META-INF/MANIFEST.MF" "$OUTPUT_DIR/META-INF/"

# Copy WEB-INF/web.xml
cp "$BUNDLE_DIR/WEB-INF/web.xml" "$OUTPUT_DIR/WEB-INF/"

# Copy frontend build output as static files (at WAB root)
cp -r "$BUNDLE_DIR/web/"* "$OUTPUT_DIR/"

echo "WAB directory assembled: $OUTPUT_DIR"
echo ""

# Step 3: Deploy (optional)
if [ "$1" = "--deploy" ]; then
    DEPLOY_DIR="$IDEMPIERE_HOME/plugins/$BUNDLE_NAME"
    echo "[3/3] Deploying to $DEPLOY_DIR ..."
    rm -rf "$DEPLOY_DIR"
    cp -r "$OUTPUT_DIR" "$DEPLOY_DIR"
    echo "Deployed successfully."
    echo ""
    echo "To activate, use OSGi console:"
    echo "  telnet localhost 12612"
    echo "  install reference:file:plugins/$BUNDLE_NAME"
    echo "  start <bundle-id>"
    echo ""
    echo "Or if already installed, just: update <bundle-id>"
else
    echo "[3/3] Skipping deploy (use --deploy flag)"
    echo ""
    echo "To deploy manually:"
    echo "  cp -r $OUTPUT_DIR $IDEMPIERE_HOME/plugins/"
    echo "  # Then install/update via OSGi console"
fi

echo ""
echo "URL: https://<host>:8443/ui/"
echo "=========================================="
