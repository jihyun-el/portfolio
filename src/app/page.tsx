import Link from "next/link";
import { cases, getWriting, profile, projects, stack } from "@/lib/content";
import { buildNetwork, caseViews, metricView } from "@/lib/showcase";
import { CommitActivity, CommitTimeline } from "@/components/history";
import { NeuralMap, type MapStep } from "@/components/neural-map";
import { CaseSlides } from "@/components/case-slides";
import { SignalChainSection } from "@/components/signal-chain-section";
import { countWord } from "@/components/showcase-parts";

export default function HomePage() {
  const writing = getWriting();
  const network = buildNetwork();
  const counts = network.layers.map((ids) => ids.length);
  const edgeCount = new Set(network.chains.flatMap((chain) => chain.slice(1).map((id, i) => `${chain[i]}>${id}`))).size;
  const steps: MapStep[] = [
    { code: "L0", title: "입력층 · 기술", text: `직접 쓰거나 검수한 기술 ${counts[0]}개입니다. Rust 이식은 AI 에이전트가 구현하고 참조 결과와 대조해 검수했습니다.` },
    { code: "L1", title: "은닉층 · 역량", text: `기술을 쓰임새로 묶은 ${countWord(counts[1])} 갈래입니다. ${stack.map((group) => group.title).join(", ")}.` },
    { code: "L2", title: "은닉층 · 작업", text: `역량이 실제 작업이 된 ${countWord(counts[2])} 부분입니다. 각 작업은 커밋과 검증 기록으로 이어집니다.` },
    { code: "L3", title: "출력층 · 프로젝트", text: `모든 경로는 ${countWord(counts[3])} 프로젝트로 모입니다. ${projects.map((project) => project.short).join(" · ")}.` },
    { code: "→", title: "탐색", text: "노드를 누르면 연결된 경로가 켜지고 상세가 열립니다." },
  ];
  return <>
    <section className="wrap hero" id="about">
      <div>
        <p className="eyebrow reveal">Portfolio · 2026</p>
        <h1>{profile.heroLines.map((line, i) => <span key={line} className={`l reveal ${i === 0 ? "thin" : "black"}`} style={{ animationDelay: `${0.05 + i * 0.13}s` }}>{line}</span>)}</h1>
        {profile.introduction.map((paragraph, i) => <p key={paragraph} className={`lede reveal${i ? " lede-2" : ""}`} style={{ animationDelay: `${0.3 + i * 0.08}s` }}>{paragraph}</p>)}
        <div className="hero-actions reveal" style={{ animationDelay: ".45s" }}><a className="cta" href="#projects">대표 작업 {cases.length}개 보기 ↓</a><a className="cta ghost" href="#skills">기술 맵 ↓</a></div>
      </div>
      <aside className="card reveal" style={{ animationDelay: ".4s" }} aria-label="개발자 카드">
        <div className="card-h"><span>DEVELOPER CARD</span><span className="num">2026</span></div>
        <dl>
          {profile.card.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}
          {profile.experiences.map((experience) => <div key={experience.title}><dt>경험</dt><dd>{experience.title}<small className="num">{experience.period}</small></dd></div>)}
        </dl>
      </aside>
    </section>
    <section className="wrap stats" aria-label="요약 수치">
      {profile.stats.map((key, i) => {
        const stat = metricView(key), target = cases.find((item) => item.metrics.includes(key));
        return <a className="stat reveal" key={key} href={target ? `#case-${target.id}` : "#projects"} style={{ animationDelay: `${i * 0.08}s` }}>
          <b className="num">{stat.value}{stat.unit && <small>{stat.unit}</small>}</b><span>{stat.label}</span><i aria-hidden="true">케이스 보기 ↓</i>
        </a>;
      })}
    </section>
    <CaseSlides cases={caseViews()} />
    <SignalChainSection />
    <NeuralMap network={network} steps={steps} edgeCount={edgeCount} />
    <section className="sec" id="commits"><div className="wrap">
      <div className="sec-h"><div><p className="eyebrow">Commits</p><h2><span className="thin">설계가 코드로</span> <span className="black">바뀐 기록</span></h2></div></div>
      <CommitActivity />
      <CommitTimeline compact />
    </div></section>
    <section className="sec pr" id="writing"><div className="wrap">
      <div className="sec-h"><div><p className="eyebrow">Writing</p><h2><span className="thin">판단을 남긴</span> <span className="black">{countWord(writing.length)} 개의 기록</span></h2></div></div>
      <div className="pr-grid">{writing.map((post, i) => <article className="reveal" key={post.slug} style={{ animationDelay: `${i * 0.1}s` }}>
        <h3><Link href={`/writing/${post.slug}/`}>{post.title}</Link></h3><p>{post.excerpt}</p>
        <Link className="read" href={`/writing/${post.slug}/`}>기록 읽기 ↗</Link>
      </article>)}</div>
    </div></section>
  </>;
}
