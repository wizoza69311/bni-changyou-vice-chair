"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./renewals.css";
import "./committee.css";
import "./readability.css";
import "./operating-mode.css";
import "./history.css";
import "./meeting-renewals.css";
import "./visitors.css";
import "./stopped-renewals.css";
import "./visitor-add.css";
import "./visitor-details.css";
import "./visitor-email.css";
import "./visitor-workflow.css";
import "./visitor-layout-fix.css";
import "./visitor-date-groups.css";
import "./renewal-horizontal.css";
import "./visitor-manage.css";
import "./visitor-pipeline.css";
import "./sync-check.css";
import "./duty-schedule.css";
import "./visitor-relay.css";
import "./visitor-group-field.css";
import "./visitor-delete.css";
import "./visitor-field-spacing.css";
import "./quality.css";
import "./palms-health.css";
import "./admin-login.css";
import "./quality-matrix.css";
import "./groups.css";
import "./groups-api-link.css";
import "./groups-mobile.css";
import "./meeting-quality.css";
import "./quality-matrix-layout-fix.css";
import "./member-master.css";
import "./connect-sync.css";

type Status = "待訪談" | "訪談中" | "待表決" | "待繳費" | "已完成" | "預計離會" | "已離會";
type Renewal = {
  id: number;
  name: string;
  expiryDate: string;
  daysLeft: number;
  status: Status;
  owner: string;
  note: string;
  updatedAt?:string;
};
type Task = {
  id: number;
  title: string;
  owner: string;
  dueDate: string;
  status: "todo" | "doing" | "done";
  updatedAt?:string;
};
type Visitor = {
  id: number;
  name: string;
  inviter: string;
  profession: string;
  group?: string;
  email?: string;
  company?: string;
  referralTarget?: string;
  attendance: "預計出席" | "已出席" | "未出席";
  interest: "待確認" | "有意願" | "持續追蹤" | "不追蹤";
  owner: string;
  note: string;
  stage?: VisitorStage;
  visitDate?: string;
  receptionOwner?: string;
  followUpDate?: string;
  interviewStatus?: VisitorInterviewStatus;
  interviewDate?: string;
  interviewResult?: string;
  logs?: { date: string; owner: string; text: string }[];
  agendaExcludedDates?: string[];
  updatedAt?:string;
};
type VisitorStage = "待確認" | "有意願" | "已簽單" | "訪談中" | "待投票" | "待繳費" | "已入會" | "持續追蹤" | "不追蹤";
type VisitorInterviewStatus = "未聯絡" | "已預約" | "已訪談" | "保留追蹤" | "考慮加入" | "申請中" | "不追蹤" | "已入會";
type VisitorTrackingFilter = "全部" | "未指派" | "待聯絡" | "已預約" | "考慮加入" | "申請中";
type AdminDutySchedule = { date:string; policy:string; whiteboard1:string; whiteboard2:string; referralReport:string; committeeRecord:string; host:string };
type QualityCase = {id:number;member:string;issue:"缺席"|"遲到"|"替代人"|"A信"|"B信"|"關懷";occurredDate:string;status:"待處理"|"聯絡中"|"已結案";owner:string;note:string;updatedAt?:string};
type GroupRole="十長"|"委員"|"導師"|"小組長"|"組員";
type GroupMember={name:string;role:GroupRole};
type MemberGroup={id:number;name:string;members:GroupMember[]};
type CareAssignment={member:string;groupId:number;committee:string;leader:string};
type MemberKpi={member:string;trainingPoints:number|null;visitorCount:number|null;oneToOneWeeklyAverage:number|null;referralWeeklyAverage:number|null;referralTotal?:number|null;dreamReferralAmount:number|null;updatedAt?:string};
const qualityIssueOptions:{value:QualityCase["issue"];label:string}[]=[{value:"缺席",label:"缺席"},{value:"遲到",label:"遲到"},{value:"替代人",label:"替代人"},{value:"A信",label:"需要 A 信"},{value:"B信",label:"需要 B 信"},{value:"關懷",label:"需要組長關懷"}];
const qualityIssueLabel=(issue:QualityCase["issue"])=>qualityIssueOptions.find(option=>option.value===issue)?.label||issue;
const letterText=(issue:"A信"|"B信",member:string)=>issue==="A信"?`親愛的 ${member} 會員，

您是我們長佑分會會議非常重要的組成成員，
因而我們期待每週都能看到您出席，
全體會員每週都到會，這對我們分會是重要的，
而要是您未到會，我們都會很想念您。

請您參閱一下 BNI 總政策第 5 條，
我們還想藉此機會提醒您有關 BNI 代理人出席的安排，
如果您委託一名人士（非本會會員）代理您出席會議，則將不被視為缺席。

對於您的參與，我們深表謝意，
期待下週能見到您。

會員委員會謹啟。`:`親愛的 ${member}，

我們全體會員都對自己和其他會員做出承諾，
要創造一個積極的機構，為全體會員帶來更大業務上的成效。
為了實現這一目標，大家必須遵守保證出席會議的政策。

經驗表明，一個分會能否取得成功，與它的會議出席率直接相關。

在檢查本分會的出席會議記錄後，
您在過去的六個月內已經三次沒有到會，
BNI 的政策規定，一名會員只允許三次不到會。

如果您真的無法避免缺席的話，
我們鼓勵您安排一名人士前來代替您出席會議，首先這不算缺席；
其次這樣做使分會工作保持連續性，
我們需要到會才能傳遞業務引薦；最後，其他會員也會感謝您的關心。

在考慮由誰來替代您出席會議時，別忘記您的客戶：
看看誰會在我們分會裡為您說好話？

會議的出席率對我們分會至關重要，
我們還想提醒您，如果未能遵守 BNI 的政策，
將會導致您在本會所屬行業別的代表權被列為空缺，
務必請儘量到會，或安排他人代您出席。

感謝您的熱情參與。

會員委員會謹啟。`;
type AttendanceCode="P"|"A"|"L"|"M"|"S";
type AttendanceRecord={member:string;date:string;code:AttendanceCode};
type AttendancePreview={records:AttendanceRecord[];added:number;changed:number;unchanged:number;missing:number;excluded:number;missingMembers:string[]};
type ConnectSyncStatus={lastSyncAt:string;attendance:{updatedAt:string|null;count:number;latestDate:string};members:{updatedAt:string|null;count:number};renewals:{updatedAt:string|null;count:number};kpis:{updatedAt:string|null;count:number};failedMembers:number};
type WeeklyArchive = {
  id: number;
  meetingDate: string;
  title: string;
  agenda: { title: string; items: string[] }[];
  checked: string[];
  notes: string;
  renewals: Renewal[];
  visitors: Visitor[];
  createdAt: string;
  updatedAt?: string;
};
type View =
  | "dashboard"
  | "members"
  | "agenda"
  | "renewals"
  | "visitors"
  | "tasks"
  | "groups"
  | "schedules"
  | "quality"
  | "history";

const reportDate = new Date("2026-08-24T00:00:00+08:00");
const monthlyMembers: [string, string[]][] = [
  ["2026-09-01", ["鍾承翰", "黃鈺淳"]],
  ["2026-10-01", ["王世品", "陳宜信", "雷文鳳", "張綺耘", "梁虔駖", "黃麗娟"]],
  [
    "2026-11-01",
    ["張博凱", "許國祥", "劉宸緯", "李恩誠", "林昱璋", "蔡瑋倫", "連育正"],
  ],
  ["2026-12-01", ["楊嘉慧", "陳姵文", "陳朝銘", "黃瑀珍", "林詠淇"]],
  [
    "2027-01-01",
    ["賴丰培", "林家蔚", "林思裴", "洪敏智", "林文裕", "彭澤偉", "黃麟翔"],
  ],
  ["2027-02-01", ["陳依凡", "林品彤", "熊庭逸"]],
  [
    "2027-03-01",
    [
      "廖筱蘭",
      "林佩佩",
      "余博軒",
      "馮威憲",
      "林定豪",
      "李曉玫",
      "郭玉琴",
      "劉美葳",
      "陳芷綺",
      "劉雍致",
    ],
  ],
  [
    "2027-04-01",
    ["鍾坤宏", "黃同慶", "呂孟翰", "謝宥騏", "吳書林", "周榆璇", "葉蕥霈"],
  ],
  [
    "2027-05-01",
    [
      "黃勇嘉",
      "李坊祥",
      "莊子樂",
      "丁慶儒",
      "吳旌緯",
      "周曜贊",
      "陳睿民",
      "潘祥鈞",
      "曾紹恩",
    ],
  ],
  [
    "2027-06-01",
    [
      "曹原彰",
      "蔡伊鎔",
      "侯冠瑋",
      "周子嵐",
      "王孟哲",
      "林宏一",
      "田慶堂",
      "陳春長",
      "陳沛慈",
    ],
  ],
  [
    "2027-07-01",
    [
      "盧冠臻",
      "戴劭哲",
      "蘇姮勻",
      "游姿菱 Yu Sleeping Beauty",
      "潘建勳",
      "黃建華",
      "曾惠君",
      "呂炘豪",
      "陳薏如",
    ],
  ],
  [
    "2027-08-01",
    [
      "廖愷伶",
      "江柏陞",
      "翁煜宸",
      "洪翊嘉",
      "黃莞芹",
      "楊和宥",
      "王懿德",
      "周順智",
    ],
  ],
  [
    "2027-09-01",
    ["葉奕廷", "張婉靖", "陳建安", "蔡昕宏", "康清智", "林駿維", "楊佳昇"],
  ],
  ["2027-10-01", ["林宗翰"]],
  ["2027-11-01", ["廖婕詠"]],
];
const seedRenewals: Renewal[] = monthlyMembers.flatMap(([expiryDate, names]) =>
  names.map((name, index) => {
    const daysLeft = Math.ceil(
      (new Date(`${expiryDate}T00:00:00+08:00`).getTime() -
        reportDate.getTime()) /
        86400000,
    );
    return {
      id: Number(expiryDate.replaceAll("-", "")) * 100 + index,
      name,
      expiryDate,
      daysLeft,
      status: daysLeft <= 14 ? "待繳費" : "待訪談",
      owner: daysLeft <= 30 ? "副主席" : "會員委員",
      note: daysLeft <= 90 ? "已進入續約追蹤期" : "依到期月份列管",
    } as Renewal;
  }),
);
const seedTasks: Task[] = [
  {
    id: 1,
    title: "確認 9/1 到期會員付款狀態",
    owner: "秘書財務",
    dueDate: "2026-08-27",
    status: "doing",
  },
  {
    id: 2,
    title: "安排 10 月到期會員終期訪談",
    owner: "副主席",
    dueDate: "2026-09-03",
    status: "todo",
  },
  {
    id: 3,
    title: "委員會確認續約審查分工",
    owner: "會員委員",
    dueDate: "2026-08-27",
    status: "todo",
  },
  {
    id: 4,
    title: "本週會後更新會議決議",
    owner: "副主席",
    dueDate: "2026-08-27",
    status: "todo",
  },
];
const seedVisitors: Visitor[] = [];
const statusOptions: Status[] = [
  "待訪談",
  "訪談中",
  "待表決",
  "待繳費",
  "已完成",
  "預計離會",
  "已離會",
];
const visitorStageOptions: VisitorStage[] = ["待確認","有意願","已簽單","訪談中","待投票","待繳費","已入會","持續追蹤","不追蹤"];
const visitorInterviewStatusOptions: VisitorInterviewStatus[] = ["未聯絡","已預約","已訪談","保留追蹤","考慮加入","申請中","不追蹤","已入會"];
const committeeMembers = [
  "余博軒",
  "連育正",
  "黃同慶",
  "林佩佩",
  "楊嘉慧",
  "游姿菱",
  "康清智",
  "田慶堂",
  "張博凱",
  "王世品",
  "黃麟翔",
  "李坊祥",
];
const dutyCommitteeMembers=committeeMembers.slice(0,12);
const dutyFields:{key:Exclude<keyof AdminDutySchedule,"date">;label:string}[]=[
  {key:"policy",label:"總政策宣讀"},{key:"whiteboard1",label:"白板手 1"},{key:"whiteboard2",label:"白板手 2"},{key:"referralReport",label:"優質引薦／無引薦回報"},{key:"committeeRecord",label:"執事會紀錄"},{key:"host",label:"主持委員會會議"},
];
const seedDutySchedules:AdminDutySchedule[]=[
  {date:"2026-09-17",policy:"余博軒",whiteboard1:"連育正",whiteboard2:"黃同慶",referralReport:"林佩佩",committeeRecord:"楊嘉慧",host:"游姿菱"},
  {date:"2026-09-24",policy:"康清智",whiteboard1:"田慶堂",whiteboard2:"張博凱",referralReport:"王世品",committeeRecord:"黃麟翔",host:"李坊祥"},
  {date:"2026-10-01",policy:"連育正",whiteboard1:"黃同慶",whiteboard2:"林佩佩",referralReport:"楊嘉慧",committeeRecord:"游姿菱",host:"康清智"},
  {date:"2026-10-08",policy:"田慶堂",whiteboard1:"張博凱",whiteboard2:"王世品",referralReport:"黃麟翔",committeeRecord:"李坊祥",host:"余博軒"},
  {date:"2026-10-15",policy:"黃同慶",whiteboard1:"林佩佩",whiteboard2:"楊嘉慧",referralReport:"游姿菱",committeeRecord:"康清智",host:"田慶堂"},
  {date:"2026-10-22",policy:"張博凱",whiteboard1:"王世品",whiteboard2:"黃麟翔",referralReport:"李坊祥",committeeRecord:"余博軒",host:"連育正"},
  {date:"2026-10-29",policy:"林佩佩",whiteboard1:"楊嘉慧",whiteboard2:"游姿菱",referralReport:"康清智",committeeRecord:"田慶堂",host:"張博凱"},
];
// Synced from BNI Connect's current chapter roster report on 2026-08-30.
const seedActiveMemberNames=new Set(["王世品","賴丰培","蔡伊鎔","林佩佩","楊佳昇","陳依凡","侯冠瑋","盧冠臻","戴劭哲","黃勇嘉","張博凱","余博軒","曹原彰","黃同慶","楊和宥","林品彤","楊嘉慧","許國祥","李坊祥","鍾坤宏","葉奕廷","蘇姮勻","陳姵文","游姿菱","馮威憲","張婉靖","廖婕詠","周子嵐","莊子樂","王孟哲","呂孟翰","林宏一","林宗翰","林定豪","陳宜信","謝宥騏","林家蔚","劉宸緯","熊庭逸","潘建勳","陳建安","黃建華","林思裴","李恩誠","曾惠君","廖愷伶","丁慶儒","田慶堂","王懿德","鍾承翰","洪敏智","林文裕","雷文鳳","吳旌緯","蔡昕宏","陳春長","林昱璋","李曉玫","周曜贊","吳書林","陳朝銘","江柏陞","周榆璇","陳沛慈","康清智","彭澤偉","呂炘豪","翁煜宸","郭玉琴","黃瑀珍","蔡瑋倫","陳睿民","潘祥鈞","廖筱蘭","曾紹恩","張綺耘","劉美葳","洪翊嘉","連育正","陳芷綺","黃莞芹","葉蕥霈","陳薏如","梁虔駖","林詠淇","黃鈺淳","劉雍致","周順智","林駿維","黃麗娟","黃麟翔"]);
const normalizeMemberName=(name:string)=>{
  const compact=name.replace(/\s+/g,"");
  return compact.startsWith("游姿菱")?"游姿菱":compact;
};
const seedMemberGroups:MemberGroup[]=Array.from({length:12},(_,index)=>({id:index+1,name:`第 ${index+1} 組`,members:[]}));
const nav: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "系統首頁", icon: "⌂" },
  { id: "members", label: "會員主檔", icon: "◉" },
  { id: "agenda", label: "本週議程", icon: "≡" },
  { id: "renewals", label: "續約追蹤", icon: "◷" },
  { id: "visitors", label: "來賓追蹤", icon: "◎" },
  { id: "tasks", label: "委員待辦", icon: "✓" },
  { id: "groups", label: "分組管理", icon: "⊞" },
  { id: "schedules", label: "行政排班", icon: "▤" },
  { id: "quality", label: "出缺席管理", icon: "◇" },
  { id: "history", label: "會議紀錄儲存", icon: "▣" },
];
function fmt(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
  });
}
function urgency(days: number) {
  return days <= 14 ? "critical" : days <= 60 ? "warning" : "normal";
}
function trackingMonthKeys(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const year = Number(value.year),
    month = Number(value.month),
    day = Number(value.day);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = day >= daysInMonth - 7 ? 1 : 0;
  return Array.from({ length: 3 }, (_, index) => {
    const date = new Date(year, month - 1 + startOffset + index, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}
function taipeiDateKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
function syncDateTime(value:string|null|undefined){if(!value)return "尚未更新";return new Date(value).toLocaleString("zh-TW",{timeZone:"Asia/Taipei",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"})}
function upcomingThursdayKey(){const base=new Date(`${taipeiDateKey()}T12:00:00+08:00`);const offset=(4-base.getDay()+7)%7;base.setDate(base.getDate()+offset);return taipeiDateKey(base)}
const trainingScore=(value:number)=>value>=6?15:value>=4?10:value>=2?5:0;
const visitorScore=(value:number,weeks:number)=>value>=weeks/2?15:value>=weeks/4?10:0;
const oneToOneScore=(value:number)=>value>=2?15:value>=1?10:value>=0.5?5:0;
const referralScore=(value:number)=>value>=1.5?20:value>=1.2?15:value>=1?10:value>=0.75?5:0;
const dreamReferralScore=(value:number)=>value>=2000000?15:value>800000?10:value>400000?5:0;

export default function Home() {
  const [view, setView] = useState<View>("dashboard"),
    [renewals, setRenewals] = useState(seedRenewals),
    [tasks, setTasks] = useState(seedTasks),
    [visitors, setVisitors] = useState(seedVisitors),
    [qualityCases,setQualityCases]=useState<QualityCase[]>([]),
    [memberGroups,setMemberGroups]=useState<MemberGroup[]>(seedMemberGroups),
    [dutySchedules,setDutySchedules]=useState<AdminDutySchedule[]>(seedDutySchedules),
    [careAssignments,setCareAssignments]=useState<CareAssignment[]>([]),
    [memberKpis,setMemberKpis]=useState<MemberKpi[]>([]),
    [activeMemberNames,setActiveMemberNames]=useState<Set<string>>(seedActiveMemberNames),
    [draggedMember,setDraggedMember]=useState(""),
    [attendanceRecords,setAttendanceRecords]=useState<AttendanceRecord[]>([]),
    [attendancePreview,setAttendancePreview]=useState<AttendancePreview|null>(null),
    [attendanceUpdatedAt,setAttendanceUpdatedAt]=useState(""),
    [attendanceImportDraft,setAttendanceImportDraft]=useState(""),
    [hidePerfectAttendance,setHidePerfectAttendance]=useState(false),
    [memberSearch,setMemberSearch]=useState(""),
    [selectedMember,setSelectedMember]=useState(""),
    [hideClearMembers,setHideClearMembers]=useState(false),
    [acknowledgedAttendanceAlerts,setAcknowledgedAttendanceAlerts]=useState<string[]>([]);
  const [notice, setNotice] = useState(""),
    [note, setNote] = useState(""),
    [meetingReady, setMeetingReady] = useState(false),
    [meetingNotes, setMeetingNotes] = useState(""),
    [checkedAgenda, setCheckedAgenda] = useState<string[]>([]),
    [archives, setArchives] = useState<WeeklyArchive[]>([]),
    [archiving, setArchiving] = useState(false),
    [archiveDate, setArchiveDate] = useState(upcomingThursdayKey()),
    [reopenedAgenda, setReopenedAgenda] = useState<
      { title: string; items: string[] }[] | null
    >(null);
  const [visitorDraft,setVisitorDraft]=useState({name:"",email:"",inviter:"",profession:""});
  const [visitorRelayDraft,setVisitorRelayDraft]=useState("");
  const [visitorRelayDate,setVisitorRelayDate]=useState(upcomingThursdayKey());
  const [visitorLogDraft,setVisitorLogDraft]=useState<Record<number,string>>({});
  const [visitorTrackingFilter,setVisitorTrackingFilter]=useState<VisitorTrackingFilter>("全部");
  const [lastSyncedAt,setLastSyncedAt]=useState("");
  const [connectSyncStatus,setConnectSyncStatus]=useState<ConnectSyncStatus|null>(null);
  const [adminStatus,setAdminStatus]=useState<{authenticated:boolean;isOwner:boolean}|null>(null);
  const [adminLoginOpen,setAdminLoginOpen]=useState(false);
  const [bniSession,setBniSession]=useState<{connected:boolean;updatedAt:string|null}>({connected:false,updatedAt:null});
  const [bniTokenDraft,setBniTokenDraft]=useState({accessToken:"",refreshToken:""});
  const [bniSyncKey,setBniSyncKey]=useState("");
  const [qualityDraft,setQualityDraft]=useState({member:"",issue:"缺席" as QualityCase["issue"],occurredDate:taipeiDateKey(),owner:"",note:""});
  const savingRef=useRef(false),groupSavingRef=useRef(false),serverVersionRef=useRef("");
  useEffect(() => {
    fetch("/api/practice")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if(data?.updatedAt){serverVersionRef.current=data.updatedAt;setLastSyncedAt(data.updatedAt)}
        if (data?.renewals?.length >= 80) setRenewals(data.renewals);
        if (data?.tasks?.length) setTasks(data.tasks);
        if (data?.visitors?.length) {
          const hasOldTestData = data.visitors.some((visitor: Visitor) =>
            ["王小明", "陳美華", "林志偉"].includes(visitor.name),
          );
          if (hasOldTestData) {
            setVisitors(seedVisitors);
            fetch("/api/practice", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                renewals: data.renewals,
                tasks: data.tasks,
                visitors: seedVisitors,
              }),
            }).catch(() => {});
          } else {
            setVisitors(data.visitors.map((visitor: Visitor) => ({
              ...visitor,
              stage: visitor.stage === "預計出席" || visitor.stage === "已出席" || visitor.stage === "未出席" ? (visitor.interest === "不追蹤" ? "不追蹤" : "待確認") : visitor.stage || (visitor.interest === "不追蹤" ? "不追蹤" : "待確認"),
              visitDate: visitor.visitDate || taipeiDateKey(),
              receptionOwner: visitor.receptionOwner || "",
              followUpDate: visitor.followUpDate || "",
              logs: visitor.logs || [],
            })));
          }
        }
      })
      .catch(() => {});
    fetch("/api/weekly-archives")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setArchives(data?.archives || []))
      .catch(() => {});
    fetch("/api/admin-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setAdminStatus(data))
      .catch(() => {});
    fetch("/api/bni-connect/session").then(r=>r.ok?r.json():null).then(data=>data&&setBniSession(data)).catch(()=>{});
    fetch("/api/quality-cases").then(r=>r.ok?r.json():null).then(data=>setQualityCases(data?.cases||[])).catch(()=>{});
    fetch("/api/attendance-records").then(r=>r.ok?r.json():null).then(data=>{setAttendanceRecords(data?.records||[]);setAttendanceUpdatedAt(data?.updatedAt||"")}).catch(()=>{});
    fetch("/api/member-groups").then(r=>r.ok?r.json():null).then(data=>{if(Array.isArray(data?.groups)&&data.groups.length===12)setMemberGroups(data.groups)}).catch(()=>{});
    fetch("/api/member-care-owners").then(r=>r.ok?r.json():null).then(data=>{if(Array.isArray(data?.assignments))setCareAssignments(data.assignments)}).catch(()=>{});
    fetch("/api/member-kpis").then(r=>r.ok?r.json():null).then(data=>{if(Array.isArray(data?.records))setMemberKpis(data.records)}).catch(()=>{});
    fetch("/api/member-roster").then(r=>r.ok?r.json():null).then(data=>{if(Array.isArray(data?.members)&&data.members.length>=10)setActiveMemberNames(new Set(data.members.map((name:string)=>normalizeMemberName(name))))}).catch(()=>{});
    fetch("/api/attendance-alert-acks").then(r=>r.ok?r.json():null).then(data=>{if(Array.isArray(data?.acknowledgements))setAcknowledgedAttendanceAlerts(data.acknowledgements)}).catch(()=>{});
  }, []);
  useEffect(()=>{const refresh=()=>fetch("/api/bni-sync/status").then(r=>r.ok?r.json():null).then(data=>setConnectSyncStatus(data?.status||null)).catch(()=>{});refresh();const timer=setInterval(refresh,30000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{fetch("/api/admin-schedules").then(r=>r.ok?r.json():null).then(data=>{if(Array.isArray(data?.schedules)&&data.schedules.length)setDutySchedules(data.schedules)}).catch(()=>{})},[]);
  useEffect(()=>{const timer=setInterval(()=>{if(savingRef.current)return;fetch("/api/practice").then(r=>r.ok?r.json():null).then(data=>{if(!data?.updatedAt||data.updatedAt===serverVersionRef.current)return;if(Array.isArray(data.renewals)&&data.renewals.length>=80)setRenewals(data.renewals);if(Array.isArray(data.tasks))setTasks(data.tasks);if(Array.isArray(data.visitors))setVisitors(data.visitors);serverVersionRef.current=data.updatedAt;setLastSyncedAt(data.updatedAt);flash("已同步其他委員的最新更新")}).catch(()=>{})},5000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!adminStatus?.isOwner)return;const timer=setInterval(()=>{if(groupSavingRef.current)return;fetch("/api/member-groups").then(r=>r.ok?r.json():null).then(data=>{if(Array.isArray(data?.groups)&&data.groups.length===12)setMemberGroups(data.groups)}).catch(()=>{})},5000);return()=>clearInterval(timer)},[adminStatus?.isOwner]);
  useEffect(()=>{if(adminStatus&&!adminStatus.isOwner&&(view==="groups"||view==="members"))setView("dashboard")},[adminStatus,view]);
  const openTasks = tasks.filter((t) => t.status !== "done");
  const openQualityCases=qualityCases.filter(item=>item.status!=="已結案"&&activeMemberNames.has(normalizeMemberName(item.member)));
  const visibleQualityCases=qualityCases.filter(item=>activeMemberNames.has(normalizeMemberName(item.member)));
  const assignedMemberNames=useMemo(()=>new Set(memberGroups.flatMap(group=>group.members.map(member=>member.name))),[memberGroups]);
  const unassignedMemberNames=useMemo(()=>[...activeMemberNames].filter(name=>!assignedMemberNames.has(name)).sort((a,b)=>a.localeCompare(b,"zh-Hant")),[assignedMemberNames,activeMemberNames]);
  const careAssignmentMap=useMemo(()=>new Map(careAssignments.map(item=>[normalizeMemberName(item.member),item])),[careAssignments]);
  const careOwnerNames=useMemo(()=>[...new Set([...committeeMembers,...careAssignments.flatMap(item=>[item.committee,item.leader]).filter(Boolean)])],[careAssignments]);
  const departedMembers=useMemo(()=>new Set(renewals.filter(item=>item.status==="已離會").map(item=>item.name.trim())),[renewals]);
  const attendanceSummary=useMemo(()=>{const now=new Date(),current=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`,rollingStart=new Date(now.getFullYear(),now.getMonth()-5,1);const startKey=`${rollingStart.getFullYear()}-${String(rollingStart.getMonth()+1).padStart(2,"0")}-01`,endKey=taipeiDateKey();const members=new Map<string,{absent:number;substitute:number;late:number;currentAbsent:number;currentSubstitute:number;currentLate:number;details:AttendanceRecord[]}>();attendanceRecords.forEach(record=>{const normalized=normalizeMemberName(record.member);if(!activeMemberNames.has(normalized)||departedMembers.has(record.member.trim())||record.date<startKey||record.date>endKey)return;const row=members.get(record.member)||{absent:0,substitute:0,late:0,currentAbsent:0,currentSubstitute:0,currentLate:0,details:[]};if(record.code==="A")row.absent++;if(record.code==="S")row.substitute++;if(record.code==="L")row.late++;if(record.date.startsWith(current)){if(record.code==="A")row.currentAbsent++;if(record.code==="S")row.currentSubstitute++;if(record.code==="L")row.currentLate++}row.details.push(record);members.set(record.member,row)});members.forEach(row=>{row.absent+=Math.floor(row.late/2);row.currentAbsent+=Math.floor(row.currentLate/2)});return {startKey,endKey,current,rows:[...members.entries()].sort((a,b)=>(b[1].absent+b[1].substitute)-(a[1].absent+a[1].substitute))}},[attendanceRecords,departedMembers,activeMemberNames]);
  const attendanceMatrix=useMemo(()=>{const allowed=attendanceRecords.filter(r=>activeMemberNames.has(normalizeMemberName(r.member))&&!departedMembers.has(r.member.trim())&&r.date>=attendanceSummary.startKey&&r.date<=attendanceSummary.endKey);const dates=[...new Set(allowed.map(r=>r.date))].sort();const members=[...new Set(allowed.map(r=>r.member))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));const lookup=new Map(allowed.map(r=>[`${r.member}|${r.date}`,r.code]));const convertedLateKeys=new Set<string>();members.forEach(member=>{allowed.filter(record=>record.member===member&&record.code==="L").sort((a,b)=>a.date.localeCompare(b.date)).forEach((record,index)=>{if((index+1)%2===0)convertedLateKeys.add(`${record.member}|${record.date}`)})});const months=[...new Set(dates.map(date=>date.slice(0,7)))].map(month=>({month,dates:dates.filter(date=>date.startsWith(month))}));return{dates,members,lookup,convertedLateKeys,months}},[attendanceRecords,attendanceSummary,departedMembers,activeMemberNames]);
  const attendanceHealth=useMemo(()=>{const latestDate=attendanceMatrix.dates.at(-1)||"",today=new Date(`${taipeiDateKey()}T12:00:00`),day=today.getDay(),daysSinceThursday=(day+3)%7,expected=new Date(today);expected.setDate(today.getDate()-daysSinceThursday);const expectedDate=`${expected.getFullYear()}-${String(expected.getMonth()+1).padStart(2,"0")}-${String(expected.getDate()).padStart(2,"0")}`,active=[...activeMemberNames].filter(name=>!departedMembers.has(name)),latestMembers=new Set(attendanceRecords.filter(record=>record.date===latestDate&&activeMemberNames.has(normalizeMemberName(record.member))).map(record=>normalizeMemberName(record.member))),missingMembers=active.filter(name=>!latestMembers.has(name)),coverage=active.length?Math.round(latestMembers.size/active.length*100):0,status=!latestDate?"empty":latestDate<expectedDate?"waiting":missingMembers.length?"incomplete":"ready";return{latestDate,expectedDate,activeCount:active.length,latestCount:latestMembers.size,missingMembers,coverage,status}},[attendanceMatrix.dates,attendanceRecords,departedMembers,activeMemberNames]);
  const perfectAttendanceCount=useMemo(()=>attendanceMatrix.members.filter(member=>attendanceMatrix.dates.length>0&&attendanceMatrix.dates.every(date=>attendanceMatrix.lookup.get(`${member}|${date}`)==="P")).length,[attendanceMatrix]);
  const visibleAttendanceMembers=useMemo(()=>hidePerfectAttendance?attendanceMatrix.members.filter(member=>!attendanceMatrix.dates.every(date=>attendanceMatrix.lookup.get(`${member}|${date}`)==="P")):attendanceMatrix.members,[attendanceMatrix,hidePerfectAttendance]);
  const qualityAlerts=useMemo(()=>attendanceSummary.rows.flatMap(([member,row])=>{const alerts:{member:string;reason:string;level:string;count:number}[]=[];if(row.absent>=4)alerts.push({member,reason:"六個月缺席達 4 次",level:"回報領導團隊",count:row.absent});else if(row.absent===3)alerts.push({member,reason:"六個月缺席達 3 次",level:"發送 B 信",count:row.absent});else if(row.absent===2)alerts.push({member,reason:"六個月缺席達 2 次",level:"發送 A 信",count:row.absent});else if(row.absent===1)alerts.push({member,reason:"六個月缺席 1 次",level:"組長關懷",count:row.absent});if(row.substitute>=3)alerts.push({member,reason:`六個月代理 ${row.substitute} 次`,level:"通知組長關懷",count:row.substitute});return alerts}).sort((a,b)=>b.count-a.count),[attendanceSummary]);
  const oralCareAlerts=qualityAlerts.filter(alert=>alert.level==="組長關懷");
  const agendaAttendanceAlerts=qualityAlerts.filter(alert=>alert.level!=="組長關懷");
  const attendanceAlertKey=(alert:(typeof qualityAlerts)[number])=>`${normalizeMemberName(alert.member)}|${alert.level}`;
  const visibleAgendaAttendanceAlerts=agendaAttendanceAlerts.filter(alert=>!acknowledgedAttendanceAlerts.includes(attendanceAlertKey(alert)));
  const trackedMonthKeys = trackingMonthKeys();
  const terminalRenewalStatuses:Status[]=["已完成","預計離會","已離會"];
  const stoppedRenewals=renewals.filter((renewal)=>renewal.status==="預計離會"||renewal.status==="已離會");
  const todayKey=taipeiDateKey();
  const visibleDutySchedules=useMemo(()=>dutySchedules.filter(row=>row.date>=todayKey).sort((a,b)=>a.date.localeCompare(b.date)),[dutySchedules,todayKey]);
  const connectSyncAgeDays=connectSyncStatus?.lastSyncAt?Math.floor((Date.now()-new Date(connectSyncStatus.lastSyncAt).getTime())/86400000):null;
  const connectSyncHealth=!connectSyncStatus?"empty":connectSyncStatus.failedMembers>0||attendanceHealth.status==="incomplete"?"error":connectSyncAgeDays!==null&&connectSyncAgeDays>7||attendanceHealth.status==="waiting"?"stale":"ready";
  const memberWindow=useMemo(()=>{const end=new Date(`${todayKey}T12:00:00+08:00`),start=new Date(end.getFullYear(),end.getMonth()-5,1);return{start:taipeiDateKey(start),end:todayKey}},[todayKey]);
  const memberProfiles=useMemo(()=>[...activeMemberNames].filter(name=>!departedMembers.has(name)).sort((a,b)=>a.localeCompare(b,"zh-Hant")).map(name=>{
    const records=attendanceRecords.filter(record=>normalizeMemberName(record.member)===name&&record.date>=memberWindow.start&&record.date<=memberWindow.end);
    const rawAbsent=records.filter(record=>record.code==="A").length,late=records.filter(record=>record.code==="L").length,substitute=records.filter(record=>record.code==="S").length;
    const absent=rawAbsent+Math.floor(late/2),attendancePoints=absent===0?20:absent===1?15:absent===2?10:0;
    const assignment=careAssignmentMap.get(name),renewal=renewals.find(item=>normalizeMemberName(item.name)===name),cases=qualityCases.filter(item=>normalizeMemberName(item.member)===name&&item.status!=="已結案");
    const concerns=[...(absent>=3?["缺席已達 B 信門檻"]:absent===2?["缺席已達 A 信門檻"]:absent===1?["需要小組長口頭關懷"]:[]),...(renewal&&renewal.daysLeft<=90?[`續約剩 ${renewal.daysLeft} 天`]:[]),...cases.map(item=>qualityIssueLabel(item.issue))];
    return{name,records,absent,late,substitute,attendancePoints,assignment,renewal,cases,concerns};
  }),[attendanceRecords,memberWindow,departedMembers,renewals,qualityCases,careAssignmentMap,activeMemberNames]);
  const filteredMemberProfiles=memberProfiles.filter(profile=>profile.name.includes(memberSearch.trim())&&(!hideClearMembers||profile.concerns.length>0));
  const activeMemberProfile=memberProfiles.find(profile=>profile.name===selectedMember)||filteredMemberProfiles[0]||memberProfiles[0];
  const activeMemberKpi:MemberKpi=memberKpis.find(item=>normalizeMemberName(item.member)===normalizeMemberName(activeMemberProfile?.name||""))||{member:activeMemberProfile?.name||"",trainingPoints:null,visitorCount:null,oneToOneWeeklyAverage:null,referralWeeklyAverage:null,dreamReferralAmount:null};
  const memberKpiWeekCount=Math.max(1,attendanceMatrix.dates.length);
  const visitorFullScoreThreshold=Math.ceil(memberKpiWeekCount/2),visitorPartialScoreThreshold=Math.ceil(memberKpiWeekCount/4);
  const activeReferralWeeklyAverage=activeMemberKpi.referralTotal==null?activeMemberKpi.referralWeeklyAverage:Number((activeMemberKpi.referralTotal/memberKpiWeekCount).toFixed(2));
  const activeKpiScores=activeMemberProfile?{
    attendance:activeMemberProfile.records.length?activeMemberProfile.attendancePoints:null,
    training:activeMemberKpi.trainingPoints===null?null:trainingScore(activeMemberKpi.trainingPoints),
    visitors:activeMemberKpi.visitorCount===null?null:visitorScore(activeMemberKpi.visitorCount,memberKpiWeekCount),
    oneToOne:activeMemberKpi.oneToOneWeeklyAverage===null?null:oneToOneScore(activeMemberKpi.oneToOneWeeklyAverage),
    referrals:activeReferralWeeklyAverage===null?null:referralScore(activeReferralWeeklyAverage),
    dreamReferral:activeMemberKpi.dreamReferralAmount===null?null:dreamReferralScore(activeMemberKpi.dreamReferralAmount),
  }:null;
  const activeKpiValues=activeKpiScores?Object.values(activeKpiScores):[],activeKpiComplete=activeKpiValues.length===6&&activeKpiValues.every(value=>value!==null),activeKpiTotal=activeKpiComplete?activeKpiValues.reduce<number>((sum,value)=>sum+(value||0),0):null;
  const activeKpiLight=activeKpiTotal===null?null:activeKpiTotal>=70?"green":activeKpiTotal>=50?"yellow":activeKpiTotal>=30?"red":"black";
  const activeVisitors=visitors.filter((visitor)=>visitor.visitDate===visitorRelayDate&&visitor.stage!=="不追蹤"&&visitor.stage!=="已入會"&&!visitor.agendaExcludedDates?.includes(visitorRelayDate));
  function visitorLastActivity(visitor:Visitor){return visitor.logs?.at(-1)?.date||visitor.interviewDate||visitor.visitDate||todayKey}
  function visitorInactiveDays(visitor:Visitor){return Math.max(0,Math.floor((new Date(`${todayKey}T00:00:00`).getTime()-new Date(`${visitorLastActivity(visitor)}T00:00:00`).getTime())/86400000))}
  const currentWeekVisitors=useMemo(()=>visitors.filter(visitor=>visitor.visitDate===visitorRelayDate),[visitors,visitorRelayDate]);
  const retainedVisitors=useMemo(()=>visitors.filter(visitor=>visitor.visitDate!==visitorRelayDate&&((['保留追蹤','考慮加入','申請中'] as VisitorInterviewStatus[]).includes(visitor.interviewStatus||'未聯絡')||(['已簽單','訪談中','待投票','待繳費','持續追蹤'] as VisitorStage[]).includes(visitor.stage||'待確認'))).sort((a,b)=>visitorLastActivity(b).localeCompare(visitorLastActivity(a))),[visitors,visitorRelayDate,todayKey]);
  const filteredRetainedVisitors=useMemo(()=>retainedVisitors.filter(visitor=>visitorTrackingFilter==="全部"||visitorTrackingFilter==="未指派"&&!visitor.owner||visitorTrackingFilter==="待聯絡"&&(!visitor.interviewStatus||visitor.interviewStatus==="未聯絡")||visitorTrackingFilter==="已預約"&&visitor.interviewStatus==="已預約"||visitorTrackingFilter==="考慮加入"&&visitor.interviewStatus==="考慮加入"||visitorTrackingFilter==="申請中"&&visitor.interviewStatus==="申請中"),[retainedVisitors,visitorTrackingFilter]);
  const visitorHistoryGroups=useMemo(()=>{const retainedIds=new Set(retainedVisitors.map(visitor=>visitor.id));return Object.entries(visitors.filter(visitor=>visitor.visitDate!==visitorRelayDate&&!retainedIds.has(visitor.id)).reduce<Record<string,Visitor[]>>((groups,visitor)=>{const key=visitor.visitDate||"日期待補";(groups[key]||=[]).push(visitor);return groups},{})).sort(([a],[b])=>a==="日期待補"?1:b==="日期待補"?-1:b.localeCompare(a))},[visitors,visitorRelayDate,retainedVisitors]);
  const visitorAttention=useMemo(()=>{const tracked=visitors.filter(visitor=>visitor.stage!=="不追蹤"&&visitor.stage!=="已入會");return{unassigned:tracked.filter(visitor=>!visitor.owner).length,pendingInterview:tracked.filter(visitor=>visitor.owner&&!(["已訪談","保留追蹤","考慮加入","申請中","不追蹤","已入會"] as VisitorInterviewStatus[]).includes(visitor.interviewStatus||"未聯絡")).length,overdue:tracked.filter(visitor=>Boolean(visitorOverdue(visitor))).length}},[visitors,todayKey]);
  function visitorOverdue(visitor:Visitor){if(!visitor.visitDate)return "";const days=Math.floor((new Date(`${todayKey}T00:00:00`).getTime()-new Date(`${visitor.visitDate}T00:00:00`).getTime())/86400000);if(visitor.stage==="已簽單"&&days>3)return "訪談逾期";if(visitor.stage==="訪談中"&&days>4)return "投票逾期";if(visitor.stage==="待投票"&&days>7)return "通知逾期";if(visitor.stage==="待繳費"&&days>14)return "付款逾期";return ""}
  const trackedRenewals = renewals.filter((renewal) =>
    trackedMonthKeys.includes(renewal.expiryDate.slice(0, 7)) && !terminalRenewalStatuses.includes(renewal.status),
  );
  const renewalGroups = useMemo(
    () =>
      monthlyMembers
        .filter(([date]) => trackedMonthKeys.includes(date.slice(0, 7)))
        .map(([date]) => ({
          date,
          members: renewals.filter((r) => r.expiryDate === date && !terminalRenewalStatuses.includes(r.status)),
        })),
    [renewals, trackedMonthKeys.join(",")],
  );
  const agenda = useMemo(
    () => [
      {
        title: "上週未結事項",
        items: openTasks.slice(0, 3).map((t) => `${t.owner}｜${t.title}`),
      },
      {
        title: "來賓追蹤",
        items: activeVisitors.map(
          (visitor) =>
            `${visitor.name}｜${visitor.profession}｜${visitor.attendance}`,
        ),
      },
      {
        title: "續約與終期訪談",
        items: trackedRenewals
          .filter((r) => r.status !== "已完成")
          .map((r) => `${r.name}｜${fmt(r.expiryDate)} 到期｜${r.status}`),
      },
      {
        title: "出席與會員狀況",
        items: visibleAgendaAttendanceAlerts.length ? visibleAgendaAttendanceAlerts.map(alert=>`${alert.member}｜${alert.reason}｜${alert.level}`) : ["目前沒有新的 A 信、B 信或三次代理警戒"],
      },
      {
        title: "決議與分工",
        items: ["逐項指定負責人與期限", "確認需延至下週的事項"],
      },
    ],
    [openTasks, trackedRenewals, activeVisitors, visibleAgendaAttendanceAlerts],
  );
  const activeAgenda = reopenedAgenda || agenda;
  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 2400);
  }
  async function acknowledgeAttendanceAlert(alert:(typeof qualityAlerts)[number]){
    const key=attendanceAlertKey(alert),next=[...new Set([...acknowledgedAttendanceAlerts,key])];
    setAcknowledgedAttendanceAlerts(next);
    const response=await fetch("/api/attendance-alert-acks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({acknowledgements:next})});
    if(!response.ok){setAcknowledgedAttendanceAlerts(acknowledgedAttendanceAlerts);flash("確認狀態儲存失敗，請再試一次");return}
    flash(`${alert.member} 的${alert.level}層級已確認；狀況升級時會重新顯示`);
  }
  function updateActiveMemberKpi(field:keyof Pick<MemberKpi,"trainingPoints"|"visitorCount"|"oneToOneWeeklyAverage"|"referralWeeklyAverage"|"referralTotal"|"dreamReferralAmount">,value:string){
    if(!activeMemberProfile)return;
    const memberKey=normalizeMemberName(activeMemberProfile.name),nextValue=value===""?null:Number(value),existing=memberKpis.find(item=>normalizeMemberName(item.member)===memberKey),next={...(existing||activeMemberKpi),member:activeMemberProfile.name,[field]:nextValue};
    setMemberKpis(records=>existing?records.map(item=>normalizeMemberName(item.member)===memberKey?next:item):[...records,next]);
  }
  async function saveActiveMemberKpi(){
    if(!activeMemberProfile)return;
    const response=await fetch("/api/member-kpis",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(activeMemberKpi)}),data=await response.json();
    if(response.status===409&&data.record){setMemberKpis(records=>records.map(item=>item.member===data.record.member?data.record:item));flash("KPI 剛被其他畫面更新，已載入最新資料");return}
    if(!response.ok){flash(data.error||"KPI 儲存失敗");return}
    setMemberKpis(records=>records.some(item=>item.member===data.record.member)?records.map(item=>item.member===data.record.member?data.record:item):[...records,data.record]);flash(`${activeMemberProfile.name} 的 KPI 已儲存`);
  }
  async function persistMemberGroups(next:MemberGroup[]){
    setMemberGroups(next);
    setCareAssignments(next.flatMap(group=>{const committee=group.members.find(member=>member.role==="委員")?.name||"",leader=group.members.find(member=>member.role==="小組長")?.name||"";return group.members.map(member=>({member:member.name,groupId:group.id,committee,leader}))}));
    groupSavingRef.current=true;
    try{const response=await fetch("/api/member-groups",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({groups:next})});
    if(!response.ok)flash("分組儲存失敗，請稍後再試");else flash("分組已儲存")}finally{groupSavingRef.current=false}
  }
  function moveMemberToGroup(member:string,targetGroupId:number|null){
    if(!member)return;
    let previous:GroupMember|undefined;
    memberGroups.forEach(group=>{const found=group.members.find(item=>item.name===member);if(found)previous=found});
    const next=memberGroups.map(group=>({...group,members:group.members.filter(item=>item.name!==member)}));
    if(targetGroupId!==null){
      const target=next.find(group=>group.id===targetGroupId);
      if(target)target.members.push({name:member,role:previous?.role||"組員"});
    }
    setDraggedMember("");
    void persistMemberGroups(next);
  }
  function changeGroupRole(groupId:number,member:string,role:GroupRole){
    const uniqueRoles:GroupRole[]=["十長","委員","導師","小組長"];
    const next=memberGroups.map(group=>group.id!==groupId?group:{...group,members:group.members.map(item=>item.name===member?{...item,role}:uniqueRoles.includes(role)&&item.role===role?{...item,role:"組員"}:item)});
    void persistMemberGroups(next);
  }
  function moveMemberToRole(member:string,targetGroupId:number,role:GroupRole){
    if(!member)return;
    const uniqueRoles:GroupRole[]=["十長","委員","導師","小組長"];
    const next=memberGroups.map(group=>({...group,members:group.members.filter(item=>item.name!==member)}));
    const target=next.find(group=>group.id===targetGroupId);
    if(!target)return;
    if(uniqueRoles.includes(role))target.members=target.members.map(item=>item.role===role?{...item,role:"組員"}:item);
    target.members.push({name:member,role});
    setDraggedMember("");
    void persistMemberGroups(next);
  }
  async function copyLetter(issue:"A信"|"B信",member:string){
    await navigator.clipboard.writeText(letterText(issue,member));
    flash(`${issue}內容已複製`);
  }
  async function save(
    nextRenewals = renewals,
    nextTasks = tasks,
    nextVisitors = visitors,
  ) {
    setRenewals(nextRenewals);
    setTasks(nextTasks);
    savingRef.current=true;
    await fetch("/api/practice", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        renewals: nextRenewals,
        tasks: nextTasks,
        visitors: nextVisitors,
      }),
    }).then(r=>r.ok?r.json():null).then(data=>{if(data?.updatedAt){serverVersionRef.current=data.updatedAt;setLastSyncedAt(data.updatedAt)}}).catch(() => {}).finally(()=>{savingRef.current=false});
  }
  async function patchRecord(entity:"renewal"|"visitor",id:number,changes:Record<string,unknown>,operation="update"){savingRef.current=true;try{const current=entity==="renewal"?renewals.find(item=>item.id===id):visitors.find(item=>item.id===id);const response=await fetch("/api/practice",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entity,id,changes,operation,baseUpdatedAt:current?.updatedAt||""})});const data=await response.json();if(response.status===409){if(entity==="renewal"&&Array.isArray(data?.renewals))setRenewals(data.renewals);if(entity==="visitor"&&Array.isArray(data?.visitors))setVisitors(data.visitors);flash("此筆資料剛被其他人更新，已載入最新內容，請重新確認");return}if(data?.updatedAt){serverVersionRef.current=data.updatedAt;setLastSyncedAt(data.updatedAt)}if(entity==="renewal"&&Array.isArray(data?.renewals))setRenewals(data.renewals);if(entity==="visitor"&&Array.isArray(data?.visitors))setVisitors(data.visitors)}finally{savingRef.current=false}}
  function setRenewalStatus(id: number, status: Status) {
    updateRenewal(id,{status});
    flash("續約進度已更新");
  }
  function updateRenewal(id: number, changes: Partial<Renewal>) {
    setRenewals(renewals.map((r) => (r.id === id ? { ...r, ...changes } : r)));
    patchRecord("renewal",id,changes);
  }
  function restoreRenewal(id:number){setRenewalStatus(id,"待訪談");flash("會員已恢復續約追蹤")}
  function updateVisitor(id: number, changes: Partial<Visitor>) {
    const currentVisitor=visitors.find(visitor=>visitor.id===id);
    const next = visitors.map((visitor) =>
      visitor.id === id ? { ...visitor, ...changes } : visitor,
    );
    setVisitors(next);
    patchRecord("visitor",id,changes);
    if(changes.owner&&currentVisitor?.visitDate)clearDutyForCloser(currentVisitor.visitDate,changes.owner);
  }
  function updateVisitorInterview(visitor:Visitor,status:VisitorInterviewStatus){const changes:Partial<Visitor>={interviewStatus:status};if(status==="已訪談"&&!visitor.interviewDate)changes.interviewDate=todayKey;if(status==="保留追蹤"||status==="考慮加入")changes.stage="持續追蹤";if(status==="不追蹤")changes.stage="不追蹤";if(status==="已入會")changes.stage="已入會";if(status==="申請中"&&(!visitor.stage||visitor.stage==="待確認"||visitor.stage==="有意願"||visitor.stage==="持續追蹤"))changes.stage="已簽單";updateVisitor(visitor.id,changes)}
  function removeVisitorFromAgenda(visitor:Visitor){if(!window.confirm(`確定要將來賓「${visitor.name}」從 ${fmt(visitorRelayDate)} 議程移除嗎？\n來賓追蹤資料與聯絡紀錄會完整保留。`))return;const agendaExcludedDates=[...new Set([...(visitor.agendaExcludedDates||[]),visitorRelayDate])];updateVisitor(visitor.id,{agendaExcludedDates});flash(`${visitor.name} 已從本週議程移除，追蹤資料仍保留`)}
  function addVisitorLog(visitor:Visitor){const text=visitorLogDraft[visitor.id]?.trim();if(!text)return;const nextLogs=[...(visitor.logs||[]),{date:todayKey,owner:visitor.owner||"未指派",text}];updateVisitor(visitor.id,{logs:nextLogs,note:text});setVisitorLogDraft({...visitorLogDraft,[visitor.id]:""});flash("追蹤紀錄已新增")}
  function addVisitor(){if(!visitorDraft.name.trim()||!visitorDraft.email.trim()){flash("請填寫來賓姓名與 Email");return}const visitor={id:Date.now(),name:visitorDraft.name.trim(),email:visitorDraft.email.trim(),inviter:visitorDraft.inviter.trim()||"現場新增",profession:visitorDraft.profession.trim()||"待補充",attendance:"預計出席",interest:"待確認",owner:"",note:"",stage:"待確認",visitDate:visitorRelayDate,receptionOwner:"",followUpDate:"",logs:[]} as Visitor;setVisitors(current=>[...current,visitor]);setVisitorDraft({name:"",email:"",inviter:"",profession:""});patchRecord("visitor",visitor.id,visitor as unknown as Record<string,unknown>,"create");flash(`臨時來賓已加入 ${fmt(visitorRelayDate)} 議程`)}
  function visitorAddForm(){return <div className="quick-visitor-add"><div><b>臨時新增來賓</b><small>姓名與 Email 為必填</small></div><input value={visitorDraft.name} onChange={(e)=>setVisitorDraft({...visitorDraft,name:e.target.value})} placeholder="來賓姓名＊"/><input type="email" value={visitorDraft.email} onChange={(e)=>setVisitorDraft({...visitorDraft,email:e.target.value})} placeholder="Email＊"/><input value={visitorDraft.inviter} onChange={(e)=>setVisitorDraft({...visitorDraft,inviter:e.target.value})} placeholder="邀請人"/><input value={visitorDraft.profession} onChange={(e)=>setVisitorDraft({...visitorDraft,profession:e.target.value})} placeholder="專業類別"/><button onClick={addVisitor}>＋ 新增</button></div>}
  function importVisitorRelay(){const blocks=visitorRelayDraft.replaceAll("\\@","@").split(/(?=^\s*\d+[.、)]\s*邀約人)/m).map(block=>block.trim()).filter(block=>/來賓姓名/.test(block));const parsed=blocks.map((block,index)=>{const field=(label:string)=>block.match(new RegExp(`(?:\\*|＊)?${label}\\s*[：:]\\s*([^\\n]+)`))?.[1]?.trim()||"";const inviterGroup=field("邀約人\\/組別").split("/").map(value=>value.trim());const email=block.match(/電子信箱\s*[：:]?\s*([^\s]+@[^\s]+)/)?.[1]?.trim()||"";return {id:Date.now()+index,name:field("來賓姓名"),inviter:inviterGroup[0]||"待補充",group:inviterGroup[1]||"",profession:field("專業類別")||"待補充",email,company:(field("公司名\\/職稱")||field("公司名")),referralTarget:field("需要引薦對象"),attendance:"預計出席",interest:"待確認",owner:"",note:"",stage:"待確認",visitDate:visitorRelayDate,receptionOwner:"",followUpDate:"",logs:[]} as Visitor}).filter(visitor=>visitor.name);const unique=parsed.filter(visitor=>!visitors.some(existing=>((visitor.email&&existing.email)&&existing.email.toLowerCase()===visitor.email.toLowerCase())||(existing.name===visitor.name&&existing.visitDate===visitorRelayDate)));if(!unique.length){flash(parsed.length?"名單已存在，沒有新增資料":"未辨識到來賓姓名");return}setVisitors(current=>[...current,...unique]);patchRecord("visitor",0,{records:unique},"add_many");setVisitorRelayDraft("");flash(`已匯入 ${unique.length} 位 ${fmt(visitorRelayDate)} 來賓`)}
  function visitorRelayForm(){return <section className="visitor-relay-import"><div className="relay-head"><div><b>貼上群組來賓接龍</b><small>系統會解析姓名、Email、專業類別、邀約人與組別</small></div><label><span>來賓日期</span><input type="date" value={visitorRelayDate} onChange={(e)=>setVisitorRelayDate(e.target.value)}/></label></div><textarea value={visitorRelayDraft} onChange={(e)=>setVisitorRelayDraft(e.target.value)} placeholder={'直接貼上整段接龍，例如：\n1. 邀約人/組別：謝宥騏/2\n*來賓姓名：張清良\n*專業類別：AI影片剪輯師\n*電子信箱：example@gmail.com'}/><div className="relay-actions"><small>重複的 Email，或同日期同姓名，會自動跳過。</small><button type="button" onClick={importVisitorRelay}>解析並加入本週議程</button></div></section>}
  function visitorTrackingCard(visitor:Visitor){const reminder=!visitor.owner?"尚未指派締結委員":visitor.interviewStatus==="未聯絡"||!visitor.interviewStatus?"尚未回報訪談":visitorOverdue(visitor);return <article className={`visitor-manage-card${reminder?" needs-attention":""}`} key={visitor.id}><div className="visitor-manage-head"><div><b>{visitor.name}</b><small>{visitor.profession} · 邀請人 {visitor.inviter}{visitor.group?`／第 ${visitor.group} 組`:""}</small></div>{reminder&&<em>{reminder}</em>}</div><div className="visitor-manage-fields"><label><span>出席狀況</span><select value={visitor.attendance} onChange={(e)=>updateVisitor(visitor.id,{attendance:e.target.value as Visitor["attendance"]})}>{["預計出席","已出席","未出席"].map(value=><option key={value}>{value}</option>)}</select></label><label><span>締結委員（手動指派）</span><select value={visitor.owner} onChange={(e)=>updateVisitor(visitor.id,{owner:e.target.value})}><option value="">未指派</option>{committeeMembers.map(member=><option key={member}>{member}</option>)}</select></label><label><span>訪談回報</span><select value={visitor.interviewStatus||"未聯絡"} onChange={(e)=>updateVisitorInterview(visitor,e.target.value as VisitorInterviewStatus)}>{visitorInterviewStatusOptions.map(value=><option key={value}>{value}</option>)}</select></label><label><span>訪談日期</span><input type="date" value={visitor.interviewDate||""} onChange={(e)=>updateVisitor(visitor.id,{interviewDate:e.target.value})}/></label><label><span>後續流程</span><select value={visitor.stage||"待確認"} onChange={(e)=>updateVisitor(visitor.id,{stage:e.target.value as VisitorStage})}>{visitorStageOptions.map(value=><option key={value}>{value}</option>)}</select></label><label className="visitor-interview-result"><span>訪談結果／下一步</span><input value={visitor.interviewResult||""} onChange={(e)=>updateVisitor(visitor.id,{interviewResult:e.target.value})} placeholder="例如：有意願，等待提交申請"/></label></div><details className="visitor-edit-details"><summary>編輯來賓資訊</summary><div><label><span>來賓日期</span><input type="date" value={visitor.visitDate||""} onChange={(e)=>updateVisitor(visitor.id,{visitDate:e.target.value})}/></label><label><span>專業類別</span><input value={visitor.profession} onChange={(e)=>updateVisitor(visitor.id,{profession:e.target.value})}/></label><label><span>Email</span><input type="email" value={visitor.email||""} onChange={(e)=>updateVisitor(visitor.id,{email:e.target.value})}/></label><label><span>邀約人</span><input value={visitor.inviter} onChange={(e)=>updateVisitor(visitor.id,{inviter:e.target.value})}/></label><label><span>組別</span><input value={visitor.group||""} onChange={(e)=>updateVisitor(visitor.id,{group:e.target.value})}/></label></div></details><div className="visitor-manage-log"><input value={visitorLogDraft[visitor.id]||""} placeholder="輸入本次追蹤近況…" onChange={(e)=>setVisitorLogDraft({...visitorLogDraft,[visitor.id]:e.target.value})}/><button type="button" onClick={()=>addVisitorLog(visitor)}>加入追蹤紀錄</button></div><section className="visitor-log-list">{(visitor.logs||[]).length===0?<small>尚無追蹤紀錄</small>:[...(visitor.logs||[])].reverse().map((log,index)=><p key={`${log.date}-${index}`}><b>{fmt(log.date)}｜{log.owner}</b><span>{log.text}</span></p>)}</section></article>}
  async function patchTask(id:number,changes:Partial<Task>,operation="update"){savingRef.current=true;try{const current=tasks.find(item=>item.id===id);const response=await fetch("/api/practice",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entity:"task",id,changes,operation,baseUpdatedAt:current?.updatedAt||""})});const data=await response.json();if(response.status===409){if(Array.isArray(data?.tasks))setTasks(data.tasks);flash("此筆待辦已被其他人更新，已載入最新內容");return}if(Array.isArray(data?.tasks))setTasks(data.tasks);if(data?.updatedAt){serverVersionRef.current=data.updatedAt;setLastSyncedAt(data.updatedAt)}}finally{savingRef.current=false}}
  function toggleTask(id: number) {
    const next = tasks.map((t) =>
      t.id === id
        ? {
            ...t,
            status: (t.status === "done" ? "todo" : "done") as Task["status"],
          }
        : t,
    );
    setTasks(next);
    const changed=next.find(task=>task.id===id);if(changed)patchTask(id,{status:changed.status});
    flash("待辦狀態已更新");
  }
  function addTask() {
    if (!note.trim()) return;
    const created = {
        id: Date.now(),
        title: note.trim(),
        owner: "副主席",
        dueDate: "2026-09-03",
        status: "todo" as const,
      };
    const next = [...tasks,created];
    setNote("");
    setTasks(next);
    patchTask(created.id,created,"create");
    flash("已加入委員待辦");
  }
  function toggleAgenda(key: string) {
    setCheckedAgenda((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }
  async function archiveWeek() {
    if (archiving) return;
    setArchiving(true);
    try {
      const response = await fetch("/api/weekly-archives", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingDate: archiveDate,
          title: "長佑分會會員委員會",
          agenda: activeAgenda,
          checked: checkedAgenda,
          notes: meetingNotes,
          renewals: trackedRenewals,
          visitors: activeVisitors,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "建檔失敗");
      setArchives((current) => [
        data.archive,
        ...current.filter((item) => item.id !== data.archive.id),
      ]);
      setMeetingReady(false);
      setCheckedAgenda([]);
      setMeetingNotes("");
      setReopenedAgenda(null);
      setArchiveDate(taipeiDateKey());
      setView("history");
      flash("會議已完成並建檔");
    } catch (error) {
      flash(error instanceof Error ? error.message : "建檔失敗");
    } finally {
      setArchiving(false);
    }
  }
  function reopenArchive(archive: WeeklyArchive) {
    setArchiveDate(archive.meetingDate);
    setReopenedAgenda(archive.agenda);
    setCheckedAgenda(archive.checked);
    setMeetingNotes(archive.notes);
    if (archive.renewals?.length) {
      const map = new Map(archive.renewals.map((item) => [item.id, item]));
      setRenewals((current) => current.map((item) => map.get(item.id) || item));
    }
    setVisitorRelayDate(archive.meetingDate);
    setMeetingReady(true);
    setView("agenda");
    flash(`已重新開啟 ${archive.meetingDate} 會議`);
  }
  async function deleteArchive(archive: WeeklyArchive) {
    if (!window.confirm(`確定要刪除「${archive.meetingDate} ${archive.title}」嗎？\n刪除後無法復原，但不會影響目前的來賓與續約追蹤資料。`)) return;
    try {
      const response = await fetch(`/api/weekly-archives/${archive.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "刪除失敗");
      setArchives((current) => current.filter((item) => item.id !== archive.id));
      flash(`${archive.meetingDate} 會議紀錄已刪除`);
    } catch (error) {
      flash(error instanceof Error ? error.message : "刪除失敗");
    }
  }
  async function saveQualityCase(item:Partial<QualityCase>&{id?:number;baseUpdatedAt?:string}){const response=await fetch("/api/quality-cases",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(item)});const data=await response.json();if(response.status===409){setQualityCases(data.cases||[]);flash("此案件剛被其他人更新，已載入最新內容，請重新確認");return}if(!response.ok){flash(data.error||"出缺席資料儲存失敗");return}setQualityCases(data.cases||[]);flash(item.id?"出缺席進度已更新":"出缺席案件已建立")}
  function addQualityCase(){if(!qualityDraft.member.trim()){flash("請填寫會員姓名");return}saveQualityCase({id:Date.now(),...qualityDraft,member:qualityDraft.member.trim(),status:"待處理"});setQualityDraft({...qualityDraft,member:"",note:""})}
  async function saveBniConnectSession(){if(!bniTokenDraft.accessToken.trim()||!bniTokenDraft.refreshToken.trim()){flash("請填入 Access Token 與 Refresh Token");return}const response=await fetch("/api/bni-connect/session",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(bniTokenDraft)}),data=await response.json();if(!response.ok){flash(data.error||"BNI Connect 連線儲存失敗");return}setBniSession(data);setBniTokenDraft({accessToken:"",refreshToken:""});flash("BNI Connect Token 已加密保存")}
  async function testBniConnectSession(){const response=await fetch("/api/bni-connect/test",{method:"POST"}),data=await response.json();if(!response.ok){flash(data.error||"BNI Connect 驗證失敗");return}setBniSession({connected:true,updatedAt:data.updatedAt||bniSession.updatedAt});flash("BNI Connect 連線驗證成功")}
  async function createBniSyncPair(){const response=await fetch("/api/bni-sync/pair",{method:"POST"}),data=await response.json();if(!response.ok){flash(data.error||"無法建立同步配對金鑰");return}setBniSyncKey(data.syncKey||"");try{await navigator.clipboard.writeText(data.syncKey||"");flash("新的同步金鑰已建立並複製；舊金鑰已失效")}catch{flash("新的同步金鑰已建立，請手動複製")}}
  function updateQualityCase(id:number,changes:Partial<QualityCase>){const current=qualityCases.find(item=>item.id===id);setQualityCases(items=>items.map(item=>item.id===id?{...item,...changes}:item));saveQualityCase({id,...changes,baseUpdatedAt:current?.updatedAt||""})}
  async function deleteQualityCase(item:QualityCase){if(!window.confirm(`確定要刪除「${item.member}」的${item.issue}關懷案件嗎？`))return;const response=await fetch(`/api/quality-cases?id=${item.id}`,{method:"DELETE"});const data=await response.json();if(!response.ok){flash(data.error||"關懷案件刪除失敗");return}setQualityCases(data.cases||[]);flash(`${item.member} 的關懷案件已刪除`)}
  function alertIssue(alert:(typeof qualityAlerts)[number]):QualityCase["issue"]{if(alert.level==="發送 A 信")return "A信";if(alert.level==="發送 B 信")return "B信";return "關懷"}
  function careAssignment(member:string){return careAssignmentMap.get(normalizeMemberName(member))}
  function suggestedAlertOwner(alert:(typeof qualityAlerts)[number]){const assignment=careAssignment(alert.member);return alertIssue(alert)==="A信"||alertIssue(alert)==="B信"?assignment?.committee||"":assignment?.leader||""}
  function suggestedCaseOwner(item:QualityCase){const assignment=careAssignment(item.member);return item.issue==="A信"||item.issue==="B信"?assignment?.committee||"":assignment?.leader||""}
  function hasOpenAlertCase(alert:(typeof qualityAlerts)[number]){const issue=alertIssue(alert);return openQualityCases.some(item=>normalizeMemberName(item.member)===normalizeMemberName(alert.member)&&item.issue===issue)}
  function createQualityCaseFromAlert(alert:(typeof qualityAlerts)[number]){const issue=alertIssue(alert),assignment=careAssignment(alert.member),owner=suggestedAlertOwner(alert);if(hasOpenAlertCase(alert)){flash(`${alert.member} 已有未結案的${issue}案件`);return}saveQualityCase({id:Date.now(),member:alert.member,issue,occurredDate:todayKey,status:"待處理",owner,note:`${alert.reason}｜建議處理：${alert.level}${assignment?`｜第 ${assignment.groupId} 組${owner?`｜已指派：${owner}`:"｜待補分組負責人"}`:"｜待補分組負責人"}`})}
  function previewAttendanceImport(){try{const parsed=JSON.parse(attendanceImportDraft);if(!Array.isArray(parsed))throw new Error("PALMS 資料格式必須是陣列");const valid=(parsed as AttendanceRecord[]).filter(record=>record&&typeof record.member==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(String(record.date))&&["P","A","L","M","S"].includes(String(record.code)));const excluded=valid.filter(record=>!activeMemberNames.has(normalizeMemberName(record.member))).length;const records=[...new Map(valid.filter(record=>activeMemberNames.has(normalizeMemberName(record.member))).map(record=>[`${normalizeMemberName(record.member)}|${record.date}`,record])).values()];const currentMap=new Map(attendanceRecords.map(record=>[`${normalizeMemberName(record.member)}|${record.date}`,record.code])),incomingMap=new Map(records.map(record=>[`${normalizeMemberName(record.member)}|${record.date}`,record.code]));let added=0,changed=0,unchanged=0;incomingMap.forEach((code,key)=>{if(!currentMap.has(key))added++;else if(currentMap.get(key)!==code)changed++;else unchanged++});let missing=0;currentMap.forEach((_,key)=>{if(!incomingMap.has(key))missing++});const coveredMembers=new Set(records.map(record=>normalizeMemberName(record.member))),missingMembers=[...activeMemberNames].filter(member=>!coveredMembers.has(member)).sort((a,b)=>a.localeCompare(b,"zh-Hant"));setAttendancePreview({records,added,changed,unchanged,missing,excluded,missingMembers});flash("PALMS 差異預覽已產生，請確認後再同步")}catch(error){setAttendancePreview(null);flash(error instanceof Error?error.message:"無法預覽 PALMS 資料")}}
  async function importAttendance(){if(!attendancePreview){flash("請先產生差異預覽");return}try{const response=await fetch("/api/attendance-records",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({records:attendancePreview.records,baseUpdatedAt:attendanceUpdatedAt})});const data=await response.json();if(response.status===409){setAttendanceRecords(data.records||[]);setAttendanceUpdatedAt(data.updatedAt||"");setAttendancePreview(null);flash("PALMS 已被另一個畫面更新，已載入最新版本，請重新預覽");return}if(!response.ok)throw new Error(data.error||"匯入失敗");setAttendanceRecords(data.records||[]);setAttendanceUpdatedAt(data.updatedAt||"");setAttendanceImportDraft("");setAttendancePreview(null);flash(`已同步 ${data.records?.length||0} 筆 PALMS 紀錄`)}catch(error){flash(error instanceof Error?error.message:"匯入失敗")}}
  async function updateDuty(date:string,key:Exclude<keyof AdminDutySchedule,"date">,value:string){const next=dutySchedules.map(row=>row.date===date?{...row,[key]:value}:row);setDutySchedules(next);const response=await fetch("/api/admin-schedules",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({schedules:next})});if(!response.ok){flash("行政排班儲存失敗，請稍後重試");return}flash("行政排班已儲存")}
  async function clearDutyForCloser(date:string,owner:string){let removed=false;const next=dutySchedules.map(row=>{if(row.date!==date)return row;const updated={...row};dutyFields.forEach(field=>{if(updated[field.key]===owner){updated[field.key]="";removed=true}});return updated});if(!removed)return;setDutySchedules(next);const response=await fetch("/api/admin-schedules",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({schedules:next})});if(response.ok)flash(`${owner} 已安排來賓締結，該週行政職務已自動移除`)}

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">BNI</div>
          <div>
            <strong>長佑分會</strong>
            <span>副主席管理系統</span>
          </div>
        </div>
        <nav>
          {nav.filter(n=>!(["groups","members"] as View[]).includes(n.id)||adminStatus?.isOwner).map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => setView(n.id)}
            >
              <b>{n.icon}</b>
              {n.label}
              {n.id === "tasks" && openTasks.length > 0 ? (
                <em>{openTasks.length}</em>
              ) : null}
            </button>
          ))}
        </nav>
        <button type="button" className={`admin-login-trigger ${adminStatus?.isOwner?"signed-in":""}`} onClick={()=>setAdminLoginOpen(true)}><span>{adminStatus?.isOwner?"✓":"🔐"}</span><div><b>{adminStatus?.isOwner?"管理員已登入":"管理員登入"}</b><small>{adminStatus?.isOwner?"管理功能已解鎖":"手機／其他電腦登入"}</small></div></button>
        <div className="side-section">
          <span>委員功能</span>
          <button disabled>出席管理</button>
          <button disabled>申訴與輔導</button>
          <button disabled>文件中心</button>
        </div>
        <div className="profile">
          <span>葉</span>
          <div>
            <b>葉奕廷</b>
            <small>副主席</small>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <small>長佑分會 · 會員委員會</small>
            <h1>{nav.find((n) => n.id === view)?.label}</h1>
          </div>
          <div className="header-actions">
            <button type="button" className={`connect-sync-pill ${connectSyncHealth}`} onClick={()=>setView("dashboard")}><span>Connect</span><b>{connectSyncStatus?syncDateTime(connectSyncStatus.lastSyncAt):"尚未同步"}</b></button>
            <span className="sync">● 多人同步{lastSyncedAt?` · ${new Date(lastSyncedAt).toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}`:""}</span>
            <button
              onClick={() => {
                setView("agenda");
                setMeetingReady(true);
                flash("本週議程已整理");
              }}
            >
              產生本週議程
            </button>
          </div>
        </header>
        <div className="content">
          {view === "dashboard" && (
            <>
              <section className={`connect-sync-card ${connectSyncHealth}`}><header><div><small>BNI CONNECT 同步狀態</small><h2>{connectSyncHealth==="ready"?"資料已更新且檢查完成":connectSyncHealth==="stale"?attendanceHealth.status==="waiting"?"等待最新例會資料":"超過七天未更新":connectSyncHealth==="error"?"資料已更新，但仍有缺漏待核對":"尚無同步紀錄"}</h2></div><time>{connectSyncStatus?`上次成功更新 ${syncDateTime(connectSyncStatus.lastSyncAt)}`:"完成一次同步後會顯示更新結果"}</time></header><div><article><small>出缺席</small><b>{connectSyncStatus?.attendance.latestDate?`更新至 ${fmt(connectSyncStatus.attendance.latestDate)}`:"尚無資料"}</b><span>{connectSyncStatus?`${connectSyncStatus.attendance.count} 筆 · 最新週 ${attendanceHealth.latestCount}/${attendanceHealth.activeCount} 位`:"—"}</span></article><article><small>續約追蹤</small><b>{connectSyncStatus?.renewals.updatedAt?syncDateTime(connectSyncStatus.renewals.updatedAt):"尚無資料"}</b><span>{connectSyncStatus?`${connectSyncStatus.renewals.count} 位會員`:"—"}</span></article><article><small>會員主檔</small><b>{connectSyncStatus?.members.updatedAt?syncDateTime(connectSyncStatus.members.updatedAt):"尚無資料"}</b><span>{connectSyncStatus?`${connectSyncStatus.members.count} 位在籍會員`:"—"}</span></article></div>{attendanceHealth.status==="incomplete"&&<details className="connect-sync-check"><summary>查看 {attendanceHealth.missingMembers.length} 位缺漏會員</summary><p>{attendanceHealth.missingMembers.join("、")}</p></details>}{attendanceHealth.status==="waiting"&&<p className="connect-sync-check-note">BNI Connect 尚未提供 {fmt(attendanceHealth.expectedDate)} 的完整資料，系統不會把空白誤算成缺席。</p>}</section>
              <section className="stats">
                <article className="red">
                  <small>14 天內到期</small>
                  <strong>2</strong>
                  <p>需立即確認付款</p>
                </article>
                <article className="amber">
                  <small>60 天內到期</small>
                  <strong>8</strong>
                  <p>含 10 月到期 6 人</p>
                </article>
                <article>
                  <small>90 天內到期</small>
                  <strong>15</strong>
                  <p>已進入續約觀察期</p>
                </article>
                <article>
                  <small>未完成待辦</small>
                  <strong>{openTasks.length}</strong>
                  <p>
                    {tasks.filter((t) => t.status === "doing").length} 項進行中
                  </p>
                </article>
              </section>
              <div className="two-col">
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <span>01</span>
                      <h3>本週續約優先名單</h3>
                    </div>
                    <button onClick={() => setView("renewals")}>
                      查看全部 →
                    </button>
                  </div>
                  <div className="renewal-list">
                    {renewals.map((r) => (
                      <article key={r.id}>
                        <i className={urgency(r.daysLeft)} />
                        <div>
                          <b>{r.name}</b>
                          <small>{r.note}</small>
                        </div>
                        <time>
                          {fmt(r.expiryDate)}
                          <small>剩 {r.daysLeft} 天</small>
                        </time>
                        <select
                          value={r.status}
                          onChange={(e) =>
                            setRenewalStatus(r.id, e.target.value as Status)
                          }
                        >
                          {statusOptions.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </article>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-head">
                    <div>
                      <span>02</span>
                      <h3>委員待辦</h3>
                    </div>
                    <button onClick={() => setView("tasks")}>管理待辦 →</button>
                  </div>
                  <div className="task-list">
                    {openTasks.slice(0, 5).map((t) => (
                      <label key={t.id}>
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={() => toggleTask(t.id)}
                        />
                        <div>
                          <b>{t.title}</b>
                          <small>
                            {t.owner} · {fmt(t.dueDate)} 前
                          </small>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="quick-add">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addTask()}
                      placeholder="快速新增一項待辦…"
                    />
                    <button onClick={addTask}>＋</button>
                  </div>
                </section>
              </div>
            </>
          )}
          {view === "members" && adminStatus?.isOwner && (
            <section className="member-master-page">
              <div className="renewal-summary"><div><span>01</span><h3>會員主檔</h3><p>以查看當天往前六個月整合 PALMS、分組、續約與關懷狀態</p></div><strong>{memberProfiles.length}<small>在籍會員</small></strong></div>
              <div className="member-master-layout">
                <aside className="panel member-directory">
                  <header><div><b>會員名單</b><small>{memberWindow.start}～{memberWindow.end}</small></div><span>{filteredMemberProfiles.length}</span></header>
                  <input aria-label="搜尋會員" value={memberSearch} onChange={event=>setMemberSearch(event.target.value)} placeholder="搜尋會員姓名…"/>
                  <button type="button" className={`member-clear-filter ${hideClearMembers?"active":""}`} aria-pressed={hideClearMembers} onClick={()=>{setHideClearMembers(value=>!value);setSelectedMember("")}}><span>!</span><div><b>只看需要關心</b><small>{memberProfiles.filter(profile=>profile.concerns.length===0).length} 位目前正常</small></div><i/></button>
                  <div>{filteredMemberProfiles.map(profile=><button type="button" key={profile.name} className={activeMemberProfile?.name===profile.name?"active":""} onClick={()=>setSelectedMember(profile.name)}><span>{profile.name.slice(0,1)}</span><div><b>{profile.name}</b><small>{profile.concerns.length?profile.concerns[0]:"目前無待處理事項"}</small></div>{profile.concerns.length>0&&<em>{profile.concerns.length}</em>}</button>)}</div>
                </aside>
                {activeMemberProfile&&<div className="member-profile">
                  <section className="panel member-profile-head"><div className="member-avatar">{activeMemberProfile.name.slice(0,1)}</div><div><small>會員個人主檔</small><h2>{activeMemberProfile.name}</h2><p>{activeMemberProfile.assignment?`第 ${activeMemberProfile.assignment.groupId} 組｜委員 ${activeMemberProfile.assignment.committee||"未設定"}｜小組長 ${activeMemberProfile.assignment.leader||"未設定"}`:"尚未完成分組"}</p></div><span className={activeMemberProfile.concerns.length?"needs-care":"clear"}>{activeMemberProfile.concerns.length?"需要關心":"目前正常"}</span></section>
                  <section className="member-profile-stats">
                    <article><small>統計期間</small><b>{memberWindow.start}<i>至</i>{memberWindow.end}</b><p>依月份自動移動</p></article>
                    <article><small>出席積分</small><b>{activeMemberProfile.attendancePoints}<i>／20</i></b><p>{activeMemberProfile.absent} 次折算缺席</p></article>
                    <article><small>續約狀態</small><b>{activeMemberProfile.renewal?.status||"尚無資料"}</b><p>{activeMemberProfile.renewal?`${fmt(activeMemberProfile.renewal.expiryDate)} 到期`:"未進入追蹤期"}</p></article>
                    <article><small>待處理事項</small><b>{activeMemberProfile.concerns.length}</b><p>{activeMemberProfile.cases.length} 個未結案件</p></article>
                  </section>
                  <section className="panel member-concerns"><header><div><b>目前需要關心的狀態</b><small>自動整合出缺席、續約與已建立案件</small></div></header>{activeMemberProfile.concerns.length===0?<p className="member-clear">✓ 目前無待處理事項</p>:<div>{activeMemberProfile.concerns.map((concern,index)=><article key={`${concern}-${index}`}><span>!</span><div><b>{concern}</b><small>{activeMemberProfile.assignment?.committee?`建議由 ${activeMemberProfile.assignment.committee}／${activeMemberProfile.assignment.leader||"小組長"} 處理`:"尚未設定分組負責人"}</small></div></article>)}</div>}</section>
                  <details className="panel bni-connect-setup"><summary><div><b>BNI Connect 瀏覽器同步工具</b><small>避開 403・登入資料只留在你的瀏覽器</small></div><span className="connected">安全同步</span></summary><div><p>工具只會上傳會員姓名及 PALMS 統計值，不會把 BNI Token 傳到公開網站。新版可同步出席，也會自動逐一彙整全分會個人 PALMS 的完整 KPI。</p><a className="button-link" href="/downloads/bni-palms-sync-extension-v1.2.7.zip" download>1. 下載同步工具 1.2.7</a><button type="button" onClick={createBniSyncPair}>2. 產生新的配對金鑰</button>{bniSyncKey&&<label><span>同步配對金鑰（只顯示這一次）</span><input readOnly value={bniSyncKey} onFocus={event=>event.currentTarget.select()}/></label>}<ol><li>解壓縮下載檔，在 Chrome 擴充功能頁開啟「開發人員模式」並載入資料夾。</li><li>把上方配對金鑰貼入工具並儲存。</li><li>同步出席時開啟分會 PALMS 報告；同步 KPI 只要展開個人 PALMS 報告，不必逐一選會員。</li></ol></div></details>
                  <details className="panel member-scorecard">
                    <summary><header><div><b>個人紅綠燈計分</b><small>本期計算 {memberKpiWeekCount} 個例會週・點擊燈號展開明細</small></div><strong className={activeKpiLight?`kpi-light ${activeKpiLight}`:""}>{activeKpiTotal===null?`待補 ${activeKpiValues.filter(value=>value===null).length} 項`:`${activeKpiTotal} 分｜${{green:"綠燈",yellow:"黃燈",red:"紅燈",black:"黑燈"}[activeKpiLight!]}`}</strong></header></summary>
                    <div className="score-grid">
                      <article className={activeKpiScores?.attendance===null?"":"ready"}><span>出席</span><b>{activeKpiScores?.attendance??"—"}<small>／20</small></b><p>{activeMemberProfile.records.length?`缺席 ${activeMemberProfile.absent}・遲到 ${activeMemberProfile.late}・代理 ${activeMemberProfile.substitute}`:"尚無六個月 PALMS 紀錄"}</p></article>
                      <article className={activeKpiScores?.training===null?"":"ready"}><span>培訓（六個月點數）</span><b>{activeKpiScores?.training??"—"}<small>／15</small></b><input aria-label="培訓點數" type="number" min="0" step="1" value={activeMemberKpi.trainingPoints??""} onChange={event=>updateActiveMemberKpi("trainingPoints",event.target.value)} placeholder="輸入點數"/></article>
                      <article className={activeKpiScores?.visitors===null?"":"ready"}><span>六個月來賓（{memberKpiWeekCount} 週）</span><b>{activeKpiScores?.visitors??"—"}<small>／15</small></b><p>{visitorPartialScoreThreshold} 位起得 10 分・{visitorFullScoreThreshold} 位得 15 分</p><input aria-label="六個月來賓人數" type="number" min="0" step="1" value={activeMemberKpi.visitorCount??""} onChange={event=>updateActiveMemberKpi("visitorCount",event.target.value)} placeholder="輸入六個月總人數"/></article>
                      <article className={activeKpiScores?.oneToOne===null?"":"ready"}><span>每週一對一（平均）</span><b>{activeKpiScores?.oneToOne??"—"}<small>／15</small></b><input aria-label="每週一對一平均" type="number" min="0" step="0.1" value={activeMemberKpi.oneToOneWeeklyAverage??""} onChange={event=>updateActiveMemberKpi("oneToOneWeeklyAverage",event.target.value)} placeholder="例如 1.5"/></article>
                      <article className={activeKpiScores?.referrals===null?"":"ready"}><span>六個月引薦（{memberKpiWeekCount} 週）</span><b>{activeKpiScores?.referrals??"—"}<small>／20</small></b><p>{activeMemberKpi.referralTotal==null?"尚未同步引薦總數":`${activeMemberKpi.referralTotal} 張 ÷ ${memberKpiWeekCount} 週 ＝ 每週 ${activeReferralWeeklyAverage} 張`}</p><input aria-label="六個月引薦總數" type="number" min="0" step="1" value={activeMemberKpi.referralTotal??""} onChange={event=>updateActiveMemberKpi("referralTotal",event.target.value)} placeholder="輸入內外部引薦總數"/></article>
                      <article className={activeKpiScores?.dreamReferral===null?"":"ready"}><span>夢幻引薦金額（六個月）</span><b>{activeKpiScores?.dreamReferral??"—"}<small>／15</small></b><input aria-label="夢幻引薦金額" type="number" min="0" step="10000" value={activeMemberKpi.dreamReferralAmount??""} onChange={event=>updateActiveMemberKpi("dreamReferralAmount",event.target.value)} placeholder="輸入金額"/></article>
                    </div>
                    <div className="kpi-actions"><p className="score-sync-note">空白欄位維持「待補」，不會當成 0 分；全部六項完整後才產生總分與燈號。</p><button type="button" onClick={saveActiveMemberKpi}>儲存 KPI 資料</button></div>
                  </details>
                  <details className="panel member-palms-detail"><summary><div><b>最近六個月個人 PALMS 出席明細</b><small>{activeMemberProfile.records.length} 筆紀錄</small></div><span>展開</span></summary><div>{activeMemberProfile.records.length===0?<p>目前沒有可顯示的出席紀錄</p>:activeMemberProfile.records.sort((a,b)=>b.date.localeCompare(a.date)).map(record=><span key={`${record.date}-${record.code}`}>{record.date}<b>{{P:"出席",A:"缺席",L:"遲到",M:"醫療",S:"代理"}[record.code]}</b></span>)}</div></details>
                </div>}
              </div>
            </section>
          )}
          {view === "agenda" && (
            <section className="agenda-layout">
              <div className="panel agenda">
                <div className="agenda-title">
                  <div>
                    <small>
                      {archiveDate.replaceAll("-", " / ")} · 每週委員會
                    </small>
                    <h2>長佑分會會員委員會議程</h2>
                    <p>建議時間 15 分鐘 · 系統依續約與未結待辦自動整理</p>
                  </div>
                  <button
                    onClick={() => {
                      setMeetingReady(true);
                      flash("議程已鎖定，可開始開會");
                    }}
                  >
                    {meetingReady ? "✓ 議程已就緒" : "確認議程"}
                  </button>
                </div>
                {activeAgenda.map((g, i) => (
                  <article className="agenda-block" key={g.title}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{g.title}</h3>
                      {g.title === "續約與終期訪談" ? (
                        <div className="meeting-renewals">
                          {trackedRenewals.map((renewal, j) => (
                            <article
                              key={renewal.id}
                              className={
                                checkedAgenda.includes(`${i}-${j}`)
                                  ? "discussed"
                                  : ""
                              }
                            >
                              <div className="meeting-member-head">
                                <input
                                  aria-label={`標記 ${renewal.name} 已討論`}
                                  type="checkbox"
                                  checked={checkedAgenda.includes(`${i}-${j}`)}
                                  onChange={() => toggleAgenda(`${i}-${j}`)}
                                />
                                <div>
                                  <b>{renewal.name}</b>
                                  <small>
                                    {fmt(renewal.expiryDate)} 到期 · 剩{" "}
                                    {renewal.daysLeft} 天
                                  </small>
                                </div>
                                <select
                                  aria-label={`${renewal.name} 續約階段`}
                                  value={renewal.status}
                                  onChange={(e) =>
                                    setRenewalStatus(
                                      renewal.id,
                                      e.target.value as Status,
                                    )
                                  }
                                >
                                  {statusOptions.map((status) => (
                                    <option key={status}>{status}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="meeting-renewal-fields">
                                <label>
                                  <span>訪談委員</span>
                                  <select
                                    value={
                                      committeeMembers.includes(renewal.owner)
                                        ? renewal.owner
                                        : ""
                                    }
                                    onChange={(e) =>
                                      updateRenewal(renewal.id, {
                                        owner: e.target.value,
                                      })
                                    }
                                  >
                                    <option value="">未指派</option>
                                    {committeeMembers.map((member) => (
                                      <option key={member} value={member}>
                                        {member}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span>本週備註</span>
                                  <input
                                    value={
                                      renewal.note === "已進入續約追蹤期" ||
                                      renewal.note === "依到期月份列管"
                                        ? ""
                                        : renewal.note
                                    }
                                    placeholder="輸入訪談結果或下一步…"
                                    onChange={(e) =>
                                      updateRenewal(renewal.id, {
                                        note: e.target.value,
                                      })
                                    }
                                  />
                                </label>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : g.title === "來賓追蹤" ? (
                        <div className="meeting-visitors">
                          {visitorRelayForm()}
                          {activeVisitors.map((visitor, j) => (
                            <article
                              key={visitor.id}
                              className={
                                checkedAgenda.includes(`${i}-${j}`)
                                  ? "discussed"
                                  : ""
                              }
                            >
                              <div className="visitor-head">
                                <input
                                  type="checkbox"
                                  checked={checkedAgenda.includes(`${i}-${j}`)}
                                  onChange={() => toggleAgenda(`${i}-${j}`)}
                                />
                                <div>
                                  <b>{visitor.name}</b>
                                  <small>
                                    {visitor.profession} · 邀請人{" "}
                                    {visitor.inviter}
                                  </small>
                                  <small>來賓日期：{visitor.visitDate?fmt(visitor.visitDate):"尚未設定"}</small>
                                  {visitorOverdue(visitor)&&<em className="visitor-overdue">{visitorOverdue(visitor)}</em>}
                                </div>
                                <button className="visitor-delete" type="button" onClick={()=>removeVisitorFromAgenda(visitor)}>從議程移除</button>
                              </div>
                              <div className="visitor-fields">
                                <label>
                                  <span>來賓日期</span>
                                  <input type="date" value={visitor.visitDate||""} onChange={(e)=>updateVisitor(visitor.id,{visitDate:e.target.value})}/>
                                </label>
                                <label>
                                  <span>組別</span>
                                  <select value={visitor.group||""} onChange={(e)=>updateVisitor(visitor.id,{group:e.target.value})}>
                                    <option value="">未選擇</option>
                                    {Array.from({length:12},(_,index)=>String(index+1)).map((group)=><option key={group} value={group}>第 {group} 組</option>)}
                                  </select>
                                </label>
                                <label>
                                  <span>出席狀況</span>
                                  <select value={visitor.attendance} onChange={(e)=>updateVisitor(visitor.id,{attendance:e.target.value as Visitor["attendance"]})}>
                                    {["預計出席","已出席","未出席"].map((value)=><option key={value}>{value}</option>)}
                                  </select>
                                </label>
                                <label>
                                  <span>追蹤流程</span>
                                  <select
                                    value={visitor.stage||"待確認"}
                                    onChange={(e) =>
                                      updateVisitor(visitor.id, {
                                        stage: e.target.value as VisitorStage,
                                      })
                                    }
                                  >
                                    {visitorStageOptions.map((value) => (<option key={value}>{value}</option>))}
                                  </select>
                                </label>
                                <label>
                                  <span>接待委員</span>
                                  <select
                                    value={visitor.receptionOwner||""}
                                    onChange={(e) =>
                                      updateVisitor(visitor.id, {
                                        receptionOwner:e.target.value,
                                      })
                                    }
                                  >
                                    <option value="">未指派</option>
                                    {committeeMembers.map((member)=><option key={member}>{member}</option>)}
                                  </select>
                                </label>
                                <label>
                                  <span>締結委員</span>
                                  <select
                                    value={visitor.owner}
                                    onChange={(e) =>
                                      updateVisitor(visitor.id, {
                                        owner: e.target.value,
                                      })
                                    }
                                  >
                                    <option value="">未指派</option>
                                    {committeeMembers.map((member) => (
                                      <option key={member}>{member}</option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span>訪談回報</span>
                                  <select value={visitor.interviewStatus||"未聯絡"} onChange={(e)=>updateVisitorInterview(visitor,e.target.value as VisitorInterviewStatus)}>
                                    {visitorInterviewStatusOptions.map(value=><option key={value}>{value}</option>)}
                                  </select>
                                </label>
                                <label>
                                  <span>訪談日期</span>
                                  <input type="date" value={visitor.interviewDate||""} onChange={(e)=>updateVisitor(visitor.id,{interviewDate:e.target.value})}/>
                                </label>
                                <label className="visitor-note">
                                  <span>訪談結果／下一步</span>
                                  <input value={visitor.interviewResult||""} placeholder="輸入訪談結果或下一步…" onChange={(e)=>updateVisitor(visitor.id,{interviewResult:e.target.value})}/>
                                </label>
                                <label className="visitor-note">
                                  <span>新增追蹤紀錄</span>
                                  <input
                                    value={visitorLogDraft[visitor.id]||""}
                                    placeholder="輸入本次聯絡結果…"
                                    onChange={(e)=>setVisitorLogDraft({...visitorLogDraft,[visitor.id]:e.target.value})}
                                  />
                                  <button type="button" onClick={()=>addVisitorLog(visitor)}>加入紀錄</button>
                                </label>
                              </div>
                            </article>
                          ))}{visitorAddForm()}
                        </div>
                      ) : g.title === "出席與會員狀況" ? (
                        <div className="meeting-quality">
                          <section className="meeting-quality-cases">
                            <header><b>本週警戒名單</b><span>{visibleAgendaAttendanceAlerts.length} 人次</span></header>
                            {visibleAgendaAttendanceAlerts.length===0?<p>目前沒有新的 A 信、B 信或三次代理警戒</p>:visibleAgendaAttendanceAlerts.map((alert)=><article key={`${alert.member}-${alert.level}`}><div className="meeting-quality-head"><input type="checkbox" checked={false} onChange={()=>acknowledgeAttendanceAlert(alert)}/><div><b>{alert.member}</b><small>{alert.reason}・{alert.level}</small></div></div><div className="meeting-quality-route"><span>{careAssignment(alert.member)?`第 ${careAssignment(alert.member)?.groupId} 組｜委員：${careAssignment(alert.member)?.committee||"未設定"}｜小組長：${careAssignment(alert.member)?.leader||"未設定"}`:"尚未分組・待補負責人"}</span></div></article>)}
                          </section>
                          <section className="meeting-quality-cases">
                            <header><b>A／B 信與未結案件</b><span>{openQualityCases.length} 件</span></header>
                            {openQualityCases.length===0?<p>目前沒有未結案件</p>:openQualityCases.map((item,j)=><article key={item.id} className={checkedAgenda.includes(`${i}-case-${j}`)?"discussed":""}>
                              <div className="meeting-quality-head"><input type="checkbox" checked={checkedAgenda.includes(`${i}-case-${j}`)} onChange={()=>toggleAgenda(`${i}-case-${j}`)}/><div><b>{item.member}</b><small>{qualityIssueLabel(item.issue)}・{fmt(item.occurredDate)}</small></div></div>
                              <div className="meeting-quality-route">{careAssignment(item.member)?<span>第 {careAssignment(item.member)?.groupId} 組｜委員：{careAssignment(item.member)?.committee||"未設定"}｜小組長：{careAssignment(item.member)?.leader||"未設定"}</span>:<span>尚未分組・待補負責人</span>}{!item.owner&&suggestedCaseOwner(item)&&<button type="button" onClick={()=>updateQualityCase(item.id,{owner:suggestedCaseOwner(item)})}>套用建議負責人：{suggestedCaseOwner(item)}</button>}</div>
                              <div className="meeting-quality-fields"><label><span>處理進度</span><select value={item.status} onChange={event=>updateQualityCase(item.id,{status:event.target.value as QualityCase["status"]})}>{["待處理","聯絡中","已結案"].map(status=><option key={status}>{status}</option>)}</select></label><label><span>負責委員</span><select value={item.owner} onChange={event=>updateQualityCase(item.id,{owner:event.target.value})}><option value="">未指派</option>{careOwnerNames.map(member=><option key={member}>{member}</option>)}</select></label><label className="meeting-quality-note"><span>本週處理紀錄</span><input value={item.note} onChange={event=>setQualityCases(current=>current.map(currentItem=>currentItem.id===item.id?{...currentItem,note:event.target.value}:currentItem))} onBlur={event=>updateQualityCase(item.id,{note:event.target.value})} placeholder="輸入寄信、聯絡或後續安排…"/></label></div>
                              {(item.issue==="A信"||item.issue==="B信")&&<details className="meeting-letter"><summary>查看 {item.issue} 範本</summary><pre>{letterText(item.issue,item.member)}</pre><button type="button" onClick={()=>copyLetter(item.issue as "A信"|"B信",item.member)}>複製信件</button></details>}
                            </article>)}
                          </section>
                        </div>
                      ) : (
                        g.items.map((x, j) => (
                          <label key={j}>
                            <input
                              type="checkbox"
                              checked={checkedAgenda.includes(`${i}-${j}`)}
                              onChange={() => toggleAgenda(`${i}-${j}`)}
                            />
                            {x}
                          </label>
                        ))
                      )}
                    </div>
                    <time>{g.title === "續約與終期訪談" ? "10 分" : g.title === "來賓追蹤" ? "5 分" : "2 分"}</time>
                  </article>
                ))}
              </div>
              <aside className="panel meeting-note">
                <h3>會議決議速記</h3>
                <textarea
                  value={meetingNotes}
                  onChange={(e) => setMeetingNotes(e.target.value)}
                  placeholder="會議中直接記錄決議、負責人與期限…"
                />
                <button
                  className="archive-button"
                  onClick={archiveWeek}
                  disabled={archiving}
                >
                  {archiving ? "建檔中…" : "完成並建檔"}
                </button>
                <small>會後會將未完成項目帶到下週議程</small>
              </aside>
            </section>
          )}
          {view === "renewals" && (
            <section className="renewal-months">
              <div className="renewal-summary">
                <div>
                  <span>03</span>
                  <h3>未來三個月到期會員</h3>
                  <p>每月最後一週自動往後更新三個月；已排除離開或放棄會員</p>
                </div>
                <strong>
                  {trackedRenewals.length}
                  <small>追蹤中會員</small>
                </strong>
              </div>
              <div className="history-admin-bar">
                {adminStatus?.isOwner ? <span>管理員模式：可刪除紀錄</span> : <><span>只有系統擁有者可刪除會議紀錄</span><a href="/signin-with-chatgpt?return_to=/?admin=1">管理員登入</a></>}
              </div>
              {renewalGroups.map((group) => {
                const d = new Date(`${group.date}T00:00:00`);
                return (
                  <section className="panel month-group" key={group.date}>
                    <div className="month-head">
                      <div>
                        <b>
                          {d.getFullYear()} 年 {d.getMonth() + 1} 月
                        </b>
                        <span>{group.members.length} 位到期</span>
                      </div>
                      <time>{group.date.replaceAll("-", "/")}</time>
                    </div>
                    <div className="member-grid">
                      {group.members.map((r) => (
                        <article key={r.id}>
                          <div className="member-name">
                            <span>{r.name.slice(0, 1)}</span>
                            <div>
                              <b>{r.name}</b>
                              <small>
                                到期日 {fmt(r.expiryDate)} · 剩 {r.daysLeft} 天
                              </small>
                            </div>
                          </div>
                          <label>
                            <span>訪談委員</span>
                            <select
                              value={
                                committeeMembers.includes(r.owner)
                                  ? r.owner
                                  : ""
                              }
                              onChange={(e) =>
                                updateRenewal(r.id, { owner: e.target.value })
                              }
                            >
                              <option value="">未指派</option>
                              {committeeMembers.map((member) => (
                                <option key={member} value={member}>
                                  {member}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>續約進度</span>
                            <select
                              value={r.status}
                              onChange={(e) =>
                                setRenewalStatus(r.id, e.target.value as Status)
                              }
                            >
                              {statusOptions.map((status) => (
                                <option key={status}>{status}</option>
                              ))}
                            </select>
                          </label>
                          <label className="member-note">
                            <span>備註</span>
                            <input
                              value={
                                r.note === "已進入續約追蹤期" ||
                                r.note === "依到期月份列管"
                                  ? ""
                                  : r.note
                              }
                              placeholder="記錄聯絡或訪談結果…"
                              onChange={(e) =>
                                updateRenewal(r.id, { note: e.target.value })
                              }
                            />
                          </label>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
              <section className="panel stopped-renewals"><div className="stopped-head"><div><b>停止追蹤會員</b><p>預計離會或已離會的會員保留在此，可隨時恢復追蹤。</p></div><span>{stoppedRenewals.length} 位</span></div>{stoppedRenewals.length===0?<p className="stopped-empty">目前沒有停止追蹤的會員</p>:stoppedRenewals.map((renewal)=><article key={renewal.id}><div className="member-name"><span>{renewal.name.slice(0,1)}</span><div><b>{renewal.name}</b><small>{fmt(renewal.expiryDate)} 到期 · {renewal.owner||"未指派訪談委員"}</small></div></div><em className={renewal.status==="已離會"?"left":"leaving"}>{renewal.status}</em><p>{renewal.note||"尚無備註"}</p><button onClick={()=>restoreRenewal(renewal.id)}>恢復追蹤</button></article>)}</section>
            </section>
          )}
          {view === "visitors" && (
            <section className="visitor-overview">
              <div className="renewal-summary"><div><span>04</span><h3>來賓追蹤</h3><p>本週名單、跨週追蹤與歷史紀錄分開整理</p></div><strong>{retainedVisitors.length}<small>持續追蹤</small></strong></div>
              <section className="visitor-attention-summary" aria-label="來賓待處理摘要"><article><small>尚未指派</small><b>{visitorAttention.unassigned}</b><span>由副主席手動選擇締結委員</span></article><article><small>等待訪談回報</small><b>{visitorAttention.pendingInterview}</b><span>已指派但尚未完成訪談</span></article><article className={visitorAttention.overdue?"warning":""}><small>流程逾期</small><b>{visitorAttention.overdue}</b><span>需要在本週會議確認</span></article></section>
              {visitorAddForm()}
              <section className="visitor-date-group visitor-current-week"><header><div><b>本週新來賓</b><small>{fmt(visitorRelayDate)} 例會名單</small></div><span>{currentWeekVisitors.length} 位來賓</span></header>{currentWeekVisitors.length?<section className="visitor-manage-list">{currentWeekVisitors.map(visitorTrackingCard)}</section>:<p className="visitor-pipeline-empty">本週尚未匯入來賓，可從本週議程貼上接龍名單。</p>}</section>
              <section className="visitor-tracking-board"><header><div><b>跨週持續追蹤</b><small>只保留需要繼續聯絡、考慮加入或申請中的來賓</small></div><span>{retainedVisitors.length} 位</span></header><nav className="visitor-filter-bar" aria-label="持續追蹤篩選">{(["全部","未指派","待聯絡","已預約","考慮加入","申請中"] as VisitorTrackingFilter[]).map(filter=><button type="button" key={filter} className={visitorTrackingFilter===filter?"active":""} onClick={()=>setVisitorTrackingFilter(filter)}>{filter}</button>)}</nav>{filteredRetainedVisitors.length?<section className="visitor-manage-list">{filteredRetainedVisitors.map(visitor=><div className="visitor-retained-item" key={visitor.id}><div className="visitor-last-touch">最後更新 {fmt(visitorLastActivity(visitor))}<span>{visitorInactiveDays(visitor)} 天前</span></div>{visitorTrackingCard(visitor)}</div>)}</section>:<p className="visitor-pipeline-empty">這個分類目前沒有需要追蹤的來賓。</p>}</section>
              <details className="visitor-history-panel"><summary><span><b>歷史紀錄</b><small>已結束或未保留的來賓仍可依日期查詢</small></span><em>{visitorHistoryGroups.reduce((sum,[,items])=>sum+items.length,0)} 位</em></summary>{visitorHistoryGroups.length?visitorHistoryGroups.map(([date,dateVisitors])=><section className="visitor-date-group" key={date}><header><div><b>{date==="日期待補"?date:fmt(date)}</b><small>來賓日期</small></div><span>{dateVisitors.length} 位來賓</span></header><section className="visitor-manage-list">{dateVisitors.map(visitorTrackingCard)}</section></section>):<p className="visitor-pipeline-empty">目前沒有歷史紀錄。</p>}</details>
            </section>
          )}
          {view === "tasks" && (
            <section className="panel task-board">
              <div className="panel-head">
                <div>
                  <span>04</span>
                  <h3>委員任務清單</h3>
                </div>
                <p>{openTasks.length} 項未完成</p>
              </div>
              {tasks.map((t) => (
                <article
                  className={t.status === "done" ? "done" : ""}
                  key={t.id}
                >
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    onChange={() => toggleTask(t.id)}
                  />
                  <div>
                    <b>{t.title}</b>
                    <small>負責：{t.owner}</small>
                  </div>
                  <time>{fmt(t.dueDate)} 前</time>
                  <em>
                    {t.status === "doing"
                      ? "進行中"
                      : t.status === "done"
                        ? "已完成"
                        : "待處理"}
                  </em>
                </article>
              ))}
              <div className="board-add">
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="新增任務，例如：安排王小明終期訪談"
                />
                <button onClick={addTask}>新增任務</button>
              </div>
            </section>
          )}
          {view === "groups" && adminStatus?.isOwner && (
            <section className="group-page">
              <div className="renewal-summary"><div><span>05</span><h3>十二組分組管理</h3><p>將會員拖曳到各組，並設定十長、委員、導師、小組長或組員</p></div><strong>{assignedMemberNames.size}<small>已分組會員</small></strong></div>
              <div className="group-toolbar panel"><div><b>分組進度</b><small>{assignedMemberNames.size} 人已安排・{unassignedMemberNames.length} 人待安排</small></div><span>拖曳會員卡即可換組，變更後自動儲存</span><a href="/api-docs/groups" target="_blank" rel="noreferrer">API 文件 ↗</a></div>
              <div className="group-workspace">
                <aside className="panel unassigned-pool" onDragOver={event=>event.preventDefault()} onDrop={()=>moveMemberToGroup(draggedMember,null)}>
                  <header><b>待分組會員</b><span>{unassignedMemberNames.length}</span></header>
                  <div>{unassignedMemberNames.map(member=><article key={member} draggable onDragStart={()=>setDraggedMember(member)} onDragEnd={()=>setDraggedMember("")} className={draggedMember===member?"dragging":""}><span className="drag-handle">⋮⋮</span><b>{member}</b></article>)}</div>
                </aside>
                <div className="group-grid">
                  {memberGroups.map(group=><section key={group.id} className="panel member-group">
                    <header><div><b>{group.name}</b><small>{group.members.length} 人</small></div><span>依職務拖拉</span></header>
                    <div className="group-role-board">{(["十長","委員","導師","小組長","組員"] as GroupRole[]).map(role=>{const members=group.members.filter(member=>member.role===role);return <section key={role} className={`group-role-row role-${role}`} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.stopPropagation();moveMemberToRole(draggedMember,group.id,role)}}><b>{role}</b><div>{members.length===0?<small>拖至此列</small>:members.map(member=><article key={member.name} draggable onDragStart={()=>setDraggedMember(member.name)} onDragEnd={()=>setDraggedMember("")} className={draggedMember===member.name?"dragging":""}><span className="drag-handle">⋮⋮</span><strong>{member.name}</strong></article>)}</div></section>})}</div>
                  </section>)}
                </div>
              </div>
            </section>
          )}
          {view === "schedules" && (
            <section className="duty-page">
              <div className="renewal-summary"><div><span>06</span><h3>例會行政排班</h3><p>最上方為當週班表，已過日期會自動隱藏</p></div><strong>{visibleDutySchedules.length}<small>待執行週次</small></strong></div>
              <section className="duty-notice panel"><div><b>排班原則</b><small>締結優先、同週不重複；同一職務由未做過或次數較少者優先</small></div>{!adminStatus?.isOwner&&<span>目前為檢視模式</span>}</section>
              <details className="panel duty-stats"><summary><b>輪值統計</b><span>展開查看公平性</span></summary><div>{dutyCommitteeMembers.map(member=><article key={member}><b>{member}</b><span>總計 {dutyFields.reduce((sum,field)=>sum+dutySchedules.filter(row=>row[field.key]===member).length,0)} 次</span>{dutyFields.map(field=><small key={field.key}>{field.label} {dutySchedules.filter(row=>row[field.key]===member).length}</small>)}</article>)}</div></details>
              <section className="duty-week-list">
                {visibleDutySchedules.length ? visibleDutySchedules.map((row,index)=>{
                  const closers=new Set(visitors.filter(visitor=>visitor.visitDate===row.date&&visitor.owner&&visitor.stage!=="不追蹤"&&visitor.stage!=="已入會").map(visitor=>visitor.owner));
                  const assignedNames=dutyFields.map(field=>row[field.key]).filter(Boolean);
                  const assigned=assignedNames.length;
                  const duplicateNames=assignedNames.filter((value,index,all)=>all.indexOf(value)!==index);
                  const closerConflicts=assignedNames.filter(name=>closers.has(name));
                  return <article className={`panel duty-week${index===0?" current":""}${closerConflicts.length?" closer-conflict":""}`} key={row.date}>
                    <header><div><strong>{index===0?"當週排班":"後續排班"}</strong><b>{fmt(row.date)}（四）</b><small>{assigned}/{dutyFields.length} 項已安排{closers.size?` · ${closers.size} 位締結委員已排除`:""}</small></div>{closerConflicts.length?<em>與締結衝突</em>:duplicateNames.length?<em>人員重複</em>:assigned===dutyFields.length?<span>已完成</span>:<em>待安排 {dutyFields.length-assigned} 項</em>}</header>
                    {closers.size>0&&<p className="duty-closers">本週締結優先：{[...closers].join("、")}</p>}
                    <div>{dutyFields.map(field=><label key={field.key}><span>{field.label}</span>{adminStatus?.isOwner?<select value={row[field.key]} onChange={event=>updateDuty(row.date,field.key,event.target.value)}><option value="">待安排</option>{dutyCommitteeMembers.filter(member=>!closers.has(member)||member===row[field.key]).sort((a,b)=>dutySchedules.filter(schedule=>schedule[field.key]===a).length-dutySchedules.filter(schedule=>schedule[field.key]===b).length).map(member=><option key={member} disabled={closers.has(member)}>{member}</option>)}</select>:<b>{row[field.key]||"待安排"}</b>}</label>)}</div>
                  </article>
                }) : <section className="panel duty-empty">目前沒有待執行的行政排班</section>}
              </section>
            </section>
          )}
          {view === "quality" && (
            <section className="quality-page">
              <div className="renewal-summary"><div><span>05</span><h3>出缺席管理</h3><p>記錄會員出席異常、信件與關懷進度；未結案件會自動加入本週議程</p></div><strong>{openQualityCases.length}<small>待處理案件</small></strong></div>
              <p className="quality-rule-note"><b>缺席折算：</b>滾動六個月內每 2 次遲到（L）折算 1 次缺席；單數剩餘的遲到仍保留為遲到。</p>
              <section className={`panel palms-health ${attendanceHealth.status}`}><header><div><b>PALMS 資料狀態</b><small>以最近一個星期四為應有例會日期，自動檢查來源是否可安全同步</small></div><strong>{attendanceHealth.status==="ready"?"可同步":attendanceHealth.status==="incomplete"?"資料不完整":attendanceHealth.status==="waiting"?"等待新週資料":"尚無資料"}</strong></header><div><span><small>最新 PALMS</small><b>{attendanceHealth.latestDate||"—"}</b></span><span><small>應有例會</small><b>{attendanceHealth.expectedDate}</b></span><span><small>最新週涵蓋</small><b>{attendanceHealth.latestCount}/{attendanceHealth.activeCount}</b></span><span><small>完整度</small><b>{attendanceHealth.coverage}%</b></span></div>{attendanceHealth.status==="waiting"&&<p>BNI Connect 尚未出現 {attendanceHealth.expectedDate}，目前不應覆蓋或把空白算成缺席。</p>}{attendanceHealth.status==="incomplete"&&<p>最新週缺少：{attendanceHealth.missingMembers.slice(0,12).join("、")}{attendanceHealth.missingMembers.length>12?` 等 ${attendanceHealth.missingMembers.length} 人`:""}</p>}</section>
              <section className="panel attendance-matrix-panel"><div className="attendance-rollup-head"><div><b>PALMS 出席矩陣</b><small>固定會員姓名、依月份橫向檢視；L/A 表示該次遲到已折算為缺席</small></div><div className="attendance-legend"><button type="button" className={`perfect-filter ${hidePerfectAttendance?"active":""}`} aria-pressed={hidePerfectAttendance} onClick={()=>setHidePerfectAttendance(value=>!value)}><span className="perfect-filter-icon">✓</span><span className="perfect-filter-copy"><b>{hidePerfectAttendance?"已隱藏全勤會員":"隱藏全勤會員"}</b><small>{perfectAttendanceCount} 位全勤</small></span><span className="perfect-filter-switch"><i/></span></button><span className="code-P">P 出席</span><span className="code-A">A 缺席</span><span className="code-L">L 遲到</span><span className="code-L">L/A 遲到折算缺席</span><span className="code-M">M 醫療</span><span className="code-S">S 代理</span></div></div>{attendanceMatrix.members.length===0?<p className="quality-empty">尚未匯入 PALMS 出席資料</p>:visibleAttendanceMembers.length===0?<p className="quality-empty">目前顯示範圍內全部會員皆為全勤</p>:<div className="attendance-matrix-wrap"><table className="attendance-matrix"><thead><tr><th rowSpan={2}>會員</th>{attendanceMatrix.months.map(group=><th key={group.month} colSpan={group.dates.length} className={group.month===attendanceSummary.current?"current-month":""}>{group.month.replace("-"," 年 ")} 月</th>)}<th rowSpan={2}>缺席</th><th rowSpan={2}>代理</th></tr><tr>{attendanceMatrix.dates.map(date=><th key={date} className={date.startsWith(attendanceSummary.current)?"current-month":""}>{date.slice(8)}</th>)}</tr></thead><tbody>{visibleAttendanceMembers.map(member=>{const summary=attendanceSummary.rows.find(([name])=>name===member)?.[1];return <tr key={member}><th>{member}</th>{attendanceMatrix.dates.map(date=>{const key=`${member}|${date}`,code=attendanceMatrix.lookup.get(key),displayCode=code==="L"&&attendanceMatrix.convertedLateKeys.has(key)?"L/A":code;return <td key={date} className={code?`code-${code}`:""}>{displayCode||"·"}</td>})}<td className="total-a">{summary?.absent||0}</td><td className="total-s">{summary?.substitute||0}</td></tr>})}</tbody></table></div>}</section>
              <section className="panel quality-alerts"><div className="attendance-rollup-head"><div><b>出缺席處理名單</b><small>依滾動式六個月缺席與代理次數，自動分成三種處理方式</small></div><span>{qualityAlerts.length} 項待確認</span></div><div className="quality-alert-groups">{([{issue:"A信",title:"需要 A 信",tone:"a"},{issue:"B信",title:"需要 B 信",tone:"b"},{issue:"關懷",title:"需要組長關懷",tone:"care"}] as const).map(group=>{const items=qualityAlerts.filter(alert=>alertIssue(alert)===group.issue),groupCases=visibleQualityCases.filter(item=>item.issue===group.issue||(group.issue==="關懷"&&["缺席","遲到","替代人"].includes(item.issue)));return <section key={group.issue} className={`quality-alert-group ${group.tone}`}><header><b>{group.title}</b><span>{items.length} 人・{groupCases.length} 個案</span></header>{items.length===0?<p>目前無待建立名單</p>:<div className="quality-alert-list">{items.map((alert,index)=><article key={`${alert.member}-${alert.level}-${index}`}><div><b>{alert.member}</b><small>{alert.reason}</small><small className="care-route">{careAssignment(alert.member)?`第 ${careAssignment(alert.member)?.groupId} 組｜委員：${careAssignment(alert.member)?.committee||"未設定"}｜小組長：${careAssignment(alert.member)?.leader||"未設定"}`:"尚未分組"}</small></div>{alert.level==="組長關懷"?<div className="oral-care"><span>組長口頭關懷</span><small>{careAssignment(alert.member)?.leader?`由 ${careAssignment(alert.member)?.leader} 關懷`:"待補小組長"}</small></div>:<button type="button" className={`alert-create ${hasOpenAlertCase(alert)?"created":""}`} disabled={hasOpenAlertCase(alert)} onClick={()=>createQualityCaseFromAlert(alert)}><span>{alert.level}</span><small>{hasOpenAlertCase(alert)?"已建立案件":suggestedAlertOwner(alert)?`＋ 指派 ${suggestedAlertOwner(alert)}`:"＋ 建立案件（待補負責人）"}</small></button>}</article>)}</div>}<div className="quality-group-cases"><h4>已建立個案</h4>{groupCases.length===0?<p>尚無個案</p>:groupCases.map(item=><article key={item.id} className={item.status==="已結案"?"resolved":""}><div className="case-heading"><b>{item.member}</b><small>{fmt(item.occurredDate)} · {qualityIssueLabel(item.issue)}</small></div><select value={item.status} onChange={e=>updateQualityCase(item.id,{status:e.target.value as QualityCase["status"]})}>{["待處理","聯絡中","已結案"].map(v=><option key={v}>{v}</option>)}</select><select value={item.owner} onChange={e=>updateQualityCase(item.id,{owner:e.target.value})}><option value="">未指派</option>{careOwnerNames.map(v=><option key={v}>{v}</option>)}</select><input value={item.note} onChange={e=>setQualityCases(current=>current.map(x=>x.id===item.id?{...x,note:e.target.value}:x))} onBlur={e=>updateQualityCase(item.id,{note:e.target.value})} placeholder="追蹤備註"/>{(item.issue==="A信"||item.issue==="B信")&&<details className="letter-preview"><summary>預覽 {item.issue} 內容</summary><pre>{letterText(item.issue,item.member)}</pre><button type="button" onClick={()=>copyLetter(item.issue as "A信"|"B信",item.member)}>複製信件內容</button></details>}<button type="button" className="quality-delete" onClick={()=>deleteQualityCase(item)}>刪除</button></article>)}</div></section>})}</div></section>
              <details className="panel attendance-rollup"><summary className="attendance-rollup-head attendance-rollup-toggle"><div><b>滾動式六個月統計摘要</b><small>{attendanceSummary.startKey}～{attendanceSummary.endKey} 為正式數字；{attendanceSummary.current} 為本月暫計</small></div><span><i className="rollup-chevron">⌄</i><em className="rollup-action">展開摘要</em></span></summary>{attendanceSummary.rows.length===0?<p className="quality-empty">尚未匯入 PALMS 資料</p>:<div className="attendance-table"><div className="attendance-row head"><b>會員</b><b>六個月缺席</b><b>六個月代理人</b><b>本月缺席</b><b>本月代理人</b></div>{attendanceSummary.rows.map(([member,row])=><details key={member}><summary className="attendance-row"><b>{member}</b><span>{row.absent}</span><span>{row.substitute}</span><span>{row.currentAbsent}</span><span>{row.currentSubstitute}</span></summary><div className="attendance-detail">{row.details.sort((a,b)=>b.date.localeCompare(a.date)).map(record=><span key={`${record.date}-${record.code}`}>{record.date}｜{{P:"出席",A:"缺席",L:"遲到",M:"醫療",S:"代理人"}[record.code]}</span>)}</div></details>)}</div>}</details>
              {adminStatus?.isOwner&&<details className="panel attendance-import admin-tools"><summary><div><b>管理員工具</b><small>PALMS 每週同步・{attendanceUpdatedAt?`上次同步 ${new Date(attendanceUpdatedAt).toLocaleString("zh-TW")}`:"尚未同步"}</small></div><span>展開</span></summary><div className="admin-tools-body"><textarea aria-label="PALMS 匯入資料" value={attendanceImportDraft} onChange={e=>{setAttendanceImportDraft(e.target.value);setAttendancePreview(null)}} placeholder="貼入本週 PALMS 完整資料"/><div className="palms-sync-actions"><button type="button" onClick={previewAttendanceImport}>1. 預覽差異</button><button type="button" className="confirm" disabled={!attendancePreview} onClick={importAttendance}>2. 確認同步</button></div>{attendancePreview&&<section className="palms-preview"><header><b>同步前預覽</b><span>{attendancePreview.records.length} 筆有效紀錄</span></header><div><span><b>{attendancePreview.added}</b>新增</span><span><b>{attendancePreview.changed}</b>代碼變更</span><span><b>{attendancePreview.unchanged}</b>相同</span><span><b>{attendancePreview.missing}</b>來源缺漏</span><span><b>{attendancePreview.excluded}</b>非在籍排除</span></div>{attendancePreview.missingMembers.length>0&&<p>未出現在來源的在籍會員：{attendancePreview.missingMembers.slice(0,12).join("、")}{attendancePreview.missingMembers.length>12?` 等 ${attendancePreview.missingMembers.length} 人`:""}</p>}</section>}</div></details>}
              <section className="panel quality-create"><input value={qualityDraft.member} onChange={e=>setQualityDraft({...qualityDraft,member:e.target.value})} placeholder="會員姓名＊"/><select value={qualityDraft.issue} onChange={e=>setQualityDraft({...qualityDraft,issue:e.target.value as QualityCase["issue"]})}>{qualityIssueOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><input type="date" value={qualityDraft.occurredDate} onChange={e=>setQualityDraft({...qualityDraft,occurredDate:e.target.value})}/><select value={qualityDraft.owner} onChange={e=>setQualityDraft({...qualityDraft,owner:e.target.value})}><option value="">未指派委員</option>{committeeMembers.map(v=><option key={v}>{v}</option>)}</select><input value={qualityDraft.note} onChange={e=>setQualityDraft({...qualityDraft,note:e.target.value})} placeholder="備註／需處理事項"/><button onClick={addQualityCase}>新增出缺席案件</button></section>
            </section>
          )}
          {view === "history" && (
            <section className="history-list">
              <div className="renewal-summary">
                <div>
                  <span>05</span>
                  <h3>會議紀錄儲存</h3>
                  <p>每週各自保存議程、來賓追蹤與續約追蹤，後續可獨立檢視或重新編輯</p>
                </div>
                <strong>
                  {archives.length}
                  <small>已建檔週次</small>
                </strong>
              </div>
              {archives.length === 0 ? (
                <section className="panel history-empty">
                  <b>尚無建檔紀錄</b>
                  <p>完成本週議程後，按「完成並建檔」即可建立第一筆。</p>
                </section>
              ) : (
                archives.map((archive) => (
                  <section className="panel history-card" key={archive.id}>
                    <div className="history-head">
                      <div>
                        <small>
                          {archive.meetingDate.replaceAll("-", " / ")}
                        </small>
                        <h3>{archive.title}</h3>
                      </div>
                      <div className="history-actions"><span>已建檔</span><button onClick={()=>reopenArchive(archive)}>重新開啟編輯</button>{adminStatus?.isOwner&&<button className="delete-archive" onClick={()=>deleteArchive(archive)}>刪除紀錄</button>}</div>
                    </div>
                    <div className="history-stats">
                      <div>
                        <b>{archive.checked.length}</b>
                        <small>已討論項目</small>
                      </div>
                      <div>
                        <b>
                          {archive.agenda.reduce(
                            (sum, item) => sum + item.items.length,
                            0,
                          ) - archive.checked.length}
                        </b>
                        <small>未完成項目</small>
                      </div>
                      <div>
                        <b>{archive.renewals.length}</b>
                        <small>續約追蹤會員</small>
                      </div>
                      <div>
                        <b>{archive.visitors.length}</b>
                        <small>當週來賓</small>
                      </div>
                    </div>
                    {archive.notes && (
                      <div className="history-notes">
                        <b>會議決議</b>
                        <p>{archive.notes}</p>
                      </div>
                    )}
                    <details>
                      <summary>查看當週議程與勾選結果</summary>
                      {archive.agenda.map((group, i) => (
                        <div className="history-agenda" key={group.title}>
                          <b>{group.title}</b>
                          {group.items.map((item, j) => (
                            <p
                              key={j}
                              className={
                                archive.checked.includes(`${i}-${j}`)
                                  ? "checked"
                                  : ""
                              }
                            >
                              {archive.checked.includes(`${i}-${j}`)
                                ? "✓"
                                : "○"}{" "}
                              {item}
                            </p>
                          ))}
                        </div>
                      ))}
                    </details>
                    <details className="history-tracking">
                      <summary>查看當週來賓追蹤（{archive.visitors.length}）</summary>
                      {archive.visitors.length === 0 ? <p className="history-no-data">本週沒有來賓資料</p> : (
                        <div className="history-snapshot-list">
                          {archive.visitors.map((visitor) => (
                            <article key={visitor.id}>
                              <div><b>{visitor.name}</b><small>{visitor.visitDate ? fmt(visitor.visitDate) : "日期待補"} · {visitor.profession || "專業別待補"}</small></div>
                              <span>{visitor.attendance}</span>
                              <span>{visitor.stage || "待確認"}</span>
                              <p>締結委員：{visitor.owner || "未指派"}{visitor.note ? `｜${visitor.note}` : ""}</p>
                            </article>
                          ))}
                        </div>
                      )}
                    </details>
                    <details className="history-tracking">
                      <summary>查看當週續約追蹤（{archive.renewals.length}）</summary>
                      {archive.renewals.length === 0 ? <p className="history-no-data">本週沒有續約追蹤資料</p> : (
                        <div className="history-snapshot-list renewal-snapshot-list">
                          {archive.renewals.map((renewal) => (
                            <article key={renewal.id}>
                              <div><b>{renewal.name}</b><small>{fmt(renewal.expiryDate)} 到期</small></div>
                              <span>{renewal.status}</span>
                              <span>{renewal.owner || "未指派"}</span>
                              <p>{renewal.note || "尚無備註"}</p>
                            </article>
                          ))}
                        </div>
                      )}
                    </details>
                  </section>
                ))
              )}
            </section>
          )}
        </div>
        {notice && <div className="toast">✓　{notice}</div>}
      </main>
      {adminLoginOpen&&<div className="admin-login-backdrop" role="presentation" onMouseDown={()=>setAdminLoginOpen(false)}><section className="admin-login-modal" role="dialog" aria-modal="true" aria-labelledby="admin-login-title" onMouseDown={event=>event.stopPropagation()}><button type="button" className="admin-login-close" aria-label="關閉" onClick={()=>setAdminLoginOpen(false)}>×</button><div className="admin-login-icon">🔐</div><small>BNI 長佑分會</small><h2 id="admin-login-title">系統管理員登入</h2>{adminStatus?.isOwner?<><p>你已經以系統擁有者身分登入，分組管理、會員主檔與 PALMS 同步均已解鎖。</p><a className="admin-login-primary" href="/signout-with-chatgpt?return_to=/">登出管理員</a></>:<><p>請使用系統擁有者的 ChatGPT 帳號登入。同一帳號可在手機或其他電腦開啟管理功能。</p><a className="admin-login-primary" href="/signin-with-chatgpt?return_to=/?admin=1" target="_top">使用擁有者帳號登入</a><small className="admin-login-note">委員與一般使用者不需登入，仍可使用公開功能。</small></>}</section></div>}
    </div>
  );
}
