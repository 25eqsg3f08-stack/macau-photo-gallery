// 目标仓库配置（无需修改其他地方）
const TARGET_REPO = {
    user: "25eqsg3f08-stack",
    repo: "Rua_de_macau_Photos",
    branch: "main"
};

// 拼接仓库 API 地址和图片 raw 基础地址
const REPO_API_URL = `https://api.github.com/repos/${TARGET_REPO.user}/${TARGET_REPO.repo}/contents/`;
const RAW_BASE_URL = `https://raw.githubusercontent.com/${TARGET_REPO.user}/${TARGET_REPO.repo}/${TARGET_REPO.branch}`;

// 全局变量
let imageRawUrlList = []; // 动态获取的图片 raw 地址列表
let currentImgIndex = 0;

// DOM 元素
const currentImage = document.getElementById("current-image");
const imageName = document.getElementById("image-name");
const pageInfo = document.getElementById("page-info");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const cacheCountInput = document.getElementById("cache-count");
const cacheBtn = document.getElementById("cache-btn");
const clearImgCacheBtn = document.getElementById("clear-img-cache-btn");
const cacheStatus = document.getElementById("cache-status");
const cacheSize = document.getElementById("cache-size");

// 初始化：从目标仓库动态获取图片列表（无配置文件）
async function initRepoImageList() {
    try {
        cacheStatus.textContent = "缓存状态: 正在请求目标仓库图片列表...";
        
        // 调用 GitHub API 获取仓库根目录文件
        const response = await fetch(REPO_API_URL);
        if (!response.ok) {
            throw new Error(`仓库请求失败 (${response.status}) → 检查仓库是否公开/API是否限流`);
        }

        const files = await response.json();
        // 筛选：仅保留根目录的图片文件（排除文件夹/非图片）
        const imageFiles = files.filter(file => {
            return !file.type && /\.(jpg|jpeg|png|webp)$/i.test(file.name);
        });

        // 生成图片 raw 地址列表
        imageRawUrlList = imageFiles.map(file => `${RAW_BASE_URL}/${file.name}`);

        if (imageRawUrlList.length === 0) {
            throw new Error("目标仓库根目录无图片文件");
        }

        // 加载第一张图片
        await loadCurrentImage();
        updateButtonStatus();
        updatePageInfo();
        updateImageCacheSize();
        cacheStatus.textContent = `缓存状态: 成功识别 ${imageRawUrlList.length} 张图片`;
    } catch (error) {
        cacheStatus.textContent = `初始化失败: ${error.message}`;
        console.error("初始化失败:", error);
    }
}

// 加载当前索引图片（优先缓存）
async function loadCurrentImage() {
    const rawUrl = imageRawUrlList[currentImgIndex];
    const fileName = rawUrl.split("/").pop();

    try {
        // 1. 优先从图片缓存读取
        const cachedImgUrl = await getCachedImage(rawUrl);
        if (cachedImgUrl) {
            currentImage.src = cachedImgUrl;
            imageName.textContent = `图片: ${fileName}（已缓存）`;
            cacheStatus.textContent = `缓存状态: 已命中本地缓存（${fileName}）`;
            return;
        }

        // 2. 无缓存则从 raw 地址加载
        currentImage.src = rawUrl;
        currentImage.onload = () => {
            imageName.textContent = `图片: ${fileName}（云端加载）`;
            cacheStatus.textContent = `缓存状态: 云端加载成功（${fileName}）`;
        };
        currentImage.onerror = () => {
            throw new Error(`图片加载失败 → 检查 raw 地址是否有效`);
        };
    } catch (error) {
        currentImage.src = "https://via.placeholder.com/1200x600?text=加载失败";
        imageName.textContent = `加载失败: ${fileName}`;
        cacheStatus.textContent = `缓存状态: ${error.message}`;
    }
}

// 更新页码信息
function updatePageInfo() {
    pageInfo.textContent = `${currentImgIndex + 1}/${imageRawUrlList.length}`;
}

// 更新翻页按钮状态
function updateButtonStatus() {
    prevBtn.disabled = currentImgIndex === 0;
    nextBtn.disabled = currentImgIndex === imageRawUrlList.length - 1;
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

// 核心功能：缓存指定数量的图片
async function cacheSpecifiedImages() {
    const cacheCount = parseInt(cacheCountInput.value);
    // 校验输入
    if (isNaN(cacheCount) || cacheCount < 1 || cacheCount > 500) {
        cacheStatus.textContent = "缓存状态: 请输入1-500之间的有效数字";
        return;
    }
    // 实际缓存数量不超过仓库图片总数
    const actualCacheCount = Math.min(cacheCount, imageRawUrlList.length);

    cacheStatus.textContent = `缓存状态: 正在缓存 ${actualCacheCount} 张图片...`;
    cacheBtn.disabled = true;
    let successCount = 0;

    try {
        // 从当前页开始，向后缓存指定数量
        for (let i = currentImgIndex; i < currentImgIndex + actualCacheCount; i++) {
            // 处理索引越界
            const targetIndex = i % imageRawUrlList.length;
            const rawUrl = imageRawUrlList[targetIndex];
            
            // 先下载图片为 Blob
            const response = await fetch(rawUrl);
            if (!response.ok) continue;
            const blob = await response.blob();
            
            // 缓存到 IndexedDB
            await cacheSingleImage(rawUrl, blob);
            successCount++;
        }

        cacheStatus.textContent = `缓存状态: 成功缓存 ${successCount}/${actualCacheCount} 张图片`;
        updateImageCacheSize();
    } catch (error) {
        cacheStatus.textContent = `缓存状态: 缓存失败 → ${error.message}`;
    } finally {
        cacheBtn.disabled = false;
    }
}

// 更新图片缓存大小显示
async function updateImageCacheSize() {
    try {
        const sizeData = await calculateImageCacheSize();
        cacheSize.textContent = `当前图片缓存大小: ${sizeData.sizeMB}MB (${sizeData.sizeGB}GB)`;
    } catch (error) {
        cacheSize.textContent = `当前图片缓存大小: 计算失败 → ${error.message}`;
    }
}

// 仅清除图片缓存（保留网页）
async function clearOnlyImagesCache() {
    if (!confirm("确定仅清除图片缓存？网页功能不受影响，离线时已缓存图片将无法访问")) return;
    
    try {
        await clearOnlyImageCache();
        cacheStatus.textContent = "缓存状态: 仅图片缓存已清除，网页正常运行";
        updateImageCacheSize();
    } catch (error) {
        cacheStatus.textContent = `缓存状态: 清除失败 → ${error.message}`;
    }
}

// 事件绑定
prevBtn.addEventListener("click", prevImage);
nextBtn.addEventListener("click", nextImage);
cacheBtn.addEventListener("click", cacheSpecifiedImages);
clearImgCacheBtn.addEventListener("click", clearOnlyImagesCache);

// 页面加载时初始化
window.addEventListener("DOMContentLoaded", initRepoImageList);
