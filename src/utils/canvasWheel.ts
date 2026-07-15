export const CANVAS_WHEEL_LISTENER_OPTIONS = { passive: false } as const;

export function preventCanvasWheelDefault(
  event: Pick<WheelEvent, 'preventDefault'>
): void {
  event.preventDefault();
}
