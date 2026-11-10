/**
 * S1–S3 Solver Self-Test Protocol (求解器自检门禁套件)
 *
 * 核心三道防线：
 * - S1 (Injection Self-Test / 注入假死检出)：注入必然未引用的假符号，求解器必须 100% 检出 (+1)；
 * - S2 (In-Use Protection / 在用保护)：活跃在用符号绝不误杀 (0 误报)；
 * - S3 (Byte-Level Reproducibility / 逐字节一致可重复)：同一 HEAD blob 两次执行逐字节 SHA-256 一致。
 */

import { Solver } from './solver.mjs';
import { AndroidAdapter } from '../adapters/android/index.mjs';

export class SolverProtocol {
  /**
   * 执行完整的 S1-S3 自检门禁
   * @param {object} [opts]
   * @param {string} [opts.repoDir=process.cwd()]
   * @param {boolean} [opts.verbose=true]
   * @returns {Promise<{
   *   passed: boolean,
   *   s1: { passed: boolean, message: string },
   *   s2: { passed: boolean, message: string },
   *   s3: { passed: boolean, hash: string, message: string }
   * }>}
   */
  static async runSelfTest(opts = {}) {
    const repoDir = opts.repoDir || process.cwd();
    const verbose = opts.verbose !== false;

    if (verbose) {
      console.log('🧪 正在执行 S1–S3 求解器自检协议 (Solver Protocol Preflight)...\n');
    }

    const androidAdapter = new AndroidAdapter();
    const solver = new Solver({
      repoDir,
      ref: 'HEAD',
      adapters: [androidAdapter],
    });

    // ──────────────────────────────────────────────────────────────────
    // S1: 注入假死自检 (Injection Self-Test)
    // ──────────────────────────────────────────────────────────────────
    let s1Passed = false;
    let s1Msg = '';
    try {
      const syntheticToken = `__ORPHAN_SYNTHETIC_DEAD_SYM_${Date.now().toString(16)}_DEADBEEF__`;

      // 建立包含合成候选的 Mock 适配器
      const mockDeadAdapter = {
        id: 'synthetic-test',
        name: 'Synthetic Test Adapter',
        detect: () => true,
        extractCandidates: () => [
          {
            id: 'synthetic-dead-1',
            name: syntheticToken,
            resType: 'drawable',
            symbol: `R.drawable.${syntheticToken}`,
            primaryPath: 'res/drawable/synthetic_dead_test.png',
            qualifierPaths: ['res/drawable/synthetic_dead_test.png'],
            lineNo: 1,
            isFamily: false,
          },
        ],
      };

      const s1Solver = new Solver({
        repoDir,
        ref: 'HEAD',
        adapters: [mockDeadAdapter],
      });

      const s1Result = s1Solver.solve({ includeAlive: false });
      const found = s1Result.candidates.find(c => c.name === syntheticToken);

      if (found && found.status === 'CONFIRMED_ORPHAN' && found.confidence >= 0.95) {
        s1Passed = true;
        s1Msg = `注入假死符号 ${syntheticToken} 被 100% 精确捕获为 CONFIRMED_ORPHAN (count: +1)`;
        if (verbose) console.log(`  ✅ [S1: 假死检出通过] ${s1Msg}`);
      } else {
        s1Passed = false;
        s1Msg = `未能检出注入的假死符号或状态异常 (found: ${JSON.stringify(found)})`;
        if (verbose) console.log(`  ❌ [S1: 假死检出失败] ${s1Msg}`);
      }
    } catch (err) {
      s1Passed = false;
      s1Msg = `S1 执行异常: ${err.message}`;
      if (verbose) console.log(`  ❌ [S1: 假死检出异常] ${s1Msg}`);
    }

    // ──────────────────────────────────────────────────────────────────
    // S2: 在用保护自检 (In-Use Protection)
    // ──────────────────────────────────────────────────────────────────
    let s2Passed = false;
    let s2Msg = '';
    try {
      const activeToken = `__ORPHAN_ACTIVE_IN_USE_${Date.now().toString(16)}__`;

      // 构造 Mock 活跃适配器并向索引注入强引用行
      const mockActiveAdapter = {
        id: 'active-test',
        name: 'Active In-Use Test Adapter',
        detect: () => true,
        extractCandidates: () => [
          {
            id: 'synthetic-active-1',
            name: activeToken,
            resType: 'layout',
            symbol: `R.layout.${activeToken}`,
            primaryPath: 'res/layout/active_view.xml',
            qualifierPaths: ['res/layout/active_view.xml'],
            lineNo: 1,
            isFamily: false,
          },
        ],
      };

      const s2Solver = new Solver({
        repoDir,
        ref: 'HEAD',
        adapters: [mockActiveAdapter],
      });

      // 在求解时注入一条对 activeToken 的代码强引用
      const s2Result = s2Solver.solve({
        includeAlive: true,
        extraBlobs: {
          'src/MainActivity.kt': `package com.example\nval view = setContentView(R.layout.${activeToken})`,
        },
      });
      const activeCand = s2Result.candidates.find(c => c.name === activeToken);

      if (activeCand && activeCand.status === 'ALIVE') {
        s2Passed = true;
        s2Msg = `在用符号 ${activeToken} 成功识别为 ALIVE，未被误判为孤儿 (0 误报)`;
        if (verbose) console.log(`  ✅ [S2: 在用保护通过] ${s2Msg}`);
      } else {
        s2Passed = false;
        s2Msg = `在用符号被误判为孤儿或未检出 (candidate: ${JSON.stringify(activeCand)})`;
        if (verbose) console.log(`  ❌ [S2: 在用保护失败] ${s2Msg}`);
      }
    } catch (err) {
      s2Passed = false;
      s2Msg = `S2 执行异常: ${err.message}`;
      if (verbose) console.log(`  ❌ [S2: 在用保护异常] ${s2Msg}`);
    }

    // ──────────────────────────────────────────────────────────────────
    // S3: 逐字节一致可重复 (Byte-Level Reproducibility)
    // ──────────────────────────────────────────────────────────────────
    let s3Passed = false;
    let s3Msg = '';
    let hash1 = '';
    try {
      const run1 = solver.solve();
      const run2 = solver.solve();

      hash1 = Solver.computeDeterministicHash(run1);
      const hash2 = Solver.computeDeterministicHash(run2);

      if (hash1 === hash2 && run1.candidates.length === run2.candidates.length) {
        s3Passed = true;
        s3Msg = `两次运行产出逐字节一致 SHA-256: ${hash1} (candidates count: ${run1.candidates.length})`;
        if (verbose) console.log(`  ✅ [S3: 逐字节一致通过] ${s3Msg}`);
      } else {
        s3Passed = false;
        s3Msg = `两次运行哈希不一致! run1=${hash1}, run2=${hash2}`;
        if (verbose) console.log(`  ❌ [S3: 逐字节一致失败] ${s3Msg}`);
      }
    } catch (err) {
      s3Passed = false;
      s3Msg = `S3 执行异常: ${err.message}`;
      if (verbose) console.log(`  ❌ [S3: 逐字节一致异常] ${s3Msg}`);
    }

    const allPassed = s1Passed && s2Passed && s3Passed;
    if (verbose) {
      console.log();
      if (allPassed) {
        console.log('🎉 S1–S3 求解器自检协议全部通过 (Protocol Exit 0)！\n');
      } else {
        console.error('🚫 S1–S3 求解器自检门禁未通过 (Protocol Exit 1)！\n');
      }
    }

    return {
      passed: allPassed,
      s1: { passed: s1Passed, message: s1Msg },
      s2: { passed: s2Passed, message: s2Msg },
      s3: { passed: s3Passed, hash: hash1, message: s3Msg },
    };
  }
}
