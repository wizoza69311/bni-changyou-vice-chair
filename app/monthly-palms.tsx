"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./weekly-palms.css";

type Member = { member:string; inside:number; outside:number; visitors:number; transactionValue:number };
type MonthlyData = { months:string[]; month:string; dates:string[]; updatedAt:string|null; totals:{inside:number;outside:number;visitors:number;transactionValue:number}; members:Member[] };
type SortKey = "visitors"|"referrals"|"value";
const money=(value:number)=>`NT$ ${value.toLocaleString("zh-TW")}`;
const leader=(rows:Member[],score:(row:Member)=>number,format:(value:number)=>string)=>{
  const highest=Math.max(0,...rows.map(score));
  return highest?`${rows.filter(row=>score(row)===highest).map(row=>row.member).join("、")} · ${format(highest)}`:"本月無紀錄";
};

export default function MonthlyPalms({onWeekly}:{onWeekly:()=>void}){
  const [data,setData]=useState<MonthlyData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [sortBy,setSortBy]=useState<SortKey>("referrals");
  const [query,setQuery]=useState("");
  const [copyStatus,setCopyStatus]=useState("");
  const load=useCallback(async(month="")=>{
    setLoading(true);
    setCopyStatus("");
    try{
      const response=await fetch(`/api/monthly-palms${month?`?month=${encodeURIComponent(month)}`:""}`,{cache:"no-store"});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||"無法讀取每月 PALMS");
      setData(result as MonthlyData);
      setError("");
    }catch(caught){setError(caught instanceof Error?caught.message:"無法讀取每月 PALMS")}finally{setLoading(false)}
  },[]);
  useEffect(()=>{void Promise.resolve().then(()=>load())},[load]);
  const normalizedQuery=query.replace(/\s+/g,"").toLowerCase();
  const visibleMembers=useMemo(()=>{
    if(!data)return [];
    const score=(row:Member)=>sortBy==="visitors"?row.visitors:sortBy==="value"?row.transactionValue:row.inside+row.outside;
    return data.members.filter(row=>!normalizedQuery||row.member.replace(/\s+/g,"").toLowerCase().includes(normalizedQuery)).sort((a,b)=>score(b)-score(a)||a.member.localeCompare(b.member,"zh-Hant"));
  },[data,normalizedQuery,sortBy]);
  async function copyLeaders(){
    if(!data?.dates.length)return;
    const month=`${data.month.slice(0,4)} 年 ${Number(data.month.slice(5))} 月`;
    const text=[month,
      `來賓第一名：${leader(data.members,row=>row.visitors,value=>`${value} 位`)}`,
      `引薦單第一名：${leader(data.members,row=>row.inside+row.outside,value=>`${value} 張`)}`,
      `引薦金額第一名：${leader(data.members,row=>row.transactionValue,money)}`
    ].join("\n");
    try{await navigator.clipboard.writeText(text);setCopyStatus("第一名文字已複製")}
    catch{setCopyStatus("複製失敗，請檢查瀏覽器的剪貼簿權限")}
  }
  return <section className="weekly-palms-page">
    <div className="renewal-summary"><div><span>MONTHLY</span><h3>每月會務數據</h3><p>按當月已同步的例會週報加總；交易金額包含所有分會</p></div><strong>{data?.dates.length||0}<small>已保存週次</small></strong></div>
    <div className="weekly-palms-period" role="group" aria-label="統計期間"><button type="button" onClick={onWeekly}>每週</button><button type="button" className="active" aria-pressed="true">每月</button></div>
    <div className="weekly-palms-toolbar panel"><label>統計月份<select value={data?.month||""} onChange={event=>{setQuery("");void load(event.target.value)}} disabled={!data?.months.length||loading}>{(data?.months||[]).map(month=><option key={month} value={month}>{month.slice(0,4)} 年 {Number(month.slice(5))} 月</option>)}</select></label><label>搜尋會員<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="輸入姓名"/></label><button type="button" onClick={()=>void load(data?.month||"")} disabled={loading}>{loading?"讀取中…":"重新整理數據"}</button></div>
    {error&&<p className="weekly-palms-error" role="alert">{error}</p>}
    {!loading&&!data?.dates.length&&<section className="panel weekly-palms-empty"><h4>這個月份尚未有會務數據</h4><p>請先在系統後臺同步分會 PALMS 週報。</p></section>}
    {data&&data.dates.length>0&&<>
      <div className="weekly-palms-source"><span>{data.month.slice(0,4)} 年 {Number(data.month.slice(5))} 月 · 已同步 {data.dates.length} 週：{data.dates.map(date=>`${Number(date.slice(5,7))}/${Number(date.slice(8))}`).join("、")}</span><span>上次擷取 {data.updatedAt?new Date(data.updatedAt).toLocaleString("zh-TW"):"—"}</span></div>
      <div className="weekly-palms-monthly-actions"><button type="button" onClick={()=>void copyLeaders()} disabled={loading}>一鍵複製第一名</button><span role="status" aria-live="polite">{copyStatus}</span></div>
      <div className="weekly-palms-cards">
        <article className="panel"><small>來賓總數</small><b>{data.totals.visitors.toLocaleString("zh-TW")}<em>位</em></b><span>依當月已同步例會加總</span><p>第一名：{leader(data.members,row=>row.visitors,value=>`${value} 位`)}</p></article>
        <article className="panel"><small>提供引薦單（內＋外）</small><b>{(data.totals.inside+data.totals.outside).toLocaleString("zh-TW")}<em>張</em></b><span>內部 {data.totals.inside} · 外部 {data.totals.outside}</span><p>第一名：{leader(data.members,row=>row.inside+row.outside,value=>`${value} 張`)}</p></article>
        <article className="panel"><small>PALMS 交易價值（全部分會）</small><b>{money(data.totals.transactionValue)}</b><span>包含其他分會，不使用本會審計篩選</span><p>第一名：{leader(data.members,row=>row.transactionValue,money)}</p></article>
      </div>
      <section className="panel weekly-palms-table-panel"><header><div><h4>會員每月排行</h4><small>共 {data.members.length} 位出現在當月週報的會員；同名紀錄跨週加總</small></div><div className="weekly-palms-pills">{(["referrals","visitors","value"] as SortKey[]).map(key=><button type="button" className={sortBy===key?"active":""} key={key} onClick={()=>setSortBy(key)}>{({referrals:"引薦單",visitors:"來賓",value:"交易價值"})[key]}</button>)}</div></header><div className="weekly-palms-table-scroll"><table><thead><tr><th>會員</th><th>來賓</th><th>內部引薦</th><th>外部引薦</th><th>引薦單合計</th><th>全部分會交易價值</th></tr></thead><tbody>{visibleMembers.map(row=><tr key={row.member}><th>{row.member}</th><td>{row.visitors}</td><td>{row.inside}</td><td>{row.outside}</td><td>{row.inside+row.outside}</td><td>{money(row.transactionValue)}</td></tr>)}</tbody></table></div>{visibleMembers.length===0&&<p className="weekly-palms-empty-inline">找不到符合的會員</p>}</section>
    </>}
  </section>;
}
