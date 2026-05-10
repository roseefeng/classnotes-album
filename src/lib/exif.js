import exifr from 'exifr';

export async function readPhotoMeta(file) {
  const result = {
    id: 'ph_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    name: file.name,
    size: file.size,
    type: file.type,
    takenAt: null,
    dataUrl: null,
    source: 'import',
  };

  try {
    const exif = await exifr.parse(file, { gps: true });
    if (exif) {
      const t = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate;
      if (t) result.takenAt = new Date(t).toISOString();
    }
  } catch (e) {}

  if (!result.takenAt && file.lastModified) {
    result.takenAt = new Date(file.lastModified).toISOString();
  }

  result.dataUrl = await fileToDataUrl(file, 800);
  return result;
}

export function fileToDataUrl(file, maxSize = 800) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch {
          resolve(reader.result);
        }
      };
      img.onerror = () => resolve(reader.result);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
