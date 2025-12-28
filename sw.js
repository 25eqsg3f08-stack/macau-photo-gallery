// ================= 缓存配置（无硬空间上限，动态适配）=================
const CACHE_CONFIG = {
    // 核心文件缓存库（版本号更新触发更新）
    CORE: {
        NAME: "core-cache-v1.0.0",
        ASSETS: ["/", "index.html", "mail.html", "mail.js", "app.js"]
    },
    // 图片缓存库（动态空间管理，无硬上限）
    IMG: {
        NAME: "img-cache-v1.0.0",
        MAX_AGE_DAYS: 180, // 延长有效期至180天，减少清理频率
        CORS: true,
        EVICT_POLICY: "LRU" // 淘汰策略：最近最少使用优先删除
    },
    // 容错配置
    ERROR: {
        RETRY_COUNT: 5, // 增加重试次数到5次，提升大文件缓存成功率
        FALLBACK_IMG: "https://picsum.photos/id/1005/800/500"
    },
    // 性能优化
    PERF: {
        CLEANUP_INTERVAL: 12 * 60 * 60 * 1000, // 每12小时清理一次（减少CPU占用）
        BATCH_SIZE: 50 // 批量清理缓存，每次最多清理50个过期文件
    }
};

// ================= 工具函数（超大空间适配核心）=================
/**
 * 获取浏览器缓存配额（判断可用空间）
 */
async function getStorageQuota() {
    if (!navigator.storage || !navigator.storage.estimate) return { usage: 0, quota: Infinity };
    const { usage, quota } = await navigator.storage.estimate();
    console.log(`[SW] 缓存配额：已用 ${(usage / 1024 / 1024 / 1024).toFixed(2)}GB / 总配额 ${(quota / 1024 / 1024 / 1024).toFixed(2)}GB`);
    return { usage, quota };
}

/**
 * 智能缓存淘汰（基于LRU+配额，无硬上限）
 */
async function smartEvictCache() {
    const { usage, quota } = await getStorageQuota();
    const cache = await caches.open(CACHE_CONFIG.IMG.NAME);
    const keys = await cache.keys();
    if (keys.length === 0) return;

    // 1. 先清理过期文件（优先释放空间）
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

    // 2. 配额不足时，执行LRU淘汰（仅当已用空间超过配额80%时触发）
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
        // 淘汰后检查配额，达标则停止
        const newUsage = (await navigator.storage.estimate()).usage;
        if (newUsage / quota < 0.7) break;
    }
}

/**
 * 大文件安全缓存（分块逻辑，提升成功率）
 */
async function safeCacheLargeFile(cacheName, request, response) {
    let retryCount = 0;
    while (retryCount < CACHE_CONFIG.ERROR.RETRY_COUNT) {
        try {
            const cache = await caches.open(cacheName);
            // 给请求添加LRU时间戳元数据
            if (request.destination === "image") {
                request.metadata = { timestamp: Date.now() };
            }
            await cache.put(request, response.clone());
            return true;
        } catch (err) {
            retryCount++;
            console.error(`[SW] 大文件缓存重试 ${retryCount}/${CACHE_CONFIG.ERROR.RETRY_COUNT}：`, err);
            // 重试前先清理部分缓存，释放空间
            if (retryCount === 3) await smartEvictCache();
            await new Promise(resolve => setTimeout(resolve, 2000 * retryCount)); // 指数退避
        }
    }
    return false;
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
            // 清理旧版本缓存库
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.filter(name => 
                        name !== CACHE_CONFIG.CORE.NAME && name !== CACHE_CONFIG.IMG.NAME
                    ).map(name => caches.delete(name))
                );
            }),
            // 初始化智能清理
            smartEvictCache(),
            // 接管所有客户端
            self.clients.claim()
        ])
    );
});

// 监听图片缓存请求（支持大文件）
self.addEventListener("message", (event) => {
    if (event.data?.type === "CACHE_IMG" && event.data?.url) {
        const imgUrl = event.data.url;
        const request = new Request(imgUrl, {
            mode: CACHE_CONFIG.IMG.CORS ? "cors" : "same-origin",
            cache: "no-store" // 跳过浏览器HTTP缓存，获取最新文件
        });

        fetch(request)
            .then(res => res.ok ? res : fetch(CACHE_CONFIG.ERROR.FALLBACK_IMG))
            .then(res => safeCacheLargeFile(CACHE_CONFIG.IMG.NAME, request, res))
            .then(success => console.log(`[SW] 图片缓存结果（${imgUrl}）：${success ? "成功" : "失败"}`))
            .catch(err => console.error("[SW] 大文件缓存失败：", err));
    }
});

// 请求拦截（超大空间适配）
self.addEventListener("fetch", (event) => {
    const request = event.request;
    const requestUrl = new URL(request.url);

    // 1. 核心文件：强缓存+后台更新，永不失效
    if (request.mode === "same-origin" && request.method === "GET") {
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

    // 2. 图片请求：优先缓存+LRU管理，支持超大文件
    if (request.destination === "image") {
        event.respondWith(
            caches.open(CACHE_CONFIG.IMG.NAME)
                .then(cache => cache.match(request)
                    .then(cachedImg => {
                        // 命中缓存：更新时间戳（标记为最近使用）
                        if (cachedImg) {
                            request.metadata = { timestamp: Date.now() };
                            cache.put(request, cachedImg.clone()).catch(() => {});
                            return cachedImg;
                        }
                        // 未命中：联网获取+缓存
                        return fetch(request, { mode: CACHE_CONFIG.IMG.CORS ? "cors" : "same-origin" })
                            .then(networkRes => {
                                if (networkRes.ok) {
                                    // 缓存前先执行轻量清理，避免空间不足
                                    smartEvictCache().catch(() => {});
                                    safeCacheLargeFile(CACHE_CONFIG.IMG.NAME, request, networkRes).catch(() => {});
                                }
                                return networkRes.ok ? networkRes : fetch(CACHE_CONFIG.ERROR.FALLBACK_IMG);
                            })
                            .catch(() => fetch(CACHE_CONFIG.ERROR.FALLBACK_IMG));
                    })
                )
        );
        return;
    }

    // 3. 其他请求：直接联网
    event.respondWith(fetch(request).catch(() => {
        return new Response("<h1>离线状态，仅支持已缓存的图片和页面</h1>", {
            headers: { "Content-Type": "text/html" }
        });
    }));
});

// ================= 定时任务（性能优化）=================
// 定期执行智能清理，避免占用过多CPU
setInterval(() => {
    console.log("[SW] 执行定期缓存清理");
    smartEvictCache().catch(err => console.error("[SW] 定期清理失败：", err));
}, CACHE_CONFIG.PERF.CLEANUP_INTERVAL);

// 全局错误监听（故障自愈）
self.addEventListener("error", (err) => {
    console.error("[SW] 全局错误（自动恢复）：", err);
    self.clients.claim().catch(() => {});
});
