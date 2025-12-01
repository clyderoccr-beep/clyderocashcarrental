const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  try{
    if(event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const body = JSON.parse(event.body||'{}');
    const {
      to = 'clyderoccr@gmail.com',
      type = 'event',
      provider = '',
      bookingId = '',
      userEmail = '',
      amountCents = 0,
      lateFeeCents = 0,
      sessionId = '',
      details = {}
    } = body;

    const appName = process.env.APP_NAME || 'Clydero Cash Car Rental';
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    if(!smtpUser || !smtpPass){ return { statusCode: 500, body: 'SMTP credentials missing' }; }

    const transporter = nodemailer.createTransport({ service:'gmail', auth:{ user:smtpUser, pass:smtpPass } });

    const lines = [];
    lines.push(`App: ${appName}`);
    lines.push(`Event: ${type}`);
    if(provider) lines.push(`Provider: ${provider}`);
    if(bookingId) lines.push(`Booking ID: ${bookingId}`);
    lines.push(`User Email: ${userEmail}`);
    if(amountCents) lines.push(`Amount: $${(amountCents/100).toFixed(2)}`);
    if(lateFeeCents) lines.push(`Late Fee: $${(lateFeeCents/100).toFixed(2)}`);
    if(sessionId) lines.push(`Session/Txn: ${sessionId}`);
    Object.entries(details||{}).forEach(([k,v])=>{ lines.push(`${k}: ${v}`); });

    const text = lines.join('\n');

    const info = await transporter.sendMail({
      from: `${appName} <${smtpUser}>`,
      to,
      subject: `${type.toUpperCase()} Notice${bookingId?` [${bookingId}]`:''}`,
      text
    });
    return { statusCode: 200, body: JSON.stringify({ ok:true, id: info.messageId }) };
  }catch(err){ return { statusCode: 500, body: (err && err.message) || 'Notify failed' }; }
};
