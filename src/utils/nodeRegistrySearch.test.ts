import test from 'node:test';
import assert from 'node:assert/strict';

type NodeRegistryModule = {
  searchNodeDefinitions?: (query: string) => Array<{ type: string }>;
};

async function loadNodeRegistry(): Promise<NodeRegistryModule> {
  const registry = await import('../domain/nodes/nodeRegistry.ts');
  return registry as NodeRegistryModule;
}

test('searches registered node definitions without relying on a UI-local list', async () => {
  const registry = await loadNodeRegistry();
  assert.equal(typeof registry.searchNodeDefinitions, 'function');

  assert.deepEqual(
    registry.searchNodeDefinitions!('视频').map(definition => definition.type),
    ['视频', '视频编辑器', '本地视频模型']
  );
  assert.deepEqual(
    registry.searchNodeDefinitions!('脚本').map(definition => definition.type),
    ['脚本']
  );
});
