"""
spec-guard Python 断言打标装饰器与沙箱标记
"""
import functools
from typing import Callable, Optional

def invariant(invariant_id: str, description: str = "") -> Callable:
    """
    绑定 ADR 不变量机器断言。
    
    使用示例:
        @invariant("ADR-060:H-1", "零唤醒/零流量断言")
        def test_no_wake_lock_when_idle():
            ...
    """
    def decorator(fn: Callable) -> Callable:
        setattr(fn, "__invariant_id__", invariant_id)
        setattr(fn, "__invariant_desc__", description)
        return fn
    return decorator


def contract_only(adr: str, expire: str = "", reason: str = "") -> Callable:
    """
    标记契约沙箱中的未接线原型代码。
    
    使用示例:
        @contract_only(adr="ADR-060", expire="2026-12-01", reason="等待端侧空闲状态服务")
        def calculate_nightly_window(...):
            ...
    """
    def decorator(fn: Callable) -> Callable:
        setattr(fn, "__contract_only__", True)
        setattr(fn, "__adr__", adr)
        setattr(fn, "__expire__", expire)
        setattr(fn, "__reason__", reason)
        return fn
    return decorator
