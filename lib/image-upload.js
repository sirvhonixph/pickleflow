const MAX_BYTES = 2 * 1024 * 1024;

export function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("Choose an image file."));
      return;
    }
    if (!file.type.startsWith("image/")) {
      reject(new Error("Proof must be an image (JPG, PNG, etc.)."));
      return;
    }
    if (file.size > MAX_BYTES) {
      reject(new Error("Image must be 2 MB or smaller."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}
