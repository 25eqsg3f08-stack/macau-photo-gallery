// 等待页面加载完成后执行
window.addEventListener("DOMContentLoaded", () => {
    // 1. 获取 URL 中的图片参数
    const urlParams = new URLSearchParams(window.location.search);
    const imgUrl = decodeURIComponent(urlParams.get("imgUrl") || "");
    const imgName = decodeURIComponent(urlParams.get("imgName") || "澳门内港照片");

    // 2. 获取页面 DOM 元素
    const elements = {
        previewImg: document.getElementById("preview-img"),
        title: document.getElementById("title"),
        sender: document.getElementById("sender"),
        receiver: document.getElementById("receiver"),
        content: document.getElementById("content"),
        cancelBtn: document.getElementById("cancel"),
        sendBtn: document.getElementById("send")
    };

    // 3. 初始化页面内容
    function initPage() {
        // 填充图片预览
        if (imgUrl) {
            elements.previewImg.src = imgUrl;
            elements.previewImg.alt = imgName;
        }
        // 设置默认邮件标题和内容
        elements.title.value = `分享：${imgName}`;
        elements.content.value = `为你分享一张澳门内港的照片：\n${imgUrl}`;
    }

    // 4. 绑定按钮事件
    function bindEvents() {
        // 取消按钮：修复window.close()报错，返回上一页/主界面
        elements.cancelBtn.addEventListener("click", () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = "./index.html";
            }
        });

        // 发送按钮：唤起系统邮件客户端
        elements.sendBtn.addEventListener("click", () => {
            const receiver = elements.receiver.value.trim();
            const title = encodeURIComponent(elements.title.value.trim());
            const sender = encodeURIComponent(elements.sender.value.trim());
            const content = encodeURIComponent(elements.content.value.trim());

            // 校验收件人邮箱
            if (!receiver || !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(receiver)) {
                alert("请输入有效的收件人邮箱！");
                elements.receiver.focus();
                return;
            }

            // 拼接 mailto 链接并跳转
            const mailtoLink = `mailto:${receiver}?subject=${title}&from=${sender}&body=${content}`;
            window.location.href = mailtoLink;
            alert("已唤起邮件客户端，确认后即可发送！");
        });
    }

    // 执行初始化
    initPage();
    bindEvents();
});