// 仓库配置
const REPO = {
    USER: "25eqsg3f08-stack",
    REPO: "Rua_de_macau_Photos",
    BRANCH: "main",
    API: "https://api.github.com/repos/25eqsg3f08-stack/Rua_de_macau_Photos/contents/?ref=main",
    RAW: "https://raw.githubusercontent.com/25eqsg3f08-stack/Rua_de_macau_Photos/main/",
    EXTS: ["jpg", "png", "jpeg", "webp", "gif"],
    RETRY: {
        TIMES: 4,
        DELAY: 1000
    }
};

// 全局变量
let imgList = [];
let currentIdx = 0;
let cachedCount = 0;
let isRequesting = false;
let isOfflineMode = false; // 标记是否为离线模式

// DOM元素
const dom = {
    imgView: document.getElementById("img-view"),
    loading: document.getElementById("loading"),
    prevBtn: document.getElementById("prev-btn"),
    nextBtn: document.getElementById("next-btn"),
    shareBtn: document.getElementById("share-btn"),
    status: document.getElementById("status"),
    errorTip: document.createElement("div") // 新增错误提示元素
};

// 初始化页面元素
function initPageElements() {
    // 配置错误提示样式
    dom.errorTip.style.color = "#dc3545";
    dom.errorTip.style.textAlign = "center";
    dom.errorTip.style.marginTop = "1rem";
    dom.errorTip.style.fontSize = "0.9rem";
    document.body.insertBefore(dom.errorTip, dom.prevBtn.parentNode);

    // 按钮提示
    dom.prevBtn.title = "上一张";
    dom.nextBtn.title = "下一张";
}

// 初始化
window.addEventListener("DOMContentLoaded", async () => {
    initPageElements();
    // 监听网络状态变化
    window.addEventListener("online", () => {
        isOfflineMode = false;
        dom.errorTip.textContent = "";
        dom.status.textContent = `已缓存：${cachedCount}张 | 在线可用`;
    });
    window.addEventListener("offline", () => {
        isOfflineMode = true;
        dom.status.textContent = `已缓存：${cachedCount}张 | 离线可用`;
    });

    // 优先从SW获取缓存的图片列表
    await getCachedImgListFromSW();

    // 初始化图片加载逻辑
    try {
        // 离线且有缓存：直接使用缓存列表
        if (isOfflineMode && imgList.length > 0) {
            dom.loading.textContent = "离线模式，使用缓存图片";
            loadImg(0);
        } 
        // 在线状态：尝试从API获取最新列表
        else if (!isOfflineMode) {
            await getImgListWithRetry(REPO.RETRY.TIMES);
            if (imgList.length === 0) {
                dom.loading.textContent = "仓库无符合格式的图片";
                dom.nextBtn.disabled = true;
                return;
            }
            loadImg(0);
        } 
        // 离线且无缓存
        else {
            throw new Error("当前离线且无缓存图片，请先联网浏览图片完成缓存");
        }
    } catch (err) {
        dom.loading.textContent = "图片加载失败";
        dom.errorTip.textContent = `错误：${err.message}`;
        dom.nextBtn.disabled = true;
    }

    // 分享按钮事件
    dom.shareBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(window.location.href)
            .then(() => alert("本页链接复制成功！"))
            .catch(() => alert("复制失败，请手动复制URL"));
    });

    // 绑定按钮事件
    dom.prevBtn.addEventListener("click", handlePrev);
    dom.nextBtn.addEventListener("click", handleNext);
});

/**
 * 从Service Worker获取缓存的图片列表
 */
async function getCachedImgListFromSW() {
    return new Promise((resolve) => {
        if (!navigator.serviceWorker?.controller) {
            resolve();
            return;
        }
        // 向SW发送获取缓存列表的请求
        navigator.serviceWorker.controller.postMessage({ type: "GET_CACHED_IMGS" });
        // 监听SW的响应
        const messageHandler = (e) => {
            if (e.data.type === "CACHED_IMGS") {
                imgList = e.data.list || [];
                cachedCount = imgList.length;
                navigator.serviceWorker.removeEventListener("message", messageHandler);
                resolve();
            }
        };
        navigator.serviceWorker.addEventListener("message", messageHandler);
    });
}

/**
 * 带重试的图片列表获取（含网络状态检测）
 */
async function getImgListWithRetry(retryLeft) {
    // 离线状态直接终止请求
    if (!navigator.onLine) {
        isOfflineMode = true;
        throw new Error("当前处于离线状态，无法获取最新图片列表");
    }

    if (isRequesting) return;
    isRequesting = true;

    try {
        const res = await fetch(REPO.API);
        // 处理API限流
        if (res.status === 403) {
            if (retryLeft > 0) {
                console.log(`API限流，剩余重试：${retryLeft}`);
                const delay = REPO.RETRY.DELAY * (4 - retryLeft + 1);
                await new Promise(resolve => setTimeout(resolve, delay));
                isRequesting = false;
                return getImgListWithRetry(retryLeft - 1);
            } else {
                throw new Error("GitHub API限流，已重试4次，请1小时后再试");
            }
        }
        if (res.status === 404) throw new Error("图片仓库不存在");
        if (!res.ok) throw new Error(`请求失败 [${res.status}]`);

        // 解析图片列表（仅在线时执行）
        const files = await res.json();
        const newImgList = files.filter(file => {
            if (file.type !== "file") return false;
            const ext = file.name.split(".").pop().toLowerCase();
            return REPO.EXTS.includes(ext);
        }).map(file => REPO.RAW + file.name);

        // 更新列表并通知SW缓存新列表
        imgList = newImgList;
        if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({ 
                type: "UPDATE_CACHED_IMGS", 
                list: imgList 
            });
        }
        cachedCount = imgList.length;
        console.log(`成功获取${imgList.length}张图片`);
    } catch (err) {
        throw err;
    } finally {
        isRequesting = false;
    }
}

/**
 * 加载图片（含异常校验）
 */
function loadImg(idx) {
    if (typeof idx !== "number" || isNaN(idx) || idx < 0 || idx >= imgList.length) {
        console.error("图片索引异常：", idx);
        dom.loading.textContent = "图片索引错误";
        return;
    }

    const imgUrl = imgList[idx];
    dom.loading.style.display = "block";
    dom.imgView.style.display = "none";
    dom.errorTip.textContent = "";

    // 加载图片
    dom.imgView.src = imgUrl;
    dom.imgView.onload = () => {
        dom.loading.style.display = "none";
        dom.imgView.style.display = "block";
        currentIdx = idx;
        updateBtnStatus();
        cacheImg(imgUrl);
    };
    dom.imgView.onerror = () => {
        dom.loading.textContent = "图片加载失败";
        dom.errorTip.textContent = "该图片可能未缓存或链接失效";
        updateBtnStatus();
    };
}

/**
 * 通知SW缓存图片
 */
function cacheImg(url) {
    if (!url || !url.startsWith("https://") || !navigator.serviceWorker?.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: "CACHE_IMG", url });
    const newCachedSet = new Set([...Array(cachedCount).keys(), currentIdx]);
    cachedCount = Math.max(0, Math.min(newCachedSet.size, imgList.length));
    dom.status.textContent = isOfflineMode 
        ? `已缓存：${cachedCount}张 | 离线可用` 
        : `已缓存：${cachedCount}张 | 在线可用`;
}

/**
 * 更新按钮状态
 */
function updateBtnStatus() {
    const isFirst = currentIdx === 0;
    const isLast = currentIdx === imgList.length - 1;
    
    dom.prevBtn.disabled = isFirst;
    dom.nextBtn.disabled = isLast;
    
    dom.prevBtn.title = isFirst ? "已是第一张" : "上一张";
    dom.nextBtn.title = isLast ? "已是最后一张" : "下一张";
}

/**
 * 上一张处理
 */
function handlePrev() {
    if (isRequesting) return;
    const newIdx = currentIdx - 1;
    if (newIdx < 0) {
        console.warn("已到第一张图片");
        return;
    }
    loadImg(newIdx);
}

/**
 * 下一张处理
 */
function handleNext() {
    if (isRequesting) return;
    const newIdx = currentIdx + 1;
    if (newIdx >= imgList.length) {
        console.warn("已到最后一张图片");
        return;
    }
    loadImg(newIdx);
}
