const PAGE_CACHE_NAME = "MacauStreet_PageCache_v2.3";
// 新增 index.html 到核心缓存列表，确保页面本身能离线访问
const PAGE_CACHE_RESOURCES = [
    "/macau-photo-gallery/",
    "/macau-photo-gallery/index.html", 
    "/macau-photo-gallery/css/style.css",
    "/macau-photo-gallery/js/storage.js",
    "/macau-photo-gallery/js/main.js"
];

// 安装：缓存核心资源（含HTML）
self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(PAGE_CACHE_NAME).then(cache => {
            return cache.addAll(PAGE_CACHE_RESOURCES);
        }).then(() => self.skipWaiting())
    );
});

// 激活：清理旧缓存
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

// 拦截请求：优先缓存，离线时返回缓存内容
self.addEventListener("fetch", (e) => {
    // 1. 拦截网页核心资源（含HTML）
    const isPageResource = PAGE_CACHE_RESOURCES.includes(e.request.url) || e.request.url.endsWith("/index.html") || e.request.url === "/";
    // 2. 拦截图片请求（raw地址）
    const isImageRequest = e.request.url.includes("raw.githubusercontent.com") && /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(e.request.url);

    if (isPageResource) {
        // 网页资源：缓存优先，无缓存则网络加载（离线时返回缓存）
        e.respondWith(
            caches.match(e.request).then(cachedResponse => {
                return cachedResponse || fetch(e.request).then(networkResponse => {
                    caches.open(PAGE_CACHE_NAME).then(cache => cache.put(e.request, networkResponse.clone()));
                    return networkResponse;
                }).catch(() => {
                    // 终极离线回退：若HTML缓存也丢失，返回基础页面
                    return new Response("<h1>离线模式</h1><p>网页核心资源已缓存，图片需先在线缓存后才能离线查看</p>", {
                        headers: { "Content-Type": "text/html; charset=utf-8" }
                    });
                });
            })
        );
    } else if (isImageRequest) {
        // 图片请求：优先网络，离线时前端从IndexedDB取缓存
        e.respondWith(
            fetch(e.request).catch(() => new Response(null, { status: 503 }))
        );
    }
});