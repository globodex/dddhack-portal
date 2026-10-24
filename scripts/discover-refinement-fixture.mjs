// Extra disposable identities for screenshot/pagination QA. Never production input.
import { DatabaseSync } from 'node:sqlite';
if(process.env.PORTAL_LOCAL_TEST!=='1')throw new Error('EXPLICIT_SYNTHETIC_MODE_REQUIRED');
const db=new DatabaseSync('/tmp/ddd-discover-refinement.sqlite');
const now='2026-10-24T00:00:00Z',colors=['blue','green','purple','orange','charcoal','yellow','coral','grey'],expressions=['squeezed','plus','round','sleepy','cheerful','star','mixed-plus','mixed-slash'];
db.exec('BEGIN');
try{
  db.prepare('UPDATE teams SET name=?,bio=? WHERE id=?').run('North Star Builders','A synthetic team exploring small tools for everyday work.','fake_team1');
  db.prepare('UPDATE teams SET name=?,bio=? WHERE id=?').run('A Deliberately Long Team Name for Small Delhi Builds','','fake_team3');
  db.prepare('UPDATE teams SET name=?,bio=? WHERE id=?').run('The Fifth Element','','fake_team5');
  for(const [id,color]of[['fake_team1','cobalt'],['fake_team3','violet'],['fake_team5','ember']])db.prepare("INSERT INTO team_styles(team_id,avatar,palette,color_key) VALUES(?,'initials',?,?) ON CONFLICT(team_id) DO UPDATE SET palette=excluded.palette,color_key=excluded.color_key").run(id,color,color);
  for(let i=0;i<40;i++){
    const id=`fake_refine_${String(i).padStart(2,'0')}`,email=`refine-${i}@portal.test`,name=i===0?'A Synthetic Builder With A Deliberately Long Saved Name':`Builder ${String(i).padStart(2,'0')}`;
    db.prepare('INSERT INTO users(id,email,name,role,created_at) VALUES(?,?,?,?,?)').run(id,email,name,'participant',now);
    db.prepare('INSERT INTO profiles(user_id,bio,socials,public) VALUES(?,?,?,?)').run(id,i%3===0?'Synthetic public bio about accessible tools and thoughtful products.':'Private synthetic bio must never appear.',i%3===0?JSON.stringify(['https://github.com/synthetic-example']):'[]',i%3===0?1:0);
    db.prepare('INSERT INTO participant_profiles(user_id,display_name,skills,completed_at,gender_confirmed) VALUES(?,?,?,?,1)').run(id,name,'Synthetic QA',now);
    db.prepare('INSERT INTO profile_details(user_id,phone,avatar_color,avatar_expression) VALUES(?,?,?,?)').run(id,'+12025550101',colors[i%8],expressions[i%8]);
    db.prepare('INSERT INTO luma_roster VALUES(?,?,?)').run(email,'fake_owner',now);
  }
  db.exec('COMMIT');console.log('Owned synthetic Discover fixture:40 extra public-directory identities, long names, public/empty bios; private values retained only in database.');
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
