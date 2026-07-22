/** Downscale + JPEG-compress a camera/library file for upload (keeps storage small). */
export function compressImageFile(file, { maxEdge = 1280, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//i.test(file.type || "")) {
      reject(new Error("Choose a photo"));
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not process photo"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Could not compress photo"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read that photo"));
    };
    img.src = objectUrl;
  });
}
