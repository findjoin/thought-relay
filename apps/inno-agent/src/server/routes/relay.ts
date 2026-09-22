// Copyright (c) 2026 Thought Relay contributors. MIT; see LICENSE.
import type { IncomingMessage, ServerResponse } from "node:http";
import { RelayStore, type RelayPatch } from "../../relay/store.js";
import type { WorkspaceRegistry } from "../../workspace/workspace-registry.js";
import { HttpError, json, readBody } from "../http-helpers.js";

export async function handleRelayRoutes(req: IncomingMessage, res: ServerResponse, method: string, url: string,
	ctx: { dataDir: string; workspaceRegistry: WorkspaceRegistry }): Promise<boolean> {
	const parsed = new URL(url, "http://localhost");
	if (parsed.pathname !== "/api/relay") return false;
	const workspaceId = parsed.searchParams.get("workspaceId") || "tmp";
	const workspaceDir = ctx.workspaceRegistry.resolveWorkspaceDir(workspaceId);
	if (!workspaceDir) throw new HttpError(404, "工作区不存在");
	const store = new RelayStore(ctx.dataDir, workspaceDir);
	if (method === "GET") { json(res, 200, store.read()); return true; }
	if (method !== "PATCH") throw new HttpError(405, "不支持此操作");
	if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new HttpError(403, "不允许跨站修改接力记忆");
	if (!req.headers["content-type"]?.startsWith("application/json")) throw new HttpError(415, "请使用 JSON 请求");
	const patch = await readBody(req, { maxBytes: 16_384 }) as RelayPatch;
	json(res, 200, store.update(patch, { actor: "user", sessionId: "", quote: "用户在接力记忆面板直接编辑", at: new Date().toISOString() }));
	return true;
}
