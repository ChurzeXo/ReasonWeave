package lab.specguard.annotations

/**
 * 契约沙箱原型隔离注解
 *
 * 用于标记在垂直切片初期尚未接线至生产环境的算法原型。
 * 被此注解标记的符号受到 spec-guard 与 lab-orphan 保护，在有效截止日期前不会被判定为死代码误杀。
 *
 * @param adr 关联的 ADR 编号，如 "ADR-060"
 * @param expire 预计闭环过期的截止日期，格式为 "YYYY-MM-DD"
 * @param reason 原型暂未接线的原因与前置依赖说明
 */
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION, AnnotationTarget.PROPERTY)
@Retention(AnnotationRetention.SOURCE)
annotation class ContractOnly(
    val adr: String,
    val expire: String = "",
    val reason: String = ""
)
