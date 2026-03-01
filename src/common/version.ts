/**
 * Semantic versioning for the Moneybird MCP Server
 * Standard semver rules:
 * - fix: increment patch version (backwards-compatible bug fixes)
 * - feat: increment minor version (backwards-compatible features)
 * - major: manual upgrade only (breaking changes)
 */
export const VERSION = {
  major: 0,
  minor: 7,
  patch: 0,
  toString: function() {
    return `${this.major}.${this.minor}.${this.patch}`;
  }
};
