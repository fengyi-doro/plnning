# 本地知识库 + 千问 RAG 跑团

知识正文与向量保存在本机 Qdrant，阿里云 `text-embedding-v4` 生成1024维向量，`qwen3.7-flash` 根据检索资料主持跑团。无需阿里云知识库 ID。

## 部署与导入

需要 Docker Compose 和可访问上述模型的阿里云百炼 API Key。

1. 克隆仓库，在仓库目录执行：

   ```bash
   cp .env.example .env
   docker compose up -d
   docker compose exec -T n8n node --input-type=module < knowledge/init-qdrant.mjs
   ```

2. 打开 [n8n](http://localhost:5678)，首次启动时创建管理员账号。
3. 新建两个工作流，分别选择菜单 **Import from File** 导入：
   - [文档导入](workflows/trpg-local-kb-ingest.json)
   - [千问 RAG 跑团](workflows/trpg-qwen-local-rag.json)
4. 创建 **Qwen Cloud / Alibaba Cloud API** 凭据，选择中国北京区域并填写自己的百炼 API Key。在导入工作流的 **阿里云 HTTP 文档向量化**、聊天工作流的 **阿里云 HTTP 向量化** 和 **千问3.7 Flash** 节点选择此凭据。模型 ID 保持 `qwen3.7-flash`。
5. 保存并手动执行文档导入工作流，等待 **导入完成**。
6. 保存聊天工作流，点击 **Open chat**，输入「直接开始一个奇幻跑团」或询问房规。

本机已有 n8n 时可仅启动 `docker compose up -d qdrant`。聊天和导入流程中的 Qdrant 地址为 `http://qdrant:6333`，要求 n8n 与 Qdrant 同处此 Compose 网络；其他部署方式需修改对应 HTTP 节点的地址。

导出文件已移除凭据引用和实例 webhook ID。仓库不包含 API Key、`.env`、n8n 数据库或数据库快照。导入后默认未发布，编辑器内聊天可用。

## 数据流

```text
导入：文档片段 → 阿里云 HTTP 向量化 → 本地 Qdrant 持久化写入
聊天：玩家问题 → 阿里云 HTTP 向量化 → Qdrant Top3 检索 → 千问主持
                                                        ├──30轮会话记忆
                                                        └──roll_dice
```

集合为 `trpg_rules`，向量维度1024，距离指标 Cosine。聊天默认召回3条，相似度阈值0.3，可在 **跑团知识库配置** 中调整。规则回答引用实际命中的来源编号，如 `[rules-02]`。

文档仅在导入时向量化；聊天只向量化当前问题。片段和问题会发送给阿里云生成向量，命中片段会发送给千问回答。数据库持久化存储在本机。

## 添加知识

编辑导入工作流 **文档配置** 节点的 `documents` 数组，再手动执行。每批1至10条，每条 `text` 最多1500字符；长文请先按段拆分并分批导入。

```json
[
  {
    "pointId": 6,
    "id": "world-01",
    "title": "世界设定：雾港",
    "text": "雾港是冒险的起点，港口灯塔由守望者协会管理。"
  }
]
```

`pointId` 为唯一正整数，相同 ID 更新原记录，新的 ID 追加。从配置中移除文档不会删除数据库里的旧片段。

内置5条自定义轻量d20入门房规，不代表商业规则书。[房规 JSON](knowledge/trpg-house-rules.json)是初始资料备份，不会自动同步到工作流；需要修改导入节点并执行。

## 跑团指令与记忆

支持 `/角色`、`/状态`、`/掷骰 1d20+3`、`/存档`、`/读档`。

骰子使用每轮随机种子生成结果，同一轮相同表达式重复调用返回相同骰点，避免模型误触重掷。不同聊天轮次重新生成种子。同轮需要多次同表达式掷骰时，请拆成多条玩家消息。

知识库持久化保存规则资料；聊天记忆只保留最近30轮，服务重启可能丢失。长团请定期复制 `/存档` 文本，在新会话用 `/读档` 恢复。角色状态没有单独的持久化数据库，也未实现多人群聊接入。

## 本地服务与验证

Qdrant [管理界面](http://localhost:6333/dashboard)仅向本机127.0.0.1开放6333端口。数据保存在 Docker 命名卷 `qdrant_data`，容器重启后保留。不要在需要保留数据时执行 `docker compose down -v`。集合可通过管理界面 Snapshot 功能备份。

`knowledge/init-qdrant.mjs` 只在集合不存在时创建空集合，已有数据不会覆盖。

验证环境：n8n 2.41.6、Qdrant 1.19.1、text-embedding-v4、qwen3.7-flash。Compose 的 n8n 示例配置与 Qdrant 使用已测试镜像摘要。

- 两个工作流节点配置与图结构校验通过。
- 成功导入5条房规，检索返回 rules-02 和 rules-03，千问正确引用难度规则。
- 显式 `2d6+3` 测试只输出一次骰点：6、4，修正+3，总和13。
- 重启 Qdrant 后仍保留5条记录，集合状态 green。

未验证旧版 n8n 的节点兼容性，导入需要支持 Chat Trigger 1.5、HTTP Request 4.5、AI Agent 3.1、Qwen Cloud Chat Model 1.1 等导出节点版本。
