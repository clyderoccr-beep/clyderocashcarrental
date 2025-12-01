const crypto = require('crypto');

exports.handler = async (event) => {
  try{
    if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const body = JSON.parse(event.body||'{}');
    const {
      bookingId = '',
      eventType = 'unknown',
      userEmail = '',
      weeks = 0,
      rateCents = 0,
      extensionWeeks = 0,
      returnDateISO = '',
      lateFeeCents = 0,
      paymentProvider = '',
      paymentSessionId = '',
      agreementVersion = '',
      snapshot = {}
    } = body;

    if(!bookingId || !eventType || !userEmail){
      return { statusCode: 400, body: 'Missing required fields: bookingId, eventType, userEmail' };
    }

    const admin = require('firebase-admin');
    if(!admin.apps.length){ admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID }); }
    const db = admin.firestore();

    const tsISO = new Date().toISOString();
    
    // Create canonical JSON for hashing (sorted keys)
    const canonicalData = {
      agreementVersion,
      bookingId,
      eventType,
      extensionWeeks,
      lateFeeCents,
      paymentProvider,
      paymentSessionId,
      rateCents,
      returnDateISO,
      snapshot,
      tsISO,
      userEmail,
      weeks
    };
    const canonicalStr = JSON.stringify(canonicalData, Object.keys(canonicalData).sort());
    const hash = crypto.createHash('sha256').update(canonicalStr, 'utf8').digest('hex');

    // Write to booking_audit collection
    const auditRef = await db.collection('booking_audit').add({
      bookingId,
      eventType,
      tsISO,
      userEmail,
      weeks,
      rateCents,
      extensionWeeks,
      returnDateISO,
      lateFeeCents,
      paymentProvider,
      paymentSessionId,
      agreementVersion,
      snapshot,
      hash
    });

    console.log('Audit event recorded:', auditRef.id, eventType, bookingId);

    // Send owner notification email
    try{
      const lines = [];
      lines.push(`Event: ${eventType}`);
      lines.push(`Booking ID: ${bookingId}`);
      lines.push(`User Email: ${userEmail}`);
      if(weeks) lines.push(`Rental Weeks: ${weeks}`);
      if(extensionWeeks) lines.push(`Extension Weeks: ${extensionWeeks}`);
      if(rateCents) lines.push(`Rate: $${(rateCents/100).toFixed(2)}`);
      if(returnDateISO) lines.push(`Return Date: ${returnDateISO}`);
      if(lateFeeCents) lines.push(`Late Fee: $${(lateFeeCents/100).toFixed(2)}`);
      if(paymentProvider) lines.push(`Payment Provider: ${paymentProvider}`);
      if(paymentSessionId) lines.push(`Payment Session: ${paymentSessionId}`);
      if(agreementVersion) lines.push(`Agreement Version: ${agreementVersion}`);
      lines.push(`Timestamp: ${tsISO}`);
      lines.push(`Audit Hash: ${hash}`);
      lines.push(`Audit ID: ${auditRef.id}`);

      const details = {};
      Object.entries(snapshot||{}).forEach(([k,v])=>{
        if(typeof v === 'object') details[k] = JSON.stringify(v);
        else details[k] = String(v);
      });

      await fetch(process.env.URL ? `${process.env.URL}/.netlify/functions/notify-event` : '/.netlify/functions/notify-event', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          to: 'clyderoccr@gmail.com',
          type: `booking_${eventType}`,
          bookingId,
          userEmail,
          amountCents: rateCents,
          lateFeeCents,
          sessionId: paymentSessionId || auditRef.id,
          details: { ...details, auditHash: hash, auditId: auditRef.id }
        })
      });
    }catch(e){ console.warn('Owner notify failed for audit', e.message); }

    return { statusCode: 200, body: JSON.stringify({ ok: true, auditId: auditRef.id, hash }) };
  }catch(err){
    console.error('Audit event error:', err);
    return { statusCode: 500, body: (err && err.message) || 'Audit failed' };
  }
};
