// 配置项：GitHub仓库信息（与主项目一致）
const CONFIG = {
    GITHUB_USER: "25eqsg3f08-stack",
    REPO_NAME: "Rua_de_macau_Photos",
    BRANCH: "main",
    ERROR_IMG: "https://picsum.photos/id/1005/800/500", // 兜底错误图
    IMG_EXTS: ["jpg", "png", "jpeg", "webp"] // 支持的图片格式
};

// 自动拼接API和Raw地址
CONFIG.GITHUB_REPO_API = `https://api.github.com/repos/${CONFIG.GITHUB_USER}/${CONFIG.REPO_NAME}/contents/?ref=${CONFIG.BRANCH}`;
CONFIG.RAW_BASE_URL = `https://raw.githubusercontent.com/${CONFIG.GITHUB_USER}/${CONFIG.REPO_NAME}/${CONFIG.BRANCH}/`;

// 全局变量
let photoList = [];
let currentIndex = 0;

// DOM元素安全获取
function getEl(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`[打印界面] DOM元素#${id}未找到`);
    return el;
}

// DOM元素映射 - 新增 rawUrl 和 copyLink
const el = {
    // 配置项
    printTitle: getEl("print-title"),
    printContent: getEl("print-content"),
    printDate: getEl("print-date"),
    imgWidth: getEl("img-width"),
    imgHeight: getEl("img-height"),
    applyConfig: getEl("apply-config"),
    printBtn: getEl("print-btn"),
    // 预览项
    showTitle: getEl("show-title"),
    showDate: getEl("show-date"),
    showContent: getEl("show-content"),
    printImg: getEl("print-img"),
    // 导航按钮
    prevImg: getEl("prev-img"),
    nextImg: getEl("next-img"),
    // 新增：Raw地址展示与复制
    rawUrl: getEl("raw-url"),
    copyLink: getEl("copy-link")
};

// 初始化入口
async function initPrintPage() {
    // 设置默认值
    if (el.printDate) el.printDate.value = new Date().toISOString().split("T")[0];
    if (el.imgWidth) el.imgWidth.value = el.imgWidth.value || "800";
    if (el.imgHeight) el.imgHeight.value = el.imgHeight.value || "500";

    // 尝试获取图片列表（优先API，失败则提示）
    await fetchPhotoList();

    // 加载首张图片
    if (photoList.length > 0) {
        loadCurrentImg();
        updateNavButtons();
    } else {
        showEmptyState();
    }

    // 绑定事件
    bindEvents();
}

// 从GitHub API获取图片列表（无手动干预）
async function fetchPhotoList() {
    try {
        const res = await fetch(CONFIG.GITHUB_REPO_API);

        // 处理API速率限制
        if (res.status === 403) {
            const resetTime = new Date(res.headers.get("X-RateLimit-Reset") * 1000).toLocaleString();
            throw new Error(`GitHub API请求受限，将于${resetTime}重置，请稍后再试`);
        }
        if (!res.ok) throw new Error(`API请求失败 [${res.status}]`);

        const data = await res.json();
        // 筛选图片并生成Raw地址
        photoList = data.filter(item => {
            if (item.type !== "file") return false;
            const ext = item.name.split(".").pop().toLowerCase();
            return CONFIG.IMG_EXTS.includes(ext);
        }).map(item => CONFIG.RAW_BASE_URL + item.name);

    } catch (err) {
        console.error("[打印界面] 获取图片列表失败：", err);
        alert(`[打印界面] 加载图片失败：${err.message}`);
    }
}

// 加载当前图片 - 新增 Raw 地址填充
function loadCurrentImg() {
    if (!el.printImg || !el.imgWidth || !el.imgHeight || photoList.length === 0) return;

    const imgUrl = photoList[currentIndex];
    // 图片加载处理
    el.printImg.onload = () => {
        el.printImg.style.display = "block";
        console.log(`[打印界面] 加载图片${currentIndex + 1}/${photoList.length}`);
    };
    el.printImg.onerror = () => {
        el.printImg.src = CONFIG.ERROR_IMG;
        el.printImg.style.display = "block";
    };

    // 设置图片属性
    el.printImg.src = imgUrl;
    el.printImg.style.width = `${el.imgWidth.value}px`;
    el.printImg.style.height = `${el.imgHeight.value}px`;

    // 新增：自动填充当前图片的 Raw 地址到输入框
    if (el.rawUrl) {
        el.rawUrl.value = imgUrl;
    }
}

// 更新导航按钮状态
function updateNavButtons() {
    if (el.prevImg) el.prevImg.disabled = currentIndex === 0;
    if (el.nextImg) el.nextImg.disabled = currentIndex === photoList.length - 1;
}

// 应用打印配置
function applyConfig() {
    if (!el.printTitle || !el.printContent || !el.printDate || !el.showTitle || !el.showDate || !el.showContent) {
        alert("[打印界面] 配置项缺失，请检查页面元素");
        return;
    }

    // 校验必填项
    const title = el.printTitle.value.trim();
    const content = el.printContent.value.trim();
    const date = el.printDate.value;
    if (!title || !content || !date) {
        alert("标题、描述、拍摄日期为必填项！");
        return;
    }

    // 更新预览内容
    el.showTitle.textContent = title;
    el.showDate.textContent = `拍摄日期：${date}`;
    el.showContent.textContent = content;

    // 更新图片尺寸
    if (el.printImg && el.imgWidth && el.imgHeight) {
        el.printImg.style.width = `${el.imgWidth.value}px`;
        el.printImg.style.height = `${el.imgHeight.value}px`;
    }
}

// 显示无图片状态
function showEmptyState() {
    if (el.printImg) {
        el.printImg.src = CONFIG.ERROR_IMG;
        el.printImg.style.display = "block";
    }
    if (el.showTitle) el.showTitle.textContent = "暂无图片";
    if (el.showContent) el.showContent.textContent = "未从GitHub仓库获取到图片列表";
    // 空状态下清空 Raw 地址输入框
    if (el.rawUrl) el.rawUrl.value = "";
}

// 绑定事件 - 新增复制 Raw 地址功能
function bindEvents() {
    // 应用配置
    if (el.applyConfig) {
        el.applyConfig.addEventListener("click", applyConfig);
    }

    // 触发打印
    if (el.printBtn) {
        el.printBtn.addEventListener("click", () => window.print());
    }

    // 上一张图片
    if (el.prevImg) {
        el.prevImg.addEventListener("click", () => {
            if (currentIndex > 0) {
                currentIndex--;
                loadCurrentImg();
                updateNavButtons();
            }
        });
    }

    // 下一张图片
    if (el.nextImg) {
        el.nextImg.addEventListener("click", () => {
            if (currentIndex < photoList.length - 1) {
                currentIndex++;
                loadCurrentImg();
                updateNavButtons();
            }
        });
    }

    // 新增：复制 Raw 地址到剪贴板
    if (el.copyLink && el.rawUrl) {
        el.copyLink.addEventListener("click", () => {
            // 校验地址是否有效
            if (!el.rawUrl.value || el.rawUrl.value.trim() === "") {
                alert("暂无有效图片 Raw 地址可复制");
                return;
            }
            // 选中并复制
            el.rawUrl.select();
            document.execCommand("copy");
            alert("Raw 地址复制成功！可直接在 preview.html 中使用");
        });
    }
}

// 页面加载后初始化
window.addEventListener("DOMContentLoaded", initPrintPage);
