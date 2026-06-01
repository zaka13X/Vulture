importScripts('./bare.js');
importScripts('./epoxy.min.js');

let wispUrl = "wss://://example.com"; // Fallback URL
const PROXY_PREFIX = "/vulture-service/";
const bareClient = new BareMux.BareClient();
let wispConnection = null;

// Listen for messages from your HTML interface
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SET_WISP_SERVER') {
        wispUrl = event.data.url;
        wispConnection = null; // Clear connection state to force re-handshake
        console.log('[Worker] WISP Tunnel set to:', wispUrl);
    }
});

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname.includes(PROXY_PREFIX)) {
        // Extract and decode the destination website from our Base64 string format
        const base64Part = url.pathname.split(PROXY_PREFIX)[1];
        try {
            const targetUrl = atob(base64Part);
            event.respondWith(handleTunnelRequest(event.request, targetUrl));
        } catch (err) {
            event.respondWith(new Response(`Base64 Decode Error: ${err.message}`, { status: 400 }));
        }
    }
});

async function handleTunnelRequest(request, targetUrl) {
    try {
        if (!wispConnection) {
            wispConnection = await Epoxy.connect(wispUrl);
        }

        // Clone the input request parameters pointing to the decrypted target destination
        const modifiedRequest = new Request(targetUrl, {
            method: request.method,
            headers: request.headers,
            body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : null,
            redirect: 'manual'
        });

        return await bareClient.fetch(modifiedRequest, { transport: wispConnection });
    } catch (error) {
        return new Response(`Vulture Proxy Offline: ${error.message}`, { status: 502 });
    }
}
