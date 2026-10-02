import { cases, history, metrics, profile, projects, stack, type Case } from "@/lib/content";

export type MetricView = { value: string; unit?: string; label: string };
export type Comparison = { label: string; before: number; after: number; unit: string; digits: number; deltaDigits?: number; lowerIsBetter: boolean };
export type CaseView = { id: string; projectId: string; part?: string; title: string; short: string; line: string; sub: string; tag: string; href: string; anchor: string; problem: string; approach: string; metrics: MetricView[]; headline?: MetricView; evidence: MetricView[]; compare?: Comparison; more?: Case["more"]; scope: Case["scope"] };
export type StatView = MetricView & { context: string; anchor: string };
export type NetNode = { id: string; layer: number; label: string; short: string; href: string; anchor?: string; text?: string; tag?: string; meta?: string; metrics?: MetricView[]; compare?: Comparison };
export type Network = { layers: string[][]; nodes: Record<string, NetNode>; chains: string[][] };

const ko = (value: number) => value.toLocaleString("ko-KR");
const vqaFirst = metrics.vqa.stages[0].score, vqaLast = metrics.vqa.stages.at(-1)!.score;

// Every number shown on the home page is read from metrics.json or history.json, never retyped.
const metricViews: Record<string, () => MetricView> = {
  frontend: () => ({ value: `${metrics.engine.frontendBeforeMs} → ${metrics.engine.frontendAfterMs}`, unit: "ms", label: "반주 엔진 앞단 실기기 계산 시간" }),
  compute: () => ({ value: `${metrics.engine.computeMs} / ${metrics.engine.budgetMs}`, unit: "ms", label: "앞단·신경망 실기기 계산 · 10ms 처리 예산 안" }),
  controlTicks: () => ({ value: ko(metrics.engine.controlTicks), unit: "틱", label: "Rust 이식 제어 출력 · Python 참조와 비트 동일" }),
  publicScore: () => ({ value: vqaLast.toFixed(5), label: `VQA Public 점수 · 베이스라인 ${vqaFirst.toFixed(5)}` }),
  leaderboard: () => ({ value: `${metrics.vqa.leaderboard.rank}위`, unit: ` / ${metrics.vqa.leaderboard.teams}팀`, label: "SSAFY AI 챌린지 Public 리더보드" }),
  release: () => ({ value: metrics.app.platforms.join(" · "), label: "악보 앱 출시" }),
  missingData: () => ({ value: `${ko(metrics.pipeline.defaultedSongs)} / ${ko(metrics.pipeline.batchSongs)}`, unit: "곡", label: "120BPM 기본값이 채워져 있던 곡 · 수정 전 배치" }),
};
const comparisons: Record<string, () => Comparison> = {
  frontend: () => ({ label: "앞단 계산 시간 · 창 전체 → 증분", before: metrics.engine.frontendBeforeMs, after: metrics.engine.frontendAfterMs, unit: "ms", digits: 1, lowerIsBetter: true }),
  publicScore: () => ({ label: "Public 점수 · 제공 베이스라인 → 최종", before: vqaFirst, after: vqaLast, unit: "", digits: 5, deltaDigits: 3, lowerIsBetter: false }),
};

export function metricView(key: string) {
  const view = metricViews[key];
  if (!view) throw new Error(`Unknown metric key: ${key}`);
  return view();
}

const month = (date: string) => date.slice(0, 7).replace("-", ".");
const span = (first: string, last: string) => month(first) === month(last) ? month(first) : `${month(first)} ~ ${month(last)}`;
const caseHref = (item: Case) => `/projects/${item.projectId}/${item.part ? `#${item.part}` : ""}`;
const caseFor = (entry: { name: string; projectId: string; part?: string }) => {
  const item = cases.find((candidate) => candidate.projectId === entry.projectId && candidate.part === entry.part);
  if (!item) throw new Error(`No case for ${entry.name}`);
  return item;
};

// Numbers in the hero row, and the one drawn as a comparison, are not repeated as evidence.
export function caseViews(): CaseView[] {
  return cases.map((item) => {
    const project = projects.find((entry) => entry.id === item.projectId)!;
    const part = project.parts?.find((entry) => entry.id === item.part);
    const repo = history.repositories.find((entry) => entry.id === item.repo)!;
    return {
      id: item.id, projectId: item.projectId, part: item.part, short: item.short, line: item.line, href: caseHref(item), anchor: `part-${item.id}`, problem: item.problem, approach: item.approach, scope: item.scope, more: item.more,
      title: item.title ?? part!.title, sub: item.sub ?? part!.description,
      tag: `${span(repo.firstDate, repo.lastDate)} · ${ko(repo.authorCommits)}커밋`,
      metrics: [...item.metrics.map(metricView), { value: ko(repo.authorCommits), unit: "커밋", label: `${repo.title} · ${repo.branch} 브랜치 작성 커밋` }],
      evidence: item.metrics.filter((key) => !profile.stats.includes(key) && key !== item.compare).map(metricView),
      // The home row shows the comparison when there is one, otherwise the first number.
      headline: item.compare ? undefined : item.metrics[0] ? metricView(item.metrics[0]) : undefined,
      compare: item.compare ? comparisons[item.compare]() : undefined,
    };
  });
}

export function statViews(): StatView[] {
  return profile.stats.map((key) => {
    const item = cases.find((entry) => entry.metrics.includes(key))!;
    const project = projects.find((entry) => entry.id === item.projectId)!;
    return { ...metricView(key), context: item.part ? `${project.short} · ${item.short}` : project.short, anchor: `part-${item.id}` };
  });
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// Each technology yields one chain: language → technology → case → project. Highlighting follows
// whole chains so a language never implies a technology was used somewhere it was not.
export function buildNetwork(): Network {
  const views = caseViews();
  const nodes: Record<string, NetNode> = {};
  const chains: string[][] = [];
  const languageIds = stack.languages.map((language) => {
    const id = `lang-${slug(language.name)}`;
    nodes[id] = { id, layer: 0, label: language.name, short: language.name, href: caseHref(caseFor(language)), text: language.description, meta: "직접 쓰는 언어" };
    return id;
  });
  stack.groups.forEach((group) => group.items.forEach((tech) => {
    const item = caseFor(tech), id = `tech-${slug(tech.name)}`, root = `lang-${slug(tech.language)}`;
    if (!nodes[root]) throw new Error(`${tech.name}: unknown language ${tech.language}`);
    nodes[id] = { id, layer: 1, label: tech.name, short: tech.name, href: caseHref(item), text: tech.description, tag: tech.mode, meta: group.title };
    chains.push([root, id, `case-${item.id}`, `project-${item.projectId}`]);
  }));
  views.forEach((view) => {
    nodes[`case-${view.id}`] = { id: `case-${view.id}`, layer: 2, label: view.title, short: view.short, href: view.href, anchor: view.anchor, text: view.sub, meta: view.tag, metrics: view.metrics, compare: view.compare };
  });
  projects.forEach((project) => {
    nodes[`project-${project.id}`] = { id: `project-${project.id}`, layer: 3, label: project.title, short: project.short, href: `/projects/${project.id}/`, text: project.outcome, meta: project.period, tag: project.role };
  });
  // Order each later layer by the mean position of its parents to keep edges from crossing.
  const layers: string[][] = [languageIds];
  for (let layer = 1; layer < 4; layer++) {
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
