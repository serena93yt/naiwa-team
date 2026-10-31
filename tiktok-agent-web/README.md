# TikBoost AI · 东南亚 TikTok 运营智能体

面向东南亚 TikTok 中小卖家的运营辅助工具：从**爆品选品**到**多语言种草内容 / 直播话术生成**，再到**合规预检**与**一键导出**，串成一条完整链路。覆盖印尼（ID）、泰国（TH）、越南（VN）、菲律宾（PH）、马来西亚（MY）五个站点。

## 核心功能

| 模块 | 说明 |
| --- | --- |
| 数据看板 | 各站点概览与快捷入口 |
| 爆品搜索 | 按国家 / 价格 / 销量 / 增长率 / 达人数等条件筛选，支持 EchoTik 实时数据与本地演示数据两种数据源；结果可导出 PDF |
| 种草内容生成 | 一次生成五国短视频种草文案（标题 / 正文 / 标签），支持「真实 LLM」与「模拟数据」两种运行模式 |
| 直播话术生成 | 与种草内容**同页同时生成**，按【开场留人】→【产品讲解】→【场景演示】→【逼单促单】→【互动引导】分段；用滑块在两套内容间切换，切换不丢失内容 |
| 内容详情与整改 | 单国内容可手动编辑、让 AI 改写、一键整改；给出「修改前 → 修改后」对比。改动实时同步回列表与导出内容 |
| 合规预检 | 六维风险体检（绝对化用语 / 医疗疗效 / 夸大承诺 / 诱导促销 / 宗教文化 / 竞品贬损），输出合规分与结论（可投放 / 需修改 / 禁投），并召回知识库依据 |
| 知识库 | 四库维护（市场画像 / 合规 / 文化 / 脚本模板），合规判定从中召回条目 |
| AI 设置 | 配置模型、API 地址、Key 与提示词，切换模拟 / 真实模式 |

## 技术栈

React 18 + TypeScript + Vite 5 + React Router 6；PDF 导出使用 html2canvas-pro + jsPDF。无后端，EchoTik 与大模型请求通过 Vite 开发/预览服务器代理转发以绕开浏览器跨域限制。

## 快速开始

需要 Node.js 18 及以上。

```bash
npm install      # 安装依赖
npm run dev      # 开发模式，默认 http://localhost:5173
npm run build    # 构建产物到 dist/
npm run preview  # 预览构建产物，默认 http://localhost:4173
```

单文件演示版（JS/CSS 全部内联进一个 HTML，双击即可打开，方便直接发给别人）：

```bash
npm run build:single   # 产出 dist-single/index.html
```

> 单文件版没有服务端，会自动降级为「模拟数据 + 本地演示数据」，EchoTik 实时接口不可用。

## EchoTik 实时数据配置

爆品搜索默认走 EchoTik 实时接口，需要配置开放平台凭证。凭证保存在**服务端**（由 Vite 代理注入 `Authorization` 头），不会进入前端代码与打包产物。

**方式一（推荐，热更新无需重启）**：启动服务后打开「搜索配置」页 → 填写 username / password 与访问口令 → 保存。保存后所有访客立即生效。

**方式二（环境变量）**：在项目根目录创建 `.env`：

```
ECHOTIK_USERNAME=你的用户名
ECHOTIK_PASSWORD=你的密码
ECHOTIK_SETUP_KEY=1234
```

`ECHOTIK_SETUP_KEY` 是「保存凭证」接口的访问口令，默认 `1234`，建议自行修改。改动此文件需要重新构建并重启服务。

凭证也可直接写入 `echotik-credentials.json`（同目录），优先级高于 `.env`。

### 常见错误码

| 返回 | 含义 | 处理 |
| --- | --- | --- |
| `402 Usage Limit Exceeded` | 凭证有效，但账号套餐额度已耗尽或到期 | 到 EchoTik 开放平台续费 / 提额；额度恢复后直接重试，无需改代码 |
| `403 get auth error` | 服务端未配置凭证或凭证无效 | 重新保存 username / password，或到开放平台核对密钥状态 |
| `404` | `/echotik` 代理未生效 | 重启预览服务，使 `vite.config.ts` 生效 |
| `429` | 调用频率超限 | 降低每国抓取页数或稍后重试 |

额度不足或请求失败时，爆品搜索会自动回退本地演示数据并给出提示，不影响演示。

## 公网访问（可选）

项目未内置穿透能力。如需公网访问，可用 cpolar 等工具把预览端口暴露出去：

```bash
cpolar http 4173 -region cn
```

`vite.config.ts` 已开启 `allowedHosts: true`，因此 cpolar 的随机域名也能正常访问。免费版每次重启会换域名，需重新获取地址。

## 目录结构

```
src/
  pages/       8 个页面（看板 / 搜索 / 生成 / 详情 / 合规 / 知识库 / AI 设置 / 搜索配置）
  services/    agent.ts（内容与话术生成）、complianceScore.ts（六维体检）
  data/        echotik.ts（接口适配与错误诊断）、products.ts、content.ts
  store/       genStore.ts（生成草稿）、kbStore.ts（知识库）
  utils/       exportPdf.ts（PDF 导出）、diff.ts
  settings.ts  本地设置读写
  theme.css    样式
docs/prompts/  合规与生成相关的提示词
```

## 注意事项

- `.gitignore` 已排除 `.env`、`echotik-credentials.json`、`ai-store.json`、`kb-store.json`，**密钥与运营数据不会入库**。克隆后需按上文自行配置凭证，知识库与 AI 设置会回退到代码内置的种子数据。
- 仓库内含 `TikBoost-演示版.html`（单文件版），可直接打开预览。
- 合规结论基于知识库召回判定，正式投放前请复核平台最新规则。
