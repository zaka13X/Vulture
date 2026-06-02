importScripts('./bare.js');

const PROXY_PREFIX = "/vulture-service/";
const bareClient = new BareMux.BareClient();
let lastKnownOrigin = "";

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Context A: Core navigational routing containing the base64 chunk
    if (url.pathname.includes(PROXY_PREFIX)) {
        const parts = url.pathname.split(PROXY_PREFIX);
        const base64Part = parts[parts.length - 1]; 

        if (base64Part && base64Part !== "about:blank") {
            try {
                const targetUrl = atob(base64Part);
                const parsedTarget = new URL(targetUrl);
                lastKnownOrigin = parsedTarget.origin; // Cache root origin to repair relative sub-assets

                event.respondWith(handleTunnelRequest(event.request, targetUrl));
            } catch (err) {
                if (lastKnownOrigin) {
                    const correctedUrl = lastKnownOrigin + '/' + base64Part;
                    event.respondWith(handleTunnelRequest(event.request, correctedUrl));
                } else {
                    event.respondWith(new Response(`Path Processing Error: ${err.message}`, { status: 400 }));
                }
            }
        }
    } 
    // Context B: Intercept and patch relative website assets escaping the base64 prefix
    else if (lastKnownOrigin && !url.hostname.includes('github.io') && !url.hostname.includes('localhost')) {
        const correctedUrl = lastKnownOrigin + url.pathname + url.search;
        event.respondWith(handleTunnelRequest(event.request, correctedUrl));
    }
});

async function handleTunnelRequest(request, targetUrl) {
    try {
        const requestHeaders = {};
        for (const [key, value] of request.headers.entries()) {
            requestHeaders[key] = value;
        }

        // Execute streaming proxy fetch over the active WebAssembly link channel
        const response = await bareClient.fetch(targetUrl, {
            method: request.method,
            headers: requestHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : null,
            redirect: 'manual'
        });

        return response;
    } catch (error) {
        console.error("[Tunnel Intercept Failure]:", error);
        return new Response(`Vulture Engine Block: ${error.message}`, { 
            status: 502,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}
