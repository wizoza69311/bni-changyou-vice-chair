"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";

type Member = { name: string; role: string };
type Group = { id: number; name?: string; members: Member[] };

const roleOrder = ["十長", "委員", "導師", "小組長", "組員"];

export default function GroupDirectoryPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/group-directory", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("名單讀取失敗");
        return response.json();
      })
      .then(data => {
        setGroups(Array.isArray(data.groups) ? data.groups : []);
        setUpdatedAt(data.updatedAt || null);
      })
      .catch(() => setError("目前無法讀取分組名單，請稍後重新整理。"))
      .finally(() => setLoading(false));
  }, []);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => Number(a.id) - Number(b.id)),
    [groups],
  );
  const total = sortedGroups.reduce((sum, group) => sum + (group.members?.length || 0), 0);
  const updatedLabel = updatedAt
    ? new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Taipei" }).format(new Date(updatedAt))
    : "尚無更新時間";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>BNI 長佑分會</p>
          <h1>小組分組名單</h1>
          <p className={styles.meta}>唯讀檢視 · 最後更新 {updatedLabel}</p>
        </div>
        <div className={styles.summary} aria-label="名單摘要">
          <span><b>{sortedGroups.length}</b> 組</span>
          <span><b>{total}</b> 人</span>
        </div>
      </header>

      {loading && <section className={styles.notice}>正在載入最新分組名單…</section>}
      {error && <section className={`${styles.notice} ${styles.error}`}>{error}</section>}
      {!loading && !error && sortedGroups.length === 0 && <section className={styles.notice}>目前尚無分組資料。</section>}

      <section className={styles.grid} aria-label="十二組分組名單">
        {sortedGroups.map(group => (
          <article className={styles.card} key={group.id}>
            <div className={styles.cardHead}>
              <h2>第 {group.id} 組</h2>
              <span>{group.members?.length || 0} 人</span>
            </div>
            <div className={styles.roles}>
              {roleOrder.map(role => {
                const members = (group.members || []).filter(member => member.role === role);
                if (!members.length) return null;
                return (
                  <div className={styles.roleRow} key={role}>
                    <h3>{role}</h3>
                    <div className={styles.names}>
                      {members.map(member => <span key={`${role}-${member.name}`}>{member.name}</span>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </section>

      <footer className={styles.footer}>名單由副主席管理系統同步提供，本頁僅供檢視。</footer>
    </main>
  );
}
