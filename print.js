// 配置项：与主项目一致的 GitHub 仓库地址
const CONFIG = {
    GITHUB_REPO_API: "https://api.github.com/repos/25eqsg3f08-stack/Rua_de_macau_Photos/contents/",
    RAW_BASE_URL: "https://raw.githubusercontent.com/25eqsg3f08-stack/Rua_de_macau_Photos/main/",
    ERROR_IMG: "images/error.png",
    FALLBACK_ERROR_IMG: "https://picsum.photos/id/1005/800/500"
};

// 全局变量
let photoList = [];
let currentIndex = 0;

// DOM 元素
const el = {
    // 配置项
    printTitle: document.getElementById("print-title"),
    printContent: document.getElementById("print-content"),
    printDate: document.getElementById("print-date"),
    imgWidth: document.getElementById("img-width"),
    imgHeight: document.getElementById("img-height"),
    applyConfig: document.getElementById("apply-config"),
    printBtn: document.getElementById("print-btn"),
    // 展示项
    showTitle: document.getElementById("show-title"),
    showDate: document.getElementById("show-date"),
    showContent: document.getElementById("show-content"),
    printImg: document.getElementById("print-img"),
    // 导航按钮
    prevImg: document.getElementById("prev-img"),
    nextImg: document.getElementById("next-img")
};

// 初始化：获取图片列表 + 设置默认日期
async function init() {
    // 默认日期为今天
    el.printDate.value = new Date().toISOString().split("T")[0];
    // 获取 GitHub 仓库图片列表
    await fetchPhotoList();
    // 加载第一张图片
    if (photoList.length > 0) {
        loadCurrentImg();
        updateNavButtons();
    }
    // 绑定事件
    bindEvents();
}

// 从 GitHub API 获取图片列表
async function fetchPhotoList() {
    try {
        const res = await fetch(CONFIG.GITHUB_REPO_API);
        if (!res.ok) throw new Error("获取图片列表失败");
        const data = await res.json();
        // 筛选图片格式
        photoList = data.filter(item => {
            const ext = item.name.split(".").pop().toLowerCase();
            return ["jpg", "png", "jpeg", "webp"].includes(ext);
        }).map(item => CONFIG.RAW_BASE_URL + item.name);
    } catch (err) {
        console.error(err);
        alert("无法连接 GitHub，请检查网络后重试");
        // 兜底：使用错误图
        el.printImg.src = CONFIG.FALLBACK_ERROR_IMG;
    }
}

// 加载当前图片
function loadCurrentImg() {
    if (photoList.length === 0) return;
    const imgUrl = photoList[currentIndex];
    // 设置图片尺寸 + 加载
    el.printImg.style.width = `${el.imgWidth.value}px`;
    el.printImg.style.height = `${el.imgHeight.value}px`;
    el.printImg.src = imgUrl;
    // 错误兜底
    el.printImg.onerror = () => {
        el.printImg.src = CONFIG.ERROR_IMG || CONFIG.FALLBACK_ERROR_IMG;
    };
}

// 更新导航按钮状态
function updateNavButtons() {
    el.prevImg.disabled = currentIndex === 0;
    el.nextImg.disabled = currentIndex === photoList.length - 1;
}

// 应用配置（标题/内容/日期/尺寸）
function applyConfig() {
    // 校验必填项
    if (!el.printTitle.value || !el.printContent.value || !el.printDate.value) {
        alert("标题、内容、日期为必填项！");
        return;
    }
    // 更新展示区内容
    el.showTitle.textContent = el.printTitle.value;
    el.showDate.textContent = el.printDate.value;
    el.showContent.textContent = el.printContent.value;
    // 更新图片尺寸
    el.printImg.style.width = `${el.imgWidth.value}px`;
    el.printImg.style.height = `${el.imgHeight.value}px`;
}

// 绑定所有事件
function bindEvents() {
    // 应用配置
    el.applyConfig.addEventListener("click", applyConfig);
    // 触发浏览器打印
    el.printBtn.addEventListener("click", () => window.print());
    // 上一张图片
    el.prevImg.addEventListener("click", () => {
        if (currentIndex > 0) {
            currentIndex--;
            loadCurrentImg();
            updateNavButtons();
        }
    });
    // 下一张图片
    el.nextImg.addEventListener("click", () => {
        if (currentIndex < photoList.length - 1) {
            currentIndex++;
            loadCurrentImg();
            updateNavButtons();
        }
    });
}

// 页面加载后初始化
window.addEventListener("DOMContentLoaded", init);