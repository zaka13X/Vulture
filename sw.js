importScripts('./baremux.js'); // Handles request framing
importScripts('./epoxy.js');   // Handles the WISP protocol connection

const WISP_SERVER = "wss://://your-wisp-server.com"; // Replace with your WISP endpoint

self.bareClient = new BareMux.BareClient();
self.wispConnection = new Epoxy.WispConnection(WISP_SERVER);

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Intercept requests and route them through the WebSocket server
    const url = new URL(event.request.url);

    // Only proxy specific proxied paths, otherwise serve local files
    if (url.pathname.startsWith('/')) {
        event.respondWith(handleProxy(event.request));
    }
});

async function handleProxy(request) {
    // Rewrite the request and tunnel it via the WISP server
    try {
        const response = await self.bareClient.fetch(request, {
            wisp: self.wispConnection
        });
        return response;
    } catch (err) {
        console.error("Proxy Tunnel Error:", err);
        return new Response("Tunnel Error", { status: 502 });
    }
}
