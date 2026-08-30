---
title: Freqtrade 量化框架使用指南
date: 2025-12-29 02:52:30
categories: ['技术','交易']
tags: ['Freqtrade','量化','因子策略','教程']
---

#Freqtrade 量化框架使用指南

## 1. 什么是Freqtrade？

Freqtrade是一个**免费开源**的加密货币算法交易框架，它可以帮你：

- 用代码编写交易策略

- 用历史数据测试策略是否赚钱（回测）

- 自动执行交易（实盘或模拟）


简单来说，它就是一个让你"编写策略→测试策略→自动交易"的工具。

---

## 2. 准备工作

### 2.1 安装Docker

Freqtrade推荐使用Docker运行，这样不用安装复杂的依赖。

1. 访问 [Docker官网](https://www.docker.com/get-started) 下载并安装Docker Desktop

2. 安装完成后，打开Docker Desktop，等待它完全启动
### 2.2 获取Freqtrade

1. 下载或克隆Freqtrade项目文件：

   ```bash
   git clone https://github.com/freqtrade/freqtrade.git
   cd freqtrade
   ```

2. 复制你的策略文件到`user_data/strategies/`目录：

   ```bash
   # 替换成你的策略文件路径
   cp /path/to/your/strategy.py user_data/strategies/

   ```

---

## 3. 快速开始：第一次回测

### 3.1 步骤1：创建配置文件

运行下面的命令创建配置文件：

```bash
docker-compose run --rm freqtrade new-config --config /freqtrade/user_data/config.json
```

然后按照提示回答问题：

- 输入交易所名称（如：binance、okx）

- 输入API密钥（可选，测试阶段可以留空，后续在config.json重新编辑）

- 选择交易模式（现货或期货）

- 设置其他参数（保持默认即可）

### 3.2 步骤2：下载历史数据

回测需要历史数据，运行下面的命令下载：

```bash
# 下载15分钟K线数据，时间范围2024年全年
docker-compose run --rm freqtrade download-data --config /freqtrade/user_data/config.json --timeframes 15m --timerange 20240101-20241231
```

### 3.3 步骤3：运行回测

现在可以运行回测了，命令如下：

```bash
# 替换成你的策略名称
docker-compose run --rm freqtrade backtesting --config /freqtrade/user_data/config.json --strategy YourStrategyName --timerange 20240101-20241231
```


### 3.4 步骤4：查看回测结果

回测完成后，看到类似这样的结果：

```

========================================

|      回测结果统计      |

========================================

总交易次数：120

胜率：65%

平均收益：2.3%

总收益率：145%

最大回撤：28%

========================================

```

  
---
## 4. 核心概念解释

### 4.1 回测

用**历史数据**模拟执行你的交易策略，看看它过去表现如何。

### 4.2 策略

你编写的交易规则集合，告诉Freqtrade：

- 什么时候买入（入场信号）

- 什么时候卖出（出场信号）

- 止损多少（亏多少就卖）

- 止盈多少（赚多少就卖）

### 4.3 杠杆

期货交易中，用少量资金控制大量资产。比如10倍杠杆，就是用100元买1000元的资产。

### 4.4 止损/止盈

- **止损**：亏到一定比例就卖出，防止更大亏损

- **止盈**：赚到一定比例就卖出，锁定利润

---

## 5. 常用命令速查

### 配置相关

```bash
# 创建新配置文件
docker-compose run --rm freqtrade new-config --config /freqtrade/user_data/config.json
```

### 数据相关

```bash
# 下载历史数据
docker-compose run --rm freqtrade download-data --config /freqtrade/user_data/config.json --timeframes 15m --timerange 20240101-20241231
```

### 回测相关

```bash
# 运行回测
docker-compose run --rm freqtrade backtesting --config /freqtrade/user_data/config.json --strategy YourStrategyName --timerange 20240101-20241231

# 查看回测交易详情
docker-compose run --rm freqtrade show-trades --config /freqtrade/user_data/config.json --strategy YourStrategyName
```

  
### 实时交易

```bash

# 模拟交易（推荐先测试）
docker-compose run --rm freqtrade trade --config /freqtrade/user_data/config.json --strategy YourStrategyName --dry-run

# 实盘交易（谨慎使用）
docker-compose run --rm freqtrade trade --config /freqtrade/user_data/config.json --strategy YourStrategyName

```

---

## 6. 简单策略示例


下面是一个非常简单的策略，基于均线交叉信号：

```python
from freqtrade.strategy import IStrategy
import talib.abstract as ta
import pandas as pd

class SimpleStrategy(IStrategy):

    # 策略接口版本
    INTERFACE_VERSION = 2

    # 盈利10%就平仓
    minimal_roi = {"0": 0.1}

    # 亏损5%就止损
    stoploss = -0.05

    # 使用15分钟K线
    timeframe = '15m'

    def populate_indicators(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:

        # 计算短期和长期均线
        dataframe['short_ma'] = ta.SMA(dataframe, timeperiod=5)
        dataframe['long_ma'] = ta.SMA(dataframe, timeperiod=20)
        return dataframe

    def populate_entry_trend(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:

        # 短期均线上穿长期均线时买入
        dataframe.loc[
            (dataframe['short_ma'] > dataframe['long_ma']) &  # 均线金叉
            (dataframe['volume'] > 0),  # 有成交量
            'buy'] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:

        # 短期均线下穿长期均线时卖出
        dataframe.loc[
            (dataframe['short_ma'] < dataframe['long_ma']) &  # 均线死叉
            (dataframe['volume'] > 0),  # 有成交量
            'sell'] = 1
        return dataframe

```

---

## 7. 常见问题

### 7.1 回测时提示"缺少数据"？

**原因**：回测需要对应的历史K线数据，但你还没有下载。

**解决方案**：使用`download-data`命令下载对应时间范围和周期的数据：

```bash
# 示例：下载2024全年15分钟K线数据
docker-compose run --rm freqtrade download-data --config /freqtrade/user_data/config.json --timeframes 15m --timerange 20240101-20241231

```

**提示**：确保下载的数据周期（如15m）和时间范围与你回测时使用的一致。

### 7.2 如何设置杠杆？

**注意**：Freqtrade不支持通过命令行参数设置杠杆，必须在策略文件中实现。

**解决方案**：在策略类中添加`custom_leverage`方法：

```python
# 在你的策略类中添加以下方法
def custom_leverage(self, pair: str, **kwargs) -> float:
    return 1.0  # 设置1倍杠杆（可根据需要调整数值）

```

### 7.3 如何查看详细的回测结果？


**方法1：使用`show-trades`命令**

```bash

docker-compose run --rm freqtrade show-trades --config /freqtrade/user_data/config.json --strategy YourStrategyName

```


**方法2：查看回测结果文件**

回测完成后，结果会保存在`user_data/backtest_results/`目录下，包含：

- 详细的交易记录CSV文件

- 可视化图表HTML文件


**方法3：使用`--export`参数导出结果**

```bash
# 回测时直接导出结果
docker-compose run --rm freqtrade backtesting --config /freqtrade/user_data/config.json --strategy YourStrategyName --export trades

```


### 7.4 可以回测多个交易对吗？

**方法1：在配置文件中设置**

编辑`config.json`，在`pair_whitelist`中添加多个交易对：

```json

"pair_whitelist": [
    "BTC/USDT",
    "ETH/USDT",
    "BNB/USDT"
]
```


**方法2：回测时使用`--pairs`参数指定**

```bash
docker-compose run --rm freqtrade backtesting --config /freqtrade/user_data/config.json --strategy YourStrategyName --pairs BTC/USDT ETH/USDT
```

**注意**：回测多个交易对会占用更多资源，建议先下载所有需要的交易对数据。

### 7.5 回测时遇到API超时错误？

**原因**：默认情况下，Freqtrade会加载交易所的所有市场数据（包括现货、期货、期权等），导致API请求超时。

**解决方案**：在`config.json`中添加`ccxt_config`配置，限制只加载期货市场：

```json

"exchange": {
    "name": "okx",
    "ccxt_config": {
        "options": {
            "defaultType": "future"  // 仅加载期货市场
        }
    },
    // 其他交易所配置...
}

```

### 7.6 如何切换期货(合约)/现货交易模式？

**解决方案**：在`config.json`中设置交易所的`defaultType`：
  
```json
"exchange": {
    "name": "okx",
    "ccxt_config": {
        "options": {
            "defaultType": "future"  // 期货模式
            // "defaultType": "spot"  // 现货模式
        }
    },
    // 其他配置...

```

**注意**：切换模式后，需要重新下载对应模式的历史数据。

---

**温馨提示**：先在模拟模式下充分测试策略，再考虑实盘交易。


**参考资料：**
- [Freqtrade官方文档](https://www.freqtrade.io/en/stable/)
- [Freqtrade GitHub仓库](https://github.com/freqtrade/freqtrade)
- [Freqtrade策略示例](https://github.com/freqtrade/freqtrade-strategies)
- [前端伪大叔](https://juejin.cn/user/3702810894146151/posts)
