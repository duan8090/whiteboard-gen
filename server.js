const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.MAXCLAW_API_KEY || process.env.MINIMAX_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

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
  const templates = Object.entries(TEMPLATES).map(([id, t]) => ({ id, name: t.name, bg: t.bg }));
  res.json({ success: true, templates });
});

// MiniMax 图片生成（原有功能）
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

// Gemini 智能解析 + html2canvas 生图（视觉笔记版）
app.post('/api/visual-note', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: '请输入内容' });
  if (!GEMINI_KEY) return res.status(500).json({ error: '请在环境变量中设置 GEMINI_API_KEY' });

  try {
    // 1. 调用 Gemini 提取结构化数据
    const structured = await callGemini(text);
    
    // 2. 生成白板 HTML
    const html = buildWhiteboardHTML(structured);
    
    // 3. 用静态 HTML 返回，让前端用 html2canvas 生成图片
    // （html2canvas 必须运行在浏览器环境，无法在 Node.js 服务端执行）
    // 所以这里返回结构化数据，前端负责渲染和截图
    res.json({ success: true, data: structured });
  } catch (error) {
    res.status(500).json({ error: '生成失败: ' + error.message });
  }
});

// 调用 Gemini API 提取结构化内容
function callGemini(text) {
  return new Promise((resolve, reject) => {
    const prompt = `你是一个专业的视觉笔记排版专家。请分析以下文本，提取出核心内容，并严格按照以下 JSON 格式返回。
要求：
1. 必须是合法的 JSON 格式。
2. 不要包含任何 markdown 代码块标记（如 \`\`\`json ）。
3. title 控制在 10 个字以内。
4. subtitle 控制在 15 个字以内。
5. 提取 3 到 4 个核心要点 (points)。
6. 每个 point 配一个合适的 emoji 作为 icon，text 控制在 15 个字以内。

格式示例：
{
  "title": "主标题",
  "subtitle": "副标题",
  "points": [
    {"icon": "💡", "text": "要点内容1"},
    {"icon": "🚀", "text": "要点内容2"}
  ]
}

待分析文本：
${text}`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    });

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    }, (resp) => {
      let data = '';
      resp.on('data', chunk => data += chunk);
      resp.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.error) reject(new Error(result.error.message));
          const rawText = result.candidates[0].content.parts[0].text
            .replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          resolve(JSON.parse(rawText));
        } catch (e) {
          reject(new Error('解析失败: ' + e.message));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('API 超时')); });
    req.on('error', e => reject(new Error('请求失败: ' + e.message)));
    req.write(body);
    req.end();
  });
}

// 生成白板 HTML（供前端 html2canvas 截图用）
function buildWhiteboardHTML(data) {
  return `
<div style="width:960px;height:540px;background:#fff;background-image:radial-gradient(#d1d5db 1px,transparent 1.5px);background-size:25px 25px;border:10px solid #273746;border-radius:20px;padding:50px;box-sizing:border-box;display:grid;grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr 1fr;gap:20px;font-family:'Zhi Mang Xing',cursive,Noto Sans SC">
  <div style="grid-column:1;grid-row:1;display:flex;flex-direction:column">
    <div style="font-size:52px;margin-bottom:4px">${data.title || '标题'}</div>
    <div style="font-size:26px;color:#00B16A;border-bottom:3px dashed #00B16A;display:inline">${data.subtitle || '副标题'}</div>
  </div>
  <div style="grid-column:2;grid-row:1/3;display:flex;align-items:center;justify-content:center">
    <div style="text-align:center">
      <div style="font-size:80px">🛡️</div>
    </div>
  </div>
  <div style="grid-column:3;grid-row:1;display:flex;flex-direction:column;align-items:flex-end;justify-content:center">
    <div style="font-size:22px;border:2.5px solid #333;border-radius:10px;padding:10px 14px">📋 法务合规 <span style="color:#00B16A;font-size:28px">✅</span></div>
  </div>
  <div style="grid-column:3;grid-row:2;display:flex;align-items:center">
    <div style="width:100%;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:12px;padding:14px 16px;color:white;text-align:center">
      <div style="font-size:13px;opacity:0.85">📊 调研数据</div>
      <div style="font-weight:bold;font-size:20px">—</div>
    </div>
  </div>
  <div style="grid-column:1;grid-row:2/4;display:flex;flex-direction:column;justify-content:center">
    ${(data.points || []).map(p => `<div style="display:flex;align-items:center;margin-bottom:14px"><span style="font-size:34px;margin-right:10px">${p.icon || '📌'}</span><span style="font-size:24px">${p.text}</span></div>`).join('')}
  </div>
  <div style="grid-column:2;grid-row:3;display:flex;align-items:center;justify-content:space-between;position:relative">
    <div style="position:absolute;top:18px;left:30px;right:30px;height:3px;background:#ddd;z-index:0"></div>
    ${['🗓️','🚀','🎯'].map((icon,i) => `<div style="display:flex;flex-direction:column;align-items:center;position:relative;z-index:1"><span style="font-size:22px;margin-bottom:4px">${icon}</span><span style="font-size:13px;color:#666">—</span><span style="font-size:15px;text-align:center">—</span></div>`).join('')}
  </div>
  <div style="grid-column:3;grid-row:3;display:flex;align-items:flex-end;justify-content:center">
    <div style="width:100%;background:#fff;border:3.5px solid #111;border-radius:16px 16px 4px 4px;padding:12px 16px;box-shadow:4px 4px 0 #111">
      <div style="font-size:13px;color:#00B16A;font-weight:bold;margin-bottom:4px">💡 总结</div>
      <div style="font-size:22px">—</div>
    </div>
  </div>
</div>`;
}

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
  res.json({ status: 'ok', minimaxConfigured: !!API_KEY, geminiConfigured: !!GEMINI_KEY });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// MiniMax AI 生成核心
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
  console.log('白板生成器已启动，端口:', PORT);
  console.log('模板数量:', Object.keys(TEMPLATES).length);
  console.log('MiniMax API:', !!API_KEY ? '已配置' : '未配置');
  console.log('Gemini API:', !!GEMINI_KEY ? '已配置' : '未配置');
});
