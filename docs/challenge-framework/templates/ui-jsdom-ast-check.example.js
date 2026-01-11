// Example AST check (run inside the Vitest test-runner container)
//
// This is useful for hidden tests to enforce implementation constraints without
// importing/executing candidate code.
//
// Expected layout (grader copies candidate submission to):
//   /app/candidate/<candidate files>

import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

export function readCandidateFile(relPath) {
  const p = path.join('/app/candidate', relPath);
  return fs.readFileSync(p, 'utf8');
}

export function assertUsesIdentifier(source, name) {
  let found = false;
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  traverse(ast, {
    Identifier(p) {
      if (p.node.name === name) found = true;
    },
  });
  if (!found) throw new Error(`Expected identifier "${name}" to be used`);
}

export function assertNoIdentifiers(source, names) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  traverse(ast, {
    Identifier(p) {
      if (names.includes(p.node.name)) {
        throw new Error(`Disallowed identifier "${p.node.name}" found`);
      }
    },
  });
}


