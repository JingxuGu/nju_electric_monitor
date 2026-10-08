# 南京大学电费监控脚本

这是一个用于监控南京大学电费充值页面剩余电量的Python脚本，并提供可视化网页面板。

[![仅20次电费变化曲线](data/recent_20_changes.png)](https://file+.vscode-resource.vscode-cdn.net/d%3A/Documents/Github/nju_electric_monitor/data/electricity_trend.png)

[![电费变化曲线](data/electricity_trend.png)](data/electricity_trend.png)

[点击查看电量数据表（CSV）](data/electricity_data.csv)

## 🌟功能特性

- 自动登录南京大学电费充值系统
- **支持两种验证方式**：传统验证码（ddddocr OCR）和滑块验证（captcha-recognizer AI识别）
- **自动检测验证方式**：智能识别当前页面是验证码还是滑块，自动切换处理流程
- **多轮重试机制**：传统验证码（外层×内层）和滑块验证（完整流程重试）确保高成功率
- **ChromeDriver 自动匹配**：本地版本不匹配时自动回退 Selenium Manager 下载
- 提取剩余电量信息
- 支持无头模式运行
- 数据保存为JSON和CSV格式
- 详细的日志记录
- **可视化网页面板，支持交互式电量曲线、充值建议与预估使用天数**
- 一键批处理启动与网页自动打开

> 📖 **完整使用指南**：请查看 [GUIDE.md](GUIDE.md)，包含详细的安装部署、配置说明、验证机制详解、故障排除和开发指南。

## 🌐 网页生成与自动更新

网页沿用 `src/web_panel.py` 的现代简约页面、交互趋势图和充值建议，GitHub Pages 托管生成后的静态 HTML，无需常驻服务器。网页显示最新数据的采集时间；“刷新页面”读取已发布的数据，不会启动学校系统查询。

### 自动更新

`.github/workflows/deploy-pages.yml` 在定时采集工作流 **Auto Monitor Schedule** 成功结束后运行，也支持网页代码或 CSV 更新触发，以及手动运行。它读取 `master` 分支的最新 CSV；采集或数据推送出现问题时，页面的采集时间可用于识别旧数据。

网站构建只需 Flask 和 pandas，不需要安装浏览器、OCR 模型或提供学校/邮件凭据。只发布 `_site/`，不会把配置文件和运行日志放进网站。页面支持 7 天 / 30 天 / 90 天 / 全部历史趋势，也可点击“自定义”，在按钮下方的小型选择栏填写开始与结束日期，按北京时间包含两天的全部记录；选择栏带淡入、向下展开动画，点击外部或按 Esc 收起，应用区间后曲线从下方升起。支持悬停读数和充值金额估算，顶部标注监控宿舍“南京大学苏州校区 · 诚园甲 · 0816”；手机布局自动适配。

日均用电按最近 7 天内至少跨度一天的有效读数计算，电量增加不计入耗电；预计可用天数是根据该平均用量的估算。缺少足够记录时显示空值。页面时间统一显示为北京时间。

充值建议默认购买未来 30 天用电量，暂按 0.50 元/度计算（未确认当前宿舍官方单价），可以在页面修改电价和目标天数。建议金额 = 日均用电 × 目标天数 × 电价，金额精确到分；充值后总可用天数 = max(0, 当前余量 + 建议金额 ÷ 电价) ÷ 日均用电。天数是按近期用量的估算，页面不进行实际充值。

### 本地生成和预览

```bash
python -m venv .venv-web
source .venv-web/bin/activate
python -m pip install -r requirements-web.txt
python src/build_site.py
python -m http.server 8000 --bind 127.0.0.1 --directory _site
```

浏览器打开 `http://127.0.0.1:8000/`。Windows 用户可用 `.venv-web\Scripts\activate` 激活环境。

## 🤖Github Actions 自动运行

本项目已集成 Github Actions 自动定时监控与数据更新，无需本地部署即可自动采集和推送电量数据。

- 自动定时任务：每天多次自动运行，采集电量数据并推送到仓库。
- 自动安装依赖、中文字体、ChromeDriver、Tesseract OCR。
- 自动生成数据文件和可视化图片。
- 运行日志和数据自动提交到仓库。

**如何启用/配置自动运行：**

1. 在仓库设置 Secrets，添加 `NJU_USERNAME` 和 `NJU_PASSWORD`。
2. config_workflow.json中可以配置参数，`NJU_USERNAME` 和 `NJU_PASSWORD`不变即可
3. Actions 会自动拉取凭据并运行，无需手动操作。
4. 可在 Actions 页面查看运行日志和结果。

config_workflow.json 部分参数：

- `captcha_retry_count`: 验证码识别重试次数（建议 3–10 次，当前示例为 4）
- `save_captcha_images`: 是否保存验证码图片用于调试（默认 true）
- `test_mode`: 是否在关键步骤保存页面快照到 `data/test_snapshots_workflow`（默认 false，仅调试时建议开启）
- `enable_email_alert`: 是否启用电量低于阈值时的邮件通知（默认 true）
- `alert_threshold_warn`: 一般提醒阈值（单位：度，默认 200）
- `alert_threshold_high`: 重要提醒阈值（单位：度，默认 10）
- `alert_threshold_critical`: 紧急提醒阈值（单位：度，默认 5）

## 🖥️本地运行方法

> 💡 **首次使用？** 建议先阅读 [完整使用指南 GUIDE.md](GUIDE.md)，包含详细的安装部署、配置说明和故障排除。

Github Actions 中已支持电量预警邮件：当剩余电量低于配置的阈值时，会自动发送带有近期电费曲线图的提醒邮件。

### 环境要求（本地运行）

- Python 3.9+（推荐 3.11，与 Github Actions 一致）
- Chrome浏览器
- ChromeDriver（已包含在chromedriver-win64目录中）

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 环境测试（推荐）

在运行主脚本之前，建议先运行环境测试：

```bash
python tests/test_environment.py
```

### 3. 解决PIL兼容性问题（重要）

如果遇到 `module 'PIL.Image' has no attribute 'ANTIALIAS'` 错误，请运行：

```bash
python src/fix_pil_compatibility.py
```

### 4. 准备ChromeDriver

确保项目根目录下有 `chromedriver-win64` 文件夹，并包含 `chromedriver.exe` 文件。

### 5. 配置脚本

首次运行时会自动创建 `config.json` 配置文件，或者手动创建：

- `captcha_retry_count`: 验证码识别重试次数（默认5次）
- `save_captcha_images`: 是否保存验证码图片用于调试（默认true）

```json
{
    "username": "你的用户名",
    "password": "你的密码",
    "auto_login": true,
    "headless_mode": true,
   "captcha_retry_count": 5,
   "save_captcha_images": true,
    "log_level": "INFO"
}
```

### 6. 运行主监控脚本

#### 方法1：使用批处理文件（推荐）

```bash
run_auto_monitor.bat
```

#### 方法2：直接运行Python脚本

```bash
python src/nju_electric_monitor_auto.py
```

或指定配置文件：

```bash
python src/nju_electric_monitor_auto.py config.json
```

### 7. 启动可视化网页面板

#### 推荐方式：一键批处理启动

```bash
run_web_panel.bat
```

- 会自动激活虚拟环境并启动网页服务
- 自动用Edge或Chrome浏览器打开 http://127.0.0.1:5000/
- 支持桌面快捷方式

#### 手动方式

```bash
python src/web_panel.py
```

然后浏览器访问 http://127.0.0.1:5000/

### 8. 调试与测试工具

- 页面结构调试：
  ```bash
  python tests/debug_page_structure.py
  ```
- 验证码识别测试：
  ```bash
  python tests/test_captcha_recognition.py
  ```

## 📄输出文件

- `data/electricity_data.json`：电量数据（JSON 行格式）
- `data/electricity_data.csv`：电量数据（CSV 格式，列为 time/num/unit）
- `data/electricity_trend.png`：完整历史电量变化曲线图
- `data/recent_20_changes.png`：最近 20 次电量变化曲线图（workflow/auto 版本）
- `data/captcha_debug.png`：最近一次验证码截图（用于快速查看验证码样式）
- `data/captcha_auto/*.png`：本地 auto 版本每轮重试保存的验证码图片，识别成功后会按识别结果重命名为 `PCET.png` 等
- `data/captcha_workflow/*.png`：GitHub Actions workflow 运行时每轮重试保存的验证码图片，识别成功后同样按识别结果重命名
- `logs/nju_electric_monitor-YYYY-MM-DD-HH.log`：主脚本按小时滚动生成的运行日志
- `logs/workflow_wrapper_*.log`：CI 包装脚本输出的完整运行日志（包含环境信息、字体诊断等）

## 🏁网页面板功能

- 展示电量变化曲线，支持切换时间范围、悬停和键盘查看读数
- 显示建议充值金额和充值后总计可用天数，支持调整目标天数与电价
- 现代简约 UI 设计，适配桌面与移动端

## 💡注意事项

1. 建议优先使用 Github Actions 自动运行，无需本地部署。
2. 本地运行时确保Chrome浏览器版本与ChromeDriver版本兼容。
3. 如果验证码识别失败，脚本会提示手动输入。
4. 建议在无头模式下运行以提高性能。
5. 请妥善保管登录凭据。
6. **重要**：如遇PIL兼容性问题，请运行 `src/fix_pil_compatibility.py`
7. 如果无法提取电量信息，请运行 `tests/debug_page_structure.py` 分析页面结构。
8. 如果验证码识别不正确，请运行 `tests/test_captcha_recognition.py` 测试识别效果。

## 🔐故障排除

### PIL兼容性问题（常见）

如果遇到 `module 'PIL.Image' has no attribute 'ANTIALIAS'` 错误：

1. **运行修复脚本**：

   ```bash
   python src/fix_pil_compatibility.py
   ```
2. **手动修复**：在脚本开头添加：

   ```python
   from pil_compatibility_patch import *
   ```
3. **降级Pillow版本**（如果修复脚本不起作用）：

   ```bash
   pip install Pillow==9.5.0
   ```

### 环境问题

如果遇到环境配置问题：

1. 运行 `python tests/test_environment.py` 检查环境配置
2. 确保所有依赖正确安装：`pip install -r requirements.txt`
3. 检查Python版本是否满足要求（建议 >= 3.9，推荐 3.11）

### ChromeDriver问题

如果遇到ChromeDriver相关错误，请检查：

1. `chromedriver-win64/chromedriver.exe` 文件是否存在
2. ChromeDriver版本是否与Chrome浏览器版本匹配
3. **脚本已内置自动回退**：本地版本不匹配时，会自动使用 Selenium Manager 下载匹配版本
4. 如需手动更新，下载对应版本: https://chromedriver.chromium.org/downloads

### OCR识别问题

如果验证码识别失败：

1. 检查网络连接
2. 确保 ddddocr 安装成功（`pip install -r requirements.txt` 会自动安装）
3. 尝试手动输入验证码
4. 运行 `python tests/test_captcha_recognition.py` 测试识别效果
5. 适当调大 `captcha_retry_count` 或查看 `data/captcha_auto` / `data/captcha_workflow` 中的验证码截图，人工比对识别结果

### 滑块验证问题

如果滑块验证失败：

1. 确保 captcha-recognizer 已安装（`pip install -r requirements.txt`）
2. 运行滑块验证测试：`python tests/test_verification_flow.py`
3. 滑块验证已内置多轮重试（默认3轮），单次失败会自动重新截取、识别、拖拽
4. 查看日志中 `滑块缺口 box=` 信息，确认缺口检测是否准确

### 电量信息提取问题

如果无法提取电量信息：

1. 运行 `python tests/debug_page_structure.py` 分析页面结构
2. 根据分析结果调整脚本中的选择器

### 验证码识别问题

如果验证码识别不正确：

1. 运行 `python tests/test_captcha_recognition.py` 测试不同的图像处理方法
2. 查看生成的调试图片，选择最清晰的处理方法
3. 适当调大 `captcha_retry_count`，或直接在本地通过手动输入验证码兜底

## 许可证

MIT License
