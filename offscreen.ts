// Clamp defensively: .volume throws a RangeError outside 0..1, and this
// value crosses a message boundary.
function clampVolume(volume: unknown): number {
    return typeof volume === "number" ? Math.min(1, Math.max(0, volume)) : 1;
}

// play() rejects when the clip can't be loaded (dead link, unsupported
// format), which is what triggers onFail.
function play(sound: string, volume: unknown, onFail?: () => void): void {
    const audio = new Audio(sound);
    audio.volume = clampVolume(volume);
    audio.play().catch(() => onFail?.());
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== "play-sound-offscreen") return;

    play(message.sound, message.volume, () => {
        if (message.fallback) play(message.fallback.sound, message.fallback.volume);
    });
});
