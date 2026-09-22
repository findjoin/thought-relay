// Copyright (c) 2026 Thought Relay contributors. MIT; see LICENSE.
import { Type } from "typebox";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { RelayStore, matchRelayQuote, type RelayUserMessage } from "./store.js";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export function relayUserSources(branch: SessionEntry[], currentPrompt: string): RelayUserMessage[] {
	const messages: RelayUserMessage[] = [];
	for (const entry of branch) {
		if (entry.type !== "message" || entry.message.role !== "user") continue;
		const content = entry.message.content;
		const text = typeof content === "string" ? content : content.filter(block => block.type === "text").map(block => block.text).join("\n");
		if (text.trim()) messages.push({ text, messageId: entry.id });
	}
	// Some SDK entry points persist the current message only after the turn starts.
	if (currentPrompt.trim() && messages.at(-1)?.text !== currentPrompt) messages.push({ text: currentPrompt });
	return messages.slice(-6);
}

export const RELAY_GUIDE = `你是“念头接力”，一个帮助用户把零散想法接到生活、学习和研究行动上的中文助手。
这是基于 Inno Agent 改造的应用。保留聊天、资料库与练习工具；不要强制用户先填学习画像。
先回应用户当下的事情，再按需要使用工具。一次给出一个具体可做的下一步，避免泛泛的长计划。
接力记忆：用户明确提出目标、待办、卡点，或说“记住/接着上次”时，使用 relay_read / relay_update。
写入前读取当前版本。sourceQuote 必须逐字摘自当前会话最近六条用户消息之一，可以引用用户上一句话；不能拼接不同消息，以最近的修正为准。模型自己的建议只在回复中提出，未经用户采纳不可写成既定目标或下一步。
用户说“生活要有跳跃式进展”等笼统愿望时，先回应、问清最想改变什么，不要擅自给他写入你编的待办。记忆保存失败不应妨碍正常对话；同一句原话校验失败时不要重复调用，简要说明后继续帮助用户。
用户纠正时更新原目标；完成卡点时 resolveId；要求忘记某条时 deleteId。不得重复记录相同念头。
遇到版本冲突先重新读取，尊重用户刚刚在面板里的修改。只有工具返回成功才可说“已记住”。
接力记忆与资料库不是一回事：资料正文归档到 L2，当前目标和待完成的小事放接力记忆。`;

export function createRelayTools(getStore: () => RelayStore, getPrompt: () => string, getSessionId: () => string, isEnabled: () => boolean): ToolDefinition[] {
	const result = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }], details: {} });
	return [
		defineTool({
			name: "relay_read", label: "查看接力记忆", description: "读取当前工作区的目标、下一步、未完成念头及版本，跨会话保持。修改前必须先读取。",
			parameters: Type.Object({}),
			async execute() {
				if (!isEnabled()) return result({ disabled: true });
				const state = getStore().read();
				return result(state.enabled ? state : { disabled: true, revision: state.revision });
			},
		}),
		defineTool({
			name: "relay_update", label: "更新接力记忆", description: "保存用户明确说过的目标、下一步或念头，或完成/删除旧念头。禁止写入未采纳的模型建议。",
			parameters: Type.Object({
				expectedRevision: Type.Integer({ minimum: 0 }), sourceQuote: Type.String({ description: "当前会话最近六条用户消息中的连续原话，可以来自上一条消息，不要拼接或引用助手建议。" }),
				goal: Type.Optional(Type.String({ maxLength: 500 })), nextStep: Type.Optional(Type.String({ maxLength: 500 })),
				note: Type.Optional(Type.Object({ text: Type.String({ maxLength: 1000 }), kind: Type.Union([Type.Literal("idea"), Type.Literal("obstacle"), Type.Literal("fact")]) })),
				resolveId: Type.Optional(Type.String()), deleteId: Type.Optional(Type.String()),
			}),
			async execute(_id, params, _signal, _onUpdate, ctx) {
				if (!isEnabled()) throw new Error("长期记忆已关闭");
				const sources = relayUserSources(ctx.sessionManager.getBranch(), getPrompt());
				const matched = matchRelayQuote(params.sourceQuote, sources);
				return result(getStore().update(params, { actor: "agent", ...matched, sessionId: getSessionId(), at: new Date().toISOString() }));
			},
		}),
	];
}
