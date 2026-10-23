/**
 * Shrink a phone photo before it goes to a model.
 *
 * Full-size camera photos were timing out OpenRouter and surfacing as a bare
 * Cloudflare 502. Menus need more detail than a plate does — you have to be
 * able to read dish names — so the cap is a parameter.
 */
export function downscaleImage(file, max = 768) {
  return new Promise((resolve) => {
    if (!file || typeof document === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72).split(",")[1] || null);
      } catch (e) {
        console.error("downscaleImage failed", e);
        resolve(null);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}
