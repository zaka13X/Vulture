importScripts('./bare.js');

const PROXY_PREFIX = "/vulture-service/";
const bareClient = new BareMux.BareClient();
let lastKnownOrigin = "";

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname.includes(PROXY_PREFIX)) {
        const parts = url.pathname.split(PROXY_PREFIX);
        const base64Part = parts[parts.length - 1]; 

        if (base64Part && base64Part !== "about:blank") {
            try {
                const targetUrl = atob(base64Part);
                const parsedTarget = new URL(targetUrl);
                lastKnownOrigin = parsedTarget.origin;

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

        const response = await bareClient.fetch(targetUrl, {
            method: request.method,
            headers: requestHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : null,
            redirect: 'manual'
        });

        // Extract binary response array buffers cleanly
        const rawBody = await response.arrayBuffer();
        const responseHeaders = new Headers();
        
        for (const [key, value] of response.headers.entries()) {
            responseHeaders.set(key, value);
        }

        // Core Fix: Force Content-Type to text/html to unlock the iframe renderer layout pipeline
        if (targetUrl.endsWith('.html') || !targetUrl.includes('.')) {
            responseHeaders.set('Content-Type', 'text/html; charset=UTF-8');
        }

        return new Response(rawBody, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
        });

    } catch (error) {
        console.error("[Tunnel Intercept Failure]:", error);
        return new Response(`Vulture Engine Block: ${error.message}`, { 
            status: 502,
            headers: { 'Content-Type': 'text/html' }
        });
    }
}
