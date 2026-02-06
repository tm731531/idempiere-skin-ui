package org.idempiere.ui.clinic;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;

import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

/**
 * SPA Servlet - serves static files and handles SPA routing
 */
public class SPAServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws ServletException, IOException {

        String path = req.getPathInfo();
        if (path == null || path.equals("/")) {
            path = "/index.html";
        }

        // Try to find the resource
        String resourcePath = "/web" + path;
        URL resourceUrl = getClass().getResource(resourcePath);

        // If not found and not a file extension, serve index.html (SPA routing)
        if (resourceUrl == null && !hasFileExtension(path)) {
            resourcePath = "/web/index.html";
            resourceUrl = getClass().getResource(resourcePath);
        }

        if (resourceUrl == null) {
            resp.sendError(HttpServletResponse.SC_NOT_FOUND);
            return;
        }

        // Set content type
        String contentType = getContentType(path);
        resp.setContentType(contentType);

        // Stream the file
        try (InputStream in = resourceUrl.openStream();
             OutputStream out = resp.getOutputStream()) {
            byte[] buffer = new byte[4096];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                out.write(buffer, 0, bytesRead);
            }
        }
    }

    private boolean hasFileExtension(String path) {
        int lastSlash = path.lastIndexOf('/');
        int lastDot = path.lastIndexOf('.');
        return lastDot > lastSlash;
    }

    private String getContentType(String path) {
        if (path.endsWith(".html")) return "text/html;charset=UTF-8";
        if (path.endsWith(".js")) return "application/javascript;charset=UTF-8";
        if (path.endsWith(".css")) return "text/css;charset=UTF-8";
        if (path.endsWith(".json")) return "application/json;charset=UTF-8";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".gif")) return "image/gif";
        if (path.endsWith(".ico")) return "image/x-icon";
        if (path.endsWith(".woff")) return "font/woff";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".ttf")) return "font/ttf";
        return "application/octet-stream";
    }
}
