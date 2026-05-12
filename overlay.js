// Read the image URL that background.js passed in the query string.
const params = new URLSearchParams(window.location.search);
const imageUrl = params.get("image");

const img = document.getElementById("character");
img.src = imageUrl;

// Fade in once the image has loaded so there is no flash of empty space.
img.addEventListener("load", () => {
    requestAnimationFrame(() => img.classList.add("visible"));
});

// Close the window after 3 seconds.
setTimeout(() => window.close(), 3000);
