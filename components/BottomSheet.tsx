"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

// While any sheet is open the page behind it must not scroll or rubber-band, otherwise a swipe on the sheet drags the whole screen.
let openSheets = 0;
function lockPage(on: boolean) {
  openSheets += on ? 1 : -1;
  document.documentElement.classList.toggle("sheet-open", openSheets > 0);
}

export function BottomSheet({ open, onClose, title, children, z = 50 }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; z?: number;
}) {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; t: number } | null>(null);

  // Keep the sheet in the tree during the closing animation.
  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => { setMounted(false); setDragY(0); }, 330);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    lockPage(true);
    return () => lockPage(false);
  }, [mounted]);

  if (!mounted) return null;

  // Only the grab area (handle and title row) drags the sheet; the content keeps its own scrolling.
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    start.current = { y: e.clientY, t: performance.now() };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (start.current) setDragY(Math.max(0, e.clientY - start.current.y));
  };
  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    start.current = null;
    setDragging(false);
    const dy = Math.max(0, e.clientY - s.y);
    const speed = dy / Math.max(1, performance.now() - s.t);
    if (dy > 110 || (dy > 30 && speed > 0.6)) onClose();
    else setDragY(0);
  };

  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex: z }}>
      <div className="absolute inset-0 touch-none bg-black transition-opacity duration-300" onClick={onClose}
        style={{ opacity: shown ? Math.max(0, 0.4 - dragY / 900) : 0 }} />
      <div role="dialog" aria-label={title}
        className="relative flex max-h-[92dvh] w-full max-w-[480px] flex-col rounded-t-3xl bg-[#f6f6f8] shadow-[0_-8px_40px_rgba(0,0,0,0.18)]"
        style={{
          transform: shown ? `translate3d(0, ${dragY}px, 0)` : "translate3d(0, 100%, 0)",
          transition: dragging ? "none" : "transform 330ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}>
        <div className="shrink-0 touch-none select-none px-4 pt-2 pb-1" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={finish} onPointerCancel={finish}>
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-black/15" />
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-[#111827]">{title}</span>
            <button className="grid size-9 place-items-center rounded-full bg-black/5 text-[#111827] active:bg-black/10" aria-label="Закрыть" onClick={onClose}><X className="size-5" /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">{children}</div>
      </div>
    </div>
  );
}
