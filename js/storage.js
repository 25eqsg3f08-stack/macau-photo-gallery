const IMG_CACHE_CONFIG = {
    dbName: "MacauStreet_ImageCache",
    dbVersion: 2, // 升级版本支持时效字段
    storeName: "imagesStore"
};
let imgDbInstance = null;

// 初始化图片缓存数据库（新增时效字段索引）
function initImageCacheDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IMG_CACHE_CONFIG.dbName, IMG_CACHE_CONFIG.dbVersion);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            // 创建图片存储仓库，键为图片raw地址
            if (!db.objectStoreNames.contains(IMG_CACHE_CONFIG.storeName)) {
                const store = db.createObjectStore(IMG_CACHE_CONFIG.storeName, { keyPath: "rawUrl" });
                store.createIndex("expireTimeIdx", "expireTime", { unique: false }); // 时效索引
            } else {
                // 升级现有仓库，补充时效索引（兼容旧数据）
                const store = e.target.transaction.objectStore(IMG_CACHE_CONFIG.storeName);
                if (!store.indexNames.contains("expireTimeIdx")) {
                    store.createIndex("expireTimeIdx", "expireTime", { unique: false });
                }
            }
            console.log("图片缓存 IndexedDB 初始化/升级成功");
        };

        request.onsuccess = (e) => {
            imgDbInstance = e.target.result;
            resolve(imgDbInstance);
        };

        request.onerror = (e) => {
            reject(new Error(`图片缓存DB初始化失败: ${e.target.error.message}`));
        };
    });
}

// 缓存单张图片（带时效，days=0为永久）
function cacheSingleImageWithExpire(rawUrl, blob, days = 0) {
    return new Promise(async (resolve, reject) => {
        if (!imgDbInstance) await initImageCacheDB();

        // 计算过期时间戳：0表示永久，其他为当前时间+天数毫秒数
        const expireTime = days === 0 ? 0 : Date.now() + (days * 24 * 60 * 60 * 1000);
        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readwrite");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        
        const imgData = {
            rawUrl: rawUrl,
            blob: blob,
            cacheTime: Date.now(), // 缓存时间
            expireTime: expireTime // 过期时间
        };

        const request = store.put(imgData);
        request.onsuccess = () => resolve({ status: "success", size: blob.size });
        request.onerror = (e) => reject(new Error(`缓存失败: ${e.target.error.message}`));
    });
}

// 兼容旧的缓存方法（默认永久）
function cacheSingleImage(rawUrl, blob) {
    return cacheSingleImageWithExpire(rawUrl, blob, 0);
}

// 从缓存获取图片（自动校验时效，过期则删除）
function getCachedImage(rawUrl) {
    return new Promise(async (resolve, reject) => {
        if (!imgDbInstance) await initImageCacheDB();

        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readonly");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        const request = store.get(rawUrl);

        request.onsuccess = (e) => {
            const data = e.target.result;
            if (!data) {
                resolve(null);
                return;
            }

            // 校验时效：非永久且已过期，删除缓存并返回null
            if (data.expireTime !== 0 && Date.now() > data.expireTime) {
                deleteCachedImage(rawUrl);
                resolve(null);
                return;
            }

            // 有效缓存，返回Blob URL
            resolve(URL.createObjectURL(data.blob));
        };
        request.onerror = (e) => reject(new Error(`获取缓存失败: ${e.target.error.message}`));
    });
}

// 删除单张缓存图片
function deleteCachedImage(rawUrl) {
    return new Promise(async (resolve, reject) => {
        if (!imgDbInstance) await initImageCacheDB();

        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readwrite");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        const request = store.delete(rawUrl);

        request.onsuccess = () => resolve("图片缓存已删除");
        request.onerror = (e) => reject(new Error(`删除失败: ${e.target.error.message}`));
    });
}

// 仅清除所有图片缓存（保留网页资源）
function clearOnlyImageCache() {
    return new Promise(async (resolve, reject) => {
        if (!imgDbInstance) await initImageCacheDB();

        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readwrite");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        const request = store.clear();

        request.onsuccess = () => {
            console.log("仅图片缓存已清除，网页资源不受影响");
            resolve("图片缓存清除成功");
        };
        request.onerror = (e) => reject(new Error(`清除失败: ${e.target.error.message}`));
    });
}

// 计算当前图片缓存总大小（MB/GB）
function calculateImageCacheSize() {
    return new Promise(async (resolve, reject) => {
        if (!imgDbInstance) await initImageCacheDB();

        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readonly");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        const request = store.getAll();

        request.onsuccess = (e) => {
            const allImages = e.target.result;
            let totalBytes = 0;
            allImages.forEach(img => totalBytes += img.blob.size);

            const sizeMB = (totalBytes / (1024 * 1024)).toFixed(2);
            const sizeGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
            resolve({ sizeMB, sizeGB });
        };
        request.onerror = (e) => reject(new Error(`计算大小失败: ${e.target.error.message}`));
    });
}

// 自动清理过期的图片缓存
function clearExpiredCache() {
    return new Promise(async (resolve, reject) => {
        if (!imgDbInstance) await initImageCacheDB();

        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readwrite");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        const request = store.getAll();

        request.onsuccess = (e) => {
            const allImages = e.target.result;
            let deletedCount = 0;
            allImages.forEach(img => {
                // 非永久且已过期的缓存，执行删除
                if (img.expireTime !== 0 && Date.now() > img.expireTime) {
                    store.delete(img.rawUrl);
                    deletedCount++;
                }
            });
            resolve(`清理了 ${deletedCount} 张过期缓存图片`);
        };
        request.onerror = (e) => reject(new Error(`清理过期缓存失败: ${e.target.error.message}`));
    });
}

// 页面加载时初始化数据库+自动清理过期缓存
window.addEventListener("DOMContentLoaded", async () => {
    try {
        await initImageCacheDB();
        await clearExpiredCache();
    } catch (err) {
        console.error("图片缓存初始化/清理失败:", err);
    }
});
