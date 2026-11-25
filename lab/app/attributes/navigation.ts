import { createContext } from 'react';
import type { AttributeCollection } from '@app/extensions';

/** Opens the Attributes manager on its Nodes or Edges list (provided by the workspace shell). */
export const OpenAttributesContext = createContext<((collection: AttributeCollection) => void) | null>(null);

/** Opens the Functions pop-up (add or remove the node types a project offers); null without a project. */
export const ManageFunctionsContext = createContext<(() => void) | null>(null);
