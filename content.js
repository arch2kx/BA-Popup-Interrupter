"use strict";
// Body is IIFE-scoped and flag-guarded so the background's injection fallback
// can safely re-run this file in a tab that already has it.
(() => {
    if (window.__baPopupInterrupterReady)
        return;
    window.__baPopupInterrupterReady = true;
    const IMG_CLASS = "ba-popup-interrupter-img";
    const IN_CLASS = "ba-popup-interrupter-in";
    const OUT_CLASS = "ba-popup-interrupter-out";
    const OUT_TIME = 140;
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
        img.className = IMG_CLASS;
        img.src = image;
        img.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: contain;
        `;
        img.addEventListener("load", () => {
            img.classList.add(IN_CLASS);
        });
        box.appendChild(img);
        document.body.appendChild(box);
        let removed = false;
        const remove = () => {
            if (removed)
                return;
            removed = true;
            box.remove();
        };
        setTimeout(() => {
            img.classList.remove(IN_CLASS);
            img.classList.add(OUT_CLASS);
            img.addEventListener("animationend", remove, { once: true });
            setTimeout(remove, OUT_TIME + 100);
        }, Math.max(0, duration - OUT_TIME));
    }
    chrome.runtime.onMessage.addListener((message) => {
        if (message?.type !== "show-popup")
            return;
        showPopup(message.image, message.duration, message.size);
    });
})();
//# sourceMappingURL=content.js.map