# 大雄的家 — 哆啦 A 梦 3D 立体场景

[English](./README.en.md) | 简体中文

用 three.js 做的大雄家与周边街区 3D 立体模型：可以绕着街区转、切换时段、点角色看资料、带角色散步、进屋走动，也能按剧本自动演一段故事。

**来源：** 本项目在 [lnanhkhoa/nobita-house-3d](https://github.com/lnanhkhoa/nobita-house-3d) 的基础上继续开发；本仓库新增了什么见[来源与署名](#来源与署名)。

![清晨的大雄家，哆啦 A 梦、大雄、静香、胖虎、小夫和出木杉聚在门口](docs/screenshots/diorama-morning.jpg)

## 功能

- **可逛的街区。** 大雄家在十字路口，周围七块邻居宅地，马路对面是有三根水泥管的空地。拖动旋转、滚轮缩放、平移取景。
- **四段时段。** 清晨、白天、黄昏、夜晚各有自己的天空、太阳、阴影、雾和云；夜晚亮灯，出星星、月亮和萤火虫。
- **下雨。** 时段旁边的开关能给任意时段盖上阴云：雨丝、水花、地面积水和倒影。屋顶、屋檐、树下不湿，室内听见的是闷住的雨声，跟着「音效」开关走。雨夜不出星星、月亮和萤火虫。
- **六个角色。** 哆啦 A 梦、大雄、静香、胖虎、小夫、出木杉，各有骨骼和动作，有的坐墙、有的站着聊天；点一下或用名册可飞过去看资料卡。
- **让他们自己溜达。** 一个开关，六人分两路绕院子和街区走，各有各的节奏，会停下来张望，关掉开关就回门口。午后行程由种子随机数决定，同一个种子能完整复现。
- **散步。** *我自己走* 是第一人称 WASD，整栋房子包括楼梯都能走；从角色卡进去可选第一或第三人称，V 键中途切换不挪人。两种视角共用一套碰撞。
- **门与「视角」菜单。** 每扇门默认关着，关着就是墙；走过去点一下会开，门扇扫过有人站着时不会硬转过去。菜单里有俯视和三层抬升，抬升时不用动镜头。
- **角色工作室。** 把一个角色放上转台，逐个播放他带的所有动作（idle、walk、run、wave、dance、laugh 等），可调速度、循环和转台。
- **按剧本演一段故事。** 点「演一段故事」，六人按写好的剧本走位、说话，台词出现在底部固定对话框里；镜头从门口切到空地再切回来，演完自动归位。
- **其他：** 自动旋转、重置视角、可开关的背景音乐、实时 FPS / draw call / 三角形面板、手机布局的设置面板。

## 截图

| 清晨 | 黄昏 |
|---|---|
| ![清晨](docs/screenshots/diorama-dawn.jpg) | ![黄昏](docs/screenshots/diorama-sunset.jpg) |

| 夜晚 | 整个街区 |
|---|---|
| ![夜晚，亮着灯、有月亮和萤火虫](docs/screenshots/diorama-night.jpg) | ![俯瞰十字路口、邻居宅地和空地](docs/screenshots/neighbourhood-aerial.jpg) |

| 角色卡 | 角色工作室 |
|---|---|
| ![镜头贴近哆啦 A 梦，资料卡打开](docs/screenshots/character-card.jpg) | ![哆啦 A 梦在转台上挥手，下方是动作选择器](docs/screenshots/character-studio.jpg) |

## 页面

| 路由 | 内容 |
|---|---|
| `/` | 立体场景：街区里的大雄家，六人聚在门口；可从窗户或地点菜单进屋，站到任意房间，点门开门 |
| `/characters/<id>` | 角色工作室：`doraemon`、`nobita`、`shizuka`、`jaian`、`suneo`、`dekisugi` |
| `/editor` | 房屋编辑器：按平面图重建的大雄家，两层带屋顶，可整栋看、按层剖开，也可以从任意房间内部或门口看；点门开关 |

## 技术栈

| 层 | 选型 |
|---|---|
| UI | React 19、TypeScript |
| 3D | three.js、@react-three/fiber、@react-three/drei、camera-controls |
| 状态 / 动画 | zustand、motion |
| 构建 | Vite、bun |
| 质量 | Biome（lint + format）、Vitest |
| 部署 | Vercel |

桌面端目标 60 FPS。实测数据与预算见 [docs/tech-stack.md](docs/tech-stack.md#measured-performance-m4-chrome-headless-over-cdp-real-metal-gpu-2026-09-11)。

## 本地运行

需要 [bun](https://bun.sh)。

```sh
git clone https://github.com/saodisir/nobita-house.git
cd nobita-house
bun install
bun run dev        # http://localhost:5173
```

优化后的模型已提交在 `public/models/`，clone 完直接能跑，不需要环境变量。`assets/` 下的参考图和房屋静态图不随仓库分发，见[来源与署名](#来源与署名)。

| 命令 | 作用 |
|---|---|
| `bun run dev` | 启动开发服务器 |
| `bun run build` | 类型检查并构建到 `dist/` |
| `bun run preview` | 预览生产构建 |
| `bun run lint` | Biome 检查 |
| `bun run typecheck` | TypeScript，不产出文件 |
| `bun run editor:textures` | 把房屋编辑器用的表面贴图复制到 `public/textures/editor/` |
| `bun run test` | Vitest：场景数据、路由、光照、摆放、行走循环、音乐 |

## 目录结构

```
src/
  app.tsx          立体场景页
  studio/          角色工作室页
  editor/          房屋编辑器页
  scene/           房子、街道、邻居、植被、角色、光照、镜头
  data/            场景布局、角色、动作目录、时段预设
  state/           zustand store
  ui/              面板、名册、资料卡、控件、音乐
public/models/     优化后的 GLB 模型
scripts/           素材流水线：参考图、Blender 构建脚本、GLB 优化
docs/              技术栈、素材流水线、设计规范、部署
```

## 模型是怎么做出来的

角色从参考图起步，经 Hyper3D Rodin 图生 3D、Mixamo 绑骨和动作、Blender 清理；街道、邻居宅地和植物由 Blender Python 脚本程序化生成；大雄家在浏览器里按数据搭出来（见下）。最后统一用 gltf-transform 压缩（去重、合并、贴图缩放、meshopt）。完整流程在 [docs/asset-pipeline.md](docs/asset-pipeline.md)。

大雄家不是模型文件。`src/editor/house/plan.ts` 把房子写成数据，依据 `assets/drawings.jpg` 的平面图（本地参考图，不随仓库分发）量出两层、十五个房间、每面墙窗门家具、楼梯和 `assets/home.jpg` 的屋顶。浏览器据此构建，立体场景和 `/editor` 用的是同一份数据：`src/data/house-site.ts` 把它放到宅地上，正门对准门口轴线，2 米石径通到门廊，前面有灌木花坛和踏脚石，西院有晾衣绳，后院有储物棚。室内镜头站在人能站的位置——房间角落，或者太小的房间就站门口——只转向不移动，所以不会穿墙；每扇门和通向院子的玻璃门都能点开。

## 文档

- [docs/tech-stack.md](docs/tech-stack.md)：架构、约定、性能
- [docs/asset-pipeline.md](docs/asset-pipeline.md)：从参考图到 GLB
- [docs/design-guidelines.md](docs/design-guidelines.md)：视觉与 UI 方向
- [docs/deployment.md](docs/deployment.md)：Vercel 部署与回滚

## 来源与署名

- **来源。** 本项目在 [lnanhkhoa/nobita-house-3d](https://github.com/lnanhkhoa/nobita-house-3d)（`lnanhkhoa`）的基础上继续开发。大雄家、周边街区、角色工作室和部署文档始于那个仓库；自由漫游的午后、第一/三人称散步、门与「视角」菜单、剧本故事演绎是本仓库新增的。
- **参考图不随仓库分发。** `assets/ref/` 与 `assets/` 顶层的房屋静态图属于本地工作素材，已加入 `.gitignore`；`.vercelignore` 也把整个 `assets/` 排除在构建之外。需要生成的视角图可用 `bun run gen:refs -- --all` 重建（见 [docs/asset-pipeline.md](docs/asset-pipeline.md)）。运行项目只需要已提交的 `public/models/` GLB。
- **角色与音乐。** 哆啦 A 梦及其他角色、由它们派生的模型、以及原版背景音乐，版权归各自权利人所有；本仓库不授予任何权利。

## 免责声明

这是一个非商业同人项目，仅作个人学习与作品集用途。哆啦 A 梦及相关角色版权归 Fujiko Pro / Shogakukan / TV Asahi 所有。本项目与权利方无关联，也未获其背书。
