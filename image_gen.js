// MiniMax 图片生成接口
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.MAXCLAW_API_KEY || 'your-api-key';
const API_URL = 'api.minimaxi.com';

function generateImage(text, styleImagePath, outputPath) {
  return new Promise((resolve, reject) => {
    const prompt = `Whiteboard hand-drawn style illustration for: ${text}, clean whiteboard background, marker drawing style, educational diagram`;

    const body = JSON.stringify({
      model: 'image-01',
      prompt: prompt,
      aspect_ratio: '16:9',
      resolution: '2K'
    });

    const options = {
      hostname: API_URL,
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.code === 0 && result.data && result.data.images) {
            // 下载图片
            const imageUrl = result.data.images[0].url;
            downloadImage(imageUrl, outputPath).then(resolve).catch(reject);
          } else {
            reject(new Error(result.msg || 'API错误'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function downloadImage(url, outputPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const stream = fs.createWriteStream(outputPath);
      res.pipe(stream);
      stream.on('close', () => resolve(outputPath));
      stream.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = { generateImage };
