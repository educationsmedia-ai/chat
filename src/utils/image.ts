/**
 * Image compression utility using HTML5 Canvas.
 * Compresses camera/gallery images into lightweight WebP/JPEG data URLs
 * for instant real-time synchronization in Firestore.
 */

export async function compressImage(
  file: File,
  maxDimension = 960,
  quality = 0.75
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gagal memproses format gambar.'));
      img.onload = () => {
        try {
          let { width, height } = img;

          // Scale down proportionally if larger than maxDimension
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Canvas 2D context tidak tersedia.');
          }

          // Draw image
          ctx.drawImage(img, 0, 0, width, height);

          // Export as JPEG or WebP
          let resultDataUrl = canvas.toDataURL('image/jpeg', quality);

          // If still slightly over 250KB, reduce quality one step
          if (resultDataUrl.length > 250000) {
            resultDataUrl = canvas.toDataURL('image/jpeg', 0.6);
          }

          resolve(resultDataUrl);
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
