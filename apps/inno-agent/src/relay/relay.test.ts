import { createRelayTools, relayUserSources } from "./tools.js";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayStore, relayContext, verifyRelayQuote, matchRelayQuote } from "./store.js";
import { evidenceWindow, recall } from "../memory/l3/recall.js";
import type { L3Store, L3SearchHit } from "../memory/l3/sqlite-store.js";
const dirs: string[] = [];
const make = () => { const dir = mkdtempSync(join(tmpdir(), "relay-test-")); dirs.push(dir); return dir; };
const source = { actor: "user" as const, quote: "我想做项目", sessionId: "s1", at: "2026-09-23T00:00:00Z" };
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe("接力记忆", () => {
	it("暂停时工具不能绕过面板开关读出内容", async () => {
		const store = new RelayStore(make(), "/a");
		store.update({ expectedRevision: 0, goal: "私有目标", enabled: false }, source);
		const tool = createRelayTools(() => store, () => "", () => "s1", () => true)[0];
		const response = await tool.execute("test", {}, undefined, undefined, {} as never);
		expect(JSON.stringify(response)).not.toContain("私有目标");
		expect(JSON.stringify(response)).toContain("disabled");
	});
	it("跨实例持久化，工作区隔离", () => {
		const dir = make(); new RelayStore(dir, "/a").update({ expectedRevision: 0, goal: "FAE 项目" }, source);
		expect(new RelayStore(dir, "/a").read().goal).toBe("FAE 项目");
		expect(new RelayStore(dir, "/b").read().goal).toBe("");
	});
	it("拒绝过时模型覆盖用户纠正", () => {
		const store = new RelayStore(make(), "/a");
		store.update({ expectedRevision: 0, goal: "先完成连接" }, source);
		expect(() => store.update({ expectedRevision: 0, goal: "旧建议" }, { ...source, actor: "agent" })).toThrow("刷新");
		expect(store.read().goal).toBe("先完成连接");
	});
	it("来源必须来自用户本轮原话", () => {
		expect(verifyRelayQuote("先完成连接", "我想先完成连接。明天再说。")).toBe("先完成连接");
		expect(() => verifyRelayQuote("必须读论文", "先完成连接")).toThrow("逐字");
	});
	it("暂停后不注入，也不能自动写入", () => {
		const store = new RelayStore(make(), "/a");
		const state = store.update({ expectedRevision: 0, goal: "实验", enabled: false }, source);
		expect(relayContext(state)).toBe("");
		expect(() => store.update({ expectedRevision: 1, nextStep: "写论文" }, { ...source, actor: "agent" })).toThrow("暂停");
	});
	it("完成后移出注入，删除后不保留原文", () => {
		const store = new RelayStore(make(), "/a");
		const note = store.update({ expectedRevision: 0, note: { text: "验证模型连接", kind: "obstacle" } }, source).notes[0];
		const done = store.update({ expectedRevision: 1, resolveId: note.id }, source);
		expect(relayContext(done)).not.toContain("验证模型连接");
		expect(store.update({ expectedRevision: 2, deleteId: note.id }, source).notes).toEqual([]);
	});
	it("无效写入不能部分修改已有状态", () => {
		const store = new RelayStore(make(), "/a");
		expect(() => store.update({ expectedRevision: 0, goal: "不该保存", resolveId: "missing" }, source)).toThrow();
		expect(store.read().revision).toBe(0);
	});
});
const hit = (id: string, sessionId: string, text: string): L3SearchHit => ({ id, sessionId, text, role: "user", ts: 1000, bm25: -1 });
const fake = (hits: L3SearchHit[]) => ({ searchLexical: () => hits }) as unknown as L3Store;
describe("检索改造的回归案例", () => {
	it("相同开头、不同结论不会误去重", () => {
		const intro = "机器学习".repeat(30);
		expect(recall(fake([hit("1", "a", intro + "成功"), hit("2", "b", intro + "失败")]), "机器学习")).toHaveLength(2);
	});
	it("完整重复内容去重", () => {
		expect(recall(fake([hit("1", "a", "Python 数据"), hit("2", "b", "Python  数据")]), "Python")).toHaveLength(1);
	});
	it("一段长会话不会挤掉其他相关来源", () => {
		const hits = [hit("1", "a", "Python 编程"), hit("2", "a", "Python 调试"), hit("3", "b", "Python 测试")];
		expect(recall(fake(hits), "Python", { limit: 2 }).map(r => r.sessionId)).toEqual(["a", "b"]);
	});
	it("长文本摘录仍保留末尾命中证据", () => {
		const snippet = evidenceWindow("前言 ".repeat(300) + "最后发现 SQLite 事务冲突", ["sqlite"]);
		expect(snippet).toContain("SQLite"); expect(snippet.length).toBeLessThanOrEqual(322);
	});
	it("无关结果不进入记忆，零上限与活动会话排除有效", () => {
		const store = fake([hit("1", "a", "Python")]);
		expect(recall(store, "旅行")).toEqual([]);
		expect(recall(store, "Python", { limit: 0 })).toEqual([]);
		expect(recall(store, "Python", { excludeSessionId: "a" })).toEqual([]);
	});
});


describe("真实用户多轮对话回归", () => {
	const userEntry = (id: string, text: string) => ({ type: "message", id, message: { role: "user", content: [{ type: "text", text }] } });
	it("引用上一句学摄影时允许保存，并记录实际来源消息", async () => {
		const store = new RelayStore(make(), "/a");
		const branch = [userEntry("u1", "我想去学摄影"), userEntry("u2", "我想记录生活里的细节")];
		const tool = createRelayTools(() => store, () => "我想记录生活里的细节", () => "conversation-a", () => true)[1];
		await tool.execute("test", { expectedRevision: 0, goal: "学摄影", sourceQuote: "我想去学摄影" }, undefined, undefined,
			{ sessionManager: { getBranch: () => branch } } as never);
		expect(store.read().source).toMatchObject({ quote: "我想去学摄影", messageId: "u1", sessionId: "conversation-a" });
		expect(store.read().goal).toBe("学摄影");
	});
	it("模型补的句末标点不导致拒绝，保存的仍为用户原文", () => {
		expect(verifyRelayQuote("我想记录生活里的细节。", "我想记录生活里的细节")).toBe("我想记录生活里的细节");
	});
	it("来源仍排除助手、工具返回和跨消息拼接", () => {
		const branch = [userEntry("u1", "我想学摄影"),
			{ type: "message", id: "a1", message: { role: "assistant", content: [{ type: "text", text: "今晚投递十家公司" }] } },
			{ type: "message", id: "t1", message: { role: "toolResult", content: [{ type: "text", text: "用户要辞职" }] } }, userEntry("u2", "想改变生活")];
		const sources = relayUserSources(branch as never, "想改变生活");
		expect(() => matchRelayQuote("今晚投递十家公司", sources)).toThrow("原话");
		expect(() => matchRelayQuote("用户要辞职", sources)).toThrow("原话");
		expect(() => matchRelayQuote("我想学摄影想改变生活", sources)).toThrow("原话");
	});
	it("最近六条之外的旧消息不自动成为写入依据", () => {
		const branch = [userEntry("old", "我要搬家"), ...Array.from({ length: 6 }, (_, i) => userEntry(`u${i}`, `最近消息${i}`))];
		expect(() => matchRelayQuote("我要搬家", relayUserSources(branch as never, "最近消息5"))).toThrow("原话");
	});
	it("正则字符与内部标点必须保持原样", () => {
		expect(verifyRelayQuote("学习 C++ (入门)。", "下一步学习 C++ (入门)")).toBe("学习 C++ (入门)");
		expect(() => verifyRelayQuote("不要辞职", "不，要辞职")).toThrow("原话");
	});
});
