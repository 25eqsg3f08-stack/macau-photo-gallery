// 配置：专门存储图片缓存，与网页资源完全隔离
const IMG_CACHE_CONFIG = {
    dbName: "MacauStreet_ImageCache", // 独立数据库名
    dbVersion: 1,
    storeName: "imagesStore" // 仅存图片的仓库
};
let imgDbInstance = null;

// 初始化图片专用 IndexedDB（与网页缓存隔离）
function initImageCacheDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IMG_CACHE_CONFIG.dbName, IMG_CACHE_CONFIG.dbVersion);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            // 仅创建图片存储仓库，键为图片raw地址
            if (!db.objectStoreNames.contains(IMG_CACHE_CONFIG.storeName)) {
                db.createObjectStore(IMG_CACHE_CONFIG.storeName, { keyPath: "rawUrl" });
            }
            console.log("图片缓存专用 IndexedDB 初始化成功");
        };

        request.onsuccess = (e) => {
            imgDbInstance = e.target.result;
            resolve(imgDbInstance);
        };

        request.onerror = (e) => {
            reject(new Error(`图片缓存数据库初始化失败: ${e.target.error.message}`));
        };
    });
}

// 缓存单张图片（仅存图片二进制 + 元信息）
function cacheSingleImage(rawUrl, blob) {
    return new Promise(async (resolve, reject) => {
        if (!imgDbInstance) await initImageCacheDB();

        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readwrite");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        
        const imgData = {
            rawUrl: rawUrl,
            blob: blob,
            cacheTime: Date.now() // 缓存时间戳
        };

        const request = store.put(imgData);
        request.onsuccess = () => resolve({ status: "success", size: blob.size });
        request.onerror = (e) => reject(new Error(`缓存失败: ${e.target.error.message}`));
    });
}

// 从缓存获取图片
function getCachedImage(rawUrl) {
    return new Promise(async (resolve, reject) => {
        if (!imgDbInstance) await initImageCacheDB();

        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readonly");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        const request = store.get(rawUrl);

        request.onsuccess = (e) => {
            const data = e.target.result;
            // 有缓存则返回 Blob URL，无则返回 null
            resolve(data ? URL.createObjectURL(data.blob) : null);
        };
        request.onerror = (e) => reject(new Error(`获取缓存失败: ${e.target.error.message}`));
    });
}

// 仅清除图片缓存（核心：不影响网页）
function clearOnlyImageCache() {
    return new Promise(async (resolve, reject) => {
        if (!imgDbInstance) await initImageCacheDB();

        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readwrite");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        const request = store.clear(); // 仅清空图片仓库

        request.onsuccess = () => {
            console.log("仅图片缓存已清除，网页资源不受影响");
            resolve("图片缓存清除成功");
        };
        request.onerror = (e) => reject(new Error(`清除图片缓存失败: ${e.target.error.message}`));
    });
}

// 计算当前图片缓存总大小
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

            // 转换为 MB/GB
            const sizeMB = (totalBytes / (1024 * 1024)).toFixed(2);
            const sizeGB = (totalBytes / (1024 * 1024 * 1024)).toFixed(2);
            resolve({ sizeMB, sizeGB });
        };
        request.onerror = (e) => reject(new Error(`计算缓存大小失败: ${e.target.error.message}`));
    });
}

// 页面加载时初始化图片缓存数据库
window.addEventListener("DOMContentLoaded", () => {
    initImageCacheDB().catch(err => console.error("图片缓存DB初始化失败:", err));
});