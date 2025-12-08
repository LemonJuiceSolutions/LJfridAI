
'use client';

import React, { useState, useRef, WheelEvent, MouseEvent, useLayoutEffect } from 'react';

interface PanZoomContainerProps {
  children: React.ReactNode;
  contentWidth: number;
  contentHeight: number;
  reset?: number; 
}

const PanZoomContainer: React.FC<PanZoomContainerProps> = ({ children, contentWidth, contentHeight, reset }) => {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [startPoint, setStartPoint] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomToFit = () => {
    if (!containerRef.current || !contentWidth || !contentHeight) return;

    const container = containerRef.current;
    const { width: containerWidth, height: containerHeight } = container.getBoundingClientRect();
    
    // Add some padding
    const padding = 50; 
    const effectiveContainerWidth = containerWidth - padding * 2;
    const effectiveContainerHeight = containerHeight - padding * 2;

    if (effectiveContainerWidth <= 0 || effectiveContainerHeight <= 0) return;

    const zoomX = effectiveContainerWidth / contentWidth;
    const zoomY = effectiveContainerHeight / contentHeight;
    const newZoom = Math.min(zoomX, zoomY, 1); // Do not zoom in more than 100%

    // Center the content
    const newX = (containerWidth - contentWidth * newZoom) / 2;
    const newY = (containerHeight - contentHeight * newZoom) / 2;

    setZoom(newZoom);
    setPan({ x: newX, y: newY });
  }

  // useLayoutEffect to prevent flickering
  useLayoutEffect(() => {
    zoomToFit();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth, contentHeight, reset]);


  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const zoomFactor = 1.1;

    //-ve deltaY is zoom in, +ve is zoom out
    const newZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
    
    const mouseX = e.clientX - rect.left; // mouse x position relative to container
    const mouseY = e.clientY - rect.top; // mouse y position relative to container

    // new pan so that mouse remains in the same position on the screen
    const newX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
    const newY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

    setZoom(newZoom);
    setPan({ x: newX, y: newY });
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsPanning(true);
    setStartPoint({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    if(containerRef.current) {
        containerRef.current.style.cursor = 'grabbing';
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    e.preventDefault();
    setPan({
      x: e.clientX - startPoint.x,
      y: e.clientY - startPoint.y,
    });
  };

  const handleMouseUpOrLeave = (e: MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    e.preventDefault();
    setIsPanning(false);
     if(containerRef.current) {
        containerRef.current.style.cursor = 'grab';
    }
  };

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
      className="w-full h-full bg-muted/30 overflow-hidden"
      style={{ cursor: 'grab' }}
    >
      <div
        className="w-full h-full"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PanZoomContainer;
