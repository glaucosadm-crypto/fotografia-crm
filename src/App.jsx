import { useState, useEffect, useRef } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const STATUS = {
  novo:       { label: "Novo Contato",        color: "#60A5FA", bg: "rgba(96,165,250,0.12)"  },
  orcamento:  { label: "Orçamento Enviado",   color: "#FBBF24", bg: "rgba(251,191,36,0.12)"  },
  aguardando: { label: "Aguardando Resposta", color: "#FB923C", bg: "rgba(251,146,60,0.12)"  },
  negociando: { label: "Em Negociação",       color: "#C084FC", bg: "rgba(192,132,252,0.12)" },
  fechado:    { label: "Fechado ✓",           color: "#34D399", bg: "rgba(52,211,153,0.12)"  },
  perdido:    { label: "Perdido",             color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
};
const TIPOS      = ["Casamento","Ensaio Casal","Ensaio Gestante","Newborn","Aniversário","Família","15 Anos","Corporativo","Outro"];
const PAGAMENTOS = ["Completo","50% entrada + 50% entrega","30/70","Parcelado","A combinar"];

// ─── SEED ─────────────────────────────────────────────────────────────────────
const SEED = [
  { id:1, nome:"Mariana & Rafael", telefone:"11991110001", tipo:"Casamento",      status:"orcamento",  dataEvento:"2026-07-12", followup:"2026-04-21", valor:"4500", pago:"2250", pagamento:"50% entrada + 50% entrega", notas:"Quer álbum premium. Igreja às 16h.", ultimoContato:"2026-04-18", calEventId:null, calFollowId:null },
  { id:2, nome:"Juliana Costa",    telefone:"11991110002", tipo:"Ensaio Gestante",status:"aguardando", dataEvento:"2026-05-03", followup:"2026-04-20", valor:"900",  pago:"0",    pagamento:"Completo",                  notas:"Aguardando resposta sobre data.", ultimoContato:"2026-04-16", calEventId:null, calFollowId:null },
  { id:3, nome:"Família Oliveira", telefone:"11991110003", tipo:"Família",        status:"negociando", dataEvento:"2026-05-18", followup:"2026-04-21", valor:"1400", pago:"0",    pagamento:"A combinar",               notas:"Quer desconto, 3 crianças.", ultimoContato:"2026-04-19", calEventId:null, calFollowId:null },
  { id:4, nome:"Ana Lima",         telefone:"11991110004", tipo:"15 Anos",        status:"fechado",    dataEvento:"2026-06-14", followup:"2026-05-10", valor:"3200", pago:"1600", pagamento:"50% entrada + 50% entrega", notas:"Festa no salão Estrela.", ultimoContato:"2026-04-15", calEventId:null, calFollowId:null },
  { id:5, nome:"Pedro & Camila",   telefone:"11991110005", tipo:"Ensaio Casal",   status:"novo",       dataEvento:"2026-05-25", followup:"2026-04-22", valor:"800",  pago:"0",    pagamento:"Completo",                  notas:"Indicação da Mariana.", ultimoContato:"2026-04-20", calEventId:null, calFollowId:null },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const todayStr   = () => new Date().toISOString().split("T")[0];
const fmtDate    = s => { if(!s) return "—"; const [y,m,d]=s.split("-"); return `${d}/${m}/${y}`; };
const fmtMoney   = v => `R$\u00a0${(parseFloat(v)||0).toLocaleString("pt-BR",{minimumFractionDigits:2})}`;
const diasAtraso = s => { if(!s) return -99; const d=new Date(s+"T00:00:00"),h=new Date(); h.setHours(0,0,0,0); return Math.floor((h-d)/86400000); };
const getMonth   = s => s?s.slice(0,7):"";

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const KEY      = "fotografia_crm_v3";
const loadData = () => { try { const r=JSON.parse(localStorage.getItem(KEY)); if(r?.length) return r; } catch{} return SEED; };
const saveData = d => { try { localStorage.setItem(KEY,JSON.stringify(d)); } catch{} };

// ─── API CALLS (seguras via /api/) ────────────────────────────────────────────
async function callAI(messages, system) {
  const res  = await fetch("/api/claude", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({messages,system}) });
  const data = await res.json();
  async function callAI(messages, system) {
  const res  = await fetch("/api/claude", ...
    throw new Error(data.error || `Erro ${res.status}`);
  }
  return (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n") || "Sem resposta.";
}

async function callCalendar(prompt) {
  const res  = await fetch("/api/calendar", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({prompt}) });
  const data = await res.json();
  const texts = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("\n");
  const mcps  = (data.content||[]).filter(b=>b.type==="mcp_tool_result").map(b=>{ try{return JSON.parse(b.content?.[0]?.text||"{}")}catch{return {}} });
  let eventId = null;
  try { const j=JSON.parse(texts.replace(/```json|```/g,"").trim()); eventId=j.eventId||j.id; } catch{}
  if(!eventId && mcps.length) eventId=mcps[0]?.id||mcps[0]?.eventId;
  return eventId;
}

async function criarEvento(client, tipo) {
  const isFollow = tipo==="followup";
  const data     = isFollow ? client.followup : client.dataEvento;
  if(!data) return { ok:false };
  const titulo   = isFollow ? `🔔 Follow-up: ${client.nome}` : `📷 ${client.tipo}: ${client.nome}`;
  const desc     = `Cliente: ${client.nome}\nTipo: ${client.tipo}\nValor: ${fmtMoney(client.valor)}\nTelefone: ${client.telefone}\nNotas: ${client.notas}`;
  const prompt   = `Crie no Google Agenda um evento chamado "${titulo}" no dia ${data} das 09:00 às 10:00, fuso America/Sao_Paulo. Descrição: ${desc}. Responda só com JSON: {"eventId":"..."}`;
  const eventId  = await callCalendar(prompt);
  return { ok:true, eventId };
}

async function deletarEvento(eventId) {
  if(!eventId) return;
  await callCalendar(`Delete o evento com id "${eventId}" do Google Agenda.`);
}

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [clients, setClients]     = useState(loadData);
  const [view, setView]           = useState("dashboard");
  const [activeId, setActiveId]   = useState(null);
  const [filter, setFilter]       = useState("todos");
  const [search, setSearch]       = useState("");
  const [toast, setToast]         = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [aiOpen, setAiOpen]       = useState(false);
  const [aiChat, setAiChat]       = useState([]);
  const [aiInput, setAiInput]     = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [calLoading, setCalLoading] = useState({});
  const [reportMonth, setReportMonth] = useState(todayStr().slice(0,7));
  const chatEnd = useRef(null);

  const blank = { nome:"", telefone:"", tipo:"Casamento", status:"novo", dataEvento:"", followup:"", valor:"", pago:"0", pagamento:"50% entrada + 50% entrega", notas:"", ultimoContato:todayStr(), calEventId:null, calFollowId:null };
  const [form, setForm] = useState(blank);

  useEffect(()=>{ saveData(clients); },[clients]);
  useEffect(()=>{ chatEnd.current?.scrollIntoView({behavior:"smooth"}); },[aiChat]);

  const toast_ = (msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),4000); };

  // ── stats ──
  const ativos    = clients.filter(c=>!["fechado","perdido"].includes(c.status));
  const alertas   = ativos.filter(c=>diasAtraso(c.followup)>=0).sort((a,b)=>diasAtraso(b.followup)-diasAtraso(a.followup));
  const fechados  = clients.filter(c=>c.status==="fechado");
  const pipeline  = ativos.reduce((s,c)=>s+(parseFloat(c.valor)||0),0);
  const recebido  = clients.reduce((s,c)=>s+(parseFloat(c.pago)||0),0);
  const aReceber  = fechados.reduce((s,c)=>s+(parseFloat(c.valor)||0)-(parseFloat(c.pago)||0),0);

  const mesC      = clients.filter(c=>getMonth(c.dataEvento)===reportMonth);
  const mesR      = mesC.filter(c=>c.status==="fechado").reduce((s,c)=>s+(parseFloat(c.valor)||0),0);
  const mesP      = mesC.filter(c=>c.status!=="perdido").reduce((s,c)=>s+(parseFloat(c.valor)||0),0);
  const mesPago   = mesC.reduce((s,c)=>s+(parseFloat(c.pago)||0),0);
  const mesAR     = mesC.filter(c=>c.status==="fechado").reduce((s,c)=>s+(parseFloat(c.valor)||0)-(parseFloat(c.pago)||0),0);

  // ── crud ──
  const openNew  = () => { setForm({...blank}); setActiveId(null); setView("form"); };
  const openEdit = c  => { setForm({...c}); setActiveId(c.id); setView("form"); };
  const save = () => {
    if(!form.nome.trim()) return toast_("Nome obrigatório","err");
    if(activeId) setClients(cs=>cs.map(c=>c.id===activeId?{...form,id:activeId}:c));
    else         setClients(cs=>[...cs,{...form,id:Date.now()}]);
    toast_(activeId?"Cliente atualizado ✓":"Cliente adicionado ✓");
    setView("list");
  };
  const del = id => { setClients(cs=>cs.filter(c=>c.id!==id)); setConfirmDel(null); toast_("Removido."); if(view==="form") setView("list"); };
  const followupFeito = id => {
    const d=new Date(); d.setDate(d.getDate()+3);
    setClients(cs=>cs.map(c=>c.id===id?{...c,ultimoContato:todayStr(),followup:d.toISOString().split("T")[0]}:c));
    toast_("Follow-up registrado! Próximo em 3 dias 🗓️");
  };
  const waLink = (tel,nome) => `https://wa.me/55${(tel||"").replace(/\D/g,"")}?text=${encodeURIComponent(`Olá ${nome}! Tudo bem? Passando para dar continuidade ao atendimento 😊`)}`;

  // ── calendar ──
  const syncCal = async (client, tipo) => {
    const key=`${client.id}_${tipo}`;
    setCalLoading(l=>({...l,[key]:true}));
    try {
      const oldId = tipo==="evento" ? client.calEventId : client.calFollowId;
      if(oldId) await deletarEvento(oldId);
      const {ok,eventId} = await criarEvento(client, tipo);
      if(ok) {
        setClients(cs=>cs.map(c=>c.id===client.id?{...c,[tipo==="evento"?"calEventId":"calFollowId"]:eventId||"synced"}:c));
        toast_(`📅 ${tipo==="evento"?"Evento":"Follow-up"} adicionado ao Google Agenda!`);
      }
    } catch { toast_("Erro ao conectar com o Google Agenda","err"); }
    setCalLoading(l=>({...l,[key]:false}));
  };

  const syncTodos = async () => {
    const lista = clients.filter(c=>!["perdido"].includes(c.status)&&c.dataEvento);
    toast_(`Sincronizando ${lista.length} eventos…`);
    for(const c of lista) {
      await syncCal(c,"evento");
      if(c.followup&&!["fechado","perdido"].includes(c.status)) await syncCal(c,"followup");
    }
    toast_("✅ Todos os eventos sincronizados!");
  };

  // ── ai ──
  const buildSys = () => {
    const lista = clients.map(c=>`- ${c.nome} | ${c.tipo} | ${STATUS[c.status].label} | Valor: ${fmtMoney(c.valor)} | Pago: ${fmtMoney(c.pago)} | Evento: ${fmtDate(c.dataEvento)} | Follow-up: ${fmtDate(c.followup)} | Notas: ${c.notas}`).join("\n");
    return `Você é assistente de CRM para estúdio de fotografia. Dados:\n${lista}\n\nHoje: ${fmtDate(todayStr())}. Follow-ups pendentes: ${alertas.length}. Pipeline: ${fmtMoney(pipeline)}. A receber: ${fmtMoney(aReceber)}.\n\nResponda em português, seja direto e prático. Para mensagens de WhatsApp, formate entre aspas.`;
  };

  const sendAI = async () => {
    if(!aiInput.trim()||aiLoading) return;
    const msg = aiInput.trim(); setAiInput("");
    const chat = [...aiChat,{role:"user",content:msg}]; setAiChat(chat);
    setAiLoading(true);
    try {
      const reply = await callAI(chat.map(m=>({role:m.role,content:m.content})), buildSys());
      setAiChat(c=>[...c,{role:"assistant",content:reply}]);
    } catch(e) { setAiChat(c=>[...c,{role:"assistant",content:`❌ Erro: ${e.message}\n\nVerifique se a chave ANTHROPIC_API_KEY está configurada corretamente no Vercel e se foi feito Redeploy após salvar.`}]); }
    setAiLoading(false);
  };

  const quickPrompts = [
    "Quem precisa de follow-up urgente hoje?",
    "Me escreva mensagens de WhatsApp para cada cliente pendente",
    "Como está meu pipeline e previsão de receita?",
    "Quais clientes tenho risco de perder?",
    "Sugira estratégia para fechar os orçamentos em aberto",
  ];

  const filtered = clients
    .filter(c=>(filter==="todos"||c.status===filter)&&(c.nome.toLowerCase().includes(search.toLowerCase())||c.telefone.includes(search)))
    .sort((a,b)=>diasAtraso(b.followup)-diasAtraso(a.followup));

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"#080B10",color:"#E2E8F0",fontFamily:"'DM Sans',system-ui,sans-serif",position:"relative",overflowX:"hidden"}}>
      <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,background:"radial-gradient(ellipse 70% 50% at 75% 5%,rgba(96,165,250,0.07) 0%,transparent 65%),radial-gradient(ellipse 50% 40% at 5% 90%,rgba(52,211,153,0.04) 0%,transparent 65%)"}}/>

      {/* TOAST */}
      {toast&&<div style={{position:"fixed",top:20,right:20,zIndex:9999,background:toast.type==="err"?"#EF4444":"#059669",color:"#fff",padding:"12px 22px",borderRadius:12,fontWeight:700,fontSize:14,boxShadow:"0 8px 32px rgba(0,0,0,0.5)",animation:"slideIn .2s ease",maxWidth:320}}>{toast.msg}</div>}

      {/* CONFIRM DELETE */}
      {confirmDel&&<Modal onClose={()=>setConfirmDel(null)}><div style={{textAlign:"center"}}>
        <div style={{fontSize:44,marginBottom:12}}>🗑️</div>
        <div style={{fontWeight:800,fontSize:18,marginBottom:8}}>Remover cliente?</div>
        <div style={{color:"#6B7280",marginBottom:24,fontSize:14}}>Esta ação não pode ser desfeita.</div>
        <div style={{display:"flex",gap:12,justifyContent:"center"}}>
          <Btn onClick={()=>setConfirmDel(null)} ghost>Cancelar</Btn>
          <Btn onClick={()=>del(confirmDel)} danger>Remover</Btn>
        </div>
      </div></Modal>}

      {/* AI PANEL */}
      {aiOpen&&<div style={{position:"fixed",inset:0,zIndex:900,display:"flex",justifyContent:"flex-end"}}>
        <div onClick={()=>setAiOpen(false)} style={{flex:1,background:"rgba(0,0,0,0.5)"}}/>
        <div style={{width:"min(460px,100vw)",background:"#0C0F16",borderLeft:"1px solid rgba(255,255,255,0.06)",display:"flex",flexDirection:"column",height:"100vh",animation:"slideR .25s ease"}}>
          <div style={{padding:"20px 20px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
            <div>
              <div style={{fontWeight:800,fontSize:16,display:"flex",alignItems:"center",gap:8}}>✨ Assistente IA</div>
              <div style={{color:"#4B5563",fontSize:12,marginTop:2}}>Pergunte sobre clientes, agenda e estratégia</div>
            </div>
            <button onClick={()=>setAiOpen(false)} style={{background:"transparent",border:"none",color:"#6B7280",cursor:"pointer",fontSize:22}}>✕</button>
          </div>
          {aiChat.length===0&&<div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.04)",flexShrink:0}}>
            <div style={{color:"#4B5563",fontSize:11,fontWeight:700,marginBottom:10,letterSpacing:1}}>SUGESTÕES</div>
            {quickPrompts.map((p,i)=><button key={i} onClick={()=>setAiInput(p)} style={{display:"block",width:"100%",background:"rgba(96,165,250,0.06)",border:"1px solid rgba(96,165,250,0.12)",borderRadius:10,padding:"9px 14px",color:"#93C5FD",fontSize:12,cursor:"pointer",textAlign:"left",fontFamily:"inherit",marginBottom:7}}>{p}</button>)}
          </div>}
          <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:12}}>
            {aiChat.map((m,i)=><div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
              <div style={{maxWidth:"90%",background:m.role==="user"?"rgba(96,165,250,0.18)":"rgba(255,255,255,0.04)",border:`1px solid ${m.role==="user"?"rgba(96,165,250,0.25)":"rgba(255,255,255,0.06)"}`,borderRadius:14,padding:"10px 14px",fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap",color:m.role==="user"?"#BFDBFE":"#D1D5DB"}}>{m.content}</div>
            </div>)}
            {aiLoading&&<div style={{display:"flex"}}><div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:14,padding:"10px 18px",fontSize:13,color:"#4B5563"}}>✨ Pensando…</div></div>}
            <div ref={chatEnd}/>
          </div>
          <div style={{padding:"14px 16px",borderTop:"1px solid rgba(255,255,255,0.06)",flexShrink:0,display:"flex",gap:10}}>
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendAI()} placeholder="Pergunte sobre seus atendimentos…" style={{flex:1,padding:"11px 14px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:"#E2E8F0",fontSize:13,outline:"none",fontFamily:"inherit"}}/>
            <button onClick={sendAI} disabled={aiLoading} style={{padding:"0 18px",borderRadius:12,border:"none",background:aiLoading?"#1F2937":"linear-gradient(135deg,#60A5FA,#818CF8)",color:"#fff",cursor:aiLoading?"not-allowed":"pointer",fontSize:18,flexShrink:0}}>→</button>
          </div>
        </div>
      </div>}

      {/* MAIN */}
      <div style={{position:"relative",zIndex:1,maxWidth:980,margin:"0 auto",padding:"24px 16px 56px"}}>

        {/* NAV */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:42,height:42,borderRadius:13,background:"linear-gradient(135deg,#60A5FA,#34D399)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>📷</div>
            <div>
              <div style={{fontWeight:800,fontSize:20,letterSpacing:-0.5}}>FotoGestão Pro</div>
              <div style={{color:"#374151",fontSize:12}}>CRM + IA + Google Agenda</div>
            </div>
          </div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
            {[["dashboard","📊 Painel"],["list","👥 Clientes"],["relatorio","💰 Relatório"],["agenda","📅 Agenda"]].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)} style={{padding:"8px 14px",borderRadius:10,fontSize:13,fontWeight:600,cursor:"pointer",border:"1px solid rgba(255,255,255,0.07)",background:view===v?"rgba(96,165,250,0.15)":"transparent",color:view===v?"#60A5FA":"#6B7280"}}>{l}</button>
            ))}
            <button onClick={()=>setAiOpen(true)} style={{padding:"8px 14px",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",border:"1px solid rgba(192,132,252,0.25)",background:"rgba(192,132,252,0.08)",color:"#C084FC"}}>✨ IA</button>
            <button onClick={openNew} style={{padding:"8px 18px",borderRadius:10,fontSize:13,fontWeight:700,background:"linear-gradient(135deg,#60A5FA,#818CF8)",color:"#fff",border:"none",cursor:"pointer"}}>+ Novo</button>
          </div>
        </div>

        {/* DASHBOARD */}
        {view==="dashboard"&&<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(148px,1fr))",gap:12,marginBottom:24}}>
            {[
              {icon:"📁",label:"Em andamento",v:ativos.length,color:"#60A5FA",mono:false},
              {icon:"✅",label:"Fechados",v:fechados.length,color:"#34D399",mono:false},
              {icon:"⚠️",label:"Alertas hoje",v:alertas.length,color:"#FB923C",mono:false},
              {icon:"💼",label:"Pipeline",v:fmtMoney(pipeline),color:"#FBBF24",mono:true},
              {icon:"💸",label:"Recebido",v:fmtMoney(recebido),color:"#34D399",mono:true},
              {icon:"⏳",label:"A receber",v:fmtMoney(aReceber),color:"#C084FC",mono:true},
            ].map(s=><div key={s.label} style={{background:"#0F1219",border:"1px solid rgba(255,255,255,0.05)",borderRadius:16,padding:"18px 16px"}}>
              <div style={{fontSize:26,marginBottom:8}}>{s.icon}</div>
              <div style={{fontWeight:800,fontSize:s.mono?16:26,color:s.color,lineHeight:1.1}}>{s.v}</div>
              <div style={{color:"#374151",fontSize:12,marginTop:4}}>{s.label}</div>
            </div>)}
          </div>
          <Sec title="⚠️ Follow-ups Pendentes" badge={alertas.length} bc="#FB923C">
            {alertas.length===0?<Empty icon="🎉" text="Nenhum follow-up pendente. Ótimo trabalho!"/>
              :alertas.map(c=><Card key={c.id} c={c} cL={calLoading} onEdit={openEdit} onWA={waLink} onFU={followupFeito} onSync={syncCal}/>)}
          </Sec>
          <Sec title="📊 Funil de Vendas">
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
              {Object.entries(STATUS).map(([k,cfg])=>{
                const n=clients.filter(c=>c.status===k).length;
                const v=clients.filter(c=>c.status===k).reduce((s,c)=>s+(parseFloat(c.valor)||0),0);
                return <div key={k} onClick={()=>{setFilter(k);setView("list");}} style={{background:"#0F1219",border:`1px solid ${cfg.color}18`,borderTop:`3px solid ${cfg.color}`,borderRadius:12,padding:16,cursor:"pointer"}}>
                  <div style={{fontWeight:800,fontSize:26,color:cfg.color,lineHeight:1}}>{n}</div>
                  <div style={{fontSize:11,color:"#4B5563",margin:"4px 0",lineHeight:1.3}}>{cfg.label}</div>
                  {v>0&&<div style={{fontSize:11,color:cfg.color,fontWeight:700}}>{fmtMoney(v)}</div>}
                </div>;
              })}
            </div>
          </Sec>
        </>}

        {/* LIST */}
        {view==="list"&&<>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
            <input placeholder="🔍 Nome ou telefone…" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:200,padding:"10px 14px",borderRadius:10,background:"#0F1219",border:"1px solid rgba(255,255,255,0.07)",color:"#E2E8F0",fontSize:14,outline:"none"}}/>
            <select value={filter} onChange={e=>setFilter(e.target.value)} style={{padding:"10px 14px",borderRadius:10,background:"#0F1219",border:"1px solid rgba(255,255,255,0.07)",color:"#E2E8F0",fontSize:14}}>
              <option value="todos">Todos</option>
              {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          {filtered.length===0?<Empty icon="🔍" text="Nenhum cliente encontrado."/>
            :filtered.map(c=><Card key={c.id} c={c} full cL={calLoading} onEdit={openEdit} onWA={waLink} onFU={followupFeito} onDel={id=>setConfirmDel(id)} onSync={syncCal}/>)}
        </>}

        {/* RELATORIO */}
        {view==="relatorio"&&<>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
            <div style={{fontWeight:700,fontSize:15}}>Mês dos eventos:</div>
            <input type="month" value={reportMonth} onChange={e=>setReportMonth(e.target.value)} style={{padding:"8px 14px",borderRadius:10,background:"#0F1219",border:"1px solid rgba(255,255,255,0.07)",color:"#E2E8F0",fontSize:14}}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:12,marginBottom:24}}>
            {[
              {icon:"📅",label:"Eventos no mês",v:mesC.length,color:"#60A5FA",mono:false},
              {icon:"🎯",label:"Fechados",v:mesC.filter(c=>c.status==="fechado").length,color:"#34D399",mono:false},
              {icon:"💼",label:"Total (pipeline)",v:fmtMoney(mesP),color:"#FBBF24",mono:true},
              {icon:"✅",label:"Receita confirmada",v:fmtMoney(mesR),color:"#34D399",mono:true},
              {icon:"💸",label:"Já recebido",v:fmtMoney(mesPago),color:"#C084FC",mono:true},
              {icon:"⏳",label:"A receber",v:fmtMoney(mesAR),color:"#FB923C",mono:true},
            ].map(s=><div key={s.label} style={{background:"#0F1219",border:"1px solid rgba(255,255,255,0.05)",borderRadius:16,padding:"18px 16px"}}>
              <div style={{fontSize:26,marginBottom:8}}>{s.icon}</div>
              <div style={{fontWeight:800,fontSize:s.mono?16:26,color:s.color,lineHeight:1.1}}>{s.v}</div>
              <div style={{color:"#374151",fontSize:12,marginTop:4,lineHeight:1.3}}>{s.label}</div>
            </div>)}
          </div>
          <div style={{background:"#0F1219",border:"1px solid rgba(255,255,255,0.05)",borderRadius:16,overflow:"hidden",marginBottom:20}}>
            <div style={{padding:"16px 20px",borderBottom:"1px solid rgba(255,255,255,0.05)",fontWeight:700,fontSize:14}}>Eventos de {reportMonth.split("-")[1]}/{reportMonth.split("-")[0]}</div>
            {mesC.length===0?<div style={{padding:32,textAlign:"center",color:"#374151",fontSize:14}}>Nenhum evento neste mês.</div>
              :mesC.map((c,i)=>{
                const r=(parseFloat(c.valor)||0)-(parseFloat(c.pago)||0);
                return <div key={c.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderTop:i===0?"none":"1px solid rgba(255,255,255,0.04)",flexWrap:"wrap",gap:8}}>
                  <div style={{flex:1,minWidth:160}}>
                    <div style={{fontWeight:700,fontSize:14}}>{c.nome}</div>
                    <div style={{color:"#6B7280",fontSize:12}}>{c.tipo} · {fmtDate(c.dataEvento)}</div>
                  </div>
                  <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
                    <Pill color={STATUS[c.status].color} bg={STATUS[c.status].bg}>{STATUS[c.status].label}</Pill>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:700,fontSize:14}}>{fmtMoney(c.valor)}</div>
                      <div style={{fontSize:11,color:r>0?"#FB923C":"#34D399"}}>{r>0?`Falta ${fmtMoney(r)}`:"Pago ✓"}</div>
                    </div>
                  </div>
                </div>;
              })}
          </div>
          {mesP>0&&<div style={{background:"#0F1219",border:"1px solid rgba(255,255,255,0.05)",borderRadius:16,padding:20}}>
            <div style={{fontWeight:700,marginBottom:16,fontSize:14}}>📈 Previsão de Caixa</div>
            <Bar label="Total do mês (pipeline)"  v={mesP}    max={mesP} color="#60A5FA"/>
            <Bar label="Receita confirmada"        v={mesR}    max={mesP} color="#34D399"/>
            <Bar label="Já recebido"               v={mesPago} max={mesP} color="#C084FC"/>
            <Bar label="A receber"                 v={mesAR}   max={mesP} color="#FB923C"/>
          </div>}
        </>}

        {/* AGENDA */}
        {view==="agenda"&&<>
          <div style={{background:"#0F1219",border:"1px solid rgba(52,211,153,0.15)",borderRadius:16,padding:24,marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,marginBottom:16}}>
              <div>
                <div style={{fontWeight:800,fontSize:16,display:"flex",alignItems:"center",gap:8}}>📅 Google Agenda</div>
                <div style={{color:"#4B5563",fontSize:13,marginTop:2}}>Sincronize eventos e follow-ups na sua agenda</div>
              </div>
              <button onClick={syncTodos} style={{padding:"10px 20px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#34D399,#059669)",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>🔄 Sincronizar Todos</button>
            </div>
            <div style={{background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.1)",borderRadius:12,padding:"14px 16px",fontSize:13,color:"#6EE7B7",lineHeight:1.6}}>
              💡 Clique em <strong>📅 Evento</strong> para adicionar o dia da sessão, ou <strong>🔔 Follow-up</strong> para criar um lembrete. A IA também pode criar eventos por comando: <em>"Cria lembrete para ligar para Ana amanhã às 10h"</em>.
            </div>
          </div>
          {clients.filter(c=>c.status!=="perdido").sort((a,b)=>{ if(!a.dataEvento) return 1; if(!b.dataEvento) return -1; return new Date(a.dataEvento)-new Date(b.dataEvento); }).map(c=>{
            const eL=calLoading[`${c.id}_evento`], fL=calLoading[`${c.id}_followup`];
            const r=(parseFloat(c.valor)||0)-(parseFloat(c.pago)||0);
            return <div key={c.id} style={{background:"#0F1219",border:"1px solid rgba(255,255,255,0.05)",borderRadius:14,padding:16,marginBottom:10}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                <div style={{flex:1,minWidth:180}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{fontWeight:700,fontSize:15}}>{c.nome}</span>
                    <Pill color={STATUS[c.status].color} bg={STATUS[c.status].bg}>{STATUS[c.status].label}</Pill>
                  </div>
                  <div style={{fontSize:12,color:"#6B7280",display:"flex",gap:14,flexWrap:"wrap"}}>
                    <span>📸 {c.tipo}</span>
                    {c.dataEvento&&<span>📅 <strong style={{color:"#E2E8F0"}}>{fmtDate(c.dataEvento)}</strong></span>}
                    {c.followup&&<span>🔔 <strong style={{color:"#E2E8F0"}}>{fmtDate(c.followup)}</strong></span>}
                    <span style={{color:r>0?"#FB923C":"#34D399"}}>{r>0?`💰 Falta ${fmtMoney(r)}`:"✅ Pago"}</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                  {c.dataEvento&&<button onClick={()=>syncCal(c,"evento")} disabled={eL} style={{padding:"8px 13px",borderRadius:9,border:`1px solid ${c.calEventId?"rgba(52,211,153,0.4)":"rgba(96,165,250,0.25)"}`,background:c.calEventId?"rgba(52,211,153,0.1)":"rgba(96,165,250,0.07)",color:c.calEventId?"#34D399":"#93C5FD",fontSize:12,fontWeight:700,cursor:eL?"wait":"pointer"}}>{eL?"⏳":c.calEventId?"✅ Evento":"📅 Evento"}</button>}
                  {c.followup&&!["fechado","perdido"].includes(c.status)&&<button onClick={()=>syncCal(c,"followup")} disabled={fL} style={{padding:"8px 13px",borderRadius:9,border:`1px solid ${c.calFollowId?"rgba(251,191,36,0.4)":"rgba(192,132,252,0.25)"}`,background:c.calFollowId?"rgba(251,191,36,0.1)":"rgba(192,132,252,0.07)",color:c.calFollowId?"#FBBF24":"#C084FC",fontSize:12,fontWeight:700,cursor:fL?"wait":"pointer"}}>{fL?"⏳":c.calFollowId?"✅ Follow-up":"🔔 Follow-up"}</button>}
                  <button onClick={()=>openEdit(c)} style={{padding:"8px 10px",background:"rgba(255,255,255,0.04)",color:"#6B7280",border:"1px solid rgba(255,255,255,0.06)",borderRadius:9,fontSize:12,cursor:"pointer"}}>✏️</button>
                </div>
              </div>
            </div>;
          })}
        </>}

        {/* FORM */}
        {view==="form"&&<>
          <button onClick={()=>setView("list")} style={{background:"transparent",border:"none",color:"#6B7280",cursor:"pointer",fontSize:14,marginBottom:20,display:"flex",alignItems:"center",gap:6}}>← Voltar</button>
          <div style={{background:"#0F1219",border:"1px solid rgba(255,255,255,0.05)",borderRadius:20,padding:28}}>
            <div style={{fontWeight:800,fontSize:18,marginBottom:24}}>{activeId?"✏️ Editar Cliente":"➕ Novo Cliente"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <F label="Nome *"           value={form.nome}        onChange={v=>setForm(p=>({...p,nome:v}))}        placeholder="Ex: Ana & Carlos"/>
              <F label="WhatsApp"         value={form.telefone}    onChange={v=>setForm(p=>({...p,telefone:v}))}    placeholder="11999990000"/>
              <F label="Valor total (R$)" value={form.valor}       onChange={v=>setForm(p=>({...p,valor:v}))}       type="number" placeholder="2000"/>
              <F label="Já recebido (R$)" value={form.pago}        onChange={v=>setForm(p=>({...p,pago:v}))}        type="number" placeholder="0"/>
              <F label="Data do evento"   value={form.dataEvento}  onChange={v=>setForm(p=>({...p,dataEvento:v}))}  type="date"/>
              <F label="Follow-up"        value={form.followup}    onChange={v=>setForm(p=>({...p,followup:v}))}    type="date"/>
              <F label="Último contato"   value={form.ultimoContato} onChange={v=>setForm(p=>({...p,ultimoContato:v}))} type="date"/>
              <SF label="Pagamento" value={form.pagamento} onChange={v=>setForm(p=>({...p,pagamento:v}))} opts={PAGAMENTOS}/>
              <SF label="Tipo"      value={form.tipo}      onChange={v=>setForm(p=>({...p,tipo:v}))}      opts={TIPOS}/>
              <SF label="Status"    value={form.status}    onChange={v=>setForm(p=>({...p,status:v}))}    opts={Object.entries(STATUS).map(([k,v])=>({val:k,label:v.label}))}/>
            </div>
            <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:6}}>
              <label style={{fontSize:12,color:"#6B7280",fontWeight:600}}>Notas</label>
              <textarea value={form.notas} onChange={e=>setForm(p=>({...p,notas:e.target.value}))} rows={3} placeholder="Detalhes, pedidos especiais, histórico…" style={{padding:"10px 12px",borderRadius:10,background:"#080B10",border:"1px solid rgba(255,255,255,0.08)",color:"#E2E8F0",fontSize:14,resize:"vertical",fontFamily:"inherit"}}/>
            </div>
            <div style={{display:"flex",gap:10,marginTop:22,justifyContent:"flex-end",flexWrap:"wrap"}}>
              {activeId&&<Btn onClick={()=>setConfirmDel(activeId)} danger>Remover</Btn>}
              <Btn onClick={()=>setView("list")} ghost>Cancelar</Btn>
              <Btn onClick={save} primary>Salvar</Btn>
            </div>
          </div>
        </>}
      </div>

      <style>{`
        @keyframes slideIn{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideR{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:translateX(0)}}
        *{box-sizing:border-box}
        input[type=date]::-webkit-calendar-picker-indicator,
        input[type=month]::-webkit-calendar-picker-indicator{filter:invert(.4)}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-thumb{background:#1F2937;border-radius:4px}
        select option{background:#0F1219}
      `}</style>
    </div>
  );
}

// ── sub-components ──────────────────────────────────────────────────────────
function Card({c,full,cL,onEdit,onWA,onFU,onDel,onSync}){
  const at=diasAtraso(c.followup),isA=!["fechado","perdido"].includes(c.status),late=isA&&at>=0;
  const uc=at>=2?"#EF4444":at>=0?"#FB923C":"#FBBF24";
  const r=(parseFloat(c.valor)||0)-(parseFloat(c.pago)||0);
  const eL=cL[`${c.id}_evento`],fL=cL[`${c.id}_followup`];
  return <div style={{background:"#0F1219",border:`1px solid ${late&&at>=2?"rgba(239,68,68,0.18)":"rgba(255,255,255,0.05)"}`,borderLeft:late?`3px solid ${uc}`:"3px solid transparent",borderRadius:14,padding:16,marginBottom:10,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
    <div style={{flex:1,minWidth:200}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:15}}>{c.nome}</span>
        <Pill color={STATUS[c.status].color} bg={STATUS[c.status].bg}>{STATUS[c.status].label}</Pill>
        <span style={{color:"#374151",fontSize:12}}>{c.tipo}</span>
      </div>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12,color:"#6B7280"}}>
        {c.telefone&&<span>📱 {c.telefone}</span>}
        {c.valor&&<span style={{color:"#FBBF24",fontWeight:600}}>💰 {fmtMoney(c.valor)}</span>}
        {c.status==="fechado"&&<span style={{color:r>0?"#FB923C":"#34D399"}}>{r>0?`⏳ falta ${fmtMoney(r)}`:"✓ pago"}</span>}
        {c.dataEvento&&<span>📅 {fmtDate(c.dataEvento)}</span>}
        {c.followup&&<span style={{color:late?uc:"#6B7280",fontWeight:late?700:400}}>🔔 {fmtDate(c.followup)}{late?` · ${at===0?"hoje":`${at}d atraso`}`:""}</span>}
      </div>
      {c.notas&&<div style={{color:"#374151",fontSize:12,marginTop:6,fontStyle:"italic"}}>"{c.notas.slice(0,90)}{c.notas.length>90?"…":""}"</div>}
    </div>
    <div style={{display:"flex",gap:7,flexWrap:"wrap",flexShrink:0}}>
      {c.telefone&&<a href={onWA(c.telefone,c.nome)} target="_blank" rel="noreferrer" style={{padding:"7px 12px",background:"#16A34A",color:"#fff",borderRadius:8,fontSize:12,fontWeight:700,textDecoration:"none"}}>WhatsApp</a>}
      {c.dataEvento&&<button onClick={()=>onSync(c,"evento")} disabled={eL} style={{padding:"7px 10px",background:c.calEventId?"rgba(52,211,153,0.1)":"rgba(96,165,250,0.07)",color:c.calEventId?"#34D399":"#93C5FD",border:`1px solid ${c.calEventId?"rgba(52,211,153,0.2)":"rgba(96,165,250,0.15)"}`,borderRadius:8,fontSize:11,cursor:eL?"wait":"pointer",fontWeight:700}}>{eL?"⏳":c.calEventId?"✅":"📅"}</button>}
      {c.followup&&isA&&<button onClick={()=>onSync(c,"followup")} disabled={fL} style={{padding:"7px 10px",background:c.calFollowId?"rgba(251,191,36,0.1)":"rgba(192,132,252,0.07)",color:c.calFollowId?"#FBBF24":"#C084FC",border:`1px solid ${c.calFollowId?"rgba(251,191,36,0.2)":"rgba(192,132,252,0.15)"}`,borderRadius:8,fontSize:11,cursor:fL?"wait":"pointer",fontWeight:700}}>{fL?"⏳":c.calFollowId?"✅":"🔔"}</button>}
      {isA&&<button onClick={()=>onFU(c.id)} style={{padding:"7px 10px",background:"rgba(52,211,153,0.08)",color:"#34D399",border:"1px solid rgba(52,211,153,0.18)",borderRadius:8,fontSize:12,cursor:"pointer",fontWeight:700}}>✓</button>}
      <button onClick={()=>onEdit(c)} style={{padding:"7px 10px",background:"rgba(255,255,255,0.03)",color:"#9CA3AF",border:"1px solid rgba(255,255,255,0.06)",borderRadius:8,fontSize:12,cursor:"pointer"}}>✏️</button>
      {full&&onDel&&<button onClick={()=>onDel(c.id)} style={{padding:"7px 10px",background:"rgba(239,68,68,0.06)",color:"#EF4444",border:"1px solid rgba(239,68,68,0.12)",borderRadius:8,fontSize:12,cursor:"pointer"}}>🗑️</button>}
    </div>
  </div>;
}
function Sec({title,badge,bc,children}){return <div style={{marginBottom:24}}><div style={{fontWeight:700,fontSize:15,marginBottom:14,display:"flex",alignItems:"center",gap:8}}>{title}{badge>0&&<span style={{background:bc,color:"#080B10",borderRadius:20,padding:"2px 10px",fontSize:12,fontWeight:800}}>{badge}</span>}</div>{children}</div>;}
function Empty({icon,text}){return <div style={{background:"#0F1219",border:"1px solid rgba(255,255,255,0.05)",borderRadius:14,padding:32,textAlign:"center",color:"#374151",fontSize:14}}><div style={{fontSize:36,marginBottom:10}}>{icon}</div>{text}</div>;}
function Pill({color,bg,children}){return <span style={{background:bg,color,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{children}</span>;}
function Modal({children,onClose}){return <div style={{position:"fixed",inset:0,zIndex:999,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:"#111318",border:"1px solid rgba(255,255,255,0.08)",borderRadius:20,padding:36,maxWidth:360,width:"90%"}}>{children}</div></div>;}
function F({label,value,onChange,type="text",placeholder}){return <div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,color:"#6B7280",fontWeight:600}}>{label}</label><input type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)} style={{padding:"10px 12px",borderRadius:10,background:"#080B10",border:"1px solid rgba(255,255,255,0.08)",color:"#E2E8F0",fontSize:14,outline:"none",fontFamily:"inherit"}}/></div>;}
function SF({label,value,onChange,opts}){return <div style={{display:"flex",flexDirection:"column",gap:6}}><label style={{fontSize:12,color:"#6B7280",fontWeight:600}}>{label}</label><select value={value} onChange={e=>onChange(e.target.value)} style={{padding:"10px 12px",borderRadius:10,background:"#080B10",border:"1px solid rgba(255,255,255,0.08)",color:"#E2E8F0",fontSize:14}}>{opts.map(o=>typeof o==="string"?<option key={o}>{o}</option>:<option key={o.val} value={o.val}>{o.label}</option>)}</select></div>;}
function Btn({children,onClick,primary,ghost,danger}){const bg=primary?"linear-gradient(135deg,#60A5FA,#818CF8)":danger?"transparent":ghost?"#1F2937":"transparent";const col=primary?"#fff":danger?"#EF4444":"#9CA3AF";const bdr=danger?"1px solid rgba(239,68,68,0.3)":primary?"none":"1px solid rgba(255,255,255,0.1)";return <button onClick={onClick} style={{padding:"10px 22px",borderRadius:10,border:bdr,background:bg,color:col,cursor:"pointer",fontWeight:700,fontSize:14,fontFamily:"inherit"}}>{children}</button>;}
function Bar({label,v,max,color}){const p=max>0?Math.round((v/max)*100):0;return <div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:13}}><span style={{color:"#9CA3AF"}}>{label}</span><span style={{fontWeight:700,color}}>{fmtMoney(v)} <span style={{color:"#374151",fontWeight:400,fontSize:11}}>({p}%)</span></span></div><div style={{height:8,background:"rgba(255,255,255,0.05)",borderRadius:8,overflow:"hidden"}}><div style={{height:"100%",width:`${p}%`,background:color,borderRadius:8,transition:"width .4s ease"}}/></div></div>;}
