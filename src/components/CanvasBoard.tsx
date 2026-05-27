import React, { useRef, useState, useEffect } from 'react';
import { useFirebase } from '../context/FirebaseContext';
import { MapPoint } from '../types';
import { compressImage } from '../utils/canvasHelpers';
import { 
  Image as ImageIcon, 
  Sparkles, 
  Upload, 
  RotateCcw, 
  AlertTriangle, 
  ShieldCheck,
  Hand,
  Paintbrush,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Compass,
  ArrowUpRight,
  MousePointerClick
} from 'lucide-react';

export const CanvasBoard: React.FC = () => {
  const { user, drawings, createDrawing, isBanned } = useFirebase();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [dimensions, setDimensions] = useState({ width: 600, height: 450 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<MapPoint[]>([]); // Saved in VIRTUAL coordinates (0 - 1,000,000)
  
  // Navigation & Viewport State on the 1,000,000 × 1,000,000 space
  const [panX, setPanX] = useState<number>(0); // virtual coordinate of screen top-left corner
  const [panY, setPanY] = useState<number>(0); // virtual coordinate of screen top-left corner
  const [zoom, setZoom] = useState<number>(1.0); // zoom scale factor, support going up to 250,000x
  const [activeTool, setActiveTool] = useState<'paint' | 'pan'>('paint');

  // Panning drag tracking state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [initialPanOffset, setInitialPanOffset] = useState({ x: 0, y: 0 });

  // Real-time hover coordinate tracking under cursor
  const [hoverVirtualPt, setHoverVirtualPt] = useState<MapPoint | null>(null);

  // User's active paint source image
  const [userImage, setUserImage] = useState<string>(''); 
  const [isCompressing, setIsCompressing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Image load cache ref to avoid loading base64 images continuously on every tick
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});
  
  // Create a default decorative gradient image if the user hasn't uploaded one
  useEffect(() => {
    const createDefaultBrush = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Create an elegant cosmic/rainbow circular gradient
        const grad = ctx.createRadialGradient(200, 200, 50, 200, 200, 200);
        grad.addColorStop(0, '#f43f5e'); // rose-500
        grad.addColorStop(0.3, '#d946ef'); // fuchsia-500
        grad.addColorStop(0.6, '#3b82f6'); // blue-500
        grad.addColorStop(1, '#10b981'); // emerald-500
        
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 400, 400);

        // Add some beautiful playful star shapes
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 15; i++) {
          const x = Math.random() * 400;
          const y = Math.random() * 400;
          const radius = Math.random() * 8 + 4;
          
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        setUserImage(canvas.toDataURL('image/jpeg', 0.8));
      }
    };
    createDefaultBrush();
  }, []);

  // Responsive design with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;

    let resizeTimer: NodeJS.Timeout;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        
        // Debounce resize ticks to maintain high rendering speed
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const computedWidth = Math.max(300, width);
          const computedHeight = Math.max(550, Math.min(950, width * 0.85));
          setDimensions({ width: computedWidth, height: computedHeight });
        }, 100);
      }
    });

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      clearTimeout(resizeTimer);
    };
  }, []);

  // Keyboard navigation controls for WASD / Arrow Keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing inside input elements
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Step translation size adapts to zoom level to make navigation fluid
      const step = Math.max(1, Math.round(80000 / zoom)); 
      
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          setPanX(prev => Math.max(-200000, Math.min(1200000, prev - step)));
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          setPanX(prev => Math.max(-200000, Math.min(1200000, prev + step)));
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          setPanY(prev => Math.max(-200000, Math.min(1200000, prev - step)));
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          setPanY(prev => Math.max(-200000, Math.min(1200000, prev + step)));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoom]);

  // ----------------------------------------------------
  // Coordinate Conversions (Viewport aware mapping)
  // ----------------------------------------------------
  
  // Convert virtual coordinates (0 - 1,000,000) into actual screen canvas layout pixels list
  const toScreen = (vx: number, vy: number): MapPoint => {
    return {
      x: ((vx - panX) / (1000000 / zoom)) * dimensions.width,
      y: ((vy - panY) / (1000000 / zoom)) * dimensions.height
    };
  };

  // Convert screen pixels into virtual map coordinates (0 - 1,000,000) bounded strictly
  const toVirtual = (sx: number, sy: number): MapPoint => {
    const vx = Math.round(panX + (sx / dimensions.width) * (1000000 / zoom));
    const vy = Math.round(panY + (sy / dimensions.height) * (1000000 / zoom));
    return {
      x: Math.max(0, Math.min(1000000, vx)),
      y: Math.max(0, Math.min(1000000, vy))
    };
  };

  // Bulletproof mouse wheel zoom listener config to bypass browser passive restrictions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleCanvasWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Mousewheel delta factor
      const factor = e.deltaY < 0 ? 1.3 : 0.75;
      
      const rect = canvas.getBoundingClientRect();
      const mouseXScreen = e.clientX - rect.left;
      const mouseYScreen = e.clientY - rect.top;
      
      const mouseVirtBefore = toVirtual(mouseXScreen, mouseYScreen);
      
      const newZoom = Math.max(1.0, Math.min(250000.0, zoom * factor));
      setZoom(newZoom);
      
      const newWidth = 1000000 / newZoom;
      const newHeight = 1000000 / newZoom;
      
      const newPanX = mouseVirtBefore.x - (mouseXScreen / dimensions.width) * newWidth;
      const newPanY = mouseVirtBefore.y - (mouseYScreen / dimensions.height) * newHeight;
      
      setPanX(Math.max(-200000, Math.min(1200000, newPanX)));
      setPanY(Math.max(-200000, Math.min(1200000, newPanY)));
    };

    canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleCanvasWheel);
  }, [zoom, dimensions, panX, panY]);

  // Deserialization helper
  const deserializePoints = (pointsStr: string): MapPoint[] => {
    if (!pointsStr) return [];
    return pointsStr.split(';').map(part => {
      const [x, y] = part.split(',');
      return {
        x: parseInt(x, 10),
        y: parseInt(y, 10)
      };
    }).filter(p => !isNaN(p.x) && !isNaN(p.y));
  };

  // Get active cell/pixel grid interval size for snapping and sizing
  const getVirtualGridInterval = (z: number): number => {
    if (z >= 100000) return 2;
    if (z >= 40000) return 5;
    if (z >= 15000) return 10;
    if (z >= 5000) return 50;
    if (z >= 1500) return 100;
    if (z >= 450) return 500;
    if (z >= 150) return 1000;
    if (z >= 45) return 5000;
    if (z >= 15) return 10000;
    if (z >= 4) return 25000;
    return 10000;
  };

  // Serialize points helper
  const serializePoints = (points: MapPoint[]): string => {
    return points.map(p => `${p.x},${p.y}`).join(';');
  };

  // Force-repaint the whole canvas whenever drawings, viewport state, dimensional values, or strokes change
  useEffect(() => {
    drawCanvas();
  }, [drawings, currentStroke, dimensions, panX, panY, zoom, hoverVirtualPt]);

  // Master rendering engine
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Paint offboard bounds in elegant layout gray (Working stage outer zone)
    ctx.fillStyle = '#f4f4f7';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // 2. Compute visual canvas bounding box on screen
    const topLeft = toScreen(0, 0);
    const bottomRight = toScreen(1000000, 1000000);
    const canvasW = bottomRight.x - topLeft.x;
    const canvasH = bottomRight.y - topLeft.y;

    // 3. Paint the active virtual canvas paper area as solid white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(topLeft.x, topLeft.y, canvasW, canvasH);

    // Clip all core paint contents so nothing spills outside the 1,000,000² virtual board bounds
    ctx.save();
    ctx.beginPath();
    ctx.rect(topLeft.x, topLeft.y, canvasW, canvasH);
    ctx.clip();

    // 4. Compute Grid Line Intervals based dynamically on the zoom level
    let minorInterval = 100000;
    let majorInterval = 100000;

    if (zoom >= 100000) {
      minorInterval = 2;
      majorInterval = 10;
    } else if (zoom >= 40000) {
      minorInterval = 5;
      majorInterval = 25;
    } else if (zoom >= 15000) {
      minorInterval = 10;
      majorInterval = 50;
    } else if (zoom >= 5000) {
      minorInterval = 50;
      majorInterval = 250;
    } else if (zoom >= 1500) {
      minorInterval = 100;
      majorInterval = 500;
    } else if (zoom >= 450) {
      minorInterval = 500;
      majorInterval = 2500;
    } else if (zoom >= 150) {
      minorInterval = 1000;
      majorInterval = 5000;
    } else if (zoom >= 45) {
      minorInterval = 5000;
      majorInterval = 25000;
    } else if (zoom >= 15) {
      minorInterval = 10000;
      majorInterval = 50000;
    } else if (zoom >= 4) {
      minorInterval = 25000;
      majorInterval = 100000;
    } else {
      minorInterval = 10000; // 100x100 resolution of squares at 1x zoom
      majorInterval = 100000; // 10x10 main sectors
    }

    const virtualGridInterval = minorInterval; // Brush Snapping aligns to minor grid squares

    // A. Draw Minor Grid Lines (Very soft slate)
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
    ctx.lineWidth = 0.5;

    const startMinorVX = Math.floor(panX / minorInterval) * minorInterval;
    const endMinorVX = panX + (1000000 / zoom);
    for (let vx = startMinorVX; vx <= endMinorVX; vx += minorInterval) {
      if (vx >= 0 && vx <= 1000000) {
        const sx = ((vx - panX) / (1000005 / zoom)) * dimensions.width;
        ctx.beginPath();
        ctx.moveTo(sx, topLeft.y);
        ctx.lineTo(sx, bottomRight.y);
        ctx.stroke();
      }
    }

    const startMinorVY = Math.floor(panY / minorInterval) * minorInterval;
    const endMinorVY = panY + (1000000 / zoom);
    for (let vy = startMinorVY; vy <= endMinorVY; vy += minorInterval) {
      if (vy >= 0 && vy <= 1000000) {
        const sy = ((vy - panY) / (1000005 / zoom)) * dimensions.height;
        ctx.beginPath();
        ctx.moveTo(topLeft.x, sy);
        ctx.lineTo(bottomRight.x, sy);
        ctx.stroke();
      }
    }

    // B. Draw Major Grid Lines (Slightly more defined slate guidelines)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 1;

    const startMajorVX = Math.floor(panX / majorInterval) * majorInterval;
    const endMajorVX = panX + (1000000 / zoom);
    for (let vx = startMajorVX; vx <= endMajorVX; vx += majorInterval) {
      if (vx >= 0 && vx <= 1000000) {
        const sx = ((vx - panX) / (1000005 / zoom)) * dimensions.width;
        ctx.beginPath();
        ctx.moveTo(sx, topLeft.y);
        ctx.lineTo(sx, bottomRight.y);
        ctx.stroke();
      }
    }

    const startMajorVY = Math.floor(panY / majorInterval) * majorInterval;
    const endMajorVY = panY + (1000000 / zoom);
    for (let vy = startMajorVY; vy <= endMajorVY; vy += majorInterval) {
      if (vy >= 0 && vy <= 1000000) {
        const sy = ((vy - panY) / (1000005 / zoom)) * dimensions.height;
        ctx.beginPath();
        ctx.moveTo(topLeft.x, sy);
        ctx.lineTo(bottomRight.x, sy);
        ctx.stroke();
      }
    }

    // Coordinate Numbers Markers (rendered when zoomed in sufficiently to avoid visual overlapping clutter)
    if (zoom >= 300) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '9px monospace';
      
      // Horizontal coordinate texts
      for (let vx = startMinorVX; vx <= endMinorVX; vx += virtualGridInterval) {
        if (vx >= 0 && vx <= 1000000) {
          const sx = ((vx - panX) / (1000000 / zoom)) * dimensions.width;
          ctx.save();
          ctx.translate(sx + 3, topLeft.y + 12);
          ctx.fillText(`X:${vx}`, 0, 0);
          ctx.restore();
        }
      }

      // Vertical coordinate texts
      for (let vy = startMinorVY; vy <= endMinorVY; vy += virtualGridInterval) {
        if (vy >= 0 && vy <= 1000000) {
          const sy = ((vy - panY) / (1000000 / zoom)) * dimensions.height;
          ctx.save();
          ctx.translate(topLeft.x + 4, sy - 3);
          ctx.fillText(`Y:${vy}`, 0, 0);
          ctx.restore();
        }
      }
    }

    // 5. Render each completed drawing from the database with clipper logic
    drawings.forEach((drawing) => {
      const points = deserializePoints(drawing.pointsText);
      if (points.length < 2) return;

      const imgUrl = drawing.imageUrl;
      let cachedImg = imageCacheRef.current[imgUrl];

      // If drawing image isn't loaded/cached yet, load it, cache it, and trigger repaint
      if (!cachedImg) {
        const tempImg = new Image();
        tempImg.src = imgUrl;
        tempImg.onload = () => {
          imageCacheRef.current[imgUrl] = tempImg;
          drawCanvas(); // force draw once loaded
        };
        // Render simple placeholder while image prepares
        ctx.save();
        ctx.beginPath();
        const firstPt = toScreen(points[0].x, points[0].y);
        ctx.moveTo(firstPt.x, firstPt.y);
        for (let i = 1; i < points.length; i++) {
          const pt = toScreen(points[i].x, points[i].y);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.fillStyle = '#eff6ff';
        ctx.fill();
        ctx.strokeStyle = '#93c5fd';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        return;
      }

      // Render Clipped Image on the active user drawings (scaled to the bounding box of the polygon)
      ctx.save();
      ctx.beginPath();
      const startPt = toScreen(points[0].x, points[0].y);
      ctx.moveTo(startPt.x, startPt.y);

      let minX = points[0].x;
      let maxX = points[0].x;
      let minY = points[0].y;
      let maxY = points[0].y;

      for (let i = 1; i < points.length; i++) {
        const pt = toScreen(points[i].x, points[i].y);
        ctx.lineTo(pt.x, pt.y);

        if (points[i].x < minX) minX = points[i].x;
        if (points[i].x > maxX) maxX = points[i].x;
        if (points[i].y < minY) minY = points[i].y;
        if (points[i].y > maxY) maxY = points[i].y;
      }
      ctx.closePath();
      
      // Perform masking clip
      ctx.clip();

      // Convert virtual endpoints of the cell bounding box to screen space
      const boxStart = toScreen(minX, minY);
      const boxEnd = toScreen(maxX, maxY);
      const boxW = boxEnd.x - boxStart.x;
      const boxH = boxEnd.y - boxStart.y;

      // Draw active image perfectly within the cell bounding box
      ctx.drawImage(cachedImg, boxStart.x, boxStart.y, boxW, boxH);
      ctx.restore();

      // Add elegant border to make overlaps look highly refined
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(startPt.x, startPt.y);
      for (let i = 1; i < points.length; i++) {
        const pt = toScreen(points[i].x, points[i].y);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Write user authors on the corners of their revealment
      const labelPt = toScreen(points[0].x, points[0].y);
      ctx.font = '8px monospace';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      const authorText = `👤 ${drawing.userName}`;
      const textWidth = ctx.measureText(authorText).width;
      ctx.fillRect(labelPt.x - 3, labelPt.y - 12, textWidth + 8, 14);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(authorText, labelPt.x + 1, labelPt.y - 2);
      ctx.restore();
    });

    // 6. Snapping Hover cellular cursor preview (only draws for scale > 150)
    if (hoverVirtualPt && zoom >= 150 && !isDrawing) {
      ctx.save();
      // Snap cursor coordinates to dynamic grid block values
      const snappedX = Math.floor(hoverVirtualPt.x / virtualGridInterval) * virtualGridInterval;
      const snappedY = Math.floor(hoverVirtualPt.y / virtualGridInterval) * virtualGridInterval;

      const screenCellTopLeft = toScreen(snappedX, snappedY);
      const screenCellBottomRight = toScreen(snappedX + virtualGridInterval, snappedY + virtualGridInterval);
      
      const colW = screenCellBottomRight.x - screenCellTopLeft.x;
      const colH = screenCellBottomRight.y - screenCellTopLeft.y;

      // Draw faint image preview inside cell if user has a paint image selected
      let cachedUserImg = imageCacheRef.current[userImage];
      if (userImage && !cachedUserImg) {
        const tempImg = new Image();
        tempImg.src = userImage;
        tempImg.onload = () => {
          imageCacheRef.current[userImage] = tempImg;
          drawCanvas();
        };
      }

      if (cachedUserImg) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.drawImage(cachedUserImg, screenCellTopLeft.x, screenCellTopLeft.y, colW, colH);
        ctx.restore();
      } else {
        // Soft purple grid highlighting under brush target
        ctx.fillStyle = 'rgba(79, 70, 229, 0.22)';
        ctx.fillRect(screenCellTopLeft.x, screenCellTopLeft.y, colW, colH);
      }
      
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 2;
      ctx.strokeRect(screenCellTopLeft.x, screenCellTopLeft.y, colW, colH);

      // Draw coordinates flag under the cell cursor
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#4f46e5';
      ctx.fillText(`Celda: [${snappedX}, ${snappedY}]`, screenCellTopLeft.x + 4, screenCellTopLeft.y - 4);
      ctx.restore();
    }

    // 7. Render Active user drawing stroke path (converted on the fly to layout layout pixels)
    if (currentStroke.length > 0) {
      ctx.save();
      ctx.beginPath();
      const firstActivePt = toScreen(currentStroke[0].x, currentStroke[0].y);
      ctx.moveTo(firstActivePt.x, firstActivePt.y);
      for (let i = 1; i < currentStroke.length; i++) {
        const pt = toScreen(currentStroke[i].x, currentStroke[i].y);
        ctx.lineTo(pt.x, pt.y);
      }
      
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]); // dashed loop
      ctx.stroke();
      
      // Paint closed polygon blueprint (live preview of the canvas image tile being painted)
      if (currentStroke.length > 2) {
        ctx.save();
        ctx.lineTo(firstActivePt.x, firstActivePt.y);
        ctx.closePath();
        ctx.clip();

        // Find bound box of current active stroke
        let minX = currentStroke[0].x;
        let maxX = currentStroke[0].x;
        let minY = currentStroke[0].y;
        let maxY = currentStroke[0].y;
        for (let i = 1; i < currentStroke.length; i++) {
          if (currentStroke[i].x < minX) minX = currentStroke[i].x;
          if (currentStroke[i].x > maxX) maxX = currentStroke[i].x;
          if (currentStroke[i].y < minY) minY = currentStroke[i].y;
          if (currentStroke[i].y > maxY) maxY = currentStroke[i].y;
        }

        const boxStart = toScreen(minX, minY);
        const boxEnd = toScreen(maxX, maxY);
        const boxW = boxEnd.x - boxStart.x;
        const boxH = boxEnd.y - boxStart.y;

        let cachedUserImg = imageCacheRef.current[userImage];
        if (cachedUserImg) {
          ctx.globalAlpha = 0.75;
          ctx.drawImage(cachedUserImg, boxStart.x, boxStart.y, boxW, boxH);
        } else {
          ctx.fillStyle = 'rgba(79, 70, 229, 0.22)';
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    }

    ctx.restore(); // restore raw viewport clip boundary

    // 8. Render thick high-contrast outline border around virtual paper bounds
    ctx.save();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(topLeft.x, topLeft.y, canvasW, canvasH);
    ctx.restore();
  };

  // Coordinates solver from client events
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>): MapPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  // Start Drawing
  const handleStartDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!user) {
      setErrorMsg('Para poder pintar en el lienzo cooperativo, por favor conéctate con Google o ingresa como Invitado.');
      return;
    }
    if (isBanned) return;
    setErrorMsg('');

    // Require high zoom level to paint (e.g. >= 150)
    const MIN_ZOOM_TO_PAINT = 150;
    if (zoom < MIN_ZOOM_TO_PAINT) {
      setErrorMsg('⚠️ Por favor haz más zoom para poder pintar (mínimo nivel de zoom requerido: 150x). De esta forma pintarás con precisión celda por celda.');
      return;
    }

    const coords = getCoordinates(e);
    if (!coords) return;

    setIsDrawing(true);
    const virtualPt = toVirtual(coords.x, coords.y);
    
    // Snap to exactly a single grid square cell (de a un cuadrado pequeño)
    const interval = getVirtualGridInterval(zoom);
    const snappedX = Math.floor(virtualPt.x / interval) * interval;
    const snappedY = Math.floor(virtualPt.y / interval) * interval;

    const p1 = { x: snappedX, y: snappedY };
    const p2 = { x: snappedX + interval, y: snappedY };
    const p3 = { x: snappedX + interval, y: snappedY + interval };
    const p4 = { x: snappedX, y: snappedY + interval };

    // Set active stroke as the 4 corner points.
    setCurrentStroke([p1, p2, p3, p4]);
  };

  // Drawing mouse moves
  const handleDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isBanned) return;
    const coords = getCoordinates(e);
    if (!coords) return;

    // Restrict drawing to exactly one single hovered cell square at a time.
    // If they move their finger/mouse, we shift the single target square to the newly hovered cell
    // to make the brush feel highly responsive and aligned. Only that 1 cell is submitted on release.
    const virtualPt = toVirtual(coords.x, coords.y);
    const interval = getVirtualGridInterval(zoom);
    const snappedX = Math.floor(virtualPt.x / interval) * interval;
    const snappedY = Math.floor(virtualPt.y / interval) * interval;

    const p1 = { x: snappedX, y: snappedY };
    const p2 = { x: snappedX + interval, y: snappedY };
    const p3 = { x: snappedX + interval, y: snappedY + interval };
    const p4 = { x: snappedX, y: snappedY + interval };

    setCurrentStroke([p1, p2, p3, p4]);
  };

  // Save trace
  const handleStopDraw = async () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (currentStroke.length < 4) {
      setCurrentStroke([]);
      return;
    }

    if (isBanned) {
      setErrorMsg('No puedes dibujar porque tu cuenta ha sido baneada.');
      setCurrentStroke([]);
      return;
    }

    try {
      // Direct auto-connect perimeter outline
      const completeStroke = [...currentStroke, currentStroke[0]];
      const pointsText = serializePoints(completeStroke);
      const uniqueDrawingId = `draw_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // Save drawing directly to Firestore
      await createDrawing({
        id: uniqueDrawingId,
        pointsText,
        imageUrl: userImage,
        clientWidth: dimensions.width,
        clientHeight: dimensions.height
      });
    } catch (e: any) {
      console.error(e);
      setErrorMsg('Inconveniente al registrar dibujo en Firebase. Comprueba conexión.');
    } finally {
      setCurrentStroke([]);
    }
  };

  // Navigation handlers
  const handleStartPan = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    setIsPanning(true);
    setPanStart({ x: clientX, y: clientY });
    setInitialPanOffset({ x: panX, y: panY });
  };

  const handlePanning = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isPanning) return;
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const deltaXScreen = clientX - panStart.x;
    const deltaYScreen = clientY - panStart.y;

    // Convert pixel speed offsets using active viewport zoom factor
    const virtualDeltaX = (deltaXScreen / dimensions.width) * (1000000 / zoom);
    const virtualDeltaY = (deltaYScreen / dimensions.height) * (1000000 / zoom);

    // Stay and track around space boundaries
    setPanX(Math.max(-200000, Math.min(1200000, initialPanOffset.x - virtualDeltaX)));
    setPanY(Math.max(-200000, Math.min(1200000, initialPanOffset.y - virtualDeltaY)));
  };

  const handleStopPan = () => {
    setIsPanning(false);
  };

  // Route incoming mice and touch actions depending on tools
  const handlePointerDown = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const isRightClick = e.nativeEvent instanceof MouseEvent && (e.nativeEvent as MouseEvent).button === 2;
    const isMiddleClick = e.nativeEvent instanceof MouseEvent && (e.nativeEvent as MouseEvent).button === 1;
    const isShiftPressed = e.shiftKey;
    
    if (activeTool === 'pan' || isRightClick || isMiddleClick || isShiftPressed) {
      handleStartPan(e);
    } else {
      handleStartDraw(e);
    }
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCoordinates(e);
    if (coords) {
      const virt = toVirtual(coords.x, coords.y);
      setHoverVirtualPt(virt);
    }

    if (activeTool === 'pan' || isPanning) {
      handlePanning(e);
    } else {
      handleDrawing(e);
    }
  };

  const handlePointerUpOrLeave = () => {
    setHoverVirtualPt(null);
    if (isPanning) {
      handleStopPan();
    } else {
      handleStopDraw();
    }
  };

  // Manual zoom buttons center conservation
  const handleZoomChange = (factor: number) => {
    const currentCenterX = panX + (1000000 / zoom) / 2;
    const currentCenterY = panY + (1000000 / zoom) / 2;

    const newZoom = Math.max(1.0, Math.min(250000.0, zoom * factor));
    const newWidth = 1000000 / newZoom;
    const newHeight = 1000000 / newZoom;

    setZoom(newZoom);
    setPanX(Math.max(-200000, Math.min(1200000, currentCenterX - newWidth / 2)));
    setPanY(Math.max(-200000, Math.min(1200000, currentCenterY - newHeight / 2)));
  };

  const handleResetView = () => {
    setZoom(1.0);
    setPanX(0);
    setPanY(0);
  };

  // Image optimizations
  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor selecciona un archivo de imagen válido (PNG, JPEG, WEBP).');
      return;
    }
    
    setIsCompressing(true);
    setErrorMsg('');
    try {
      const compressedString = await compressImage(file);
      setUserImage(compressedString);
    } catch (err) {
      console.error(err);
      setErrorMsg('Error al optimizar tu archivo de imagen. Elige otra.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div id="canvas-game-container" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
      {/* LEFT BOARD VIEW (Bento Card 1) */}
      <div className="lg:col-span-8 flex flex-col w-full bg-white rounded-3xl border border-zinc-200 p-5 md:p-6 shadow-sm">
        
        {/* Navigation Toolbar & Branding Bento Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-zinc-100">
          <div>
            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Mesa de Trabajo Infinita</span>
            <h2 id="board-title" className="text-xl font-black tracking-tight text-zinc-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
              MicroPaint virtual 1,000,000²
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Pinta de a un <strong className="text-indigo-650 font-semibold">cuadrado pequeño</strong> por click con un zoom mínimo de <strong className="text-indigo-650 font-semibold">150x</strong> en un lienzo compartido de 1,000,000 × 1,000,000. Usa la <strong className="text-zinc-700">Rueda del Mouse</strong> para hacer zoom o arrastra con la herramienta <strong className="text-zinc-700">Desplazar</strong>.
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-zinc-50 border border-zinc-200 text-zinc-650">
              {drawings.length} Revelados Activos
            </span>
          </div>
        </div>

        {/* INTERACTIVE CONTROLS BAR */}
        <div className="flex flex-col gap-3 mb-4 bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
          
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Tool Selector: Paint or Pan */}
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-zinc-250/50 shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveTool('paint')}
                title="Herramienta de Pintura"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTool === 'paint'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-650 hover:bg-zinc-100'
                }`}
              >
                <Paintbrush className="w-3.5 h-3.5" />
                <span>Pintar</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTool('pan')}
                title="Herramienta de Navegación/Movimiento"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTool === 'pan'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-650 hover:bg-zinc-100'
                }`}
              >
                <Hand className="w-3.5 h-3.5" />
                <span>Desplazar</span>
              </button>
            </div>

            {/* D-PAD DIRECTIONAL SCROLLER FOR THE 1,000,000x1,000,000 CODES */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-zinc-250/50 shadow-2xs">
              <span className="text-[10px] font-bold text-zinc-400 px-1 select-none font-mono">Cruceta:</span>
              <button
                type="button"
                onClick={() => {
                  const step = Math.max(10, Math.round((1000000 / zoom) * 0.25));
                  setPanX(prev => Math.max(0, prev - step));
                }}
                className="w-6 h-6 flex items-center justify-center text-xs hover:bg-zinc-100 text-zinc-650 hover:text-indigo-600 rounded bg-zinc-50 border border-zinc-200"
                title="Mover Izquierda (Oeste)"
              >
                ◀
              </button>
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const step = Math.max(10, Math.round((1000000 / zoom) * 0.25));
                    setPanY(prev => Math.max(0, prev - step));
                  }}
                  className="w-6 h-4 flex items-center justify-center text-[10px] hover:bg-zinc-100 text-zinc-650 hover:text-indigo-600 rounded bg-zinc-50 border border-zinc-200"
                  title="Mover Arriba (Norte)"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const step = Math.max(10, Math.round((1000000 / zoom) * 0.25));
                    setPanY(prev => Math.max(0, Math.min(1000000 - 1000000 / zoom, prev + step)));
                  }}
                  className="w-6 h-4 flex items-center justify-center text-[10px] hover:bg-zinc-100 text-zinc-650 hover:text-indigo-600 rounded bg-zinc-50 border border-zinc-200"
                  title="Mover Abajo (Sur)"
                >
                  ▼
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const step = Math.max(10, Math.round((1000000 / zoom) * 0.25));
                  setPanX(prev => Math.max(0, Math.min(1000000 - 1000000 / zoom, prev + step)));
                }}
                className="w-6 h-6 flex items-center justify-center text-xs hover:bg-zinc-100 text-zinc-650 hover:text-indigo-600 rounded bg-zinc-50 border border-zinc-200"
                title="Mover Derecha (Este)"
              >
                ▶
              </button>
            </div>

            {/* Coordinate teleporter */}
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const targetX = parseInt(formData.get('teleport-x') as string, 10);
              const targetY = parseInt(formData.get('teleport-y') as string, 10);
              if (!isNaN(targetX) && !isNaN(targetY)) {
                const boundedX = Math.max(0, Math.min(1000000, targetX));
                const boundedY = Math.max(0, Math.min(1000000, targetY));
                
                // Zoom in highly to target coordinates
                const targetZoom = Math.max(zoom, 1200);
                const newWidth = 1000000 / targetZoom;
                const newHeight = 1000000 / targetZoom;
                
                setZoom(targetZoom);
                setPanX(Math.max(0, Math.min(1000000 - newWidth, boundedX - newWidth / 2)));
                setPanY(Math.max(0, Math.min(1000000 - newHeight, boundedY - newHeight / 2)));
              }
            }} className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-zinc-250/50 shadow-2xs">
              <span className="text-[10px] font-bold text-zinc-400 pl-1">Ir a:</span>
              <input
                name="teleport-x"
                type="number"
                placeholder="X"
                min="0"
                max="1000000"
                defaultValue="500000"
                className="w-14 px-1 py-0.5 text-[10px] font-mono font-bold bg-zinc-50 border border-zinc-200 rounded focus:border-indigo-500 focus:outline-hidden"
              />
              <input
                name="teleport-y"
                type="number"
                placeholder="Y"
                min="0"
                max="1000000"
                defaultValue="500000"
                className="w-14 px-1 py-0.5 text-[10px] font-mono font-bold bg-zinc-50 border border-zinc-200 rounded focus:border-indigo-500 focus:outline-hidden"
              />
              <button
                type="submit"
                className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-[10px] font-bold transition flex items-center gap-1"
              >
                <ArrowUpRight className="w-2.5 h-2.5" />
                <span>Ir</span>
              </button>
            </form>

            {/* Zoom controls & Reset View */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-zinc-250/50 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleZoomChange(0.6)}
                  disabled={zoom <= 1.0}
                  title="Alejar (Zoom Out)"
                  className="p-1.5 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 rounded-lg transition-colors disabled:opacity-40"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                
                <span className="text-[10px] font-mono font-extrabold text-zinc-700 px-1.5 min-w-[58px] text-center">
                  {zoom >= 1000 ? `${(zoom / 1000).toFixed(1)}k` : zoom.toFixed(1)}x
                </span>

                <button
                  type="button"
                  onClick={() => handleZoomChange(1.6)}
                  disabled={zoom >= 250000.0}
                  title="Acercar (Zoom In)"
                  className="p-1.5 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 rounded-lg transition-colors"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleResetView}
                title="Pantalla Completa"
                className="flex items-center gap-1 text-[10px] text-zinc-650 hover:text-indigo-600 hover:bg-white border border-transparent hover:border-zinc-200 py-2 px-2.5 rounded-xl transition-all font-bold"
              >
                <Maximize2 className="w-3 h-3" />
                <span>100%</span>
              </button>
            </div>
          </div>

          {/* Quick Zoom Presets level switcher */}
          <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-zinc-200/50">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-zinc-400 mr-2 flex items-center gap-1">
              <MousePointerClick className="w-2.5 h-2.5" /> Niveles de Zoom:
            </span>
            {[
              { label: 'Completo 1x', val: 1 },
              { label: 'Cercano 10x', val: 10 },
              { label: 'Detallado 100x', val: 100 },
              { label: 'Micro 1,000x', val: 1000 },
              { label: 'Nano 10,000x', val: 10000 },
              { label: 'Celda Ultra 100,000x', val: 100000 },
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  const currentCenterX = panX + (1000000 / zoom) / 2;
                  const currentCenterY = panY + (1000000 / zoom) / 2;
                  
                  const newZoom = preset.val;
                  const newWidth = 1000000 / newZoom;
                  const newHeight = 1000000 / newZoom;
                  
                  setZoom(newZoom);
                  setPanX(Math.max(0, Math.min(1000000 - newWidth, currentCenterX - newWidth / 2)));
                  setPanY(Math.max(0, Math.min(1000000 - newHeight, currentCenterY - newHeight / 2)));
                }}
                className={`px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold border transition-all ${
                  Math.abs(zoom - preset.val) < (preset.val * 0.1)
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

        </div>

        {/* ERROR MESSAGES CONTAINER */}
        {errorMsg && (
          <div id="board-error-msg" className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs py-2 px-3 rounded-xl flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* CANVAS WORKSPACE PORTAL & NAVIGATION TRACKS */}
        <div id="canvas-scroll-system" className="flex flex-col md:flex-row gap-4 w-full h-full xl:items-stretch">
          
          {/* Mainboard + Horizontal slider wrapper */}
          <div className="flex-1 flex flex-col gap-3">
            <div 
              ref={containerRef}
              className="relative w-full overflow-hidden rounded-2xl border border-zinc-300 select-none bg-zinc-100 min-h-[550px] shadow-sm flex items-center justify-center"
              onContextMenu={(e) => e.preventDefault()}
            >
              <canvas
                id="collaborative-canvas"
                ref={canvasRef}
                width={dimensions.width}
                height={dimensions.height}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUpOrLeave}
                onMouseLeave={handlePointerUpOrLeave}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUpOrLeave}
                className={`block w-full max-w-full ${
                  activeTool === 'pan' 
                    ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') 
                    : 'cursor-crosshair'
                }`}
              />

              {/* DYNAMIC RADAR WIDGET (INTERACTIVE CLICABLE MAP NAVIGATOR) */}
              <div 
                title="¡Haz clic en cualquier celda para teletransportarte de inmediato!"
                className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-md rounded-xl p-2.5 border border-zinc-250/70 shadow-md select-none flex flex-col gap-1 items-center hover:border-indigo-500 hover:shadow-indigo-50 transition-all cursor-pointer pointer-events-auto"
                onClick={(e) => {
                  const radarInner = e.currentTarget.querySelector('.radar-inner-canvas');
                  if (!radarInner) return;
                  const rect = radarInner.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const clickY = e.clientY - rect.top;
                  
                  const percentX = Math.max(0, Math.min(1, clickX / rect.width));
                  const percentY = Math.max(0, Math.min(1, clickY / rect.height));

                  const targetX = percentX * 1000000;
                  const targetY = percentY * 1000000;

                  const viewportWidth = 1000000 / zoom;
                  const viewportHeight = 1000000 / zoom;

                  setPanX(Math.max(0, Math.min(1000000 - viewportWidth, targetX - viewportWidth / 2)));
                  setPanY(Math.max(0, Math.min(1000000 - viewportHeight, targetY - viewportHeight / 2)));
                }}
              >
                <span className="text-[8px] font-extrabold text-indigo-600 uppercase tracking-widest block mb-0.5">MINI RADAR</span>
                <div className="radar-inner-canvas relative w-16 h-16 bg-zinc-200/60 rounded border border-zinc-350 overflow-hidden">
                  {/* Virtual sheet representing 0 - 1,000,000 */}
                  <div 
                    className="absolute bg-white border border-zinc-400 font-bold"
                    style={{
                      left: 0,
                      top: 0,
                      width: '100%',
                      height: '100%'
                    }}
                  />
                  {/* Viewport Red box locator indicating active offset and sizing */}
                  <div 
                    className="absolute border-1.5 border-rose-500 bg-rose-500/10 transition-all rounded-xs"
                    style={{
                      left: `${Math.max(0, Math.min(100, (panX / 1000000) * 100))}%`,
                      top: `${Math.max(0, Math.min(100, (panY / 1000000) * 100))}%`,
                      width: `${Math.max(8, Math.min(100, (1 / zoom) * 100))}%`,
                      height: `${Math.max(8, Math.min(100, (1 / zoom) * 100))}%`
                    }}
                  />
                </div>
                <div className="text-[8px] font-mono font-bold text-zinc-600 mt-1 text-center leading-tight">
                  <div>X: {Math.max(0, Math.round(panX)).toLocaleString()}</div>
                  <div>Y: {Math.max(0, Math.round(panY)).toLocaleString()}</div>
                </div>
              </div>
            </div>

            {/* HORIZONTAL POSITION SLIDER (X AXIS) */}
            <div className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 p-2.5 rounded-2xl shadow-2xs">
              <div className="flex flex-col shrink-0">
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 font-mono select-none">Desplazar X (Este-Oeste)</span>
                <span className="text-[10px] text-zinc-600 font-bold font-mono">
                  {Math.round(panX).toLocaleString()}px
                </span>
              </div>
              <input
                type="range"
                min="0"
                max={Math.max(1, 1000000 - Math.round(1000000 / zoom))}
                value={Math.round(panX)}
                disabled={zoom <= 1.0}
                onChange={(e) => {
                  setPanX(Math.max(0, Math.min(1000000 - 1000000 / zoom, Number(e.target.value))));
                }}
                className="flex-1 h-3 rounded-lg appearance-none cursor-pointer accent-indigo-650 bg-zinc-200 disabled:opacity-40"
              />
              <span className="text-[9px] font-mono text-zinc-400 font-bold select-none shrink-0">1,000,000 Max</span>
            </div>
          </div>

          {/* VERTICAL POSITION SLIDER (Y AXIS) */}
          <div className="w-full md:w-auto shrink-0 flex md:flex-col items-center justify-between p-3 bg-zinc-50 border border-zinc-200 rounded-2xl gap-3 shadow-2xs">
            <div className="flex md:flex-col items-center gap-2 md:gap-1 font-mono text-center shrink-0">
              <span className="text-[9px] font-extrabold uppercase tracking-widest text-zinc-400 select-none whitespace-nowrap [writing-mode:vertical-lr] md:rotate-180">
                Desplazar Y (Norte-Sur)
              </span>
              <span className="text-[10px] text-zinc-650 font-black tracking-tight block">
                {Math.round(panY).toLocaleString()}
              </span>
            </div>
            
            <input
              type="range"
              min="0"
              max={Math.max(1, 1000000 - Math.round(1000000 / zoom))}
              value={Math.max(0, Math.round(1000000 - panY - 1000000 / zoom))}
              disabled={zoom <= 1.0}
              onChange={(e) => {
                const sliderVal = Number(e.target.value);
                const computedPanY = 1000000 - sliderVal - 1000000 / zoom;
                setPanY(Math.max(0, Math.min(1000000 - 1000000 / zoom, computedPanY)));
              }}
              style={{
                writingMode: 'vertical-lr',
                direction: 'rtl',
                appearance: 'slider-vertical' as any,
                WebkitAppearance: 'slider-vertical' as any
              } as React.CSSProperties}
              className="w-10 h-32 md:h-72 accent-indigo-650 cursor-pointer disabled:opacity-40"
            />
            <span className="text-[9px] font-mono text-zinc-400 font-bold select-none shrink-0">Y-Offset</span>
          </div>
          
          {isBanned && (
            <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center text-white">
              <AlertTriangle className="w-12 h-12 text-rose-500 mb-2 animate-bounce" />
              <h3 className="font-bold text-lg">Cuenta Penalizada</h3>
              <p className="text-xs text-zinc-400 max-w-sm mt-1">
                Tu perfil de usuario está baneado y no tienes permisos para dibujar en el lienzo. Contacta al moderador principal.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-3 gap-2 text-zinc-500 text-[10px] font-mono">
          <span className="flex items-center gap-1 text-zinc-600 font-semibold">
            <Compass className="w-3.5 h-3.5 text-indigo-500" />
            Coordenadas del visor: [X: {Math.max(0, Math.round(panX)).toLocaleString()} .. {Math.max(0, Math.round(panX + 1000000/zoom)).toLocaleString()}] [Y: {Math.max(0, Math.round(panY)).toLocaleString()} .. {Math.max(0, Math.round(panY + 1000000/zoom)).toLocaleString()}]
          </span>
          <span className="text-[9px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded border border-zinc-200">
            Navega usando teclado: <kbd className="font-bold bg-white px-1 border border-zinc-300 rounded">W A S D</kbd> o <kbd className="font-bold bg-white px-1 border border-zinc-300 rounded">Flechas de dirección</kbd>
          </span>
        </div>
      </div>

      {/* RIGHT SIDE PANEL (Bento Card 2): PALETTE / IMAGE SELECTION */}
      <div className="w-full lg:col-span-4 flex flex-col gap-6">
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-sm flex flex-col gap-5">
          <div>
            <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mb-1">Máscara de Textura</span>
            <h3 className="font-bold text-zinc-900 text-sm tracking-tight flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-zinc-500" />
              Tu Imagen Activa
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Esta imagen es la que se pintará dentro de las formas que dibujes sobre el lienzo.
            </p>
          </div>

          {/* ACTIVE IMAGE PREVIEW CONTAINER */}
          <div className="relative aspect-square w-full bg-zinc-50 rounded-2xl overflow-hidden border border-zinc-200 flex items-center justify-center">
            {userImage ? (
              <img 
                src={userImage} 
                alt="Your Reveal Brush Source" 
                className="w-full h-full object-cover transition-all"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="text-center p-4">
                <p className="text-xs text-zinc-400 font-medium">Optimizando imagen...</p>
              </div>
            )}
            
            {isCompressing && (
              <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center text-white text-xs font-semibold">
                Sincronizando pincel...
              </div>
            )}
          </div>

          {/* DRAG AND DROP ZONE */}
          <div 
            id="image-dropzone"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
              dragActive 
                ? 'border-indigo-500 bg-indigo-50/50' 
                : 'border-zinc-200 hover:border-indigo-400 hover:bg-zinc-50/20'
            }`}
          >
            <input 
              id="file-upload-input"
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleFileChange}
            />
            <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center justify-center gap-2">
              <Upload className="w-6 h-6 text-indigo-600" />
              <div>
                <span className="text-xs font-bold text-indigo-600 hover:text-indigo-500 block">Sube una imagen</span>
                <p className="text-[10px] text-zinc-400 mt-1">o arrástrala aquí (PNG, JPG, WEBP)</p>
              </div>
            </label>
          </div>

          {/* RESET TO COLOR PATTERN BUTTON */}
          <button
            type="button"
            onClick={() => {
              const canvas = document.createElement('canvas');
              canvas.width = 400;
              canvas.height = 400;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                const grad = ctx.createRadialGradient(200, 200, 50, 200, 200, 200);
                grad.addColorStop(0, '#f43f5e');
                grad.addColorStop(0.3, '#d946ef');
                grad.addColorStop(0.6, '#3b82f6');
                grad.addColorStop(1, '#10b981');
                
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 400, 400);

                ctx.fillStyle = '#ffffff';
                for (let i = 0; i < 15; i++) {
                  ctx.beginPath();
                  ctx.arc(Math.random() * 400, Math.random() * 400, Math.random() * 8 + 4, 0, Math.PI * 2);
                  ctx.fill();
                }
                setUserImage(canvas.toDataURL('image/jpeg', 0.8));
              }
            }}
            className="text-xs text-zinc-650 hover:text-indigo-600 flex items-center justify-center gap-1.5 py-2.5 border border-zinc-200 rounded-xl transition-colors font-bold hover:bg-zinc-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar pincel Cósmico
          </button>
        </div>

        {/* SECURE GAME FEEDBACK CARD (Bento Card 3 - dark contrast label) */}
        <div className="bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-3xl p-5 flex flex-col gap-3 shadow-md">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-bold tracking-widest uppercase text-zinc-100 font-mono">Modo Seguro Activo</h4>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
            Las imágenes cargadas se optimizan para garantizar un óptimo rendimiento en vivo. Se respetan las reglas de moderación; los contenidos inapropiados serán retirados de forma instantánea por el administrador.
          </p>
        </div>
      </div>
    </div>
  );
};
