import { Camera } from "./camera";

// Unified pointer input for mouse, touch and pen:
//  - one pointer drag  => pan
//  - wheel             => zoom at cursor
//  - two-pointer pinch => zoom + pan around the gesture midpoint
//  - mouse move        => hover (reported via onHover)

export interface InputCallbacks {
  onChange(): void; // camera moved -> request redraw
  onHover(sx: number, sy: number): void;
  onHoverEnd(): void;
  onTap(sx: number, sy: number): void; // click / tap without dragging
}

const TAP_MOVE_THRESHOLD = 6; // px of movement still counts as a tap

interface ActivePointer {
  x: number;
  y: number;
}

export function attachInput(
  canvas: HTMLCanvasElement,
  camera: Camera,
  cb: InputCallbacks,
): void {
  const pointers = new Map<number, ActivePointer>();
  let lastSingle: { x: number; y: number } | null = null;
  let pinchDist = 0;
  let pinchMid = { x: 0, y: 0 };
  let tap: { id: number; x: number; y: number; moved: boolean } | null = null;

  const rectPoint = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = rectPoint(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      lastSingle = p;
      tap = { id: e.pointerId, x: p.x, y: p.y, moved: false };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      pinchMid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      lastSingle = null;
      tap = null; // a second finger means this is a gesture, not a tap
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    const p = rectPoint(e);
    const tracked = pointers.get(e.pointerId);

    if (!tracked) {
      // not pressed: treat as hover (mouse/pen)
      cb.onHover(p.x, p.y);
      return;
    }
    pointers.set(e.pointerId, p);

    if (tap && e.pointerId === tap.id) {
      if (Math.hypot(p.x - tap.x, p.y - tap.y) > TAP_MOVE_THRESHOLD) {
        tap.moved = true;
      }
    }

    if (pointers.size === 1 && lastSingle) {
      camera.panBy(p.x - lastSingle.x, p.y - lastSingle.y);
      lastSingle = p;
      cb.onChange();
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      if (pinchDist > 0) {
        camera.zoomAt(mid.x, mid.y, dist / pinchDist);
        camera.panBy(mid.x - pinchMid.x, mid.y - pinchMid.y);
      }
      pinchDist = dist;
      pinchMid = mid;
      cb.onChange();
    }
  });

  const release = (e: PointerEvent) => {
    if (tap && e.pointerId === tap.id) {
      const r = canvas.getBoundingClientRect();
      if (!tap.moved) cb.onTap(e.clientX - r.left, e.clientY - r.top);
      tap = null;
    }
    pointers.delete(e.pointerId);
    if (pointers.size === 1) {
      const [only] = [...pointers.values()];
      lastSingle = only ? { x: only.x, y: only.y } : null;
      pinchDist = 0;
    } else if (pointers.size === 0) {
      lastSingle = null;
      pinchDist = 0;
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", (e) => {
    if (!pointers.has(e.pointerId)) cb.onHoverEnd();
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      camera.zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
      cb.onChange();
    },
    { passive: false },
  );
}
