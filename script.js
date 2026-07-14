import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const show = id => $(id)?.classList.remove("hidden");
const hide = id => $(id)?.classList.add("hidden");
const setFeedback = (id, message, kind="") => { const el=$(id); if(el){el.textContent=message;el.className=`feedback ${kind}`;} };
const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("REMPLACEZ");
let app, auth, db, currentProfile=null, allDocuments=[], allMembers=[];

$("menuButton")?.addEventListener("click",()=>$("navLinks")?.classList.toggle("open"));
document.querySelectorAll(".nav-links a").forEach(a=>a.addEventListener("click",()=>$("navLinks")?.classList.remove("open")));

$("formulaire")?.addEventListener("submit", e=>{
  e.preventDefault();
  const msg=`Bonjour Monsieur Moussa,%0A%0APréinscription Terminale D%0ANom : ${encodeURIComponent($("nom").value.trim())}%0ATéléphone : ${encodeURIComponent($("telephone").value.trim())}%0ASituation : ${encodeURIComponent($("statut").value)}%0AMessage : ${encodeURIComponent($("message").value.trim() || "Aucun")}`;
  window.open(`https://wa.me/2250777774033?text=${msg}`,"_blank","noopener");
});

function normalizeCode(value){return String(value||"").toUpperCase().replace(/\s+/g,"").replace(/[^A-Z0-9-]/g,"");}
function codeToEmail(code){return `${normalizeCode(code).toLowerCase().replace(/[^a-z0-9]/g,"")}@access.cemm.local`;}
function generateCode(){const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";let tail="";crypto.getRandomValues(new Uint32Array(6)).forEach(n=>tail+=chars[n%chars.length]);return `CEMM-${tail}`;}
function formatDate(value){if(!value)return "sans limite";const d=value.toDate?value.toDate():new Date(value);return d.toLocaleDateString("fr-FR");}
function isExpired(profile){if(!profile?.expiresAt)return false;const d=profile.expiresAt.toDate?profile.expiresAt.toDate():new Date(profile.expiresAt);return d<new Date();}
function escapeHtml(v){return String(v??"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function planLabel(plan){return plan==="reinforcement"?"Élève des cours — accès gratuit":"Abonnement ressources — 5 000 F";}
function safeUrl(value){try{const u=new URL(String(value||"").trim());return u.protocol==="https:"?u.href:"";}catch{return "";}}
function safeResourceUrl(documentData){
  const embedded=String(documentData?.fileData||"");
  if(/^data:application\/pdf;base64,[A-Za-z0-9+/=]+$/.test(embedded))return embedded;
  return safeUrl(documentData?.url);
}
function readPdfAsDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(new Error("Impossible de lire ce PDF."));
    reader.readAsDataURL(file);
  });
}

function resetUI(){currentProfile=null;show("loginPanel");hide("dashboard");show("adminLoginPanel");hide("adminDashboard");hide("documentFilters");$("documentsMessage").textContent="Entre ton code personnel pour consulter les ressources mises à ta disposition.";$("documentsList").innerHTML='<div class="locked-card"><span>🔒</span><h3>Bibliothèque protégée</h3><p>La connexion avec un code actif est nécessaire.</p><a class="btn outline" href="#connexion">Me connecter</a></div>';}

async function loadDocuments(adminMode=false){
  const target=$(adminMode?"adminDocumentsList":"documentsList"); if(!target)return;
  target.innerHTML="<p>Chargement...</p>";
  try{const snap=await getDocs(collection(db,"documents"));allDocuments=[];snap.forEach(s=>allDocuments.push({id:s.id,...s.data()}));allDocuments.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));renderDocuments(adminMode);}catch(err){target.innerHTML=`<p class="feedback error">${escapeHtml(friendlyError(err))}</p>`;}
}
function renderDocuments(adminMode=false){
  const target=$(adminMode?"adminDocumentsList":"documentsList");
  let docs=allDocuments;
  if(!adminMode){const q=$("documentSearch")?.value.trim().toLowerCase()||"";const subject=$("subjectFilter")?.value||"";const type=$("typeFilter")?.value||"";docs=docs.filter(d=>(!q||`${d.title} ${d.subject} ${d.type} ${d.description||""}`.toLowerCase().includes(q))&&(!subject||d.subject===subject)&&(!type||d.type===type));}
  target.innerHTML="";
  if(!docs.length){target.innerHTML="<p>Aucune ressource disponible pour le moment.</p>";if($("docCount"))$("docCount").textContent="0";return;}
  if($("docCount"))$("docCount").textContent=String(docs.length);
  docs.forEach(d=>{
    const url=safeResourceUrl(d); if(!url)return;
    const item=document.createElement("div");item.className=adminMode?"admin-row":"document-card";
    const description=d.description?`<p>${escapeHtml(d.description)}</p>`:"";
    item.innerHTML=adminMode?`<div><strong>${escapeHtml(d.title)}</strong><div class="document-meta">${escapeHtml(d.subject)} • ${escapeHtml(d.type)}</div>${description}</div><div class="admin-row-actions"><a class="btn outline small-btn" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Ouvrir</a><button class="btn danger small-btn" data-delete-doc="${d.id}">Supprimer</button></div>`:`<h3>${escapeHtml(d.title)}</h3><p class="meta">${escapeHtml(d.subject)} • ${escapeHtml(d.type)}</p>${description}<a class="btn outline" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Ouvrir la ressource</a>`;
    target.appendChild(item);
  });
  if(adminMode)target.querySelectorAll("[data-delete-doc]").forEach(btn=>btn.addEventListener("click",async()=>{if(!confirm("Supprimer cette ressource de la bibliothèque ?"))return;btn.disabled=true;try{await deleteDoc(doc(db,"documents",btn.dataset.deleteDoc));await Promise.all([loadDocuments(true),loadDocuments(false)]);}catch(err){alert(friendlyError(err));btn.disabled=false;}}));
}
["documentSearch","subjectFilter","typeFilter"].forEach(id=>$(id)?.addEventListener("input",()=>renderDocuments(false)));

async function loadMembers(){const target=$("membersList");target.innerHTML="<p>Chargement...</p>";try{const snap=await getDocs(collection(db,"users"));allMembers=[];snap.forEach(s=>{const d=s.data();if(d.role==="member")allMembers.push({id:s.id,...d});});allMembers.sort((a,b)=>(a.name||"").localeCompare(b.name||""));renderMembers();}catch(err){target.innerHTML=`<p class="feedback error">${escapeHtml(friendlyError(err))}</p>`;}}
function renderMembers(){const target=$("membersList");const q=$("memberSearch")?.value.trim().toLowerCase()||"";const members=allMembers.filter(m=>!q||`${m.name} ${m.phone} ${m.accessCode}`.toLowerCase().includes(q));target.innerHTML="";if(!members.length){target.innerHTML="<p>Aucun membre trouvé.</p>";return;}members.forEach(m=>{const active=m.active===true&&!isExpired(m);const row=document.createElement("div");row.className="admin-row";row.innerHTML=`<div><strong>${escapeHtml(m.name||"Membre")}</strong><div class="document-meta">${escapeHtml(planLabel(m.plan))}<br>Tél. ${escapeHtml(m.phone||"—")} • Code : <strong>${escapeHtml(m.accessCode||"—")}</strong><br>Validité : ${formatDate(m.expiresAt)} — ${active?"Actif":"Inactif"}</div></div><div class="admin-row-actions"><button class="btn outline small-btn" data-copy-code="${escapeHtml(m.accessCode||"")}">Copier le code</button><button class="btn ${active?"danger":"primary"} small-btn" data-toggle-user="${m.id}" data-active="${active}">${active?"Désactiver":"Activer"}</button></div>`;target.appendChild(row);});target.querySelectorAll("[data-copy-code]").forEach(btn=>btn.addEventListener("click",async()=>{await navigator.clipboard.writeText(btn.dataset.copyCode);btn.textContent="Copié !";setTimeout(()=>btn.textContent="Copier le code",1400);}));target.querySelectorAll("[data-toggle-user]").forEach(btn=>btn.addEventListener("click",async()=>{btn.disabled=true;try{await updateDoc(doc(db,"users",btn.dataset.toggleUser),{active:btn.dataset.active!=="true",updatedAt:serverTimestamp()});await loadMembers();}catch(err){alert(friendlyError(err));btn.disabled=false;}}));}
$("memberSearch")?.addEventListener("input",renderMembers);

async function handleSignedIn(user){
  const snap=await getDoc(doc(db,"users",user.uid));if(!snap.exists()){await signOut(auth);throw new Error("Ce compte n’est pas autorisé.");}
  const profile=snap.data();currentProfile=profile;
  if(profile.role==="admin"){hide("adminLoginPanel");show("adminDashboard");hide("loginPanel");hide("dashboard");show("documentFilters");$("documentsMessage").textContent="Aperçu des ressources accessibles aux membres actifs.";await Promise.all([loadMembers(),loadDocuments(true),loadDocuments(false)]);return;}
  if(profile.role!=="member"||profile.active!==true||isExpired(profile)){await signOut(auth);throw new Error(isExpired(profile)?"Ton code a expiré. Contacte l’administration pour le renouveler.":"Ton code n’est pas encore actif. Contacte l’administration.");}
  hide("loginPanel");show("dashboard");show("adminLoginPanel");hide("adminDashboard");show("documentFilters");$("studentWelcome").textContent=`Bienvenue ${profile.name||"au C.E.M.M."}`;$("studentPlan").textContent=planLabel(profile.plan);$("studentExpiry").textContent=`Code valide jusqu’au ${formatDate(profile.expiresAt)}.`;$("accessBadge").textContent="Actif";$("documentsMessage").textContent="Voici les ressources disponibles avec ton code actif.";await loadDocuments(false);
}

if(!configured){const msg="Firebase n’est pas encore configuré. Suis le fichier GUIDE_INSTALLATION.txt.";setFeedback("loginError",msg,"warning");setFeedback("adminLoginError",msg,"warning");}
else{app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);setPersistence(auth,browserLocalPersistence).catch(console.error);onAuthStateChanged(auth,async user=>{if(!user){resetUI();return;}try{await handleSignedIn(user);}catch(err){resetUI();setFeedback("loginError",friendlyError(err),"error");setFeedback("adminLoginError",friendlyError(err),"error");}});}

$("loginForm")?.addEventListener("submit",async e=>{e.preventDefault();if(!configured)return;const code=normalizeCode($("accessCode").value);if(code.length<8)return setFeedback("loginError","Entre un code d’accès valide.","error");setFeedback("loginError","Connexion...","");try{await signInWithEmailAndPassword(auth,codeToEmail(code),code);}catch(err){setFeedback("loginError",friendlyError(err),"error");}});
$("adminLoginForm")?.addEventListener("submit",async e=>{e.preventDefault();if(!configured)return;setFeedback("adminLoginError","Connexion...","");try{const cred=await signInWithEmailAndPassword(auth,$("adminEmail").value.trim(),$("adminPassword").value);const snap=await getDoc(doc(db,"users",cred.user.uid));if(!snap.exists()||snap.data().role!=="admin"){await signOut(auth);throw new Error("Ce compte n’est pas administrateur.");}}catch(err){setFeedback("adminLoginError",friendlyError(err),"error");}});
$("studentLogout")?.addEventListener("click",()=>signOut(auth));$("adminLogout")?.addEventListener("click",()=>signOut(auth));
$("generateCodeButton")?.addEventListener("click",()=>{$("newMemberCode").value=generateCode();});

$("createMemberForm")?.addEventListener("submit",async e=>{
  e.preventDefault();if(!configured||currentProfile?.role!=="admin")return;
  const code=normalizeCode($("newMemberCode").value);if(code.length<8)return setFeedback("memberCreateStatus","Le code doit contenir au moins 8 caractères.","error");
  setFeedback("memberCreateStatus","Création du code...","");let secondaryApp;
  try{secondaryApp=initializeApp(firebaseConfig,"memberCreator-"+Date.now());const secondaryAuth=getAuth(secondaryApp);const email=codeToEmail(code);const cred=await createUserWithEmailAndPassword(secondaryAuth,email,code);const expiry=new Date($("newMemberExpiry").value+"T23:59:59");await setDoc(doc(db,"users",cred.user.uid),{name:$("newMemberName").value.trim(),phone:$("newMemberPhone").value.trim(),accessCode:code,loginEmail:email,plan:$("newMemberPlan").value,role:"member",active:true,expiresAt:Timestamp.fromDate(expiry),createdAt:serverTimestamp(),updatedAt:serverTimestamp()});await signOut(secondaryAuth);e.target.reset();$("newMemberCode").value=generateCode();setFeedback("memberCreateStatus",`Code créé : ${code}. Remets-le au membre avec son reçu.`,"success");await loadMembers();}
  catch(err){setFeedback("memberCreateStatus",friendlyError(err),"error");}finally{if(secondaryApp)await deleteApp(secondaryApp).catch(()=>{});}
});

$("uploadDocumentForm")?.addEventListener("submit",async e=>{
  e.preventDefault();if(!configured||currentProfile?.role!=="admin")return;
  const file=$("documentFile").files?.[0]||null;
  const url=safeUrl($("documentUrl").value);
  if(!file&&!url)return setFeedback("uploadStatus","Choisis un PDF ou colle un lien HTTPS valide.","error");
  if(file&&file.type!=="application/pdf")return setFeedback("uploadStatus","Le fichier choisi doit être un PDF.","error");
  if(file&&file.size>600*1024)return setFeedback("uploadStatus","Ce PDF dépasse 600 Ko. Mets-le sur Google Drive puis colle son lien.","error");
  setFeedback("uploadStatus",file?"Lecture et publication du PDF...":"Publication en cours...","");
  try{
    const payload={title:$("documentTitle").value.trim(),subject:$("documentSubject").value,type:$("documentType").value,description:$("documentDescription").value.trim(),createdAt:serverTimestamp(),createdBy:auth.currentUser.uid};
    if(file){payload.fileData=await readPdfAsDataUrl(file);payload.fileName=file.name;payload.mimeType="application/pdf";payload.storageMode="firestore";}
    else{payload.url=url;payload.storageMode="link";}
    await addDoc(collection(db,"documents"),payload);
    e.target.reset();setFeedback("uploadStatus",file?"PDF ajouté et publié avec succès.":"Ressource publiée avec succès.","success");await Promise.all([loadDocuments(true),loadDocuments(false)]);
  }catch(err){setFeedback("uploadStatus",friendlyError(err),"error");}
});

function friendlyError(err){const code=err?.code||"";const map={"auth/invalid-credential":"Code, e-mail ou mot de passe incorrect.","auth/email-already-in-use":"Ce code existe déjà. Génère un autre code.","auth/weak-password":"Le code doit contenir au moins 6 caractères.","auth/invalid-email":"Identifiant invalide.","auth/too-many-requests":"Trop de tentatives. Réessaie plus tard.","permission-denied":"Accès refusé. Vérifie les règles Firestore et le rôle du compte."};return map[code]||err?.message||"Une erreur est survenue.";}


// Navigation mobile : état actif et accès direct à la recherche documentaire.
const mobileNavLinks=[...document.querySelectorAll(".mobile-bottom-nav a")];
const mobileSections=["accueil","ressources-publiques","bibliotheque","actualites","connexion"]
  .map(id=>document.getElementById(id)).filter(Boolean);
function setMobileNavActive(id){
  mobileNavLinks.forEach(link=>{
    const href=(link.getAttribute("href")||"").slice(1);
    const active=href===id || (id==="bibliotheque" && link.dataset.mobileNav==="recherche");
    link.classList.toggle("active",active);
    if(active) link.setAttribute("aria-current","page"); else link.removeAttribute("aria-current");
  });
}
if("IntersectionObserver" in window){
  const mobileObserver=new IntersectionObserver(entries=>{
    const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
    if(visible) setMobileNavActive(visible.target.id);
  },{rootMargin:"-25% 0px -60% 0px",threshold:[0,.1,.25,.5]});
  mobileSections.forEach(section=>mobileObserver.observe(section));
}
setMobileNavActive("accueil");
document.getElementById("mobileSearchLink")?.addEventListener("click",()=>{
  setTimeout(()=>{
    const search=document.getElementById("documentSearch");
    if(search && !search.closest(".hidden")){ search.focus(); search.scrollIntoView({behavior:"smooth",block:"center"}); }
  },450);
});

// C.E.M.M. 4.0 — diaporama et compteurs de l’accueil
(() => {
  const slider = document.getElementById('v4Slider');
  if (slider) {
    const slides = [...slider.querySelectorAll('.v4-slide')];
    const dotsWrap = slider.querySelector('.v4-dots');
    let index = 0;
    let timer;
    const dots = slides.map((_, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `Afficher l’annonce ${i + 1}`);
      button.addEventListener('click', () => show(i, true));
      dotsWrap.appendChild(button);
      return button;
    });
    function show(next, restart = false) {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
      dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
      if (restart) start();
    }
    function start() {
      clearInterval(timer);
      timer = setInterval(() => show(index + 1), 6000);
    }
    slider.querySelector('.prev')?.addEventListener('click', () => show(index - 1, true));
    slider.querySelector('.next')?.addEventListener('click', () => show(index + 1, true));
    slider.addEventListener('mouseenter', () => clearInterval(timer));
    slider.addEventListener('mouseleave', start);
    show(0);
    start();
  }

  const counters = [...document.querySelectorAll('.v4-counter')];
  if ('IntersectionObserver' in window && counters.length) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = Number(el.dataset.target || 0);
        const suffix = el.dataset.suffix || '';
        const decimals = String(target).includes('.') ? 2 : 0;
        const start = performance.now();
        const duration = 1200;
        function tick(now) {
          const progress = Math.min((now - start) / duration, 1);
          const value = target * (1 - Math.pow(1 - progress, 3));
          el.textContent = value.toFixed(decimals).replace('.', ',') + suffix;
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        observer.unobserve(el);
      });
    }, { threshold: 0.35 });
    counters.forEach(counter => observer.observe(counter));
  }
})();


// C.E.M.M. 5.0 — thème et raccourcis par matière
(() => {
  const toggle = document.getElementById('themeToggle');
  const saved = localStorage.getItem('cemm-theme');
  if (saved === 'dark') document.body.classList.add('dark-mode');
  function syncThemeLabel(){
    if(!toggle) return;
    const dark=document.body.classList.contains('dark-mode');
    toggle.textContent=dark?'☀':'◐';
    toggle.setAttribute('aria-label', dark?'Activer le mode clair':'Activer le mode sombre');
  }
  syncThemeLabel();
  toggle?.addEventListener('click',()=>{
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('cemm-theme',document.body.classList.contains('dark-mode')?'dark':'light');
    syncThemeLabel();
  });
  document.querySelectorAll('[data-subject-jump]').forEach(button=>{
    button.addEventListener('click',()=>{
      document.getElementById('bibliotheque')?.scrollIntoView({behavior:'smooth'});
      setTimeout(()=>{
        const wanted=button.dataset.subjectJump||'';
        const select=document.getElementById('documentSubjectFilter');
        if(select){
          const option=[...select.options].find(o=>o.value.toLowerCase().includes(wanted.toLowerCase())||o.textContent.toLowerCase().includes(wanted.toLowerCase()));
          if(option){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));}
        }
        document.getElementById('documentSearch')?.focus();
      },500);
    });
  });
})();
