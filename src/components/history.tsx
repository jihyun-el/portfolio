import Link from "next/link";
import { history } from "@/lib/content";

const level = (count: number) => count === 0 ? 0 : count < 10 ? 1 : count < 30 ? 2 : count < 60 ? 3 : 4;
export function CommitActivity() {
  return <figure className="activity-figure">
    <figcaption><strong>프로젝트별 개발 활동</strong><span>{history.months[0].replace("-", ".")} ~ {history.months.at(-1)!.replace("-", ".")}</span></figcaption>
    <div className="activity-scroll"><table className="activity-table"><caption className="sr-only">작성자 {history.author}의 월별 커밋 수</caption>
      <thead><tr><th scope="col">저장소</th>{history.months.map((month) => <th scope="col" key={month}><span>{month.slice(5)}월</span></th>)}<th scope="col">커밋</th></tr></thead>
      <tbody>{history.repositories.map((repo) => <tr key={repo.id}><th scope="row"><Link href={`/projects/${repo.projectId}/#commits`}>{repo.title}</Link><span>{repo.branch}</span></th>
        {repo.months.map(({month,count}) => <td key={month}><span className={`activity-cell activity-${level(count)}`} title={`${repo.title} · ${month} · ${count}커밋`}><span className="sr-only">{count}커밋</span>{count > 0 && count}</span></td>)}
        <td className="activity-total">{repo.authorCommits}</td></tr>)}</tbody>
    </table></div>
    <p className="figure-note">{history.method} 엔진의 8월 이력은 코드 대조 문서 정리입니다.</p>
  </figure>;
}

export function CommitTimeline({projectId,compact=false}: {projectId?: string; compact?: boolean}) {
  const repositories = history.repositories.filter((repo) => !projectId || repo.projectId === projectId);
  const entries = repositories.flatMap((repo) => (compact ? repo.milestones.slice(-1) : repo.milestones).map((entry) => ({...entry,repository:repo.title,branch:repo.branch})))
    .sort((a,b) => a.date.localeCompare(b.date));
  return <div className="commit-timeline"><ol>{entries.map((entry) => <li key={entry.sha}>
    <div className="commit-meta"><time dateTime={entry.date}>{entry.date.replaceAll("-", ".")}</time><span>{entry.repository}</span><code title={`검증한 커밋 ${entry.sha}`}>{entry.sha.slice(0,7)}</code></div>
    <h3>{entry.title}</h3>{!compact && <p>{entry.description}</p>}
  </li>)}</ol>
  {!compact && <p className="figure-note">실제 커밋을 대조해 제목과 내용을 요약했습니다. 원본 저장소가 비공개이므로 코드 링크 대신 커밋 식별자를 표시합니다.</p>}
  </div>;
}
