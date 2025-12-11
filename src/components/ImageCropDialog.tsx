// src/components/ImageCropDialog.tsx
'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui';
import { useCallback, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';

type Area = { x: number; y: number; width: number; height: number };

export default function ImageCropDialog({
  open,
  onOpenChange,
  image,
  aspect = 1,
  onCropped,
  title = 'Adjust image',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  image: string | null;
  aspect?: number;
  onCropped: (blob: Blob) => void;
  title?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [area, setArea] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: any, a: any) => setArea(a), []);
  const imgEl = useMemo(() => {
    if (!image) return null;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = image;
    return img;
  }, [image]);

  const doCrop = useCallback(async () => {
    // --- НАЧАЛО ИЗМЕНЕНИЙ (ЛОГИРОВАНИЕ) ---
    console.log('--- doCrop triggered ---');
    if (!imgEl || !area) {
      console.error('Missing image element or crop area.');
      return;
    }
    console.log('Cropping with area:', area);
    // --- КОНЕЦ ИЗМЕНЕНИЙ (ЛОГИРОВАНИЕ) ---

    await new Promise((r) =>
      imgEl.complete ? r(null) : (imgEl.onload = () => r(null))
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(area.width);
    canvas.height = Math.round(area.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
      imgEl,
      Math.round(area.x),
      Math.round(area.y),
      Math.round(area.width),
      Math.round(area.height),
      0,
      0,
      Math.round(area.width),
      Math.round(area.height)
    );
    canvas.toBlob(
      (b) => {
        // --- НАЧАЛО ИЗМЕНЕНИЙ (ЛОГИРОВАНИЕ) ---
        console.log('--- canvas.toBlob callback ---');
        if (b) {
          console.log('Blob created successfully:', b);
          onCropped(b);
        } else {
          console.error('Failed to create blob from canvas.');
        }
        // --- КОНЕЦ ИЗМЕНЕНИЙ (ЛОГИРОВАНИЕ) ---
        onOpenChange(false);
      },
      'image/jpeg',
      0.92
    );
  }, [imgEl, area, onCropped, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[520px]'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className='relative h-72 rounded-md overflow-hidden bg-muted'>
          {image && (
            <Cropper
              image={image}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              restrictPosition
            />
          )}
        </div>
        <input
          type='range'
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className='w-full'
        />
        <DialogFooter>
          <Button onClick={doCrop}>{'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
