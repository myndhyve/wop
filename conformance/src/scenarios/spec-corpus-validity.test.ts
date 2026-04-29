/**
 * Spec-corpus validity — server-free check that the WOP spec artifacts
 * are internally consistent. Catches drift between prose docs, JSON
 * Schemas, OpenAPI, AsyncAPI, and the fixture catalog.
 *
 * Runs purely against on-disk files. Designed for CI gating: any
 * structural break in the spec fails this scenario before reaching the
 * server-required suite.
 *
 * Coverage:
 *   1. Every JSON Schema in `../../schemas/` parses + compiles (Ajv2020).
 *   2. Every fixture JSON validates against workflow-definition schema.
 *      (delegated to fixtures-valid.test.ts; cross-referenced here)
 *   3. OpenAPI 3.1 YAML parses + has required top-level fields.
 *   4. AsyncAPI 3.1 YAML parses + has required top-level fields.
 *   5. Every prose .md doc carries a `Status:` legend tag.
 *   6. Every $ref in OpenAPI/AsyncAPI to ../schemas/*.json resolves to a
 *      file that exists on disk.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as pathResolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..', '..', '..');
const SPEC_V1_DIR = join(ROOT_DIR, 'spec', 'v1');
const SCHEMAS_DIR = join(ROOT_DIR, 'schemas');
const FIXTURES_DIR = join(ROOT_DIR, 'conformance', 'fixtures');
const API_DIR = join(ROOT_DIR, 'api');

// ── Helpers ─────────────────────────────────────────────────────────────

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json'));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Minimal YAML parser substitute — assert the file is parseable as
 *  YAML 1.2 by checking it's valid via the spec's structural fields.
 *  We don't pull in `js-yaml` to keep the conformance package's
 *  dep surface minimal; instead we read enough of the file to assert
 *  the openapi:/asyncapi: top-level keys are present.
 */
function readYamlHeader(path: string): {
  raw: string;
  topLevelKeys: Set<string>;
} {
  const raw = readFileSync(path, 'utf8');
  const topLevelKeys = new Set<string>();
  for (const line of raw.split('\n')) {
    // Skip comments + indented lines + blanks.
    if (line.startsWith('#') || line.startsWith(' ') || line.startsWith('\t') || line.trim() === '') {
      continue;
    }
    const colon = line.indexOf(':');
    if (colon > 0) {
      topLevelKeys.add(line.slice(0, colon));
    }
  }
  return { raw, topLevelKeys };
}

/** Extract every `$ref:` value from a YAML or JSON file (string scan). */
function extractRefs(raw: string): string[] {
  const refs: string[] = [];
  const re = /\$ref:\s*['"]?([^'"\s\n]+)['"]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m[1]) refs.push(m[1]);
  }
  return refs;
}

// ── Scenarios ───────────────────────────────────────────────────────────

describe('spec-corpus: JSON Schemas compile under Ajv2020', () => {
  const schemaFiles = listJsonFiles(SCHEMAS_DIR);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  it('finds at least three schemas (workflow-definition, run-event, suspend-request)', () => {
    expect(schemaFiles.length).toBeGreaterThanOrEqual(3);
    expect(schemaFiles).toContain('workflow-definition.schema.json');
    expect(schemaFiles).toContain('run-event.schema.json');
    expect(schemaFiles).toContain('suspend-request.schema.json');
  });

  for (const file of schemaFiles) {
    it(`${file} parses + compiles`, () => {
      const schema = readJson(join(SCHEMAS_DIR, file)) as Record<string, unknown>;
      expect(schema['$schema']).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(typeof schema['$id']).toBe('string');
      expect(typeof schema['title']).toBe('string');
      // Compile — throws on structural issues.
      const validate = ajv.compile(schema);
      expect(typeof validate).toBe('function');
    });
  }
});

describe('spec-corpus: OpenAPI 3.1 spec is structurally valid', () => {
  const openapiPath = join(API_DIR, 'openapi.yaml');

  it('exists', () => {
    expect(existsSync(openapiPath)).toBe(true);
  });

  it('declares openapi: 3.1 + required top-level keys', () => {
    const { topLevelKeys, raw } = readYamlHeader(openapiPath);
    expect(topLevelKeys.has('openapi')).toBe(true);
    expect(topLevelKeys.has('info')).toBe(true);
    expect(topLevelKeys.has('paths')).toBe(true);
    expect(topLevelKeys.has('components')).toBe(true);
    expect(raw).toMatch(/^openapi:\s*3\.1\.[0-9]+\s*$/m);
  });

  it('every $ref to ../schemas/*.json resolves to a real file', () => {
    const { raw } = readYamlHeader(openapiPath);
    const refs = extractRefs(raw).filter((r) => r.startsWith('../schemas/'));
    expect(refs.length).toBeGreaterThan(0); // at least one schema reference
    for (const ref of refs) {
      const abs = pathResolve(API_DIR, ref.split('#')[0] ?? ref);
      expect(existsSync(abs), `OpenAPI $ref points at missing file: ${ref}`).toBe(true);
    }
  });
});

describe('spec-corpus: AsyncAPI 3.1 spec is structurally valid', () => {
  const asyncapiPath = join(API_DIR, 'asyncapi.yaml');

  it('exists', () => {
    expect(existsSync(asyncapiPath)).toBe(true);
  });

  it('declares asyncapi: 3.1 + required top-level keys', () => {
    const { topLevelKeys, raw } = readYamlHeader(asyncapiPath);
    expect(topLevelKeys.has('asyncapi')).toBe(true);
    expect(topLevelKeys.has('info')).toBe(true);
    expect(topLevelKeys.has('channels')).toBe(true);
    expect(topLevelKeys.has('operations')).toBe(true);
    expect(raw).toMatch(/^asyncapi:\s*3\.1\.[0-9]+\s*$/m);
  });

  it('every $ref to ../schemas/*.json resolves to a real file', () => {
    const { raw } = readYamlHeader(asyncapiPath);
    const refs = extractRefs(raw).filter((r) => r.startsWith('../schemas/'));
    for (const ref of refs) {
      const abs = pathResolve(API_DIR, ref.split('#')[0] ?? ref);
      expect(existsSync(abs), `AsyncAPI $ref points at missing file: ${ref}`).toBe(true);
    }
  });
});

describe('spec-corpus: prose docs carry a Status: legend tag', () => {
  // V1-FINAL-COMPLETION-PLAN.md is a release record, not a normative
  // spec doc; it lives in spec/v1/ for proximity to the spec corpus
  // but does not carry a Status: tag.
  const META_DOCS = new Set([
    'V1-FINAL-COMPLETION-PLAN.md',
  ]);
  const proseFiles = readdirSync(SPEC_V1_DIR)
    .filter((f) => f.endsWith('.md') && !META_DOCS.has(f))
    .sort();

  it('finds the expected prose doc set', () => {
    // Spec README §Document index lists 11+ prose docs. If this drifts,
    // the README needs updating in the same PR that adds/removes a doc.
    expect(proseFiles.length).toBeGreaterThanOrEqual(11);
  });

  for (const file of proseFiles) {
    it(`${file} declares a Status: tag (STUB / DRAFT / OUTLINE / FINAL)`, () => {
      const content = readFileSync(join(SPEC_V1_DIR, file), 'utf8');
      // Match either ">**Status:" or "**Status:" near the top of file.
      expect(
        content,
        `${file} must include a "Status:" legend tag near its header`,
      ).toMatch(/\*\*Status:\s*(STUB|DRAFT|OUTLINE|FINAL)\b/);
    });
  }
});

describe('spec-corpus: fixtures.json catalog matches fixtures.md', () => {
  const fixturesDocPath = join(ROOT_DIR, 'conformance', 'fixtures.md');
  const fixtureJsonFiles = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();

  it('every fixture id mentioned in fixtures.md has a corresponding JSON', () => {
    const doc = readFileSync(fixturesDocPath, 'utf8');
    // Match `conformance-<word>` identifiers in the catalog table or
    // per-fixture sections. Use word-boundary so "conformance-noop"
    // captures cleanly without bleeding into adjacent text.
    //
    // PROPOSED-section IDs are intentionally documented without backing
    // JSONs (the fixture is blocked on a future spec/impl change). Two
    // markers indicate a section is documenting a future fixture:
    //   1. "(PROPOSED v..." in the heading — design proposal
    //   2. "impl pending" in the heading — spec firm, runtime not yet
    //      shipped (e.g., F4's cap-breach fixture awaiting CC-1 counter)
    // We strip §sections matching either marker before scanning.
    // The catalog table also contains rows for PROPOSED / impl-pending
    // fixtures; strip those too.
    let docWithoutProposed = doc.replace(
      /^##\s+[^\n]*\((PROPOSED\s+v[^\n)]+|[^)]*impl pending)\)[\s\S]*?(?=^##\s+|^---\s*$)/gm,
      '',
    );
    docWithoutProposed = docWithoutProposed.replace(
      /^\|[^\n]*(PROPOSED|impl pending)[^\n]*\n/gm,
      '',
    );
    const idRegex = /\bconformance-[a-z][a-z0-9-]*\b/g;
    const cited = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = idRegex.exec(docWithoutProposed)) !== null) {
      cited.add(m[0]);
    }
    for (const cite of cited) {
      expect(
        fixtureJsonFiles,
        `fixtures.md cites fixture id "${cite}" but no matching ${cite}.json exists`,
      ).toContain(cite);
    }
  });

  it('every fixture JSON file is referenced by fixtures.md', () => {
    const doc = readFileSync(fixturesDocPath, 'utf8');
    for (const id of fixtureJsonFiles) {
      expect(
        doc,
        `fixture ${id}.json exists but fixtures.md does not document it`,
      ).toContain(id);
    }
  });
});
