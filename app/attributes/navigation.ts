import { createContext } from 'react';
import type { AttributeCollection } from '@app/extensions';

/** Opens the Attributes manager on its Nodes or Edges list (provided by the workspace shell). */
export const OpenAttributesContext = createContext<((collection: AttributeCollection) => void) | null>(null);
