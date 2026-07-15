export interface NodeCommandPaletteShortcutEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: unknown;
}

interface EditableTargetLike {
  tagName?: unknown;
  isContentEditable?: unknown;
  closest?: (selector: string) => unknown;
}

function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;

  const candidate = target as EditableTargetLike;
  if (candidate.isContentEditable === true) return true;
  if (typeof candidate.closest === 'function') {
    return Boolean(candidate.closest('input, textarea, select, [contenteditable="true"]'));
  }

  return typeof candidate.tagName === 'string'
    && ['INPUT', 'TEXTAREA', 'SELECT'].includes(candidate.tagName.toUpperCase());
}

export function isNodeCommandPaletteShortcut(event: NodeCommandPaletteShortcutEvent): boolean {
  return (event.ctrlKey === true || event.metaKey === true)
    && event.altKey !== true
    && event.shiftKey !== true
    && event.key.toLocaleLowerCase() === 'k'
    && !isEditableTarget(event.target);
}

export function moveNodeCommandPaletteSelection(
  currentIndex: number,
  itemCount: number,
  direction: -1 | 1
): number {
  if (!Number.isFinite(itemCount) || itemCount <= 0) return 0;

  const lastIndex = Math.max(0, Math.floor(itemCount) - 1);
  const safeCurrentIndex = Number.isFinite(currentIndex)
    ? Math.min(Math.max(Math.floor(currentIndex), 0), lastIndex)
    : 0;

  return Math.min(Math.max(safeCurrentIndex + direction, 0), lastIndex);
}
