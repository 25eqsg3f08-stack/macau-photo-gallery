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
        if (imgList.length > 0) loadImg(0);
        else dom.loading.textContent = "仓库无图片";
    } catch (err) {
        dom.loading.textContent = "加载失败";
        dom.status.textContent = `错误：${err.message}`;
    }
    // 分享按钮事件
    dom.shareBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(window.location.href)
            .then(() => alert("本页链接复制成功！"))
            .catch(() => alert("复制失败，请手动复制URL"));
    });
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
    if (!imgList[idx]) return;
    const url = imgList[idx];
    
    dom.loading.style.display = "block";
    dom.imgView.style.display = "none";

    dom.imgView.src = url;
    dom.imgView.onload = () => {
        dom.loading.style.display = "none";
        dom.imgView.style.display = "block";
        currentIdx = idx;
        updateBtn();
        cacheImg(url); // 点击下一张时缓存
    };
    dom.imgView.onerror = () => dom.loading.textContent = "图片加载失败";
}

// 通知SW缓存图片
function cacheImg(url) {
    if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CACHE_IMG", url });
        cachedCount = [...new Set([...Array(cachedCount).keys(), currentIdx])].length + 1;
        dom.status.textContent = `已缓存：${cachedCount}张 | 离线可用`;
    }
}

// 更新按钮状态
function updateBtn() {
    dom.prevBtn.disabled = currentIdx === 0;
    dom.nextBtn.disabled = currentIdx === imgList.length - 1;
}

// 按钮事件
dom.prevBtn.addEventListener("click", () => currentIdx > 0 && loadImg(currentIdx - 1));
dom.nextBtn.addEventListener("click", () => currentIdx < imgList.length - 1 && loadImg(currentIdx + 1));