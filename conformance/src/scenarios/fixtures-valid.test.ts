/**
 * Fixture-validity test — pure local check that every fixture JSON
 * validates against the workflow-definition schema. Runs without a
 * server target so it can gate the suite in CI before deployment.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ErrorObject } from 'ajv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures');
const PACK_MANIFEST_FIXTURES_DIR = join(FIXTURES_DIR, 'pack-manifests');
const SCHEMA_PATH = join(__dirname, '..', '..', '..', 'schemas', 'workflow-definition.schema.json');
const PACK_MANIFEST_SCHEMA_PATH = join(__dirname, '..', '..', '..', 'schemas', 'node-pack-manifest.schema.json');

describe('fixtures: workflow-definition schema validity', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const validate = ajv.compile(schema);

  const files = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json')) // top-level only — sub-dirs hold non-workflow fixtures
    .sort();

  it('finds at least one fixture file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} validates against workflow-definition.schema.json`, () => {
      const data = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8'));
      const ok = validate(data);
      const errors = (validate.errors ?? [])
        .map((e: ErrorObject) => `${e.instancePath || '/'}: ${e.message}`)
        .join('\n');
      expect(ok, `Fixture ${file} fails workflow-definition schema:\n${errors}`).toBe(true);
    });
  }

  it('every fixture id matches its filename', () => {
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8')) as { id: string };
      const expected = file.replace(/\.json$/, '');
      expect(
        data.id,
        `Fixture file ${file} declares id "${data.id}" — MUST match filename`,
      ).toBe(expected);
    }
  });

  it('every fixture has a manual trigger so the conformance driver can start it', () => {
    for (const file of files) {
      const data = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8')) as {
        id: string;
        triggers: Array<{ type: string }>;
      };
      const hasManual = data.triggers.some((t) => t.type === 'manual');
      expect(
        hasManual,
        `Fixture ${data.id} MUST include a manual trigger per fixtures.md §Seeding contract`,
      ).toBe(true);
    }
  });
});

describe('fixtures: node-pack-manifest schema validity', () => {
  // Pack-manifest fixtures live in `fixtures/pack-manifests/` so the
  // top-level workflow-definition validator above doesn't try to apply
  // the wrong schema. They serve as schema-level proof points (e.g., the
  // `private.<host>.*` scope added in wop@1.10.0 is accepted by the
  // canonical schema).
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(PACK_MANIFEST_SCHEMA_PATH, 'utf8'));
  const validate = ajv.compile(schema);

  const files = readdirSync(PACK_MANIFEST_FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  it('finds at least one pack-manifest fixture (private-scope coverage)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`pack-manifests/${file} validates against node-pack-manifest.schema.json`, () => {
      const data = JSON.parse(
        readFileSync(join(PACK_MANIFEST_FIXTURES_DIR, file), 'utf8'),
      );
      const ok = validate(data);
      const errors = (validate.errors ?? [])
        .map((e: ErrorObject) => `${e.instancePath || '/'}: ${e.message}`)
        .join('\n');
      expect(
        ok,
        `Fixture pack-manifests/${file} fails node-pack-manifest schema:\n${errors}`,
      ).toBe(true);
    });
  }

  it('the private-scope fixture exercises the wop@1.10.0 widened pattern', () => {
    // Regression pin: the pattern in node-pack-manifest.schema.json was
    // widened from `(core|vendor|community)` to
    // `(core|vendor|community|private)` in wop@1.10.0. If this test
    // fails, either the schema regressed or the fixture got renamed —
    // both are CHANGELOG-worthy.
    const privateFixtures = files.filter((f) => {
      const data = JSON.parse(
        readFileSync(join(PACK_MANIFEST_FIXTURES_DIR, f), 'utf8'),
      ) as { name?: string };
      return typeof data.name === 'string' && data.name.startsWith('private.');
    });
    expect(
      privateFixtures.length,
      'Expected at least one pack-manifest fixture under the `private.<host>.*` scope to assert wop@1.10.0 widened pattern coverage',
    ).toBeGreaterThan(0);
  });
});
