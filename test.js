const https = require('https');

const API_KEY = 'sk-api-Ku92U_cN7kxHw4WNTEe2oO_K8AlvwS1dbZyd8znB6mSjFXpUqTYs_BubExuxFAi8-uK89cSlFKr4fLdmCldrqS3UGHfU9-7wYQaPnF7guIwaMlro4YFgaB8';

const body = JSON.stringify({
  model: 'image-01',
  prompt: 'a cat',
  aspect_ratio: '1:1',
  response_format: 'base64'
});

const options = {
  hostname: 'api.minimaxi.com',
  path: '/v1/image_generation',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('状态:', res.statusCode);
    console.log('响应:', data.substring(0, 300));
  });
});
req.on('error', e => console.error('错误:', e.message));
req.write(body);
req.end();