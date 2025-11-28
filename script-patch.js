// Real-time sync for customer bookings
let MY_BOOKINGS_UNSUB = null;
function startMyBookingsRealtime(){
  const email = getSessionEmail();
  const db = getDB();
  const { collection, query, where, onSnapshot } = getUtils() || {};
  if(!email || !db || !onSnapshot || !query || !where) return;
  if(MY_BOOKINGS_UNSUB) return; // already subscribed
  
  const q = query(collection(db,'bookings'), where('userEmail','==',email));
  MY_BOOKINGS_UNSUB = onSnapshot(q, (snap)=>{
    loadBookingsForEmail(email);
    const fireBookings = [];
    snap.forEach(d=> fireBookings.push({ id:d.id, ...d.data() }));
    
    // Merge Firestore data with local bookings
    fireBookings.forEach(fb=>{
      let local = MY_BOOKINGS.find(b=> b.fireId===fb.id);
      if(!local){
        // Try to match by vehicle/dates
        local = MY_BOOKINGS.find(b=> !b.fireId && b.vehicleId===fb.vehicleId && b.pickupDate===fb.pickupDate && b.returnDate===fb.returnDate);
      }
      if(local){
        local.fireId = fb.id;
        local.status = fb.status || local.status;
        local.rentedAt = fb.rentedAt || local.rentedAt;
        local.returnDate = fb.returnDate || local.returnDate;
      }
    });
    
    saveBookingsForEmail(email);
    // Re-render if on My Account page
    const accountPanel = document.getElementById('accountBookings');
    if(accountPanel && accountPanel.offsetParent !== null){
      renderAccountBookings();
    }
  });
}

function stopMyBookingsRealtime(){
  if(MY_BOOKINGS_UNSUB){
    try{ MY_BOOKINGS_UNSUB(); }catch{}
    MY_BOOKINGS_UNSUB = null;
  }
}
