import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  makeStrictBoundaryRegex,
  containsStrictInvariant,
  parseAdrContent,
} from '../core/adr-parser.mjs';

import {
  isTestPath,
  scanFileContent,
  analyzeSymbolWiring,
} from '../core/scanner.mjs';

import {
  buildAndCheckMatrix,
  generateAdrAuditReport,
} from '../core/matrix-checker.mjs';

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
});
