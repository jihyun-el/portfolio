import Link from "next/link";
import type { ReactNode } from "react";
import { contracts, getWriting, metrics, miniProjects, profile, projects, sitePath, stack } from "@/lib/content";
import { getDetail } from "@/lib/details";
import { caseViews, metricView } from "@/lib/showcase";
import { CommitActivity, CommitTimeline } from "@/components/history";
import { StackSection } from "@/components/stack-section";
import { MiniProjectGrid, miniTag } from "@/components/mini-projects";
import { ProjectBrowser } from "@/components/project-browser";
import { ProjectLinks } from "@/components/project-links";
import { SignalChainSection } from "@/components/signal-chain-section";
import { DrawerHost, type DrawerPanel } from "@/components/drawer";
import { Markdown } from "@/components/markdown";
import { DetailPanel } from "@/components/detail-panel";
import { MirrorPoseFigure } from "@/components/mirror-pose-figure";
import { FutureReach } from "@/components/future-reach";
import { ModelDistill, PaymentFlow, StrokeMerge, ThreePositions } from "@/components/detail-figures";
import { MirrorIdeaSteps } from "@/components/project-figures";
import { AppParts } from "@/components/app-parts";
import { PipelineParts } from "@/components/pipeline-parts";
import { ModelParts } from "@/components/model-parts";
import { VqaParts } from "@/components/vqa-parts";
import { ProductLanding } from "@/components/product-landing";

function ProfileCard() {
  return <aside className="card" aria-label="개발자 카드"><div className="card-h"><span>DEVELOPER CARD</span></div><dl>
    {profile.experiences.map((item) => <div key={item.title}><dt>경험</dt><dd>{item.title}<small className="num">{item.period}</small><p>{item.description}</p></dd></div>)}
    {profile.card.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
    {profile.education.map((item) => <div key={item.title}><dt>교육</dt><dd>{item.title}<small className="num">{item.period}</small></dd></div>)}
  </dl></aside>;
}

export default function HomePage() {
  const writing = getWriting();
  const parts = caseViews();
  const leaderboard = metrics.vqa.leaderboard;
  // An award reads with who gave it and for what: the contest above it, the campus rank beside it, the leaderboard under it.
  const award = `${leaderboard.award.name} · 서울 캠퍼스 ${leaderboard.private.seoul}위`;
  // A product with parts is a group in the list: its name and what the lead did with it.
  const groups = projects.filter((project) => project.parts?.length).map((project) => ({
    id: project.id, name: project.short,
    lines: [`${project.displayRole} · ${metrics.app.platforms.join("·")} 출시`],
  }));
  // A figure's steps lead into its own detail, which answers to its project's address.
  const home = (unit: string) => parts.find((item) => item.id === unit)!.projectId;
  const figures: Record<string, ReactNode> = {
    // The compute time on a phone is what the stages up to the network come to, so it stands beside the third stage.
    engine: <SignalChainSection solo project={home("engine")} results={{ 2: metricView("compute") }} note={`iOS 실기기 · ${metrics.engine.budgetMs}ms마다 · 미래 참조 ${contracts.engine.window.lookahead * contracts.engine.window.hopMs}ms`} sound={sitePath("/audio/halt-engine.mp3")} />,
    // The pitch model, app and pipeline are told one step at a time, as VQA is. The pipeline's pictures are its own
    // run on a CC0 song.
    model: <ModelParts project={home("model")} />,
    app: <AppParts project={home("app")} score={sitePath("/images/pipeline-debussy-p1.svg")} />,
    pipeline: <PipelineParts project={home("pipeline")} score={sitePath("/images/pipeline-debussy-p1.svg")} />,
    // The VQA figure: one step of the contest at a time, each on one real question of it.
    vqa: <VqaParts project={home("vqa")} photos={{ sign: sitePath("/images/vqa-question-sign.jpg"), vote: sitePath("/images/vqa-vote-sign.jpg"), clock: sitePath("/images/vqa-clock-street.jpg") }} gain={metrics.vqa.checks.confirmed[0]} />,
  };
  // What the small pictures in a detail are drawn from: the pipeline's engraving and the contest's photos.
  const assets = { base: sitePath("/").replace(/\/$/, ""), sign: sitePath("/images/vqa-question-sign.jpg") };
  // The pictures at the head of an opened unit of work, by part and unit.
  const unitPictures: Record<string, Record<string, ReactNode>> = { engine: { "engine-unit-future": <FutureReach window={contracts.engine.window} /> } };
  // The pictures under a card's line, by part and card.
  const cardPictures: Record<string, Record<string, ReactNode>> = {
    engine: { "engine-three-clocks": <ThreePositions />, "engine-model-shape": <ModelDistill /> },
    app: { "app-annotation-merge": <StrokeMerge />, "app-payment-grant": <PaymentFlow /> },
  };
  // The home is one viewport. A project's detail and supporting material replace its right pane. A detail is the
  // text in content/details: the product's own, one per part, one for a project without parts, one per mini project.
  const routes: Record<string, string> = { "classicmate#io-contract": "classicmate/engine" };
  const panels: DrawerPanel[] = [
    ...projects.flatMap((project): DrawerPanel[] => {
      const own = parts.filter((part) => part.projectId === project.id);
      const whole = getDetail(project.parts?.length ? project.id : own[0].id);
      return [
        { key: `${project.id}/overview`, group: project.id, kicker: project.parts?.length ? `${project.short} · 전체` : project.short, title: whole.title,
          body: <DetailPanel detail={whole} name={project.short} kind={project.parts?.length ? "classicmate" : "vqa"} assets={assets}
            commits={project.id} /> },
        ...(project.parts ?? []).map((part, i, all): DrawerPanel => {
          const view = own.find((item) => item.part === part.id)!, detail = getDetail(part.id), key = `${project.id}/${part.id}`;
          // A link that names a card or a step of this part opens its pane.
          for (const anchor of [...detail.cards.map((card) => card.id), ...detail.steps.map((step) => `${detail.id}-${step.step}`)]) routes[`${project.id}#${anchor}`] = key;
          return { key, group: project.id, kicker: `${project.short} · 파트 ${i + 1} / ${all.length}`, title: detail.title, body: <DetailPanel detail={detail} name={view.short} kind={part.id as "engine" | "model" | "app" | "pipeline"} assets={assets} unitFigures={unitPictures[part.id]} intros={cardPictures[part.id]} /> };
        }),
      ];
    }),
    ...writing.map((post): DrawerPanel => ({ key: `writing/${post.slug}`, group: "writing", kicker: "트러블슈팅", title: post.title, body: <Markdown>{post.body}</Markdown> })),
    ...miniProjects.map((item): DrawerPanel => {
      const detail = getDetail(`mini-${item.id}`);
      // The mini project's own pictures: the reconstruction the reader can turn is what the project is, so the detail
      // opens under it across the pane; how the idea came stands under the card's line.
      return { key: `mini/${item.id}`, group: "mini", kicker: `미니 프로젝트 · ${miniTag(item)}`, title: detail.title, body: <DetailPanel detail={detail} name="미니 프로젝트" kind="mini" assets={assets} top={<MirrorPoseFigure />} intros={{ [detail.cards[0].id]: <MirrorIdeaSteps /> }} /> };
    }),
    { key: "card", group: "profile", kicker: profile.name, title: "이력", body: <ProfileCard /> },
    { key: "skills", group: "profile", kicker: profile.name, title: "기술 스택", body: <StackSection units={parts} /> },
    { key: "writing", group: "records", kicker: "글과 기록", title: "트러블슈팅", body: <div className="screen-writing">{writing.filter((post) => post.onHome).map((post) => <article key={post.slug}>
      <h3><Link href={`/writing/${post.slug}/`}>{post.title}</Link></h3><p>{post.excerpt}</p><Link className="read" href={`/writing/${post.slug}/`}>글 읽기 →</Link>
    </article>)}</div> },
    { key: "commits", group: "records", kicker: "글과 기록", title: "개발 기록", body: <><CommitActivity /><CommitTimeline /></> },
    { key: "contact", group: "contact", kicker: profile.name, title: "연락", body: <div className="links">{profile.links.map((link) => <a href={link.url} key={link.url}>{link.label} ↗</a>)}</div> },
  ];
  for (const project of projects) for (const part of project.parts ?? []) routes[`${project.id}#${part.id}`] = `${project.id}/${part.id}`;
  // One scene per unit. A part of a product keeps its own head; a project without parts leads with its award.
  // The first part also answers to its product's old address, and every scene to the details that open over it.
  const scenes = parts.map((unit) => {
    const project = projects.find((item) => item.id === unit.projectId)!;
    const first = project.parts?.[0].id === unit.part;
    const head = unit.home
      ? { id: unit.id, group: project.id, also: [`${project.id}/${unit.part}`, ...(first ? [project.id, `${project.id}/overview`] : [])], context: unit.home.problem ?? unit.home.context, contextLabel: unit.home.problem ? "문제" : undefined, title: unit.home.title, sub: unit.home.sub }
      : { id: project.id, also: [`${project.id}/overview`, unit.anchor], rail: award, context: project.contest, title: award, sub: `Private 리더보드 ${leaderboard.private.overall} / ${leaderboard.teams}`, line: unit.overview };
    // A product with a scene of its own keeps its name and its whole detail there; without one they stay with its first part.
    if (unit.home && first && project.home) head.also = [`${project.id}/${unit.part}`];
    return {
      ...head, name: unit.short, label: project.short, period: project.period,
      stats: (unit.home?.stats ?? []).map(metricView), figure: figures[unit.id],
      // The button opens the unit's record; the unit whose result is the release carries the store listings.
      actions: <>
        <a className="stage-go" href={sitePath(unit.part ? `/projects/${project.id}/#${unit.part}` : `/projects/${project.id}/`)}>{unit.part ? `${unit.short} 개발 과정` : "개발 과정"}<span aria-hidden="true">→</span></a>
        {unit.store && <div className="stage-more"><ProjectLinks project={unit.store} named /></div>}
      </>,
    };
  });
  // A product's own scene stands before its parts: what was built and under which constraint in the head, the lead
  // engineer and the team in the line above it, and the parts put together in light, each named with what it does. It
  // is the first thing a reader of the site sees. The problem the product answers stands with the engine's scene.
  const products = projects.filter((project) => project.parts?.length && project.home).map((project) => {
    const own = parts.filter((unit) => unit.projectId === project.id);
    const part = (id: string) => { const unit = own.find((item) => item.part === id)!; return { id: unit.id, no: String(parts.indexOf(unit) + 1).padStart(2, "0"), name: unit.short, line: project.parts!.find((item) => item.id === id)!.description }; };
    return {
      id: project.id, head: true, group: project.id, also: [`${project.id}/overview`], name: project.short, label: project.short, period: project.period,
      title: project.home!.title, accent: project.home!.accent, sub: project.home!.sub, line: project.home!.line,
      role: project.displayRole, team: project.home!.team, stats: (project.home!.stats ?? []).map(metricView),
      figure: <ProductLanding engine={part("engine")} model={part("model")} app={part("app")} pipeline={part("pipeline")} score={sitePath("/images/pipeline-debussy-p1.svg")} />,
      // The product's store listings stand under its button, as they do on the app's scene.
      actions: <>
        <a className="stage-go" href={sitePath(`/projects/${project.id}/`)}>{project.short} 개발 과정<span aria-hidden="true">→</span></a>
        {project.links?.length ? <div className="stage-more"><ProjectLinks project={project} named /></div> : null}
      </>,
    };
  });
  // Each product's scene goes in before the first of its parts.
  const ordered = scenes.flatMap((scene, i) => { const product = scenes[i - 1]?.group === scene.group ? undefined : products.find((item) => item.group === scene.group); return product ? [product, scene] : [scene]; });
  return <ProjectBrowser name={profile.name} role={profile.role} fields={profile.heroLines} links={profile.links}
    mini={{ count: miniProjects.length, grid: <MiniProjectGrid compact /> }} stackCount={stack.languages.length + stack.groups.reduce((sum, group) => sum + group.items.length, 0)}
    details={<DrawerHost inline panels={panels} routes={routes} basePath={sitePath("/").replace(/\/$/, "")} />}
    groups={groups} projects={ordered} home={sitePath("/")} />;
}
