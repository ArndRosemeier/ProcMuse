/** The style registry: built-ins validated once at load. */
import { ProcMuseError } from '../core/errors.js';
import { validateStyle, type Style } from './style.js';
import { BUILTIN_STYLES } from './styles/builtin.js';

export const STYLES: readonly Style[] = BUILTIN_STYLES.map(validateStyle);
export const DEFAULT_STYLE_ID = 'demoscene';

export function getStyle(id: string): Style {
  const s = STYLES.find((x) => x.id === id);
  if (!s) throw new ProcMuseError('invalid-style', `unknown style ${id}`);
  return s;
}
