// Copyright (c) 2026 Thought Relay contributors. MIT; see LICENSE.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, X } from "lucide-react";

interface Memory {
	revision: number; enabled: boolean; goal: string; nextStep: string; updatedAt: string | null;
	source: { actor: string; quote: string; sessionId: string } | null;
	notes: { id: string; text: string; kind: string; done: boolean; source: { quote: string; sessionId: string; at: string } }[];
}
const field = "mt-1 w-full rounded-lg border border-[var(--inno-border)] bg-[var(--inno-surface)] p-3 text-sm text-[var(--inno-text)]";
const button = "rounded-lg border border-[var(--inno-border)] px-3 py-2 text-sm hover:bg-[var(--inno-surface-muted)] disabled:opacity-40";

export function RelayMemory({ workspaceId, disabled = false }: { workspaceId: string | null; disabled?: boolean }) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [open, setOpen] = useState(false);
	const [state, setState] = useState<Memory | null>(null);
	const [goal, setGoal] = useState("");
	const [nextStep, setNextStep] = useState("");
	const [note, setNote] = useState("");
	const [error, setError] = useState("");
	const [status, setStatus] = useState("");
	const [busy, setBusy] = useState(false);
	const url = `/api/relay?workspaceId=${encodeURIComponent(workspaceId || "tmp")}`;
	const receive = (value: Memory) => { setState(value); setGoal(value.goal); setNextStep(value.nextStep); };
	const request = async (patch?: Record<string, unknown>): Promise<Memory> => {
		const res = await fetch(url, patch ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) } : undefined);
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || "暂时无法读取接力记忆");
		return data;
	};
	useEffect(() => {
		if (!open) return;
		dialog.current?.showModal();
		let cancelled = false;
		setState(null); setError(""); setStatus(""); setNote("");
		void request().then(value => { if (!cancelled) receive(value); }).catch(e => { if (!cancelled) setError(e.message); });
		return () => { cancelled = true; };
	}, [open, url]);
	const save = async (patch: Record<string, unknown>) => {
		if (!state) return;
		setBusy(true); setError(""); setStatus("");
		try {
			const saved = await request({ expectedRevision: state.revision, ...patch });
			setState(saved);
			if (patch.goal !== undefined) setGoal(saved.goal);
			if (patch.nextStep !== undefined) setNextStep(saved.nextStep);
			setStatus("已保存，下次对话会接着这里继续。");
			if (patch.note) setNote("");
		} catch (e) { setError(e instanceof Error ? e.message : "保存失败"); }
		finally { setBusy(false); }
	};
	const close = () => { dialog.current?.close(); setOpen(false); };
	return <>
		<button type="button" className={button + " inline-flex items-center gap-2 text-[var(--inno-text-muted)]"} disabled={disabled} onClick={() => setOpen(true)} title={disabled ? "先创建工作区，再记录念头" : "查看、纠正或暂停当前工作区的接力记录"}>
			<Bookmark size={15} />接力记忆
		</button>
		{open && createPortal(<dialog ref={dialog} onCancel={() => setOpen(false)} className="m-auto max-h-[85dvh] w-[min(560px,94vw)] overflow-y-auto rounded-2xl border border-[var(--inno-border)] bg-[var(--inno-surface)] p-6 text-[var(--inno-text)] shadow-2xl backdrop:bg-black/35">
			<div className="mb-5 flex items-start justify-between gap-4">
				<div><h2 className="text-xl font-semibold">把念头接住</h2><p className="mt-2 text-xs text-[var(--inno-text-muted)]">当前工作区的记录。聊天时自然说出来，也可以在这里纠正。</p></div>
				<button type="button" aria-label="关闭接力记忆" onClick={close}><X size={20} /></button>
			</div>
			{error && <div role="alert" className="mb-3 text-sm text-[var(--inno-danger)]">{error}<button className="ml-2 underline" onClick={() => { void request().then(value => { receive(value); setError(""); }).catch(e => setError(e.message)); }}>重新读取</button></div>}
			{status && <p role="status" className="mb-3 text-sm text-[var(--inno-success)]">{status}</p>}
			{!state && !error && <p>正在读取…</p>}
			{state && <div className="space-y-4">
				<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={state.enabled} disabled={busy} onChange={e => void save({ enabled: e.target.checked })} />在对话中使用接力记忆</label>
				{!state.enabled && <p className="text-xs">已暂停自动读取和写入。已有记录仍保留在本机。</p>}
				<form className="space-y-3" onSubmit={e => { e.preventDefault(); void save({ goal, nextStep }); }}>
					<label className="block text-sm">现在最想推进的事<textarea className={field} rows={2} maxLength={500} placeholder="例如：做一个真正能帮我准备 FAE 面试的项目" value={goal} onChange={e => setGoal(e.target.value)} /></label>
					<label className="block text-sm">下一次，从这里开始<textarea className={field} rows={2} maxLength={500} placeholder="例如：今晚只完成模型连接测试，留下实际结果" value={nextStep} onChange={e => setNextStep(e.target.value)} /></label>
					<button className={button + " bg-[var(--inno-accent-soft)]"} disabled={busy}>保存我的修改</button>
				</form>
				{state.source && <details className="text-xs text-[var(--inno-text-muted)]"><summary className="cursor-pointer">最近更新来源 · {state.source.actor === "agent" ? "对话提取" : "你直接编辑"} · 第 {state.revision} 版</summary><p className="mt-2 whitespace-pre-wrap">{state.source.quote}</p>{state.source.sessionId && <a className="mt-1 inline-block underline" href={`/?session=${encodeURIComponent(state.source.sessionId)}`}>查看来源对话</a>}</details>}
				<div className="border-t border-[var(--inno-border)] pt-4"><h3 className="text-sm font-semibold">暂时放不下的念头</h3><p className="mt-1 text-xs text-[var(--inno-text-muted)]">记录一个想法或卡点，不必立刻变成待办。</p></div>
				<form onSubmit={e => { e.preventDefault(); void save({ note: { text: note, kind: "idea" } }); }} className="flex gap-2"><input className={field + " !mt-0"} maxLength={1000} aria-label="新的念头" value={note} onChange={e => setNote(e.target.value)} placeholder="先把这一闪而过的想法留下…" /><button className={button + " shrink-0"} disabled={busy || !note.trim()}>记下来</button></form>
				{state.notes.length === 0 && <p className="py-3 text-sm text-[var(--inno-text-subtle)]">这里还是空的。你可以在聊天中说：“帮我记住……”</p>}
				{state.notes.map(n => <article key={n.id} className="rounded-xl border border-[var(--inno-border)] p-3">
					<div className="mb-1 text-[11px] text-[var(--inno-text-muted)]">{n.done ? "已接住" : ({ idea: "想法", obstacle: "卡点", fact: "事实" }[n.kind] || "念头")}</div>
					<p className={"whitespace-pre-wrap text-sm " + (n.done ? "line-through opacity-50" : "")}>{n.text}</p>
					<details className="mt-2 text-xs text-[var(--inno-text-muted)]"><summary className="cursor-pointer">查看原话与来源</summary><p className="mt-2">{n.source.quote}</p>{n.source.sessionId && <a className="underline" href={`/?session=${encodeURIComponent(n.source.sessionId)}`}>打开来源对话</a>}</details>
					<div className="mt-2 flex gap-3 text-xs">{!n.done && <button disabled={busy} onClick={() => void save({ resolveId: n.id })}>已经做完</button>}<button className="text-[var(--inno-text-muted)]" disabled={busy} onClick={() => void save({ deleteId: n.id })}>忘掉这条</button></div>
				</article>)}
				<p className="text-xs text-[var(--inno-text-subtle)]">记录保存在本机；开启时，相关记录会随对话发送给你配置的模型服务。</p>
			</div>}
		</dialog>, document.body)}
	</>;
}
