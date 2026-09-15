/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ADMIN_EMAIL?: string;
  GROUPS_API_KEY?: string;
  GROUPS_READ_API_KEY?: string;
  BNI_TOKEN_ENCRYPTION_KEY?: string;
  BNI_USERNAME?: string;
  BNI_PASSWORD?: string;
  BNI_RUNNER_URL?: string;
  BNI_RUNNER_TOKEN?: string;
  ZOOM_ACCOUNT_ID?: string;
  ZOOM_CLIENT_ID?: string;
  ZOOM_CLIENT_SECRET?: string;
  OPENAI_API_KEY?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

let localZoomCredentials: { accountId:string; clientId:string; clientSecret:string } | null = null;
let localOpenAIKey: string | null = null;

const bniNormalize=(value:unknown)=>String(value||"").toLowerCase().replace(/[\s_\-–—／/()（）:：.]/g,"");
const bniNumber=(value:unknown)=>{const parsed=Number(String(value||"").replace(/[^\d.-]/g,""));return Number.isFinite(parsed)?parsed:0};
const xmlDecode=(value:string)=>value.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
function bniSpreadsheetRows(text:string){
  const rows:string[][]=[];
  for(const rowMatch of text.matchAll(/<(?:\w+:)?Row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Row>/gi)){
    const row:string[]=[],body=rowMatch[1];let cursor=0;
    for(const cell of body.matchAll(/<(?:\w+:)?Cell\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Cell>/gi)){
      const index=cell[1].match(/(?:ss:)?Index=["'](\d+)["']/i);if(index)cursor=Number(index[1])-1;
      const data=cell[2].match(/<(?:\w+:)?Data\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Data>/i);row[cursor]=xmlDecode((data?.[1]||"").replace(/<[^>]+>/g,"")).trim();cursor++;
    }
    if(row.length)rows.push(row);
  }
  if(!rows.length)throw new Error("BNI 回傳的報表格式無法辨識");return rows;
}
const bniColumn=(headers:string[],names:string[])=>headers.findIndex(header=>names.some(name=>bniNormalize(header).includes(bniNormalize(name))));
const bniAliases={member:["會員姓名","會員","membername","member"],surname:["姓氏","lastname","surname"],givenName:["名字","firstname","givenname"],education:["教育分數","教育點數","培訓分數","educationpoints","educationunits","ceu","分會教育單位"],inside:["內部引薦","內引薦","referralsgiveninside","referralsinside","rgbi"],outside:["外部引薦","外引薦","referralsgivenoutside","referralsoutside","rgbo"],referralAmount:["提供的引薦金額","引薦金額","商機金額","referralamount","referralsgivenamount","businessgiven","交易價值"],visitors:["來賓","訪客","visitors","visitor"],oneToOne:["一對一","121","1to1","onetoone","onetoones"]};
function bniParseDate(value:unknown){const text=String(value||"").trim();let match=text.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);if(match)return `${match[1]}-${match[2].padStart(2,"0")}-${match[3].padStart(2,"0")}`;match=text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);return match?`${match[3]}-${match[2].padStart(2,"0")}-${match[1].padStart(2,"0")}`:""}
function bniParseRoster(text:string){const rows=bniSpreadsheetRows(text),expiryAliases=["到期日","續約日","會籍到期","會員到期","expirationdate","expirydate","renewaldate"];let at=-1,idx:any;for(let i=0;i<rows.length;i++){const candidate={member:bniColumn(rows[i],bniAliases.member),surname:bniColumn(rows[i],bniAliases.surname),givenName:bniColumn(rows[i],bniAliases.givenName),expiry:bniColumn(rows[i],expiryAliases)};if(candidate.member>=0||(candidate.surname>=0&&candidate.givenName>=0)){at=i;idx=candidate;break}}if(at<0)throw new Error("無法辨識會員名冊欄位");const blocked=new Set(["會員姓名","分會網站管理員","發展協調人","會員委員會","會員委員會社區建設者","會員委員會品質保證","會員委員會會員參與","會員委員會會員關係"]);return rows.slice(at+1).map(row=>{const member=String(idx.member>=0?row[idx.member]||"":`${row[idx.surname]||""}${row[idx.givenName]||""}`).replace(/\s+/g," ").trim();return{member,expiryDate:idx.expiry>=0?bniParseDate(row[idx.expiry]):""}}).filter(item=>item.member&&!/合計|總計|total/i.test(item.member)&&!/^\d+會員$/.test(bniNormalize(item.member))&&!blocked.has(bniNormalize(item.member)))}
function bniParseAttendance(text:string,endDate:Date){const rows=bniSpreadsheetRows(text);let headers:string[]=[],at=-1,dateStart=-1;for(let i=0;i<rows.length;i++){const first=rows[i].findIndex(v=>/^\d{1,2}\s*月\s*\d{1,2}$/.test(v)||/^\d{1,2}[\/-]\d{1,2}$/.test(v));if(first>=0){headers=rows[i];at=i;dateStart=first;break}}if(at<0)throw new Error("無法辨識 PALMS 報表日期欄");const records:Array<{member:string;date:string;code:string}>=[];for(const row of rows.slice(at+1)){const member=row.slice(0,dateStart).join("").replace(/\s+/g,"").trim();if(!member)continue;for(let col=dateStart;col<headers.length;col++){const code=(row[col]||"").trim().toUpperCase();if(!["P","A","L","M","S"].includes(code))continue;const parts=headers[col].match(/^(\d{1,2})\s*月\s*(\d{1,2})$/)||headers[col].match(/^(\d{1,2})[\/-](\d{1,2})$/);if(!parts)continue;const month=Number(parts[1]),day=Number(parts[2]),year=month>endDate.getMonth()+1?endDate.getFullYear()-1:endDate.getFullYear();records.push({member,date:`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`,code})}}return records}
function bniFindId(source:unknown,key:string){const wanted=bniNormalize(key),seen=new Set<unknown>();const visit=(value:any):string=>{if(!value||typeof value!=="object"||seen.has(value))return"";seen.add(value);for(const [name,item] of Object.entries(value)){if(bniNormalize(name).includes(wanted)&&/\d{2,}/.test(String(item||"")))return String(item).match(/\d{2,}/)?.[0]||"";const nested=visit(item);if(nested)return nested}return""};return visit(source)}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const apiJson = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

    if(url.pathname.startsWith("/api/v1/groups")||url.pathname.startsWith("/api/v1/members/")){
      const corsHeaders={"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization, content-type, if-match","access-control-allow-methods":"GET, PUT, OPTIONS"};
      const v1Json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:corsHeaders});
      if(request.method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders});
      const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim(),email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase(),admin=(env.ADMIN_EMAIL||"").trim().toLowerCase();
      const isOwner=Boolean(email&&admin&&email===admin),hasFullKey=Boolean(env.GROUPS_API_KEY&&bearer===env.GROUPS_API_KEY),hasReadKey=Boolean(env.GROUPS_READ_API_KEY&&bearer===env.GROUPS_READ_API_KEY),authorized=isOwner||hasFullKey||hasReadKey;
      if(!env.GROUPS_API_KEY&&!env.GROUPS_READ_API_KEY&&!email)return v1Json({error:"分組 API 尚未啟用"},503);
      if(!authorized)return v1Json({error:"API Key 無效或未提供"},401);
      if(!env.DB)return v1Json({error:"分組資料庫尚未啟用"},503);
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS member_group_state (id INTEGER PRIMARY KEY CHECK (id=1), groups TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();
      const current=await env.DB.prepare(`SELECT groups,updated_at AS updatedAt FROM member_group_state WHERE id=1`).first<{groups:string;updatedAt:string}>(),groups=JSON.parse(current?.groups||"[]") as Array<{id:number;members:Array<{name:string;role:string}>}>;
      const groupIdMatch=url.pathname.match(/^\/api\/v1\/groups\/(\d+)$/),memberMatch=url.pathname.match(/^\/api\/v1\/members\/([^/]+)\/group$/);
      if(request.method==="GET"&&url.pathname==="/api/v1/groups")return v1Json({data:groups,meta:{count:groups.length,updatedAt:current?.updatedAt||null}});
      if(request.method==="GET"&&groupIdMatch){const group=groups.find(item=>item.id===Number(groupIdMatch[1]));return group?v1Json({data:group,meta:{updatedAt:current?.updatedAt||null}}):v1Json({error:"找不到組別"},404)}
      if(request.method==="GET"&&memberMatch){const name=decodeURIComponent(memberMatch[1]).replace(/\s+/g,"");const group=groups.find(item=>item.members.some(member=>member.name.replace(/\s+/g,"")===name));if(!group)return v1Json({error:"找不到會員分組"},404);const member=group.members.find(item=>item.name.replace(/\s+/g,"")===name);return v1Json({data:{member:member?.name,role:member?.role,groupId:group.id,committee:group.members.find(item=>item.role==="委員")?.name||"",leader:group.members.find(item=>item.role==="小組長")?.name||""},meta:{updatedAt:current?.updatedAt||null}})}
      if(request.method==="PUT"&&url.pathname==="/api/v1/groups"){
        if(!isOwner&&!hasFullKey)return v1Json({error:"此 API Key 僅有讀取權限"},403);
        const body=await request.json() as Record<string,unknown>,next=Array.isArray(body.groups)?body.groups as Array<{id:number;members:Array<{name:string;role:string}>}>:[],baseUpdatedAt=String(request.headers.get("if-match")||body.baseUpdatedAt||"").replace(/^W\//,"").replaceAll('"',"");
        if(baseUpdatedAt&&current?.updatedAt&&baseUpdatedAt!==current.updatedAt)return v1Json({error:"分組資料已被更新",data:groups,meta:{updatedAt:current.updatedAt}},409);
        const roles=new Set(["十長","委員","導師","小組長","組員"]),ids=next.map(group=>Number(group.id)),members=next.flatMap(group=>Array.isArray(group.members)?group.members:[]),names=members.map(member=>String(member.name||"").trim()).filter(Boolean);
        if(next.length!==12||new Set(ids).size!==12||ids.some(id=>id<1||id>12))return v1Json({error:"分組必須包含編號 1 至 12，且不得重複"},400);
        if(members.some(member=>!String(member.name||"").trim()||!roles.has(String(member.role))))return v1Json({error:"會員姓名或角色格式不正確"},400);
        if(new Set(names.map(name=>name.replace(/\s+/g,""))).size!==names.length)return v1Json({error:"同一會員不可出現在兩個位置"},400);
        if(next.some(group=>["十長","委員","導師","小組長"].some(role=>group.members.filter(member=>member.role===role).length>1)))return v1Json({error:"每組的十長、委員、導師與小組長各限一位"},400);
        const updatedAt=new Date().toISOString();await env.DB.prepare(`INSERT INTO member_group_state (id,groups,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET groups=excluded.groups,updated_at=excluded.updated_at`).bind(JSON.stringify(next),updatedAt).run();return v1Json({data:next,meta:{updatedAt}});
      }
      return v1Json({error:"不支援的 API 操作"},405);
    }

    if (url.pathname === "/api/admin-status" && request.method === "GET") {
      const email = (request.headers.get("oai-authenticated-user-email") || "").trim().toLowerCase();
      const adminEmail = (env.ADMIN_EMAIL || "").trim().toLowerCase();
      return apiJson({ authenticated: Boolean(email), isOwner: Boolean(email && adminEmail && email === adminEmail) });
    }

    if(url.pathname==="/api/member-kpis"){
      const email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase(),admin=(env.ADMIN_EMAIL||"").trim().toLowerCase();
      if(!email||!admin||email!==admin)return apiJson({error:"只有系統擁有者可以查看或維護 KPI"},403);
      if(!env.DB)return apiJson({error:"KPI 資料庫尚未啟用"},503);
      const selectSql=`SELECT member, training_points AS trainingPoints, visitor_count AS visitorCount, one_to_one_weekly_average AS oneToOneWeeklyAverage, referral_weekly_average AS referralWeeklyAverage, referral_total AS referralTotal, dream_referral_amount AS dreamReferralAmount, updated_at AS updatedAt FROM member_kpi_state`;
      if(request.method==="GET"){
        const result=await env.DB.prepare(`${selectSql} ORDER BY updated_at DESC`).all(),rows=(result.results||[]) as Array<Record<string,unknown>>,records=Array.from(new Map(rows.map(row=>[String(row.member||"").replace(/\s+/g,""),row])).values());
        return apiJson({records});
      }
      if(request.method==="POST"){
        const body=await request.json() as Record<string,unknown>,member=String(body.member||"").trim(),baseUpdatedAt=String(body.baseUpdatedAt||"");
        if(!member)return apiJson({error:"請選擇會員"},400);
        const current=await env.DB.prepare(`${selectSql} WHERE replace(member,' ','')=replace(?,' ','') ORDER BY updated_at DESC LIMIT 1`).bind(member).first<Record<string,unknown>>();
        if(baseUpdatedAt&&current?.updatedAt&&baseUpdatedAt!==String(current.updatedAt))return apiJson({error:"此會員 KPI 已被其他畫面更新",record:current},409);
        const numberOrNull=(key:string,integer=false)=>{const value=body[key];if(value===null||value===""||typeof value==="undefined")return null;const number=Number(value);return Number.isFinite(number)&&number>=0?(integer?Math.round(number):number):NaN};
        const trainingPoints=numberOrNull("trainingPoints",true),visitorCount=numberOrNull("visitorCount",true),oneToOneWeeklyAverage=numberOrNull("oneToOneWeeklyAverage"),referralWeeklyAverage=numberOrNull("referralWeeklyAverage"),referralTotal=numberOrNull("referralTotal",true),dreamReferralAmount=numberOrNull("dreamReferralAmount",true);
        if([trainingPoints,visitorCount,oneToOneWeeklyAverage,referralWeeklyAverage,referralTotal,dreamReferralAmount].some(Number.isNaN))return apiJson({error:"KPI 數值必須為零或正數"},400);
        const updatedAt=new Date().toISOString();
        await env.DB.prepare(`INSERT INTO member_kpi_state (member,training_points,visitor_count,one_to_one_weekly_average,referral_weekly_average,referral_total,dream_referral_amount,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(member) DO UPDATE SET training_points=excluded.training_points,visitor_count=excluded.visitor_count,one_to_one_weekly_average=excluded.one_to_one_weekly_average,referral_weekly_average=excluded.referral_weekly_average,referral_total=excluded.referral_total,dream_referral_amount=excluded.dream_referral_amount,updated_at=excluded.updated_at`).bind(member,trainingPoints,visitorCount,oneToOneWeeklyAverage,referralWeeklyAverage,referralTotal,dreamReferralAmount,updatedAt).run();
        await env.DB.prepare(`DELETE FROM member_kpi_state WHERE replace(member,' ','')=replace(?,' ','') AND member<>?`).bind(member,member).run();
        return apiJson({ok:true,record:{member,trainingPoints,visitorCount,oneToOneWeeklyAverage,referralWeeklyAverage,referralTotal,dreamReferralAmount,updatedAt}});
      }
      return apiJson({error:"不支援的 KPI 資料操作"},405);
    }

    if(url.pathname==="/api/attendance-alert-acks"){
      if(!env.DB)return apiJson({error:"資料庫尚未啟用"},503);
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS attendance_alert_ack_state (id INTEGER PRIMARY KEY CHECK (id=1), acknowledgements TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();
      if(request.method==="GET"){
        const row=await env.DB.prepare(`SELECT acknowledgements, updated_at AS updatedAt FROM attendance_alert_ack_state WHERE id=1`).first<{acknowledgements:string;updatedAt:string}>();
        return apiJson({acknowledgements:JSON.parse(row?.acknowledgements||"[]"),updatedAt:row?.updatedAt||null});
      }
      if(request.method==="POST"){
        const body=await request.json() as Record<string,unknown>,items=Array.isArray(body.acknowledgements)?body.acknowledgements.map(value=>String(value).trim()).filter(Boolean):[];
        const acknowledgements=[...new Set(items)].slice(0,1000),updatedAt=new Date().toISOString();
        await env.DB.prepare(`INSERT INTO attendance_alert_ack_state (id,acknowledgements,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET acknowledgements=excluded.acknowledgements,updated_at=excluded.updated_at`).bind(JSON.stringify(acknowledgements),updatedAt).run();
        return apiJson({ok:true,acknowledgements,updatedAt});
      }
      return apiJson({error:"不支援的確認狀態操作"},405);
    }

    if(url.pathname==="/api/v1/bni-sync/job"){
      const cors={"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization, content-type","access-control-allow-methods":"GET, POST, OPTIONS"};
      const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:cors});
      if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
      if(!env.DB)return respond({error:"資料庫尚未啟用"},503);
      const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim(),digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer))),b=>b.toString(16).padStart(2,"0")).join("");
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bni_sync_credential (id INTEGER PRIMARY KEY CHECK (id=1), key_hash TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bni_sync_job (id INTEGER PRIMARY KEY CHECK (id=1), state TEXT NOT NULL DEFAULT 'idle', requested_at TEXT, started_at TEXT, completed_at TEXT, message TEXT NOT NULL DEFAULT '')`).run();
      const credential=await env.DB.prepare(`SELECT key_hash AS keyHash FROM bni_sync_credential WHERE id=1`).first<{keyHash:string}>(),runnerAuthorized=Boolean(env.BNI_RUNNER_TOKEN&&bearer===env.BNI_RUNNER_TOKEN);
      if(!runnerAuthorized&&(!bearer||!credential?.keyHash||digest!==credential.keyHash))return respond({error:"同步金鑰無效"},401);
      const current=await env.DB.prepare(`SELECT state,requested_at AS requestedAt,started_at AS startedAt,completed_at AS completedAt,message FROM bni_sync_job WHERE id=1`).first<Record<string,unknown>>();
      if(request.method==="GET")return respond({job:current||{state:"idle"}});
      if(request.method==="POST"){
        const body=await request.json().catch(()=>({})) as Record<string,unknown>,action=String(body.action||"claim"),now=new Date().toISOString();
        if(action==="claim"){
          if(current?.state!=="pending")return respond({job:current||{state:"idle"}});
          await env.DB.prepare(`UPDATE bni_sync_job SET state='running',started_at=?,message='' WHERE id=1 AND state='pending'`).bind(now).run();
        }else if(action==="complete"||action==="failed"){
          await env.DB.prepare(`UPDATE bni_sync_job SET state=?,completed_at=?,message=? WHERE id=1`).bind(action==="complete"?"success":"failed",now,String(body.message||"").slice(0,500)).run();
        }else return respond({error:"不支援的工作狀態"},400);
        const job=await env.DB.prepare(`SELECT state,requested_at AS requestedAt,started_at AS startedAt,completed_at AS completedAt,message FROM bni_sync_job WHERE id=1`).first<Record<string,unknown>>();
        return respond({job});
      }
      return respond({error:"不支援的操作"},405);
    }

    if(url.pathname==="/api/bni-sync/run"&&request.method==="POST"){
      const email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase(),admin=(env.ADMIN_EMAIL||"").trim().toLowerCase();
      if(!email||!admin||email!==admin)return apiJson({error:"只有系統擁有者可以執行一鍵更新"},403);
      if(!env.DB||!env.BNI_TOKEN_ENCRYPTION_KEY)return apiJson({error:"伺服器同步尚未啟用"},503);
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bni_sync_run (id INTEGER PRIMARY KEY CHECK (id=1), state TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
      const running=await env.DB.prepare(`SELECT state,updated_at AS updatedAt FROM bni_sync_run WHERE id=1`).first<{state:string;updatedAt:string}>();
      if(running?.state==="running"&&Date.now()-new Date(running.updatedAt).getTime()<180000)return apiJson({error:"資料正在更新中，請稍候查看結果"},409);
      const startedAt=new Date().toISOString();await env.DB.prepare(`INSERT INTO bni_sync_run (id,state,updated_at) VALUES (1,'running',?) ON CONFLICT(id) DO UPDATE SET state='running',updated_at=excluded.updated_at`).bind(startedAt).run();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bni_sync_job (id INTEGER PRIMARY KEY CHECK (id=1), state TEXT NOT NULL DEFAULT 'idle', requested_at TEXT, started_at TEXT, completed_at TEXT, message TEXT NOT NULL DEFAULT '')`).run();
      await env.DB.prepare(`INSERT INTO bni_sync_job (id,state,requested_at,started_at,completed_at,message) VALUES (1,'pending',?,NULL,NULL,'') ON CONFLICT(id) DO UPDATE SET state='pending',requested_at=excluded.requested_at,started_at=NULL,completed_at=NULL,message=''`).bind(startedAt).run();
      return apiJson({ok:true,queued:true,state:"pending",requestedAt:startedAt});
      if(false){
      try{
        if(env.BNI_RUNNER_URL&&env.BNI_RUNNER_TOKEN){
          const response=await fetch(`${env.BNI_RUNNER_URL.replace(/\/$/,"")}/sync`,{method:"POST",headers:{authorization:`Bearer ${env.BNI_RUNNER_TOKEN}`,"content-type":"application/json"},body:JSON.stringify({siteOrigin:url.origin})}),result=await response.json() as Record<string,unknown>;
          if(!response.ok)throw new Error(String(result.error||`瀏覽器同步服務失敗（${response.status}）`));
          await env.DB.prepare(`UPDATE bni_sync_run SET state='success',updated_at=? WHERE id=1`).bind(new Date().toISOString()).run();return apiJson(result);
        }
        const stored=await env.DB.prepare(`SELECT encrypted_session AS encryptedSession FROM bni_connect_session WHERE id=1`).first<{encryptedSession:string}>();
        if(!stored?.encryptedSession)throw new Error("尚未建立 BNI Connect 伺服器連線");
        const keyBytes=Uint8Array.from(atob(env.BNI_TOKEN_ENCRYPTION_KEY),char=>char.charCodeAt(0)),cryptoKey=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["encrypt","decrypt"]),[ivText,cipherText]=stored.encryptedSession.split("."),iv=Uint8Array.from(atob(ivText),char=>char.charCodeAt(0)),cipher=Uint8Array.from(atob(cipherText),char=>char.charCodeAt(0)),plain=await crypto.subtle.decrypt({name:"AES-GCM",iv},cryptoKey,cipher),session=JSON.parse(new TextDecoder().decode(plain)) as {accessToken:string;refreshToken:string};
        const makeHeaders=(token:string)=>({authorization:`Bearer ${token}`,accept:"application/json, text/plain, */*","content-type":"application/json",origin:"https://www.bniconnectglobal.com",referer:"https://www.bniconnectglobal.com/"});
        let token=session.accessToken,headers=makeHeaders(token),profileResponse=await fetch("https://api.bniconnectglobal.com/core-api/profile",{headers});
        if(profileResponse.status===401&&session.refreshToken){
          let refreshed:any=null;
          for(const body of [{refresh_token:session.refreshToken},{refreshToken:session.refreshToken}]){const response=await fetch("https://api.bniconnectglobal.com/auth-api/refresh-token",{method:"POST",headers:{accept:"application/json","content-type":"application/json",origin:"https://www.bniconnectglobal.com"},body:JSON.stringify(body)});if(response.ok){refreshed=await response.json();break}}
          token=String(refreshed?.access_token||refreshed?.accessToken||"");if(!token)throw new Error("BNI 登入已過期，請重新連接一次");
          session.accessToken=token;session.refreshToken=String(refreshed?.refresh_token||refreshed?.refreshToken||session.refreshToken);headers=makeHeaders(token);profileResponse=await fetch("https://api.bniconnectglobal.com/core-api/profile",{headers});
          const nextIv=crypto.getRandomValues(new Uint8Array(12)),nextPlain=new TextEncoder().encode(JSON.stringify(session)),nextCipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nextIv},cryptoKey,nextPlain)),encrypted=`${btoa(String.fromCharCode(...nextIv))}.${btoa(String.fromCharCode(...nextCipher))}`;await env.DB.prepare(`UPDATE bni_connect_session SET encrypted_session=?,updated_at=? WHERE id=1`).bind(encrypted,new Date().toISOString()).run();
        }
        if(!profileResponse.ok)throw new Error(`BNI 拒絕伺服器讀取（${profileResponse.status}）`);
        const [profile,homeResponse]=[await profileResponse.json() as Record<string,unknown>,await fetch("https://api.bniconnectglobal.com/member-api/v2/home",{headers})];if(!homeResponse.ok)throw new Error(`無法取得分會資料（${homeResponse.status}）`);const home=await homeResponse.json() as Record<string,unknown>;
        const chapter=bniFindId({profile,home},"chapter"),region=bniFindId({profile,home},"region"),country=bniFindId({profile,home},"country");if(!chapter||!region||!country)throw new Error("無法取得分會報表識別資料");
        const end=new Date(),start=new Date(end.getFullYear(),end.getMonth()-5,1),usDate=(date:Date)=>`${String(date.getMonth()+1).padStart(2,"0")}/${String(date.getDate()).padStart(2,"0")}/${date.getFullYear()}`;
        const generate=async(menuName:string)=>{const params=new URLSearchParams({menuName,IdOrg:chapter,startDate:usDate(start),endDate:usDate(end),ReportType:"EXCEL",__heading_chapter:chapter,__heading_region:region,__heading_country:country,__orientation:"ltr",execution_type:"SHORT",ShowDetails:"false",__exports_details:"1"}),response=await fetch(`https://api.bniconnectglobal.com/reports-api/reports/v1/generate?${params}`,{headers});if(!response.ok)throw new Error(`BNI ${menuName.includes("attendance")?"PALMS":"會員"}報表讀取失敗（${response.status}）`);return response.text()};
        const [rosterText,attendanceText,duesResult]=await Promise.all([generate("menu.reports.chapter.roster"),generate("menu.reports.chapter.palms.attendance"),generate("menu.reports.chapter.membership.dues").catch(()=>"")]);
        const roster=bniParseRoster(rosterText);if(roster.length<10)throw new Error("會員名冊筆數異常，已停止更新以保護現有資料");
        const members=Array.from(new Set(roster.map(item=>item.member.replace(/\s+/g,"")))),records=Array.from(new Map(bniParseAttendance(attendanceText,end).filter(item=>members.includes(item.member.replace(/\s+/g,""))).map(item=>[`${item.member.replace(/\s+/g,"")}|${item.date}`,item])).values());if(records.length<10)throw new Error("PALMS 筆數異常，已停止更新以保護現有資料");
        const dues=duesResult?bniParseRoster(duesResult):[],expiry=new Map([...roster,...dues].filter(item=>item.expiryDate).map(item=>[item.member.replace(/\s+/g,""),item.expiryDate])),renewals=roster.map(item=>({member:item.member,expiryDate:expiry.get(item.member.replace(/\s+/g,""))||item.expiryDate})).filter(item=>item.expiryDate),now=new Date().toISOString();
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS attendance_state (id INTEGER PRIMARY KEY CHECK (id=1), records TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();await env.DB.prepare(`CREATE TABLE IF NOT EXISTS member_roster_state (id INTEGER PRIMARY KEY CHECK (id=1), members TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();await env.DB.prepare(`CREATE TABLE IF NOT EXISTS practice_state (id INTEGER PRIMARY KEY CHECK (id=1), renewals TEXT NOT NULL DEFAULT '[]', tasks TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();
        const practice=await env.DB.prepare(`SELECT renewals FROM practice_state WHERE id=1`).first<{renewals:string}>(),current=JSON.parse(practice?.renewals||"[]") as Array<Record<string,unknown>>,byName=new Map(current.map(item=>[String(item.name||"").replace(/\s+/g,""),item]));for(const item of renewals){const key=item.member.replace(/\s+/g,""),existing=byName.get(key),daysLeft=Math.ceil((new Date(`${item.expiryDate}T00:00:00+08:00`).getTime()-Date.now())/86400000),fallbackId=Array.from(`${key}|${item.expiryDate}`).reduce((sum,char)=>(sum*31+char.charCodeAt(0))>>>0,7);byName.set(key,{id:Number(existing?.id)||fallbackId,name:item.member,expiryDate:item.expiryDate,daysLeft,status:existing?.status||(daysLeft<=14?"待繳費":"待訪談"),owner:existing?.owner||"",note:existing?.note||"",updatedAt:now})}
        await env.DB.batch([env.DB.prepare(`INSERT INTO attendance_state (id,records,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET records=excluded.records,updated_at=excluded.updated_at`).bind(JSON.stringify(records),now),env.DB.prepare(`INSERT INTO member_roster_state (id,members,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET members=excluded.members,updated_at=excluded.updated_at`).bind(JSON.stringify(members),now),env.DB.prepare(`INSERT INTO practice_state (id,renewals,tasks,updated_at) VALUES (1,?,'[]',?) ON CONFLICT(id) DO UPDATE SET renewals=excluded.renewals,updated_at=excluded.updated_at`).bind(JSON.stringify([...byName.values()]),now)]);
        const latestDate=records.map(item=>item.date).sort().at(-1)||"",syncStatus={lastSyncAt:now,attendance:{updatedAt:now,count:records.length,latestDate},members:{updatedAt:now,count:members.length},renewals:{updatedAt:renewals.length?now:null,count:renewals.length},kpis:{updatedAt:null,count:0},failedMembers:0};await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bni_sync_status (id INTEGER PRIMARY KEY CHECK (id=1), status TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)`).run();await env.DB.prepare(`INSERT INTO bni_sync_status (id,status,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`).bind(JSON.stringify(syncStatus),now).run();await env.DB.prepare(`UPDATE bni_sync_run SET state='success',updated_at=? WHERE id=1`).bind(now).run();return apiJson({ok:true,memberCount:members.length,renewalCount:renewals.length,attendanceCount:records.length,latestDate,updatedAt:now});
      }catch(error){const message=error instanceof Error?error.message:"一鍵更新失敗";await env.DB.prepare(`UPDATE bni_sync_run SET state='failed',updated_at=? WHERE id=1`).bind(new Date().toISOString()).run();return apiJson({error:message},502)}
      }
    }

    if(url.pathname==="/api/bni-connect/session"){
      const email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase(),admin=(env.ADMIN_EMAIL||"").trim().toLowerCase();
      if(!email||!admin||email!==admin)return apiJson({error:"只有系統擁有者可以設定 BNI Connect"},403);
      if(!env.DB||!env.BNI_TOKEN_ENCRYPTION_KEY)return apiJson({error:"BNI Connect 安全儲存尚未啟用"},503);
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bni_connect_session (id INTEGER PRIMARY KEY CHECK (id=1), encrypted_session TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
      if(request.method==="GET"){
        const row=await env.DB.prepare(`SELECT updated_at AS updatedAt FROM bni_connect_session WHERE id=1`).first<{updatedAt:string}>();
        return apiJson({connected:Boolean(row),updatedAt:row?.updatedAt||null});
      }
      if(request.method==="POST"){
        const body=await request.json() as Record<string,unknown>,accessToken=String(body.accessToken||"").trim(),refreshToken=String(body.refreshToken||"").trim();
        if(accessToken.length<20||refreshToken.length<20)return apiJson({error:"Access Token 或 Refresh Token 格式不完整"},400);
        const keyBytes=Uint8Array.from(atob(env.BNI_TOKEN_ENCRYPTION_KEY),char=>char.charCodeAt(0)),key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["encrypt"]),iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify({accessToken,refreshToken})),cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plain)),encryptedSession=`${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...cipher))}`,updatedAt=new Date().toISOString();
        await env.DB.prepare(`INSERT INTO bni_connect_session (id,encrypted_session,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET encrypted_session=excluded.encrypted_session,updated_at=excluded.updated_at`).bind(encryptedSession,updatedAt).run();
        return apiJson({connected:true,updatedAt});
      }
      return apiJson({error:"不支援的操作"},405);
    }

    if(url.pathname==="/api/bni-connect/test"&&request.method==="POST"){
      const email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase(),admin=(env.ADMIN_EMAIL||"").trim().toLowerCase();
      if(!email||!admin||email!==admin)return apiJson({error:"只有系統擁有者可以測試 BNI Connect"},403);
      if(!env.DB||!env.BNI_TOKEN_ENCRYPTION_KEY)return apiJson({error:"BNI Connect 安全儲存尚未啟用"},503);
      const row=await env.DB.prepare(`SELECT encrypted_session AS encryptedSession FROM bni_connect_session WHERE id=1`).first<{encryptedSession:string}>();
      if(!row?.encryptedSession)return apiJson({error:"尚未儲存 BNI Connect Token"},404);
      try{
        const [ivText,cipherText]=row.encryptedSession.split("."),keyBytes=Uint8Array.from(atob(env.BNI_TOKEN_ENCRYPTION_KEY),char=>char.charCodeAt(0)),key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["decrypt"]),iv=Uint8Array.from(atob(ivText),char=>char.charCodeAt(0)),cipher=Uint8Array.from(atob(cipherText),char=>char.charCodeAt(0)),plain=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,cipher),session=JSON.parse(new TextDecoder().decode(plain)) as {accessToken:string;refreshToken:string};
        const bniHeaders={authorization:`Bearer ${session.accessToken}`,accept:"application/json, text/plain, */*","content-type":"application/json",origin:"https://www.bniconnectglobal.com",referer:"https://www.bniconnectglobal.com/","accept-language":"zh-TW,zh;q=0.9,en;q=0.8"};
        const checks=[{name:"profile",url:"https://api.bniconnectglobal.com/core-api/profile"},{name:"home",url:"https://api.bniconnectglobal.com/member-api/v2/home"},{name:"nav-menu",url:"https://api.bniconnectglobal.com/member-api/v2/nav-menu"}];
        let verified:{name:string;data:Record<string,unknown>}|null=null;const statuses:Array<{name:string;status:number}>=[];
        for(const check of checks){const response=await fetch(check.url,{headers:bniHeaders});statuses.push({name:check.name,status:response.status});if(response.status===401)return apiJson({connected:false,error:"BNI Token 已過期，請重新連接"},401);if(response.ok){verified={name:check.name,data:await response.json() as Record<string,unknown>};break}}
        if(!verified){const allForbidden=statuses.length>0&&statuses.every(item=>item.status===403);return apiJson({connected:false,error:allForbidden?"BNI Connect 拒絕伺服器直連（403）；Token 已收到，但需改用瀏覽器登入工作階段同步":"BNI Connect 驗證失敗",checks:statuses},502)}
        const profile=verified.data,updatedAt=new Date().toISOString();
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bni_connect_profile (id INTEGER PRIMARY KEY CHECK (id=1), profile TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
        await env.DB.prepare(`INSERT INTO bni_connect_profile (id,profile,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET profile=excluded.profile,updated_at=excluded.updated_at`).bind(JSON.stringify(profile),updatedAt).run();
        return apiJson({connected:true,updatedAt,verifiedBy:verified.name});
      }catch{return apiJson({connected:false,error:"無法解密或驗證 BNI Connect Token"},500)}
    }

    if(url.pathname==="/api/bni-sync/pair"&&request.method==="POST"){
      const email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase(),admin=(env.ADMIN_EMAIL||"").trim().toLowerCase();
      if(!email||!admin||email!==admin)return apiJson({error:"只有系統擁有者可以建立同步金鑰"},403);
      if(!env.DB)return apiJson({error:"資料庫尚未啟用"},503);
      const bytes=crypto.getRandomValues(new Uint8Array(32)),syncKey=`bni_sync_${Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("")}`,digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(syncKey))),b=>b.toString(16).padStart(2,"0")).join(""),updatedAt=new Date().toISOString();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bni_sync_credential (id INTEGER PRIMARY KEY CHECK (id=1), key_hash TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
      await env.DB.prepare(`INSERT INTO bni_sync_credential (id,key_hash,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET key_hash=excluded.key_hash,updated_at=excluded.updated_at`).bind(digest,updatedAt).run();
      return apiJson({syncKey,updatedAt});
    }

    if(url.pathname==="/api/v1/bni-sync"){
      const cors={"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-headers":"authorization, content-type","access-control-allow-methods":"POST, OPTIONS"};
      const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:cors});
      if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
      if(request.method!=="POST")return respond({error:"只接受同步上傳"},405);
      if(!env.DB)return respond({error:"資料庫尚未啟用"},503);
      const bearer=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim(),digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer))),b=>b.toString(16).padStart(2,"0")).join("");
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bni_sync_credential (id INTEGER PRIMARY KEY CHECK (id=1), key_hash TEXT NOT NULL, updated_at TEXT NOT NULL)`).run();
      const credential=await env.DB.prepare(`SELECT key_hash AS keyHash FROM bni_sync_credential WHERE id=1`).first<{keyHash:string}>();
      const runnerAuthorized=Boolean(env.BNI_RUNNER_TOKEN&&bearer===env.BNI_RUNNER_TOKEN);
      if(!runnerAuthorized&&(!bearer||!credential?.keyHash||digest!==credential.keyHash))return respond({error:"同步金鑰無效，請回管理系統重新配對"},401);
      const body=await request.json() as Record<string,unknown>,records=Array.isArray(body.records)?body.records:[],kpis=Array.isArray(body.kpis)?body.kpis:[],members=Array.isArray(body.members)?body.members.map(value=>String(value).trim()).filter(Boolean):[],renewalRows=Array.isArray(body.renewals)?body.renewals:[],failedMembers=Array.isArray(body.failedMembers)?body.failedMembers.map(value=>String(value).trim()).filter(Boolean):[];
      const valid=records.filter((x:any)=>x&&typeof x.member==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(String(x.date))&&["P","A","L","M","S"].includes(String(x.code))).map((x:any)=>({member:String(x.member).trim(),date:String(x.date),code:String(x.code)}));
      const validKpis=kpis.filter((x:any)=>x&&typeof x.member==="string"&&String(x.member).trim()&&[x.trainingPoints,x.visitorCount,x.oneToOneWeeklyAverage,x.referralWeeklyAverage,x.referralTotal,x.dreamReferralAmount].every(value=>Number.isFinite(Number(value))&&Number(value)>=0)).map((x:any)=>({member:String(x.member).trim(),trainingPoints:Math.round(Number(x.trainingPoints)),visitorCount:Math.round(Number(x.visitorCount)),oneToOneWeeklyAverage:Number(x.oneToOneWeeklyAverage),referralWeeklyAverage:Number(x.referralWeeklyAverage),referralTotal:Math.round(Number(x.referralTotal)),dreamReferralAmount:Math.round(Number(x.dreamReferralAmount))}));
      const validMembers=Array.from(new Set(members.map(value=>String(value).replace(/\s+/g,"")).filter(value=>value.length>=2))),validRenewals=renewalRows.filter((x:any)=>x&&typeof x.member==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(String(x.expiryDate))).map((x:any)=>({member:String(x.member).trim(),expiryDate:String(x.expiryDate)}));
      if(valid.length<1&&validKpis.length<1&&validMembers.length<10)return respond({error:"沒有可匯入的會員、PALMS 或 KPI 紀錄"},400);
      const unique=Array.from(new Map(valid.map(item=>[`${item.member}|${item.date}`,item])).values()),uniqueKpis=Array.from(new Map(validKpis.map(item=>[item.member.replace(/\s+/g,""),item])).values()),now=new Date().toISOString();
      if(unique.length){await env.DB.prepare(`CREATE TABLE IF NOT EXISTS attendance_state (id INTEGER PRIMARY KEY CHECK (id=1), records TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();await env.DB.prepare(`INSERT INTO attendance_state (id,records,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET records=excluded.records,updated_at=excluded.updated_at`).bind(JSON.stringify(unique),now).run()}
      if(uniqueKpis.length){await env.DB.batch(uniqueKpis.flatMap(item=>[env.DB.prepare(`INSERT INTO member_kpi_state (member,training_points,visitor_count,one_to_one_weekly_average,referral_weekly_average,referral_total,dream_referral_amount,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(member) DO UPDATE SET training_points=excluded.training_points,visitor_count=excluded.visitor_count,one_to_one_weekly_average=excluded.one_to_one_weekly_average,referral_weekly_average=excluded.referral_weekly_average,referral_total=excluded.referral_total,dream_referral_amount=excluded.dream_referral_amount,updated_at=excluded.updated_at`).bind(item.member,item.trainingPoints,item.visitorCount,item.oneToOneWeeklyAverage,item.referralWeeklyAverage,item.referralTotal,item.dreamReferralAmount,now),env.DB.prepare(`DELETE FROM member_kpi_state WHERE replace(member,' ','')=replace(?,' ','') AND member<>?`).bind(item.member,item.member)]))}
      if(failedMembers.length){await env.DB.batch(failedMembers.map(member=>env.DB.prepare(`UPDATE member_kpi_state SET training_points=NULL,visitor_count=NULL,one_to_one_weekly_average=NULL,referral_weekly_average=NULL,referral_total=NULL,dream_referral_amount=NULL,updated_at=? WHERE replace(member,' ','')=replace(?,' ','')`).bind(now,member)))}
      if(validMembers.length>=10){
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS member_roster_state (id INTEGER PRIMARY KEY CHECK (id=1), members TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();
        await env.DB.prepare(`INSERT INTO member_roster_state (id,members,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET members=excluded.members,updated_at=excluded.updated_at`).bind(JSON.stringify(validMembers),now).run();
      }
      if(validRenewals.length){
        await env.DB.prepare(`CREATE TABLE IF NOT EXISTS practice_state (id INTEGER PRIMARY KEY CHECK (id=1), renewals TEXT NOT NULL DEFAULT '[]', tasks TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();
        const row=await env.DB.prepare(`SELECT renewals FROM practice_state WHERE id=1`).first<{renewals:string}>(),current=JSON.parse(row?.renewals||"[]") as Array<Record<string,unknown>>,byName=new Map(current.map(item=>[String(item.name||"").replace(/\s+/g,""),item]));
        for(const item of validRenewals){const key=item.member.replace(/\s+/g,""),existing=byName.get(key),daysLeft=Math.ceil((new Date(`${item.expiryDate}T00:00:00+08:00`).getTime()-Date.now())/86400000),fallbackId=Array.from(`${key}|${item.expiryDate}`).reduce((sum,char)=>(sum*31+char.charCodeAt(0))>>>0,7);byName.set(key,{id:Number(existing?.id)||fallbackId,name:item.member,expiryDate:item.expiryDate,daysLeft,status:existing?.status|| (daysLeft<=14?"待繳費":"待訪談"),owner:existing?.owner||"",note:existing?.note||"",updatedAt:now})}
        const next=[...byName.values()];await env.DB.prepare(`INSERT INTO practice_state (id,renewals,tasks,updated_at) VALUES (1,?,'[]',?) ON CONFLICT(id) DO UPDATE SET renewals=excluded.renewals,updated_at=excluded.updated_at`).bind(JSON.stringify(next),now).run();
      }
      const latestAttendanceDate=unique.map(item=>item.date).sort().at(-1)||"",syncStatus={lastSyncAt:now,attendance:{updatedAt:unique.length?now:null,count:unique.length,latestDate:latestAttendanceDate},members:{updatedAt:validMembers.length>=10?now:null,count:validMembers.length},renewals:{updatedAt:validRenewals.length?now:null,count:validRenewals.length},kpis:{updatedAt:uniqueKpis.length?now:null,count:uniqueKpis.length},failedMembers:failedMembers.length};
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bni_sync_status (id INTEGER PRIMARY KEY CHECK (id=1), status TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)`).run();
      await env.DB.prepare(`INSERT INTO bni_sync_status (id,status,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`).bind(JSON.stringify(syncStatus),now).run();
      return respond({ok:true,count:unique.length,kpiCount:uniqueKpis.length,memberCount:validMembers.length,renewalCount:validRenewals.length,updatedAt:now});
    }

    if(url.pathname==="/api/bni-sync/status"&&request.method==="GET"){
      if(!env.DB)return apiJson({status:null});
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bni_sync_status (id INTEGER PRIMARY KEY CHECK (id=1), status TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)`).run();
      const row=await env.DB.prepare(`SELECT status,updated_at AS updatedAt FROM bni_sync_status WHERE id=1`).first<{status:string;updatedAt:string}>();
      if(row)return apiJson({status:JSON.parse(row.status),updatedAt:row.updatedAt});
      const attendance=await env.DB.prepare(`SELECT records,updated_at AS updatedAt FROM attendance_state WHERE id=1`).first<{records:string;updatedAt:string}>(),roster=await env.DB.prepare(`SELECT members,updated_at AS updatedAt FROM member_roster_state WHERE id=1`).first<{members:string;updatedAt:string}>(),practice=await env.DB.prepare(`SELECT renewals,updated_at AS updatedAt FROM practice_state WHERE id=1`).first<{renewals:string;updatedAt:string}>();
      const attendanceRecords=JSON.parse(attendance?.records||"[]") as Array<{date?:string}>,members=JSON.parse(roster?.members||"[]") as unknown[],renewals=JSON.parse(practice?.renewals||"[]") as unknown[],latestDate=attendanceRecords.map(item=>String(item.date||"")).filter(Boolean).sort().at(-1)||"",lastSyncAt=[attendance?.updatedAt,roster?.updatedAt].filter(Boolean).sort().at(-1)||"";
      return apiJson({status:lastSyncAt?{lastSyncAt,attendance:{updatedAt:attendance?.updatedAt||null,count:attendanceRecords.length,latestDate},members:{updatedAt:roster?.updatedAt||null,count:members.length},renewals:{updatedAt:roster?.updatedAt||null,count:renewals.length},kpis:{updatedAt:null,count:0},failedMembers:0}:null,updatedAt:lastSyncAt||null});
    }

    if(url.pathname==="/api/member-roster"&&request.method==="GET"){
      if(!env.DB)return apiJson({members:[],updatedAt:null});
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS member_roster_state (id INTEGER PRIMARY KEY CHECK (id=1), members TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();
      const row=await env.DB.prepare(`SELECT members,updated_at AS updatedAt FROM member_roster_state WHERE id=1`).first<{members:string;updatedAt:string}>();
      return apiJson({members:JSON.parse(row?.members||"[]"),updatedAt:row?.updatedAt||null});
    }

    if(url.pathname==="/api-docs/groups"){
      const email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase(),admin=(env.ADMIN_EMAIL||"").trim().toLowerCase();
      if(!email||!admin||email!==admin)return new Response("此頁面僅限系統擁有者",{status:403,headers:{"content-type":"text/plain; charset=utf-8"}});
    }

    if(url.pathname==="/api/admin-schedules"){
      if(!env.DB)return apiJson({schedules:[]},503);
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_schedule_state (id INTEGER PRIMARY KEY CHECK (id=1), schedules TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();
      if(request.method==="GET"){
        const row=await env.DB.prepare(`SELECT schedules,updated_at AS updatedAt FROM admin_schedule_state WHERE id=1`).first<{schedules:string;updatedAt:string}>();
        return apiJson({schedules:JSON.parse(row?.schedules||"[]"),updatedAt:row?.updatedAt||null});
      }
      if(request.method==="POST"){
        const email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase(),admin=(env.ADMIN_EMAIL||"").trim().toLowerCase();
        if(!email||!admin||email!==admin)return apiJson({error:"只有系統擁有者可以修改行政排班"},403);
        const body=await request.json() as {schedules?:unknown},schedules=Array.isArray(body.schedules)?body.schedules:[];
        const updatedAt=new Date().toISOString();
        await env.DB.prepare(`INSERT INTO admin_schedule_state (id,schedules,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET schedules=excluded.schedules,updated_at=excluded.updated_at`).bind(JSON.stringify(schedules),updatedAt).run();
        return apiJson({ok:true,schedules,updatedAt});
      }
      return apiJson({error:"不支援的行政排班操作"},405);
    }

    if (url.pathname === "/api/practice") {
      if (!env.DB) return apiJson({ error: "實習資料庫尚未啟用" }, 503);
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS practice_state (id INTEGER PRIMARY KEY CHECK (id = 1), renewals TEXT NOT NULL DEFAULT '[]', tasks TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS visitor_state (id INTEGER PRIMARY KEY CHECK (id = 1), visitors TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`),
      ]);
      if (request.method === "GET") {
        const row = await env.DB.prepare(`SELECT renewals, tasks, updated_at AS updatedAt FROM practice_state WHERE id = 1`).first<{renewals:string;tasks:string;updatedAt:string}>();
        const visitorRow=await env.DB.prepare(`SELECT visitors, updated_at AS updatedAt FROM visitor_state WHERE id = 1`).first<{visitors:string;updatedAt:string}>();
        const latestUpdatedAt=[row?.updatedAt,visitorRow?.updatedAt].filter(Boolean).sort().at(-1)||null;
        return apiJson(row ? { renewals:JSON.parse(row.renewals), tasks:JSON.parse(row.tasks), visitors:JSON.parse(visitorRow?.visitors||"[]"), updatedAt:latestUpdatedAt } : { renewals:[], tasks:[], visitors:JSON.parse(visitorRow?.visitors||"[]"),updatedAt:latestUpdatedAt });
      }
      if (request.method === "POST") {
        const body = await request.json() as Record<string, unknown>;
        if(body.entity==="renewal"||body.entity==="visitor"||body.entity==="task"){
          const entity=String(body.entity),operation=String(body.operation||"update"),id=Number(body.id),changes=(body.changes&&typeof body.changes==="object"?body.changes:{}) as Record<string,unknown>;
          if(!Number.isFinite(id))return apiJson({error:"資料編號不正確"},400);
          const updatedAt=new Date().toISOString();
          if(entity==="renewal"){
            const current=await env.DB.prepare(`SELECT renewals FROM practice_state WHERE id=1`).first<{renewals:string}>();
            const records=JSON.parse(current?.renewals||"[]") as Array<Record<string,unknown>>;
            const currentItem=records.find(item=>Number(item.id)===id),baseUpdatedAt=String(body.baseUpdatedAt||"");
            if(operation==="update"&&baseUpdatedAt&&currentItem?.updatedAt&&String(currentItem.updatedAt)!==baseUpdatedAt)return apiJson({error:"資料已被其他人更新",renewals:records},409);
            const next=operation==="delete"?records.filter(item=>Number(item.id)!==id):records.map(item=>Number(item.id)===id?{...item,...changes,updatedAt}:item);
            await env.DB.prepare(`INSERT INTO practice_state (id,renewals,tasks,updated_at) VALUES (1,?,'[]',?) ON CONFLICT(id) DO UPDATE SET renewals=excluded.renewals,updated_at=excluded.updated_at`).bind(JSON.stringify(next),updatedAt).run();
            return apiJson({ok:true,renewals:next,updatedAt});
          }
          if(entity==="task"){
            const current=await env.DB.prepare(`SELECT tasks FROM practice_state WHERE id=1`).first<{tasks:string}>();
            const records=JSON.parse(current?.tasks||"[]") as Array<Record<string,unknown>>;
            const currentItem=records.find(item=>Number(item.id)===id),baseUpdatedAt=String(body.baseUpdatedAt||"");
            if(operation==="update"&&baseUpdatedAt&&currentItem?.updatedAt&&String(currentItem.updatedAt)!==baseUpdatedAt)return apiJson({error:"資料已被其他人更新",tasks:records},409);
            const next=operation==="delete"?records.filter(item=>Number(item.id)!==id):operation==="create"?[...records,{...changes,updatedAt}]:records.map(item=>Number(item.id)===id?{...item,...changes,updatedAt}:item);
            await env.DB.prepare(`INSERT INTO practice_state (id,renewals,tasks,updated_at) VALUES (1,'[]',?,?) ON CONFLICT(id) DO UPDATE SET tasks=excluded.tasks,updated_at=excluded.updated_at`).bind(JSON.stringify(next),updatedAt).run();
            return apiJson({ok:true,tasks:next,updatedAt});
          }
          const current=await env.DB.prepare(`SELECT visitors FROM visitor_state WHERE id=1`).first<{visitors:string}>();
          const records=JSON.parse(current?.visitors||"[]") as Array<Record<string,unknown>>;
          const additions=operation==="add_many"&&Array.isArray(changes.records)?changes.records as Array<Record<string,unknown>>:[];
          const currentItem=records.find(item=>Number(item.id)===id),baseUpdatedAt=String(body.baseUpdatedAt||"");
          if(operation==="update"&&baseUpdatedAt&&currentItem?.updatedAt&&String(currentItem.updatedAt)!==baseUpdatedAt)return apiJson({error:"資料已被其他人更新",visitors:records},409);
          const next=operation==="delete"?records.filter(item=>Number(item.id)!==id):operation==="create"?[...records,{...changes,updatedAt}]:operation==="add_many"?[...records,...additions.filter(item=>!records.some(existing=>Number(existing.id)===Number(item.id))).map(item=>({...item,updatedAt}))]:records.map(item=>Number(item.id)===id?{...item,...changes,updatedAt}:item);
          await env.DB.prepare(`INSERT INTO visitor_state (id,visitors,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET visitors=excluded.visitors,updated_at=excluded.updated_at`).bind(JSON.stringify(next),updatedAt).run();
          return apiJson({ok:true,visitors:next,updatedAt});
        }
        const renewals = Array.isArray(body.renewals) ? body.renewals : [];
        const tasks = Array.isArray(body.tasks) ? body.tasks : [];
        const visitors = Array.isArray(body.visitors) ? body.visitors : [];
        const updatedAt = new Date().toISOString();
        await env.DB.prepare(`INSERT INTO practice_state (id, renewals, tasks, updated_at) VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET renewals=excluded.renewals, tasks=excluded.tasks, updated_at=excluded.updated_at`).bind(JSON.stringify(renewals), JSON.stringify(tasks), updatedAt).run();
        await env.DB.prepare(`INSERT INTO visitor_state (id, visitors, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET visitors=excluded.visitors, updated_at=excluded.updated_at`).bind(JSON.stringify(visitors),updatedAt).run();
        return apiJson({ ok:true, updatedAt });
      }
      return apiJson({ error:"不支援的實習資料操作" }, 405);
    }

    if(url.pathname==="/api/member-care-owners"&&request.method==="GET"){
      if(!env.DB)return apiJson({assignments:[]});
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS member_group_state (id INTEGER PRIMARY KEY CHECK (id=1), groups TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();
      const current=await env.DB.prepare(`SELECT groups,updated_at AS updatedAt FROM member_group_state WHERE id=1`).first<{groups:string;updatedAt:string}>();
      const groups=JSON.parse(current?.groups||"[]") as Array<{id:number;members:Array<{name:string;role:string}>}>;
      const assignments=groups.flatMap(group=>{const committee=group.members.find(member=>member.role==="委員")?.name||"",leader=group.members.find(member=>member.role==="小組長")?.name||"";return group.members.map(member=>({member:member.name,groupId:group.id,committee,leader}))});
      return apiJson({assignments,updatedAt:current?.updatedAt||null});
    }

    if(url.pathname==="/api/member-groups"){
      const email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase();
      const adminEmail=(env.ADMIN_EMAIL||"").trim().toLowerCase();
      if(!email||!adminEmail||email!==adminEmail)return apiJson({error:"此功能僅限系統管理員"},403);
      if(!env.DB)return apiJson({error:"分組資料庫尚未啟用"},503);
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS member_group_state (id INTEGER PRIMARY KEY CHECK (id=1), groups TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();
      const current=await env.DB.prepare(`SELECT groups,updated_at AS updatedAt FROM member_group_state WHERE id=1`).first<{groups:string;updatedAt:string}>();
      if(request.method==="GET")return apiJson({groups:JSON.parse(current?.groups||"[]"),updatedAt:current?.updatedAt||null});
      if(request.method==="POST"){
        const body=await request.json() as Record<string,unknown>,groups=Array.isArray(body.groups)?body.groups:[];
        if(groups.length!==12)return apiJson({error:"分組必須固定為 12 組"},400);
        const updatedAt=new Date().toISOString();
        await env.DB.prepare(`INSERT INTO member_group_state (id,groups,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET groups=excluded.groups,updated_at=excluded.updated_at`).bind(JSON.stringify(groups),updatedAt).run();
        return apiJson({ok:true,groups,updatedAt});
      }
      return apiJson({error:"不支援的分組資料操作"},405);
    }

    if(url.pathname==="/api/quality-cases"){
      if(!env.DB)return apiJson({error:"品保資料庫尚未啟用"},503);
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS quality_state (id INTEGER PRIMARY KEY CHECK (id=1), cases TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();
      const current=await env.DB.prepare(`SELECT cases FROM quality_state WHERE id=1`).first<{cases:string}>();
      const cases=JSON.parse(current?.cases||"[]") as Array<Record<string,unknown>>;
      if(request.method==="GET")return apiJson({cases});
      if(request.method==="POST"){
        const body=await request.json() as Record<string,unknown>,id=Number(body.id);
        if(!Number.isFinite(id))return apiJson({error:"品保案件編號不正確"},400);
        const currentItem=cases.find(item=>Number(item.id)===id),baseUpdatedAt=String(body.baseUpdatedAt||"");
        if(currentItem&&baseUpdatedAt&&currentItem.updatedAt&&String(currentItem.updatedAt)!==baseUpdatedAt)return apiJson({error:"案件已被其他人更新",cases},409);
        const {baseUpdatedAt:_ignored,...updates}=body,existing=Boolean(currentItem);
        const next=existing?cases.map(item=>Number(item.id)===id?{...item,...updates,updatedAt:new Date().toISOString()}:item):[{...updates,id,updatedAt:new Date().toISOString()},...cases];
        const now=new Date().toISOString();
        await env.DB.prepare(`INSERT INTO quality_state (id,cases,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET cases=excluded.cases,updated_at=excluded.updated_at`).bind(JSON.stringify(next),now).run();
        return apiJson({ok:true,cases:next,updatedAt:now});
      }
      if(request.method==="DELETE"){
        const id=Number(url.searchParams.get("id"));
        if(!Number.isFinite(id))return apiJson({error:"出缺席案件編號不正確"},400);
        const next=cases.filter(item=>Number(item.id)!==id);
        const now=new Date().toISOString();
        await env.DB.prepare(`INSERT INTO quality_state (id,cases,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET cases=excluded.cases,updated_at=excluded.updated_at`).bind(JSON.stringify(next),now).run();
        return apiJson({ok:true,cases:next,updatedAt:now});
      }
      return apiJson({error:"不支援的品保操作"},405);
    }
    if(url.pathname==="/api/attendance-records"){
      if(!env.DB)return apiJson({error:"出席資料庫尚未啟用"},503);
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS attendance_state (id INTEGER PRIMARY KEY CHECK (id=1), records TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`).run();
      const row=await env.DB.prepare(`SELECT records,updated_at AS updatedAt FROM attendance_state WHERE id=1`).first<{records:string;updatedAt:string}>();
      if(request.method==="GET")return apiJson({records:JSON.parse(row?.records||"[]"),updatedAt:row?.updatedAt||null});
      if(request.method==="POST"){
        const email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase(),admin=(env.ADMIN_EMAIL||"").trim().toLowerCase();
        if(!email||email!==admin)return apiJson({error:"只有系統擁有者可以同步 PALMS"},403);
        const body=await request.json() as Record<string,unknown>,records=Array.isArray(body.records)?body.records:[],baseUpdatedAt=String(body.baseUpdatedAt||"");
        if(baseUpdatedAt&&row?.updatedAt&&baseUpdatedAt!==row.updatedAt)return apiJson({error:"PALMS 資料已被其他畫面更新",records:JSON.parse(row.records||"[]"),updatedAt:row.updatedAt},409);
        const valid=records.filter((x:any)=>x&&typeof x.member==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(String(x.date))&&["P","A","L","M","S"].includes(String(x.code)));
        const now=new Date().toISOString();await env.DB.prepare(`INSERT INTO attendance_state (id,records,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET records=excluded.records,updated_at=excluded.updated_at`).bind(JSON.stringify(valid),now).run();return apiJson({ok:true,records:valid,updatedAt:now});
      }
      return apiJson({error:"出席資料只能由管理員同步"},405);
    }

    if (url.pathname === "/api/weekly-archives" || url.pathname.startsWith("/api/weekly-archives/")) {
      if (!env.DB) return apiJson({ error:"會議建檔資料庫尚未啟用" }, 503);
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS weekly_archives (id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_date TEXT NOT NULL UNIQUE, title TEXT NOT NULL, agenda TEXT NOT NULL DEFAULT '[]', checked TEXT NOT NULL DEFAULT '[]', notes TEXT NOT NULL DEFAULT '', renewals TEXT NOT NULL DEFAULT '[]', visitors TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_weekly_archives_date ON weekly_archives(meeting_date)`),
      ]);
      const selectSql=`SELECT id, meeting_date AS meetingDate, title, agenda, checked, notes, renewals, visitors, created_at AS createdAt, updated_at AS updatedAt FROM weekly_archives`;
      const parseArchive=(row:Record<string,unknown>)=>({...row,agenda:JSON.parse(String(row.agenda||"[]")),checked:JSON.parse(String(row.checked||"[]")),renewals:JSON.parse(String(row.renewals||"[]")),visitors:JSON.parse(String(row.visitors||"[]"))});
      const archiveId=Number(url.pathname.split("/").pop());
      if(request.method==="GET" && url.pathname==="/api/weekly-archives"){
        const result=await env.DB.prepare(`${selectSql} ORDER BY meeting_date DESC, id DESC`).all<Record<string,unknown>>();
        return apiJson({archives:result.results.map(parseArchive)});
      }
      if(request.method==="POST"){
        const body=await request.json() as Record<string,unknown>;
        const meetingDate=String(body.meetingDate||"").trim(),title=String(body.title||"").trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)||!title)return apiJson({error:"會議日期或名稱不完整"},400);
        const agenda=Array.isArray(body.agenda)?body.agenda:[],checked=Array.isArray(body.checked)?body.checked:[],renewals=Array.isArray(body.renewals)?body.renewals:[],visitors=Array.isArray(body.visitors)?body.visitors:[];
        const now=new Date().toISOString();
        await env.DB.prepare(`INSERT INTO weekly_archives (meeting_date,title,agenda,checked,notes,renewals,visitors,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(meeting_date) DO UPDATE SET title=excluded.title,agenda=excluded.agenda,checked=excluded.checked,notes=excluded.notes,renewals=excluded.renewals,visitors=excluded.visitors,updated_at=excluded.updated_at`).bind(meetingDate,title,JSON.stringify(agenda),JSON.stringify(checked),String(body.notes||""),JSON.stringify(renewals),JSON.stringify(visitors),now,now).run();
        const row=await env.DB.prepare(`${selectSql} WHERE meeting_date=?`).bind(meetingDate).first<Record<string,unknown>>();
        return apiJson({archive:row?parseArchive(row):null},201);
      }
      if(request.method==="DELETE" && Number.isInteger(archiveId) && archiveId>0){
        const email=(request.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase();
        const adminEmail=(env.ADMIN_EMAIL||"").trim().toLowerCase();
        if(!email)return apiJson({error:"請先以管理員身分登入"},401);
        if(!adminEmail||email!==adminEmail)return apiJson({error:"只有系統擁有者可以刪除會議紀錄"},403);
        const existing=await env.DB.prepare(`SELECT id FROM weekly_archives WHERE id=?`).bind(archiveId).first();
        if(!existing)return apiJson({error:"找不到這筆會議紀錄"},404);
        await env.DB.prepare(`DELETE FROM weekly_archives WHERE id=?`).bind(archiveId).run();
        return apiJson({ok:true});
      }
      return apiJson({error:"不支援的建檔操作"},405);
    }

    if (url.pathname === "/api/local/openai-config" && request.method === "POST") {
      if (!["localhost","127.0.0.1"].includes(url.hostname)) return apiJson({ error:"此設定僅限本機使用" }, 403);
      const body = await request.json() as Record<string, unknown>;
      const apiKey = String(body.apiKey || "").trim();
      if (!apiKey.startsWith("sk-")) return apiJson({ error:"API 金鑰格式不正確" }, 400);
      try {
        const check = await fetch("https://api.openai.com/v1/models", { headers:{ authorization:`Bearer ${apiKey}` } });
        if (!check.ok) return apiJson({ error:"OpenAI API 金鑰驗證失敗", detail:`HTTP ${check.status}` }, 400);
        localOpenAIKey = apiKey;
        return apiJson({ ok:true, message:"API 金鑰已安全保留於本機執行程序" });
      } catch (error) { return apiJson({ error:"無法連接 OpenAI", detail:error instanceof Error?error.message:"連線失敗" }, 502); }
    }

    if (url.pathname === "/api/ai/analyze" && request.method === "POST") {
      const apiKey = env.OPENAI_API_KEY || localOpenAIKey;
      if (!apiKey) return apiJson({ error:"尚未設定 OpenAI API 金鑰" }, 503);
      const body = await request.json() as Record<string, unknown>;
      const text = String(body.text || "").trim();
      if (!text) return apiJson({ error:"沒有可分析的摘要內容" }, 400);
      const people = ["主席｜鍾坤宏","副主席｜葉奕廷","秘書財務｜陳姵文","來賓接待組","教育協調員","導師協調員","活動協調員","成長協調相關職務","網站管理員","海外事務組"];
      const schema = {type:"object",additionalProperties:false,properties:{summary:{type:"string"},decisions:{type:"array",items:{type:"string"}},actions:{type:"array",items:{type:"object",additionalProperties:false,properties:{title:{type:"string"},owner:{type:"string"},dueDate:{type:"string"},evidence:{type:"string"},confidence:{type:"string",enum:["high","medium","low"]}},required:["title","owner","dueDate","evidence","confidence"]}}},required:["summary","decisions","actions"]};
      try {
        const response = await fetch("https://api.openai.com/v1/responses", {method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify({model:"gpt-5.6-sol",input:[{role:"system",content:[{type:"input_text",text:`你是 BNI 分會領導團隊的會議紀錄助理。使用繁體中文。只整理原文可支持的內容，不得臆測。摘要要條列、合併重複資訊並移除引文標記。決議只收錄已定案內容。行動事項逐項拆分，一項只含一個可驗收工作；依明確人名或職掌指定 owner，無法確定就填「未指派」。dueDate 只填原文明示且轉為 YYYY-MM-DD，否則留空。可用負責人：${people.join("、")}。evidence 放簡短原文依據。`} ]},{role:"user",content:[{type:"input_text",text}]}],text:{format:{type:"json_schema",name:"bni_meeting_analysis",strict:true,schema}}})});
        const result = await response.json() as Record<string, any>;
        if (!response.ok) {
          const code = String(result.error?.code || result.error?.type || "");
          if (code.includes("quota") || response.status === 429) return apiJson({ error:"OpenAI API 額度不足", detail:"API 帳戶目前沒有可用額度，或已達每月使用上限。請至 OpenAI Platform 的 Billing 與 Limits 完成付款設定或調高上限後再試。" }, 402);
          return apiJson({ error:"AI 分析失敗", detail:String(result.error?.message || `HTTP ${response.status}`) }, 502);
        }
        const outputText = String(result.output_text || result.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text || "");
        if (!outputText) return apiJson({ error:"AI 沒有回傳可用結果" }, 502);
        return apiJson({ analysis:JSON.parse(outputText) });
      } catch (error) { return apiJson({ error:"AI 分析處理失敗", detail:error instanceof Error?error.message:"未知錯誤" }, 502); }
    }

    if (url.pathname === "/api/meetings" || url.pathname.startsWith("/api/meetings/")) {
      if (!env.DB) return apiJson({ error: "會議資料庫尚未啟用" }, 503);
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS meetings (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, meeting_date TEXT NOT NULL, summary TEXT NOT NULL, decisions TEXT NOT NULL DEFAULT '[]', action_candidates TEXT NOT NULL DEFAULT '[]', source TEXT NOT NULL DEFAULT 'manual', status TEXT NOT NULL DEFAULT 'published', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date)`),
      ]);
      const id = Number(url.pathname.split("/").pop());
      if (request.method === "GET" && url.pathname === "/api/meetings") {
        const result = await env.DB.prepare(`SELECT id, source_id AS sourceId, title, meeting_date AS meetingDate, summary, decisions, action_candidates AS actionCandidates, source, status, created_at AS createdAt, updated_at AS updatedAt FROM meetings ORDER BY meeting_date DESC, id DESC`).all();
        return apiJson({ meetings: result.results });
      }
      if (request.method === "GET" && Number.isInteger(id) && id > 0) {
        const meeting = await env.DB.prepare(`SELECT id, source_id AS sourceId, title, meeting_date AS meetingDate, summary, decisions, action_candidates AS actionCandidates, source, status, created_at AS createdAt, updated_at AS updatedAt FROM meetings WHERE id = ?`).bind(id).first();
        return meeting ? apiJson({ meeting }) : apiJson({ error: "找不到會議紀錄" }, 404);
      }
      if (request.method === "POST" && url.pathname === "/api/meetings") {
        const body = await request.json() as Record<string, unknown>;
        const sourceId = String(body.sourceId || "").trim();
        const title = String(body.title || "").trim();
        const summary = String(body.summary || "").trim();
        if (!sourceId || !title || !summary) return apiJson({ error: "會議名稱與摘要不可空白" }, 400);
        const now = new Date().toISOString();
        const meetingDate = String(body.meetingDate || now);
        const decisions = JSON.stringify(Array.isArray(body.decisions) ? body.decisions : []);
        const actionCandidates = JSON.stringify(Array.isArray(body.actionCandidates) ? body.actionCandidates : []);
        await env.DB.prepare(`INSERT INTO meetings (source_id, title, meeting_date, summary, decisions, action_candidates, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?) ON CONFLICT(source_id) DO UPDATE SET title=excluded.title, meeting_date=excluded.meeting_date, summary=excluded.summary, decisions=excluded.decisions, action_candidates=excluded.action_candidates, source=excluded.source, status='published', updated_at=excluded.updated_at`).bind(sourceId, title, meetingDate, summary, decisions, actionCandidates, String(body.source || "manual"), now, now).run();
        const meeting = await env.DB.prepare(`SELECT id, source_id AS sourceId, title, meeting_date AS meetingDate, summary, decisions, action_candidates AS actionCandidates, source, status, created_at AS createdAt, updated_at AS updatedAt FROM meetings WHERE source_id = ?`).bind(sourceId).first();
        return apiJson({ meeting }, 201);
      }
      if (request.method === "DELETE" && Number.isInteger(id) && id > 0) {
        const existing = await env.DB.prepare(`SELECT id FROM meetings WHERE id = ?`).bind(id).first();
        if (!existing) return apiJson({ error: "找不到會議紀錄" }, 404);
        await env.DB.prepare(`DELETE FROM meetings WHERE id = ?`).bind(id).run();
        return apiJson({ ok: true });
      }
      return apiJson({ error: "不支援的會議操作" }, 405);
    }

    if (url.pathname === "/api/actions" || url.pathname.startsWith("/api/actions/")) {
      if (!env.DB) return apiJson({ error: "行動追蹤資料庫尚未啟用" }, 503);
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS action_items (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '', due_date TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'todo', meeting_title TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_action_items_status_due ON action_items(status, due_date)`),
      ]);
      const id = Number(url.pathname.split("/").pop());
      if (request.method === "GET" && url.pathname === "/api/actions") {
        const result = await env.DB.prepare(`SELECT id, title, owner, due_date AS dueDate, status, meeting_title AS meetingTitle, notes, created_at AS createdAt, updated_at AS updatedAt FROM action_items ORDER BY CASE status WHEN 'todo' THEN 1 WHEN 'doing' THEN 2 ELSE 3 END, CASE WHEN due_date = '' THEN 1 ELSE 0 END, due_date ASC, id DESC`).all();
        return apiJson({ actions: result.results });
      }
      if (request.method === "POST" && url.pathname === "/api/actions") {
        const body = await request.json() as Record<string, unknown>;
        const title = String(body.title || "").trim();
        if (!title) return apiJson({ error: "請填寫行動事項" }, 400);
        const meetingTitle = String(body.meetingTitle || "").trim();
        const duplicate = await env.DB.prepare(`SELECT id FROM action_items WHERE title = ? AND meeting_title = ? LIMIT 1`).bind(title, meetingTitle).first<{ id:number }>();
        if (duplicate) return apiJson({ id: duplicate.id, alreadyExists: true });
        const now = new Date().toISOString();
        const result = await env.DB.prepare(`INSERT INTO action_items (title, owner, due_date, status, meeting_title, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(title, String(body.owner || "").trim(), String(body.dueDate || ""), ["todo","doing","done"].includes(String(body.status)) ? String(body.status) : "todo", String(body.meetingTitle || "").trim(), String(body.notes || "").trim(), now, now).run();
        return apiJson({ id: result.meta.last_row_id }, 201);
      }
      if (request.method === "PATCH" && Number.isInteger(id) && id > 0) {
        const body = await request.json() as Record<string, unknown>;
        const current = await env.DB.prepare(`SELECT * FROM action_items WHERE id = ?`).bind(id).first<Record<string, unknown>>();
        if (!current) return apiJson({ error: "找不到行動事項" }, 404);
        const title = String(body.title ?? current.title).trim();
        if (!title) return apiJson({ error: "請填寫行動事項" }, 400);
        const status = String(body.status ?? current.status);
        await env.DB.prepare(`UPDATE action_items SET title=?, owner=?, due_date=?, status=?, meeting_title=?, notes=?, updated_at=? WHERE id=?`).bind(title, String(body.owner ?? current.owner), String(body.dueDate ?? current.due_date), ["todo","doing","done"].includes(status) ? status : current.status, String(body.meetingTitle ?? current.meeting_title), String(body.notes ?? current.notes), new Date().toISOString(), id).run();
        return apiJson({ ok: true });
      }
      if (request.method === "DELETE" && Number.isInteger(id) && id > 0) {
        await env.DB.prepare(`DELETE FROM action_items WHERE id = ?`).bind(id).run();
        return apiJson({ ok: true });
      }
      return apiJson({ error: "不支援的操作" }, 405);
    }

    if (url.pathname === "/api/local/zoom-config" && request.method === "POST") {
      if (!["localhost","127.0.0.1"].includes(url.hostname)) return apiJson({ error: "此設定僅限本機使用" }, 403);
      const body = await request.json() as Record<string, unknown>;
      const accountId = String(body.accountId || "").trim();
      const clientId = String(body.clientId || "").trim();
      const clientSecret = String(body.clientSecret || "").trim();
      if (!accountId || !clientId || !clientSecret) return apiJson({ error: "三項 Zoom 憑證都必須填寫" }, 400);
      try {
        const basic = btoa(`${clientId}:${clientSecret}`);
        const test = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`, { method:"POST", headers:{ authorization:`Basic ${basic}` } });
        const result = await test.json() as Record<string, unknown>;
        if (!test.ok || !result.access_token) return apiJson({ error: "Zoom 驗證失敗", detail: String(result.reason || result.error || `HTTP ${test.status}`) }, 400);
        localZoomCredentials = { accountId, clientId, clientSecret };
        return apiJson({ ok:true, message:"Zoom 本機憑證已驗證" });
      } catch (error) {
        return apiJson({ error:"無法連接 Zoom", detail:error instanceof Error?error.message:"連線失敗" }, 502);
      }
    }

    if (url.pathname === "/api/zoom/summaries" && request.method === "GET") {
      const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
      const zoomAccountId = env.ZOOM_ACCOUNT_ID || localZoomCredentials?.accountId;
      const zoomClientId = env.ZOOM_CLIENT_ID || localZoomCredentials?.clientId;
      const zoomClientSecret = env.ZOOM_CLIENT_SECRET || localZoomCredentials?.clientSecret;
      if (!zoomAccountId || !zoomClientId || !zoomClientSecret) {
        return json({ error: "Zoom 尚未設定", detail: "網站管理員尚未完成 Zoom 憑證設定。" }, 503);
      }
      try {
        const basic = btoa(`${zoomClientId}:${zoomClientSecret}`);
        const tokenResponse = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(zoomAccountId)}`, {
          method: "POST",
          headers: { authorization: `Basic ${basic}` },
        });
        const tokenBody = await tokenResponse.json() as { access_token?: string; reason?: string; error?: string };
        if (!tokenResponse.ok || !tokenBody.access_token) {
          return json({ error: "Zoom 授權失敗", detail: tokenBody.reason || tokenBody.error || `HTTP ${tokenResponse.status}` }, 502);
        }
        const listResponse = await fetch("https://api.zoom.us/v2/meetings/meeting_summaries?page_size=30", {
          headers: { authorization: `Bearer ${tokenBody.access_token}` },
        });
        const listBody = await listResponse.json() as Record<string, unknown>;
        if (!listResponse.ok) {
          const detail = String(listBody.message || listBody.reason || `HTTP ${listResponse.status}`);
          return json({ error: "無法讀取 Zoom 摘要", detail }, 502);
        }
        const rows = (Array.isArray(listBody.summaries) ? listBody.summaries : []) as Record<string, unknown>[];
        const summaries = await Promise.all(rows.slice(0, 20).map(async row => {
          const meetingUuid = String(row.meeting_uuid || row.meeting_id || "");
          const encodedId = meetingUuid.startsWith("/") || meetingUuid.includes("//")
            ? encodeURIComponent(encodeURIComponent(meetingUuid))
            : encodeURIComponent(meetingUuid);
          let detail: Record<string, unknown> = {};
          if (encodedId) {
            const detailResponse = await fetch(`https://api.zoom.us/v2/meetings/${encodedId}/meeting_summary`, {
              headers: { authorization: `Bearer ${tokenBody.access_token}` },
            });
            if (detailResponse.ok) detail = await detailResponse.json() as Record<string, unknown>;
          }
          const edited = detail.edited_summary && typeof detail.edited_summary === "object" ? detail.edited_summary as Record<string, unknown> : {};
          const detailSections = Array.isArray(detail.summary_details)
            ? (detail.summary_details as Record<string, unknown>[]).map(section => `${String(section.label || "")}\n${String(section.summary || "")}`).join("\n\n")
            : "";
          const nextStepsSource = edited.next_steps || detail.next_steps;
          return {
            meetingId: String(row.meeting_id || detail.meeting_id || ""),
            meetingUuid,
            topic: String(row.meeting_topic || detail.meeting_topic || "未命名會議"),
            startTime: String(row.meeting_start_time || detail.meeting_start_time || ""),
            summary: String(detail.summary_content || edited.summary_overview || detail.summary_overview || detailSections || "摘要內容尚在處理中"),
            nextSteps: Array.isArray(nextStepsSource) ? nextStepsSource.map(String) : typeof nextStepsSource === "string" ? nextStepsSource.split(/\n+/).filter(Boolean) : [],
            hostEmail: String(row.meeting_host_email || detail.meeting_host_email || ""),
          };
        }));
        return json({ summaries });
      } catch (error) {
        return json({ error: "Zoom 連線發生錯誤", detail: error instanceof Error ? error.message : "未知錯誤" }, 502);
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
