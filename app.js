// 仓库配置
const REPO = {
    USER: "25eqsg3f08-stack",
    REPO: "Rua_de_macau_Photos",
    BRANCH: "main",
    API: "https://api.github.com/repos/25eqsg3f08-stack/Rua_de_macau_Photos/contents/?ref=main",
    RAW: "https://raw.githubusercontent.com/25eqsg3f08-stack/Rua_de_macau_Photos/main/",
    EXTS: ["jpg", "png", "jpeg", "webp", "gif"]
};

let imgList = [];
let currentIdx = 0;
let cachedCount = 0;

// DOM
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
    try {
        await getImgList();
        // 初始化时校验图片列表是否为空
        if (imgList.length === 0) {
            dom.loading.textContent = "仓库无图片";
            dom.nextBtn.disabled = true;
            return;
        }
        loadImg(0);
    } catch (err) {
        dom.loading.textContent = "加载失败";
        dom.status.textContent = `错误：${err.message}`;
        dom.nextBtn.disabled = true;
    }
    // 分享按钮事件
    dom.shareBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(window.location.href)
            .then(() => alert("本页链接复制成功！"))
            .catch(() => alert("复制失败，请手动复制URL"));
    });

    // 绑定上下页按钮事件（新增异常判断）
    dom.prevBtn.addEventListener("click", handlePrev);
    dom.nextBtn.addEventListener("click", handleNext);
});

// 自动获取仓库图片列表
async function getImgList() {
    const res = await fetch(REPO.API);
    if (res.status === 403) throw new Error("API限流，请稍后重试");
    if (res.status === 404) throw new Error("仓库不存在");
    if (!res.ok) throw new Error(`请求失败 [${res.status}]`);

    const files = await res.json();
    imgList = files.filter(f => {
        if (f.type !== "file") return false;
        const ext = f.name.split(".").pop().toLowerCase();
        return REPO.EXTS.includes(ext);
    }).map(f => REPO.RAW + f.name);
}

// 加载图片+自动缓存
function loadImg(idx) {
    // 核心异常判断：索引非数字/超出范围直接拦截
    if (typeof idx !== "number" || isNaN(idx) || idx < 0 || idx >= imgList.length) {
        console.error("图片索引异常：", idx);
        dom.loading.textContent = "图片索引错误";
        return;
    }

    const url = imgList[idx];
    dom.loading.style.display = "block";
    dom.imgView.style.display = "none";

    dom.imgView.src = url;
    dom.imgView.onload = () => {
        dom.loading.style.display = "none";
        dom.imgView.style.display = "block";
        currentIdx = idx; // 仅在加载成功后更新索引
        updateBtn();
        cacheImg(url); // 点击下一张时缓存
    };
    dom.imgView.onerror = () => {
        dom.loading.textContent = "图片加载失败";
        // 加载失败时重置按钮状态，避免卡死
        updateBtn();
    };
}

// 通知SW缓存图片（新增URL合法性校验）
function cacheImg(url) {
    if (!url || !url.startsWith("https://")) {
        console.error("缓存图片URL异常：", url);
        return;
    }
    if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CACHE_IMG", url });
        // 去重计数，避免异常数值
        const newCachedCount = [...new Set([...Array(cachedCount).keys(), currentIdx])].length + 1;
        cachedCount = Math.max(0, Math.min(newCachedCount, imgList.length)); // 限制计数范围
        dom.status.textContent = `已缓存：${cachedCount}张 | 离线可用`;
    }
}

// 更新按钮状态（强制边界校验）
function updateBtn() {
    const isFirst = currentIdx === 0;
    const isLast = currentIdx === imgList.length - 1;
    dom.prevBtn.disabled = isFirst;
    dom.nextBtn.disabled = isLast;
    // 防止按钮状态异常，强制同步disabled属性
    dom.prevBtn.setAttribute("disabled", isFirst);
    dom.nextBtn.setAttribute("disabled", isLast);
}

// 上一页处理（新增异常拦截）
function handlePrev() {
    const newIdx = currentIdx - 1;
    // 校验新索引是否合法
    if (newIdx < 0) {
        console.warn("上一页索引异常：已到第一张");
        return;
    }
    loadImg(newIdx);
}

// 下一页处理（新增异常拦截）
function handleNext() {
    const newIdx = currentIdx + 1;
    // 校验新索引是否合法
    if (newIdx >= imgList.length) {
        console.warn("下一页索引异常：已到最后一张");
        return;
    }
    loadImg(newIdx);
}