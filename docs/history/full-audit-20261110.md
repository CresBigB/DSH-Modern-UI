# 2026-11-10 完整审计整改

基准：`5b1acbda63f1074d5825cf82cbb55ffa19ec1940`（v0.1.12）。修复报告登记的 15 项确认问题，并按 PR #56 独立复审补足 R01–R04 和 T01（见下文）；保留现有功能、旧 DSL、官方宿主与扩展契约，对另列的资源风险和依赖公告增加恢复、验证和处置记录。未修改官方安装物，也没有合并、发布或扩大已验证宿主范围。

## 逐项结果

- **PERF-01**：完整 SessionSnapshot 订阅移入 composer 桥接；MainPanel、Header、Content 和 DefaultViews 只订阅其需要的生命周期结果。第三方 dock、composer chain 和会话视图仍能逐次获得完整快照。`conversation-subscriptions-tabs` 使用真实 rc.4 Session，检查正文更新、删除、错误、历史加载、子代理 parentAvailable、草稿绑定与驻留滚动节点；`conversation-phase-selectors` 将 1,536 种状态组合与原推导比较。
- **PERF-02**：所有语法语言保留；每个 KaTeX 字体保留 WOFF2，去除重复内联的 WOFF/TTF。构建记录原始字节、统一 gzip、实际包版本的输出贡献以及完整嵌套路径的原始 metafile，超过 10,000,000 原始字节或 2,200,000 gzip 字节时失败，PR 保存附件。`build-metrics` 检查两类超预算分别失败、嵌套版本不合并、全部字体 face 保留。
- **A11Y-01**：Svg 末尾追加可选 title/description/decorative，信息图关联稳定 title/desc，装饰图隐藏。旧 DSL 有本地化默认名称；新提示要求提供具体名称及复杂图说明。无法从旧图形自动推导原作者未提供的含义。
- **A11Y-02**：普通与点击固定 Tooltip 的实际可见 bubble 都有稳定 id；合并已有 `aria-describedby`，隐藏、禁用或被嵌套提示抑制时清除关联。真实 Chromium 的可访问性树验证 description 保留。
- **A11Y-03**：具名 tablist、稳定 tab/panel 双向关联、单一 Tab 入口、方向键/Home/End 自动激活及原生 Enter/Space；动态视图与 More 菜单保持焦点及活动视图，不改 pin 偏好，不重建输入/滚动节点。
- **A11Y-04**：SegmentedControl 末尾追加组名/说明，方向键移动和选择、游走焦点、无选中项入口、动态删除恢复。组清空后释放焦点归属，后续选项出现不会夺取外部控件焦点。
- **A11Y-05**：Popover 追加可见 title，旧内容可从触发器取名，图标触发器有默认名称；打开焦点进入，Escape 返回，模态弹窗优先，保留非模态页面访问。
- **A11Y-06**：Input、InlineEditor、重命名输入添加不改变几何的键盘轮廓和 forced-colors 处理。验证明暗、200% CSS zoom、指针转键盘以及焦点前后尺寸。
- **A11Y-07**：品牌区独立原生“复制版本号”按钮，移除隐藏的鼠标专用入口；Enter/Space、正确版本值、成功/失败反馈及不触发新会话均验证。
- **A11Y-08**：侧栏实际按钮桌面至少 24px、coarse pointer 44px，图标保持原大小。真实浏览器触屏模拟检查边界命中、相邻按钮不重叠及不触发行折叠。
- **A11Y-09**：六种 Chart 类型追加 summary 和可展开语义数据表，保留饼图图例；替代数据与绘图使用相同数值转换，保留缺失值、系列、单位。数据表不采用轴刻度舍入，覆盖 `1.0001`/`1.0002`、散点 x、极小数、负数、币种和百分点语义。
- **I18N-01**：宿主 locale 传给数字、表格、图表和控件；zh/ja/en/de 均验证。FormatDate 追加显式 locale 参数，缺省仍为历史英文，纯日期保持 UTC、时间戳保持原有时区语义；洛杉矶/东京验证日期不偏移，`Number.MIN_VALUE` 不被错误显示为零。
- **ENG-01**：Biome 覆盖产品 TS/TSX，自有源码执行 recommended 门禁；vendor/Host 归属源码保留格式和明确的基础规则范围，见 CONTRIBUTING。实际临时加入 `1 == 2`，`biome ci` 在产品路径以 exit 1 拒绝，随后移除该探针。格式化独立提交，并加入 blame 忽略记录。
- **COMPAT-01**：从实际消费者的官方依赖图读取发布 JS/CSS，验证 49 个精确类名、版本身份、switch 与 portal menu 结构；rc.2/rc.3/rc.4 各通过。该检查纳入每个隔离消费者和上游 canary，不从开发树借用另一宿主的控件实现。原有安装/撤销作用域仍由生命周期回归验证。
- **ENG-02**：将既有八语言 391 个共同键迁入共享基础文件，两处保留 `conversation` / `modern-conversation` 命名空间和四个会话差异键。16 份基准导出哈希与实际键值保持一致，无跨 owner 循环导入。

## 测量与复现

Windows、Node 24.18.0、React 18.3.1、Edge 157.0.4341.42；CI 使用仓库固定 Node 24.22.1。相同本机环境重建基准为 11,023,423 原始字节、2,841,808 gzip 字节；整改产物为 9,743,377 原始字节、2,122,472 gzip 字节。gzip 是本地统一 level 9 / mtime 0 测量，不代表部署端开启了相同 HTTP 压缩。

复审 T01 发现早期性能夹具使用了错误的 chunk 字段，原计时不再用作正文消费链路的证据。修正后，`node scripts/profile-conversation.mjs 5b1acbd` 使用真实宿主 Session、合法 `block-start` 和 100 个独立 `text-delta` 微任务 flush，根与 continuable 子会话各五轮；实际调用 Chat 的 assistant / turn-process 投影，每次断言累计文本和完整 snapshot 身份，末尾为 500 字符。四个不读正文的外层组件执行次数均为 100 → 0；完整快照的 dock/chain/第三方 view 消费者保持 100，整个树的提交仍为 100。

在同一修正夹具中，开发版 React/jsdom 总 actualDuration 中位数为：根会话 20.88 → 11.82ms，子会话 21.14 → 11.88ms。location/context 简化为一个运行中的 Turn/Step，remote、通知适配和 selector hook 仍为夹具；没有加载完整 Conversation 事件引擎或真实 Markdown 绘制，也不覆盖侧栏大列表、设备掉帧和用户可感知时延。该组计时替代旧夹具结果，不能跨两种夹具比较，也不外推为整页固定收益。

`node scripts/probe-conversation-tabs.mjs` 复现真实浏览器 Tab/Shift+Tab、方向键、Home/End、Enter/Space，以及 3 → 2、2 → 1 动态视图变化的焦点恢复和外部焦点对照。两脚本默认写入 `.artifacts/audit-20261110/`，其简化远端、selector 桥和 primitives 边界也写入结果。PERF-C01～C05 为原报告的未确认候选，本次没有凭静态推测修改排序、列表动画、运行时钟或 Markdown 不可变快照。

本地 lint、client/Host typecheck、单元测试及完整 audit/compat 回归通过。OpenUI 的新字段在旧位置参数之后保持 optional；生成提示词由 `npm run prompt:openui` 验证示例并重新生成；来源清单保留原 source SHA，只更新实际 target SHA 和改编标记。打包通过 `npm run preview`，全部运行资源继续随 tgz 安装，无额外 CDN。上面的初次包体积记录来自动效追加前；订阅计时使用复审修正后的夹具重测。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck
npm run build
COMPAT_BACKEND_PACKAGE=node_modules/@deepseek-ai/dsh/package.json npm test
npm audit --json > .artifacts/npm-audit.json
node scripts/dependency-exposure.mjs --audit .artifacts/npm-audit.json
npm run preview
```

`npm audit` 对已知公告返回 1，须保留其 JSON 再执行路径/产物检查。PR 和隔离消费者矩阵的最终状态应以该修订的 GitHub Actions 为准。

## 菜单与侧栏动效追加

参考 [Feel](https://diip3sh.github.io/feel/) 的弹性与阻尼参数思路，沿用仓库已有的 Feel 曲线，不引入新动画依赖。位置移动保持已有 panel/control 曲线；颜色与透明度反馈改为 120ms，通用按钮按压为 80ms、居中缩放至 0.985，释放沿用 control 曲线。带弹出面板的通用按钮保持几何不动，Tooltip 和 Modal 仅淡入。

模型菜单原先以正处于按压变形的按钮测量位置，并在入场时缩放整个菜单。现在用与按钮布局宽度一致的稳定 wrapper 定位，测量完成后才入场；普通菜单、模型菜单及官方指令菜单只做不超过 2px 的单向移动，保持尺寸和定位 transform。菜单异步加载、上下翻转与普通重渲染不会重放入场。模型选择、搜索、方向键、Escape、窄输入区及 portal 行为保留。

侧栏的 grid 收缩与图标的独立横移曾叠加，调宽手柄则直接跳到最终位置。现在 rail 控件仅短暂淡入，手柄跟随实际 grid 边界；窗口 resize、拖动和动态开启 reduced-motion 会终止轨道缓动。手机抽屉关闭后立即变为 inert、撤销模态占用并恢复触发器焦点，视觉退场完成后隐藏；退场期间重新打开可以反向继续。

同机 Edge 157 的实际组件逐帧对照（基准 `59c2d01`，含真实 Feel/base tokens、简化的工作区插槽）中，rail 图标最大单帧横移由 42px 降为 7px；开关过程中的手柄与 grid 边界偏移由 193.75px 降为 0。新增 `menu-motion` 8 项、`model-picker-motion` 8 项、`sidebar-motion` 6 项、`surface-motion` 7 项，覆盖快速反向、真实 pointer 拖动、异步目录、稳定几何、焦点返回以及初始/中途 reduced-motion。Tooltip 的动效采样等待可见状态，另用延迟 ResizeObserver 验证未定位时始终隐藏、首次可见后位置稳定；不把隐藏的测量坐标当作可见动画。侧栏同一组检查在基准上 5 失败 / 1 通过，在修改后 6 项通过。

另用隔离的真实 rc.4 宿主与本地固定模型检查 1365px 桌面和 390px 手机视口：模型菜单、侧栏更多菜单、侧栏开关、手机退出/重新打开及 reduced-motion 均通过，未记录 pageerror；63 个侧栏展开样本的手柄边界偏差小于 0.001px。该 smoke 不访问日常 profile 或外部模型。数值证明对应测试场景的几何稳定，不代表真实设备帧率或主观自然度；原生 macOS 合成、Safari/WebKit、真实手机键盘和复杂第三方嵌套模态尚未实测。

动效追加后的首轮验收中，本地 lint 检查 635 个文件，client/Host typecheck、292 项 unit 和 307 项 audit/compat 全部通过；随后补充 Tooltip 定位回归，CI 在 `f75d765` 上通过 600 项测试。该阶段 client 为 9,746,814 原始字节、2,123,267 gzip 字节，低于既定预算。

## PR #56 复审补修

复审基准为 `f75d765e05a2c1cc53bdf2d62196820348909fb1`，四个 P2 缺口和一项 P3 测试问题均先核对触发路径，再增加针对性回归。

- **R01**：audit 目录和 metafile 输入共用缓存的 `realpath` 解析，输出保留逻辑安装路径、原始输入键、物理目录及逐输入映射。无法解析时标记 `incomplete`，使门禁失败。真实 esbuild 覆盖普通树、整个 `node_modules` 链接、单包链接；各布局同时包含根修补版与嵌套受影响版，分别验证代码保留、只参与解析后被剔除，以及输入或包目录消失。原脚本在两种链接布局中均将实际保留的 marker 报告为零并放行；新脚本正确阻断，`parsedOnly` 场景则完整记录输入后通过。
- **R02**：记录实际持焦点的 tab DOM 节点；节点卸载且焦点落到 BODY 时才恢复，优先活动 tab、其次活动 panel，并清除旧焦点归属。jsdom 和真实 Edge 均验证 3 → 2、2 → 1：被移除的 Files、仍保留但随整条 tablist 消失的 Chat 都能恢复到正确位置；外部按钮焦点保持不变。真实浏览器使用实际会话组件和简化插槽，不等同实体读屏器验收。
- **R03**：无文本的 Popover 组件触发器使用 trim 后的 title 命名；旧 DSL 未提供 title 或只提供空白时使用现有本地化 Details。字符串、Text 和原生 Button 的名称保持不变，不引入嵌套按钮。真实 Renderer 检查关闭时的具名角色查询，以及 Enter/Space 打开、Escape 返回。
- **R04**：scatter tooltip 与替代表共用 `pointNameKey`，保留既有“首行第一个非 x 字符串字段”规则。名称作为行标题，数值 x 独立保留；覆盖不同名称但坐标相同、多系列、缺失数值、德语精度与无名称字段降级。
- **T01**：流式回归与 profile 使用实际 rc.4 `block-start { index, blockType }`、`text-delta { index, text }` 契约。根与 continuable 子会话将 Session 接受后的事件传入真实 Chat 投影，每次验证累计正文及 dock/chain/view 收到的完整 snapshot，补足过去只验证通知的证据。新性能数据和夹具边界见上文。

本轮本地 lint（636 文件）、client/Host typecheck、291 项 unit 和 317 项 audit/compat 均通过，合计 608 项；客户端为 9,747,267 原始字节、2,123,477 gzip 字节，保持在预算内。重新获取的 audit 快照仍有 14 条独立公告；更新后的真实路径门禁完整核对通过，无 `incompletePaths`、受影响保留输入或未声明 Host import。该结果不豁免宿主外置依赖，也不消除下面列明的上游风险。

本次补修不改变 SEC-R01 的开放状态，也不将依赖门禁通过解释为上游公告已消除。

## SEC-R01 与依赖公告的剩余边界

HtmlView 增加停止、原文与显式重新运行；前台连续 5 秒没有内层存活消息时尝试卸载，每次执行使用新 token，隐藏/可见转换重置宽限期。在 Windows Edge 157 上，固定 600ms 同步计算、8MiB 分配和 200 条消息的样本中，父界面最大心跳间隔约 21ms；独立无限循环样本约 6.2 秒被移除，可继续操作父界面并加载新内容。**Linux CI 的 Chromium 156.0.8078.4 得到相反证据**：同一有限样本的父界面最大间隔约 615ms，无限循环在 15 秒内未能由应用恢复（[原始失败运行](https://github.com/iroha1145/DSH-Modern-UI/actions/runs/42778913918)）。不能把 Edge 的线程隔离外推到 Chromium 整体。

默认回归分别验证正常心跳、手动停止/重试、真正的主题变化，以及移除内层心跳后的超时恢复。设置 `MODERN_UI_TEST_INFINITE_LOOP=1` 再运行 `tests/audit/html-view-recovery.test.mjs` 可复现真实 CPU 中止能力，缺少线程隔离的浏览器预期会失败；该失败是开放风险的证据。CPU 探针由 Node 外部超时强制终止专用浏览器进程，不依赖被阻塞的页面计时器。

这是尽力恢复，**没有跨浏览器硬 CPU/内存配额**，且已确认至少一个目标 Chromium 环境中父线程也会被阻塞。作者可干扰存活检测，消息没有速率配额；WebRTC 仍为原有 best effort。Firefox、Safari、真实隐藏标签页生命周期和真实设备的同等中止能力未验证。该风险继续开放，接纳新的执行架构前必须验证 DOM/Canvas 与游戏兼容。

当前 audit 仍有 200 个传播后的受影响包条目、14 条独立公告。`dependency-exposure.mjs` 按原始嵌套路径和实际 manifest 核对 client、Host 主入口、Host 兼容入口；直接受影响输入的最终输出贡献为零，旧 KaTeX 只在解析图中出现。此结论不覆盖预打包/vendor 内嵌代码或全部功能可达性。

- MCP：插件声明并解析 2.3.0；官方 MCP 仍有 2.2.0，对应 GHSA-6prh-2h8m-c8cw。
- undici：插件声明并解析 8.12.2；官方 HTTP proxy 和 HTTP provider 仍各有 8.11.2，对应 GHSA-4qv8-2p9j-2685、GHSA-f72v-6w45-q472、GHSA-xjj6-f33q-929c、GHSA-4w7w-5xrc-9h26、GHSA-2m5v-pch6-74hx、GHSA-qrxm-fqhp-jwvm、GHSA-9fm3-97px-rjf6、GHSA-55wc-3pg8-jfw6。官方 proxy 有真实 transport/global dispatcher 路径，不能按纯策略函数或开发依赖豁免。
- fflate：插件构建 0.8.3；官方 LibreOffice 仍有 0.8.2，对应 GHSA-px8p-9vwx-vf98。
- zod：插件构建 4.6.7；官方多处嵌套 4.4.3，对应 GHSA-mrhx-c7xc-m3w5。
- KaTeX：插件渲染 0.18.10，micromark 内嵌 0.16.47；后者零最终贡献，对应 GHSA-238p-pmpm-9mq7，未跨越上游声明范围强推 override。
- happy-dom：开发树经 Lexical headless 引入 20.14.6，当前未进入插件产物；GHSA-834v-8h66-3h79 与 GHSA-c8p4-j97h-3vg8 仍需上游升级。不能因未打包便把开发环境处理不可信 HTML 视为安全。

每个隔离消费者从插件和官方包的实际位置记录 `runtime-dependencies.json`。修补版插件依赖不替换官方包内部版本；开发目录 overrides 不能修复另行安装的宿主。后续负责人边界为：插件维护者保持直接依赖修补并执行产物门禁，官方宿主由上游修订或部署方验证升级；任何公告/锁文件/宿主变化后重新生成证据。没有宣称 npm audit 已清零。

真实读屏器、真实手机命中、完整 WCAG 对比度、Safari/WebKit、原生 Desktop、多设备冷/暖缓存传输与可交互时间未由本次自动化证明。浏览器可访问性树、CSS zoom 和触屏模拟不能代替这些实测。
