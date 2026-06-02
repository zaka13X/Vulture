            importScripts('./bare.js');
importScripts('./epoxy.min.js');

// FIXED: Default wisp target set directly to Mercury Workshop's server instance
let wispUrl = "wss://wisp.mercurywork.shop"; 
const PROXY_PREFIX = "/vulture-service/";
let bareClient = null;

// Track the last successfully decoded origin to resolve broken relative paths
let lastKnownOrigin = "";

// Keep communication lines open with your HTML frontend dashboard
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SET_WISP_SERVER') {
        if (event.data.url && !event.data.url.includes('example.com')) {
            wispUrl = event.data.url;
            // Reset client to force a fresh WebSocket handshake with the new URL
            bareClient = null; 
            console.log('[Vulture Engine] WISP Node Synchronized:', wispUrl);
        }
    }
});

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Scenario A: Main navigation route containing the base64 prefix
    if (url.pathname.includes(PROXY_PREFIX)) {
        const parts = url.pathname.split(PROXY_PREFIX);
        const base64Part = parts[parts.length - 1]; 

        if (base64Part && base64Part !== "about:blank") {
            try {
                const targetUrl = atob(base64Part);
                
                // Save the current website's root domain to fix loose assets later
                const parsedTarget = new URL(targetUrl);
                lastKnownOrigin = parsedTarget.origin;

                event.respondWith(handleTunnelRequest(event.request, targetUrl));
            } catch (err) {
                // If it's a relative path trailing the base64 segment, fix it here
                if (lastKnownOrigin) {
                    const correctedUrl = lastKnownOrigin + '/' + base64Part;
                    event.respondWith(handleTunnelRequest(event.request, correctedUrl));
                } else {
                    event.respondWith(new Response(`Routing Parse Error: ${err.message}`, { status: 400 }));
                }
            }
        }
    } 
    // Scenario B: Handle loose relative website assets that escape the prefix
    else if (lastKnownOrigin && !url.hostname.includes('github.io') && !url.hostname.includes('localhost')) {
        // Intercept requests trying to load directly relative to your app root
        const correctedUrl = lastKnownOrigin + url.pathname + url.search;
        event.respondWith(handleTunnelRequest(event.request, correctedUrl));
    }
});

async function handleTunnelRequest(request, targetUrl) {
    try {
        // Initialize BareMux and link the Epoxy client architecture dynamically
        if (!bareClient) {
            bareClient = new BareMux.BareClient();
            await bareClient.SetTransport('/epoxy.min.js', { wispUrl: wispUrl });
        }

        // Clone and map request headers cleanly into a flat object structure
        const requestHeaders = {};
        for (const [key, value] of request.headers.entries()) {
            requestHeaders[key] = value;
        }

        // Forward payload traffic directly over the WebAssembly TCP WebSocket link
        const response = await bareClient.fetch(targetUrl, {
            method: request.method,
            headers: requestHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : null,
            redirect: 'manual' // Instructs the iframe itself to native-process redirections
        });

        return response;
    } catch (error) {
        console.error("[Tunnel Core Exception]:", error);
        return new Response(`Tunnel Offline: ${error.message}`, { 
            status: 502,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}
