import { createRequire } from 'node:module';

// package.json is the single source of the version: `npm version` bumps it and
// creates the release tag. The relative path holds from both src/common and
// dist/common, and npm always ships package.json with the package.
const pkg = createRequire(import.meta.url)('../../package.json') as { version: string };

export const VERSION = {
  value: pkg.version,
  toString(): string {
    return this.value;
  },
};
