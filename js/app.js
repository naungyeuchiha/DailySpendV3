/* Pages, editing, loans, recurring bills */
let addType="expense",charts=[],tab="tx",current="";
const ROUTES=["home","dash","tx","set"];
const ymNow=()=>iso(new Date()).slice(0,7);
const dueDay=b=>Math.min(Math.max(1,+b.day||1),new Date(new Date().getFullYear(),new Date().getMonth()+1,0).getDate());
const unpaid=()=>D.Bills.filter(b=>b.lastPaid!==ymNow());
const loanPaid=id=>sum(D.Transactions,t=>t.loanId===id&&t.type==="expense");
const catOpts=sel=>D.Categories.filter(c=>c.id!=="loanpay"||c.id===sel).map(c=>`<option value="${c.id}"${c.id===sel?" selected":""}>${esc(c.name)}</option>`).join("");
const emptyMsg=t=>`<div class="empty">${t}</div>`;

function daily(){const n=new Date(),tx=D.Transactions.filter(t=>t.date.startsWith(ymNow()));
 const inc=sum(tx,t=>t.type!=="expense"),exp=sum(tx,t=>t.type==="expense"),bud=budOf("ALL"),base=bud||inc,res=sum(unpaid(),()=>true);
 const dim=new Date(n.getFullYear(),n.getMonth()+1,0).getDate(),days=dim-n.getDate()+1,rem=base-exp-res;
 return{rem,days,res,base,exp,per:rem/days,src:bud?"monthly budget":"this month's income",today:sum(D.Transactions,t=>t.date===iso(n)&&t.type==="expense")}}

/* ----- recurring bills ----- */
function payBill(b,date=iso(new Date())){D.Transactions.push({id:uid(),date,type:"expense",amount:b.amount,categoryId:b.categoryId,note:b.name,loanId:"",billId:b.id});b.lastPaid=ymNow();dirty.add("Bills");dirty.add("Transactions")}
function autoBills(){const d=new Date().getDate();let n=0;
 D.Bills.forEach(b=>{if(String(b.auto)==="1"&&b.lastPaid!==ymNow()&&d>=dueDay(b)){payBill(b,ymNow()+"-"+String(dueDay(b)).padStart(2,"0"));n++}});
 if(n)toast(n+" recurring bill"+(n>1?"s":"")+" added",true,false)}

/* ----- navigation ----- */
function go(p){if(!ROUTES.includes(p))p="home";current=p;location.hash=p;
 $$(".page").forEach(s=>s.hidden=s.id!=="p-"+p);const pg=$("#p-"+p);pg.classList.add("enter");setTimeout(()=>pg.classList.remove("enter"),1400);
 $$("#nav button").forEach(b=>b.classList.toggle("on",b.dataset.p===p));pill();render();stagger();scrollTo({top:0})}
$("#nav").onclick=e=>{const b=e.target.closest("button");if(b)go(b.dataset.p)};
addEventListener("hashchange",()=>{const h=location.hash.slice(1);if(user&&h!==current)go(h)});
function render(){if(!user)return;({home:rHome,dash:rDash,tx:rTx,set:rSet}[current]||rHome)()}
const redrawCharts=()=>{if(current==="dash"&&user)rDash()};

/* ----- home ----- */
const RING=213.6,cur=()=>esc(S("currency")||"$");
function rHome(){const d=daily(),p=d.base>0?Math.min(1,d.exp/d.base):0,td=new Date().getDate();
 $("#daily").innerHTML=`<div class="hero-top"><div><small>Available per day</small><div class="big" id="dbig"></div></div><div class="ring"><svg viewBox="0 0 80 80"><circle class="trk" cx="40" cy="40" r="34"/><circle class="val" id="ringv" cx="40" cy="40" r="34"/></svg><b>${Math.round(p*100)}%</b></div></div>
 <small>${moneyH(d.rem)} left of ${d.src}${d.res?` after ${moneyH(d.res)} for bills`:""} · ÷ ${d.days} days left (incl. today)</small>
 <div class="hstats"><div><small>Today</small><b>${moneyH(d.today)}</b></div><div><small>This month</small><b>${moneyH(d.exp)}</b></div><div><small>Bills due</small><b>${moneyH(d.res)}</b></div></div>`;
 countUp($("#dbig"),d.per,"daily");requestAnimationFrame(fitAll);
 requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=$("#ringv");if(r)r.style.strokeDashoffset=RING*(1-p)}));
 const ub=unpaid().sort((a,b)=>dueDay(a)-dueDay(b));$("#billsCard").hidden=!ub.length;
 $("#billsDue").innerHTML=ub.map((b,i)=>{const dd=dueDay(b)-td;return`<div class="item" style="--i:${i}"><span class="dot" style="background:${cat(b.categoryId).color}"></span><div>${esc(b.name)}<small>${dd<0?"Overdue by "+-dd+" day"+(dd<-1?"s":""):dd===0?"Due today":"Due in "+dd+" day"+(dd>1?"s":"")} · ${moneyH(b.amount)}</small></div><button class="mini" data-pay="${b.id}">Pay</button></div>`}).join("");
 const rec=[...D.Transactions].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0).slice(0,6);
 $("#recent").innerHTML=rec.length?rec.map((t,i)=>{const c=t.type==="expense"?cat(t.categoryId):{name:t.type==="loan_in"?"Loan received":"Income",color:"#10b981"};
  return`<div class="item tap" data-id="${t.id}" style="--i:${i}"><span class="dot" style="background:${c.color}"></span><div>${esc(t.note||c.name)}<small>${esc(c.name)} · ${t.date}</small></div><span class="${t.type==="expense"?"":"inc"}">${t.type==="expense"?"-":"+"}${moneyH(t.amount)}</span></div>`}).join(""):emptyMsg("Nothing yet. Tap “Add transaction” to start.")}
$("#tAdd").onclick=()=>addTxSheet();$("#tLoan").onclick=()=>loanSheet();$("#tPay").onclick=()=>paySheet();$("#tBill").onclick=()=>editBill();
$("#seeAll").onclick=()=>go("tx");
$("#recent").onclick=e=>{const r=e.target.closest(".item");if(r)editTx(r.dataset.id)};
$("#billsDue").onclick=e=>{const b=D.Bills.find(x=>x.id===e.target.dataset.pay);if(!b)return;payBill(b);commit("Bills","");successFx("Bill paid","-"+money(b.amount),"expense")};

function addTxSheet(){const cats=D.Categories.filter(c=>c.id!=="loanpay");let type="expense",catId=cats[0]?cats[0].id:"";
 openSheet("Add transaction",`<div class="seg slide" id="a_seg"><button class="on" data-t="expense" type="button">💸 Expense</button><button data-t="income" type="button">💰 Income</button></div>
 <label for="a_amt">Amount</label><div class="amtbox"><span>${cur()}</span><input id="a_amt" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></div>
 <div id="a_catw"><label>Category</label><div class="chips" id="a_cats">${cats.map(c=>`<button type="button" class="cchip${c.id===catId?" on":""}" data-id="${c.id}"><i style="background:${c.color}"></i>${esc(c.name)}</button>`).join("")}</div></div>
 <label for="a_note">Note</label><input id="a_note" maxlength="60" placeholder="What was it for? (optional)">
 <label for="a_dt">Date</label><div class="datebar"><input id="a_dt" type="date" value="${iso(new Date())}"><button type="button" class="cchip" data-off="0">Today</button><button type="button" class="cchip" data-off="1">Yesterday</button></div>`,{
  icon:"➕",saveLabel:"Add expense",
  onSave(){const a=+$("#a_amt").value;if(!(a>0)){toast("Enter an amount",false,false);$("#a_amt").focus();return false}
   const inc=type==="income",amt=Math.round(a*100)/100;
   D.Transactions.push({id:uid(),date:$("#a_dt").value||iso(new Date()),type,amount:amt,categoryId:inc?"":catId,note:$("#a_note").value.trim(),loanId:"",billId:""});
   commit("Transactions","");successFx(inc?"Income added":"Expense added",(inc?"+":"-")+money(amt),inc?"income":"expense")}});
 $("#sheetBody").onclick=e=>{const c=e.target.closest("#a_cats .cchip"),s=e.target.closest("#a_seg button"),d=e.target.closest("[data-off]");
  if(c){catId=c.dataset.id;$$("#a_cats .cchip").forEach(x=>x.classList.toggle("on",x===c))}
  if(s){type=s.dataset.t;const inc=type==="income";$("#a_seg").style.setProperty("--k",inc?1:0);$$("#a_seg button").forEach(x=>x.classList.toggle("on",x===s));$("#a_catw").hidden=inc;const b=$("#shSave");b.textContent=inc?"Add income":"Add expense";b.classList.toggle("inc-btn",inc)}
  if(d){const x=new Date();x.setDate(x.getDate()-d.dataset.off);$("#a_dt").value=iso(x)}};
 setTimeout(()=>{const i=$("#a_amt");if(i&&!$("#sheet").hidden)i.focus({preventScroll:true})},520)}

function loanSheet(){
 openSheet("New loan",`<p class="mute" style="margin:0">Money you received that must be paid back. It is recorded as income.</p>
 <label for="n_name">Loan name</label><input id="n_name" maxlength="40" placeholder="e.g. Car loan">
 <label for="n_amt">Amount received</label><div class="amtbox"><span>${cur()}</span><input id="n_amt" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></div>
 <label for="n_dt">Date</label><input id="n_dt" type="date" value="${iso(new Date())}">`,{
  icon:"🏦",saveLabel:"Create loan",
  onSave(){const n=$("#n_name").value.trim(),a=+$("#n_amt").value;if(!n||!(a>0)){toast("Enter loan name and amount",false,false);return false}
   const l={id:uid(),name:n,principal:a,date:$("#n_dt").value||iso(new Date())};D.Loans.push(l);
   D.Transactions.push({id:uid(),date:l.date,type:"loan_in",amount:a,categoryId:"",note:"Loan: "+n,loanId:l.id,billId:""});
   dirty.add("Loans");commit("Transactions","");successFx("Loan created","+"+money(a),"loan")}})}

function paySheet(){const open=D.Loans.filter(l=>l.principal-loanPaid(l.id)>0.004),owe=id=>{const l=D.Loans.find(x=>x.id===id);return l?l.principal-loanPaid(id):0};let sel=open[0]&&open[0].id;
 openSheet("Loan payback",open.length?`<label>Choose loan</label><div class="lcards" id="p_loans">${open.map(l=>`<button type="button" class="lcard${l.id===sel?" on":""}" data-id="${l.id}"><b>${esc(l.name)}</b><small>Owe ${moneyH(owe(l.id))}</small></button>`).join("")}</div>
 <label for="p_amt">Payment</label><div class="amtbox"><span>${cur()}</span><input id="p_amt" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></div>
 <button type="button" class="cchip" data-full="1" style="margin-top:8px">Pay full balance</button>
 <label for="p_dt">Date</label><input id="p_dt" type="date" value="${iso(new Date())}">`:`<div class="empty">No open loans. Create a loan first.</div>`,{
  icon:"💳",saveLabel:"Pay & record as expense",
  onSave(){const l=D.Loans.find(x=>x.id===sel),a=+$("#p_amt").value;if(!l)return false;
   if(!(a>0)){toast("Enter payment",false,false);return false}
   if(a>owe(sel)+0.004){toast("More than the balance owed",false,false);return false}
   D.Transactions.push({id:uid(),date:$("#p_dt").value||iso(new Date()),type:"expense",amount:Math.round(a*100)/100,categoryId:"loanpay",note:"Loan payback: "+l.name,loanId:sel,billId:""});
   commit("Transactions","");successFx("Payment recorded","-"+money(a),"pay")}});
 if(!open.length){$("#shSave").hidden=true;return}
 $("#sheetBody").onclick=e=>{const c=e.target.closest(".lcard"),f=e.target.closest("[data-full]");
  if(c){sel=c.dataset.id;$$("#p_loans .lcard").forEach(x=>x.classList.toggle("on",x===c))}
  if(f)$("#p_amt").value=owe(sel).toFixed(2)}}

/* ----- dashboard ----- */
function rDash(){const m=$("#dm").value||($("#dm").value=ymNow()),tx=D.Transactions.filter(t=>t.date.startsWith(m));
 const inc=sum(tx,t=>t.type!=="expense"),exp=sum(tx,t=>t.type==="expense");
 $("#kpis").innerHTML=`<div class="card"><small>Income</small><b class="inc" id="k1"></b></div><div class="card"><small>Expenses</small><b id="k2"></b></div><div class="card"><small>Balance</small><b id="k3"></b></div>`;
 countUp($("#k1"),inc,"k1");countUp($("#k2"),exp,"k2");countUp($("#k3"),inc-exp,"k3");
 if(window.Chart){const cs=getComputedStyle(document.documentElement);Chart.defaults.color=cs.getPropertyValue("--mute").trim();Chart.defaults.borderColor=cs.getPropertyValue("--line").trim();Chart.defaults.font.family="Plus Jakarta Sans";
  charts.forEach(c=>c.destroy());const ms=[-5,-4,-3,-2,-1,0].map(n=>mAdd(m,n)),by=f=>ms.map(x=>sum(D.Transactions,t=>t.date.startsWith(x)&&f(t))),an={duration:1100,easing:"easeOutQuart"};
  charts=[new Chart($("#c1"),{type:"bar",data:{labels:ms,datasets:[{label:"Income",data:by(t=>t.type!=="expense"),backgroundColor:"#14b8a6",borderRadius:8},{label:"Expenses",data:by(t=>t.type==="expense"),backgroundColor:"#6366f1",borderRadius:8}]},options:{responsive:true,maintainAspectRatio:false,animation:an}})];
  const g={};tx.filter(t=>t.type==="expense").forEach(t=>g[t.categoryId]=(g[t.categoryId]||0)+t.amount);const ks=Object.keys(g);
  charts.push(new Chart($("#c2"),{type:"doughnut",data:{labels:ks.map(k=>cat(k).name),datasets:[{data:ks.map(k=>g[k]),backgroundColor:ks.map(k=>cat(k).color),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"62%",animation:{...an,animateRotate:true,animateScale:true}}}))}
 const rows=[];if(budOf("ALL"))rows.push(["All spending",exp,budOf("ALL")]);
 D.Categories.forEach(c=>{const b=budOf(c.id);if(b)rows.push([c.name,sum(tx,t=>t.type==="expense"&&t.categoryId===c.id),b])});
 $("#budRep").innerHTML=rows.length?rows.map(([n,s,b])=>`<div class="row"><b>${esc(n)}</b><span class="mute">${moneyH(s)} / ${moneyH(b)}</span></div><div class="bar ${s>b?"over":""}"><i data-w="${Math.min(100,s/b*100)}"></i></div>`).join(""):emptyMsg("Set budgets in Settings.");
 let tpd=0;D.Loans.forEach(l=>tpd+=loanPaid(l.id));
 const lp=D.Loans.reduce((s,l)=>s+l.principal,0);
 $("#loanRep").innerHTML=D.Loans.length?`<div class="mute" style="margin-bottom:8px">Borrowed ${moneyH(lp)} · Paid ${moneyH(tpd)} · Outstanding <b>${moneyH(lp-tpd)}</b></div>`+D.Loans.map(l=>{const p=loanPaid(l.id);return`<div class="row"><b>${esc(l.name)}</b><span class="mute">${moneyH(p)} / ${moneyH(l.principal)}</span></div><div class="bar"><i data-w="${Math.min(100,p/l.principal*100)}"></i></div>`}).join(""):emptyMsg("No loans yet.");
 const bt=sum(D.Bills,()=>true),bu=sum(unpaid(),()=>true);
 $("#billRep").innerHTML=D.Bills.length?`<div class="mute" style="margin-bottom:8px">Monthly total ${moneyH(bt)} · Paid ${moneyH(bt-bu)} · Still due <b>${moneyH(bu)}</b></div><div class="bar"><i data-w="${bt?(bt-bu)/bt*100:0}"></i></div>`:emptyMsg("No recurring bills yet. Add them under Records → Bills.");
 fillBars()}
$("#dm").onchange=rDash;

/* ----- records: transactions / loans / bills ----- */
$("#txTabs").onclick=e=>{const b=e.target.closest("button");if(!b)return;tab=b.dataset.t;$$("#txTabs button").forEach(x=>x.classList.toggle("on",x===b));
 const l=$("#txList");l.classList.add("enter");setTimeout(()=>l.classList.remove("enter"),1200);rTx()};
function rTx(){$("#txFilters").hidden=tab!=="tx";$("#addBill").hidden=tab!=="bills";const l=$("#txList");
 if(tab==="tx"){const m=$("#tm").value||($("#tm").value=ymNow()),f=$("#tf").value;
  const rows=D.Transactions.filter(t=>t.date.startsWith(m)&&(!f||t.type===f)).sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  l.innerHTML=rows.length?rows.map((t,i)=>{const c=t.type==="expense"?cat(t.categoryId):{name:t.type==="loan_in"?"Loan received":"Income",color:"#10b981"};
   return`<div class="item tap" data-id="${t.id}" style="--i:${i}"><span class="dot" style="background:${c.color}"></span><div>${esc(t.note||c.name)}<small>${esc(c.name)} · ${t.date}</small></div><span class="${t.type==="expense"?"":"inc"}">${t.type==="expense"?"-":"+"}${moneyH(t.amount)}</span></div>`}).join(""):emptyMsg("No transactions here.")}
 else if(tab==="loans"){l.innerHTML=D.Loans.length?D.Loans.map((x,i)=>{const p=loanPaid(x.id),o=x.principal-p;
   return`<div class="item tap" data-id="${x.id}" style="--i:${i}"><div><b>${esc(x.name)}</b><small>Paid ${moneyH(p)} of ${moneyH(x.principal)} · ${o>0.004?"owe "+money(o):"cleared ✓"}</small><div class="bar"><i data-w="${Math.min(100,p/x.principal*100)}"></i></div></div></div>`}).join(""):emptyMsg("No loans yet. Create one on Home.");fillBars()}
 else{l.innerHTML=D.Bills.length?D.Bills.map((b,i)=>{const paid=b.lastPaid===ymNow();
   return`<div class="item tap" data-id="${b.id}" style="--i:${i}"><span class="dot" style="background:${cat(b.categoryId).color}"></span><div>${esc(b.name)}<small>${moneyH(b.amount)} · day ${dueDay(b)} · ${esc(cat(b.categoryId).name)}${String(b.auto)==="1"?" · auto-add":""}</small></div><span class="tag ${paid?"ok":"warn"}">${paid?"Paid":"Due"}</span></div>`}).join(""):emptyMsg("No recurring bills yet.")}}
$("#tm").onchange=$("#tf").onchange=rTx;
$("#addBill").onclick=()=>editBill();
$("#txList").onclick=e=>{const r=e.target.closest(".item");if(!r)return;({tx:editTx,loans:editLoan,bills:editBill}[tab])(r.dataset.id)};

function editTx(id){const t=D.Transactions.find(x=>x.id===id);if(!t)return;
 if(t.type==="loan_in")return D.Loans.find(l=>l.id===t.loanId)?editLoan(t.loanId):toast("Loan record not found",false,false);
 const pay=t.categoryId==="loanpay";
 openSheet("Edit transaction",`<label for="e_type">Type</label><select id="e_type"${pay?" disabled":""}><option value="expense">Expense</option><option value="income">Income</option></select>
 <div class="two"><div><label for="e_amt">Amount</label><input id="e_amt" type="number" step="0.01" inputmode="decimal" value="${t.amount}"></div><div><label for="e_dt">Date</label><input id="e_dt" type="date" value="${t.date}"></div></div>
 <label for="e_cat">Category</label><select id="e_cat"${pay?" disabled":""}>${catOpts(t.categoryId)}</select>
 <label for="e_note">Note</label><input id="e_note" maxlength="60" value="${esc(t.note)}">`,{
  onSave(){const a=+$("#e_amt").value;if(!(a>0)){toast("Enter an amount",false,false);return false}
   if(!pay){t.type=$("#e_type").value;t.categoryId=t.type==="income"?"":$("#e_cat").value}
   t.amount=Math.round(a*100)/100;t.date=$("#e_dt").value||t.date;t.note=$("#e_note").value.trim();commit("Transactions","Transaction updated")},
  onDelete(){D.Transactions=D.Transactions.filter(x=>x.id!==id);commit("Transactions","Transaction deleted")}});
 $("#e_type").value=t.type}

function editLoan(id){const l=D.Loans.find(x=>x.id===id);if(!l)return;
 openSheet("Edit loan",`<label for="l_name">Loan name</label><input id="l_name" maxlength="40" value="${esc(l.name)}">
 <div class="two"><div><label for="l_amt">Amount received</label><input id="l_amt" type="number" step="0.01" inputmode="decimal" value="${l.principal}"></div><div><label for="l_dt">Date</label><input id="l_dt" type="date" value="${l.date}"></div></div>
 <p class="mute">Paid so far: ${moneyH(loanPaid(id))}. Deleting a loan also removes its payments.</p>`,{
  onSave(){const n=$("#l_name").value.trim(),a=+$("#l_amt").value;if(!n||!(a>0)){toast("Enter name and amount",false,false);return false}
   if(a<loanPaid(id)-0.004){toast("Amount is less than already paid",false,false);return false}
   l.name=n;l.principal=a;l.date=$("#l_dt").value||l.date;
   D.Transactions.forEach(t=>{if(t.loanId===id){if(t.type==="loan_in"){t.amount=a;t.date=l.date;t.note="Loan: "+n}else if(t.categoryId==="loanpay")t.note="Loan payback: "+n}});
   dirty.add("Loans");commit("Transactions","Loan updated")},
  onDelete(){D.Loans=D.Loans.filter(x=>x.id!==id);D.Transactions=D.Transactions.filter(t=>t.loanId!==id);dirty.add("Loans");commit("Transactions","Loan deleted")}});}

function editBill(id){const b=D.Bills.find(x=>x.id===id),n=!b,x=b||{name:"",amount:"",categoryId:"",day:new Date().getDate(),auto:"0"};
 openSheet(n?"New recurring bill":"Edit bill",`<label for="b_name">Bill name</label><input id="b_name" maxlength="40" value="${esc(x.name)}" placeholder="e.g. Rent">
 <div class="two"><div><label for="b_amt">Amount</label><input id="b_amt" type="number" step="0.01" inputmode="decimal" value="${x.amount}"></div><div><label for="b_day">Due day of month</label><input id="b_day" type="number" min="1" max="31" inputmode="numeric" value="${x.day}"></div></div>
 <label for="b_cat">Category</label><select id="b_cat">${catOpts(x.categoryId)}</select>
 <label for="b_auto">Add automatically on due day?</label><select id="b_auto"><option value="0">No – I will tap Pay</option><option value="1">Yes – add as expense</option></select>`,{
  icon:"🧾",saveLabel:n?"Add bill":"Save",
  onSave(){const nm=$("#b_name").value.trim(),a=+$("#b_amt").value,d=Math.round(+$("#b_day").value);if(!nm||!(a>0)||!(d>=1&&d<=31)){toast("Enter name, amount and a day (1–31)",false,false);return false}
   const o=b||{id:uid(),lastPaid:""};Object.assign(o,{name:nm,amount:a,day:d,categoryId:$("#b_cat").value,auto:$("#b_auto").value});
   if(n){if(o.auto==="1"&&d<new Date().getDate())o.lastPaid=ymNow();D.Bills.push(o)}commit("Bills",n?"Bill added":"Bill updated")},
  onDelete:n?null:()=>{D.Bills=D.Bills.filter(z=>z.id!==id);commit("Bills","Bill deleted")}});
 $("#b_auto").value=String(x.auto)==="1"?"1":"0"}

/* ----- settings ----- */
function rSet(){$("#cur").value=S("currency");$("#ball").value=budOf("ALL")||"";
 $("#cats").innerHTML=D.Categories.map(c=>`<div class="crow"><input type="color" value="${c.color}" data-k="color" data-id="${c.id}" aria-label="Colour"><input value="${esc(c.name)}" data-k="name" data-id="${c.id}"${c.id==="loanpay"?" disabled":""} aria-label="Name"><input type="number" min="0" placeholder="Budget" value="${budOf(c.id)||""}" data-b="${c.id}" aria-label="Monthly budget">${c.id==="loanpay"?"<span></span>":`<button class="x" data-del="${c.id}" aria-label="Delete category">✕</button>`}</div>`).join("")}
function setBudget(id,v){D.Budgets=D.Budgets.filter(b=>b.categoryId!==id);if(v>0)D.Budgets.push({id:uid(),categoryId:id,amount:v});commit("Budgets","Budget saved",true)}
$("#ball").onchange=e=>setBudget("ALL",+e.target.value);
$("#cur").onchange=e=>{setS("currency",e.target.value||"$");commit("Settings","Currency saved",true)};
$("#cats").onchange=e=>{const t=e.target;if(t.dataset.b)return setBudget(t.dataset.b,+t.value);
 const c=D.Categories.find(x=>x.id===t.dataset.id);if(!c)return;if(t.dataset.k==="name"&&!t.value.trim())return rSet();c[t.dataset.k]=t.value.trim();commit("Categories","Category saved",true)};
$("#cats").onclick=e=>{const id=e.target.dataset.del;if(!id||!confirm("Delete this category? Past transactions will show as Other."))return;D.Categories=D.Categories.filter(c=>c.id!==id);D.Budgets=D.Budgets.filter(b=>b.categoryId!==id);dirty.add("Budgets");commit("Categories","Category deleted")};
$("#addCat").onclick=()=>{const n=$("#ncat").value.trim();if(!n)return toast("Enter a name",false);D.Categories.splice(D.Categories.length-1,0,{id:uid(),name:n,color:"#"+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,"0")});$("#ncat").value="";commit("Categories","Category added")};
$("#theme").onclick=e=>{const b=e.currentTarget,r=b.getBoundingClientRect(),t=curTheme()==="dark"?"light":"dark";
 applyTheme(t,r.left+r.width/2,r.top+r.height/2);b.classList.remove("spin");void b.offsetWidth;b.classList.add("spin");setS("theme",t);commit("Settings","",true);toast(t==="dark"?"Dark theme on":"Light theme on")};

/* ----- install as app (PWA) ----- */
let deferred;
addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferred=e;$("#install").hidden=false});
$("#install").onclick=async()=>{if(!deferred)return;deferred.prompt();await deferred.userChoice;deferred=null;$("#install").hidden=true};
addEventListener("appinstalled",()=>{toast("App installed");$("#install").hidden=true});
$("#iosHint").hidden=!(/iphone|ipad|ipod/i.test(navigator.userAgent)&&!(matchMedia("(display-mode:standalone)").matches||navigator.standalone));

/* ----- start ----- */
applyTheme(localStorage.theme||(matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"),0,0,false);
if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
$("#cid").value=CID();
if(!offlineBoot())showLogin();

/* ----- exit app ----- */
$("#exit").onclick=()=>openSheet("Exit app",`<p class="mute" style="margin:0">Your data is saved on this device and in your Google Sheet. You will stay signed in next time.</p>`,{icon:"🚪",saveLabel:"Exit now",onSave(){setTimeout(exitApp,350)}});
async function exitApp(){
 if(dirty.size&&token){toast("Saving your changes…",true,false);flush();
  await Promise.race([new Promise(r=>document.addEventListener("syncdone",r,{once:true})),new Promise(r=>setTimeout(r,4000))])}
 if(user)cacheSave();
 try{window.close()}catch(e){}
 setTimeout(showBye,450)}                    // only runs if the browser refused to close the window (e.g. iPhone or a normal tab)
function showBye(){const o=document.createElement("div");o.className="bye";
 o.innerHTML=`<div class="byec"><div class="wave">👋</div><h2>See you soon!</h2><p class="mute">Everything is saved. You can safely close the app now: swipe it away, or close this tab.</p><button class="btn" id="byeBack" type="button">Back to app</button></div>`;
 document.body.append(o);requestAnimationFrame(()=>o.classList.add("in"));
 $("#byeBack").onclick=()=>{o.classList.remove("in");setTimeout(()=>o.remove(),500)}}
