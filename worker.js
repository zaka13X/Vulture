importScripts('./bare.js');
importScripts('./epoxy.min.js');

// Default fallback server in case the initial message drop occurs
let wispUrl = "wss://wisp.mercurywork.shop/wisp/"; 
const PROXY_PREFIX = "/vulture-service/";

let bareClient = null;

// Listen for updates sent from your HTML settings panel
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SET_WISP_SERVER') {
        // Only update if a valid payload string was provided
        if (event.data.url && event.data.url !== "wss://://example.com") {
            wispUrl = event.data.url;
            console.log('[Vulture Worker] WISP Target Synced:', wispUrl);
        }
    }
});

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Trap requests passing through your designated routing prefix
    if (url.pathname.includes(PROXY_PREFIX)) {
        const parts = url.pathname.split(PROXY_PREFIX);
        const base64Part = parts[parts.length - 1]; 

        if (base64Part && base64Part !== "about:blank") {
            try {
                // Decode the target site string safely
                const targetUrl = atob(base64Part);
                event.respondWith(handleTunnelRequest(event.request, targetUrl));
            } catch (err) {
                event.respondWith(new Response(`Path Processing Error: ${err.message}`, { status: 400 }));
            }
        }
    }
});

async function handleTunnelRequest(request, targetUrl) {
    try {
        // Initialize BareMux and link the Epoxy client structure
        if (!bareClient) {
            bareClient = new BareMux.BareClient();
            
            // Set the WISP transport engine using the active configuration 
            await bareClient.SetTransport('/epoxy.min.js', { wispUrl: wispUrl });
        }

        // Clone parameters over into standard format
        const requestHeaders = {};
        for (const [key, value] of request.headers.entries()) {
            requestHeaders[key] = value;
        }

        // FIXED: Call BareMux with the destination URL string directly
        const response = await bareClient.fetch(targetUrl, {
            method: request.method,
            headers: requestHeaders,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : null,
            redirect: 'manual'
        });

        return response;
    } catch (error) {
        console.error("[Tunnel Transport Exception]:", error);
        return new Response(`Vulture Proxy Engine Offline: ${error.message}`, { 
            status: 502,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}
