#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
解析 docs/7S联查6人评分表.csv，生成 departments.json
用法: python scripts/csv_to_departments.py
"""

import csv
import json
import re
from pathlib import Path


def normalize_text(value):
    """清理文本：去除换行、首尾空格"""
    if value is None:
        return ''
    return str(value).replace('\r', '').replace('\n', ' ').strip()


def parse_csv_file(csv_path):
    """
    解析 CSV 文件，提取部门-办公室映射
    CSV 格式：前5行是表头，从第6行开始是数据
    第1列：部门名称（可能跨多行）
    第2列：办公室位置
    """
    departments_map = {}
    current_dept = None
    
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        rows = list(reader)
    
    # 从第6行开始解析数据（索引5，因为前5行是表头）
    for idx, row in enumerate(rows):
        if idx < 5:  # 跳过表头
            continue
        
        if len(row) < 2:
            continue
        
        dept_cell = normalize_text(row[0])
        room_cell = normalize_text(row[1])
        
        # 如果部门单元格有值，更新当前部门
        if dept_cell:
            current_dept = dept_cell
        
        # 如果没有当前部门或办公室为空，跳过
        if not current_dept or not room_cell:
            continue
        
        # 添加到映射
        if current_dept not in departments_map:
            departments_map[current_dept] = set()
        departments_map[current_dept].add(room_cell)
    
    # 按图片中的固定顺序定义部门列表
    ORDER = [
        "经营管控中心",
        "供应二部",
        "供应一部",
        "销售部",
        "人力资源部",
        "企管部",
        "审计监察部",
        "财务部",
        "法务部",
        "总经办",
        "监察部",
        "外矿部",
        "财务部 （工程楼）",
        "预算部 （工程楼）",
        "公司办公室（工程楼）",
        "工程审计",
        "工程部",
    ]

    # 转换为标准格式，按固定顺序
    departments = []
    for name in ORDER:
        if name in departments_map:
            departments.append({
                "name": name,
                "rooms": sorted(list(departments_map[name]))
            })
    
    return departments


def main():
    # 路径配置
    base_dir = Path(__file__).parent.parent  # 项目根目录
    csv_path = base_dir / "docs" / "7S联查6人评分表.csv"
    json_path = base_dir / "miniprogram" / "data" / "departments.json"
    
    print(f"📖 读取 CSV: {csv_path}")
    
    if not csv_path.exists():
        print(f"❌ 错误: 找不到文件 {csv_path}")
        return
    
    # 解析 CSV
    departments = parse_csv_file(csv_path)
    
    print(f"✅ 解析完成: 共 {len(departments)} 个部门")
    for dept in departments:
        print(f"   📁 {dept['name']}: {len(dept['rooms'])} 个办公室")
        for room in dept['rooms']:
            print(f"      📍 {room}")
    
    # 写入 JSON
    json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(departments, f, ensure_ascii=False, indent=2)
    
    print(f"\n💾 已保存到: {json_path}")
    print("\n下一步：")
    print("1. 在微信开发者工具中重新编译")
    print("2. 调用云函数 manageDepartments action='import' 导入数据")
    print("   或临时在页面中添加导入代码执行一次")


if __name__ == "__main__":
    main()
