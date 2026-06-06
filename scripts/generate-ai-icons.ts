// ===== AI 军事兵棋图标生成器 =====
// 使用 Pollinations.ai (免费, 无需API Key) 生成高质量单位图标
// 风格：兵棋棋子 / NATO军事符号 / 白色镂空武器剪影 + 彩色底座

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'nato-symbols');

type UnitType = 'tank' | 'ifv' | 'artillery' | 'scout' | 'infantry' | 'sam' | 'engineer' | 'supply' | 'helicopter' | 'mlrs' | 'atgm' | 'uav' | 'command' | 'ew';
type Faction = 'red' | 'blue';

interface UnitPrompt {
  nameZh: string;
  nameEn: string;
  promptBase: string;
}

const UNITS: Record<UnitType, UnitPrompt> = {
  tank:       { nameZh:'主战坦克',   nameEn:'Main Battle Tank',    promptBase:'military tank top-down view, tank silhouette, turret and main gun barrel visible, tracked vehicle' },
  ifv:        { nameZh:'步兵战车',   nameEn:'IFV',                 promptBase:'infantry fighting vehicle silhouette, small turret with autocannon, tracked armored vehicle top view' },
  artillery:  { nameZh:'自行火炮',   nameEn:'Self-Propelled Howitzer', promptBase:'artillery howitzer cannon, large barrel elevated at high angle, wheeled or tracked vehicle' },
  scout:      { nameZh:'侦察车',     nameEn:'Scout Vehicle',        promptBase:'light reconnaissance vehicle, antenna mast, sensor equipment, fast armored car' },
  infantry:   { nameZh:'步兵班',     nameEn:'Infantry Squad',      promptBase:'soldier figure silhouette, helmet, rifle, standing pose, military icon' },
  sam:        { nameZh:'防空导弹',   nameEn:'SAM System',           promptBase:'surface to air missile system, radar dish, missile launcher box, military vehicle' },
  engineer:   { nameZh:'工程车',     nameEn:'Engineer Vehicle',     promptBase:'combat engineer vehicle, crane arm, bulldozer blade, military engineering' },
  supply:     { nameZh:'补给卡车',   nameEn:'Supply Truck',         promptBase:'military cargo truck, supply vehicle, cross symbol, logistics truck' },
  helicopter: { nameZh:'攻击直升机', nameEn:'Attack Helicopter',    promptBase:'attack helicopter top view, rotor blades, cockpit, tail boom, military helicopter' },
  mlrs:       { nameZh:'多管火箭炮', nameEn:'MLRS Rocket Artillery',promptBase:'multiple launch rocket system, rocket pod launcher tubes, artillery vehicle' },
  atgm:       { nameZh:'反坦克导弹', nameEn:'ATGM Vehicle',         promptBase:'anti-tank guided missile vehicle, missile launcher on tripod mount, ATGM carrier' },
  uav:        { nameZh:'无人机',     nameEn:'Military UAV Drone',   promptBase:'military drone UAV top view, fixed wing unmanned aerial vehicle, surveillance drone' },
  command:    { nameZh:'指挥车',     nameEn:'Command Vehicle',      promptBase:'military command post vehicle, communications antenna array, HQ vehicle' },
  ew:         { nameZh:'电子战车',   nameEn:'EW Jammer Vehicle',    promptBase:'electronic warfare vehicle, large parabolic radar dish antenna, jamming equipment' },
};

const FACTIONS: Record<Faction, { color: string; colorName: string }> = {
  red:  { color: '#c62828', colorName: 'crimson red' },
  blue: { color: '#1565c0', colorName: 'royal blue' },
};

const IMAGE_SIZE = 512;

function buildPrompt(unit: UnitPrompt, faction: Faction): string {
  const fc = FACTIONS[faction];
  return [
    `Professional wargame military counter icon, ${unit.promptBase}`,
    `White stencil silhouette of ${unit.nameEn} on solid ${fc.colorName} rounded rectangular background`,
    `Clean flat design, vector art style, minimal, centered composition`,
    `The weapon/vehicle shape fills most of the frame, large and clear`,
    `No text, no numbers, no letters, pure icon only`,
    `High contrast, crisp edges, suitable for game piece token`,
    `Square format, isolated on background`,
  ].join('. ');
}

function downloadImage(url: string, filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location!, filepath).then(resolve).catch(reject);
        return;
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { fs.unlink(filepath, () => {}); reject(err); });
  });
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('\n🎨 AI 军事兵棋图标生成器\n');
  console.log(`📁 输出目录: ${path.relative(process.cwd(), OUTPUT_DIR)}\n`);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const unitTypes = Object.keys(UNITS) as UnitType[];
  const factions: Faction[] = ['red', 'blue'];
  let successCount = 0;
  let failCount = 0;

  for (const type of unitTypes) {
    const unit = UNITS[type];
    for (const faction of factions) {
      for (const hero of [false, true]) {
        const heroSuffix = hero ? '_hero' : '';
        const filename = `${type}_${faction}${heroSuffix}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);

        // 如果文件已存在，跳过
        if (fs.existsSync(filepath)) {
          console.log(`  ⏭️  ${filename} 已存在，跳过`);
          successCount++;
          continue;
        }

        const prompt = buildPrompt(unit, faction);
        if (hero) {
          prompt += '. Golden decorative border around the icon, star emblem at top';
        }

        const encodedPrompt = encodeURIComponent(prompt)
          .replace(/\(/g, '%28').replace(/\)/g, '%29')
          .replace(/,/g, '%2C');

        const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${IMAGE_SIZE}&height=${IMAGE_SIZE}&nologo=true&seed=42`;

        process.stdout.write(`  🖼️  生成 ${filename} (${unit.nameZh}/${faction}${hero?'⭐':''}) ...`);

        try {
          await downloadImage(url, filepath);

          // 验证文件大小（空文件或太小说明失败）
          const stats = fs.statSync(filepath);
          if (stats.size < 5000) {
            fs.unlinkSync(filepath);
            throw new Error(`文件过小 (${stats.size} bytes)`);
          }

          console.log(` ✅ (${(stats.size / 1024).toFixed(0)}KB)`);
          successCount++;
        } catch (err) {
          console.log(` ❌ 失败: ${(err as Error).message}`);
          failCount++;

          // 重试一次
          process.stdout.write(`  🔄 重试 ${filename} ...`);
          try {
            await sleep(2000);
            await downloadImage(url, filepath);
            const stats = fs.statSync(filepath);
            if (stats.size < 5000) { fs.unlinkSync(filepath); throw new Error('重试仍失败'); }
            console.log(` ✅ (${(stats.size / 1024).toFixed(0)}KB)`);
            successCount++;
            failCount--;
          } catch {
            console.log(` ❌`);
          }
        }

        // 避免请求过快
        await sleep(800);
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ 成功: ${successCount}  ❌ 失败: ${failCount}`);
  console.log(`📂 图片保存在: ${OUTPUT_DIR}\n`);
}

main().catch(console.error);
