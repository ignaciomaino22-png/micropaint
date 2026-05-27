import { MapPoint } from '../types';

/**
 * Resizes and compresses an uploaded image file using an offscreen canvas.
 * Stores as a lightweight JPEG base64 string (max 350x350) for fast real-time synchronization.
 */
export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxCanvasDim = 350;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxCanvasDim) {
            height = Math.round((height * maxCanvasDim) / width);
            width = maxCanvasDim;
          }
        } else {
          if (height > maxCanvasDim) {
            width = Math.round((width * maxCanvasDim) / height);
            height = maxCanvasDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas 2D context'));
          return;
        }

        // Draw and compress
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Converts coordinates from original viewport to normalized 0-1000000 coordinate space.
 */
export function normalizePoint(x: number, y: number, width: number, height: number): MapPoint {
  return {
    x: Math.round((x / width) * 1000000),
    y: Math.round((y / height) * 1000000)
  };
}

/**
 * Converts a normalized coordinate (0-1000000) back to actual pixel layout size.
 */
export function denormalizePoint(point: MapPoint, width: number, height: number): MapPoint {
  return {
    x: (point.x / 1000000) * width,
    y: (point.y / 1000000) * height
  };
}

/**
 * Serializes a list of MapPoint objects into a single string.
 */
export function serializePoints(points: MapPoint[]): string {
  return points.map(p => `${p.x},${p.y}`).join(';');
}

/**
 * Deserializes a string back to a list of MapPoint objects.
 */
export function deserializePoints(pointsStr: string): MapPoint[] {
  if (!pointsStr) return [];
  return pointsStr.split(';').map(part => {
    const [x, y] = part.split(',');
    return {
      x: parseInt(x, 10),
      y: parseInt(y, 10)
    };
  }).filter(p => !isNaN(p.x) && !isNaN(p.y));
}
