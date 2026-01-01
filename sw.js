// 配置：网页核心资源缓存（与图片缓存完全分开）
const PAGE_CACHE_NAME = "MacauStreet_PageCache";
const PAGE_CACHE_RESOURCES = [
    "/macau-photo-gallery/",
    "/macau-photo-gallery/css/style.css",
    "/macau-photo-gallery/js/storage.js",
    "/macau-photo-gallery/js/main.js"
];

// 安装：仅缓存网页核心资源，不缓存图片
self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(PAGE_CACHE_NAME).then(cache => {
            return cache.addAll(PAGE_CACHE_RESOURCES);
        }).then(() => self.skipWaiting())
    );
});

// 激活：清理旧网页缓存，不碰图片缓存
self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(name => {
                    if (name !== PAGE_CACHE_NAME) return caches.delete(name);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 拦截请求：图片优先走 IndexedDB 缓存，网页优先走 Service Worker 缓存
self.addEventListener("fetch", (e) => {
    // 1. 拦截图片请求（raw地址 + 图片格式）
    const isImageRequest = e.request.url.includes("raw.githubusercontent.com") && /\.(jpg|jpeg|png|webp)$/i.test(e.request.url);
    // 2. 拦截网页核心资源
    const isPageResource = PAGE_CACHE_RESOURCES.includes(e.request.url) || e.request.url === "/";

    if (isImageRequest) {
        // 图片请求：优先从网络加载（前端会主动缓存到 IndexedDB）
        e.respondWith(
            fetch(e.request).catch(() => {
                // 离线时返回空，前端会从 IndexedDB 取缓存
                return new Response(null, { status: 503 });
            })
        );
    } else if (isPageResource) {
        // 网页资源：优先从 Service Worker 缓存读取
        e.respondWith(
            caches.match(e.request).then(cachedResponse => {
                return cachedResponse || fetch(e.request).then(networkResponse => {
                    caches.open(PAGE_CACHE_NAME).then(cache => cache.put(e.request, networkResponse.clone()));
                    return networkResponse;
                });
            })
        );
    }
});