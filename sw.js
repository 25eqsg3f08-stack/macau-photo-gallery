// ================= 缓存配置（无硬空间上限，动态适配）=================
const CACHE_CONFIG = {
    CORE: {
        NAME: "core-cache-v1.0.0",
        ASSETS: ["/macau-photo-gallery/", "/macau-photo-gallery/index.html", "/macau-photo-gallery/mail.html", "/macau-photo-gallery/mail.js", "/macau-photo-gallery/app.js"]
    },
    IMG: {
        NAME: "img-cache-v1.0.0",
        MAX_AGE_DAYS: 180,
        CORS: false, // 关闭强制CORS，适配HTTP跨域
        EVICT_POLICY: "LRU"
    },
    ERROR: {
        RETRY_COUNT: 5,
        FALLBACK_IMG: "https://picsum.photos/id/1005/800/500"
    },
    PERF: {
        CLEANUP_INTERVAL: 12 * 60 * 60 * 1000,
        BATCH_SIZE: 50
    },
    HTTP: {
        ALLOW_HTTP: true, // 允许HTTP协议缓存
        SKIP_HTTPS_CHECK: true // 跳过URL的HTTPS强校验
    }
};

// ================= 工具函数 =================
async function getStorageQuota() {
    if (!navigator.storage || !navigator.storage.estimate) return { usage: 0, quota: Infinity };
    const { usage, quota } = await navigator.storage.estimate();
    console.log(`[SW] 缓存配额：已用 ${(usage / 1024 / 1024 / 1024).toFixed(2)}GB / 总配额 ${(quota / 1024 / 1024 / 1024).toFixed(2)}GB`);
    return { usage, quota };
}

async function smartEvictCache() {
    const { usage, quota } = await getStorageQuota();
    const cache = await caches.open(CACHE_CONFIG.IMG.NAME);
    const keys = await cache.keys();
    if (keys.length === 0) return;

    const now = Date.now();
    const maxAgeMs = CACHE_CONFIG.IMG.MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const expiredKeys = (await Promise.all(
        keys.map(async key => ({
            key,
            timestamp: key.metadata?.timestamp || Date.now() - maxAgeMs - 1
        }))
    )).filter(item => now - item.timestamp > maxAgeMs).slice(0, CACHE_CONFIG.PERF.BATCH_SIZE);

    for (const { key } of expiredKeys) {
        await cache.delete(key);
        console.log(`[SW] 清理过期缓存：${key.url}`);
    }

    if (usage / quota < 0.8) return;
    const sortedKeys = (await Promise.all(
        keys.map(async key => ({
            key,
            timestamp: key.metadata?.timestamp || Date.now()
        }))
    )).sort((a, b) => a.timestamp - b.timestamp).slice(0, CACHE_CONFIG.PERF.BATCH_SIZE);

    for (const { key } of sortedKeys) {
        await cache.delete(key);
        console.log(`[SW] LRU淘汰缓存（配额不足）：${key.url}`);
        const newUsage = (await navigator.storage.estimate()).usage;
        if (newUsage / quota < 0.7) break;
    }
}

async function safeCacheLargeFile(cacheName, request, response) {
    let retryCount = 0;
    while (retryCount < CACHE_CONFIG.ERROR.RETRY_COUNT) {
        try {
            const cache = await caches.open(cacheName);
            if (request.destination === "image") {
                request.metadata = { timestamp: Date.now() };
            }
            await cache.put(request, response.clone());
            return true;
        } catch (err) {
            retryCount++;
            console.error(`[SW] 大文件缓存重试 ${retryCount}/${CACHE_CONFIG.ERROR.RETRY_COUNT}：`, err);
            if (retryCount === 3) await smartEvictCache();
            await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
        }
    }
    return false;
}

// 校验URL合法性（支持HTTP）
function isValidUrl(url) {
    if (!url) return false;
    // 允许HTTP/HTTPS协议
    return url.startsWith("http://") || url.startsWith("https://");
}

// ================= 核心生命周期事件 =================
self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_CONFIG.CORE.NAME)
            .then(cache => cache.addAll(CACHE_CONFIG.CORE.ASSETS))
            .then(() => console.log(`[SW] 核心文件缓存完成：${CACHE_CONFIG.CORE.ASSETS.join(", ")}`))
            .catch(err => console.error("[SW] 核心文件缓存失败：", err))
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.filter(name => 
                        name !== CACHE_CONFIG.CORE.NAME && name !== CACHE_CONFIG.IMG.NAME
                    ).map(name => caches.delete(name))
                );
            }),
            smartEvictCache(),
            self.clients.claim()
        ])
    );
});

// 监听图片缓存请求（支持HTTP，新增URL校验逻辑）
self.addEventListener("message", (event) => {
    // 校验消息参数（支持HTTP URL）
    if (!event.data || event.data.type !== "CACHE_IMG" || !isValidUrl(event.data.url)) {
        console.error("[SW] 缓存请求参数异常：", event.data);
        return;
    }

    const imgUrl = event.data.url;
    // 适配HTTP的请求模式：HTTP下用no-cors，HTTPS下用cors
    const requestMode = imgUrl.startsWith("http://") ? "no-cors" : (CACHE_CONFIG.IMG.CORS ? "cors" : "no-cors");
    const request = new Request(imgUrl, {
        mode: requestMode,
        cache: "no-store"
    });

    fetch(request)
        .then(res => {
            // HTTP的no-cors请求下，res.ok始终为true，需额外判断
            if (requestMode === "no-cors" || res.ok) return res;
            return fetch(CACHE_CONFIG.ERROR.FALLBACK_IMG);
        })
        .then(res => safeCacheLargeFile(CACHE_CONFIG.IMG.NAME, request, res))
        .then(success => console.log(`[SW] 图片缓存结果（${imgUrl}）：${success ? "成功" : "失败"}`))
        .catch(err => console.error("[SW] 缓存失败：", err));
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const requestUrl = new URL(request.url);

    // 1. 核心文件缓存（支持HTTP/HTTPS）
    if (request.method === "GET") {
        const isCoreAsset = CACHE_CONFIG.CORE.ASSETS.some(asset => {
            return requestUrl.pathname === asset || (asset === "/" && requestUrl.pathname === "/");
        });
        if (isCoreAsset) {
            event.respondWith(
                caches.match(request)
                    .then(cachedRes => {
                        const updatePromise = fetch(request).then(networkRes => {
                            safeCacheLargeFile(CACHE_CONFIG.CORE.NAME, request, networkRes);
                        }).catch(() => {});
                        return cachedRes || fetch(request);
                    })
            );
            return;
        }
    }

    // 2. 图片请求缓存（支持HTTP/HTTPS）
    if (request.destination === "image") {
        // 适配HTTP的请求模式
        const fetchMode = request.url.startsWith("http://") ? "no-cors" : (CACHE_CONFIG.IMG.CORS ? "cors" : "no-cors");
        event.respondWith(
            caches.open(CACHE_CONFIG.IMG.NAME)
                .then(cache => cache.match(request)
                    .then(cachedImg => {
                        if (cachedImg) {
                            request.metadata = { timestamp: Date.now() };
                            cache.put(request, cachedImg.clone()).catch(() => {});
                            return cachedImg;
                        }
                        return fetch(request, { mode: fetchMode })
                            .then(networkRes => {
                                if (fetchMode === "no-cors" || networkRes.ok) {
                                    smartEvictCache().catch(() => {});
                                    safeCacheLargeFile(CACHE_CONFIG.IMG.NAME, request, networkRes).catch(() => {});
                                }
                                return (fetchMode === "no-cors" || networkRes.ok) ? networkRes : fetch(CACHE_CONFIG.ERROR.FALLBACK_IMG);
                            })
                            .catch(() => fetch(CACHE_CONFIG.ERROR.FALLBACK_IMG));
                    })
                )
        );
        return;
    }

    // 3. 其他请求（离线提示）
    event.respondWith(fetch(request).catch(() => {
        return new Response("<h1>离线状态，仅支持已缓存的图片和页面</h1>", {
            headers: { "Content-Type": "text/html" }
        });
    }));
});

// ================= 定时任务 =================
setInterval(() => {
    console.log("[SW] 执行定期缓存清理");
    smartEvictCache().catch(err => console.error("[SW] 定期清理失败：", err));
}, CACHE_CONFIG.PERF.CLEANUP_INTERVAL);

self.addEventListener("error", (err) => {
    console.error("[SW] 全局错误（自动恢复）：", err);
    self.clients.claim().catch(() => {});
});
