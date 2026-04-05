const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.MAXCLAW_API_KEY || process.env.MINIMAX_API_KEY || '';

// 5种模板配置
const TEMPLATES = {
  classic: {
    name: '📋 经典白板',
    prompt: 'Whiteboard hand-drawn illustration. Clean white background, hand-drawn with colored markers, sketch style, professional business chart with bar charts, pie charts and text labels. Include arrows, flow charts and data boxes. Colorful marker drawings, educational diagram style.',
    bg: '#ffffff'
  },
  dark: {
    name: '🌙 深色黑板',
    prompt: 'Dark chalkboard hand-drawn illustration. Dark green or black background like a classroom chalkboard, white and colored chalk drawings, sketch style, educational diagram, hand-drawn text and charts. Chalk dust texture effect.',
    bg: '#1a2e1a'
  },
  sticky: {
    name: '📝 便利贴风格',
    prompt: 'Sticky note collage style illustration. Multiple colorful sticky notes (yellow, pink, blue, green) pinned or taped on a surface. Hand-drawn style, doodles, mind maps, notes, arrows connecting ideas. Casual and creative.',
    bg: '#f5f5f0'
  },
  blueprint: {
    name: '📐 蓝图模式',
    prompt: 'Blueprint technical drawing style. White lines on blue background, grid paper effect, precise geometric diagrams, schematic drawings, architectural style, technical illustration, compass and ruler aesthetic.',
    bg: '#0a1628'
  },
  watercolor: {
    name: '🎨 水彩手绘',
    prompt: 'Hand-drawn watercolor illustration style. Soft watercolor washes, delicate brush strokes, gentle color gradients, artistic sketch style, notebook doodle aesthetic, light and airy feel.',
    bg: '#fefefe'
  }
};

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const publicDir = path.join(__dirname, 'public');

// 获取模板列表
app.get('/api/templates', (req, res) => {
  const templates = Object.entries(TEMPLATES).map(([id, t]) => ({
    id,
    name: t.name,
    bg: t.bg
  }));
  res.json({ success: true, templates });
});

// 生成图片
app.post('/api/generate', async (req, res) => {
  const { text, template, refImage } = req.body;
  if (!text) return res.status(400).json({ error: '请输入文字内容' });
  if (!API_KEY) return res.status(500).json({ error: 'API Key 未配置' });

  const timestamp = Date.now();
  const outputFile = path.join(publicDir, 'output_' + timestamp + '.png');

  try {
    await generateImage(text, template, refImage, outputFile);
    res.json({ success: true, imageUrl: '/output_' + timestamp + '.png?v=' + Date.now() });
  } catch (error) {
    res.status(500).json({ error: 'API错误: ' + error.message });
  }
});

// 图标列表
app.get('/api/icons', (req, res) => {
  const iconsDir = path.join(__dirname, 'public', 'icons');
  let icons = [];
  if (fs.existsSync(iconsDir)) {
    icons = fs.readdirSync(iconsDir).filter(f => f.endsWith('.svg')).map(f => ({
      file: '/icons/' + f,
      name: f.replace('.svg', '')
    }));
  }
  res.json({ success: true, icons });
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', apiConfigured: !!API_KEY });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// AI 生成核心
function generateImage(text, template, refImage, outputPath) {
  return new Promise((resolve, reject) => {
    const tmpl = TEMPLATES[template] || TEMPLATES.classic;
    const promptText = tmpl.prompt + ' Content: ' + text;

    const requestBody = {
      model: 'image-01',
      prompt: promptText,
      aspect_ratio: '16:9',
      response_format: 'base64'
    };
    if (refImage) requestBody.reference_image = refImage;

    const body = JSON.stringify(requestBody);

    const req = https.request({
      hostname: 'api.minimaxi.com',
      path: '/v1/image_generation',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY
      },
      timeout: 90000
    }, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.base_resp && result.base_resp.status_code === 0) {
            let base64Str = result.data.image_base64;
            if (Array.isArray(base64Str)) base64Str = base64Str[0];
            const buffer = Buffer.from(base64Str, 'base64');
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

    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.on('error', e => reject(new Error('请求失败: ' + e.message)));
    req.write(body);
    req.end();
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('白板生成器商业版已启动，端口:', PORT);
  console.log('模板数量:', Object.keys(TEMPLATES).length);
});