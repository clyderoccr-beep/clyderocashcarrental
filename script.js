'use strict';
  try{
// Firestore helpers
function getDB(){ return window.firestoreDB; }
    const actionCodeSettings = {
      url: 'https://clyderoccr.com',
      handleCodeInApp: false
    try{
      // Backdrop to avoid layout shifts
      const backdrop = document.createElement('div');
      backdrop.id = 'resetBackdrop';
      backdrop.style.position = 'fixed';
      backdrop.style.inset = '0';
      backdrop.style.background = 'rgba(0,0,0,.4)';
      backdrop.style.zIndex = '999';
      backdrop.style.backdropFilter = 'blur(2px)';
      backdrop.setAttribute('aria-hidden','true');

      // Modal card (fixed, no margins so it doesn't affect layout)
      const wrap = document.createElement('div');
      wrap.id = 'resetModal';
      wrap.className = 'card';
      wrap.style.maxWidth = '420px';
      wrap.style.position = 'fixed';
      wrap.style.left = '50%';
      wrap.style.top = '20%';
      wrap.style.transform = 'translateX(-50%)';
      wrap.style.zIndex = '1000';
      wrap.setAttribute('role','dialog');
      wrap.setAttribute('aria-modal','true');
      wrap.innerHTML = `<div class=\"body\">\n      <h3 style=\"margin-top:0\">Reset Password</h3>\n      <div id=\"resetStatus\" class=\"muted\" style=\"font-size:12px\">Validating link...</div>\n      <label style=\"margin-top:8px;color:#000\">New password</label>\n      <input id=\"newPassword\" type=\"password\" style=\"width:100%;color:#000\">\n      <label style=\"margin-top:8px;color:#000\">Confirm password</label>\n      <input id=\"confirmPassword\" type=\"password\" style=\"width:100%;color:#000\">\n      <div style=\"display:flex;gap:8px;margin-top:12px\">\n        <button class=\"navbtn\" id=\"resetSubmit\" type=\"button\">Set password</button>\n        <button class=\"navbtn\" id=\"resetCancel\" type=\"button\">Cancel</button>\n      </div>\n    </div>`;
      document.body.appendChild(backdrop);
      document.body.appendChild(wrap);
      console.log('Auth state changed, user:', user ? user.email : 'null');
      if(user && user.email) {
        // User is signed in, store email
        sessionStorage.setItem('sessionEmail', user.email);
        console.log('Stored email in sessionStorage:', user.email);
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
    }); 
  } 
}catch(err){ 
  console.error('Auth listener error:', err);
}

// Router: show one section at a time, default = blank
const ROUTES = { vehicles:'#vehicles', about:'#about', booking:'#booking', payments:'#payments', login:'#login', membership:'#membership', signup:'#signup', contact:'#contact', admin:'#admin' };
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
  }
  // Pre-fill vehicle booking if coming from vehicle card
  if(nav==='booking' && t.dataset.veh){ 
    const sel=document.getElementById('vehicle-select'); 
    if(sel){ sel.value=t.dataset.veh; } 
  } 
});

// Forgot password: Firebase Auth reset email with simple UX
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
    await api.sendPasswordResetEmail(auth, email);
    showToast('If an account exists, a reset email was sent.');
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
  await loadFromFirestore(); 
  renderVehicles(); 
  seedBooking(); 
  seedPayments(); 
  renderAbout(); 
  // Start realtime after initial snapshot load
  setupRealtimeForRole();
  // If arrived with Firebase email action link, handle reset in-app
  try{
    const params = new URLSearchParams(location.search||'');
    const mode = params.get('mode');
    const oobCode = params.get('oobCode');
    if(mode === 'resetPassword' && oobCode){
      showResetPasswordUI(oobCode);
    }
  }catch(_){ /* ignore */ }
  
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

// In-app password reset UI and flow
function showResetPasswordUI(oobCode){
  try{
    // Render a lightweight modal card
    const wrap = document.createElement('div');
    wrap.id = 'resetModal';
    wrap.className = 'card';
    wrap.style.maxWidth = '420px';
    wrap.style.margin = '12px auto';
    wrap.style.position = 'fixed';
    wrap.style.left = '50%';
    wrap.style.top = '20%';
    wrap.style.transform = 'translateX(-50%)';
    wrap.style.zIndex = '1000';
    wrap.innerHTML = `<div class="body">
      <h3 style="margin-top:0">Reset Password</h3>
      <div id="resetStatus" class="muted" style="font-size:12px">Validating link...</div>
      <label style="margin-top:8px;color:#000">New password</label>
      <input id="newPassword" type="password" style="width:100%;color:#000">
      <label style="margin-top:8px;color:#000">Confirm password</label>
      <input id="confirmPassword" type="password" style="width:100%;color:#000">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="navbtn" id="resetSubmit" type="button">Set password</button>
        <button class="navbtn" id="resetCancel" type="button">Cancel</button>
      </div>
    </div>`;
    document.body.appendChild(wrap);

    const api = getAuthApi();
    const auth = getAuthInstance();
    const statusEl = wrap.querySelector('#resetStatus');
    const submitBtn = wrap.querySelector('#resetSubmit');
    const cancelBtn = wrap.querySelector('#resetCancel');
    const newPwEl = wrap.querySelector('#newPassword');
    const confPwEl = wrap.querySelector('#confirmPassword');

    if(!(api.verifyPasswordResetCode && api.confirmPasswordReset && auth)){
      statusEl.textContent = 'Reset not available. Please try again later.';
      submitBtn.disabled = true;
      return;
    }

    api.verifyPasswordResetCode(auth, oobCode).then((email)=>{
      statusEl.textContent = `Resetting password for ${email}`;
    }).catch((err)=>{
      statusEl.textContent = cleanErrorMessage(err);
      submitBtn.disabled = true;
    });

    const close = ()=>{ try{ document.body.removeChild(wrap); }catch{} try{ document.body.removeChild(backdrop); }catch{} };
    cancelBtn.addEventListener('click', close);
    submitBtn.addEventListener('click', async ()=>{
      const pw = (newPwEl.value||'').trim();
      const pw2 = (confPwEl.value||'').trim();
      if(!pw || pw.length < 6){ alert('Password should be at least 6 characters.'); return; }
      if(pw !== pw2){ alert('Passwords do not match'); return; }
      try{
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
        await api.confirmPasswordReset(auth, oobCode, pw);
        showToast('Password updated. Please log in.');
        close();
        goto('login');
      }catch(err){
        alert(cleanErrorMessage(err));
      }finally{
        submitBtn.disabled = false;
        submitBtn.textContent = 'Set password';
      }
    });
  }catch(err){ console.warn('Reset UI error:', err?.message||err); }
}

// Simple session (non-secure placeholder; replace with Firebase Auth for production)
const OWNER_EMAIL = 'clyderofraser97@gmail.com';
function getSessionEmail(){
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
function updateAdminVisibility(){ 
  const email = getSessionEmail();
  const isOwner = email === OWNER_EMAIL;
  console.log('updateAdminVisibility - email:', email, 'isOwner:', isOwner);
  const tab = document.getElementById('adminTab');
  const admin = document.getElementById('admin');
  if(tab) {
    tab.style.display = isOwner ? 'inline-block' : 'none';
    console.log('Admin tab display:', tab.style.display);
  }
  if(admin){
    if(!isOwner){ admin.style.display = 'none'; }
  }
}
function updateNavLabels(){
  const email = getSessionEmail();
  console.log('updateNavLabels - email:', email);
  const loginBtn = document.querySelector('nav [data-nav="login"]');
  const memberBtn = document.querySelector('nav [data-nav="membership"]');
  const bookingBtn = document.querySelector('nav [data-nav="booking"]');
  const paymentsBtn = document.querySelector('nav [data-nav="payments"]');
  
  // Hide login button when logged in, show when logged out
  if(loginBtn){ 
    loginBtn.style.display = email ? 'none' : 'inline-block';
    console.log('Login button display:', loginBtn.style.display);
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
  console.log('updateMembershipPanel called, email:', email);
  console.log('accountPanel:', panel, 'membershipContent:', content);
  if(!panel || !content) return;
  if(email){
    console.log('User logged in, showing account panel');
    content.style.display='none'; 
    panel.style.display='block';
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

      setSessionEmail(email); // Store email immediately after login
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
  const memberBtn = document.querySelector('nav [data-nav="membership"]');
  const bookingBtn = document.querySelector('nav [data-nav="booking"]');
  const paymentsBtn = document.querySelector('nav [data-nav="payments"]');
  const adminTab = document.getElementById('adminTab');
  
  if(loginBtn) loginBtn.style.display = 'inline-block';
  if(memberBtn) memberBtn.textContent = 'Membership';
  if(bookingBtn) bookingBtn.style.display = 'none';
  if(paymentsBtn) paymentsBtn.style.display = 'none';
  if(adminTab) adminTab.style.display = 'none';
  
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

// Vehicles
const VEHICLES=[
  {id:'veh_dodge_journey_2014',name:'2014 Dodge Journey',type:'SUV',seats:7,price:250,imgs:['assets/2014-dodge-journey-exterior-1.jpg']},
  {id:'veh_hyundai_accent_2016',name:'2016 Hyundai Accent',type:'Sedan',seats:5,price:200,imgs:['assets/2016-hyundai-accent-exterior-1.webp','assets/2016-hyundai.jpg']},
  {id:'veh_red_kia',name:'Red Kia',type:'Sedan',seats:5,price:220,imgs:['assets/red-kia-exterior-1.webp','assets/red-kia-exterior-2.webp','assets/red-kia-exterior-3.webp','assets/red-kia-exterior-4.webp','assets/red-kia-interior-1.webp','assets/red-kia-interior-2.webp']},
  {id:'veh_ford_freestyle',name:'Ford Freestyle',type:'SUV',seats:7,price:240,imgs:['assets/ford-freestyle.jpg']},
  {id:'veh_nissan_xterra',name:'Nissan Xterra',type:'SUV',seats:5,price:260,imgs:['assets/xterra.jpg','assets/hero-xterra.jpg']}
];
// Preserve defaults for fallback when Firestore returns empty
const DEFAULT_VEHICLES = VEHICLES.map(v=>({ ...v }));

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
    const el=document.createElement('article'); el.className='card';
    const bookBtn = isAvail
      ? `<button class='navbtn' aria-label='Book ${v.name}' data-nav='booking' data-veh='${v.id}'>Book</button>`
      : `<button class='navbtn' disabled title='Unavailable' aria-disabled='true'>Book</button>`;
    const statusBadge = isAvail ? '' : `<span class='badge unavailable' style='margin-left:8px'>Unavailable</span>`;
    const firstImg = (v.imgs&&v.imgs[0])||'';
    const imgHtml = firstImg 
      ? `<img alt="Photo of ${v.name}" loading="lazy" src="${firstImg}" onerror="this.src='https://via.placeholder.com/400x300.png?text=No+Image';this.onerror=null;" style="width:100%;height:auto;min-height:200px;object-fit:cover;background:#f0f0f0">` 
      : `<div style="width:100%;height:200px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#999">No Image</div>`;
    el.innerHTML=`${imgHtml}\n<div class='body'>
      <div style='display:flex;align-items:center;gap:8px'>
        <span class='veh-dot ${isAvail?'available':'unavailable'}' title='${isAvail?'Available':'Unavailable'}'></span>
        <div style='font-weight:800'>${v.name}</div>
      </div>
      <div class='muted' style='margin:6px 0'>Seats ${v.seats} • ${v.type}</div>
      <div style='display:flex;gap:8px;align-items:center'>
        ${bookBtn}
        <span style='margin-left:auto;color:var(--gold)'>$${v.price}/week</span>${statusBadge}
      </div>
      <div style='margin-top:8px'><button class='navbtn' data-gallery='${v.id}' aria-label='View photo gallery for ${v.name}'>View Photos</button></div>
    </div>`;
    grid.appendChild(el);
  });
}

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
      }
    });
    
    saveBookingsForEmail(email);
    const accountPanel = document.getElementById('accountBookings');
    const isVisible = accountPanel && accountPanel.offsetParent !== null;
    if(isVisible){
      renderAccountBookings();
    }
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
    const badge = status==='active' ? '' : status==='accepted' ? `<span class='badge' style='background:#0d6efd33;border-color:#0d6efd66;color:#b3d4ff'>Accepted</span>` : status==='rented' ? `<span class='badge' style='background:#19875433;border-color:#19875466;color:#cfead8'>Rented</span>` : status==='cancelled' ? `<span class='badge unavailable'>Cancelled</span>` : `<span class='badge' style='background:rgba(255,255,255,.08)'>${status}</span>`;
    card.innerHTML=`<div class='body'>
      <div style='display:flex;gap:8px;align-items:center'>
        <div style='font-weight:700'>${name}</div>
        <span class='muted' style='margin-left:auto;font-size:12px'>${new Date(b.createdAt||Date.now()).toLocaleString()}</span>
      </div>
      <div class='muted' style='margin-top:4px;font-size:12px'>${dates}</div>
      <div style='margin-top:4px'>${badge}</div>
      ${status==='rented'?`<div class='muted' style='margin-top:4px;font-size:12px'>Rented at ${b.rentedAt? new Date(b.rentedAt).toLocaleString():''}</div>`:''}
      ${status==='rented'?`<div style='margin-top:4px;font-size:12px'><strong>Time until payment/return:</strong> <span class='countdown' data-return='${b.returnDate||''}' data-rented='${b.rentedAt||''}'>—</span></div>`:''}
      ${status==='rented'?`<div style='margin-top:8px;padding:8px;background:rgba(255,193,7,.1);border-left:3px solid #ffc107;font-size:11px;line-height:1.4'><strong>⚠️ Important:</strong> If extending, pay before timer expires. If returning, return before timer expires or a late fee of <strong>$5/hour</strong> will be added.</div>`:''}
      <div style='display:flex;gap:8px;margin-top:8px;flex-wrap:wrap'>
        ${status==='active'?`<button class='navbtn' data-bk-extend='${b.id}'>Extend</button><button class='navbtn' data-bk-cancel='${b.id}'>Cancel</button>`:''}
      </div>
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
      
      if(diff <= 0){ el.textContent = 'Payment Due Now!'; el.style.color = '#c1121f'; el.style.fontWeight = '700'; return; }
      
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

// Booking submit -> save and route to account
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
      }).catch(err=>console.warn('Add booking failed:', err.message));
    }
  }catch(err){ console.warn('Could not save booking to Firestore:', err.message); }
  alert('Booking submitted. You can manage it in My Account.');
  goto('membership');
  updateMembershipPanel();
});

// Booking actions: cancel + extend
document.addEventListener('click',(e)=>{
  const cancelBtn=e.target.closest('[data-bk-cancel]');
    if(cancelBtn){ const email=getSessionEmail(); if(!email) return; loadBookingsForEmail(email); const id=cancelBtn.dataset.bkCancel; const bk=MY_BOOKINGS.find(b=>b.id===id); if(bk && bk.status!=='cancelled'){ if(confirm('Cancel this booking?')){ bk.status='cancelled'; saveBookingsForEmail(email); renderAccountBookings();
      // update Firestore status if mirrored
      try{ const db=getDB(); const { doc, updateDoc } = getUtils(); if(db && bk.fireId){ updateDoc(doc(db,'bookings',bk.fireId), { status:'cancelled' }); } }catch(err){ console.warn('Failed to update Firestore on cancel:', err.message); }
      alert('Booking cancelled.'); } } return; }
  const extendBtn=e.target.closest('[data-bk-extend]');
    if(extendBtn){ const email=getSessionEmail(); if(!email) return; loadBookingsForEmail(email); const id=extendBtn.dataset.bkExtend; const bk=MY_BOOKINGS.find(b=>b.id===id); if(!bk || bk.status!=='active') return; const modal=document.getElementById('extendModal'); const extCurr=document.getElementById('extendCurrent'); const extWeeks=document.getElementById('extendWeeks'); const extPrev=document.getElementById('extendPreview'); const curr=bk.returnDate||bk.pickupDate; modal.style.display='block'; extCurr.textContent=curr; function updatePreview(){ const w=parseInt(extWeeks.value,10)||1; const d=new Date(curr); d.setDate(d.getDate()+7*w); extPrev.textContent=d.toISOString().slice(0,10); } updatePreview(); extWeeks.onchange=updatePreview; const onSave=()=>{ const w=parseInt(extWeeks.value,10)||1; const d=new Date(curr); d.setDate(d.getDate()+7*w); bk.returnDate=d.toISOString().slice(0,10); saveBookingsForEmail(email); renderAccountBookings(); modal.style.display='none'; cleanup();
      // Firestore update on extend
      try{ const db=getDB(); const { doc, updateDoc } = getUtils(); if(db && bk.fireId){ updateDoc(doc(db,'bookings',bk.fireId), { returnDate: bk.returnDate, status: 'extended' }); } }catch(err){ console.warn('Failed to update Firestore booking on extend:', err.message); }
      alert('Booking extended.'); }; const onCancel=()=>{ modal.style.display='none'; cleanup(); }; function cleanup(){ document.getElementById('extendSave').removeEventListener('click',onSave); document.getElementById('extendCancel').removeEventListener('click',onCancel); } document.getElementById('extendSave').addEventListener('click',onSave); document.getElementById('extendCancel').addEventListener('click',onCancel); return; }
});

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
          dobTs: new Date(dob),
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

    // Load inbox messages
    const inboxSnap = await getDocs(collection(db, 'messages'));
    INBOX.length = 0;
    inboxSnap.forEach(docSnap => { INBOX.push({ id: docSnap.id, ...docSnap.data() }); });
    // Sort newest first by timestamp
    INBOX.sort((a,b)=> (b.ts||0) - (a.ts||0));

    // Load members
    const membersSnap = await getDocs(collection(db, 'users'));
    MEMBERS.length = 0;
    membersSnap.forEach(docSnap => { MEMBERS.push({ id: docSnap.id, ...docSnap.data() }); });
  } catch(err){
    console.warn('Firestore load failed:', err.message);
  }
}

// ===== Realtime Subscriptions =====
let _vehUnsub=null, _aboutUnsub=null, _adminBookingsUnsub=null, _inboxUnsub=null, _membersUnsub=null, _currentUserUnsub=null;

function setupRealtimeForRole(){
  const db=getDB(); const utils=getUtils(); if(!db || !utils.onSnapshot) return;
  // Public (vehicles + about) always
  if(!_aboutUnsub){ try{ _aboutUnsub = utils.onSnapshot(utils.doc(db,'site_content','about'), snap=>{ if(snap.exists()){ ABOUT_CONTENT = snap.data(); renderAbout(); } }); }catch(e){ console.warn('About realtime failed', e.message); } }
  if(!_vehUnsub){ try{ _vehUnsub = utils.onSnapshot(utils.collection(db,'vehicles'), snap=>{ 
    VEHICLES.length=0; 
    snap.forEach(d=> VEHICLES.push({ id:d.id, ...d.data() })); 
    // If Firestore has vehicles, use them; otherwise keep defaults
    if(VEHICLES.length === 0){ 
      DEFAULT_VEHICLES.forEach(v=>VEHICLES.push({ ...v })); 
    }
    renderVehicles(); 
    seedBooking(); 
    const isOwner = getSessionEmail()===OWNER_EMAIL; 
    if(isOwner){ renderAdminVehicles(); } 
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
      }); }catch(e){ console.warn('Current user realtime failed', e.message); } }

  const isOwner = getSessionEmail()===OWNER_EMAIL;
  if(isOwner){
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
  const { doc, setDoc } = getUtils();
  if(!db || !vehicle) return;
  
  // Debug: check auth state
  const auth = getAuthInstance();
  console.log('Current user:', auth?.currentUser?.email);
  console.log('Saving vehicle:', vehicle.id);
  
  try {
    await setDoc(doc(db, 'vehicles', vehicle.id), {
      name: vehicle.name,
      type: vehicle.type,
      seats: vehicle.seats,
      price: vehicle.price,
      imgs: vehicle.imgs || [],
      available: vehicle.available !== false,
      details: vehicle.details || ''
    });
    console.log('Vehicle saved successfully:', vehicle.id);
  } catch(err){
    console.error('Failed to save vehicle:', err);
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
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
    const name = `${u.first||''} ${u.last||''}`.trim() || '(no name)';
    const since = u.createdTs ? new Date(u.createdTs).toLocaleDateString() : '';
    card.innerHTML = `<div class='body'>
      <div style='display:flex;gap:8px;align-items:center'>
        <div style='font-weight:700'>${name}</div>
        <span class='muted' style='margin-left:auto;font-size:12px'>${u.email||''}</span>
      </div>
      <div class='muted' style='font-size:12px;margin-top:4px'>Member since ${since} • ${status}</div>
      <div style='display:flex;gap:8px;margin-top:8px;flex-wrap:wrap'>
        <button class='navbtn' data-member-view='${u.id}'>View</button>
        <button class='navbtn' data-member-ban='${u.id}'>${banned?'Unban':'Ban'}</button>
        <button class='navbtn' data-member-delete='${u.id}' style='background:#c1121f;border-color:#c1121f'>Delete</button>
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
        <span class='muted' style='margin-left:auto'>$${v.price}/week</span>${statusBadge}
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
  if(mv){ const u=MEMBERS.find(x=>x.id===mv.dataset.memberView); if(u){ const d = document.getElementById('memberDetails'); const lines = [
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
    ]; d.textContent = lines.join('\n'); const img=document.getElementById('memberPhoto'); if(img){ img.src = u.licensePhotoUrl || ''; } document.getElementById('memberModal').style.display='block'; } return; }
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
  
  // Upload to Firebase Storage instead of base64
  const storage = getStorage();
  const { storageRef, uploadBytes, getDownloadURL } = getStorageUtils();
  
  if(!storage){
    alert('Storage not configured');
    return;
  }
  
  try {
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `vehicle_images/${_editingId}_${timestamp}_${safeFileName}`;
    const ref = storageRef(storage, path);
    
    // Show uploading message
    const v = VEHICLES.find(x=>x.id===_editingId);
    if(!v) return;
    
    alert('Uploading image...');
    
    await uploadBytes(ref, file);
    const url = await getDownloadURL(ref);
    
    // Add URL to vehicle images
    v.imgs = v.imgs || [];
    v.imgs.push(url);
    
    openEditor(_editingId);
    alert('Image uploaded successfully!');
  } catch(err) {
    console.error('Image upload failed:', err);
    alert('Failed to upload image: ' + err.message);
  }
});

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
      console.log('Loaded member:', d.id, data.email);
      MEMBERS.push({ id:d.id, ...data });
    });
    console.log('Total members loaded:', MEMBERS.length);
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
    const card=document.createElement('article'); card.className='card';
    card.innerHTML = `<div class='body'>
      <div style='display:flex;gap:8px;align-items:center'>
        <div style='font-weight:700'>${name}</div>
        <span class='muted' style='margin-left:auto;font-size:12px'>${ts}</span>
      </div>
      <div class='muted' style='font-size:12px;margin-top:4px'>${b.userEmail||''}</div>
      <div class='muted' style='font-size:12px;margin-top:4px'>${dates}</div>
      <div style='white-space:pre-wrap;font-size:12px;color:var(--muted);margin-top:6px'>${
        [`Name: ${(cust.first||'')+' '+(cust.last||'')}`,
         `Address: ${cust.address||''}`,
         `License #: ${cust.licenseNumber||''}`,
         `Country: ${cust.country||cust.licenseCountry||''}`
        ].join('\n')}
      </div>
      ${status==='rented'?`<div class='muted' style='margin-top:4px;font-size:12px'>Rented at ${b.rentedAt? new Date(b.rentedAt).toLocaleString():''}</div>`:''}
      ${status==='rented'?`<div style='margin-top:4px;font-size:12px'><strong>Time until payment/return:</strong> <span class='countdown' data-return='${b.returnDate||''}' data-rented='${b.rentedAt||''}'>—</span></div>`:''}
      ${status==='rented'?`<div style='margin-top:8px;padding:8px;background:rgba(255,193,7,.1);border-left:3px solid #ffc107;font-size:11px;line-height:1.4'><strong>⚠️ Important:</strong> If the customer is extending, they must pay before the timer expires. If returning, the vehicle must be returned before the timer expires or a late fee of <strong>$5/hour</strong> will be added.</div>`:''}
      <div style='display:flex;gap:8px;margin-top:8px;flex-wrap:wrap'>
        <span class='badge' style='background:rgba(255,255,255,.08)'>${status}</span>
        <button class='navbtn' data-bk-accept='${b.id}'>Accept</button>
        <button class='navbtn' data-bk-reject='${b.id}'>Reject</button>
        <button class='navbtn' data-bk-rented='${b.id}'>Mark Rented</button>
        <button class='navbtn' data-bk-delete='${b.id}' style='background:#c1121f;border-color:#c1121f'>Delete</button>
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
document.addEventListener('click',(e)=>{
  const acc = e.target.closest('[data-bk-accept]');
  if(acc){
    const id=acc.dataset.bkAccept;
    const adminBk = ADMIN_BOOKINGS.find(b=>b.id===id);
    updateAdminBookingStatus(id,'accepted').then(async ()=>{
      loadAdminBookings().then(renderAdminBookings);
      showToast('Booking accepted');
      // Force customer view update if they're viewing their bookings
      if(adminBk && adminBk.userEmail){
        const customerEmail = adminBk.userEmail;
        const currentEmail = getSessionEmail();
        if(currentEmail === customerEmail){
          loadBookingsForEmail(customerEmail);
          const local = MY_BOOKINGS.find(b=> b.fireId===id || (!b.fireId && b.vehicleId===adminBk.vehicleId && b.pickupDate===adminBk.pickupDate));
          if(local){ 
            local.status='accepted';
            local.fireId = id;
            saveBookingsForEmail(customerEmail);
            renderAccountBookings();
          }
        }
      }
    });
    return;
  }
  const rej = e.target.closest('[data-bk-reject]');
  if(rej){ const id=rej.dataset.bkReject; updateAdminBookingStatus(id,'rejected').then(()=>{ loadAdminBookings().then(renderAdminBookings); showToast('Booking rejected'); }); return; }
  const rent = e.target.closest('[data-bk-rented]');
  if(rent){
    const id=rent.dataset.bkRented;
    const adminBk = ADMIN_BOOKINGS.find(b=>b.id===id);
    const now=Date.now();
    updateAdminBookingStatus(id,'rented').then(()=>{
      loadAdminBookings().then(renderAdminBookings);
      showToast('Marked rented at '+ new Date(now).toLocaleString());
      // Force customer view update if they're viewing their bookings
      if(adminBk && adminBk.userEmail){
        const customerEmail = adminBk.userEmail;
        const currentEmail = getSessionEmail();
        if(currentEmail === customerEmail){
          loadBookingsForEmail(customerEmail);
          const local = MY_BOOKINGS.find(b=> b.fireId===id || (!b.fireId && b.vehicleId===adminBk.vehicleId && b.pickupDate===adminBk.pickupDate));
          if(local){
            local.status='rented';
            local.rentedAt=now;
            local.fireId = id;
            saveBookingsForEmail(customerEmail);
            renderAccountBookings();
          }
        }
      }
    });
    return;
  }
  const del = e.target.closest('[data-bk-delete]');
  if(del){ const id=del.dataset.bkDelete; if(confirm('Delete this booking?')){ deleteAdminBooking(id).then(()=>{ loadAdminBookings().then(renderAdminBookings); showToast('Booking deleted'); }); } return; }
});
