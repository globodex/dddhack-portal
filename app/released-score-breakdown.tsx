import {releasedScoreComponents} from '../lib/released-score-components';
const labels=[['human','Judge score'],['astra','AI score'],['diversity','Collaboration'],['codex','Codex'],['voting','Voting'],['bonus','Feedback bonus'],['penalties','Deductions']] as const;
export default function ReleasedScoreBreakdown({components,total}:{components:unknown;total?:number}){
 const value=releasedScoreComponents(components,total);if(!value)return null;
 const display=(n:number)=>new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(n);
 return <section className="released-score-breakdown" aria-label="Score breakdown"><header><div><h3>Score breakdown</h3><p>Points reflect the configured scoring weights. Bonus and deductions are shown separately.</p></div><strong>{display(value.total)}<span>Total score</span></strong></header><dl>{labels.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==='penalties'&&value[key]>0?'−':''}{display(value[key])}</dd></div>)}</dl></section>;
}
