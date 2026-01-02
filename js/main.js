// 目标远程仓库配置（修改为你的目标仓库信息）
const TARGET_REPO = {
    user: "25eqsg3f08-stack",
    repo: "Rua_de_macau_Photos",
    branch: "main"
};

// 拼接 GitHub API 和 raw 地址（无需修改）
const REPO_API_URL = `https://api.github.com/repos/${TARGET_REPO.user}/${TARGET_REPO.repo}/contents/`;
const RAW_BASE_URL = `https://raw.githubusercontent.com/${TARGET_REPO.user}/${TARGET_REPO.repo}/${TARGET_REPO.branch}`;

// 全局变量
let imageRawUrlList = []; // 远程图片 raw 地址列表
let currentImgIndex = 0;

// DOM 元素获取（统一在DOM加载后执行）
let DOM_ELEMENTS = {
    currentImage: null,
    imageName: null,
    pageInfo: null,
    prevBtn: null,
    nextBtn: null,
    cacheCountInput: null,
    cacheBtn: null,
    clearImgCacheBtn: null,
    cacheStatus: null,
    cacheSize: null
};

// 递归获取仓库所有文件（包括子文件夹）
async function fetchAllRepoFiles(path = "") {
    try {
        const response = await fetch(`${REPO_API_URL}${path}`);
        // 处理 API 限流/403 错误
        if (response.status === 403) {
            throw new Error("GitHub API 限流（每小时60次），请1小时后重试或使用GitHub Token");
        }
        if (!response.ok) {
            throw new Error(`请求仓库文件失败 (${response.status})`);
        }

        const files = await response.json();
        let allFiles = [];

        for (const file of files) {
            if (file.type === "dir") {
                // 递归读取子文件夹
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

// 初始化：拉取远程仓库所有图片（包括子文件夹）
async function initRemoteRepoImageList() {
    // 先判断状态显示元素是否存在
    if (!DOM_ELEMENTS.cacheStatus) return;

    try {
        DOM_ELEMENTS.cacheStatus.textContent = "缓存状态: 正在拉取远程仓库图片列表（含子文件夹）...";
        
        // 获取仓库所有文件（递归遍历子文件夹）
        const allFiles = await fetchAllRepoFiles();
        
        // 筛选图片文件：支持更多格式，忽略大小写
        const imageFiles = allFiles.filter(file => {
            return /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file.name);
        });

        // 生成远程图片的 raw 地址列表
        imageRawUrlList = imageFiles.map(file => `${RAW_BASE_URL}/${file.path}`);

        if (imageRawUrlList.length === 0) {
            throw new Error("远程仓库（含子文件夹）无图片文件，请检查仓库内容或图片格式");
        }

        // 加载第一张图片
        await loadCurrentImage();
        updateButtonStatus();
        updatePageInfo();
        updateImageCacheSize();
        DOM_ELEMENTS.cacheStatus.textContent = `缓存状态: 成功拉取 ${imageRawUrlList.length} 张远程图片（含子文件夹）`;
    } catch (error) {
        DOM_ELEMENTS.cacheStatus.textContent = `初始化失败: ${error.message}`;
        console.error("初始化失败:", error);

        // 兜底方案：手动指定图片地址（若API获取失败，取消注释并填写实际地址）
        // imageRawUrlList = [
        //     "https://raw.githubusercontent.com/25eqsg3f08-stack/Rua_de_macau_Photos/main/xxx.jpg",
        //     "https://raw.githubusercontent.com/25eqsg3f08-stack/Rua_de_macau_Photos/main/folder/yyy.png"
        // ];
        // if (imageRawUrlList.length > 0) {
        //     loadCurrentImage();
        //     updateButtonStatus();
        //     updatePageInfo();
        //     DOM_ELEMENTS.cacheStatus.textContent = "使用手动指定的图片列表加载成功";
        // }
    }
}

// 加载当前图片（优先缓存）
async function loadCurrentImage() {
    if (imageRawUrlList.length === 0 || !DOM_ELEMENTS.currentImage || !DOM_ELEMENTS.imageName) return;

    const rawUrl = imageRawUrlList[currentImgIndex];
    const fileName = rawUrl.split("/").pop();

    try {
        // 1. 优先从 IndexedDB 缓存读取
        const cachedImgUrl = await getCachedImage(rawUrl);
        if (cachedImgUrl) {
            DOM_ELEMENTS.currentImage.src = cachedImgUrl;
            DOM_ELEMENTS.imageName.textContent = `图片: ${fileName}（已缓存）`;
            if (DOM_ELEMENTS.cacheStatus) {
                DOM_ELEMENTS.cacheStatus.textContent = `缓存状态: 命中本地缓存（${fileName}）`;
            }
            return;
        }

        // 2. 无缓存则直接加载远程 raw 图片
        DOM_ELEMENTS.currentImage.src = rawUrl;
        DOM_ELEMENTS.currentImage.onload = () => {
            DOM_ELEMENTS.imageName.textContent = `图片: ${fileName}（远程加载）`;
            if (DOM_ELEMENTS.cacheStatus) {
                DOM_ELEMENTS.cacheStatus.textContent = `缓存状态: 远程加载成功（${fileName}）`;
            }
        };
        DOM_ELEMENTS.currentImage.onerror = () => {
            throw new Error(`远程图片加载失败 → 检查: ${fileName} 的raw地址是否有效`);
        };
    } catch (error) {
        DOM_ELEMENTS.currentImage.src = "https://via.placeholder.com/1200x600?text=加载失败";
        DOM_ELEMENTS.imageName.textContent = `加载失败: ${fileName}`;
        if (DOM_ELEMENTS.cacheStatus) {
            DOM_ELEMENTS.cacheStatus.textContent = `缓存状态: ${error.message}`;
        }
    }
}

// 更新页码信息
function updatePageInfo() {
    if (!DOM_ELEMENTS.pageInfo) return;
    DOM_ELEMENTS.pageInfo.textContent = `${currentImgIndex + 1}/${imageRawUrlList.length}`;
}

// 更新翻页按钮状态
function updateButtonStatus() {
    if (DOM_ELEMENTS.prevBtn) {
        DOM_ELEMENTS.prevBtn.disabled = currentImgIndex === 0;
    }
    if (DOM_ELEMENTS.nextBtn) {
        DOM_ELEMENTS.nextBtn.disabled = currentImgIndex === imageRawUrlList.length - 1;
    }
}

// 上一页
async function prevImage() {
    if (currentImgIndex > 0) {
        currentImgIndex--;
        await loadCurrentImage();
        updatePageInfo();
        updateButtonStatus();
    }
}

// 下一页
async function nextImage() {
    if (currentImgIndex < imageRawUrlList.length - 1) {
        currentImgIndex++;
        await loadCurrentImage();
        updatePageInfo();
        updateButtonStatus();
    }
}

// 缓存指定数量的图片
async function cacheSpecifiedImages() {
    if (!DOM_ELEMENTS.cacheCountInput || !DOM_ELEMENTS.cacheStatus) return;

    const cacheCount = parseInt(DOM_ELEMENTS.cacheCountInput.value);
    // 校验输入
    if (isNaN(cacheCount) || cacheCount < 1 || cacheCount > 500) {
        DOM_ELEMENTS.cacheStatus.textContent = "缓存状态: 请输入1-500之间的有效数字";
        return;
    }
    // 实际缓存数量不超过仓库图片总数
    const actualCacheCount = Math.min(cacheCount, imageRawUrlList.length);

    DOM_ELEMENTS.cacheStatus.textContent = `缓存状态: 正在缓存 ${actualCacheCount} 张远程图片...`;
    if (DOM_ELEMENTS.cacheBtn) DOM_ELEMENTS.cacheBtn.disabled = true;
    let successCount = 0;

    try {
        // 从当前页开始，向后缓存指定数量
        for (let i = currentImgIndex; i < currentImgIndex + actualCacheCount; i++) {
            // 处理索引越界（循环缓存）
            const targetIndex = i % imageRawUrlList.length;
            const rawUrl = imageRawUrlList[targetIndex];
            
            // 下载图片为 Blob
            const response = await fetch(rawUrl);
            if (!response.ok) continue;
            const blob = await response.blob();
            
            // 缓存到 IndexedDB
            await cacheSingleImage(rawUrl, blob);
            successCount++;
        }

        DOM_ELEMENTS.cacheStatus.textContent = `缓存状态: 成功缓存 ${successCount}/${actualCacheCount} 张图片`;
        updateImageCacheSize();
    } catch (error) {
        DOM_ELEMENTS.cacheStatus.textContent = `缓存失败: ${error.message}`;
    } finally {
        if (DOM_ELEMENTS.cacheBtn) DOM_ELEMENTS.cacheBtn.disabled = false;
    }
}

// 更新图片缓存大小显示
async function updateImageCacheSize() {
    if (!DOM_ELEMENTS.cacheSize) return;
    try {
        const sizeData = await calculateImageCacheSize();
        DOM_ELEMENTS.cacheSize.textContent = `当前图片缓存大小: ${sizeData.sizeMB}MB (${sizeData.sizeGB}GB)`;
    } catch (error) {
        DOM_ELEMENTS.cacheSize.textContent = `缓存大小计算失败: ${error.message}`;
    }
}

// 仅清除图片缓存
async function clearOnlyImagesCache() {
    if (!DOM_ELEMENTS.cacheStatus) return;
    
    if (!confirm("确定仅清除图片缓存？网页功能不受影响，离线时已缓存图片将无法访问")) return;
    
    try {
        await clearOnlyImageCache();
        DOM_ELEMENTS.cacheStatus.textContent = "缓存状态: 仅图片缓存已清除，网页正常运行";
        updateImageCacheSize();
    } catch (error) {
        DOM_ELEMENTS.cacheStatus.textContent = `清除失败: ${error.message}`;
    }
}

// 初始化DOM元素+绑定事件（核心：全量存在性校验）
function initDOMAndEvents() {
    // 初始化DOM元素引用
    DOM_ELEMENTS.currentImage = document.getElementById("current-image");
    DOM_ELEMENTS.imageName = document.getElementById("image-name");
    DOM_ELEMENTS.pageInfo = document.getElementById("page-info");
    DOM_ELEMENTS.prevBtn = document.getElementById("prev-btn");
    DOM_ELEMENTS.nextBtn = document.getElementById("next-btn");
    DOM_ELEMENTS.cacheCountInput = document.getElementById("cache-count");
    DOM_ELEMENTS.cacheBtn = document.getElementById("cache-btn");
    DOM_ELEMENTS.clearImgCacheBtn = document.getElementById("clear-img-cache-btn");
    DOM_ELEMENTS.cacheStatus = document.getElementById("cache-status");
    DOM_ELEMENTS.cacheSize = document.getElementById("cache-size");

    // 绑定事件（仅当元素存在时）
    if (DOM_ELEMENTS.prevBtn) {
        DOM_ELEMENTS.prevBtn.addEventListener("click", prevImage);
    }
    if (DOM_ELEMENTS.nextBtn) {
        DOM_ELEMENTS.nextBtn.addEventListener("click", nextImage);
    }
    if (DOM_ELEMENTS.cacheBtn) {
        DOM_ELEMENTS.cacheBtn.addEventListener("click", cacheSpecifiedImages);
    }
    if (DOM_ELEMENTS.clearImgCacheBtn) {
        DOM_ELEMENTS.clearImgCacheBtn.addEventListener("click", clearOnlyImagesCache);
    }
}

// 页面入口：等待DOM加载完成后初始化
window.addEventListener("DOMContentLoaded", () => {
    initDOMAndEvents();
    initRemoteRepoImageList();
});
