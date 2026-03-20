# 配置指南 - 新增策略编辑器功能

## 配置文件更新

在 `config.json` 中，需要确保包含以下字段用于新的策略编辑器功能：

```json
{
  "units": {
    "demacia": [
      {"id": "garen", "name": "盖伦", "type": "前排战士"},
      {"id": "lux", "name": "拉克丝", "type": "远程法师"},
      {"id": "jarvan", "name": "嘉文四世", "type": "前排控制"},
      {"id": "poppy", "name": "波比", "type": "前排坦克"},
      {"id": "quinn", "name": "奎因", "type": "远程刺客"}
    ],
    "noxus": [
      {"id": "darius", "name": "达瑞斯", "type": "前排战士"},
      {"id": "dragonpup", "name": "诺克萨斯龙犬", "type": "远程闪避"},
      {"id": "tribalpeasant", "name": "部落战士", "type": "近战"},
      {"id": "dragonlizard", "name": "龙蜥", "type": "飞行"},
      {"id": "stonebeetle", "name": "精锐石甲虫", "type": "远程"}
    ],
    "other": []
  },
  "demacia_units": [
    {"id": "garen", "name": "盖伦", "type": "前排战士"},
    {"id": "lux", "name": "拉克丝", "type": "远程法师"}
  ],
  "enemy_compositions": [
    {
      "id": "comp_1",
      "name": "诺克萨斯龙犬队",
      "threat_level": 4,
      "description": "由龙犬组成的远程闪避阵容，需要近战单位克制",
      "units": ["诺克萨斯龙犬", "诺克萨斯龙犬", "部落战士"]
    },
    {
      "id": "comp_2",
      "name": "飞行掠夺队",
      "threat_level": 5,
      "description": "以龙蜥为核心的飞行阵容，威胁度极高",
      "units": ["龙蜥", "龙蜥", "精锐石甲虫"]
    },
    {
      "id": "comp_3",
      "name": "均衡进攻队",
      "threat_level": 3,
      "description": "远近结合的标准阵容",
      "units": ["诺克萨斯龙犬", "部落战士", "石甲虫"]
    }
  ],
  "tech_tree": [
    {
      "chapter": "序章",
      "techs": [
        {"id": "tech_1", "name": "德玛西亚坚钢-卫兵", "level": 1},
        {"id": "tech_2", "name": "市政领导术", "level": 1}
      ]
    },
    {
      "chapter": "第二章",
      "techs": [
        {"id": "tech_3", "name": "战斗领导术", "level": 2},
        {"id": "tech_4", "name": "护林场强化", "level": 2}
      ]
    }
  ]
}
```

## 关键字段说明

### `units` 对象

用于填充敌人和防守单位选择器。包含三个派系：

**敌人来源**：从 `noxus`、`demacia` 中选择  
**防守来源**：从 `demacia` 中选择（玩家方始终是德玛西亚）

### `enemy_compositions` 数组

用于"预设敌人阵容"下拉菜单。每个元素包含：

- `id`: 唯一标识符
- `name`: 阵容显示名称
- `threat_level`: 威胁等级（1-5），用于难度评分
- `description`: 阵容描述
- `units`: 单位数组（使用单位名称）

### `tech_tree` 数组

用于科技选择器。按章节组织。每个科技包含：

- `id`: 科技 ID
- `name`: 科技名称
- `level`: 解锁等级

## 前端初始化何时调用

```javascript
// 在 app.js 的 populateFormSelects() 函数中
// 这个函数在加载配置后自动调用

function populateFormSelects() {
    if (!config) return;
    
    // ✅ 敌人选择下拉菜单
    const searchByEnemySelect = document.getElementById('search-enemy-preset');
    config.enemy_compositions.forEach(comp => {
        // 创建 <option>
    });
    
    // ✅ 敌人单位选择器
    const enemyUnitSelect = document.getElementById('enemy-unit-select');
    config.units.noxus.forEach(unit => {
        // 创建 <option>
    });
    
    // ✅ 防守单位列表
    const counterContainer = document.getElementById('counter-units-available');
    config.units.demacia.forEach(unit => {
        // 创建可拖拽单位
    });
}
```

## 重要提示

1. **单位名称一致性**：
   - `units[].name` 必须与 `enemy_compositions[].units[]` 中的名称一致
   - 用于相似度计算中的名称匹配

2. **敌人阵容预设**：
   - 建议包含 3-5 个预设敌人阵容
   - 覆盖不同威胁等级（1-5 星）
   - 根据豆包报告中的敌人类型设置

3. **科技选择**：
   - 科技名称应与游戏中的实际科技名称一致
   - 按等级解锁顺序排列，便于玩家理解

4. **前端缓存**：
   - 配置加载后会被缓存在全局 `config` 变量
   - 支持动态更新（修改 JSON 并重新加载页面）

## 示例：完整的阵容配置

```javascript
// 示例：如何在 config.json 中定义一个复杂的敌人阵容

{
  "id": "comp_difficult",
  "name": "诺克萨斯精英队",
  "threat_level": 5,
  "description": "包含多个远程单位和近战坦克的精英阵容，需要混合防守策略",
  "units": [
    "诺克萨斯龙犬",    // 远程闪避
    "诺克萨斯龙犬",    // 远程闪避
    "部落战士",        // 近战
    "精锐石甲虫",      // 远程高防
    "龙蜥"             // 飞行单位
  ]
}
```

## 数据流示意

```
config.json 加载
    ↓
populateFormSelects() 初始化
    ├─ 敌人选择器 ← enemy_compositions
    ├─ 敌人单位 ← units.noxus/demacia
    ├─ 防守单位 ← units.demacia
    └─ 科技树 ← tech_tree
    
用户操作
    ├─ 选择敌人阵容 → searchByEnemyLineup()
    ├─ 添加敌人单位 → enemyQueue[]
    └─ 选择防守单位 → 拖拽到 counter-units-selected
    
提交策略
    └─ create_strategy() → P2P 网络广播
```

## 调试提示

### 检查配置是否加载
```javascript
// 在浏览器控制台执行
console.log(config);
// 应输出完整的配置对象
```

### 检查敌人列表
```javascript
console.log(config.enemy_compositions);
// 应输出预设敌人阵容数组
```

### 检查单位是否正确映射
```javascript
console.log(config.units.demacia);
console.log(config.units.noxus);
```

### 测试相似度计算
```javascript
// 在浏览器控制台执行搜索
searchByEnemyLineup();
// 应返回推荐的策略列表
```

## 常见问题

**Q: 为什么搜索没有返回结果？**  
A: 确保：
   1. 敌人阵容名称与数据库中的策略 `target_hero` 字段匹配
   2. 已经创建或加载了至少一个策略
   3. 相似度阈值（代码中为 > 0.0）已满足

**Q: 如何添加新的敌人阵容？**  
A: 在 `config.json` 的 `enemy_compositions` 数组中添加新项，然后刷新页面

**Q: 拖拽功能不工作？**  
A: 检查浏览器控制台是否有错误，确保 `counter-units-available` 和 `counter-units-selected` 元素存在

**Q: 如何同步到 P2P 网络？**  
A: 发布策略时会自动调用 `p2p_receive_json()`，确保网络已连接（查看仪表盘的网络状态）

---

**更新日期**: 2026 年 3 月 20 日
