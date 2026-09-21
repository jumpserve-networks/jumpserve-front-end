"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";
import type { MapCamera, MapViewport } from "@/lib/aws-region-map";

export function useMapWheelPan(canvas: RefObject<HTMLDivElement | null>, viewport: MapViewport,
  move: (camera: MapCamera) => void, disabled = false) {
  const pan = useEffectEvent((event: WheelEvent) => {
    // Leave browser zoom / trackpad pinch gestures to the browser.
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const unitX = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.current!.clientWidth : 1;
    const unitY = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.current!.clientHeight : 1;
    const dx = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
    const dy = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
    move({ x: viewport.x + dx * unitX / viewport.scale, y: viewport.y + dy * unitY / viewport.scale, zoom: viewport.zoom });
  });
  useEffect(() => {
    const element = canvas.current;
    if (!element || disabled) return;
    element.addEventListener("wheel", pan, { passive: false });
    return () => element.removeEventListener("wheel", pan);
  }, [canvas, disabled]);
}
