import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CATALOG_DIR = path.resolve(__dirname, '..', 'catalog');

describe('units/skills: 技能契约与不变量门禁 (ADR-0015)', () => {
  const entries = fs.readdirSync(CATALOG_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  it('官方技能目录包含核心 4 大微观技能', () => {
    const required = [
      'systematic-debugging',
      'test-driven-development',
      'verification-before-completion',
      'brainstorming',
    ];
    for (const req of required) {
      assert.ok(entries.includes(req), `缺失必须的技能: ${req}`);
    }
  });

  for (const skillName of entries) {
    describe(`技能: ${skillName}`, () => {
      const skillPath = path.join(CATALOG_DIR, skillName, 'SKILL.md');
      const content = fs.readFileSync(skillPath, 'utf8');

      it('正文字节数严格小于 20,000 bytes (Skill Size Invariant)', () => {
        const byteSize = Buffer.byteLength(content, 'utf8');
        assert.ok(
          byteSize < 20000,
          `技能 ${skillName} 体积为 ${byteSize} bytes，超出了 20,000 bytes 硬上限！`
        );
      });

      it('包含标准 YAML Frontmatter (name 与 description)', () => {
        assert.match(content, /^---\s*\nname:\s*[\w-]+\s*\ndescription:\s*.+\s*\n---/m);
      });

      it('包含不可违背铁律 (The Iron Law)', () => {
        const hasIronLaw = content.includes('Iron Law') || content.includes('不可违背铁律');
        assert.ok(hasIronLaw, `技能 ${skillName} 缺失不可违背铁律小节！`);
      });

      it('包含防合理化阻断表 (Anti-Rationalization / Red Flags)', () => {
        const hasAntiRationalization =
          content.includes('Anti-Rationalization') ||
          content.includes('防合理化') ||
          content.includes('Red Flags');
        assert.ok(hasAntiRationalization, `技能 ${skillName} 缺失防合理化阻断表！`);
      });

      it('内部 references 引用文件真实物理存在', () => {
        const refMatches = content.matchAll(/references\/[\w-]+\.md/g);
        for (const m of refMatches) {
          const refFile = path.join(CATALOG_DIR, skillName, m[0]);
          assert.ok(fs.existsSync(refFile), `引用文件不存在: ${refFile}`);
        }
      });
    });
  }
});
