"use strict";
function showPopup(image, duration, size) {
    const margin = 16;
    const maxX = Math.max(0, window.innerWidth - size - margin);
    const maxY = Math.max(0, window.innerHeight - size - margin);
    const x = Math.floor(Math.random() * maxX);
    const y = Math.floor(Math.random() * maxY);
    const box = document.createElement("div");
    box.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        width: ${size}px;
        height: ${size}px;
        z-index: 2147483647;
        pointer-events: none;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    const img = document.createElement("img");
    img.src = image;
    img.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: contain;
        opacity: 0;
        transition: opacity 120ms ease;
    `;
    img.addEventListener("load", () => {
        requestAnimationFrame(() => { img.style.opacity = "1"; });
    });
    box.appendChild(img);
    document.body.appendChild(box);
    const FADE_TIME = 120;
    setTimeout(() => {
        img.style.opacity = "0";
        setTimeout(() => {
            box.remove();
        }, FADE_TIME);
    }, Math.max(0, duration - FADE_TIME));
}
chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "show-popup")
        return;
    showPopup(message.image, message.duration, message.size);
});
//# sourceMappingURL=content.js.map