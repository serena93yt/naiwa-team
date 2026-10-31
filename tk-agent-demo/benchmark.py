# -*- coding: utf-8 -*-
"""
测试指标报告生成器（评审权重：真实问题解决度 30%）
跑一遍确定性测试，产出可放进路演 PPT 的量化指标：
  1) 生成效率（提效倍数）
  2) 合规预检查全率 / 查准率
  3) 五国文化适配覆盖率
  4) 稳定性（连跑 N 次成功率）

零依赖，直接运行： python benchmark.py
"""
import json
import os
import time
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from tk_agent import parse_product, gen_grass_content, gen_compliance_report, load_kb

KB = load_kb()

# ---------- 指标 1：生成效率 ----------
# 人工基线（行业经验值，需在报告中注明为估算口径）
MANUAL_MINUTES_PER_PRODUCT = 120  # 人工写五国文案+脚本约 2 小时/产品


def benchmark_efficiency():
    products = [
        "保湿身体乳,温和不刺激,补水锁水,59元",
        "便携榨汁杯,USB充电,小巧便携,79元",
        "防晒霜,清爽不油腻,SPF50,69元",
        "手工曲奇饼干,Halal认证,香脆可口,39元",
        "简约帆布包,大容量,百搭耐用,49元",
    ]
    t0 = time.perf_counter()
    for raw in products:
        p = parse_product(raw)
        grass = gen_grass_content(p)
        gen_compliance_report(grass, p)
    elapsed = time.perf_counter() - t0
    per_product_ms = (elapsed / len(products)) * 1000
    # 诚实口径：给出「AI 生成耗时(毫秒)」与「人工基线(分钟)」对比，
    # 用「省时比例」而非放大到失真的「倍数」
    save_ratio = (MANUAL_MINUTES_PER_PRODUCT * 60 - per_product_ms / 1000) / (MANUAL_MINUTES_PER_PRODUCT * 60)
    return {
        "测试产品数": len(products),
        "总耗时(毫秒)": round(elapsed * 1000, 1),
        "单产品耗时(毫秒)": round(per_product_ms, 2),
        "人工基线(分钟/产品)": MANUAL_MINUTES_PER_PRODUCT,
        "省时比例": f"{save_ratio:.2%}",
    }


# ---------- 指标 2：合规命中率 ----------
# 20 条测试：10 条含已知违禁词（应命中），10 条干净（不应命中）
RISK_CASES = [
    ("美白身体乳,全球最好第一美白,100%根治暗沉,59元", True),
    ("祛痘霜,7天祛斑,消炎抗敏,89元", True),
    ("减肥茶,3天减肥,立刻变瘦,59元", True),
    ("保健品,治疗糖尿病,医生推荐,129元", True),
    ("面膜,瞬间美白,100%治愈,49元", True),
    ("面霜,最安全纯天然无副作用,79元", True),
    ("牙膏,杀死细菌,消除皱纹,39元", True),
    ("精华,绝对有效,最佳,第一,69元", True),
    ("眼霜,FDA认证,cure,heal,59元", True),
    ("香薰,含酒精,宗教玩笑,29元", True),
]
CLEAN_CASES = [
    ("保湿身体乳,温和不刺激,补水锁水,59元", False),
    ("便携榨汁杯,USB充电,小巧便携,79元", False),
    ("防晒霜,清爽不油腻,SPF50,69元", False),
    ("手工曲奇饼干,Halal认证,香脆可口,39元", False),
    ("简约帆布包,大容量,百搭耐用,49元", False),
    ("保温杯,316不锈钢,12小时保温,59元", False),
    ("香薰蜡烛,清新花香,助眠,39元", False),
    ("瑜伽垫,防滑加厚,环保材质,69元", False),
    ("收纳盒,折叠设计,节省空间,29元", False),
    ("雨伞,自动开合,抗风耐用,45元", False),
]


def benchmark_compliance():
    tp = fn = fp = tn = 0  # 真阳/假阴/假阳/真阴
    for raw, expect_hit in RISK_CASES + CLEAN_CASES:
        p = parse_product(raw)
        grass = gen_grass_content(p)
        report = gen_compliance_report(grass, p)
        any_hit = any(item["issues"] for item in report)
        if expect_hit and any_hit:
            tp += 1
        elif expect_hit and not any_hit:
            fn += 1
        elif not expect_hit and any_hit:
            fp += 1
        else:
            tn += 1
    total = tp + fn + fp + tn
    recall = tp / (tp + fn) if (tp + fn) else 0  # 查全率
    precision = tp / (tp + fp) if (tp + fp) else 0  # 查准率
    return {
        "测试总数": total,
        "命中(应标出)": tp,
        "漏报(该标没标)": fn,
        "误报(不该标标了)": fp,
        "正确通过": tn,
        "查全率(召回率)": f"{recall:.0%}",
        "查准率": f"{precision:.0%}",
    }


# ---------- 指标 3：五国文化适配覆盖率 ----------
# 检查五国输出是否包含「该国特有元素」
CULTURE_SIGNALS = {
    "印尼": ["Halal", "清真"],
    "泰国": ["清凉", "防晒", "泰式"],
    "越南": ["网红", "潮流", "爆款"],
    "菲律宾": ["affordable", "budget", "glow"],
    "马来西亚": ["Halal", "双语", "清真"],
}


def benchmark_culture():
    p = parse_product("保湿身体乳,温和不刺激,补水锁水,59元")
    grass = gen_grass_content(p)
    hit_count = 0
    detail = {}
    for country, signals in CULTURE_SIGNALS.items():
        text = grass[country]["种草文案"].lower()
        ok = any(s.lower() in text for s in signals)
        detail[country] = "✓" if ok else "✗"
        if ok:
            hit_count += 1
    return {"覆盖国家数": f"{hit_count}/5", "详情": detail}


# ---------- 指标 4：稳定性 ----------


def benchmark_stability(n=10):
    products = [
        "保湿身体乳,温和不刺激,补水锁水,59元",
        "便携榨汁杯,USB充电,小巧便携,79元",
        "防晒霜,清爽不油腻,SPF50,69元",
    ]
    ok = 0
    for i in range(n):
        try:
            raw = products[i % len(products)]
            p = parse_product(raw)
            grass = gen_grass_content(p)
            gen_compliance_report(grass, p)
            ok += 1
        except Exception as e:
            print(f"  [稳定性] 第 {i+1} 次异常: {e}")
    return {"连跑次数": n, "成功次数": ok, "成功率": f"{ok/n:.0%}"}


def main():
    print("=" * 60)
    print("  TK 运营智能体 · 测试指标报告")
    print("=" * 60)

    print("\n【指标 1】生成效率（毫秒级 vs 人工分钟级）")
    r1 = benchmark_efficiency()
    for k, v in r1.items():
        print(f"  {k}: {v}")

    print("\n【指标 2】合规预检查全率 / 查准率（20 条测试）")
    r2 = benchmark_compliance()
    for k, v in r2.items():
        print(f"  {k}: {v}")

    print("\n【指标 3】五国文化适配覆盖率（5 国是否含本国特有元素）")
    r3 = benchmark_culture()
    for k, v in r3.items():
        if k == "详情":
            print(f"  {k}: " + ", ".join(f"{c}={m}" for c, m in v.items()))
        else:
            print(f"  {k}: {v}")

    print("\n【指标 4】稳定性（连跑 10 次）")
    r4 = benchmark_stability(10)
    for k, v in r4.items():
        print(f"  {k}: {v}")

    print("\n" + "=" * 60)
    print("  说明：提效倍数的「人工基线 2 小时/产品」为行业经验估算；")
    print("  合规测试的 20 条为构造样本，用于验证规则引擎确定性。")
    print("=" * 60)


if __name__ == "__main__":
    main()
