const prerender = require('prerender');
const cache = require('memory-cache');

const server = prerender({
    port: process.env.PORT || 3000,
    chromeFlags: [
        '--no-sandbox',
        '--headless',
        '--disable-gpu',
        '--remote-debugging-port=9222',
        '--hide-scrollbars',
        '--disable-dev-shm-usage'
    ],
    // Log requests for debugging
    logRequests: true
});

// Configure caching plugin
const inMemoryCache = {
    init: function() {
        this.cache = cache;
    },
    
    requestReceived: function(req, res, next) {
        // We only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }
        
        const cached = this.cache.get(req.prerender.url);
        if (cached) {
            req.prerender.cacheHit = true;
            res.setHeader('X-Prerender-Cache', 'HIT');
            return res.send(200, cached);
        }
        
        res.setHeader('X-Prerender-Cache', 'MISS');
        next();
    },
    
    beforeSend: function(req, res, next) {
        if (!req.prerender.cacheHit && req.prerender.statusCode == 200) {
            const url = req.prerender.url;
            // TTLs in milliseconds
            let ttl = 7 * 24 * 60 * 60 * 1000; // 1 week default (static pages)
            
            // Short TTL (15 min) for dynamic coverage pages
            if (url.includes('/story/') || url.includes('/daily-briefing/')) {
                ttl = 15 * 60 * 1000;
            }
            
            this.cache.put(url, req.prerender.content, ttl);
        }
        next();
    }
};

server.use(prerender.sendPrerenderHeader());
server.use(prerender.browserForceRestart());
server.use(prerender.httpHeaders());
server.use(prerender.removeScriptTags());
server.use(inMemoryCache);

server.start();
