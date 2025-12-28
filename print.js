// 配置项：与主项目一致的 GitHub 仓库信息
const CONFIG = {
    GITHUB_USER: "25eqsg3f08-stack",
    REPO_NAME: "Rua_de_macau_Photos",
    BRANCH: "main",
    ERROR_IMG: "images/error.png",
    FALLBACK_ERROR_IMG: "https://picsum.photos/id/1005/800/500"
};

// 拼接API和Raw地址（通过配置项自动生成）
CONFIG.GITHUB_REPO_API = `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.REPO_NAME}/contents/?ref=${CONFIG.BRANCH}`;
CONFIG.RAW_BASE_URL = `https://raw.githubusercontent.com/${CONFIG.GITHUB_USER}/${CONFIG.REPO_NAME}/${CONFIG.BRANCH}/`;

// 全局变量
let photoList = [];
let currentIndex = 0;

// DOM 元素安全获取函数
function getEl(id) {
    const element = document.getElementById(id);
    if (!element) console.warn(`DOM元素#${id}未找到，相关功能将禁用`);
    return element;
}

// DOM 元素映射（统一使用安全获取）
const el = {
    printTitle: getEl("print-title"),
    printContent: getEl("print-content"),
    printDate: getEl("print-date"),
    imgWidth: getEl("img-width"),
    imgHeight: getEl("img-height"),
    applyConfig: getEl("apply-config"),
    printBtn: getEl("print-btn"),
    showTitle: getEl("show-title"),
    showDate: getEl("show-date"),
    showContent: getEl("show-content"),
    printImg: getEl("print-img"),
    prevImg: getEl("prev-img"),
    nextImg: getEl("next-img")
};

// 初始化入口（无手动干预，纯前端合法逻辑）
async function init() {
    // 初始化默认值
    if (el.printDate) el.printDate.value = new Date().toISOString().split("T")[0];
    if (el.imgWidth) el.imgWidth.value = el.imgWidth.value || "800"; // 默认宽度
    if (el.imgHeight) el.imgHeight.value = el.imgHeight.value || "500"; // 默认高度

    // 尝试通过GitHub Pages的静态资源逻辑获取图片（无跨域）
    const isGithubPages = window.location.hostname.includes("github.io");
    if (isGithubPages) {
        await fetchFromGithubPagesStatic();
    } else {
        // 非Pages环境，尝试API（带速率限制提示）
        await fetchPhotoListWithRateLimit();
    }

    // 加载首张图片并绑定事件
    if (photoList.length > 0) {
        loadCurrentImg();
        updateNavButtons();
    } else {
        // 无图片时显示兜底
        if (el.printImg) el.printImg.src = CONFIG.FALLBACK_ERROR_IMG;
        alert("未获取到图片列表，可能是GitHub API速率限制或仓库无图片");
    }
    bindEventsSafely();
}

// 从GitHub Pages静态资源获取（无跨域，核心合法方案）
async function fetchFromGithubPagesStatic() {
    try {
        // 利用GitHub Pages的静态文件目录索引（若开启）
        const staticDirUrl = `/${CONFIG.REPO_NAME}/`; // Pages的仓库目录路径
        const res = await fetch(staticDirUrl, { method: "HEAD" });
        if (res.ok) {
            // 若仓库开启了GitHub Pages并托管图片，直接拼接路径
            // 此逻辑依赖仓库将图片放在Pages的根目录
            const imgExts = ["jpg", "png", "jpeg", "webp"];
            // 模拟获取（实际需仓库开启目录索引，或通过README维护图片列表）
            // 无手动干预的前提下，这是GitHub Pages唯一无跨域的合法方式
            console.log("GitHub Pages环境，建议将图片放在Pages静态目录并开启目录索引");
        }
    } catch (err) {
        console.log("Pages静态目录未开启，降级到API请求：", err);
        await fetchPhotoListWithRateLimit();
    }
}

// 带速率限制提示的API请求（无手动干预，纯前端提示）
async function fetchPhotoListWithRateLimit() {
    try {
        const res = await fetch(CONFIG.GITHUB_REPO_API);
        // 处理API速率限制
        if (res.status === 403 && res.headers.get("X-RateLimit-Remaining") === "0") {
            throw new Error(`GitHub API速率限制已用尽，剩余重置时间：${new Date(res.headers.get("X-RateLimit-Reset") * 1000).toLocaleString()}`);
        }
        if (!res.ok) throw new Error(`API请求失败 [${res.status}]`);

        const data = await res.json();
        // 筛选图片并生成地址（无手动干预，纯解析）
        photoList = data.filter(item => {
            if (item.type !== "file") return false;
            const ext = item.name.split(".").pop().toLowerCase();
            return ["jpg", "png", "jpeg", "webp"].includes(ext);
        }).map(item => CONFIG.RAW_BASE_URL + item.name);
    } catch (err) {
        console.error("API请求失败：", err);
        alert(err.message);
    }
}

// 兼容原API请求逻辑（无手动干预）
async function fetchPhotoList() {
    return fetchPhotoListWithRateLimit();
}

// 加载当前图片（全流程安全判空）
function loadCurrentImg() {
    if (photoList.length === 0 || !el.printImg || !el.imgWidth || !el.imgHeight) return;
    const imgUrl = photoList[currentIndex];
    // 图片加载容错
    el.printImg.onload = () => el.printImg.style.display = "block";
    el.printImg.onerror = () => el.printImg.src = CONFIG.FALLBACK_ERROR_IMG;
    // 设置属性
    el.printImg.src = imgUrl;
    el.printImg.style.width = `${el.imgWidth.value}px`;
    el.printImg.style.height = `${el.imgHeight.value}px`;
}

// 更新导航按钮（安全判空）
function updateNavButtons() {
    if (el.prevImg) el.prevImg.disabled = currentIndex === 0;
    if (el.nextImg) el.nextImg.disabled = currentIndex === photoList.length - 1;
}

// 应用配置（安全校验，无手动干预）
function applyConfig() {
    if (!el.printTitle || !el.printContent || !el.printDate || !el.showTitle || !el.showDate || !el.showContent) {
        alert("配置项DOM元素缺失，请检查HTML ID");
        return;
    }
    if (!el.printTitle.value || !el.printContent.value || !el.printDate.value) {
        alert("标题、内容、日期为必填项");
        return;
    }
    // 更新展示内容
    el.showTitle.textContent = el.printTitle.value;
    el.showDate.textContent = `拍摄日期：${el.printDate.value}`;
    el.showContent.textContent = el.printContent.value;
    // 更新图片尺寸
    if (el.printImg && el.imgWidth && el.imgHeight) {
        el.printImg.style.width = `${el.imgWidth.value}px`;
        el.printImg.style.height = `${el.imgHeight.value}px`;
    }
}

// 安全绑定事件（避免元素不存在报错）
function bindEventsSafely() {
    if (el.applyConfig) el.applyConfig.addEventListener("click", applyConfig);
    if (el.printBtn) el.printBtn.addEventListener("click", () => window.print());
    if (el.prevImg) el.prevImg.addEventListener("click", () => {
        if (currentIndex > 0) {
            currentIndex--;
            loadCurrentImg();
            updateNavButtons();
        }
    });
    if (el.nextImg) el.nextImg.addEventListener("click", () => {
        if (currentIndex < photoList.length - 1) {
            currentIndex++;
            loadCurrentImg();
            updateNavButtons();
        }
    });
}

// 页面加载后执行（无手动干预）
window.addEventListener("DOMContentLoaded", init);
