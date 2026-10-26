![99AI — Open-source, self-hostable Web Agent foundation](./assets/readme/99ai-banner.png)

# 99Agent

**An open-source, self-hostable Web Agent foundation.**

From tasks in the browser to sandboxed execution and file delivery. Includes a web client and admin console. Connect your models and extend capabilities with Skills and MCP.

[简体中文](./README.md) · English

[Deployment](./site/deployment/index.md) · [Configuration](./site/configuration/index.md) · [Development](./site/guide/development.md) · [Changelog](./site/changelog.md)

## Demo video

https://github.com/user-attachments/assets/4d549fb0-c25f-4a67-a3a8-1babee8f411a

An 85-second overview with illustrative UI and workflows. Capabilities depend on your models and extensions. [Download video](./assets/readme/99ai-promo.mp4)

## Core capabilities

- **Task conversations** — Multi-user accounts, streaming responses, uploads, visible tool activity, and deliverables in the conversation.
- **Isolated sandboxes** — Docker + gVisor for commands and file processing, with Python, Node, and document, image, and audio/video tools.
- **Persistent workspaces** — Each signed-in user has a dedicated disk shared across conversations. Guests use temporary sandboxes.
- **Model integrations** — OpenAI-compatible APIs, Responses, Anthropic, Gemini, and OpenCode Go.
- **Skills and MCP** — Package instructions and scripts as skills. Connect external tools and business systems through MCP.
- **Extension packs** — Choose the model protocols, login providers, storage, and commerce features you need.

## Get started

Use Node.js 24 LTS, pnpm 11, MySQL 8, and Redis 6+. Production sandboxes require Linux, Docker 28+, gVisor, and the user disk helper. The main application runs on a Node.js host.

```bash
git clone https://github.com/vastxie/99AI.git
cd 99AI
```

1. Prepare the runtime using the [sandbox guide](./sandbox/README.md).
2. Follow the [deployment guide](./site/deployment/index.md#install) to configure, build, and initialize an empty database.
3. Open the web client at `http://localhost:9520` and the admin console at `/admin`. Add a model through [model management](./site/configuration/ai/model-settings.md).

> **0.1.0 beta.** A fresh deployment is required; databases and configuration from the previous 99AI are incompatible. APIs and data structures may change before 1.0.

The linked guides are currently in Chinese.

## Development and contributing

Built with NestJS and Vue 3. Use Skills, MCP, sandbox images, and removable extension packs to build your own agent product.

[Contributing](./CONTRIBUTING.md) · [Extension packs](./site/deployment/packs.md) · [Issues](https://github.com/vastxie/99AI/issues) · [Security](./SECURITY.md)

---

[Apache-2.0](./LICENSE)
