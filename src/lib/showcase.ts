import { cases, getUnitDoc, getWriting, history, metrics, profile, projects, stack, type Case, type Project, type UnitWork } from "@/lib/content";

export type MetricView = { value: string; unit?: string; label: string };
export type Comparison = { label: string; before: number; after: number; unit: string; digits: number; delta?: "pp"; lowerIsBetter: boolean };
export type TroubleView = { slug: string; title: string };
export type CaseView = { id: string; projectId: string; part?: string; title: string; short: string; fold: boolean; lead: string[]; store?: Pick<Project, "short" | "links">; tag: string; anchor: string; stack: string[]; overview: string; hardest: NonNullable<Case["hardest"]>; work: UnitWork[]; result?: UnitWork; troubles: TroubleView[]; results: MetricView[] };
export type StatView = MetricView & { context: string; anchor: string };

const ko = (value: number) => value.toLocaleString("ko-KR");
const vqaFirst = metrics.vqa.stages[0].score, vqaLast = metrics.vqa.stages.at(-1)!.score;

// Every number shown on the home page is read from metrics.json or history.json, never retyped.
const metricViews: Record<string, () => MetricView> = {
  frontend: () => ({ value: `${metrics.engine.frontendBeforeMs} → ${metrics.engine.frontendAfterMs}`, unit: "ms", label: "반주 엔진 전처리 실기기 계산 시간" }),
  compute: () => ({ value: `${metrics.engine.computeMs} / ${metrics.engine.budgetMs}`, unit: "ms", label: "전처리·신경망 실기기 계산 · 10ms 처리 예산 안" }),
  controlTicks: () => ({ value: ko(metrics.engine.controlTicks), unit: "프레임", label: "Rust 이식 제어 출력 · Python 참조와 비트 동일" }),
  publicScore: () => ({ value: vqaLast.toFixed(5), label: `VQA Public 점수 · 베이스라인 ${vqaFirst.toFixed(5)}` }),
  leaderboard: () => ({ value: `${metrics.vqa.leaderboard.private.overall}위`, unit: ` / ${metrics.vqa.leaderboard.teams}팀`, label: `SSAFY AI 챌린지 Private 리더보드 · 서울 캠퍼스 ${metrics.vqa.leaderboard.private.seoul}위 · Public ${metrics.vqa.leaderboard.rank}위에서 상승` }),
  release: () => ({ value: metrics.app.platforms.join(" · "), label: "앱 출시" }),
  missingData: () => ({ value: `${ko(metrics.pipeline.defaultedSongs)} / ${ko(metrics.pipeline.batchSongs)}`, unit: "곡", label: "120BPM 기본값이 채워져 있던 곡 · 수정 전 배치" }),
};
const comparisons: Record<string, () => Comparison> = {
  frontend: () => ({ label: "전처리 계산 시간 · 전체 재계산 → 증분", before: metrics.engine.frontendBeforeMs, after: metrics.engine.frontendAfterMs, unit: "ms", digits: 1, lowerIsBetter: true }),
};

export function metricView(key: string) {
  const view = metricViews[key];
  if (!view) throw new Error(`Unknown metric key: ${key}`);
  return view();
}

export function comparison(key: string) {
  const compare = comparisons[key];
  if (!compare) throw new Error(`Unknown comparison key: ${key}`);
  return compare();
}

const month = (date: string) => date.slice(0, 7).replace("-", ".");
const span = (first: string, last: string) => month(first) === month(last) ? month(first) : `${month(first)} ~ ${month(last)}`;

// Every unit card is filled from the same slots: stack, overview, work, troubleshooting, result.
export function caseViews(): CaseView[] {
  const posts = getWriting();
  return cases.map((item) => {
    const project = projects.find((entry) => entry.id === item.projectId)!;
    const part = project.parts?.find((entry) => entry.id === item.part);
    const repo = history.repositories.find((entry) => entry.id === item.repo)!;
    const doc = getUnitDoc(item.projectId, item.part);
    // Without its own stack line a unit lists what stack.json records for it: languages first.
    const used = stack.groups.flatMap((group) => group.items).filter((tech) => tech.projectId === item.projectId && tech.part === item.part);
    return {
      id: item.id, projectId: item.projectId, part: item.part, short: item.short, fold: item.fold ?? false, lead: item.lead ?? [], anchor: `part-${item.id}`,
      // The unit whose result is the release carries the project's store listings next to it.
      store: item.results?.includes("release") && project.links?.length ? { short: project.short, links: project.links } : undefined,
      title: item.title ?? part!.title,
      tag: `${span(repo.firstDate, repo.lastDate)} · ${ko(repo.authorCommits)}커밋`,
      stack: item.stack ?? [...new Set(used.map((tech) => tech.language)), ...used.map((tech) => tech.name)],
      overview: doc.overview, work: doc.work, result: doc.result, hardest: item.hardest ?? [],
      troubles: (item.troubles ?? []).map((slug) => {
        const post = posts.find((entry) => entry.slug === slug);
        if (!post) throw new Error(`${item.id}: unknown writing ${slug}`);
        return { slug, title: post.title };
      }),
      results: (item.results ?? []).map(metricView),
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
