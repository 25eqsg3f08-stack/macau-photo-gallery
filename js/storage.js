const IMG_CACHE_CONFIG = {
    dbName: "MacauStreet_ImageCache",
    dbVersion: 2, // 升级版本以支持时效字段
    storeName: "imagesStore"
};
let imgDbInstance = null;

// 初始化图片缓存数据库（新增时效字段）
function initImageCacheDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IMG_CACHE_CONFIG.dbName, IMG_CACHE_CONFIG.dbVersion);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IMG_CACHE_CONFIG.storeName)) {
                const store = db.createObjectStore(IMG_CACHE_CONFIG.storeName, { keyPath: "rawUrl" });
                store.createIndex("expireTimeIdx", "expireTime", { unique: false }); // 时效索引
            } else {
                // 升级现有仓库，添加时效字段（兼容旧数据）
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

        const expireTime = days === 0 ? 0 : Date.now() + (days * 24 * 60 * 60 * 1000);
        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readwrite");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        
        const imgData = {
            rawUrl: rawUrl,
            blob: blob,
            cacheTime: Date.now(),
            expireTime: expireTime // 新增时效字段
        };

        const request = store.put(imgData);
        request.onsuccess = () => resolve({ status: "success", size: blob.size });
        request.onerror = (e) => reject(new Error(`缓存失败: ${e.target.error.message}`));
    });

// 兼容旧方法
function cacheSingleImage(rawUrl, blob) {
    return cacheSingleImageWithExpire(rawUrl, blob, 0);
}

// 从缓存获取图片（自动校验时效）
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

            // 校验时效：非永久且已过期则删除并返回null
            if (data.expireTime !== 0 && Date.now() > data.expireTime) {
                deleteCachedImage(rawUrl);
                resolve(null);
                return;
            }

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

// 仅清除图片缓存
function clearOnlyImageCache() {
    return new Promise(async (resolve, reject) => {
        if (!imgDbInstance) await initImageCacheDB();

        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readwrite");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        const request = store.clear();

        request.onsuccess = () => {
            console.log("仅图片缓存已清除");
            resolve("图片缓存清除成功");
        };
        request.onerror = (e) => reject(new Error(`清除失败: ${e.target.error.message}`));
    });
}

// 计算图片缓存总大小
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

// 清理过期缓存
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

// 页面加载时初始化并清理过期缓存
window.addEventListener("DOMContentLoaded", async () => {
    await initImageCacheDB().catch(err => console.error(err));
    await clearExpiredCache().catch(err => console.error(err));
});
