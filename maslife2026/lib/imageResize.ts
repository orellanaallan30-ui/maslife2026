// Redimensiona y comprime una imagen a un data URL JPEG. Evita guardar imágenes
// enormes en base64 dentro de las filas de Supabase (avatares, imágenes de
// servicio) que inflan la fila y ralentizan/rompen los guardados.
export function resizeImageDataUrl(file: File, maxPx = 300, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagen inválida'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > h) { if (w > maxPx) { h = Math.round(h * maxPx / w); w = maxPx; } }
        else { if (h > maxPx) { w = Math.round(w * maxPx / h); h = maxPx; } }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas no disponible')); return; }
        // Fondo blanco: evita el marco negro al convertir PNG/HEIC con transparencia a JPEG.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
