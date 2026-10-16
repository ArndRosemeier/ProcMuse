/** The built-in styles, in the order the Style picker lists them. */
import type { Style } from '../style.js';
import { CHILL_STYLES } from './chill.js';
import { ELECTRONIC_STYLES } from './electronic.js';
import { WORLD_STYLES } from './world.js';

export const BUILTIN_STYLES: readonly Style[] = [...ELECTRONIC_STYLES, ...CHILL_STYLES, ...WORLD_STYLES];
