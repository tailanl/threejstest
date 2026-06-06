// ===== AI 军事兵棋图标生成器 (纯Node.js, 零依赖) =====
// 使用 Pollinations.ai 免费API生成高质量单位图标

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'nato-symbols');

const UNITS = {
  tank:       { zh:'主战坦克',   en:'Main Battle Tank',    base:'military tank top-down view, tank silhouette with turret and long gun barrel, tracked vehicle' },
  ifv:        { zh:'步兵战车',   en:'IFV',                 base:'infantry fighting vehicle silhouette, small turret with autocannon, compact tracked vehicle top view' },
  artillery:  { zh:'自行火炮',   en:'Howitzer',             base:'self-propelled howitzer artillery, large cannon barrel at high elevation angle, military vehicle' },
  scout:      { zh:'侦察车',     en:'Scout Vehicle',        base:'light reconnaissance vehicle, tall antenna mast with sensor dome, fast armored car' },
  infantry:   { zh:'步兵',       en:'Infantry',             base:'soldier figure silhouette wearing helmet and holding rifle, standing pose, human shape' },
  sam:        { zh:'防空导弹',   en:'SAM System',           base:'surface to air missile system, rotating radar dish, missile launch container box' },
  engineer:   { zh:'工程车',     en:'Engineer Vehicle',     base:'combat engineer vehicle with crane arm extended upward, bulldozer blade front' },
  supply:     { zh:'补给卡车',   en:'Supply Truck',         base:'military cargo truck with large box body, medical cross symbol on side' },
  helicopter: { zh:'直升机',     en:'Helicopter',           base:'attack helicopter from above, oval fuselage, long main rotor blades, tail boom' },
  mlrs:       { zh:'火箭炮',     en:'MLRS',                 base:'multiple launch rocket system, rectangular rocket pod launcher with many tube openings' },
  atgm:       { zh:'反坦克导弹', en:'ATGM',                 base:'anti-tank missile vehicle, angled missile launcher tube on tripod mount' },
  uav:        { zh:'无人机',     en:'UAV Drone',            end:'military UAV drone from above, fixed wings spread wide, slim fuselage' },
  command:    { zh:'指挥车',     en:'Command Post',         base:'military command vehicle with tall communications antenna array, satellite dish' },
  ew:         { zh:'电子战车',   en:'EW Jammer',            end:'electronic warfare vehicle with large parabolic radar dish antenna, signal waves' },
};

const FACTIONS = {
  red:  { colorName: 'crimson red', hex: 'c62828' },
  blue: { colorName: 'royal blue',  hex: '1565c0' },
};

const SIZE = 512;

function buildPrompt(unit, faction, isHero) {
  const fc = FACTIONS[faction];
  let p = `Professional wargame military counter token icon. ${unit.base}. `;
  p += `White stencil silhouette of the ${unit.en} on solid ${fc.colorName} rounded square background. `;
  p += `Clean flat vector graphic design, minimal style, crisp edges. `;
  p += `The white weapon/vehicle silhouette is very large filling 85%% of the frame, centered. `;
  p += `No text no letters no numbers no words. Pure icon only. High contrast. Square format. Isolated.`;
  if (isHero) p += ` Golden decorative border around the edge with a small gold star at top center.`;
  return p;
}

function download(url, filepath) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, filepath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('\n🎨 AI 军事兵棋图标生成器 (Pollinations.ai)\n');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const types = Object.keys(UNITS);
  let ok = 0, fail = 0;

  for (const type of types) {
    const unit = UNITS[type];
    for (const fk of ['red', 'blue']) {
      for (const hero of [false, true]) {
        const tag = hero ? '_hero' : '';
        const fn = `${type}_${fk}${tag}.png`;
        const fp = path.join(OUTPUT_DIR, fn);

        if (fs.existsSync(fp) && fs.statSync(fp).size > 5000) {
          console.log(`  ⏭️  ${fn} 已存在`);
          ok++;
          continue;
        }

        const prompt = buildPrompt(unit, fk, hero);
        const encoded = encodeURIComponent(prompt)
          .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/,/g, '%2C');
        const url = `https://image.pollinations.ai/prompt/${encoded}?width=${SIZE}&height=${SIZE}&nologo=true&seed=${type.charCodeAt(0)*100 + (fk==='red'?1:2) + (hero?50:0)}`;

        process.stdout.write(`  🖼️  ${fn} (${unit.zh}) ...`);

        try {
          await download(url, fp);
          const sz = fs.statSync(fp);
          if (sz.size < 5000) { fs.unlinkSync(fp); throw new Error('too small: ' + sz.size); }
          console.log(` ✅ ${(sz.size/1024).toFixed(0)}KB`);
          ok++;
        } catch(e) {
          console.log(` ❌ ${e.message}`);
          // 重试
          process.stdout.write(`  🔄 重试 ...`);
          try {
            await sleep(3000);
            await download(url, fp);
            const sz = fs.statSync(fp);
            if (sz.size < 5000) { fs.unlinkSync(fp); throw new Error(); }
            console.log(` ✅ ${(sz.size/1024).toFixed(0)}KB`);
            ok++; fail--;
          } catch(e2) { console.log(` ❌`); fail++; }
        }
        await sleep(1000);
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 成功: ${ok}  |  ❌ 失败: ${fail}  |  共: ${ok+fail}`);
  console.log(`📂 → ${path.resolve(OUTPUT_DIR)}\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
