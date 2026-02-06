package org.idempiere.ui.clinic;

import org.osgi.framework.BundleActivator;
import org.osgi.framework.BundleContext;
import org.osgi.framework.ServiceReference;
import org.osgi.service.http.HttpService;
import org.osgi.util.tracker.ServiceTracker;

/**
 * OSGi Bundle Activator for Clinic UI
 * Register SPAServlet to /ui path
 */
public class Activator implements BundleActivator {

    private ServiceTracker<HttpService, HttpService> httpServiceTracker;
    private SPAServlet servlet;

    @Override
    public void start(BundleContext context) throws Exception {
        System.out.println("[ClinicUI] Starting bundle...");

        servlet = new SPAServlet();

        httpServiceTracker = new ServiceTracker<HttpService, HttpService>(context, HttpService.class, null) {
            @Override
            public HttpService addingService(ServiceReference<HttpService> reference) {
                HttpService httpService = super.addingService(reference);
                if (httpService != null) {
                    try {
                        // Register servlet at /ui/*
                        httpService.registerServlet("/ui", servlet, null, null);
                        System.out.println("[ClinicUI] Registered servlet at /ui");
                    } catch (Exception e) {
                        System.err.println("[ClinicUI] Failed to register servlet: " + e.getMessage());
                        e.printStackTrace();
                    }
                }
                return httpService;
            }

            @Override
            public void removedService(ServiceReference<HttpService> reference, HttpService service) {
                try {
                    service.unregister("/ui");
                    System.out.println("[ClinicUI] Unregistered /ui");
                } catch (Exception e) {
                    // ignore
                }
                super.removedService(reference, service);
            }
        };

        httpServiceTracker.open();
        System.out.println("[ClinicUI] Bundle started successfully");
    }

    @Override
    public void stop(BundleContext context) throws Exception {
        System.out.println("[ClinicUI] Stopping bundle...");
        if (httpServiceTracker != null) {
            httpServiceTracker.close();
            httpServiceTracker = null;
        }
        servlet = null;
        System.out.println("[ClinicUI] Bundle stopped");
    }
}
