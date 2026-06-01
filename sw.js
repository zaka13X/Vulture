// 1. Load the local all-in-one bundled files
importScripts('./bare.js');
importScripts('./epoxy.min.js'); // Contains the embedded WebAssembly engine

// 2. Configuration Settings
const WISP_URL = "wss://wisp.mercurywork.shop"; // Replace with your wss:// endpoint
const PROXY_PREFIX = "/service/"; // The prefix path that triggers the proxy tunnel

// 3. Initialize the BareMux client router
const bareClient = new BareMux.BareClient();

// Track the persistent WISP connection state
let wispConnection = null;

// Force the service worker to take control immediately upon installation
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// 4. Intercept network fetch payloads
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only intercept and tunnel requests that match the proxy prefix path
    if (url.pathname.startsWith(PROXY_PREFIX)) {
        event.respondWith(handleTunnelRequest(event.request));
    }
});

/**
 * Validates the WebAssembly WISP transport tunnel connection and forwards data streams.
 */
async function handleTunnelRequest(request) {
    try {
        // Initialize or restore the embedded WebAssembly transport connection
        if (!wispConnection) {
            // epoxy.min.js exposes the global Epoxy namespace
            wispConnection = await Epoxy.connect(WISP_URL);
        }

        // Send the HTTP request over the active WISP WebSocket channel
        const response = await bareClient.fetch(request, {
            transport: wispConnection
        });

        return response;
    } catch (error) {
        console.error("[Proxy Tunnel Failure]:", error);
        
        // Return a clean server error payload to the client interface
        return new Response(`Error: ${error.message}`, {
            status: 502,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}
