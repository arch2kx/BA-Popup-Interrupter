const params   = new URLSearchParams(window.location.search);
const imageUrl = params.get("image");
const duration = Number(params.get("duration")) || 3000;

const img = document.getElementById("character");
img.src = imageUrl;

img.addEventListener("load", () => {
    requestAnimationFrame(() => img.classList.add("visible"));
});

setTimeout(() => window.close(), duration);
