// Live acceptance check. Creates a clearly labelled demo workspace; spends model tokens.
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
const base = process.env.RELAY_URL || 'http://127.0.0.1:8049';
async function api(path, body, method = 'POST') {
 const res = await fetch(base + path, { method: body ? method : 'GET', headers: {'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(240000) });
 const value = await res.json();
 if (!res.ok) throw new Error(`${res.status}: ${value.error || 'request failed'}`);
 return value;
}
const workspace = await api('/api/workspaces', {name:'验收示例 · 念头接力'});
console.log('已创建独立验收工作区:', workspace.id);
const first = await api('/api/sessions', {workspaceId:workspace.id});
const prompt = '这是接力功能验收，请只使用 relay_read 和 relay_update，不写学习画像。帮我记住：我想把阳台改成一个小菜园；下一步是明晚测量阳台日照。只回复保存结果。';
const answer = await api('/api/chat', {sessionId:first.id, prompt});
console.log('第一轮:', answer.response);
const route = '/api/relay?workspaceId=' + encodeURIComponent(workspace.id);
let state = await api(route);
assert.match(state.goal, /菜园/); assert.match(state.nextStep, /日照/);
assert.equal(state.source.actor, 'agent'); assert.ok(prompt.includes(state.source.quote));
const correction = '先测量阳台可用面积';
state = await api(route, {expectedRevision:state.revision, nextStep:correction}, 'PATCH');
const second = await api('/api/sessions', {workspaceId:workspace.id});
const continuation = await api('/api/chat', {sessionId:second.id, prompt:'接着上次，我现在应该从哪一步开始？只根据当前工作区的接力记录回答一句，不要调用其他工具。'});
console.log('新会话:', continuation.response);
assert.match(continuation.response, /面积/);
const final = await api(route); assert.equal(final.nextStep, correction);
const summary = {passed:true, checkedAt:new Date().toISOString(), workspaceId:workspace.id, sessions:[first.id,second.id], memory: {goal:final.goal,nextStep:final.nextStep,revision:final.revision}, firstReply:answer.response, resumedReply:continuation.response};
mkdirSync('runtime/acceptance',{recursive:true});
writeFileSync('runtime/acceptance/live-result.json',JSON.stringify(summary,null,2));
console.log('PASS: 模型工具写入 → 用户纠正 → 新会话接续。');
