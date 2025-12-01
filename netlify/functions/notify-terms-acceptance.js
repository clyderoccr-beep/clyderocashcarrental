const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  try{
    if(event.httpMethod !== 'POST'){
      return { statusCode: 405, body: 'Method Not Allowed' };
    }
    const body = JSON.parse(event.body||'{}');
    const {
      to = 'clyderoccr@gmail.com',
      userEmail = '',
      acceptance = {},
      user = {}
    } = body;

    const appName = process.env.APP_NAME || 'Clydero Cash Car Rental';
    const smtpUser = process.env.SMTP_USER; // your gmail address
    const smtpPass = process.env.SMTP_PASS; // app password
    if(!smtpUser || !smtpPass){
      return { statusCode: 500, body: 'SMTP credentials missing' };
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: smtpUser, pass: smtpPass }
    });

    const lines = [];
    lines.push(`App: ${appName}`);
    lines.push(`Event: Terms Acceptance`);
    lines.push(`User Email: ${userEmail}`);
    if(user.firstName || user.lastName) lines.push(`Name: ${(user.firstName||'')} ${(user.lastName||'')}`);
    if(user.address) lines.push(`Address: ${user.address}`);
    if(user.state) lines.push(`State: ${user.state}`);
    if(user.country) lines.push(`Country: ${user.country}`);
    if(user.licenseNumber) lines.push(`License #: ${user.licenseNumber}`);
    if(user.licenseCountry) lines.push(`License Country: ${user.licenseCountry}`);
    if(user.licenseIssueDate) lines.push(`License Issue: ${user.licenseIssueDate}`);
    if(user.licenseExpireDate) lines.push(`License Expire: ${user.licenseExpireDate}`);
    lines.push(`Agreement Version: ${acceptance.version||''}`);
    lines.push(`Accepted At: ${acceptance.ts||''}`);
    lines.push(`IP: ${acceptance.ip||''}`);

    const text = lines.join('\n');

    const info = await transporter.sendMail({
      from: `${appName} <${smtpUser}>`,
      to,
      subject: `Terms Accepted: ${userEmail}`,
      text
    });

    return { statusCode: 200, body: JSON.stringify({ ok:true, id: info.messageId }) };
  }catch(err){
    return { statusCode: 500, body: (err && err.message) || 'Email send failed' };
  }
};
