import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

import {
  extractTelemetryMetrics,
  extractEvidenceReferences,
  verifyAdrTelemetry,
  verifyAllAdrsTelemetry,
} from '../core/telemetry_authenticator.mjs';

import {
  extractDecisionSymbols,
  traceAdrWiring,
  traceAllAdrsWiring,
} from '../core/wiring_tracer.mjs';

import {
  buildFullTriadMatrix,
  formatTriadHeatmap,
} from '../core/matrix-checker.mjs';

describe('spec-guard v2.0: 实测数据自述凭据与机器信任根验签 (Telemetry Authenticator)', () => {
  it('应准确提取文本中的量化指标 (ms, s, MB, %, P95, INT8 等)', () => {
    const text = `
    | 软拷贝基准 | 实测 Redmi 12C：均值 39.42ms (P95 44.37ms)，PSS 拟合斜率 -0.0158 MB/轮 |
    | CPU 推理 | PP-OCRv5 INT8 模型体积 8.887MB，推理均值 410~460ms，准确率 96.43% |
    `;
    const metrics = extractTelemetryMetrics(text);
    const metricStrings = metrics.map((m) => m.metric);

    assert.ok(metricStrings.includes('39.42ms'));
    assert.ok(metricStrings.includes('P95'));
    assert.ok(metricStrings.includes('44.37ms'));
    assert.ok(metricStrings.includes('0.0158 MB'));
    assert.ok(metricStrings.includes('INT8'));
    assert.ok(metricStrings.includes('8.887MB'));
    assert.ok(metricStrings.includes('460ms'));
    assert.ok(metricStrings.includes('96.43%'));
  });

  // [必红守护 1]: 格式伪造拦截 (手写性能数字却无 evidence 引用)
  it('格式伪造拦截：ADR 声称性能指标却缺少机器信任根凭据，必须判定自述漂移并违规熔断', () => {
    const fakeAdrContent = `
# ADR-099: 假基准性能规约

- **状态（Status）**：Draft
- **日期**：2026-11-14

## 2. Decision
决策内容说明。

## 3. Implementation Status
| 项 | 状态 | 实测基线数据 |
|---|---|---|
| 推理性能 | ✅ 已完成 | 软拷贝均值 39.42ms (P95 44.37ms)，显存占用 8.8MB，提升 25% |
    `;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-fake-'));
    try {
      const res = verifyAdrTelemetry(
        {
          adrId: 'ADR-099',
          filePath: path.join(tmpDir, 'ADR-099.md'),
          content: fakeAdrContent,
        },
        tmpDir
      );

      assert.equal(res.status, 'FAIL');
      assert.equal(res.isCompliant, false);
      assert.ok(res.reason.includes('ADR-099: 实测数据自述漂移（违反 ADR-064 机器信任根）'));
      assert.ok(res.details[0].includes('缺少 evidence/*.json 凭证引用'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // [必红守护 2]: 缺少机器签名/哈希摘要熔断
  it('缺少机器签名熔断：ADR 引用了 JSON 文件但缺少哈希摘要或数字签名，必须熔断阻断', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-unsigned-'));
    try {
      const evidenceDir = path.join(tmpDir, 'evidence');
      fs.mkdirSync(evidenceDir, { recursive: true });

      const evidenceFile = path.join(evidenceDir, 'benchmark.json');
      fs.writeFileSync(
        evidenceFile,
        JSON.stringify({ latency_ms: 39.42, p95_ms: 44.37 }, null, 2),
        'utf8'
      );

      // ADR 引用了 evidence/benchmark.json，但没有提供 digest / signature
      const adrContent = `
# ADR-098: 未签名基准规约

- **状态（Status）**：Draft
- **关联证据**：
  - \`evidence/benchmark.json\`

## 3. Implementation Status
| 项 | 状态 | 实测基线数据 |
|---|---|---|
| 基准 | ✅ 已完成 | 均值 39.42ms (P95 44.37ms) |
      `;

      const res = verifyAdrTelemetry(
        {
          adrId: 'ADR-098',
          filePath: path.join(tmpDir, 'ADR-098.md'),
          content: adrContent,
        },
        tmpDir
      );

      assert.equal(res.status, 'FAIL');
      assert.equal(res.isCompliant, false);
      assert.ok(res.reason.includes('ADR-098: 实测数据自述漂移（违反 ADR-064 机器信任根）'));
      assert.ok(res.details.some((d) => d.includes('缺少机器哈希摘要或数字签名')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('防篡改检验：引用的凭据文件 SHA-256 摘要与声明不匹配时立即阻断', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-tamper-'));
    try {
      const evidenceDir = path.join(tmpDir, 'evidence');
      fs.mkdirSync(evidenceDir, { recursive: true });

      const evidenceFile = path.join(evidenceDir, 'benchmark.json');
      fs.writeFileSync(evidenceFile, JSON.stringify({ latency_ms: 39.42 }, null, 2), 'utf8');

      // 声明了伪造的哈希
      const fakeHash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const adrContent = `
# ADR-097: 篡改凭据规约

- **状态（Status）**：Draft
- **evidence_ref**: evidence/benchmark.json
- **digest**: sha256:${fakeHash}

## 3. Implementation Status
| 基准 | ✅ 已完成 | 均值 39.42ms |
      `;

      const res = verifyAdrTelemetry(
        {
          adrId: 'ADR-097',
          filePath: path.join(tmpDir, 'ADR-097.md'),
          content: adrContent,
        },
        tmpDir
      );

      assert.equal(res.status, 'FAIL');
      assert.ok(res.details.some((d) => d.includes('哈希不匹配')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('容差 0% 强核验：实测凭据数值与 ADR 文本声明数值完全脱节时判定为自述漂移', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-tolerance-'));
    try {
      const evidenceDir = path.join(tmpDir, 'evidence');
      fs.mkdirSync(evidenceDir, { recursive: true });

      const evidenceFile = path.join(evidenceDir, 'benchmark.json');
      // JSON 真实数值是 999ms
      const fileData = JSON.stringify({ latency_ms: 999.0 }, null, 2);
      fs.writeFileSync(evidenceFile, fileData, 'utf8');

      const realHash = crypto.createHash('sha256').update(fileData).digest('hex');

      // ADR 谎称 39.42ms
      const adrContent = `
# ADR-096: 数值矛盾规约

- **状态（Status）**：Draft
- **evidence_ref**: evidence/benchmark.json
- **digest**: sha256:${realHash}

## 3. Implementation Status
| 基准 | ✅ 已完成 | 均值 39.42ms (提升 90%) |
      `;

      const res = verifyAdrTelemetry(
        {
          adrId: 'ADR-096',
          filePath: path.join(tmpDir, 'ADR-096.md'),
          content: adrContent,
        },
        tmpDir
      );

      assert.equal(res.status, 'FAIL');
      assert.ok(res.details.some((d) => d.includes('容差 $0%') || d.includes('完全脱节')));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('合法凭证核验通过：持有正确机器签名/哈希摘要且数值真实吻合时判定 PASS', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-pass-'));
    try {
      const evidenceDir = path.join(tmpDir, 'evidence');
      fs.mkdirSync(evidenceDir, { recursive: true });

      const evidenceFile = path.join(evidenceDir, 'staging_buffer.json');
      const fileData = JSON.stringify(
        {
          device: 'Redmi 12C',
          metrics: {
            latency_ms: 39.42,
            p95_ms: 44.37,
          },
          gate_passed: true,
        },
        null,
        2
      );
      fs.writeFileSync(evidenceFile, fileData, 'utf8');

      const realHash = crypto.createHash('sha256').update(fileData).digest('hex');

      const adrContent = `
# ADR-095: 合法凭据规约

- **状态（Status）**：Draft
- **evidence_ref**: evidence/staging_buffer.json
- **digest**: sha256:${realHash}

## 3. Implementation Status
| 项 | 状态 | 实测基线数据 |
|---|---|---|
| 转换 | ✅ 已完成 | 实测 Redmi 12C：软拷贝均值 39.42ms (P95 44.37ms) |
      `;

      const res = verifyAdrTelemetry(
        {
          adrId: 'ADR-095',
          filePath: path.join(tmpDir, 'ADR-095.md'),
          content: adrContent,
        },
        tmpDir
      );

      assert.equal(res.status, 'PASS');
      assert.equal(res.isCompliant, true);
      assert.ok(res.reason.includes('机器信任根验签通过'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('spec-guard v2.0: 物理代码接线探测与孤儿决策防卫 (Wiring Tracer)', () => {
  it('应准确从 Decision 节提取关键架构符号', () => {
    const adrContent = `
# ADR-066: 感知决策

## 1. Context
背景内容。

## 2. Decision
为保障高可用，采用单帧固定尺寸 \`ScreenshotBufferSpike.kt\` 进行转换；
调用 \`hardwareBuffer.close()\` 与 \`stagingBitmap.recycle()\`；
通过 \`actionEpoch\` 与 \`tree_hash\` 防重放；
引入 \`UIFormer\` 模态切片，输出 \`ABSTAIN\` 状态；
熔断器 \`batteryTemp\` 保护。

## 3. Implementation Status
落地情况。
    `;

    const symbols = extractDecisionSymbols(adrContent);
    assert.ok(symbols.includes('ScreenshotBufferSpike'));
    assert.ok(symbols.includes('hardwareBuffer'));
    assert.ok(symbols.includes('close'));
    assert.ok(symbols.includes('actionEpoch'));
    assert.ok(symbols.includes('tree_hash'));
    assert.ok(symbols.includes('UIFormer'));
    assert.ok(symbols.includes('ABSTAIN'));
    assert.ok(symbols.includes('batteryTemp'));
  });

  it('孤儿决策拦截：🔒Frozen 状态但生产代码零命中，必须输出 ORPHAN_DECISION 并阻断', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-orphan-'));
    try {
      const prodDir = path.join(tmpDir, 'src', 'main');
      fs.mkdirSync(prodDir, { recursive: true });

      // 生产代码只有普通无关代码，没有 ADR 声明的核心符号
      fs.writeFileSync(path.join(prodDir, 'Hello.kt'), `class Hello { fun say() = "hi" }`);

      const adrContent = `
# ADR-050: 孤儿规约

- **状态（Status）**：🔒 Frozen

## 2. Decision
生产环境必须接入核心引擎 \`UnicornPerceptionPipeline\` 与 \`QuantumEncryptor\`。
      `;

      const report = traceAdrWiring(
        {
          adrId: 'ADR-050',
          filePath: path.join(tmpDir, 'ADR-050.md'),
          isFrozen: true,
          content: adrContent,
        },
        tmpDir
      );

      assert.equal(report.status, 'FAIL');
      assert.equal(report.isOrphan, true);
      assert.ok(report.reason.includes('ORPHAN_DECISION'));
      assert.ok(report.reason.includes('UnicornPerceptionPipeline'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('No-Cheat 铁律：测试目录中的调用一律不计入生产接线证明', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-nocheat-wire-'));
    try {
      const prodDir = path.join(tmpDir, 'src', 'main');
      const testDir = path.join(tmpDir, 'src', 'test');
      fs.mkdirSync(prodDir, { recursive: true });
      fs.mkdirSync(testDir, { recursive: true });

      // 仅在测试文件中包含该符号
      fs.writeFileSync(
        path.join(testDir, 'PipelineTest.kt'),
        `class PipelineTest { val pipe = FakePipelineRunner() }`
      );

      const adrContent = `
# ADR-051: 仅单测接线规约

- **状态（Status）**：🔒 Frozen

## 2. Decision
必须挂载 \`FakePipelineRunner\`。
      `;

      const report = traceAdrWiring(
        {
          adrId: 'ADR-051',
          filePath: path.join(tmpDir, 'ADR-051.md'),
          isFrozen: true,
          content: adrContent,
        },
        tmpDir
      );

      // 因为生产代码没有 FakePipelineRunner，测试里的调用被 No-Cheat 铁律严格过滤，判定为孤儿决策！
      assert.equal(report.isOrphan, true);
      assert.equal(report.status, 'FAIL');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('spec-guard v2.0: CLI 命令与端到端实测 (AC1 - AC4)', () => {
  const CLI_PATH = path.resolve('units/spec-guard/bin/spec-guard.mjs');

  it('AC1: verify-evidence 遇到包含量化指标却无签名凭证的 ADR 时输出违规详情并 Exit 1', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-cli-ac1-'));
    try {
      const adrDir = path.join(tmpDir, 'group', 'architecture', 'adr');
      fs.mkdirSync(adrDir, { recursive: true });

      fs.writeFileSync(
        path.join(adrDir, 'ADR-099-fake.md'),
        `# ADR-099: 假数据规约\n\n- **状态（Status）**：Draft\n\n## 3. Implementation Status\n| 任务 | 耗时 39.42ms (P95 44ms) |`
      );

      let threw = false;
      try {
        execSync(`node "${CLI_PATH}" verify-evidence --repo "${tmpDir}"`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch (err) {
        threw = true;
        assert.equal(err.status, 1);
        const stderr = err.stderr || err.stdout;
        assert.ok(stderr.includes('ADR-099: 实测数据自述漂移（违反 ADR-064 机器信任根）'));
      }
      assert.equal(threw, true, 'verify-evidence 必须以 Exit 1 阻断');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('AC2: check-wiring 能精准识别 🔒Frozen 但生产代码零符号命中的孤儿决策并 Exit 1', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-cli-ac2-'));
    try {
      const adrDir = path.join(tmpDir, 'group', 'architecture', 'adr');
      const prodDir = path.join(tmpDir, 'src', 'main');
      fs.mkdirSync(adrDir, { recursive: true });
      fs.mkdirSync(prodDir, { recursive: true });

      fs.writeFileSync(path.join(prodDir, 'App.kt'), `class App {}`);
      fs.writeFileSync(
        path.join(adrDir, 'ADR-088-frozen-orphan.md'),
        `# ADR-088: 冻结孤儿规约\n\n- **状态（Status）**：🔒 Frozen\n\n## 2. Decision\n生产接入 \`GhostSensorEngine\`。`
      );

      let threw = false;
      try {
        execSync(`node "${CLI_PATH}" check-wiring --repo "${tmpDir}"`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch (err) {
        threw = true;
        assert.equal(err.status, 1);
        const output = err.stderr || err.stdout;
        assert.ok(output.includes('ORPHAN_DECISION'));
      }
      assert.equal(threw, true, 'check-wiring 必须以 Exit 1 阻断');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('AC3: check --full 一键输出全景对账热力表（覆盖断言、证据、接线三元）', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-cli-ac3-'));
    try {
      const adrDir = path.join(tmpDir, 'group', 'architecture', 'adr');
      const prodDir = path.join(tmpDir, 'src', 'main');
      const testDir = path.join(tmpDir, 'src', 'test');
      fs.mkdirSync(adrDir, { recursive: true });
      fs.mkdirSync(prodDir, { recursive: true });
      fs.mkdirSync(testDir, { recursive: true });

      fs.writeFileSync(
        path.join(adrDir, 'ADR-060-sample.md'),
        `# ADR-060: 样例规约\n\n- **状态（Status）**：🔒 Frozen\n\n## 2. Decision\n接入 \`SampleService\`。\n\n## 3. Implementation Status\n| 任务 | ✅ 已完成 |\n\n## 5. Consequences / Invariants\n- **H-1**: 安全约束`
      );
      fs.writeFileSync(
        path.join(prodDir, 'SampleService.kt'),
        `class SampleService { fun run() {} }`
      );
      fs.writeFileSync(
        path.join(testDir, 'SampleTest.kt'),
        `import lab.specguard.annotations.Invariant\nclass SampleTest { @Invariant("ADR-060:H-1") fun test() {} }`
      );

      const stdout = execSync(`node "${CLI_PATH}" check --full --repo "${tmpDir}"`, {
        encoding: 'utf8',
      });

      assert.ok(stdout.includes('全景对账热力表 (Triad Heatmap)'));
      assert.ok(stdout.includes('断言 (Assertion)'));
      assert.ok(stdout.includes('证据 (Evidence)'));
      assert.ok(stdout.includes('接线 (Wiring)'));
      assert.ok(stdout.includes('ADR-060'));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('AC4: 针对 Tappy 仓运行能够准确捕捉并报告 ADR-066: 实测数据自述漂移（违反 ADR-064 机器信任根）', () => {
    const tappyPath = '/Users/churze/Documents/Developer/Tappy';
    if (!fs.existsSync(tappyPath)) {
      // 容错：若本地没有 Tappy 路径，则跳过实机校验
      return;
    }

    let threw = false;
    try {
      execSync(`node "${CLI_PATH}" verify-evidence ADR-066 --repo "${tappyPath}"`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err) {
      threw = true;
      assert.equal(err.status, 1);
      const output = (err.stderr || '') + (err.stdout || '');
      assert.ok(
        output.includes('ADR-066: 实测数据自述漂移（违反 ADR-064 机器信任根）'),
        `输出必须包含精确的违规信息，实际输出: ${output}`
      );
    }
    assert.equal(threw, true, '针对 Tappy ADR-066 必须捕捉到违规并 Exit 1');
  });
});
