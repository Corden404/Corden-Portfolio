import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  SRGBColorSpace,
} from 'three';
import { portfolio, type PortfolioProject } from '../config/portfolio';

const W = 1792;
const H = 1344;
const serif = 'Georgia, "Microsoft YaHei", "PingFang SC", serif';
const sans = 'Arial, "Microsoft YaHei", "PingFang SC", sans-serif';

// Keep Latin words together while allowing Chinese text to wrap by character.
function paragraph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, leading: number) {
  const tokens = text.match(/[A-Za-z0-9]+(?:[.+/—-][A-Za-z0-9]+)*|[^A-Za-z0-9]/gu) ?? [];
  const rows: string[] = [];
  let row = '';
  for (const token of tokens) {
    if (row && ctx.measureText(row + token).width > width && !/^[，。；：！？、）]/u.test(token)) {
      rows.push(row.trimEnd());
      row = token.trimStart();
    } else row += token;
  }
  if (row) rows.push(row.trimEnd());
  // Avoid leaving a lone character at the end of a Chinese paragraph.
  if (rows.length > 1) {
    const last = rows.length - 1;
    while (ctx.measureText(rows[last]).width < width * .25) {
      const previous = rows[last - 1].match(/[A-Za-z0-9]+(?:[.+/—-][A-Za-z0-9]+)*|[^A-Za-z0-9]/gu) ?? [];
      if (previous.length < 2) break;
      const token = previous.pop()!;
      if (ctx.measureText(token + rows[last]).width > width) break;
      rows[last - 1] = previous.join('').trimEnd();
      rows[last] = token + rows[last];
    }
  }
  rows.forEach(text => { ctx.fillText(text, x, y); y += leading; });
  return y;
}

function drawSelectedWork(ctx: CanvasRenderingContext2D, project: PortfolioProject) {
  ctx.fillStyle = '#263c3e';
  ctx.font = '600 30px ' + sans;
  ctx.fillText('PAPER ' + project.number + '  /  ' + project.category, 96, 105);
  ctx.textAlign = 'right';
  ctx.font = '24px ' + sans;
  ctx.fillText('CORDEN / 2026', 1696, 105);
  ctx.textAlign = 'left';
  ctx.strokeStyle = 'rgba(34,55,56,.3)';
  ctx.lineWidth = 2;
  line(ctx, 96, 144, 1696, 144);

  ctx.fillStyle = '#263737';
  ctx.font = '600 86px ' + sans;
  project.title.split('\n').forEach((text, index) => ctx.fillText(text, 94, 300 + index * 118));

  // A quiet, source-style diagram balances the editorial text column.
  ctx.save();
  ctx.translate(65, 440);
  ctx.scale(.34, .5);
  drawArtwork(ctx, project);
  ctx.restore();

  const x = 726, width = 970;
  let y = 229;
  project.works?.forEach((work, index) => {
    ctx.font = '24px ' + sans;
    ctx.fillStyle = '#5e706d';
    ctx.fillText(project.works!.length > 1 ? `展示项目${index === 0 ? '一' : '二'}` : '展示项目', x, y);
    ctx.font = '600 34px ' + sans;
    ctx.fillStyle = '#263737';
    y = paragraph(ctx, work.title, x, y + 55, width, 46);
    ctx.font = '30px ' + sans;
    ctx.fillStyle = '#344749';
    y = paragraph(ctx, work.description, x, y + 8, width, 48) + 38;
  });
  ctx.font = '24px ' + sans;
  ctx.fillStyle = '#5e706d';
  ctx.fillText('核心成果', x, y);
  y += 54;
  ctx.font = '30px ' + sans;
  ctx.fillStyle = '#344749';
  project.achievements?.forEach(achievement => {
    ctx.fillText('—', x, y);
    y = paragraph(ctx, achievement, x + 42, y, width - 42, 46) + 10;
  });
  if (project.website) {
    ctx.font = '28px ' + sans;
    ctx.fillText('线上应用  /  ' + project.website, x, y + 28);
  }
  line(ctx, 96, 1090, 1696, 1090);
  ctx.font = '32px ' + sans;
  ctx.fillStyle = '#263737';
  paragraph(ctx, project.subtitle, 96, 1160, 1600, 44);
  ctx.font = '26px ' + sans;
  ctx.fillStyle = '#5e706d';
  ctx.fillText(project.keywords.join(' / '), 96, 1250);
  ctx.textAlign = 'right';
  ctx.fillText(project.number + ' / 06', 1696, 1250);
  ctx.textAlign = 'left';
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawArtwork(ctx: CanvasRenderingContext2D, project: PortfolioProject) {
  ctx.save();
  const px = 96, py = 400, w = 1598, h = 580;
  ctx.beginPath(); ctx.rect(px, py, w, h); ctx.clip();
  ctx.fillStyle = '#cdd6d1'; ctx.fillRect(px, py, w, h);
  ctx.strokeStyle = 'rgba(51,81,81,.33)';
  ctx.lineWidth = 1.4;

  if (project.style === 'contour') {
    // Technical contours feel printed, rather than pasted on as photographs.
    for (let i = 0; i < 46; i++) {
      ctx.beginPath();
      for (let j = 0; j <= 145; j++) {
        const x = px - 50 + j * 12;
        const u = j / 145;
        const y = py + 282 + (i - 23) * 9
          + Math.sin(u * 9.6 + i * .085) * (45 + i * 1.5)
          + Math.sin(u * 20.4 - i * .16) * 14;
        if (j === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(34,74,77,.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(px + 785, py + 298, 240, 164, -.32, 0, Math.PI * 2);
    ctx.stroke();
  } else if (project.style === 'signal') {
    ctx.translate(px + w / 2, py + h / 2);
    for (let i = 0; i < 28; i++) {
      const angle = (i * Math.PI) / 14;
      ctx.save(); ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, 165 + i * 11, 75 + i * 3.4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < 23; i++) {
      ctx.beginPath();
      ctx.arc(Math.cos(i * 2.4) * (160 + i * 14), Math.sin(i * 2.4) * (90 + i * 8), i % 4 + 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(46,80,84,.5)';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(25,66,73,.7)';
    ctx.lineWidth = 3;
    line(ctx, -740, 0, 740, 0);
    line(ctx, 0, -250, 0, 250);
  } else if (project.style === 'lattice') {
    for (let i = 0; i < 43; i++) {
      const phase = i / 42;
      ctx.strokeStyle = 'rgba(31,79,83,' + (0.17 + 0.13 * Math.sin(phase * Math.PI)) + ')';
      ctx.beginPath();
      for (let j = 0; j <= 88; j++) {
        const x = px + j * w / 88;
        const y = py + h * (.12 + phase * .82)
          + 47 * Math.sin(j / 10 + phase * 10)
          + 19 * Math.cos(j / 18 - phase * 9);
        if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = -18; i < 30; i++) {
      ctx.strokeStyle = 'rgba(29,77,78,.18)';
      line(ctx, px + i * 61, py, px + (i + 13) * 61, py + h);
    }
  } else if (project.style === 'orbit') {
    ctx.translate(px + w / 2, py + h / 2);
    for (let i = 0; i < 39; i++) {
      ctx.save();
      ctx.rotate(i * 0.174);
      ctx.strokeStyle = 'rgba(29,72,71,' + (0.12 + (i % 7) * 0.024) + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, 110 + i * 11, 54 + i * 4.6, .07, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < 13; i++) {
      const t = i * 2.4, r = 58 + i * 26;
      ctx.beginPath();
      ctx.arc(Math.cos(t) * r, Math.sin(t) * r * .52, 2 + i % 3, 0, Math.PI * 2);
      ctx.fillStyle = '#496768'; ctx.fill();
    }
  } else if (project.style === 'prism') {
    for (let i = 0; i < 26; i++) {
      const offset = i * 25, alpha = Math.max(.12, .32 - i * .007);
      ctx.strokeStyle = 'rgba(28,69,75,' + alpha + ')';
      ctx.beginPath();
      ctx.moveTo(px + 190 + offset, py + 500 - offset * .08);
      ctx.lineTo(px + 750 + offset * .3, py + 75 + offset * .14);
      ctx.lineTo(px + 1420 - offset * .75, py + 515 - offset * .19);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(37,88,90,.12)';
    for (let i = 0; i < 5; i++) {
      const cx = px + 220 + i * 270;
      ctx.beginPath();
      ctx.moveTo(cx, py + 285);
      ctx.lineTo(cx + 125, py + 80);
      ctx.lineTo(cx + 243, py + 285);
      ctx.lineTo(cx + 125, py + 490);
      ctx.closePath();ctx.fill();
    }
  } else if (project.style === 'waves') {
    for (let i = 0; i < 61; i++) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(35,79,80,' + (0.13 + (i % 9) * .016) + ')';
      for (let j = 0; j <= 150; j++) {
        const u = j / 150;
        const x = px + u * w;
        const y = py + 287 + (i - 30) * 8
          + 70 * Math.sin(u * 9 + i * .08)
          + 34 * Math.sin(u * 18 + i * .11);
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(24,67,67,.58)';ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px + 0.74 * w, py + 0.54 * h, 132, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function createPaperTexture(project: PortfolioProject) {
  const canvas = document.createElement('canvas');
  // Six separate paper textures are memory-heavy on mobile. Reduce their
  // resolution there without changing the authored design-space coordinates.
  const mobile = window.matchMedia('(max-width: 720px)').matches;
  canvas.width = mobile ? 1024 : W;
  canvas.height = mobile ? 768 : H;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  if (mobile) ctx.scale(1024 / W, 768 / H);

  // Warm fibrous paper base + tiny ink noise. Never emissive.
  ctx.fillStyle = '#dddcd1'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(66,76,70,.025)';
  for (let i = 0; i < 7300; i++) {
    const x = (i * 827 + 137) % W;
    const y = (i * 479 + 59) % H;
    ctx.fillRect(x, y, 1.5 + (i % 3), 1.5);
  }

  if (project.works?.length) {
    drawSelectedWork(ctx, project);
  } else {
    ctx.fillStyle = '#263c3e';
    ctx.font = '600 26px ' + sans;
    ctx.letterSpacing = '5px';
    ctx.fillText(portfolio.monogram + ' / SELECTED WORK', 96, 104);
    ctx.textAlign = 'right';
    ctx.fillText(project.number + '  /  ' + String(portfolio.projects.length).padStart(2, '0'), 1696, 104);
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(34,55,56,.36)';
    ctx.lineWidth = 2;
    line(ctx, 96, 133, 1696, 133);

    ctx.letterSpacing = '3px';
    ctx.font = '600 25px ' + sans;
    ctx.fillStyle = '#5f7472';
    ctx.fillText(project.category + '   /   ' + project.year, 96, 218);

    const titleLines = project.title.split('\n');
    ctx.fillStyle = '#263737';
    ctx.letterSpacing = '-2px';
    ctx.font = 'bold 88px ' + serif;
    for (let i = 0; i < titleLines.length; i++) {
      ctx.fillText(titleLines[i], 94, 300 + i * 91);
    }

    drawArtwork(ctx, project);
    line(ctx, 96, 1037, 1696, 1037);
    ctx.fillStyle = '#344749';
    ctx.letterSpacing = '0px';
    ctx.font = '40px ' + serif;
    ctx.fillText(project.subtitle, 96, 1132);
    ctx.font = '26px ' + sans;
    ctx.fillStyle = '#5e706d';
    ctx.fillText(project.keywords.join('   /   '), 96, 1218);
    ctx.textAlign = 'right';
    ctx.font = '600 29px ' + sans;
    ctx.fillText(project.number, 1696, 1230);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
