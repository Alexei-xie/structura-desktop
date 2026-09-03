# Structura

本地优先的 JSON / XML 编辑、校验、可视化与转换工具。所有文档解析都在浏览器中完成。

## 本地运行

```bash
pnpm install
pnpm dev
```

然后访问 <http://localhost:4173/>。

## 第一版功能

- JSON / XML 自动识别与手动切换，JSON 支持 `//` 和 `/* */` 注释
- Monaco Editor 语法高亮与折叠
- 格式化、压缩、去转义、校验与错误位置提示
- JSONPath / XPath 树形浏览及源码联动
- JSON 与 XML 双向转换
- 双栏 Diff、字符级高亮、同步滚动与精确差异导航
- 并排/单栏、忽略空白、格式化后比较及差异块回退
- 浏览器缩放与窄屏自适应，编辑器、树视图和 Diff 支持统一字号调节
- 文件拖拽导入、导出与复制
- 浏览器本地快照历史
- 深色 / 浅色主题

## 生产构建

```bash
pnpm build
pnpm preview
```
