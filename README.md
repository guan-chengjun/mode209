# 臭氧发生器 3D 动态仿真

基于 **Three.js 原生能力** 的管式臭氧发生器原理可视化：干燥 O₂ 粒子从入口进入透明放电腔体，高压电极间间歇性出现闪光与电弧，粒子通过放电区后由蓝色切换为紫色，代表转化为 O₃，随后从出气口送出。

仅做流程示意，不计算电压、臭氧浓度、转化率或流体/等离子物理。

## 直接运行

需要 Node.js 18+。

### Windows

双击：

```text
启动演示.bat
```

脚本会在首次运行时执行 `npm install`，随后启动本地静态服务并打开浏览器。

### 命令行

```bash
npm install
npm start
```

浏览器访问：<http://localhost:5173>

也可以使用任意静态服务器打开本目录，例如 `npx serve .`。由于浏览器 ES Module 与 GLB 加载限制，不建议直接双击 `index.html`。

## 交互

- 鼠标左键拖拽：旋转视角
- 滚轮：缩放
- 右键拖拽：平移
- **暂停仿真 / 继续仿真**：暂停后粒子、放电闪光和频率联动状态定格，仍可旋转观察
- **重置粒子**：重新铺满流程粒子，便于观察完整转化路径
- **放电频率**：同步调节电弧触发频率、粒子流动速度和粒子生成速率

## 目录

```text
index.html              页面结构与最简控制 UI
src/main.js             Three.js 场景、GLB 加载、粒子和放电动画
src/style.css           控件与响应式样式
server.js               零额外框架依赖的本地静态服务器
assets/models/*.glb     已下载的轻量壳体、放电管、电极、接头和底座模型
assets/models/CREDITS.md模型来源与许可
```

## 实现要点

- `OrbitControls` 处理相机交互。
- `GLTFLoader` 加载本地 GLB 模型。
- `requestAnimationFrame` 与 `THREE.Clock` 驱动动画。
- 固定粒子池 + `THREE.Points` 表达 O₂/O₃ 气流。
- 动态折线、点光源和 Sprite 光晕模拟间歇高压放电。
- `AmbientLight`、`DirectionalLight`、PCF 软阴影和轻雾形成平实的工业展示效果。
- 不使用等离子体、流体或物理求解库。

模型来源与许可见 [`assets/models/CREDITS.md`](assets/models/CREDITS.md)。
