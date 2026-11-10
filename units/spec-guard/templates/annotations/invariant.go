package specguard

// spec-guard Golang 注释规范
//
// 1. 在测试用例上方标记绑定不变量：
//
//    // Invariant: ADR-060:H-1
//    // Description: 验证冷却期间抓包数为0
//    func TestNoNetworkTrafficDuringCooldown(t *testing.T) {
//        ...
//    }
//
// 2. 在未接线的纯算法原型上方标记契约沙箱：
//
//    // [CONTRACT-ONLY: ADR-060, expire: 2026-12-01]
//    // Reason: 等待 IPC 管道实现
//    func CheckThermalSafety(...) bool {
//        ...
//    }
