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
    try {
        cacheStatus.textContent = "缓存状态: 正在拉取远程仓库图片列表（含子文件夹）...";
        
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
        cacheStatus.textContent = `缓存状态: 成功拉取 ${imageRawUrlList.length} 张远程图片（含子文件夹）`;
    } catch (error) {
        cacheStatus.textContent = `初始化失败: ${error.message}`;
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
        //     cacheStatus.textContent = "使用手动指定的图片列表加载成功";
        // }
    }
}

// 加载当前图片（优先缓存）
async function loadCurrentImage() {
    const rawUrl = imageRawUrlList[currentImgIndex];
    const fileName = rawUrl.split("/").pop();

    try {
        // 1. 优先从 IndexedDB 缓存读取
        const cachedImgUrl = await getCachedImage(rawUrl);
        if (cachedImgUrl) {
            currentImage.src = cachedImgUrl;
            imageName.textContent = `图片: ${fileName}（已缓存）`;
            cacheStatus.textContent = `缓存状态: 命中本地缓存（${fileName}）`;
            return;
        }

        // 2. 无缓存则直接加载远程 raw 图片
        currentImage.src = rawUrl;
        currentImage.onload = () => {
            imageName.textContent = `图片: ${fileName}（远程加载）`;
            cacheStatus.textContent = `缓存状态: 远程加载成功（${fileName}）`;
        };
        currentImage.onerror = () => {
            throw new Error(`远程图片加载失败 → 检查: ${fileName} 的raw地址是否有效`);
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

// 缓存指定数量的图片
async function cacheSpecifiedImages() {
    const cacheCount = parseInt(cacheCountInput.value);
    // 校验输入
    if (isNaN(cacheCount) || cacheCount < 1 || cacheCount > 500) {
        cacheStatus.textContent = "缓存状态: 请输入1-500的有效数字";
        return;
    }
    // 实际缓存数量不超过仓库图片总数
    const actualCacheCount = Math.min(cacheCount, imageRawUrlList.length);

    cacheStatus.textContent = `缓存状态: 正在缓存 ${actualCacheCount} 张远程图片...`;
    cacheBtn.disabled = true;
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

        cacheStatus.textContent = `缓存状态: 成功缓存 ${successCount}/${actualCacheCount} 张图片`;
        updateImageCacheSize();
    } catch (error) {
        cacheStatus.textContent = `缓存失败: ${error.message}`;
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
        cacheSize.textContent = `缓存大小计算失败: ${error.message}`;
    }
}

// 仅清除图片缓存
async function clearOnlyImagesCache() {
    if (!confirm("确定仅清除图片缓存？网页功能不受影响，离线时已缓存图片将无法访问")) return;
    
    try {
        await clearOnlyImageCache();
        cacheStatus.textContent = "缓存状态: 仅图片缓存已清除，网页正常运行";
        updateImageCacheSize();
    } catch (error) {
        cacheStatus.textContent = `清除失败: ${error.message}`;
    }
}

// 事件绑定
prevBtn.addEventListener("click", prevImage);
nextBtn.addEventListener("click", nextImage);
cacheBtn.addEventListener("click", cacheSpecifiedImages);
clearImgCacheBtn.addEventListener("click", clearOnlyImagesCache);

// 页面加载时初始化
window.addEventListener("DOMContentLoaded", initRemoteRepoImageList);
