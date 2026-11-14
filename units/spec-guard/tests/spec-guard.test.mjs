import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

import {
  makeStrictBoundaryRegex,
  containsStrictInvariant,
  parseAdrContent,
  findAdrFiles,
  loadOverlayConfig,
} from '../core/adr-parser.mjs';

import {
  isTestPath,
  scanFileContent,
  analyzeSymbolWiring,
} from '../core/scanner.mjs';

import {
  buildAndCheckMatrix,
  buildFullTriadMatrix,
  generateAdrAuditReport,
} from '../core/matrix-checker.mjs';

import {
  runMutationTest,
  generateMutants,
} from '../core/mutation-runner.mjs';

import {
  Classifier,
  CallerKind,
  countProductionCallers,
} from '../../orphan/index.mjs';

describe('spec-guard: 严格词界与边界防伪测试 (Constraint 2)', () => {
  it('应正确匹配严格词界的 Invariant ID', () => {
    assert.equal(containsStrictInvariant('这是一个 ADR-060:H-1 测试', 'ADR-060:H-1'), true);
    assert.equal(containsStrictInvariant('@Invariant("ADR-060:H-1")', 'ADR-060:H-1'), true);
    assert.equal(containsStrictInvariant('// [INVARIANT: ADR-060:H-1]', 'ADR-060:H-1'), true);
    assert.equal(containsStrictInvariant('H-1', 'H-1'), true);
    assert.equal(containsStrictInvariant('- **H-1**: 零唤醒要求', 'H-1'), true);
  });

  it('严格词界严禁误伤 H-10 或 H-1-OBSOLETE 或前缀扩展', () => {
    // 严格测试：H-1 绝不能匹配 H-10
    assert.equal(containsStrictInvariant('@Invariant("ADR-060:H-10")', 'ADR-060:H-1'), false);
    assert.equal(containsStrictInvariant('这是 H-10 描述', 'H-1'), false);

    // H-1 绝不能匹配 H-1-OBSOLETE
    assert.equal(containsStrictInvariant('@Invariant("H-1-OBSOLETE")', 'H-1'), false);

    // H-1 绝不能匹配 MY_H-1
    assert.equal(containsStrictInvariant('MY_H-1', 'H-1'), false);

    // 正则边界对象测试
    const regex = makeStrictBoundaryRegex('H-1');
    assert.equal(regex.test('H-1'), true);
    assert.equal(regex.test('H-10'), false);
    assert.equal(regex.test('H-1-DEPRECATED'), false);
  });
});

describe('spec-guard: ADR 规约解析器', () => {
  // [INVARIANT: ADR-0004:INV-1]
  // [INVARIANT: ADR-0004:INV-3]
  it('应准确提取 🔒Frozen 状态、Implementation Status 与 Invariants', () => {
    const sampleAdr = `
# ADR-060: OTA 升级规约

- **状态（Status）**：🔒 Frozen
- **日期**：2026-11-07

## 1. Context
背景内容说明。

## 2. Decision
决策内容说明。

## 3. Implementation Status
| 项 | 状态 | 说明 |
|---|---|---|
| T1 节律定时 | ✅ 已实现 | 30s tick 已接入 |
| T2 空闲判定 | ❌ 未实现 | 依赖跨端 IPC |

## 5. Consequences / Invariants
- **H-1**: 零唤醒/零网络负担约束
- **H-2**: 业务排他互斥约束
- **Gate1**: 温控熔断门禁
`;

    const res = parseAdrContent(sampleAdr, 'group/architecture/adr/ADR-060-ota.md');
    assert.equal(res.adrId, 'ADR-060');
    assert.equal(res.isFrozen, true);
    assert.equal(res.hasImplementationStatus, true);
    assert.equal(res.implementationItems.length, 2);
    assert.equal(res.implementationItems[0].status, 'verified');
    assert.equal(res.implementationItems[1].status, 'unwired');

    assert.equal(res.hasInvariantsSection, true);
    assert.equal(res.invariants.length, 3);
    assert.equal(res.invariants[0].localId, 'H-1');
    assert.equal(res.invariants[0].canonicalId, 'ADR-060:H-1');
    assert.equal(res.invariants[1].localId, 'H-2');
    assert.equal(res.invariants[2].localId, 'Gate1');
  });
});

describe('spec-guard: 多语言扫描与防伪铁律 (No-Cheat Rule)', () => {
  it('应准确识别测试文件路径', () => {
    assert.equal(isTestPath('android/app/src/test/java/AppTest.kt'), true);
    assert.equal(isTestPath('src/main/java/App.kt'), false);
    assert.equal(isTestPath('tests/unit/test_watchdog.py'), true);
    assert.equal(isTestPath('app/watchdog.py'), false);
    assert.equal(isTestPath('pkg/server_test.go'), true);
    assert.equal(isTestPath('pkg/server.go'), false);
    assert.equal(isTestPath('client.test.ts'), true);
    assert.equal(isTestPath('client.ts'), false);
  });

  it('多语言断言提取器测试', () => {
    const kotlinCode = `
      package com.tappy.test
      import lab.specguard.annotations.Invariant
      import lab.specguard.annotations.ContractOnly

      @ContractOnly(adr = "ADR-060", expire = "2026-12-01", reason = "等待空闲服务")
      class PrototypeAlgorithm { }

      class AppUpdateManagerTest {
          @Test
          @Invariant("ADR-060:H-1")
          fun testNightlyWindow() { }
      }
    `;

    const res = scanFileContent(kotlinCode, 'src/test/java/AppUpdateManagerTest.kt');
    assert.equal(res.isTest, true);
    assert.equal(res.invariants.length, 1);
    assert.equal(res.invariants[0].id, 'ADR-060:H-1');
    assert.equal(res.contracts.length, 1);
    assert.equal(res.contracts[0].adr, 'ADR-060');
    assert.equal(res.contracts[0].expire, '2026-12-01');

    // 测试 TypeScript / JSDoc 注释提取
    const tsCode = `
      // @invariant ADR-060:H-3
      it('should verify TS comment invariant', () => {});
      // @invariant: ADR-060:H-4
      it('should verify TS comment colon variant', () => {});
    `;
    const tsRes = scanFileContent(tsCode, 'client.test.ts');
    assert.equal(tsRes.invariants.length, 2);
    assert.equal(tsRes.invariants[0].id, 'ADR-060:H-3');
    assert.equal(tsRes.invariants[1].id, 'ADR-060:H-4');
  });

  // [INVARIANT: ADR-0004:INV-2]
  it('No-Cheat 规则：测试中的调用不得计入生产接线证明，生产带变量赋值调用正常计数', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-nocheat-'));
    try {
      const prodDir = path.join(tmpDir, 'src', 'main');
      const testDir = path.join(tmpDir, 'src', 'test');
      fs.mkdirSync(prodDir, { recursive: true });
      fs.mkdirSync(testDir, { recursive: true });

      // 生产中定义函数并在另一个生产文件中通过 val 赋值调用
      fs.writeFileSync(
        path.join(prodDir, 'AppUpdateManager.kt'),
        `package com.tappy
        class AppUpdateManager {
            fun shouldTriggerScheduledCheck(): Boolean = true
        }`
      );

      fs.writeFileSync(
        path.join(prodDir, 'ServiceWatchdog.kt'),
        `package com.tappy
        class ServiceWatchdog {
            fun tick() {
                val isSafe = AppUpdateManager().shouldTriggerScheduledCheck()
            }
        }`
      );

      // 测试中也调用该函数
      fs.writeFileSync(
        path.join(testDir, 'AppUpdateManagerTest.kt'),
        `package com.tappy
        class AppUpdateManagerTest {
            fun test() {
                val mgr = AppUpdateManager()
                mgr.shouldTriggerScheduledCheck()
            }
        }`
      );

      // 分析符号接线：生产中有真实调用 (val isSafe = ...)，测试中也有调用
      const wiringRes = analyzeSymbolWiring('shouldTriggerScheduledCheck', tmpDir);
      assert.equal(wiringRes.testCallers.length, 1);
      assert.equal(wiringRes.prodCallers.length, 1);
      assert.equal(wiringRes.wiringStatus, 'wired');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('spec-guard: 动态对账矩阵与漂移告警 (Code-as-Spec-Matrix)', () => {
  it('完整工作流：扫描 ADR 与源码，精准识别 Verified 与 Drift', () => {
    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-matrix-'));
    try {
      const adrDir = path.join(tmpRepo, 'group', 'architecture', 'adr');
      const testDir = path.join(tmpRepo, 'tests');
      fs.mkdirSync(adrDir, { recursive: true });
      fs.mkdirSync(testDir, { recursive: true });

      // 创建一个包含两个不变量的 Frozen ADR
      fs.writeFileSync(
        path.join(adrDir, 'ADR-060-ota.md'),
        `# ADR-060: OTA 升级规约
- **状态（Status）**：🔒 Frozen

## 3. Implementation Status
| 项 | 状态 | 说明 |
|---|---|---|
| H-1 | ✅ 已实现 | 已接线 |

## 5. Consequences / Invariants
- **H-1**: 零网络负担
- **H-2**: 业务排他互斥
`
      );

      // 仅为 H-1 编写机器断言，漏掉 H-2
      fs.writeFileSync(
        path.join(testDir, 'test_ota.py'),
        `import pytest
# [INVARIANT: ADR-060:H-1]
def test_zero_network():
    assert True
`
      );

      const matrix = buildAndCheckMatrix(tmpRepo);
      assert.equal(matrix.totalInvariantsCount, 2);
      assert.equal(matrix.verifiedCount, 1); // H-1 有断言
      assert.equal(matrix.driftCount, 1);    // H-2 处于 Frozen 但零断言，触发漂移告警！
      assert.equal(matrix.isHealthy, false);

      // 生成 Markdown 审计报告
      const auditReport = generateAdrAuditReport(matrix, 'ADR-060');
      assert.match(auditReport, /ADR-060/);
      assert.match(auditReport, /零网络负担/);
      assert.match(auditReport, /漂移脱节/);
      assert.match(auditReport, /阻断判定/);
    } finally {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  // [INVARIANT: ADR-0004:INV-3]
  // [INVARIANT: ADR-0006:INV-1]
  it('孤儿接线机检拦截实测：构造一个有单测打 @invariant 但生产调用数为 0 的样本，lab spec-guard check --check-callers 必须精准 Exit 1 阻断；在生产分发器接入后复测通过', () => {
    const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-orphan-wiring-'));
    try {
      const adrDir = path.join(tmpRepo, 'group', 'architecture', 'adr');
      const prodDir = path.join(tmpRepo, 'src', 'device');
      const testDir = path.join(tmpRepo, 'tests');
      fs.mkdirSync(adrDir, { recursive: true });
      fs.mkdirSync(prodDir, { recursive: true });
      fs.mkdirSync(testDir, { recursive: true });

      // 1. 创建 Frozen ADR-060
      fs.writeFileSync(
        path.join(adrDir, 'ADR-060-ota.md'),
        `# ADR-060: 设备互锁规约
- **状态（Status）**：🔒 Frozen

## 3. Implementation Status
| 项 | 状态 | 说明 |
|---|---|---|
| Gate1 | ✅ 已实现 | 跨端互锁守护 |

## 5. Consequences / Invariants
- **Gate1**: 跨端设备排他互斥门禁
`
      );

      // 2. 生产代码定义了核心函数 acquire_device_probe_guard，但生产无任何调用
      const prodFile = path.join(prodDir, 'device_lock.py');
      fs.writeFileSync(
        prodFile,
        `# [INVARIANT: ADR-060:Gate1]
def acquire_device_probe_guard():
    """生产核心不变量互锁函数"""
    return True
`
      );

      // 3. 测试文件单测打 @invariant 并且调用了该函数
      const testFile = path.join(testDir, 'test_device_lock.py');
      fs.writeFileSync(
        testFile,
        `import pytest
# [INVARIANT: ADR-060:Gate1]
def test_interlock():
    from src.device.device_lock import acquire_device_probe_guard
    assert acquire_device_probe_guard() is True
`
      );

      // 4. 运行 matrix check 开启 --check-callers
      const matrix = buildAndCheckMatrix(tmpRepo, { checkCallers: true });
      assert.equal(matrix.unwiredInvariants.length, 1);
      assert.equal(matrix.unwiredInvariants[0].symbolName, 'acquire_device_probe_guard');
      assert.equal(matrix.isHealthy, false);

      // 5. 校验 CLI (lab spec-guard check --check-callers) 必须 Exit 1 阻断
      const labBin = path.resolve(process.cwd(), 'bin/lab.mjs');
      let exitCode = 0;
      let out = '';
      try {
        out = execSync(`node ${labBin} spec-guard check --check-callers`, {
          cwd: tmpRepo,
          stdio: 'pipe',
          encoding: 'utf8',
        });
      } catch (err) {
        exitCode = err.status || 1;
        out = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '');
      }
      assert.equal(exitCode, 1, '生产调用数为 0 时必须精准 Exit 1 阻断');
      assert.match(out, /Zero Production Callers/);

      // 6. 在生产分发器 (Dispatcher) 接入调用
      const dispatcherFile = path.join(prodDir, 'dispatcher.py');
      fs.writeFileSync(
        dispatcherFile,
        `from src.device.device_lock import acquire_device_probe_guard

def dispatch_task():
    # 生产关键链路接入排他锁守卫
    if acquire_device_probe_guard():
        return "DISPATCHED"
    return "BLOCKED"
`
      );

      // 7. 复测：构建矩阵与 CLI 再次执行
      const reMatrix = buildAndCheckMatrix(tmpRepo, { checkCallers: true });
      assert.equal(reMatrix.unwiredInvariants.length, 0);
      assert.equal(reMatrix.isHealthy, true);

      let reExitCode = 0;
      let reOut = '';
      try {
        reOut = execSync(`node ${labBin} spec-guard check --check-callers`, {
          cwd: tmpRepo,
          stdio: 'pipe',
          encoding: 'utf8',
        });
      } catch (err) {
        reExitCode = err.status || 1;
      }
      assert.equal(reExitCode, 0, '生产分发器接入后复测必须通过 Exit 0');
      assert.match(reOut, /生产接线: 1 处/);
    } finally {
      fs.rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  // [INVARIANT: ADR-0006:INV-2]
  // [INVARIANT: ADR-0006:INV-3]
  it('变异测试反向拦截实测：构造一个断言为恒真的假测试，变异引擎注入后测试未红则判定为无效测试并阻断', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-mutation-fake-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }));
      const srcFile = path.join(tmpDir, 'service.mjs');
      const testFile = path.join(tmpDir, 'service.test.mjs');

      // 被测生产代码：包含关键接口端点 /api/v1/device/interlock
      fs.writeFileSync(
        srcFile,
        `export function getEndpoint() {
  return "/api/v1/device/interlock";
}
`
      );

      // 假测试（回音壁假测试）：不论 endpoint 变成什么，单测恒真 assert(true)
      fs.writeFileSync(
        testFile,
        `import assert from 'node:assert/strict';
import { getEndpoint } from './service.mjs';

const ep = getEndpoint();
// 假测试：没有深度断言 ep 的实际值，恒真断言
assert.equal(true, true);
`
      );

      const fakeCmd = `node ${testFile}`;

      // 变异引擎执行：注入变异后测试依然绿，判定为假测试阻断！
      const fakeResult = runMutationTest({
        repoRoot: tmpDir,
        targetFile: srcFile,
        testCmd: fakeCmd,
        mutator: 'endpoint',
      });

      assert.equal(fakeResult.status, 'MUTATION_SURVIVED', '变异注入后假测试未红，变异体存活！');
      assert.equal(fakeResult.exitCode, 1);
      assert.match(fakeResult.message, /回音壁假测试/);

      // CLI 方式执行验证：退出码必须为 1
      const labBin = path.resolve(process.cwd(), 'bin/lab.mjs');
      let cliExitCode = 0;
      try {
        execSync(`node ${labBin} spec-guard mutate --file ${srcFile} --cmd "${fakeCmd}"`, {
          cwd: tmpDir,
          stdio: 'pipe',
          encoding: 'utf8',
        });
      } catch (err) {
        cliExitCode = err.status || 1;
      }
      assert.equal(cliExitCode, 1, 'CLI 变异拦截假测试必须精准 Exit 1');

      // 编写真实敏感测试（对端点有严格断言）
      fs.writeFileSync(
        testFile,
        `import assert from 'node:assert/strict';
import { getEndpoint } from './service.mjs';

const ep = getEndpoint();
// 严格断言端点，一旦变异为 /MUTATION_BOGUS_ENDPOINT_MUTANT 测试必爆红
assert.equal(ep, "/api/v1/device/interlock");
`
      );

      const realResult = runMutationTest({
        repoRoot: tmpDir,
        targetFile: srcFile,
        testCmd: fakeCmd,
        mutator: 'endpoint',
      });

      assert.equal(realResult.status, 'MUTATION_KILLED', '变异注入后真实测试爆红，变异体被消灭！');
      assert.equal(realResult.exitCode, 0);
      assert.match(realResult.message, /变异敏感性自检通过/);

      // CLI 方式执行真实测试验证：退出码必须为 0
      let realCliExitCode = 0;
      try {
        execSync(`node ${labBin} spec-guard mutate --file ${srcFile} --cmd "${fakeCmd}"`, {
          cwd: tmpDir,
          stdio: 'pipe',
          encoding: 'utf8',
        });
      } catch (err) {
        realCliExitCode = err.status || 1;
      }
      assert.equal(realCliExitCode, 0, '真实敏感测试在变异自检中必须 Exit 0');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('orphan 单元联动测试：符号引用分类与倒排生产调用者检索', () => {
    assert.equal(Classifier.isTestPath('src/test/java/Test.kt'), true);
    assert.equal(Classifier.isTestPath('src/main/java/Main.kt'), false);

    const refProd = { path: 'src/main/Dispatcher.kt', lineNo: 10, lineText: 'mgr.lock()' };
    const refTest = { path: 'src/test/Test.kt', lineNo: 20, lineText: 'mgr.lock()' };
    const refDoc = { path: 'docs/README.md', lineNo: 5, lineText: 'mgr.lock()' };

    assert.equal(Classifier.classifyCaller(refProd), CallerKind.PRODUCTION_CALLER);
    assert.equal(Classifier.classifyCaller(refTest), CallerKind.TEST_CALLER);
    assert.equal(Classifier.classifyCaller(refDoc), CallerKind.DOC_CALLER);

    const callersEval = Classifier.evaluateCallers([refProd, refTest, refDoc]);
    assert.equal(callersEval.productionCallerCount, 1);
    assert.equal(callersEval.testCallerCount, 1);
    assert.equal(callersEval.docReferenceCount, 1);
    assert.equal(callersEval.wiringStatus, 'wired');
  });
});

describe('spec-guard v2.1: ADR 发现规则可配置化与零覆盖防护 (LAB-20261114-01-feature)', () => {
  it('findAdrFiles 支持配置 adr_dirs 与 adr_id_pattern，未配置时缺省回退四目录零回归', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-find-'));
    try {
      // 1. 缺省目录
      const defDir = path.join(tmp, 'docs', 'adr');
      fs.mkdirSync(defDir, { recursive: true });
      fs.writeFileSync(path.join(defDir, 'ADR-001-init.md'), '# ADR-001');
      fs.writeFileSync(path.join(defDir, '0002-legacy.md'), '# 0002');
      fs.writeFileSync(path.join(defDir, 'README.md'), '# Readme');

      const defFound = findAdrFiles(tmp);
      assert.equal(defFound.length, 2);

      // 2. 自定义目录与正则
      const customDir = path.join(tmp, 'docs', 'decisions');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(path.join(customDir, 'DECISION-0001-test.md'), '# DECISION-0001');
      fs.writeFileSync(path.join(customDir, 'DECISION-0002-test.md'), '# DECISION-0002');
      fs.writeFileSync(path.join(customDir, 'GUIDE.md'), '# Guide');

      const customFound = findAdrFiles(tmp, {
        adr_dirs: ['docs/decisions'],
        adr_id_pattern: 'DECISION-\\d+',
      });
      assert.equal(customFound.length, 2);
      assert.ok(customFound.every((f) => f.includes('DECISION-')));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('parseAdrContent 支持 frontmatter id 与 status 映射（active 不误判 Frozen）', () => {
    const doc = `---
id: DECISION-0007
status: active
scope:
  - src/core.ts
---
# DECISION-0007 · coreml 自愈定位架构不变量

## 背景
一些背景。

## 决定
采用 \`elementFromPoint\` 与 \`grounding_repair\` 进行定位。

## 验证
实测基准通过。
`;
    const parsed = parseAdrContent(doc, 'docs/decisions/DECISION-0007-grounding.md', {
      adr_id_pattern: 'DECISION-\\d+',
      section_aliases: {
        decision: ['决定'],
        implementation: ['验证'],
      },
    });

    assert.equal(parsed.adrId, 'DECISION-0007');
    assert.equal(parsed.status, 'active');
    assert.equal(parsed.isFrozen, false, 'active 状态不得误判为 Frozen');
    assert.equal(parsed.hasImplementationStatus, true, '## 验证 应被识别为 implementation 节');
  });

  it('totalAdrs === 0 时必须报告 ZERO_COVERAGE，覆盖率严禁为 100%，strict 模式下 exit 1 阻断', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-guard-zero-check-'));
    try {
      const matrix = buildAndCheckMatrix(tmp);
      assert.equal(matrix.adrsCount, 0);
      assert.equal(matrix.coveragePercent, 0, '零 ADR 时覆盖率必须为 0%，禁止输出 100%');
      assert.equal(matrix.zeroCoverage, true);
      assert.equal(matrix.isHealthy, false);

      const triad = buildFullTriadMatrix(tmp);
      assert.equal(triad.totalAdrs, 0);
      assert.equal(triad.coveragePercent, 0);
      assert.equal(triad.zeroCoverage, true);
      assert.equal(triad.isHealthy, false);

      let threw = false;
      try {
        execSync(`node units/spec-guard/bin/spec-guard.mjs check --strict --repo "${tmp}"`, {
          encoding: 'utf8',
          stdio: 'pipe',
        });
      } catch (err) {
        threw = true;
        assert.equal(err.status, 1);
        const out = (err.stdout || '') + (err.stderr || '');
        assert.ok(out.includes('ZERO_COVERAGE'));
      }
      assert.ok(threw, 'check --strict 在零覆盖时必须 Exit 1 阻断');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('门禁片 15-spec-guard 改为 check --full --strict，反向漂移夹具必须 Exit 1 阻断', () => {
    const hookContent = fs.readFileSync('units/spec-guard/templates/pre-commit.d/15-spec-guard', 'utf8');
    assert.ok(hookContent.includes('check --full --strict'), '门禁脚本必须调用 check --full --strict');
    assert.ok(!hookContent.includes('check --incremental'), '门禁脚本禁止残留未实现的 check --incremental');
  });
});
