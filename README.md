# Structura Desktop

本地优先的 JSON / XML 编辑、校验、可视化与转换桌面工具。文档始终在本机处理，不需要联网。

## 桌面端开发

```bash
pnpm install
pnpm desktop:dev
```

## 构建 macOS 安装包

```bash
pnpm desktop:build
```

安装包会生成到 `src-tauri/target/release/bundle/`。

## 构建 macOS / Windows 安装包

仓库内置 `Build desktop installers` GitHub Actions 工作流。手动运行后会生成：

- macOS 通用版 DMG（兼容 Apple Silicon 和 Intel）
- Windows 11 64 位 NSIS EXE 安装器

在对应工作流运行页面的 Artifacts 区域下载即可。

### 安装包签名说明

当前发布的 macOS 和 Windows 安装包尚未使用正式开发者证书签名或公证，仅适合测试和自行分发。macOS 可能提示“无法验证开发者”，Windows 可能显示 Microsoft Defender SmartScreen 提醒。请只从本仓库的 GitHub Actions 或 Releases 下载，并在安装前核对发布方提供的 SHA-256 校验值。

## 第一版功能

- JSON / XML 自动识别与手动切换，JSON 支持 `//` 和 `/* */` 注释
- Monaco Editor 语法高亮与折叠
- 格式化、压缩、去转义、校验与错误位置提示
- JSONPath / XPath 树形浏览及源码联动
- JSON 与 XML 双向转换
- 双栏 Diff、字符级高亮、同步滚动与精确差异导航
- 并排/单栏、忽略空白、格式化后比较及差异块回退
- 浏览器缩放与窄屏自适应，编辑器、树视图和 Diff 支持统一字号调节
- 系统原生文件打开、保存，支持文件拖拽导入与复制
- 浏览器本地快照历史
- 深色 / 浅色主题

## 仅运行 Web 界面

```bash
pnpm build
pnpm preview
```

## 开源许可

本项目基于 [MIT License](./LICENSE) 开源。
