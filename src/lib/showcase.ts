import { cases, history, metrics, projects, stack, type Case } from "@/lib/content";

export type MetricView = { value: string; unit?: string; label: string };
export type Comparison = { label: string; before: number; after: number; unit: string; digits: number; lowerIsBetter: boolean };
export type CaseView = { id: string; title: string; short: string; sub: string; tag: string; href: string; problem: string; approach: string; metrics: MetricView[]; compare?: Comparison; techs: string[]; more?: Case["more"]; scope: Case["scope"] };
export type NetNode = { id: string; layer: number; label: string; short: string; href: string; text?: string; tag?: string; meta?: string; metrics?: MetricView[]; compare?: Comparison; caseIndex?: number };
export type Network = { layers: string[][]; nodes: Record<string, NetNode>; chains: string[][] };

const ko = (value: number) => value.toLocaleString("ko-KR");
const vqaFirst = metrics.vqa.stages[0].score, vqaLast = metrics.vqa.stages.at(-1)!.score;

// Every number shown on the home page is read from metrics.json or history.json, never retyped.
const metricViews: Record<string, () => MetricView> = {
  frontend: () => ({ value: `${metrics.engine.frontendBeforeMs} → ${metrics.engine.frontendAfterMs}`, unit: "ms", label: "반주 엔진 앞단 실기기 계산 시간" }),
  compute: () => ({ value: `${metrics.engine.computeMs} / ${metrics.engine.budgetMs}`, unit: "ms", label: "10ms 처리 예산 중 앞단과 본체" }),
  controlTicks: () => ({ value: ko(metrics.engine.controlTicks), unit: "틱", label: "Python 참조와 Rust 이식 제어 수학 비트 동일" }),
  publicScore: () => ({ value: vqaLast.toFixed(5), label: `VQA Public 점수 · 베이스라인 ${vqaFirst.toFixed(5)}` }),
  leaderboard: () => ({ value: `${metrics.vqa.leaderboard.rank}위`, unit: ` / ${metrics.vqa.leaderboard.teams}팀`, label: "SSAFY AI 챌린지 Public 리더보드" }),
  release: () => ({ value: metrics.app.platforms.join(" · "), label: "악보 앱 출시" }),
  missingData: () => ({ value: `${ko(metrics.pipeline.defaultedSongs)} / ${ko(metrics.pipeline.batchSongs)}`, unit: "곡", label: "수정 전 120BPM 기본값이 들어가 있던 곡" }),
};
const comparisons: Record<string, () => Comparison> = {
  frontend: () => ({ label: "앞단 계산 시간 · 창 전체 → 증분", before: metrics.engine.frontendBeforeMs, after: metrics.engine.frontendAfterMs, unit: "ms", digits: 1, lowerIsBetter: true }),
  publicScore: () => ({ label: "Public 점수 · 제공 베이스라인 → 최종", before: vqaFirst, after: vqaLast, unit: "", digits: 5, lowerIsBetter: false }),
};

export function metricView(key: string) {
  const view = metricViews[key];
  if (!view) throw new Error(`Unknown metric key: ${key}`);
  return view();
}

const month = (date: string) => date.slice(0, 7).replace("-", ".");
const caseHref = (item: Case) => `/projects/${item.projectId}/${item.part ? `#${item.part}` : ""}`;

export function caseViews(): CaseView[] {
  return cases.map((item) => {
    const project = projects.find((entry) => entry.id === item.projectId)!;
    const part = project.parts?.find((entry) => entry.id === item.part);
    const repo = history.repositories.find((entry) => entry.id === item.repo)!;
    const techs = stack.flatMap((group) => group.items).filter((tech) => tech.projectId === item.projectId && (tech.part ?? undefined) === item.part).map((tech) => tech.name);
    return {
      id: item.id, short: item.short, href: caseHref(item), problem: item.problem, approach: item.approach, scope: item.scope, techs, more: item.more,
      title: item.title ?? part!.title, sub: item.sub ?? part!.description,
      tag: `${month(repo.firstDate)} — ${month(repo.lastDate)} · ${ko(repo.authorCommits)}커밋`,
      metrics: [...item.metrics.map(metricView), { value: ko(repo.authorCommits), unit: "커밋", label: `${repo.title} · ${repo.branch} 브랜치 작성 커밋` }],
      compare: item.compare ? comparisons[item.compare]() : undefined,
    };
  });
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// Each technology yields one chain: technology → group → case → project. Highlighting follows
// whole chains so a group never implies a technology was used somewhere it was not.
export function buildNetwork(): Network {
  const views = caseViews();
  const nodes: Record<string, NetNode> = {};
  const chains: string[][] = [];
  const groupIds = stack.map((group, i) => {
    const id = `group-${i}`;
    nodes[id] = { id, layer: 1, label: group.title, short: group.short, href: "", text: group.items.map((tech) => tech.name).join(" · ") };
    return id;
  });
  cases.forEach((item, i) => {
    const view = views[i];
    nodes[`case-${item.id}`] = { id: `case-${item.id}`, layer: 2, label: view.title, short: item.short, href: view.href, text: view.sub, meta: view.tag, metrics: view.metrics, compare: view.compare, caseIndex: i };
  });
  projects.forEach((project) => {
    nodes[`project-${project.id}`] = { id: `project-${project.id}`, layer: 3, label: project.title, short: project.short, href: `/projects/${project.id}/`, text: project.outcome, meta: project.period, tag: project.role };
  });
  stack.forEach((group, gi) => group.items.forEach((tech) => {
    const item = cases.find((entry) => entry.projectId === tech.projectId && entry.part === tech.part);
    if (!item) throw new Error(`No case for technology ${tech.name}`);
    const id = `tech-${slug(tech.name)}`;
    nodes[id] = { id, layer: 0, label: tech.name, short: tech.name, href: caseHref(item), text: tech.description, tag: tech.mode, meta: group.title };
    chains.push([id, groupIds[gi], `case-${item.id}`, `project-${item.projectId}`]);
  }));
  // Order later layers by the mean position of their parents to keep edges from crossing.
  const layers: string[][] = [Object.values(nodes).filter((node) => node.layer === 0).map((node) => node.id), groupIds];
  for (let layer = 2; layer < 4; layer++) {
    const previous = layers[layer - 1];
    const ids = Object.values(nodes).filter((node) => node.layer === layer).map((node) => node.id);
    const center = (id: string) => {
      const parents = chains.filter((chain) => chain[layer] === id).map((chain) => previous.indexOf(chain[layer - 1]));
      return parents.reduce((sum, value) => sum + value, 0) / Math.max(parents.length, 1);
    };
    layers.push(ids.sort((a, b) => center(a) - center(b)));
  }
  return { layers, nodes, chains };
}
