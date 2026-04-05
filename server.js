const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.MAXCLAW_API_KEY || process.env.MINIMAX_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

app.post('/api/generate', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '请输入文字内容' });
  if (!API_KEY) return res.status(500).json({ error: 'API Key 未配置' });

  const timestamp = Date.now();
  const outputFile = path.join(publicDir, `output_${timestamp}.png`);

  try {
    await generateWhiteboardImage(text, outputFile);
    res.json({ success: true, imageUrl: `/output_${timestamp}.png`, text });
  } catch (error) {
    console.error('生成失败:', error.message);
    res.status(500).json({ error: '生成失败: ' + error.message });
  }
});

function generateWhiteboardImage(text, outputPath) {
  return new Promise((resolve, reject) => {
    const prompt = `Whiteboard hand-drawn illustration. Clean white background with colorful marker drawings, educational diagram style. Content: ${text}`;
    const body = JSON.stringify({
      model: 'image-01',
      prompt: prompt,
      aspect_ratio: '16:9',
      response_format: 'base64'
    });

    const options = {
      hostname: 'api.minimaxi.com',
      path: '/v1/image_generation',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` }
    };

    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.code === 0 && result.data && result.data.image_base64) {
            const buffer = Buffer.from(result.data.image_base64, 'base64');
            fs.writeFileSync(outputPath, buffer);
            resolve(outputPath);
          } else {
            reject(new Error(result.msg || 'API错误'));
          }
        } catch (e) {
          reject(new Error('解析失败: ' + e.message));
        }
      });
    });

    req.on('error', (e) => reject(new Error('请求失败: ' + e.message)));
    req.write(body);
    req.end();
  });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'whiteboard-gen' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('🖌️  白板绘图生成器已启动');
});