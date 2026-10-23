// User-approved board: grey replaces proposed cyan. Yellow/coral are approved
// additions, not claimed as source-reference colors.
export const dotColors={blue:"#006afe",green:"#00ab43",purple:"#924ff7",orange:"#f16d00",charcoal:"#262626",yellow:"#f2c744",coral:"#ef5a6f",grey:"#e0e0e0"} as const;
export const dotExpressions={squeezed:"><",sleepy:"--",plus:"++",star:"**",round:"OO",cheerful:"^^","mixed-plus":"^+","mixed-slash":"^/"} as const;
export const teamColorKeys=["cobalt","forest","violet","ember","graphite","yellow","coral","grey"] as const;
export const teamDotColors:Record<string,string>={cobalt:dotColors.blue,forest:dotColors.green,violet:dotColors.purple,ember:dotColors.orange,graphite:dotColors.charcoal,yellow:dotColors.yellow,coral:dotColors.coral,grey:dotColors.grey};
export const teamColorLabels:Record<string,string>={cobalt:"Blue",forest:"Green",violet:"Purple",ember:"Orange",graphite:"Charcoal",yellow:"Yellow",coral:"Coral",grey:"Grey"};
export function legacyTeamPalette(key:string){return ["cobalt","forest","violet","ember","graphite"].includes(key)?key:"graphite";}
