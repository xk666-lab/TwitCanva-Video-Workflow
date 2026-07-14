import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { CanvasEdge } from '../domain/graph/graphTypes.ts';
import {
  createImageEditDerivations,
  type ImageEditGenerationRequest
} from '../domain/imageEditing/imageEdit.ts';
import { submitImageEdit } from '../services/generationService.ts';
import type { NodeData } from '../types.ts';

interface UseImageEditGenerationOptions {
  nodes: NodeData[];
  workflowId: string | null;
  setNodes: Dispatch<SetStateAction<NodeData[]>>;
  addEdge: (edge: CanvasEdge) => void;
  updateNode: (id: string, updates: Partial<NodeData>) => void;
}

export function useImageEditGeneration({
  nodes,
  workflowId,
  setNodes,
  addEdge,
  updateNode
}: UseImageEditGenerationOptions) {
  const handleImageEditGeneration = useCallback(async (request: ImageEditGenerationRequest) => {
    const editorNode = nodes.find(node => node.id === request.editorNodeId);
    if (!editorNode) throw new Error('The image editor node is no longer available.');

    const derivation = createImageEditDerivations({
      editorNode,
      source: request.source,
      prompt: request.prompt,
      mode: request.mode,
      imageModel: request.imageModel,
      aspectRatio: request.aspectRatio,
      resolution: request.resolution,
      count: request.count
    });

    setNodes(previous => [...previous, ...derivation.nodes]);
    derivation.edges.forEach(addEdge);

    await Promise.all(derivation.taskInputs.map(async input => {
      try {
        await submitImageEdit(input, {
          workflowId,
          onTaskCreated: task => {
            updateNode(input.nodeId, {
              status: 'loading' as NodeData['status'],
              activeTaskId: task.taskId,
              errorMessage: undefined,
              generationStartTime: Date.now()
            });
          }
        });
      } catch (error) {
        updateNode(input.nodeId, {
          status: 'error' as NodeData['status'],
          errorMessage: error instanceof Error ? error.message : 'Unable to submit image edit.',
          activeTaskId: undefined,
          generationStartTime: undefined
        });
      }
    }));
  }, [addEdge, nodes, setNodes, updateNode, workflowId]);

  return { handleImageEditGeneration };
}
