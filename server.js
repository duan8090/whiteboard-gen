const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;

// MiniMax API Key（从环境变量读取）
const API_KEY = process.env.MAXCLAW_API_KEY || process.env.MINIMAX_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

// AI 图像生成接口
app.post('/api/generate', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: '请输入文字内容' });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'API Key 未配置，请在 Render 环境变量中设置 MINIMAX_API_KEY' });
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

// MiniMax 图片生成（正确的 API 端点）
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
      hostname: 'api.minimax.io',
      path: '/v1/image_generation',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    };

    console.log('调用 MiniMax API，模型: image-01');

    const req = https.request(options, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try {
          console.log('MiniMax 响应状态:', resp.statusCode);
          console.log('MiniMax 响应内容前100字符:', data.substring(0, 100));
          const result = JSON.parse(data);

          if (result.code === 0 && result.data && result.data.image_base64) {
            // 响应是 base64 格式，保存为文件
            const base64Data = result.data.image_base64;
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(outputPath, buffer);
            console.log('图片已保存到:', outputPath);
            resolve(outputPath);
          } else {
            reject(new Error(result.msg || 'API错误: ' + JSON.stringify(result).substring(0, 200)));
          }
        } catch (e) {
          reject(new Error('解析失败: ' + e.message + ' | 原始响应: ' + data.substring(0, 100)));
        }
      });
    });

    req.on('error', (e) => reject(new Error('请求失败: ' + e.message)));
    req.write(body);
    req.end();
  });
}

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'whiteboard-gen', apiKeyConfigured: !!API_KEY });
});

// 兜底路由
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('🖌️  白板绘图生成器已启动');
  console.log(`🌐 访问地址: http://localhost:${PORT}`);
  console.log(`🔑 API Key 配置: ${API_KEY ? '已设置' : '未设置'}`);
});
