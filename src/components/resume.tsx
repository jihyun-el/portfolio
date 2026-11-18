import type { CSSProperties, ReactNode } from "react";
import { metrics, profile, sitePath, stack, type ResumeBar } from "@/lib/content";
import { Logo } from "@/components/stack-section";
import { Line } from "@/components/unit-card";

// The 이력 panel: a short line of where things stand, a timeline you take in at a glance, then the ledger under them —
// experience, awards and education as rows of the same shape, and the certificates as a table of name, grade and issuer.

// A date as months since year 0. A day-precise date counts its day; an end date runs to the end of its month or day.
function months(date: string, end = false) {
  const [year, month, day] = date.split("-").map(Number);
  const base = year * 12 + month - 1;
  if (day === undefined) return end ? base + 1 : base;
  return base + (end ? day : day - 1) / new Date(Date.UTC(year, month, 0)).getUTCDate();
}
const shown = (date: string) => date.replaceAll("-", ".");
const round = (value: number) => Math.round(value * 100) / 100;

function Period({ from, to }: { from: string; to: string }) {
  return <span className="cv-when num"><time dateTime={from}>{shown(from)}</time> ~ <time dateTime={to}>{shown(to)}</time></span>;
}

// A logo in the line on top, in the text colour as the stack's logos are, so it follows the theme: the image is only a
// mask. `ratio` is its width over its height. SSAFY's is its own tile with the letters cut out; ClassicMate's is the
// monogram from the app's assets.
const MARKS: Record<string, { src: string; ratio: number }> = {
  ssafy: { src: "/images/mark-ssafy.png", ratio: 110 / 78 },
  classicmate: { src: "/images/mark-classicmate.svg", ratio: 524 / 726 },
};
function Mark({ name }: { name?: string }) {
  const mark = name ? MARKS[name] : undefined;
  if (!mark) return null;
  return <span className="cv-mark" data-mark={name} aria-hidden="true" style={{ "--mark": `url(${sitePath(mark.src)})`, "--ratio": mark.ratio } as CSSProperties} />;
}

type Placed = ResumeBar & { from: string; to: string };

// Experience above the axis, education below it. Each bar spans its months; a week-long event is a single mark.
function Timeline({ work, study }: { work: Placed[]; study: Placed[] }) {
  const all = [...work, ...study];
  const start = Math.floor(Math.min(...all.map((bar) => months(bar.from))));
  const end = Math.ceil(Math.max(...all.map((bar) => months(bar.to, true))));
  const at = (value: number) => round(((value - start) / (end - start)) * 100);
  const years: { year: number; at: number }[] = [];
  for (let year = Math.ceil(start / 12); year * 12 < end; year++) if (year * 12 > start) years.push({ year, at: at(year * 12) });
  const lane = (bars: Placed[]) => <ol className="cv-track">{bars.map((bar) => {
    const s = bar.tone === "tick" ? at((months(bar.from) + months(bar.to, true)) / 2) : at(months(bar.from));
    const e = bar.tone === "tick" ? s : at(months(bar.to, true));
    return <li className="cv-bar" data-tone={bar.tone} key={bar.label} style={{ "--s": s, "--e": e } as CSSProperties}><span className="cv-bar-label">{bar.label}</span></li>;
  })}</ol>;
  const first = shown(all.reduce((date, bar) => (bar.from < date ? bar.from : date), all[0].from)).slice(0, 7);
  const last = shown(all.reduce((date, bar) => (bar.to > date ? bar.to : date), all[0].to)).slice(0, 7);
  return <figure className="cv-line" role="img" aria-label={`${first}부터 ${last}까지의 경험과 교육 연표`}>
    <span className="cv-lane-name" data-lane="work">경험</span>
    <span className="cv-lane-name" data-lane="study">교육</span>
    <div className="cv-plot">
      <div className="cv-guides">{years.map((year) => <i key={year.year} style={{ "--s": year.at } as CSSProperties} />)}</div>
      <div className="cv-lane" data-lane="work">{lane(work)}</div>
      <div className="cv-axis">{years.map((year) => <span className="num" key={year.year} style={{ "--s": year.at } as CSSProperties}>{year.year}</span>)}</div>
      <div className="cv-lane" data-lane="study">{lane(study)}</div>
    </div>
  </figure>;
}

export function Resume() {
  const { experiences, awards, education, certs } = profile.resume;
  // The contest's ranks are read from metrics.json, as every number on the home is.
  const board = metrics.vqa.leaderboard;
  const ranks = `Private 리더보드 ${board.teams}팀 중 ${board.private.overall}위 · 서울 캠퍼스 ${board.private.seoul}위`;
  const placed = <T extends { from: string; to: string; bar?: ResumeBar }>(rows: T[]) => rows.flatMap((row) => (row.bar ? [{ ...row.bar, from: row.from, to: row.to }] : []));
  // Where things stand, read from the rows below: the course still running (by its short name on the timeline), the
  // black bar before it, and the languages of the stack. Each group is a large mark on the left and two lines on the
  // right: the label, then the value with its dates stepping back. The mark sits in the term, as a list term holds only
  // terms and details.
  const now = education.find((item) => item.bar?.tone === "plan"), lead = experiences.find((item) => item.bar?.tone === "ink");
  const term = (label: string, marks: ReactNode) => <dt><span className="cv-meta-marks" aria-hidden="true">{marks}</span><span className="cv-meta-label">{label}</span></dt>;
  return <article className="cv" aria-label="이력">
    <dl className="cv-meta">
      {now && <div>{term("현재", <Mark name={now.mark} />)}<dd>{now.bar?.label ?? now.title}<span className="cv-meta-when"><span className="num">{shown(now.to)}</span> {now.detail}</span></dd></div>}
      {lead && <div>{term("이전", <Mark name={lead.mark} />)}<dd>{lead.title}<span className="cv-meta-when num">{shown(lead.from)} ~ {shown(lead.to)}</span></dd></div>}
      <div>{term("주력 언어", stack.languages.map((language) => <Logo key={language.name} icon={language.icon} />))}<dd>{stack.languages.map((language) => language.name).join(" · ")}</dd></div>
    </dl>
    <Timeline work={placed(experiences)} study={placed(education)} />
    <div className="cv-cols">
      <section className="cv-sec" aria-labelledby="cv-work">
        <h3 id="cv-work">경험</h3>
        <ol className="cv-list">{experiences.map((item) => <li className="cv-item" key={item.title}>
          <div className="cv-item-h"><span className="cv-item-t">{item.title.slice(0, item.title.length - item.role.length)}<b>{item.role}</b></span><Period from={item.from} to={item.to} /></div>
          <p className="cv-item-d">{item.description}{item.link && <a className="cv-go" href={item.link.href}>{item.link.label}<span aria-hidden="true"> →</span></a>}</p>
        </li>)}</ol>
      </section>
      <section className="cv-sec" aria-labelledby="cv-awards">
        <h3 id="cv-awards">수상</h3>
        <ol className="cv-list">{awards.map((item) => <li className="cv-item" key={item.event}>
          <div className="cv-item-h"><span className="cv-item-t">{item.event} <b>{item.prize}</b></span><time className="cv-when num" dateTime={item.date}>{shown(item.date)}</time></div>
          <p className="cv-item-d">{item.leaderboard ? ranks : item.detail}</p>
        </li>)}</ol>
      </section>
      <section className="cv-sec" aria-labelledby="cv-study">
        <h3 id="cv-study">교육</h3>
        <ol className="cv-list">{education.map((item) => <li className="cv-item" key={item.title}>
          <div className="cv-item-h"><span className="cv-item-t">{item.title}</span><Period from={item.from} to={item.to} /></div>
          {item.detail && <p className="cv-item-d">{item.detail}</p>}
        </li>)}</ol>
      </section>
      <section className="cv-sec" aria-labelledby="cv-certs">
        <h3 id="cv-certs">자격</h3>
        <table className="cv-certs">
          <thead><tr><th scope="col">이름</th><th scope="col">급수</th><th scope="col">주관</th><th scope="col"><span className="sr-only">취득</span></th></tr></thead>
          {certs.map((item) => <tbody key={item.name}>
            <tr>
              <th scope="row">{item.name}</th>
              <td className="cv-cert-g">{item.grade ?? <span aria-label="없음">—</span>}</td>
              <td className="cv-cert-i">{item.issuer}</td>
              <td><time className="cv-when num" dateTime={item.date}>{shown(item.date)}</time></td>
            </tr>
            {item.detail?.map((line) => <tr className="cv-cert-d" key={line}><td colSpan={4}><Line>{line}</Line></td></tr>)}
          </tbody>)}
        </table>
      </section>
    </div>
  </article>;
}
