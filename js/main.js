// 目标远程仓库配置
const TARGET_REPO = {
    user: "25eqsg3f08-stack",
    repo: "Rua_de_macau_Photos",
    branch: "main"
};

const REPO_API_URL = `https://api.github.com/repos/${TARGET_REPO.user}/${TARGET_REPO.repo}/contents/`;
const RAW_BASE_URL = `https://raw.githubusercontent.com/${TARGET_REPO.user}/${TARGET_REPO.repo}/${TARGET_REPO.branch}`;

// 全局变量：区分远程图片列表和缓存图片列表
let remoteImageList = [];    // 远程仓库图片列表
let cachedImageList = [];    // 本地已缓存图片列表
let currentImgIndex = 0;
let isOffline = !navigator.onLine; // 初始网络状态

// DOM元素管理
let DOM_ELEMENTS = {
    currentImage: null,
    imageName: null,
    pageInfo: null,
    prevBtn: null,
    nextBtn: null,
    cacheStatus: null,
    cacheSize: null
};

// 递归获取仓库所有文件
async function fetchAllRepoFiles(path = "") {
    try {
        const response = await fetch(`${REPO_API_URL}${path}`);
        if (response.status === 403) throw new Error("GitHub API限流，请1小时后重试");
        if (!response.ok) throw new Error(`请求失败 (${response.status})`);

        const files = await response.json();
        let allFiles = [];
        for (const file of files) {
            if (file.type === "dir") {
                const subFiles = await fetchAllRepoFiles(file.path);
                allFiles = [...allFiles, ...subFiles];
            } else {
                allFiles.push(file);
            }
        }
        return allFiles;
    } catch (error) {
        throw error;
    }
}

// 获取本地已缓存的图片列表
async function getCachedImageList() {
    if (!imgDbInstance) await initImageCacheDB();

    return new Promise((resolve) => {
        const transaction = imgDbInstance.transaction(IMG_CACHE_CONFIG.storeName, "readonly");
        const store = transaction.objectStore(IMG_CACHE_CONFIG.storeName);
        const request = store.getAll();

        request.onsuccess = (e) => {
            // 过滤有效缓存（未过期）并提取rawUrl
            const validCache = e.target.result.filter(img => {
                return img.expireTime === 0 || Date.now() < img.expireTime;
            });
            cachedImageList = validCache.map(img => img.rawUrl);
            resolve(cachedImageList);
        };
    });
}

// 初始化图片列表（在线拉取远程，离线用缓存）
async function initImageList() {
    if (!DOM_ELEMENTS.cacheStatus) return;

    isOffline = !navigator.onLine;
    DOM_ELEMENTS.cacheStatus.textContent = isOffline 
        ? "当前状态：离线，仅可浏览已缓存图片" 
        : "当前状态：在线，正在拉取远程图片...";

    if (isOffline) {
        // 离线：仅加载缓存图片
        await getCachedImageList();
        if (cachedImageList.length === 0) {
            DOM_ELEMENTS.cacheStatus.textContent = "离线状态：无已缓存图片，请先在线缓存";
        } else {
            DOM_ELEMENTS.cacheStatus.textContent = `离线状态：找到 ${cachedImageList.length} 张已缓存图片`;
            await loadCurrentImage();
        }
        updateButtonStatus();
        updatePageInfo();
        return;
    }

    // 在线：拉取远程图片
    try {
        const allFiles = await fetchAllRepoFiles();
        const imageFiles = allFiles.filter(file => /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file.name));
        remoteImageList = imageFiles.map(file => `${RAW_BASE_URL}/${file.path}`);

        if (remoteImageList.length === 0) {
            throw new Error("远程仓库无图片文件");
        }

        // 同步缓存列表
        await getCachedImageList();
        await loadCurrentImage();
        DOM_ELEMENTS.cacheStatus.textContent = `在线状态：拉取 ${remoteImageList.length} 张远程图片，已缓存 ${cachedImageList.length} 张`;
    } catch (error) {
        DOM_ELEMENTS.cacheStatus.textContent = `初始化失败：${error.message}`;
    } finally {
        updateButtonStatus();
        updatePageInfo();
    }
}

// 加载当前图片（根据网络状态选择远程/缓存列表）
async function loadCurrentImage() {
    const imageList = isOffline ? cachedImageList : remoteImageList;
    if (imageList.length === 0 || !DOM_ELEMENTS.currentImage || !DOM_ELEMENTS.imageName) return;

    const rawUrl = imageList[currentImgIndex];
    const fileName = rawUrl.split("/").pop();

    try {
        // 优先从缓存读取（无论在线/离线）
        const cachedImgUrl = await getCachedImage(rawUrl);
        if (cachedImgUrl) {
            DOM_ELEMENTS.currentImage.src = cachedImgUrl;
            DOM_ELEMENTS.imageName.textContent = `图片: ${fileName}（已缓存）`;
            return;
        }

        // 在线状态下加载远程图片
        if (!isOffline) {
            DOM_ELEMENTS.currentImage.src = rawUrl;
            DOM_ELEMENTS.currentImage.onload = () => {
                DOM_ELEMENTS.imageName.textContent = `图片: ${fileName}（远程加载）`;
            };
            DOM_ELEMENTS.currentImage.onerror = () => {
                throw new Error(`远程图片加载失败：${fileName}`);
            };
        } else {
            throw new Error("离线状态：该图片未缓存");
        }
    } catch (error) {
        DOM_ELEMENTS.currentImage.src = "https://via.placeholder.com/1200x600?text=加载失败";
        DOM_ELEMENTS.imageName.textContent = `加载失败: ${fileName}`;
        if (DOM_ELEMENTS.cacheStatus) {
            DOM_ELEMENTS.cacheStatus.textContent = `加载失败：${error.message}`;
        }
    }
}

// 更新页码（按当前列表数量显示）
function updatePageInfo() {
    if (!DOM_ELEMENTS.pageInfo) return;
    const imageList = isOffline ? cachedImageList : remoteImageList;
    DOM_ELEMENTS.pageInfo.textContent = `${currentImgIndex + 1}/${imageList.length}`;
}

// 更新翻页按钮状态（按当前列表数量禁用）
function updateButtonStatus() {
    const imageList = isOffline ? cachedImageList : remoteImageList;
    if (DOM_ELEMENTS.prevBtn) {
        DOM_ELEMENTS.prevBtn.disabled = currentImgIndex === 0 || imageList.length === 0;
    }
    if (DOM_ELEMENTS.nextBtn) {
        DOM_ELEMENTS.nextBtn.disabled = currentImgIndex >= imageList.length - 1 || imageList.length === 0;
    }
}

// 上一页（按当前列表切换）
async function prevImage() {
    const imageList = isOffline ? cachedImageList : remoteImageList;
    if (currentImgIndex > 0 && imageList.length > 0) {
        currentImgIndex--;
        await loadCurrentImage();
        updatePageInfo();
        updateButtonStatus();
    }
}

// 下一页（按当前列表切换）
async function nextImage() {
    const imageList = isOffline ? cachedImageList : remoteImageList;
    if (currentImgIndex < imageList.length - 1 && imageList.length > 0) {
        currentImgIndex++;
        await loadCurrentImage();
        updatePageInfo();
        updateButtonStatus();
    }
}

// 更新缓存大小显示
async function updateImageCacheSize() {
    if (!DOM_ELEMENTS.cacheSize) return;
    try {
        const sizeData = await calculateImageCacheSize();
        DOM_ELEMENTS.cacheSize.textContent = `当前图片缓存大小: ${sizeData.sizeMB}MB (${sizeData.sizeGB}GB)`;
    } catch (error) {
        DOM_ELEMENTS.cacheSize.textContent = `缓存大小计算失败: ${error.message}`;
    }
}

// 监听网络状态变化
function listenNetworkStatus() {
    window.addEventListener('online', async () => {
        isOffline = false;
        currentImgIndex = 0;
        await initImageList();
    });

    window.addEventListener('offline', async () => {
        isOffline = true;
        currentImgIndex = 0;
        await initImageList();
    });
}

// 初始化DOM和事件
function initDOMAndEvents() {
    DOM_ELEMENTS.currentImage = document.getElementById("current-image");
    DOM_ELEMENTS.imageName = document.getElementById("image-name");
    DOM_ELEMENTS.pageInfo = document.getElementById("page-info");
    DOM_ELEMENTS.prevBtn = document.getElementById("prev-btn");
    DOM_ELEMENTS.nextBtn = document.getElementById("next-btn");
    DOM_ELEMENTS.cacheStatus = document.getElementById("cache-status");
    DOM_ELEMENTS.cacheSize = document.getElementById("cache-size");

    // 绑定事件
    if (DOM_ELEMENTS.prevBtn) DOM_ELEMENTS.prevBtn.addEventListener("click", prevImage);
    if (DOM_ELEMENTS.nextBtn) DOM_ELEMENTS.nextBtn.addEventListener("click", nextImage);
}

// 页面入口
window.addEventListener("DOMContentLoaded", async () => {
    initDOMAndEvents();
    listenNetworkStatus();
    await initImageCacheDB();
    await updateImageCacheSize();
    await initImageList();
});
