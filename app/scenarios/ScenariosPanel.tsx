import { useWorkspaceServices } from '@app/workspace/services';

/**
 * Scenarios destination — placeholder (Gate F slot, owned by workstream B). B replaces this body;
 * the slot in `app/workspace/panelSlots.ts` stays.
 */
export function ScenariosPanel() {
  const { design } = useWorkspaceServices();
  return (
    <div className="sgl-slot-placeholder" data-placeholder="scenarios">
      <p>Scenarios are not available yet.</p>
      <p className="meta">
        This is where a project’s design alternatives will be listed: create, duplicate, rename, delete and switch between them,
        each with its own undo history and saved locally.
      </p>
      <p className="meta">{design ? `For now the project has one design: “${design.doc.metadata.name}”.` : 'No design is open.'}</p>
    </div>
  );
}
