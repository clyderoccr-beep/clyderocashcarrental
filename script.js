'use strict';

// 📱 Mobile Menu Toggle
document.addEventListener('DOMContentLoaded', function() {
  const menuToggle = document.getElementById('mobileMenuToggle');
  const menuClose = document.getElementById('mobileMenuClose');
  const nav = document.querySelector('header nav');
  
  if (menuToggle && nav) {
    menuToggle.addEventListener('click', function() {
      nav.classList.add('mobile-open');
      if (menuClose) menuClose.style.display = 'block';
    });
  }
  
  if (menuClose && nav) {
    menuClose.addEventListener('click', function() {
      nav.classList.remove('mobile-open');
      menuClose.style.display = 'none';
    });
  }
  
  // Close menu when clicking a nav button
  const navButtons = document.querySelectorAll('header nav .navbtn');
  navButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      if (window.innerWidth <= 768 && nav) {
        nav.classList.remove('mobile-open');
        if (menuClose) menuClose.style.display = 'none';
      }
    });
  });
});

// Enable Firebase AppCheck debug for local dev to reduce reCAPTCHA errors
try{
  (function(){
    const proto = (location && location.protocol) || '';
    const host = (location && location.hostname) || '';
    const isLocal = proto === 'file:' || host === '127.0.0.1' || host === 'localhost';
    if(isLocal){ self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; console.log('AppCheck debug token enabled (local)'); }
  })();
}catch{}

// Firestore helpers
function getDB(){ return window.firestoreDB; }
function getUtils(){ return window.firestoreUtils; }
function getStorage(){ return window.firestoreStorage; }
function getStorageUtils(){ return window.storageUtils; }

// ===== Firebase Auth Helpers (added) =====
function getAuthApi(){ return window.authApi || {}; }
function getAuthInstance(){ const api=getAuthApi(); return api.auth; }
function authEmail(){ const a=getAuthInstance(); return a && a.currentUser ? (a.currentUser.email||'') : ''; }
async function getIdToken(){ try{ const a=getAuthInstance(); const u=a&&a.currentUser; return u? await u.getIdToken(): null; }catch{ return null; } }

function blobToDataURL(blob){ return new Promise((resolve,reject)=>{ try{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(blob);}catch(e){ reject(e);} }); }

async function uploadViaFunction(kind, blob){
  const token = await getIdToken(); if(!token) throw new Error('not_logged_in');
  const dataUrl = await blobToDataURL(blob);
  const res = await fetch('/.netlify/functions/upload-profile-media', {
    method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': 'Bearer '+token },
    body: JSON.stringify({ kind, dataUrl })
  });
  if(!res.ok){
    let detail = '';
    try{ const j = await res.json(); detail = j && (j.error||j.detail) ? (j.error+ (j.detail? (': '+j.detail):'')) : ''; }catch{ try{ detail = await res.text(); }catch{} }
    throw new Error('function_upload_failed'+ (detail? (' - '+detail):''));
  }
  const json = await res.json();
  if(!json.url) throw new Error('function_no_url');
  return json.url;
}
// Auth state listener also sets up realtime subscriptions
try{ 
  const api=getAuthApi(); 
  if(api.onAuthStateChanged && api.auth){ 
    api.onAuthStateChanged(api.auth, (user)=>{ 
      console.log('Auth state changed, user:', user ? user.email : 'null');
      
      // Check if we just logged out (within last 30 seconds)
      const lastLogout = localStorage.getItem('lastLogoutTime');
      const isRecentLogout = lastLogout && (Date.now() - parseInt(lastLogout, 10)) < 30000;
      
      // Check if user explicitly logged in (set by login form)
      const hasExplicitLogin = sessionStorage.getItem('explicitLogin');
      
      // If Firebase has a user but we don't have an explicit login flag,
      // this is a stale/persisted Firebase session - sign out
      if(user && !hasExplicitLogin && !isRecentLogout){
        console.log('Stale Firebase session detected (no explicit login), signing out...');
        try{ 
          api.signOut(api.auth);
          sessionStorage.removeItem('sessionEmail');
        }catch(e){ 
          console.error('Failed to sign out stale session:', e); 
        }
        return;
      }
      
      if(user && user.email && !isRecentLogout) {
        // User is signed in, store email (only if not recently logged out)
        sessionStorage.setItem('sessionEmail', user.email);
        console.log('Stored email in sessionStorage:', user.email);
        // Clear any old logout timestamp since we're now logged in
        localStorage.removeItem('lastLogoutTime');
        // Ensure Firestore users/{uid} exists via serverless (bypasses client rules)
        (async ()=>{
          try{
            const token = await getIdToken(); if(!token) return;
            await fetch('/.netlify/functions/ensure-user-doc', { method:'POST', headers:{ 'Authorization':'Bearer '+token } });
          }catch(_){ }
        })();
      } else {
        // User is signed out, clear sessionStorage immediately
        sessionStorage.removeItem('sessionEmail');
        console.log('User signed out, cleared sessionStorage');
      }
      // Update UI after email is stored/cleared
      updateNavLabels(); 
      updateMembershipPanel(); 
      updateAdminVisibility(); 
      setupRealtimeForRole(); 
      try{
        if(user){ startUserDocRealtime(); } else { stopUserDocRealtime(); }
      }catch(_){ }
      // Immediate optimistic render of account summary (avatar/cover) after auth resolves
      try{ if(user){ renderAccountSummary(); } }catch(_){ }
      // Secondary delayed render to catch race where Firestore utils initialize slightly later
      try{ if(user){ setTimeout(()=>{ try{ renderAccountSummary(); }catch{} }, 600); } }catch(_){ }
      // Start/stop customer bookings realtime on auth changes
      try{ if(user){ startMyBookingsRealtime(); } else { stopMyBookingsRealtime(); } }catch(_){ }
    }); 
  } 
}catch(err){ 
  console.error('Auth listener error:', err);
}

// Router: show one section at a time, default = blank
const ROUTES = { vehicles:'#vehicles', about:'#about', booking:'#booking', payments:'#payments', login:'#login', membership:'#membership', signup:'#signup', contact:'#contact', terms:'#terms', admin:'#admin' };
const MEMBER_ONLY = new Set(['booking','payments']);
function show(sel){ Object.values(ROUTES).forEach(id=>{ const n=document.querySelector(id); if(n) n.style.display = (id===sel)?'block':'none'; }); }
function goto(name){ 
  const sel=ROUTES[name]; if(!sel) return; 
  // Close gallery modal if open when navigating
  const galleryModal = document.getElementById('vehicleGalleryModal');
  if(galleryModal && galleryModal.style.display === 'block'){ closeVehicleGallery(); }
  // Block member-only sections if not logged in
  if(MEMBER_ONLY.has(name) && !getSessionEmail()){ 
    showToast('Members only. Please log in or sign up.'); 
    goto('signup'); 
    return; 
  }
  // Block admin section unless logged in (and visibility controlled elsewhere)
  if(name==='admin' && !getSessionEmail()){
    showToast('Admin access requires login.');
    goto('login');
    return;
  }
  show(sel); history.replaceState(null,'',sel); 
}

// EmailJS helpers
function initEmailJS(){
  try {
    const cfg = window.EMAILJS_CONFIG || {};
    if(window.emailjs && cfg.publicKey){
      window.emailjs.init({ publicKey: cfg.publicKey });
      return true;
    }
  } catch(_){}
  return false;
}

async function sendReplyViaEmailJS({toEmail, subject, body, toName}){
  const cfg = window.EMAILJS_CONFIG || {};
  if(!window.emailjs || !cfg.serviceId || !cfg.templateId || !cfg.publicKey){
    throw new Error('EmailJS is not configured.');
  }
  const params = {
    to_email: toEmail,
    to_name: toName || '',
    from_email: 'clyderoccr@gmail.com',
    from_name: 'Clydero CCR',
    subject: subject,
    message: body
  };
  return window.emailjs.send(cfg.serviceId, cfg.templateId, params);
}

// Clean up Firebase error messages to be more user-friendly
function cleanErrorMessage(error) {
  const msg = error.message || error.toString();
  
  // Email already in use
  if(msg.includes('email-already-in-use') || msg.includes('already in use')) {
    return 'Email already in use. Please sign in instead.';
  }
  // Wrong password
  if(msg.includes('wrong-password') || msg.includes('invalid-credential')) {
    return 'Incorrect email or password.';
  }
  // User not found
  if(msg.includes('user-not-found')) {
    return 'No account found with this email.';
  }
  // Weak password
  if(msg.includes('weak-password')) {
    return 'Password should be at least 6 characters.';
  }
  // Invalid email
  if(msg.includes('invalid-email')) {
    return 'Please enter a valid email address.';
  }
  // Too many requests
  if(msg.includes('too-many-requests')) {
    return 'Too many attempts. Please try again later.';
  }
  // Network error
  if(msg.includes('network')) {
    return 'Network error. Please check your connection.';
  }
  
  // Remove "Firebase:" prefix from any other errors
  return msg.replace(/Firebase:\s*/gi, '').replace(/\(auth\/[^)]+\)/gi, '').trim() || 'An error occurred. Please try again.';
}

document.addEventListener('click', (e)=>{ 
  const t=e.target.closest('[data-nav]'); 
  if(!t) return; 
  e.preventDefault(); 
  const nav=t.dataset.nav; 
  goto(nav); 
  // Update membership panel when navigating to membership page
  if(nav === 'membership') {
    updateMembershipPanel();
    try{ renderAccountSummary(); }catch(_){ }
  }
  // Pre-fill vehicle booking if coming from vehicle card
  if(nav==='booking' && t.dataset.veh){ 
    const sel=document.getElementById('vehicle-select'); 
    if(sel){ sel.value=t.dataset.veh; } 
  } 
});

// Make in-text Terms links open the Terms section
document.addEventListener('click', (e)=>{
  const a = e.target.closest('a[href="#terms"]');
  if(!a) return;
  e.preventDefault();
  goto('terms');
  try{
    const el = document.getElementById('terms');
    if(el){ el.style.display='block'; el.scrollIntoView({ behavior:'smooth', block:'start' }); }
  }catch(_){ /* ignore */ }
});

// Back to Payments button from Terms
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('#backToPayments');
  if(!btn) return;
  e.preventDefault();
  goto('payments');
  try{
    const el = document.getElementById('payments');
    if(el) el.scrollIntoView({ behavior:'smooth', block:'start' });
  }catch(_){ /* ignore */ }
});

// Forgot password: Firebase Auth reset email with spam folder reminder
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('#forgotPassword');
  if(!btn) return;
  e.preventDefault();
  const emailInput = document.getElementById('loginEmail');
  const email = (emailInput?.value||'').trim();
  if(!email){ alert('Please enter your email above first.'); emailInput?.focus(); return; }
  const api = getAuthApi();
  const auth = getAuthInstance();
  if(!(api.sendPasswordResetEmail && auth)){
    alert('Password reset is not configured.');
    return;
  }
  try{
    btn.disabled = true;
    btn.textContent = 'Sending...';
    const actionCodeSettings = {
      url: 'https://clyderoccr.com',
      handleCodeInApp: false
    };
    await api.sendPasswordResetEmail(auth, email, actionCodeSettings);
    alert('Password reset email sent!\n\nPlease check your inbox and spam folder.');
  }catch(err){
    alert(cleanErrorMessage(err));
  }finally{
    btn.disabled = false;
    btn.textContent = 'Forgot password';
  }
});

// Global click sound for buttons
let CLICK_SOUND = null;
function initClickSound(){
  try{
    CLICK_SOUND = new Audio('assets/bell.wav');
    CLICK_SOUND.preload = 'auto';
    CLICK_SOUND.volume = 0.35;
  }catch(_){ /* ignore */ }
}
document.addEventListener('DOMContentLoaded', initClickSound);
document.addEventListener('click', (e)=>{
  const el = e.target.closest('button, .navbtn, input[type="button"], input[type="submit"]');
  if(!el) return;
  if(el.disabled) return;
  try{
    const snd = CLICK_SOUND ? CLICK_SOUND.cloneNode(true) : new Audio('assets/bell.wav');
    snd.volume = CLICK_SOUND ? CLICK_SOUND.volume : 0.35;
    snd.play().catch(()=>{});
  }catch(_){ /* ignore */ }
});

// Welcome sound (autoplay attempt with gesture fallback)
let WELCOME_SOUND_PLAYED = false;
let WELCOME_SOUND = null;
// Preload immediately when script loads
try{
  WELCOME_SOUND = new Audio('assets/welcome.wav');
  WELCOME_SOUND.preload = 'auto';
  WELCOME_SOUND.volume = 0.55;
  WELCOME_SOUND.load(); // Force load
}catch(e){ console.log('Welcome sound preload failed:', e); }

function playWelcome(){
  if(WELCOME_SOUND_PLAYED) return;
  console.log('Attempting to play welcome sound...');
  try{
    const audio = WELCOME_SOUND || new Audio('assets/welcome.wav');
    if(!WELCOME_SOUND) audio.volume = 0.55;
    const playPromise = audio.play();
    if(playPromise !== undefined){
      playPromise.then(()=>{ 
        console.log('Welcome sound playing!');
        WELCOME_SOUND_PLAYED = true; 
      }).catch((err)=>{
        console.log('Autoplay blocked, waiting for user interaction:', err);
        if(!WELCOME_SOUND_PLAYED){
          const handler = () => { 
            console.log('User interacted, playing welcome sound');
            playWelcome(); 
          };
          ['click','keydown','touchstart'].forEach(ev=> document.addEventListener(ev, handler, { once:true }));
        }
      });
    }
  }catch(e){ console.log('Welcome sound error:', e); }
}

// Try to play welcome sound as early as possible
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', ()=> { setTimeout(playWelcome, 100); });
} else {
  setTimeout(playWelcome, 100);
}

document.addEventListener('DOMContentLoaded', async ()=>{ 
  document.getElementById('year').textContent = new Date().getFullYear(); 
  
  // CRITICAL: Clear all session data on page load, will be restored by Firebase if user is actually logged in
  // This prevents stale sessionStorage from showing "My Account" when logged out
  try{
    const auth = getAuthInstance();
    // If Firebase doesn't have a currentUser immediately, clear everything
    if(!auth || !auth.currentUser){
      sessionStorage.removeItem('sessionEmail');
      sessionStorage.removeItem('explicitLogin');
      console.log('Cleared session data on page load - will restore if Firebase has valid user');
    }
  }catch{}
  
  // If a prior logout requested a hard reset, enforce it immediately
  try{
    const lastLogout = localStorage.getItem('lastLogoutTime');
    if(lastLogout){
      const logoutTime = parseInt(lastLogout, 10);
      const now = Date.now();
      // If logout happened within last 30 seconds, force logged-out state
      if(now - logoutTime < 30000){
        try{ clearSession(); }catch{}
        try{ updateNavLabels(); updateMembershipPanel(); updateAdminVisibility(); }catch{}
      } else {
        // Clear expired logout timestamp
        localStorage.removeItem('lastLogoutTime');
      }
    }
  }catch{}
    try{ await loadFromFirestore(); }catch(e){ console.warn('Initial Firestore load failed:', e?.message||e); }
    // Guarantee vehicles show: restore defaults if empty, then render
    try{
      if(!(Array.isArray(VEHICLES) && VEHICLES.length)){
        VEHICLES.length = 0;
        DEFAULT_VEHICLES.forEach(v=> VEHICLES.push({ ...v }));
      }
      renderVehicles();
    }catch(e){ console.warn('Render vehicles failed:', e?.message||e); }
  seedBooking(); 
  seedPayments(); 
  renderAbout(); 
  // Start realtime after initial snapshot load
  setupRealtimeForRole();
  
  // Wait for Firebase Auth to initialize and restore session
  const checkAuthAndUpdateUI = () => {
    const email = getSessionEmail();
    console.log('Checking auth state on page load, email:', email);
    if(email) {
      // User is logged in, update UI immediately
      console.log('User logged in on page load, updating UI');
      updateNavLabels();
      updateMembershipPanel();
      updateAdminVisibility();
    }
  };
  
  // Check immediately and also after a delay to catch auth restoration
  checkAuthAndUpdateUI();
  setTimeout(checkAuthAndUpdateUI, 300);
  setTimeout(checkAuthAndUpdateUI, 800);
  
  goto('vehicles');
});

// Simple session (non-secure placeholder; replace with Firebase Auth for production)
const OWNER_EMAIL = 'clyderofraser97@gmail.com';
function getSessionEmail(){
  // Check if we just logged out (within last 30 seconds) - force logged out state
  const lastLogout = localStorage.getItem('lastLogoutTime');
  if(lastLogout){
    const logoutTime = parseInt(lastLogout, 10);
    const now = Date.now();
    if(now - logoutTime < 30000){
      console.log('getSessionEmail - recent logout detected, returning empty');
      return '';
    } else {
      // Clear expired logout timestamp
      localStorage.removeItem('lastLogoutTime');
    }
  }
  
  // Prefer Firebase Auth current user
  const em = authEmail();
  console.log('getSessionEmail - authEmail():', em);
  if(em) return em;
  const fallback = sessionStorage.getItem('sessionEmail') || '';
  console.log('getSessionEmail - fallback:', fallback);
  return fallback;
}
function setSessionEmail(email){
  // Store email in sessionStorage as backup to Firebase Auth
  sessionStorage.setItem('sessionEmail', email || '');
  updateAdminVisibility();
  try{ startMyBookingsRealtime(); }catch{}
}
function clearSession(){
  sessionStorage.removeItem('sessionEmail');
  const api=getAuthApi(); const auth=getAuthInstance();
  if(api.signOut && auth){ try{ api.signOut(auth); }catch(_){} }
  updateAdminVisibility();
  try{ stopMyBookingsRealtime(); }catch{}
}
function isCurrentUserAdmin(){
  const api = getAuthApi();
  const auth = getAuthInstance();
  const uid = auth && auth.currentUser && auth.currentUser.uid;
  if(!uid) return false;
  const userDoc = MEMBERS.find(x => x.id === uid);
  return userDoc && userDoc.isAdmin === true;
}
function updateAdminVisibility(){ 
  const email = getSessionEmail();
  const isOwner = email === OWNER_EMAIL;
  const isAdmin = isCurrentUserAdmin();
  const canAccessAdmin = isOwner || isAdmin;
  console.log('updateAdminVisibility - email:', email, 'isOwner:', isOwner, 'isAdmin:', isAdmin);
  const tab = document.getElementById('adminTab');
  const admin = document.getElementById('admin');
  if(tab) {
    tab.style.display = canAccessAdmin ? 'inline-block' : 'none';
    console.log('Admin tab display:', tab.style.display);
  }
  if(admin){
    if(!canAccessAdmin){ admin.style.display = 'none'; }
  }
}
function updateNavLabels(){
  const email = getSessionEmail();
  console.log('updateNavLabels - email:', email);
  const loginBtn = document.querySelector('nav [data-nav="login"]');
    const logoutBtn = document.getElementById('accountLogout');
  const memberBtn = document.querySelector('nav [data-nav="membership"]');
  const bookingBtn = document.querySelector('nav [data-nav="booking"]');
  const paymentsBtn = document.querySelector('nav [data-nav="payments"]');
  
  // Hide login button when logged in, show when logged out
  if(loginBtn){ 
    loginBtn.style.display = email ? 'none' : 'inline-block';
    console.log('Login button display:', loginBtn.style.display);
    // Show logout button when logged in, hide when logged out
    if(logoutBtn){ 
      logoutBtn.style.display = email ? 'inline-block' : 'none';
      console.log('Logout button display:', logoutBtn.style.display);
    }
  }
  // Change membership button text based on login state
  if(memberBtn){ 
    memberBtn.textContent = email ? 'My Account' : 'Membership';
    console.log('Member button text:', memberBtn.textContent);
  }
  // Show/hide member-only nav buttons
  if(bookingBtn){ bookingBtn.style.display = email ? 'inline-block' : 'none'; }
  if(paymentsBtn){ paymentsBtn.style.display = email ? 'inline-block' : 'none'; }
}

// Toast notifications
function showToast(msg){
  const el=document.getElementById('toast'); if(!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(showToast.__t);
  showToast.__t = setTimeout(()=>{ el.style.display='none'; }, 2500);
}

function updateMembershipPanel(){
  const email = getSessionEmail();
  const panel = document.getElementById('accountPanel');
  const content = document.getElementById('membershipContent');
  const summary = document.getElementById('accountSummary');
  const pmStatus = document.getElementById('paymentMethodStatus');
  console.log('updateMembershipPanel called, email:', email);
  console.log('accountPanel:', panel, 'membershipContent:', content);
  if(!panel || !content) return;
  if(email){
    console.log('User logged in, showing account panel');
    content.style.display='none'; 
    panel.style.display='block';
    try{ renderAccountSummary(); }catch(_){ }
    const member = (typeof MEMBERS!=='undefined')? MEMBERS.find(m=>m.email===email):null;
    if(member && summary){
      const lines = [
        `Email: ${member.email}`,
        `Name: ${member.first||''} ${member.last||''}`,
        `Country: ${member.country||''}`,
        `License #: ${member.licenseNumber||''}`,
        `Status: ${member.status||'active'}`,
        `Member Since: ${member.createdTs? new Date(member.createdTs).toLocaleDateString() : ''}`
      ]; summary.textContent = lines.join('\n');
      const hasCard = !!member.cardOnFile && !!member.stripeDefaultPm;
      if(pmStatus){ pmStatus.innerHTML = `<span style="font-weight:700">Payment Method:</span> <span class="badge" style="${hasCard?'background:#2d6a4f33;border-color:#2d6a4f66;color:#2d6a4f':'background:#6c757d22;border-color:#6c757d55;color:#6c757d'}">Card on file: ${hasCard?'Yes':'No'}</span>${member.cardRemovalOverride? '<span class="badge" style="margin-left:6px;background:#ffc10733;border-color:#ffc10766;color:#7a5e00">Waiver</span>':''}`; }
      const rmBtn = document.getElementById('removeSavedCard'); if(rmBtn){ rmBtn.style.display = hasCard ? 'inline-block' : 'none'; }
      // Async debt check: disable removal if any overdue unpaid booking
      setTimeout(async ()=>{
        try{
          if(!hasCard) return; // no card, ignore
          const db=getDB(); const u=getUtils()||{}; if(!(db&&u.collection&&u.where&&u.getDocs&&u.query)) return;
          const q = await u.getDocs(u.query(u.collection(db,'bookings'), u.where('userEmail','==',member.email)));
          let owes=false; const now=Date.now();
          q.forEach(docSnap=>{
            const b=docSnap.data();
            const ret=b.returnDate? new Date(b.returnDate).getTime():0;
            const overdue = ret && now>ret;
            const unpaidLate = overdue && !b.lateFeePaid;
            const activeStatus = ['active','extended','pending','rented'].includes(b.status||'');
            if(activeStatus && (unpaidLate || overdue && !b.paidAt)) owes=true;
          });
          if(owes && rmBtn){
            rmBtn.disabled=true; rmBtn.title='Cannot remove saved card while an overdue or unpaid booking exists.';
            rmBtn.textContent='Remove Saved Card (Locked)';
          }
        }catch(e){ console.warn('Debt check failed', e.message); }
      },10);
    } else if(summary){ summary.textContent = `Logged in as ${email}`; }
    if(typeof renderAccountBookings==='function'){ renderAccountBookings(); }
  } else { 
    console.log('User logged out, showing membership content');
    panel.style.display='none'; 
    content.style.display='block'; 
  }
}

// Login / Logout
document.addEventListener('submit', (e)=>{
  const form = e.target.closest('#login-form');
  if(!form) return;
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const pw = document.getElementById('loginPassword').value.trim();
  if(!email || !pw){ alert('Enter email and password'); return; }

  // Basic client-side rate limiting to avoid verifyPassword quota
  const now = Date.now();
  const key = `login_rate_${email}`;
  const state = JSON.parse(localStorage.getItem(key) || '{}');
  const windowMs = 5*60*1000; // 5 minutes
  const maxAttempts = 5; // allow up to 5 attempts per 5 minutes
  if(state.until && now < state.until){
    const wait = Math.ceil((state.until - now)/1000);
    alert(`Too many attempts. Try again in ${wait} seconds.`);
    return;
  }
  // initialize window
  if(!state.start || (now - state.start) > windowMs){ state.start = now; state.count = 0; }
  state.count = (state.count||0) + 1;
  if(state.count > maxAttempts){
    // cooldown 2 minutes
    state.until = now + 2*60*1000;
    localStorage.setItem(key, JSON.stringify(state));
    alert('Too many attempts. Please wait 2 minutes and try again.');
    return;
  }
  localStorage.setItem(key, JSON.stringify(state));
  const api=getAuthApi(); const auth=getAuthInstance();
  if(api.signInWithEmailAndPassword && auth){
    api.signInWithEmailAndPassword(auth,email,pw).then(async()=>{
      console.log('Login successful, email:', email);
      // After login, verify membership status before enabling session
      try{
        const db = getDB(); const utils = getUtils();
        const uid = auth && auth.currentUser && auth.currentUser.uid;
        // Owner bypass: allow owner to log in even if profile missing or flagged
        if(email === OWNER_EMAIL){
          // ensure admin UI loads; skip ban/profile checks
        } else if(db && utils && uid){
          const snap = await utils.getDoc(utils.doc(db,'users',uid));
          if(snap.exists()){
            const data = snap.data();
            if(data && data.status === 'banned'){
              console.warn('Banned account attempted login; signing out.');
              try{ showToast('Your account is disabled. Contact support.'); }catch{}
              try{ await api.signOut(auth); }catch{}
              goto('login');
              return; // do not proceed to set session
            }
          } else {
            console.warn('No membership profile found post-login; signing out.');
            try{ await api.signOut(auth); }catch{}
            goto('login');
            return;
          }
        }
      }catch(e){ console.warn('Post-login status check failed:', e?.message||e); }

      // Mark this as an explicit login (not a persisted Firebase session)
      sessionStorage.setItem('explicitLogin', 'true');
      setSessionEmail(email); // Store email immediately after login
      // Clear any logout timestamp from previous session
      localStorage.removeItem('lastLogoutTime');
      // Immediately update UI
      updateNavLabels();
      updateMembershipPanel();
      updateAdminVisibility();
      showToast('Logged in');
      if(email===OWNER_EMAIL){
        goto('admin');
        setTimeout(()=>{ loadAdminBookings().then(renderAdminBookings); loadMembersAndRender(); },100);
      } else { goto('vehicles'); }
    }).catch(err=>{
      // On failure, add small backoff
      try{
        const st = JSON.parse(localStorage.getItem(key) || '{}');
        st.count = (st.count||0) + 1;
        if(st.count > maxAttempts){ st.until = Date.now() + 2*60*1000; }
        localStorage.setItem(key, JSON.stringify(st));
      }catch{}
      alert(cleanErrorMessage(err));
    });
  } else {
    // Fallback legacy session
    setSessionEmail(email);
    updateNavLabels();
    updateMembershipPanel();
    updateAdminVisibility();
    showToast('Logged in');
    if(email===OWNER_EMAIL){ goto('admin'); setTimeout(()=>{ loadAdminBookings().then(renderAdminBookings); loadMembersAndRender(); },100); } else { goto('vehicles'); }
  }
});

// Pre-login disabled notice: when email is entered, check membership status
document.addEventListener('input', async (e)=>{
  if(e.target && e.target.id === 'loginEmail'){
    const email = (e.target.value||'').trim();
    const db = getDB(); const utils = getUtils();
    if(!db || !utils || !email) return;
    try{
      const q = utils.query(utils.collection(db,'users'), utils.where('email','==', email));
      const snap = await utils.getDocs(q);
      let banned = false;
      snap.forEach(d=>{ const data=d.data(); if(data && data.status === 'banned') banned = true; });
      let note = document.getElementById('loginNotice');
      if(!note){
        note = document.createElement('div');
        note.id = 'loginNotice';
        note.style.marginTop = '6px';
        note.style.fontSize = '12px';
        note.style.color = 'var(--muted)';
        const form = document.getElementById('login-form');
        if(form) form.appendChild(note);
      }
      if(note){
        note.textContent = banned ? 'This account is disabled. Contact support.' : '';
      }
    }catch(err){ /* silent */ }
  }
});

// Add a simple logout button to membership page if needed, or reuse login form
document.addEventListener('click',(e)=>{ 
  const btn=e.target.closest('#accountLogout'); 
  if(!btn) return; 
  e.preventDefault(); 
  // Clear session first
  sessionStorage.removeItem('sessionEmail');
  
  // Immediately force UI changes
  const loginBtn = document.querySelector('nav [data-nav="login"]');
  const logoutNavBtn = document.getElementById('accountLogout');
  const memberBtn = document.querySelector('nav [data-nav="membership"]');
  const bookingBtn = document.querySelector('nav [data-nav="booking"]');
  const paymentsBtn = document.querySelector('nav [data-nav="payments"]');
  const adminTab = document.getElementById('adminTab');
  
  if(loginBtn) loginBtn.style.display = 'inline-block';
  if(logoutNavBtn) logoutNavBtn.style.display = 'none';
  if(memberBtn) memberBtn.textContent = 'Membership';
  if(bookingBtn) bookingBtn.style.display = 'none';
  if(paymentsBtn) paymentsBtn.style.display = 'none';
  if(adminTab) adminTab.style.display = 'none';
  // Clear explicit login flag and mark logout timestamp
  try{ 
    sessionStorage.removeItem('explicitLogin');
    localStorage.setItem('lastLogoutTime', Date.now().toString()); 
  }catch{}

  // Close mobile menu if open
  try{
    const nav = document.querySelector('header nav');
    const closeBtn = document.getElementById('mobileMenuClose');
    if(nav) nav.classList.remove('mobile-open');
    if(closeBtn) closeBtn.style.display = 'none';
  }catch{}
  
  // Update membership panel
  const panel = document.getElementById('accountPanel');
  const content = document.getElementById('membershipContent');
  if(panel) panel.style.display = 'none';
  if(content) content.style.display = 'block';
  
  // Then sign out from Firebase
  const api=getAuthApi(); const auth=getAuthInstance();
  if(api.signOut && auth){ try{ api.signOut(auth); }catch(_){} }
  try{ stopMyBookingsRealtime(); }catch{}
  
  // Redirect immediately
  showToast('Logged out'); 
  try{ updateNavLabels(); }catch{}
  // Extra safety: re-check after auth state settles
  try{ setTimeout(()=>{ try{ updateNavLabels(); }catch{} }, 250); }catch{}
  try{ setTimeout(()=>{ try{ updateNavLabels(); }catch{} }, 800); }catch{}
  goto('vehicles');
});

// Account deletion handler
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('#accountDelete');
  if(!btn) return;
  e.preventDefault();
  
  const email = getSessionEmail();
  if(!email){ alert('You must be logged in to delete your account.'); return; }
  
  // Check if user has any active, accepted, rented, or extended bookings
  loadBookingsForEmail(email);
  const activeBookings = MY_BOOKINGS.filter(b => 
    b.status === 'active' || 
    b.status === 'accepted' || 
    b.status === 'rented' || 
    b.status === 'extended'
  );
  
  if(activeBookings.length > 0){
    alert('You cannot delete your account while you have active, accepted, rented, or extended bookings. Please complete or cancel all bookings first.');
    return;
  }
  
  if(!confirm('Are you sure you want to delete your account? This action cannot be undone.')) return;
  if(!confirm('This will permanently delete all your data. Continue?')) return;
  
  try{
    const api = getAuthApi();
    const auth = getAuthInstance();
    const uid = auth && auth.currentUser && auth.currentUser.uid;
    
    // Delete from Firestore
    const db = getDB();
    const { doc, deleteDoc } = getUtils();
    if(db && uid){
      await deleteDoc(doc(db, 'users', uid));
    }
    
    // Delete Firebase Auth account
    if(auth && auth.currentUser && auth.currentUser.delete){
      await auth.currentUser.delete();
    }
    
    // Clear local data
    loadBookingsForEmail(email);
    MY_BOOKINGS.length = 0;
    saveBookingsForEmail(email);
    localStorage.removeItem(bookingsKey(email));
    
    clearSession();
    updateNavLabels();
    updateMembershipPanel();
    
    alert('Your account has been deleted successfully.');
    goto('vehicles');
  }catch(err){
    console.error('Account deletion failed:', err);
    alert('Failed to delete account: ' + (err.message || 'Unknown error'));
  }
});

// Update Info modal handlers
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('#updateInfoBtn');
  if(!btn) return;
  e.preventDefault();

  const auth = getAuthInstance();
  const uid = auth?.currentUser?.uid;
  if(!uid){ alert('You must be logged in.'); return; }
  
  const db = getDB();
  const { doc, getDoc } = getUtils();
  if(!db){ alert('Database not available.'); return; }
  
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if(!userDoc.exists()){ alert('User data not found.'); return; }
    
    const data = userDoc.data();
    document.getElementById('updateFirstName').value = data.firstName || '';
    document.getElementById('updateLastName').value = data.lastName || '';
    document.getElementById('updateAddress').value = data.address || '';
    document.getElementById('updateState').value = data.state || '';
    document.getElementById('updateCountry').value = data.country || '';
    document.getElementById('updateLicenseNumber').value = data.licenseNumber || '';
    document.getElementById('updateLicenseCountry').value = data.licenseCountry || '';
    document.getElementById('updateLicenseIssueDate').value = data.licenseIssueDate || '';
    document.getElementById('updateLicenseExpireDate').value = data.licenseExpireDate || '';
    
    // Show existing photo if available
    const previewDiv = document.getElementById('updatePhotoPreview');
    if(data.licensePhotoData){
      previewDiv.innerHTML = `<img src="${data.licensePhotoData}" alt="Current license photo" style="width:100%;height:auto;border-radius:8px;border:1px solid #ccc">`;
    } else {
      previewDiv.innerHTML = '<small style="color:#666">No photo on file</small>';
    }
    
    document.getElementById('updateInfoModal').style.display = 'block';
  } catch(err){
    console.error('Failed to load user data:', err);
    alert('Failed to load your information.');
  }
});

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('#updateInfoCancel');
  if(!btn) return;
  e.preventDefault();
  document.getElementById('updateInfoModal').style.display = 'none';
  document.getElementById('updateInfoForm').reset();
});

document.addEventListener('submit', async (e)=>{
  const form = e.target.closest('#updateInfoForm');
  if(!form) return;
  e.preventDefault();
  
  const auth = getAuthInstance();
  const uid = auth?.currentUser?.uid;
  if(!uid){ alert('You must be logged in.'); return; }
  
  const db = getDB();
  const { doc, updateDoc } = getUtils();
  if(!db){ alert('Database not available.'); return; }
  
  const updates = {
    firstName: document.getElementById('updateFirstName').value.trim(),
    lastName: document.getElementById('updateLastName').value.trim(),
    address: document.getElementById('updateAddress').value.trim(),
    state: document.getElementById('updateState').value.trim(),
    licenseNumber: document.getElementById('updateLicenseNumber').value.trim(),
    licenseIssueDate: document.getElementById('updateLicenseIssueDate').value,
    licenseExpireDate: document.getElementById('updateLicenseExpireDate').value,
  };
  
  // Handle new license photo if uploaded
  const photoInput = document.getElementById('updateLicensePhoto');
  if(photoInput?.files?.[0]){
    try {
      const photoData = await new Promise((resolve, reject)=>{
        const file = photoInput.files[0];
        const reader = new FileReader();
        reader.onload = (ev)=>{
          const img = new Image();
          img.onload = ()=>{
            // Compress image to fit Firestore 1MB limit
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            if(width > height){
              if(width > MAX_WIDTH){ height = height * (MAX_WIDTH / width); width = MAX_WIDTH; }
            } else {
              if(height > MAX_HEIGHT){ width = width * (MAX_HEIGHT / height); height = MAX_HEIGHT; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            // Compress to JPEG with 0.7 quality to reduce size
            const compressed = canvas.toDataURL('image/jpeg', 0.7);
            resolve(compressed);
          };
          img.onerror = reject;
          img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      updates.licensePhotoData = photoData;
      updates.licensePhotoUrl = photoData; // Also save to licensePhotoUrl for admin viewer consistency
    } catch(err){
      console.error('Failed to read photo:', err);
      alert('Failed to process photo. Please try again.');
      return;
    }
  }
  
  // Handle password update
  const newPassword = document.getElementById('updatePassword').value.trim();
  if(newPassword){
    if(newPassword.length < 6){
      alert('Password must be at least 6 characters.');
      return;
    }
    try {
      await auth.currentUser.updatePassword(newPassword);
      showToast('Password updated');
    } catch(err){
      console.error('Password update failed:', err);
      alert('Failed to update password: ' + (err.message || 'Unknown error'));
      return;
    }
  }
  
  try {
    await updateDoc(doc(db, 'users', uid), updates);
    alert('Your information has been updated successfully!');
    document.getElementById('updateInfoModal').style.display = 'none';
    document.getElementById('updateInfoForm').reset();
    updateMembershipPanel(); // Refresh account display
  } catch(err){
    console.error('Update failed:', err);
    alert('Failed to update your information: ' + (err.message || 'Unknown error'));
  }
});

// Preview new license photo in update modal
document.getElementById('updateLicensePhoto')?.addEventListener('change', (e)=>{
  const file = e.target.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    const img = new Image();
    img.onload = ()=>{
      // Compress preview
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX = 800;
      if(width > height){ if(width > MAX){ height *= (MAX/width); width = MAX; } }
      else { if(height > MAX){ width *= (MAX/height); height = MAX; } }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const compressed = canvas.toDataURL('image/jpeg', 0.8);
      const preview = document.getElementById('updatePhotoPreview');
      preview.innerHTML = `<img src="${compressed}" alt="New license photo preview" style="width:100%;height:auto;border-radius:8px;border:1px solid #ccc">`;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

// Ensure admin visibility reflects any stored session on load
updateAdminVisibility();

// Contact form demo
document.addEventListener('submit', (e)=>{
  const form = e.target.closest('#contact-form');
  if(!form) return;
  e.preventDefault();
  const first = document.getElementById('cFirst').value.trim();
  const last = document.getElementById('cLast').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  const msg = document.getElementById('cMsg').value.trim();
  // Captcha validation
  const ansEl = document.getElementById('captchaAnswer');
  const correct = window.__captcha_sum__;
  const provided = parseInt((ansEl?.value||'').trim(),10);
  if(!first || !last || !email || !msg){ alert('Please complete all contact fields.'); return; }
  if(!(Number.isFinite(provided) && provided === correct)) { alert('Captcha incorrect. Please try again.'); return; }
  saveContactMessage({ first, last, email, msg });
  alert('Message received. We will reply shortly.');
  form.reset();
  initCaptcha();
  // If owner is viewing admin, refresh inbox silently
  if(getSessionEmail() === OWNER_EMAIL){ loadInboxMessages().then(renderInbox); }
  updateNavLabels(); updateMembershipPanel();
});

// WhatsApp link populate
document.addEventListener('input', (e)=>{
  const ids = new Set(['cFirst','cLast','cMsg']); if(!ids.has(e.target.id)) return;
  const first = document.getElementById('cFirst').value.trim();
  const last = document.getElementById('cLast').value.trim();
  const msg = document.getElementById('cMsg').value.trim();
  const text = encodeURIComponent(`Hi, this is ${first} ${last}. ${msg}`);
  const wa = document.getElementById('waDirect');
  if(wa) wa.href = `https://wa.me/?text=${text}`;
});

// Weekly booking auto-calc: update return date when pickup or weeks change
document.addEventListener('input', (e)=>{
  if(e.target.id==='pickupDate' || e.target.id==='bookingWeeks'){
    const pickup = document.getElementById('pickupDate')?.value;
    const w = Math.max(1, parseInt(document.getElementById('bookingWeeks')?.value||'1',10) || 1);
    if(pickup){ const d=new Date(pickup); d.setDate(d.getDate()+7*w); const ret = d.toISOString().slice(0,10); const el=document.getElementById('returnDate'); if(el){ el.value = ret; } }
  }
});

// Vehicles (no hard-coded defaults to avoid duplication with Firestore)
const VEHICLES = [];
// Preserve defaults for fallback when Firestore returns empty (empty by design)
const DEFAULT_VEHICLES = [];

// Merge Firestore vehicles with defaults so missing entries don't disappear
function mergeVehiclesWithDefaults(fireList){
  const byId = new Map();
  // seed defaults first
  DEFAULT_VEHICLES.forEach(v=>{
    const base = { ...v };
    base.available = v.available !== false;
    base.pending = v.pending === true;
    base.imgs = Array.isArray(v.imgs) ? v.imgs : [];
    byId.set(v.id, base);
  });
  // overlay Firestore values
  (fireList||[]).forEach(v=>{
    const curr = byId.get(v.id) || { id:v.id };
    const merged = {
      ...curr,
      name: v.name ?? curr.name,
      type: v.type ?? curr.type,
      seats: v.seats ?? curr.seats,
      price: v.price ?? curr.price,
      imgs: Array.isArray(v.imgs) ? v.imgs : (curr.imgs||[]),
      available: v.available !== false,
      pending: v.pending === true,
      details: v.details ?? curr.details
    };
    byId.set(v.id, merged);
  });
  return Array.from(byId.values());
}

function seedBooking(){
  const sel=document.getElementById('vehicle-select'); if(!sel) return;
  sel.innerHTML='';
  VEHICLES.forEach(v=>{
    const o=document.createElement('option');
    const isAvail = v.available !== false;
    o.value=v.id;
    o.textContent = isAvail ? v.name : `${v.name} (Unavailable)`;
    if(!isAvail){ o.disabled = true; }
    sel.appendChild(o);
  });
}
function seedPayments(){ const list=document.getElementById('payments-list'); if(!list) return; list.innerHTML=''; const demo=[{id:'bk1',veh:VEHICLES[0],amount:VEHICLES[0].price,method:'PayPal'},{id:'bk2',veh:VEHICLES[0],amount:VEHICLES[0].price,method:'Zelle'}]; demo.forEach(b=>{ const el=document.createElement('div'); el.className='card'; el.innerHTML=`<div class='body'><div style='font-weight:700'>${b.veh.name}</div><div class='muted'>Amount: $${b.amount}/week</div><div style='display:flex;gap:8px;margin-top:8px'><button class='navbtn'>Pay ${b.method}</button><button class='navbtn'>Details</button></div></div>`; list.appendChild(el); }); }
function renderVehicles(){
  const grid=document.getElementById('vehicle-grid'); if(!grid) return; grid.innerHTML='';
  // Fallback: if realtime/Firestore provided no vehicles, restore defaults
  if(!VEHICLES.length){ DEFAULT_VEHICLES.forEach(v=>VEHICLES.push({ ...v })); }
  VEHICLES.forEach(v=>{
    const isAvail = v.available !== false;
    const isPending = v.pending === true;
    const el=document.createElement('article'); el.className='card';
    const bookBtn = (isAvail && !isPending)
      ? `<button class='navbtn' aria-label='Book ${v.name}' data-nav='booking' data-veh='${v.id}'>Book</button>`
      : `<button class='navbtn' disabled title='Unavailable' aria-disabled='true'>Book</button>`;
    const statusBadge = isAvail
      ? (isPending? `<span class='badge' style='margin-left:8px;background:#ffc10733;border-color:#ffc10766;color:#7a5e00'>Pending</span>` : '')
      : `<span class='badge unavailable' style='margin-left:8px'>Unavailable</span>`;
    const firstImg = (v.imgs&&v.imgs[0])||'';
    const imgHtml = firstImg 
      ? `<img alt="Photo of ${v.name}" loading="lazy" src="${firstImg}" onerror="this.src='https://via.placeholder.com/400x300.png?text=No+Image';this.onerror=null;" style="width:100%;height:auto;min-height:200px;object-fit:cover;background:#f0f0f0">` 
      : `<div style="width:100%;height:200px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#999">No Image</div>`;
    el.innerHTML=`${imgHtml}\n<div class='body'>
      <div style='display:flex;align-items:center;gap:8px'>
        <span class='veh-dot ${isAvail && !isPending?'available':'unavailable'}' title='${isAvail && !isPending?'Available':(isPending?'Pending':'Unavailable')}'></span>
        <div style='font-weight:800'>${v.name}</div>
      </div>
      <div class='muted' style='margin:6px 0'>Seats ${v.seats} • ${v.type}</div>
      <div style='display:flex;gap:8px;align-items:center'>
        ${bookBtn}
        <span style='margin-left:auto;color:#32CD32;font-weight:700'>$${v.price}/week</span>${statusBadge}
      </div>
      <div style='margin-top:8px'><button class='navbtn' data-gallery='${v.id}' aria-label='View photo gallery for ${v.name}'>View Photos</button></div>
    </div>`;
    grid.appendChild(el);
  });
  // Toggle empty-state message visibility
  try{
    const emptyMsg = document.getElementById('vehicle-empty');
    if(emptyMsg){ emptyMsg.style.display = VEHICLES.length ? 'none' : 'block'; }
  }catch{}
}

// Safety bootstrap: ensure vehicles render even if earlier init fails
try{
  window.addEventListener('load', ()=>{
    try{
      const grid = document.getElementById('vehicle-grid');
      if(grid && (!grid.children || grid.children.length===0)){
        renderVehicles();
      }
    }catch{}
  });
}catch{}

// ==== My Bookings (local per-user) ====
let MY_BOOKINGS = [];
function bookingsKey(email){ return `bookings:${email}`; }
function loadBookingsForEmail(email){ try{ const raw=localStorage.getItem(bookingsKey(email)); MY_BOOKINGS = raw? JSON.parse(raw):[]; }catch{ MY_BOOKINGS=[]; } }
function saveBookingsForEmail(email){ try{ localStorage.setItem(bookingsKey(email), JSON.stringify(MY_BOOKINGS||[])); }catch{} }

// Real-time sync for customer bookings
let MY_BOOKINGS_UNSUB = null;
function startMyBookingsRealtime(){
  const email = getSessionEmail();
  const db = getDB();
  const utils = getUtils() || {};
  if(!email || !db || !utils.onSnapshot || !utils.query || !utils.where) return;
  if(MY_BOOKINGS_UNSUB) return;
  
  const q = utils.query(utils.collection(db,'bookings'), utils.where('userEmail','==',email));
  MY_BOOKINGS_UNSUB = utils.onSnapshot(q, (snap)=>{
    loadBookingsForEmail(email);
    const fireBookings = [];
    snap.forEach(d=> fireBookings.push({ id:d.id, ...d.data() }));
    
    fireBookings.forEach(fb=>{
      let local = MY_BOOKINGS.find(b=> b.fireId===fb.id);
      if(!local){
        local = MY_BOOKINGS.find(b=> !b.fireId && b.vehicleId===fb.vehicleId && b.pickupDate===fb.pickupDate);
      }
      if(local){
        local.fireId = fb.id;
        local.status = fb.status || local.status;
        local.rentedAt = fb.rentedAt || local.rentedAt;
        local.returnDate = fb.returnDate || local.returnDate;
      } else {
        // Booking exists in Firestore but not locally, add it
        MY_BOOKINGS.push({
          id: 'bk_' + Date.now() + '_' + Math.random().toString(36).substr(2,9),
          fireId: fb.id,
          userEmail: fb.userEmail,
          vehicleId: fb.vehicleId,
          pickupDate: fb.pickupDate,
          returnDate: fb.returnDate,
          status: fb.status || 'pending',
          createdAt: fb.createdAt || Date.now(),
          weeks: fb.weeks || 1,
          rentedAt: fb.rentedAt
        });
      }
    });
    
    saveBookingsForEmail(email);
    // Force re-render immediately to show updated status
    renderAccountBookings();
  }, (error)=>{
    console.error('Realtime listener error:', error);
  });
}

function stopMyBookingsRealtime(){
  if(MY_BOOKINGS_UNSUB){
    try{ MY_BOOKINGS_UNSUB(); }catch{}
    MY_BOOKINGS_UNSUB = null;
  }
}

// Force-refresh customer's bookings from Firestore (immediate pull)
async function refreshCustomerBookingsFromFirestore(email){
  const db = getDB();
  const utils = getUtils() || {};
  if(!email || !db || !utils.collection || !utils.query || !utils.where || !utils.getDocs){
    // Fallback to local render if Firestore is unavailable
    loadBookingsForEmail(email);
    renderAccountBookings();
    return;
  }
  try{
    const q = utils.query(utils.collection(db,'bookings'), utils.where('userEmail','==',email));
    const snap = await utils.getDocs(q);
    const fireBookings = [];
    snap.forEach(d=> fireBookings.push({ id:d.id, ...d.data() }));

    // Merge Firestore into local state
    loadBookingsForEmail(email);
    fireBookings.forEach(fb=>{
      let local = MY_BOOKINGS.find(b=> b.fireId===fb.id);
      if(!local){
        local = MY_BOOKINGS.find(b=> !b.fireId && b.vehicleId===fb.vehicleId && b.pickupDate===fb.pickupDate);
      }
      if(local){
        local.fireId = fb.id;
        local.status = fb.status || local.status;
        local.rentedAt = fb.rentedAt || local.rentedAt;
        local.returnDate = fb.returnDate || local.returnDate;
        local.weeks = fb.weeks || local.weeks;
      } else {
        MY_BOOKINGS.push({
          id: 'bk_' + Date.now() + '_' + Math.random().toString(36).substr(2,9),
          fireId: fb.id,
          userEmail: fb.userEmail,
          vehicleId: fb.vehicleId,
          pickupDate: fb.pickupDate,
          returnDate: fb.returnDate,
          status: fb.status || 'pending',
          createdAt: fb.createdAt || Date.now(),
          weeks: fb.weeks || 1,
          rentedAt: fb.rentedAt
        });
      }
    });

    saveBookingsForEmail(email);
    renderAccountBookings();
  }catch(err){
    console.warn('Forced Firestore refresh failed:', err?.message||err);
    loadBookingsForEmail(email);
    renderAccountBookings();
  }
}

function renderAccountBookings(){
  const wrap=document.getElementById('accountBookings'); if(!wrap) return;
  const email=getSessionEmail(); if(!email){ wrap.innerHTML='<div class="muted">Log in to see your bookings.</div>'; return; }
  loadBookingsForEmail(email);
  if(!MY_BOOKINGS.length){ wrap.innerHTML='<div class="muted">No bookings yet.</div>'; return; }
  wrap.innerHTML='';
  MY_BOOKINGS.forEach(b => {
    const veh=VEHICLES.find(v=>v.id===b.vehicleId);
    const name=veh?veh.name:(b.vehicleId||'Vehicle');
    const status=b.status||'active';
    const dates=`${b.pickupDate||''} → ${b.returnDate||''}`;
    const card=document.createElement('article'); card.className='card';
    const badge = status==='active' ? ''
      : status==='accepted' ? `<span class='badge' style='background:#0d6efd33;border-color:#0d6efd66;color:#0d6efd'><strong>Status:</strong> Accepted</span>`
      : status==='rented' ? `<span class='badge' style='background:#19875433;border-color:#19875466;color:#198754'><strong>Status:</strong> Rented</span>`
      : status==='cancelled' ? `<span class='badge unavailable'><strong>Status:</strong> Cancelled</span>`
      : status==='rejected' ? `<span class='badge' style='background:#6c757d33;border-color:#6c757d66;color:#6c757d'><strong>Status:</strong> Rejected</span>`
      : `<span class='badge' style='background:rgba(255,255,255,.08)'><strong>Status:</strong> ${status}</span>`;
    const pricePerWeek = veh?.price || 0;
    const nowMs = Date.now();
    const retMs = b.returnDate ? new Date(b.returnDate).getTime() : 0;
    const overdueMs = retMs ? Math.max(0, nowMs - retMs) : 0;
    const overdueHours = overdueMs > 0 ? Math.ceil(overdueMs / (1000*60*60)) : 0;
    const lateFee = overdueHours * 15; // $15/hour late fee
    // Determine if late and compute overdue fee for display
    const nowMS = Date.now();
    let overdueHoursDisplay = '';
    if(status==='rented' && b.returnDate){
      const retMS = new Date(b.returnDate).getTime();
      const overdueMs = nowMS - retMS;
      if(overdueMs > 0){
        const overdueHours = Math.ceil(overdueMs / (1000*60*60));
        overdueHoursDisplay = `<div style='margin-top:6px;font-size:11px;color:#c1121f;font-weight:600'>Late by ${overdueHours}h • $${overdueHours*15} late fee accruing</div>`;
      }
    }
    card.innerHTML=`<div class='body'>
      <div style='display:flex;gap:8px;align-items:center'>
        <div style='font-weight:700'>${name}</div>
        <span class='muted' style='margin-left:auto;font-size:12px'>${new Date(b.createdAt||Date.now()).toLocaleString()}</span>
      </div>
      <div class='muted' style='margin-top:4px;font-size:12px'>${dates}</div>
      <div style='margin-top:4px;display:flex;gap:8px;align-items:center;flex-wrap:wrap'>
        <span style='font-size:11px;color:#666'>ID: <code style='background:#f0f0f0;padding:2px 4px;border-radius:3px;font-size:10px'>${b.id}</code></span>
        <button class='navbtn' data-bk-copy-id='${b.id}' style='font-size:11px;padding:4px 8px'>Copy ID</button>
      </div>
      <div style='margin-top:4px'>${badge}</div>
      ${status==='rented'?`<div class='muted' style='margin-top:4px;font-size:12px'>Rented at ${b.rentedAt? new Date(b.rentedAt).toLocaleString():''}</div>`:''}
      ${status==='rented'?`<div style='margin-top:4px;font-size:12px'><strong>Time until payment/return:</strong> <span class='countdown' data-return='${b.returnDate||''}' data-rented='${b.rentedAt||''}'>—</span></div>`:''}
      ${status==='rented'?`<div style='margin-top:8px;padding:8px;background:rgba(255,193,7,.1);border-left:3px solid #ffc107;font-size:11px;line-height:1.4'><strong>⚠️ Important:</strong> If extending, pay before timer expires. If returning, return before timer expires or a late fee of <strong>$15/hour</strong> will be added.</div>`:''}
      ${(status==='active'||status==='accepted'||status==='cancelled'||status==='rejected'||status==='rented')?`<div style='display:flex;gap:8px;margin-top:8px;flex-wrap:wrap'>
        ${status==='accepted'?`<button class='navbtn' data-bk-pay-now='${b.id}'>Pay Now</button>`:''}
        ${(status==='active'||status==='accepted')?`<button class='navbtn' data-bk-cancel='${b.id}'>Cancel</button>`:''}
        ${status==='rented'?`<button class='navbtn' data-bk-extend='${b.id}'>Extend</button><button class='navbtn' data-bk-extend1w='${b.id}'>Extend 1 Week${lateFee>0?` (+$${lateFee} late fee)`:''}</button>`:''}
        ${status==='cancelled'||status==='rejected'?`<button class='navbtn' data-bk-delete='${b.id}' style='background:#c1121f;border-color:#c1121f'>Delete</button>`:''}
      </div>`:''}
      ${overdueHoursDisplay}
    </div>`;
    wrap.appendChild(card);
  });
  startCountdowns();
}

// Countdown timer updater
function startCountdowns(){
  setInterval(()=>{
    document.querySelectorAll('.countdown').forEach(el=>{
      const returnDate = el.dataset.return;
      const rentedAt = el.dataset.rented;
      if(!returnDate || !rentedAt){ el.textContent = '—'; return; }
      
      const now = Date.now();
      const rented = parseInt(rentedAt,10);
      const ret = new Date(returnDate).getTime();
      const diff = ret - now;
      
      if(diff <= 0){
        const overdueMs = Math.abs(diff);
        const overdueHours = Math.ceil(overdueMs/(1000*60*60));
        el.textContent = `Late ${overdueHours}h`;
        el.style.color = '#c1121f';
        el.style.fontWeight = '700';
        el.style.textShadow = '0 0 6px rgba(193,18,31,.5)';
        return;
      }
      
      const days = Math.floor(diff / (1000*60*60*24));
      const hours = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
      const mins = Math.floor((diff % (1000*60*60)) / (1000*60));
      const secs = Math.floor((diff % (1000*60)) / 1000);
      
      el.textContent = `${days}d ${hours}h ${mins}m ${secs}s`;
      
      // Color coding based on urgency
      if(diff < 24*60*60*1000){ el.style.color = '#c1121f'; } // <24h = red
      else if(diff < 3*24*60*60*1000){ el.style.color = '#ffc107'; } // <3d = yellow
      else { el.style.color = '#2d6a4f'; } // 3+d = green
    });
  }, 1000);
}

// ===== Booking Terms & Conditions Modal =====
// Store pending booking data when terms modal is shown
let pendingBookingData = null;

// Checkbox controls the "I Agree" button
const bookingTermsCheckbox = document.getElementById('bookingTermsCheckbox');
const bookingTermsAgreeBtn = document.getElementById('bookingTermsAgree');
if(bookingTermsCheckbox && bookingTermsAgreeBtn){
  bookingTermsCheckbox.addEventListener('change', ()=>{
    if(bookingTermsCheckbox.checked){
      bookingTermsAgreeBtn.disabled = false;
      bookingTermsAgreeBtn.style.opacity = '1';
    } else {
      bookingTermsAgreeBtn.disabled = true;
      bookingTermsAgreeBtn.style.opacity = '0.5';
    }
  });
}

// Decline button - close modal and cancel booking
const bookingTermsDeclineBtn = document.getElementById('bookingTermsDecline');
if(bookingTermsDeclineBtn){
  bookingTermsDeclineBtn.addEventListener('click', ()=>{
    const modal = document.getElementById('bookingTermsModal');
    if(modal){ modal.style.display = 'none'; }
    if(bookingTermsCheckbox){ bookingTermsCheckbox.checked = false; }
    if(bookingTermsAgreeBtn){ 
      bookingTermsAgreeBtn.disabled = true; 
      bookingTermsAgreeBtn.style.opacity = '0.5'; 
    }
    pendingBookingData = null;
    showToast('Booking cancelled - Terms not accepted');
  });
}

// Agree button - process the booking
if(bookingTermsAgreeBtn){
  bookingTermsAgreeBtn.addEventListener('click', ()=>{
    if(!pendingBookingData){ 
      showToast('No pending booking data'); 
      return; 
    }
    // Close modal
    const modal = document.getElementById('bookingTermsModal');
    if(modal){ modal.style.display = 'none'; }
    // Reset checkbox for next time
    if(bookingTermsCheckbox){ bookingTermsCheckbox.checked = false; }
    if(bookingTermsAgreeBtn){ 
      bookingTermsAgreeBtn.disabled = true; 
      bookingTermsAgreeBtn.style.opacity = '0.5'; 
    }
    // Process the booking
    processBooking(pendingBookingData);
    pendingBookingData = null;
  });
}

// Process booking function (extracted from original submit handler)
function processBooking(data){
  const { email, vehId, pickupDate, returnDate, weeks } = data;
  loadBookingsForEmail(email);
  const id='bk_'+Date.now();
  const createdTs = Date.now();
  const localBk = { id, userEmail: email, vehicleId: vehId, pickupDate, returnDate, status: 'active', createdAt: createdTs, weeks };
  MY_BOOKINGS.push(localBk);
  saveBookingsForEmail(email);
  // Mirror to Firestore and capture document id for future updates
  try{
    const db=getDB(); const { addDoc, collection } = getUtils();
    if(db){
      const member = (typeof MEMBERS!=='undefined')? MEMBERS.find(m=>m.email===email):null;
      const payload = {
        userEmail: email,
        vehicleId: vehId,
        pickupDate,
        returnDate,
        weeks,
        status: 'pending',
        createdAt: createdTs,
        customer: member ? {
          email: member.email||'', first: member.first||'', last: member.last||'',
          address: member.address||'', state: member.state||'', country: member.country||'',
          licenseNumber: member.licenseNumber||'', licenseCountry: member.licenseCountry||'',
          licenseIssueDate: member.licenseIssueDate||'', licenseExpireDate: member.licenseExpireDate||''
        } : { email }
      };
      addDoc(collection(db,'bookings'), payload).then(ref=>{ 
        localBk.fireId = ref.id; 
        saveBookingsForEmail(email); 
        console.log('Booking saved to Firestore with ID:', ref.id, payload);
        // Audit: booking created (non-blocking)
        try{
          const veh = VEHICLES.find(v=>v.id===vehId);
          fetch('/.netlify/functions/audit-booking-event', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              bookingId: ref.id, eventType: 'created', userEmail: email, weeks, rateCents: (veh?.price||0)*100,
              returnDateISO: returnDate, agreementVersion: TERMS_VERSION, snapshot: { booking: payload, vehicle: veh||{} }
            })
          }).catch(e=>console.warn('Audit create failed', e.message));
        }catch(e){ console.warn('Audit create failed', e.message); }
      }).catch(err=>console.warn('Add booking failed:', err.message));
    }
  }catch(err){ console.warn('Could not save booking to Firestore:', err.message); }
  alert('Booking submitted. You can manage it in My Account.');
  goto('membership');
  updateMembershipPanel();
}

// Booking submit -> show terms modal first
document.addEventListener('submit',(e)=>{
  const form=e.target.closest('#booking-form'); if(!form) return;
  e.preventDefault();
  const email=getSessionEmail(); if(!email){ alert('Please log in before booking.'); goto('login'); return; }
  const vehId=document.getElementById('vehicle-select')?.value;
  const pickupDate=document.getElementById('pickupDate')?.value;
  // Enforce weekly-only booking by computing return date from weeks
  const weeksSel = document.getElementById('bookingWeeks');
  const weeks = Math.max(1, parseInt(weeksSel?.value||'1',10) || 1);
  const returnDate = (function(){
    if(!pickupDate) return '';
    const d=new Date(pickupDate);
    d.setDate(d.getDate() + 7*weeks);
    return d.toISOString().slice(0,10);
  })();
  const retInput = document.getElementById('returnDate'); if(retInput){ retInput.value = returnDate; }
  if(!vehId || !pickupDate || !returnDate){ alert('Select vehicle and dates.'); return; }
  
  // Store booking data and show terms modal
  pendingBookingData = { email, vehId, pickupDate, returnDate, weeks };
  const modal = document.getElementById('bookingTermsModal');
  if(modal){ 
    modal.style.display = 'block';
    // Scroll modal to top
    modal.scrollTop = 0;
  }
});

// Booking actions: cancel + extend + copy ID
document.addEventListener('click',(e)=>{
  const copyIdBtn=e.target.closest('[data-bk-copy-id]');
    if(copyIdBtn){ const id=copyIdBtn.dataset.bkCopyId; navigator.clipboard.writeText(id).then(()=>showToast('Booking ID copied!')).catch(()=>showToast('Failed to copy')); return; }
  const cancelBtn=e.target.closest('[data-bk-cancel]');
    if(cancelBtn){ const email=getSessionEmail(); if(!email) return; loadBookingsForEmail(email); const id=cancelBtn.dataset.bkCancel; const bk=MY_BOOKINGS.find(b=>b.id===id); if(bk && bk.status!=='cancelled'){ if(confirm('Cancel this booking?')){ bk.status='cancelled'; saveBookingsForEmail(email); renderAccountBookings();
      // update Firestore status if mirrored
      try{ const db=getDB(); const { doc, updateDoc } = getUtils(); if(db && bk.fireId){ updateDoc(doc(db,'bookings',bk.fireId), { status:'cancelled' }); } }catch(err){ console.warn('Failed to update Firestore on cancel:', err.message); }
      alert('Booking cancelled.'); } } return; }
  const deleteBtn=e.target.closest('[data-bk-delete]');
    if(deleteBtn){ const email=getSessionEmail(); if(!email) return; loadBookingsForEmail(email); const id=deleteBtn.dataset.bkDelete; const bk=MY_BOOKINGS.find(b=>b.id===id); if(bk){ if(confirm('Delete this booking record? This cannot be undone.')){ const idx=MY_BOOKINGS.findIndex(b=>b.id===id); if(idx>=0){ MY_BOOKINGS.splice(idx,1); saveBookingsForEmail(email); renderAccountBookings(); 
      // Delete from Firestore if mirrored
      try{ const db=getDB(); const { doc, deleteDoc } = getUtils(); if(db && bk.fireId){ deleteDoc(doc(db,'bookings',bk.fireId)).then(()=>console.log('Booking deleted from Firestore:',bk.fireId)).catch(err=>console.warn('Failed to delete from Firestore:',err.message)); } }catch(err){ console.warn('Failed to delete booking from Firestore:', err.message); }
      showToast('Booking deleted'); } } } return; }
  const extendBtn=e.target.closest('[data-bk-extend]');
    if(extendBtn){ const email=getSessionEmail(); if(!email) return; loadBookingsForEmail(email); const id=extendBtn.dataset.bkExtend; const bk=MY_BOOKINGS.find(b=>b.id===id); if(!bk || bk.status!=='active') return; const modal=document.getElementById('extendModal'); const extCurr=document.getElementById('extendCurrent'); const extWeeks=document.getElementById('extendWeeks'); const extPrev=document.getElementById('extendPreview'); const curr=bk.returnDate||bk.pickupDate; modal.style.display='block'; extCurr.textContent=curr; function updatePreview(){ const w=parseInt(extWeeks.value,10)||1; const d=new Date(curr); d.setDate(d.getDate()+7*w); extPrev.textContent=d.toISOString().slice(0,10); } updatePreview(); extWeeks.onchange=updatePreview; const onSave=async ()=>{ const w=parseInt(extWeeks.value,10)||1; const d=new Date(curr); d.setDate(d.getDate()+7*w); bk.returnDate=d.toISOString().slice(0,10); saveBookingsForEmail(email); renderAccountBookings(); modal.style.display='none'; cleanup();
      // Firestore update on extend
      try{ const db=getDB(); const { doc, updateDoc } = getUtils(); if(db && bk.fireId){ updateDoc(doc(db,'bookings',bk.fireId), { returnDate: bk.returnDate, status: 'extended' }); } }catch(err){ console.warn('Failed to update Firestore booking on extend:', err.message); }
      // Audit: booking extended
      try{
        const veh = VEHICLES.find(v=>v.id===bk.vehicleId);
        await fetch('/.netlify/functions/audit-booking-event', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            bookingId: bk.fireId||bk.id, eventType: 'extended', userEmail: email, extensionWeeks: w,
            returnDateISO: bk.returnDate, rateCents: (veh?.price||0)*100, agreementVersion: '',
            snapshot: { booking: bk, vehicle: veh||{} }
          })
        });
      }catch(e){ console.warn('Audit extend failed', e.message); }
      alert('Booking extended.'); }; const onCancel=()=>{ modal.style.display='none'; cleanup(); }; function cleanup(){ document.getElementById('extendSave').removeEventListener('click',onSave); document.getElementById('extendCancel').removeEventListener('click',onCancel); } document.getElementById('extendSave').addEventListener('click',onSave); document.getElementById('extendCancel').addEventListener('click',onCancel); return; }
  const payNowBtn=e.target.closest('[data-bk-pay-now]');
    if(payNowBtn){ const email=getSessionEmail(); if(!email) return; loadBookingsForEmail(email); const id=payNowBtn.dataset.bkPayNow; const bk=MY_BOOKINGS.find(b=>b.id===id); const veh=VEHICLES.find(v=>v.id===bk?.vehicleId); const amount=veh?.price||0; if(!bk||!amount){ showToast('Booking or amount missing'); return; } try{ const bidEl=document.getElementById('paymentBookingId'); const amtEl=document.getElementById('paymentAmount'); bidEl.value = bk.fireId || bk.id; amtEl.value = String(amount); bidEl.readOnly=true; amtEl.readOnly=true; bidEl.dataset.locked='1'; amtEl.dataset.locked='1'; goto('payments'); }catch{} return; }
  const extend1wBtn=e.target.closest('[data-bk-extend1w]');
    if(extend1wBtn){ const email=getSessionEmail(); if(!email) return; loadBookingsForEmail(email); const id=extend1wBtn.dataset.bkExtend1w; const bk=MY_BOOKINGS.find(b=>b.id===id); const veh=VEHICLES.find(v=>v.id===bk?.vehicleId); const base=veh?.price||0; const now=Date.now(); const retMs=bk?.returnDate? new Date(bk.returnDate).getTime():0; const overdueMs=retMs? Math.max(0, now-retMs):0; const overdueHours=overdueMs>0? Math.ceil(overdueMs/(1000*60*60)):0; const fee=overdueHours*15; const total=base+fee; if(!bk||!base){ showToast('Booking or vehicle price missing'); return; } try{ const bidEl=document.getElementById('paymentBookingId'); const amtEl=document.getElementById('paymentAmount'); bidEl.value = (bk.fireId || bk.id)+'_extend1w'; amtEl.value = String(total); bidEl.readOnly=true; amtEl.readOnly=true; bidEl.dataset.locked='1'; amtEl.dataset.locked='1'; goto('payments'); }catch{} return; }
});

// Admin member waiver grant/revoke
document.addEventListener('click',(e)=>{
  const btn = e.target.closest('[data-member-waiver]');
  if(!btn) return;
  const userId = btn.getAttribute('data-member-waiver');
  const adminEmail = getSessionEmail();
  if(!adminEmail){ alert('Admin login required'); return; }
  const member = MEMBERS.find(m=>m.id===userId);
  if(!member){ alert('Member not found'); return; }
  const targetEmail = member.email;
  const grant = !member.cardRemovalOverride;
  btn.disabled=true; const prev=btn.textContent; btn.textContent = grant? 'Granting…':'Revoking…';
  fetch(`/.netlify/functions/${grant? 'grant-card-removal-waiver':'revoke-card-removal-waiver'}`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ targetEmail, adminEmail })
  }).then(async resp=>{
    if(!resp.ok){ throw new Error(await resp.text()); }
    showToast(grant? 'Waiver granted':'Waiver revoked');
  }).catch(err=>{ alert('Waiver change failed: '+(err.message||err)); })
  .finally(()=>{ btn.disabled=false; btn.textContent=prev; setTimeout(()=>{ renderMembers(); },800); });
});

// Customer My Bookings manual refresh
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('#accountBookingsRefresh');
  if(!btn) return;
  const email = getSessionEmail();
  if(!email){ showToast('Log in to view bookings.'); return; }
  try{
    btn.disabled = true; const prev=btn.textContent; btn.textContent = 'Refreshing…';
    // Ensure realtime is running
    try{ startMyBookingsRealtime(); }catch(_){ }
    // Force a fresh pull from Firestore and re-render
    await refreshCustomerBookingsFromFirestore(email);
    try{ updateMembershipPanel(); }catch(_){ }
    showToast('Bookings refreshed');
  }catch(err){ console.warn('Refresh failed:', err?.message||err); alert('Could not refresh bookings right now.'); }
  finally{ btn.disabled=false; btn.textContent='Refresh'; }
});

// Remove saved card (user-controlled)
document.addEventListener('click', async (e)=>{
  const btn = e.target.closest('#removeSavedCard');
  if(!btn) return;
  const email = getSessionEmail();
  if(!email){ alert('Please log in first.'); return; }
  if(!confirm('Remove saved card from your account?')) return;
  try{
    btn.disabled = true; const prev = btn.textContent; btn.textContent = 'Removing…';
    const resp = await fetch('/.netlify/functions/remove-saved-card', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email }) });
    if(!resp.ok){ const txt=await resp.text().catch(()=>resp.statusText); throw new Error(txt); }
    showToast('Saved card removed');
  }catch(err){ alert('Failed to remove card: '+(err.message||err)); }
  finally{ btn.disabled=false; btn.textContent='Remove Saved Card'; }
});

// Handle Stripe Checkout success redirect (hash params: #payments?paid=1&bookingId=...)
function handleStripeSuccess(){
  if(!location.hash.startsWith('#payments')) return;
  const parts = location.hash.split('?');
  if(parts.length < 2) return;
  const params = new URLSearchParams(parts[1]);
  if(params.get('paid') !== '1') return;
  const bookingId = params.get('bookingId');
  if(!bookingId) return;
  const baseId = bookingId.replace('_extend1w','');
  const email = getSessionEmail(); if(!email) return;
  loadBookingsForEmail(email);
  const bk = MY_BOOKINGS.find(b=>b.id===baseId || b.fireId===baseId);
  if(!bk) { console.warn('Stripe success booking not found', baseId); return; }
  if(bk.status !== 'rented'){
    bk.status='rented'; bk.rentedAt=Date.now(); saveBookingsForEmail(email);
    try{ const db=getDB(); const { doc, updateDoc } = getUtils(); if(db && bk.fireId){ updateDoc(doc(db,'bookings',bk.fireId), { status:'rented', rentedAt: bk.rentedAt }); } }catch(err){ console.warn('Firestore stripe success update failed', err.message); }
    renderAccountBookings(); showToast('Payment confirmed. Booking rented.');
  }
}
setTimeout(handleStripeSuccess, 500);

// Signup validation
document.addEventListener('input', (e)=>{
  if(e.target.id==='verifyEmail'){
    const email=document.getElementById('email').value;
    const verify=e.target.value;
    const msg=document.getElementById('emailMatch');
    if(verify && email!==verify){ msg.textContent='Emails do not match'; msg.style.color='#c1121f'; }
    else if(verify && email===verify){ msg.textContent='✓ Emails match'; msg.style.color='#2d6a4f'; }
    else{ msg.textContent=''; }
  }
  if(e.target.id==='verifyPassword'){
    const password=document.getElementById('password').value;
    const verify=e.target.value;
    const msg=document.getElementById('passwordMatch');
    if(verify && password!==verify){ msg.textContent='Passwords do not match'; msg.style.color='#c1121f'; }
    else if(verify && password===verify){ msg.textContent='✓ Passwords match'; msg.style.color='#2d6a4f'; }
    else{ msg.textContent=''; }
  }
});

let LICENSE_PHOTO_DATA = '';
let LICENSE_PHOTO_FILE = null;
document.addEventListener('change', (e)=>{
  if(e.target.id==='licensePhoto'){
    const file=e.target.files[0];
    const preview=document.getElementById('photoPreview');
    if(file && file.type.startsWith('image/')){
      LICENSE_PHOTO_FILE = file;
      const reader=new FileReader();
      reader.onload=(ev)=>{
        preview.innerHTML=`<img src="${ev.target.result}" alt="License photo preview" style="width:100%;border-radius:8px;border:1px solid rgba(255,255,255,.12)">`;
        LICENSE_PHOTO_DATA = ev.target.result;
      };
      reader.readAsDataURL(file);
    }
  }
});

document.getElementById('signup-form')?.addEventListener('submit', (e)=>{
  e.preventDefault();
  const email=document.getElementById('email').value;
  const verifyEmail=document.getElementById('verifyEmail').value;
  const password=document.getElementById('password').value;
  const verifyPassword=document.getElementById('verifyPassword').value;
  const first=document.getElementById('firstName')?.value||'';
  const last=document.getElementById('lastName')?.value||'';
  const address=document.getElementById('address')?.value||'';
  const state=document.getElementById('state')?.value||'';
  const country=document.getElementById('country')?.value||'';
  const licenseNumber=document.getElementById('licenseNumber')?.value||'';
  const licenseCountry=document.getElementById('licenseCountry')?.value||'';
  const licenseIssueDate=document.getElementById('licenseIssueDate')?.value||'';
  const licenseExpireDate=document.getElementById('licenseExpireDate')?.value||'';
  const dob=document.getElementById('dob')?.value||'';
  
  if(email!==verifyEmail){ alert('Email addresses do not match'); return; }
  if(password!==verifyPassword){ alert('Passwords do not match'); return; }
  
  const issueDateVal = document.getElementById('licenseIssueDate').value;
  const expireDateVal = document.getElementById('licenseExpireDate').value;
  const issueDate = new Date(issueDateVal);
  const expireDate = new Date(expireDateVal);
  const issueDay = new Date(issueDate.getFullYear(), issueDate.getMonth(), issueDate.getDate());
  const expireDay = new Date(expireDate.getFullYear(), expireDate.getMonth(), expireDate.getDate());
  const todayDay = new Date(); todayDay.setHours(0,0,0,0);
  if(expireDay <= issueDay){ alert('License expire date must be after issue date'); return; }
  if(expireDay < todayDay){ alert('License has expired'); return; }
  if(!dob){ alert('Please enter your date of birth.'); return; }
  // Age check: must be at least 25
  try{
    const dobDate = new Date(dob);
    if(!(dobDate instanceof Date) || isNaN(dobDate.getTime())){ alert('Invalid date of birth.'); return; }
    const now = new Date();
    const cutoff = new Date(now.getFullYear()-25, now.getMonth(), now.getDate());
    if(dobDate > cutoff){ alert('You must be at least 25 years old to become a member.'); return; }
  }catch{ alert('Invalid date of birth.'); return; }
  // Create Auth account then proceed
  const api=getAuthApi(); const auth=getAuthInstance();
  if(api.createUserWithEmailAndPassword && auth){
    api.createUserWithEmailAndPassword(auth,email,password).then((userCredential)=>{
      // Immediately redirect user to login before any slow operations
      try{ e.target.reset(); }catch{}
      const prev = document.getElementById('photoPreview'); if(prev) prev.innerHTML='';
      LICENSE_PHOTO_DATA = '';
      LICENSE_PHOTO_FILE = null;
      showToast('Account created. Please sign in.');
      goto('login');

      // Run profile save + optional photo upload in the background (non-blocking)
      (async ()=>{
        const uid = userCredential.user.uid;
        console.log('User created with UID:', uid);
        const db=getDB(); const { doc, setDoc } = getUtils();
        const storage = getStorage(); const { storageRef, uploadBytes, getDownloadURL } = getStorageUtils();
        const createdTs = Date.now();
        const basePayload={
          email, first, last, address, state, country,
          licenseNumber, licenseCountry, licenseIssueDate, licenseExpireDate,
          dob,
          createdTs, status:'active'
        };
        let photoUrl='';
        if(storage && LICENSE_PHOTO_FILE){
          try{
            const safeEmail = (email||'unknown').replace(/[^a-zA-Z0-9._-]/g,'_');
            const path = `license_photos/${safeEmail}_${createdTs}.jpg`;
            const ref = storageRef(storage, path);
            await uploadBytes(ref, LICENSE_PHOTO_FILE);
            photoUrl = await getDownloadURL(ref);
            console.log('License photo uploaded:', photoUrl);
          }catch(upErr){ console.warn('Photo upload failed:', upErr?.message||upErr); }
        }
        try{
          if(db && uid && setDoc && doc){
            await setDoc(doc(db,'users', uid), { ...basePayload, licensePhotoUrl: photoUrl });
            console.log('User profile saved (background)');
          }
        }catch(saveErr){ console.error('Background profile save failed:', saveErr?.message||saveErr); }
      })();
    }).catch(err=>{ alert(cleanErrorMessage(err)); return; });
  } else {
    // Fallback: create local-only indicator, then send to login
    try{ e.target.reset(); }catch{}
    const prev = document.getElementById('photoPreview'); if(prev) prev.innerHTML='';
    LICENSE_PHOTO_DATA = '';
    LICENSE_PHOTO_FILE = null;
    showToast('Account created. Please sign in.');
    goto('login');
  }
});

// ===== Admin vehicle management =====
let _editingId = null;
let ABOUT_CONTENT = { title: 'About Clydero Cash Car Rental', content: 'Clydero Cash Car Rental (CCR) is a privately owned vehicle rental and rent-to-own service. All vehicles are personally owned and managed by CCR. Membership is required for full access to booking and payment features. CCR focuses on reliability, transparency, and convenience for every customer.' };

// Inbox messages state
let INBOX = [];
let INBOX_PAGE = 1;
const INBOX_PAGE_SIZE = 8;
// Members state
let MEMBERS = [];

// Firestore persistence
async function loadFromFirestore(){
  const db = getDB();
  const { doc, getDoc, collection, getDocs } = getUtils();
  if(!db) return;
  const emailNow = getSessionEmail();
  const isOwner = emailNow === OWNER_EMAIL;
  
  try {
    // Load About content
    const aboutDoc = await getDoc(doc(db, 'site_content', 'about'));
    if(aboutDoc.exists()){
      ABOUT_CONTENT = aboutDoc.data();
    }
    
    // Load vehicles
    const vehiclesSnap = await getDocs(collection(db, 'vehicles'));
    if(!vehiclesSnap.empty){
      VEHICLES.length = 0; // Clear default vehicles
      vehiclesSnap.forEach(docSnap => {
        VEHICLES.push({ id: docSnap.id, ...docSnap.data() });
      });
    }

    // Load inbox messages (owner only)
    if(isOwner){
      try{
        const inboxSnap = await getDocs(collection(db, 'messages'));
        INBOX.length = 0;
        inboxSnap.forEach(docSnap => { INBOX.push({ id: docSnap.id, ...docSnap.data() }); });
        // Sort newest first by timestamp
        INBOX.sort((a,b)=> (b.ts||0) - (a.ts||0));
      }catch(e){ console.warn('Inbox load skipped/non-owner or failed:', e?.message||e); }
    }

    // Load members (owner only)
    if(isOwner){
      try{
        const membersSnap = await getDocs(collection(db, 'users'));
        MEMBERS.length = 0;
        membersSnap.forEach(docSnap => { MEMBERS.push({ id: docSnap.id, ...docSnap.data() }); });
      }catch(e){ console.warn('Members load skipped/non-owner or failed:', e?.message||e); }
    }
  } catch(err){
    console.warn('Firestore load failed:', err.message);
  }
}

// ===== Realtime Subscriptions =====
let _vehUnsub=null, _aboutUnsub=null, _adminBookingsUnsub=null, _inboxUnsub=null, _membersUnsub=null, _currentUserUnsub=null;
let _isUpdatingVehicles = false;

// Detect local/offline mode (e.g., 127.0.0.1, localhost, or file://)
function isOfflineMode(){
  try{
    const host = (location && location.hostname) || '';
    const proto = (location && location.protocol) || '';
    return proto === 'file:' || host === '127.0.0.1' || host === 'localhost';
  }catch{ return false; }
}

function setupRealtimeForRole(){
  const db=getDB(); const utils=getUtils(); if(!db || !utils.onSnapshot) return;
  // In offline/local preview, skip Firestore listeners and show defaults
  if(isOfflineMode()){
    try{ VEHICLES.length=0; DEFAULT_VEHICLES.forEach(v=> VEHICLES.push({ ...v })); renderVehicles(); seedBooking(); }catch{}
    return;
  }
  // Public (vehicles + about) always
  if(!_aboutUnsub){ try{ _aboutUnsub = utils.onSnapshot(utils.doc(db,'site_content','about'), snap=>{ if(snap.exists()){ ABOUT_CONTENT = snap.data(); renderAbout(); } }); }catch(e){ console.warn('About realtime failed', e.message); } }
  if(!_vehUnsub){ try{ _vehUnsub = utils.onSnapshot(utils.collection(db,'vehicles'), snap=>{ 
    if(_isUpdatingVehicles) return; _isUpdatingVehicles = true;
    try{
      const fireList = []; snap.forEach(d=> fireList.push({ id:d.id, ...d.data() }));
      let merged = mergeVehiclesWithDefaults(fireList);
      if(!Array.isArray(merged) || merged.length===0){ merged = DEFAULT_VEHICLES.map(v=>({ ...v })); }
      VEHICLES.length=0; merged.forEach(v=> VEHICLES.push(v));
      renderVehicles(); seedBooking();
      if(getSessionEmail()===OWNER_EMAIL){ renderAdminVehicles(); }
    }catch(err){
      console.warn('Vehicles snapshot merge failed:', err?.message||err);
      VEHICLES.length=0; DEFAULT_VEHICLES.forEach(v=> VEHICLES.push({ ...v }));
      renderVehicles(); seedBooking();
    } finally { _isUpdatingVehicles = false; }
  }); }catch(e){ console.warn('Vehicles realtime failed', e.message); } }

  // Current user membership doc realtime (improves account panel updates)
  const api=getAuthApi(); const auth=getAuthInstance(); const uid = auth && auth.currentUser && auth.currentUser.uid;
  if(uid && !_currentUserUnsub){ try{ _currentUserUnsub = utils.onSnapshot(utils.doc(db,'users',uid), snap=>{
        // Owner bypass: do not auto sign-out owner
        if(getSessionEmail() === OWNER_EMAIL){
          const data = snap.exists() ? snap.data() : {};
          let m = MEMBERS.find(x=>x.id===uid); if(!m){ MEMBERS.push({ id:uid, ...data }); } else { Object.assign(m, data); }
          updateMembershipPanel();
          return;
        }
        if(!snap.exists()){
          console.warn('User profile missing; signing out.');
          try{ clearSession(); }catch{}
          try{ showToast('Your account was removed.'); }catch{}
          try{ goto('login'); }catch{}
          return;
        }
        const data=snap.data();
        if(data && data.status === 'banned'){
          console.warn('User is banned; signing out.');
          try{ clearSession(); }catch{}
          try{ alert('Your account has been disabled. Contact support.'); }catch{}
          try{ goto('login'); }catch{}
          return;
        }
        // merge/update MEMBERS entry
        let m = MEMBERS.find(x=>x.id===uid); if(!m){ MEMBERS.push({ id:uid, ...data }); } else { Object.assign(m, data); }
        updateMembershipPanel();
        updateAdminVisibility(); // Update admin panel visibility when user data changes
      }); }catch(e){ console.warn('Current user realtime failed', e.message); } }

  const isOwner = getSessionEmail()===OWNER_EMAIL;
  const isAdmin = isCurrentUserAdmin();
  const canAccessAdmin = isOwner || isAdmin;
  if(canAccessAdmin){
    // Admin bookings realtime
    if(!_adminBookingsUnsub){ try{ _adminBookingsUnsub = utils.onSnapshot(utils.collection(db,'bookings'), snap=>{ ADMIN_BOOKINGS.length=0; snap.forEach(d=> ADMIN_BOOKINGS.push({ id:d.id, ...d.data() })); ADMIN_BOOKINGS.sort((a,b)=> (b.createdAt||0)-(a.createdAt||0)); renderAdminBookings(); }); }catch(e){ console.warn('Admin bookings realtime failed', e.message); } }
    // Inbox realtime
    if(!_inboxUnsub){ try{ _inboxUnsub = utils.onSnapshot(utils.collection(db,'messages'), snap=>{ INBOX.length=0; snap.forEach(d=> INBOX.push({ id:d.id, ...d.data() })); INBOX.sort((a,b)=> (b.ts||0)-(a.ts||0)); updateAdminBadge(); const adminVisible = document.getElementById('admin')?.style.display !== 'none'; if(adminVisible){ renderInbox(); } }); }catch(e){ console.warn('Inbox realtime failed', e.message); } }
    // Members realtime
    if(!_membersUnsub){ try{ _membersUnsub = utils.onSnapshot(utils.collection(db,'users'), snap=>{ MEMBERS.length=0; snap.forEach(d=> MEMBERS.push({ id:d.id, ...d.data() })); const adminVisible = document.getElementById('admin')?.style.display !== 'none'; if(adminVisible){ renderMembers(); } updateMembershipPanel(); }); }catch(e){ console.warn('Members realtime failed', e.message); } }
  }
}

// Optional cleanup (not used yet but available)
function teardownRealtime(){ [_vehUnsub,_aboutUnsub,_adminBookingsUnsub,_inboxUnsub,_membersUnsub,_currentUserUnsub].forEach(fn=>{ try{ fn&&fn(); }catch{} }); _vehUnsub=_aboutUnsub=_adminBookingsUnsub=_inboxUnsub=_membersUnsub=_currentUserUnsub=null; }

async function saveAboutToFirestore(){
  const db = getDB();
  const { doc, setDoc } = getUtils();
  if(!db) return;
  
  try {
    await setDoc(doc(db, 'site_content', 'about'), ABOUT_CONTENT);
    console.log('About content saved to Firestore');
  } catch(err){
    console.error('Failed to save About:', err.message);
    alert('Failed to save About content. Check console.');
  }
}

async function saveVehicleToFirestore(vehicle){
  const db = getDB();
  const { doc, setDoc, getDoc } = getUtils();
  if(!db || !vehicle) return;

  const auth = getAuthInstance();
  const email = auth?.currentUser?.email;
  console.log('[saveVehicle] Auth user:', email);
  console.log('[saveVehicle] Saving vehicle ID:', vehicle.id, 'imgs length:', (vehicle.imgs||[]).length);

  try {
    await setDoc(doc(db, 'vehicles', vehicle.id), {
      name: vehicle.name,
      type: vehicle.type,
      seats: vehicle.seats,
      price: vehicle.price,
      imgs: vehicle.imgs || [],
      available: vehicle.available !== false,
      pending: vehicle.pending === true,
      details: vehicle.details || ''
    });
    console.log('[saveVehicle] SetDoc success for', vehicle.id);
    // Verification read-back
    try {
      const savedSnap = await getDoc(doc(db,'vehicles', vehicle.id));
      if(savedSnap.exists()){
        const imgsLen = (savedSnap.data().imgs||[]).length;
        console.log('[saveVehicle] Verification imgs length:', imgsLen, savedSnap.data().imgs);
        if(typeof showToast==='function'){
          showToast('Saved vehicle. Images: '+imgsLen);
        }
        if(imgsLen !== (vehicle.imgs||[]).length){
          console.warn('[saveVehicle] MISMATCH: local imgs length', (vehicle.imgs||[]).length, 'Firestore imgs length', imgsLen);
        }
      } else {
        console.warn('[saveVehicle] Verification snapshot missing for', vehicle.id);
      }
    } catch(vErr){ console.warn('[saveVehicle] Verification read failed:', vErr.message||vErr); }
  } catch(err){
    console.error('[saveVehicle] Failed:', err);
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    if(typeof showToast==='function'){ try{ showToast('Save failed: '+(err.message||err)); }catch{} }
    alert('Failed to save vehicle. Error: ' + err.message + '\nCheck console for details.');
  }
}

async function deleteVehicleFromFirestore(vehicleId){
  const db = getDB();
  const { doc, deleteDoc } = getUtils();
  if(!db || !vehicleId) return;
  
  try {
    await deleteDoc(doc(db, 'vehicles', vehicleId));
    console.log('Vehicle deleted:', vehicleId);
  } catch(err){
    console.error('Failed to delete vehicle:', err.message);
  }
}

// ===== Inbox Firestore helpers =====
async function saveContactMessage(msgObj){
  const db = getDB();
  const { addDoc, collection } = getUtils();
  if(!db) return;
  try {
    const payload = { first: msgObj.first, last: msgObj.last, email: msgObj.email, msg: msgObj.msg, ts: Date.now(), read: false };
    const ref = await addDoc(collection(db,'messages'), payload);
    console.log('Message saved', ref.id);
  } catch(err){ console.error('Failed to save message:', err.message); }
}

async function updateMessageRead(id, read){
  const db = getDB();
  const { doc, updateDoc } = getUtils();
  if(!db) return;
  try { await updateDoc(doc(db,'messages',id), { read }); } catch(err){ console.error('Failed to update message:', err.message); }
}

async function deleteMessage(id){
  const db = getDB();
  const { doc, deleteDoc } = getUtils();
  if(!db) return;
  try { await deleteDoc(doc(db,'messages',id)); console.log('Message deleted', id); } catch(err){ console.error('Failed to delete message:', err.message); }
}

async function loadInboxMessages(){
  const db = getDB();
  const { collection, getDocs } = getUtils();
  if(!db) return [];
  try {
    const snap = await getDocs(collection(db,'messages'));
    INBOX.length = 0;
    snap.forEach(d=> INBOX.push({ id:d.id, ...d.data() }));
    INBOX.sort((a,b)=> (b.ts||0) - (a.ts||0));
    return INBOX;
  } catch(err){ console.error('Failed to load inbox:', err.message); return INBOX; }
}

function renderInbox(){
  const wrap = document.getElementById('adminInbox');
  if(!wrap) return;
  wrap.innerHTML='';
  if(!INBOX.length){ wrap.innerHTML = '<div class="muted">No messages yet.</div>'; updateAdminBadge(); return; }
  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(INBOX.length/INBOX_PAGE_SIZE));
  INBOX_PAGE = Math.min(Math.max(1, INBOX_PAGE), totalPages);
  const start = (INBOX_PAGE-1)*INBOX_PAGE_SIZE;
  const pageItems = INBOX.slice(start, start+INBOX_PAGE_SIZE);
  pageItems.forEach(m=>{
    const card = document.createElement('article');
    card.className='card';
    const date = m.ts ? new Date(m.ts).toLocaleString() : '';
    const readFlag = m.read ? 'Read' : 'Unread';
    card.innerHTML = `<div class='body'>
      <div style='display:flex;gap:8px;align-items:center'>
        <div style='font-weight:700'>${m.first} ${m.last}</div>
        <span class='muted' style='margin-left:auto;font-size:12px'>${date}</span>
      </div>
      <div style='font-size:12px;color:var(--muted);margin-top:4px'>${m.email}</div>
      <p style='margin:8px 0 12px 0;white-space:pre-wrap'>${m.msg}</p>
      <div style='display:flex;gap:8px;flex-wrap:wrap'>
        <button class='navbtn' data-msg-read='${m.id}'>${m.read? 'Mark Unread':'Mark Read'}</button>
        <button class='navbtn' data-msg-reply='${m.id}'>Reply</button>
        <button class='navbtn' data-msg-delete='${m.id}' style='background:#c1121f;border-color:#c1121f'>Delete</button>
        <span class='muted' style='margin-left:auto;font-size:12px'>${readFlag}</span>
      </div>
    </div>`;
    wrap.appendChild(card);
  });
  // Pager controls
  const pager = document.createElement('div');
  pager.style = 'display:flex;gap:8px;align-items:center;margin-top:8px';
  pager.innerHTML = `<button class='navbtn' id='inboxPrev' ${INBOX_PAGE<=1?'disabled':''}>Prev</button>
                     <span class='muted'>Page ${INBOX_PAGE} of ${totalPages}</span>
                     <button class='navbtn' id='inboxNext' ${INBOX_PAGE>=totalPages?'disabled':''}>Next</button>`;
  wrap.appendChild(pager);
  updateAdminBadge();
}

// ===== Members rendering & actions =====
function renderMembers(){
  const wrap = document.getElementById('adminMembers');
  if(!wrap) return;
  wrap.innerHTML='';
  if(!MEMBERS.length){ wrap.innerHTML = '<div class="muted">No members yet.</div>'; return; }
  MEMBERS.forEach(u=>{
    const card = document.createElement('article');
    card.className='card';
    const status = u.status || 'active';
    const banned = status==='banned';
    const isAdmin = u.isAdmin === true;
    const name = `${u.first||''} ${u.last||''}`.trim() || '(no name)';
    const since = u.createdTs ? new Date(u.createdTs).toLocaleDateString() : '';
    const waiver = u.cardRemovalOverride ? `<span class='badge' style='background:#2d6a4f22;border-color:#2d6a4f66;color:#2d6a4f;margin-left:6px'>Waiver Active</span>` : '';
    const adminBadge = isAdmin ? `<span class='badge' style='background:var(--gold);color:#000;margin-left:6px;font-weight:700'>ADMIN</span>` : '';
    card.innerHTML = `<div class='body'>
      <div style='display:flex;gap:8px;align-items:center'>
        <div style='font-weight:700'>${name}</div>
        <span class='muted' style='margin-left:auto;font-size:12px'>${u.email||''}</span>
      </div>
      <div class='muted' style='font-size:12px;margin-top:4px'>Member since ${since} • ${status} ${waiver} ${adminBadge}</div>
      <div style='display:flex;gap:8px;margin-top:8px;flex-wrap:wrap'>
        <button class='navbtn' data-member-view='${u.id}'>View</button>
        <button class='navbtn' data-member-ban='${u.id}'>${banned?'Unban':'Ban'}</button>
        <button class='navbtn' data-member-delete='${u.id}' style='background:#c1121f;border-color:#c1121f'>Delete</button>
        <button class='navbtn' data-member-waiver='${u.id}' style='${u.cardRemovalOverride? 'background:#ffc107;border-color:#ffc107;color:#000':'background:#2d6a4f;border-color:#2d6a4f'}'>${u.cardRemovalOverride? 'Revoke Waiver':'Grant Waiver'}</button>
        <button class='navbtn' data-member-admin='${u.id}' style='${isAdmin? 'background:#666;border-color:#666':'background:var(--gold);border-color:var(--gold);color:#000'}'>${isAdmin? 'Remove Admin':'Make Admin'}</button>
      </div>
    </div>`;
    wrap.appendChild(card);
  });
}

async function updateMemberStatus(userId, status){
  const db = getDB();
  const { doc, updateDoc } = getUtils();
  if(!db) return;
  try{ await updateDoc(doc(db,'users',userId), { status }); }catch(err){ console.error('Failed to update member status:', err.message); }
}

async function deleteMember(userId){
  // Try to use Cloud Function for full deletion (Firestore + Auth)
  const functions = window.firestoreFunctions;
  const { httpsCallable } = window.functionsUtils || {};
  
  if(functions && httpsCallable){
    try{
      const deleteUserFn = httpsCallable(functions, 'deleteUser');
      const result = await deleteUserFn({ userId });
      console.log('Cloud Function result:', result.data);
      return true;
    }catch(err){
      console.error('Cloud Function failed:', err?.message||err);
      // Fallback: just delete Firestore doc
      const db = getDB();
      const { doc, deleteDoc } = getUtils();
      if(!db) { console.error('No DB instance to delete member'); return false; }
      try{ 
        await deleteDoc(doc(db,'users',userId)); 
        console.warn('Deleted Firestore doc only (Auth user still exists)');
        try{ showToast('Deleted profile only. Sign in as owner to fully remove.'); }catch{}
        return true;
      }catch(err2){ 
        console.error('Failed to delete member:', err2?.message||err2); 
        return false;
      }
    }
  } else {
    // No Cloud Functions available, just delete Firestore doc
    const db = getDB();
    const { doc, deleteDoc } = getUtils();
    if(!db) { console.error('No DB instance to delete member'); return false; }
    try{ 
      await deleteDoc(doc(db,'users',userId)); 
      console.warn('Deleted Firestore doc only (Cloud Functions not available; Auth user still exists)');
      try{ showToast('Deleted profile only. Sign in as owner to fully remove.'); }catch{}
      return true;
    }catch(err){ 
      console.error('Failed to delete member:', err?.message||err); 
      return false;
    }
  }
}

async function toggleAdminStatus(userId, isAdmin){
  const db = getDB();
  const { doc, updateDoc } = getUtils();
  if(!db) return false;
  try{ 
    await updateDoc(doc(db,'users',userId), { isAdmin });
    console.log(`Admin status for ${userId} set to ${isAdmin}`);
    return true;
  }catch(err){ 
    console.error('Failed to update admin status:', err.message); 
    return false;
  }
}

function updateAdminBadge(){
  const badge = document.getElementById('adminBadge');
  if(!badge) return;
  const unread = INBOX.filter(m=>!m.read).length;
  if(unread>0){ badge.textContent = String(unread); badge.style.display='inline-block'; }
  else { badge.style.display='none'; }
}

function renderAbout(){ const title=document.querySelector('#about h2'); const para=document.querySelector('#about p'); if(title) title.textContent = ABOUT_CONTENT.title; if(para) para.textContent = ABOUT_CONTENT.content; }

function renderAdminVehicles(){
  const grid=document.getElementById('admin-vehicles'); if(!grid) return; grid.innerHTML='';
  VEHICLES.forEach(v=>{
    const a=document.createElement('article'); a.className='card';
    const avail = v.available!==false;
    const statusBadge = avail ? '' : `<span class='badge unavailable' style='margin-left:8px'>Unavailable</span>`;
    const firstImg=(v.imgs&&v.imgs[0])||'';
    a.innerHTML = `<img alt="Photo of ${v.name}" loading="lazy" src="${firstImg}" style="width:100%;height:auto">\n<div class='body'>
      <div style='display:flex;gap:8px;align-items:center'>
        <span class='veh-dot ${avail?'available':'unavailable'}' title='${avail?'Available':'Unavailable'}'></span>
        <div style='font-weight:800'>${v.name}</div>
        <span style='margin-left:auto;color:#32CD32;font-weight:700'>$${v.price}/week</span>${statusBadge}
      </div>
      <div class='muted' style='margin:6px 0'>${v.type} • Seats ${v.seats}</div>
      <div style='display:flex;gap:8px;flex-wrap:wrap'>
        <button class='navbtn' data-ed='${v.id}' aria-label='Edit ${v.name}'>Edit</button>
        <button class='navbtn' data-av='${v.id}' aria-label='Toggle availability for ${v.name}'>${avail?'Mark Unavailable':'Mark Available'}</button>
      </div>
    </div>`;
    grid.appendChild(a);
  });
}

function openEditor(id){ const v = VEHICLES.find(x=>x.id===id); if(!v) return; _editingId = id; document.getElementById('vehEditorModal').style.display='block'; document.getElementById('edName').value = v.name||''; document.getElementById('edType').value = v.type||''; document.getElementById('edSeats').value = v.seats||''; document.getElementById('edPrice').value = v.price||''; document.getElementById('edDetails').value = v.details||''; document.getElementById('edAvailable').value = (v.available!==false).toString(); const list=document.getElementById('edImgList'); list.innerHTML=''; (v.imgs||[]).forEach((src,i)=>{ const wrap=document.createElement('div'); wrap.style.position='relative'; wrap.innerHTML = `<img src='${src}' alt='img' style='width:120px;height:auto;border-radius:8px;border:1px solid rgba(255,255,255,.12)'><button class='navbtn' data-delimg='${i}' style='position:absolute;top:4px;right:4px'>×</button>`; list.appendChild(wrap); }); }

function closeEditor(){ _editingId=null; document.getElementById('vehEditorModal').style.display='none'; }

document.addEventListener('click',(e)=>{
  const ed=e.target.closest('[data-ed]'); if(ed){ openEditor(ed.dataset.ed); return; }
  const av=e.target.closest('[data-av]'); if(av){ const v=VEHICLES.find(x=>x.id===av.dataset.av); if(v){ v.available = !(v.available!==false); renderAdminVehicles(); renderVehicles(); seedBooking(); saveVehicleToFirestore(v); } return; }
  const del=e.target.closest('[data-delimg]'); if(del && _editingId!==null){ const v=VEHICLES.find(x=>x.id===_editingId); const idx=parseInt(del.dataset.delimg,10); if(v && Array.isArray(v.imgs)){ v.imgs.splice(idx,1); openEditor(_editingId); } return; }
  if(e.target.id==='edAddImgUrl'){ const input=document.getElementById('edImgUrl'); const url=input.value.trim(); if(url && _editingId!==null){ const v=VEHICLES.find(x=>x.id===_editingId); v.imgs = v.imgs||[]; v.imgs.push(url); input.value=''; openEditor(_editingId); } return; }
  if(e.target.id==='edCancel'){ closeEditor(); return; }
  if(e.target.id==='edDelete' && _editingId!==null){ if(!confirm('Delete this vehicle permanently?')) return; const idx=VEHICLES.findIndex(x=>x.id===_editingId); if(idx>=0){ const deletedId = VEHICLES[idx].id; VEHICLES.splice(idx,1); deleteVehicleFromFirestore(deletedId); } closeEditor(); renderAdminVehicles(); renderVehicles(); seedBooking(); return; }
  if(e.target.id==='edSave' && _editingId!==null){ const v=VEHICLES.find(x=>x.id===_editingId); if(!v) return; v.name=document.getElementById('edName').value.trim(); v.type=document.getElementById('edType').value.trim(); v.seats=parseInt(document.getElementById('edSeats').value,10)||v.seats; v.price=parseInt(document.getElementById('edPrice').value,10)||v.price; v.details=document.getElementById('edDetails').value.trim(); v.available = document.getElementById('edAvailable').value==='true'; closeEditor(); renderAdminVehicles(); renderVehicles(); saveVehicleToFirestore(v); return; }

  // Vehicle gallery actions
  const gbtn = e.target.closest('[data-gallery]');
  if(gbtn){ openVehicleGallery(gbtn.dataset.gallery); return; }
  if(e.target?.id==='vgClose'){ closeVehicleGallery(); return; }
  if(e.target?.id==='vgPrev'){ stepVehicleGallery(-1); return; }
  if(e.target?.id==='vgNext'){ stepVehicleGallery(1); return; }

  // Inbox actions
  const readBtn = e.target.closest('[data-msg-read]');
  if(readBtn){ const id=readBtn.dataset.msgRead; const msg=INBOX.find(m=>m.id===id); if(msg){ msg.read = !msg.read; updateMessageRead(id, msg.read); renderInbox(); } return; }
  const delMsg = e.target.closest('[data-msg-delete]');
  if(delMsg){ const id=delMsg.dataset.msgDelete; if(confirm('Delete this message?')){ deleteMessage(id).then(()=>{ INBOX = INBOX.filter(m=>m.id!==id); renderInbox(); }); } return; }
  if(e.target.id==='inboxRefresh'){ loadInboxMessages().then(renderInbox); return; }
  if(e.target.id==='inboxMarkAllRead'){ INBOX.forEach(m=>{ if(!m.read){ m.read=true; updateMessageRead(m.id,true); } }); renderInbox(); return; }
  if(e.target.id==='inboxPrev'){ INBOX_PAGE = Math.max(1, INBOX_PAGE-1); renderInbox(); return; }
  if(e.target.id==='inboxNext'){ INBOX_PAGE = INBOX_PAGE+1; renderInbox(); return; }
  // Reply modal open
  const replyBtn = e.target.closest('[data-msg-reply]');
  if(replyBtn){ openReply(replyBtn.dataset.msgReply); return; }
  // Member actions
  const mv = e.target.closest('[data-member-view]');
  if(mv){ const u=MEMBERS.find(x=>x.id===mv.dataset.memberView); if(u){ 
    const d = document.getElementById('memberDetails'); 
    const lines = [
      `Name: ${u.first||''} ${u.last||''}`,
      `Email: ${u.email||''}`,
      `Address: ${u.address||''}`,
      `State: ${u.state||''}`,
      `Country: ${u.country||''}`,
      `License #: ${u.licenseNumber||''}`,
      `License Country: ${u.licenseCountry||''}`,
      `License Issue: ${u.licenseIssueDate||''}`,
      `License Expire: ${u.licenseExpireDate||''}`,
      `Status: ${u.status||'active'}`,
    ]; 
    d.textContent = lines.join('\n'); 
    const img=document.getElementById('memberPhoto'); 
    if(img){ 
      // Check both licensePhotoUrl (Storage) and licensePhotoData (base64 from updates)
      const photoUrl = u.licensePhotoUrl || u.licensePhotoData || '';
      console.log('Member photo - URL:', u.licensePhotoUrl || 'NONE', 'Data:', u.licensePhotoData ? 'EXISTS' : 'NONE');
      if(photoUrl){ 
        img.src = photoUrl; 
        img.style.display='block';
        img.onerror = ()=>{ console.error('Failed to load photo:', photoUrl.substring(0,50)+'...'); img.src=''; img.alt='Photo failed to load'; };
      } else { 
        img.src=''; 
        img.style.display='none'; 
        img.alt='No photo uploaded'; 
      }
    } 
    document.getElementById('memberModal').style.display='block'; 
  } return; }
  if(e.target?.id==='memberClose'){ document.getElementById('memberModal').style.display='none'; return; }
  const mb = e.target.closest('[data-member-ban]');
  if(mb){ const id=mb.dataset.memberBan; const u=MEMBERS.find(x=>x.id===id); if(u){ const next = (u.status==='banned')?'active':'banned'; u.status=next; updateMemberStatus(id,next); renderMembers(); } return; }
  const md = e.target.closest('[data-member-delete]');
  if(md){ 
    const id=md.dataset.memberDelete; 
    if(!confirm('Delete this member completely?\n\nThis will remove their profile AND revoke login access (if Cloud Function is deployed).')) return; 
    deleteMember(id).then((ok)=>{ 
      if(ok){ 
        loadMembersAndRender(); 
        showToast('Member deleted successfully.');
      } else {
        alert('Could not delete member. Check console for details.');
      }
    }); 
    return; 
  }
  const ma = e.target.closest('[data-member-admin]');
  if(ma){
    const id = ma.dataset.memberAdmin;
    const u = MEMBERS.find(x => x.id === id);
    if(u){
      const newAdminStatus = !u.isAdmin;
      const action = newAdminStatus ? 'grant admin privileges to' : 'remove admin privileges from';
      if(!confirm(`Are you sure you want to ${action} ${u.first} ${u.last}?`)) return;
      toggleAdminStatus(id, newAdminStatus).then((ok)=>{
        if(ok){
          u.isAdmin = newAdminStatus;
          renderMembers();
          showToast(newAdminStatus ? 'Admin privileges granted.' : 'Admin privileges removed.');
        } else {
          alert('Failed to update admin status. Check console for details.');
        }
      });
    }
    return;
  }
});
// Vehicle gallery logic
let __vgVehId = null; let __vgIndex = 0;
function openVehicleGallery(vehId){ const v=VEHICLES.find(x=>x.id===vehId); if(!v || !v.imgs || !v.imgs.length) return; __vgVehId=vehId; __vgIndex=0; const title=document.getElementById('vgTitle'); if(title) title.textContent=v.name; const modal=document.getElementById('vehicleGalleryModal'); if(modal){ modal.style.display='block'; setTimeout(()=>{ modal.scrollIntoView({ behavior:'smooth', block:'center' }); }, 50); } updateVehicleGallery(); }
function closeVehicleGallery(){ __vgVehId=null; __vgIndex=0; const modal=document.getElementById('vehicleGalleryModal'); if(modal) modal.style.display='none'; }
function stepVehicleGallery(dir){ if(__vgVehId===null) return; const v=VEHICLES.find(x=>x.id===__vgVehId); if(!v || !v.imgs) return; __vgIndex = (__vgIndex + dir + v.imgs.length) % v.imgs.length; updateVehicleGallery(); }
function updateVehicleGallery(){ const v=VEHICLES.find(x=>x.id===__vgVehId); if(!v || !v.imgs) return; const img=document.getElementById('vgImage'); const cap=document.getElementById('vgCaption'); if(img){ img.src = v.imgs[__vgIndex]; } if(cap){ cap.textContent = `Photo ${__vgIndex+1} of ${v.imgs.length}`; }
}

// Simple math captcha generator
function initCaptcha(){
  const a = Math.floor(Math.random()*8)+2; // 2..9
  const b = Math.floor(Math.random()*8)+2;
  window.__captcha_sum__ = a + b;
  const q = document.getElementById('captchaQuestion');
  const ans = document.getElementById('captchaAnswer');
  if(q) q.textContent = `${a} + ${b} = ?`;
  if(ans) ans.value = '';
}
document.addEventListener('click',(e)=>{ if(e.target?.id==='captchaRefresh'){ initCaptcha(); }});

// Initialize captcha on load
document.addEventListener('DOMContentLoaded', initCaptcha);

// Reply modal logic
let __replyMsgId = null;
function openReply(id){
  const m = INBOX.find(x=>x.id===id);
  if(!m) return;
  __replyMsgId = id;
  document.getElementById('replyTo').value = m.email || '';
  const subj = document.getElementById('replySubject');
  if(subj && !subj.value) subj.value = 'Re: Clydero Cash Car Rental';
  const body = document.getElementById('replyBody');
  if(body && !body.value){
    body.value = `Hi ${m.first},\n\nThanks for reaching out to Clydero Cash Car Rental.\n\n> ${m.msg}\n\nBest regards,\nClydero CCR\nclyderoccr@gmail.com`;
  }
  document.getElementById('replyModal').style.display='block';
}
document.addEventListener('click',(e)=>{
  if(e.target?.id==='replyClose'){ document.getElementById('replyModal').style.display='none'; return; }
  if(e.target?.id==='replyCopy'){
    const body = document.getElementById('replyBody').value;
    navigator.clipboard?.writeText(body);
    alert('Reply copied to clipboard.');
    return;
  }
  if(e.target?.id==='replyOpenGmail'){
    const to = encodeURIComponent(document.getElementById('replyTo').value||'');
    const su = encodeURIComponent(document.getElementById('replySubject').value||'');
    const body = encodeURIComponent(document.getElementById('replyBody').value + `\n\nSent from: clyderoccr@gmail.com`);
    const bcc = encodeURIComponent('clyderoccr@gmail.com');
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&bcc=${bcc}&su=${su}&body=${body}&tf=1`;
    window.open(url, '_blank','noopener');
    return;
  }
  if(e.target?.id==='replyMailto'){
    const toRaw = (document.getElementById('replyTo').value||'');
    const suRaw = (document.getElementById('replySubject').value||'');
    const bodyRaw = (document.getElementById('replyBody').value||'') + `\n\nSent from: clyderoccr@gmail.com`;
    const params = new URLSearchParams({ subject: suRaw, body: bodyRaw, bcc: 'clyderoccr@gmail.com' }).toString();
    window.location.href = `mailto:${encodeURIComponent(toRaw)}?${params}`;
    return;
  }
  if(e.target?.id==='replySend'){
    const btn = e.target;
    const to = (document.getElementById('replyTo').value||'').trim();
    const su = (document.getElementById('replySubject').value||'').trim();
    const body = (document.getElementById('replyBody').value||'').trim();
    if(!to || !su || !body){ alert('Please fill To, Subject and Message.'); return; }
    if(!initEmailJS()){ alert('EmailJS not configured. Set publicKey/serviceId/templateId in index.html.'); return; }
    const prev = btn.textContent; btn.disabled = true; btn.textContent = 'Sending...';
    sendReplyViaEmailJS({ toEmail: to, subject: su, body, toName: '' })
      .then(()=>{
        alert('Reply sent.');
        // mark current message read
        if(__replyMsgId){ const m=INBOX.find(x=>x.id===__replyMsgId); if(m){ m.read=true; updateMessageRead(m.id,true); } renderInbox(); }
        document.getElementById('replyModal').style.display='none';
      })
      .catch(err=>{ console.error(err); alert('Failed to send. Check EmailJS config.'); })
      .finally(()=>{ btn.disabled=false; btn.textContent = prev; });
    return;
  }
  if(e.target?.id==='replyTestSend'){
    if(!initEmailJS()){ alert('EmailJS not configured. Set publicKey/serviceId/templateId in index.html.'); return; }
    const to = 'clyderoccr@gmail.com';
    const su = 'Test: Clydero CCR Reply';
    const body = 'This is a test send from the site Reply modal.';
    const btn = e.target; const prev=btn.textContent; btn.disabled=true; btn.textContent='Sending...';
    sendReplyViaEmailJS({ toEmail: to, subject: su, body, toName: 'Clydero CCR' })
      .then(()=> alert('Test email sent to clyderoccr@gmail.com.'))
      .catch(err=>{ console.error(err); alert('Failed to send test. Check EmailJS config.'); })
      .finally(()=>{ btn.disabled=false; btn.textContent=prev; });
    return;
  }
});

document.getElementById('edImgFile')?.addEventListener('change', async (e)=>{ 
  const file = e.target.files[0];
  if(!file || _editingId === null) return;

  const v = VEHICLES.find(x=>x.id===_editingId);
  if(!v) return;

  // Basic preview immediately (object URL)
  try {
    const previewList = document.getElementById('edImgList');
    const tempUrl = URL.createObjectURL(file);
    if(previewList){
      const wrap = document.createElement('div');
      wrap.style.position='relative';
      wrap.innerHTML = `<img src='${tempUrl}' alt='preview' style='width:120px;height:auto;border-radius:8px;border:1px solid rgba(255,255,255,.12)'><span style='position:absolute;bottom:4px;right:6px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;padding:2px 4px;border-radius:4px'>preview</span>`;
      previewList.appendChild(wrap);
    }
  }catch(_){ /* ignore preview errors */ }

  // Attempt client-side resize/compression for large images (>2MB or dimensions > 2000px)
  async function prepareBlob(originalFile){
    return new Promise((resolve)=>{
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 1600;
          let { width, height } = img;
          if(width > MAX_DIM || height > MAX_DIM){
            if(width >= height){ height = Math.round(height * (MAX_DIM/width)); width = MAX_DIM; }
            else { width = Math.round(width * (MAX_DIM/height)); height = MAX_DIM; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img,0,0,width,height);
          canvas.toBlob(blob => { resolve(blob || originalFile); }, 'image/jpeg', 0.85);
        };
        img.onerror = () => resolve(originalFile);
        img.src = ev.target.result;
      };
      reader.onerror = () => resolve(originalFile);
      reader.readAsDataURL(originalFile);
    });
  }

  const storage = getStorage();
  const utilsStore = getStorageUtils() || {};
  const { storageRef, uploadBytes, getDownloadURL } = utilsStore;

  if(!storage || !storageRef || !uploadBytes || !getDownloadURL){
    console.warn('[ImageUpload] Storage utilities missing; falling back to base64.');
    const r = new FileReader();
    r.onload = async (ev) => {
      v.imgs = v.imgs || [];
      const base64Data = ev.target.result;
      v.imgs.push(base64Data);
      console.log('[ImageUpload] Base64 added, imgs length:', v.imgs.length);
      try { 
        await saveVehicleToFirestore(v); 
        console.log('[ImageUpload] Base64 persisted to Firestore');
      } catch(e3){ console.error('[ImageUpload] Base64 persist failed:', e3); }
      try { await reloadVehicles(); } catch(e4){ console.warn('[ImageUpload] Reload after base64 failed:', e4); }
      openEditor(_editingId);
      alert('Image added (base64 fallback - Storage unavailable).');
    };
    r.readAsDataURL(file);
    return;
  }

  let blobToUpload = file;
  if(file.size > 2*1024*1024){
    try { blobToUpload = await prepareBlob(file); }catch(e2){ console.warn('Compression failed, using original', e2); }
  }

  const timestamp = Date.now();
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
  const path = `vehicle_images/${_editingId}_${timestamp}_${safeFileName}`;
  const ref = storageRef(storage, path);

  // Non-blocking status indicator
  let uploadingToastShown = false;
  try { showToast('Uploading image...'); uploadingToastShown = true; }catch{}

  try {
    console.log('[ImageUpload] Uploading to Storage:', path);
    await uploadBytes(ref, blobToUpload);
    const url = await getDownloadURL(ref);
    console.log('[ImageUpload] Storage URL received:', url);
    v.imgs = v.imgs || [];
    v.imgs.push(url);
    console.log('[ImageUpload] Local imgs updated, length:', v.imgs.length);
    // Persist and reload from Firestore to avoid overwrite race
    try { 
      await saveVehicleToFirestore(v); 
      console.log('[ImageUpload] Firestore save completed');
    } catch(e3){ console.error('[ImageUpload] Persist failed:', e3); }
    try { 
      await reloadVehicles(); 
      console.log('[ImageUpload] Vehicles reloaded from Firestore');
    } catch(e4){ console.warn('[ImageUpload] Reload vehicles failed:', e4); }
    openEditor(_editingId);
    showToast('Image uploaded & saved');
  }catch(err){
    console.error('[ImageUpload] Storage upload failed:', err);
    console.error('[ImageUpload] Error details:', err.code, err.message);
    // Fallback base64 if upload failed (CORS or other error)
    console.log('[ImageUpload] Attempting base64 fallback after Storage error');
    try {
      const r2 = new FileReader();
      r2.onload = async (ev) => {
        v.imgs = v.imgs || [];
        v.imgs.push(ev.target.result);
        console.log('[ImageUpload] Base64 fallback added, imgs length:', v.imgs.length);
        try { 
          await saveVehicleToFirestore(v); 
          console.log('[ImageUpload] Base64 fallback persisted to Firestore');
        } catch(e4){ console.error('[ImageUpload] Failed to persist base64:', e4); }
        try { 
          await reloadVehicles(); 
          console.log('[ImageUpload] Vehicles reloaded after base64 fallback');
        } catch(e5){ console.warn('[ImageUpload] Reload after base64 failed:', e5); }
        openEditor(_editingId);
        alert('Image saved as base64 (Storage upload failed due to CORS - see STORAGE_CORS_FIX.md)');
      };
      r2.readAsDataURL(file);
    }catch(fallbackErr){ console.error('[ImageUpload] Base64 fallback also failed:', fallbackErr); }
  }
  finally {
    if(!uploadingToastShown){ try{ showToast('Done'); }catch{} }
  }
});

// Square-crop + compress avatar helper
async function prepareAvatarBlob(originalFile){
  return new Promise((resolve)=>{
    try{
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const minSide = Math.min(img.width, img.height);
          const sx = Math.floor((img.width - minSide)/2);
          const sy = Math.floor((img.height - minSide)/2);
          const TARGET = 256;
          const canvas = document.createElement('canvas');
          canvas.width = TARGET; canvas.height = TARGET;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, TARGET, TARGET);
          canvas.toBlob(b => resolve(b || originalFile), 'image/jpeg', 0.85);
        };
        img.onerror = () => resolve(originalFile);
        img.src = ev.target.result;
      };
      reader.onerror = () => resolve(originalFile);
      reader.readAsDataURL(originalFile);
    }catch{ resolve(originalFile); }
  });
}

// Helper: reload vehicles fresh from Firestore
async function reloadVehicles(){
  const db = getDB();
  const { collection, getDocs } = getUtils() || {};
  if(!db || !collection || !getDocs) return;
  try {
    const snap = await getDocs(collection(db,'vehicles'));
    VEHICLES.length = 0;
    snap.forEach(docSnap => VEHICLES.push({ id: docSnap.id, ...docSnap.data() }));
    renderVehicles();
    if(getSessionEmail()===OWNER_EMAIL){ try{ renderAdminVehicles(); }catch{} }
    seedBooking();
  }catch(err){ console.warn('reloadVehicles error:', err?.message||err); }
}

document.getElementById('adminAddVehicle')?.addEventListener('click',()=>{ const id='veh_'+Date.now(); const newVehicle = {id,name:'New Vehicle',type:'Other',seats:4,price:100,imgs:[],available:true,details:''}; VEHICLES.push(newVehicle); renderAdminVehicles(); saveVehicleToFirestore(newVehicle); });

document.getElementById('adminRefresh')?.addEventListener('click',()=>{ renderAdminVehicles(); });
// Also refresh inbox if owner
document.getElementById('adminRefresh')?.addEventListener('click',()=>{ if(getSessionEmail()===OWNER_EMAIL){ loadInboxMessages().then(renderInbox); } });
// Also refresh members
document.getElementById('adminRefresh')?.addEventListener('click',()=>{ if(getSessionEmail()===OWNER_EMAIL){ loadMembersAndRender(); } });

// About editor
document.getElementById('adminEditAbout')?.addEventListener('click',()=>{ document.getElementById('aboutEditorModal').style.display='block'; document.getElementById('aboutEdTitle').value = ABOUT_CONTENT.title; document.getElementById('aboutEdContent').value = ABOUT_CONTENT.content; });
document.getElementById('aboutEdCancel')?.addEventListener('click',()=>{ document.getElementById('aboutEditorModal').style.display='none'; });
document.getElementById('aboutEdSave')?.addEventListener('click',async ()=>{ ABOUT_CONTENT.title = document.getElementById('aboutEdTitle').value.trim(); ABOUT_CONTENT.content = document.getElementById('aboutEdContent').value.trim(); renderAbout(); document.getElementById('aboutEditorModal').style.display='none'; await saveAboutToFirestore(); alert('About page updated and saved.'); });

// Render admin grid when admin tab is shown
document.addEventListener('click',(e)=>{ const tab=e.target.closest('#adminTab'); if(!tab) return; setTimeout(renderAdminVehicles,0); });
document.addEventListener('click',(e)=>{ const tab=e.target.closest('#adminTab'); if(!tab) return; setTimeout(()=>{ loadInboxMessages().then(renderInbox); },0); });
document.addEventListener('click',(e)=>{ 
  const tab=e.target.closest('#adminTab'); 
  if(!tab) return; 
  setTimeout(()=>{ 
    console.log('Admin tab clicked, loading members...');
    loadMembersAndRender(); 
  },0); 
});

// Account avatar and photo management
document.getElementById('avatarEditBtn')?.addEventListener('click',()=>{
  document.getElementById('accountPhotoFile')?.click();
});
document.getElementById('accountPhotoFile')?.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0]; if(file) handleAvatarFile(file);
});

async function handleAvatarFile(file){
  try{
    const email = getSessionEmail(); if(!email){ alert('Please log in first.'); return; }
    const auth = getAuthInstance(); const uid = auth && auth.currentUser && auth.currentUser.uid; if(!uid){ alert('Please log in first.'); return; }
    const processed = await prepareAvatarBlob(file);
    let url;
    // Prioritize serverless upload to bypass Storage CORS/App Check issues
    try{
      url = await uploadViaFunction('avatar', processed);
    }catch(e){
      console.warn('Function upload failed, attempting direct Storage upload as fallback', e?.message||e);
      const storage = getStorage(); const utilsStore = getStorageUtils()||{};
      const { storageRef, uploadBytes, getDownloadURL } = utilsStore;
      if(storage && storageRef && uploadBytes && getDownloadURL){
        try{
          const safeName = (file.name||'avatar.jpg').replace(/[^a-zA-Z0-9._-]/g,'_').toLowerCase().replace(/\.(png|jpeg|jpg|webp)$/,'') + '.jpg';
          const path = `profile_photos/${uid}/${Date.now()}_${safeName}`;
          const ref = storageRef(storage, path);
          await uploadBytes(ref, processed, { contentType:'image/jpeg' });
          url = await getDownloadURL(ref);
        }catch(e2){
          console.warn('Direct Storage upload failed, falling back to inline data URL', e2?.message||e2);
          url = await blobToDataURL(processed);
        }
      }else{
        console.warn('Storage SDK unavailable, falling back to inline data URL');
        url = await blobToDataURL(processed);
      }
    }
    // Ensure user doc exists, then save to Firestore
    await ensureUserDocExists(uid, email);
    const db = getDB(); const { doc, setDoc } = getUtils()||{};
    const uid2 = uid;
    if(!db || !doc || !setDoc || !uid2){ alert('Database not available'); return; }
    console.log('Saving avatar URL to Firestore:', url);
    await setDoc(doc(db,'users', uid2), { photoUrl: url, photoUpdatedAt: new Date().toISOString(), email }, { merge:true });
    try{
      // Verify write persisted
      const { getDoc } = getUtils()||{};
      if(getDoc){
        const snap = await getDoc(doc(db,'users', uid2));
        console.log('Avatar saved, Firestore now has photoUrl:', (snap.exists()&&snap.data()&&snap.data().photoUrl)||null);
      }
    }catch(_){ }
    try{ localStorage.setItem('profile_photo_url', url); }catch{}
    showToast('Profile photo updated');
    renderAccountSummary();
  }catch(err){
    const msg = err && (err.message||err) || 'unknown';
    console.warn('Profile photo update failed', msg);
    showToast('Photo update failed: '+String(msg));
    alert('Failed to update photo');
  }
}
// Removed legacy remove-photo button per new design

// Cover photo management
// Cover change triggers (small camera overlay or legacy button)
document.getElementById('accountChangeCover')?.addEventListener('click',()=>{ document.getElementById('accountCoverFile')?.click(); });
document.getElementById('coverEditBtn')?.addEventListener('click',()=>{ document.getElementById('accountCoverFile')?.click(); });
document.getElementById('accountCoverFile')?.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0]; if(file) handleCoverFile(file);
});

async function handleCoverFile(file){
  try{
    const email = getSessionEmail(); if(!email){ alert('Please log in first.'); return; }
    const auth = getAuthInstance(); const uid = auth && auth.currentUser && auth.currentUser.uid; if(!uid){ alert('Please log in first.'); return; }
    const processed = await prepareCoverBlob(file);
    let url;
    // Prioritize serverless upload to bypass Storage CORS/App Check issues
    try{
      url = await uploadViaFunction('cover', processed);
    }catch(e){
      console.warn('Function upload failed, attempting direct Storage upload as fallback', e?.message||e);
      const storage = getStorage(); const utilsStore = getStorageUtils()||{};
      const { storageRef, uploadBytes, getDownloadURL } = utilsStore;
      if(storage && storageRef && uploadBytes && getDownloadURL){
        try{
          const safeName = (file.name||'cover.jpg').replace(/[^a-zA-Z0-9._-]/g,'_').toLowerCase().replace(/\.(png|jpeg|jpg|webp)$/,'') + '.jpg';
          const path = `profile_covers/${uid}/${Date.now()}_${safeName}`;
          const ref = storageRef(storage, path);
          await uploadBytes(ref, processed, { contentType:'image/jpeg' });
          url = await getDownloadURL(ref);
        }catch(e2){
          console.warn('Direct Storage upload failed, falling back to inline data URL', e2?.message||e2);
          url = await blobToDataURL(processed);
        }
      }else{
        console.warn('Storage SDK unavailable, falling back to inline data URL');
        url = await blobToDataURL(processed);
      }
    }
    // Ensure user doc exists, then save to Firestore
    await ensureUserDocExists(uid, email);
    const db = getDB(); const { doc, setDoc } = getUtils()||{};
    const uid2 = uid;
    if(!db || !doc || !setDoc || !uid2){ alert('Database not available'); return; }
    console.log('Saving cover URL to Firestore:', url);
    await setDoc(doc(db,'users', uid2), { coverUrl: url, coverUpdatedAt: new Date().toISOString(), email }, { merge:true });
    try{
      // Verify write persisted
      const { getDoc } = getUtils()||{};
      if(getDoc){
        const snap = await getDoc(doc(db,'users', uid2));
        console.log('Cover saved, Firestore now has coverUrl:', (snap.exists()&&snap.data()&&snap.data().coverUrl)||null);
      }
    }catch(_){ }
    try{ localStorage.setItem('profile_cover_url', url); }catch{}
    // Update UI
    const cover = document.getElementById('accountCover'); if(cover){ cover.style.backgroundImage = `url('${url}')`; }
    showToast('Cover photo updated');
  }catch(err){
    const msg = err && (err.message||err) || 'unknown';
    console.warn('Cover photo update failed', msg);
    showToast('Cover update failed: '+String(msg));
    alert('Failed to update cover');
  }
}
// Cover remove overlay was removed; legacy handler deleted per design
// Removed overlay remove button per design request

// Resize and letterbox cover image to ~1200x400 JPEG
async function prepareCoverBlob(originalFile){
  return new Promise((resolve)=>{
    try{
      const img = new Image();
      img.onload = ()=>{
        const targetW = 1200, targetH = 400; // 3:1
        const canvas = document.createElement('canvas');
        canvas.width = targetW; canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        // Fill background light gray to avoid black bars
        ctx.fillStyle = '#f2f2f2';
        ctx.fillRect(0,0,targetW,targetH);
        // Scale image to cover the area (object-fit: cover)
        const srcW = img.width, srcH = img.height;
        const scale = Math.max(targetW/srcW, targetH/srcH);
        const drawW = srcW * scale, drawH = srcH * scale;
        const dx = (targetW - drawW)/2, dy = (targetH - drawH)/2;
        ctx.drawImage(img, dx, dy, drawW, drawH);
        canvas.toBlob((blob)=> resolve(blob || originalFile), 'image/jpeg', 0.9);
      };
      img.onerror = ()=> resolve(originalFile);
      img.src = URL.createObjectURL(originalFile);
    }catch{ resolve(originalFile); }
  });
}

function renderAccountSummary(){
  try{
    const el = document.getElementById('accountSummary'); if(!el) return;
    const email = getSessionEmail(); if(!email){ el.textContent = 'Log in to view.'; return; }
    // Optimistic render from localStorage while Firestore loads
    try{
      const coverCached = localStorage.getItem('profile_cover_url')||'';
      const photoCached = localStorage.getItem('profile_photo_url')||'';
      const coverEl = document.getElementById('accountCover'); if(coverEl && coverCached){ coverEl.style.backgroundImage = `url('${coverCached}')`; }
      const avatarEl = document.getElementById('accountAvatar'); if(avatarEl && photoCached){ avatarEl.innerHTML = `<img src='${photoCached}' alt='avatar' style='width:100%;height:100%;object-fit:cover'>`; }
    }catch{}
    const db = getDB(); const { doc, getDoc } = getUtils()||{};
    const uid = (getAuthInstance() && getAuthInstance().currentUser && getAuthInstance().currentUser.uid) || null;
    if(!db || !doc || !getDoc || !uid) return;
    getDoc(doc(db,'users', uid)).then(snap=>{
      const data = snap.exists() ? (snap.data()||{}) : {};
      const name = `${data.firstName||''} ${data.lastName||''}`.trim()||email;
      // Cover image
      try{
        const coverEl = document.getElementById('accountCover');
        if(coverEl){
          const cover = data.coverUrl || '';
          coverEl.style.backgroundImage = cover ? `url('${cover}')` : 'none';
          // Remove button no longer present
        }
      }catch(_){ }
      const avatarEl = document.getElementById('accountAvatar'); if(avatarEl){
        const url = data.photoUrl;
        if(url){ avatarEl.innerHTML = `<img src='${url}' alt='avatar' style='width:100%;height:100%;object-fit:cover'>`; }
        else {
          const initials = (name||email).split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase();
          avatarEl.textContent = initials || '👤';
        }
      }
      try{
        if(data.coverUrl) localStorage.setItem('profile_cover_url', data.coverUrl);
        if(data.photoUrl) localStorage.setItem('profile_photo_url', data.photoUrl);
      }catch{}
      const license = data.licenseNumber ? `\nLicense #: ${data.licenseNumber}` : '';
      const status = data.status||'active';
      el.textContent = `Email: ${email}\nName: ${name}\nCountry: ${data.country||'United States'}${license}\nStatus: ${status}\nMember Since: ${data.createdAt? new Date(data.createdAt).toLocaleDateString():''}`;
    }).catch(()=>{});
  }catch{}
}

// Realtime: keep membership avatar/cover in sync without manual refresh
let _userDocUnsub = null;
function startUserDocRealtime(){
  try{
    const auth = getAuthInstance(); const uid = auth && auth.currentUser && auth.currentUser.uid; if(!uid) return;
    const db = getDB(); const { doc, onSnapshot } = getUtils()||{}; if(!db||!doc||!onSnapshot) return;
    if(_userDocUnsub) return; // already listening
    _userDocUnsub = onSnapshot(doc(db,'users', uid), (snap)=>{
      try{
        const data = snap.exists() ? (snap.data()||{}) : {};
        if(data.coverUrl){ localStorage.setItem('profile_cover_url', data.coverUrl); }
        if(data.photoUrl){ localStorage.setItem('profile_photo_url', data.photoUrl); }
        renderAccountSummary();
      }catch(_){ }
    });
  }catch(_){ }
}
function stopUserDocRealtime(){ try{ if(_userDocUnsub){ _userDocUnsub(); _userDocUnsub=null; } }catch(_){ }
}

// Ensure the Firestore user document exists with email (for rules), then merge extra fields
async function ensureUserDocExists(uid, email){
  try{
    const db = getDB(); const { doc, getDoc, setDoc } = getUtils()||{}; if(!db||!doc||!getDoc||!setDoc) return false;
    const ref = doc(db,'users', uid);
    const snap = await getDoc(ref).catch(()=>null);
    if(!snap || !snap.exists()){
      try{
        await setDoc(ref, { email: email||getSessionEmail()||'' }, { merge: true });
      }catch(e){
        // Fallback to serverless ensure-user-doc via Admin
        try{
          const resp = await fetch('/.netlify/functions/ensure-user-doc', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ uid, email: email||getSessionEmail()||'' })
          });
          if(!resp.ok){ throw new Error(await resp.text().catch(()=>resp.statusText)); }
          const data = await resp.json().catch(()=>({}));
          if(!data.ok){ throw new Error('Server failed to ensure user doc'); }
        }catch(e2){ console.warn('ensure-user-doc server fallback failed', e2?.message||e2); return false; }
      }
    }
    return true;
  }catch(_){ return false; }
}

// Drag-and-drop support on avatar
(()=>{
  const av = document.getElementById('accountAvatar'); if(!av) return;
  av.addEventListener('dragover', (e)=>{ e.preventDefault(); av.style.outline='2px dashed #d4af37'; });
  av.addEventListener('dragleave', ()=>{ av.style.outline='none'; });
  av.addEventListener('drop', (e)=>{
    e.preventDefault(); av.style.outline='none';
    const f = e.dataTransfer?.files?.[0]; if(f) handleAvatarFile(f);
  });
})();

// Drag-and-drop support on cover
(()=>{
  const cover = document.getElementById('accountCover'); if(!cover) return;
  cover.addEventListener('dragover', (e)=>{ e.preventDefault(); cover.style.outline='2px dashed #d4af37'; });
  cover.addEventListener('dragleave', ()=>{ cover.style.outline='none'; });
  cover.addEventListener('drop', (e)=>{
    e.preventDefault(); cover.style.outline='none';
    const f = e.dataTransfer?.files?.[0]; if(f) handleCoverFile(f);
  });
})();

function loadMembersAndRender(){ loadMembers().then(renderMembers); }
async function loadMembers(){
  const db = getDB(); const { collection, getDocs } = getUtils(); 
  if(!db) {
    console.log('No database instance available');
    return MEMBERS;
  }
  try{ 
    const snap = await getDocs(collection(db,'users')); 
    MEMBERS.length=0; 
    snap.forEach(d=> {
      const data = d.data();
      console.log('Loaded member:', d.id, data.email, 'photoUrl:', data.licensePhotoUrl || 'NONE');
      MEMBERS.push({ id:d.id, ...data });
    });
    console.log('Total members loaded:', MEMBERS.length);
    console.log('Full MEMBERS array:', MEMBERS);
    return MEMBERS; 
  }catch(err){ 
    console.error('Failed to load members:', err.message); 
    return MEMBERS; 
  }
}

// ===== Admin Bookings =====
let ADMIN_BOOKINGS = [];
async function loadAdminBookings(){
  const db=getDB(); const { collection, getDocs } = getUtils(); if(!db) return ADMIN_BOOKINGS;
  try{
    const snap = await getDocs(collection(db,'bookings'));
    ADMIN_BOOKINGS.length=0;
    snap.forEach(d=> ADMIN_BOOKINGS.push({ id:d.id, ...d.data() }));
    ADMIN_BOOKINGS.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
    return ADMIN_BOOKINGS;
  }catch(err){ console.error('Failed to load bookings:', err.message); return ADMIN_BOOKINGS; }
}

function renderAdminBookings(){
  const wrap=document.getElementById('adminBookings'); if(!wrap) return;
  wrap.innerHTML='';
  if(!ADMIN_BOOKINGS.length){ wrap.innerHTML = '<div class="muted">No bookings found.</div>'; return; }
  ADMIN_BOOKINGS.forEach(b=>{
    const veh = VEHICLES.find(v=>v.id===b.vehicleId);
    const name = veh? veh.name : (b.vehicleId||'Vehicle');
    const status = b.status||'pending';
    const dates = `${b.pickupDate||''} → ${b.returnDate||''}`;
    const cust = b.customer||{};
    const ts = b.createdAt? new Date(b.createdAt).toLocaleString() : '';
    const isLate = (()=>{ try{ if(!b.returnDate) return false; const due=new Date(b.returnDate).getTime(); return Date.now()>due; }catch{ return false; } })();
    const member = (typeof MEMBERS!=='undefined' && Array.isArray(MEMBERS))? MEMBERS.find(m=>m.email===b.userEmail):null;
    const hasCard = !!(member && member.cardOnFile && member.stripeDefaultPm);
    const card=document.createElement('article'); card.className='card';
    card.innerHTML = `<div class='body'>
      <div style='display:flex;gap:8px;align-items:center'>
        <div style='font-weight:700'>${name}</div>
        <span class='muted' style='margin-left:auto;font-size:12px'>${ts}</span>
      </div>
      <div class='muted' style='font-size:12px;margin-top:4px'>${b.userEmail||''}</div>
      <div class='muted' style='font-size:12px;margin-top:4px'>${dates}</div>
      <div style='margin-top:4px'><span class='badge' style='${hasCard?'background:#2d6a4f33;border-color:#2d6a4f66;color:#2d6a4f':'background:#6c757d22;border-color:#6c757d55;color:#6c757d'}'>Card on file: ${hasCard?'Yes':'No'}</span></div>
      <div style='white-space:pre-wrap;font-size:12px;color:var(--muted);margin-top:6px'>${
        [`Name: ${(cust.first||'')+' '+(cust.last||'')}`,
         `Address: ${cust.address||''}`,
         `License #: ${cust.licenseNumber||''}`,
         `Country: ${cust.country||cust.licenseCountry||''}`
        ].join('\n')}
      </div>
      ${status==='rented'?`<div class='muted' style='margin-top:4px;font-size:12px'>Rented at ${b.rentedAt? new Date(b.rentedAt).toLocaleString():''}</div>`:''}
      ${status==='rented'?`<div style='margin-top:4px;font-size:12px'><strong>Time until payment/return:</strong> <span class='countdown' data-return='${b.returnDate||''}' data-rented='${b.rentedAt||''}'>—</span></div>`:''}
      ${status==='rented'?`<div style='margin-top:8px;padding:8px;background:rgba(255,193,7,.1);border-left:3px solid #ffc107;font-size:11px;line-height:1.4'><strong>⚠️ Important:</strong> If the customer is extending, they must pay before the timer expires. If returning, the vehicle must be returned before the timer expires or a late fee of <strong>$15/hour</strong> will be added.</div>`:''}
      <div style='display:flex;gap:8px;margin-top:8px;flex-wrap:wrap'>
        <span class='badge' style='background:rgba(255,255,255,.08)'>${status}</span>
        <button class='navbtn' data-bk-accept='${b.id}'>Accept</button>
        <button class='navbtn' data-bk-reject='${b.id}'>Reject</button>
        <button class='navbtn' data-bk-rented='${b.id}'>Mark Rented</button>
        <button class='navbtn' data-bk-delete='${b.id}' style='background:#c1121f;border-color:#c1121f'>Delete</button>
        <button class='navbtn' data-bk-charge-late='${b.id}' ${isLate?'' : 'disabled'} title='Charge saved card for late fee now' style='background:#0d6efd;border-color:#0d6efd'>Charge Late Fee Now</button>
      </div>
    </div>`;
    wrap.appendChild(card);
  });
  startCountdowns();
}

async function updateAdminBookingStatus(id, status){
  const db=getDB(); const { doc, updateDoc } = getUtils(); if(!db) return;
  try{
    const payload = status==='rented' ? { status, rentedAt: Date.now() } : { status };
    await updateDoc(doc(db,'bookings',id), payload);
    // Update local vehicle availability/pending
    const adminBk = ADMIN_BOOKINGS.find(b=>b.id===id);
    if(adminBk){ const v = VEHICLES.find(x=> x.id===adminBk.vehicleId); if(v){
      if(status==='accepted'){ v.pending=true; v.available=true; }
      else if(status==='rented'){ v.pending=false; v.available=false; }
      else if(status==='rejected' || status==='cancelled'){ v.pending=false; v.available=true; }
      renderVehicles();
      try{ await saveVehicleToFirestore(v); }catch{}
    }}
  }catch(err){ console.error('Failed to update booking status:', err.message); }
}
async function deleteAdminBooking(id){
  const db=getDB(); const { doc, deleteDoc } = getUtils(); if(!db) return;
  try{ await deleteDoc(doc(db,'bookings',id)); }catch(err){ console.error('Failed to delete booking:', err.message); }
}

// Wire Admin tab and refresh button
document.addEventListener('click',(e)=>{ const tab=e.target.closest('#adminTab'); if(!tab) return; setTimeout(()=>{ loadAdminBookings().then(renderAdminBookings); },0); });
document.addEventListener('click',(e)=>{ if(e.target?.id==='adminBookingsRefresh'){ loadAdminBookings().then(renderAdminBookings); }});

// Admin booking action handlers
document.addEventListener('click',async (e)=>{
  const acc = e.target.closest('[data-bk-accept]');
  if(acc){
    const id=acc.dataset.bkAccept;
    const adminBk = ADMIN_BOOKINGS.find(b=>b.id===id);
    // Immediate UI feedback: mark vehicle pending and disable Book
    if(adminBk){ const v = VEHICLES.find(x=> x.id===adminBk.vehicleId); if(v){ v.pending=true; v.available=true; renderVehicles(); try{ await saveVehicleToFirestore(v); }catch{} }}
    updateAdminBookingStatus(id,'accepted').then(async ()=>{
      loadAdminBookings().then(renderAdminBookings);
      showToast('Booking accepted');
    });
    return;
  }
  const rej = e.target.closest('[data-bk-reject]');
  if(rej){ 
    const id=rej.dataset.bkReject; 
    const adminBk = ADMIN_BOOKINGS.find(b=>b.id===id);
    updateAdminBookingStatus(id,'rejected').then(()=>{ 
      loadAdminBookings().then(renderAdminBookings); 
      showToast('Booking rejected'); 
    }); 
    return; 
  }
  const rent = e.target.closest('[data-bk-rented]');
  if(rent){
    const id=rent.dataset.bkRented;
    const adminBk = ADMIN_BOOKINGS.find(b=>b.id===id);
    const now=Date.now();
    // Immediate UI feedback: mark vehicle unavailable
    if(adminBk){ const v = VEHICLES.find(x=> x.id===adminBk.vehicleId); if(v){ v.pending=false; v.available=false; renderVehicles(); try{ await saveVehicleToFirestore(v); }catch{} }}
    updateAdminBookingStatus(id,'rented').then(()=>{
      loadAdminBookings().then(renderAdminBookings);
      showToast('Marked rented at '+ new Date(now).toLocaleString());
    });
    return;
  }
  const del = e.target.closest('[data-bk-delete]');
  if(del){ const id=del.dataset.bkDelete; if(confirm('Delete this booking?')){ deleteAdminBooking(id).then(()=>{ loadAdminBookings().then(renderAdminBookings); showToast('Booking deleted'); }); } return; }
  const charge = e.target.closest('[data-bk-charge-late]');
  if(charge){
    const id = charge.dataset.bkChargeLate;
    try{
      charge.disabled = true; const prev=charge.textContent; charge.textContent='Charging…';
      const resp = await fetch('/.netlify/functions/charge-late-fee', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ bookingId: id }) });
      if(!resp.ok){ const txt=await resp.text().catch(()=>resp.statusText); throw new Error(txt); }
      const data = await resp.json().catch(()=>({}));
      if(data.charged){ showToast('Late fee charged'); } else { showToast(data.reason==='not_late'?'Not late yet':'Could not charge'); }
      loadAdminBookings().then(renderAdminBookings);
    }catch(err){ alert('Charge failed: '+(err.message||err)); }
    finally{ charge.disabled=false; charge.textContent='Charge Late Fee Now'; }
    return;
  }
});

// ===== Hosted Payment Integration (Stripe Checkout + PayPal) =====
// NOTE: Stripe publishable key is NOT required for redirect-to-Checkout approach.
// If needed later for client-side Stripe features, place pk_live_... here.

// Production PayPal Client ID (used on deployed domain)
const PAYPAL_CLIENT_ID_PROD = 'AZR88w1f5wJ_0a0pcxmxfHgiDZ0mTrLc6ViykHsecG1cs51ORMsGwuKNDligcYDelRkk5rPIjC22ynMj';

function ensurePayPalSdkLoaded(){
  return new Promise((resolve, reject)=>{
    try{
      if(typeof paypal !== 'undefined'){ resolve(); return; }
      const proto = (location && location.protocol) || '';
      const host = (location && location.hostname) || '';
      const isLocal = proto === 'file:' || host === '127.0.0.1' || host === 'localhost';
      const clientId = isLocal ? 'sb' : PAYPAL_CLIENT_ID_PROD;
      const src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&vault=true`;
      const s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = () => { if(typeof paypal === 'undefined'){ reject(new Error('PayPal SDK loaded, but not available')); } else { resolve(); } };
      s.onerror = () => reject(new Error('Failed to load PayPal SDK'));
      document.head.appendChild(s);
      // Fallback resolve after timeout if paypal becomes available
      setTimeout(()=>{ if(typeof paypal !== 'undefined'){ resolve(); } }, 8000);
    }catch(err){ reject(err); }
  });
}

function initHostedPayments(){
  try{ initStripeCheckoutButton(); }catch(e){ console.warn('Stripe init failed', e); }
  try{ initApplePayButton(); }catch(e){ console.warn('Apple Pay init failed', e); }
  ensurePayPalSdkLoaded()
    .then(()=>{ try{ initPayPalHostedButton(); }catch(e){ console.warn('PayPal init failed', e); } })
    .catch((e)=>{ console.warn('PayPal SDK load failed', e?.message||e); const wrap=document.getElementById('paypal-button-container'); if(wrap){ wrap.innerHTML='<small style="color:#666">PayPal unavailable (SDK failed to load).</small>'; } });
}

// Initialize on navigation to payments section
document.addEventListener('click', (e)=>{
  const payTab = e.target.closest('[data-nav="payments"]');
  if(payTab){ setTimeout(()=> { initHostedPayments(); updateFeeBreakdown(); }, 100); }
});

// Initialize when arriving directly on payments via hash or programmatic navigation
document.addEventListener('DOMContentLoaded', ()=>{
  // Safe bootstrap: if vehicles are not yet loaded, render defaults to avoid empty layout
  try{
    if(!Array.isArray(VEHICLES) || VEHICLES.length===0){
      VEHICLES.length=0; DEFAULT_VEHICLES.forEach(v=> VEHICLES.push({ ...v }));
      renderVehicles(); seedBooking();
    }
  }catch{}
  if(location.hash.includes('payments')){ setTimeout(()=> { initHostedPayments(); updateFeeBreakdown(); }, 100); }
  // Ensure bindings exist even if not navigating via tab
  setTimeout(()=> initHostedPayments(), 300);
  // Live fee breakdown on amount change
  const amtInput = document.getElementById('paymentAmount');
  if(amtInput){ amtInput.addEventListener('input', updateFeeBreakdown); }
  const retBtn = document.getElementById('returnVehicle');
  if(retBtn && !retBtn.dataset.bound){
    retBtn.dataset.bound='1';
    retBtn.addEventListener('click', ()=>{
      const bk = getActiveBooking();
      if(!bk){ alert('No active booking. Enter your Booking ID above.'); return; }
      updateFeeBreakdown();
      const due = bk?.returnDate ? new Date(bk.returnDate) : null;
      if(due){ startAnchoredCountdown(due); }
      showToast('Late fee applied if past due. Proceed to pay.');
    });
  }
  const saveCardBtn = document.getElementById('saveCardBtn');
  if(saveCardBtn && !saveCardBtn.dataset.bound){
    saveCardBtn.dataset.bound='1';
    saveCardBtn.addEventListener('click', async ()=>{
      const email = getSessionEmail();
      if(!email){ alert('Please log in first.'); return; }
      try{
        saveCardBtn.disabled = true; const prev=saveCardBtn.textContent; saveCardBtn.textContent='Opening secure card save…';
        const res = await fetch('/.netlify/functions/create-setup-session', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email })
        });
        if(!res.ok){ throw new Error(await res.text()); }
        const data = await res.json(); if(!data.url) throw new Error('No session URL');
        window.location.href = data.url;
      }catch(e){ alert('Unable to start save-card flow: '+(e.message||e)); }
      finally{ saveCardBtn.disabled=false; saveCardBtn.textContent='Save Card for Late Fees'; }
    });
  }
  const savePayPalBtn = document.getElementById('savePayPalBtn');
  if(savePayPalBtn && !savePayPalBtn.dataset.bound){
    savePayPalBtn.dataset.bound='1';
    savePayPalBtn.addEventListener('click', ()=>{
      showPayPalHostedStatus('Saving PayPal for future charges requires PayPal Vault/Reference Transactions. Contact PayPal to enable this on your account.', false);
    });
  }
  // Terms agreement handling for payments
  const termsChk = document.getElementById('paymentTermsAgree');
  const statusMsg = document.getElementById('termsAgreeStatus');
  function updatePayButtonsDisabled(){
    const agreed = termsChk && termsChk.checked;
    const stripeBtn = document.getElementById('stripeCheckoutBtn');
    const appleBtn = document.getElementById('applePayBtn');
    if(stripeBtn) stripeBtn.disabled = !agreed;
    if(appleBtn) appleBtn.disabled = !agreed;
    if(statusMsg) statusMsg.style.display = agreed? 'none':'block';
    // Render PayPal buttons only after agree
    if(agreed){
      try{ if(!document.getElementById('paypal-button-container')?.dataset.loaded){ initPayPalHostedButton(); } }catch{}
    }
  }
  if(termsChk){ termsChk.addEventListener('change', updatePayButtonsDisabled); updatePayButtonsDisabled(); }
});
window.addEventListener('hashchange', ()=>{
  if(location.hash.includes('payments')){ setTimeout(()=> initHostedPayments(), 100); }
});

let countdownInterval=null;
function startAnchoredCountdown(dueAt){
  try{
    if(countdownInterval) clearInterval(countdownInterval);
    const timerEl = document.getElementById('rentalTimer');
    const render = () => {
      const now = new Date();
      const diff = dueAt - now;
      const abs = Math.abs(diff);
      const h = Math.floor(abs/(1000*60*60));
      const m = Math.floor((abs%(1000*60*60))/(1000*60));
      const s = Math.floor((abs%(1000*60))/1000);
      if(timerEl){ timerEl.textContent = `${diff>=0?'':'-'}${h}h ${m}m ${s}s`; timerEl.style.color = diff<0 ? '#c1121f' : '#555'; }
    };
    render();
    countdownInterval = setInterval(render, 1000);
  }catch(e){ console.warn('countdown error', e); }
}

function getBookingAndAmount(){
  const bookingId = document.getElementById('paymentBookingId')?.value.trim();
  const amountStr = document.getElementById('paymentAmount')?.value.trim();
  const amountFloat = parseFloat(amountStr||'0');
  const amountCents = Math.round(amountFloat * 100);
  return { bookingId, amountCents, amountFloat };
}

function getActiveBooking(){
  try{
    const { bookingId } = getBookingAndAmount();
    if(!bookingId) return null;
    const baseId = bookingId.replace('_extend1w','');
    const email=getSessionEmail(); if(!email) return null;
    loadBookingsForEmail(email);
    const bk = MY_BOOKINGS.find(b=>b.id===baseId||b.fireId===baseId);
    return bk || null;
  }catch(e){ console.warn('getActiveBooking error', e); return null; }
}

function calculateStripeFee(amount){
  // Stripe: 2.9% + $0.30
  const total = amount * 1.029 + 0.30;
  const fee = total - amount;
  return { fee, total };
}

function calculatePayPalFee(amount){
  // PayPal: 3.49% + $0.49
  const total = amount * 1.0349 + 0.49;
  const fee = total - amount;
  return { fee, total };
}

function updateFeeBreakdown(){
  const amountStr = document.getElementById('paymentAmount')?.value.trim();
  const amount = parseFloat(amountStr||'0');
  const breakdown = document.getElementById('feeBreakdown');
  if(!breakdown) return;
  if(!amount || amount <= 0){ breakdown.style.display='none'; return; }
  breakdown.style.display='block';
  // Late fee based on booking due time
  const bk = getActiveBooking();
  let lateFee = 0;
  try{
    const due = bk?.returnDate ? new Date(bk.returnDate) : null;
    if(due){
      const now = new Date();
      const diffMs = now - due;
      if(diffMs > 0){
        const hours = Math.ceil(diffMs / (1000*60*60));
        lateFee = Math.min(hours * 15, 200); // $15/hour, capped at $200
      }
    }
  }catch{}
  const basePlusLate = amount + lateFee;
  const stripe = calculateStripeFee(amount);
  const paypal = calculatePayPalFee(amount);
  const stripeOnLate = calculateStripeFee(basePlusLate);
  const paypalOnLate = calculatePayPalFee(basePlusLate);
  const lf = document.getElementById('lateFee'); if(lf) lf.textContent = '$' + (lateFee.toFixed(2));
  const bl = document.getElementById('basePlusLate'); if(bl) bl.textContent = '$' + (basePlusLate.toFixed(2));
  document.getElementById('stripeFee').textContent = '$' + stripeOnLate.fee.toFixed(2);
  document.getElementById('stripeTotal').textContent = '$' + stripeOnLate.total.toFixed(2);
  document.getElementById('paypalFee').textContent = '$' + paypalOnLate.fee.toFixed(2);
  document.getElementById('paypalTotal').textContent = '$' + paypalOnLate.total.toFixed(2);
}

function initStripeCheckoutButton(){
  const btn = document.getElementById('stripeCheckoutBtn');
  if(!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async ()=>{
    if(!document.getElementById('paymentTermsAgree')?.checked){ showToast('Please agree to terms first.'); return; }
    await recordTermsAcceptanceSafe();
    const { bookingId, amountFloat } = getBookingAndAmount();
    const msgEl = document.getElementById('payment-message');
    if(!bookingId || !amountFloat || amountFloat <= 0){
      if(msgEl){ msgEl.style.display='block'; msgEl.style.color='#c1121f'; msgEl.textContent='Missing or invalid booking amount.'; }
      return;
    }
    // Add automatic late fee if overdue
    let lateFee = 0; const bk = getActiveBooking();
    try{ const due = bk?.returnDate ? new Date(bk.returnDate) : null; if(due){ const now=new Date(); const ms=now-due; if(ms>0){ const hours=Math.ceil(ms/(1000*60*60)); lateFee = Math.min(hours*15,200); } } }catch{}
    const basePlusLate = amountFloat + lateFee;
    // Calculate Stripe total on base + late fee
    const stripe = calculateStripeFee(basePlusLate);
    const stripeTotalCents = Math.round(stripe.total * 100);
    btn.disabled = true; btn.textContent = 'Redirecting…';
    try{
      const endpoint = '/.netlify/functions/create-checkout-session';
      const res = await fetch(endpoint, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ bookingId, amount: stripeTotalCents, email: getSessionEmail()||'', metadata: { lateFee: Math.round(lateFee*100) } })
      });
      if(!res.ok){
        const txt = await res.text().catch(()=>res.statusText);
        throw new Error(`Checkout create failed (${res.status}): ${txt}`);
      }
      const data = await res.json();
      if(!data.url){ throw new Error('No session URL returned'); }
      window.location.href = data.url; // Redirect to Stripe Checkout
    }catch(err){
      console.error('Stripe Checkout error', err);
      if(msgEl){ msgEl.style.display='block'; msgEl.style.color='#c1121f'; msgEl.textContent = err.message || 'Failed to start checkout.'; }
      btn.disabled = false; btn.textContent = 'Pay Now';
    }
  });
}

function initApplePayButton(){
  const btn = document.getElementById('applePayBtn');
  if(!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async ()=>{
    if(!document.getElementById('paymentTermsAgree')?.checked){ showToast('Agree to terms first.'); return; }
    await recordTermsAcceptanceSafe();
    const { bookingId, amountFloat } = getBookingAndAmount();
    const msgEl = document.getElementById('payment-message');
    const aMsg = document.getElementById('apple-status');
    const appleSupported = typeof window.ApplePaySession !== 'undefined' && ApplePaySession.canMakePayments && ApplePaySession.canMakePayments();
    if(!appleSupported){ if(aMsg){ aMsg.style.display='block'; aMsg.textContent='Apple Pay not available on this device. We\'ll open secure checkout where you can still use your card.'; } }
    if(!bookingId || !amountFloat || amountFloat <= 0){
      if(msgEl){ msgEl.style.display='block'; msgEl.style.color='#c1121f'; msgEl.textContent='Missing or invalid booking amount.'; }
      return;
    }
    // Add automatic late fee if overdue
    let lateFee = 0; const bk = getActiveBooking();
    try{ const due = bk?.returnDate ? new Date(bk.returnDate) : null; if(due){ const now=new Date(); const ms=now-due; if(ms>0){ const hours=Math.ceil(ms/(1000*60*60)); lateFee = Math.min(hours*15,200); } } }catch{}
    const basePlusLate = amountFloat + lateFee;
    const stripe = calculateStripeFee(basePlusLate);
    const stripeTotalCents = Math.round(stripe.total * 100);
    btn.disabled = true; const prev=btn.textContent; btn.textContent='Checking…';
    try{
      // Use the same Checkout session. On Apple devices, Apple Pay shows as an option on Checkout.
      const endpoint = '/.netlify/functions/create-checkout-session';
      const res = await fetch(endpoint, {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ bookingId, amount: stripeTotalCents, email: getSessionEmail()||'' })
      });
      if(!res.ok){ const txt=await res.text().catch(()=>res.statusText); throw new Error(`Checkout create failed (${res.status}): ${txt}`); }
      const data = await res.json(); if(!data.url) throw new Error('No session URL returned');
      window.location.href = data.url;
    }catch(err){
      console.error('Apple Pay flow (Checkout) error', err);
      if(msgEl){ msgEl.style.display='block'; msgEl.style.color='#c1121f'; msgEl.textContent = err.message || 'Failed to start Apple Pay checkout.'; }
      btn.disabled = false; btn.textContent = prev;
    }
  });
}

function initPayPalHostedButton(){
  const wrap = document.getElementById('paypal-button-container');
  if(!wrap || wrap.dataset.loaded) return;
  if(!document.getElementById('paymentTermsAgree')?.checked){ wrap.innerHTML='<small style="color:#666">Agree to terms to enable PayPal.</small>'; return; }
  if(typeof paypal === 'undefined'){ wrap.innerHTML='<small style="color:#666">Loading PayPal…</small>'; return; }
  wrap.dataset.loaded='1';
  paypal.Buttons({
    style:{ layout:'vertical', color:'gold', shape:'rect', label:'pay' },
    createOrder: (data, actions) => {
      const { bookingId, amountFloat } = getBookingAndAmount();
      if(!bookingId || !amountFloat || amountFloat <= 0){ showPayPalHostedStatus('Enter booking & amount first', true); return ''; }
      // Add automatic late fee if overdue
      let lateFee = 0; const bk = getActiveBooking();
      try{ const due = bk?.returnDate ? new Date(bk.returnDate) : null; if(due){ const now=new Date(); const ms=now-due; if(ms>0){ const hours=Math.ceil(ms/(1000*60*60)); lateFee = Math.min(hours*15,200); } } }catch{}
      const basePlusLate = amountFloat + lateFee;
      const paypal = calculatePayPalFee(basePlusLate);
      const decimal = paypal.total.toFixed(2);
      return actions.order.create({
        intent:'CAPTURE',
        purchase_units:[{ reference_id: bookingId, amount:{ currency_code:'USD', value: decimal }, description:`CCR Booking ${bookingId}` }]
      });
    },
    onApprove: async (data, actions) => {
      try{
        if(!document.getElementById('paymentTermsAgree')?.checked){ throw new Error('Terms not accepted'); }
        await recordTermsAcceptanceSafe();
        const details = await actions.order.capture();
        showPayPalHostedStatus('Payment captured. Verifying…', false);
        const { bookingId, amountFloat } = getBookingAndAmount();
        let lateFee = 0; const bk = getActiveBooking();
        try{ const due = bk?.returnDate ? new Date(bk.returnDate) : null; if(due){ const now=new Date(); const ms=now-due; if(ms>0){ const hours=Math.ceil(ms/(1000*60*60)); lateFee = Math.min(hours*15,200); } } }catch{}
        const basePlusLate = amountFloat + lateFee;
        const paypal = calculatePayPalFee(basePlusLate);
        const paypalTotalCents = Math.round(paypal.total * 100);
        // Call verification stub (does server-side fetch of order)
        const resp = await fetch('/.netlify/functions/paypal-payment-confirm', {
          method:'POST', headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ orderId: data.orderID, bookingId, amount: paypalTotalCents, metadata: { lateFee: Math.round(lateFee*100) } })
        });
        // Accept any 2xx status as success (200, 201, etc.)
        if(!resp.ok && resp.status < 200 || resp.status >= 300){ 
          const errText = await resp.text().catch(()=>'Unknown server error'); 
          throw new Error('Verify failed: ' + errText); 
        }
        const verify = await resp.json().catch(()=>({}));
        showPayPalHostedStatus('PayPal payment successful!', false, true);
        console.log('PayPal verify response', verify);
        // Mark booking as paid locally & Firestore, flip timer green
        if(bookingId){
          const baseId = bookingId.replace('_extend1w','');
          const email=getSessionEmail(); if(email){ loadBookingsForEmail(email); const bk=MY_BOOKINGS.find(b=>b.id===baseId||b.fireId===baseId); if(bk){ bk.status='rented'; bk.rentedAt = Date.now(); saveBookingsForEmail(email); try{ const db=getDB(); const { doc, updateDoc } = getUtils(); if(db && bk.fireId){ updateDoc(doc(db,'bookings',bk.fireId), { status:'rented', rentedAt: bk.rentedAt }); } }catch(err){ console.warn('Firestore update (PayPal rented) failed', err.message); } renderAccountBookings(); showToast('Booking marked rented'); }
          }
          const timerEl = document.getElementById('rentalTimer'); if(timerEl){ timerEl.classList.add('paid'); timerEl.classList.remove('late'); }
        }
      }catch(err){ console.error('PayPal approve error', err); showPayPalHostedStatus(err.message||'PayPal failed', true); }
    },
    onError: (err) => { console.error('PayPal button error', err); showPayPalHostedStatus('PayPal error: '+(err.message||'Unknown'), true); }
  }).render('#paypal-button-container');
  showPayPalHostedStatus('PayPal ready', false);
}

function showPayPalHostedStatus(msg, isError=false, success=false){
  const el = document.getElementById('paypal-status');
  if(!el) return; el.style.display='block'; el.textContent=msg; el.style.color = success? '#2d6a4f' : (isError? '#c1121f' : '#666');
}

// ===== Terms Acceptance Recording =====
const TERMS_VERSION = '2025-12';
async function recordTermsAcceptanceSafe(){
  try{ await recordTermsAcceptance(); }catch(e){ console.warn('recordTermsAcceptance failed', e.message); }
}
async function recordTermsAcceptance(){
  const email = getSessionEmail(); if(!email) return; // Only store for logged-in users
  const agreed = document.getElementById('paymentTermsAgree')?.checked; if(!agreed) return;
  // Avoid repeat writes within short window
  const last = recordTermsAcceptance._last; const now = Date.now(); if(last && (now - last < 15000)) return; recordTermsAcceptance._last = now;
  let ip = '';
  try{ const resp = await fetch('https://api.ipify.org?format=json',{cache:'no-store'}); if(resp.ok){ const data = await resp.json(); ip = data.ip || ''; } }catch{}
  try{
    const db=getDB(); const utils=getUtils()||{}; const authEmail=email;
    if(db && utils.collection && utils.query && utils.where && utils.getDocs && utils.doc && utils.updateDoc){
      const q = await utils.getDocs(utils.query(utils.collection(db,'users'), utils.where('email','==',authEmail)));
      if(!q.empty){
        const ref = q.docs[0].ref; const userData = q.docs[0].data() || {};
        const acceptance = { version: TERMS_VERSION, agreed:true, ts:new Date().toISOString(), ip };
        await utils.updateDoc(ref, { termsAcceptance: acceptance });
        console.log('Stored terms acceptance for', authEmail);
        // Send email notification to owner only once per version per user via server function
        const localKey = 'termsAccepted_'+TERMS_VERSION;
        if(!localStorage.getItem(localKey)){
          try{
            const resp = await fetch('/.netlify/functions/notify-terms-acceptance', {
              method:'POST', headers:{'Content-Type':'application/json'},
              body: JSON.stringify({ to:'clyderoccr@gmail.com', userEmail: authEmail, acceptance, user: userData })
            });
            if(!resp.ok){ console.warn('Notify terms failed', await resp.text().catch(()=>resp.statusText)); }
          }catch(e){ console.warn('Notify terms error', e.message); }
        }
      }
    }
    localStorage.setItem('termsAccepted_'+TERMS_VERSION, '1');
  }catch(e){ console.warn('Failed to persist terms acceptance', e.message); }
}

// (Client-side EmailJS path removed; using server function for reliability)
