/* Google sign-in + Google Sheets storage: find/reuse or create the sheet, then patch changes */
const SH="https://sheets.googleapis.com/v4/spreadsheets",DRV="https://www.googleapis.com/drive/v3/files";
const SCOPE="https://www.googleapis.com/auth/drive.file openid email profile",FILE="DailySpend Data";
let token,sid,user,tc,booted=false,dirty=new Set(),flushing=false,needAuth=false,ft,syncing=null,again=false;
const CID=()=>(typeof CLIENT_ID!=="undefined"&&CLIENT_ID)||localStorage.cid||"";
const fireSync=ok=>document.dispatchEvent(new CustomEvent("syncdone",{detail:ok}));
function fail(e){console.error(e);if(e.status===401)needAuth=true;chip("err");toast(e.friendly||e.message||"Sync failed",false,false,true);fireSync(false)}

/* ----- auth ----- */
function initAuth(){tc=google.accounts.oauth2.initTokenClient({client_id:CID(),scope:SCOPE,callback:onToken,
 error_callback:()=>{if(booted){needAuth=true;chip("err")}else showLogin()}})}
function gisReady(){if(CID()&&localStorage["ds:last"]){initAuth();tc.requestAccessToken({prompt:"none"})}}
function showLogin(){$("#login").hidden=false;$("#app").hidden=true;$("#cidBox").hidden=!!(typeof CLIENT_ID!=="undefined"&&CLIENT_ID)}
function reconnect(){if(typeof google==="undefined")return toast("You're offline. Your changes are saved on this device.",false,false);if(!tc)initAuth();tc.requestAccessToken({prompt:""})}
function onToken(r){if(r.error){if(booted){needAuth=true;chip("err")}else showLogin();return}
 token=r.access_token;needAuth=false;setTimeout(()=>tc.requestAccessToken({prompt:"none"}),Math.max(60,(+r.expires_in||3600)-120)*1000);
 booted?sync():boot()}
$("#signin").onclick=()=>{const v=$("#cid").value.trim();if(v)localStorage.cid=v;if(!CID())return toast("Enter your Client ID",false,false);reconnect()};
$("#out").onclick=()=>{if(token&&window.google)google.accounts.oauth2.revoke(token,()=>{});["ds:last","ds:user"].forEach(k=>localStorage.removeItem(k));location.reload()};

/* every Google call: timeout + readable error messages (never hangs silently) */
async function api(url,o={}){const ac=new AbortController(),tm=setTimeout(()=>ac.abort(),25000);let r;
 try{r=await fetch(url,{...o,signal:ac.signal,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"}})}
 catch(x){const e=new Error("network");e.friendly=navigator.onLine?"Network is slow or blocked. Tap the sync badge to retry.":"You're offline. Changes are saved on this device and will sync later.";throw e}
 finally{clearTimeout(tm)}
 if(r.ok)return r.json();
 let j={};try{j=await r.json()}catch(_){}
 const em=(j.error&&j.error.message)||"",st=(j.error&&j.error.status)||"",svc=url.includes("sheets.googleapis")?"Google Sheets":"Google Drive",e=new Error(em||"HTTP "+r.status);e.status=r.status;
 e.friendly=r.status===401?"Session expired. Tap the sync badge to sign in again."
  :r.status===403&&/not been used|disabled|SERVICE_DISABLED/i.test(em+st)?`Turn on the ${svc} API in your Google Cloud project, then tap the sync badge.`
  :r.status===403?"Google denied access. Sign out, sign in again and allow Drive access."
  :`${svc} error ${r.status}${em?": "+em.slice(0,90):""}`;
 throw e}

/* ----- session ----- */
function loadCache(){const c=JSON.parse(localStorage["ds:"+user.email]||"null");if(c){D=Object.assign(D,c.D);sid=c.sid;(c.dirty||[]).forEach(t=>dirty.add(t))}}
const cacheSave=()=>{try{localStorage["ds:"+user.email]=JSON.stringify({D,sid,dirty:[...dirty]})}catch(e){}};
function showApp(){booted=true;$("#login").hidden=true;$("#app").hidden=false;$("#av").src=user.picture||"";$("#un").textContent=user.name||"";$("#ue").textContent=user.email;go(location.hash.slice(1)||"home")}
async function boot(){
 try{user=await api("https://www.googleapis.com/oauth2/v3/userinfo");localStorage["ds:last"]=user.email;localStorage["ds:user"]=JSON.stringify(user);loadCache()}
 catch(e){fail(e);showLogin();return}
 try{showApp()}catch(e){console.error(e)}   // a drawing error must never stop the sync
 sync()}
function offlineBoot(){try{user=JSON.parse(localStorage["ds:user"]||"null")}catch(e){user=null}
 if(!user||!localStorage["ds:"+user.email]){user=null;return false}loadCache();showApp();needAuth=true;chip("err");return true}

/* ----- the Google Sheet: reuse if it exists, create if not, add any missing tabs ----- */
async function ensureSheet(depth=0){
 if(!sid){const q=encodeURIComponent(`name='${FILE}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
  const f=await api(`${DRV}?fields=files(id)&orderBy=createdTime&q=${q}`);if(f.files&&f.files.length)sid=f.files[0].id}
 if(!sid){
  const s=await api(SH,{method:"POST",body:JSON.stringify({properties:{title:FILE},sheets:Object.keys(TABS).map(title=>({properties:{title,gridProperties:{frozenRowCount:1}}}))})});
  sid=s.spreadsheetId;Object.keys(TABS).forEach(t=>dirty.add(t));cacheSave();return}   // saved at once so it is never created twice
 try{const m=await api(`${SH}/${sid}?fields=sheets.properties.title`),have=m.sheets.map(s=>s.properties.title),miss=Object.keys(TABS).filter(t=>!have.includes(t));
  if(miss.length){await api(`${SH}/${sid}:batchUpdate`,{method:"POST",body:JSON.stringify({requests:miss.map(title=>({addSheet:{properties:{title,gridProperties:{frozenRowCount:1}}}}))})});miss.forEach(t=>dirty.add(t))}}
 catch(e){if(e.status===404&&depth<1){sid=null;return ensureSheet(1)}throw e}}   // sheet was deleted: look again once, else create
async function pull(){const ks=Object.keys(TABS),r=await api(`${SH}/${sid}/values:batchGet?`+ks.map(t=>"ranges="+t).join("&"));
 (r.valueRanges||[]).forEach((v,i)=>{const t=ks[i],h=TABS[t],vals=v.values||[],hadLocalEdits=dirty.has(t);
  if(!hadLocalEdits)                                               // unsynced local edits win; otherwise load the sheet's data
   D[t]=vals.slice(1).filter(x=>x[0]).map(x=>{const o={};h.forEach((k,j)=>o[k]=x[j]??"");NUMS.forEach(k=>{if(k in o)o[k]=+o[k]||0});return o});
  if(vals.length&&vals[0].join("|")!==h.join("|"))dirty.add(t)})}   // older sheet: rewrite header with the new columns (data already loaded)
function seed(){if(!D.Categories.length){D.Categories=[...DEF.map(([name,color])=>({id:uid(),name,color})),{id:"loanpay",name:"Loan Payback",color:"#ef4444"}];dirty.add("Categories")}
 if(!S("currency")){setS("currency","$");dirty.add("Settings")}}

/* ----- patch changed tabs in two calls ----- */
async function flush(){
 if(flushing)return;
 if(!dirty.size){chip("ok");fireSync(true);return}
 if(!token){needAuth=true;chip("err");fireSync(false);return}
 if(!sid)return sync();                       // no sheet yet -> go and find/create it
 flushing=true;let ok=true;
 try{const tabs=[...dirty],snap={},data=tabs.map(t=>{snap[t]=JSON.stringify(D[t]);return{range:t+"!A1",values:[TABS[t],...D[t].map(o=>TABS[t].map(k=>o[k]??""))]}});
  await api(`${SH}/${sid}/values:batchClear`,{method:"POST",body:JSON.stringify({ranges:tabs})});
  await api(`${SH}/${sid}/values:batchUpdate`,{method:"POST",body:JSON.stringify({valueInputOption:"RAW",data})});
  tabs.forEach(t=>{if(JSON.stringify(D[t])===snap[t])dirty.delete(t)})}
 catch(e){ok=false;fail(e)}
 flushing=false;cacheSave();
 if(ok){if(dirty.size)flush();else{chip("ok");fireSync(true)}}}
function sync(){if(syncing){again=true;return syncing}          // one sync at a time (prevents duplicate sheets)
 syncing=(async()=>{
  if(!token){needAuth=true;chip("err");fireSync(false);return}
  chip("busy");
  try{await ensureSheet();await pull();seed();autoBills();cacheSave();
   if(S("theme")&&S("theme")!==curTheme())applyTheme(S("theme"),0,0,false);
   try{render()}catch(e){console.error(e)}
   await flush()}
  catch(e){fail(e)}})().finally(()=>{syncing=null;if(again){again=false;sync()}});
 return syncing}
function commit(tab,msg,keep){dirty.add(tab);cacheSave();if(!keep)render();if(msg)toast(msg);chip("busy");clearTimeout(ft);ft=setTimeout(flush,400)}
$("#sync").onclick=()=>needAuth?reconnect():sync();
$("#resync").onclick=()=>needAuth?reconnect():sync();
addEventListener("online",()=>{if(token)sync();else if(tc)tc.requestAccessToken({prompt:"none"})});
addEventListener("offline",()=>chip("err"));
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&token&&booted&&!dirty.size&&!syncing)sync()});
