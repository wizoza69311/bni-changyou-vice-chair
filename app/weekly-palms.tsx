"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./weekly-palms.css";

type MemberRow = { member:string; inside:number; outside:number; visitors:number;oneToOne?:number; transactionValue:number };
type Transaction = { id:string; member:string; amount:number };
type Audit = { status:"verified"|"mismatch"|"unavailable"; total:number|null; ownTotal:number|null; otherChapterTotal:number|null; transactionCount:number; ownTransactions:Transaction[] };
type Report = { meetingDate:string; summary:{ totals:{inside:number;outside:number;visitors:number;oneToOne?:number;transactionValue:number};members:MemberRow[];source:string };audit:Audit;updatedAt:string };
type Review = { key:string;meetingDate:string;transactionId:string;checked:number;note:string;updatedAt:string };
type SortKey = "referrals"|"visitors"|"oneToOne"|"value";
const money=(value:number)=>`NT$ ${value.toLocaleString("zh-TW")}`;
const top=(rows:MemberRow[],score:(row:MemberRow)=>number)=>{
  const highest=Math.max(0,...rows.map(score));
  return highest?`${rows.filter(row=>score(row)===highest).map(row=>row.member).join("、")} · ${highest.toLocaleString("zh-TW")}`:"本週無紀錄";
};

export default function WeeklyPalms(){
  const [reports,setReports]=useState<Report[]>([]);
  const [reviews,setReviews]=useState<Review[]>([]);
  const [selectedDate,setSelectedDate]=useState("");
  const [sortBy,setSortBy]=useState<SortKey>("referrals");
  const [query,setQuery]=useState("");
  const [showAllTransactions,setShowAllTransactions]=useState(false);
  const [draftNotes,setDraftNotes]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/weekly-palms",{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||"無法讀取每週 PALMS");
      setReports(Array.isArray(data.reports)?data.reports:[]);
      setReviews(Array.isArray(data.reviews)?data.reviews:[]);
      setSelectedDate(current=>current&&data.reports?.some((row:Report)=>row.meetingDate===current)?current:data.reports?.[0]?.meetingDate||"");
      setError("");
    }catch(caught){setError(caught instanceof Error?caught.message:"無法讀取每週 PALMS")}finally{setLoading(false)}
  },[]);
  useEffect(()=>{void Promise.resolve().then(refresh)},[refresh]);
  const report=reports.find(row=>row.meetingDate===selectedDate);
  const ownValueLeaders=useMemo(()=>{
    if(!report)return "—";
    const totals=new Map<string,number>();
    report.audit.ownTransactions.forEach(row=>totals.set(row.member,(totals.get(row.member)||0)+row.amount));
    const highest=Math.max(0,...totals.values());
    return highest?`${[...totals].filter(([,value])=>value===highest).map(([name])=>name).join("、")} · ${money(highest)}`:"本週無紀錄";
  },[report]);
  const reviewMap=useMemo(()=>new Map(reviews.map(row=>[row.key,row])),[reviews]);
  const normalizedQuery=query.replace(/\s+/g,"").toLowerCase();
  const visibleMembers=useMemo(()=>{
    if(!report)return [];
    const score=(row:MemberRow)=>sortBy==="referrals"?row.inside+row.outside:sortBy==="visitors"?row.visitors:sortBy==="oneToOne"?(row.oneToOne??-1):row.transactionValue;
    return report.summary.members.filter(row=>!normalizedQuery||row.member.replace(/\s+/g,"").toLowerCase().includes(normalizedQuery)).sort((a,b)=>score(b)-score(a)||a.member.localeCompare(b.member,"zh-Hant"));
  },[report,sortBy,normalizedQuery]);
  const visibleTransactions=useMemo(()=>{
    if(!report)return [];
    const rows=report.audit.ownTransactions.filter(row=>!normalizedQuery||row.member.replace(/\s+/g,"").toLowerCase().includes(normalizedQuery));
    return showAllTransactions||normalizedQuery?rows:rows.slice(0,12);
  },[report,normalizedQuery,showAllTransactions]);
  async function saveReview(transaction:Transaction,checked:boolean,note:string){
    if(!report)return;
    const key=`${report.meetingDate}|${transaction.id}`;
    setSaving(key);
    try{
      const response=await fetch("/api/weekly-palms/reviews",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({meetingDate:report.meetingDate,transactionId:transaction.id,checked,note})});
      const data=await response.json();
      if(!response.ok)throw Error(data.error||"查核紀錄儲存失敗");
      setReviews(current=>[...current.filter(row=>row.key!==key),data.review]);
      setError("");
    }catch(caught){setError(caught instanceof Error?caught.message:"查核紀錄儲存失敗")}finally{setSaving("")}
  }
  const auditState=report?.audit.status;
  return <section className="weekly-palms-page">
    <div className="renewal-summary"><div><span>WEEKLY</span><h3>每週會務數據</h3><p>依已完成的分會 PALMS 例會週報統計；審計金額另依「沒有其他分會」篩選</p></div><strong>{reports.length}<small>已保存週次</small></strong></div>
    <div className="weekly-palms-toolbar panel"><label>例會日期<select value={selectedDate} onChange={event=>{setSelectedDate(event.target.value);setShowAllTransactions(false);setQuery("")}} disabled={!reports.length}>{reports.map(row=><option key={row.meetingDate} value={row.meetingDate}>{row.meetingDate}</option>)}</select></label><label>搜尋會員<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="輸入姓名"/></label><button type="button" onClick={()=>void refresh()} disabled={loading}>{loading?"讀取中…":"重新整理數據"}</button></div>
    {error&&<p className="weekly-palms-error" role="alert">{error}</p>}
    {!loading&&!report&&<section className="panel weekly-palms-empty"><h4>尚未有每週數據</h4><p>在「系統後臺」按「一鍵更新全部資料」後，系統會讀取最近已完成的週四 PALMS 與審計報告，這裡才會顯示排行。</p></section>}
    {report&&<>
      <div className="weekly-palms-source"><span>來源：{report.summary.source} · {report.meetingDate}</span><span>上次擷取 {new Date(report.updatedAt).toLocaleString("zh-TW")}</span></div>
      <div className="weekly-palms-cards">
        <article className="panel"><small>提供引薦單（內＋外）</small><b>{(report.summary.totals.inside+report.summary.totals.outside).toLocaleString("zh-TW")}<em>張</em></b><span>內部 {report.summary.totals.inside} · 外部 {report.summary.totals.outside}</span><p>第一名：{top(report.summary.members,row=>row.inside+row.outside)}</p></article>
        <article className="panel"><small>來賓</small><b>{report.summary.totals.visitors.toLocaleString("zh-TW")}<em>位</em></b><span>以本次分會 PALMS「來賓」欄為準</span><p>第一名：{top(report.summary.members,row=>row.visitors)}</p></article>
        <article className="panel"><small>121（一對一）</small><b>{report.summary.totals.oneToOne==null?"待同步":report.summary.totals.oneToOne.toLocaleString("zh-TW")}<em>次</em></b><span>依本週 PALMS 一對一欄位加總</span><p>{report.summary.totals.oneToOne==null?"此週尚未取得 121 資料":`第一名：${top(report.summary.members,row=>row.oneToOne??0)}`}</p></article>
        <article className="panel"><small>PALMS 交易價值（全部分會）</small><b>{money(report.summary.totals.transactionValue)}</b><span>包含與其他分會往來</span><p>第一名：{top(report.summary.members,row=>row.transactionValue)}</p></article>
        <article className="panel weekly-palms-audit-card"><small>本會交易價值（審計篩選）</small><b>{report.audit.ownTotal===null?"待查核":money(report.audit.ownTotal)}</b><span>{auditState==="verified"?"審計明細總額與 PALMS 一致":auditState==="mismatch"?"明細總額與 PALMS 不一致，請核對":"審計明細尚未讀取成功"} · 排除其他分會 {report.audit.otherChapterTotal===null?"—":money(report.audit.otherChapterTotal)}</span><p>第一名：{ownValueLeaders}</p></article>
      </div>
      <section className="panel weekly-palms-table-panel"><header><div><h4>會員本週排行</h4><small>引薦單依「提供內部＋提供外部」計，不混用收到的引薦</small></div><div className="weekly-palms-pills">{(["referrals","visitors","oneToOne","value"] as SortKey[]).map((key)=><button type="button" className={sortBy===key?"active":""} key={key} onClick={()=>setSortBy(key)}>{({referrals:"引薦單",visitors:"來賓",oneToOne:"121",value:"交易價值"})[key]}</button>)}</div></header><div className="weekly-palms-table-scroll"><table><thead><tr><th>會員</th><th>內部</th><th>外部</th><th>引薦單合計</th><th>來賓</th><th>121</th><th>PALMS 交易價值</th></tr></thead><tbody>{visibleMembers.map(row=><tr key={row.member}><th>{row.member}</th><td>{row.inside}</td><td>{row.outside}</td><td>{row.inside+row.outside}</td><td>{row.visitors}</td><td>{row.oneToOne??"待同步"}</td><td>{money(row.transactionValue)}</td></tr>)}</tbody></table></div>{visibleMembers.length===0&&<p className="weekly-palms-empty-inline">找不到符合的會員</p>}</section>
      <section className="panel weekly-palms-audit"><header><div><h4>本會高額交易待核對</h4><small>只列審計報告「詳細資料」未標其他分會的交易；勾選代表已人工核對，並非自動判定有無引薦單</small></div><span className={`weekly-palms-badge ${auditState||"unavailable"}`}>{auditState==="verified"?"審計總額一致":auditState==="mismatch"?"金額待核對":"審計未取得"}</span></header>{auditState==="unavailable"?<p className="weekly-palms-empty-inline">本次只取得 PALMS 概要，審計明細尚未同步；不會用概要金額冒充本會交易。</p>:<><div className="weekly-palms-audit-list">{visibleTransactions.map(transaction=>{const key=`${report.meetingDate}|${transaction.id}`,review=reviewMap.get(key),note=draftNotes[key]??review?.note??"";return <article key={key}><label className="weekly-palms-check"><input type="checkbox" checked={Boolean(review?.checked)} disabled={saving===key} onChange={event=>void saveReview(transaction,event.target.checked,note)}/><span>{review?.checked?"已核對":"待核對"}</span></label><div><b>{transaction.member}</b><strong>{money(transaction.amount)}</strong></div><input aria-label={`${transaction.member} ${transaction.amount} 查核備註`} value={note} placeholder="查核備註（可留空）" onChange={event=>setDraftNotes(current=>({...current,[key]:event.target.value}))} onBlur={()=>{if(note!==(review?.note||""))void saveReview(transaction,Boolean(review?.checked),note)}}/></article>})}</div>{!normalizedQuery&&!showAllTransactions&&report.audit.ownTransactions.length>12&&<button className="weekly-palms-show-all" type="button" onClick={()=>setShowAllTransactions(true)}>查看全部 {report.audit.ownTransactions.length} 筆本會交易</button>}</>}</section>
    </>}
  </section>;
}
