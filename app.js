// 仓库配置
const REPO = {
    USER: "25eqsg3f08-stack",
    REPO: "Rua_de_macau_Photos",
    BRANCH: "main",
    API: "https://api.github.com/repos/25eqsg3f08-stack/Rua_de_macau_Photos/contents/?ref=main",
    RAW: "https://raw.githubusercontent.com/25eqsg3f08-stack/Rua_de_macau_Photos/main/",
    EXTS: ["jpg", "png", "jpeg", "webp", "gif"],
    RETRY: {
        TIMES: 4, // 限流重试次数（1-4次）
        DELAY: 1000 // 重试延迟
    }
};

let imgList = [];
let currentIdx = 0;
let cachedCount = 0;
let isRequesting = false; // 标记是否正在发起请求，防止重复

// DOM元素
const dom = {
    imgView: document.getElementById("img-view"),
    loading: document.getElementById("loading"),
    prevBtn: document.getElementById("prev-btn"),
    nextBtn: document.getElementById("next-btn"),
    shareBtn: document.getElementById("share-btn"),
    status: document.getElementById("status")
};

// 初始化
window.addEventListener("DOMContentLoaded", async () => {
    dom.prevBtn.title = "上一张";
    dom.nextBtn.title = "下一张";
    
    // 首次加载图片列表（仅一次）
    try {
        await getImgListWithRetry(REPO.RETRY.TIMES);
        if (imgList.length === 0) {
            dom.loading.textContent = "仓库无符合格式的图片";
            dom.nextBtn.disabled = true;
            return;
        }
        loadImg(0);
    } catch (err) {
        dom.loading.textContent = "图片加载失败";
        dom.status.textContent = `错误：${err.message}`;
        dom.nextBtn.disabled = true;
    }

    // 分享按钮事件
    dom.shareBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(window.location.href)
            .then(() => alert("本页链接复制成功！"))
            .catch(() => alert("复制失败，请手动复制URL"));
    });

    // 绑定上下页按钮（下一张仅单次请求）
    dom.prevBtn.addEventListener("click", handlePrev);
    dom.nextBtn.addEventListener("click", handleNext);
});

/**
 * 带重试的图片列表获取（仅初始化执行一次）
 */
async function getImgListWithRetry(retryLeft) {
    if (isRequesting) return; // 防止重复请求
    isRequesting = true;

    try {
        const res = await fetch(REPO.API);
        if (res.status === 403) {
            if (retryLeft > 0) {
                console.log(`API限流，剩余重试：${retryLeft}`);
                const delay = REPO.RETRY.DELAY * (4 - retryLeft + 1);
                await new Promise(resolve => setTimeout(resolve, delay));
                isRequesting = false;
                return getImgListWithRetry(retryLeft - 1);
            } else {
                throw new Error("API限流，已重试4次，请1小时后再试");
            }
        }
        if (res.status === 404) throw new Error("仓库不存在");
        if (!res.ok) throw new Error(`请求失败 [${res.status}]`);

        const files = await res.json();
        imgList = files.filter(file => {
            if (file.type !== "file") return false;
            const ext = file.name.split(".").pop().toLowerCase();
            return REPO.EXTS.includes(ext);
        }).map(file => REPO.RAW + file.name);

        console.log(`成功获取${imgList.length}张图片`);
    } catch (err) {
        throw err;
    } finally {
        isRequesting = false; // 重置请求标记
    }
}

/**
 * 加载图片（仅加载本地列表，无额外请求）
 */
function loadImg(idx) {
    if (typeof idx !== "number" || isNaN(idx) || idx < 0 || idx >= imgList.length) {
        console.error("索引异常：", idx);
        dom.loading.textContent = "图片索引错误";
        return;
    }

    const imgUrl = imgList[idx];
    dom.loading.style.display = "block";
    dom.imgView.style.display = "none";

    dom.imgView.src = imgUrl;
    dom.imgView.onload = () => {
        dom.loading.style.display = "none";
        dom.imgView.style.display = "block";
        currentIdx = idx;
        updateBtnStatus();
        cacheImg(imgUrl); // 缓存仅通知SW，无HTTP请求
    };
    dom.imgView.onerror = () => {
        dom.loading.textContent = "图片加载失败";
        updateBtnStatus();
    };
}

/**
 * 通知SW缓存图片（无额外HTTP请求）
 */
function cacheImg(url) {
    if (!url || !url.startsWith("https://")) return;
    if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CACHE_IMG", url });
        const newCachedSet = new Set([...Array(cachedCount).keys(), currentIdx]);
        cachedCount = Math.max(0, Math.min(newCachedSet.size, imgList.length));
        dom.status.textContent = `已缓存：${cachedCount}张 | 离线可用`;
    }
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
 * 上一张处理（无请求）
 */
function handlePrev() {
    const newIdx = currentIdx - 1;
    if (newIdx < 0) {
        console.warn("已到第一张");
        return;
    }
    loadImg(newIdx);
}

/**
 * 下一张处理（仅加载本地列表，单次请求限制）
 */
function handleNext() {
    if (isRequesting) return; // 防止点击时触发重复请求
    const newIdx = currentIdx + 1;
    if (newIdx >= imgList.length) {
        console.warn("已到最后一张");
        return;
    }
    loadImg(newIdx); // 仅加载本地图片，无HTTP请求
}
