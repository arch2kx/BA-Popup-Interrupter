chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== "play-sound-offscreen") return;

    const audio = new Audio(message.sound);
    audio.play().catch(() => {});
});
