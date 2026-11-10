/**
 * spec-guard TypeScript / Node 规范与打标助手
 */

/**
 * 装饰器形式 (TS Decorator)
 */
export function Invariant(invariantId: string, description: string = "") {
  return function (target: any, propertyKey: string, descriptor?: PropertyDescriptor) {
    if (descriptor) {
      descriptor.value.__invariantId__ = invariantId;
      descriptor.value.__invariantDesc__ = description;
    }
  };
}

/**
 * 契约沙箱标记 (TS Decorator)
 */
export function ContractOnly(adr: string, expire: string = "", reason: string = "") {
  return function (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) {
    const meta = { contractOnly: true, adr, expire, reason };
    if (descriptor) {
      descriptor.value.__contractOnly__ = meta;
    } else {
      target.__contractOnly__ = meta;
    }
  };
}

/**
 * JSDoc / 测试注释约定形式:
 *
 * // @invariant ADR-060:H-1
 * it('should satisfy zero network traffic', () => { ... });
 *
 * // @contractOnly ADR-060 expire: 2026-12-01
 * export function evaluateSafetyWindow() { ... }
 */
