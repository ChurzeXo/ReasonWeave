package lab.specguard.annotations

/**
 * 架构不变量机器断言打标注解
 *
 * 用于在测试函数或类上绑定对应的 ADR 架构不变量，供 spec-guard 对账引擎动态扫描。
 *
 * @param id 严格格式的不变量标识，如 "ADR-060:H-1" 或 "H-1"
 * @param description 可选的不变量描述
 */
@Target(AnnotationTarget.FUNCTION, AnnotationTarget.CLASS)
@Retention(AnnotationRetention.SOURCE)
annotation class Invariant(
    val id: String,
    val description: String = ""
)
