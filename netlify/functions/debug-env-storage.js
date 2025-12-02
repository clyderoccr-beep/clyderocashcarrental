exports.handler = async () => {
  const vars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY_BASE64',
    'FIREBASE_STORAGE_BUCKET',
    'STORAGE_CORS_SECRET',
    'STORAGE_ALLOWED_ORIGINS'
  ];
  const report = {};
  for(const v of vars){
    const val = process.env[v];
    report[v] = {
      present: !!val,
      length: val ? val.length : 0,
      // do NOT expose actual secret/key contents
      sample: val ? (val.slice(0,8)+ (val.length>16?'…':'')) : ''
    };
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' },
    body: JSON.stringify({ ok:true, env: report })
  };
};
