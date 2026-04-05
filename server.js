const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.MAXCLAW_API_KEY || process.env.MINIMAX_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

app.post('/api/generate', async (req, res) => {
  const { text, refImage } = req.body;
  if (!text) return res.status(400).json({ error: '请输入文字内容' });
  if (!API_KEY) return res.status(500).json({ error: 'API Key 未配置' });

  const timestamp = Date.now();
  const outputFile = path.join(publicDir, 'output_' + timestamp + '.png');

  try {
    await generateWhiteboardImage(text, outputFile, refImage);
    res.json({ success: true, imageUrl: '/output_' + timestamp + '.png', text });
  } catch (error) {
    res.status(500).json({ error: 'API错误: ' + error.message });
  }
});

function generateWhiteboardImage(text, outputPath, refImage) {
  return new Promise(function(resolve, reject) {
    var promptText = 'Whiteboard hand-drawn illustration. Clean white background, hand-drawn with colored markers, sketch style, professional business chart with bar charts, pie charts and text labels. Include arrows, flow charts and data boxes. Colorful marker drawings, educational diagram style. Content: ' + text;

    var requestBody = {
      model: 'image-01',
      prompt: promptText,
      aspect_ratio: '16:9',
      response_format: 'base64'
    };

    if (refImage) {
      requestBody.reference_image = refImage;
    }

    var body = JSON.stringify(requestBody);

    var req = https.request({
      hostname: 'api.minimaxi.com',
      path: '/v1/image_generation',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      timeout: 90000
    }, function(resp) {
      var data = '';
      resp.on('data', function(chunk) { data += chunk; });
      resp.on('end', function() {
        try {
          var result = JSON.parse(data);
          if (result.base_resp && result.base_resp.status_code === 0) {
            var base64Str = result.data.image_base64;
            if (Array.isArray(base64Str)) base64Str = base64Str[0];
            var buffer = Buffer.from(base64Str, 'base64');
            fs.writeFileSync(outputPath, buffer);
            resolve(outputPath);
          } else {
            reject(new Error(result.base_resp ? result.base_resp.status_msg : (result.msg || 'API错误')));
          }
        } catch (e) {
          reject(new Error('解析失败: ' + e.message));
        }
      });
    });

    req.on('timeout', function() { req.destroy(); reject(new Error('请求超时')); });
    req.on('error', function(e) { reject(new Error('请求失败: ' + e.message)); });
    req.write(body);
    req.end();
  });
}

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok' });
});

app.get('*', function(req, res) {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', function() {
  console.log('白板生成器已启动，端口:' + PORT);
});