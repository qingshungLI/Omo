用户：
生成这个文件  要求包含图片中的内容

豆包：
Injective 开发者开发手册
 
什么是Injective?
 
Injective 是一个可互操作的 Layer‑1 区块链，为下一代Web3创新提供动力。Injective独特地提供了即插即用的基础设施模块，例如高性能的链上去中心化基础设施、去中心化跨链桥、预言机、RWA模块，同时还具有 WASM 和 EVM 等多重可组合智能合约层。
 
极低Gas，极快确认 多虚拟机 
单笔手续费 ≈ $0.0003， 区块时间0.65s，持续吞吐25,000+ TPS 原生支持 EVM（与以太坊1:1等价）与CosmWasm，用MetaMask即可直接接入 
 
内置模块 跨链互操作 
链上订单簿、质押、治理、RWA、AI等即插即用，无需从零起起 通过 IBC 连接 110+ 网络，并与以太坊、Solana互通 
 
开发路径
 
Injective支持三条主线，按你熟悉的技术栈选：
 
EVM（推荐） AI开发 CosmWasm 
Solidity智能合约，用Hardhat / Foundry / MetaMask直接上手，零迁移成本 用AI Agent / Skill / MCP快速构建，让AI直接与链上交互 偏好 Rust / Cosmos生态的开发者可选（本指南下方简要带过） 
 
 
 
EVM开发指南
 
Injective原生EVM与以太坊等价，MetaMask、Hardhat、Foundry、viem、ethers.js、Remix全部可用。更特别的是，它的预编译合约（Precompiles）让你的Solidity合约能直接调用链上订单簿、质押、治理等原生模块。
 
💡核心概念：MultiVM Token Standard (MTS)，同一个Token在EVM与Cosmos环境共享同一余额，无需跨链或包装。
 
1.配置测试网（Injective EVM Testnet）
 
- EVM Chain ID：1439
- JSON‑RPC：https://k8s.testnet.json‑rpc.injective.network/
- 区块浏览器：https://k8s.testnet.json‑rpc.injective.network/
- 水龙头：https://testnet.faucet.injective.network/
 
ℹ️主网 EVM Chain ID 为 1776；JSON‑RPC: https://sentry.evm‑rpc.injective.network/。链原生ID为 injective‑1 / injective‑888，与数字ID映射同一网络。
 
2.部署第一个合约（Foundry示例）
 
在  foundry.toml  中加入 Injective EVM 端点：
 
toml
  
[rpc_endpoints]
injectiveEvm = "https://k8s.testnet.json-rpc.injective.network/"
 
 
编译并部署
 
bash
  
forge create \
src/Counter.sol:Counter \
--rpc-url injectiveEvm \
--legacy --account injTest \
--gas-price 160000000 \
--gas-limit 2000000 \
--broadcast
 
 
在Blockscout上验证合约
 
bash
  
forge verify-contract \
--rpc-url injectiveEvm \
--verifier blockscout \
--verifier-url 'https://testnet.blockscout-api.injective.network/api/'\{ContractAddress\} \
src/Counter.sol:Counter
 
 
完整的 Hardhat / Foundry 全流程（编译→测试→部署→验证→交互）见官方文档：
 
docs.injective.network/developers‑evm/smart‑contracts
 
 
 
AI开发指南
 
用生成式AI工具，你可以极快地在Injective上构建应用，甚至让AI Agent直接与链上交互。Injective提供一整套面向AI工程的Skill与MCP服务器。
 
Agent Skills（可直接接入Claude Code / Codex / Cursor等）
 
一条命令安装全部 Injective Agent Skills：
 
bash
  
npx skills add InjectiveLabs/agent-skills --global
 
 
- Injective EVM开发Skill：在通用EVM开发能力上叠加Injective特定的合约/dApp构建辅助。
- Injective CLI Skill：用自然语言驱动injected，自动处理钱包、端点与Gas配置。
- Injective Trading Skills：一组交易相关技能——下单、查行情、管理仓位、质押、跨链等。
- Injective MCP Servers Skill：在AI工程Harness中接入Injective的MCP服务器。
 
MCP服务器
 
- 文档MCP：让AI获取实时、带引用来源的Injective文档知识，避免模型回答过时信息。
- Injective MCP：赋予AI完整的链上能力。
 
完整AI开发指南与安装方式：
 
docs.injective.network/developers‑ai
 
 
 
CosmWasm
 
偏好 Rust 与 Cosmos生态的开发者可用 CosmWasm 写智能合约。
流程概括为：用  injected  将编译好的  .wasm  上传（store）→实例化（instantiate）→交互（execute/query）。测试网推荐 Gas 1000000、Gas‑prices 160000000inj。
 
📖完整 CosmWasm开发教程、SDK与模块交互请直接参阅官方文档。
 
- CosmWasm与原生开发：docs.injective.network/developers
- CosmWasm SDK：github.com/InjectiveLabs/cw‑injective
 
 
 
injected CLI快参
 
 injected  是 Injective 的命令行工具，用于管理地址、发交易、查链上数据、部署合约等。
 
安装（Linux x86_64 预编译）
 
bash
  
# 最新版本见 https://github.com/InjectiveFoundation/injective-core/releases
wget https://github.com/InjectiveFoundation/injective-core/releases/latest/download/linux-amd64.zip
unzip linux-amd64.zip
sudo mv injected /usr/bin
sudo mv libwasmvm.x86_64.so /usr/lib
injected version
 
 
ℹ️非Linux x86_64平台（macOS / Windows / ARM）请用Docker版：
 
bash
  
docker run -it --rm injectivelabs/injective-core: v1.20.1 injected version
 
 
获取测试网代币
 
- 水龙头：https://testnet.faucet.injective.network
- 浏览器：https://testnet.explorer.injective.network
 
 
 
下一步 & 常用链接
 
产品
 
- Injective Hub：hub.injective.network
- Injective Bridge：bridge.injective.network
- INJ Scan：injscan.com
 
文档 & 支持
 
- 技术文档：docs.injective.network
- Discord技术支持：discord.com/invite/injective
- 开发者Telegram：t.me/+8Y_0HOFLhnRlZDU9
- 开发者页面：https://injective.com/build
 
金融未来，由此起航
与Injective携手，共创金融未来。
二维码：加入开发者社群
 
 
 
如果你需要，我可以直接导出为 Markdown .md 文件文本，你复制保存即可。


结合你这个项目，最合适的方案是：

- Injective：只保存内容的 CID、所有者、版本、状态、哈希。
- IPFS：保存公开文件，或者保存加密后的私密文件。
- PostgreSQL 加密数据库：保存任务、推送 Token、账号映射、配额、索引等链下数据。
- iOS Keychain：保存用户加密密钥或钱包私钥。
- 文件本体不直接塞进 Injective 交易。

你给的 [injective.md](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/flow/injective.md:28) 走的是 Injective EVM/Solidity 路线，适合实现下面的方案。不过这份文档主要是开发简介，目前并没有包含文件存储架构。

## 1. 你项目当前是怎么存数据的

当前后端主要使用 PostgreSQL：

- `chapters.chapter_json` 保存完整章节。
- `favorite_questions.favorite_json` 保存收藏题。
- `notifications.notification_json` 保存通知。
- `generation_jobs.payload_json` 保存生成任务输入。
- `audit_events.snapshot_json` 保存删除时的完整快照。

对应定义在 [db.js](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/db.js:89)。

截图流程目前是：

```text
iOS UIImage
  ↓ JPEG 压缩
  ↓ Base64
POST /api/sources/image-flow
  ↓ OCR / AI 处理
```

iOS 转 Base64 的代码在 [APIClient.swift](/Users/liqingsong/Desktop/advx/AdventureX-2026/拾贝/拾贝/Services/APIClient.swift:162)，后端接收位置在 [server.js](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/server.js:260)。

所以现在的截图不是正式的永久文件存储，主要作为生成任务输入。

---

## 2. 去中心化文件存储怎么做

以 IPFS 为例，完整流程应该是：

```text
文件/JSON
  ↓ 可选：AES-256-GCM 加密
上传 IPFS 并 Pin
  ↓
得到 CID，例如 bafy...
  ↓
把 CID + 所有者 + 哈希写入 Injective 合约
```

CID 是根据内容生成的地址。文件发生任何变化，CID 也会变化；但 CID 只标识内容，并不保证文件永远有人保存。[IPFS CID 文档](https://docs.ipfs.tech/concepts/content-addressing/)

因此必须：

- 自己运行 IPFS Kubo 节点并 Pin。
- 或使用 IPFS Pinning 服务。
- 最好在两个不同节点/服务上重复 Pin。

IPFS 官方也明确说明：没有 Pin 的数据可能被垃圾回收，IPFS 本身不自动保证永久可用。[IPFS 持久化文档](https://docs.ipfs.tech/concepts/persistence/)

### 后端上传到自建 Kubo

运行 Kubo 后，后端可以调用：

```text
POST http://127.0.0.1:5001/api/v0/add
```

Kubo RPC 是管理员接口，绝不能直接暴露给公网，只能由你的后端访问。[Kubo RPC 文档](https://docs.ipfs.tech/reference/kubo/rpc/)

Node.js 20 示例：

```js
export async function uploadToIpfs(buffer, {
  filename = "content.bin",
  contentType = "application/octet-stream"
} = {}) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: contentType }), filename);

  const response = await fetch(
    "http://127.0.0.1:5001/api/v0/add?pin=true&cid-version=1",
    {
      method: "POST",
      body: form
    }
  );

  if (!response.ok) {
    throw new Error(`IPFS upload failed: ${response.status}`);
  }

  const result = await response.json();

  return {
    cid: result.Hash,
    uri: `ipfs://${result.Hash}`,
    size: Number(result.Size)
  };
}
```

上传后返回：

```json
{
  "cid": "bafybeig...",
  "uri": "ipfs://bafybeig...",
  "size": 128392
}
```

读取时不要把某个公共 Gateway URL 当成永久地址。数据库和链上保存：

```text
ipfs://bafy...
```

展示时再转换成：

```text
https://你的网关/ipfs/bafy...
```

## 3. 加密数据库怎么做

“加密数据库”通常不是把 PostgreSQL 换成另一种数据库，而是在写入 PostgreSQL 前，对敏感字段进行应用层加密。

推荐使用信封加密：

```text
每条内容生成随机 DEK
  ↓
DEK 用 AES-256-GCM 加密正文
  ↓
KMS 中的 KEK 加密 DEK
  ↓
数据库保存：
ciphertext + nonce + authTag + wrappedDEK + keyVersion
```

不要只做下面这些：

- PostgreSQL 磁盘加密：只能防止硬盘被偷，数据库管理员仍能读取。
- SHA-256：哈希不是加密，不能恢复原文。
- 在环境变量中放一个所有用户共用的永久 AES Key：泄露后所有数据同时失守。

推荐数据结构：

```sql
CREATE TABLE encrypted_objects (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  object_type TEXT NOT NULL,

  ciphertext BYTEA NOT NULL,
  nonce BYTEA NOT NULL,
  auth_tag BYTEA NOT NULL,

  wrapped_dek BYTEA NOT NULL,
  kms_key_id TEXT NOT NULL,
  encryption_version INT NOT NULL DEFAULT 1,

  plaintext_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Node.js 加密核心代码：

```js
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash
} from "node:crypto";

export function encryptBuffer(plaintext, dek = randomBytes(32)) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, nonce);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);

  return {
    ciphertext,
    nonce,
    authTag: cipher.getAuthTag(),
    sha256: createHash("sha256").update(plaintext).digest("hex"),
    dek
  };
}

export function decryptBuffer({ ciphertext, nonce, authTag }, dek) {
  const decipher = createDecipheriv("aes-256-gcm", dek, nonce);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
}
```

这里返回的 `dek` 不能原样存数据库。生产环境中应该把它交给 AWS KMS、Google Cloud KMS、Vault 等密钥系统加密，数据库只保存 `wrapped_dek`。

## 4. 私密文件：加密后上传 IPFS

私密内容不能直接上传明文，因为 IPFS 内容本质上是公开寻址的。

正确流程：

```text
chapter.json / image.jpg
  ↓
生成随机 32 字节 DEK
  ↓
AES-256-GCM 加密
  ↓
上传 ciphertext 到 IPFS
  ↓
获得 CID
  ↓
CID 写入 Injective
  ↓
DEK 经 KMS 加密后保存在 PostgreSQL
```

例如：

```js
const plaintext = Buffer.from(JSON.stringify(chapter));
const encrypted = encryptBuffer(plaintext);

const envelope = Buffer.from(JSON.stringify({
  version: 1,
  algorithm: "AES-256-GCM",
  nonce: encrypted.nonce.toString("base64"),
  authTag: encrypted.authTag.toString("base64"),
  ciphertext: encrypted.ciphertext.toString("base64")
}));

const uploaded = await uploadToIpfs(envelope, {
  filename: `${chapter.id}.encrypted.json`,
  contentType: "application/json"
});
```

然后数据库记录：

```json
{
  "chapterId": "chapter-123",
  "cid": "bafy...",
  "encrypted": true,
  "sha256": "...",
  "wrappedDek": "...",
  "kmsKeyId": "chapter-master-key-v1"
}
```

### 更高隐私：iOS 端加密

如果希望连你的后端都不能看正文，可以在 iOS 使用 CryptoKit 加密，然后直接上传密文。

但是你的 App 需要后端 OCR 和 AI 生成，因此生成阶段后端必须看到截图或文章正文。现实方案是：

1. iOS 把输入发送给生成 Worker。
2. Worker 只在内存中处理明文。
3. 调用 AI 后得到章节。
4. 立即加密章节结果。
5. 密文上传 IPFS。
6. 删除临时输入和日志中的明文。
7. 数据库只保存 CID、索引及加密密钥封装。

如果调用第三方 AI API，第三方仍会接触输入内容；端到端加密不能解决这一点。

## 5. CID 怎么上传到 Injective

严格来说，不是“上传文件到 Injective”，而是调用合约登记 CID。

可以部署一个简单的注册合约：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ContentRegistry {
    struct Content {
        address owner;
        string cid;
        bytes32 contentHash;
        bool encrypted;
        uint64 version;
        uint64 updatedAt;
        bool deleted;
    }

    mapping(bytes32 => Content) public contents;

    event ContentStored(
        bytes32 indexed contentId,
        address indexed owner,
        string cid,
        bytes32 contentHash,
        bool encrypted,
        uint64 version
    );

    function storeContent(
        bytes32 contentId,
        string calldata cid,
        bytes32 contentHash,
        bool encrypted
    ) external {
        Content storage current = contents[contentId];

        require(
            current.owner == address(0) || current.owner == msg.sender,
            "not owner"
        );

        uint64 nextVersion = current.version + 1;

        contents[contentId] = Content({
            owner: msg.sender,
            cid: cid,
            contentHash: contentHash,
            encrypted: encrypted,
            version: nextVersion,
            updatedAt: uint64(block.timestamp),
            deleted: false
        });

        emit ContentStored(
            contentId,
            msg.sender,
            cid,
            contentHash,
            encrypted,
            nextVersion
        );
    }

    function deleteContent(bytes32 contentId) external {
        Content storage current = contents[contentId];
        require(current.owner == msg.sender, "not owner");
        current.deleted = true;
        current.updatedAt = uint64(block.timestamp);
    }
}
```

Injective EVM 可以使用标准 Solidity、Hardhat、Foundry 部署。[Injective EVM 合约文档](https://docs.injective.network/developers-evm/smart-contracts)

调用合约时：

```js
const contentId = keccak256(toBytes(chapter.id));

const txHash = await walletClient.writeContract({
  address: CONTENT_REGISTRY_ADDRESS,
  abi: contentRegistryAbi,
  functionName: "storeContent",
  args: [
    contentId,
    uploaded.cid,
    `0x${encrypted.sha256}`,
    true
  ]
});
```

完整提交链路是：

```text
POST /api/content
  ↓
认证用户
  ↓
加密内容
  ↓
上传 IPFS
  ↓
获得 CID
  ↓
调用 Injective ContentRegistry.storeContent()
  ↓
等待交易确认
  ↓
PostgreSQL 保存 CID、txHash、状态
  ↓
返回客户端
```

建议新增一张本地索引表：

```sql
CREATE TABLE content_objects (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  object_type TEXT NOT NULL,
  cid TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  encrypted BOOLEAN NOT NULL,
  chain_id INT NOT NULL,
  contract_address TEXT NOT NULL,
  tx_hash TEXT NOT NULL DEFAULT '',
  chain_status TEXT NOT NULL DEFAULT 'pending',
  encryption_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 6. 你项目里的数据应该怎么分

| 当前数据 | 推荐位置 |
|---|---|
| `chapters.chapter_json` | 加密后上传 IPFS，CID 登记到 Injective |
| 原始截图 | 默认处理后删除；用户要求保留时，加密上传 IPFS |
| `favorite_questions` | PostgreSQL；需要跨设备可信同步时可登记链上 |
| 学习进度、答题记录 | 加密 PostgreSQL，更新频繁，不建议每题上链 |
| `generation_jobs` | PostgreSQL/Redis，不能放链上 |
| `generation_quota_claims` | PostgreSQL，或者未来改成合约配额 |
| `device_push_tokens` | 加密 PostgreSQL，绝不能上传 IPFS/链上 |
| Apple 登录标识 | 加密或 HMAC 后存 PostgreSQL |
| `notifications` | PostgreSQL，推送完成后按策略清理 |
| 审计结果 | 链上只存审计哈希，不存完整隐私快照 |

需要特别注意：目前 [deleteDeviceData()](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/db.js:738) 会把被“删除”的章节、通知、任务、收藏和推送 Token 完整复制到 `audit_events.snapshot_json`。这实际不是彻底删除。迁移时建议把审计快照改成：

```json
{
  "entityIdHash": "...",
  "action": "deleted",
  "deletedAt": "...",
  "previousContentHash": "..."
}
```

不要继续保存完整正文和推送 Token。

另外，[hashAccountIdentifier()](/Users/liqingsong/Desktop/advx/AdventureX-2026/backend/src/db.js:309) 在没有环境变量时使用固定默认 salt。生产环境至少必须设置强随机的 `RECALLO_ACCOUNT_HASH_SALT`，更推荐改为服务端 HMAC-SHA-256。

## 7. 推荐实施顺序

第一阶段先完成最小闭环：

1. 部署 IPFS Kubo 或选择两个 Pinning 节点。
2. 后端增加 `uploadToIpfs()`。
3. 增加 AES-256-GCM 加密模块。
4. 增加 `content_objects` 表。
5. 部署 `ContentRegistry.sol` 到 Injective Testnet。
6. 章节生成完成后：加密 → IPFS → CID 上链。
7. iOS 根据 API 返回的章节正文继续工作，暂时不用直接访问链。

第二阶段再做：

1. iOS 钱包与 Injective 签名。
2. 用户自己签署 CID 登记交易。
3. iOS Keychain 保存用户主加密密钥。
4. 多设备密钥同步和恢复。
5. 多 IPFS 节点 Pin、健康检查与重新 Pin。
6. PostgreSQL 中的章节正文迁移成 CID 索引。

最适合当前项目的第一个目标不是“所有数据立刻上链”，而是先把 `chapter_json` 做成：

```text
加密 chapter JSON → IPFS CID → Injective 登记 CID → PostgreSQL 保留查询索引
```

这条链路跑通以后，截图、头像、收藏、学习记录都可以按同一模式逐步迁移。
