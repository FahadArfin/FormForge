import {templateCatalog,type StarterId} from './templateCatalog'
import {createTemplateDocument} from './templateRecipes'
export const starters=templateCatalog
export function createStarter(id:StarterId){return createTemplateDocument(id)}
