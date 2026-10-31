const keys=['human','astra','diversity','codex','voting','bonus','penalties','total'] as const;
export type ReleasedScoreComponents=Record<(typeof keys)[number],number>;
/** Only canonical aggregated points; never individual judge marks or demographic data. */
export function releasedScoreComponents(input:unknown,total?:number):ReleasedScoreComponents|null{
 if(!input||typeof input!=='object'||Array.isArray(input))return null;
 const source=input as Record<string,unknown>;
 if(keys.some(key=>typeof source[key]!=='number'||!Number.isFinite(source[key])||(source[key] as number)<0))return null;
 if(total!==undefined&&(!Number.isFinite(total)||Math.abs((source.total as number)-total)>0.000001))return null;
 return Object.fromEntries(keys.map(key=>[key,source[key]])) as ReleasedScoreComponents;
}
