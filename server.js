const prerender = require('prerender');
const cache = require('memory-cache');

const server = prerender({
    port: process.env.PORT || 3000,
    pageLoadTimeout: 20000,
    waitAfterLastRequest: 500,
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

// Custom plugin to remove scripts but KEEP JSON-LD schema
const preserveJsonLd = {
    beforeSend: (req, res, next) => {
        if (!req.prerender.content || req.prerender.renderType !== 'html') {
            return next();
        }
        
        const matches = req.prerender.content.toString().match(/<script(?:.*?)>(?:[\s\S]*?)<\/script>/gi);
        let content = req.prerender.content.toString();
        
        if (matches) {
            matches.forEach((script) => {
                if (!script.includes('application/ld+json')) {
                    content = content.replace(script, '');
                }
            });
        }
        
        req.prerender.content = content;
        next();
    }
};

// server.use(prerender.sendPrerenderHeader()); // REMOVED: causes CORS failure on fonts and API
server.use(prerender.browserForceRestart());
server.use(prerender.httpHeaders());
server.use(preserveJsonLd);
server.use(inMemoryCache);

server.start();
