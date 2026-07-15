import test from 'node:test';
import assert from 'node:assert/strict';

type NodeCommandPaletteShortcutModule = {
  isNodeCommandPaletteShortcut?: (event: {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    target?: unknown;
  }) => boolean;
  moveNodeCommandPaletteSelection?: (
    currentIndex: number,
    itemCount: number,
    direction: -1 | 1
  ) => number;
};

async function loadNodeCommandPaletteShortcut(): Promise<NodeCommandPaletteShortcutModule> {
  try {
    return await import('./nodeCommandPaletteShortcut.ts') as NodeCommandPaletteShortcutModule;
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

test('opens the node command palette only for Ctrl/Cmd + K outside editable controls', async () => {
  const shortcut = await loadNodeCommandPaletteShortcut();
  assert.equal(typeof shortcut.isNodeCommandPaletteShortcut, 'function');

  assert.equal(shortcut.isNodeCommandPaletteShortcut!({ key: 'k', ctrlKey: true }), true);
  assert.equal(shortcut.isNodeCommandPaletteShortcut!({ key: 'K', metaKey: true }), true);
  assert.equal(shortcut.isNodeCommandPaletteShortcut!({
    key: 'k',
    ctrlKey: true,
    target: { tagName: 'INPUT' }
  }), false);
  assert.equal(shortcut.isNodeCommandPaletteShortcut!({ key: 'k', ctrlKey: true, altKey: true }), false);
  assert.equal(shortcut.isNodeCommandPaletteShortcut!({ key: 'k' }), false);
});

test('keeps command palette selection valid when results are empty or navigation reaches a boundary', async () => {
  const shortcut = await loadNodeCommandPaletteShortcut();
  assert.equal(typeof shortcut.moveNodeCommandPaletteSelection, 'function');

  assert.equal(shortcut.moveNodeCommandPaletteSelection!(0, 0, 1), 0);
  assert.equal(shortcut.moveNodeCommandPaletteSelection!(0, 0, -1), 0);
  assert.equal(shortcut.moveNodeCommandPaletteSelection!(0, 3, 1), 1);
  assert.equal(shortcut.moveNodeCommandPaletteSelection!(2, 3, 1), 2);
  assert.equal(shortcut.moveNodeCommandPaletteSelection!(0, 3, -1), 0);
});
