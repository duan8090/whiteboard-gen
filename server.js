const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;

// MiniMax API Key
const API_KEY = process.env.MAXCLAW_API_KEY || 'ab0123456789xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 静态文件（前端）— 放最后，兜底所有未匹配的路由
const publicDir = path.join(__dirname, 'public');

// AI 图像生成接口（放在 static 之前，避免被拦截）
app.post('/api/generate', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: '请输入文字内容' });
  }

  const timestamp = Date.now();
  const outputFile = path.join(publicDir, `output_${timestamp}.png`);

  try {
    await generateWhiteboardImage(text, outputFile);
    res.json({
      success: true,
      imageUrl: `/output_${timestamp}.png`,
      text
    });
  } catch (error) {
    console.error('生成失败:', error.message);
    res.status(500).json({ error: '生成失败: ' + error.message });
  }
});

// 生成白板风格图片
function generateWhiteboardImage(text, outputPath) {
  return new Promise((resolve, reject) => {
    const prompt = `Whiteboard hand-drawn illustration. Clean white background with colorful marker drawings, hand-drawn text, educational diagram style. Content: ${text}`;

    const body = JSON.stringify({
      model: 'image-01',
      prompt: prompt,
      aspect_ratio: '16:9',
      resolution: '2K'
    });

    const options = {
      hostname: 'api.minimaxi.com',
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    };

    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.code === 0 && result.data && result.data.images && result.data.images[0]) {
            downloadImage(result.data.images[0].url, outputPath).then(resolve).catch(reject);
          } else {
            reject(new Error(result.msg || 'API错误: ' + JSON.stringify(result).substring(0, 150)));
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

// 下载图片
function downloadImage(url, outputPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(outputPath);
        downloadImage(res.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on('close', () => resolve(outputPath));
      file.on('error', reject);
    }).on('error', (e) => {
      try { fs.unlinkSync(outputPath); } catch (_) {}
      reject(e);
    });
  });
}

// 静态文件（放最后，兜底未匹配的路由）
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

// API 健康检查（GET，在 catch-all 之前）
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'whiteboard-gen' });
});

// 兜底：未匹配的路径返回 index.html（支持 SPA）
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('🖌️  白板绘图生成器已启动');
  console.log(`🌐 访问地址: http://localhost:${PORT}`);
});
